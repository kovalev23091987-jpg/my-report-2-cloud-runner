import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const moduleUrl=name=>process.env.REPORT2_CLASS_TEST_ROOT?pathToFileURL(path.join(process.env.REPORT2_CLASS_TEST_ROOT,name)).href:new URL(`../files/src/${name}`,import.meta.url).href;
const {normalizeCrossExchangeCatalogs,normalizeCrossExchangeDepth,normalizeOkxLiquidationEvents,loadVenueCatalog,collectCrossExchangeRiskContext}=await import(moduleUrl('cross-exchange-risk-context.mjs'));
const {normalizeVenueVolumeProfiles,compareVolumeProfiles,collectCrossVenueVolumeProfiles}=await import(moduleUrl('cross-venue-volume-profile.mjs'));
const {buildHtxVolumeProfile}=await import(moduleUrl('htx-volume-profile.mjs'));
import {realInput} from './volume-profile-fixture.mjs';
const receipt=JSON.parse(fs.readFileSync(new URL('./fixtures/qnt-price-diagnostic.json',import.meta.url)));
const stock=receipt.okx_contract[0];
class DB {
 constructor(){this.sql=new DatabaseSync(':memory:');}
 prepare(sql){const db=this.sql;return {
  async run(){return db.prepare(sql).run();},
  bind(...xs){return {
   async first(){return db.prepare(sql).get(...xs)||null;},
   async run(){return db.prepare(sql).run(...xs);},
   async all(){return {results:db.prepare(sql).all(...xs)};}
  };}
 };}
}


test('real OKX QNT stock is excluded even though ticker, USDT settlement and perpetual type match',()=>{
 assert.equal(stock.instCategory,'3');assert.equal(stock.instId,'QNT-USDT-SWAP');
 assert.equal(normalizeCrossExchangeCatalogs({okx:{data:[stock]}}).QNT,undefined);
 // Controlled crypto-class variant tests the legitimate path, not a real QNT mapping.
 const crypto={...stock,instCategory:'1'};const e=normalizeCrossExchangeCatalogs({okx:{data:[crypto]}}).QNT;
 assert.equal(e.okx_asset_category,'1');assert.equal(e.okx_contract_value,1);
 for(const cls of [undefined,'','3','4','5','6','99'])assert.equal(normalizeCrossExchangeCatalogs({okx:{data:[{...stock,instCategory:cls}]}}).QNT,undefined);
});

test('same-price stock cannot enter depth or realized-liquidation evidence through direct normalizers',()=>{
 const instrument={asset_category:'3',base:'QNT',contract_value:1,contract_multiplier:1,contract_value_currency:'QNT'};
 const d=normalizeCrossExchangeDepth({venue:'OKX',instrument,reference_price:50,observed_ts:1001,expected_symbol:'QNT-USDT-SWAP',request_symbol:'QNT-USDT-SWAP',payload:{data:[{ts:'1000',bids:[['49.99','10']],asks:[['50.01','10']]}]}});
 assert.equal(d.reason,'OKX_CRYPTO_ASSET_CATEGORY_REQUIRED');
 const payload={data:[{instId:'QNT-USDT-SWAP',details:[{posSide:'long',bkPx:'50',sz:'10',ts:'1000'}]}]};
 assert.deepEqual(normalizeOkxLiquidationEvents(payload,'QNT-USDT-SWAP',{okx_asset_category:'3',okx_contract_value:1,okx_contract_multiplier:1,okx_contract_value_currency:'QNT'}),[]);
});

test('a stock profile is rejected before reconciliation and cannot confirm or contradict crypto',()=>{
 const x=realInput(),p=buildHtxVolumeProfile(x),peer={...p,source:'OKX',okx_asset_category:'3'};
 const c=compareVolumeProfiles({primary:p,peers:[peer],contract:x.contract,now:x.now,reference_price:p.last_closed_bars.at(-1).close,direction:'LONG'});
 assert.equal(c.factor,.5);assert.equal(c.confirmations.length,0);assert.equal(c.conflicts.length,0);assert.equal(c.skipped[0].reason,'NON_CRYPTO_OR_UNVERIFIED_ASSET_CLASS');
 const n=normalizeVenueVolumeProfiles({venue:'OKX',contract:x.contract,symbol:'QNT-USDT-SWAP',catalog_entry:{base:'QNT',okx:'QNT-USDT-SWAP',okx_asset_category:'3'},now:x.now,window_end:p.window_end});
 assert.equal(n.reason,'OKX_CRYPTO_ASSET_CATEGORY_REQUIRED');
});

