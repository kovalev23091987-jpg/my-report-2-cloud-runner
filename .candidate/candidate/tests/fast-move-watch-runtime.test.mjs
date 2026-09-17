import assert from "node:assert/strict";
import {
  buildFastMoveDiscoveryObservation,
  buildFastMoveDeepObservation,
  prepareFastMoveWatchCycle,
  finalizeFastMoveWatchCycle,
  fastMoveWatchDataPlaneSummary,
} from "../src/fast-move-watch-runtime.mjs";

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, " ").trim(); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async all() { return this.db.execute(this.sql, this.args, "all"); }
  async first() { return this.db.execute(this.sql, this.args, "first"); }
  async run() { return this.db.execute(this.sql, this.args, "run"); }
}

class FakeD1 {
  constructor() {
    this.states = new Map();
    this.queue = new Map();
    this.events = new Map();
    this.generations = new Map();
  }
  prepare(sql) { return new Statement(this, sql); }
  async batch(statements) {
    const out = [];
    for (const statement of statements) out.push(await statement.run());
    return out;
  }
  activeCount() {
    return [...this.states.values()].filter((row) => !["EXPIRED", "CLOSED"].includes(row.lifecycle_state)).length;
  }
  joined(row) {
    const q = this.queue.get(`${row.contract}:${row.generation}`) || {};
    return { ...row, queue_lease_owner: q.lease_owner ?? null, queue_lease_expires_ts: q.lease_expires_ts ?? null };
  }
  async execute(sql, a, kind) {
    if (sql.includes("SELECT s.*") && sql.includes("fast_move_watch_state s")) {
      if (sql.includes("WHERE s.contract=?1")) {
        const row = this.states.get(a[0]);
        return row ? this.joined(row) : null;
      }
      const terminal = sql.includes("IN ('EXPIRED','CLOSED')") && !sql.includes("NOT IN ('EXPIRED','CLOSED')");
      const results = [...this.states.values()]
        .filter((row) => terminal === ["EXPIRED", "CLOSED"].includes(row.lifecycle_state))
        .sort((x, y) => y.updated_ts - x.updated_ts)
        .slice(0, a[0])
        .map((row) => this.joined(row));
      return { results };
    }

    if (sql.startsWith("INSERT INTO fast_move_watch_state")) {
      const names = ["contract","generation","engine_version","mode","lifecycle_state","state_before_stale","state_entered_ts","created_ts","updated_ts","last_recheck_ts","next_recheck_ts","expiry_ts","last_evidence_ts","last_event_id","last_reason_code","cadence_class","priority_class","freshness_state","attempt_count","deferral_count","missed_due_count","counters_json","cluster_lifecycle","cluster_lifecycle_source","discovery_rank","discovery_flags_json","closure_reason"];
      const row = Object.fromEntries(names.map((name, i) => [name, a[i]]));
      const cap = a[27];
      const expectedGeneration = a[28];
      const expectedUpdatedTs = a[29];
      const expectedLastEventId = a[30];
      const leaseOwner = a[31];
      const requireLease = a[32] === 1;
      const leaseNow = a[33];
      const current = this.states.get(row.contract);
      const activeCount = this.activeCount();
      let allowed = false;
      if (!current) allowed = expectedGeneration == null && activeCount < cap;
      else if (
        current.generation === row.generation &&
        current.generation === expectedGeneration &&
        current.updated_ts === expectedUpdatedTs &&
        current.last_event_id === expectedLastEventId &&
        !["EXPIRED", "CLOSED"].includes(current.lifecycle_state)
      ) allowed = true;
      else if (
        ["EXPIRED", "CLOSED"].includes(current.lifecycle_state) &&
        current.generation === expectedGeneration &&
        current.updated_ts === expectedUpdatedTs &&
        current.last_event_id === expectedLastEventId &&
        row.generation === current.generation + 1 &&
        activeCount < cap
      ) allowed = true;
      if (allowed && requireLease) {
        const q = this.queue.get(`${row.contract}:${row.generation}`);
        allowed = Boolean(
          q && q.status === "LEASED" && q.lease_owner === leaseOwner &&
          q.lease_expires_ts > leaseNow
        );
      }
      if (!allowed) return { meta: { changes: 0 } };
      this.states.set(row.contract, { ...row, lease_owner: null, lease_expires_ts: null });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT INTO fast_move_recheck_queue")) {
      const [contract,generation,due_ts,priority_class,attempt_count,deferral_count,status,dedupe_token,created_ts,updated_ts,stateToken,preserveLease,leaseOwner,requireLease,leaseNow] = a;
      const state = this.states.get(contract);
      if (!state || state.generation !== generation || state.last_event_id !== stateToken) return { meta: { changes: 0 } };
      const key = `${contract}:${generation}`;
      const prior = this.queue.get(key) || {};
      if (requireLease === 1 && !(
        prior.status === "LEASED" && prior.lease_owner === leaseOwner &&
        prior.lease_expires_ts > leaseNow
      )) return { meta: { changes: 0 } };
      const keepLease = preserveLease === 1 && status === "PENDING" &&
        prior.status === "LEASED" && prior.lease_expires_ts > leaseNow;
      this.queue.set(key, {
        ...prior, contract,generation,due_ts,priority_class,attempt_count,deferral_count,
        status:keepLease ? prior.status : status,dedupe_token,created_ts,updated_ts,
        lease_owner:keepLease ? prior.lease_owner : null,
        lease_expires_ts:keepLease ? prior.lease_expires_ts : null,
      });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT OR IGNORE INTO fast_move_watch_event") && sql.includes("SELECT ?1,?2,?3")) {
      const state = this.states.get(a[1]);
      if (!state || state.generation !== a[2] || state.last_event_id !== a[13] || this.events.has(a[0])) return { meta: { changes: 0 } };
      this.events.set(a[0], { event_id:a[0],contract:a[1],generation:a[2],engine_version:a[3],observed_ts:a[4],source_evidence_ts:a[5],from_state:a[6],to_state:a[7],reason_code:a[8] });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("INSERT OR IGNORE INTO fast_move_watch_generation")) {
      const [contract,generation,engine_version,opened_ts,opening_event_id,openingReason,stateToken] = a;
      const state = this.states.get(contract);
      const key = `${contract}:${generation}`;
      if (!state || state.generation !== generation || state.last_event_id !== stateToken || this.generations.has(key)) return { meta: { changes: 0 } };
      this.generations.set(key, { contract,generation,engine_version,opened_ts,opening_event_id,opening_reason:openingReason,closed_ts:null,final_state:null,closure_reason:null });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE fast_move_watch_generation") && sql.includes("WHERE contract=?1 AND generation=?2")) {
      const [contract,generation,closed_ts,final_state,closure_reason,stateToken] = a;
      const key = `${contract}:${generation}`;
      const prior = this.generations.get(key);
      const state = this.states.get(contract);
      if (!prior || !state || state.generation !== generation || state.last_event_id !== stateToken || !["EXPIRED","CLOSED"].includes(state.lifecycle_state)) return { meta: { changes: 0 } };
      this.generations.set(key, { ...prior, closed_ts: prior.closed_ts ?? closed_ts, final_state: prior.final_state ?? final_state, closure_reason: prior.closure_reason ?? closure_reason });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("UPDATE fast_move_watch_state") && sql.includes("expiry_ts<=?1")) {
      const now = a[0]; let changes = 0;
      for (const [key,row] of this.states) {
        if (!["EXPIRED","CLOSED"].includes(row.lifecycle_state) && row.expiry_ts <= now) {
          this.states.set(key,{...row,lifecycle_state:"EXPIRED",updated_ts:now,next_recheck_ts:null,closure_reason:"EXPIRED_DURING_RESTART",last_reason_code:"EXPIRED_DURING_RESTART"});
          changes++;
        }
      }
      return { meta:{changes} };
    }

    if (sql.startsWith("INSERT OR IGNORE INTO fast_move_watch_event") && sql.includes("EXPIRED_RECOVERY")) {
      const [now,engine] = a; let changes = 0;
      for (const row of this.states.values()) {
        if (["EXPIRED","CLOSED"].includes(row.lifecycle_state) || row.expiry_ts > now) continue;
        const id = `${row.contract}:${row.generation}:${now}:EXPIRED_RECOVERY`;
        if (this.events.has(id)) continue;
        this.events.set(id,{event_id:id,contract:row.contract,generation:row.generation,engine_version:engine,observed_ts:now,from_state:row.lifecycle_state,to_state:"EXPIRED",reason_code:"EXPIRED_DURING_RESTART"});
        changes++;
      }
      return { meta:{changes} };
    }

    if (sql.startsWith("UPDATE fast_move_recheck_queue") && sql.includes("SET status='EXPIRED'")) {
      const now = a[0]; let changes = 0;
      for (const [key,q] of this.queue) {
        const state = this.states.get(q.contract);
        if (["PENDING","LEASED"].includes(q.status) && state?.generation === q.generation && state.lifecycle_state === "EXPIRED") {
          this.queue.set(key,{...q,status:"EXPIRED",lease_owner:null,lease_expires_ts:null,updated_ts:now}); changes++;
        }
      }
      return { meta:{changes} };
    }

    if (sql.startsWith("UPDATE fast_move_recheck_queue") && sql.includes("SET status='PENDING'") && sql.includes("lease_expires_ts<=?1")) {
      const now = a[0]; let changes = 0;
      for (const [key,q] of this.queue) {
        const state = this.states.get(q.contract);
        if (q.status === "LEASED" && q.lease_expires_ts <= now && state?.generation === q.generation && !["EXPIRED","CLOSED"].includes(state.lifecycle_state)) {
          this.queue.set(key,{...q,status:"PENDING",lease_owner:null,lease_expires_ts:null,due_ts:Math.min(q.due_ts,now),updated_ts:now}); changes++;
        }
      }
      return { meta:{changes} };
    }

    if (sql.startsWith("UPDATE fast_move_watch_generation") && sql.includes("closed_ts IS NULL AND EXISTS")) {
      const now = a[0]; let changes = 0;
      for (const [key,g] of this.generations) {
        const state = this.states.get(g.contract);
        if (g.closed_ts == null && state?.generation === g.generation && state.lifecycle_state === "EXPIRED") {
          this.generations.set(key,{...g,closed_ts:now,final_state:g.final_state??"EXPIRED",closure_reason:g.closure_reason??"EXPIRED_DURING_RESTART"}); changes++;
        }
      }
      return { meta:{changes} };
    }

    if (sql.startsWith("UPDATE fast_move_watch_state") && sql.includes("deferral_count=deferral_count+1")) {
      let changes = 0;
      const now = a.at(-1);
      for (let i=0;i<a.length-1;i+=2) {
        const [contract,generation] = [a[i],a[i+1]];
        const row = this.states.get(contract);
        const q = this.queue.get(`${contract}:${generation}`);
        if (row && row.generation === generation && !["EXPIRED","CLOSED"].includes(row.lifecycle_state) && q?.status === "PENDING" && q.due_ts <= now && (q.lease_expires_ts == null || q.lease_expires_ts <= now)) {
          this.states.set(contract,{...row,deferral_count:(row.deferral_count||0)+1,missed_due_count:(row.missed_due_count||0)+1}); changes++;
        }
      }
      return { meta:{changes} };
    }

    if (sql.startsWith("UPDATE fast_move_recheck_queue") && sql.includes("status='LEASED'")) {
      const [contract,generation,owner,leaseExpiry,now] = a;
      const key = `${contract}:${generation}`;
      const q = this.queue.get(key);
      if (!q || q.status !== "PENDING" || q.due_ts > now || (q.lease_expires_ts !== null && q.lease_expires_ts > now)) return { meta: { changes: 0 } };
      this.queue.set(key, { ...q, status:"LEASED",lease_owner:owner,lease_expires_ts:leaseExpiry,updated_ts:now });
      return { meta: { changes: 1 } };
    }

    if (sql.startsWith("DELETE FROM fast_move_watch_event")) {
      const [cutoff,limit] = a; let changes = 0;
      const old = [...this.events.values()].filter((row)=>row.observed_ts<cutoff).sort((x,y)=>x.observed_ts-y.observed_ts).slice(0,limit);
      for (const row of old) { this.events.delete(row.event_id); changes++; }
      return { meta: { changes } };
    }

    if (sql.includes("SELECT lifecycle_state,COUNT(*) count")) {
      const counts = new Map();
      for (const row of this.states.values()) counts.set(row.lifecycle_state, (counts.get(row.lifecycle_state) || 0) + 1);
      return { results: [...counts].map(([lifecycle_state,count]) => ({ lifecycle_state,count })) };
    }
    if (sql.includes("SELECT COUNT(*) queue_depth")) {
      const rows = [...this.queue.values()].filter((q) => ["PENDING","LEASED"].includes(q.status));
      return { queue_depth:rows.length,due_count:rows.filter((q)=>q.status==="PENDING"&&q.due_ts<=a[0]).length,leased_count:rows.filter((q)=>q.status==="LEASED"&&q.lease_expires_ts>a[0]).length };
    }
    if (sql.includes("SELECT contract,generation,lifecycle_state,updated_ts,next_recheck_ts")) {
      return { results:[...this.states.values()].sort((x,y)=>y.updated_ts-x.updated_ts).slice(0,8) };
    }
    throw new Error(`UNHANDLED_FAKE_D1:${kind}:${sql}`);
  }
}

