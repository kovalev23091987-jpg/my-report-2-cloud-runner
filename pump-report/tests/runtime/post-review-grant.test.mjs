import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpWorker} from '../../runtime/worker.mjs';
import {J_DIAGNOSTIC_ID,METADATA_DIAGNOSTIC_ID,DAY_DIAGNOSTIC_ID} from '../../runtime/provider-policy.mjs';
test('post-review stage permits no symbol/publication override and does not reopen prior metadata/day/source/Telegram grants',async()=>{
  let sql=0;const worker=createPumpWorker(),env={PUMP_CONTROL_KEY:'ARTIFICIAL',DATA_DB:{prepare(){sql++;throw Error('Forbidden SQL');}}};
  for(const [route,body]of [['integration-check',{grant_id:'ANOTHER'}],['integration-check',{grant_id:J_DIAGNOSTIC_ID,symbol:'BTC'}],['integration-check',{grant_id:J_DIAGNOSTIC_ID,publish:true}],['metadata-probe',{grant_id:METADATA_DIAGNOSTIC_ID}],['day-probe',{probe_id:DAY_DIAGNOSTIC_ID}],['source-probe',{kind:'catalog'}],['delivery-check',{diagnostic_id:'pump-delivery-qualification-20261025-one'}]]){const r=await worker.fetch(new Request('https://artificial/pump/'+route,{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL'},body:JSON.stringify(body)}),env,{});assert.equal(r.status,400);}
  assert.equal(sql,0);
});
