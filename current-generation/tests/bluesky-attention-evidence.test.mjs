import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeBlueskyAttention,blueskyFailureStatus,collectBlueskyAttentionEvidence} from '../files/src/bluesky-attention-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

const address='0x514910771af9ca656af840dff83e8264ecf986ca',identity={chain:'ethereum',contract_or_mint:address};
const post=(uri,did,body)=>({uri,cid:`cid-${uri}`,author:{did},record:{text:body,createdAt:'2026-09-28T00:00:00Z'},indexedAt:'2026-09-28T00:00:01Z'});
class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}

test('K16 Bluesky counts unique exact-address authors and deduplicates posts',()=>{
 const payload={posts:[post('a','did:plc:1',`watch ${address}`),post('a','did:plc:1',`watch ${address}`),post('b','did:plc:1',`again ${address}`),post('c','did:plc:2',`new ${address.toUpperCase()}`),post('d','did:plc:3','LINK only')]};
 const row=normalizeBlueskyAttention({contract:'LINK-USDT',identity,payload,window_start:0,window_end:1000,history_windows:30,history_days:7,observed_ts:1100});
 assert.equal(row.status,'CLOSED');assert.equal(row.summary.unique_authors,2);assert.equal(row.summary.original_posts,3);assert.equal(row.evidence[0].coverage_fraction,1);assert.equal(row.evidence[0].directional_strength,null);assert.equal(consumeEvidenceV2(row.evidence,{base_interest:70,decision_ts:1200}).adjustment,0);
});

test('K16 Bluesky remains warming before thirty windows over seven days',()=>{
 const row=normalizeBlueskyAttention({contract:'LINK-USDT',identity,payload:{posts:[]},window_start:0,window_end:1000,history_windows:29,history_days:7,observed_ts:1100});assert.equal(row.evidence[0].coverage_status,'WARMING_OR_SATURATED');assert.equal(row.evidence[0].coverage_fraction,0);
});

test('K16 Bluesky rejects ticker-only identity and preserves Solana case',()=>{
 assert.equal(normalizeBlueskyAttention({contract:'LINK-USDT',identity:{chain:'ethereum',contract_or_mint:'LINK'},payload:{posts:[]},window_start:0,window_end:1,observed_ts:2}).status,'EXACT_ASSET_IDENTITY_REQUIRED');
 const mint='So11111111111111111111111111111111111111112',row=normalizeBlueskyAttention({contract:'SOL-USDT',identity:{chain:'solana',contract_or_mint:mint},payload:{posts:[post('a','did:plc:1',mint.toLowerCase())]},window_start:0,window_end:1,observed_ts:2});assert.equal(row.summary.original_posts,0);
});

test('K16 Bluesky access denial is not misclassified as an empty valid sample',()=>{
 assert.equal(blueskyFailureStatus(403),'ACCESS_BLOCKED_403');assert.equal(blueskyFailureStatus(401),'ACCESS_BLOCKED_401');assert.equal(blueskyFailureStatus(500),'SOURCE_ERROR');
});

test('K31 Bluesky HTTP 200 malformed JSON is invalid and is not stored as zero authors',async()=>{
 const out=await collectBlueskyAttentionEvidence({db:new DB(),fetch_impl:async()=>({ok:true,status:200,json:async()=>null}),request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'LINK-USDT',run_id:'R-BAD',asset_identity:identity,now:Date.parse('2026-09-28T03:00:00Z')});
 assert.equal(out.status,'INVALID_RESPONSE');assert.equal(out.receipts[0].status,'INVALID_RESPONSE');assert.equal(out.evidence.length,0);
});
test('K31 Bluesky uses the working public AppView host',async()=>{
 let requested='';const out=await collectBlueskyAttentionEvidence({db:new DB(),fetch_impl:async url=>{requested=String(url);return{ok:true,status:200,json:async()=>({posts:[]})};},request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'LINK-USDT',run_id:'R-HOST',asset_identity:identity,now:Date.parse('2026-10-01T03:00:00Z')});
 assert.match(requested,/^https:\/\/api\.bsky\.app\/xrpc\/app\.bsky\.feed\.searchPosts\?/u);assert.equal(out.status,'CLOSED');
});