const t0 = 1_800_000_000_000;
function fixture(ts, contract="龙虾-USDT") {
  const discovery = {
    counts:{shortlist:1},
    shortlist:[{contract,priority_rank:1,anomaly_flags_count:2,anomaly_flags:["5m:price_change_pct","5m:oi_change_pct"]}],
  };
  const scan = {
    timestamp:ts,
    health:{contracts:true,market:true,oi:true,funding:true},
    contracts:[{
      contract_code:contract,data_status:"CLOSED",
      freshness:{stale:false,market_age_sec:3},
      quality:{history_available:true},
      symbol_fingerprint:{resolution_status:"RESOLVED_HTX_EXACT"},
      instrument_scope:{classification:"CRYPTO_CONFIRMED"},
    }],
  };
  return { scan, discovery };
}

function deepObservation(ts, contract, discoveryRow) {
  return buildFastMoveDeepObservation({
    deep:{contract,timestamp:ts,execution:{complete:true,fulfilled_components:4},data_sufficiency:{classification:"SUFFICIENT"},shadow_decision:{shadow_id:`s:${contract}:${ts}`},full_evidence_shadow:{full_evidence_id:`f:${contract}:${ts}`},liquidation_intelligence_shadow:{},evidence:{}},
    discovery_row:discoveryRow,now:ts,
  });
}

