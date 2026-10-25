import test from 'node:test';
import assert from 'node:assert/strict';
import {createPumpWorker} from '../../runtime/worker.mjs';
test('qualification deployment preserves old fetch while refusing unauthorized writes and legacy schedules',async()=>{
  let oldFetch=0,oldScheduled=0,sql=0;
  const worker=createPumpWorker({fetch(){oldFetch++;return new Response('retained');},scheduled(){oldScheduled++;}});
  const env={DATA_DB:{prepare(){sql++;throw Error('No native IO in this test');}}};
  assert.equal(await (await worker.fetch(new Request('https://artificial/old'),env,{})).text(),'retained');
  assert.equal((await worker.fetch(new Request('https://artificial/pump/manual',{method:'POST',body:'{}'}),env,{})).status,401);
  const health=await (await worker.fetch(new Request('https://artificial/pump/health'),env,{})).json();
  assert.equal(health.automatic_enabled,false);assert.equal(health.delivery_enabled,false);
  await worker.scheduled({},env,{});assert.equal(oldScheduled,0);assert.equal(sql,0);assert.equal(oldFetch,1);
});

test('invalid authenticated lookups and probes are rejected before reserving native SQL',async()=>{let sql=0;const worker=createPumpWorker(),env={PUMP_CONTROL_KEY:'ARTIFICIAL_ONLY',DATA_DB:{prepare(){sql++;throw Error('unexpected SQL');}}};for(const [route,body] of [['summary',{max_records:41}],['manual-result',{request_id:'invalid / id'}],['source-probe',{kind:'invalid'}],['source-probe',{kind:'price',symbol:'BTC/USDT'}],['not-a-route',{}]]){const r=await worker.fetch(new Request('https://artificial/pump/'+route,{method:'POST',headers:{'x-pump-control-key':'ARTIFICIAL_ONLY'},body:JSON.stringify(body)}),env,{});assert.ok([400,404].includes(r.status));}assert.equal(sql,0);});
