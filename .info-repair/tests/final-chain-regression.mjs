import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildFinalChainTelegramMessage,
  extractExactScoreContext,
  finalObserverGate,
  reserveDispatch,
  runTelegramOutputLayer,
} from "../candidate/runner/telegram-output.mjs";

const now = Date.UTC(2026,8,17,10,0,0);
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function scoreContext(observer, overrides={}) {
  return {
    schema:"telegram-final-context-v1",
    score_semantics:"FOUR_BLOCK_35_30_20_15_V1",
    is_probability:false,
    decision_id:observer.decision_id,
    material_digest:observer.material_digest,
    snapshot_id:observer.snapshot_id,
    observation_ts:observer.observation_ts,
    direction:observer.direction,
    decision_evidence_receipt_id:observer.decision_evidence_receipt_id,
    full_evidence_receipt_id:observer.full_evidence_receipt_id,
    safety_gate_receipt_id:observer.safety_gate_receipt_id,
    score_lower_bound:78,
    score_upper_bound:78,
    weighted_blocks:[
      {id:"DERIVATIVES_CROSS_VENUE",weight:35,state:"CLOSED",contribution_lower:28,contribution_upper:28},
      {id:"RELATIVE_STRENGTH_SPOT",weight:30,state:"CLOSED",contribution_lower:22,contribution_upper:22},
      {id:"SMART_MONEY_ONCHAIN",weight:20,state:"CLOSED",contribution_lower:16,contribution_upper:16},
      {id:"SUPPORTING_RISK",weight:15,state:"CLOSED",contribution_lower:12,contribution_upper:12},
    ],
    valid_until_ts:observer.observation_ts + 10*60_000,
    entry:{area:"100–101",target:"108",invalidation:"97"},
    funding:{rate_pct:-0.02,interval_hours:8,observed_ts:observer.observation_ts-30_000},
    reasons:["цена удерживает подтверждённую область", "поток и относительная сила согласованы"],
    risk:"резкое ухудшение цены или ликвидности",
    liquidations:{status:"PARTIAL",short_above:"108–110 — самые сильные из доступных",long_below:"95–97 — крупные"},
    ...overrides,
  };
}

function observer(id="1", overrides={}) {
  const observationTs = now-30_000 + Number(id)*1000;
  const row={
    decision_id:`FDI:AAA:${id}:abcdef0123456789`, material_digest:`abcdef0123456789`, snapshot_id:`SNAP:${id}`,
    mode:"SHADOW_ONLY_NO_EXECUTION",decision_status:"SHADOW_EVALUATED",
    contract_code:"AAA-USDT",observation_ts:observationTs,persisted_ts:observationTs+5_000,direction:"LONG",
    directional_quality:"CLOSED",entry_action:"SHADOW_ENTRY_ELIGIBLE",entry_action_id:`FDE:AAA:${id}:x`,entry_quality:"CLOSED",
    data_quality:"CLOSED",execution_quality:"CLOSED",entry_execution_quality:"CLOSED",
    campaign_phase:"ENTRY_TRIGGER",campaign_quality:"CLOSED",independence_state:"CLOSED",timing_state:"ENTRY_WINDOW",
    risk_state:"CLEAR",position_state:"FLAT",management_action:"NOT_EVALUATED",hard_veto:false,hard_veto_state:"CLEAR",
    shadow_only:1,live_probability:null,validated_signal:0,execution_authorized:0,telegram_eligible:0,
    position_source_quality:"CLOSED",
    decision_evidence_receipt_id:`DER:${id}`,full_evidence_receipt_id:`FER:${id}`,safety_gate_receipt_id:`SGR:${id}`,
    decision_json:JSON.stringify({source_quality:{position:"CLOSED"}}),
  };
  return {...row,...overrides};
}