{
  const { scan, discovery } = fixture(t0);
  const observation = buildFastMoveDiscoveryObservation({scan,discovery_row:discovery.shortlist[0],now:t0});
  assert.equal(observation.contract,"龙虾-USDT");
  assert.equal(observation.coverage_status,"CLOSED");
  assert.equal(observation.signals.squeeze_confirmed,true);
  assert.equal(observation.canonical_identity_verified,true);
}

{
  const deep = {
    contract:"ETHFI-USDT",timestamp:t0,execution:{complete:true,fulfilled_components:4},
    data_sufficiency:{classification:"SUFFICIENT"},
    shadow_decision:{shadow_id:"s1"},full_evidence_shadow:{full_evidence_id:"f1"},
    liquidation_intelligence_shadow:{
      provider:"one-provider",provider_symbol:"ETHFI",alias_verified:true,
      asset_identity_verified:false,projected_freshness:"CURRENT",
      projected_map_status:"OBSERVATION_ONLY_IDENTITY_UNVERIFIED",
      projected_clusters:[{lifecycle:"APPROACHING"}],realized_status:"PARTIAL_HTX_ONLY",
    },
    evidence:{htx_liquidation_tape:{contract:"ETHFI-USDT",factual_only:true,coverage:{htx_factual_long_liquidations:"closed",htx_factual_short_liquidations:"closed"}}},
  };
  const observation = buildFastMoveDeepObservation({deep,discovery_row:{anomaly_flags:["5m:price_change_pct","5m:oi_change_pct"]},now:t0});
  assert.equal(observation.coverage_status,"CLOSED");
  assert.equal(observation.external_alias_used,false,"unverified projected lane must not be consumed");
  assert.equal(observation.liquidation.projected.asset_identity_verified,false);
  assert.equal(observation.liquidation.projected.cross_source_consensus,false);
  assert.equal(observation.liquidation.realized.status,"CLOSED");
  assert.equal(observation.signals.liquidation_magnet_context_confirmed,false,"realized HTX data must not validate an unverified projected cluster");
}

