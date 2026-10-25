import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../../runtime/store.mjs';
import {createUnifiedBudget,createRequestBroker} from '../../runtime/budget.mjs';
import {T} from '../analytics/fixtures.mjs';

test('real shared budget admits only exact read-only POST bodies, separates cache/coalescing by canonical body and charges each artificial attempt',async()=>{
 const store=new MemoryStore(),provider='CONTROLLED_READONLY_INFO',day=new Date(T).toISOString().slice(0,10),month=day.slice(0,7),oldUnknown={old:{provider,cost:1,run_id:'ARTIFICIAL_PREVIOUS_UNKNOWN'}};
 await store.set('pump:resources',{schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:1},providers:{[provider]:{days:{[day]:1},months:{[month]:1},recent:[]}},outstanding:{},unknown:oldUnknown});
 const bodyA={type:'clearinghouseState',user:'0x'+'a'.repeat(40)},bodyB={type:'clearinghouseState',user:'0x'+'b'.repeat(40)},version='ARTIFICIAL_READONLY_1';
 const policy={version,evidence_ref:'ARTIFICIAL_EXACT_BODY_ADMISSION',allowed_hosts:['api.hyperliquid.xyz'],allowed_paths:['/info'],project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,readonly_json_post_templates:[bodyA,bodyB].map(body=>({method:'POST',read_only:true,path:'/info',body}))};
 const budget=createUnifiedBudget({store,run_id:'ARTIFICIAL_ROOT_POST',mode:'MANUAL',clock:()=>T,policies:{[provider]:policy},protected_reserves:{http_by_provider:{[provider]:0},delivery_http:0,outcomes_http:0},admission:{provider_policy_version:version,expires_ts:T+60000,run_purpose:'PRODUCTION',max_http_attempts:2}});
 let fetches=0;const broker=createRequestBroker({store,budget,clock:()=>T,fetch_impl:async(url,request)=>{fetches++;assert.equal(url,'https://api.hyperliquid.xyz/info');assert.equal(request.method,'POST');assert.equal(request.headers['content-type'],'application/json');assert.equal(request.redirect,'manual');return new Response(JSON.stringify({artificial:true,user:JSON.parse(request.body).user}),{status:200});}});
 const request=(json_body,extra={})=>broker.request({provider,cache_key:'ARTIFICIAL_SAME_CACHE_KEY',url:'https://api.hyperliquid.xyz/info',method:'POST',json_body,ttl_ms:30000,...extra});
 const [a,same]=await Promise.all([request(bodyA),request({user:bodyA.user,type:bodyA.type})]);assert.equal(fetches,1);assert.equal(a.receipt_id,same.receipt_id);assert.equal(a.data.user,bodyA.user);assert.equal(a.received_ts,T);
 const b=await request(bodyB);assert.equal(fetches,2);assert.equal(b.data.user,bodyB.user);assert.notEqual(a.receipt_id,b.receipt_id);assert.equal((await request(bodyA)).cache_hit,true);assert.equal(fetches,2);
 for(const [body,extra] of [[{type:'order'},{}],[{...bodyA,user:'0x'+'c'.repeat(40)},{}],[bodyA,{url:'https://api.hyperliquid.xyz/info?other=1'}],[bodyA,{url:'https://api.hyperliquid.xyz/exchange'}],[bodyA,{method:'GET'}]])await assert.rejects(request(body,extra),/NOT_ADMITTED|INVALID_SOURCE_REQUEST/);
 await assert.rejects(request({...bodyA,padding:'X'.repeat(5000)}),/BOUNDED_JSON_POST_BODY/);assert.equal(fetches,2);
 const ledger=await store.get('pump:resources');assert.equal(ledger.days[day],3);assert.equal(ledger.providers[provider].days[day],3);assert.deepEqual(ledger.unknown,oldUnknown);assert.deepEqual(ledger.outstanding,{});assert.equal(budget.summary().total_http,undefined);assert.equal(budget.summary().total,2);
});
