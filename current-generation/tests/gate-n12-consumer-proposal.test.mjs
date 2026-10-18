import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {controlled,reconciledCandles,end,method} from './gate-n12-saved-inputs.mjs';
const modulePath=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {collectCandidateEvidenceV2}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
const {installEvidenceSourceStore}=await import(modulePath('evidence-source-store.mjs'));
const {installProviderMinuteLedger}=await import(modulePath('provider-minute-ledger.mjs'));
const {consumeEvidenceV2}=await import(modulePath('evidence-v2.mjs'));
const {consumeBlockResultContext}=await import(modulePath('block-result-context.mjs'));
const {formatManualReport}=await import(modulePath('manual-report-formatter.mjs'));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(modulePath('canonical-publication.mjs'));
function database(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}};}
test('shared proposal carries existing Gate N05 pages through actual candidate collector to N12 manual/V5/brief with0newsource requests',async t=>{
 const p=controlled({fast:true}),db=database();let gateHTTP=0;const now=p.observed_ts;t.mock.timers.enable({apis:['Date'],now});
 try{
  await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);
  const source=await collectCandidateEvidenceV2({db,contract:p.contract,asset_identity:p.identity,identity_method:method,asset_metadata:{},run_id:'GATE_N12_FULL_ROUTE_CONTROL',now:end+500,clock:()=>now,max_requests:18,coingecko_demo_api_key:'bad',source_health_admit:()=>({allowed:true}),request_admit:()=>({allowed:true}),fetch_impl:async u=>{
   if(!u.startsWith('https://api.gateio.ws/'))return new Response('{}',{status:403});gateHTTP++;const body=u.endsWith('/currencies')?p.currencies:u.endsWith('/currency_pairs')?p.spot:u.includes('/candlesticks?')?reconciledCandles(p):p.pages[0];return new Response(JSON.stringify(body));
  }});
  const rows=source.evidence.filter(r=>r.provider_id==='GATE_SPOT_TRADES');assert.equal(rows.length,1);assert.equal(gateHTTP,4);assert.equal(rows[0].coverage_fraction,0);
  assert.equal(consumeEvidenceV2(rows,{base_interest:70,decision_ts:now}).adjustment,0);
  const consumer=consumeBlockResultContext({evidence:rows,contract:p.contract,now});assert.equal(consumer.facts.length,1);assert.match(consumer.facts[0].value,/Gate спот/);assert.equal(consumer.facts[0].score_contribution,0);
  const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);c.observed_ts=now;c.snapshot_id=`S392:PEOPLE-USDT:${now}`;c.metadata.contract=p.contract;c.metadata.internal_market_context.evidence_v2.evidence=rows;c.metadata.internal_market_context.candidate_context={asset_identity:p.identity};c.metadata.supporting_context={facts:consumer.facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c),v5=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),brief=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_BRIEF_20261007'});
  assert.equal(manual.ok,true);assert.equal(v5.ok,true);assert.equal(brief.ok,true);for(const x of [manual,v5,brief]){assert.match(x.text,/Gate.*спот/);assert.match(x.text,/выборка неполная|неполная выборка/);assert.match(x.text,/межбиржевой вывод не подтверждён|общее направление не подтверждено/);}
 }finally{db.sqlite.close();t.mock.timers.reset();}
});
