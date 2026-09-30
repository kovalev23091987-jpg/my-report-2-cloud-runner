import {fingerprint,seal,timestamp,selectZones} from './core.mjs';
import {normalizeNativeHL} from './providers.mjs';
import {bindGTradeAcquisition,verifyMultiLiquidationAcquisition} from './gtrade-runtime-bridge.mjs';
import {bindScopedProviderAcquisition,verifyScopedProviderAcquisition} from './scoped-provider-runtime-bridge.mjs';
const exactText=x=>typeof x==='string'&&x.trim()===x&&x.length>0;
const rawKeys=['schema','contract','native_symbol','run_id','acquisition_id','collection_started_ts','collection_completed_ts','mode','accounts','provenance'];
export function createNativeAcquisition({contract,native_symbol,run_id,acquisition_id,collection_started_ts,collection_completed_ts,accounts,provenance}={}){
 if(!exactText(contract)||!exactText(native_symbol)||!exactText(run_id)||!exactText(acquisition_id)||!Array.isArray(accounts)||accounts.length>8)throw Error('ACQUISITION_IDENTITY_OR_BOUND_INVALID');
 if(timestamp(collection_started_ts)===null||timestamp(collection_completed_ts)===null||collection_completed_ts<collection_started_ts)throw Error('ACQUISITION_CLOCK_INVALID');
 for(const a of accounts){if(!exactText(a.address)||!a.state||!a.http_receipt||a.http_receipt.http_status!==200||timestamp(a.http_receipt.received_ts)===null||a.http_receipt.received_ts>collection_completed_ts||a.http_receipt.received_ts<collection_started_ts)throw Error('ACCOUNT_TRANSPORT_PROOF_MISSING');}
 const raw={schema:'NATIVE_LIQUIDATION_ACQUISITION_V1',contract,native_symbol,run_id,acquisition_id,collection_started_ts,collection_completed_ts,mode:'SHADOW_ONLY',accounts,provenance:provenance??null};
 return {...raw,acquisition_fingerprint:fingerprint(raw)};
}
export function verifyAcquisition(raw){
 if(!raw||raw.schema!=='NATIVE_LIQUIDATION_ACQUISITION_V1'||raw.mode!=='SHADOW_ONLY')return false;
 const {acquisition_fingerprint:f,...body}=raw;
 if(Object.keys(body).some(k=>!rawKeys.includes(k)))return false;
 return fingerprint(body)===f;
}
export function bindNativeAcquisition(raw,{contract,run_id,snapshot_id,observed_ts,direction=null,max_age_ms=120000}={}){
 const denied=reason=>({schema:'NATIVE_LIQUIDATION_CONTEXT_V1',status:'NOT_CLOSED',reason,mode:'SHADOW_ONLY',source_count:0,above:[],below:[],automatic_execution:false,entry_eligible:false,render_enabled:false});
 if(!verifyAcquisition(raw))return denied('RAW_ACQUISITION_DIGEST_OR_SCHEMA_INVALID');
 if(!exactText(contract)||!exactText(run_id)||!exactText(snapshot_id)||timestamp(observed_ts)===null||!([null,'LONG','SHORT'].includes(direction)))return denied('CANONICAL_IDENTITY_REQUIRED');
 if(raw.contract!==contract||raw.run_id!==run_id||raw.native_symbol!==contract.replace(/-USDT$/,''))return denied('ACQUISITION_CONTRACT_OR_RUN_MISMATCH');
 if(raw.collection_completed_ts>observed_ts)return denied('ACQUISITION_AFTER_ANALYTICAL_CUTOFF');
 if(raw.collection_started_ts>raw.collection_completed_ts)return denied('ACQUISITION_TIME_ORDER_INVALID');
 if(observed_ts-raw.collection_completed_ts>max_age_ms)return denied('ACQUISITION_TOO_OLD');
 const native=normalizeNativeHL({accounts:raw.accounts.map(a=>({address:a.address,state:a.state})),selection_bias:raw.provenance?.selection_bias??'BOUNDED_PUBLIC_ACCOUNT_SAMPLE'},
  {symbol:raw.native_symbol,route_symbol:raw.native_symbol,run_id,snapshot_id,as_of_ms:observed_ts,received_at_ms:raw.collection_completed_ts,max_age_ms,execution_alias_verified:false});
 const chosen=selectZones(native);const compactRow=z=>({native_price:z.native_price,side:z.liquidated_side,notional:z.notional,notional_unit:z.notional_unit,native_reference_price:z.native_reference_price,
  distance_pct:z.distance_pct,selection_roles:z.selection_roles,price_quote:'USDC',position_count:z.position_count,margin_mode:z.margin_mode,conditional_cross:z.conditional_on_other_positions,
  source_ts:z.source_ts,provider:'Hyperliquid official',venue:'Hyperliquid',price_semantics:z.price_semantics,account_reference_fingerprint:fingerprint(z.account),is_htx_price:false,entry_eligible:false});
 const result={schema:'NATIVE_LIQUIDATION_CONTEXT_V1',mode:'SHADOW_ONLY',status:native.usable_for_context?'USABLE_NATIVE_SAMPLE':'NOT_CLOSED',reason:native.usable_for_context?null:native.status,
  freshness_max_age_ms:max_age_ms,binding:{contract,native_symbol:raw.native_symbol,run_id,snapshot_id,observed_ts,direction},acquisition_fingerprint:raw.acquisition_fingerprint,acquisition_id:raw.acquisition_id,
  acquisition_completed_ts:raw.collection_completed_ts,source_ts:native.source_ts??null,source_age_ms:native.source_age_ms??null,native_receipt_fingerprint:native.fingerprint,
  source_count:1,price_quote:'USDC',upstream_groups:['HYPERLIQUID_MAINNET_PERPS'],coverage:'BOUNDED_ACCOUNT_SAMPLE_NOT_FULL_MARKET',sample_accounts:native.account_count??0,
  provider:'Hyperliquid official',venue:'Hyperliquid',
  market_context:raw.provenance?.hyperliquid_market_context?.status==='CLOSED'?raw.provenance.hyperliquid_market_context:null,
  returned_positive_levels:native.zones.length,missing_native_liquidation_prices:native.omitted_positions?.length??null,
  above:(chosen.above??[]).map(compactRow),below:(chosen.below??[]).map(compactRow),
  realized_events:[],realized_projected_separate:true,requires_24h_pump:false,distance_cap_pct:null,
  same_upstream_votes:1,independent_votes_added:false,notional_summed_across_providers:false,execution_alias_verified:false,
  automatic_execution:false,entry_eligible:false,render_enabled:native.usable_for_context===true,raw_accounts_persisted:false};
 const size=Buffer.byteLength(JSON.stringify(result));if(size>8192)return denied('COMPACT_CONTEXT_OVER_8KB');
 return seal({...result,body_bytes_before_fingerprint:size});
}
// Applied before the one canonical fingerprint is built, never in Telegram sender.
export function attachNativeContext(legacy,raw,identity){
 if(raw===null||raw===undefined)return legacy;
 if(raw?.schema==='MULTI_LIQUIDATION_ACQUISITION_V1'){
   if(!verifyMultiLiquidationAcquisition(raw)||raw.contract!==identity?.contract||raw.run_id!==identity?.run_id)return {...(legacy??{}),multi_source_extension:{status:'NOT_CLOSED',reason:'MULTI_ACQUISITION_IDENTITY_OR_DIGEST_INVALID'}};
   const hyper=raw.hyperliquid?bindNativeAcquisition(raw.hyperliquid,identity):null;
   const gtrade=raw.gtrade?bindGTradeAcquisition(raw.gtrade,identity):null;
   const scoped=(Array.isArray(raw.scoped)?raw.scoped:[]).filter(verifyScopedProviderAcquisition).map(x=>bindScopedProviderAcquisition(x,identity));
   const extensions=[gtrade,...scoped].filter(x=>x&&['USABLE_SCOPED_NATIVE_CONTEXT','USABLE_RECEIPT_ONLY_CONTEXT'].includes(x.status));
   return {...(legacy??{}),native_extension:hyper,independent_extensions:extensions,multi_source_extension:{status:'CLOSED',notional_summed_across_providers:false,independent_votes_generated:false,source_count:Number(Boolean(hyper&&hyper.status==='USABLE_NATIVE_SAMPLE'))+extensions.length}};
 }
 const context=bindNativeAcquisition(raw,identity);
 return {...(legacy??{}),native_extension:context};
}
