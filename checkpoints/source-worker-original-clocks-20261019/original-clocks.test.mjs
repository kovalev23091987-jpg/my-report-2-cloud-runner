import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const home=path.dirname(fileURLToPath(import.meta.url));
const base=process.env.REPORT2_CLOCK_BASE_RUNTIME||path.join(home,'.runtime/base/src');
const runtime=process.env.REPORT2_CLOCK_RUNTIME||path.join(home,'.runtime/proposed/src');
const load=(root,file)=>import(pathToFileURL(path.join(root,file)));
const old=await load(base,'htx-technical-structure.mjs');
const next=await load(runtime,'htx-technical-structure.mjs');
const contexts=await load(runtime,'block-result-context.mjs');
const oldContexts=await load(base,'block-result-context.mjs');
const adapter=await load(runtime,'canonical-runtime-adapter.mjs');
const oldAdapter=await load(base,'canonical-runtime-adapter.mjs');
const publication=await load(runtime,'canonical-publication.mjs');
const oldPublication=await load(base,'canonical-publication.mjs');

// OHLC and clocks below are transcribed from the exact saved CT rendered row.
// The earlier availability and raw 20-bar envelope are CONTROLLED inputs, not
// reconstructed historical acquisition, native HTX wire, or native cache ACK.
const contract='CT-USDT',end=1792397460000,now=1792397560589,available=end+65000;
const observedWindow={label:'15m',window_start_ts:end-900000,window_end_ts:end,candle_count:15,open:.36749,high:.38027,low:.356,close:.37241};
const witness={schema:'N10_ORIGINAL_CLOCK_COUNTEREXAMPLE_V1',input_kind:'SAVED_CT_OHLC_AND_CLOCKS_PLUS_CONTROLLED_AVAILABILITY_AND_RAW_ENVELOPE',source_run:39220988644,source_ts:end,decision_ts:now,controlled_available_ts:available,sourceHTTP:0,nativeSQL:0,MAIN:0,Telegram_network:0};
let attemptedHTTP=0;
globalThis.fetch=async()=>{attemptedHTTP++;throw Error('OFFLINE_NO_HTTP');};

function primary(mod,{clock=available,omit=false,decision=now}={}){
 mod.clearHtxTechnicalSnapshots();
 mod.observeHtxTechnicalSnapshot({status:'ok',ts:end+3000,ch:`market.${contract}.kline.1min`,data:Array.from({length:20},(_,i)=>({id:(end-1200000+i*60000)/1000,open:.36749,high:.38027,low:.356,close:.37241}))},`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${contract}&period=1min`,end+4000);
 return mod.buildHtxPrimaryTechnicalReceipt({contract,now:decision,route_state:'REJECTED',
  futures:{execution_status:'FULFILLED',data:{contract,health:{info:true,depth:true},contract_info:{contract_code:contract,contract_status:1,contract_size:1},bbo:{best_bid:.3723,best_ask:.3725},liquidity:{depth_timestamp:new Date(now-1000).toISOString()}}},
  trajectory:{execution_status:'FULFILLED',...(omit?{}:{available_ts:clock}),data:{contract,health:{info:true,price_1m:true},contract_info:{contract_code:contract},provider_source_ts:end,windows:{'15m':{synchronized_window_start_ts:observedWindow.window_start_ts,synchronized_window_end_ts:end,price:{...observedWindow,usable:true,coverage:'closed',exact_1m_bars:true,expected_1m_bars:15,received_1m_bars:15}}}}},
  reference_price:{status:'CLOSED',venue:'HTX',type:'MID_OBSERVATION',contract,value:.3724,source_ts:now-1000,received_ts:now-500}});
}
const pathRow=receipt=>receipt.evidence.find(r=>r.metric_family==='CLOSED_15M_PRICE_PATH_CONTEXT');
function canonical(mod,receipt,decision=now){
 return mod.buildRuntimeCanonicalBundle({contract,run_id:'CONTROLLED:CLOCK:392209',snapshot_id:'CONTROLLED:CT:CLOCK',observed_ts:decision,discovery_row:{current_price:.3724},publication_shadow:{entry_signal:{state:'REJECTED',direction:'LONG'}},internal_market_context:{internal_only:true,evidence_v2:{evidence:receipt.evidence,sources:{PRIMARY_TECHNICAL_CONTEXT:receipt}}}});
}
function approve(mod,c){return mod.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});}
const fakeDB=()=>{
 const state={calls:[],row:null};
 return {state,prepare(sql){return{bind(...args){return{async run(){state.calls.push('CONTROLLED_INSERT');state.row={publication_id:args[0],analytical_fingerprint:args[10],canonical_json:args[11]};return{meta:{changes:1}};},async first(){state.calls.push('CONTROLLED_SELECT');return state.row;}};}};}};
};

