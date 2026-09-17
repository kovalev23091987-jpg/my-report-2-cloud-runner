import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  MAX_ADMISSION_STATE_ROWS,
  MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK,
  MAX_OUTCOME_UPDATES_PER_DEEP_CHECK,
  OPPORTUNITY_JOURNAL_SLOT_MS,
  OPPORTUNITY_JOURNAL_SLOT_MODULUS,
  buildOpportunityJournalPrefilter,
  opportunityDataPlaneSummary,
  runOpportunityShadowCycle,
  selectOpportunityJournalCandidate,
} from "../src/opportunity-intelligence-runtime.mjs";

const HOUR = 3_600_000;
const MINUTE = 60_000;
const START = 1_800_000_000_000 - (1_800_000_000_000 % HOUR);

class SqliteD1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
}

class SqliteD1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys=ON");
    // Stage 3.9.2 runtime is intentionally fail-closed unless its additive
    // receipt-wiring migration is present. Exercise the real migration chain
    // instead of silently testing a pre-3.9.2 schema.
    for (const name of [
      "20260912_full_evidence_shadow.sql",
      "20260913_opportunity_intelligence_shadow.sql",
      "20260913_opportunity_integrity_hardening_shadow.sql",
      "20260913_multi_wave_campaign_shadow.sql",
      "20260914_final_decision_integration_shadow.sql",
      "20260914_stage392_receipt_wiring_shadow.sql",
    ]) {
      this.db.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    }
    this.maxBoundParameters = 0;
    this.executed = [];
  }
  prepare(sql) { return new SqliteD1Statement(this.db, sql); }
  async batch(statements) {
    const out = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < statements.length; index += 1) {
        try {
          this.maxBoundParameters = Math.max(this.maxBoundParameters, statements[index].args.length);
          this.executed.push({ sql: statements[index].sql, args: [...statements[index].args] });
          out.push(await statements[index].run());
        } catch (error) {
          const width = 39;
          const scheduleArgs = Array.from(
            { length: Math.ceil(statements[index].args.length / width) },
            (_, row) => {
              const values = statements[index].args.slice(row * width, (row + 1) * width);
              return {
                horizon: values[2], target: values[3], status: values[4],
                closed: values[7], next: values[8], retention: values[9],
              };
            },
          );
          throw new Error(
            `${error.message}; batch_statement=${index}; schedules=${JSON.stringify(scheduleArgs)}; args=${JSON.stringify(statements[index].args)}; sql=${statements[index].sql.replace(/\s+/g, " ").trim()}`,
            { cause: error },
          );
        }
      }
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function minuteHistory(hours = 18, anomalyHour = 12) {
  return Array.from({ length: hours * 60 }, (_, i) => {
    const hour = Math.floor(i / 60);
    const anomalous = hour === anomalyHour;
    return {
      ts: START + i * MINUTE,
      open: anomalous ? 100 : 100,
      high: anomalous ? 102 : 100.4,
      low: anomalous ? 98 : 99.6,
      close: anomalous ? 100.2 : 100 + (i % 60) * 0.0005,
      volume: anomalous ? 10 : 1,
      trade_count: 1,
      closed: true,
    };
  });
}

function input(oneMinute, now) {
  const hours = Math.floor(oneMinute.length / 60);
  const oi = Array.from({ length: hours }, (_, i) => ({
    ts: START + i * HOUR,
    volume: i < 10 ? 100 : i === 10 ? 90 : 96,
  }));
  return {
    contract: "LSK-USDT",
    now,
    primary: {
      one_minute: oneMinute,
      four_hour: [],
      one_day: [],
      oi_contracts_hourly: oi,
      windows: {
        "1h": {
          synchronized_window_end_ts: START + 13 * HOUR,
          price: { usable: true, change_pct: -0.2 },
          open_interest: { usable: true, contracts: { change_pct: -5 } },
          order_flow: {
            usable: true,
            taker_buy_usdt: 60,
            taker_sell_usdt: 40,
            delta_usdt: 20,
            sample_cvd_usdt: 20,
            sample_trades: 10,
          },
        },
      },
    },
    futures_snapshot: { bbo: { best_bid: 99, best_ask: 99.2 } },
    spot_snapshot: { ticker_24h: { last_price: 100 }, order_flow: { windows: {} } },
    funding: { current: { funding_rate: -0.001 } },
    external_hourly: {},
  };
}

