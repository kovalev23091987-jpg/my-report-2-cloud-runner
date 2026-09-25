import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';import fs from 'node:fs';
const runtime=path.resolve(process.env.REPORT2_HL_RUNTIME_DIR||'runtime');
const mod=await import(pathToFileURL(path.join(runtime,'src/hyperliquid-recorder-extension.mjs')).href);
const consumer=await import(pathToFileURL(path.join(runtime,'src/existing-source-consumer.mjs')).href);

function response(payload,status=200){return{status,ok:status>=200&&status<300,async json(){return payload;}};}
function fetchFor(method){
  return async(_url,opts)=>{
    const body=JSON.parse(opts.body);
    assert.equal(body.type,method);
    if(method==='metaAndAssetCtxs')return response([{universe:[{name:'BTC'}]},[{markPx:'100',openInterest:'10',funding:'0.001'}]]);
    if(method==='fundingHistory')return response([{coin:'BTC',fundingRate:'0.002',time:1790000000000}]);
    if(method==='l2Book')return response({levels:[[{px:'99',sz:'1'}],[{px:'101',sz:'1'}]]});
    if(method==='clearinghouseState')return response({assetPositions:[]});
    throw new Error('unexpected');
  };
}

for(const method of mod.HYPERLIQUID_RECORDER_METHODS)test(`one-call fallback closes ${method}`,async()=>{
  let calls=0;
  const f=async(...args)=>{calls++;return fetchFor(method)(...args);};
  const raw=await mod.fetchExistingSmartMoneyRecorderRaw({fetch_impl:f,bykaranteli_fetcher:async()=>{throw new Error('BYK must not run');},contract_code:'BTC-USDT',bykaranteli_api_key:'',observed_ts:1790000000000,force_method:method});
  assert.equal(calls,1);assert.equal(raw.external_fetches,1);assert.equal(raw.recorder_extension.second_recorder_added,false);assert.equal(raw.recorder_extension.hot_cycle_external_request_delta,0);assert.equal(raw.hyperliquid_context.status,'CLOSED');assert.equal(raw.hyperliquid_context.directional_vote,false);assert.equal(raw.hyperliquid_context.not_global_liquidation_map,true);
});

test('existing ByK path wins and no Hyperliquid request is added',async()=>{
  let hl=0,byk=0;
  const raw=await mod.fetchExistingSmartMoneyRecorderRaw({fetch_impl:async()=>{hl++;throw new Error('no');},bykaranteli_fetcher:async()=>{byk++;return{status:'CLOSED',external_fetches:1,score_eligible:false,directional_vote_eligible:false};},contract_code:'BTC-USDT',bykaranteli_api_key:'k',observed_ts:1790000000000});
  assert.equal(byk,1);assert.equal(hl,0);assert.equal(raw.recorder_extension.second_recorder_added,false);assert.equal(raw.recorder_extension.smart_money_external_requests_each,1);
});

test('clearinghouseState distinguishes subsequent position state without global inference',async()=>{
  const f=fetchFor('clearinghouseState');
  const a=await mod.fetchExistingSmartMoneyRecorderRaw({fetch_impl:f,bykaranteli_fetcher:null,contract_code:'BTC-USDT',observed_ts:1790000000000,force_method:'clearinghouseState'});
  const b=await mod.fetchExistingSmartMoneyRecorderRaw({fetch_impl:f,bykaranteli_fetcher:null,contract_code:'BTC-USDT',observed_ts:1790000300000,force_method:'clearinghouseState'});
  assert.equal(a.hyperliquid_context.position_change.status,'BASELINE_ESTABLISHED');
  assert.equal(b.hyperliquid_context.position_change.status,'UNCHANGED');
  assert.equal(b.hyperliquid_context.global_position_inference,false);
  assert.equal(b.hyperliquid_context.known_addresses_are_sample_only,true);
});

test('consumer exposes sampled position only as advisory context',()=>{
  const out=consumer.consumeExistingSourceReceipts({hyperliquid:{status:'CLOSED',coin:'BTC',method:'clearinghouseState',current_position:{szi:2},address_role:'CONFIGURED_KNOWN_SAMPLE_ONLY',position_change:{status:'INCREASED',delta:1}}});
  assert.equal(out.blocks.hyperliquid_context.status,'CLOSED');
  assert.ok(out.blocks.hyperliquid_context.facts.some(x=>/Позиция выборочного адреса/.test(x.label)));
  assert.ok(out.blocks.hyperliquid_context.facts.every(x=>x.directional_vote===false&&x.hard_gate===false));
});

test('worker keeps exactly one Smart Money request slot and imports extension',()=>{
  const text=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8');
  assert.match(text,/const SMART_MONEY_EXTERNAL_REQUESTS = 1;/);
  assert.match(text,/fetchExistingSmartMoneyRecorderRaw/);
  assert.match(text,/hyperliquidRegistryReceipt/);
  assert.match(text,/existing_source_receipts:/);
});