test('old symbol-only catalog is not reused and its refresh stays within the three existing requests',async()=>{
 const db=new DB(),now=receipt.finished_at;
 db.sql.exec('CREATE TABLE report2_cross_exchange_catalog(catalog_id TEXT PRIMARY KEY,observed_ts INTEGER,expires_ts INTEGER,payload_json TEXT)');
 db.sql.prepare('INSERT INTO report2_cross_exchange_catalog VALUES(?,?,?,?)').run('CEX_V2',now,now+86400000,JSON.stringify({schema:'CEX_CATALOG_V2',entries:{QNT:{base:'QNT',okx:stock.instId}},receipts:[]}));
 let calls=0;const fetch_impl=async url=>{calls++;return new Response(JSON.stringify(url.includes('okx')?{code:'0',data:[stock]}:url.includes('bybit')?{retCode:0,result:{list:[]}}:{symbols:[]}));};
 const fresh=await loadVenueCatalog({db,fetch_impl,now}),cached=await loadVenueCatalog({db,fetch_impl,now:now+1});
 assert.equal(calls,3);assert.equal(fresh.schema,'CEX_CATALOG_V3');assert.equal(fresh.entries.QNT,undefined);assert.equal(cached.network_calls,0);db.sql.close();
});

test('legacy depth and realized caches cannot survive migration while unrelated history is retained',async()=>{
 const db=new DB(),now=receipt.finished_at;db.sql.exec('CREATE TABLE report2_cross_exchange_catalog(catalog_id TEXT PRIMARY KEY,observed_ts INTEGER,expires_ts INTEGER,payload_json TEXT);CREATE TABLE report2_cross_exchange_risk_cache(contract_code TEXT,source TEXT,observed_ts INTEGER,expires_ts INTEGER,payload_json TEXT,PRIMARY KEY(contract_code,source))');
 db.sql.prepare('INSERT INTO report2_cross_exchange_catalog VALUES(?,?,?,?)').run('CEX_V3',now,now+86400000,JSON.stringify({schema:'CEX_CATALOG_V3',entries:{},receipts:[]}));
 for(const source of ['CROSS_EXCHANGE_DEPTH','CROSS_EXCHANGE_REALIZED','COINALYZE'])db.sql.prepare('INSERT INTO report2_cross_exchange_risk_cache VALUES(?,?,?,?,?)').run('QNT-USDT',source,now,now+60000,JSON.stringify({source,status:'CLOSED'}));
 const c=await collectCrossExchangeRiskContext({db,contract:'QNT-USDT',now,allowed_lanes:[],fetch_impl:()=>{throw Error('UNEXPECTED_HTTP');}});
 assert.deepEqual(c.sources,{});
 // Permit history but stop before requests via catalog refresh to inspect the shared cache loader.
 db.sql.prepare("DELETE FROM report2_cross_exchange_catalog WHERE catalog_id='CEX_V3'").run();
 const refreshed=await collectCrossExchangeRiskContext({db,contract:'QNT-USDT',now,fetch_impl:async()=>new Response('{}',{status:503})});
 assert.deepEqual(Object.keys(refreshed.sources),['COINALYZE']);db.sql.close();
});

test('an old cached OKX profile cannot bypass category admission and consume requests',async()=>{
 const db=new DB(),now=receipt.finished_at;db.sql.exec('CREATE TABLE report2_cross_exchange_catalog(catalog_id TEXT PRIMARY KEY,expires_ts INTEGER,payload_json TEXT);CREATE TABLE report2_volume_profile_cache(contract TEXT,source TEXT,expires_ts INTEGER,payload_json TEXT,PRIMARY KEY(contract,source))');
 db.sql.prepare('INSERT INTO report2_cross_exchange_catalog VALUES(?,?,?)').run('CEX_V3',now+86400000,JSON.stringify({entries:{QNT:{base:'QNT',okx:stock.instId,okx_asset_category:'3'}}}));
 db.sql.prepare('INSERT INTO report2_volume_profile_cache VALUES(?,?,?,?)').run('QNT-USDT','OKX',now+60000,JSON.stringify({source:'OKX',status:'CLOSED',profiles:[{source:'OKX',status:'CLOSED'}]}));
 const r=await collectCrossVenueVolumeProfiles({db,contract:'QNT-USDT',run_id:'CLASS',clock:()=>now,fetch_impl:()=>{throw Error('UNEXPECTED_HTTP');},request_admit:()=>{throw Error('UNEXPECTED_ADMISSION');}});
 assert.equal(r.network_calls,0);assert.equal(r.sources.OKX.reason,'OKX_CRYPTO_ASSET_CATEGORY_REQUIRED');db.sql.close();
});