function hourlyInput(oneHour, now) {
  return {
    contract: "LSK-USDT",
    now,
    primary: {
      one_minute: [],
      one_hour: oneHour,
      four_hour: [],
      one_day: [],
      oi_contracts_hourly: [],
      windows: {},
    },
    external_hourly: {},
  };
}

function hourlyHistory(hours = 10 * 24, anomalyIndex = -1) {
  return Array.from({ length: hours }, (_, index) => ({
    ts: START + index * HOUR,
    end_ts: START + (index + 1) * HOUR,
    duration_ms: HOUR,
    open: 100,
    high: index === anomalyIndex ? 102 : 100.4,
    low: index === anomalyIndex ? 98 : 99.6,
    close: index === anomalyIndex ? 100.1 : 100,
    volume: index === anomalyIndex ? 8 : 1,
    trade_count: 1,
    closed: true,
  }));
}

test("runtime persists one deterministic event, six horizons, and a bounded funnel batch", async () => {
  const d1 = new SqliteD1();
  const candles = minuteHistory(14);
  const now = START + 14 * HOUR;
  const result = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(candles, now), run_id: "run-1", now,
  });
  assert.equal(result.persistence.status, "CLOSED");
  assert.ok(result.persistence.statements <= MAX_OPPORTUNITY_D1_STATEMENTS_PER_DEEP_CHECK);
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_event").get().n, 1);
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_outcome").get().n, 6);
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_funnel").get().n, 1);
  const safety = d1.db.prepare("SELECT live_probability,live_signal,validated_signal,telegram_started,trading_execution FROM opportunity_shadow_event").get();
  assert.deepEqual({ ...safety }, { live_probability: null, live_signal: 0, validated_signal: 0, telegram_started: 0, trading_execution: 0 });
});

test("second pass closes due outcome without counting related signals as new events", async () => {
  const d1 = new SqliteD1();
  const firstNow = START + 14 * HOUR;
  await runOpportunityShadowCycle({ env: { DATA_DB: d1 }, input: input(minuteHistory(14), firstNow), run_id: "run-a", now: firstNow });
  const secondNow = START + 18 * HOUR;
  const second = await runOpportunityShadowCycle({ env: { DATA_DB: d1 }, input: input(minuteHistory(18), secondNow), run_id: "run-b", now: secondNow });
  assert.equal(second.persistence.status, "CLOSED", JSON.stringify(second.persistence));
  assert.ok(second.outcomes_processed.length <= MAX_OUTCOME_UPDATES_PER_DEEP_CHECK);
  const h1 = d1.db.prepare("SELECT status,price,return_pct,attempt_count FROM opportunity_shadow_outcome WHERE horizon='1h'").get();
  assert.equal(h1.status, "CLOSED_FACTUAL", JSON.stringify(second.outcomes_processed));
  assert.ok(Number.isFinite(h1.price));
  assert.equal(h1.attempt_count, 1);
  const integrityOutcome = d1.db.prepare(`
    SELECT trajectory_complete,source_timeframe,expected_bars,observed_bars,
      trajectory_coverage_pct,direction_at_event,directional_evaluation_eligible,
      mfe_pct,mae_pct,missed_opportunity_detected,max_up_excursion_pct
    FROM opportunity_shadow_outcome WHERE horizon='1h'
  `).get();
  assert.equal(integrityOutcome.trajectory_complete, 1);
  assert.equal(integrityOutcome.expected_bars, integrityOutcome.observed_bars);
  assert.equal(integrityOutcome.trajectory_coverage_pct, 100);
  assert.equal(integrityOutcome.direction_at_event, "NONE");
  assert.equal(integrityOutcome.directional_evaluation_eligible, 0);
  assert.equal(integrityOutcome.mfe_pct, null);
  assert.equal(integrityOutcome.mae_pct, null);
  assert.equal(integrityOutcome.missed_opportunity_detected, null);
  assert.ok(Number.isFinite(integrityOutcome.max_up_excursion_pct));
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_event").get().n, 1);
  assert.equal(second.persistence.selected_event_id, null);
  const third = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(minuteHistory(18), secondNow),
    run_id: "run-c", now: secondNow,
  });
  assert.equal(third.persistence.status, "CLOSED");
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_event").get().n, 1);
  let final = third;
  for (let index = 0; index < 10; index += 1) {
    final = await runOpportunityShadowCycle({
      env: { DATA_DB: d1 }, input: input(minuteHistory(18), secondNow),
      run_id: `run-backfill-${index}`, now: secondNow,
    });
  }
  const counts = d1.db.prepare(
    "SELECT COUNT(*) n,COUNT(DISTINCT event_id) distinct_n FROM opportunity_shadow_event",
  ).get();
  assert.equal(counts.n, counts.distinct_n);
  assert.equal(counts.n, 1);
  assert.equal(final.persistence.selected_event_id, null);
});