// End-to-end: opening generation is journaled; only leased/selected contract can finalize.
{
  const db = new FakeD1();
  const first = fixture(t0);
  const cycle1 = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:first.scan,discovery_prefilter:first.discovery,run_id:"run-1",now:t0});
  assert.equal(cycle1.status,"CLOSED");
  assert.equal(cycle1.writes_used,4);
  assert.equal(cycle1.selected_contracts.length,0);
  assert.equal(db.states.get("龙虾-USDT").lifecycle_state,"PRE_SQUEEZE");
  assert.equal(db.generations.get("龙虾-USDT:1").opening_reason,"DISCOVERY_ANOMALY_CONFIRMED");
  assert.ok([...db.events.values()].some((e)=>e.contract==="龙虾-USDT"&&e.generation===1&&e.from_state==="NONE"));

  const unsolicited = deepObservation(t0+1000,"龙虾-USDT",first.discovery.shortlist[0]);
  const noFinalize = await finalizeFastMoveWatchCycle({env:{DATA_DB:db},cycle:cycle1,deep_check_results:[{contract:"龙虾-USDT",fast_move_watch_observation:unsolicited}],discovery_prefilter:first.discovery,now:t0+1000});
  assert.equal(noFinalize.status,"NO_MATCHING_DEEP_CHECK");
  assert.equal(noFinalize.writes_used,0);

  const dueTs = db.states.get("龙虾-USDT").next_recheck_ts;
  const second = fixture(dueTs);
  const cycle2 = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:second.scan,discovery_prefilter:second.discovery,run_id:"run-2",now:dueTs});
  assert.equal(cycle2.status,"CLOSED");
  assert.deepEqual(cycle2.selected_contracts,["龙虾-USDT"]);
  assert.equal(cycle2.adaptive_cooldown_sec,900);
  assert.equal(cycle2.adaptive_discovery_prefilter.shortlist[0].fast_move_watch_recheck,true);
  assert.equal(db.states.get("龙虾-USDT").lifecycle_state,"PRE_SQUEEZE");
  assert.ok(cycle2.writes_used<=4);

  const deep2 = deepObservation(dueTs+1000,"龙虾-USDT",second.discovery.shortlist[0]);
  const final2 = await finalizeFastMoveWatchCycle({env:{DATA_DB:db},cycle:cycle2,deep_check_results:[{contract:"OTHER-USDT",run_id:"run-2",fast_move_watch_observation:deep2},{contract:"龙虾-USDT",run_id:"run-2",fast_move_watch_observation:deep2}],discovery_prefilter:second.discovery,now:dueTs+1000});
  assert.equal(final2.status,"CLOSED");
  assert.equal(final2.finalized[0].contract,"龙虾-USDT");
  assert.equal(db.states.get("龙虾-USDT").lifecycle_state,"SQUEEZE_ACTIVE");
  assert.ok(cycle2.writes_used + final2.writes_used <= 8);

  const summary = await fastMoveWatchDataPlaneSummary({DATA_DB:db},dueTs+1000);
  assert.equal(summary.table_available,true);
  assert.equal(summary.active_watch_count,1);
  assert.equal(summary.scheduler_priority_is_probability,false);
  assert.equal(summary.safety.trading_execution,false);
}


