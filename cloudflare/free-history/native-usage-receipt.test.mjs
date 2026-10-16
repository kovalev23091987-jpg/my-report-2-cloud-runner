import test,{mock} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash,webcrypto} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import worker from './worker-entry.mjs';import {hourlyNativeUsageReceipt,nativeBindingUsage} from './native-usage-receipt.mjs';import {archiveHour,TARGETS,SOURCE_GENERATION} from './hourly-archive.mjs';import {archiveSpot,FUTURES_QUOTE_URL} from './spot-archive.mjs';
globalThis.crypto ||=webcrypto;
const HOUR=3600000,T=Date.UTC(2026,9,15,5),now=T+35*60000,bucket=T+25*60000;
const before=fs.readFileSync(new URL('./fixtures/worker-entry-before-native-20261016.mjs',import.meta.url),'utf8');
const baseline=Function('archiveHour','archiveSpot',before.replace(/^import .+;\n/gm,'').replace('export default','return'))(archiveHour,archiveSpot);
function binding(schema,{fail=null,missingMeta=false}={}){
 const raw=new DatabaseSync(':memory:');raw.exec(schema);const calls=[];
 const call=(sql,args,all)=>{const entry={sql,args};calls.push(entry);if(fail?.(sql))throw fail.error;const stmt=raw.prepare(sql);
  if(all){const results=stmt.all(...args).map(r=>({...r})),meta={rows_read:91+results.length,rows_written:0,size_after:16384};entry.meta=missingMeta?null:meta;return{success:true,results,meta:entry.meta};}
  const r=stmt.run(...args),meta={changes:Number(r.changes),rows_read:3,rows_written:Number(r.changes)*7,size_after:16384};entry.meta=missingMeta?null:meta;return{success:true,results:[],meta:entry.meta};};
 return{raw,calls,prepare(sql){let args=[];return{bind(...a){args=a;return this;},async all(){return call(sql,args,true);},async first(column){const r=call(sql,args,true).results[0]??null;return column===undefined?r:r?.[column]??null;},async run(){return call(sql,args,false);}};},async batch(s){return Promise.all(s.map(q=>q.run()));}};
}
function fixture(options={}){
 const source=binding(fs.readFileSync(new URL('../../current-generation/migrations/004_market_snapshot_batch.sql',import.meta.url),'utf8'),options.source),archive=binding(fs.readFileSync(new URL('./001_hourly_archive.sql',import.meta.url),'utf8'),options.archive);
 const payload=JSON.stringify(TARGETS.map(contract=>({contract,catalog_active:true,source_status:'CLOSED',price:1,observed_ts:bucket+1000,oi_value_usdt:100,funding_rate:.001,funding_interval_hours:4}))),meta=JSON.stringify({expected_shards:1,universe_total:TARGETS.length,market:bucket+1000});
 if(!options.missingSource)source.raw.prepare('INSERT INTO report2_market_snapshot_batch_v1(bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(bucket,'HUB_PUBLIC_COLLECTOR',SOURCE_GENERATION,'v1',0,meta,bucket+2000,'COMPLETE',createHash('sha256').update(payload).digest('hex'),payload,TARGETS.length,Buffer.byteLength(payload));
 return{source,archive,env:{DATA_DB:source,ARCHIVE_DB:archive}};
}
async function execute(handler,f){
 const logs=[],http=[];mock.method(Date,'now',()=>now);mock.method(console,'log',(...a)=>logs.push(a));mock.method(globalThis,'fetch',async url=>{http.push(String(url));const body=url===FUTURES_QUOTE_URL?{status:'ok',ts:now-2000,ticks:TARGETS.map(contract=>({contract_code:contract,business_type:'swap',close:1,bid:[.999,1],ask:[1.001,1]}))}:{status:'ok',ts:now-1000,data:TARGETS.map(contract=>({symbol:contract.slice(0,-5).toLowerCase()+'usdt',close:1,bid:.999,ask:1.001,vol:100,count:1}))};return new Response(JSON.stringify(body));});
 let error;try{await handler.scheduled({scheduledTime:now},f.env);}catch(e){error=e;}finally{mock.restoreAll();}
 return{logs,http,error,receipt:logs.find(r=>r[0]==='REPORT2_FREE_HISTORY_NATIVE_D1')?.[1]&&JSON.parse(logs.find(r=>r[0]==='REPORT2_FREE_HISTORY_NATIVE_D1')[1])};
}
const counts=db=>({attempted_statements:db.calls.length,measured_rows_read_subtotal:db.calls.reduce((n,c)=>n+(c.meta?.rows_read||0),0),measured_rows_written_subtotal:db.calls.reduce((n,c)=>n+(c.meta?.rows_written||0),0),unknown_operations:db.calls.filter(c=>!c.meta).length});
const trace=db=>db.calls.map(({sql,args})=>({sql,args}));
test('hourly instrumentation preserves the original SQL/params, two bulk HTTP calls, source clocks and every archived byte',async()=>{
 const a=fixture(),b=fixture(),old=await execute(baseline,a),current=await execute(worker,b);assert.ifError(old.error);assert.ifError(current.error);assert.deepEqual(trace(b.source),trace(a.source));assert.deepEqual(trace(b.archive),trace(a.archive));assert.deepEqual(current.http,old.http);assert.equal(current.http.length,2);
 for(const table of ['report2_hourly_market_archive_v1','report2_hourly_spot_archive_v1','report2_spot_archive_attempt_v1','report2_archive_run_v1'])assert.deepEqual(b.archive.raw.prepare('SELECT * FROM '+table).all(),a.archive.raw.prepare('SELECT * FROM '+table).all());
 const r=current.receipt;assert(r.row_totals_closed);assert(r.execution_completed);assert.equal(r.additional_SQL,0);assert.equal(r.daily_total,false);assert.equal(r.source_clocks_refreshed,false);
 for(const [key,db] of [['DATA_DB',b.source],['ARCHIVE_DB',b.archive]])for(const [k,v] of Object.entries(counts(db)))assert.equal(r.bindings[key][k],v,key+':'+k);
 assert.equal(r.total_rows_read,counts(b.source).measured_rows_read_subtotal+counts(b.archive).measured_rows_read_subtotal);assert(r.total_rows_read>b.source.calls.length+b.archive.calls.length);
 if(process.env.REPORT2_HOURLY_NATIVE_PROOF_OUTPUT){const files=['cloudflare/free-history/worker-entry.mjs','cloudflare/free-history/native-usage-receipt.mjs','cloudflare/free-history/fixtures/worker-entry-before-native-20261016.mjs','cloudflare/free-history/hourly-archive.mjs','cloudflare/free-history/spot-archive.mjs','cloudflare/public-collector/native-cost-observer.mjs'];fs.writeFileSync(process.env.REPORT2_HOURLY_NATIVE_PROOF_OUTPUT,JSON.stringify({schema:'HOURLY_NATIVE_OBSERVER_OFFLINE_QUALIFICATION_V1',exact_sql_params_and_archived_bytes_preserved:true,fixture_source_HTTP:2,additional_SQL:0,native_cost_qualified:false,fixture_receipt:r,files:files.map(path=>({path,sha256:createHash('sha256').update(fs.readFileSync(path)).digest('hex')}))},null,2)+'\n');}

});
test('native finally receipt includes a failed run-log INSERT and preserves that exact original exception',async()=>{
 const error=Error('EXACT_RUN_LOG_FAILURE'),fail=sql=>sql.startsWith('INSERT INTO report2_archive_run_v1');fail.error=error;
 const f=fixture({archive:{fail}}),r=await execute(worker,f);assert.equal(r.error,error);assert.equal(r.receipt.execution_completed,false);assert.equal(r.receipt.row_totals_closed,false);assert.equal(r.receipt.total_rows_read,null);assert.equal(r.receipt.bindings.ARCHIVE_DB.unknown_operations,1);assert(r.receipt.bindings.ARCHIVE_DB.measured_rows_written_subtotal>0);assert.equal(r.receipt.bindings.DATA_DB.row_totals_closed,true);assert.equal(f.archive.calls.filter(c=>c.sql.startsWith('INSERT INTO report2_archive_run_v1')).length,1);
});
test('missing native metadata never becomes zero total, and partial source does not authorize another source query',async()=>{
 const f=fixture({source:{missingMeta:true}}),r=await execute(worker,f);assert.ifError(r.error);assert.equal(r.receipt.bindings.DATA_DB.unknown_operations,2);assert.equal(r.receipt.bindings.DATA_DB.total_rows_read,null);assert.equal(r.receipt.total_rows_read,null);
 const missing=fixture({missingSource:true}),p=await execute(worker,missing);assert.ifError(p.error);assert.equal(missing.source.calls.length,1);assert.equal(p.http.length,2);assert.equal(p.receipt.bindings.DATA_DB.row_totals_closed,true);
});
test('repeated hourly no-op still measures its original lookup/run-log costs with distinct invocation ids and no source HTTP',async()=>{
 const f=fixture(),first=await execute(worker,f);f.source.calls.length=0;f.archive.calls.length=0;const second=await execute(worker,f);assert.ifError(second.error);assert.equal(second.http.length,0);assert.equal(second.receipt.bindings.DATA_DB.attempted_statements,0);assert(second.receipt.bindings.ARCHIVE_DB.total_rows_read>0);assert.notEqual(first.receipt.invocation_id,second.receipt.invocation_id);assert.equal(f.archive.calls.length,4);
});
test('an absent binding remains unmeasured, not a free invocation or a closed daily aggregate',()=>{
 assert.equal(nativeBindingUsage(null).attempted_statements,null);const r=hourlyNativeUsageReceipt({invocation_id:'exact',scheduled_ts:T,source:null,archive:null});assert.equal(r.row_totals_closed,false);assert.equal(r.total_rows_read,null);assert.equal(r.daily_total,false);assert.throws(()=>hourlyNativeUsageReceipt({invocation_id:'',scheduled_ts:T}));
});
