import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpWorker} from '../../runtime/worker.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {PROVIDER_POLICIES,PROVIDER_POLICY_VERSION,METADATA_DIAGNOSTIC_ID,METADATA_DIAGNOSTIC_URL,CORRECTED_METADATA_ID,PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
test('metadata probe rejects wrong grants and extra URL/auth parameters before SQL',async()=>{
  let sql=0;const worker=createPumpWorker(),env={PUMP_CONTROL_KEY:'ARTIFICIAL_ONLY',DATA_DB:{prepare(){sql++;throw Error('Forbidden native SQL');}}};
  for(const body of [{grant_id:'ANOTHER'},{grant_id:METADATA_DIAGNOSTIC_ID},{grant_id:CORRECTED_METADATA_ID,url:'https://evil.test/'},{grant_id:CORRECTED_METADATA_ID,headers:{authorization:'ARTIFICIAL'}},{grant_id:CORRECTED_METADATA_ID,mode:'AUTO'}]){const r=await worker.fetch(new Request('https://artificial/pump/metadata-probe',{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL_ONLY'},body:JSON.stringify(body)}),env,{});assert.equal(r.status,400);}
  assert.equal(sql,0);
});
test('corrected metadata uses the same cumulative provider/version and retains the original spent cost',async()=>{
  let time=Date.now();const store=new MemoryStore();
  const make=()=>createUnifiedBudget({store,run_id:CORRECTED_METADATA_ID,mode:'AUTO',clock:()=>time,policies:PROVIDER_POLICIES,protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:PROVIDER_POLICY_VERSION,expires_ts:time+3600000,run_purpose:'ACCEPTANCE_TEST',allowed_providers:['BINGX_WEB_METADATA']}});
  const old=make(),first=await old.reserve({provider:'BINGX_WEB_METADATA',family:'IDENTITY_METADATA',request_id:'OLD_SPENT'});await old.finalize(first);time+=61000;
  const current=make(),second=await current.reserve({provider:'BINGX_WEB_METADATA',family:'IDENTITY_METADATA',request_id:'CORRECTED_ONCE'});await current.finalize(second,{state:'UNKNOWN'});time+=61000;
  await assert.rejects(make().reserve({provider:'BINGX_WEB_METADATA',request_id:'THIRD_REFUSED'}),{code:'QUALIFICATION_ATTEMPTS_EXHAUSTED'});const s=await store.get('pump:resources');assert.equal(s.providers.BINGX_WEB_METADATA.qualification_totals[PROVIDER_POLICY_VERSION],2);assert.equal(s.days[new Date(time).toISOString().slice(0,10)],2);assert.ok(s.unknown.CORRECTED_ONCE);
});
test('metadata allowance is one exact unauthenticated provider route without reopening BingX or Telegram',async()=>{
  const now=Date.now(),store=new MemoryStore(),budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_METADATA',mode:'AUTO',clock:()=>now,policies:PROVIDER_POLICIES,protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:PROVIDER_POLICY_VERSION,expires_ts:now+60000,run_purpose:'ACCEPTANCE_TEST',allowed_providers:['BINGX_WEB_METADATA']}});
  budget.assertTarget('BINGX_WEB_METADATA',METADATA_DIAGNOSTIC_URL);assert.throws(()=>budget.assertTarget('BINGX_WEB_METADATA',METADATA_DIAGNOSTIC_URL+'/another'),{code:'PROVIDER_ROUTE_NOT_ADMITTED'});
  for(const p of ['BINGX','TELEGRAM','SWOLECHARTS'])assert.throws(()=>budget.assertTarget(p,METADATA_DIAGNOSTIC_URL),{code:'PROVIDER_NOT_IN_RUN_ADMISSION'});
  const first=await budget.reserve({provider:'BINGX_WEB_METADATA',family:'IDENTITY_METADATA',request_id:'ARTIFICIAL_ONE'});await budget.finalize(first,{state:'UNKNOWN'});
  await assert.rejects(budget.reserve({provider:'BINGX_WEB_METADATA',request_id:'ARTIFICIAL_ANOTHER'}),{code:'PROVIDER_SECOND_EXHAUSTED'});const saved=await store.get('pump:resources');assert.equal(saved.providers.BINGX_WEB_METADATA.qualification_totals[PROVIDER_POLICY_VERSION],1);assert.ok(saved.unknown.ARTIFICIAL_ONE);
});