function seedWatch(db, contract, {
  generation=1,
  state="PRE_SQUEEZE",
  created=t0-60_000,
  updated=t0-30_000,
  next=t0+60_000,
  expiry=t0+86_400_000,
  deferral=0,
  missed=0,
  queueStatus="PENDING",
  leaseOwner=null,
  leaseExpires=null,
}={}) {
  const row = {
    contract,generation,engine_version:"fast-move-watch-hardening-v3",
    mode:"FAST_MOVE_WATCH_SHADOW_NO_EXECUTION",lifecycle_state:state,state_before_stale:null,
    state_entered_ts:created,created_ts:created,updated_ts:updated,last_recheck_ts:null,
    next_recheck_ts:["EXPIRED","CLOSED"].includes(state)?null:next,expiry_ts:expiry,last_evidence_ts:updated,
    last_event_id:`seed:${contract}:${generation}`,last_reason_code:"SEED",cadence_class:"ACTIVE",priority_class:"ACTIVE",
    freshness_state:"CURRENT",attempt_count:0,deferral_count:deferral,missed_due_count:missed,counters_json:"{}",
    cluster_lifecycle:"UNKNOWN",cluster_lifecycle_source:"NONE",discovery_rank:1,discovery_flags_json:"[]",
    closure_reason:["EXPIRED","CLOSED"].includes(state)?`SEED_${state}`:null,
  };
  db.states.set(contract,row);
  db.queue.set(`${contract}:${generation}`,{
    contract,generation,due_ts:next,priority_class:"ACTIVE",attempt_count:0,deferral_count:deferral,
    status:queueStatus,dedupe_token:`${contract}:${generation}`,created_ts:created,updated_ts:updated,
    lease_owner:leaseOwner,lease_expires_ts:leaseExpires,
  });
  db.generations.set(`${contract}:${generation}`,{
    contract,generation,engine_version:row.engine_version,opened_ts:created,opening_event_id:`seed-open:${contract}:${generation}`,
    opening_reason:"SEED",closed_ts:["EXPIRED","CLOSED"].includes(state)?updated:null,
    final_state:["EXPIRED","CLOSED"].includes(state)?state:null,closure_reason:row.closure_reason,
  });
}

