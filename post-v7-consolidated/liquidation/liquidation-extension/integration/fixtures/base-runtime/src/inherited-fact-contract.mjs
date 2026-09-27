export const INHERITED_FACT_CONTRACT_VERSION='inherited-fact-contract-v2-20260925';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clean=v=>String(v??'').normalize('NFC').trim();
const upper=v=>clean(v).toUpperCase();
const QUOTES=['USDT','USDC','USD','BTC','ETH'];
const DIMENSIONLESS=new Set(['PCT','%','BPS','RATE','RATE_PER_SETTLEMENT','BOOLEAN','RATIO','SCORE','INDEX','PERCENTAGE_POINTS','AVERAGE_PERCENTAGE_POINTS']);
const CEX=new Set(['HTX','BYBIT','OKX','GATE','BINANCE','BITGET','COINBASE EXCHANGE','DERIBIT','HYPERLIQUID']);

export function normalizeInheritedTimestamp(value){
  if(typeof value==='string'&&value.trim()&&!/^\d+(?:\.\d+)?$/.test(value.trim())){
    const ms=Date.parse(value);return Number.isFinite(ms)?{status:'CLOSED',ms,detected_unit:'iso'}:{status:'NOT_CLOSED',ms:null,detected_unit:null,reason:'TIMESTAMP_INVALID'};
  }
  const n=finite(value);if(n===null||n<0)return{status:'NOT_CLOSED',ms:null,detected_unit:null,reason:'TIMESTAMP_INVALID'};
  let unit=null,ms=null;
  if(n>=1e15){unit='us';ms=Math.trunc(n/1000);}
  else if(n>=1e12){unit='ms';ms=Math.trunc(n);}
  else if(n>=1e9){unit='s';ms=Math.trunc(n*1000);}
  else return{status:'NOT_CLOSED',ms:null,detected_unit:null,reason:'TIMESTAMP_UNIT_AMBIGUOUS'};
  if(ms<946684800000||ms>4102444800000)return{status:'NOT_CLOSED',ms:null,detected_unit:unit,reason:'TIMESTAMP_OUT_OF_RANGE'};
  return{status:'CLOSED',ms,detected_unit:unit};
}

export function parseCexContract(value){
  const s=upper(value);if(!s)return{base:null,quote:null};
  for(const q of QUOTES){
    for(const sep of ['-','_','/']){
      if(s.endsWith(`${sep}${q}`)&&s.length>q.length+1)return{base:s.slice(0,-q.length-1),quote:q};
    }
  }
  for(const q of QUOTES)if(s.endsWith(q)&&s.length>q.length)return{base:s.slice(0,-q.length),quote:q};
  return{base:null,quote:null};
}

function metricNeedsMultiplier(row){
  const unit=upper(row?.unit);
  if(DIMENSIONLESS.has(unit))return false;
  if(/PCT|PERCENT|BPS|RATE|RATIO|BOOLEAN|SCORE|INDEX/.test(unit))return false;
  return /(CONTRACT|COIN|BASE_VOLUME|BASE_ASSET)/.test(unit);
}
function instrumentFromPrimary(primary,contract){
  const p=clean(primary);return p?p.split(':')[0]:clean(contract)||null;
}
function normalizeMarketType(v){
  const s=upper(v);
  if(['USDT_PERP','PERP','SWAP','LINEAR','USDT-FUTURES','FUTURES'].includes(s))return 'PERP';
  if(s==='SPOT')return 'SPOT';
  if(s==='OPTION'||s==='OPTIONS')return 'OPTION';
  return s||null;
}
function semanticStatus(row){
  const s=upper(row?.status||'UNKNOWN'),r=upper(row?.reason_code||row?.reason);
  if(s==='CONFLICT'||r==='CROSS_VENUE_DIVERGENCE')return'CROSS_VENUE_DIVERGENCE';
  for(const x of ['NOT_APPLICABLE','NOT_CONFIGURED','BUDGET_EXHAUSTED','SOURCE_EXHAUSTED','STALE','RATE_LIMITED','TIMEOUT','UNSUPPORTED','SOURCE_INCOMPATIBLE'])if(s===x||r===x)return x;
  return s;
}

