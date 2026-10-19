import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const home=path.dirname(fileURLToPath(import.meta.url));
const beforeRoot=process.env.REPORT2_RANGE_CLOCK_BEFORE||path.join(home,'.runtime/with522/current-generation/files/src');
const afterRoot=process.env.REPORT2_RANGE_CLOCK_AFTER||path.join(home,'.runtime/after/current-generation/files/src');
const load=(root,name)=>import(pathToFileURL(path.join(root,name)));
const before=await load(beforeRoot,'block-result-context.mjs'),after=await load(afterRoot,'block-result-context.mjs');
const pubBefore=await load(beforeRoot,'canonical-publication.mjs'),pubAfter=await load(afterRoot,'canonical-publication.mjs');
const {buildEvidenceV2}=await load(afterRoot,'evidence-source-adapters.mjs');
const {validateEvidenceV2}=await load(afterRoot,'evidence-v2.mjs');
const contract='CT-USDT',source=1792397520111,observed=1792397520261,decision=1792397560589,windowEnd=1792396800000;
let HTTP=0;globalThis.fetch=async()=>{HTTP++;throw Error('OFFLINE_ONLY');};
function range(){
 // Saved CT range descriptor, with a CONTROLLED body reconstruction; no claim
 // that the original 20 raw candles or acquisition wire are present in ZIP.
 return buildEvidenceV2({provider_id:'PRIMARY_TECHNICAL_CONTEXT',upstream_id:'HTX_OFFICIAL_CLOSED_CANDLES',asset_id:`htx-futures:${contract}`,htx_contract:contract,block_id:'N10',metric_family:'CLOSED_CANDLE_RANGE_CONTEXT',origin_event_id:`${contract}:60min:${windowEnd}`,dependency_group:`HTX_CLOSED_CANDLES:${contract}:60min:${windowEnd}`,source_ts:source,observed_ts:observed,expires_at:source+180000,coverage_status:'EXACT_TWENTY_CLOSED_CANDLES',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{period:'60min',interval_ms:3600000,candle_count:20,window_start:windowEnd-20*3600000,window_end:windowEnd,range_high:.43485,range_low:.2868,last_closed_price:.37108,range_pct:(.43485/.2868-1)*100,all_candles_closed:true,source_clock_policy:'HTX_PRIMARY_RESPONSE_AND_CLOSED_CANDLE_IDS',entry_authorized_by_context:false,liquidation_as_target:false}});
}
function canonical(context,row,pub){
 const c={status:'CLOSED',state:'OBSERVE',direction:'LONG',run_id:'CONTROLLED:RANGE_CLOCK',snapshot_id:'CONTROLLED:CT:RANGE_CLOCK',observed_ts:decision,universe:[{contract}],candidates:[{contract}],scores:{overall_0_100:80,coin_interest_0_100:80,is_probability:false},entry:{area:'0.37'},trigger:{metric:'price',operator:'>=',value:.38,unit:'USDT',timeframe:'5m',expires_ts:decision+600000,next_recheck_ts:decision+60000,cancel_condition:'price<0.35'},invalidation:{condition:'price<0.35'},targets:[],reasons:[],source_receipts:[],hard_gates:[],liquidations:{above:[],below:[],future_only:true},metadata:{contract,internal_market_context:{evidence_v2:{evidence:[row]}},supporting_context:{facts:context.facts}}};
 c.analytical_fingerprint=pub.canonicalFingerprint(c);return c;
}
function surfaces(mod,pub,row){
 const context=mod.consumeBlockResultContext({evidence:[row],contract,now:decision});
 assert.equal(context.facts.length,1,'the legacy range remains useful');
 const c=canonical(context,row,pub),manual=pub.renderCanonicalManual({canonical:c}),telegram=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});
 assert.equal(manual.ok,true,manual.status);assert.equal(telegram.ok,true,telegram.status);
 const audit=mod.auditRenderedBlockResults({canonical:JSON.parse(JSON.stringify(c)),manual,telegram});
 assert.equal(audit.context_receipts.length,1);assert.equal(audit.telegram_context_receipts.length,1);
 return{context,canonical:c,manual,telegram,audit};
}
function mockDB(){const state={row:null,calls:0};return{state,prepare(){return{bind(...args){return{async run(){state.calls++;state.row={publication_id:args[0],analytical_fingerprint:args[10],canonical_json:args[11]};return{meta:{changes:1}};},async first(){state.calls++;return state.row;}};}};}};}

