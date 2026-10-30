import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {SQLiteDB} from '../../telegram-repair-tests/sqlite-db.mjs';

const current=path.resolve(process.env.REPORT2_CLOCK_RUNTIME),baseline=path.resolve(process.env.REPORT2_CLOCK_BASE_RUNTIME);
const load=(root,file)=>import(pathToFileURL(path.join(root,file)));
const [technical,oldTechnical,context,oldContext,lifecycle,oldLifecycle,pub,sender,runtime,roles]=await Promise.all([
 load(current,'htx-technical-structure.mjs'),load(baseline,'htx-technical-structure.mjs'),
 load(current,'block-result-context.mjs'),load(baseline,'block-result-context.mjs'),
 load(current,'v3-telegram-lifecycle-sidecar.mjs'),load(baseline,'v3-telegram-lifecycle-sidecar.mjs'),
 load(current,'canonical-publication.mjs'),load(current,'bound-telegram-delivery-sidecar.mjs'),
 load(current,'v3-telegram-runtime.mjs'),load(current,'source-role-consumer.mjs')]);
const collectorSource=fs.readFileSync('cloudflare/public-collector/injected-worker-tail.js','utf8');
const collector=Function('worker_default',collectorSource+'\nreturn {run:__report2RunPriceRechecks};')({});
let sourceHTTP=0;globalThis.fetch=async()=>{sourceHTTP++;throw Error('NO_EXTERNAL_TRANSPORT');};
const contract='CT-USDT',end=1792397460000,known=end+65000,T=1792397560589,wave='CONTROLLED:CLOCK:WAVE';
const window={label:'15m',window_start_ts:end-900000,window_end_ts:end,candle_count:15,open:.36749,high:.38027,low:.356,close:.37241};
const witness={schema:'CONNECTED_N10_CANONICAL_OBSERVATION_CLOCK_V1',trust:'SAVED_CT_OHLC_WITH_CONTROLLED_ENVELOPE_AND_REAL_LOCAL_SQLITE_NOT_NATIVE',cases:[],sourceHTTP:0,nativeSQL:0,Telegram:0,actual_ENTRY:null};
after(()=>{assert.equal(sourceHTTP,0);if(process.env.REPORT2_CLOCK_WITNESS)fs.writeFileSync(process.env.REPORT2_CLOCK_WITNESS,JSON.stringify(witness,null,2)+'\n');});
function primary(mod){
 mod.clearHtxTechnicalSnapshots();mod.observeHtxTechnicalSnapshot({status:'ok',ts:end+3000,ch:`market.${contract}.kline.1min`,data:Array.from({length:20},(_,i)=>({id:(end-1200000+i*60000)/1000,open:.36749,high:.38027,low:.356,close:.37241}))},`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${contract}&period=1min`,end+4000);
 return mod.buildHtxPrimaryTechnicalReceipt({contract,now:T,route_state:'REJECTED',
  futures:{execution_status:'FULFILLED',data:{contract,health:{info:true,depth:true},contract_info:{contract_code:contract,contract_status:1,contract_size:1},bbo:{best_bid:.3723,best_ask:.3725},liquidity:{depth_timestamp:new Date(T-1000).toISOString()}}},
  trajectory:{execution_status:'FULFILLED',available_ts:known,data:{contract,health:{info:true,price_1m:true},contract_info:{contract_code:contract},provider_source_ts:end,windows:{'15m':{synchronized_window_start_ts:window.window_start_ts,synchronized_window_end_ts:end,price:{...window,usable:true,coverage:'closed',exact_1m_bars:true,expected_1m_bars:15,received_1m_bars:15}}}}},
  reference_price:{status:'CLOSED',venue:'HTX',type:'MID_OBSERVATION',contract,value:.3724,source_ts:T-1000,received_ts:T-500}});
}
function canonical(){
 const evidence=primary(technical).evidence,ctx=context.consumeBlockResultContext({evidence,contract,now:T});
 const c={status:'CLOSED',state:'OBSERVE',direction:'LONG',run_id:'CONTROLLED:CONNECTED:CLOCK',snapshot_id:`S392:${contract}:${T}`,observed_ts:T,
  scores:{overall_0_100:80,coin_interest_0_100:80,entry_readiness_0_100:null,is_probability:false},entry:{area:'0.38 USDT',min_price:.38,max_price:.38},
  trigger:{metric:'price',operator:'>=',value:.38,unit:'USDT',timeframe:'5m',expires_ts:T+1800000,next_recheck_ts:T+300000,cancel_condition:'price<0.35'},
  invalidation:'price<0.35',targets:[],reasons:[],source_receipts:[],hard_gates:[],liquidations:{above:[],below:[],future_only:true},
  metadata:{contract,price_recheck_policy:'LIGHT_PRICE_AND_CANCELLATION_5M',internal_market_context:{evidence_v2:{evidence}},supporting_context:{facts:ctx.facts},direction_resolution:{status:'CLOSED',direction:'LONG',facts:[{direction:'LONG',evidence_id:'CONTROLLED:ASSIGNED_DIRECTION'}]}}};
 const fact=(source,venue,metric,value)=>({status:'CLOSED',fact_contract_status:'CLOSED',identity_status:'CLOSED',identity:{status:'CLOSED',contract_code:contract,venue},contract_code:contract,source,provider:source,venue,metric,decision_usable:true,source_compatible:true,quality_status:'OK',coverage_pct:100,normalized_value:value,unit:metric==='execution_gate_status'?'boolean':'pct',event_ts:T,received_ts:T,max_age_sec:60,freshness_status:'CURRENT_AT_OBSERVATION',interval:'SNAPSHOT'});
 c.metadata.source_role_view=roles.buildRoleEvidenceView([fact('HTX','HTX','execution_gate_status',1),fact('Gate Public Futures','GATE','price_change_4h',1)],{contract,observed_ts:T});
 c.analytical_fingerprint=pub.canonicalFingerprint(c);return c;
}
function args(c){return {handoff:{contract_code:contract,source_run_id:c.run_id,wave_id:wave,scan_ts:T-2000,deep_started_ts:T-1000,deep_completed_ts:T+1,state:'COMPLETED',execution_status:'COMPLETED',data_sufficiency:'PARTIAL'},
 early:{contract_code:contract,wave_id:wave,first_seen_ts:T-3000,last_seen_ts:T,lifecycle_stage:'DISCOVERY',direction_hint:'LONG',early_detection_quality_0_100:80},
 shadow:{contract_code:contract,observed_ts:T-100,created_ts:T+1,direction_hint:'LONG',stage:'SHADOW_OBSERVE_LONG_BIAS',dq_status:'PARTIAL',eq_status:'SHADOW_MEASURABLE',data_sufficiency:'PARTIAL'},
 canonical:{publication_id:'CONTROLLED:PUBLICATION',contract_code:contract,run_id:c.run_id,snapshot_id:c.snapshot_id,wave_id:wave,direction:c.direction,canonical_state:c.state,observed_ts:c.observed_ts,created_ts:T+2,analytical_fingerprint:c.analytical_fingerprint,canonical_json:JSON.stringify(c)},
 now_ts:T+10,canonical_required:true,dispatch_enabled:true};}
