import {createHash} from 'node:crypto';

// PREPARED, UNEXECUTED. No kernel import, file/network access, writes or clock.
// ROOT must confirm the exact capture adapter and bindings before actual use.
export const AG_REVIEW_VERSION='pump-launch-original-review-prepare-v1-20261026';
const LIMITS=Object.freeze({capture_bytes:16777216,analyses:32,facts:32,source_bindings:512,source_body_bytes:8388608,total_source_bytes:33554432});
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=x=>typeof x==='string'&&x.length>0;
const time=x=>Number.isSafeInteger(x)&&x>0;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const hash=x=>createHash('sha256').update(x).digest('hex');
const jsonHash=x=>hash(JSON.stringify(x));
const clone=x=>JSON.parse(JSON.stringify(x));
const need=(value,code)=>{if(!value)throw Object.assign(new Error(code),{code});};
const codes=xs=>Array.isArray(xs)?[...new Set(xs.filter(x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{0,119}$/.test(x)))]:[];
const excluded=i=>[i?.base,i?.native_symbol,i?.asset_id?.split(':').at(-1),i?.instrument_id?.split(':').at(-1)]
  .some(x=>['BTC','ETH'].includes(String(x??'').trim().toUpperCase().replace(/(?:[-/]?USDT)$/,'')));
function checkIdentity(i){
  need(i&&['instrument_id','asset_id','native_symbol','base','identity_evidence_ref'].every(k=>text(i[k])),'ORIGINAL_IDENTITY_UNBOUND');
  need(i.venue==='BINGX'&&i.market_type==='PERPETUAL'&&i.quote==='USDT'&&i.settle==='USDT'&&i.classification_status==='VERIFIED_CRYPTO','ORIGINAL_MARKET_UNQUALIFIED');
}
function fresh(f,at,ttl){return f&&['USABLE','INCOMPLETE'].includes(f.status)&&f.value!==null&&f.origin==='OBSERVED'&&f.venue==='BINGX'&&time(f.event_ts)&&time(f.received_ts)&&time(f.expires_ts)&&
  f.event_ts<=f.received_ts&&f.received_ts<=at&&f.expires_ts>=at&&positive(ttl)&&at-f.event_ts<=ttl;}
