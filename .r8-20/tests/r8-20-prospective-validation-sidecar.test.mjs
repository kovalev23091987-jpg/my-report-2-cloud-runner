import assert from 'node:assert/strict';
import test from 'node:test';
import { immutableReceipt, digest } from '../runtime-root/src/upstream-proof-utils.mjs';
import { buildProspectiveEntryAreaSample } from '../runtime-root/src/tz101-entry-area-calibration.mjs';
import {
  closeOneEarlyDiscoveryOutcome,
  captureOneEntryAreaSample,
  closeOneEntryAreaOutcome,
  runR820ProspectiveValidationSidecar,
  R820_ENTRY_ACTIVATION_KEY,
} from '../runtime-root/r8-20-prospective-validation-sidecar.mjs';

const NOW=Date.UTC(2026,8,18,20,0,0);
function payload(ts, contract='TEST-USDT', price=100){
  return JSON.stringify({schema:'stage0-compact-v2',timestamp:ts,contracts:[[contract,price,1e6,1000,1e6,-0.0001,8,1,'CLOSED',true,false,2,0]]});
}
class Stmt{
  constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
  bind(...args){this.args=args;return this;}
  first(){return this.db.handle('first',this.sql,this.args);}
  all(){return this.db.handle('all',this.sql,this.args);}
  run(){return this.db.handle('run',this.sql,this.args);}
}
class MockDb{
  constructor(handler){this.handlerFn=handler;this.calls=[];this.usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};}
  prepare(sql){return new Stmt(this,sql);}
  usageSnapshot(){return structuredClone(this.usage);}
  async handle(op,sql,args){
    this.calls.push({op,sql,args});this.usage.requests++;
    const r=await this.handlerFn({op,sql,args,db:this});
    const rows=Array.isArray(r?.results)?r.results.length:(r&&op==='first'?1:0);
    if(op==='all'||op==='first')this.usage.rows_read+=r?rows:0;
    if(op==='run')this.usage.rows_written+=Number(r?.meta?.changes??r?.changes??0);
    return r;
  }
}

function validProof({ts=NOW-1_000,direction='LONG',contract='TEST-USDT',snap='S1',decisionTs=NOW}={}){
  const campaign={campaign_id:'MW1',schema_version:'multi-wave-decision-state-v1',rules_version:'multi-wave-decision-state-rules-v1',contract_code:contract,campaign_start:NOW-20*60_000,first_detected_time:NOW-20*60_000,last_observed_ts:ts,campaign_end:null,current_phase:'ENTRY_TRIGGER',direction,direction_at_detection:direction,direction_locked_ts:NOW-19*60_000,direction_lock_observation_id:'E1',wave_index:1,completed_wave_count:0,current_wave_id:'MW1:W1',base_start:null,entry_trigger_time:NOW-60_000,entry_trigger_price:100,impulse_start:null,impulse_start_price:null,impulse_peak_price:null,impulse_peak_ts:null,exhaustion_warning_ts:null,edge_spent_ts:null,last_event_id:'E1',last_event_ts:NOW-2_000,origin_episode_id:'EP1',episode_revision:1,state_revision:4,observation_id:'OBS4',wave_facts_immutable:true,cas_persisted:true,wave_ledger_offset:0,wave_ledger_anchor:null,transition_history:[],history_truncated:false,history_anchor:null,wave_ledger:[]};
  const long=direction==='LONG';
  const anchor={schema_version:'multi-wave-entry-scenario-anchor-v1',rules_version:'multi-wave-campaign-v1',scenario_type:'FIRST_IMPULSE_THRESHOLD',campaign_id:'MW1',contract_code:contract,wave_index:1,direction,source_phase:'ENTRY_TRIGGER',source_observation_ts:ts,base_start:NOW-10*60_000,base_low:long?98:99,base_high:long?101:102,entry_trigger_time:NOW-60_000,entry_trigger_price:100,invalidation_price:long?98:102,target_move_pct:3,target_price:long?103:97,target_basis:'PRECOMMITTED_MULTI_WAVE_IMPULSE_THRESHOLD',invalidation_basis:'PRECOMMITTED_CAMPAIGN_BASE_BREAK',prospective_only:true};
  const material={schema_version:'multi-wave-decision-bridge-v1',status:'SHADOW_CAMPAIGN_EVALUATED',snapshot_id:snap,admitted_event_id:'E1',observation_id:'OBS4',campaign,chase_risk:{status:'CLOSED',active:false,contract_code:contract,snapshot_id:snap,source_ts:ts,available_ts:ts,max_age_ms:60_000,valid_until_ts:decisionTs+60_000,rules_version:'chase-risk-state-v1'},entry_window:{status:'CLOSED',contract_code:contract,snapshot_id:snap,campaign_id:'MW1',wave_id:'MW1:W1',campaign_state_revision:4,observation_id:'OBS4',action_id:'FDE:A',single_use:true,consumed:false,source_ts:NOW-60_000,valid_until_ts:NOW+10*60_000,max_age_ms:30*60_000,persistence:{status:'CLOSED'}},entry_scenario_anchor:anchor};
  return immutableReceipt(material,'CMR:MW1:4:OBS4',ts);
}

