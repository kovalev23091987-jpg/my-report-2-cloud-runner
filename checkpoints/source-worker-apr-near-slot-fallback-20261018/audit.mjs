import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {attributeSharedN05N12Http} from '../../current-generation/files/src/candidate-evidence-v2-runtime.mjs';
import {reconcileExplicitTransport} from './reconcile-reference.mjs';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const archive='checkpoints/private-price-witness-repair-20261018/natural-39133840839-12138787149.zip';
const archiveHash='91e315ecaf015fff224cfa828caf79b6c39e921e20d0695a3ef40ad4fb1d66cc';
assert.equal(hash(readFileSync(resolve(root,archive))),archiveHash);
const members=JSON.parse(execFileSync('python3',['-c',`import zipfile,json,sys,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 out={}
 for name in ['report2-run-result.json','report2-completion-accounting.json']:
  matches=[p for p in z.namelist() if p.split('/')[-1]==name]
  assert len(matches)==1
  b=z.read(matches[0]);out[name]={'sha256':hashlib.sha256(b).hexdigest(),'value':json.loads(b)}
 print(json.dumps(out))`,resolve(root,archive)],{maxBuffer:4*1024*1024}).toString());
assert.equal(members['report2-run-result.json'].sha256,'a8129fe2d7e130cdd0a35cb045f879f90458833a82bf5d930ab3591b46a2d9d1');
assert.equal(members['report2-completion-accounting.json'].sha256,'08dd8196b50853fb1b598be004f295c92ee180779553937dc54092b0090a3452');
const source=members['report2-run-result.json'].value;
assert.equal(source.head,'998020c564e0ff1d81046150df00d9ca2b1aedfe');
const saved=source.candidates.map(c=>{
 assert.ok(['APR-USDT','NEAR-USDT'].includes(c.contract));
 const check=c.block_coverage.blocks.N05.source_checks.EXTERNAL_N05_FLOW;
 const priority=c.source_collection_priority.public_venues;
 const split=c.block_coverage.shared_n05_n12_http_attribution;
 assert.equal(check.network_calls,5);assert.equal(split.total_http,5);
 assert.equal(split.n05_http+split.n12_http,5);assert.equal(check.receipts.length,8);
 assert.ok(check.receipts.every(r=>r.route===null&&r.http_status===200&&r.status==='RECEIVED_NOT_QUALIFIED'));
 return{contract:c.contract,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,
  collector_queue:priority.ordered_collectors,queue_is_not_endpoint_attempt_trace:true,
  captured_split:split,split_accepted_at_its_original_scope_not_reaudited:true,
  receipts:{reported_count:check.receipt_count,retained_count:check.receipts.length,omitted_count:check.receipt_count-check.receipts.length,
   retained_routes:check.receipts.map(r=>r.route),retained_statuses:[...new Set(check.receipts.map(r=>r.status))],
   missing_per_receipt_fields:['actual_http','received_ts','cache_status','url_or_safe_endpoint_id','market','kind','body_sha256','logical_request_id'],
   first_eight_200s_are_not_eight_new_HTTP:true},
  exact_N05_per_route_transport:null,exact_endpoint_attempt_order:null,caller_reserved_requests:null,
  skipped_N12_market_reasons_not_in_compact_projection:true,
  source_order_change_authorized_by_this_audit:false,
  provider_failure_inferred_from_caller_cap:false};
});
assert.deepEqual(saved.map(r=>r.contract),['APR-USDT','NEAR-USDT']);
assert.deepEqual(saved.map(r=>r.receipts.omitted_count),[10,7]);
const corrupted={
 MISSING_N05_DETAIL:{network_calls:5,adapter_results:[{venue:'OKX_N12_NATIVE',network_calls:2}]},
 NULL_N12_HTTP:{network_calls:5,adapter_results:[{venue:'BINANCE',network_calls:3},{venue:'OKX_N12_NATIVE',network_calls:null}]},
 NEGATIVE_N05_HTTP:{network_calls:5,adapter_results:[{venue:'BINANCE',network_calls:-10},{venue:'OKX_N12_NATIVE',network_calls:2}]},
 DUPLICATE_VENUE:{network_calls:5,adapter_results:[{venue:'OKX_N12_NATIVE',network_calls:1},{venue:'OKX_N12_NATIVE',network_calls:1}]},
 STRING_TOTAL:{network_calls:'5',adapter_results:[{venue:'BINANCE',network_calls:3},{venue:'OKX_N12_NATIVE',network_calls:2}]},
 OVER_FIVE:{network_calls:6,adapter_results:[{venue:'BINANCE',network_calls:4},{venue:'OKX_N12_NATIVE',network_calls:2}]},
};
const current=Object.entries(corrupted).map(([name,input])=>{
 const output=attributeSharedN05N12Http(input);assert.equal(output.status,'RECONCILED_ADAPTER_TRANSPORT');
 return{name,input,actual_current_helper_output:output,controlled_not_observed_in_saved_run:true};
});
const base={network_calls:5,flow_network_calls:5,baseline_transport_HTTP:0,observed_transport_HTTP:5,caller_reserved_requests:5,
 adapter_results:[{venue:'BINANCE',network_calls:3},{venue:'OKX_N12_NATIVE',network_calls:2}]};