function checkReadyFacts(a,input,profile){
  const f=input.facts,t=a.analysis_ts;
  for(const k of ['price','candles','orderbook'])need(f[k]?.kind===k&&fresh(f[k],t,profile.freshness_ms?.[k]),'READY_MANDATORY_FACT_CLOCK_OR_STATUS_UNQUALIFIED');
  need(f.price.status==='USABLE'&&f.orderbook.status==='USABLE','READY_PRICE_OR_BOOK_NOT_USABLE');
  need(f.price.unit==='USDT_PER_BASE'&&positive(f.price.value)&&a.reference_price===f.price.value,'READY_PRICE_UNIT_OR_VALUE_MISMATCH');
  need(f.orderbook.unit==='USDT_PRICE_BASE_QUANTITY','READY_BOOK_UNIT_UNQUALIFIED');
  need(['OHLC_USDT_VOLUME_BASE','OHLC_USDT_NATIVE_REPORTED_QUANTITY'].includes(f.candles.unit),'READY_CANDLE_UNIT_UNQUALIFIED');
  if(f.candles.unit==='OHLC_USDT_NATIVE_REPORTED_QUANTITY'){
    const c=f.candles.coverage,key='BINGX|USDT_M|'+input.instrument.instrument_id+'|/openApi/swap/v3/quote/klines|volume|60000';
    need(c?.time_qualified===true&&c.relative_volume_qualified===true&&c.volume_qualified===false&&c.native_quantity_unit==='UNKNOWN'&&c.volume_comparison_key===key&&
      c.comparison_kind==='SAME_NATIVE_REPORTED_QUANTITY'&&c.time_basis==='CCXT_CONSUMER_OPEN_TIME','READY_NATIVE_RELATIVE_BASIS_UNQUALIFIED');
    need(![c.base_volume_qualified,c.quote_volume_qualified,c.turnover_quote_qualified,c.absolute_base_amount_qualified,c.absolute_USD_amount_qualified].includes(true),'READY_NATIVE_ABSOLUTE_UNIT_INVENTED');
  }
}
function checkReadyPlan(a){
  const p=a.plan,entries=p?.entry_zones,exit=p?.exit_zone;
  need(Array.isArray(entries)&&entries.length>0&&entries.length<=3&&positive(exit?.lower)&&positive(exit.upper)&&exit.lower<=exit.upper,'READY_PLAN_AREAS_UNBOUND');
  for(const z of [...entries,exit]){
    need(positive(z.lower)&&positive(z.upper)&&z.lower<=z.upper&&Array.isArray(z.basis_fact_ids)&&z.basis_fact_ids.length>0,'READY_PLAN_BASIS_UNBOUND');
    need(positive(z.basis_level?.price)&&time(z.basis_level.event_ts)&&time(z.basis_level.known_ts)&&z.basis_level.event_ts<=z.basis_level.known_ts&&z.basis_level.known_ts<=a.analysis_ts,'READY_PLAN_LEVEL_NOT_PREKNOWN');
  }
  const minimum=100*(exit.lower/Math.max(...entries.map(z=>z.upper))-1);
  need(Number.isFinite(minimum)&&minimum>=10&&p.potential_pct?.minimum===minimum&&p.potential_pct.basis==='GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT','READY_PLAN_CONSERVATIVE_MINIMUM_BELOW10_OR_MISMATCH');
  need(a.notification_eligibility?.eligible===true&&a.notification_eligibility.minimum_potential_pct===minimum,'READY_NOTIFICATION_PLAN_MISMATCH');
  need(a.liquidity?.status==='USABLE'&&positive(a.liquidity.position_limit_usdt)&&a.liquidity.position_limit_usdt===p.position_limit_usdt,'READY_LIQUIDITY_PLAN_UNBOUND');
  need(p.automatic_orders===false,'READY_AUTOMATIC_ORDERS_UNEXPECTED');
}
function checkCard(a){
  need(typeof a.card_text==='string'&&a.card_text.length>0&&a.card_text.length<=4096&&a.card_text.isWellFormed(),'READY_CARD_TEXT_UNBOUND');
  need(a.probability?.value_pct===null,'UNCALIBRATED_PROBABILITY_NOT_NULL');
  const reasons=a.user_narrative?.reasons;
  need(Array.isArray(reasons)&&reasons.length<=2&&reasons.length>0,'READY_CARD_REASON_COUNT_UNQUALIFIED');
  for(const r of reasons){
    const mapReason=r.code==='MAP_PLAN_CONTEXT'&&(a.plan_context?.liquidation_confluence?.entries?.length||a.plan_context?.liquidation_confluence?.exit_zone_ids?.length);
    need((mapReason||a.findings?.some(f=>f.code===r.code&&f.text===r.text))&&text(r.text)&&a.card_text.includes(r.text),'READY_CARD_REASON_FACT_MISMATCH');
  }
  if(text(a.user_narrative.warning))need(a.card_text.includes(a.user_narrative.warning),'READY_CARD_WARNING_MISMATCH');
  if(a.liquidations?.map_mode==='WITHOUT_MAP')need(a.card_text.includes('Карта ликвидаций недоступна.'),'READY_CARD_MISSING_MAP_NOT_DISCLOSED');
  need(!/Размер:\s*до\s*3000/u.test(a.card_text),'OWNER_REMOVED_PUBLIC_SIZE_REINTRODUCED');
  need(!a.findings?.some(f=>f.code==='RELATIVE_RETURN')&&!a.optional_context?.market_context,'OWNER_REMOVED_COMPARISON_REINTRODUCED');
}
// `confirmation` is independent trusted ROOT readback, never copied from the
// capture's own boolean/pin. The callbacks may only read already supplied local
// private bytes and run the verified frozen pure core after actual input exists.
export async function reviewLaunchCapture(raw,{confirmation,recompute,readSourceBody}={}){
  const base={schema:AG_REVIEW_VERSION,raw_private_output:false,kernel_or_tests_run_during_preparation:false,
    native_PASS:false,provider_or_runtime_admission_proven:false,publication_admission_proven:false,SENT_proven:false,
    current_signal_recreated:false,original_clocks_changed:false,calibration_performed:false};
  if(typeof raw!=='string')return {...base,status:'ACTUAL_INPUT_REQUIRED',reasons:['PRIVATE_ROOT_CAPTURE_NOT_SUPPLIED'],rows:[]};
  const bytes=Buffer.byteLength(raw),capture_sha256=hash(raw),rows=[],usage={source_bodies:0,source_bytes:0};
  try{
    need(bytes<=LIMITS.capture_bytes,'CAPTURE_BYTE_BOUND_EXCEEDED');
    const c=confirmation;
    need(c?.schema==='AG_ROOT_CONFIRMED_CAPTURE_BINDING_V1'&&c.envelope_schema==='PUMP_LAUNCH_READINESS_ACTUAL_V1','ROOT_EXACT_ENVELOPE_CONFIRMATION_REQUIRED');
    need(digest(c.capture_sha256)&&c.capture_sha256===capture_sha256,'CAPTURE_BYTES_NOT_BOUND_TO_ROOT_READBACK');
    need(digest(c.implementation_sha256)&&digest(c.profile_value_sha256)&&jsonHash(c.profile)===c.profile_value_sha256&&time(c.review_ts),'ROOT_IMPLEMENTATION_PROFILE_OR_REVIEW_CLOCK_UNBOUND');
    need(Array.isArray(c.originals)&&c.originals.length<=LIMITS.analyses&&Array.isArray(c.source_bindings)&&c.source_bindings.length<=LIMITS.source_bindings,'ROOT_ORIGINAL_OR_SOURCE_BINDINGS_REQUIRED');
    need(recompute?.implementation_sha256===c.implementation_sha256&&typeof recompute.analyze==='function','VERIFIED_PURE_CORE_CALLBACK_REQUIRED');
    const envelope=JSON.parse(raw);
    need(envelope.schema===c.envelope_schema&&typeof envelope.publication_allowed==='boolean'&&Array.isArray(envelope.analyses)&&envelope.analyses.length<=LIMITS.analyses,'CAPTURE_ENVELOPE_SHAPE_UNCONFIRMED');
    const originals=new Map(c.originals.map(x=>[x.analysis_key,x]));
    need(originals.size===c.originals.length,'DUPLICATE_ROOT_ORIGINAL_BINDING');
    const sourceBindings=new Map(c.source_bindings.map(x=>[x.fact_id,x]));
    need(sourceBindings.size===c.source_bindings.length,'DUPLICATE_ROOT_SOURCE_FACT_BINDING');
    const seen=new Set(),bodyHashes=new Map();
    for(let index=0;index<envelope.analyses.length;index++){
      const row=envelope.analyses[index],r={index,reasons:[],hashes:{},original_match:false,factual_recomputation_match:false,current_core_fresh_at_review:false};
      try{
        const a=row?.analysis,o=row?.original,input=o?.input,binding=originals.get(row?.analysis_key);
        need(a&&o?.analysis&&input&&binding,'SAVED_ORIGINAL_OR_ROOT_BINDING_MISSING');
        need(!seen.has(row.analysis_key),'DUPLICATE_CAPTURE_ANALYSIS_KEY');seen.add(row.analysis_key);
        const ah=jsonHash(a),ih=jsonHash(input),oh=jsonHash(o);r.hashes={analysis:ah,input:ih,original:oh,card:typeof a.card_text==='string'?hash(a.card_text):null};
        need(row.analysis_key==='pump:analysis:'+ah&&jsonHash(o.analysis)===ah,'ANALYSIS_CONTENT_KEY_OR_ORIGINAL_MISMATCH');
        need(binding.analysis_sha256===ah&&binding.input_sha256===ih&&binding.original_sha256===oh,'INDEPENDENT_ORIGINAL_READBACK_HASH_MISMATCH');
        need(o.implementation_sha256===c.implementation_sha256,'ORIGINAL_IMPLEMENTATION_PIN_MISMATCH');
        need(o.evidence_class==='OBSERVED','ORIGINAL_NOT_OBSERVED_NATIVE_CAPTURE');
        need(time(a.analysis_ts)&&input.analysis_ts===a.analysis_ts&&time(o.saved_ts)&&a.analysis_ts<=o.saved_ts&&o.saved_ts<=c.review_ts,'ORIGINAL_CLOCK_CHANGED_OR_UNBOUND');
        need(a.run_id===input.run_id&&a.mode===input.mode&&a.run_purpose===input.run_purpose&&jsonHash(a.instrument)===jsonHash(input.instrument),'ORIGINAL_RUN_IDENTITY_OR_MODE_MISMATCH');
        checkIdentity(input.instrument);
        need(input.facts&&Object.keys(input.facts).length<=LIMITS.facts,'ORIGINAL_FACT_BOUND_EXCEEDED');
        const facts=Object.values(input.facts).filter(Boolean);
        need(!c.retained_facts||Array.isArray(c.retained_facts)&&c.retained_facts.length<=LIMITS.facts,'RETAINED_FACT_INVENTORY_BOUND_EXCEEDED');
        const retained=(c.retained_facts??[]).filter(f=>f?.instrument_id===input.instrument.instrument_id);
        const sources=[...facts,...retained];
        for(const f of facts)need(f.instrument_id===input.instrument.instrument_id,'CROSS_INSTRUMENT_ORIGINAL_FACT');
        need(c.review_ts>=a.analysis_ts,'REVIEW_TIME_PRECEDES_ORIGINAL');
        const ids=new Set(a.fact_ids??[]);
        if(a.ready)for(const k of ['price','candles','orderbook'])ids.add(input.facts[k]?.fact_id);
        for(const z of [...(a.plan?.entry_zones??[]),...(a.plan?.exit_zone?[a.plan.exit_zone]:[])])for(const id of z.basis_fact_ids??[])ids.add(id);
        for(const id of ids){
          const f=sources.find(x=>x.fact_id===id),s=sourceBindings.get(id);
          need(f&&s&&text(f.evidence_ref)&&s.evidence_ref===f.evidence_ref&&s.fact_sha256===jsonHash(f)&&digest(s.body_sha256)&&digest(s.qualification_sha256),'CONSUMED_SOURCE_REFERENCE_OR_UNIT_PROOF_UNBOUND');
          need(time(f.event_ts)&&time(f.received_ts)&&f.event_ts<=f.received_ts&&f.received_ts<=a.analysis_ts,'CONSUMED_SOURCE_CLOCK_UNBOUND');
          if(!bodyHashes.has(f.evidence_ref)){
            need(typeof readSourceBody==='function','PRIVATE_SOURCE_BODY_ADAPTER_REQUIRED');
            const body=await readSourceBody(f.evidence_ref);
            need(typeof body==='string'||body instanceof Uint8Array,'PRIVATE_SOURCE_BODY_BYTES_REQUIRED');
            const n=typeof body==='string'?Buffer.byteLength(body):body.byteLength;
            need(n<=LIMITS.source_body_bytes&&usage.source_bytes+n<=LIMITS.total_source_bytes,'PRIVATE_SOURCE_BODY_BOUND_EXCEEDED');
            usage.source_bodies++;usage.source_bytes+=n;bodyHashes.set(f.evidence_ref,hash(body));
          }
          need(bodyHashes.get(f.evidence_ref)===s.body_sha256,'PRIVATE_SOURCE_BODY_DIGEST_MISMATCH');
        }
        r.original_match=true;
        if(a.ready){need(!excluded(a.instrument),'OWNER_BTC_ETH_PUBLICATION_EXCLUDED');checkReadyFacts(a,input,c.profile);checkReadyPlan(a);checkCard(a);}
        else need(a.card_text===null,'NOT_READY_CAPTURE_HAS_PUBLIC_CARD');
        const copy=clone(input),profile=clone(c.profile),beforeInput=jsonHash(copy),beforeProfile=jsonHash(profile);
        const computed=await recompute.analyze(copy,profile);
        need(jsonHash(copy)===beforeInput&&jsonHash(profile)===beforeProfile,'RECOMPUTATION_MUTATED_ORIGINAL_COPY');
        need(jsonHash(computed)===ah,'FACTUAL_ANALYSIS_PLAN_OR_CARD_RECOMPUTATION_MISMATCH');
        r.factual_recomputation_match=true;r.original_ready=a.ready===true;
        r.purpose=input.run_purpose==='PRODUCTION'?'PRODUCTION':input.run_purpose==='ACCEPTANCE_TEST'?'ACCEPTANCE_TEST':'UNCLASSIFIED';
        r.current_core_fresh_at_review=a.ready===true&&['price','candles','orderbook'].every(k=>fresh(input.facts[k],c.review_ts,c.profile.freshness_ms?.[k]));
        r.production_original_candidate=a.ready===true&&r.purpose==='PRODUCTION';
        r.reasons=codes(a.reasons);
        if(!r.current_core_fresh_at_review)r.reasons.push('ORIGINAL_IS_NOT_CURRENT_FRESH_CORE');
        if(r.purpose!=='PRODUCTION')r.reasons.push('NOT_A_PRODUCTION_SIGNAL_ORIGINAL');
        r.status=a.ready?'MATCHED_READY_ORIGINAL_NOT_PUBLICATION_ADMISSION':'MATCHED_NOT_READY_ORIGINAL';
      }catch(e){r.status='UNVERIFIED_OR_REJECTED_ORIGINAL';r.reasons=[e?.code&&/^[A-Z][A-Z0-9_]+$/.test(e.code)?e.code:'CAPTURE_ROW_REVIEW_FAILED'];}
      rows.push(r);
    }
    return {...base,status:rows.length===0?'NO_ANALYSES_IN_SUPPLIED_CAPTURE':rows.every(r=>r.factual_recomputation_match)?'SUPPLIED_ORIGINALS_MATCHED_ONLY':'UNVERIFIED_OR_REJECTED_ORIGINALS',
      capture_sha256,publication_allowed_claim:envelope.publication_allowed,rows,usage,all550_CORE_proven:false,source_history_complete:false,external_provenance_authenticated:false};
  }catch(e){return {...base,status:'CAPTURE_REVIEW_DEPENDENCY_OR_REJECTION',capture_sha256,rows:[],usage,reasons:[e?.code&&/^[A-Z][A-Z0-9_]+$/.test(e.code)?e.code:'CAPTURE_JSON_OR_CONFIRMATION_INVALID']};}
}