// Re-entry must create a new durable generation with a fresh created_ts.
{
  const db = new FakeD1();
  const first = fixture(t0,"REENTRY-USDT");
  await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:first.scan,discovery_prefilter:first.discovery,run_id:"reentry-1",now:t0});
  const old = db.states.get("REENTRY-USDT");
  const terminalTs = t0 + 60_000;
  db.states.set("REENTRY-USDT",{...old,lifecycle_state:"EXPIRED",updated_ts:terminalTs,next_recheck_ts:null,closure_reason:"TEST_EXPIRED",last_reason_code:"TEST_EXPIRED"});
  db.queue.set("REENTRY-USDT:1",{...db.queue.get("REENTRY-USDT:1"),status:"EXPIRED",updated_ts:terminalTs});
  db.generations.set("REENTRY-USDT:1",{...db.generations.get("REENTRY-USDT:1"),closed_ts:terminalTs,final_state:"EXPIRED",closure_reason:"TEST_EXPIRED"});
  const reentryTs = terminalTs + 3_700_000;
  const second = fixture(reentryTs,"REENTRY-USDT");
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:second.scan,discovery_prefilter:second.discovery,run_id:"reentry-2",now:reentryTs});
  assert.equal(cycle.status,"CLOSED");
  assert.equal(db.states.get("REENTRY-USDT").generation,2);
  assert.equal(db.states.get("REENTRY-USDT").created_ts,reentryTs);
  assert.equal(db.generations.get("REENTRY-USDT:2").opening_reason,"NEW_DISCOVERY_CONFIRMED");
  assert.equal(db.generations.get("REENTRY-USDT:1").final_state,"EXPIRED");
}

// An old terminal row outside the recent terminal window must be resolved by exact lookup,
// so returning contracts cannot silently reset to generation 1.
{
  const db = new FakeD1();
  const target = "OLDTERM-USDT";
  seedWatch(db,target,{generation:3,state:"EXPIRED",created:t0-10_000_000,updated:t0-9_000_000,expiry:t0-9_500_000,queueStatus:"EXPIRED"});
  for (let i=0;i<55;i++) {
    seedWatch(db,`TERM${i}-USDT`,{state:"EXPIRED",created:t0-2_000_000+i*1000,updated:t0-1_000_000+i*1000,expiry:t0-1_500_000+i*1000,queueStatus:"EXPIRED"});
  }
  const now = t0 + 1_000;
  const fx = fixture(now,target);
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:fx.scan,discovery_prefilter:fx.discovery,run_id:"old-terminal",now});
  assert.equal(cycle.status,"CLOSED");
  assert.ok(cycle.targeted_prior_lookups>=1);
  assert.equal(db.states.get(target).generation,4);
  assert.equal(db.states.get(target).created_ts,now);
}

// Admission boundary must fail closed at 16 active watches; it cannot create #17.
{
  const db = new FakeD1();
  for (let i=0;i<16;i++) seedWatch(db,`CAP${i}-USDT`,{next:t0+3_600_000});
  const fx = fixture(t0,"CAPOVER-USDT");
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:fx.scan,discovery_prefilter:fx.discovery,run_id:"cap",now:t0});
  assert.equal(cycle.status,"CLOSED");
  assert.equal(db.states.has("CAPOVER-USDT"),false);
  assert.ok(cycle.discovery_mutations.some((row)=>row.persistence==="CAPACITY_REJECTED_FAIL_CLOSED"));
  assert.equal([...db.states.values()].filter((row)=>!["EXPIRED","CLOSED"].includes(row.lifecycle_state)).length,16);
}

// Restart recovery must be durable: expiry closes state/queue/generation; stale leases reopen.
{
  const db = new FakeD1();
  seedWatch(db,"EXPIRE-USDT",{expiry:t0-1,next:t0-10_000,queueStatus:"LEASED",leaseOwner:"dead",leaseExpires:t0-1});
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:{contracts:[]},discovery_prefilter:{counts:{shortlist:0},shortlist:[]},run_id:"recover-expiry",now:t0});
  assert.equal(cycle.maintenance_only,true);
  assert.equal(cycle.writes_used,5);
  assert.equal(db.states.get("EXPIRE-USDT").lifecycle_state,"EXPIRED");
  assert.equal(db.queue.get("EXPIRE-USDT:1").status,"EXPIRED");
  assert.equal(db.generations.get("EXPIRE-USDT:1").final_state,"EXPIRED");
  assert.ok([...db.events.values()].some((row)=>row.reason_code==="EXPIRED_DURING_RESTART"));
}

{
  const db = new FakeD1();
  seedWatch(db,"LEASE-USDT",{expiry:t0+1_000_000,next:t0-5_000,queueStatus:"LEASED",leaseOwner:"dead",leaseExpires:t0-1});
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:{contracts:[]},discovery_prefilter:{counts:{shortlist:0},shortlist:[]},run_id:"recover-lease",now:t0});
  assert.equal(cycle.maintenance_only,true);
  assert.equal(db.states.get("LEASE-USDT").lifecycle_state,"PRE_SQUEEZE");
  assert.equal(db.queue.get("LEASE-USDT:1").status,"PENDING");
  assert.equal(db.queue.get("LEASE-USDT:1").lease_owner,null);
}