const controls=[];
function control(name,input,accepted){const out=reconcileExplicitTransport(input);assert.equal(out.status==='RECONCILED_ADAPTER_TRANSPORT',accepted,name);if(!accepted){assert.equal(out.n05_http,null);assert.equal(out.n12_http,null);}assert.equal(out.admission_authorized,false);controls.push({name,input,output:out});}
control('EXPLICIT_MEASURED_FIVE',base,true);
control('OPTIONAL_BASELINE_IS_EXPLICIT_AND_DISJOINT',{...base,flow_network_calls:4,baseline_transport_HTTP:1,adapter_results:[{venue:'BINANCE',network_calls:2},{venue:'OKX_N12_NATIVE',network_calls:2}]},true);
control('ZERO_TRANSPORT_WITH_SPENT_GRANTS',{...base,network_calls:0,flow_network_calls:0,observed_transport_HTTP:0,adapter_results:base.adapter_results.map(r=>({...r,network_calls:0}))},true);
for(const [name,input] of Object.entries(corrupted))control(name,{...base,...input},false);
for(const value of [undefined,null,-1,0.5,'2',NaN])control('INVALID_N12_'+String(value),{...base,adapter_results:[base.adapter_results[0],{venue:'OKX_N12_NATIVE',network_calls:value}]},false);
for(const [field,value] of [['baseline_transport_HTTP',null],['flow_network_calls',4],['observed_transport_HTTP',4],['caller_reserved_requests',4],['caller_reserved_requests',null]])control('INVALID_'+field+'_'+String(value),{...base,[field]:value},false);
control('UNEXPLAINED_RESIDUAL_NOT_BASELINE',{...base,flow_network_calls:4,adapter_results:[{venue:'BINANCE',network_calls:2},{venue:'OKX_N12_NATIVE',network_calls:2}]},false);
control('UNKNOWN_ROUTE_NO_INFERRED_N05',{...base,adapter_results:[{venue:'UNCLASSIFIED',network_calls:3},base.adapter_results[1]]},false);
control('MISSING_ADAPTERS',{...base,adapter_results:undefined},false);
const codePaths=['current-generation/files/src/external-n05-flow-collector.mjs','current-generation/files/src/candidate-evidence-v2-runtime.mjs',
 'current-generation/files/src/public-venue-source-priority.mjs','current-generation/files/src/gate-flow-collector.mjs',
 'current-generation/files/src/backpack-flow-collector.mjs','current-generation/files/src/bitget-flow-collector.mjs',
 'current-generation/files/src/n12-native-public-trade-collector.mjs','current-generation/tests/active-market-coverage-expansion.test.mjs'];
const output={schema:'SAVED_APR_NEAR_SLOT_FALLBACK_GAP_AUDIT_V1',working_base:'03fafed3ef85e2e58f141b0fe6070fe3579a4490',
 original:{cloud_run:'39133840839',artifact_id:'12138787149',archive,sha256:archiveHash,member_sha256:Object.fromEntries(Object.entries(members).map(([k,v])=>[k,v.sha256])),source_head:source.head,run_id:source.run_id},
 inspected_code_sha256:Object.fromEntries(codePaths.map(p=>[p,hash(readFileSync(resolve(root,p)))])),saved,
 current_helper_new_controlled_defects:current,reference_proposal_controls:controls,reference_control_count:controls.length,
 no_actual_wrong_saved_cost_claim:true,no_source_reordering_from_incomplete_trace:true,
 no_full_canonical_or_raw_provider_body_reconstruction:true,
 no_new_HTTP_SQL_delivery_or_actual_coverage:true,production_files_modified:false};
const target=process.argv[2]||resolve(dir,'analysis.json');
writeFileSync(target,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',saved_contracts:saved.length,new_current_helper_cases:current.length,reference_controls:controls.length,output:target}));
