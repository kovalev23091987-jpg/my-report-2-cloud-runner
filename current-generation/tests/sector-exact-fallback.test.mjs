import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {collectCoingeckoSectorEvidence}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {COINPAPRIKA_SECTOR_VERSION}=await import(modulePath('coinpaprika-sector-evidence.mjs'));
const {collectCandidateEvidenceV2,retainCheckedSectorAbsence,sourceWasAttempted,sourceWasActuallyChecked}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
const {consumeSectorContext}=await import(modulePath('sector-context.mjs'));
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache,reserveEvidenceSourceAttempts}=await import(modulePath('evidence-source-store.mjs'));
const {installProviderMinuteLedger,reserveProviderMinuteUnits}=await import(modulePath('provider-minute-ledger.mjs'));
const raw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/tron-sector-live-38570989795/validation.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'09f289569ce20757529c049e06815fd43b3eb03c182f292ad5db6865c4526429');
const actual=JSON.parse(raw),identityRaw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(identityRaw).digest('hex'),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const identity=normalizeHtxAssetReferences(JSON.parse(identityRaw)).entries.WIN.identities[0];
for(const r of actual.responses)assert.equal(crypto.createHash('sha256').update(r.body).digest('hex'),r.body_sha256);
const quoteReceipt=actual.responses.find(r=>r.url.includes('&category=oracle&')),quotes=JSON.parse(quoteReceipt.body),target=quotes.find(r=>r.id==='wink');
const metadataReceipt=actual.responses.find(r=>r.url.includes('/contract/'+identity.contract_or_mint));
const directoryReceipt=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/native-sector-rest-38564913120/validation.json.gz',import.meta.url)))).responses.find(r=>r.url.endsWith('/categories/list'));
assert.ok(quotes.some(r=>r.id==='winklink-bsc'&&r.symbol==='win'));
function database(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...(this.args||[]));},async first(){return sqlite.prepare(sql).get(...(this.args||[]))||null;},async all(){return{results:sqlite.prepare(sql).all(...(this.args||[]))};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
async function seed(d){await installEvidenceSourceStore(d);for(const r of [metadataReceipt,directoryReceipt]){const expiry=r.received_ts+(r===directoryReceipt?3600000:21600000);await writeEvidenceSourceCache(d,{source:'COINGECKO_SECTOR',asset_key:'REFERENCE:provider-reference-cache-v1-20261004:'+crypto.createHash('sha256').update(r.url).digest('hex'),observed_ts:r.received_ts,expires_ts:expiry,payload:{version:'provider-reference-cache-v1-20261004',url:r.url,received_ts:r.received_ts,expires_ts:expiry,body:r.body,body_sha256:r.body_sha256}});}}
const config=d=>({db:d,contract:'WIN-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',asset_metadata:{},run_id:'CONTROLLED_ORIGINAL_WIN_REFRESH',now:actual.completed_ts,coingecko_demo_api_key:'CG-test-only-key-123456789',request_admit:()=>({allowed:true})});
test('exact bound WIN ID refreshes a missing or stale target despite a different same-ticker asset; original peer clocks survive',async t=>{
 t.mock.timers.enable({apis:['Date'],now:actual.completed_ts});const rows=[];
 for(const kind of ['missing','stale']){const d=database(),urls=[];try{await seed(d);const category=kind==='missing'?quotes.filter(r=>r.id!=='wink'):quotes.map(r=>r.id==='wink'?{...r,last_updated:new Date(actual.completed_ts-900001).toISOString()}:r);
  const result=await collectCoingeckoSectorEvidence({...config(d),fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify(url.includes('&ids=wink&')?[target]:category));}});
  assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,2);assert.equal(urls.filter(u=>u.includes('&ids=wink&')).length,1);assert.equal(result.summary.target_source_ts,1791983988000);
  assert.equal(result.summary.target_quote_route,kind==='missing'?'EXACT_ID_OUTSIDE_CATEGORY_PAGE':'EXACT_ID_REFRESH_STALE_CATEGORY_ROW');
  assert.ok(result.evidence[0].peers.every(r=>r.symbol!=='WIN'&&r.id!=='winklink-bsc'&&r.source_ts===Date.parse(quotes.find(q=>q.id===r.id).last_updated)));
  const context=consumeSectorContext({evidence:result.evidence,contract:'WIN-USDT',asset_identity:identity,now:actual.completed_ts});assert.equal(context.status,'CLOSED');assert.equal(context.facts[0].score_contribution,0);assert.equal(context.directional_vote,false);
  rows.push({kind,controlled_response_variation:true,not_new_live_provider_probe:true,status:result.status,summary:result.summary,consumer_status:context.status});
 }finally{d.sqlite.close();}}
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/sector-exact-target-controlled-proof.json',JSON.stringify({schema:'ORIGINAL_WIN_CONTROLLED_TARGET_REFRESH_V1',original_source_run:38570989795,original_source_sha256:crypto.createHash('sha256').update(raw).digest('hex'),rows,live_sourceHTTP:0,live_D1:0,MAIN:0,Telegram:0,source_clocks_unchanged:true},null,2)+'\n');t.mock.timers.reset();
});
test('exact-ID target refresh cannot bypass caller, ordinary day or rolling-minute headroom',async t=>{
 t.mock.timers.enable({apis:['Date'],now:actual.completed_ts});
 for(const guard of ['caller','day','minute']){const d=database(),urls=[];let admissions=0;try{await seed(d);
  if(guard==='day')await reserveEvidenceSourceAttempts(d,{source:'COINGECKO_SECTOR',reservation_id:'retained_used223',attempts:223,daily_cap:256,now:actual.completed_ts});
  if(guard==='minute'){await installProviderMinuteLedger(d);await reserveProviderMinuteUnits(d,{provider:'COINGECKO',reservation_id:'retained_minute8',units:8,cap:9,now:actual.completed_ts});}
  const result=await collectCoingeckoSectorEvidence({...config(d),request_admit:()=>({allowed:++admissions<=1,status:'WHOLE_JOB_HTTP_CAP'}),fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify(quotes.filter(r=>r.id!=='wink')));}});
  assert.equal(result.evidence.length,0);assert.equal(result.network_calls,1);assert.equal(urls.length,1);assert.equal(urls.some(u=>u.includes('&ids=')),false);
  assert.equal(admissions,guard==='caller'?2:1);if(guard==='day')assert.equal(d.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,224);
 }finally{d.sqlite.close();}}
 t.mock.timers.reset();
});
test('wrong/duplicate exact target and future timestamps do not acquire a refresh route or sector evidence',async t=>{
 t.mock.timers.enable({apis:['Date'],now:actual.completed_ts});
 for(const category of [[...quotes,target],quotes.map(r=>r.id==='wink'?{...r,symbol:'OTHER'}:r),quotes.map(r=>r.id==='wink'?{...r,last_updated:new Date(actual.completed_ts+1).toISOString()}:r)]){const d=database(),urls=[];try{await seed(d);const r=await collectCoingeckoSectorEvidence({...config(d),fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify(category));}});assert.equal(r.evidence.length,0);assert.equal(urls.length,1);assert.equal(urls.some(u=>u.includes('&ids=')),false);}finally{d.sqlite.close();}}
 t.mock.timers.reset();
});
test('no functional sector preserves actual transport cost and absence without closing the block',()=>{
 const params=config(null),source={status:'EXACT_ASSET_AND_CATEGORY_REQUIRED',network_calls:2,evidence:[],receipts:[{route:'EXACT_COIN_METADATA',http_status:200,status:'RECEIVED'},{route:'EXACT_CATEGORY_DIRECTORY',http_status:200,status:'RECEIVED'}],admission:{allowed:true,status:'PER_TRANSPORT_RESERVED'},summary:{actual:'retained'}};
 const r=retainCheckedSectorAbsence(params,source);assert.equal(r.status,'CAPABILITY_CHECKED_NO_EXACT_ROUTE');assert.equal(r.network_calls,2);assert.equal(r.original_provider_status,source.status);assert.deepEqual(r.receipts.slice(0,2),source.receipts);assert.deepEqual(r.admission,source.admission);assert.deepEqual(r.summary,source.summary);assert.equal(sourceWasAttempted(r),true);assert.equal(sourceWasActuallyChecked(r),false);assert.deepEqual(r.evidence,[]);
 for(const status of ['CLOSED','SOURCE_ACCESS_BLOCKED','SOURCE_NOT_CLOSED','DEFERRED_SHARED_REQUEST_ENVELOPE']){const unchanged={...source,status};assert.equal(retainCheckedSectorAbsence(params,unchanged),unchanged);}
 assert.equal(retainCheckedSectorAbsence({...params,identity_method:'UNVERIFIED'},source),source);
});
test('common runtime keeps two real failed-category HTTP instead of relabelling them as a free capability check',async t=>{
 t.mock.timers.enable({apis:['Date'],now:actual.completed_ts});const d=database(),urls=[];
 try{await installEvidenceSourceStore(d);await reserveEvidenceSourceAttempts(d,{source:'COINPAPRIKA_SECTOR',reservation_id:'existing_paprika_cap',attempts:512,daily_cap:512,now:actual.completed_ts});
  const r=await collectCandidateEvidenceV2({...config(d),max_requests:18,fetch_impl:async url=>{urls.push(url);if(url.includes('/market/history/trade'))return new Response(JSON.stringify({status:'ok',ch:'market.WIN-USDT.trade.detail',ts:actual.completed_ts,data:[]}));if(url.includes('/categories/list'))return new Response(directoryReceipt.body);if(url.includes('/contract/'))return new Response(JSON.stringify({...JSON.parse(metadataReceipt.body),categories:['TRON Ecosystem']}));throw Error('UNEXPECTED_CONTROLLED_SOURCE:'+url);}});
  const cg=r.sources.COINGECKO_SECTOR;assert.equal(cg.network_calls,2);assert.equal(cg.status,'CAPABILITY_CHECKED_NO_EXACT_ROUTE');assert.equal(cg.evidence.length,0);assert.equal(cg.receipts.filter(x=>x.http_status===200).length,2);assert.equal(r.network_calls,3);assert.equal(urls.length,3);
  const check=r.block_coverage.blocks.N15.source_checks.COINGECKO_SECTOR;assert.equal(check.network_calls,2);assert.equal(check.attempted,true);assert.equal(check.checked,false);assert.equal(r.block_coverage.blocks.N15.checked,false);assert.equal(r.sources.COINPAPRIKA_SECTOR.network_calls,0);
  assert.equal(d.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,2);
 }finally{d.sqlite.close();t.mock.timers.reset();}
});
test('an exhausted CG source does not suppress an original useful CP cached fact in the common runtime',async t=>{
 const f=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/actual-ZEC-role-handoff-0931.json.gz',import.meta.url)))),canonical=f.canonical,cutoff=canonical.observed_ts,context=canonical.metadata.internal_market_context,original=context.evidence_v2.sources.COINPAPRIKA_SECTOR,zecIdentity=context.candidate_context.asset_identity;
 assert.equal(original.status,'CLOSED');assert.ok(original.evidence.some(r=>r.block_id==='N15'));
 t.mock.timers.enable({apis:['Date'],now:cutoff});const d=database(),urls=[];
 try{await installEvidenceSourceStore(d);await reserveEvidenceSourceAttempts(d,{source:'COINGECKO_SECTOR',reservation_id:'original_ordinary_exhausted',attempts:224,daily_cap:256,now:cutoff});
  // Controlled current cache-envelope replay of unchanged original facts. No
  // new source acquisition, original timestamp or production-v9 claim.
  await writeEvidenceSourceCache(d,{source:'COINPAPRIKA_SECTOR',asset_key:'ZEC-USDT:PROVIDER_MARKET_REFERENCE:DISCOVERY:',observed_ts:cutoff,expires_ts:Math.min(...original.evidence.map(r=>r.expires_at)),payload:{...original,version:COINPAPRIKA_SECTOR_VERSION,network_calls:0}});
  const r=await collectCandidateEvidenceV2({db:d,contract:'ZEC-USDT',run_id:'CONTROLLED_CP_FALLBACK',now:cutoff,max_requests:18,asset_identity:zecIdentity,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',asset_metadata:{},coingecko_demo_api_key:'CG-test-only-key-123456789',request_admit:()=>({allowed:true}),fetch_impl:async url=>{urls.push(url);assert.ok(url.includes('/market/history/trade'));return new Response(JSON.stringify({status:'ok',ch:'market.ZEC-USDT.trade.detail',ts:cutoff,data:[]}));}});
  assert.equal(r.sources.COINGECKO_SECTOR.network_calls,0);assert.equal(r.sources.COINPAPRIKA_SECTOR.status,'CLOSED');assert.equal(r.sources.COINPAPRIKA_SECTOR.network_calls,0);assert.equal(r.block_coverage.blocks.N15.checked,true);assert.equal(r.network_calls,1);assert.equal(urls.length,1);
  const consumer=consumeSectorContext({evidence:r.evidence,contract:'ZEC-USDT',asset_identity:zecIdentity,now:cutoff});assert.equal(consumer.status,'CLOSED');assert.equal(consumer.facts.length,1);assert.equal(consumer.facts[0].source,'CoinPaprika');assert.equal(consumer.score_contribution,0);assert.equal(consumer.directional_vote,false);assert.equal(consumer.facts[0].source_ts,original.evidence.find(r=>r.block_id==='N15').source_ts);
  assert.equal(d.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,224);
 }finally{d.sqlite.close();t.mock.timers.reset();}
});
