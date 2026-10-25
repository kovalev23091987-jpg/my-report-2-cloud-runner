import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,createRequestBroker} from '../../runtime/budget.mjs';
import {T} from '../analytics/fixtures.mjs';
test('GET still reads its exact old durable cache key and original clocks with no new reservation after adding POST support',async()=>{
 const store=new MemoryStore(),url='https://open-api.bingx.com/openApi/swap/v2/quote/ticker',cache_key='ARTIFICIAL_OLD_GET_KEY',key='pump:cache:BINGX:'+cache_key+':'+url;
 const old={ok:true,status:200,data:{retained:'ARTIFICIAL'},received_ts:T-1000,event_ts:T-2000,receipt_id:'ARTIFICIAL_ORIGINAL_RECEIPT',cache_hit:false};await store.set(key,old);
 const day=new Date(T).toISOString().slice(0,10),ledger={days:{[day]:25},providers:{BINGX:{qualification_totals:{retained:15}}},outstanding:{},unknown:{retained_unknown:{cost:1}}};await store.set('pump:resources',ledger);
 const version='ARTIFICIAL_GET_CACHE',budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_GET_AFTER_POST',mode:'MANUAL',clock:()=>T,policies:{BINGX:{version,evidence_ref:'ARTIFICIAL',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/v2/quote/ticker'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10}},protected_reserves:{http_by_provider:{BINGX:102},delivery_http:24,outcomes_http:24},admission:{provider_policy_version:version,expires_ts:T+60000}});
 let calls=0;const broker=createRequestBroker({store,budget,clock:()=>T,fetch_impl:async()=>{calls++;throw Error('UNEXPECTED_IO');}});const result=await broker.request({provider:'BINGX',cache_key,url,ttl_ms:30000});
 assert.equal(result.cache_hit,true);assert.equal(result.received_ts,old.received_ts);assert.equal(result.event_ts,old.event_ts);assert.equal(result.receipt_id,old.receipt_id);assert.deepEqual(await store.get(key),old);assert.deepEqual(await store.get('pump:resources'),ledger);assert.equal(calls,0);
 await assert.rejects(broker.request({provider:'BINGX',cache_key,url,method:'POST',json_body:{type:'meta'},ttl_ms:30000}),/EXACT_READONLY_JSON_POST_NOT_ADMITTED/);assert.equal(calls,0);
});