test('new counterexample: final producer retains collector availability instead of assembly time',()=>{
 const before=primary(old),after=primary(next),a=pathRow(before),b=pathRow(after);
 assert.equal(before.check_completed,true);assert.equal(after.check_completed,true);
 assert.equal(a.first_known_ts,now);assert.equal(b.first_known_ts,available);
 for(const key of ['evidence_id','raw_hash','source_ts','observed_ts','expires_at','path_open','path_high','path_low','path_close','coverage_fraction','directional_strength','risk_strength'])assert.deepEqual(b[key],a[key]);
 assert.equal(b.entry_authorized_by_context,false);assert.equal(after.network_calls,0);
 witness.before_first_known_ts=a.first_known_ts;witness.after_first_known_ts=b.first_known_ts;witness.assembly_substitution_ms=now-available;
});

test('legacy missing acquisition clock remains conservative and byte-identical; invalid present clock does not fabricate availability',()=>{
 assert.deepEqual(primary(next,{omit:true}),primary(old,{omit:true}));
 for(const bad of [end-1,now+1,'1792397525000',1.25,0]){
  const r=primary(next,{clock:bad});assert.equal(pathRow(r),undefined);
  assert.ok(r.evidence.some(e=>e.metric_family==='CLOSED_CANDLE_RANGE_CONTEXT'));
 }
});

test('explicit first-known ordering is enforced by direct producer and current descriptive consumer',()=>{
 const row=pathRow(primary(next));
 for(const bad of [end-1,now+1,'1792397525000',NaN]){
  assert.equal(next.deriveHtxRecentPathEvidence({contract,window:observedWindow,source_ts:end,observed_ts:now,first_known_ts:bad}).length,0);
  const invalid={...row,first_known_ts:bad};
  assert.equal(contexts.consumeBlockResultContext({evidence:[invalid],contract,now}).facts.length,0);
 }
 assert.equal(next.deriveHtxRecentPathEvidence({contract,window:observedWindow,source_ts:end,observed_ts:now,first_known_ts:available})[0].first_known_ts,available);
});

test('canonical builder and controlled exact JSON INSERT/readback preserve original N10 evidence clocks',async()=>{
 const result=canonical(adapter,primary(next)),c=result.canonical;
 const source=c.metadata.internal_market_context.evidence_v2.evidence.find(e=>e.metric_family==='CLOSED_15M_PRICE_PATH_CONTEXT');
 assert.equal(source.first_known_ts,available);assert.equal(source.source_ts,end);
 const db=fakeDB(),p=await publication.persistCanonicalSnapshot(db,{canonical:c,now_ts:now});
 assert.equal(p.status,'CLOSED');assert.equal(p.persisted,true);
 assert.deepEqual(db.state.calls,['CONTROLLED_INSERT','CONTROLLED_SELECT']);
 const saved=JSON.parse(db.state.row.canonical_json),savedRow=saved.metadata.internal_market_context.evidence_v2.evidence.find(e=>e.evidence_id===source.evidence_id);
 assert.deepEqual(savedRow,source);assert.equal(saved.analytical_fingerprint,publication.canonicalFingerprint(saved));
 witness.controlled_canonical_JSON_bytes=Buffer.byteLength(db.state.row.canonical_json);
 witness.controlled_SQL_call_count=2;witness.native_readback=false;
});

