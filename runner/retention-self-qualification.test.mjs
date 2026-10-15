import test from 'node:test';import assert from 'node:assert/strict';
import {DATED_RETENTION_QUALIFICATION as P,requireDatedRetentionQualification,verifyExactArchiveReaderBindings} from './retention-self-qualification.mjs';
import {canonicalExecutionMode} from './canonical-native-qualification.mjs';
import {workerSettingsFingerprint,selectedVersionSettings,rolloutDigest} from './htx-coordinated-rollout.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`;
test('the autonomous single qualification is bounded to the exact owner requested UTC16 window and ordinary slot',()=>{
 const request={day:P.day,event:'workflow_dispatch',workflow:P.workflow,kind:'canonical',execute:true,prefetch:true,native_qualification:true,now:P.not_before};
 const r=requireDatedRetentionQualification(request);assert.equal(r.extra_slot_granted,false);assert.equal(r.automatic_rotation_enabled,false);
 for(const change of [{day:'2026-10-15'},{now:P.not_before-1},{now:P.expires},{event:'schedule'},{workflow:'other'},{kind:'full_evidence'},{execute:false},{prefetch:false},{native_qualification:false}])assert.throws(()=>requireDatedRetentionQualification({...request,...change}));
 assert.equal(canonicalExecutionMode({...request,enabled:false,emergency:false,self_qualification:true,borrowed_owner:''}).require_native_preflight,true);
 assert.throws(()=>canonicalExecutionMode({...request,enabled:false,emergency:false,self_qualification:false,borrowed_owner:''}));assert.throws(()=>canonicalExecutionMode({...request,self_qualification:true,native_qualification:false}));
});
function fixture(){
 const runtime={compatibility_date:'2026-10-12T00:00:00Z',usage_model:'standard'},settings={placement:{},bindings:[]},versions=[0,1].map(i=>({id:id(i+1),resources:{bindings:[{name:'DATA_DB',type:'d1',id:id(8)},{name:'SECRET',type:'secret_text'}],script_runtime:runtime}}));
 const names=['my-report-2-hub','my-report-2-liq-forecast-history'],proof={cloud_run:P.native_readers_run,status:'BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED',writer_enabled:false,workers:names.map((name,i)=>({name,after:{version_id:versions[i].id,settings_sha256:workerSettingsFingerprint(selectedVersionSettings(settings,versions[i])),crons_sha256:rolloutDigest(['*/5 * * * *'])}}))};
 const calls=[];const call=async(name,suffix)=>{calls.push({name,suffix});const v=versions[names.indexOf(name)];if(suffix==='/deployments')return{deployments:[{id:id(10),strategy:'percentage',versions:[{version_id:v.id,percentage:100}]}]};if(suffix==='/settings')return settings;if(suffix==='/schedules')return[{cron:'*/5 * * * *'}];if(suffix==='/versions/'+v.id)return v;throw Error('UNEXPECTED_ROUTE');};return{proof,call,calls,versions,settings};
}
test('future native qualification rechecks exact immutable reader versions, every binding, runtime and cron without secret exports',async()=>{
 const f=fixture(),r=await verifyExactArchiveReaderBindings(f);assert.equal(f.calls.length,8);assert.equal(r.SQL,0);assert.equal(r.secret_values_exported,false);assert.equal(r.workers.length,2);assert(!JSON.stringify(r).includes('SECRET'));
});
test('a changed reader version, binding, non-versioned setting or schedule stops qualification before any SQL',async()=>{
 for(const kind of ['VERSION','BINDING','SETTING','CRON','RECEIPT']){
  const f=fixture();if(kind==='VERSION')f.versions[0].id=id(99);if(kind==='BINDING')f.versions[0].resources.bindings[0].id=id(98);if(kind==='SETTING')f.settings.future_protection='unknown';if(kind==='CRON')f.proof.workers[0].after.crons_sha256='0'.repeat(64);if(kind==='RECEIPT')f.proof.cloud_run='other';await assert.rejects(()=>verifyExactArchiveReaderBindings(f));assert(f.calls.length<=4);
 }
});
test('the dated executable refuses before its window without lease, network, admission or SQL',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-dated-disabled-'));
 try{
  const script="Date.now=()=>Date.parse('2026-10-15T21:00:00Z');globalThis.fetch=async()=>{await(await import('node:fs/promises')).writeFile('unexpected-network','1');throw Error('NETWORK_DENIED')};await import("+JSON.stringify(new URL('../tools/recover-lossless-retained-history-20261014.mjs',import.meta.url).href)+");";
  const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_TOKEN:'fixture',GITHUB_REPOSITORY:'kovalev23091987-jpg/my-report-2-cloud-runner',GITHUB_RUN_ID:'1',GITHUB_SHA:'a'.repeat(40),GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_WORKFLOW:P.workflow,REPORT2_SELF_NATIVE_QUALIFICATION_UTC_DAY:P.day,RETAINED_HISTORY_KIND:'canonical',LOSSLESS_EXECUTE:'true',REPORT2_NATIVE_CANONICAL_QUALIFICATION:'true',REPORT2_PRIVATE_PREFETCH_QUALIFICATION:'true'},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(fs.readFileSync(path.join(dir,'audit-output/lossless-retained-history/proof.json'),'utf8'));assert.equal(out.reason,'EXACT_DATED_NATIVE_RETENTION_QUALIFICATION_REQUIRED');assert.equal(out.whole_HTTP.total,0);assert(!out.admission);assert(!fs.existsSync(path.join(dir,'unexpected-network')));
 }finally{fs.rmSync(dir,{recursive:true});}
});
