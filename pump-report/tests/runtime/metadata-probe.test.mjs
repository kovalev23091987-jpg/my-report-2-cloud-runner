import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpWorker} from '../../runtime/worker.mjs';
import {createUnifiedBudget} from '../../runtime/budget.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {PROVIDER_POLICIES,PROVIDER_POLICY_VERSION,METADATA_DIAGNOSTIC_ID,METADATA_DIAGNOSTIC_URL,PROTECTED_HTTP} from '../../runtime/provider-policy.mjs';
test('metadata probe rejects wrong grants and extra URL/auth parameters before SQL',async()=>{
  let sql=0;const worker=createPumpWorker(),env={PUMP_CONTROL_KEY:'ARTIFICIAL_ONLY',DATA_DB:{prepare(){sql++;throw Error('Forbidden native SQL');}}};
  for(const body of [{grant_id:'ANOTHER'},{grant_id:METADATA_DIAGNOSTIC_ID,url:'https://evil.test/'},{grant_id:METADATA_DIAGNOSTIC_ID,headers:{authorization:'ARTIFICIAL'}},{grant_id:METADATA_DIAGNOSTIC_ID,mode:'AUTO'}]){const r=await worker.fetch(new Request('https://artificial/pump/metadata-probe',{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL_ONLY'},body:JSON.stringify(body)}),env,{});assert.equal(r.status,400);}
  assert.equal(sql,0);
});
test('metadata allowance is one exact unauthenticated provider route without reopening BingX or Telegram',async()=>{
  const now=Date.now(),store=new MemoryStore(),budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_METADATA',mode:'AUTO',clock:()=>now,policies:PROVIDER_POLICIES,protected_reserves:PROTECTED_HTTP,admission:{provider_policy_version:PROVIDER_POLICY_VERSION,expires_ts:now+60000,run_purpose:'ACCEPTANCE_TEST',allowed_providers:['BINGX_WEB_METADATA']}});
  budget.assertTarget('BINGX_WEB_METADATA',METADATA_DIAGNOSTIC_URL);assert.throws(()=>budget.assertTarget('BINGX_WEB_METADATA',METADATA_DIAGNOSTIC_URL+'/another'),{code:'PROVIDER_ROUTE_NOT_ADMITTED'});
  for(const p of ['BINGX','TELEGRAM','SWOLECHARTS'])assert.throws(()=>budget.assertTarget(p,METADATA_DIAGNOSTIC_URL),{code:'PROVIDER_NOT_IN_RUN_ADMISSION'});
  const first=await budget.reserve({provider:'BINGX_WEB_METADATA',family:'IDENTITY_METADATA',request_id:'ARTIFICIAL_ONE'});await budget.finalize(first,{state:'UNKNOWN'});
  await assert.rejects(budget.reserve({provider:'BINGX_WEB_METADATA',request_id:'ARTIFICIAL_ANOTHER'}),{code:'PROVIDER_SECOND_EXHAUSTED'});const saved=await store.get('pump:resources');assert.equal(saved.providers.BINGX_WEB_METADATA.qualification_totals[PROVIDER_POLICY_VERSION],1);assert.ok(saved.unknown.ARTIFICIAL_ONE);
});