export function buildInheritedCexIdentity(row={},context={}){
  const contract=clean(row?.contract_code||context?.default_contract_code);
  const parsed=parseCexContract(contract);
  const venue=clean(row?.venue)||null;
  const venueUpper=upper(venue);
  const primary=clean(row?.primary_market_id)||null;
  const instrument=clean(row?.provider_symbol||row?.symbol)||instrumentFromPrimary(primary,contract);
  const marketRaw=clean(row?.market_type)||null;
  const market=normalizeMarketType(marketRaw);
  const aliasRequired=row?.alias_required===true;
  const directVerified=row?.asset_identity_verified===true ||
    (!aliasRequired&&row?.symbol_verified===true&&row?.source_compatible!==false&&Boolean(primary));
  const rawMultiplier=finite(row?.contract_multiplier??row?.multiplier);
  const multiplierRequired=metricNeedsMultiplier(row);
  const multiplier=rawMultiplier;
  const multiplierStatus=rawMultiplier!==null?'EXPLICIT':multiplierRequired?'MISSING_NOT_COERCED':'NOT_APPLICABLE_FOR_METRIC';
  const cex=CEX.has(venueUpper)||Boolean(primary);
  const core=Boolean(contract&&parsed.base&&parsed.quote&&venue&&instrument&&market&&primary&&row?.symbol_verified===true&&directVerified);
  const closed=core&&(!multiplierRequired||(multiplier!==null&&multiplier>0));
  return{
    version:INHERITED_FACT_CONTRACT_VERSION,status:closed?'CLOSED':'NOT_CLOSED',
    scope:cex?'CEX_INSTRUMENT':'UNKNOWN_INSTRUMENT',
    venue,instrument_id:instrument,primary_market_id:primary,contract_code:contract||null,
    chain:null,chain_status:cex?'NOT_APPLICABLE_CEX':'UNKNOWN',
    contract_or_mint:null,contract_or_mint_status:cex?'NOT_APPLICABLE_CEX':'UNKNOWN',
    base_asset:parsed.base,quote_asset:parsed.quote,quote_identity_preserved:true,
    market_type:market,market_type_raw:marketRaw,
    multiplier,multiplier_status:multiplierStatus,multiplier_required_for_metric:multiplierRequired,
    symbol_verified:row?.symbol_verified===true,asset_identity_verified:directVerified,
    asset_identity_verification_method:row?.asset_identity_verified===true?'EXPLICIT_ASSET_IDENTITY':
      directVerified?'EXACT_VENUE_INSTRUMENT_NO_ALIAS_REQUIRED':'NOT_VERIFIED',
    ticker_only_identity:false,
    identity_key:closed?[venueUpper,instrument,parsed.base,parsed.quote,market,String(multiplier??multiplierStatus)].join('|'):null,
  };
}

