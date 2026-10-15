import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {PrivateArchiveD1API,combineMeasuredD1Usage} from './private-archive-d1-api.mjs';
import {createPrivateArchivePool} from './private-archive-pool.mjs';
import {PRIVATE_CANONICAL_DATABASES} from './private-canonical-history.mjs';
import {initializeFreeArchiveSchemas,reserveFreeArchiveSchemaBudget,FREE_ARCHIVE_SCHEMA_POLICY as P} from './free-archive-schema.mjs';
const T=1792080000000,zero=()=>({requests:0,rows_read:0,rows_written:0,unknown_ops:0});
function fixture(){
 const raw=Object.fromEntries(Object.keys(PRIVATE_CANONICAL_DATABASES).map(k=>[k,new DatabaseSync(':memory:')])),calls=[];
 const pool=createPrivateArchivePool({enabled:true,token:'fixture-only',fetch_impl:async(url,options)=>{
  const location=Object.keys(PRIVATE_CANONICAL_DATABASES).find(k=>url.includes(PRIVATE_CANONICAL_DATABASES[k].uuid));calls.push({location,method:options.method||'GET'});const d=PRIVATE_CANONICAL_DATABASES[location];
  if(!options.method)return new Response(JSON.stringify({success:true,result:{uuid:d.uuid,name:d.name}}));
  const {sql,params}=JSON.parse(options.body),result=sql.split(';').filter(s=>s.trim()).map(s=>{const select=s.trim().startsWith('SELECT');const results=select?raw[location].prepare(s).all(...params):[];if(!select)raw[location].exec(s);return{success:true,results,meta:{rows_read:select?results.length:2,rows_written:select?0:4,size_after:12288}};});return new Response(JSON.stringify({success:true,result}));
 }});return{pool,raw,calls};
}
test('schema bootstrap addresses only the four previously created empty archives and readbacks both fixed objects',async()=>{
 const {pool,raw,calls}=fixture();let guarded=0;
 const r=await initializeFreeArchiveSchemas({pool,source_usage:zero,before_mutate:async()=>{guarded++;},execute:true});assert.equal(r.status,'EXACT_FOUR_FREE_ARCHIVE_SCHEMAS_VERIFIED');assert.equal(guarded,4);assert.equal(calls.length,16);assert(calls.every(c=>c.location!=='LEGACY'));
 assert.equal(raw.LEGACY.prepare('SELECT COUNT(*) AS n FROM sqlite_schema').get().n,0);assert.equal(pool.usageSnapshot().rows_written,32);
 const again=await initializeFreeArchiveSchemas({pool,source_usage:zero,before_mutate:async()=>{throw Error('must be idempotent');},execute:true});assert(again.locations.every(l=>l.already_initialized));assert.equal(pool.usageSnapshot().rows_written,32);
});
test('prepare mode, a changed schema and denied mutation never create or replace an original object',async()=>{
 for(const kind of ['PREPARE','WRONG','GUARD']){const {pool,raw}=fixture();if(kind==='WRONG')raw.A1.exec('CREATE TABLE report2_canonical_cold_archive_v1(wrong TEXT)');
  const action=()=>initializeFreeArchiveSchemas({pool,source_usage:zero,before_mutate:async()=>{if(kind==='GUARD')throw Error('foreign lease');},execute:kind!=='PREPARE'});
  if(kind==='PREPARE')assert.equal((await action()).status,'FREE_ARCHIVE_SCHEMAS_PREPARED_NO_DDL');else await assert.rejects(action());assert.equal(pool.usageSnapshot().rows_written,0);
 }
});
test('unknown native usage blocks schema SQL before its first descriptor',async()=>{
 const {pool,calls}=fixture();await assert.rejects(initializeFreeArchiveSchemas({pool,source_usage:()=>({...zero(),unknown_ops:1}),before_mutate:async()=>{},execute:true}),/NATIVE_HEADROOM/);assert.equal(calls.length,0);
});
function ledger(){const raw=new DatabaseSync(':memory:');raw.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,unknown_ops INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER)');return{raw,prepare(sql){let args=[];return{bind(...a){args=a;return this;},async run(){const r=raw.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};},async first(){return raw.prepare(sql).get(...args);}};}};}
test('one DDL-only slot shares all existing costs, cannot refund four spent retention slots, and protects next full report',async()=>{
 const d=ledger(),day=new Date(T).toISOString().slice(0,10),add=(id,r,w,unknown=0)=>d.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?,?,?)').run(id,day,r,w,'FINALIZED',T,unknown,0,0);
 for(let n=0;n<4;n++)add('RETAINED_HISTORY:'+n+':1',5000,400);
 assert.equal((await reserveFreeArchiveSchemaBudget(d,{reservation_id:'FREE_ARCHIVE_SCHEMA_INIT:1:1',now:T})).allowed,true);assert.equal((await reserveFreeArchiveSchemaBudget(d,{reservation_id:'FREE_ARCHIVE_SCHEMA_INIT:2:1',now:T})).allowed,false);assert.equal(d.raw.prepare("SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow WHERE reservation_id LIKE 'RETAINED_HISTORY:%'").get().n,4);
 for(const [r,w,unknown] of [[P.day.rows_read-P.next_full.rows_read,0,0],[0,P.day.rows_written-P.next_full.rows_written,0],[0,0,1]]){const x=ledger();x.raw.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?,?,?)').run('other',day,r,w,'FINALIZED',T,unknown,0,0);assert.equal((await reserveFreeArchiveSchemaBudget(x,{reservation_id:'FREE_ARCHIVE_SCHEMA_INIT:1:1',now:T})).allowed,false);}
});
