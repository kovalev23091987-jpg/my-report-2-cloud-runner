const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
const KNOWN_SUFFIX=new Set(['WATCH','CANDIDATE','BIAS']);

export function normalizeDirectionCandidate(value,{origin='UNKNOWN',source_ts=null,confirmation_state='UNCONFIRMED'}={}){
  const raw=String(value??'').trim().toUpperCase();let direction='UNKNOWN';
  if(raw==='LONG'||raw==='SHORT')direction=raw;
  else{const match=raw.match(/^(LONG|SHORT)_([A-Z]+)$/);if(match&&KNOWN_SUFFIX.has(match[2]))direction=match[1];}
  return {direction,origin,source_ts:finite(source_ts),confirmation_state,direction_raw:raw||null};
}

export function authorizeEntryDirection({candidate,final_route_state,final_direction,hard_veto=false}={}){
  if(hard_veto===true||final_route_state==='REJECTED')return {authorized:false,status:'VETO_OR_REJECTED',direction:'UNKNOWN'};
  const final=normalizeDirectionCandidate(final_direction,{origin:'FINAL_ROUTE',confirmation_state:'FINAL_CONFIRMED'});
  if(!['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(final_route_state)||final.direction==='UNKNOWN')return {authorized:false,status:'FINAL_DIRECTION_NOT_CONFIRMED',direction:'UNKNOWN',candidate:candidate??null};
  return {authorized:true,status:'FINAL_DIRECTION_CONFIRMED',direction:final.direction,candidate:candidate??null};
}

// Explicit BingX identity correlation only. Declarations do not authenticate a catalog.
function bingxReferenceInstrument(value){
  const token=v=>typeof v==='string'&&v.length>0&&v.length<=160&&v===v.trim()&&!/[\s\p{C}]/u.test(v);
  const decimal=v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,31})(?:\.\d{1,32})?$/.test(v)&&/[1-9]/.test(v);
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!=='BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1'||value.venue!=='BINGX'||value.market!=='FUTURES'||value.product!=='PERPETUAL'||!['USDT_M','COIN_M'].includes(value.family)||value.crypto_eligibility!=='VERIFIED_CRYPTO_PERPETUAL'||value.underlying_class!=='CRYPTO_ASSET')return null;
  if(!['contract','native_symbol','base','quote','settle','margin','identity_revision','crypto_eligibility_proof_ref'].every(k=>token(value[k]))||value.contract!==value.native_symbol||['PAXG','XAUT'].includes(value.base.toUpperCase())||value.native_contract_id!==null&&!token(value.native_contract_id)||!['LINEAR','INVERSE'].includes(value.linear_inverse)||value.price_unit!=='QUOTE_PER_NATIVE_BASE'||!/^([a-f0-9]{64})$/.test(String(value.catalog_payload_sha256)))return null;
  if(![null,'BASE_ASSET','CONTRACTS'].includes(value.quantity_unit)||value.contract_size_decimal!==null&&!decimal(value.contract_size_decimal)||![null,'BASE_PER_CONTRACT','QUOTE_PER_CONTRACT'].includes(value.contract_size_unit)||value.token_multiplier_decimal!==null&&!decimal(value.token_multiplier_decimal))return null;
  const binding=value.asset_binding,bindingKeys=['status','canonical_asset_id','chain_id','token_address','token_epoch','proof_ref'];
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||!['VENUE_SCOPED','VERIFIED_TOKEN'].includes(binding.status)||!bindingKeys.slice(1).every(k=>binding[k]===null||token(binding[k])))return null;
  if(binding.status==='VENUE_SCOPED'&&(['canonical_asset_id','chain_id','token_address','token_epoch'].some(k=>binding[k]!==null)||value.token_multiplier_decimal!==null))return null;
  if(binding.status==='VERIFIED_TOKEN'&&!['canonical_asset_id','token_epoch','proof_ref'].every(k=>token(binding[k])))return null;
  const keys=['schema','venue','market','product','family','contract','native_symbol','native_contract_id','base','quote','settle','margin','linear_inverse','quantity_unit','contract_size_decimal','contract_size_unit','price_unit','identity_revision','crypto_eligibility','underlying_class','token_multiplier_decimal','crypto_eligibility_proof_ref','catalog_payload_sha256'];
  const identity={...Object.fromEntries(keys.map(k=>[k,value[k]])),asset_binding:Object.fromEntries(bindingKeys.map(k=>[k,binding[k]]))};
  const stable=keys.filter(k=>!['schema','crypto_eligibility','crypto_eligibility_proof_ref','catalog_payload_sha256'].includes(k));
  const key='R2INSTRUMENT_V1:'+encodeURIComponent(JSON.stringify([...stable.map(k=>identity[k]),bindingKeys.filter(k=>k!=='proof_ref').map(k=>binding[k])]));
  if(key.length>4096)return null;
  return {identity,key,capacity_units_known:value.quantity_unit==='BASE_ASSET'||value.quantity_unit==='CONTRACTS'&&decimal(value.contract_size_decimal)&&value.contract_size_unit!==null};
}