// Fairness debt is persisted for due-but-deferred work and reset after an actual recheck.
{
  const db = new FakeD1();
  seedWatch(db,"FAIR-A-USDT",{next:t0-1_000,deferral:5,missed:5});
  seedWatch(db,"FAIR-B-USDT",{next:t0-1_000,deferral:0,missed:0});
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:{contracts:[]},discovery_prefilter:{counts:{shortlist:0},shortlist:[]},run_id:"fair",now:t0});
  assert.equal(cycle.selected_contracts.length,1);
  const selected=cycle.selected_contracts[0];
  const deferred=selected==="FAIR-A-USDT" ? "FAIR-B-USDT" : "FAIR-A-USDT";
  assert.equal(db.states.get(deferred).deferral_count,(deferred==="FAIR-A-USDT"?5:0)+1);
  assert.equal(db.states.get(deferred).missed_due_count,(deferred==="FAIR-A-USDT"?5:0)+1);
  assert.ok(cycle.writes_used + 4 <= 8);

  const obs = deepObservation(t0+1000,selected,{anomaly_flags:["5m:price_change_pct","5m:oi_change_pct"],priority_rank:1});
  const final = await finalizeFastMoveWatchCycle({env:{DATA_DB:db},cycle,deep_check_results:[
    {contract:deferred,run_id:"fair",fast_move_watch_observation:deepObservation(t0+1000,deferred,{anomaly_flags:["5m:price_change_pct","5m:oi_change_pct"],priority_rank:2})},
    {contract:selected,run_id:"fair",fast_move_watch_observation:obs},
  ],discovery_prefilter:{shortlist:[]},now:t0+1000});
  assert.equal(final.status,"CLOSED");
  assert.equal(final.finalized[0].contract,selected);
  assert.equal(db.states.get(selected).deferral_count,0);
  assert.equal(db.states.get(selected).missed_due_count,0);
  assert.ok(cycle.writes_used + final.writes_used <= 8);
}

// Event retention work is bounded; durable generation history remains intact.
{
  const db = new FakeD1();
  seedWatch(db,"HISTORY-USDT",{state:"EXPIRED",created:t0-20_000_000,updated:t0-19_000_000,expiry:t0-19_500_000,queueStatus:"EXPIRED"});
  for (let i=0;i<150;i++) db.events.set(`old:${i}`,{event_id:`old:${i}`,observed_ts:t0-200*24*60*60*1000-i});
  const cycle = await prepareFastMoveWatchCycle({env:{DATA_DB:db},scan:{contracts:[]},discovery_prefilter:{counts:{shortlist:0},shortlist:[]},run_id:"cleanup",now:t0});
  assert.equal(cycle.status,"CLOSED");
  assert.equal(cycle.cleanup.changes,100);
  assert.equal([...db.events.values()].filter((row)=>String(row.event_id).startsWith("old:")).length,50);
  assert.equal(db.generations.has("HISTORY-USDT:1"),true);
}

// A fresh discovery cannot clobber an in-flight lease or charge it fairness debt.
{
  const db = new FakeD1();
  seedWatch(db,"LEASED-DISCOVERY-USDT",{
    next:t0-1_000,queueStatus:"LEASED",leaseOwner:"run-A",leaseExpires:t0+600_000,
  });
  const fx = fixture(t0,"LEASED-DISCOVERY-USDT");
  const beforeState = structuredClone(db.states.get("LEASED-DISCOVERY-USDT"));
  const cycle = await prepareFastMoveWatchCycle({
    env:{DATA_DB:db},scan:fx.scan,discovery_prefilter:fx.discovery,run_id:"run-B",now:t0,
  });
  const q = db.queue.get("LEASED-DISCOVERY-USDT:1");
  const afterState = db.states.get("LEASED-DISCOVERY-USDT");
  assert.equal(cycle.status,"CLOSED");
  assert.deepEqual(cycle.selected_contracts,[]);
  assert.ok(cycle.discovery_mutations.some((row)=>row.persistence==="ACTIVE_LEASE_PRESERVED"));
  assert.equal(q.status,"LEASED");
  assert.equal(q.lease_owner,"run-A");
  assert.equal(q.lease_expires_ts,t0+600_000);
  assert.equal(afterState.last_event_id,beforeState.last_event_id);
  assert.equal(afterState.deferral_count,beforeState.deferral_count);
  assert.equal(afterState.missed_due_count,beforeState.missed_due_count);
}

