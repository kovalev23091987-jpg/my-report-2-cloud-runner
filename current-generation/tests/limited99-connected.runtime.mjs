import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,prefix='checkpoints/limited99-connected-20261021';
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,d)=>fs.writeFileSync(path.join(output,n),JSON.stringify(d,null,2)+'\n');
const files=(root,rel='')=>fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(root,path.join(rel,x.name)):[path.join(rel,x.name)]).sort();
test('ONE NEW owner-approved limited99 exact6 UNKNOWN whole reporting chain',async()=>{
 assert.ok(runtime&&output);fs.mkdirSync(output,{recursive:true});const plan=JSON.parse(fs.readFileSync(path.join(repo,prefix,'qualification-plan.json')));assert.equal(plan.semantic_status,'UNEXECUTED');
 assert.equal(execFileSync('git',['rev-parse','HEAD^'],{cwd:repo,encoding:'utf8'}).trim(),plan.baseline_git_commit);
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-limited99-')),baseline=path.join(temporary,'baseline'),originalFetch=globalThis.fetch;let returned=false;const completed=[];
 globalThis.fetch=()=>{throw Error('NO_REAL_NATIVE_PROVIDER_MAIN_OR_TELEGRAM_NETWORK');};
 try{
  fs.cpSync(runtime,baseline,{recursive:true});const names=files(runtime),changed=new Map(plan.runtime_targets.map(t=>[t.runtime_relative,t]));assert.equal(changed.size,8);
  for(const t of plan.runtime_targets){assert.equal(sha(fs.readFileSync(path.join(runtime,t.runtime_relative))),t.after_sha256);const b=execFileSync('git',['show',plan.baseline_git_commit+':'+t.baseline_git_path],{cwd:repo,maxBuffer:8*1024*1024});assert.equal(sha(b),t.before_sha256);fs.writeFileSync(path.join(baseline,t.runtime_relative),b);}
  assert.deepEqual(files(baseline),names);const unchanged={};
  for(const f of names){const before=sha(fs.readFileSync(path.join(baseline,f))),after=sha(fs.readFileSync(path.join(runtime,f)));if(changed.has(f))assert.equal(before,changed.get(f).before_sha256);else{assert.equal(before,after,f);unchanged[f]=after;}}
  write('baseline-binding.json',{actual_full_assembled_runtime:true,baseline_location:'UNIQUE_OS_TEMP_OUTSIDE_ARTIFACT',baseline_git_commit:plan.baseline_git_commit,baseline_bytes:'LOCAL_EXACT_GIT_PARENT_NO_NETWORK',changed:plan.runtime_targets,unchanged_files:unchanged});
  // NEW caller-shape boundary: production supplies every catalogue row, not only the99 approved market fixtures.
  // Only source metadata/classification is ACTUAL; CLOSED market-data flags below remain CONTROLLED.
  const sourcePrefix='checkpoints/source-worker-exact-six-unknown-limited-20261021',sourceInput=JSON.parse(fs.readFileSync(path.join(repo,sourcePrefix,'source-input.json'))),catalogBytes=gunzipSync(fs.readFileSync(path.join(repo,sourcePrefix,'catalog395878.parsed.json.gz')));assert.equal(sha(catalogBytes),sourceInput.parsed_sha256);
  const catalog=JSON.parse(catalogBytes),worker=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8'),begin=worker.indexOf('function classifyHtxInstrumentScope(info) {'),end=worker.indexOf('function symbolFingerprint(',begin);assert(begin>=0&&end>begin);
  const classify=new Function('return ('+worker.slice(begin,end).trim()+');')(),helper=await import(pathToFileURL(path.join(runtime,'src/approved-htx-analysis-scope.mjs')).href),approved=new Set(helper.APPROVED_HTX_ANALYSIS_CONTRACTS.map(r=>r.contract_code)),counts={};
  const allRows=catalog.data.map(row=>{const instrument_scope=classify(row);counts[instrument_scope.classification]=(counts[instrument_scope.classification]||0)+1;return{contract_code:row.contract_code,symbol:row.symbol,instrument_scope,data_status:approved.has(row.contract_code)?'CLOSED':null};});
  const caller=helper.bindApprovedHtxAnalysisScope(allRows,{observed_ts:sourceInput.evaluation_ts,include_native_availability_diagnostic:true,allow_owner_limited_six_unknown:true,native_catalog:{ok:true,http_status:200,url:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',observed_ts:sourceInput.observed_ts,data:catalog,classify}});
  const callerResult={schema:'FIRST_NEW_ACTUAL_ALL_CATALOG_CALLER_SHAPE_V1',actual_parsed_catalog_sha256:sourceInput.parsed_sha256,catalog_rows:allRows.length,classifications:counts,approved_accepted:caller.audit.accepted_analysis_contracts,full_scope_status:caller.audit.status,limited_admitted:helper.approvedHtxLimitedReportAdmitted(caller.audit),outside_approved:caller.audit.outside_approved_crypto_contracts,market_status_flags:'CONTROLLED_CLOSED_ONLY_FOR_APPROVED_PRESENT_CONTRACTS_NO_MARKET_NUMBERS',provider_HTTP:0,native_SQL:0};write('actual-catalog-caller-shape.json',callerResult);
  assert.equal(allRows.length,388);assert.equal(counts.UNKNOWN_FAIL_CLOSED||0,0);assert.equal(callerResult.approved_accepted,99);assert.equal(callerResult.full_scope_status,'NOT_CLOSED');assert.equal(callerResult.limited_admitted,true);completed.push('actual_all_catalog_caller_shape');
  const module=await import(pathToFileURL(path.join(repo,plan.callable.path)).href),result=await module[plan.callable.entry]({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo});
  write('limited-result.json',result);returned=true;
  assert.equal(result.status,plan.callable.expected_status);assert.equal(result.control_count,plan.callable.expected_CONTROLLED_groups);
  write('result.json',{status:'PASS',new_common_cases:1,completed_components:[...completed,'limited99'],CONTROLLED_groups:1+result.control_count,Node_version:process.version,old_accepted_components_replayed:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_cost_or_actual_Telegram_restoration_qualified:false});
 }catch(error){write('failure-context.json',{completed_components:completed,returned_component_artifact:returned?'limited-result.json':null,error:String(error),stack:error.stack,completed_new_control_groups:error.completed_new_CONTROLLED_groups??error.completed_new_control_groups??null});throw error;}
 finally{globalThis.fetch=originalFetch;fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
