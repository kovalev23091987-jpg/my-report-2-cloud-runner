import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {analyzePump} from '../../analytics/index.mjs';
import {evaluateOutcome} from '../../analytics/outcome.mjs';
import {FEATURE_CAPSULE_VERSION,prepareFeatureCapsule,readFeatureCapsule,prepareOutcomeCapsule,projectProtectedReferences,capsuleDigest,CAPSULE_BOUNDS} from '../../analytics/feature-capsule.mjs';
import {TRADE_BASE_QUANTITY_UNIT,TRADE_QUOTE_NOTIONAL_UNIT} from '../../contracts/index.mjs';
import {input,fact,T,MINUTE} from './fixtures.mjs';

const output=new URL('../../handoffs/analytics/package-v/',import.meta.url),implementation_sha256='a'.repeat(64);
const save=async(name,value)=>writeFile(new URL(name,output),JSON.stringify(value,null,2)+'\n');
function fixture(unit=TRADE_QUOTE_NOTIONAL_UNIT){
  const x=input();x.run_id='ARTIFICIAL_V_CAPSULE';x.run_purpose='ACCEPTANCE_TEST';
  for(const row of x.facts.candles.value.slice(-5))row.volume_base=3000;
  x.facts.trades=fact('trades',[{trade_id:'V-B',event_ts:T-1000,price:112,notional_quote:50,quantity_base:2,aggressor_side:'BUY'},
    {trade_id:'V-S',event_ts:T,price:113,notional_quote:70,quantity_base:1,aggressor_side:'SELL'}],unit);
  x.facts.trades.coverage={scope:'RETURNED_RECENT_SAMPLE_ONLY',base_quantity_qualified:unit===TRADE_BASE_QUANTITY_UNIT,quote_notional_qualified:unit===TRADE_QUOTE_NOTIONAL_UNIT,notional_quote_unit:'USDT',raw_private_body:'DO_NOT_PROJECT_THIS_MARKER'};
  return x;
}
async function prepared(x=fixture()){
  const analysis=analyzePump(x);assert.equal(analysis.ready,true,JSON.stringify(analysis.reasons));
  const analysis_key='pump:analysis:'+await capsuleDigest(analysis);
  const p=await prepareFeatureCapsule({analysis,input:x,analysis_key,implementation_sha256,recorded_ts:T+5000,evidence_class:'ARTIFICIAL'});
  return {x,analysis,analysis_key,p};
}
const byName=c=>Object.fromEntries(c.features.map(f=>[f.name,f]));

test('V01 actual ready analysis produces immutable versioned scalar snapshot with original clocks and exact hash reader',async()=>{
  const {x,analysis,analysis_key,p}=await prepared(),before=structuredClone({x,analysis});
  assert.equal(p.key,'pump:feature-capsule:v2:'+await capsuleDigest(analysis));
  assert.equal(p.capsule.schema,FEATURE_CAPSULE_VERSION);assert.equal(p.capsule.analysis_key,analysis_key);
  assert.equal(p.capsule.input_sha256,await capsuleDigest(x));assert.equal(p.capsule.original_plan_sha256,await capsuleDigest(analysis.plan));
  const r=await readFeatureCapsule(p),f=byName(r);
  assert.equal(f.wave_state.value,analysis.wave_state);assert.equal(f.plan_minimum_potential_pct.value,analysis.plan.potential_pct.minimum);
  assert.equal(f.current_volume_counter.value,analysis.activity.current_volume);assert.equal(f.current_to_impulse_volume_ratio.value,analysis.activity.current_to_impulse_volume_ratio);
  assert.equal(f.trade_first_price.value,analysis.trade_context.price_response.first_price);
  assert.equal(f.trade_first_price.known_ts,T);assert.equal(f.trade_first_price.source_event_ts,T);assert.equal(f.trade_first_price.received_ts,T);
  assert.equal(p.capsule.recorded_ts,T+5000);assert.equal(p.capsule.origin.t0,T);assert.equal(p.capsule.origin.evidence_class,'ARTIFICIAL');
  assert.equal(r.probability.value_pct,null);assert.equal(r.external_provenance_authenticated,false);
  assert.equal(p.capsule.retention.approved_delete_ttl_ms,null);assert.equal(p.capsule.retention.originals_required,true);
  assert.deepEqual({x,analysis},before);r.plan.entry_zones[0].lower=0;assert.equal(p.capsule.plan.entry_zones[0].lower,analysis.plan.entry_zones[0].lower);
  await save('artificial-feature-capsule.json',p);
});