test("missing history is retried, then recorded with the required explicit status", async () => {
  const d1 = new SqliteD1();
  const firstNow = START + 14 * HOUR;
  await runOpportunityShadowCycle({ env: { DATA_DB: d1 }, input: input(minuteHistory(14), firstNow), run_id: "seed", now: firstNow });
  d1.db.prepare("UPDATE opportunity_shadow_outcome SET attempt_count=8,status='PENDING' WHERE horizon='1h'").run();
  const lateNow = firstNow + 81 * 24 * HOUR;
  const result = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 },
    input: { contract: "LSK-USDT", now: lateNow, primary: { one_minute: [], four_hour: [], one_day: [], windows: {} } },
    run_id: "missing", now: lateNow,
  });
  assert.equal(result.persistence.status, "CLOSED");
  const row = d1.db.prepare("SELECT status,outcome_json FROM opportunity_shadow_outcome WHERE horizon='1h'").get();
  assert.equal(row.status, "NO_CONFIRMED_HISTORICAL_DATA");
  assert.equal(JSON.parse(row.outcome_json).report_phrase_ru, "нет подтверждённых исторических данных");
});

test("incomplete due trajectory stays pending and exponential retry prevents queue spin", async () => {
  const d1 = new SqliteD1();
  const firstNow = START + 14 * HOUR;
  await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(minuteHistory(14), firstNow), run_id: "retry-seed", now: firstNow,
  });
  const scheduled = d1.db.prepare("SELECT event_id,target_ts FROM opportunity_shadow_outcome WHERE horizon='1h'").get();
  const event = d1.db.prepare("SELECT event_close_ts FROM opportunity_shadow_event WHERE event_id=?").get(scheduled.event_id);
  const missingIndex = Math.round((event.event_close_ts - START) / MINUTE) + 10;
  const gapped = minuteHistory(18).filter((_, index) => index !== missingIndex);
  const dueNow = firstNow;
  const firstRetry = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(gapped, dueNow), run_id: "retry-1", now: dueNow,
  });
  const row = d1.db.prepare("SELECT status,attempt_count,next_attempt_ts,closed_ts FROM opportunity_shadow_outcome WHERE event_id=? AND horizon='1h'").get(scheduled.event_id);
  assert.equal(row.status, "PENDING");
  assert.equal(row.attempt_count, 1);
  assert.ok(row.next_attempt_ts > dueNow);
  assert.equal(row.closed_ts, null);
  assert.equal(firstRetry.outcomes_processed[0].outcome.trajectory_complete, false);
  const immediate = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(gapped, dueNow), run_id: "retry-no-spin", now: dueNow,
  });
  assert.equal(immediate.outcomes_processed.length, 0);
});