// A finalizer is bound to exact contract + generation + run/lease identity.
// Foreign, malformed, and stale results are rejected without releasing the lease.
{
  const db = new FakeD1();
  seedWatch(db,"BOUND-USDT",{next:t0-1_000});
  const cycle = await prepareFastMoveWatchCycle({
    env:{DATA_DB:db},scan:{contracts:[]},
    discovery_prefilter:{counts:{shortlist:0},shortlist:[]},run_id:"owner-run",now:t0,
  });
  assert.deepEqual(cycle.selected_contracts,["BOUND-USDT"]);
  assert.equal(cycle.selected_leases[0].lease_owner,"owner-run");
  const before = structuredClone(db.states.get("BOUND-USDT"));
  const goodObs = deepObservation(t0+1_000,"BOUND-USDT",{
    anomaly_flags:["5m:price_change_pct","5m:oi_change_pct"],priority_rank:1,
  });

  const foreign = await finalizeFastMoveWatchCycle({
    env:{DATA_DB:db},cycle,deep_check_results:[{
      contract:"BOUND-USDT",run_id:"foreign-run",fast_move_watch_observation:goodObs,
    }],now:t0+1_000,
  });
  assert.equal(foreign.status,"STALE_OR_UNBOUND_RESULT_REJECTED");
  assert.equal(db.queue.get("BOUND-USDT:1").lease_owner,"owner-run");
  assert.equal(db.states.get("BOUND-USDT").updated_ts,before.updated_ts);

  const wrongContractObs = {...goodObs,contract:"OTHER-USDT"};
  const malformed = await finalizeFastMoveWatchCycle({
    env:{DATA_DB:db},cycle,deep_check_results:[{
      contract:"BOUND-USDT",run_id:"owner-run",fast_move_watch_observation:wrongContractObs,
    }],now:t0+1_001,
  });
  assert.equal(malformed.status,"STALE_OR_UNBOUND_RESULT_REJECTED");
  assert.match(malformed.finalized[0].error,/CONTRACT_MISMATCH/);
  assert.equal(db.queue.get("BOUND-USDT:1").lease_owner,"owner-run");

  db.queue.set("BOUND-USDT:1",{
    ...db.queue.get("BOUND-USDT:1"),lease_owner:"newer-run",lease_expires_ts:t0+700_000,
  });
  const stale = await finalizeFastMoveWatchCycle({
    env:{DATA_DB:db},cycle,deep_check_results:[{
      contract:"BOUND-USDT",run_id:"owner-run",fast_move_watch_observation:goodObs,
    }],now:t0+1_002,
  });
  assert.equal(stale.status,"STALE_OR_UNBOUND_RESULT_REJECTED");
  assert.equal(db.queue.get("BOUND-USDT:1").lease_owner,"newer-run");
  assert.equal(db.states.get("BOUND-USDT").updated_ts,before.updated_ts);
}

// A bounded scheduler skip still completes one retry attempt and releases only
// its own valid lease, preventing a ten-minute orphaned queue row.
{
  const db = new FakeD1();
  seedWatch(db,"SKIP-USDT",{next:t0-1_000});
  const cycle = await prepareFastMoveWatchCycle({
    env:{DATA_DB:db},scan:{contracts:[]},
    discovery_prefilter:{counts:{shortlist:0},shortlist:[]},run_id:"skip-run",now:t0,
  });
  const result = await finalizeFastMoveWatchCycle({
    env:{DATA_DB:db},cycle,deep_check_results:[{
      contract:"SKIP-USDT",run_id:"skip-run",status:"SKIPPED",
      reason:"REQUIRED_FAST_WATCH_CONTRACT_NOT_READY",
    }],now:t0+1_000,
  });
  const state = db.states.get("SKIP-USDT");
  const queue = db.queue.get("SKIP-USDT:1");
  assert.equal(result.status,"CLOSED");
  assert.equal(state.attempt_count,1);
  assert.equal(queue.status,"PENDING");
  assert.equal(queue.lease_owner,null);
  assert.equal(queue.lease_expires_ts,null);
}

console.log(JSON.stringify({ok:true,suite:"fast-move-watch-runtime",unicode:true,adaptive_recheck:true,generation_open_journal:true,selected_only_finalize:true,lease_identity_binding:true,active_lease_preservation:true,stale_result_rejection:true,d1_cycle_write_bound:true,shadow_only:true}));