test('closes one Early Discovery outcome from factual Stage-0 path without interpolation', async()=>{
  const first=NOW-2*60*60_000,target=first+60*60_000;
  const task={outcome_id:'W1:H1',wave_id:'W1',contract_code:'TEST-USDT',direction_hint:'LONG',first_seen_ts:first,horizon_hours:1,target_ts:target,outcome_status:'PENDING',first_seen_context_json:JSON.stringify({first_seen_price:100}),computed_ts:null,shadow_only:1};
  const scans=[{ts:first,payload_json:payload(first,'TEST-USDT',100)},{ts:target-5*60_000,payload_json:payload(target-5*60_000,'TEST-USDT',104)},{ts:target,payload_json:payload(target,'TEST-USDT',103)}];
  const db=new MockDb(({op,sql})=>{
    if(op==='first'&&sql.includes('FROM v3_early_outcome_journal')) return task;
    if(op==='all'&&sql.includes('FROM scan_runs')) return {results:scans};
    if(op==='run'&&sql.includes('UPDATE v3_early_outcome_journal')) return {meta:{changes:1}};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
  });
  const r=await closeOneEarlyDiscoveryOutcome(db,{current_scan_ts:target,now_ts:target+1});
  assert.equal(r.status,'CLOSED_FACTUAL');
  const w=db.calls.find(x=>x.op==='run');
  assert.ok(Math.abs(w.args[0]-3) < 1e-9); // raw return 3%, float-safe
  assert.ok(Math.abs(w.args[1]-3) < 1e-9); // directional LONG 3%, float-safe
  assert.ok(w.sql.includes("outcome_status='CLOSED_FACTUAL'"));
});

test('captures only prospectively committed entry-area sample after activation', async()=>{
  const proof=validProof();
  const row={decision_id:'FD1',snapshot_id:'S1',contract_code:'TEST-USDT',direction:'LONG',campaign_receipt_id:proof.persistence.receipt_id,observation_ts:NOW,persisted_ts:NOW,decision_status:'SHADOW_EVALUATED',shadow_only:1,live_probability:null,validated_signal:0,execution_authorized:0,telegram_eligible:0,receipt_json:JSON.stringify(proof)};
  const db=new MockDb(({op,sql})=>{
    if(op==='all'&&sql.includes('FROM final_decision_integration_shadow')) return {results:[row]};
    if(op==='run'&&sql.includes('INSERT OR IGNORE INTO tz101_entry_area_calibration_signal')) return {meta:{changes:1}};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
  });
  const r=await captureOneEntryAreaSample(db,{activation_ts:NOW-10_000,now_ts:NOW+1_000});
  assert.equal(r.status,'CAPTURED_PROSPECTIVE');
  assert.equal(r.direction,'LONG');
  assert.ok(db.calls.find(x=>x.op==='run').args[0].startsWith('EAC:'));
});