test('source clock survives actual manual and approved Telegram context audits without changing either text or scores',()=>{
 const before=canonical(oldAdapter,primary(old)),after=canonical(adapter,primary(next));
 assert.equal(after.manual.ok,true);assert.equal(after.manual.text,before.manual.text);
 assert.deepEqual(after.canonical.scores,before.canonical.scores);
 for(const key of ['state','direction','trigger','targets','entry','invalidation'])assert.deepEqual(after.canonical[key],before.canonical[key]);
 // The minimal builder input is REJECTED with direction NULL. A separate
 // explicitly controlled OBSERVE display fixture exercises the approved
 // Telegram renderer, without asserting source-role admission or delivery.
 const display=(mod,c)=>{const copy=structuredClone(c);copy.state='OBSERVE';copy.direction='LONG';copy.entry={area:'0.37'};copy.trigger={metric:'price',operator:'>=',value:.38,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<0.35'};copy.analytical_fingerprint=mod.canonicalFingerprint(copy);return copy;};
 const oldDisplay=display(oldPublication,before.canonical),shown=display(publication,after.canonical);
 const oldTelegram=approve(oldPublication,oldDisplay),telegram=approve(publication,shown);
 assert.equal(telegram.ok,true,telegram.status);assert.equal(telegram.text,oldTelegram.text);
 const manualOutput=publication.renderCanonicalManual({canonical:shown}),oldManual=oldPublication.renderCanonicalManual({canonical:oldDisplay});
 assert.equal(manualOutput.ok,true);assert.equal(manualOutput.text,oldManual.text);
 const proof=contexts.auditRenderedBlockResults({canonical:JSON.parse(JSON.stringify(shown)),manual:manualOutput,telegram});
 const manual=proof.context_receipts.find(r=>r.evidence_id===pathRow(primary(next)).evidence_id);
 const tg=proof.telegram_context_receipts.find(r=>r.evidence_id===manual.evidence_id);
 assert.ok(tg,'the actual approved V5 renderer represents the tested path');
 for(const r of [manual,tg]){
  assert.equal(r.original_clock.source_ts,end);assert.equal(r.original_clock.first_known_ts,available);
  assert.equal(r.original_clock.observed_ts,now);assert.equal(r.original_clock.expires_at,end+180000);
  assert.equal(r.original_clock.window_start_ts,end-900000);assert.equal(r.original_clock.window_end_ts,end);
 }
 assert.equal(proof.telegram_delivery_proven,false);assert.equal(proof.telegram_message_id,null);
 const oldProof=oldContexts.auditRenderedBlockResults({canonical:oldDisplay,manual:oldManual,telegram:oldTelegram});
 witness.rendered_metadata_UTF8_delta=Buffer.byteLength(JSON.stringify(proof))-Buffer.byteLength(JSON.stringify(oldProof));
 witness.manual_text_byte_delta=Buffer.byteLength(after.manual.text)-Buffer.byteLength(before.manual.text);
 witness.telegram_text_byte_delta=Buffer.byteLength(telegram.text)-Buffer.byteLength(oldTelegram.text);
 witness.actual_projected_N10_receipts=proof.context_receipts.filter(r=>r.block_id==='N10').length;
 witness.telegram_fixture='CONTROLLED_OBSERVE_DISPLAY_ONLY_NOT_ADMISSION_OR_NATIVE_DELIVERY';
 const output=path.join(home,'new-clock-witness.json');
 fs.writeFileSync(output,JSON.stringify({...JSON.parse(fs.readFileSync(output)),...witness},null,2)+'\n');
});

test('stored supporting clock cannot replace the revalidated canonical evidence clock',()=>{
 const result=canonical(adapter,primary(next)),c=structuredClone(result.canonical);
 for(const fact of c.metadata.supporting_context.facts)if(fact.block_id==='N10')fact.original_clock={first_known_ts:now+999999,source_ts:0};
 const proof=contexts.auditRenderedBlockResults({canonical:c,manual:result.manual});
 const r=proof.context_receipts.find(r=>r.evidence_id===pathRow(primary(next)).evidence_id);
 assert.equal(r.original_clock.first_known_ts,available);assert.equal(r.original_clock.source_ts,end);
});

test('a future or impossible original source clock is not repaired by a later canonical consumer',()=>{
 for(const bad of [end-1,now+1]){
  const result=canonical(adapter,primary(next)),c=structuredClone(result.canonical);
  const row=c.metadata.internal_market_context.evidence_v2.evidence.find(e=>e.metric_family==='CLOSED_15M_PRICE_PATH_CONTEXT');
  row.first_known_ts=bad;c.analytical_fingerprint=publication.canonicalFingerprint(c);
  assert.ok(!contexts.auditRenderedBlockResults({canonical:c,manual:result.manual}).context_receipts.some(r=>r.evidence_id===row.evidence_id));
 }
 const stale=primary(next,{decision:end+180001});assert.equal(pathRow(stale),undefined);
});

test('new source-clock audit covers the exact saved 12 receipts without reconstructing absent native bodies',()=>{
 const analysis=JSON.parse(fs.readFileSync(path.join(home,'saved-gap-analysis.json')));
 const rows=analysis.runs.flatMap(r=>r.candidates.flatMap(c=>c.N10_rendered_clock_projection));
 assert.equal(rows.length,12);assert.ok(rows.every(r=>!r.first_known_ts_retained&&!r.expiry_retained&&!r.original_clock_retained));
 assert.ok(analysis.runs.flatMap(r=>r.candidates).every(c=>!c.raw_N10_evidence_in_compact_canonical&&!c.acquisition_firstknown_reconstructed));
 assert.equal(analysis.new_concrete_defects.length,2);assert.equal(attemptedHTTP,0);
 witness.attempted_sourceHTTP=attemptedHTTP;
 fs.writeFileSync(path.join(home,'new-clock-witness.json'),JSON.stringify(witness,null,2)+'\n');
});
