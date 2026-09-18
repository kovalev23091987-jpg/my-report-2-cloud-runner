import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveLifecycleContext,V3_TELEGRAM_SHADOW_RULES_VERSION} from '../src/v3-telegram-lifecycle-sidecar.mjs';
import {prepareLifecycleTransition} from '../src/v3-telegram-runtime.mjs';

class St{constructor(sql,db){this.sql=sql;this.db=db;this.args=[];}bind(...a){this.args=a;return this;}async first(){return this.db.previous;}async run(){this.db.runs.push({sql:this.sql,args:this.args});return {meta:{changes:1}};}}
class Db{constructor(previous=null){this.previous=previous;this.runs=[];this.batches=[];}prepare(sql){return new St(sql,this);}async batch(s){this.batches.push(s);return s.map(()=>({meta:{changes:1}}));}}

const now=2_000_000;
const handoff={contract_code:'RAY-USDT',scan_ts:now-20_000,state:'COMPLETED',execution_status:'COMPLETED',data_sufficiency:'PARTIAL',handoff_direction:'LONG',wave_id:'W1',deep_error:null};
const early={wave_id:'W1',contract_code:'RAY-USDT',lifecycle_stage:'PRE_IMPULSE_WATCH',direction_hint:'LONG',direction_state:'LONG_WATCH',early_detection_quality_0_100:64,last_seen_ts:now-10_000};
const shadow={contract_code:'RAY-USDT',observed_ts:now-10_000,direction_hint:'LONG',stage:'SHADOW_OBSERVE_LONG_BIAS',data_sufficiency:'PARTIAL',dq_status:'HTX_CLOSED_EXTERNAL_CHAINS_MISSING',eq_status:'SHADOW_MEASURABLE'};

test('completed directional Deep Check yields OBSERVE-capable shadow context without probability or dispatch',()=>{
  const d=deriveLifecycleContext({handoff,early,shadow,final:null,previous:null,now_ts:now,d1_pretelegram_budget_closed:true,dispatch_enabled:false});
  assert.equal(d.status,'CLOSED');assert.equal(d.ctx.direction,'LONG');assert.equal(d.ctx.deep_check_completed,true);assert.equal(d.ctx.structure_interesting,true);assert.equal(d.ctx.data_sufficient_for_observation,true);assert.equal(d.ctx.rules_version,V3_TELEGRAM_SHADOW_RULES_VERSION);assert.equal(d.ctx.dispatch_enabled,false);
});

test('conflicting deep/final direction fails closed for new lifecycle',()=>{
  const final={direction:'SHORT',directional_quality:'CLOSED',persisted_ts:now-1000,observation_ts:now-2000,data_quality:'CLOSED',execution_quality:'CLOSED',independence_state:'CLOSED',timing_state:'EARLY',risk_state:'CLEAR',hard_veto:0,telegram_context_status:'CLOSED',valid_until_ts:now+60_000,score_lower_bound:80};
  const d=deriveLifecycleContext({handoff,early,shadow,final,previous:null,now_ts:now});
  assert.equal(d.status,'DIRECTION_CONFLICT_FAIL_CLOSED');assert.equal(d.ctx,null);
});

test('strict current final row makes ENTRY-capable context only with active final context',()=>{
  const final={decision_id:'D1',direction:'LONG',directional_quality:'CLOSED',persisted_ts:now-1000,observation_ts:now-2000,data_quality:'CLOSED',execution_quality:'CLOSED',independence_state:'CLOSED',timing_state:'ENTRY_WINDOW',risk_state:'CLEAR',position_state:'FLAT',management_action:'NOT_EVALUATED',hard_veto:0,telegram_context_status:'CLOSED',valid_until_ts:now+60_000,score_lower_bound:78};
  const d=deriveLifecycleContext({handoff,early,shadow,final,previous:null,now_ts:now,d1_pretelegram_budget_closed:true,dispatch_enabled:false});
  assert.equal(d.status,'CLOSED');assert.equal(d.ctx.final_row_exists,true);assert.equal(d.ctx.final_score_threshold_pass,true);assert.equal(d.ctx.valid_until_active,true);assert.equal(d.ctx.timing_state,'ENTRY_WINDOW');
});

test('previous surfaced direction may be reused only to remove a destroyed idea',()=>{
  const h={...handoff,handoff_direction:null};const e={...early,direction_hint:null,direction_state:'DIRECTION_NOT_CLOSED'};const s={...shadow,direction_hint:'NEUTRAL',stage:'OBSERVE_DATA_INSUFFICIENT'};
  const final={direction:'INSUFFICIENT',directional_quality:'INSUFFICIENT',persisted_ts:now-1000,observation_ts:now-2000,data_quality:'INSUFFICIENT',execution_quality:'INSUFFICIENT',independence_state:'INSUFFICIENT',timing_state:'BLOCKED',risk_state:'INVALIDATED',hard_veto:0,telegram_context_status:'INVALIDATED',valid_until_ts:now+60_000};
  const previous={contract:'RAY-USDT',direction:'LONG',wave_id:'W1',status:'WAIT',updated_ts:now-30_000};
  const d=deriveLifecycleContext({handoff:h,early:e,shadow:s,final,previous,now_ts:now});
  assert.equal(d.status,'CLOSED');assert.equal(d.ctx.direction,'LONG');assert.equal(d.ctx.direction_destroyed,true);assert.ok(['INVALIDATED','DIRECTION_DESTROYED','DATA_UNUSABLE'].includes(d.ctx.removal_reason));
});

test('persistence-only lifecycle stores status but creates no dispatch row',async()=>{
  const db=new Db();
  const r=await prepareLifecycleTransition(db,{contract:'RAY-USDT',direction:'LONG',wave_id:'W1',rules_version:V3_TELEGRAM_SHADOW_RULES_VERSION,dispatch_enabled:false,deep_check_completed:true,identity_current:true,data_current:true,structure_interesting:true,useful_observation:true,data_sufficient_for_observation:true,observation_ts:1000,valid_until_ts:100000},2000);
  assert.equal(r.status,'CLOSED');assert.equal(r.current_status,'OBSERVE');assert.equal(r.dispatch,null);assert.equal(db.batches[0].length,1);
});