test('V02 unavailable and future sources remain explicit null with reason, never zero or retrospective knowledge',async()=>{
  const a=await prepared(),f=byName(a.p.capsule);
  assert.equal(f.open_interest.value,null);assert.ok(f.open_interest.absence_reason);assert.equal(f.funding_rate.value,null);
  assert.equal(f.growth_24h_pct.value,null);assert.equal(f.growth_24h_pct.absence_reason,'EXACT_WINDOW_UNAVAILABLE');
  assert.equal(f.map_nearest_up_distance_pct.value,null);assert.equal(f.map_nearest_up_distance_pct.absence_reason,'NO_QUALIFIED_UPPER_MAP_ZONE');
  const x=fixture();x.facts.trades.received_ts=T+1;const b=await prepared(x),future=byName(b.p.capsule);
  assert.equal(future.trade_buy_usdt.value,null);assert.equal(future.trade_buy_usdt.absence_reason,'ORIGINAL_SOURCE_CLOCK_OR_EVIDENCE_UNBOUND');assert.equal(future.trade_buy_usdt.known_ts,null);
  await readFeatureCapsule(b.p);await save('artificial-null-provenance.json',{absent:f.open_interest,window:f.growth_24h_pct,no_map:f.map_nearest_up_distance_pct,future:future.trade_buy_usdt});
});

test('V03 capsule preserves T selected-unit semantics and Q price-response provenance without raw executions or BASE invention',async()=>{
  const q=await prepared(),b=await prepared(fixture(TRADE_BASE_QUANTITY_UNIT)),qs=q.p.capsule,bs=b.p.capsule;
  assert.equal(qs.trade_sample.unit,TRADE_QUOTE_NOTIONAL_UNIT);assert.equal(qs.trade_sample.amount_basis,'OBSERVED_USDT_QUOTE_NOTIONAL');assert.equal(qs.trade_sample.base_quantity_qualified,false);assert.equal(qs.trade_sample.quote_divided_by_price,false);
  assert.equal(bs.trade_sample.amount_basis,'OBSERVED_PRICE_TIMES_BASE_QUANTITY');assert.equal(bs.trade_sample.base_quantity_qualified,true);
  for(const [p,a]of [[q.p,q.analysis],[b.p,b.analysis]]){
    const f=byName((await readFeatureCapsule(p)));
    assert.equal(f.trade_buy_usdt.value,a.trade_context.buy_usdt);assert.equal(f.trade_netflow_usdt.value,a.trade_context.netflow_usdt);
    assert.equal(f.trade_first_to_last_return_pct.value,a.trade_context.price_response.first_to_last_return_pct);
    assert.equal(p.capsule.trade_sample.full_market_coverage,false);assert.equal(p.capsule.trade_sample.absorption_proven,false);assert.equal(p.capsule.trade_sample.causation_proven,false);
  }
  assert.equal(qs.source_facts.find(f=>f.kind==='trades').coverage.quote_notional_qualified,true);
  assert.doesNotMatch(JSON.stringify(qs),/DO_NOT_PROJECT_THIS_MARKER|V-B|V-S|quantity_base|relative_return|market_context|benchmark/);
  assert.ok(qs.features.length<=CAPSULE_BOUNDS.features);assert.ok(Buffer.byteLength(JSON.stringify(qs))<=CAPSULE_BOUNDS.bytes);
});

test('V04 digest/schema/feature whitelist/clock validation prevents altered or future feature snapshots from entering the v2 reader',async()=>{
  const {p,analysis,x}=await prepared();
  const altered=structuredClone(p.capsule);altered.features[0].value='CHANGED';await assert.rejects(readFeatureCapsule({capsule:altered,sha256:p.sha256}),/DIGEST_MISMATCH/);
  for(const mutate of [c=>c.schema='pump-initial-features-v1',c=>c.features[0].known_ts=T+1,c=>c.features[0].name='relative_return_btc_pct',c=>c.features.push({...c.features[0]})]){
    const c=structuredClone(p.capsule);mutate(c);await assert.rejects(readFeatureCapsule({capsule:c,sha256:await capsuleDigest(c)}));
  }
  await assert.rejects(prepareFeatureCapsule({analysis,input:x,analysis_key:'pump:analysis:'+'0'.repeat(64),implementation_sha256,recorded_ts:T}),/CONTENT_HASH_REQUIRED/);
  const changed=structuredClone(x);changed.instrument.asset_id='OTHER';await assert.rejects(prepareFeatureCapsule({analysis,input:changed,analysis_key:p.capsule.analysis_key,implementation_sha256,recorded_ts:T}),/BINDING_MISMATCH/);
  const reordered=structuredClone(x);reordered.instrument=Object.fromEntries(Object.entries(x.instrument).reverse());const r=await prepareFeatureCapsule({analysis,input:reordered,analysis_key:p.capsule.analysis_key,implementation_sha256,recorded_ts:T});assert.equal(r.capsule.origin.t0,T);
});

