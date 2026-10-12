import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const {normalizeBinanceOptionInterest,collectBinanceOptionInterestEvidence}=await import(pathToFileURL(path.join(root,'src/binance-options-interest-evidence.mjs')));
const {consumeBlockResultContext,auditRenderedBlockResults}=await import(pathToFileURL(path.join(root,'src/block-result-context.mjs')));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const {formatManualReport}=await import(pathToFileURL(path.join(root,'src/manual-report-formatter.mjs')));
const {planCandidateEvidenceRoutes,BLOCK_SOURCE_REQUIREMENTS}=await import(pathToFileURL(path.join(root,'src/candidate-evidence-v2-runtime.mjs')));
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join('checkpoints',p))));
const full=read('n14-option-catalog-batch-1791808981122/BINANCE_OPTION_EXCHANGE_INFO.json.gz');
const catalog={serverTime:full.serverTime,optionSymbols:full.optionSymbols.filter(x=>x.underlying==='BNBUSDT').map(x=>Object.fromEntries(['symbol','side','strikePrice','underlying','quoteAsset','status','expiryDate','contractType'].map(k=>[k,x[k]])))};
const index=read('n14-binance-bnb-index-1791809976508/BNB_INDEX.json.gz');
const interest=read('n14-binance-bnb-interest-1791809914132/BNB_261016_OPEN_INTEREST.json.gz');
const now=index.time+1000;
const normalize=(input={})=>normalizeBinanceOptionInterest({contract:'BNB-USDT',catalog,index,interest,observed_ts:now,...input});

test('saved independent Binance option interest and index close only exact BNB context',()=>{
 const out=normalize();assert.equal(out.status,'CLOSED');assert.equal(out.summary.call_count,6);assert.equal(out.summary.put_count,6);assert.ok(out.summary.open_interest_usd>1_800_000);
 assert.equal(out.evidence[0].directional_strength,null);assert.equal(out.evidence[0].risk_strength,null);
 const fact=consumeBlockResultContext({contract:'BNB-USDT',evidence:out.evidence,now}).facts[0];assert.equal(fact.field,'BINANCE_SCOPED_OPTION_OPEN_INTEREST');assert.equal(fact.score_contribution,0);assert.match(fact.value,/котировки и IV не подтверждены/);
 assert.ok(BLOCK_SOURCE_REQUIREMENTS.N14.any.includes('BINANCE_OPTION_INTEREST'));
 assert.ok(planCandidateEvidenceRoutes({contract:'BNB-USDT',run_id:'replay',now}).routes.some(r=>r.name==='BINANCE_OPTION_INTEREST'));
});

test('wrong market, stale clocks, empty activity, absent put side and tampering fail closed',()=>{
 assert.equal(normalize({contract:'ADA-USDT'}).evidence.length,0);
 assert.equal(normalize({observed_ts:now+20*60_000+1}).evidence.length,0);
 assert.equal(normalize({interest:interest.map(x=>({...x,sumOpenInterest:'0',sumOpenInterestUsd:'0'}))}).evidence.length,0);
 assert.equal(normalize({interest:interest.filter(x=>x.symbol.endsWith('-C'))}).evidence.length,0);
 const out=normalize(),bad={...out.evidence[0],option_risk_context:{...out.evidence[0].option_risk_context,open_interest_usd:1}};
 assert.equal(consumeBlockResultContext({contract:'BNB-USDT',evidence:[bad],now}).facts.length,0);
});

test('the same controlled N14 BNB fact reaches manual and Telegram rendering',()=>{
 const out=normalize(),c=structuredClone(JSON.parse(fs.readFileSync('checkpoints/btw-preserved-block-result-input-20261004.json')).canonical);
 c.metadata.contract='BNB-USDT';c.observed_ts=now;c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};
 c.metadata.internal_market_context.evidence_v2.evidence=out.evidence;c.metadata.supporting_context={facts:consumeBlockResultContext({contract:'BNB-USDT',evidence:out.evidence,now}).facts};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});
 assert.equal(manual.ok,true);assert.equal(telegram.ok,true);
 const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.deepEqual(audit.used_context_block_ids,['N14']);assert.deepEqual(audit.telegram_used_context_block_ids,['N14']);assert.equal(audit.telegram_delivery_proven,false);
 assert.match(manual.text,/Открытый интерес по опционам BNB/);assert.match(telegram.text,/Открытый интерес по опционам BNB/);
});

test('collector applies whole-job and durable admission before exact three-call path',async()=>{
 const db=allow=>({batch:async()=>{},prepare:sql=>({bind(){return this;},first:async()=>sql.includes('report2_evidence_source_reservation')&&allow?{source:'BINANCE_OPTION_INTEREST',attempts:3}:null,run:async()=>({})})});
 const responses=[full,index,interest];let http=0;
 const fetch_impl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(responses[http++])});
 const input={contract:'BNB-USDT',run_id:'ORIGINAL_REPLAY',now,clock:()=>now,fetch_impl};
 assert.equal((await collectBinanceOptionInterestEvidence({...input,db:db(true),request_admit:()=>({allowed:false,status:'WHOLE_JOB_DENIED'})})).network_calls,0);
 assert.equal((await collectBinanceOptionInterestEvidence({...input,db:db(false),request_admit:()=>({allowed:true})})).network_calls,0);
 assert.equal(http,0);
 const result=await collectBinanceOptionInterestEvidence({...input,db:db(true),request_admit:()=>({allowed:true})});assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,3);assert.equal(http,3);
});
