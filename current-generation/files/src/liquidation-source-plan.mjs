import {chooseWeightedLiquidationLane} from './liquidation-source-weighting.mjs';

export const SOURCE_IDS=Object.freeze(['HTX','BINANCE','BYBIT','OKX','GATE','COINALYZE','HYPERLIQUID_NATIVE','LIQFLOW_DISCOVERY','LIGHTER_NATIVE','GMX_NATIVE','GTRADE_NATIVE','OXARCHIVE_HL_BUCKETS','COINLOBSTER','DEX_SCREENER','GECKOTERMINAL','DEFILLAMA','GOPLUS','SOLANA_RPC','BITGET','COINBASE','DERIBIT']);
const COST=Object.freeze({HYPERLIQUID_NATIVE:5,GTRADE_NATIVE:3,LIGHTER_NATIVE:4,GMX_NATIVE:4,OXARCHIVE_HL_BUCKETS:1});

export function buildLiquidationRequestPlan({mode='STANDARD',available=[],seed='',health_rows=[]}={}){
  const cap=mode==='LIQUIDATION_ONLY'?8:5,lanes=[...new Set(available)].filter(x=>Object.hasOwn(COST,x));
  if(!lanes.length)return {status:'NO_ADMISSIBLE_SOURCE',mode,cap,requests:[],total_requests:0,coverage:'NONE'};
  if(mode==='LIQUIDATION_ONLY'&&lanes.includes('HYPERLIQUID_NATIVE')&&lanes.includes('GTRADE_NATIVE'))return {status:'PLANNED',mode,cap,requests:[{source_id:'HYPERLIQUID_NATIVE',attempts:5},{source_id:'GTRADE_NATIVE',attempts:3}],total_requests:8,coverage:'TWO_NATIVE_VENUES'};
  if(mode==='LIQUIDATION_ONLY'&&lanes.includes('LIGHTER_NATIVE')&&lanes.includes('GMX_NATIVE'))return {status:'PLANNED',mode,cap,requests:[{source_id:'LIGHTER_NATIVE',attempts:4},{source_id:'GMX_NATIVE',attempts:4}],total_requests:8,coverage:'TWO_NATIVE_VENUES'};
  const chosen=chooseWeightedLiquidationLane({lanes,seed,rows:health_rows}).lane,attempts=Math.min(cap,COST[chosen]);
  return {status:'PLANNED',mode,cap,requests:[{source_id:chosen,attempts}],total_requests:attempts,coverage:attempts<COST[chosen]?'BOUNDED_PARTIAL':'ONE_SELECTED_LANE'};
}

export function buildSourceReceipt({source_id,collector_lane,upstream_id,contract,request_id,run_id,snapshot_id,source_ts=null,received_ts=null,schema_version,unit,planned,admitted,transport_attempted,response_received,normalized,usable,persisted,consumed,actual_http=0,actual_credits=0,status,reason,canonical_consumer,contribution=0}={}){
  if(!SOURCE_IDS.includes(source_id))throw new Error('SOURCE_ID_NOT_REGISTERED');
  return {source_id,collector_lane,upstream_id,contract,request_id,run_id,snapshot_id,source_ts,received_ts,schema_version,unit,planned:planned===true,admitted:admitted===true,transport_attempted:transport_attempted===true,response_received:response_received===true,normalized:normalized===true,usable:usable===true,persisted:persisted===true,consumed:consumed===true,actual_http,actual_credits,status,reason,canonical_consumer,contribution:usable&&consumed?contribution:0};
}

export function sourceHealthOutcome(receipt){
  if(!receipt?.transport_attempted)return {evaluated:false,reason:receipt?.status||'NOT_ATTEMPTED'};
  return {evaluated:true,network_available:receipt.response_received===true,usable:receipt.usable===true,status:receipt.status,identity_or_schema_failure:receipt.response_received===true&&receipt.usable!==true};
}
