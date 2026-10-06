import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {rotateEvidenceRoleRoutes,collectEvidenceRouteBlock} from '../files/src/candidate-evidence-v2-runtime.mjs';
const f=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/exact-current-37395903856.json.gz',import.meta.url))));
const priorities=new Set(['LARGE_TRADES','TOKEN_SCHEDULE','CHAIN_SUPPLY','COINMETRICS','SECTOR','SECTOR_COINGECKO','TOKEN_CALENDAR']);
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

const zec=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/actual-ZEC-role-handoff-0931.json.gz',import.meta.url)))).canonical;
test('actual native supply history deferral is not a low-priority source after the owner prioritized N02',()=>{
 const original=zec.metadata.internal_market_context.evidence_v2;
 assert.equal(original.sources.COINMETRICS_SUPPLY.status,'DEFERRED_SHARED_REQUEST_ENVELOPE');
 const routes=original.route_accounting.filter(r=>r.route!=='HTX').map(r=>({name:r.route,role:r.role}));
 const totals=new Map();
 for(let i=0;i<100;i++){
  const ordered=rotateEvidenceRoleRoutes(routes,'original-ZEC-native-source-order:'+i,{owner_priority:true});
  assert.deepEqual(ordered.map(r=>r.name).sort(),routes.map(r=>r.name).sort());
  const cm=ordered.findIndex(r=>r.name==='COINMETRICS');
  assert.ok(cm>=0);
  for(const low of ['BLUESKY','HTX_ANNOUNCEMENTS','DERIBIT']){
   const j=ordered.findIndex(r=>r.name===low);if(j>=0)assert.ok(cm<j);
  }
  totals.set(ordered[0].name,(totals.get(ordered[0].name)||0)+1);
 }
 assert.ok(totals.get('COINMETRICS')>0);
});
test('native priority keeps the existing HTTP ceiling, all admitted caches and durable quota denial',async()=>{
 const routes=rotateEvidenceRoleRoutes([{name:'COINMETRICS'},{name:'BLUESKY'},{name:'SECTOR_COINGECKO'}],'priority-native',{owner_priority:true});
 let network=0,cmAttempts=0;
 const out=await collectEvidenceRouteBlock({routes,max_requests:2,params:{contract:'ZEC-USDT',request_admit:()=>({allowed:true}),fetch_impl:async()=>{network++;return{};}},collectors:{
  COINMETRICS:async p=>{cmAttempts++;const a=p.request_admit({attempts:2,source:'COINMETRICS_SUPPLY'});return{status:a.allowed?'DAILY_CAP_OR_DUPLICATE':a.status,network_calls:0,admission:{allowed:false,status:'DAILY_CAP_OR_DUPLICATE'},evidence:[]};},
  SECTOR_COINGECKO:async p=>{const a=p.request_admit({attempts:2,source:'COINGECKO_SECTOR'});if(!a.allowed)return{status:a.status,evidence:[],network_calls:0,admission:a};await p.fetch_impl('https://fixture.invalid/a');await p.fetch_impl('https://fixture.invalid/b');return{status:'CLOSED',network_calls:2,evidence:[]};},
  BLUESKY:async()=>({status:'CLOSED',cache_status:'VALID_CACHE',network_calls:0,evidence:[]}),
 }});
 assert.equal(cmAttempts,1);assert.ok(network<=2);assert.equal(out.network_calls,network);assert.ok(out.reserved_requests<=2);
 assert.equal(out.results.COINMETRICS.admission.allowed,false);
 assert.equal(out.results.BLUESKY.cache_status,'VALID_CACHE');
});