export function buildHtxReferencePrice({contract,type,bid=null,ask=null,value=null,source_ts,received_ts,venue='HTX',instrument_identity=null,expected_instrument_identity=null,decision_ts=null,maximum_age_ms=null}={}){
  if(venue!=='HTX'||instrument_identity!==null||expected_instrument_identity!==null){
    const actual=bingxReferenceInstrument(instrument_identity),expected=bingxReferenceInstrument(expected_instrument_identity);
    if(venue!=='BINGX'||!actual||!expected||actual.key!==expected.key||contract!==actual.identity.native_symbol)return {status:'NOT_CLOSED',reason:'BINGX_REFERENCE_EXACT_INSTRUMENT_REQUIRED'};
    if(!Number.isSafeInteger(source_ts)||source_ts<=0||!Number.isSafeInteger(received_ts)||received_ts<source_ts)return {status:'NOT_CLOSED',reason:'BINGX_REFERENCE_ORIGINAL_SOURCE_CLOCK_REQUIRED'};
    const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
    if(bid!==null&&!positive(bid)||ask!==null&&!positive(ask)||bid!==null&&ask!==null&&ask<bid)return {status:'NOT_CLOSED',reason:'BINGX_REFERENCE_BOOK_INVALID'};
    let resolved=null;
    if(type==='MID_OBSERVATION'&&positive(bid)&&positive(ask)&&ask>=bid)resolved=(bid+ask)/2;
    if(type==='EXECUTABLE_BID'&&positive(bid))resolved=bid;
    if(type==='EXECUTABLE_ASK'&&positive(ask))resolved=ask;
    if(type==='EXECUTABLE_VWAP'&&positive(value))resolved=value;
    // This new LAST context is bounded at its decision clock, never executable.
    // A late research read keeps its original source clock and cannot become current.
    if(type==='LAST_OBSERVATION'){
      if(!Number.isSafeInteger(decision_ts)||decision_ts<received_ts||!Number.isSafeInteger(maximum_age_ms)||maximum_age_ms<=0||maximum_age_ms>300000||decision_ts-source_ts>maximum_age_ms)return {status:'NOT_CLOSED',reason:'BINGX_LAST_OBSERVATION_FRESHNESS_NOT_CLOSED'};
      if(positive(value))resolved=value;
    }
    if(!positive(resolved))return {status:'NOT_CLOSED',reason:'BINGX_REFERENCE_PRICE_OR_TYPE_INVALID'};
    return {status:'CLOSED',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',contract,type,bid,ask,value:resolved,source_ts,received_ts,instrument_identity:actual.identity,instrument_key:actual.key,capacity_units_known:actual.capacity_units_known,price_unit:actual.identity.price_unit,cross_venue_equivalence_qualified:false,native_identity_authenticated:false};
  }
  const allowed=new Set(['MID_OBSERVATION','EXECUTABLE_BID','EXECUTABLE_ASK','EXECUTABLE_VWAP']);
  const b=finite(bid),a=finite(ask),v=finite(value),source=finite(source_ts),received=finite(received_ts);
  if(!/^[^\s]+-USDT$/.test(String(contract||''))||!allowed.has(type)||source===null||received===null||received<source)return {status:'NOT_CLOSED',reason:'HTX_REFERENCE_IDENTITY_OR_TIME_INVALID'};
  let resolved=v;if(type==='MID_OBSERVATION')resolved=b!==null&&a!==null&&a>=b?(b+a)/2:null;
  if(type==='EXECUTABLE_BID')resolved=b;if(type==='EXECUTABLE_ASK')resolved=a;
  if(resolved===null||resolved<=0)return {status:'NOT_CLOSED',reason:'HTX_REFERENCE_PRICE_INVALID'};
  return {status:'CLOSED',venue:'HTX',contract,type,bid:b,ask:a,value:resolved,source_ts:source,received_ts:received};
}

export function normalizeExecutionStatus(component={}){
  const raw=String(component.execution_status??component.status??'').trim().toUpperCase();
  if(['SUCCESS','CLOSED','OK'].includes(raw))return {status:'SUCCESS',reason:null};
  if(['FAILED','ERROR','SOURCE_ERROR'].includes(raw))return {status:'FAILED',reason:String(component.reason??component.error??'EXECUTION_COMPONENT_FAILED')};
  if(['PARTIAL','DEGRADED'].includes(raw))return {status:'PARTIAL',reason:String(component.reason??'EXECUTION_COMPONENT_PARTIAL')};
  return {status:'UNKNOWN',reason:'EXECUTION_STATUS_NOT_RECOGNIZED'};
}

export function buildHtxExecutionReceipt({component,reference_price,expected_instrument_identity=null}={}){
  const normalized=normalizeExecutionStatus(component);
  if(normalized.status!=='SUCCESS'||reference_price?.status!=='CLOSED'||!String(reference_price?.type||'').startsWith('EXECUTABLE_'))return {status:'NOT_CLOSED',reason:normalized.status!=='SUCCESS'?normalized.reason:'EXECUTABLE_HTX_REFERENCE_REQUIRED'};
  if(reference_price.venue==='BINGX'||expected_instrument_identity!==null){
    const actual=bingxReferenceInstrument(reference_price.instrument_identity),expected=bingxReferenceInstrument(expected_instrument_identity),gate=bingxReferenceInstrument(component?.instrument_identity);
    if(component?.venue!=='BINGX'||!actual||!expected||!gate||actual.key!==expected.key||actual.key!==gate.key||reference_price.instrument_key!==actual.key||!actual.capacity_units_known)return {status:'NOT_CLOSED',reason:'BINGX_EXECUTION_SAME_INSTRUMENT_AND_UNITS_REQUIRED'};
    const rebuilt=buildHtxReferencePrice({...reference_price,instrument_identity:actual.identity,expected_instrument_identity:expected.identity});
    if(rebuilt.status!=='CLOSED'||rebuilt.value!==reference_price.value)return {status:'NOT_CLOSED',reason:'BINGX_EXECUTABLE_REFERENCE_NOT_BOUND'};
    return {status:'CLOSED',execution_status:'SUCCESS',venue:'BINGX',market:'FUTURES',product:'PERPETUAL',contract:reference_price.contract,reference_price,instrument_identity:actual.identity,instrument_key:actual.key,execution_gate_replaced:false,native_execution_qualified:false,cross_venue_equivalence_qualified:false};
  }
  if(reference_price.venue!=='HTX'||component?.venue&&component.venue!=='HTX'||component?.instrument_identity?.venue&&component.instrument_identity.venue!=='HTX')return {status:'NOT_CLOSED',reason:'HTX_EXECUTABLE_REFERENCE_VENUE_MISMATCH'};
  return {status:'CLOSED',execution_status:'SUCCESS',venue:'HTX',contract:reference_price.contract,reference_price,execution_gate_replaced:false};
}

export function rolling24hChange({current,history_point}={}){
  const now=finite(current?.value??current),past=finite(history_point?.value??history_point),actual=finite(history_point?.actual_window_ms);
  if(now===null||past===null||past<=0||actual===null||Math.abs(actual-24*60*60_000)>5*60_000)return {status:'UNKNOWN',reason:'REAL_24H_WINDOW_REQUIRED',rolling_24h_change_pct:null};
  return {status:'CLOSED',semantics:'SNAPSHOT_ACTUAL_24H',actual_window_ms:actual,rolling_24h_change_pct:(now/past-1)*100};
}

export function traceFinalDecision(row){
  if(!row)return {before:'CANDIDATE',after:'REJECTED',reason:'NO_FINAL_DECISION_ROW'};
  return {before:row.before??'UNKNOWN',after:row.after??row.canonical_state??'UNKNOWN',reason:row.reason??'FINAL_DECISION_PRESENT'};
}