function database(){const db=new SQLiteDB();db.sqlite.exec(fs.readFileSync('post-v7-consolidated/liquidation/unified-delivery-base/migrations.sql','utf8'));const prepare=db.prepare.bind(db);db.prepare=sql=>{const s=prepare(sql);s.sql=sql;return s;};db.batch=async ss=>{db.sqlite.exec('BEGIN IMMEDIATE');try{const result=ss.map(s=>({success:true,meta:{changes:Number(db.sqlite.prepare(s.sql).run(...(s.args||[])).changes)}}));db.sqlite.exec('COMMIT');return result;}catch(e){db.sqlite.exec('ROLLBACK');throw e;}};return db;}
async function delivered(mod,c){
 const db=database();try{
  const saved=await pub.persistCanonicalSnapshot(db,{canonical:c,wave_id:wave,now_ts:T+2});assert.equal(saved.persisted,true,JSON.stringify(saved));
  const derived=mod.deriveLifecycleContext(args(c));assert.equal(derived.status,'CLOSED',JSON.stringify(derived));
  const transition=await runtime.prepareLifecycleTransition(db,derived.ctx,T+10);assert.equal(transition.current_status,'OBSERVE',JSON.stringify(transition));
  let relay=0;const delivery=await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,source_run_id:c.run_id,now_ts:T+11,relay_url:'https://controlled.invalid/relay',relay_key:'CONTROLLED_NOT_A_SECRET',fetch_impl:async()=>{relay++;return {ok:true,status:200,json:async()=>({ok:true,status:'SENT',message_id:9901})};}});
  assert.equal(delivery.sent,1,JSON.stringify(delivery));assert.equal(relay,1);
  const task=db.sqlite.prepare('SELECT * FROM v3_recheck_task_shadow').get();assert.equal(task.state,'PENDING');assert.equal(task.due_ts,c.trigger.next_recheck_ts);assert.equal(task.expires_ts,c.trigger.expires_ts);
  return {db,task,derived,saved,delivery};
 }catch(e){db.close();throw e;}
}
const lightArgs=c=>{const now=c.trigger.next_recheck_ts+10;return {rows:[{contract,catalog_active:true,source_status:'CLOSED',price:.38,observed_ts:now}],market_source_ts:now,bucket:Math.floor(now/300000)*300000,now};};

