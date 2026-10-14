import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {archiveLiquidationForecasts,compactCanonicalForecast} from './liquidation-forecast-archive.mjs';

globalThis.crypto ||= webcrypto;
const T=1_791_864_000_000;
const zone={source:'Orderly',independence_group:'ORDERLY_PUBLIC_POSITIONS',kind:'PROVIDER_ESTIMATE',side:'ABOVE',price:1.05,price_quote:'USDC',source_ts:T-1_000,distance_pct:5,distance_reference_price:1,distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE',notional:120_000,notional_unit:'USDC',amount_semantics:'REPORTED_OPEN_POSITION_NOTIONAL',estimated:true,price_semantics:'ORDERLY_ESTIMATED_POSITION_LIQUIDATION_PRICE'};
const liquidations={current_price:1,above:[zone],below:[],calculated_scenarios:[]};
const pub=n=>'PUB:'+n.repeat(40);
class D1{constructor(schema){this.db=new DatabaseSync(':memory:');this.db.exec(schema);this.bytes=16_384;}prepare(sql){const stmt=this.db.prepare(sql),args=[],self=this;return{bind(...values){args.push(...values);return this;},first(){return stmt.get(...args)??null;},all(){return{results:stmt.all(...args),meta:{size_after:self.bytes}};},run(){const r=stmt.run(...args);return{meta:{changes:Number(r.changes),size_after:self.bytes}};}};}close(){this.db.close();}}

test('saved canonical future position becomes compact immutable historical evidence, without source HTTP',async()=>{
 const source=new D1('CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,run_id TEXT,contract_code TEXT,observed_ts INTEGER,canonical_json TEXT,snapshot_id TEXT,analytical_fingerprint TEXT)');
 const archive=new D1(fs.readFileSync(new URL('./002_liq_forecast_archive.sql',import.meta.url),'utf8'));
 const insert=(publication_id,contract)=>source.db.prepare('INSERT INTO canonical_publication_shadow(publication_id,run_id,contract_code,observed_ts,canonical_json) VALUES(?,?,?,?,?)').run(publication_id,'run:1',contract,T,JSON.stringify({liquidations}));
 insert(pub('a'),'FIL-USDT');insert(pub('b'),'BTC-USDT');
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_PROVIDER_HTTP');};
 try{
  const first=await archiveLiquidationForecasts({source_db:source,archive_db:archive,scheduled_ts:T+60_000,clock:()=>T+60_000});
  assert.equal(first.status,'ARCHIVED');assert.equal(first.checked,2);assert.equal(first.recorded,1);assert.equal(first.skipped,1);assert.equal(first.source_http,0);assert.equal(first.report_effect,false);
  const row=archive.db.prepare('SELECT * FROM report2_liq_forecast_archive_v1 WHERE contract_code=?').get('FIL-USDT');
  const snapshot=JSON.parse(row.payload_json);assert.equal(snapshot.zones.length,1);assert.equal(snapshot.zones[0].reported_notional,120_000);assert.equal(snapshot.zones[0].notional_unit,'USDC');assert.equal(snapshot.zones[0].source_ts,T-1_000);
  assert.equal(archive.db.prepare('SELECT status FROM report2_liq_forecast_archive_v1 WHERE contract_code=?').get('BTC-USDT').status,'SKIPPED_INVALID_IDENTITY');
  assert.equal((await archiveLiquidationForecasts({source_db:source,archive_db:archive,scheduled_ts:T+120_000})).status,'SOURCE_EMPTY');
  assert.equal(archive.db.prepare('SELECT COUNT(*) AS n FROM report2_liq_forecast_archive_v1').get().n,2);
 }finally{globalThis.fetch=previous;source.close();archive.close();}
});

test('stale source clock, invalid JSON and storage guard fail closed',async()=>{
 const row={publication_id:pub('c'),run_id:'run:1',contract_code:'FIL-USDT',observed_ts:T,reference_price:1,liquidation_json:JSON.stringify({current_price:1,above:[{...zone,source_ts:T-300_001}],below:[],calculated_scenarios:[]})};
 assert.equal(compactCanonicalForecast(row,{scheduled_ts:T+60_000}).status,'SKIPPED_NO_FRESH_FORECAST');
 assert.equal(compactCanonicalForecast({...row,liquidation_json:'{'},{scheduled_ts:T+60_000}).status,'SKIPPED_INVALID_CANONICAL');
 const source=new D1('CREATE TABLE canonical_publication_shadow(publication_id TEXT PRIMARY KEY,run_id TEXT,contract_code TEXT,observed_ts INTEGER,canonical_json TEXT,snapshot_id TEXT,analytical_fingerprint TEXT)');
 const archive=new D1(fs.readFileSync(new URL('./002_liq_forecast_archive.sql',import.meta.url),'utf8'));
 source.db.prepare('INSERT INTO canonical_publication_shadow(publication_id,run_id,contract_code,observed_ts,canonical_json) VALUES(?,?,?,?,?)').run(pub('c'),'run:1','FIL-USDT',T,JSON.stringify({liquidations}));archive.bytes=400_000_000;
 try{const result=await archiveLiquidationForecasts({source_db:source,archive_db:archive,scheduled_ts:T+60_000});assert.equal(result.status,'FREE_STORAGE_GUARD');assert.equal(archive.db.prepare('SELECT COUNT(*) AS n FROM report2_liq_forecast_archive_v1').get().n,0);}finally{source.close();archive.close();}
});