test("a later-discovered signal atomically invalidates an overlapping control", async () => {
  const d1 = new SqliteD1();
  const clean = hourlyHistory();
  const now = clean.at(-1).end_ts;
  const seeded = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 },
    input: hourlyInput(clean, now),
    config: { control_sample_modulus: 1 },
    run_id: "control-seed",
    now,
  });
  assert.equal(seeded.persistence.status, "CLOSED");
  const control = d1.db.prepare(`
    SELECT event_id,event_ts,control_eligible,independent_sample
    FROM opportunity_shadow_event WHERE control_group=1
  `).get();
  assert.equal(control.control_eligible, 1);
  assert.equal(control.independent_sample, 1);
  const anomalyIndex = Math.round((control.event_ts - START) / HOUR);
  const revised = hourlyHistory(10 * 24, anomalyIndex);
  const repaired = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 },
    input: hourlyInput(revised, now),
    config: { control_sample_modulus: 1 },
    run_id: "control-repair",
    now,
  });
  assert.equal(repaired.persistence.status, "CLOSED", JSON.stringify(repaired.persistence));
  assert.deepEqual(repaired.persistence.invalidated_control_ids, [control.event_id]);
  assert.equal(repaired.persistence.outcomes_deferred_for_integrity, 4);
  const invalidated = d1.db.prepare(`
    SELECT control_eligible,independent_sample,contamination_status
    FROM opportunity_shadow_event WHERE event_id=?
  `).get(control.event_id);
  assert.deepEqual({ ...invalidated }, {
    control_eligible: 0,
    independent_sample: 0,
    contamination_status: "CONTAMINATED_BY_LATER_DISCOVERED_SIGNAL",
  });
  const independentSignals = d1.db.prepare(`
    SELECT COUNT(*) n FROM opportunity_shadow_event
    WHERE control_group=0 AND independent_sample=1
  `).get().n;
  assert.equal(independentSignals, 1);
});

test("due workload is capped at four outcomes per Deep Check", async () => {
  const d1 = new SqliteD1();
  const firstNow = START + 14 * HOUR;
  await runOpportunityShadowCycle({ env: { DATA_DB: d1 }, input: input(minuteHistory(14), firstNow), run_id: "seed-cap", now: firstNow });
  const allDueNow = firstNow + 8 * 24 * HOUR;
  const result = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(minuteHistory(18), allDueNow),
    run_id: "cap", now: allDueNow,
  });
  assert.equal(result.outcomes_processed.length, 4);
  assert.ok(result.persistence.statements <= 4);
  assert.ok(d1.maxBoundParameters <= 100,"every D1 statement must stay within Cloudflare's 100-parameter limit");
  const jsonOutcomeWrite = d1.executed.find((entry) =>
    /INSERT INTO opportunity_shadow_outcome/.test(entry.sql) && /FROM json_each\(\?1\)/.test(entry.sql)
  );
  assert.ok(jsonOutcomeWrite,"four outcomes must use a bounded JSON1 write");
  assert.equal(jsonOutcomeWrite.args.length,1);
  assert.equal(JSON.parse(jsonOutcomeWrite.args[0]).length,4);
});

test("data-plane summary exposes funnel/outcome counts without live fields", async () => {
  const d1 = new SqliteD1();
  const now = START + 14 * HOUR;
  await runOpportunityShadowCycle({ env: { DATA_DB: d1 }, input: input(minuteHistory(14), now), run_id: "summary", now });
  const summary = await opportunityDataPlaneSummary({ DATA_DB: d1 }, now);
  assert.equal(summary.status, "CLOSED");
  assert.equal(summary.table_available, true);
  assert.equal(summary.event_count, 1);
  assert.equal(summary.pending_outcomes, 6);
  assert.equal(summary.safety.live_probability, null);
  assert.equal(summary.safety.trading_execution, false);
});

test("D1 failure is fail-closed and cannot trigger any external action", async () => {
  const broken = { prepare() { throw new Error("forced D1 failure"); } };
  const now = START + 14 * HOUR;
  const result = await runOpportunityShadowCycle({
    env: { DATA_DB: broken }, input: input(minuteHistory(14), now), run_id: "broken", now,
  });
  assert.equal(result.persistence.status, "PARTIAL_FAIL_CLOSED");
  assert.equal(result.safety.live_signal, false);
  assert.equal(result.safety.telegram_started, false);
  assert.equal(result.safety.trading_execution, false);
});