async function labelled(){
  const a=await prepared(),o=a.p.capsule.origin,signal={signal_id:o.signal_id,wave_id:o.wave_id,t0:o.t0,reference_price:o.reference_price,rules_version:o.rules_version,mode:o.mode,map_mode:'WITHOUT_MAP',plan:a.analysis.plan,analysis_key:a.analysis_key};
  const candles=Array.from({length:240},(_,i)=>({open_ts:T+i*MINUTE,close_ts:T+(i+1)*MINUTE,closed:true,open:i?112:102,high:i?119:112,low:i?99:101.6,close:i?112:102.2,volume_base:1,turnover_quote:null}));
  const outcome=evaluateOutcome({signal,candles,price_points:[{event_ts:T+2*MINUTE,price:124}],as_of_ts:T+240*MINUTE});
  return {...a,signal,outcome};
}

test('V05 per-wave numeric drawdown and entry-area lower bound survive compact outcome revisions while UNKNOWN stays unknown',async()=>{
  const {p,signal,outcome}=await labelled(),before=structuredClone({p,signal,outcome});assert.equal(outcome.status,'HIT');assert.equal(typeof outcome.drawdown_total_pct,'number');
  assert.equal(typeof outcome.scenario_outcome.entry_area_excursion.below_area_pct_lower_bound,'number');
  const pub={state:'UNKNOWN',possible_send:true,card_id:'ARTIFICIAL_V_CARD',event_ts:T+1000,recorded_ts:T+2000};
  const r=await prepareOutcomeCapsule({feature_capsule:p.capsule,feature_sha256:p.sha256,outcome,publication:pub,recorded_ts:T+240*MINUTE,summary_record_id:'pump:summary-record:ARTIFICIAL_V'});
  assert.equal(r.sha256,await capsuleDigest(r.capsule));assert.equal(r.capsule.label.status,'HIT');
  assert.equal(r.capsule.label.drawdown_total_pct,outcome.drawdown_total_pct);assert.equal(r.capsule.label.drawdown_before_hit_pct,outcome.drawdown_before_hit_pct);
  assert.deepEqual(r.capsule.scenario.entry_area_excursion,outcome.scenario_outcome.entry_area_excursion);
  assert.equal(r.capsule.scenario.execution_proven,false);assert.equal(r.capsule.scenario.user_profit,null);assert.equal(r.capsule.publication.state,'UNKNOWN');
  const pending=await prepareOutcomeCapsule({feature_capsule:p.capsule,feature_sha256:p.sha256,recorded_ts:T});assert.equal(pending.capsule.label.status,'UNKNOWN');assert.equal(pending.capsule.label.drawdown_total_pct,null);assert.notEqual(pending.key,r.key);
  const sent=await prepareOutcomeCapsule({feature_capsule:p.capsule,feature_sha256:p.sha256,recorded_ts:T,publication:{state:'SENT',message_id:'0'}});assert.equal(sent.capsule.publication.state,'UNKNOWN');
  assert.deepEqual({p,signal,outcome},before);await save('artificial-outcome-capsules.json',{pending,hit:r});
});