test('closes entry-area factual outcome and preserves LONG/SHORT symmetry', async()=>{
  for(const direction of ['LONG','SHORT']){
    const proof=validProof({direction});
    const decision={decision_id:'FD1',snapshot_id:'S1',contract_code:'TEST-USDT',observation_ts:NOW,direction,campaign_receipt_id:proof.persistence.receipt_id};
    const sample=buildProspectiveEntryAreaSample({decision_summary:decision,campaign_proof:proof,observed_ts:NOW+1_000});
    assert.equal(sample.status,'CAPTURED_PROSPECTIVE');
    const target=NOW+60*60_000;
    const endPrice=direction==='LONG'?103:97;
    const scans=[{ts:NOW,payload_json:payload(NOW,'TEST-USDT',100)},{ts:NOW+30*60_000,payload_json:payload(NOW+30*60_000,'TEST-USDT',direction==='LONG'?101:99)},{ts:target,payload_json:payload(target,'TEST-USDT',endPrice)}];
    const row={sample_id:sample.sample_id,decision_id:'FD1',contract_code:'TEST-USDT',direction,observed_ts:NOW,sample_json:JSON.stringify(sample.sample),material_digest:sample.material_digest,horizon_hours:1,target_ts:target};
    const db=new MockDb(({op,sql})=>{
      if(op==='all'&&sql.includes('WITH horizons')) return {results:[row]};
      if(op==='all'&&sql.includes('FROM scan_runs')) return {results:scans};
      if(op==='run'&&sql.includes('INSERT OR IGNORE INTO tz101_entry_area_calibration_outcome')) return {meta:{changes:1}};
      throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
    });
    const r=await closeOneEntryAreaOutcome(db,{current_scan_ts:target,activation_ts:NOW-10_000,now_ts:target+1_000});
    assert.equal(r.status,'CLOSED_FACTUAL');
    assert.equal(r.direction,direction);
    const inserted=JSON.parse(db.calls.find(x=>x.op==='run').args[7]);
    assert.ok(inserted.directional_return_pct>0);
  }
});

test('first activation cycle refuses retrospective entry-area backfill', async()=>{
  let activated=false;
  const db=new MockDb(({op,sql,args})=>{
    if(op==='first'&&sql.includes('tz101_entry_area_calibration_state')){
      if(!activated) return null;
      return {state_key:R820_ENTRY_ACTIVATION_KEY,status:'PROSPECTIVE_COLLECTION_ACTIVE_NOT_VALIDATED',updated_ts:NOW};
    }
    if(op==='run'&&sql.includes('INSERT OR IGNORE INTO tz101_entry_area_calibration_state')){activated=true;return {meta:{changes:1}};}
    if(op==='first'&&sql.includes('FROM v3_early_outcome_journal')) return null;
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,100));
  });
  const r=await runR820ProspectiveValidationSidecar(db,{current_scan_ts:NOW,now_ts:NOW,source_run_id:'RUN1'});
  assert.equal(r.status,'CLOSED');
  assert.equal(r.entry_sample.status,'ACTIVATED_NO_RETROSPECTIVE_BACKFILL');
  assert.equal(r.entry_outcome.status,'ACTIVATED_NO_RETROSPECTIVE_BACKFILL');
  assert.equal(db.calls.some(x=>x.sql.includes('FROM final_decision_integration_shadow')),false);
  assert.equal(r.live_probability,null);
  assert.equal(r.validated_signal,false);
});

