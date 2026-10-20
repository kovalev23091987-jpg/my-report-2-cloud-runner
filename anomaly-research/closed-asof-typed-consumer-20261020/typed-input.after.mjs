// Specific saved BTC/HTX research inputs. No acquisition, persistence or activation.
import {createHash} from 'node:crypto';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const fail=why=>{throw Error(why);};
const stamp=t=>Number.isSafeInteger(t)&&t>=1e12;
const digest=o=>sha256(JSON.stringify(o));
const scopes=['HTX_ORIGINAL_JSON_BODY_LOCAL_READ','BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ','DOCUMENTARY_JSON_LOCAL_READ'];
export function verifyReadJson({body,expected_sha256,raw_ref,scope,receipt_ref}){
 const read_started_ts=Date.now();
 if(!Buffer.isBuffer(body)||!body.length||body.length>1_500_000||!scopes.includes(scope)||typeof raw_ref!=='string'||!raw_ref||typeof receipt_ref!=='string'||!receipt_ref)fail('EXACT_BOUNDED_INPUT_SCOPE_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(expected_sha256||'')||sha256(body)!==expected_sha256)fail('INPUT_HASH_MISMATCH');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(body),value=JSON.parse(text);
 const verified_at_ts=Date.now();
 if(!stamp(verified_at_ts)||verified_at_ts<read_started_ts)fail('VERIFIED_CLOCK_INVALID');
 const receipt={schema:'SAVED_CANDLE_LOCAL_READ_MARKER_V1',scope,raw_ref,body_sha256:expected_sha256,parsed_value_sha256:digest(value),read_started_ts,verified_at_ts,clock_basis:'CURRENT_LOCAL_CONSUMER_AFTER_COMPLETE_INPUT_HASH_AND_JSON_PARSE',full_input_read:true,hash_match:true,parse_complete:true,receipt_ref,original_provider_body_completion_ts:null,native_ACK:false};
 return {value,marker:{receipt,receipt_sha256:digest(receipt)}};
}
function checkedMarker(marker){
 const r=marker?.receipt;
 if(!r||marker.receipt_sha256!==digest(r)||r.schema!=='SAVED_CANDLE_LOCAL_READ_MARKER_V1'||!scopes.includes(r.scope)||r.full_input_read!==true||r.hash_match!==true||r.parse_complete!==true||r.native_ACK!==false||r.original_provider_body_completion_ts!==null||!r.receipt_ref||r.clock_basis!=='CURRENT_LOCAL_CONSUMER_AFTER_COMPLETE_INPUT_HASH_AND_JSON_PARSE'||!stamp(r.read_started_ts)||!stamp(r.verified_at_ts)||r.verified_at_ts<r.read_started_ts)fail('VERIFIED_READ_MARKER_REQUIRED');
 return r;
}
const number=(s,{positive=false}={})=>{if(typeof s!=='string'||!s.trim()||!Number.isFinite(Number(s))||Math.abs(Number(s))>Number.MAX_SAFE_INTEGER||Number(s)<0||(positive&&Number(s)===0))fail('FINITE_PRESERVED_LEXEME_REQUIRED');return Number(s);};
export function buildResearchInput({sample,input_marker,input_value,policy_marker,policy,policy_sha256}){
 const r=checkedMarker(input_marker),p=checkedMarker(policy_marker);
 if(r.parsed_value_sha256!==digest(input_value)||p.parsed_value_sha256!==digest(policy))fail('PARSED_INPUT_CHANGED_AFTER_VERIFICATION');
 if(!stamp(sample.original_recorded_receipt_ts)||sample.original_provider_body_completion_ts!==null||sample.original_source_ts!==null&&!stamp(sample.original_source_ts)||p.scope!=='DOCUMENTARY_JSON_LOCAL_READ'||p.body_sha256!==policy_sha256||r.verified_at_ts<=sample.original_recorded_receipt_ts||sample.original_source_ts!==null&&r.verified_at_ts<sample.original_source_ts)fail('VERIFIED_KNOWLEDGE_CLOCK_OR_POLICY_REQUIRED');
 const btc=sample.kind==='BTC_RESEARCH_CARD_EXCERPT',htx=sample.kind==='HTX_RETAINED_NATIVE_JSON';
 if(!btc&&!htx)fail('SAVED_SOURCE_KIND_REQUIRED');
 const acceptedPolicy=btc?'f88a75c3dd62ff406a6703690ec6faa0e236e27388de9e9e9da6c38747bdb832':'036cd7bfb73a40bbce312dfd951271ded3ca6f660126e8eaaa290db0f0e22f69';
 if(policy_sha256!==acceptedPolicy||p.body_sha256!==acceptedPolicy)fail('FROZEN_SOURCE_POLICY_REQUIRED');
 let quantity;
 if(btc){
  if(r.scope!=='BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ'||r.body_sha256!==digest(sample.current)||r.raw_ref!==`${sample.parent.head}:${sample.parent.path}#${sample.current.event_id}`)fail('EXACT_RESEARCH_SAMPLE_MARKER_REQUIRED');
  // Unit policy must use the market/symbol from the exact verified payload.
  if(!['spot','usd_m_futures'].includes(sample.current.market)||sample.market!==sample.current.market||sample.contract!==sample.current.symbol||(sample.symbol!==undefined&&sample.symbol!==sample.current.symbol))fail('BTC_BOUND_MARKET_SYMBOL_REQUIRED');
  if(!stamp(sample.original_immutable_card_first_known_ts)||sample.original_immutable_card_first_known_ts!==sample.current.first_known_ts||sample.current.candle.end_ts>sample.original_immutable_card_first_known_ts)fail('IMMUTABLE_RESEARCH_CARD_CLOCK_REQUIRED');
  const col=policy.common_archive_columns?.find(x=>x.index===7);
  if(policy.schema!=='SAVED_BINANCE_SIX_CSV_DOCUMENTARY_MAPPING_V1'||col?.quantity_basis!=='QUOTE_ASSET'||col.schema_status!=='OFFICIAL_PUBLIC_DATA_SCHEMA_CLOSED_BOTH_MARKETS')fail('COLUMN7_QUOTE_BASIS_REQUIRED');
  if(!['spot','usd_m_futures'].includes(sample.market))fail('EXACT_BINANCE_MARKET_REQUIRED');
  const m=policy.market_specific_mapping[sample.current.market];
  if(m?.exact_symbol!==sample.current.symbol)fail('BTC_EXACT_SYMBOL_POLICY_REQUIRED');
  const origin=sample.raw_source,csv=origin?.csv_member?.match(/^([A-Z0-9]+)-1m-(\d{4}-(?:0[1-9]|1[0-2]))\.csv$/);
  if(!csv||csv[1]!==sample.current.symbol||origin.zip_member!==`binance-monthly/${sample.current.market}/${csv[2]}/original.zip`||!Array.isArray(sample.current.candle.source_ranges)||!sample.current.candle.source_ranges.length||sample.current.candle.source_ranges.some(x=>x.source_id!==`${sample.current.market}:${csv[2]}`))fail('BTC_BOUND_NATIVE_SOURCE_METADATA_REQUIRED');
  quantity={native_field:'CSV[7]',basis:'QUOTE_ASSET',concrete_unit:sample.market==='spot'?m.column_7_unit:m.column_7_concrete_unit_independently_closed,declared_quote:sample.market==='spot'?m.quote_asset:m.saved_qualification_declares.quote,concrete_unit_status:sample.market==='spot'?'SPOT_DOCUMENTARY_UNIT_CLOSED':'FUTURES_CONCRETE_UNIT_NOT_INDEPENDENTLY_CLOSED',column5_unit:null,trade_count_basis:'TRADES',taker_subset_not_signed_flow:true};
 }else{
  // This retained source kind is the frozen HTX linear-swap-ex trade-kline route.
  // Its body channel/period and original raw path must share the futures role.
  if(sample.market!=='FUTURES'||sample.current.timeframe!=='4h'||sample.raw_source?.path!==`checkpoints/htx-compact-4h/${sample.contract}.raw.json.gz`)fail('HTX_NATIVE_FUTURES_ROLE_PERIOD_ORIGIN_REQUIRED');
  if(r.scope!=='HTX_ORIGINAL_JSON_BODY_LOCAL_READ'||r.body_sha256!==sample.raw_source.body_sha256||r.raw_ref!==sample.raw_source.path+'#uncompressed')fail('EXACT_HTX_ORIGINAL_MARKER_REQUIRED');
  if(input_value.ch!==`market.${sample.contract}.kline.4hour`||input_value.ts!==sample.original_source_ts)fail('EXACT_HTX_NATIVE_SCOPE_REQUIRED');
  if(!stamp(input_value.ts))fail('HTX_ORIGINAL_SOURCE_ASOF_REQUIRED');
  for(const b of [...sample.current.background,sample.current.candle]){
   if(!stamp(b.end_ts)||b.end_ts>input_value.ts)fail('HTX_SELECTED_BAR_NOT_CLOSED_AT_SOURCE_ASOF');
   const native=input_value.data?.[b.source_row_index];
   if(!native||native.id*1000!==b.start_ts||b.end_ts-b.start_ts!==14_400_000||['open','high','low','close'].some(k=>native[k]!==Number(b[k]))||native.trade_turnover!==Number(b.raw_quote_turnover_lexeme))fail('HTX_SELECTED_WINDOW_NOT_BOUND_TO_BODY');
  }
  if(policy.schema!=='HTX_NATIVE_4H_TURNOVER_DOCUMENTATION_BOUNDARY_V1'||!sample.contract.endsWith('-USDT'))fail('EXACT_HTX_UNIT_POLICY_REQUIRED');
  quantity={native_field:'trade_turnover',basis:'QUOTE_ASSET',concrete_unit:'USDT',declared_quote:'USDT',concrete_unit_status:'DOCUMENTED_NATIVE_HTX_QUOTE_TURNOVER',both_sides_counted:true,divide_by_two:false,signed_taker_flow:false};
 }
 const known_by_ts=Math.max(r.verified_at_ts,p.verified_at_ts);
 if(!stamp(known_by_ts)||sample.current.candle.end_ts>known_by_ts||sample.original_immutable_card_first_known_ts>known_by_ts)fail('KNOWLEDGE_PRECEDES_SAVED_INPUT');
 const toBar=b=>{
  const quote_lexeme=btc?b.raw_column7_sum:b.raw_quote_turnover_lexeme;
  const bar={start_ts:b.start_ts,end_ts:b.end_ts,open:number(b.open,{positive:true}),high:number(b.high,{positive:true}),low:number(b.low,{positive:true}),close:number(b.close,{positive:true}),volume:number(quote_lexeme),preserved_quote_lexeme:quote_lexeme};
  if(bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close)||bar.low>bar.high)fail('SAVED_OHLC_GEOMETRY_INVALID');
  return bar;
 };
 const candle=toBar(sample.current.candle),prior=sample.current.background.map(toBar);
 if(prior.length!==20||prior.at(-1).end_ts!==candle.start_ts||prior.some((b,k)=>k&&b.start_ts!==prior[k-1].end_ts))fail('TWENTY_PAST_CONTIGUOUS_SAVED_BARS_REQUIRED');
 const blockers=['NATIVE_INSTRUMENT_EPOCH_NOT_PROVEN'];
 if(btc)blockers.push('DERIVED_SAMPLE_IS_NOT_NATIVE_ORIGINAL_INGRESS');
 if(sample.market!=='spot')blockers.push('NATIVE_CONTRACT_SIZE_UNKNOWN');
 if(quantity.concrete_unit===null)blockers.push('CONCRETE_QUOTE_ASSET_NOT_INDEPENDENTLY_CLOSED');
 return{schema:'SAVED_CANDLE_TYPED_RESEARCH_INPUT_V1',sample_id:sample.id,status:'PURE_FEATURES_ONLY_CARD_MEMORY_WATCH_BLOCKED',candle,prior,quantity,identity:{declared_contract:sample.contract,declared_market:sample.market,native_instrument_epoch_verified:false,identity_verified:false,native_contract_size:null,contract_size_applicability:sample.market==='spot'?'NOT_APPLICABLE_FOR_SPOT':'UNKNOWN',quote_numeric_conversion_factor:1},clocks:{event_start_ts:candle.start_ts,event_end_ts:candle.end_ts,source_ts:sample.original_source_ts,original_recorded_receipt_ts:sample.original_recorded_receipt_ts,original_provider_body_completion_ts:null,original_immutable_card_first_known_ts:sample.original_immutable_card_first_known_ts??null,verified_input_known_by_ts:r.verified_at_ts,schema_known_by_ts:p.verified_at_ts,usable_research_known_by_ts:known_by_ts,discovery:'BACKFILLED',first_known_semantics:'CONSERVATIVE_CURRENT_INPUT_KNOWN_BY_NOT_TRUE_ORIGINAL_FIRST_DETECTION'},markers:{input:input_marker,policy:policy_marker},blockers,admission:{pure_features:true,observer_detectClosed:false,event_card_created:false,memory_admitted:false,watch_scheduled:false,native_ingress:false,notification:false,production:false,score_contribution:0},direction:'UNASSIGNED',empirical_accuracy:null};
}
export function annotateLaterArchivedBar(view,later){
 if(!view||later.start_ts<view.candle.end_ts||later.end_ts<=later.start_ts)fail('LATER_CLOSED_BAR_REQUIRED');
 const close=number(later.close,{positive:true}),pre_known=later.end_ts<=view.clocks.usable_research_known_by_ts;
 return{schema:'SAVED_CANDLE_TEMPORAL_ANNOTATION_V1',sample_id:view.sample_id,bar_start_ts:later.start_ts,bar_end_ts:later.end_ts,close,temporal_status:pre_known?'ARCHIVED_POSTEVENT_BAR_BEFORE_CONSERVATIVE_KNOWLEDGE':'POST_KNOWLEDGE_INPUT_STILL_UNQUALIFIED',bar_is_contiguous:later.start_ts===view.candle.end_ts,observed_close_relation:close>view.candle.high?'ABOVE_HISTORICAL_EVENT_HIGH':close<view.candle.low?'BELOW_HISTORICAL_EVENT_LOW':'INSIDE_HISTORICAL_EVENT_RANGE',actual_watch_confirmation:null,actual_outcome:'INCOMPLETELY_OBSERVED_NO_ELIGIBLE_POST_KNOWLEDGE_PATH',memory_transition:false,notification:false,production:false};
}
