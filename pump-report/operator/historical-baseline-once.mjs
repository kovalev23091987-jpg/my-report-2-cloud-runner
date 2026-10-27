import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
let currentCase='PREFLIGHT',failurePath=null;
const fail=error=>{if(failurePath)fs.writeFileSync(failurePath,JSON.stringify({message:error.message,stack:error.stack,actual:error.actual,expected:error.expected},null,2)+'\n',{flag:'wx',mode:0o600});console.error(JSON.stringify({status:'FAILED_BASELINE_NO_CURRENT_DELIVERY',case_id:currentCase,code:error.code??'BASELINE_FAILED',details_private:Boolean(failurePath)}));process.exit(1);};
process.on('uncaughtException',fail);process.on('unhandledRejection',fail);
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),lease=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_BASELINE_REFERENCE');assert.equal(a.max_cases,4);assert.equal(a.max_engine_calls,4);
assert.ok(Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts&&lease.owner===a.own_lease.owner&&!lease.released);
assert.equal(sha(fs.readFileSync(import.meta.filename)),a.operator_sha256);
const manifestBytes=fs.readFileSync(a.input_manifest);assert.equal(sha(manifestBytes),a.input_manifest_sha256);const manifest=JSON.parse(manifestBytes);
assert.equal(manifest.cases.length,4);
const artifactBytes=fs.readFileSync(a.baseline_artifact);assert.equal(sha(artifactBytes),a.baseline_artifact_sha256);const artifact=JSON.parse(artifactBytes);
assert.equal(artifact.manifest.implementation_pin.sha256,a.baseline_pin);assert.equal(artifact.manifest.module_count,72);
const privateRoot=path.resolve('pump-report/.private')+path.sep;
for(const p of [a.private_output,a.graph_directory])assert.ok(path.resolve(p).startsWith(privateRoot));
failurePath=a.private_output+'.failure.json';
const buffers=new Map();
for(const c of manifest.carriers){const b=fs.readFileSync(c.path);assert.equal(b.length,c.bytes);assert.equal(sha(b),c.sha256);assert.ok(fs.realpathSync(c.path).startsWith(privateRoot));buffers.set(c.path,b);}
const pointer=(o,p)=>p.slice(1).split('/').reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],o);
function extract(c,field){const b=buffers.get(c.carrier_path),d=c[field],slice=b.subarray(d.byte_offset,d.byte_offset+d.byte_length);assert.equal(sha(slice),d.slice_sha256);const value=JSON.parse(slice.toString('utf8'));assert.deepEqual(value,pointer(JSON.parse(b.toString('utf8')),d.json_pointer));return value;}
const prepared=manifest.cases.map(c=>({c,input:extract(c,'input'),original:extract(c,'original_object'),saved:extract(c,'saved_analysis')}));
fs.writeFileSync(a.proof_path+'.attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main,max_engine_calls:4}),{flag:'wx',mode:0o600});
fs.mkdirSync(a.graph_directory,{mode:0o700});
for(const [name,text]of Object.entries(artifact.modules)){const p=path.resolve(a.graph_directory,name);assert.ok(p.startsWith(path.resolve(a.graph_directory)+path.sep));fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,text,{flag:'wx',mode:0o600});}
const {analyzePump}=await import(pathToFileURL(path.resolve(a.graph_directory,'analytics/index.mjs'))),{START_PROFILE}=await import(pathToFileURL(path.resolve(a.graph_directory,'profile/start-v1.mjs')));
const privateResults=[],results=[];let calls=0;
for(const {c,input,original,saved}of prepared){
 currentCase=c.case_id;
 assert.equal(input.analysis_ts,c.original_analysis_ts);assert.equal(original.evidence_class,'OBSERVED');assert.equal(original.implementation_sha256,c.original_implementation_sha256);
 assert.deepEqual(original.input,input);assert.deepEqual(original.analysis,saved);assert.equal('pump:analysis:'+sha(JSON.stringify(saved)),c.analysis_key);
 const before=JSON.stringify(input),checked=analyzePump(input,START_PROFILE);calls++;assert.equal(JSON.stringify(input),before);
 for(const k of ['ready','status','automatic_eligible','wave_state','current_threshold_passed'])assert.deepEqual(checked[k],saved[k],c.case_id+':'+k);
 assert.deepEqual(checked.reasons,saved.reasons,c.case_id+':reasons');assert.equal(checked.analysis_ts,input.analysis_ts);assert.equal(checked.reference_price,saved.reference_price);assert.equal(checked.instrument.instrument_id,c.instrument_id);
 assert.equal(Boolean(checked.plan),Boolean(saved.plan));
 if(checked.ready){assert.ok(checked.plan.potential_pct.minimum>=10);assert.equal(checked.liquidity.status,'USABLE');assert.ok(checked.card_text&&checked.card_text.length<=4096);assert.deepEqual(checked.plan.entry_zones,saved.plan.entry_zones,c.case_id+':entries');assert.deepEqual(checked.plan.exit_zone,saved.plan.exit_zone,c.case_id+':exit');}
 let historicalReceipt=false;
 if(c.saved_card){const card=extract(c,'saved_card');assert.equal(card.state,'SENT');assert.equal(String(card.message_id),'241');assert.equal(card.analysis.source_input_key,c.analysis_key);assert.equal(card.text,saved.card_text);assert.equal(sha(card.text),card.text_hash);assert.equal(card.receipt.text_hash,card.text_hash);assert.equal(card.receipt.card_id,card.card_id);assert.equal(String(card.receipt.recipient),String(card.recipient));historicalReceipt=true;}
 privateResults.push({case_id:c.case_id,input_slice_sha256:c.input.slice_sha256,input,original,saved_analysis:saved,baseline_analysis:checked});
 results.push({case_id:c.case_id,status:'PASS',ready:checked.ready,automatic_eligible:checked.automatic_eligible,wave_state:checked.wave_state,reasons:checked.reasons,original_T0_and_reference_price_unchanged:true,input_unchanged:true,plan_geometry_matches_saved:checked.ready?true:null,minimum_potential_pct:checked.plan?.potential_pct?.minimum??null,historical_manual_241_receipt_binding:historicalReceipt,current_live_SENT_proven:false});
}
assert.equal(calls,4);for(const c of manifest.carriers)assert.equal(sha(fs.readFileSync(c.path)),c.sha256);
const privateValue={schema:'PUMP_HISTORICAL_BASELINE_REFERENCE_V1',run_purpose:'ACCEPTANCE_TEST',baseline_pin:a.baseline_pin,baseline_artifact_sha256:a.baseline_artifact_sha256,input_manifest_sha256:a.input_manifest_sha256,cases:privateResults,actual_IO:0};
fs.writeFileSync(a.private_output,JSON.stringify(privateValue,null,2)+'\n',{flag:'wx',mode:0o600});
const result={schema:'PUMP_HISTORICAL_BASELINE_PUBLIC_RESULT_V1',status:'PASS_BASELINE_ONLY_NOT_CANDIDATE_APPROVAL',authority_main:a.authority_main,baseline_pin:a.baseline_pin,baseline_artifact_sha256:a.baseline_artifact_sha256,input_manifest_sha256:a.input_manifest_sha256,case_count:4,engine_calls:calls,cases:results,private_results_sha256:sha(fs.readFileSync(a.private_output)),market_HTTP:0,native_SQL:0,Telegram:0,source_clocks_not_retimed:true,deployed:false,candidate_approval:false,completed_ts:Date.now()};
fs.writeFileSync(a.proof_path,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));