function sidecar(observer, contextOverrides={}, rowOverrides={}) {
  const c=scoreContext(observer,contextOverrides);
  const raw=JSON.stringify(c);
  return {
    context_id:`FTC:${observer.decision_id}`,
    decision_id:observer.decision_id,
    material_digest:observer.material_digest,
    snapshot_id:observer.snapshot_id,
    contract_code:observer.contract_code,
    observation_ts:observer.observation_ts,
    direction:observer.direction,
    decision_evidence_receipt_id:observer.decision_evidence_receipt_id,
    full_evidence_receipt_id:observer.full_evidence_receipt_id,
    safety_gate_receipt_id:observer.safety_gate_receipt_id,
    score_schema:c.schema,
    score_semantics:c.score_semantics,
    score_lower_bound:c.score_lower_bound,
    score_upper_bound:c.score_upper_bound,
    valid_until_ts:c.valid_until_ts,
    context_json:raw,
    context_digest:sha(raw),
    status:"CLOSED",
    persisted_ts:observer.persisted_ts+1_000,
    ...rowOverrides,
  };
}

class MockDb {
  constructor(finalRows=[], contexts=[], {unknownInsertAck=false}={}) {
    this.finalRows=finalRows;
    this.contexts=new Map(contexts.map(x=>[x.decision_id,x]));
    this.journal=new Map();
    this.sql=[];
    this.unknownInsertAck=unknownInsertAck;
  }
  prepare(sql) {
    this.sql.push(String(sql));
    const db=this;
    return {bind(...args){return {
      async all(){
        const s=String(sql);
        if(s.includes("FROM shadow_decision_log")) throw new Error("FORBIDDEN_NEIGHBOR_SCORE_QUERY");
        if(s.includes("FROM final_decision_integration_shadow")) return {results:db.finalRows};
        if(s.includes("FROM final_decision_telegram_context_shadow")) return {results:args.map(id=>db.contexts.get(String(id))).filter(Boolean)};
        return {results:[]};
      },
      async first(){
        const s=String(sql);
        if(s.includes("telegram_output_dispatch_journal_v2")) return db.journal.get(args[0]) || null;
        return null;
      },
      async run(){
        const s=String(sql);
        if(s.includes("INSERT OR IGNORE INTO telegram_output_dispatch_journal_v2")) {
          if(db.unknownInsertAck) return {success:true};
          const key=args[0];
          if(db.journal.has(key)) return {success:true,meta:{changes:0}};
          db.journal.set(key,{dispatch_key:key,category:args[1],source_ref:args[2],status:"RESERVED",reserved_ts:args[3],updated_ts:args[3],message_hash:args[4],error_text:null});
          return {success:true,meta:{changes:1}};
        }
        if(s.includes("SET status='SENT'")) {
          const row=db.journal.get(args[0]); if(row?.status==="RESERVED") Object.assign(row,{status:"SENT",updated_ts:args[1],telegram_message_id:args[2],telegram_http_status:args[3],error_text:null});
          return {success:true,meta:{changes:row?1:0}};
        }
        if(s.includes("SET status='SEND_FAILED'")) {
          const row=db.journal.get(args[0]); if(row?.status==="RESERVED") Object.assign(row,{status:"SEND_FAILED",updated_ts:args[1],telegram_http_status:args[2],error_text:args[3]});
          return {success:true,meta:{changes:row?1:0}};
        }
        if(s.includes("SET updated_ts=?2") && s.includes("error_text=?4")) {
          const row=db.journal.get(args[0]); if(row?.status==="RESERVED") Object.assign(row,{updated_ts:args[1],telegram_http_status:args[2],error_text:args[3]});
          return {success:true,meta:{changes:row?1:0}};
        }
        return {success:true,meta:{changes:0}};
      },
    }}};
  }
}