export function normalizeInheritedFact(row={},context={}){
  const identity=buildInheritedCexIdentity(row,context);
  const event=normalizeInheritedTimestamp(row?.event_ts??row?.source_ts);
  const received=normalizeInheritedTimestamp(row?.received_ts??row?.observed_ts??row?.full_observed_ts??context?.default_observed_ts);
  const maxAgeSec=finite(row?.max_age_sec);
  const ageMs=event.status==='CLOSED'&&received.status==='CLOSED'?received.ms-event.ms:null;
  const freshnessStatus=ageMs===null?'NOT_CLOSED':
    ageMs < -60_000?'FUTURE_SOURCE_TIME':
    maxAgeSec!==null&&ageMs>maxAgeSec*1000?'STALE':
    maxAgeSec!==null?'CURRENT_AT_OBSERVATION':'OBSERVED_NO_SLA';
  const coveragePct=finite(row?.coverage_pct);
  const quality=upper(row?.quality_status||row?.source_health||row?.dq_status||context?.default_quality_status||'UNKNOWN');
  const interval=clean(row?.interval||row?.window||row?.settlement_period)||null;
  const provider=clean(row?.provider||row?.source)||null;
  const venue=clean(row?.venue)||null;
  const symbol=identity.instrument_id||clean(row?.symbol)||null;
  const status=semanticStatus(row);
  const rawValue=Object.prototype.hasOwnProperty.call(row,'raw_value')?row.raw_value:(Object.prototype.hasOwnProperty.call(row,'value')?row.value:null);
  const normalizedValue=Object.prototype.hasOwnProperty.call(row,'normalized_value')?row.normalized_value:(Object.prototype.hasOwnProperty.call(row,'value')?row.value:null);
  const contractClosed=Boolean(
    identity.status==='CLOSED'&&provider&&venue&&symbol&&identity.contract_code&&identity.market_type&&clean(row?.unit)&&
    event.status==='CLOSED'&&received.status==='CLOSED'&&coveragePct!==null&&quality
  );
  const decisionUsable=status==='CLOSED'&&contractClosed&&row?.source_compatible!==false&&
    !['STALE','FUTURE_SOURCE_TIME','NOT_CLOSED'].includes(freshnessStatus);
  return{
    version:INHERITED_FACT_CONTRACT_VERSION,
    fact_contract_status:contractClosed?'CLOSED':'NOT_CLOSED',
    status,legacy_status:upper(row?.status)||null,reason_code:clean(row?.reason_code)||null,
    metric:clean(row?.metric)||null,provider,source:provider,venue,symbol,
    identity,identity_status:identity.status,contract_code:identity.contract_code,
    chain:identity.chain,chain_status:identity.chain_status,
    contract_or_mint:identity.contract_or_mint,contract_or_mint_status:identity.contract_or_mint_status,
    base_asset:identity.base_asset,quote_asset:identity.quote_asset,market_type:identity.market_type,
    unit:clean(row?.unit)||null,multiplier:identity.multiplier,multiplier_status:identity.multiplier_status,
    interval,interval_status:interval?'CLOSED':'NOT_APPLICABLE_OR_NOT_PROVIDED',
    event_ts:event.ms,event_ts_unit:event.detected_unit,received_ts:received.ms,received_ts_unit:received.detected_unit,
    freshness_status:freshnessStatus,max_age_sec:maxAgeSec,age_ms:ageMs,
    coverage_pct:coveragePct,coverage_status:coveragePct!==null?'CLOSED':'NOT_MEASURED',
    quality_status:quality,
    raw_value:rawValue,normalized_value:normalizedValue,
    normalization_status:Object.prototype.hasOwnProperty.call(row,'normalized_value')?'EXPLICIT_NORMALIZED_VALUE':'LEGACY_VALUE_PASSTHROUGH',
    source_compatible:row?.source_compatible!==false,
    decision_usable:decisionUsable,
    missing_is_zero:false,stale_is_current:false,unknown_quality_is_safe:false,
    cross_venue_values_averaged:false,
  };
}

export function normalizeInheritedFactEnvelope(rows=[],context={}){
  const facts=(Array.isArray(rows)?rows:[]).map(r=>normalizeInheritedFact(r,context));
  return{
    version:INHERITED_FACT_CONTRACT_VERSION,status:'CLOSED',
    facts,
    counts:{
      total:facts.length,
      identity_closed:facts.filter(x=>x.identity_status==='CLOSED').length,
      fact_contract_closed:facts.filter(x=>x.fact_contract_status==='CLOSED').length,
      decision_usable:facts.filter(x=>x.decision_usable).length,
    },
    explicit_missing_semantics:true,cross_venue_values_averaged:false,
  };
}
export default{INHERITED_FACT_CONTRACT_VERSION,normalizeInheritedTimestamp,parseCexContract,buildInheritedCexIdentity,normalizeInheritedFact,normalizeInheritedFactEnvelope};
