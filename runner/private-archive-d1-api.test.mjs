import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivateArchiveD1API,combineMeasuredD1Usage} from './private-archive-d1-api.mjs';
const TOKEN='private-test-token-only',UUID='f66e7081-0e67-49a2-8f69-68af00cdaf92';
const reply=(rows=[],read=1,written=0,size=8192)=>new Response(JSON.stringify({success:true,result:[{success:true,results:rows,meta:{rows_read:read,rows_written:written,size_after:size}}]}));
test('only the pinned private DB receives the header, and actual native usage is retained',async()=>{
 const calls=[],db=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async(url,options)=>{calls.push({url,options});return reply([{record_json:'{}'}],1,0,12288);}});
 assert.deepEqual(await db.prepare('SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1').bind('publication','hash').first(),{record_json:'{}'});assert.equal(db.storage_bytes,12288);assert.deepEqual(db.usageSnapshot(),{requests:1,rows_read:1,rows_written:0,unknown_ops:0});assert.ok(calls[0].url.endsWith('/'+UUID+'/query'));assert.equal(calls[0].options.headers.authorization,'Bearer '+TOKEN);assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.body.includes(TOKEN),false);
});
test('main, foreign tables and destructive SQL cannot be requested by this writer',async()=>{
 let calls=0;const db=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>{calls++;return reply();}});
 for(const sql of ['DELETE FROM report2_canonical_cold_archive_v1','SELECT * FROM canonical_publication_shadow','DROP TABLE report2_canonical_cold_archive_v1','UPDATE report2_canonical_cold_archive_v1 SET record_json=?1'])await assert.rejects(db.query(sql),/SQL_ROUTE_REQUIRED/);assert.equal(calls,0);
});
test('descriptor permission failure is explicit and precedes all D1 query execution',async()=>{
 const db=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>new Response('{}',{status:403})});await assert.rejects(db.verifyDatabase(),/ACCESS_REQUIRED_HTTP_403/);assert.deepEqual(db.usageSnapshot(),{requests:0,rows_read:0,rows_written:0,unknown_ops:0});
});
test('query auth rejection preserves zero native execution; unmeasured timeout fails closed',async()=>{
 const denied=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>new Response('{}',{status:403})});await assert.rejects(denied.query('SELECT 1'),/ACCESS_REQUIRED_HTTP_403/);assert.equal(denied.usageSnapshot().unknown_ops,0);
 const broken=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>{throw Error(TOKEN);}});await assert.rejects(broken.query('SELECT 1'),e=>e.message==='PRIVATE_ARCHIVE_D1_TRANSPORT_UNMEASURED'&&!e.message.includes(TOKEN));assert.equal(broken.usageSnapshot().unknown_ops,1);
});
test('missing native counters and incomplete batch receipts cannot silently charge zero',async()=>{
 const a=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>new Response(JSON.stringify({success:true,result:[{success:true,results:[],meta:{}}]}))});await assert.rejects(a.query('SELECT 1'),/USAGE_UNMEASURED/);assert.equal(a.usageSnapshot().unknown_ops,1);
 const b=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>reply()});await assert.rejects(b.query('SELECT 1; SELECT 1'),/QUERY_NOT_CLOSED/);assert.equal(b.usageSnapshot().unknown_ops,1);
});
test('both databases count against one shared reservation, including unknown operations',()=>{
 assert.deepEqual(combineMeasuredD1Usage({requests:4,rows_read:35,rows_written:3,unknown_ops:0},{requests:3,rows_read:2,rows_written:4,unknown_ops:0}),{requests:7,rows_read:37,rows_written:7,unknown_ops:0});assert.throws(()=>combineMeasuredD1Usage({rows_read:1}),/USAGE_INVALID/);
});
test('an incomplete first batch receipt retains every known later native cost and pins each new location',async()=>{
 const db=new PrivateArchiveD1API({location:'A4',token:TOKEN,fetch_impl:async url=>{assert(url.includes('4c15f527-0287-484a-9dd1-bf1bd5c4f7c6'));return new Response(JSON.stringify({success:true,result:[{success:true,results:[],meta:{rows_read:3}},{success:true,results:[],meta:{rows_read:7,rows_written:9,size_after:16384}}]}));}});
 await assert.rejects(db.query('SELECT 1; SELECT 1'),/USAGE_UNMEASURED/);assert.deepEqual(db.usageSnapshot(),{requests:2,rows_read:10,rows_written:9,unknown_ops:1});assert.throws(()=>new PrivateArchiveD1API({location:'foreign',token:TOKEN}),/EXACT_LOCATION/);
});
test('a latest native reply without size cannot inherit earlier apparent free capacity',async()=>{
 let n=0;const db=new PrivateArchiveD1API({token:TOKEN,fetch_impl:async()=>++n===1?reply([],1,0,4096):new Response(JSON.stringify({success:true,result:[{success:true,results:[],meta:{rows_read:1,rows_written:0}}]}))});await db.query('SELECT 1');assert.equal(db.storage_bytes,4096);await db.query('SELECT 1');assert.equal(db.storage_bytes,null);assert.equal(db.usageSnapshot().unknown_ops,0);
});
test('local whole HTTP refusal happens before transport and never fabricates unknown native work',async()=>{
 let sent=0;const events=[],db=new PrivateArchiveD1API({token:TOKEN,beforeRequest:event=>{events.push(event);return{allowed:false};},fetch_impl:async()=>{sent++;throw Error('must not send');}});
 await assert.rejects(db.query('SELECT 1'),/LOCAL_HTTP_ADMISSION_DENIED/);await assert.rejects(db.verifyDatabase(),/LOCAL_HTTP_ADMISSION_DENIED/);
 assert.equal(sent,0);assert.deepEqual(db.usageSnapshot(),{requests:0,rows_read:0,rows_written:0,unknown_ops:0});assert.deepEqual(events.map(e=>e.operation),['query','descriptor']);assert.ok(events.every(e=>!Object.hasOwn(e,'sql')&&!JSON.stringify(e).includes(TOKEN)));
});