test('NEW connected saved CT range counterexample: omit invalid original-clock metadata, preserve range/text/score through persisted consumer',async()=>{
 const good=range();assert.equal(good.evidence_id,'EV2:4950c242227e5159f740b1586e00354b88259c77984adf3913f7e0c8a1e5f57e');
 const receipt={schema:'N10_RANGE_CLOCK_VALIDITY_COUNTEREXAMPLE_V1',saved_descriptor_run:39220988644,saved_range_id:good.evidence_id,input_trust:'SAVED_RANGE_DESCRIPTOR_PLUS_CONTROLLED_CORRUPTED_CLOCK_NOT_NATIVE_CORRUPTION',cases:[],sourceHTTP:0,nativeSQL:0,MAIN:0,Telegram_network:0};
 const invalid=[['first_known_before_source',{first_known_ts:source-1}],['first_known_after_observed',{first_known_ts:observed+1}],['first_known_numeric_string',{first_known_ts:String(observed)}],['first_known_fractional',{first_known_ts:source+.5}],['source_fractional',{source_ts:source+.5}],['observed_fractional',{observed_ts:observed+.5}],['expiry_numeric_string',{expires_at:String(source+180000)}],['expiry_fractional',{expires_at:source+180000.5}]];
 for(const [name,change] of [['valid_control',{}],...invalid]){
  const row={...good,...change};assert.equal(row.evidence_id,good.evidence_id);assert.equal(row.raw_hash,good.raw_hash);
  assert.equal(validateEvidenceV2(row,{decision_ts:decision}).usable,true,'do not change the legacy global validator');
  const b=surfaces(before,pubBefore,row),a=surfaces(after,pubAfter,row),valid=name==='valid_control';
  assert.ok(b.context.facts[0].original_clock,'the new522 attachment previously copied the invalid clock');
  for(const projected of [a.context.facts[0],a.audit.context_receipts[0],a.audit.telegram_context_receipts[0]]){
   assert.equal(Object.hasOwn(projected,'original_clock'),valid);
   if(valid)assert.deepEqual(projected.original_clock,b.context.facts[0].original_clock);
  }
  assert.equal(a.manual.text,b.manual.text);assert.equal(a.telegram.text,b.telegram.text);
  assert.deepEqual(a.canonical.scores,b.canonical.scores);assert.deepEqual(a.canonical.trigger,b.canonical.trigger);assert.deepEqual(a.canonical.targets,b.canonical.targets);
  assert.equal(a.audit.telegram_delivery_proven,false);assert.equal(a.audit.telegram_message_id,null);
  // Persist the original range unchanged, including its defective raw clock;
  // only the new derived metadata is omitted. No source-clock repair happens.
  const db=mockDB(),saved=await pubAfter.persistCanonicalSnapshot(db,{canonical:a.canonical,now_ts:decision});
  assert.equal(saved.status,'CLOSED');assert.equal(db.state.calls,2);
  const recovered=JSON.parse(db.state.row.canonical_json);
  assert.deepEqual(recovered.metadata.internal_market_context.evidence_v2.evidence[0],row);
  const persistedAudit=after.auditRenderedBlockResults({canonical:recovered,manual:a.manual,telegram:a.telegram});
  assert.equal(Object.hasOwn(persistedAudit.context_receipts[0],'original_clock'),valid);
  receipt.cases.push({name,legacy_range_retained:true,new_metadata:valid?'EXACT_ORIGINAL_CLOCK':'OMITTED_INVALID_CLOCK',manual_byte_delta:Buffer.byteLength(a.manual.text)-Buffer.byteLength(b.manual.text),telegram_byte_delta:Buffer.byteLength(a.telegram.text)-Buffer.byteLength(b.telegram.text),controlled_SQL_calls:db.state.calls,native_readback:false});
 }
 assert.equal(HTTP,0);receipt.attempted_sourceHTTP=HTTP;
 fs.writeFileSync(process.env.REPORT2_RANGE_CLOCK_WITNESS||path.join(home,'range-clock-witness.json'),JSON.stringify(receipt,null,2)+'\n');
});
