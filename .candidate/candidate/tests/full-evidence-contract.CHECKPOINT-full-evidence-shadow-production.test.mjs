import assert from "node:assert/strict";
import { buildFullEvidenceEnvelope, detectEvidenceConflicts, evidenceUsable, normalizeEvidenceItem, summarizeDataQuality, FIXED_DECISION_WEIGHTS } from "../src/full-evidence-contract.CHECKPOINT-full-evidence-shadow-production.mjs";
const now = 1800000000000;
const base = {contract_code:"ETHFI-USDT",chain:"HTX_EXECUTION",metric:"funding",source:"HTX",venue:"HTX",market_type:"PERP",value:-0.0005,unit:"rate",source_ts:now-10000,observed_ts:now,max_age_sec:300,now_ts:now,status:"CLOSED",coverage_pct:100,symbol_verified:true,source_compatible:true,independence_group:"HTX_OFFICIAL",primary_market_id:"ETHFI-USDT:HTX:PERP",settlement_period:"1h"};
assert.equal(FIXED_DECISION_WEIGHTS.CROSS_EXCHANGE_DERIVATIVES,35);
assert.equal(FIXED_DECISION_WEIGHTS.MARKET_STRENGTH_SPOT,30);
assert.equal(FIXED_DECISION_WEIGHTS.SMART_MONEY_ONCHAIN,20);
assert.equal(FIXED_DECISION_WEIGHTS.SUPPORTING_RISK,15);
assert.equal(evidenceUsable(base), true);
const stale = normalizeEvidenceItem({...base,source_ts:now-400000});
assert.equal(stale.status,"STALE");
assert.equal(evidenceUsable(stale),false);
const badAlias = normalizeEvidenceItem({...base,alias_required:true,alias_verified:false});
assert.equal(badAlias.status,"SOURCE_INCOMPATIBLE");
const venueOnlyAlias = normalizeEvidenceItem({...base,alias_required:true,alias_verified:true,alias_verification_scope:"VENUE_MARKET_SYMBOL_ONLY",asset_identity_verified:false});
assert.equal(venueOnlyAlias.alias_verification_scope,"VENUE_MARKET_SYMBOL_ONLY");
assert.equal(venueOnlyAlias.asset_identity_verified,false);
assert.equal(venueOnlyAlias.status,"SOURCE_INCOMPATIBLE");
assert.equal(evidenceUsable(venueOnlyAlias),false);
assert.equal(normalizeEvidenceItem({...base,source_ts:now+120000}).status,"FUTURE");
assert.equal(evidenceUsable({...base,source_ts:null}),false);
assert.equal(evidenceUsable({...base,max_age_sec:null}),false);
assert.equal(evidenceUsable({...base,coverage_pct:null}),false);
assert.equal(evidenceUsable({...base,value:null}),false);
const conflictItems=[
 {...base,source:"SRC1",independence_group:"G1",value:100,metric:"price",settlement_period:null},
 {...base,source:"SRC2",independence_group:"G2",value:110,metric:"price",settlement_period:null},
];
const conflicts=detectEvidenceConflicts(conflictItems,{relative_tolerance:0.05});
assert.equal(conflicts.length,1);
const sameFeed=detectEvidenceConflicts(conflictItems.map(x=>({...x,independence_group:"SAME"})),{relative_tolerance:0.05});
assert.equal(sameFeed.length,0);
const diffMarket=detectEvidenceConflicts([conflictItems[0],{...conflictItems[1],primary_market_id:"OTHER"}],{relative_tolerance:0.05});
assert.equal(diffMarket.length,0);
// Cross-venue dispersion is not silently called a same-market data-source conflict.
const crossVenue=detectEvidenceConflicts([conflictItems[0],{...conflictItems[1],venue:"BYBIT",primary_market_id:"ETHFIUSDT:BYBIT:PERP"}],{relative_tolerance:0.05});
assert.equal(crossVenue.length,0);
const differentUnits=detectEvidenceConflicts([conflictItems[0],{...conflictItems[1],unit:"contracts"}],{relative_tolerance:0.05});
assert.equal(differentUnits.length,0);
const defaultConflict=detectEvidenceConflicts(conflictItems);
assert.equal(defaultConflict.length,1);
const dq=summarizeDataQuality([base],[]);
assert.equal(dq.status,"PARTIAL");
assert.ok(dq.uncertainty_flags.includes("LOW_EVIDENCE_INDEPENDENCE"));
const weightedRows=[
 {...base,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding",venue:"BYBIT",source:"BYBIT",independence_group:"BYBIT",primary_market_id:"ETHFIUSDT:BYBIT:PERP"},
 {...base,chain:"MARKET_STRENGTH_SPOT",metric:"rs",venue:"OKX",source:"OKX",independence_group:"OKX",primary_market_id:"ETHFI-USDT:OKX:SPOT"},
];
const weightedDq=summarizeDataQuality(weightedRows,[]);
assert.equal(weightedDq.observed_weight_pct,65);
const env=buildFullEvidenceEnvelope({contract_code:"ETHFI-USDT",observed_ts:now,evidence:[{...base,metric:"execution_gate_status",value:1,unit:"boolean"}]});
assert.equal(env.htx_execution_gate_closed,true);
const gateZero=buildFullEvidenceEnvelope({contract_code:"ETHFI-USDT",observed_ts:now,evidence:[{...base,metric:"execution_gate_status",value:0,unit:"boolean"}]});
assert.equal(gateZero.htx_execution_gate_closed,false);
assert.equal(env.decision.dc_long,null);
assert.equal(env.decision.dc_short,null);
assert.equal(env.decision.full_decision_eligible,false);
assert.equal(env.decision.validated,false);
assert.equal(env.decision.telegram_started,false);
assert.equal(env.decision.trading_execution,false);
assert.equal(env.decision.weights_changed,false);
console.log(JSON.stringify({ok:true,suite:"full-evidence-contract",assertions:"fixed weights preserved as metadata, freshness, symbol/alias safety, same-market independence-aware conflicts, cross-venue dispersion separation, DQ decomposition, weighted evidence availability, HTX gate, zero live promotion"},null,2));
