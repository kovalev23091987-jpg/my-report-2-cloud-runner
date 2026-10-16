import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {repairExactInstalledSQLBridge,INSTALLED_SQL_BRIDGE_SOURCE_SHA256} from './sql-bridge-counter-repair.mjs';
import {RemoteD1Database} from './report2-d1-adapter.mjs';
const original=await fs.readFile(new URL('../current-generation/tests/fixtures/actual-d1-bridge-20261008.mjs',import.meta.url),'utf8');
const repaired=repairExactInstalledSQLBridge(original),old=(await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'))).default,fixed=(await import('data:text/javascript;base64,'+Buffer.from(repaired.source).toString('base64'))).default;
const TOKEN='controlled-bridge-token',url='https://controlled.invalid/d1';
function fixture({meta={rows_read:7,rows_written:0},success=true,throwSQL=false,results}={}){
 const calls=[],result={success,meta,results:[{id:8,value:'same bytes'}]};
 const env={REPORT2_CLOUD_BRIDGE_TOKEN:TOKEN,DATA_DB:{
  prepare(sql){
   const x={sql,params:[]};calls.push(x);
   return{bind(...params){x.params=params;return{
    async all(){if(throwSQL)throw Error('CONTROLLED_NATIVE_ERROR');return result;},
    async run(){if(throwSQL)throw Error('CONTROLLED_NATIVE_ERROR');return result;},
    async raw(){return[[8,'same bytes']];}
   };}};
  },
  async batch(stmts){return results??stmts.map(()=>result);},
  async exec(sql){calls.push({sql});return{count:1,duration:2};}
 }};
 return{calls,env,result};
}
async function call(worker,body,f=fixture(),headers={authorization:'Bearer '+TOKEN}){const r=await worker.fetch(new Request(url,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body)}),f.env);return{status:r.status,json:await r.json(),f};}
const single=(op='all')=>({op,sql:'SELECT ?1 AS id',params:[8]});
test('exact installed source admits only bounded accounting spans and no activation',()=>{assert.equal(repaired.proof.original_module_sha256,INSTALLED_SQL_BRIDGE_SOURCE_SHA256);assert.equal(repaired.proof.changed_spans.reduce((n,x)=>n+x.occurrences,0),8);assert.equal(repaired.proof.production_activation_authorized,false);assert.equal(repaired.proof.SQL_or_params_changed,false);assert.throws(()=>repairExactInstalledSQLBridge(original+' '),/EXACT_INSTALLED/);});
test('installed original falsely closes missing write while prepared repair preserves read and unknown',async()=>{for(const op of ['first','all','run']){const a=await call(old,single(op),fixture({meta:{rows_read:7}})),b=await call(fixed,single(op),fixture({meta:{rows_read:7}}));assert.deepEqual(a.json.result,b.json.result);assert.deepEqual(a.json.usage,{measured:true,rows_read:7,rows_written:0});assert.deepEqual(b.json.usage,{measured:false,rows_read:7,rows_written:null});}});
test('installed original falsely closes missing read while prepared repair preserves write and unknown',async()=>{const a=await call(old,single(),fixture({meta:{rows_written:3}})),b=await call(fixed,single(),fixture({meta:{rows_written:3}}));assert.equal(a.json.usage.measured,true);assert.deepEqual(b.json.usage,{measured:false,rows_read:null,rows_written:3});});
test('nulls, strings, fractions, negatives and unsafe counters are never invented as known native zero',async()=>{for(const value of [null,'0','',-1,1.25,Number.MAX_SAFE_INTEGER+1]){const b=await call(fixed,single(),fixture({meta:{rows_read:value,rows_written:2}}));assert.deepEqual(b.json.usage,{measured:false,rows_read:null,rows_written:2});}});
test('real safe integer zeroes and complete native counters remain closed and result bytes unchanged',async()=>{for(const meta of [{rows_read:0,rows_written:0},{rows_read:39,rows_written:5}])for(const op of ['first','all','run']){const a=await call(old,single(op),fixture({meta})),b=await call(fixed,single(op),fixture({meta}));assert.deepEqual(b.json,a.json);assert.deepEqual(b.f.calls,a.f.calls);}});
test('success=false keeps both known native costs and refuses complete measurement',async()=>{const b=await call(fixed,single(),fixture({success:false,meta:{rows_read:6,rows_written:2}}));assert.deepEqual(b.json.usage,{measured:false,rows_read:6,rows_written:2});assert.equal(b.json.result.success,false);});
test('batch keeps each partial and failed member, exact order and known disjoint subtotals',async()=>{const results=[{success:true,meta:{rows_read:3}},{success:false,meta:{rows_read:4,rows_written:2}},{success:true,meta:{rows_written:5}}],b=await call(fixed,{op:'batch',statements:[single(),single(),single()]},fixture({results}));assert.deepEqual(b.json.result,results);assert.deepEqual(b.json.usage,{measured:false,rows_read:7,rows_written:7,statements:[{measured:false,rows_read:3,rows_written:null},{measured:false,rows_read:4,rows_written:2},{measured:false,rows_read:null,rows_written:5}]});});
test('raw and exec without native billing counters stay unknown with their result unchanged',async()=>{for(const op of ['raw','exec']){const a=await call(old,single(op)),b=await call(fixed,single(op));assert.deepEqual(b.json.result,a.json.result);assert.deepEqual(b.json.usage,{measured:false,rows_read:null,rows_written:null});}});
test('SQL exceptions cannot become a zero cost successful reply',async()=>{const a=await call(old,single(),fixture({throwSQL:true})),b=await call(fixed,single(),fixture({throwSQL:true}));assert.equal(b.status,500);assert.deepEqual(b.json,a.json);assert.equal(Object.hasOwn(b.json,'usage'),false);});
test('authentication and unsupported operations still refuse before database prepare',async()=>{for(const worker of [old,fixed]){const f=fixture(),r=await call(worker,single(),f,{authorization:'Bearer wrong'});assert.equal(r.status,401);assert.equal(f.calls.length,0);const g=fixture(),s=await call(worker,{op:'not-allowed'},g);assert.equal(s.status,400);assert.equal(g.calls.length,0);}});
test('existing Node adapter preserves repaired read subtotal and unknown through first/all/run',async()=>{for(const op of ['first','all','run']){const f=fixture({meta:{rows_read:7}}),db=new RemoteD1Database(url,TOKEN,{nativeQueryReceipts:true,fetchImpl:(u,opt)=>fixed.fetch(new Request(u,opt),f.env)});await db.prepare('SELECT ?1 AS id').bind(8)[op]();const usage=db.usageSnapshot(),journal=db.nativeQueryCostReceipts();assert.equal(usage.rows_read,7);assert.equal(usage.rows_written,0);assert.equal(usage.unknown_ops,1);assert.equal(journal.receipts[0].rows_read,7);assert.equal(journal.receipts[0].rows_written,null);assert.equal(journal.receipts[0].unknown,true);}});
test('existing Node adapter keeps repaired batch member counts and no fabricated closure',async()=>{const f=fixture({results:[{success:true,meta:{rows_read:3}},{success:true,meta:{rows_written:5}}]}),db=new RemoteD1Database(url,TOKEN,{nativeQueryReceipts:true,fetchImpl:(u,opt)=>fixed.fetch(new Request(u,opt),f.env)});await db.batch([db.prepare('SELECT 1'),db.prepare('SELECT 2')]);const u=db.usageSnapshot(),j=db.nativeQueryCostReceipts();assert.equal(u.rows_read,3);assert.equal(u.rows_written,5);assert.equal(u.unknown_ops,2);assert.equal(j.receipts.length,2);assert.ok(j.receipts.every(x=>x.unknown));});
