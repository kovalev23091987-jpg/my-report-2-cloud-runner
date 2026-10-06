import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {parseHtxAnnouncementCatalog,collectHtxOfficialAnnouncements,HTX_OFFICIAL_ANNOUNCEMENTS_VERSION,HTX_OFFICIAL_ANNOUNCEMENTS_URL} from '../files/src/htx-official-announcements-evidence.mjs';
import {installEvidenceSourceStore,writeEvidenceSourceCache,readEvidenceSourceCache} from '../files/src/evidence-source-store.mjs';
const T=1791249836477,TTL=21600000,raw=gunzipSync(fs.readFileSync(new URL('./fixtures/actual-htx-support-37398931948.html.gz',import.meta.url))),sha='843cd4f08e62e7feca68456d23baa562607ffb8234bd1cc75a4371cad9a0cc8a';
const db=()=>{const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};};
async function seed(database,{observed=T,expires=T+TTL}={}){
 await installEvidenceSourceStore(database);
 await writeEvidenceSourceCache(database,{source:'HTX_OFFICIAL_ANNOUNCEMENTS',asset_key:'HTX_SUPPORT_360000039942_V1',observed_ts:observed,expires_ts:expires,payload:{version:HTX_OFFICIAL_ANNOUNCEMENTS_VERSION,run_id:'N07_TRANSPORT:37398931948:1',catalog:parseHtxAnnouncementCatalog({body:raw.toString(),observed_ts:T}),response_sha256:sha,receipts:[{status:'CLOSED',http_status:200}]}});
}
test('actual official HTTP200 body parses and original bounded NEAR absence stays an absence, not a useful directional fact',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),sha);
 assert.equal(HTX_OFFICIAL_ANNOUNCEMENTS_URL,'https://www.htx.com/support/list/360000039942/');
 const catalog=parseHtxAnnouncementCatalog({body:raw.toString(),observed_ts:T});
 assert.equal(catalog.status,'CLOSED');assert.equal(catalog.entries.length,20);
 assert.ok(catalog.entries.every(r=>r.source_ts<=T&&r.url.startsWith('https://www.htx.com/')));
});
test('actual catalog cache reused on a new run preserves original DB clock, first knowledge and expiry without HTTP or renewed TTL',async()=>{
 const d=db();try{
  await seed(d);const cached=await readEvidenceSourceCache(d,{source:'HTX_OFFICIAL_ANNOUNCEMENTS',asset_key:'HTX_SUPPORT_360000039942_V1',now:T+1800000,include_cache_clock:true});
  assert.equal(cached.cache_observed_ts,T);assert.equal(cached.cache_expires_ts,T+TTL);
  const normal=await readEvidenceSourceCache(d,{source:'HTX_OFFICIAL_ANNOUNCEMENTS',asset_key:'HTX_SUPPORT_360000039942_V1',now:T+1800000});
  assert.equal('cache_observed_ts' in normal,false);
  const result=await collectHtxOfficialAnnouncements({db:d,contract:'NEAR-USDT',run_id:'NEW_NATURAL_RUN',now:T+1800000,request_admit:()=>{throw Error('UNEXPECTED_HTTP_ADMISSION');},fetch_impl:()=>{throw Error('UNEXPECTED_HTTP');}});
  assert.equal(result.status,'CLOSED_BOUNDED_HTX_ANNOUNCEMENT_CHECK');assert.equal(result.check_completed,true);assert.equal(result.network_calls,0);assert.equal(result.cache_clock_preserved,true);
  assert.equal(result.checked_entry_count,20);assert.equal(result.events.length,0);assert.equal(result.evidence.length,1);
  for(const row of result.evidence){assert.equal(row.source_ts,T);assert.equal(row.observed_ts,T);assert.equal(row.first_known_ts,T);assert.equal(row.expires_at,T+TTL);assert.equal(row.catalog_response_sha256,sha);assert.equal(row.htx_contract,'NEAR-USDT');assert.equal(row.entry_authorized,false);assert.equal(row.score_contribution,0);}
 }finally{d.sqlite.close();}
});
test('future cache clocks and enlarged expiration fail closed without source request, cap reset or fabricated observation',async()=>{
 for(const clocks of [{observed:T+7200000,expires:T+7200000+TTL},{observed:T,expires:T+TTL+1}]){
  const d=db();try{await seed(d,clocks);const r=await collectHtxOfficialAnnouncements({db:d,contract:'NEAR-USDT',run_id:'CLOCK_BAD',now:T+1800000,request_admit:()=>{throw Error('NO_RETRY');},fetch_impl:()=>{throw Error('NO_HTTP');}});
   assert.equal(r.status,'CACHE_CATALOG_CLOCK_NOT_CLOSED');assert.equal(r.network_calls,0);assert.equal(r.check_completed,false);assert.deepEqual(r.evidence,[]);
  }finally{d.sqlite.close();}
 }
});
