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
