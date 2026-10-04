import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.REPORT2_SECTOR_MODULE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_SECTOR_MODULE_ROOT)+'/'):new URL('../files/src/',import.meta.url);
const load=name=>import(new URL(name,root));
const {collectCoingeckoSectorEvidence,verifyCoingeckoSectorIdentity,normalizeCoingeckoSector}=await load('coingecko-sector-evidence.mjs');
const {collectCoinpaprikaSectorEvidence}=await load('coinpaprika-sector-evidence.mjs');
const {consumeSectorContext}=await load('sector-context.mjs');
const {createProviderReferenceReader}=await load('provider-reference-cache.mjs');
const {installEvidenceSourceStore}=await load('evidence-source-store.mjs');
const {collectCandidateEvidenceV2}=await load('candidate-evidence-v2-runtime.mjs');
const NOW=Date.now(),native={chain:'near',asset_kind:'NATIVE',native_asset_id:'near:mainnet',contract_or_mint:null};
const address='0x'+'1'.repeat(40),token={chain:'ethereum',contract_or_mint:address};
const metadata={id:'near',symbol:'near',asset_platform_id:null,platforms:{'':''},categories:['Layer 1 (L1)']};
const platforms=[{id:'near',native_coin_id:'near'}],categories=[{category_id:'layer-1',name:'Layer 1 (L1)'}];
const quote=(id,symbol,change)=>({id,symbol,current_price:2,total_volume:200000,price_change_percentage_24h:change,last_updated:new Date(NOW-1000).toISOString()});
const quotes=[quote('near','near',4),quote('p1','p1',0),quote('p2','p2',2),quote('p3','p3',3)];
function database(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
function config(db,urls=[],extra={}){return{db,contract:'NEAR-USDT',asset_identity:native,asset_metadata:{},run_id:'native-sector',now:Date.now(),request_admit:r=>{assert.equal(r.attempts,1);return{allowed:true};},fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify(url.endsWith('/asset_platforms')?platforms:url.includes('/categories/list')?categories:url.includes('/markets?')?quotes:metadata));},...extra};}
const expireResults=db=>db.sqlite.exec("UPDATE report2_evidence_source_cache SET expires_ts=0 WHERE asset_key NOT LIKE 'REFERENCE:%'");
test('native binding requires provider native_coin_id, no token address and exact NEAR contract',()=>{
 const p={identity:native,contract:'NEAR-USDT',coin_id:'near',asset_platforms:platforms};assert.equal(verifyCoingeckoSectorIdentity(metadata,p),true);
 for(const patch of [{asset_platforms:[]},{asset_platforms:[...platforms,...platforms]},{coin_id:'wrapped-near'},{contract:'OTHER-USDT'},{identity:{...native,contract_or_mint:'wrap.near'}},{identity:{...native,native_asset_id:'near:testnet'}}])assert.equal(verifyCoingeckoSectorIdentity(metadata,{...p,...patch}),false);
 for(const m of [{...metadata,id:'wrapped-near'},{...metadata,asset_platform_id:'near'},{...metadata,platforms:{near:'wrap.near'}},{...metadata,platforms:null}])assert.equal(verifyCoingeckoSectorIdentity(m,p),false);
 const r=normalizeCoingeckoSector({metadata,categories,quotes,...p,category_id:'layer-1',category_name:'Layer 1 (L1)',observed_ts:NOW});assert.equal(r.status,'CLOSED');assert.equal(r.evidence[0].asset_id,'near:native:mainnet');assert.equal(consumeSectorContext({evidence:r.evidence,contract:p.contract,asset_identity:native,now:NOW}).status,'CLOSED');
});
test('native cold route uses 4 calls; a new manual refresh reuses 3 references and reserves one quote call',async()=>{
 const db=database(),urls=[];const a=await collectCoingeckoSectorEvidence(config(db,urls));assert.equal(a.status,'CLOSED');assert.equal(a.network_calls,4);
 const b=await collectCoingeckoSectorEvidence(config(db,urls,{run_id:'manual-refresh',strict_fresh_manual:true}));assert.equal(b.status,'CLOSED');assert.equal(b.network_calls,1);assert.equal(b.receipts.filter(r=>r.status==='VALIDATED_REFERENCE_CACHE').length,3);
 assert.equal(urls.length,5);assert.ok(urls.every(u=>!u.includes('wrap.near')&&!u.includes('/contract/')));
 const usage=db.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get();assert.equal(usage.attempts,5);db.sqlite.close();
});
test('altered, future and expired reference bodies cannot be accepted as cache hits',async()=>{
 for(const kind of ['body','future','expired']){const db=database(),urls=[];await collectCoingeckoSectorEvidence(config(db,urls));expireResults(db);
 const entries=db.sqlite.prepare("SELECT asset_key,payload_json FROM report2_evidence_source_cache WHERE asset_key LIKE 'REFERENCE:%'").all(),entry=entries.find(r=>JSON.parse(r.payload_json).url.endsWith('/asset_platforms')),p=JSON.parse(entry.payload_json);
 if(kind==='body')p.body='[]';else if(kind==='future')p.received_ts=NOW+100000;else p.received_ts=NOW-86400001;
 db.sqlite.prepare('UPDATE report2_evidence_source_cache SET payload_json=? WHERE asset_key=?').run(JSON.stringify(p),entry.asset_key);
 const b=await collectCoingeckoSectorEvidence(config(db,urls,{run_id:'refresh'}));assert.equal(b.status,'CLOSED');assert.equal(b.network_calls,1);assert.equal(b.receipts[0].status,'RECEIVED');db.sqlite.close();}
});
test('references never relabel an asset: wrong metadata stops after its one admitted call',async()=>{
 const db=database(),urls=[];const r=await collectCoingeckoSectorEvidence(config(db,urls,{contract:'TEST-USDT',asset_identity:token,asset_metadata:{coingecko_id:'test',coingecko_category_id:'layer-1',coingecko_category_name:'Layer 1 (L1)'},fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify({...metadata,id:'test',symbol:'test',platforms:{ethereum:'0x'+'2'.repeat(40)}}));}}));assert.equal(r.evidence.length,0);assert.equal(urls.length,1);assert.equal(db.sqlite.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,1);db.sqlite.close();
});
test('transport is forbidden without admission and malformed reference response is never cached',async()=>{
 const db=database();await installEvidenceSourceStore(db);let calls=0;
 let reader=createProviderReferenceReader({db,source:'COINGECKO_SECTOR',run_id:'deny',now:NOW,daily_cap:48,request_admit:()=>({allowed:false,status:'CAP'}),fetch_impl:async()=>{calls++;}});assert.equal(await reader.get('DIRECTORY','https://api.coingecko.com/api/v3/coins/categories/list',{ttl_ms:3600000}),null);assert.equal(calls,0);
 reader=createProviderReferenceReader({db,source:'COINGECKO_SECTOR',run_id:'invalid',now:NOW,daily_cap:48,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response('bad json');}});assert.equal(await reader.get('DIRECTORY','https://api.coingecko.com/api/v3/coins/categories/list',{ttl_ms:3600000}),null);assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM report2_evidence_source_cache WHERE asset_key LIKE 'REFERENCE:%'").get().n,0);db.sqlite.close();
});
test('CoinPaprika shares metadata and functional membership but fresh manual quotes still require one call',async()=>{
 const db=database(),urls=[],m={id:'test-token',symbol:'TEST',is_active:true,contracts:[{platform:'eth-ethereum',contract:address}]},tag={id:'oracles',type:'functional',coins:['test-token','p1','p2','p3']},tickers=['test-token','p1','p2','p3'].map((id,i)=>({id,symbol:i===0?'TEST':id,last_updated:new Date(NOW-1000).toISOString(),quotes:{USD:{price:2,volume_24h:200000,percent_change_24h:i}}}));
 const p={db,contract:'TEST-USDT',asset_identity:token,asset_metadata:{coinpaprika_id:'test-token',sector_tag:'oracles'},run_id:'cp-cold',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async url=>{urls.push(url);return new Response(JSON.stringify(url.includes('/coins/')?m:url.includes('/tags/')?tag:tickers));}};
 const a=await collectCoinpaprikaSectorEvidence(p),b=await collectCoinpaprikaSectorEvidence({...p,run_id:'cp-manual',now:Date.now(),strict_fresh_manual:true});assert.equal(a.status,'CLOSED');assert.equal(b.status,'CLOSED');assert.equal(a.network_calls,3);assert.equal(b.network_calls,1);assert.equal(urls.length,4);db.sqlite.close();
});
test('native sector route remains present in the full collector when its shared envelope is exhausted',async()=>{
 const db=database(),result=await collectCandidateEvidenceV2({...config(db),run_id:'route-audit',max_requests:5,request_admit:()=>({allowed:false,status:'CAP'}),source_health_admit:()=>({allowed:false})});assert.ok(result.sources.COINGECKO_SECTOR);assert.notEqual(result.sources.COINGECKO_SECTOR.status,'EXACT_SECTOR_REGISTRY_REQUIRED');assert.equal(result.network_calls,0);db.sqlite.close();
});
