const text=value=>String(value??'').trim();
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;

export function extractHyperliquidMarketContext({payload,receipt,native_symbol,observed_ts=Date.now(),max_age_ms=120000}={}){
 const fail=reason=>({schema:'HYPERLIQUID_MARKET_CONTEXT_V1',status:'NOT_CLOSED',reason,mode:'SHADOW_ONLY',entry_eligible:false});
 if(!Array.isArray(payload)||payload.length!==2||!Array.isArray(payload[0]?.universe)||!Array.isArray(payload[1]))return fail('HL_META_CONTEXT_SCHEMA_INVALID');
 const universe=payload[0].universe,contexts=payload[1];if(universe.length!==contexts.length)return fail('HL_UNIVERSE_CONTEXT_LENGTH_MISMATCH');
 const received=finite(receipt?.received_ts),observed=finite(observed_ts);if(receipt?.http_status!==200||received===null||observed===null||received>observed)return fail('HL_RECEIPT_FUTURE_OR_MISSING');
 if(observed-received>max_age_ms)return fail('HL_RECEIPT_STALE');
 const names=universe.map(row=>text(row?.name));if(names.some((name,index)=>!name||names.indexOf(name)!==index))return fail('HL_UNIVERSE_NAME_DUPLICATE_OR_EMPTY');
 const symbol=text(native_symbol);if(!symbol||symbol.includes(':'))return fail('HL_EXACT_ASSET_IDENTITY_REQUIRED');
 const index=names.indexOf(symbol);if(index<0)return fail('HL_MARKET_UNSUPPORTED');
 const market=universe[index],context=contexts[index];if(market?.isDelisted===true)return fail('HL_MARKET_DELISTED');
 const openInterest=finite(context?.openInterest),funding=finite(context?.funding),mark=finite(context?.markPx),oracle=finite(context?.oraclePx),volume=finite(context?.dayNtlVlm);
 if(openInterest===null||openInterest<0||funding===null||mark===null||mark<=0||oracle===null||oracle<=0||volume===null||volume<0)return fail('HL_MARKET_CONTEXT_NUMERIC_FIELD_INVALID');
 return{schema:'HYPERLIQUID_MARKET_CONTEXT_V1',status:'CLOSED',mode:'SHADOW_ONLY',provider_id:'HYPERLIQUID_NATIVE',endpoint_id:'META_AND_ASSET_CONTEXTS',upstream_group:'HYPERLIQUID_MAINNET_PERPS',native_symbol:symbol,instrument_type:'PERPETUAL',open_interest_native:openInterest,funding_native:funding,mark_price_native:mark,oracle_price_native:oracle,day_notional_volume_native:volume,value_units:{open_interest:'NATIVE_CONTRACTS_UNCONVERTED',funding:'NATIVE_PERIOD_UNCONFIRMED',price:'USDC_NATIVE',day_notional_volume:'NATIVE_RESPONSE_UNIT'},received_at:received,source_ts:null,timestamp_basis:'HTTP_RECEIPT_ONLY_NO_METRIC_EVENT_TIME',transport_sha256:receipt.sha256??null,independent_vote_added:false,entry_eligible:false};
}

export default{extractHyperliquidMarketContext};
