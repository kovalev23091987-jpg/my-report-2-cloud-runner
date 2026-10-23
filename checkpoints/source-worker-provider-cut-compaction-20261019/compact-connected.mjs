// Callable component for ONE new central affected case. No test registration,
// top-level runtime import, output writes, provider transport or database work.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};

export async function runProviderCaptureCompactConnected({runtime_root,runner_text,native_original_root}={}){
 const source=JSON.parse(await fs.readFile(new URL('./native-input.json',import.meta.url),'utf8'));
 const controlled=JSON.parse(await fs.readFile(new URL('./controlled-additions.json',import.meta.url),'utf8'));
 const target=JSON.parse(await fs.readFile(new URL('./proposal-target.json',import.meta.url),'utf8'));
 const src=path.basename(runtime_root)==='src'?path.resolve(runtime_root):path.resolve(runtime_root,'src');
 const modulePath=path.join(src,'run-budget-context.mjs');
 assert.equal(hash(await fs.readFile(modulePath)),target.after_sha256,'exact assembled V2 capture required');
 assert.equal(hash(await fs.readFile(new URL('./baseline-run-budget-context.mjs',import.meta.url))),target.before_sha256);
 const nativeRoot=path.resolve(native_original_root);
 let completionPath=path.join(nativeRoot,'report2-completion-accounting.json');
 try{await fs.access(completionPath);}catch{completionPath=path.join(nativeRoot,'report2-run-result','report2-completion-accounting.json');}
 const body=await fs.readFile(completionPath);
 assert.equal(hash(body),source.source_completion_sha256);
 const completion=JSON.parse(body),nativeFrame=completion.existing_run_budget_context.technical_provider_receipt_observations;
 assert.deepEqual(nativeFrame,source.original_frame);
 assert.equal(nativeFrame.status,'OVERFLOW');assert.equal(nativeFrame.events.length,16);
 assert.equal(nativeFrame.overflow_observations,2);assert.equal(nativeFrame.invalid_observations,0);assert.equal(nativeFrame.foreign_run_omitted,0);
 assert.equal(source.native_omitted_reconstructed,false);
 assert.equal(source.native_omitted_values,null);assert.equal(source.native_omitted_timestamps,null);
 assert.equal(controlled.classification,'CONTROLLED_ONLY_NOT_RECONSTRUCTED_NATIVE_OMISSIONS');
 assert.equal(controlled.native_omitted_recovered,0);assert.equal(controlled.events.length,2);
 const saved=freeze(nativeFrame.events),model=freeze([...saved,...controlled.events]);
 const savedBefore=JSON.stringify(saved),modelBefore=JSON.stringify(model);
 const old=await import(new URL('./baseline-run-budget-context.mjs',import.meta.url));
 const current=await import(pathToFileURL(modulePath).href);
 const replay=(factory,rows)=>{let clock=0;const capture=factory({clock:()=>clock});for(const row of rows){clock=row.captured_ts;capture.observe(row);}return capture;};
 const flatten=frame=>{
  assert.equal(frame.schema,'EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V2');
  const out=[];
  for(const record of frame.records){
   const{cuts,...identity}=record;
   for(const values of cuts){
    assert.equal(values.length,frame.cut_columns.length);
    const cut=Object.fromEntries(frame.cut_columns.map((name,i)=>[name,values[i]]));
    const{capture_order,...rest}=cut;out.push({capture_order,row:{...identity,...rest}});
   }
  }
  return out.sort((a,b)=>a.capture_order-b.capture_order);
 };
 const bounds=frame=>{
  assert.ok(frame.records.length<=16);assert.ok(frame.records.every(record=>bytes(record)<=1024));
  assert.ok(bytes(frame)<=16384);assert.equal(frame.all_run_observations_complete,false);
  for(const k of ['provider_account_balances','month_headroom','manual_held_reserve','native_unknown_ops_at_individual_query'])assert.equal(frame[k],null);
  assert.equal(frame.future_work_admitted,false);assert.equal(frame.whole_day_closed,false);
  assert.equal(frame.serialized_copy_is_not_a_proof_token,true);assert.equal(frame.additional_SQL+frame.additional_source_HTTP,0);
 };
 // NEW data counterexample only: sixteen actual saved records plus TWO clearly
 // CONTROLLED continuations. Neither continuation reconstructs a native omission.
 const baselineCapture=replay(old.createProviderBudgetReceiptCapture,model);
 const baseline=baselineCapture.summary(source.run_id);
 assert.equal(baseline.schema,'EXISTING_PROVIDER_LEDGER_OBSERVATIONS_V1');
 assert.equal(baseline.status,'OVERFLOW');assert.equal(baseline.overflow_observations,2);
 assert.deepEqual(baseline.events,saved);
 const proposedCapture=replay(current.createProviderBudgetReceiptCapture,model);
 const proposed=proposedCapture.summary(source.run_id);bounds(proposed);
 assert.equal(proposed.status,'CAPTURED_EARLIER_QUERY_CUTS');assert.equal(proposed.records.length,6);
 assert.equal(proposed.retained_observations,18);assert.equal(proposed.overflow_observations,0);
 const expanded=flatten(proposed);assert.deepEqual(expanded.map(x=>x.capture_order),model.map((_,i)=>i));
 assert.deepEqual(expanded.slice(0,16).map(x=>x.row),saved,'all sixteen actual native values/NULL/clocks/order preserved');
 // V1 dropped these two CONTROLLED continuations; they are not native recovery.
 const normalizeControl=row=>({
  source:row.source,run_id:row.run_id,contract:row.contract,route:row.route,reference_key:row.reference_key,
  attempt_sequence:row.attempt_sequence,query_window_end_ts:row.query_window_end_ts,day_utc:row.day_utc,
  phase:row.phase,captured_ts:row.captured_ts,provider:row.provider??null,row_presence:row.row_presence??null,
  reported_used_units:row.reported_used_units??null,configured_cap:row.configured_cap??null,
  reported_own_reserved_units:row.reported_own_reserved_units??null,minute_bucket:row.minute_bucket??null,
  returned_allowed:row.returned_allowed??null,returned_status:row.returned_status??null,native_usage_guard_passed:true});
 assert.deepEqual(expanded.slice(16).map(x=>x.row),controlled.events.map(normalizeControl));
 assert.equal(expanded[1].row.reported_used_units,0,'native measured zero retained');
 assert.equal(expanded[2].row.reported_used_units,null,'native absent count remains NULL');
 assert.ok(saved[14].query_window_end_ts<saved[12].query_window_end_ts&&saved[14].captured_ts>saved[12].captured_ts);
 assert.equal(expanded[14].row.captured_ts,saved[14].captured_ts,'capture order cannot be sorted by query cut');

 // Essential identity, phase and bound mutations only; no old provider/testcase.
 const seed=saved[0];
 const identityVariants=[{}, {source:'COINPAPRIKA_SECTOR'}, {run_id:'CONTROLLED_FOREIGN'}, {contract:'BR-USDT'},
  {route:'CONTROLLED_ROUTE'}, {reference_key:'REFERENCE:provider-reference-cache-v1-20261004:'+'a'.repeat(64)},
  {attempt_sequence:9}, {query_window_end_ts:seed.query_window_end_ts-1}];
 const identityRows=identityVariants.map((extra,i)=>({...seed,...extra,captured_ts:seed.captured_ts+i}));
 const isolated=replay(current.createProviderBudgetReceiptCapture,identityRows).summary(source.run_id);bounds(isolated);
 assert.equal(isolated.records.length,7);assert.equal(isolated.foreign_run_omitted,1);assert.equal(isolated.retained_observations,7);
 const other=replay(current.createProviderBudgetReceiptCapture,identityRows).summary('CONTROLLED_FOREIGN');bounds(other);
 assert.equal(other.retained_observations,1);assert.equal(other.foreign_run_omitted,7);
 const duplicateRows=[seed,{...seed,captured_ts:seed.captured_ts+1,reported_used_units:99}];
 const duplicate=replay(current.createProviderBudgetReceiptCapture,duplicateRows).summary(source.run_id);bounds(duplicate);
 assert.deepEqual(flatten(duplicate).map(x=>x.row.reported_used_units),[56,99],'repeated phase must not overwrite an earlier cut');
 assert.equal(duplicate.records.length,1);
 const invalidRows=[{...seed,day_utc:'2000-01-01'},{...seed,native_usage_guard_passed:false},
  {...seed,source:'PRIVATE'},{...seed,reference_key:'https://PRIVATE'},
  {...seed,captured_ts:seed.query_window_end_ts-1}];
 const invalid=replay(current.createProviderBudgetReceiptCapture,invalidRows).summary(source.run_id);bounds(invalid);
 assert.equal(invalid.invalid_observations,invalidRows.length);assert.equal(invalid.retained_observations,0);
 const nullable=replay(current.createProviderBudgetReceiptCapture,[{...seed,reported_used_units:'56',api_key:'PRIVATE',raw_body:'PRIVATE'}]).summary(source.run_id);bounds(nullable);
 assert.equal(flatten(nullable)[0].row.reported_used_units,null);assert.ok(!JSON.stringify(nullable).includes('PRIVATE'));
 const recordCap=replay(current.createProviderBudgetReceiptCapture,Array.from({length:17},(_,i)=>({...seed,attempt_sequence:i}))).summary(source.run_id);bounds(recordCap);
 assert.equal(recordCap.records.length,16);assert.equal(recordCap.overflow_observations,1);
 const rowCap=replay(current.createProviderBudgetReceiptCapture,Array.from({length:100},(_,i)=>({...seed,reported_used_units:i}))).summary(source.run_id);bounds(rowCap);
 assert.equal(rowCap.records.length,1);assert.ok(rowCap.overflow_observations>0);
 assert.equal(rowCap.retained_observations+rowCap.overflow_observations,100);
 const frameRows=[];for(let round=0;round<24;round++)for(let i=0;i<16;i++)frameRows.push({...seed,attempt_sequence:i,reported_used_units:round,captured_ts:seed.captured_ts+round});
 const frameCap=replay(current.createProviderBudgetReceiptCapture,frameRows).summary(source.run_id);bounds(frameCap);
 assert.equal(frameCap.records.length,16);assert.ok(frameCap.overflow_observations>0);
 assert.equal(frameCap.retained_observations+frameCap.overflow_observations,frameRows.length);
 assert.equal(JSON.stringify(saved),savedBefore);assert.equal(JSON.stringify(model),modelBefore);
 const detached=proposedCapture.summary(source.run_id);detached.records[0].cuts[0][0]=999;
 assert.equal(flatten(proposedCapture.summary(source.run_id))[0].capture_order,0);

 // Exact existing runner completion expression, without starting the runner.
 const runner=runner_text??await fs.readFile(path.join(src,'..','runner-main.mjs'),'utf8');
 const lines=runner.split('\n').filter(line=>line.startsWith('  const existingRunBudgetContext=buildRunBudgetContext('));
 assert.equal(lines.length,1);assert.equal(hash(lines[0]),target.runner_completion_line_sha256);
 const invoke=new Function('buildRunBudgetContext','cron','completed','unifiedHttpBudget','d1RunReservation','d1AfterAnalyticsLeaseRelease','d1DayAdmission','canonicalRunOutput','providerBudgetReceipts',lines[0]+'return existingRunBudgetContext;');
 const args=[{run_id:source.run_id},completion.recorded_ts,{summary:()=>null},completion.reservation,
  completion.usage_after_analytics_lease_release,completion.day_admission,{}];
 const context=invoke(current.buildRunBudgetContext,...args,proposedCapture);
 const baselineContext=invoke(old.buildRunBudgetContext,...args,baselineCapture);
 const withoutTechnical=x=>{const{technical_provider_receipt_observations,...rest}=x;return rest;};
 assert.deepEqual(withoutTechnical(context),withoutTechnical(baselineContext));
 assert.deepEqual(context.technical_provider_receipt_observations,proposed);
 assert.deepEqual(current.buildRunBudgetContext({run_id:source.run_id,provider_receipts:nativeFrame}).technical_provider_receipt_observations,nativeFrame,'historical V1 stays unchanged');
 assert.equal(current.buildRunBudgetContext({run_id:'OTHER',provider_receipts:proposed}).technical_provider_receipt_observations,null);
 for(const key of ['provider_day_month_rolling60s_headroom','manual_provider_reserve_headroom','independent_global_native_capacity'])assert.equal(context[key],null);
 assert.equal(context.admission_authorized,false);assert.equal(context.whole_day_closed,false);
 assert.deepEqual(JSON.parse(JSON.stringify(context)),context);
 const witness={schema:'NEW_PROVIDER_CAPTURE_COMPACTION_CONNECTED_CONTROLLED_WITNESS_V1',
  actual_functions_called:['assembled createProviderBudgetReceiptCapture.observe/summary','assembled buildRunBudgetContext','exact runner completion expression','saved V1 pure capture for NEW modeled counterexample'],
  original_native_status:'OVERFLOW',actual_saved_native_inputs:16,actual_omitted_native_inputs:2,
  native_omitted_values:null,native_omitted_timestamps:null,native_omitted_recovered:0,
  controlled_added_inputs:2,total_MODELED_inputs:18,modeled_baseline_overflow:baseline.overflow_observations,
  MODELED_proposed_status:proposed.status,MODELED_preserved_cuts:proposed.retained_observations,MODELED_groups:proposed.records.length,
  actual16_values_NULL_clocks_and_capture_order_equal:true,repeated_phase_preserved:true,
  exact_identity_fields_not_merged:true,invalid_foreign_and_honest_overflow_preserved:true,
  group_record_byte_sizes:proposed.records.map(bytes),technical_frame_bytes:bytes(proposed),
  frame_capacity_control:{retained:frameCap.retained_observations,overflow:frameCap.overflow_observations,bytes:bytes(frameCap)},
  bounds:{records:16,record_UTF8_bytes:1024,frame_UTF8_bytes:16384},
  source_payload_or_cache_or_canonical_mutated:false,old_context_except_technical_equal:true,V1_historical_passthrough_equal:true,
  NULL_account_month_manual_preserved:true,admission_authorized:false,
  additional_SQL:0,additional_HTTP:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,
  target_sha256:target.after_sha256,native_completion_sha256:source.source_completion_sha256,
  limits:['Sixteen actual normalized LOCAL ledger observations; two additions are CONTROLLED, never reconstructed native facts',
   'No native new V2 run/cache/persist/wire/account balance/future grant/CPU heap/day capacity qualification',
   'No source transport/reservation/SQL is called; only pure capture/context/runner completion expression',
   'All-run complete remains false even when this modeled18-call diagnostic fits']};
 assert.ok(bytes(witness)<=16384);return witness;
}
