// Synthetic proof-control fixtures. Never emit them to a live source or report.
import {normalizeInheritedFact} from '../../existing-source-fact-contract-delta/overlay/src/inherited-fact-contract.mjs';
import {buildRoleEvidenceView} from '../files/src/source-role-consumer.mjs';
export const ROLE_T=1790769600000;
export function rawRoleFact({venue='BYBIT',source=venue,metric='oi_change_1h',contract='SOL-USDT',ts=ROLE_T,...overrides}={}){
 return {contract_code:contract,source,venue,metric,market_type:'PERP',primary_market_id:`${contract}:${venue}:PERP`,symbol:contract,
  symbol_verified:true,asset_identity_verified:true,source_compatible:true,status:'CLOSED',source_health:'OK',quality_status:'GREEN',
  source_ts:ts-1000,received_ts:ts,observed_ts:ts,max_age_sec:300,coverage_pct:100,value:metric==='execution_gate_status'?1:3,
  unit:metric==='execution_gate_status'?'boolean':'pct',window:'1h',...overrides};
}
export const roleFact=options=>normalizeInheritedFact(rawRoleFact(options));
export const verifiedRoleView=(contract,ts)=>buildRoleEvidenceView([
 roleFact({venue:'HTX',metric:'execution_gate_status',contract,ts}),roleFact({venue:'BYBIT',contract,ts})
],{contract,observed_ts:ts});