test('NEW assembled N10 availability, original JSON, lifecycle binding and existing LIGHT SQL form one causal chain',async()=>{
 const c=canonical(),bytes=JSON.stringify(c),old=primary(oldTechnical),row=c.metadata.internal_market_context.evidence_v2.evidence.find(e=>e.metric_family==='CLOSED_15M_PRICE_PATH_CONTEXT');
 assert.equal(row.first_known_ts,known);assert.equal(old.evidence.find(e=>e.metric_family===row.metric_family).first_known_ts,T);
 const before=await delivered(oldLifecycle,c),after=await delivered(lifecycle,c);
 try{
  assert.equal(before.derived.ctx.observation_ts,T-100);assert.equal(after.derived.ctx.observation_ts,T);
  assert.deepEqual({...after.derived.ctx,observation_ts:T-100},before.derived.ctx);
  const b=await collector.run(before.db,lightArgs(c)),a=await collector.run(after.db,lightArgs(c));
  assert.equal(b.selected,0);assert.equal(a.selected,1);assert.equal(a.results[0].status,'TRIGGER_PRICE_REACHED_FULL_ANALYSIS_REQUIRED');assert.equal(a.results[0].entry_authorized,false);assert.equal(a.results[0].settlement_confirmed,false);
  const task=after.db.sqlite.prepare('SELECT * FROM v3_recheck_task_shadow').get(),saved=JSON.parse(after.db.sqlite.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?').get(task.publication_id).canonical_json);
  assert.equal(saved.metadata.internal_market_context.evidence_v2.evidence.find(e=>e.evidence_id===row.evidence_id).first_known_ts,known);assert.equal(task.expires_ts,c.trigger.expires_ts);
  assert.equal(JSON.stringify(c),bytes);assert.equal(after.db.sqlite.prepare("SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow WHERE lifecycle_event='ENTRY'").get().n,0);
  witness.cases.push({case:'FIRST_PUBLICATION_LIGHT_JOIN_REPAIRED',old_selected:b.selected,new_selected:a.selected,light_entry_authorized:false,original_first_known_ts:known,original_deadline:task.expires_ts,relay:'CONTROLLED_NOT_NATIVE_SENT'});
 }finally{before.db.close();after.db.close();}
});

test('NEW complete SQLite roundtrip ignores stored supporting-clock tampering while preserving source clocks and user text',async()=>{
 const c=canonical(),manual=pub.renderCanonicalManual({canonical:c}),telegram=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});assert.equal(manual.ok,true,manual.status);assert.equal(telegram.ok,true,telegram.status);
 const oldC=structuredClone(c);oldC.metadata.supporting_context={facts:oldContext.consumeBlockResultContext({evidence:primary(oldTechnical).evidence,contract,now:T}).facts};oldC.metadata.internal_market_context.evidence_v2.evidence=primary(oldTechnical).evidence;oldC.analytical_fingerprint=pub.canonicalFingerprint(oldC);
 assert.equal(manual.text,pub.renderCanonicalManual({canonical:oldC}).text);assert.equal(telegram.text,pub.renderCanonicalTelegram({canonical:oldC,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}).text);
 for(const fact of c.metadata.supporting_context.facts)fact.original_clock={source_ts:0,first_known_ts:T+999999};c.analytical_fingerprint=pub.canonicalFingerprint(c);
 const db=database();try{const p=await pub.persistCanonicalSnapshot(db,{canonical:c,wave_id:wave,now_ts:T+2});assert.equal(p.persisted,true);const restored=JSON.parse(db.sqlite.prepare('SELECT canonical_json FROM canonical_publication_shadow').get().canonical_json);const m=pub.renderCanonicalManual({canonical:restored}),tg=pub.renderCanonicalTelegram({canonical:restored,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),audit=context.auditRenderedBlockResults({canonical:restored,manual:m,telegram:tg});const receipt=audit.context_receipts.find(e=>e.field==='CLOSED_15M_PRICE_PATH_CONTEXT'||e.original_clock?.source_ts===end);assert.equal(receipt.original_clock.first_known_ts,known);assert.equal(audit.telegram_delivery_proven,false);assert.equal(m.text,manual.text);assert.equal(tg.text,telegram.text);witness.cases.push({case:'FULL_SQLITE_CLOCK_PROVENANCE_TEXT_UNCHANGED',native_ACK:false});}finally{db.close();}
});

