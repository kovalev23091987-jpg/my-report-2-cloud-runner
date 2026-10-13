import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {proveScheduledEvidenceAllocation,SCHEDULED_EVIDENCE_HTTP_CAP} from '../files/src/scheduled-evidence-budget.mjs';
import {collectEvidenceRouteBlock} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {createUnifiedHttpBudget} from '../files/src/unified-budget.mjs';
import {TWO_NODE_HTTP_LIMITS} from '../files/src/two-candidate-policy.mjs';

test('scheduled cold role allocation and both finalists stay in existing56/164; CG cold quota gap remains explicit',()=>{
 const p=proveScheduledEvidenceAllocation();assert.equal(p.status,'CLOSED');assert.equal(p.per_candidate,18);assert.equal(p.full_background,36);assert.equal(p.other_background_headroom,20);assert.equal(p.whole_job_lanes,164);assert.equal(p.coingecko_cold_every_candidate_fits_existing_quota,false);
 const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8');assert.match(workflow,/REPORT2_EVIDENCE_HTTP_CAP:.*'18'.*'24'/);
});

test('saved request shape no longer starves finalized N04 while retaining all previously useful role responses',async()=>{
 const run=async cap=>{
  const requests=createUnifiedHttpBudget(TWO_NODE_HTTP_LIMITS),contract='OP-USDT',calls={};
  // This is a request-shape replay, not new OP source evidence or fresh clocks.
  const costs={JOINT_FLOW:5,SECTOR_COINGECKO:3,SECTOR:2,LARGE_TRADES:0,CHAIN_EVENTS:4,BLOCKSCOUT:1};
  const collectors=Object.fromEntries(Object.entries(costs).map(([name,cost])=>[name,async p=>{
   calls[name]=0;if(cost){const a=p.request_admit({logical_request_id:name,lane:'background',attempts:cost});if(!a.allowed)return{status:a.status,evidence:[],network_calls:0};for(let i=0;i<cost;i++){await p.fetch_impl('https://controlled.invalid/'+name);calls[name]++;}}
   return{status:'CLOSED',network_calls:cost,evidence:[]};
  }]));
  const result=await collectEvidenceRouteBlock({routes:Object.keys(costs).map(name=>({name})),collectors,params:{contract,request_admit:requests.reserve,fetch_impl:async()=>new Response('{}')},max_requests:cap});return{result,calls,whole:requests.summary()};
 };
 const before=await run(10),after=await run(SCHEDULED_EVIDENCE_HTTP_CAP);
 assert.equal(before.result.results.CHAIN_EVENTS.status,'DEFERRED_SHARED_REQUEST_ENVELOPE');assert.equal(before.calls.CHAIN_EVENTS,0);
 assert.equal(after.result.results.CHAIN_EVENTS.status,'CLOSED');assert.equal(after.calls.CHAIN_EVENTS,4);
 for(const name of ['JOINT_FLOW','SECTOR_COINGECKO','SECTOR','LARGE_TRADES'])assert.equal(after.result.results[name].status,before.result.results[name].status);
 assert.equal(after.result.network_calls,15);assert(after.whole.total<=164);
});

test('two cold role envelopes plus the protected remaining lanes cannot exceed164, and a further request is refused',()=>{
 const budget=createUnifiedHttpBudget(TWO_NODE_HTTP_LIMITS);
 for(const [id,lane,n] of [['candidate1','background',18],['candidate2','background',18],['remaining-background','background',20],['hot','hot',96],['statistics','statistics',12]])assert.equal(budget.reserve({logical_request_id:id,lane,attempts:n}).allowed,true);
 assert.equal(budget.summary().total,164);assert.equal(budget.reserve({logical_request_id:'no-extra',lane:'background',attempts:1}).allowed,false);
});
