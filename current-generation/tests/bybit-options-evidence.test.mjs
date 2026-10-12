import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const {normalizeBybitOptions,collectBybitOptionsEvidence}=await import(pathToFileURL(path.join(root,'src/bybit-options-evidence.mjs')));
const {consumeBlockResultContext}=await import(pathToFileURL(path.join(root,'src/block-result-context.mjs')));
const {auditRenderedBlockResults}=await import(pathToFileURL(path.join(root,'src/block-result-context.mjs')));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const {formatManualReport}=await import(pathToFileURL(path.join(root,'src/manual-report-formatter.mjs')));
const sampleRoot=path.resolve('checkpoints');
const files={DOGE:'n14-bybit-binance-samples-1791809275477',BTC:'n14-bybit-option-other-bases-1791809581526',ETH:'n14-bybit-option-other-bases-1791809581526',SOL:'n14-bybit-option-other-bases-1791809581526',XAUT:'n14-bybit-option-other-bases-1791809581526',HYPE:'n14-bybit-option-other-bases-1791809581526',XRP:'n14-bybit-option-other-bases-1791809581526'};
function source(base){return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(sampleRoot,files[base],`BYBIT_${base}_OPTION_TICKERS.json.gz`))));}

test('seven original provider responses close exact scoped call/put baskets, including new DOGE coverage',()=>{
 for(const base of Object.keys(files)){
  const payload=source(base),now=payload.time+1000,result=normalizeBybitOptions({contract:`${base}-USDT`,payload,observed_ts:now});
  assert.equal(result.status,'CLOSED',base);
  assert.equal(result.evidence.length,1,base);
  assert.equal(result.summary.sample_count,16,base);
  assert.equal(result.summary.call_count,8,base);
  assert.equal(result.summary.put_count,8,base);
  assert.equal(result.evidence[0].directional_strength,null,base);
  assert.equal(result.evidence[0].risk_strength,null,base);
  assert.equal(consumeBlockResultContext({evidence:result.evidence,contract:`${base}-USDT`,now}).facts.length,0,base);
 }
});

test('unknown quote age, stale response, wrong base and inactive baskets cannot create a fact',()=>{
 const original=source('DOGE'),now=original.time+1000;
 assert.equal(normalizeBybitOptions({contract:'ADA-USDT',payload:original,observed_ts:now}).evidence.length,0);
 assert.equal(normalizeBybitOptions({contract:'DOGE-USDT',payload:original,observed_ts:original.time+20*60_000+1}).evidence.length,0);
 const inactive=structuredClone(original);for(const row of inactive.result.list){row.volume24h='0';row.openInterest='0';}
 assert.equal(normalizeBybitOptions({contract:'DOGE-USDT',payload:inactive,observed_ts:now}).evidence.length,0);
 const wrongClock=structuredClone(original);wrongClock.time=now+1;
 assert.equal(normalizeBybitOptions({contract:'DOGE-USDT',payload:wrongClock,observed_ts:now}).evidence.length,0);
 const valid=normalizeBybitOptions({contract:'DOGE-USDT',payload:original,observed_ts:now}).evidence[0];
 const tampered={...valid,option_risk_context:{...valid.option_risk_context,mark_iv_median_pct:999}};
 assert.equal(consumeBlockResultContext({evidence:[tampered],contract:'DOGE-USDT',now}).facts.length,0);
});

test('paused N14 DOGE source fact is withheld from both manual and Telegram reports',()=>{
 const payload=source('DOGE'),now=payload.time+1000,result=normalizeBybitOptions({contract:'DOGE-USDT',payload,observed_ts:now});
 const c=structuredClone(JSON.parse(fs.readFileSync('checkpoints/btw-preserved-block-result-input-20261004.json')).canonical);
 c.metadata.contract='DOGE-USDT';c.observed_ts=now;c.direction='LONG';c.state='OBSERVE';
 c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};
 c.metadata.internal_market_context.evidence_v2.evidence=result.evidence;
 c.metadata.supporting_context={facts:consumeBlockResultContext({contract:'DOGE-USDT',evidence:result.evidence,now}).facts};
 c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});
 assert.equal(manual.ok,true);assert.equal(telegram.ok,true);
 const audit=auditRenderedBlockResults({canonical:c,manual,telegram});
 assert.deepEqual(audit.used_context_block_ids,[]);assert.deepEqual(audit.telegram_used_context_block_ids,[]);
 assert.doesNotMatch(manual.text,/Опционная волатильность актива на Bybit/);
 assert.doesNotMatch(telegram.text,/Опционная волатильность актива на Bybit/);
 assert.equal(audit.telegram_delivery_proven,false);
});

test('live collector calls one exact base only after shared and durable admission',async()=>{
 const payload=source('DOGE'),now=payload.time+1000;
 const db=allow=>({batch:async()=>{},prepare:sql=>({bind(){return this;},first:async()=>sql.includes('report2_evidence_source_reservation')&&allow?{source:'BYBIT_OPTIONS',attempts:1}:null,run:async()=>({})})});
 let http=0;
 const fetch_impl=async url=>{http++;assert.equal(url,'https://api.bybit.com/v5/market/tickers?category=option&baseCoin=DOGE');return{ok:true,status:200,text:async()=>JSON.stringify(payload)};};
 const input={contract:'DOGE-USDT',run_id:'ORIGINAL_REPLAY',now,clock:()=>now,fetch_impl};
 assert.equal((await collectBybitOptionsEvidence({...input,db:db(true),request_admit:()=>({allowed:false,status:'WHOLE_JOB_DENIED'})})).network_calls,0);
 assert.equal((await collectBybitOptionsEvidence({...input,db:db(false),request_admit:()=>({allowed:true})})).network_calls,0);
 assert.equal(http,0);
 const accepted=await collectBybitOptionsEvidence({...input,db:db(true),request_admit:()=>({allowed:true})});
 assert.equal(accepted.status,'CLOSED');assert.equal(accepted.network_calls,1);assert.equal(http,1);
});