test('NEW clock anchor cannot bypass same-run, wave, direction, threshold or freshness authority',()=>{
 const c=canonical();for(const modify of [x=>x.canonical.run_id='FOREIGN',x=>x.canonical.wave_id='FOREIGN',x=>x.canonical.direction='SHORT',x=>x.now_ts=T+600001]){const x=args(c);modify(x);const b=oldLifecycle.deriveLifecycleContext(x),a=lifecycle.deriveLifecycleContext(x);assert.deepEqual(a,b);assert.notEqual(a.status,'CLOSED');}
 const low=canonical();low.scores.coin_interest_0_100=69;low.analytical_fingerprint=pub.canonicalFingerprint(low);assert.deepEqual(lifecycle.deriveLifecycleContext(args(low)),oldLifecycle.deriveLifecycleContext(args(low)));assert.notEqual(lifecycle.deriveLifecycleContext(args(low)).status,'CLOSED');witness.cases.push({case:'AUTHORITY_REFUSALS_PRESERVED'});
});

test('NEW sidecar scope leaves legacy, WAIT, ENTRY and price-removal clock paths unchanged',()=>{
 const c=canonical(),legacy=args(c);legacy.canonical_required=false;assert.deepEqual(lifecycle.deriveLifecycleContext(legacy),oldLifecycle.deriveLifecycleContext(legacy));
 for(const state of ['WAIT_FOR_TRIGGER','ENTRY_NOW_ANALYTICAL']){const x=structuredClone(c);x.state=state;x.analytical_fingerprint=pub.canonicalFingerprint(x);assert.deepEqual(lifecycle.deriveLifecycleContext(args(x)),oldLifecycle.deriveLifecycleContext(args(x)));}
 const removal=args(c);removal.previous={status:'OBSERVE',direction:'LONG',wave_id:wave};removal.final={contract_code:contract,observation_ts:T-100,persisted_ts:T+1,hard_veto:1};assert.deepEqual(lifecycle.deriveLifecycleContext(removal),oldLifecycle.deriveLifecycleContext(removal));witness.cases.push({case:'ONLY_CANONICAL_OBSERVE_CLOCK_CHANGED'});
});

test('NEW first-send repair does not silently rebind an older task to a later same-wave plan',async()=>{
 const c=canonical(),x=await delivered(lifecycle,c);try{
  const newer=structuredClone(c);newer.observed_ts=T+20;newer.snapshot_id=`S392:${contract}:${T+20}`;newer.run_id='CONTROLLED:NEW:OBSERVE';newer.trigger.value=.39;newer.analytical_fingerprint=pub.canonicalFingerprint(newer);
  const a=args(newer);a.canonical.created_ts=T+21;a.handoff.source_run_id=newer.run_id;a.handoff.deep_completed_ts=T+21;a.now_ts=T+30;
  const derived=lifecycle.deriveLifecycleContext(a);assert.equal(derived.status,'CLOSED');const transition=await runtime.prepareLifecycleTransition(x.db,derived.ctx,T+30);assert.equal(transition.dispatch,null);
  const selected=await collector.run(x.db,lightArgs(c));assert.equal(selected.selected,0);const task=x.db.sqlite.prepare('SELECT * FROM v3_recheck_task_shadow').get();assert.equal(task.publication_id,x.task.publication_id);assert.equal(task.expires_ts,c.trigger.expires_ts);assert.equal(task.state,'PENDING');witness.cases.push({case:'LATER_REFRESH_STILL_REQUIRES_EXACT_ORIGINAL_PLAN',not_solved_by_firstsend_fix:true});
 }finally{x.db.close();}
});

test('NEW assembled inputs preserve silent expiry policy, strict LIGHT selector and the corrected metadata guard bytes',()=>{
 const guard=fs.readFileSync(path.join(current,'block-result-context.mjs'),'utf8');assert.match(guard,/every\(Number\.isSafeInteger\).*row\.source_ts<=row\.first_known_ts&&row\.first_known_ts<=row\.observed_ts&&row\.observed_ts<=row\.expires_at/);
 const policy=fs.readFileSync(path.join(current,'original-idea-terminal.mjs'));assert.equal(createHash('sha256').update(policy).digest('hex'),createHash('sha256').update(fs.readFileSync('current-generation/files/src/original-idea-terminal.mjs')).digest('hex'));
 assert.match(collectorSource,/l\.observation_ts=p\.observed_ts/);assert.match(collectorSource,/ORDER BY t\.updated_ts ASC,t\.due_ts ASC LIMIT 2/);assert.equal(pub.assessActionability({canonical:{status:'CLOSED',observed_ts:T,metadata:{lifecycle_removal:{reason:'ORIGINAL_TTL_EXPIRED'}}},lifecycle_event:'IDEA_REMOVED',prior_sent:true}).reason,'OWNER_TTL_NOTICE_DISABLED');
 witness.cases.push({case:'OLD_TTL_POLICY_AND_STRICT_LIMIT_GUARDS_RETAINED',providerHTTP:0,nativeSQL:0});
});
