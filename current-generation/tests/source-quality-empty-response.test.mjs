import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEvidenceItem,evidenceUsable,summarizeDataQuality} from '../files/src/full-evidence-contract.mjs';
const row={"contract_code":"ZEC-USDT","chain":"CROSS_EXCHANGE_DERIVATIVES","metric":"venue_status","source":"Bybit Public V5","venue":"BYBIT","market_type":"LINEAR_PERP","value":null,"unit":null,"observed_ts":1791217598489,"available_ts":1791217598489,"source_ts":null,"age_sec":null,"max_age_sec":null,"max_future_sec":60,"status":"SOURCE_INCOMPATIBLE","venue_observation_status":"NOT_CLOSED","eligible_for_chain_closure":false,"freshness_status":"MISSING_SOURCE_TIMESTAMP","coverage_pct":0,"history_coverage_pct":null,"window":null,"symbol_verified":true,"alias_required":true,"alias_verified":false,"alias_verification_scope":"VENUE_MARKET_SYMBOL_ONLY","asset_identity_verified":false,"source_compatible":true,"independence_group":"BYBIT_OFFICIAL_PUBLIC","primary_market_id":null,"settlement_period":null,"contract_multiplier":null,"reason_code":null,"fallback_closed":false,"source_health":"ERROR","conflict_status":null,"source_incompatible":true,"not_closed":true,"error":"JSON_PARSE:Expected property name or '}' in JSON at position 6 (line 2 column 5)","note":"BYBIT_API_UNKNOWN:ERROR"};
test('actual saved empty Bybit parse failure is unavailable, not proof of incompatible market identity',()=>{
 const raw={...row,now_ts:1791217634938};
 const normalized=normalizeEvidenceItem(raw);
 assert.equal(normalized.status,'NOT_CLOSED');assert.equal(normalized.error,row.error);
 assert.equal(evidenceUsable(normalized),false);
 assert.equal(summarizeDataQuality([normalized]).incompatible_items,0);
});
test('actual mismatches, unknown identities on factual values, stale and future observations remain unusable',()=>{
 assert.equal(normalizeEvidenceItem({...row,source_compatible:false}).status,'SOURCE_INCOMPATIBLE');
 assert.equal(normalizeEvidenceItem({...row,value:1,status:'CLOSED'}).status,'SOURCE_INCOMPATIBLE');
 for(const [source,status]of [[1791217000000,'STALE'],[1791218000000,'FUTURE']]){
  const r=normalizeEvidenceItem({...row,value:1,status:'CLOSED',alias_verified:true,source_ts:source,now_ts:1791217634938,max_age_sec:60});assert.equal(r.status,status);assert.equal(evidenceUsable(r),false);
 }
});