async function run(db, fetchImpl, startedTs=now) {
  return runTelegramOutputLayer({
    db,startedTs,source:"schedule",enabled:true,shadowDecisionAuto:true,
    watch70Enabled:true,watch70Threshold:70,relayUrl:"https://relay.invalid/x",relayKey:"x",fetchImpl,
  });
}
function successFetch(sink=[]) {
  return async(_u,init)=>{sink.push(JSON.parse(init.body).text);return new Response(JSON.stringify({ok:true,status:"SENT",message_id:777}),{status:200,headers:{"content-type":"application/json"}});};
}

const base=observer("1");
const baseCtx=sidecar(base);
assert.deepEqual(finalObserverGate(base),{ok:true,status:"FINAL_CHAIN_CLOSED"});
for (const [row,status] of [
  [{...base,entry_action:"WAIT",entry_quality:"INSUFFICIENT"},"ENTRY_NOT_FINAL_ELIGIBLE"],
  [{...base,hard_veto:true,hard_veto_state:"ACTIVE",risk_state:"INVALIDATED"},"RISK_NOT_CLEAR"],
  [{...base,data_quality:"PARTIAL"},"DATA_QUALITY_NOT_CLOSED"],
  [{...base,independence_state:"PARTIAL"},"EVIDENCE_INDEPENDENCE_NOT_CLOSED"],
]) assert.equal(finalObserverGate(row).status,status);

// The immutable Final Decision JSON stays shape-compatible and contains no Telegram context.
assert.equal(Object.hasOwn(JSON.parse(base.decision_json),"telegram_context_v1"),false);
const extracted=extractExactScoreContext(base,baseCtx,70,now);
assert.equal(extracted.ok,true,extracted.status);
assert.equal(extracted.context.score_lower_bound,78);
const built=buildFinalChainTelegramMessage(base,extracted.context,{now});
assert.equal(built.ok,true,built.status);
assert.match(built.message,/^🟢 ЛОНГ • AAA/m);
assert.match(built.message,/Условия входа подтверждены/);
assert.match(built.message,/Оценка: 78 из 100/);
assert.match(built.message,/Вход: 100–101/);
assert.match(built.message,/Цель: 108 \| Отмена: 97/);
assert.match(built.message,/Ставка: -0\.0200% за 8 ч; лонг получает\./);
assert.match(built.message,/Уведомление означает рыночную возможность, а не подтверждение открытой позиции пользователя\./);
assert.doesNotMatch(built.message,/ставка финансирования поддерживает|ставка финансирования может ослабить|funding/i);

const positiveRow=observer("2");
const positiveCtx=sidecar(positiveRow,{funding:{rate_pct:0.015,interval_hours:8,observed_ts:positiveRow.observation_ts-40_000}});
const posExtract=extractExactScoreContext(positiveRow,positiveCtx,70,now);
assert.equal(posExtract.ok,true,posExtract.status);
const posMsg=buildFinalChainTelegramMessage(positiveRow,posExtract.context,{now}).message;
assert.match(posMsg,/Ставка: \+0\.0150% за 8 ч; лонг платит\./);
assert.match(posMsg,/Почему: цена удерживает подтверждённую область; поток и относительная сила согласованы\./);

// No sidecar context: fail closed. No neighboring score query is allowed.
const noContext=observer("3");
const noDb=new MockDb([noContext],[]);
const noSent=[];
const noOut=await run(noDb,successFetch(noSent));
assert.equal(noOut.shadow_decision.sent,false);
assert.equal(noSent.length,0);
assert.equal(noOut.shadow_decision.skipped[0].reason,"EXACT_SCORE_CONTEXT_NOT_AVAILABLE");
assert.equal(noDb.sql.some(s=>s.includes("shadow_decision_log")),false);
assert.equal(noDb.sql.some(s=>s.includes("final_decision_telegram_context_shadow")),true);