test('tampered/backfilled anchor is rejected by existing contract', async()=>{
  const proof=validProof();
  const legacy=structuredClone(proof); legacy.entry_scenario_anchor.source_observation_ts-=60_000;
  const m=structuredClone(legacy); delete m.persistence;
  const resealed=immutableReceipt(m,proof.persistence.receipt_id,proof.persistence.committed_ts);
  const decision={decision_id:'FDX',snapshot_id:'S1',contract_code:'TEST-USDT',observation_ts:NOW,direction:'LONG',campaign_receipt_id:resealed.persistence.receipt_id};
  const r=buildProspectiveEntryAreaSample({decision_summary:decision,campaign_proof:resealed,observed_ts:NOW+1000});
  assert.equal(r.reason,'RETROSPECTIVE_OR_FUTURE_ANCHOR_FORBIDDEN');
});

test('restart with existing activation is idempotent and does not rewrite activation state', async()=>{
  const activationTs=NOW-60_000;
  const db=new MockDb(({op,sql})=>{
    if(op==='first'&&sql.includes('tz101_entry_area_calibration_state')) return {state_key:R820_ENTRY_ACTIVATION_KEY,status:'PROSPECTIVE_COLLECTION_ACTIVE_NOT_VALIDATED',updated_ts:activationTs};
    if(op==='first'&&sql.includes('FROM v3_early_outcome_journal')) return null;
    if(op==='all'&&sql.includes('FROM final_decision_integration_shadow')) return {results:[]};
    if(op==='all'&&sql.includes('WITH horizons')) return {results:[]};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,100));
  });
  const r=await runR820ProspectiveValidationSidecar(db,{current_scan_ts:NOW,now_ts:NOW,source_run_id:'RESTART1'});
  assert.equal(r.status,'CLOSED');
  assert.equal(r.activation.created,false);
  assert.equal(r.entry_sample.status,'CLOSED_NO_CAPTURABLE_DECISION');
  assert.equal(r.entry_outcome.status,'CLOSED_NO_DUE_ENTRY_OUTCOME');
  assert.equal(db.calls.some(x=>x.op==='run'&&x.sql.includes('tz101_entry_area_calibration_state')),false);
});

test('Early outcome compare-and-set deduplicates concurrent/retry closure', async()=>{
  const first=NOW-2*60*60_000,target=first+60*60_000;
  const task={outcome_id:'W1:H1',wave_id:'W1',contract_code:'TEST-USDT',direction_hint:'LONG',first_seen_ts:first,horizon_hours:1,target_ts:target,outcome_status:'PENDING',first_seen_context_json:JSON.stringify({first_seen_price:100}),computed_ts:null,shadow_only:1};
  const scans=[{ts:first,payload_json:payload(first,'TEST-USDT',100)},{ts:target,payload_json:payload(target,'TEST-USDT',102)}];
  const db=new MockDb(({op,sql})=>{
    if(op==='first'&&sql.includes('FROM v3_early_outcome_journal')) return task;
    if(op==='all'&&sql.includes('FROM scan_runs')) return {results:scans};
    if(op==='run'&&sql.includes('UPDATE v3_early_outcome_journal')) return {meta:{changes:0}};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
  });
  const r=await closeOneEarlyDiscoveryOutcome(db,{current_scan_ts:target,now_ts:target+1});
  assert.equal(r.status,'DEDUPLICATED');
  assert.equal(r.closed,0);
  const update=db.calls.find(x=>x.op==='run');
  assert.match(update.sql,/computed_ts IS NULL/);
  assert.match(update.sql,/outcome_status='PENDING'/);
});

