import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {selectExactAltOptionInstruments,normalizeDeribitAltOptions,collectDeribitAltOptionsEvidence} from '../files/src/deribit-alt-options-evidence.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}
const catalog={result:[
 {instrument_name:'SOL-30OCT26-100-C',base_currency:'SOL',quote_currency:'USD',settlement_currency:'USDC',kind:'option',is_active:true,expiration_timestamp:2_000},
 {instrument_name:'BTC-30OCT26-100000-C',base_currency:'BTC',kind:'option',is_active:true},
 {instrument_name:'SOL-PERPETUAL',base_currency:'SOL',kind:'future',is_active:true},
]};

test('K16 Deribit alt: catalog selection requires exact active option identity',()=>{
 const rows=selectExactAltOptionInstruments(catalog,'SOL');assert.equal(rows.length,1);assert.equal(rows[0].instrument_name,'SOL-30OCT26-100-C');
 assert.equal(selectExactAltOptionInstruments(catalog,'ETH').length,0);
});

test('K16 Deribit alt: liquidity is context only and cannot vote for Long or Short',()=>{
 const instruments=selectExactAltOptionInstruments(catalog,'SOL'),summary={result:[{instrument_name:'SOL-30OCT26-100-C',bid_price:1,ask_price:2,volume:12,open_interest:7,timestamp:1500}]};
 const out=normalizeDeribitAltOptions({contract:'SOL-USDT',instruments,summary_payload:summary,observed_ts:2000});
 assert.equal(out.status,'CLOSED');assert.equal(out.evidence[0].block_id,'N14');assert.equal(out.evidence[0].directional_strength,null);assert.equal(out.evidence[0].risk_strength,null);
 assert.equal(out.evidence[0].liquid_instrument_count,1);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:2000}).adjustment,0);
});

test('K16 Deribit alt: catalog and summary are bounded, cached and admitted before transport',async()=>{
 const db=new DB(),calls=[];const fetch_impl=async url=>{calls.push(url);return{ok:true,status:200,json:async()=>url.includes('get_instruments')?catalog:{result:[{instrument_name:'SOL-30OCT26-100-C',bid_price:1,ask_price:2,volume:12,open_interest:7,timestamp:1500}]}};};
 const base={db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'SOL-USDT',run_id:'R',now:2000,clock:()=>2000};
 const first=await collectDeribitAltOptionsEvidence(base),second=await collectDeribitAltOptionsEvidence({...base,run_id:'R2',now:2001});
 assert.equal(first.status,'CLOSED');assert.equal(first.network_calls,2);assert.equal(second.network_calls,0);assert.equal(second.cache_status,'HIT');assert.equal(calls.length,2);assert.match(calls[1],/currency=USDC/);assert.doesNotMatch(calls[1],/currency=SOL/);
 const stored=db.sqlite.prepare(`SELECT payload_json FROM report2_evidence_source_cache WHERE source='DERIBIT_ALT_OPTIONS' AND asset_key='CATALOG:SOL'`).get();assert.ok(stored.payload_json.length<2000);assert.doesNotMatch(stored.payload_json,/BTC-/);
 const usage=db.sqlite.prepare(`SELECT attempts FROM report2_evidence_source_daily WHERE source='DERIBIT_ALT_OPTIONS'`).get();assert.equal(usage.attempts,2);
});

test('K16 Deribit alt: absent option market is NOT_APPLICABLE, not guessed from BTC',async()=>{
 const db=new DB(),calls=[];const fetch_impl=async url=>{calls.push(url);return{ok:true,status:200,json:async()=>({result:[{instrument_name:'BTC-30OCT26-100000-C',base_currency:'BTC',kind:'option',is_active:true}]})};};
 const out=await collectDeribitAltOptionsEvidence({db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'SOL-USDT',run_id:'R',now:1000,clock:()=>1000});
 assert.equal(out.status,'NOT_APPLICABLE');assert.equal(out.evidence.length,1);assert.equal(out.evidence[0].metric_family,'ALT_OPTIONS_CATALOG_ABSENCE');assert.equal(out.network_calls,1);assert.equal(calls.length,1);
});

test('K16 Deribit alt: no whole-job admission means zero network calls',async()=>{
 const db=new DB();let calls=0;const out=await collectDeribitAltOptionsEvidence({db,fetch_impl:async()=>{calls++;throw new Error('must not fetch');},contract:'SOL-USDT',run_id:'R',now:1000});
 assert.equal(out.status,'WHOLE_JOB_HTTP_ADMISSION_REQUIRED');assert.equal(out.network_calls,0);assert.equal(calls,0);
});

test('provider clock stays factual; missing or future quote timestamps never become healthy zero liquidity',()=>{
 const instruments=selectExactAltOptionInstruments(catalog,'SOL');
 const live=normalizeDeribitAltOptions({contract:'SOL-USDT',instruments,summary_payload:{result:[{instrument_name:instruments[0].instrument_name,creation_timestamp:1500,bid_price:1}]},observed_ts:2000});
 assert.equal(live.evidence[0].source_ts,1500);
 for(const payload of [null,{result:[]},{result:[{instrument_name:instruments[0].instrument_name,bid_price:1}]},{result:[{instrument_name:instruments[0].instrument_name,timestamp:2001,bid_price:1}]}]){
  const out=normalizeDeribitAltOptions({contract:'SOL-USDT',instruments,summary_payload:payload,observed_ts:2000});assert.equal(out.status,'NOT_CLOSED');assert.equal(out.evidence.length,0);assert.equal(out.summary.liquid_instrument_count,null);
 }
 assert.equal(selectExactAltOptionInstruments({result:[{kind:'option',is_active:true,instrument_name:'SOL-FAKE',base_currency:'BTC'}]},'SOL').length,0);
});
test('catalog transport failure cannot prove that an option market is absent',async()=>{
 const out=await collectDeribitAltOptionsEvidence({db:new DB(),fetch_impl:async()=>({ok:false,status:503,json:async()=>null}),request_admit:()=>({allowed:true}),contract:'SOL-USDT',run_id:'FAIL',now:2000});
 assert.equal(out.status,'SOURCE_ERROR');assert.equal(out.summary.open_instrument_count,null);assert.equal(out.evidence.length,0);
});

test('a successful exact catalog absence is useful information, with no score or quote claim',async()=>{
 const {consumeBlockResultContext}=await import('../files/src/block-result-context.mjs');
 const out=await collectDeribitAltOptionsEvidence({db:new DB(),fetch_impl:async()=>({ok:true,status:200,json:async()=>catalog}),request_admit:()=>({allowed:true}),contract:'NEAR-USDT',run_id:'ABSENCE',now:2000,clock:()=>2000});
 const context=consumeBlockResultContext({evidence:out.evidence,contract:'NEAR-USDT',now:2000});
 assert.equal(context.facts.length,1);assert.equal(context.facts[0].block_id,'N14');assert.equal(context.facts[0].score_contribution,0);
 assert.match(context.facts[0].value,/открытых опционов актива не найдено.*только к этой площадке/u);
 assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:2000}).adjustment,0);
});