// Every sidecar-to-decision binding must be exact.
for (const [field,value,status] of [
  ["decision_id","FDI:OTHER","SCORE_DECISION_ID_MISMATCH"],
  ["material_digest","0000000000000000","SCORE_MATERIAL_DIGEST_MISMATCH"],
  ["snapshot_id","SNAP:OTHER","SCORE_SNAPSHOT_ID_MISMATCH"],
  ["contract_code","OTHER-USDT","SCORE_CONTRACT_MISMATCH"],
  ["observation_ts",1,"SCORE_OBSERVATION_TS_MISMATCH"],
  ["direction","SHORT","SCORE_DIRECTION_MISMATCH"],
  ["decision_evidence_receipt_id","DER:OTHER","SCORE_DECISION_EVIDENCE_RECEIPT_MISMATCH"],
  ["full_evidence_receipt_id","FER:OTHER","SCORE_FULL_EVIDENCE_RECEIPT_MISMATCH"],
  ["safety_gate_receipt_id","SGR:OTHER","SCORE_SAFETY_GATE_RECEIPT_MISMATCH"],
]) {
  const row=observer("4");
  const sc=sidecar(row,{}, {[field]:value});
  assert.equal(extractExactScoreContext(row,sc,70,now).status,status,field);
}

// Raw JSON digest and JSON-to-sidecar bindings are independently enforced.
const digestRow=observer("5");
const digestCtx=sidecar(digestRow);
digestCtx.context_digest="0".repeat(64);
assert.equal(extractExactScoreContext(digestRow,digestCtx,70,now).status,"EXACT_SCORE_CONTEXT_DIGEST_MISMATCH");
const jsonBindRow=observer("6");
const jsonBindCtx=sidecar(jsonBindRow,{snapshot_id:"SNAP:OTHER"});
assert.equal(extractExactScoreContext(jsonBindRow,jsonBindCtx,70,now).status,"CONTEXT_SNAPSHOT_ID_MISMATCH");

const badSumRow=observer("7");
const badSumCtx=sidecar(badSumRow);
const badSumObj=JSON.parse(badSumCtx.context_json);badSumObj.weighted_blocks[0].contribution_lower=27;badSumCtx.context_json=JSON.stringify(badSumObj);badSumCtx.context_digest=sha(badSumCtx.context_json);
assert.equal(extractExactScoreContext(badSumRow,badSumCtx,70,now).status,"FOUR_BLOCK_SCORE_SUM_MISMATCH");
const lowRow=observer("8");
const lowObj=scoreContext(lowRow,{score_lower_bound:69,score_upper_bound:69});lowObj.weighted_blocks[0].contribution_lower=19;lowObj.weighted_blocks[0].contribution_upper=19;
const lowRaw=JSON.stringify(lowObj);const lowCtx=sidecar(lowRow);Object.assign(lowCtx,{score_lower_bound:69,score_upper_bound:69,context_json:lowRaw,context_digest:sha(lowRaw)});
assert.equal(extractExactScoreContext(lowRow,lowCtx,70,now).status,"SCORE_LOWER_BOUND_BELOW_THRESHOLD");

// User portfolio is never inferred from the internal shadow ledger.
const unsafe=observer("9",{position_state:"OPEN_LONG"});
const unsafeCtx=sidecar(unsafe);
// Final entry gate itself rejects non-flat analytical lifecycle; direct context extraction still never confirms a user trade.
const safeExtract=extractExactScoreContext(unsafe,unsafeCtx,70,now);
assert.equal(safeExtract.ok,true,safeExtract.status);
assert.equal(safeExtract.context.position_semantics.user_portfolio_state,"UNKNOWN");
assert.equal(safeExtract.context.position_semantics.user_position_confirmed,false);
assert.equal(safeExtract.context.position_semantics.alert_implies_user_trade,false);

