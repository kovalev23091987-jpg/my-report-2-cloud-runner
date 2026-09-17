import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTz101ExactTelegramContext,
  persistTz101ExactTelegramContext,
  TZ101_TELEGRAM_CONTEXT_SCHEMA,
  TZ101_TELEGRAM_SCORE_SEMANTICS,
} from '../src/tz101-telegram-context-runtime.mjs';

const NOW=1_789_650_000_000;
const decision={
  decision_id:'FDI:AAA-USDT:1789650000000:abcdef0123456789',material_digest:'abcdef0123456789',snapshot_id:'S392:AAA-USDT:1789650000000',contract_code:'AAA-USDT',observation_ts:NOW,direction:'LONG',
  entry_action:'SHADOW_ENTRY_ELIGIBLE',entry_quality:'CLOSED',data_quality:'CLOSED',execution_quality:'CLOSED',independence_state:'CLOSED',timing_state:'ENTRY_WINDOW',risk_state:'CLEAR',hard_veto:false,hard_veto_state:'CLEAR',
  decision_evidence_receipt_id:'DER:1',full_evidence_receipt_id:'FER:1',safety_gate_receipt_id:'SGR:1',
};
const blocks=[
  {id:'DERIVATIVES_CROSS_VENUE',weight:35,state:'CLOSED',contribution_lower:30,contribution_upper:30,subcriteria:[]},
  {id:'RELATIVE_STRENGTH_SPOT',weight:30,state:'CLOSED',contribution_lower:25,contribution_upper:25,subcriteria:[]},
  {id:'SMART_MONEY_ONCHAIN',weight:20,state:'CLOSED',contribution_lower:15,contribution_upper:15,subcriteria:[]},
  {id:'SUPPORTING_RISK',weight:15,state:'CLOSED',contribution_lower:8,contribution_upper:8,subcriteria:[]},
];
const publication={
  status:'CLOSED',
  user_position_semantics:{user_portfolio_state:'UNKNOWN',user_position_confirmed:false,user_position_quantity_contracts:null,user_management_authorized:false,alert_implies_user_trade:false},
  telegram_context:{
    score_lower_bound:78,score_upper_bound:78,weighted_blocks:blocks,
    entry:{area:'1.00–1.02',target:'1.12',invalidation:'0.96'},valid_until_ts:NOW+10*60_000,
    funding:{rate_pct:-0.02,interval_hours:8,observed_ts:NOW-30_000},risk:'потеря спроса',reasons:['поток подтверждён','относительная сила подтверждена'],
    liquidations:{status:'NOT_CONFIRMED',note:'Уровни крупных ликвидаций не подтверждены'},
  },
};
class DB {
  constructor(result={success:true,meta:{changes:1,rows_written:1}}){this.result=result;this.prepared=0;this.sql='';this.args=[];}
  prepare(sql){this.prepared++;this.sql=sql;return {bind:(...args)=>{this.args=args;return {run:async()=>this.result};}};}
}

test('exact context binds decision, receipts and four blocks without user-position inference',()=>{
  const r=buildTz101ExactTelegramContext({decision_summary:decision,publication_gate:publication});
  assert.equal(r.status,'CLOSED');
  assert.equal(r.context.schema,TZ101_TELEGRAM_CONTEXT_SCHEMA);
  assert.equal(r.context.score_semantics,TZ101_TELEGRAM_SCORE_SEMANTICS);
  assert.equal(r.context.decision_id,decision.decision_id);
  assert.equal(r.context.decision_evidence_receipt_id,'DER:1');
  assert.equal(r.context.weighted_blocks.length,4);
  assert.equal(r.context.user_position_semantics.user_portfolio_state,'UNKNOWN');
  assert.equal(r.context.is_probability,false);
});

test('non-closed publication gate performs zero D1 statements',async()=>{
  const db=new DB();
  const r=await persistTz101ExactTelegramContext({env:{DATA_DB:db},decision_summary:decision,publication_gate:{status:'NOT_CLOSED'},persisted_ts:NOW+1000});
  assert.equal(r.status,'NOT_CLOSED');assert.equal(r.statements,0);assert.equal(db.prepared,0);
});

test('closed context is inserted immutably with SHA-256 digest and no pre-read',async()=>{
  const db=new DB();
  const r=await persistTz101ExactTelegramContext({env:{DATA_DB:db},decision_summary:decision,publication_gate:publication,persisted_ts:NOW+1000});
  assert.equal(r.status,'CLOSED');assert.equal(r.statements,1);assert.equal(db.prepared,1);
  assert.match(db.sql,/INSERT OR IGNORE INTO final_decision_telegram_context_shadow/);
  assert.match(r.context_digest,/^[0-9a-f]{64}$/);assert.equal(db.args.length,18);
  const parsed=JSON.parse(db.args[15]);assert.equal(parsed.decision_id,decision.decision_id);assert.equal(parsed.score_lower_bound,78);
});

test('duplicate sidecar is explicit and does not rewrite context',async()=>{
  const db=new DB({success:true,meta:{changes:0,rows_written:0}});
  const r=await persistTz101ExactTelegramContext({env:{DATA_DB:db},decision_summary:decision,publication_gate:publication,persisted_ts:NOW+1000});
  assert.equal(r.status,'DEDUPLICATED');assert.equal(r.statements,1);
});

test('ambiguous or contradictory D1 ack fails closed',async()=>{
  for(const result of [
    {success:true,meta:{changes:'1',rows_written:1}},
    {success:true,meta:{changes:1,rows_written:0}},
    {success:true,meta:{changes:2,rows_written:2}},
    {success:false,meta:{changes:1,rows_written:1}},
  ]) {
    const r=await persistTz101ExactTelegramContext({env:{DATA_DB:new DB(result)},decision_summary:decision,publication_gate:publication,persisted_ts:NOW+1000});
    assert.equal(r.status,'FAIL_CLOSED');
  }
});

test('missing migration is explicit',async()=>{
  const db={prepare(){return {bind(){return {run:async()=>{throw new Error('no such table: final_decision_telegram_context_shadow');}};}};}};
  const r=await persistTz101ExactTelegramContext({env:{DATA_DB:db},decision_summary:decision,publication_gate:publication,persisted_ts:NOW+1000});
  assert.equal(r.status,'MIGRATION_REQUIRED');
});

test('receipt or validity mutation cannot build context',()=>{
  const bad={...decision,full_evidence_receipt_id:''};
  assert.equal(buildTz101ExactTelegramContext({decision_summary:bad,publication_gate:publication}).status,'NOT_CLOSED');
  const stale=structuredClone(publication);stale.telegram_context.valid_until_ts=NOW-1;
  assert.equal(buildTz101ExactTelegramContext({decision_summary:decision,publication_gate:stale}).status,'NOT_CLOSED');
});
