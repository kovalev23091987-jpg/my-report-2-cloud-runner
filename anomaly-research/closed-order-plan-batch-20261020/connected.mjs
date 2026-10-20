// Prepared for ONE coordinator qualification. No invocation/test registration.
// Retained input is real; identity/known-time price/watch paths/ACK are CONTROLLED.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runClosedOrderPlanConnected({baseline_root,candidate_root,repo_root,budget_receipt_path}={}){
 const sha=x=>createHash('sha256').update(x).digest('hex');
 const load=(root,path)=>import(pathToFileURL(resolve(root,path)).href);
 const prefix='anomaly-research/closed-order-plan-batch-20261020';
 const manifest=JSON.parse(await readFile(resolve(repo_root,prefix,'manifest.json'),'utf8'));
 for(const pin of manifest.module_pins){
  assert.equal(sha(await readFile(resolve(baseline_root,pin.path))),pin.before_sha256);
  assert.equal(sha(await readFile(resolve(candidate_root,pin.path))),pin.after_sha256);
 }
 const B={o:await load(baseline_root,'anomaly-research/observer/observer.mjs'),s:await load(baseline_root,'anomaly-research/statistics/outcomes.mjs'),p:await load(baseline_root,'anomaly-research/outbox/protocol.mjs')};
 const C={o:await load(candidate_root,'anomaly-research/observer/observer.mjs'),s:await load(candidate_root,'anomaly-research/statistics/outcomes.mjs'),p:await load(candidate_root,'anomaly-research/outbox/protocol.mjs')};
 const grid=await load(candidate_root,'anomaly-research/durability/identity-retention-grid.mjs');
 const capacity=await load(candidate_root,'anomaly-research/statistics/capacity.mjs');
 const originals={};
 for(const item of manifest.retained_inputs){
  const b=await readFile(resolve(repo_root,item.path));assert.equal(sha(b),item.sha256);originals[item.id]=JSON.parse(b);
 }
 const sample=originals.samples.inputs.find(x=>x.id==='BTC_usd_m_futures');
 const frozen=originals.witness.results.find(x=>x.sample_id===sample.id);
 assert.equal(frozen.typed_view.admission.observer_detectClosed,false);
 assert.equal(frozen.typed_view.admission.native_ingress,false);
 assert.equal(frozen.typed_view.identity.native_instrument_epoch_verified,false);
 assert.equal(frozen.typed_view.quantity.concrete_unit,null);
 assert.equal(frozen.typed_view.clocks.original_provider_body_completion_ts,null);
 const actualClosed=[...sample.current.background,sample.current.candle].map(b=>({start_ts:b.start_ts,end_ts:b.end_ts,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.raw_column7_sum)}));
 assert.equal(actualClosed.length,21);
 // This is a new CONTROLLED model card using retained numeric geometry. It is
 // not a promotion of the unqualified typed input or an original first-known ACK.
 const T=1792497600000,M=60000,D=86400000,W=7*D;
 const instrument={asset_id:'CONTROLLED:BTC',venue:'CONTROLLED:BINANCE',upstream:'CONTROLLED:RETAINED_NUMERIC_MODEL',contract:'BTCUSDT',quote:'CONTROLLED_UNKNOWN',price_unit:'CONTROLLED_NUMERIC_QUOTE',volume_unit:'CONTROLLED_SAME_SERIES_QUANTITY',binding_ref:'CONTROLLED:NOT_NATIVE_INGEST_ACK',market:'FUTURES',identity_verified:true,multiplier:1,binding_kind:'VERIFIED_NATIVE'};
 const input={instrument,timeframe:'15m',alignment_offset_ms:0,bars:actualClosed,provenance:{raw_ref:'CONTROLLED_DERIVATION_OF_RETAINED:'+sha(JSON.stringify(sample.current)),raw_sha256:sha(JSON.stringify(sample.current)),received_ts:T,source_as_of_ts:sample.current.candle.end_ts,evidence_class:'CONTROLLED'},known_ts:T,mode:'REPLAY',rules:{confirmation_timeframe:'1m'}};
 const beforeCard=B.o.detectClosed(input).events[0],card=C.o.detectClosed(input).events[0];
 assert.ok(card);assert.equal(card.card_hash,beforeCard.card_hash);
 assert.equal(card.discovery,'BACKFILLED');assert.equal(card.evidence_class,'CONTROLLED');assert.equal(card.main_score_effect,0);
 // Fixed model plans precede generation/observation of the controlled future.
 // T is a controlled chronology, not a claimed wall-clock/native commit ACK.
 const anchor={instrument,price:card.anchor.price,source_ts:T,received_ts:T,raw_ref:'CONTROLLED:CONTEMPORANEOUS_ANCHOR_NOT_THE_OLD_MARKET_RECEIPT',raw_sha256:C.o.hash('CONTROLLED:KNOWN_TIME_PRICE')};
 const plan=C.s.commitOutcomePlan(card,{anchor,committed_ts:T,horizons:['1h']});
 const changedPlan=C.s.commitOutcomePlan(card,{anchor,committed_ts:T,horizons:['1h'],success_pct:10});
 assert.notEqual(plan.plan_hash,changedPlan.plan_hash);
 const controls=[],record=(label,details={})=>controls.push({label,classification:'CONTROLLED_LOGIC_NOT_NATIVE_QUALIFICATION',...details});
 const memory=(lib,c=card)=>lib.capture(lib.newMemory(),c,{watch_mode:'HISTORICAL_REVIEW'}).state;
 const bar=(start,end,close,timeframe='1m')=>({timeframe,start_ts:start,end_ts:end,open:card.anchor.price,high:Math.max(card.anchor.price,close)*1.01,low:Math.min(card.anchor.price,close)*.99,close,volume:1});
 const snap=(id,start,end,close,source_ts,timeframe='1m')=>{const raw_sha256=C.o.hash({controlled:id});return{instrument,snapshot_id:'CONTROLLED:'+id,raw_sha256,source_ts,received_ts:source_ts+1000,price:close,closed_candle:{...bar(start,end,close,timeframe),raw_sha256}};};
 const A=snap('LATER_CLOSED_ABOVE',T+M,T+2*M,card.candle.high*1.1,T+2*M+1000);
 const older=snap('OLDER_CLOSED_BELOW_LATE_RECEIPT',T,T+M,card.candle.low*.9,T+3*M+1000);
 const observe=(lib,state,snapshot,extra={})=>lib.observe(state,{event_id:card.event_id,snapshot,now_ts:snapshot.received_ts,...extra});
 const bFirst=observe(B.o,memory(B.o),A),bOlder=observe(B.o,bFirst.state,older);
 assert.equal(bOlder.state.watch[card.event_id].hypotheses.LONG,'REFUTED');
 const first=observe(C.o,memory(C.o),A),restored=C.o.restore(C.o.serialize(first.state));
 assert.equal(first.confirmation_status,'NEW_CLOSED_WINDOW');
 assert.equal(restored.watch[card.event_id].last_confirmation.end_ts,T+2*M);
 const afterOlder=observe(C.o,restored,older);
 assert.equal(afterOlder.confirmation_status,'STALE_CLOSED_WINDOW');
 assert.equal(afterOlder.new_transitions,0);assert.equal(afterOlder.state.watch[card.event_id].hypotheses.LONG,'CONFIRMED');
 assert.equal(afterOlder.state.watch[card.event_id].last_source_ts,older.source_ts);
 record('baseline late older close refutes; candidate advances current price without retroactive transition',{baseline:'REFUTED',candidate:'CONFIRMED'});
 const repeated={...structuredClone(A),snapshot_id:'CONTROLLED:REPEATED_WINDOW',source_ts:A.source_ts+10000,received_ts:A.received_ts+10000,raw_sha256:C.o.hash('CONTROLLED:OTHER_RECEIPT')};repeated.closed_candle.raw_sha256=repeated.raw_sha256;
 const repeat=observe(C.o,restored,repeated);assert.equal(repeat.confirmation_status,'DUPLICATE_CLOSED_WINDOW');assert.equal(repeat.new_transitions,0);
 const conflicting=snap('SAME_WINDOW_DIFFERENT_PRICE',T+M,T+2*M,card.candle.low*.9,A.source_ts+20000);
 const conflict=observe(C.o,restored,conflicting);assert.equal(conflict.status,'CONFLICTING_CLOSED_WINDOW');assert.deepEqual(conflict.state,restored);
 record('same closed window receipt replay is not a price conflict; changed economic candle rejects without mutation');
 const genuine=snap('GENUINELY_NEW_CLOSED_BELOW',T+2*M,T+3*M,card.candle.low*.9,T+4*M+1000);
 const genuineResult=observe(C.o,afterOlder.state,genuine);assert.equal(genuineResult.new_transitions,1);assert.equal(genuineResult.state.watch[card.event_id].status,'REFUTED');
 assert.equal(C.o.admitWatch(genuineResult.state,card.event_id,{mode:'HISTORICAL_REVIEW'}).watch_admitted,false);
 const legacy=structuredClone(first.state);delete legacy.watch[card.event_id].last_confirmation;
 const legacyResult=observe(C.o,C.o.restore(C.o.serialize(legacy)),older);
 assert.equal(legacyResult.confirmation_status,'LEGACY_CONFIRMATION_ORDER_UNRESOLVED');assert.equal(legacyResult.new_transitions,0);
 record('genuine later close refutes once; legacy cursor absence is not reconstructed across restart');
 // A larger confirmation scale cannot derive Monday's weekly phase from a15m
 // zero offset. The existing native-grid helper supplies an explicitly modeled
 // offset; its qualified flags remain CONTROLLED assumptions, never live proof.
 const weeklyInput={...input,rules:{confirmation_timeframe:'1w'}},weeklyCard=C.o.detectClosed(weeklyInput).events[0];
 const weekStart=T+W-((T-4*D)%W),weekly=snap('MODELED_NATIVE_MONDAY_WEEK',weekStart,weekStart+W,card.candle.high*1.1,weekStart+W+1000,'1w');
 assert.throws(()=>C.o.observe(memory(C.o,weeklyCard),{event_id:weeklyCard.event_id,snapshot:weekly,now_ts:weekly.received_ts}),/EXPLICIT_CONFIRMATION_ALIGNMENT_REQUIRED/);
 assert.throws(()=>B.o.observe(memory(B.o,weeklyCard),{event_id:weeklyCard.event_id,snapshot:weekly,now_ts:weekly.received_ts,confirmation_alignment_offset_ms:4*D}),/CANDLE_GRID_INVALID/);
 const native={venue:instrument.venue,market:instrument.market,native_instrument_id:'CONTROLLED:BTCUSDT',instrument_epoch:'CONTROLLED:EXPLICIT_EPOCH',contract_code:instrument.contract,qualification_ref:'CONTROLLED:GRID_REF_ONLY',qualified:true};
 const verdict=grid.confirmationVerdict({event:weeklyCard,native,snapshot:weekly,snapshot_native:native,grid:{qualified:true,native_grid_ref:'CONTROLLED:MONDAY',timeframe:'1w',market_key:grid.nativeMarketKey(instrument,native),alignment_offset_ms:4*D},now_ts:weekly.received_ts});
 const weeklyResult=C.o.observe(memory(C.o,weeklyCard),{event_id:weeklyCard.event_id,snapshot:weekly,now_ts:weekly.received_ts,confirmation_alignment_offset_ms:verdict.native_alignment_offset_ms});assert.equal(weeklyResult.new_transitions,2);
 record('cross-timeframe weekly alignment uses explicit existing grid result; no inferred native epoch');
 const end=T-((T-4*D)%W),weeklyBars=Array.from({length:21},(_,n)=>({start_ts:end-(21-n)*W,end_ts:end-(20-n)*W,open:100,high:101,low:99,close:100,volume:n===20?100:10}));
 const secondCard=C.o.detectClosed({...input,timeframe:'1w',alignment_offset_ms:4*D,bars:weeklyBars,provenance:{...input.provenance,source_as_of_ts:end,raw_ref:'CONTROLLED:SECOND_WEEKLY_EVENT',raw_sha256:C.o.hash(weeklyBars)},rules:{confirmation_timeframe:'1w'}}).events[0];
 const two=C.o.capture(memory(C.o),secondCard,{watch_mode:'HISTORICAL_REVIEW'}).state,untouched=C.o.hash(two.watch[secondCard.event_id]);
 const twoObserved=observe(C.o,C.o.restore(C.o.serialize(two)),A).state;
 assert.equal(C.o.hash(twoObserved.watch[secondCard.event_id]),untouched);assert.equal(Object.keys(twoObserved.cards).length,2);
 assert.equal(C.o.protectedReferences(twoObserved).length,2);assert.equal(C.o.dueEvents(twoObserved,T+10*M).main_selection_used,false);
 record('two events of one controlled futures instrument survive restart and isolated confirmation without MAIN selection');
 const points=Array.from({length:12},(_,n)=>({instrument,source_ts:T+(n+1)*5*M,received_ts:T+(n+1)*5*M+1000,price:anchor.price*(n?1.06:1),raw_sha256:C.o.hash({controlled_path:n}),raw_ref:'CONTROLLED:PATH:'+n}));
 const receiptVariant={...points[0],received_ts:points[0].received_ts+1000,raw_ref:'CONTROLLED:ANOTHER_RETAINED_LOCATOR'};
 const argumentsFor={direction:'LONG',horizon:'1h',points:[...points,receiptVariant],as_of_ts:T+60*M+2000};
 const oldOutcome=B.s.evaluateOutcome(plan,argumentsFor),outcome=C.s.evaluateOutcome(plan,argumentsFor);
 assert.equal(oldOutcome.reason,'CONFLICTING_DUPLICATE_POINT');assert.equal(outcome.status,'SUCCESSFUL');assert.equal(outcome.samples,12);assert.equal(outcome.duplicate_fact_receipts_excluded,1);assert.equal(outcome.duplicate_fact_provenance_variants,1);
 assert.equal(C.s.evaluateOutcome(plan,{...argumentsFor,points:[receiptVariant,...points]}).outcome_hash,outcome.outcome_hash);
 const anotherReceipt={...receiptVariant,received_ts:receiptVariant.received_ts+1000};
 const repeatedArguments={...argumentsFor,points:[...points,receiptVariant,anotherReceipt]};
 const twice=C.s.evaluateOutcome(plan,repeatedArguments);
 assert.equal(twice.duplicate_fact_receipts_excluded,2);assert.equal(twice.duplicate_fact_provenance_variants,1);
 assert.equal(C.s.evaluateOutcome(plan,{...repeatedArguments,points:[anotherReceipt,receiptVariant,...points]}).outcome_hash,twice.outcome_hash);
 record('bound economic point replay with another receipt no longer censors the complete sampled path',{baseline:oldOutcome.status,candidate:outcome.status});
 const priceConflict=C.s.evaluateOutcome(plan,{...argumentsFor,points:[...points,{...receiptVariant,price:anchor.price*1.01}]});assert.equal(priceConflict.status,'INCOMPLETELY_OBSERVED');assert.equal(priceConflict.reason,'CONFLICTING_DUPLICATE_POINT');
 const censored=C.s.evaluateOutcome(plan,{...argumentsFor,points:points.filter((_,n)=>n!==5)});assert.equal(censored.status,'INCOMPLETELY_OBSERVED');assert.equal(censored.reason,'PATH_GAP');
 const short=C.s.evaluateOutcome(plan,{...argumentsFor,direction:'SHORT'});assert.equal(short.status,'OPPOSITE');
 const summary=C.s.summarizeOutcomes([outcome,short,censored]);assert.equal(summary.invalid_rows,0);assert.equal(summary.censored_conflicting_cells,1);assert.equal(summary.empirical_predictive_accuracy,null);
 record('true price conflict and observation gap stay censored; directions and frozen-cell conflict remain explicit');
 const logical=grid.logicalEventIdentity(card,native).logical_event_id;
 const keys=plan.horizons.flatMap(h=>plan.directions.map(d=>grid.logicalCohortKey(logical,h,d)));
 const changedKeys=changedPlan.horizons.flatMap(h=>changedPlan.directions.map(d=>grid.logicalCohortKey(logical,h,d)));assert.deepEqual(keys,changedKeys);
 const transitions=first.state.transitions.map(t=>({direction:t.direction,to:t.to,closed_window:t.closed_window}));
 const notice=C.o.draftNotice(first.state,first.state.transitions[0].transition_id);assert.equal(notice.send_enabled,false);
 const event={kind:'EVENT_TRANSITION',now_ts:A.received_ts,card,logical_event_id:logical,snapshot_id:A.snapshot_id,snapshot_raw_sha256:A.raw_sha256,source_ts:A.source_ts,planned_outcome_keys:keys,outcome_plan:plan,transition_group:transitions,notification:{chat_binding:'CONTROLLED:SAME_TELEGRAM_ONLY',text:notice.text}};
 const commit=(lib,state,mutation,id)=>lib.simulateAtomicCommit(state,{expected_revision:state.revision,operation_id:id,mutation});
 const stage=(lib,mutation=event)=>commit(lib,lib.newProtocolStore(),mutation,'CONTROLLED:STAGE').durable_state;
 const staged=stage(C.p),outboxKey=Object.keys(staged.outbox)[0];assert.equal(staged.events[logical].outcome_plan_hash,plan.plan_hash);assert.equal(staged.outbox[outboxKey].outcome_plan_hash,plan.plan_hash);
 const change={...event,snapshot_id:genuine.snapshot_id,snapshot_raw_sha256:genuine.raw_sha256,source_ts:genuine.source_ts,now_ts:genuine.received_ts,outcome_plan:changedPlan,transition_group:[{direction:'LONG',to:'REFUTED'}]};
 const beforeSwap=commit(B.p,stage(B.p),change,'CONTROLLED:SWAP'),swap=commit(C.p,staged,change,'CONTROLLED:SWAP');
 assert.equal(beforeSwap.reply,'EVENT_AND_OUTBOX_ATOMICALLY_STAGED');assert.equal(swap.reply,'REJECTED');assert.equal(swap.reason,'IMMUTABLE_OUTCOME_PLAN_CONFLICT');assert.deepEqual(swap.durable_state,staged);
 assert.equal(commit(C.p,staged,{...change,outcome_plan:undefined},'CONTROLLED:DOWNGRADE').reply,'REJECTED');
 const legacyEvent={...event};delete legacyEvent.outcome_plan;const legacyStore=stage(C.p,legacyEvent);
 assert.equal(commit(C.p,legacyStore,event,'CONTROLLED:UNPROVEN_UPGRADE').reason,'LEGACY_EVENT_PLAN_BINDING_UNRESOLVED');
 assert.equal(commit(C.p,C.p.newProtocolStore(),{...event,planned_outcome_keys:['UNRELATED']},'CONTROLLED:WRONG_CELLS').reason,'EXACT_PLANNED_OUTCOME_CELLS_REQUIRED');
 record('same outcome keys cannot hide a changed threshold plan; bound downgrade and legacy promotion reject');
 const sending=lib=>{
  let state=stage(lib),key=Object.keys(state.outbox)[0];
  state=commit(lib,state,{kind:'READY',now_ts:T+123000,outbox_key:key,reviewed_form_hash:state.outbox[key].form_hash},'CONTROLLED:READY').durable_state;
  state=commit(lib,state,{kind:'CLAIM',now_ts:T+124000,outbox_key:key,owner:'CONTROLLED:WORKER',nonce:'CONTROLLED:PLAN_BOUND_ATTEMPT',lease_until:T+240000},'CONTROLLED:CLAIM').durable_state;
  state=commit(lib,state,{kind:'START_SEND',now_ts:T+125000,outbox_key:key,owner:'CONTROLLED:WORKER',nonce:'CONTROLLED:PLAN_BOUND_ATTEMPT'},'CONTROLLED:INTENT').durable_state;
  return{state,key};
 };
 const ack=(state,key,plan_hash)=>({evidence_class:'CONTROLLED_SIMULATED_ACK',logical_event_id:logical,outbox_key:key,attempt_nonce:state.outbox[key].attempt_nonce,chat_binding:state.outbox[key].chat_binding,message_id:'12345',reply_sha256:C.o.hash('CONTROLLED:NOT_A_TELEGRAM_REPLY'),outcome_plan_hash:plan_hash});
 const oldSending=sending(B.p),currentSending=sending(C.p);
 const result=(state,key,proof)=>({kind:'TRANSPORT_RESULT',now_ts:T+126000,outbox_key:key,owner:'CONTROLLED:WORKER',nonce:'CONTROLLED:PLAN_BOUND_ATTEMPT',result:'SIMULATED_ACK',ack:proof});
 assert.equal(commit(B.p,oldSending.state,result(oldSending.state,oldSending.key,ack(oldSending.state,oldSending.key,changedPlan.plan_hash)),'CONTROLLED:WRONG_ACK').reply,'SENT');
 const wrongAck=commit(C.p,currentSending.state,result(currentSending.state,currentSending.key,ack(currentSending.state,currentSending.key,changedPlan.plan_hash)),'CONTROLLED:WRONG_ACK');assert.equal(wrongAck.reason,'EXACT_BOUND_OUTCOME_PLAN_ACK_REQUIRED');assert.deepEqual(wrongAck.durable_state,currentSending.state);
 const timed=commit(C.p,currentSending.state,{kind:'TRANSPORT_RESULT',now_ts:T+127000,outbox_key:currentSending.key,owner:'CONTROLLED:WORKER',nonce:'CONTROLLED:PLAN_BOUND_ATTEMPT',result:'TIMEOUT'},'CONTROLLED:TIMEOUT').durable_state;
 const restarted=C.p.restoreProtocol(C.p.serializeProtocol(timed));assert.equal(restarted.outbox[currentSending.key].status,'UNKNOWN_SEND');
 const reconcile=(proof,id)=>commit(C.p,restarted,{kind:'RECONCILE_UNKNOWN',now_ts:T+128000,outbox_key:currentSending.key,ack:proof},id);
 assert.equal(reconcile(ack(restarted,currentSending.key,changedPlan.plan_hash),'CONTROLLED:WRONG_RECONCILE').reply,'REJECTED');
 const reconciled=reconcile(ack(restarted,currentSending.key,plan.plan_hash),'CONTROLLED:RIGHT_RECONCILE').durable_state;
 assert.equal(reconciled.outbox[currentSending.key].status,'SENT');assert.equal(reconciled.outbox[currentSending.key].actual_send,false);assert.equal(reconciled.native_persistence_qualified,false);
 record('wrong-plan ACK cannot close delivery; restart reconciliation needs the exact frozen plan and remains simulated');
 // Reuse the coordinator's already-retained historical failure bytes. No GET,
 // database lookup, root-error investigation or native-cost reconstruction.
 const budgetBytes=await readFile(budget_receipt_path);assert.equal(sha(budgetBytes),'af537fd73ad9c63897b79e397bb5b9f97e75b3d03e730c989a73a921ef7db7b0');
 const budget=JSON.parse(budgetBytes);assert.equal(budget.receipt.source_run_id,'39423678954');assert.equal(budget.usage_after.unknown_ops,1);
 const admission=capacity.arithmeticHeadroom({usage:{rows_read:budget.usage_after.rows_read,rows_written:budget.usage_after.rows_written},other_committed:{rows_read:0,rows_written:0},observer:{rows_read:0,rows_written:0,source_HTTP:0},unknown_ops:budget.usage_after.unknown_ops,source_residual_HTTP:0,manual_reserve_HTTP:0});
 assert.equal(admission.status,'UNKNOWN_NOT_CLEARED');assert.equal(admission.activation_allowed,false);
 assert.equal(sha(budgetBytes),'af537fd73ad9c63897b79e397bb5b9f97e75b3d03e730c989a73a921ef7db7b0');
 record('actual preserved historical unknown stays closed after controlled model ACK; other budget inputs are placeholders, not native headroom');
 return{schema:'CLOSED_ORDER_PLAN_CONNECTED_CONTROLLED_V1',actual_input:{sample:sample.id,closed_bars:actualClosed.length,saved_sample_sha256:manifest.retained_inputs.find(x=>x.id==='samples').sha256,original_provider_body_completion_ts:null,native_identity_qualified:false,actual_card_memory_watch_admitted:false,actual_future_path_available:false},controlled_model_card:{event_id:card.event_id,discovery:card.discovery,evidence_class:card.evidence_class,first_known_ts:card.first_known_ts,native_ingress_ACK:false},controls,simulated_outbox_status:reconciled.outbox[currentSending.key].status,actual_send:false,admission:{status:admission.status,activation_allowed:false,unknown_ops_preserved:budget.usage_after.unknown_ops,other_cost_inputs:'CONTROLLED_PLACEHOLDERS_NOT_BUDGET_FACTS'},provider_HTTP:0,native_SQL:0,local_SQL:0,Telegram:0,main_score_effect:0,native_delivery_or_statistical_accuracy:null};
}