// Two distinct decisions for same ticker/direction may both send; no ticker cooldown.
const row10=observer("10"), row11=observer("11");
const twoDb=new MockDb([row10,row11],[sidecar(row10),sidecar(row11)]);
const twoSent=[];
const twoOut=await run(twoDb,successFetch(twoSent));
assert.equal(twoOut.shadow_decision.count,2);
assert.equal(twoSent.length,2);
assert.equal(twoDb.sql.some(s=>s.includes("updated_ts>=") && s.includes("source_ref")),false);
assert.equal(twoDb.sql.filter(s=>s.includes("final_decision_telegram_context_shadow")).length,1,"sidecars should be loaded in one bounded query");

// Parallel runs for one decision can acquire at most one reservation/send.
const raceRow=observer("12");
const raceDb=new MockDb([raceRow],[sidecar(raceRow)]);
const raceSent=[];
const [raceA,raceB]=await Promise.all([run(raceDb,successFetch(raceSent)),run(raceDb,successFetch(raceSent))]);
assert.equal(raceSent.length,1);
assert.equal(raceA.shadow_decision.count+raceB.shadow_decision.count,1);
assert.equal([...raceDb.journal.values()][0].status,"SENT");

// Ambiguous delivery remains RESERVED + DELIVERY_UNKNOWN and is not auto-retried.
const unknownRow=observer("13");
const unknownDb=new MockDb([unknownRow],[sidecar(unknownRow)]);
let unknownCalls=0;
const unknownFetch=async()=>{unknownCalls++; throw new Error("socket lost after write");};
const unknownA=await run(unknownDb,unknownFetch);
assert.equal(unknownA.shadow_decision.sent,false);
assert.equal(unknownA.shadow_decision.skipped[0].reason,"DELIVERY_UNKNOWN");
const unknownJournal=[...unknownDb.journal.values()][0];
assert.equal(unknownJournal.status,"RESERVED");
assert.match(unknownJournal.error_text,/^DELIVERY_UNKNOWN:/);
const unknownB=await run(unknownDb,unknownFetch);
assert.equal(unknownCalls,1);
assert.equal(unknownB.shadow_decision.skipped[0].reason,"DELIVERY_UNKNOWN_NO_AUTORETRY");

const failRow=observer("14");
const failDb=new MockDb([failRow],[sidecar(failRow)]);
let failCalls=0;
const failFetch=async()=>{failCalls++; return new Response(JSON.stringify({ok:false,status:"TELEGRAM_REJECTED",error:"bad request"}),{status:400,headers:{"content-type":"application/json"}});};
const failA=await run(failDb,failFetch);
assert.equal(failA.shadow_decision.skipped[0].reason,"SEND_FAILED");
assert.equal([...failDb.journal.values()][0].status,"SEND_FAILED");
const failB=await run(failDb,failFetch);
assert.equal(failCalls,1);
assert.equal(failB.shadow_decision.skipped[0].reason,"DEFINITE_FAILURE_REQUIRES_NEW_DECISION_OR_EXPLICIT_RETRY");

const ackRow=observer("15");
const ackDb=new MockDb([ackRow],[sidecar(ackRow)],{unknownInsertAck:true});
let ackCalls=0;
const ackOut=await run(ackDb,async()=>{ackCalls++;return new Response("{}",{status:200});});
assert.equal(ackCalls,0);
assert.equal(ackOut.shadow_decision.skipped[0].reason,"RESERVATION_ACK_UNKNOWN");

const directDb=new MockDb([]);
const first=await reserveDispatch(directDb,{dispatchKey:"final-chain:X",category:"FINAL_CHAIN_CANDIDATE",sourceRef:"X|S",text:"abc",now});
const second=await reserveDispatch(directDb,{dispatchKey:"final-chain:X",category:"FINAL_CHAIN_CANDIDATE",sourceRef:"X|S",text:"abc",now});
assert.equal(first.reserved,true);
assert.equal(second.reserved,false);
assert.equal(second.reason,"EXISTING_RESERVATION_NO_AUTORETRY");

console.log("PASS R5 Telegram sidecar exact-decision binding, neutral funding, atomic decision dedupe, delivery uncertainty, and user-position separation");
