import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {SQLiteDB} from '../../telegram-repair-tests/sqlite-db.mjs';
import {verifiedRoleView} from './source-role-fixtures.mjs';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const imp=p=>import(pathToFileURL(path.join(root,'src',p)));
const pub=await imp('canonical-publication.mjs');
const {buildRuntimeCanonicalBundle}=await imp('canonical-runtime-adapter.mjs');
const {canonicalLifecycleAuthority}=await imp('canonical-lifecycle-authority.mjs');
const {prepareLifecycleTransition,finalizeLifecycleDispatch}=await imp('v3-telegram-runtime.mjs');
const {deriveLifecycleContext}=await imp('v3-telegram-lifecycle-sidecar.mjs');
const {runBoundTelegramDeliverySidecar}=await imp('bound-telegram-delivery-sidecar.mjs');
const {auditRenderedBlockResults,confirmedBlockContextFacts}=await imp('block-result-context.mjs');
const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/batched-retained-delivery-source-manifest.json',import.meta.url)));
const corpus={rows:[],weekly_journal:manifest.weekly_journal};
for(const source of manifest.sources){const raw=JSON.parse(gunzipSync(fs.readFileSync(path.join('batch-source',source.name,source.file))));
 for(const r of raw.rows||raw.results||[]){if(r.canonical)corpus.rows.push({...r,source_cloud_run:raw.source_cloud_run,source_manifest:source});}
}
const range=JSON.parse(fs.readFileSync(new URL('./fixtures/actual-1425-range-boundaries.json',import.meta.url))).rows.find(r=>r.contract==='ADA-USDT');
const proof={schema:'BATCHED_DELIVERY_REPLAY_V1',scope:'UNCHANGED_ACTUAL_CANONICAL_AND_SEPARATE_CONTROLLED_COMPOSED_PIPELINE',sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,fresh_SENT:false,actual:[],controlled:[],weekly:{}};
globalThis.fetch=async()=>{throw Error('REAL_NETWORK_FORBIDDEN_IN_REPLAY');};
function rangeCanonical(side='LONG'){
 const ts=range.observed_ts,wave=range.early.items[0].wave_id,er=range.direction_receipt;
 // Real source range and clocks; qualification envelope is controlled, never
 // asserted to be an original producer replay or a new sendable market idea.
 const x={contract:range.contract,run_id:'CONTROLLED-BATCH',snapshot_id:`S392:${range.contract}:${ts}`,observed_ts:ts,discovery_row:{contract:range.contract,current_price:range.price,early_candidate_bridge:true,early_candidate_wave_id:wave,wave_id:wave,early_candidate_quality_0_100:82,early_candidate_receipt:{status:'CLOSED',contract:range.contract,wave_id:wave,source_ts:er.source_ts,available_at:er.available_at,direction_hint:side,direction_state:side+'_WATCH',evidence:[{status:'CLOSED',side}]}},publication_shadow:{entry_signal:{state:'REJECTED'}},opportunity:{observed_ts:range.anomaly.producer_observed_ts,newest_event:{event_id:range.anomaly.event_id,event_close_ts:range.anomaly.event_close_ts,candle:{high:range.anomaly.event_high,low:range.anomaly.event_low},minute_decomposition:{classification_allowed:side==='LONG'}}},internal_market_context:{internal_only:true,evidence_v2:{evidence:range.technical_evidence}}};
 // SHORT is a controlled mirror with anomaly classification unavailable; both
 // directions must use factual forward boundaries rather than an invalid cancel.
 const c=buildRuntimeCanonicalBundle(x).canonical;
 c.metadata.source_role_view=verifiedRoleView(range.contract,ts);
 c.analytical_fingerprint=pub.canonicalFingerprint(c);return c;
}
function database(){
 const db=new SQLiteDB();db.sqlite.exec(fs.readFileSync('post-v7-consolidated/liquidation/unified-delivery-base/migrations.sql','utf8'));
 const prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql);s.sql=sql;return s;};
 db.batch=async stmts=>{db.sqlite.exec('BEGIN IMMEDIATE');try{const result=stmts.map(s=>({success:true,meta:{changes:Number(db.sqlite.prepare(s.sql).run(...(s.args||[])).changes)}}));db.sqlite.exec('COMMIT');return result;}catch(e){db.sqlite.exec('ROLLBACK');throw e;}};return db;
}
function envelope(c){
 const ts=c.observed_ts,contract=c.metadata.contract,wave=c.early_candidate.items[0].wave_id;
 const row={publication_id:'CONTROLLED-PUB:'+c.direction,contract_code:contract,run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:wave,direction:c.direction,canonical_state:c.state,observed_ts:ts,created_ts:ts+10,analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c)};
 const handoff={contract_code:contract,source_run_id:c.run_id,wave_id:wave,scan_ts:ts-1000,deep_started_ts:ts-500,deep_completed_ts:ts+100,state:'COMPLETED',execution_status:'COMPLETED',data_sufficiency:'PARTIAL',handoff_direction:c.direction};
 const early={contract_code:contract,wave_id:wave,last_seen_ts:ts,first_seen_ts:ts-10000,lifecycle_stage:'DISCOVERY',direction_hint:c.direction,early_detection_quality_0_100:82};
 const shadow={contract_code:contract,observed_ts:ts,created_ts:ts,direction_hint:c.direction,stage:'SHADOW_OBSERVE_'+c.direction+'_BIAS',dq_status:'PARTIAL',eq_status:'SHADOW_MEASURABLE',data_sufficiency:'PARTIAL'};
 const now=ts+1000,derived=deriveLifecycleContext({handoff,early,shadow,now_ts:now,canonical:row,canonical_required:true,dispatch_enabled:true});
 return{row,handoff,early,now,derived};
}
async function prepare(c){
 const db=database(),x=envelope(c);assert.equal(x.derived.status,'CLOSED',JSON.stringify(x.derived));
 const r=await pub.persistCanonicalSnapshot(db,{canonical:c,wave_id:x.row.wave_id,now_ts:x.row.created_ts});assert.ok(r.publication_id,JSON.stringify(r));
 const transition=await prepareLifecycleTransition(db,x.derived.ctx,x.now);assert.ok(transition.dispatch,JSON.stringify(transition));return{db,x,transition};
}
function rowState(db){return db.sqlite.prepare('SELECT state,telegram_message_id,last_error FROM v3_telegram_dispatch_shadow ORDER BY created_ts DESC LIMIT 1').get();}

