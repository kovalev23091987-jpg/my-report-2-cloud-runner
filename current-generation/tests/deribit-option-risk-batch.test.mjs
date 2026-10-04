import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_OPTIONS_MODULE_ROOT;
const load=rel=>import(root?pathToFileURL(root+'/'+rel):new URL('../files/src/'+rel,import.meta.url));
const {selectExactAltOptionInstruments,normalizeDeribitAltOptions,collectDeribitAltOptionsEvidence}=await load('deribit-alt-options-evidence.mjs');
const {deriveDeribitOptionRisk}=await load('deribit-option-risk-context.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
const {consumeEvidenceV2}=await load('evidence-v2.mjs');
const fixture=n=>JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('fixtures/deribit-risk-20261004/'+n+'.json.gz',import.meta.url))));
const catalog=fixture('catalog'),summary=fixture('usdc-summary'),now=Math.max(...summary.result.map(r=>r.creation_timestamp));
class Statement{constructor(db,sql,args=[]){Object.assign(this,{db,sql,args});}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}}
function normalized(base){const all=selectExactAltOptionInstruments(catalog,base),instruments=all.filter(i=>i.settlement_currency==='USDC');return normalizeDeribitAltOptions({contract:base+'-USDT',instruments,catalog_instrument_count:all.length,settlement_currency:'USDC',summary_payload:summary,observed_ts:now});}
test('actual primary quotes yield scoped IV for all five assets, BTC/ETH mixed catalog is explicitly partitioned',()=>{
 for(const base of ['BTC','ETH','SOL','AVAX','XRP']){
  const out=normalized(base);assert.equal(out.status,'CLOSED',base);const row=out.evidence[0],risk=row.option_risk_context;assert.ok(risk,base);assert.ok(risk.mark_iv_median_pct>0);assert.ok(risk.sample_count>=4&&risk.sample_count<=16);assert.ok(risk.call_count>=2&&risk.put_count>=2);assert.equal(risk.settlement_currency,'USDC');
  const context=consumeBlockResultContext({evidence:out.evidence,contract:base+'-USDT',now});assert.equal(context.facts.length,1);assert.match(context.facts[0].value,/mark IV: медиана/u);assert.equal(context.facts[0].score_contribution,0);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:now}).adjustment,0);
  if(['BTC','ETH'].includes(base)){assert.ok(row.scoped_instrument_count<row.open_instrument_count);assert.ok(row.coverage_fraction<1);assert.notEqual(row.coverage_status,'COMPLETE');}
 }
});
test('shared catalogue and USDC book cover five assets and a Unicode absent asset with only two admitted transports',async()=>{
 const db=new DB(),calls=[],admissions=[],fetch_impl=async url=>{calls.push(url);return{ok:true,status:200,json:async()=>url.includes('get_instruments')?catalog:summary};};
 for(const [i,base] of ['BTC','ETH','SOL','AVAX','XRP','测试1000'].entries()){
  const out=await collectDeribitAltOptionsEvidence({db,fetch_impl,request_admit:r=>{admissions.push(r);return{allowed:true};},contract:base+'-USDT',run_id:'SHARED:'+i,now,clock:()=>now});assert.equal(out.network_calls,i?0:2);assert.equal(out.status,i===5?'NOT_APPLICABLE':'CLOSED');
 }
 assert.equal(calls.length,2);assert.equal(admissions.length,1);assert.equal(admissions[0].attempts,2);assert.equal(db.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,2);
 for(const key of ['CATALOG:ALL_OPTIONS','BOOK:USDC']){const payload=db.sqlite.prepare('SELECT payload_json FROM report2_evidence_source_cache WHERE asset_key=?').get(key);assert.ok(payload);assert.ok(Buffer.byteLength(payload.payload_json)<1500000);}
});
test('risk consumer recomputes the sample and refuses future clocks, foreign identity, wrong settlement, crossed quotes, missing IV and a single side',()=>{
 const row=normalized('SOL').evidence[0];
 for(const mutate of [r=>r.samples[0].source_ts=now+1,r=>r.samples[0].base_currency='BTC',r=>r.samples[0].instrument_name='BTC-USDC-FAKE-C',r=>r.samples[0].settlement_currency='BTC',r=>r.samples[0].ask_price=0,r=>r.samples[0].mark_iv=null,r=>r.samples.forEach(s=>s.option_type='call')]){
  const risk=structuredClone(row.option_risk_context);mutate(risk);assert.equal(deriveDeribitOptionRisk({...risk,observed_ts:now}),null);
  const context=consumeBlockResultContext({evidence:[{...row,option_risk_context:risk}],contract:'SOL-USDT',now});assert.doesNotMatch(context.facts[0]?.value||'',/mark IV: медиана/u);
 }
 const mismatch=structuredClone(row);mismatch.option_risk_context.mark_iv_median_pct+=10;assert.doesNotMatch(consumeBlockResultContext({evidence:[mismatch],contract:'SOL-USDT',now}).facts[0].value,/mark IV: медиана/u);
});
test('missing volume and OI stay unknown; mixed settlements and stale quote risk do not become complete',()=>{
 const all=selectExactAltOptionInstruments(catalog,'BTC');assert.equal(normalizeDeribitAltOptions({contract:'BTC-USDT',instruments:all,summary_payload:summary,observed_ts:now}).status,'MIXED_SETTLEMENT_NOT_CLOSED');
 const instruments=selectExactAltOptionInstruments(catalog,'SOL'),rows=summary.result.filter(r=>instruments.some(i=>i.instrument_name===r.instrument_name)).map(r=>({...r,volume:null,open_interest:null}));
 const out=normalizeDeribitAltOptions({contract:'SOL-USDT',instruments,summary_payload:{result:rows},observed_ts:now});assert.equal(out.evidence[0].total_volume,null);assert.equal(out.evidence[0].total_open_interest,null);assert.equal(out.evidence[0].option_risk_context.put_open_interest_share,null);
 assert.equal(normalizeDeribitAltOptions({contract:'SOL-USDT',instruments,summary_payload:summary,observed_ts:now+1200001}).status,'NOT_CLOSED');
});
