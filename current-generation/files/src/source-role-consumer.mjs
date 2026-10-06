import {SOURCES} from './source-role-registry.mjs';
export const SOURCE_ROLE_CONSUMER_VERSION='source-role-consumer-v2-per-metric-proof-20260930';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
const finite=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:(Number.isFinite(Number(v))?Number(v):null);
const aliases=Object.freeze({
 HTX:'HTX_OFFICIAL',HUOBI:'HTX_OFFICIAL',HTX_OFFICIAL:'HTX_OFFICIAL',
 'HTX OFFICIAL PUBLIC API':'HTX_OFFICIAL',HTX_OFFICIAL_VIA_REPORT2_HUB:'HTX_OFFICIAL',
 BINANCE:'BINANCE_OFFICIAL',BINANCE_OFFICIAL:'BINANCE_OFFICIAL',
 BYBIT:'BYBIT_OFFICIAL',BYBIT_OFFICIAL:'BYBIT_OFFICIAL','BYBIT PUBLIC V5':'BYBIT_OFFICIAL',
 GATE:'GATE_OFFICIAL','GATE.IO':'GATE_OFFICIAL',GATE_OFFICIAL:'GATE_OFFICIAL','GATE PUBLIC FUTURES':'GATE_OFFICIAL',
 OKX:'OKX_OFFICIAL',OKX_OFFICIAL:'OKX_OFFICIAL','OKX PUBLIC V5':'OKX_OFFICIAL','OKX SPOT PUBLIC V5':'OKX_OFFICIAL',
 BYKARANTELI:'BYKARANTELI','BYKARANTELI LIQMAP PUBLIC API':'BYKARANTELI',
 COINLOBSTER:'COINLOBSTER',COINFUTY:'COINFUTY','TRADER.PRO':'TRADER_PRO',TRADER_PRO:'TRADER_PRO',
 'DEPTH RADAR':'DEPTH_RADAR',DEPTH_RADAR:'DEPTH_RADAR',VYX:'VYX',NANSEN:'NANSEN',
 COINGECKO:'COINGECKO','COIN GECKO':'COINGECKO',COINMARKETCAP:'COINMARKETCAP',CMC:'COINMARKETCAP','TOKEN TERMINAL':'TOKEN_TERMINAL',TOKEN_TERMINAL:'TOKEN_TERMINAL'
});
export function sourceKey(receipt={}){
 const supplied=[receipt.source,receipt.provider,receipt.source_key].map(upper).filter(Boolean);
 if(!supplied.length)return aliases[upper(receipt.venue)]??null;
 const keys=supplied.map(s=>aliases[s]??null);
 return keys.every(k=>k&&k===keys[0])?keys[0]:null;
}
function metricRoles(metric,key){
 const primary=key==='HTX_OFFICIAL';
 if(metric==='EXECUTION_GATE_STATUS')return primary?['EXECUTION_TRUTH']:[];
 if(['FUNDING_RATE','HTX_FUNDING_PCT'].includes(metric))return [primary?'FUNDING_PRIMARY':'FUNDING_CROSS_VENUE'];
 if(['OI_CHANGE_1H','OI_CHANGE_4H','HTX_OI_1H_CHANGE_PCT','HTX_OI_4H_CHANGE_PCT'].includes(metric))return [primary?'OI_PRIMARY':'OI_CROSS_VENUE'];
 if(metric==='OPEN_INTEREST_CURRENT')return [primary?'OI_CURRENT_PRIMARY':'OI_CURRENT_CROSS_VENUE'];
 if(['PRICE_CHANGE_4H','HTX_PRICE_1H_PCT','HTX_PRICE_4H_PCT','HTX_PRICE_24H_PCT'].includes(metric))return [primary?'PRICE_PRIMARY':'PRICE_CROSS_VENUE'];
 if(metric==='HTX_SPOT_FLOW_DELTA_PCT')return primary?['SPOT_FLOW_PRIMARY']:[];
 if(['TAKER_BALANCE_1H_RAW','HTX_FUTURES_FLOW_1H_DELTA_PCT','HTX_FUTURES_FLOW_4H_DELTA_PCT'].includes(metric))return [primary?'TRADES_PRIMARY':'TRADES_CROSS_VENUE'];
 if(['HTX_SPREAD_BPS','HTX_BUY_IMPACT_BPS','HTX_SELL_IMPACT_BPS'].includes(metric))return primary?['ORDERBOOK_PRIMARY']:[];
 if(/^(RS_VS_(BTC|ETH)_(1H|4H|24H)|DOWN_MARKET_RS_VS_(BTC|ETH)_RAW)$/.test(metric))return ['RELATIVE_STRENGTH_CROSS_VENUE'];
 return [];
}
function usableReason(r,key,context){
 if(!key)return 'UNKNOWN_OR_CONFLICTING_PROVIDER';
 if(upper(r.status)!=='CLOSED')return 'SOURCE_NOT_CLOSED';
 if(r.decision_usable!==true||r.fact_contract_status!=='CLOSED'||r.identity_status!=='CLOSED'||r.identity?.status!=='CLOSED')return 'FACT_OR_IDENTITY_NOT_VERIFIED';
 if(r.source_compatible!==true)return 'SOURCE_INCOMPATIBLE';
 if(!text(r.contract_code)||r.identity.contract_code!==r.contract_code)return 'EXACT_CONTRACT_REQUIRED';
 if(context.contract&&r.contract_code!==context.contract)return 'FOREIGN_CONTRACT';
 if(!['GREEN','OK','CLOSED'].includes(upper(r.quality_status)))return 'QUALITY_NOT_VERIFIED';
 const coverage=finite(r.coverage_pct);
 if(coverage===null||coverage<=0||coverage>100)return 'COVERAGE_NOT_VERIFIED';
 if(finite(r.normalized_value)===null||!text(r.unit))return 'VALUE_OR_UNIT_MISSING';
 const source=finite(r.event_ts),received=finite(r.received_ts),sla=finite(r.max_age_sec);
 const checked=finite(context.observed_ts)??received;
 if(source===null||received===null||checked===null||source<1e12||received<1e12||sla===null||sla<=0)return 'SOURCE_CLOCK_OR_SLA_MISSING';
 const bindingKnown=finite(r.identity?.asset_identity_binding_known_ts),bindingExpires=finite(r.identity?.asset_identity_binding_expires_ts);
 if(r.identity?.asset_identity_binding&&(bindingKnown===null||bindingExpires===null||bindingKnown>checked||checked>=bindingExpires))return 'ASSET_BINDING_NOT_KNOWN_OR_EXPIRED_AT_DECISION';
 if(source>received+60000||source>checked+60000||received>checked+60000)return 'FUTURE_SOURCE_OR_RECEIPT';
 if(checked-source>sla*1000||r.freshness_status!=='CURRENT_AT_OBSERVATION')return 'STALE_OR_UNVERIFIED_FRESHNESS';
 const venueKey=aliases[upper(r.venue)]??null;
 if(SOURCES[key].kind==='OFFICIAL_VENUE'&&venueKey!==key)return 'SOURCE_VENUE_MISMATCH';
 if(upper(r.metric)==='EXECUTION_GATE_STATUS'&&finite(r.normalized_value)!==1)return 'EXECUTION_GATE_NOT_CLOSED';
 return null;
}
export function classifyReceipt(receipt={},context={}){
 const key=sourceKey(receipt),spec=key?SOURCES[key]:null;
 const mapped=metricRoles(upper(receipt.metric),key).filter(r=>spec?.roles.includes(r));
 const excluded=usableReason(receipt,key,context)||(!mapped.length?'METRIC_ROLE_NOT_MAPPED':null);
 // Provider names are not independent origins. An aggregator reporting HTX
 // stays HTX; unknown/mixed upstream lineage cannot add a confirmation.
 const origin=aliases[upper(receipt.identity?.venue??receipt.venue)]??null;
 const originGroup=origin&&SOURCES[origin]?.kind==='OFFICIAL_VENUE'?SOURCES[origin].family:null;
 const roles=excluded?[]:mapped;
 const fundingPeriod=upper(receipt.metric)==='FUNDING_RATE'?(receipt.settlement_period??(/^\d+(?:\.\d+)?H$/.test(upper(receipt.interval))?receipt.interval:null)):null;
 const comparison=roles.length?JSON.stringify([receipt.contract_code,upper(receipt.metric),receipt.interval??null,upper(receipt.unit),receipt.identity?.quote_asset??null,receipt.identity?.market_type??receipt.market_type,receipt.identity?.multiplier??null,receipt.event_ts,fundingPeriod,upper(receipt.metric)==='FUNDING_RATE'&&!fundingPeriod?originGroup:null]):null;
 return {...receipt,source_key:key,source_family:spec?.family??null,source_kind:spec?.kind??null,source_priority:spec?.priority??0,
  source_priority_semantics:'STATIC_OPERATIONAL_PRIORITY_NOT_PREDICTIVE_WEIGHT',declared_roles:spec?.roles??[],assigned_roles:roles,
  role_evidence_usable:roles.length>0,role_exclusion_reason:excluded,comparison_key:comparison,
  independence_group:roles.length?originGroup:null,registry_known:Boolean(spec)};
}
export function buildRoleEvidenceView(receipts=[],context={}){
 const classified=(Array.isArray(receipts)?receipts:[]).map(r=>classifyReceipt(r,context)),roles={},comparisons={};
 for(const r of classified)for(const role of r.assigned_roles){
  (roles[role]??=[]).push(r);
  const xs=((comparisons[role]??={})[r.comparison_key]??=[]);
  if(r.independence_group&&!xs.includes(r.independence_group))xs.push(r.independence_group);
 }
 const independent={};
 for(const [role,items] of Object.entries(roles)){
  items.sort((a,b)=>b.source_priority-a.source_priority);
  const scopes=Object.values(comparisons[role]);independent[role]=scopes.length===1?scopes[0]:[];
 }
 return {version:SOURCE_ROLE_CONSUMER_VERSION,status:'CLOSED',scope:'OBSERVED_USABLE_METRICS_ONLY',classified,roles,
  independent_groups:independent,independent_groups_by_comparison:comparisons,
  independence_semantics:'DISTINCT_KNOWN_ORIGINS_NOT_STATISTICAL_INDEPENDENCE',
  unknown_sources:classified.filter(x=>!x.registry_known),predictive_weight_changed:false};
}
export function primaryReceiptForRole(receipts,role,context={}){const v=buildRoleEvidenceView(receipts,context);return Object.keys(v.independent_groups_by_comparison[role]??{}).length===1?v.roles[role]?.[0]??null:null;}
export function independentConfirmationCount(receipts,role,context={}){return buildRoleEvidenceView(receipts,context).independent_groups?.[role]?.length??0;}
export default{SOURCE_ROLE_CONSUMER_VERSION,sourceKey,classifyReceipt,buildRoleEvidenceView,primaryReceiptForRole,independentConfirmationCount};