test('all retained canonical rows preserve fingerprint, source clocks, refusals and approved renderers',()=>{
 assert.equal(corpus.rows.length,10);
 for(const r of corpus.rows){const c=r.canonical,before=JSON.stringify(c);assert.equal(pub.canonicalFingerprint(c),c.analytical_fingerprint);
  const event=c.state==='WAIT_FOR_TRIGGER'?'WAIT':c.state.startsWith('ENTRY_NOW')?'ENTRY':'OBSERVE';
  const action=pub.assessActionability({canonical:c,lifecycle_event:event}),tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:event}),manual=pub.renderCanonicalManual({canonical:c});
  assert.equal(action.deliver,false,'no retained row is silently promoted');assert.equal(JSON.stringify(c),before);
  proof.actual.push({publication_id:r.publication_id,run_id:c.run_id,snapshot_id:c.snapshot_id,fingerprint:c.analytical_fingerprint,contract:c.metadata.contract,state:c.state,direction:c.direction,interest:c.scores.coin_interest_0_100,action:action.reason,telegram:tg.status,manual:manual.status,source_cloud_run:r.source_cloud_run});
 }
 for(const [state,r] of Object.entries(corpus.weekly_journal.states)){assert.equal(r.complete,true);proof.weekly[state]=r.rows.length;}
 proof.weekly.scope=corpus.weekly_journal.scope;
});
test('same retained corpus binds block facts to approved output without inventing scores or liquidation targets',()=>{
 proof.block_and_liquidation=[];
 for(const r of corpus.rows){const c=r.canonical,before=JSON.stringify(c),manual=pub.renderCanonicalManual({canonical:c}),telegram=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
  const audit=auditRenderedBlockResults({canonical:c,manual,telegram});
  for(const f of [...audit.context_receipts,...audit.telegram_context_receipts]){assert.ok(f.evidence_id&&f.physical_root_key);if(f.score_contribution!==undefined)assert.equal(f.score_contribution,0);assert.ok(f.source_ts<=c.observed_ts);}
  assert.equal(audit.telegram_delivery_proven,false);assert.equal(audit.entry_authorized,false);assert.equal(JSON.stringify(c),before);
  const blocks=c.metadata.internal_market_context?.evidence_v2?.block_coverage?.blocks||{};
  proof.block_and_liquidation.push({run_id:c.run_id,snapshot_id:c.snapshot_id,contract:c.metadata.contract,blocks:Object.fromEntries(Object.entries(blocks).map(([id,b])=>[id,{status:b.status,checked:b.checked,observed_facts:b.observed_facts,valid_context_facts:b.valid_context_facts,usable_facts:b.usable_facts,source_statuses:b.source_statuses}])),bound_context_facts:confirmedBlockContextFacts(c).length,manual_context_blocks:audit.used_context_block_ids,telegram_context_blocks:audit.telegram_used_context_block_ids,available_not_rendered:audit.available_not_rendered_evidence_ids.length,accepted_liquidation_levels:(c.liquidations.above||[]).length+(c.liquidations.below||[]).length,liquidation_status:c.liquidations.future_levels_status,targets:c.targets.length});
 }
});
for(const side of ['LONG','SHORT'])test(`${side}: composed adapter to lifecycle to approved binding to injected relay and dedup`,async()=>{
 const c=rangeCanonical(side);assert.equal(c.state,'OBSERVE');assert.equal(c.metadata.direction_resolution.authorized_entry_direction,'UNKNOWN');assert.equal(pub.assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,true);
 const {db,x,transition}=await prepare(c);try{let calls=0;const sentText=[];const opts={enabled:true,source_run_id:c.run_id,now_ts:x.now+1,relay_url:'https://controlled.invalid/relay',relay_key:'CONTROLLED-NONSECRET',fetch_impl:async(url,o)=>{calls++;assert.equal(url,'https://controlled.invalid/relay');sentText.push(JSON.parse(o.body).text);return{ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:9001})};}};
  const delivered=await runBoundTelegramDeliverySidecar(db,opts);assert.equal(delivered.sent,1,JSON.stringify(delivered));assert.equal(rowState(db).state,'SENT');assert.equal(rowState(db).telegram_message_id,'9001');assert.equal(calls,1);assert.equal(sentText[0],pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}).text);
  const binding=db.sqlite.prepare('SELECT * FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key=?').get(transition.dispatch.idempotency_key);assert.equal(binding.run_id,c.run_id);assert.equal(binding.snapshot_id,c.snapshot_id);assert.equal(binding.analytical_fingerprint,c.analytical_fingerprint);
  assert.equal((await runBoundTelegramDeliverySidecar(db,opts)).sent,0);assert.equal(calls,1);proof.controlled.push({case:side+'_FULL_PIPELINE',injected_receipt_id:9001,relay_invocations:calls,duplicate_invocations:0,snapshot_id:c.snapshot_id});
 }finally{db.close();}
});
for(const [name,response] of Object.entries({NO_ID:{ok:true,status:'SENT'},ZERO_ID:{ok:true,status:'SENT',message_id:0},NONNUMERIC_ID:{ok:true,status:'SENT',message_id:'abc'},READY_ONLY:{ok:true,status:'READY'},NEGATIVE_ID:{ok:true,status:'SENT',message_id:-1}}))test(`ambiguous relay ${name} cannot be recorded as a confirmed delivery`,async()=>{
 const c=rangeCanonical(),{db,x}=await prepare(c);try{let calls=0;const result=await runBoundTelegramDeliverySidecar(db,{enabled:true,source_run_id:c.run_id,now_ts:x.now+1,relay_url:'https://controlled.invalid/relay',relay_key:'CONTROLLED-NONSECRET',fetch_impl:async()=>{calls++;return{ok:true,status:200,json:async()=>response};}});assert.equal(result.sent,0,JSON.stringify(result));assert.notEqual(rowState(db).state,'SENT');assert.equal(calls,1);proof.controlled.push({case:name,final_state:rowState(db).state});}finally{db.close();}
});
for(const [name,mutate] of Object.entries({LOW_SCORE:c=>{c.scores.coin_interest_0_100=69;},DIRECTION_UNKNOWN:c=>{c.direction=null;},MISSING_TRIGGER:c=>{c.trigger=null;},MISSING_CONFIRMING_SOURCE:c=>{c.metadata.source_role_view.classified=c.metadata.source_role_view.classified.filter(r=>r.source_key==='HTX_OFFICIAL');},REJECTED:c=>{c.state='REJECTED';}}))test(`qualification ${name} blocks the composed chain before network delivery`,()=>{
 const c=rangeCanonical();mutate(c);c.analytical_fingerprint=pub.canonicalFingerprint(c);const x=envelope(c);if(name!=='MISSING_TRIGGER')assert.notEqual(canonicalLifecycleAuthority({row:x.row,handoff:x.handoff,early:x.early,now_ts:x.now}).status,'CLOSED');assert.equal(pub.assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,false);proof.controlled.push({case:name,relay_invocations:0});
});
test('expired or fingerprint-corrupted persisted publication cannot reach the relay',async()=>{
 for(const mode of ['EXPIRED','FINGERPRINT']){const c=rangeCanonical(),{db,x}=await prepare(c);try{if(mode==='FINGERPRINT')db.sqlite.prepare("UPDATE canonical_publication_shadow SET analytical_fingerprint=?").run('0'.repeat(64));let calls=0;const result=await runBoundTelegramDeliverySidecar(db,{enabled:true,source_run_id:c.run_id,now_ts:mode==='EXPIRED'?c.trigger.expires_ts+1:x.now+1,relay_url:'https://controlled.invalid/relay',relay_key:'CONTROLLED-NONSECRET',fetch_impl:async()=>{calls++;throw Error('UNEXPECTED_RELAY');}});assert.equal(result.sent,0);assert.equal(calls,0);proof.controlled.push({case:mode,relay_invocations:0,state:rowState(db).state});}finally{db.close();}}
});
test('journal finalization itself requires a positive receipt even when a caller says confirmed',async()=>{
 for(const id of [null,0,-1,'abc','1.5',true]){const c=rangeCanonical(),{db,x,transition}=await prepare(c);try{
  db.sqlite.prepare("UPDATE v3_telegram_dispatch_shadow SET state='SENDING'").run();
  const r=await finalizeLifecycleDispatch(db,{idempotency_key:transition.dispatch.idempotency_key,network_result:'CONFIRMED_SENT',telegram_message_id:id,now_ts:x.now+1});
  assert.equal(r.state,'FAILED_RETRYABLE');assert.equal(rowState(db).last_error,'TELEGRAM_MESSAGE_ID_NOT_CONFIRMED');
 }finally{db.close();}}
 proof.controlled.push({case:'FINALIZER_INDEPENDENT_RECEIPT_GUARD',invalid_ids:6});
});
for(const [name,response] of Object.entries({SERVER_500:{ok:false,status:500,body:null},REJECTED_400:{ok:false,status:400,body:{ok:false,status:'REJECTED'}},NETWORK_ERROR:null}))test(`composed transport ${name} preserves failure without false delivery`,async()=>{
 const c=rangeCanonical(),{db,x}=await prepare(c);try{const r=await runBoundTelegramDeliverySidecar(db,{enabled:true,source_run_id:c.run_id,now_ts:x.now+1,relay_url:'https://controlled.invalid/relay',relay_key:'CONTROLLED-NONSECRET',fetch_impl:async()=>{if(!response)throw Error('CONTROLLED_NETWORK_ERROR');return{ok:response.ok,status:response.status,json:async()=>response.body};}});
 assert.equal(r.sent,0);assert.notEqual(rowState(db).state,'SENT');proof.controlled.push({case:name,state:rowState(db).state});}finally{db.close();}
});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/batched-delivery-proof.json',JSON.stringify(proof,null,2)+'\n');});
