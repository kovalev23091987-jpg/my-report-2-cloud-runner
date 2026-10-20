import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const root=process.env.REPORT2_AVAILABILITY_RUNTIME,output=process.env.REPORT2_AVAILABILITY_OUTPUT,repo=process.cwd();
const read=p=>fs.readFileSync(p,'utf8'),clone=x=>JSON.parse(JSON.stringify(x));
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');

test('ONE NEW connected native availability diagnostic through actual Stage0 caller and failure artifact',async()=>{
 assert.ok(root&&output);fs.mkdirSync(output,{recursive:true});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-availability-baseline-'));
 try{
  fs.cpSync(root,temp,{recursive:true});
  fs.copyFileSync(process.env.REPORT2_AVAILABILITY_BASELINE_HELPER,path.join(temp,'src/approved-htx-analysis-scope.mjs'));
  const source=await import(pathToFileURL(process.env.REPORT2_AVAILABILITY_COMPONENT));
  const component=await source[process.env.REPORT2_AVAILABILITY_EXPORT]({runtime_root:path.join(root,'src'),baseline_runtime_root:path.join(temp,'src'),repo_root:repo});
  write('source-component-result.json',component);
  const scope=await import(pathToFileURL(path.join(root,'src/approved-htx-analysis-scope.mjs')));
  const worker=read(path.join(root,'src/worker.js')),runner=read(path.join(root,'runner-main.mjs'));
  const start=worker.indexOf('function classifyHtxInstrumentScope(info) {'),stop=worker.indexOf('\nfunction symbolFingerprint(info)',start);
  assert.ok(start>0&&stop>start);const classifier=vm.runInNewContext(worker.slice(start,stop)+'\nclassifyHtxInstrumentScope');
  const missing=['BTR-USDT','DOS-USDT','GPS-USDT','PIPPIN-USDT','SKR-USDT','UB-USDT'];
  const rows=scope.APPROVED_HTX_ANALYSIS_CONTRACTS.filter(x=>!missing.includes(x.contract_code)).map(x=>({...x,symbol:x.asset_symbol,instrument_scope:{classification:'CRYPTO_CONFIRMED'}}));
  const now=1792480414924,received=now+2000,sourceTs=now+1000;
  const catalogRows=missing.map(contract_code=>({contract_code,symbol:contract_code.slice(0,-5),contract_status:3,business_type:'swap',contract_type:'swap',trade_partition:'USDT',labels:[],tradfi_labels:[]}));
  const catalog={ok:true,http_status:200,url:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',data:{status:'ok',ts:sourceTs,data:catalogRows}};
  const line=worker.split('\n').find(x=>x.includes('const approvedScope=bindApprovedHtxAnalysisScope(allContracts,'));
  assert.ok(line&&/include_native_availability_diagnostic\s*:\s*true/.test(line));
  let calls=0;
  const invoke=input=>vm.runInNewContext(line+'\napprovedScope',{allContracts:rows,now,contractsR:input,Date:{now:()=>received},classifyHtxInstrumentScope:r=>{calls++;return classifier(r);},bindApprovedHtxAnalysisScope:scope.bindApprovedHtxAnalysisScope});
  const accepted=invoke(catalog);assert.equal(accepted.audit.checked_analysis_contracts,105);assert.equal(accepted.audit.officially_unavailable_analysis_contracts.length,6);assert.equal(calls,6);
  const refused=invoke({...catalog,data:{...catalog.data,ts:received+1}});assert.equal(calls,6);assert.equal(refused.audit.checked_analysis_contracts,99);assert.deepEqual(refused.audit.unresolved_approved_analysis_contracts,missing);assert.equal(scope.approvedHtxScopeAccounted(refused.audit),false);
  const fields=Object.keys(refused.audit).filter(k=>k.includes('diagnostic'));assert.equal(fields.length,1);const diagnostic=refused.audit[fields[0]];assert.ok(diagnostic);
  const original=JSON.parse(read(path.join(repo,'checkpoints/natural-39385062635/report2-failure-accounting.json'))),before=JSON.stringify(original);
  const auditBefore=JSON.stringify(refused.audit),env={REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT:refused.audit,REPORT2_CURRENT_CYCLE_SELECTION_AUDIT:original.partial_cron_failure.candidate_selection_audit};
  const begin=runner.indexOf('  if (cron.status !== "SUCCESS" || cron.completed_ts == null)'),end=runner.indexOf('  console.log("CRON_IDENTITY_BINDING"',begin);assert.ok(begin>0&&end>begin);
  const reject=new Function('cron','generation','process','env','d1DayAdmission',runner.slice(begin,end));let failure;
  try{reject(clone(original.partial_cron_failure.cron),scope.APPROVED_HTX_SCOPE.generation,{env:{GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'CONTROLLED_AVAILABILITY'}},env,clone(original.partial_cron_failure.d1_day_admission));}catch(error){failure=error;}
  assert.match(failure?.message,/^CRON_IDENTITY_NOT_SUCCESS:/);
  const handlerStart=runner.indexOf('main().catch(async(error) => {'),handlerEnd=runner.lastIndexOf('\n});');assert.ok(handlerStart>0&&handlerEnd>handlerStart);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const fatal=new AsyncFunction('error','canonicalOutputForFailure','fs','markPostAnalysisControlFailure','process','console','cleanupClaimedAnalyticsLease','failedD1RunAccounting',runner.slice(handlerStart+'main().catch(async(error) => {'.length,handlerEnd));
  let finalizations=0;const writes=[],processStub={exitCode:0};
  await fatal(failure,null,{writeFile:async(name,text)=>writes.push({name,value:JSON.parse(text)})},()=>{throw Error('NO_PROMOTION');},processStub,{error(){}},null,{finalizeFailure:async()=>{finalizations++;const x=clone(original);delete x.partial_cron_failure;return x;}});
  assert.equal(finalizations,1);assert.equal(processStub.exitCode,1);assert.deepEqual(writes.map(x=>x.name),['report2-failure-accounting.json']);
  assert.deepEqual(writes[0].value.partial_cron_failure.approved_universe_audit[fields[0]],clone(diagnostic));
  assert.deepEqual(writes[0].value.usage_after,original.usage_after);assert.deepEqual(writes[0].value.receipt,original.receipt);assert.equal(JSON.stringify(original),before);assert.equal(JSON.stringify(refused.audit),auditBefore);
  write('central-connected-result.json',{status:'PASS',controls:'Actual Worker caller+classifier, six valid suspended; source-future refusal before classifier; real runner partial context and fatal artifact carrier preserve new diagnostic and exact saved costs.',diagnostic,controlled_input:true,actual393850_failed_term:null,saved393850_missing_predicates_recovered:false,additional_sourceHTTP:0,nativeSQL:0,MAIN:0,Telegram:0,native182_saving_proven:false});
  write('result.json',{status:'PASS',new_cases:1,components:['source_availability','central_caller_and_failure_carrier'],old_cases_repeated:false,sourceHTTP:0,nativeSQL:0,MAIN:0,Telegram:0});
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
