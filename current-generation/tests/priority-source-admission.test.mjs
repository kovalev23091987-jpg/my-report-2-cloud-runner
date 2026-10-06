import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {rotateEvidenceRoleRoutes,collectEvidenceRouteBlock} from '../files/src/candidate-evidence-v2-runtime.mjs';
const f=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/exact-current-37395903856.json.gz',import.meta.url))));
const priorities=new Set(['LARGE_TRADES','TOKEN_SCHEDULE','CHAIN_SUPPLY','SECTOR','SECTOR_COINGECKO','TOKEN_CALENDAR']);
test('retained actual source lists serve owner-priority blocks before lower-priority fresh requests without dropping any route',()=>{
 for(const candidate of f.rows){
  const actual=candidate.canonical.metadata.internal_market_context.evidence_v2.route_accounting.filter(x=>x.route!=='HTX').map(x=>({name:x.route,role:x.role}));
  for(let slot=0;slot<80;slot++){
   const routed=rotateEvidenceRoleRoutes(actual,candidate.contract_code+':'+slot,{owner_priority:true});
   assert.deepEqual([...routed.map(r=>r.name)].sort(),[...actual.map(r=>r.name)].sort());
   assert.equal(new Set(routed.map(r=>r.name)).size,actual.length);
   const p=routed.filter(r=>priorities.has(r.name));assert.ok(p.length);
   assert.deepEqual(routed.slice(0,p.length),p);
  }
 }
});
test('exhausted envelope still reads later valid caches, preserves quota skips and never expands source admission',async()=>{
 let calls=0;
 const routes=rotateEvidenceRoleRoutes([{name:'HTX_ANNOUNCEMENTS'},{name:'SECTOR'},{name:'LARGE_TRADES'},{name:'CHAIN_SUPPLY'},{name:'BLUESKY'}],'actual-envelope',{owner_priority:true});
 const collectors=Object.fromEntries(routes.map(r=>[r.name,async p=>{
  if(r.name==='BLUESKY')return{status:'CLOSED',cache_status:'VALID_CACHE',network_calls:0,evidence:[]};
  const grant=p.request_admit({attempts:1,source:r.name});if(!grant.allowed)return{status:grant.status,network_calls:0,evidence:[],admission:grant};
  await p.fetch_impl('https://retained-fixture.invalid/');
  return{status:'CLOSED',network_calls:1,evidence:[]};
 }]));
 const out=await collectEvidenceRouteBlock({routes,collectors,params:{contract:'NEAR-USDT',request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return{};}},max_requests:2});
 assert.equal(calls,2);assert.equal(out.network_calls,2);assert.equal(out.reserved_requests,2);
 assert.equal(out.results.HTX_ANNOUNCEMENTS.status,'DEFERRED_SHARED_REQUEST_ENVELOPE');
 assert.equal(out.results.BLUESKY.cache_status,'VALID_CACHE');assert.equal(out.receipts.length,5);
});
