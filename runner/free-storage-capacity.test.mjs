import test from 'node:test';import assert from 'node:assert/strict';
import {freeStorageExpansionPlan,rollingStorageDecision} from './free-storage-capacity.mjs';
import {inventoryFreeStorage} from './free-storage-inventory.mjs';
const now=1792077958000;
const db=(i,bytes=1000)=>({uuid:`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`,name:'db-'+i,file_size:bytes});
test('free account expansion includes all projects, 500 MB reservations and a spare slot',()=>{
 const p=freeStorageExpansionPlan({databases:[db(1,500_000_000),db(2,100_000_000)],complete:true,observed_ts:now,now});
 assert.equal(p.new_database_count,7);assert.equal(p.new_archive_operating_bytes,2_800_000_000);assert.equal(p.used_account_bytes,600_000_000);assert.equal(p.actual_provisioned_database_count,0);assert.equal(p.shared_query_limits_increased,false);
 const occupied=freeStorageExpansionPlan({databases:[db(1,4_600_000_000)],complete:true,observed_ts:now,now});assert.equal(occupied.allowed,false);
});
test('unknown, stale, duplicate and incomplete account storage never authorize creation',()=>{
 for(const a of [{complete:false},{observed_ts:now-1800001},{databases:[{...db(1),file_size:null}]},{databases:[db(1),db(1)]},{observed_ts:now+1}])assert.equal(freeStorageExpansionPlan({databases:[db(1)],complete:true,observed_ts:now,now,...a}).allowed,false);
 assert.equal(freeStorageExpansionPlan({databases:Array.from({length:10},(_,i)=>db(i)),complete:true,observed_ts:now,now}).allowed,false);
});
const rolling={used_bytes:390_000_000,projected_new_bytes_before_service:20_000_000,reclaimable_bytes:100_000_000,protected_bytes:200_000_000,maintenance_bytes_per_day:50_000_000,incoming_bytes_per_day:40_000_000,native_qualified:true,archive_readthrough_qualified:true,archive_has_headroom:true,day_admitted:true};
test('rolling maintenance includes next full/manual storage reserve and verified throughput',()=>{
 const d=rollingStorageDecision(rolling);assert.equal(d.status,'BOUNDED_ROLLING_MAINTENANCE_DUE');assert.equal(d.projected_bytes_including_report_reserve,434_000_000);assert.equal(d.required_reclaim_bytes,84_000_000);assert.equal(d.maintenance_allowed,true);assert.equal(d.protected_data_deletion_allowed,false);
});
test('insufficient maintenance, missing readthrough, full archive or spent day never enables automatic work',()=>{
 for(const changes of [{maintenance_bytes_per_day:40_000_000},{native_qualified:false},{archive_readthrough_qualified:false},{archive_has_headroom:false}])assert.equal(rollingStorageDecision({...rolling,...changes}).automatic_activation_allowed,false);
 assert.equal(rollingStorageDecision({...rolling,day_admitted:false}).maintenance_allowed,false);
 assert.equal(rollingStorageDecision({...rolling,reclaimable_bytes:5_000_000}).maintenance_allowed,false);
 assert.equal(rollingStorageDecision({...rolling,protected_bytes:380_000_000}).maintenance_allowed,false);
});
test('inventory makes only bounded metadata GETs and does not access SQL, billing or tokens in results',async()=>{
 const calls=[],rows=[db(1),db(2)];
 const receipt=await inventoryFreeStorage({token:'private-inventory-key',clock:()=>now,before_request:()=>({allowed:true}),fetch_impl:async(url,options)=>{
  calls.push({url,options});return{ok:true,json:async()=>url.endsWith('page=1')?{success:true,result:rows.map(({file_size,...r})=>r),result_info:{page:1,count:2,total_count:2}}:{success:true,result:rows.find(r=>url.endsWith(r.uuid))}};
 }});
 assert.equal(receipt.cloudflare_metadata_HTTP,3);assert.equal(receipt.D1_SQL,0);assert.equal(receipt.databases_created,0);assert.equal(JSON.stringify(receipt).includes('private-inventory-key'),false);
 assert.ok(calls.every(c=>!c.options.method&&!c.options.body&&c.options.redirect==='error'&&!/query|export|subscriptions/.test(c.url)));
});
test('incomplete inventory refuses before any database descriptor or mutation',async()=>{
 let calls=0;await assert.rejects(inventoryFreeStorage({token:'test',before_request:()=>({allowed:true}),fetch_impl:async()=>{calls++;return{ok:true,json:async()=>({success:true,result:[db(1)],result_info:{page:1,count:1,total_count:11}})}}}),/COMPLETE_ACCOUNT_LIST/);assert.equal(calls,1);
});
test('metadata access denial is explicit and never falls back to SQL',async()=>{
 await assert.rejects(inventoryFreeStorage({token:'test',before_request:()=>({allowed:true}),fetch_impl:async()=>({ok:false,status:403})}),/METADATA_HTTP_403/);
 await assert.rejects(inventoryFreeStorage({token:'test',before_request:()=>({allowed:false}),fetch_impl:()=>{throw Error('unexpected transport')}}),/ADMISSION_DENIED/);
});
test('previous metadata attempts reduce the remaining bound before descriptor reads',async()=>{
 let calls=0;await assert.rejects(inventoryFreeStorage({token:'test',max_requests:2,before_request:()=>({allowed:true}),fetch_impl:async()=>{calls++;return{ok:true,json:async()=>({success:true,result:[db(1),db(2)],result_info:{page:1,count:2,total_count:2}})}}}),/DESCRIPTORS_HTTP_HEADROOM/);assert.equal(calls,1);
});
