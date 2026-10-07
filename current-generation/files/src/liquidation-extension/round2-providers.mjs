import {base,fail,complete,zone,num,obj,timestamp,sourceClock,seal} from './core.mjs';
const positive=v=>num(v)!==null&&num(v)>0;
const nonnegative=v=>num(v)!==null&&num(v)>=0;
function observedReceipt(receipt,c){
 return obj(receipt)&&receipt.http_status===200&&timestamp(receipt.received_ts)!==null&&receipt.received_ts<=c.as_of_ms&&c.as_of_ms-receipt.received_ts<=c.max_age_ms;
}
// Transaction timestamps are last account activity, not a snapshot clock.
export function normalizeLighter({payload,receipt,account_index,market_id},c){
 const b=base('Lighter official',c,['LIGHTER_MAINNET_PERPS'],'NATIVE_ACCOUNT_LIQUIDATION_PRICES',{venue:'Lighter',quote:'USDC',coverage:'EXPLICIT_PUBLIC_ACCOUNT_SAMPLE',access:'KEYLESS_REST_TESTED'});
 if(!observedReceipt(receipt,c))return fail(b,'CURRENT_ACCOUNT_HTTP_RECEIPT_MISSING');
 if(payload?.code!==200||!Array.isArray(payload.accounts)||!/^\d+$/.test(String(account_index))||!Number.isSafeInteger(market_id))return fail(b,'LIGHTER_SCHEMA_OR_REQUEST_INVALID');
 const accounts=payload.accounts.filter(a=>String(a.account_index)===String(account_index));
 if(accounts.length!==1)return fail(b,'EXACT_ACCOUNT_ID_NOT_RETURNED');
 const a=accounts[0];if(!Array.isArray(a.positions))return fail(b,'ACCOUNT_POSITIONS_MISSING');
 const matched=a.positions.filter(p=>p.market_id===market_id);
 if(matched.length>1||matched.some(p=>p.symbol!==c.symbol))return fail(b,'MARKET_ID_OR_SYMBOL_MISMATCH');
 const z=[],omitted=[];
 try{for(const p of matched){
  if(!positive(p.position)){if(num(p.position)===0)continue;throw Error('POSITION_SIZE_UNKNOWN');}
  if(![1,-1].includes(p.sign)||![0,1].includes(p.margin_mode)||!positive(p.position_value))throw Error('POSITION_SIDE_MARGIN_OR_UNIT_UNVERIFIED');
  if(!positive(p.liquidation_price)){omitted.push({reason:'NO_POSITIVE_NATIVE_LIQUIDATION_PRICE',raw_liquidation_price:p.liquidation_price??null});continue;}
  z.push(zone({price:p.liquidation_price,notional:p.position_value,notionalUnit:'USDC',side:p.sign===1?'LONG':'SHORT',ref:num(p.position_value)/num(p.position),count:1,
   position_key:`Lighter:${account_index}:${market_id}`,price_semantics:'EXCHANGE_ACCOUNT_REPORTED_PRICE',margin_mode:p.margin_mode===0?'cross':'isolated',conditional_on_other_positions:p.margin_mode===0,
   raw_liquidation_price:p.liquidation_price,raw_position_value:p.position_value,raw_transaction_time:a.transaction_time??null}));
 }
 return complete(b,z,{source_ts:null,source_age_ms:null,source_clock_closed:false,observed_at_ms:receipt.received_ts,freshness_basis:'CURRENT_STATE_ENDPOINT_READ_ONLY_NOT_LAST_TRANSACTION',
  request_account_index:String(account_index),request_market_id:market_id,account_count:1,whole_book_coverage_pct:null,omitted_positions:omitted,
  activity_time_raw:a.transaction_time??null,activity_time_not_used_as_snapshot:true,execution_target_eligible:false});
 }catch(e){return fail(b,e.message);}
}
export function decimal30String(v){
 if(typeof v!=='string'||!/^\d+$/.test(v))throw Error('DECIMAL30_STRING_REQUIRED');
 const s=v.replace(/^0+(?=\d)/,'').padStart(31,'0');return s.slice(0,-30)+'.'+s.slice(-30);
}
export function normalizeGmx({payload,receipt,account,chain,market_address=null},c){
 const b=base('GMX public API',c,[`GMX_V2_${String(chain).toUpperCase()}`],'NATIVE_POSITION_PROVIDER_FEE_AWARE_ESTIMATES',{venue:`GMX-${chain}`,quote:'USD',access:'KEYLESS_REST_TESTED',coverage:'EXPLICIT_PUBLIC_ACCOUNT_SAMPLE'});
 if(chain!=='arbitrum'||!observedReceipt(receipt,c)||!/^0x[0-9a-f]{40}$/i.test(account)||!Array.isArray(payload))return fail(b,'GMX_READ_IDENTITY_OR_CLOCK_INVALID');
 if(market_address!==null&&!/^0x[0-9a-f]{40}$/i.test(market_address))return fail(b,'GMX_EXACT_MARKET_INVALID');
 const z=[],omitted=[],seen=new Set();
 try{for(const p of payload){
  if(String(p.account).toLowerCase()!==account.toLowerCase())throw Error('GMX_ACCOUNT_MISMATCH');
  if(p.indexName!==c.symbol+'/USD')continue;
  if(market_address!==null&&String(p.marketAddress).toLowerCase()!==market_address.toLowerCase())continue;
  if(!/^0x[0-9a-f]{64}$/i.test(p.contractKey)||seen.has(p.contractKey))throw Error('DUPLICATE_OR_MISSING_GMX_POSITION_KEY');seen.add(p.contractKey);
  const size=decimal30String(p.sizeInUsd),lp=decimal30String(p.liquidationPrice),mp=decimal30String(p.markPrice);
  if(!positive(size))continue;
  if(!positive(lp)){omitted.push({position_key:p.contractKey,reason:'NO_POSITIVE_LIQUIDATION_PRICE'});continue;}
  if(typeof p.isLong!=='boolean'||!positive(mp)||!/^0x[0-9a-f]{40}$/i.test(p.marketAddress))throw Error('GMX_PRICE_SIDE_OR_MARKET_INVALID');
  z.push(zone({price:lp,notional:size,side:p.isLong?'LONG':'SHORT',ref:mp,count:1,position_key:`GMX:${chain}:${p.contractKey}`,market_address:p.marketAddress,
   price_semantics:'PROVIDER_FEE_AWARE_LIQUIDATION_PRICE',native_price_decimal:lp,native_mark_decimal:mp,notional_decimal:size,notional_basis:'sizeInUsd_NOT_positionValueInUsd',
   increased_at_time:p.increasedAtTime??null,decreased_at_time:p.decreasedAtTime??null,position_update_time_not_used_as_snapshot:true}));
 }
 return complete(b,z,{source_ts:null,source_age_ms:null,source_clock_closed:false,observed_at_ms:receipt.received_ts,freshness_basis:'CURRENT_POSITIONS_COMPUTED_API_NO_BLOCK_TIMESTAMP',
  request_account:account,request_market_address:market_address,whole_book_coverage_pct:null,omitted_positions:omitted,execution_target_eligible:false});
 }catch(e){return fail(b,e.message);}
}
export function normalizeLiqFlow({payload,receipt,reference,reference_receipt,unit_contract,catalog},c){
 const b=base('LiqFlow node',c,['HYPERLIQUID_MAINNET_PERPS'],'NODE_DERIVED_PROJECTED_BUCKETS',{venue:'Hyperliquid',quote:'PROVIDER_REPORTED_QUOTE',coverage:'PROVIDER_NODE_CENSUS_CLAIM_NOT_INDEPENDENTLY_VERIFIED',access:'KEYLESS_TRANSITION_FREE_KEY_REQUIRED_AFTER_2026_10_27'});
 if(!observedReceipt(receipt,c)||!Array.isArray(payload?.levels)||c.route_symbol!==c.symbol)return fail(b,'LIQFLOW_SCHEMA_OR_ROUTE_INVALID');
 const clock=sourceClock(b,payload.snapshot_time,c);if(!clock.ok)return fail(b,clock.reason,clock);
 if(!Array.isArray(catalog)||!catalog.includes(c.symbol))return fail(b,'UNSUPPORTED_OR_UNVERIFIED_INSTRUMENT');
 if(!observedReceipt(reference_receipt,c)||reference?.coin!==c.symbol||!positive(reference.mark_price))return fail(b,'REFERENCE_READ_NOT_CLOSED');
 if(unit_contract?.unit!=='USDC_REPORTED'||unit_contract?.scale!==1||typeof unit_contract.proof_sha256!=='string'||! /^[a-f0-9]{64}$/.test(unit_contract.proof_sha256))return fail(b,'RAW_API_UNIT_PROOF_REQUIRED');
 const z=[],outliers=[],seen=new Set();
 try{for(const r of payload.levels){
  if(!obj(r)||!positive(r.liq_price)||seen.has(r.liq_price))throw Error('INVALID_OR_DUPLICATE_LIQFLOW_PRICE');seen.add(r.liq_price);
  const keys=['long_notional','short_notional'].filter(k=>Object.hasOwn(r,k));if(!keys.length)throw Error('BUCKET_HAS_NO_EXPOSURE_FIELD');
  // Missing side is omitted rather than fabricated as a zero observation.
  for(const k of keys){
   if(!nonnegative(r[k]))throw Error('BUCKET_NOTIONAL_MISSING_OR_INVALID');
   const side=k==='long_notional'?'LONG':'SHORT';const row=zone({price:r.liq_price,notional:r[k],notionalUnit:'USDC_REPORTED',side,ref:reference.mark_price,price_semantics:'BUCKET_PRICE_NOT_NATIVE_ACCOUNT_PRICE',
    model_comparison_status:'NATIVE_CHECK_DISAGREEMENT_UNRESOLVED',native_revalidation_required:true});
   if((side==='LONG'&&row.distance_pct>=0)||(side==='SHORT'&&row.distance_pct<=0)){outliers.push({...row,reason:'SIDE_GEOMETRY_REQUIRES_NATIVE_ACCOUNT_RECHECK'});continue;}
   z.push(row);
  }
 }
 const result=complete(b,z,{...clock,reference_price:reference.mark_price,reference_source_ts:null,reference_observed_at_ms:reference_receipt.received_ts,reference_same_snapshot_proven:false,
  model_validation_status:'NATIVE_CROSS_MARGIN_PRICE_DISAGREEMENT_REQUIRES_RECHECK',native_revalidation_required:true,side_geometry_quarantine:outliers,
  unit_contract,usable_as_final_target:false});
 // Preserve research values; never grant decision eligibility just for HTTP200.
 return seal({...result,status:result.zones.length?'RESEARCH_MODEL_NATIVE_VERIFICATION_REQUIRED':result.status,usable_for_context:false,research_usable:true});
 }catch(e){return fail(b,e.message);}
}
export function inspectTape(payload,c){
 const b=base('Tape observed heatmap',c,['HYPERLIQUID_MAINNET_PERPS'],'VISIBLE_POSITION_CLUSTER_ESTIMATE',{venue:'Hyperliquid',coverage:'TOP_WALLET_SAMPLE'});
 if(payload?.coin!==c.symbol)return fail(b,'SYMBOL_MISMATCH');
 if(payload.warming===true||!(num(payload.coverage?.walletsRead)>0))return fail(b,'WARMING_NOT_AN_EMPTY_MARKET');
 return fail(b,'LIVE_POPULATED_SCHEMA_NOT_YET_VERIFIED');
}