test('entry sample and outcome inserts are insert-or-ignore idempotent', async()=>{
  const proof=validProof();
  const row={decision_id:'FD1',snapshot_id:'S1',contract_code:'TEST-USDT',direction:'LONG',campaign_receipt_id:proof.persistence.receipt_id,observation_ts:NOW,persisted_ts:NOW,decision_status:'SHADOW_EVALUATED',shadow_only:1,live_probability:null,validated_signal:0,execution_authorized:0,telegram_eligible:0,receipt_json:JSON.stringify(proof)};
  const captureDb=new MockDb(({op,sql})=>{
    if(op==='all'&&sql.includes('FROM final_decision_integration_shadow')) return {results:[row]};
    if(op==='run'&&sql.includes('INSERT OR IGNORE INTO tz101_entry_area_calibration_signal')) return {meta:{changes:0}};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
  });
  const c=await captureOneEntryAreaSample(captureDb,{activation_ts:NOW-10_000,now_ts:NOW+1000});
  assert.equal(c.status,'DEDUPLICATED');
  assert.equal(c.captured,0);

  const sample=buildProspectiveEntryAreaSample({decision_summary:{decision_id:'FD1',snapshot_id:'S1',contract_code:'TEST-USDT',observation_ts:NOW,direction:'LONG',campaign_receipt_id:proof.persistence.receipt_id},campaign_proof:proof,observed_ts:NOW+1000});
  const target=NOW+60*60_000;
  const due={sample_id:sample.sample_id,decision_id:'FD1',contract_code:'TEST-USDT',direction:'LONG',observed_ts:NOW,sample_json:JSON.stringify(sample.sample),material_digest:sample.material_digest,horizon_hours:1,target_ts:target};
  const outcomeDb=new MockDb(({op,sql})=>{
    if(op==='all'&&sql.includes('WITH horizons')) return {results:[due]};
    if(op==='all'&&sql.includes('FROM scan_runs')) return {results:[{ts:NOW,payload_json:payload(NOW,'TEST-USDT',100)},{ts:target,payload_json:payload(target,'TEST-USDT',102)}]};
    if(op==='run'&&sql.includes('INSERT OR IGNORE INTO tz101_entry_area_calibration_outcome')) return {meta:{changes:0}};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
  });
  const o=await closeOneEntryAreaOutcome(outcomeDb,{current_scan_ts:target,activation_ts:NOW-10_000,now_ts:target+1000});
  assert.equal(o.status,'DEDUPLICATED');
  assert.equal(o.closed,0);
});

test('missing entry-area migration fails closed without promoting any signal', async()=>{
  const db=new MockDb(()=>{ throw new Error('D1_BRIDGE_FAILURE:no such table: tz101_entry_area_calibration_state'); });
  const r=await runR820ProspectiveValidationSidecar(db,{current_scan_ts:NOW,now_ts:NOW,source_run_id:'MISSING'});
  assert.equal(r.status,'MIGRATION_REQUIRED');
  assert.equal(r.live_probability,null);
  assert.equal(r.validated_signal,false);
  assert.equal(r.trading_execution,false);
});

test('sidecar budget guard fails closed when measured reads exceed technical envelope', async()=>{
  class BudgetDb extends MockDb {
    constructor(handler){super(handler);this.snap=0;}
    usageSnapshot(){
      this.snap++;
      if(this.snap===1) return {requests:0,rows_read:0,rows_written:0,unknown_ops:0};
      return {requests:5,rows_read:1201,rows_written:0,unknown_ops:0};
    }
  }
  const db=new BudgetDb(({op,sql})=>{
    if(op==='first'&&sql.includes('tz101_entry_area_calibration_state')) return {state_key:R820_ENTRY_ACTIVATION_KEY,status:'PROSPECTIVE_COLLECTION_ACTIVE_NOT_VALIDATED',updated_ts:NOW-60_000};
    if(op==='first'&&sql.includes('FROM v3_early_outcome_journal')) return null;
    if(op==='all'&&sql.includes('FROM final_decision_integration_shadow')) return {results:[]};
    if(op==='all'&&sql.includes('WITH horizons')) return {results:[]};
    throw new Error('UNEXPECTED:'+op+':'+sql.slice(0,80));
  });
  const r=await runR820ProspectiveValidationSidecar(db,{current_scan_ts:NOW,now_ts:NOW,source_run_id:'BUDGET'});
  assert.equal(r.status,'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED');
  assert.equal(r.usage_delta.rows_read,1201);
  assert.equal(r.validated_signal,false);
});