test("truncated admission history rejects new independent samples explicitly", async () => {
  const d1 = new SqliteD1();
  const insertLegacy = d1.db.prepare(`
    INSERT INTO opportunity_shadow_event (
      event_id,contract_code,exchange,timeframe,event_ts,event_close_ts,event_type,
      open_price,high_price,low_price,close_price,event_volume,control_group,
      funnel_stage,data_quality,event_json,observed_ts,persisted_ts
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  for (let index = 0; index <= MAX_ADMISSION_STATE_ROWS; index += 1) {
    const ts = START + 12 * HOUR + index + 1;
    insertLegacy.run(
      `legacy-overlap-${index}`, "LSK-USDT", "LEGACY", "15m", ts, ts + 1,
      "CONTROL_NON_ANOMALOUS", 100, 101, 99, 100, 1, 0,
      "CONTROL", "OK", "{}", ts + 1, ts + 1,
    );
  }
  const now = START + 14 * HOUR;
  const result = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(minuteHistory(14), now), run_id: "scan-cap", now,
  });
  assert.equal(result.persistence.status, "CLOSED");
  assert.equal(result.persistence.selected_event_id, null);
  assert.equal(result.persistence.admission_state_scan_truncated, true);
  assert.equal(result.persistence.admission_state_rows_scanned, MAX_ADMISSION_STATE_ROWS);
  assert.ok(result.persistence.candidate_rejection_reasons.includes(
    "ADMISSION_STATE_SCAN_TRUNCATED_FAIL_CLOSED",
  ));
  assert.equal(
    d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_event WHERE independent_sample=1").get().n,
    0,
  );
});

test("bounded journal quota selects the oldest due confirmed contract", async () => {
  const d1 = new SqliteD1();
  const firstNow = START + 14 * HOUR;
  await runOpportunityShadowCycle({
    env: { DATA_DB: d1 },
    input: input(minuteHistory(14), firstNow),
    run_id: "journal-seed",
    now: firstNow,
  });
  const quotaPeriod = OPPORTUNITY_JOURNAL_SLOT_MS * OPPORTUNITY_JOURNAL_SLOT_MODULUS;
  const quotaNow = Math.ceil((firstNow + HOUR) / quotaPeriod) * quotaPeriod;
  const selected = await selectOpportunityJournalCandidate({
    env: { DATA_DB: d1 },
    confirmed_contracts: ["BTC-USDT", "LSK-USDT"],
    now: quotaNow,
  });
  assert.equal(selected.status, "SELECTED_BOUNDED_JOURNAL_MAINTENANCE");
  assert.equal(selected.selected_contract, "LSK-USDT");
  assert.equal(selected.quota.maximum_share_of_regular_cron_slots, 0.25);
  const prefilter = buildOpportunityJournalPrefilter({
    shortlist: [{ contract: "BTC-USDT", priority_rank: 1 }],
    counts: { shortlist: 1 },
  }, selected.candidate);
  assert.equal(prefilter.shortlist[0].contract, "LSK-USDT");
  assert.equal(prefilter.shortlist[0].opportunity_journal_maintenance, true);
  const offSlot = await selectOpportunityJournalCandidate({
    env: { DATA_DB: d1 },
    confirmed_contracts: ["LSK-USDT"],
    now: quotaNow + OPPORTUNITY_JOURNAL_SLOT_MS,
  });
  assert.equal(offSlot.status, "NOT_JOURNAL_QUOTA_SLOT");
});

test("idle bounded cleanup removes expired event, cascaded outcomes and old funnel", async () => {
  const d1 = new SqliteD1();
  const firstNow = START + 14 * HOUR;
  await runOpportunityShadowCycle({
    env: { DATA_DB: d1 }, input: input(minuteHistory(14), firstNow),
    run_id: "retention-seed", now: firstNow,
  });
  const lateNow = firstNow + 400 * 24 * HOUR;
  const result = await runOpportunityShadowCycle({
    env: { DATA_DB: d1 },
    input: { contract: "LSK-USDT", now: lateNow, primary: { one_minute: [], one_hour: [], one_day: [], windows: {} } },
    run_id: "retention-cleanup",
    now: lateNow,
  });
  assert.equal(result.persistence.status, "CLOSED");
  assert.ok(result.persistence.writes.some((row) => row.label === "bounded_event_cleanup"));
  assert.ok(result.persistence.writes.some((row) => row.label === "bounded_funnel_cleanup"));
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_event").get().n, 0);
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_outcome").get().n, 0);
  assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM opportunity_shadow_funnel").get().n, 1);
});