test('V06 changed original origin or unsupported HIT/MISS cannot be silently copied into a label capsule',async()=>{
  const {p,outcome}=await labelled(),args={feature_capsule:p.capsule,feature_sha256:p.sha256,recorded_ts:T+240*MINUTE};
  const variants=[];
  for(const [key,value]of [['t0',T+1],['reference_price',1],['wave_id','OTHER'],['rules_version','OTHER'],['deadline_ts',T+1],['target_price',1]]){
    await assert.rejects(prepareOutcomeCapsule({...args,outcome:{...outcome,[key]:value}}),/ORIGIN_MISMATCH/);variants.push(key);
  }
  await assert.rejects(prepareOutcomeCapsule({...args,outcome:{...outcome,hit_ts:null,hit_interval:null}}),/HIT_PROOF_UNBOUND/);
  await assert.rejects(prepareOutcomeCapsule({...args,outcome:{...outcome,status:'MISS',coverage:{complete:false}}}),/MISS_COVERAGE_UNBOUND/);
  await save('origin-rejection-variants.json',{result:'PASS_NEW_V_ONLY',variants:[...variants,'HIT_WITHOUT_PROOF','MISS_WITHOUT_COVERAGE']});
});

test('V07 actual UNKNOWN/publication/original/hash/pending-summary edges remain protected even after horizon and cursor advancement',async()=>{
  const {p,analysis,x,analysis_key,signal}=await labelled(),card={card_id:'ARTIFICIAL_V_CARD',state:'UNKNOWN',analysis:{source_input_key:analysis_key},receipt:{state:'UNKNOWN'}};
  const journal={analyses:[{analysis_id:analysis_key},{analysis_id:'pump:analysis:'+'b'.repeat(64)}],frozen_anchor:{analysis_id:analysis_key},terminal:{state:'EXPIRED'},publications:[{state:'UNKNOWN',possible_send:true,card_id:card.card_id,receipt_ref:'pump:card:'+card.card_id+'#receipt'}]};
  const summary='pump:summary-record:ARTIFICIAL_V',args={analysis_key,analysis,input:x,card,journal,signal,summary_head:{count:1000,source_cursor:1000,pending:{id:summary}},ordered_items:[{id:summary}],members:[{id:summary}],summary_records:[{record_id:summary,origin:p.capsule.origin,publication:{receipt_ref:'pump:card:'+card.card_id+'#receipt'}}],external_audit_refs:['ARTIFICIAL_EXTERNAL_UNRESOLVED'],owner_original_refs:['pump:card:ARTIFICIAL_OWNER_PROTECTED']};
  const frozen=structuredClone(args),r=await projectProtectedReferences(args),to=new Set(r.edges.map(e=>e.to));
  for(const id of [analysis_key,'pump:analysis:'+'b'.repeat(64),'pump:card:'+card.card_id,'pump:card:'+card.card_id+'#receipt',signal.signal_id,'pump:outcome:'+signal.signal_id,summary,'ARTIFICIAL_EXTERNAL_UNRESOLVED','pump:card:ARTIFICIAL_OWNER_PROTECTED','ARTIFICIAL_ONLY'])assert.ok(to.has(id),id);
  assert.equal(r.delete_allowed,false);assert.equal(r.approved_delete_ttl_ms,null);assert.equal(r.inventory_complete_for_global_cleanup,false);assert.equal(r.archive_reader_verified,false);
  for(const reason of ['UNRESOLVED_POSSIBLE_SEND','PENDING_SUMMARY_ALLOCATION','OWNER_PROTECTED_ACCEPTANCE_ORIGINAL','CURSOR_IS_NOT_GC_WATERMARK'])assert.ok(r.reasons.includes(reason));
  assert.deepEqual(args,frozen);await save('artificial-protected-references.json',r);
});

test('V08 oversized or invalid reference input fails closed and prior T/S implementations stay byte exact',async()=>{
  const {x,analysis,analysis_key}=await prepared(),args={analysis_key,analysis,input:x};
  await assert.rejects(projectProtectedReferences({...args,journal:{analyses:Array.from({length:65},()=>({analysis_id:analysis_key}))}}),/BOUND/);
  await assert.rejects(projectProtectedReferences({...args,external_audit_refs:Array.from({length:65},(_,i)=>'ARTIFICIAL:'+i)}),/BOUND/);
  await assert.rejects(projectProtectedReferences({...args,analysis_key:'pump:analysis:'+'0'.repeat(64)}),/CONTENT_HASH_REQUIRED/);
  const before=JSON.parse(await readFile(new URL('before-proofs.json',output),'utf8'));
  const results=[];
  for(const [path,proof]of Object.entries(before)){
    const bytes=await readFile(path),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');assert.equal(sha,proof.sha256,path);results.push({path,sha256:sha});
  }
  await save('protected-prior-files-integrity.json',{result:'PASS',files:results,old_test_runs:0,new_native_IO:0});
});
