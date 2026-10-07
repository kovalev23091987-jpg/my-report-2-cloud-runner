import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {BLOCK_WEIGHT_CUTOVER as T,BLOCK_WEIGHT_VERSION as V,resolveBlockCap,validBlockWeightPolicy,blockPolicyDigest} from '../files/src/block-score-policy.mjs';
import {consumeEvidenceV2,CHAIN_CAPS} from '../files/src/evidence-v2.mjs';
import {buildSupplementalScoreEvidence,applySupplementalScoreAdjustment} from '../files/src/supplemental-score-evidence.mjs';
import {deriveWeeklyBlockWeightPolicy,normalizeBlockCalibrationRows,refreshWeeklyBlockWeightPolicy,loadBlockWeightPolicy} from '../files/src/block-weight-calibration.mjs';
import {installEvidenceSourceStore} from '../files/src/evidence-source-store.mjs';
const D=86400000;
const row=(block='N15',delta={})=>({evidence_id:'E-'+block,asset_id:'asset:sol',htx_contract:'SOL-USDT',block_id:block,metric_family:'CONTROLLED_TEST',provider_id:'P',upstream_id:'U',origin_event_id:'O-'+block,dependency_group:'D-'+block,observed_ts:T,source_ts:T,first_known_ts:T,coverage_status:'COMPLETE',coverage_fraction:1,identity_status:'EXACT',finality_status:'FINAL',schema_version:'v1',validation_status:'VALID',expires_at:T+10000,reliability:.8,directional_strength:1,...delta});
test('useful measured blocks receive more of the existing envelope; sparse, neutral and invalid facts do not',()=>{
 const strong=row(),opts={base_interest:70,decision_ts:T+1};
 assert.equal(consumeEvidenceV2([strong],{...opts,weight_policy_version:'LEGACY'}).adjustment,.48);
 assert.equal(consumeEvidenceV2([strong],opts).adjustment,1.6);
 assert.equal(consumeEvidenceV2([row('N12',{coverage_fraction:.08})],opts).adjustment,.0384);
 assert.equal(consumeEvidenceV2([row('N05',{directional_strength:null,risk_strength:null})],opts).adjustment,0);
 for(const bad of [{expires_at:T-1},{identity_status:'TICKER_ONLY'},{first_known_ts:T+2},{source_ts:T+2}])assert.equal(consumeEvidenceV2([row('N15',bad)],opts).adjustment,0);
 const context={decision_ts:T+1,evidence_v2:{evidence:[strong]}};
 const long=applySupplementalScoreAdjustment(70,buildSupplementalScoreEvidence({direction:'LONG',internal_market_context:context}));
 const short=applySupplementalScoreAdjustment(70,buildSupplementalScoreEvidence({direction:'SHORT',internal_market_context:context}));
 assert.equal(long.final_score,72);assert.equal(short.final_score,68);assert.equal(long.receipts[0].block_weight.cap,2);
});
test('duplicate sources and many events cannot exceed block/family caps; original clock remains legacy',()=>{
 const rows=Array.from({length:20},(_,i)=>row('N15',{evidence_id:'E'+i,origin_event_id:'O'+i}));
 const out=consumeEvidenceV2([...rows,...rows],{base_interest:70,decision_ts:T+1});assert.equal(out.adjustment,2);assert.equal(out.threshold_unchanged,70);
 const mixed=consumeEvidenceV2(['N05','N11','N12','N15','N01','N02','N03','N04','N14'].map(b=>row(b)),{base_interest:70,decision_ts:T+1});
 for(const [id,amount] of Object.entries(mixed.family_contributions))assert.ok(Math.abs(amount)<=CHAIN_CAPS[id]);assert.ok(Math.abs(mixed.adjustment)<=10);
 assert.equal(resolveBlockCap(row(),{decision_ts:T-1}).cap,.6);
});
function sample(i,sign=1){
 const ts=T-120*D+i*3*3600000,feature=((i*37)%101-50)/62.5;
 const features=Object.fromEntries(['N01','N02','N03','N04','N05','N06','N07','N11','N12','N14','N15'].map(id=>[id,id==='N05'?feature:0]));
 const observed=Object.fromEntries(Object.keys(features).map(id=>[id,id==='N05']));
 const a={schema:'BLOCK_EX_ANTE_ATTRIBUTION_V1',contract:`COIN${i%24}-USDT`,direction:i%2?'SHORT':'LONG',observed_ts:ts,run_id:'R'+i,snapshot_id:'S'+i,base_score:72+(i%7),weight_version:V,features,observed,cost:{status:'CLOSED_CONSERVATIVE_ANALYTICAL_COST_RESERVE',cost_pct:.1,holding_entry_ts:ts,holding_exit_ts:ts+24*3600000,fee_receipt_id:'F'+i,holding_receipt_id:'H'+i,actual_executed_profit:false},score_or_entry_changed:false};
 a.fingerprint=blockPolicyDigest(a);
 return{sample:{observed_ts:ts,contract_code:a.contract,direction:a.direction,snapshot_id:a.snapshot_id,approved_entry_only:true,one_wave_one_outcome:true,outcome_wave_key:'W'+i,block_weight_attribution:a},outcome:{horizon_hours:4,observed_ts:ts,contract_code:a.contract,direction:a.direction,computed_ts:ts+5*3600000,outcome_scan_ts:ts+4*3600000,directional_return_pct:sign*2*feature+.1,block_weight_outcome_basis:{source:'HTX_PUBLIC_HISTORY_FACTUAL_NO_INTERPOLATION',interpolation_used:false,path_coverage_pct:100}}};
}
test('small data never activates adaptation; controlled chronological association moves at most ten percent',()=>{
 const few=deriveWeeklyBlockWeightPolicy(Array.from({length:50},(_,i)=>sample(i)),{now:T});assert.ok(Object.values(few.blocks).every(r=>r.factor===1));assert.ok(validBlockWeightPolicy(few,T));
 for(const sign of [1,-1]){const data=Array.from({length:800},(_,i)=>sample(i,sign)),p=deriveWeeklyBlockWeightPolicy(data,{now:T});
  assert.equal(p.independent_samples,800);assert.equal(p.blocks.N05.factor,sign===1?1.1:.9,JSON.stringify(p.blocks.N05));assert.ok(validBlockWeightPolicy(p,T));
  const again=deriveWeeklyBlockWeightPolicy(data,{now:T+7*D,previous:p});assert.equal(again.blocks.N05.factor,p.blocks.N05.factor,'same test episodes cannot promote again');
  assert.ok(validBlockWeightPolicy({...p,cache_status:'HIT',network_calls:0},T));
  assert.equal(validBlockWeightPolicy({...p,expires_ts:T+20*D},T),false);
  const bad=structuredClone(p);bad.blocks.N05.factor=2;const{fingerprint,...body}=bad;bad.fingerprint=blockPolicyDigest(body);assert.equal(validBlockWeightPolicy(bad,T),false);
 }
});
test('normalization refuses missing costs, future outcomes, incomplete paths, clocks, duplicates and overlapping asset windows',()=>{
 const r=sample(0);assert.equal(normalizeBlockCalibrationRows([r,r],T).length,1);
 for(const mutate of [x=>x.sample.block_weight_attribution.cost=null,x=>x.outcome.computed_ts=T+1,x=>x.outcome.block_weight_outcome_basis.path_coverage_pct=90,x=>x.outcome.block_weight_outcome_basis.interpolation_used=true,x=>x.sample.approved_entry_only=false,x=>x.sample.block_weight_attribution.observed_ts++,x=>x.outcome.direction='OTHER']){const x=structuredClone(r);mutate(x);assert.equal(normalizeBlockCalibrationRows([x],T).length,0);}
});
test('weekly persisted policy is readable and assessed once; missing admission prevents all database work',async()=>{
 const sql=new DatabaseSync(':memory:');let calls=0;const db={prepare(q){calls++;return{args:[],bind(...a){this.args=a;return this;},async run(){return sql.prepare(q).run(...this.args);},async first(){return sql.prepare(q).get(...this.args)||null;},async all(){return{results:sql.prepare(q).all(...this.args)};}};},async batch(s){return Promise.all(s.map(x=>x.run()));}};
 try{await installEvidenceSourceStore(db);sql.exec('CREATE TABLE tz101_entry_area_calibration_outcome(sample_id TEXT,horizon_hours INTEGER,outcome_json TEXT,material_digest TEXT,calibration_only INTEGER,live_promotion_allowed INTEGER,computed_ts INTEGER); CREATE TABLE tz101_entry_area_calibration_signal(sample_id TEXT PRIMARY KEY,sample_json TEXT,material_digest TEXT,calibration_only INTEGER,live_promotion_allowed INTEGER,observed_ts INTEGER);');
 const admit=()=>({allowed:true}),first=await refreshWeeklyBlockWeightPolicy(db,{now:T,admit});assert.equal(first.status,'WEEKLY_BLOCK_POLICY_ASSESSED',JSON.stringify(first));assert.equal(first.independent_samples,0);
 const p=await loadBlockWeightPolicy(db,{now:T+1,admit});assert.ok(p);assert.ok(Object.values(p.blocks).every(r=>r.factor===1));
 const second=await refreshWeeklyBlockWeightPolicy(db,{now:T+1,admit});assert.equal(second.status,'WEEKLY_POLICY_ALREADY_ASSESSED');const n=calls;
 assert.equal((await refreshWeeklyBlockWeightPolicy(db,{now:T,admit:()=>({allowed:false})})).status,'BLOCK_STATS_BUDGET_DEFERRED');assert.equal(calls,n);
 }finally{sql.close();}
});
