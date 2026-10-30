import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {normalizeCoingeckoSector,collectCoingeckoSectorEvidence}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(modulePath('evidence-source-store.mjs'));
const {consumeSectorContext}=await import(modulePath('sector-context.mjs'));
const {formatManualReport}=await import(modulePath('manual-report-formatter.mjs'));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(modulePath('canonical-publication.mjs'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const actualRaw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/tron-sector-live-38570989795/validation.json.gz',import.meta.url))),actual=JSON.parse(actualRaw);
assert.equal(sha(actualRaw),'09f289569ce20757529c049e06815fd43b3eb03c182f292ad5db6865c4526429');
const identityRaw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url)));
assert.equal(sha(identityRaw),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const identity=normalizeHtxAssetReferences(JSON.parse(identityRaw)).entries.WIN.identities[0];
const metadata=actual.responses.find(r=>r.url.includes('/contract/'+identity.contract_or_mint)),quotes=actual.responses.find(r=>r.url.includes('&category=oracle&'));
const directory=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/native-sector-rest-38564913120/validation.json.gz',import.meta.url)))).responses.find(r=>r.url.endsWith('/categories/list'));
for(const r of [metadata,quotes,directory])assert.equal(sha(r.body),r.body_sha256);
const observed=Math.max(metadata.received_ts,quotes.received_ts,directory.received_ts),now=actual.completed_ts;
const inputs=()=>({metadata:JSON.parse(metadata.body),categories:JSON.parse(directory.body),quotes:JSON.parse(quotes.body),identity,contract:'WIN-USDT',coin_id:'wink',category_id:'oracle',category_name:'Oracle',observed_ts:observed});
const original=normalizeCoingeckoSector(inputs()),peerID=original.evidence[0].peers[0].id;
test('actual saved WIN source bodies preserve17peers, original numbers and original receipt clock',()=>{
 assert.equal(original.status,'CLOSED');assert.equal(original.summary.eligible_peers,17);assert.equal(original.evidence[0].observed_ts,1791984066366);assert.equal(original.evidence[0].source_ts,1791983988000);assert.equal(consumeSectorContext({evidence:original.evidence,contract:'WIN-USDT',asset_identity:identity,now}).facts.length,1);
});
const bad={boolean:true,array:[1],nested_array:[[1]],empty_array:[],object:{},whitespace:'   '};
for(const field of ['current_price','total_volume','price_change_percentage_24h'])for(const [name,value]of Object.entries(bad)){
 test(`saved WIN target raw ${field} ${name} does not become a provider number`,()=>{
  const p=inputs();p.quotes.find(r=>r.id==='wink')[field]=field==='total_volume'&&Array.isArray(value)&&value.length?[200000]:value;
  assert.equal(normalizeCoingeckoSector(p).evidence.length,0);
 });
 test(`saved WIN peer raw ${field} ${name} is omitted while16valid peers survive`,()=>{
  const p=inputs();p.quotes.find(r=>r.id===peerID)[field]=field==='total_volume'&&Array.isArray(value)&&value.length?[200000]:value;
  const r=normalizeCoingeckoSector(p);assert.equal(r.status,'CLOSED');assert.equal(r.summary.eligible_peers,16);assert(!r.evidence[0].peers.some(peer=>peer.id===peerID));
 });
}
test('actual saved numeric values remain valid as finite scalar strings',()=>{
 const p=inputs();for(const q of p.quotes)for(const k of ['current_price','total_volume','price_change_percentage_24h'])if(typeof q[k]==='number')q[k]=String(q[k]);
 const r=normalizeCoingeckoSector(p);assert.deepEqual(r.evidence,original.evidence);
});
test('finite quote values with overflowing median/difference do not emit a nonfinite fact',()=>{
 const p=inputs();p.quotes.find(r=>r.id==='wink').price_change_percentage_24h=1e308;for(const peer of original.evidence[0].peers)p.quotes.find(q=>q.id===peer.id).price_change_percentage_24h=-1e308;
 assert.equal(normalizeCoingeckoSector(p).evidence.length,0);
});
test('a null unrelated quote row cannot erase the actual saved target and17peers',()=>{
 const p=inputs();p.quotes.unshift(null);const r=normalizeCoingeckoSector(p),{raw_hash,returned_category_rows,...fact}=r.evidence[0],{raw_hash:oldHash,returned_category_rows:oldCount,...originalFact}=original.evidence[0];
 assert.deepEqual(fact,originalFact);assert.equal(returned_category_rows,oldCount+1);assert.notEqual(raw_hash,oldHash);
});
test('a null unrelated category row cannot erase exact saved Oracle membership',()=>{
 const p=inputs();p.categories.unshift(null);assert.deepEqual(normalizeCoingeckoSector(p).evidence,original.evidence);
});
function database(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}};}
test('exact original reference bodies retain0HTTP source/cache/consumer/manual/V5 with approved brief omission',async t=>{
 t.mock.timers.enable({apis:['Date'],now});const db=database();let calls=0,grants=0;
 try{
  await installEvidenceSourceStore(db);for(const r of [metadata,directory,quotes]){const ttl=r===quotes?60000:r===directory?3600000:21600000;await writeEvidenceSourceCache(db,{source:'COINGECKO_SECTOR',asset_key:'REFERENCE:provider-reference-cache-v1-20261004:'+sha(r.url),observed_ts:r.received_ts,expires_ts:r.received_ts+ttl,payload:{version:'provider-reference-cache-v1-20261004',url:r.url,received_ts:r.received_ts,expires_ts:r.received_ts+ttl,body:r.body,body_sha256:r.body_sha256}});}
  const p={db,contract:'WIN-USDT',asset_identity:identity,asset_metadata:{},run_id:'CG_RAW_NUMBERS_SAVED',now,request_admit:()=>{grants++;return{allowed:false};},fetch_impl:()=>{calls++;throw Error('NO_NEW_HTTP');}},source=await collectCoingeckoSectorEvidence(p),cache=await collectCoingeckoSectorEvidence({...p,run_id:'CG_RAW_NUMBERS_CACHE'});
  assert.equal(source.status,'CLOSED');assert.deepEqual(source.evidence,original.evidence);assert.deepEqual(cache.evidence,source.evidence);assert.equal(calls,0);assert.equal(grants,0);
  const sector=consumeSectorContext({evidence:source.evidence,contract:p.contract,asset_identity:identity,now});assert.equal(sector.facts.length,1);assert.equal(sector.score_contribution,0);
  const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);c.observed_ts=now;c.snapshot_id=`S392:WIN-USDT:${now}`;c.metadata.contract='WIN-USDT';c.metadata.internal_market_context.evidence_v2.evidence=source.evidence;c.metadata.internal_market_context.candidate_context={asset_identity:identity};c.metadata.supporting_context={facts:sector.facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c),v5=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),brief=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_BRIEF_20261007'});
  assert.equal(manual.ok,true);assert.equal(v5.ok,true);assert.equal(brief.ok,true);assert.match(manual.text,/оракулы/);assert.match(v5.text,/оракулы/);assert.doesNotMatch(brief.text,/оракулы/);
 }finally{db.sqlite.close();t.mock.timers.reset();}
});
