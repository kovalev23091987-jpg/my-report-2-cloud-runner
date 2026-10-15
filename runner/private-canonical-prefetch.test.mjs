import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {encodeCanonicalPublicationRow} from './canonical-cold-archive.mjs';
import {prefetchExactCanonicalRevisions,PRIVATE_PREFETCH_LIMITS} from './private-canonical-prefetch.mjs';
import {PrivateArchiveD1API} from './private-archive-d1-api.mjs';
import {privateCanonicalHeader,createPrivateCanonicalRestorer} from './private-canonical-history.mjs';
const allow=()=>({allowed:true});
const noise=Array.from({length:500},(_,i)=>createHash('sha256').update('bounded-fixture-'+i).digest('hex')).join('');
function original(i){
 const publication_id='PUB:'+i.toString(16).padStart(40,'0'),analytical_fingerprint='f'.repeat(64),run_id='retained-original',snapshot_id='snapshot-'+i,contract_code='FIL-USDT',observed_ts=1791900000000+i;
 const canonical={contract:contract_code,run_id,snapshot_id,observed_ts,analytical_fingerprint,state:'REJECTED',fixture:noise};
 return{publication_id,analytical_fingerprint,run_id,snapshot_id,contract_code,observed_ts,canonical_json:JSON.stringify(canonical),presentation_inputs_json:'{}',manual_text:noise,telegram_text:noise};
}
function fixture(count=48,{alter}={}){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE report2_canonical_cold_archive_v1(publication_id TEXT,raw_sha256 TEXT,record_json TEXT,PRIMARY KEY(publication_id,raw_sha256))');
 const rows=Array.from({length:count},(_,i)=>original(i+1)),records=rows.map(encodeCanonicalPublicationRow);
 for(const r of records)sqlite.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?)').run(r.publication_id,r.raw_sha256,JSON.stringify(r));
 const queries=[],plans=[];
 const db=new PrivateArchiveD1API({token:'controlled-private-token',fetch_impl:async(url,init)=>{
  assert.match(url,/f66e7081-0e67-49a2-8f69-68af00cdaf92\/query$/);
  const {sql,params}=JSON.parse(init.body);queries.push(sql);plans.push(sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...params));
  let result=sqlite.prepare(sql).all(...params).map(r=>({...r}));if(alter)result=alter(result,sql);
  return new Response(JSON.stringify({success:true,result:[{success:true,results:result,meta:{rows_read:result.length,rows_written:0,size_after:100000}}]}));
 }});
 return{sqlite,db,rows,records,queries,plans};
}
test('48 immutable exact revisions use seven controlled private queries and restore their original bytes',async()=>{
 const f=fixture();try{
  const p=await prefetchExactCanonicalRevisions({archive_db:f.db,revisions:f.records,db_admit:allow});
  assert.equal(p.receipt.cached,48);assert.equal(p.receipt.metadata_queries,1);assert.equal(p.receipt.body_queries,6);assert.equal(f.queries.length,7);
  assert.equal(p.receipt.native_production_cost_qualified,false);assert.equal(p.receipt.primary_rows_modified,0);
  for(let i=0;i<48;i+=8){const headers=await Promise.all(f.rows.slice(i,i+8).map((r,j)=>privateCanonicalHeader(r,f.records[i+j])));const reader=createPrivateCanonicalRestorer({archive_db:p.archive_db,db_admit:allow,max_rows:8});assert.deepEqual(await reader.restore(headers),f.rows.slice(i,i+8));}
  assert.equal(f.queries.length,7);assert.equal(f.db.usageSnapshot().rows_written,0);
  assert.ok(f.plans.flat().every(r=>!/^SCAN /i.test(r.detail)));
  if(process.env.REPORT2_PREFETCH_PROOF_OUTPUT)await import('node:fs').then(({writeFileSync})=>writeFileSync(process.env.REPORT2_PREFETCH_PROOF_OUTPUT,JSON.stringify({status:'CONTROLLED_SQLITE_REST_FIXTURE_ONLY',revisions:48,private_queries:7,previous_single_lookup_queries:48,primary_mutations:0,provider_HTTP:0,production_D1:0,native_cost_qualified:false,source_clocks_refreshed:false},null,2)+'\n'));
 }finally{f.sqlite.close();}
});
test('missing revisions are not negatively cached across a concurrent writer',async()=>{
 const f=fixture(1);try{
  const second=encodeCanonicalPublicationRow(original(2)),p=await prefetchExactCanonicalRevisions({archive_db:f.db,revisions:[...f.records,second],db_admit:allow});
  assert.equal(p.receipt.missing.length,1);f.sqlite.prepare('INSERT INTO report2_canonical_cold_archive_v1 VALUES(?,?,?)').run(second.publication_id,second.raw_sha256,JSON.stringify(second));
  const read=await p.archive_db.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind(second.publication_id,second.raw_sha256).first();assert.deepEqual(JSON.parse(read.record_json),second);assert.equal(f.queries.length,3);
 }finally{f.sqlite.close();}
});
test('foreign, duplicate, corrupt and oversized results never produce a usable cache',async()=>{
 for(const kind of ['FOREIGN','DUPLICATE','CORRUPT','OVERSIZED']){
  const f=fixture(2,{alter:(rows,sql)=>{
   if(!/^SELECT record_json /.test(sql))return rows;
   if(kind==='FOREIGN')return[{record_json:JSON.stringify(encodeCanonicalPublicationRow(original(99)))},rows[1]];
   if(kind==='DUPLICATE')return[rows[0],rows[0]];
   if(kind==='CORRUPT'){const bad=JSON.parse(rows[0].record_json);bad.payload_gzip_base64=bad.payload_gzip_base64.replace(/^./,'?');return[{record_json:JSON.stringify(bad)},rows[1]];}
   return[{record_json:'x'.repeat(PRIVATE_PREFETCH_LIMITS.response_wire_bytes)},rows[1]];
  }});try{await assert.rejects(prefetchExactCanonicalRevisions({archive_db:f.db,revisions:f.records,db_admit:allow}));assert.equal(f.db.usageSnapshot().rows_written,0);}finally{f.sqlite.close();}
 }
});
test('denied admission and invalid scope stop before the first private transport',async()=>{
 const f=fixture(1);try{
  await assert.rejects(prefetchExactCanonicalRevisions({archive_db:f.db,revisions:f.records,db_admit:()=>({allowed:false})}),/D1_DENIED/);
  await assert.rejects(prefetchExactCanonicalRevisions({archive_db:f.db,revisions:[...f.records,...f.records],db_admit:allow}),/DUPLICATE/);
  await assert.rejects(prefetchExactCanonicalRevisions({archive_db:f.db,revisions:[{}],db_admit:allow}),/EXACT_INPUT/);assert.equal(f.queries.length,0);
 }finally{f.sqlite.close();}
});
