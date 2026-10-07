import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=pathToFileURL(path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files')+'/');
const {normalizeBlueskyAttention,collectBlueskyAttentionEvidence,BLUESKY_ATTENTION_EVIDENCE_VERSION}=await import(new URL('src/bluesky-attention-evidence.mjs',root));
const {consumeEvidenceV2}=await import(new URL('src/evidence-v2.mjs',root));
const {consumeBlockResultContext}=await import(new URL('src/block-result-context.mjs',root));
const address='0x514910771af9ca656af840dff83e8264ecf986ca',identity={chain:'ethereum',contract_or_mint:address},N=Date.parse('2026-10-07T18:00:00.000Z'),args={contract:'LINK-USDT',identity,window_start:N-3600000,window_end:N,history_windows:30,history_days:7,observed_ts:N+1000};
const post=(createdAt,body=address,id='a')=>({uri:'at://did:plc:alice/app.bsky.feed.post/'+id,cid:'cid-'+id,author:{did:'did:plc:'+id},record:{text:body,createdAt},indexedAt:new Date(N-1000).toISOString()});
class St {constructor(db,sql,a=[]){this.db=db;this.sql=sql;this.a=a;}bind(...a){return new St(this.db,this.sql,a);}async run(){return this.db.s.prepare(this.sql).run(...this.a);}async first(){return this.db.s.prepare(this.sql).get(...this.a)||null;}}
class DB{constructor(){this.s=new DatabaseSync(':memory:');}prepare(sql){return new St(this,sql);}async batch(rows){return Promise.all(rows.map(x=>x.run()));}}
test('Original source post time is required even if AppView indexedAt is current',()=>{
 for(const clock of [undefined,'not-a-time',new Date(N-3600001).toISOString(),new Date(N).toISOString(),new Date(N+500).toISOString()]){
  const row=normalizeBlueskyAttention({...args,payload:{posts:[post(clock)]}});
  assert.equal(row.status,'POST_CLOCKS_NOT_CLOSED');assert.deepEqual(row.evidence,[]);assert.equal(row.rejected_post_clocks,1);assert.equal(consumeBlockResultContext({evidence:row.evidence,contract:args.contract,now:N+1000}).facts.length,0);
 }
});
test('Full exact bounded UTC window is required before it can warm history',()=>{
 for(const change of [{window_end:N+1001},{window_start:N},{window_start:N-3600001},{observed_ts:NaN},{window_start:-1},{window_end:null}]){
  const row=normalizeBlueskyAttention({...args,...change,payload:{posts:[]}});assert.equal(row.status,'EXACT_SOURCE_WINDOW_REQUIRED');assert.deepEqual(row.evidence,[]);
 }
 const row=normalizeBlueskyAttention({...args,payload:{posts:Array.from({length:101},(_,i)=>post(new Date(N-1000).toISOString(),address,String(i)))}});assert.equal(row.status,'BOUNDED_POST_SAMPLE_REQUIRED');assert.deepEqual(row.evidence,[]);
});
test('Exact token or mint match cannot be a substring of another address',()=>{
 const row=normalizeBlueskyAttention({...args,payload:{posts:[post(new Date(N-1000).toISOString(),'0x'+address.slice(2)+'ab','bad'),post(new Date(N-1000).toISOString(),'('+address+')','good')]}});
 assert.equal(row.status,'CLOSED');assert.equal(row.summary.original_posts,1);assert.equal(row.evidence[0].source_clock_policy,'EXACT_ORIGINAL_CREATED_AT_INSIDE_QUERY_WINDOW');assert.equal(row.evidence[0].post_clock_count,1);assert.equal(row.evidence[0].source_ts,N);assert.equal(consumeEvidenceV2(row.evidence,{base_interest:70,decision_ts:N+2000}).adjustment,0);assert.equal(row.evidence[0].directional_strength,null);
});
test('Rejected matching post clock does not create a zero-author historical window or current cache',async()=>{
 const db=new DB(),out=await collectBlueskyAttentionEvidence({db,fetch_impl:async()=>({ok:true,status:200,json:async()=>({posts:[post(new Date(N-7200000).toISOString())]})}),request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'LINK-USDT',asset_identity:identity,run_id:'CLOCK',now:N});
 assert.equal(out.status,'POST_CLOCKS_NOT_CLOSED');assert.equal(out.receipts[0].status,'POST_CLOCKS_NOT_CLOSED');assert.equal(out.network_calls,1);assert.equal(db.s.prepare('SELECT COUNT(*) AS n FROM report2_social_attention_window').get().n,0);
 const rows=db.s.prepare('SELECT COUNT(*) AS n FROM report2_evidence_source_cache').get().n;assert.equal(rows,0);
});
test('Empty verified bounded sample stays zero and warming instead of claiming market absence',async()=>{
 const db=new DB(),out=await collectBlueskyAttentionEvidence({db,fetch_impl:async()=>({ok:true,status:200,json:async()=>({posts:[]})}),request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'LINK-USDT',asset_identity:identity,run_id:'EMPTY',now:N});
 assert.equal(out.status,'CLOSED');assert.equal(out.summary.unique_authors,0);assert.equal(out.evidence[0].coverage_fraction,0);assert.equal(out.evidence[0].coverage_status,'WARMING_OR_SATURATED');assert.equal(out.evidence[0].directional_strength,null);
});
test('Solana case-sensitive mint keys do not share another exact asset cache',async()=>{
 const db=new DB(),mint='So11111111111111111111111111111111111111112',other='so11111111111111111111111111111111111111112';let calls=0;
 const go=async(m,run)=>collectBlueskyAttentionEvidence({db,fetch_impl:async()=>{calls++;return{ok:true,status:200,json:async()=>({posts:[post(new Date(N-1000).toISOString(),m)]})};},request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'SOL-USDT',asset_identity:{chain:'solana',contract_or_mint:m},run_id:run,now:N});
 const a=await go(mint,'ONE'),b=await go(other,'TWO');assert.equal(calls,2);assert.notEqual(a.evidence[0].asset_id,b.evidence[0].asset_id);assert.equal(a.evidence[0].token_address,mint);assert.equal(b.evidence[0].token_address,other);assert.equal(db.s.prepare('SELECT COUNT(*) AS n FROM report2_social_attention_window').get().n,2);
});
test('Same version cache hit uses zero new HTTP/admission and retains original evidence clocks',async()=>{
 const db=new DB();let calls=0,admissions=0;const go=now=>collectBlueskyAttentionEvidence({db,fetch_impl:async()=>{calls++;return{ok:true,status:200,json:async()=>({posts:[post(new Date(N-1000).toISOString())]})};},request_admit:()=>{admissions++;return{allowed:true,status:'RESERVED'};},contract:'LINK-USDT',asset_identity:identity,run_id:String(now),now});
 const a=await go(N),b=await go(N+10000);assert.equal(calls,1);assert.equal(admissions,1);assert.equal(b.network_calls,0);assert.equal(b.cache_status,'HIT');assert.equal(b.admission,null);assert.equal(b.whole_job_admission,null);assert.deepEqual(b.evidence,a.evidence);
});
test('Old access-denial global backoff persists across new valid-data cache version',async()=>{
 const db=new DB();let calls=0;const common={db,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'LINK-USDT',asset_identity:identity,now:N};
 const a=await collectBlueskyAttentionEvidence({...common,run_id:'BLOCKED',fetch_impl:async()=>{calls++;return{ok:false,status:403,json:async()=>({error:'Forbidden'})};}});assert.equal(a.status,'ACCESS_BLOCKED_403');
 const b=await collectBlueskyAttentionEvidence({...common,now:N+1000,run_id:'NEXT',fetch_impl:()=>{throw Error('IDENTICAL_DENIED_PROBE_MUST_NOT_RUN');}});
 assert.equal(calls,1);assert.equal(b.status,'ACCESS_BLOCKED_403');assert.equal(b.network_calls,0);assert.equal(b.cache_status,'GLOBAL_ACCESS_BACKOFF');
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/attention-post-clock-proof.json',JSON.stringify({schema:'ATTENTION_ORIGINAL_POST_CLOCK_CONNECTED_20261007_V1',version:BLUESKY_ATTENTION_EVIDENCE_VERSION,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,clocks_refreshed:false,valid_same_run_cache_uses_no_admission:true,old_global_backoff_preserved:true,score_entry_direction_unchanged:true,new_fresh_SENT:false},null,2)+'\n');
});
