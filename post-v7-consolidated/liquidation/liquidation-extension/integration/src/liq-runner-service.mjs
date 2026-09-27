import {readJson} from '../../src/io.mjs';import {collectVerifiedHL} from '../../src/native-verification.mjs';import {reserveLiquidationAllowance} from './liq-quota-d1.mjs';
const finiteInt=x=>Number.isSafeInteger(x)&&x>=0;
export function createRunnerLiqService({mode='OFF',quota_db,quota_keys,scope_registry,d1_admission,fetch_impl=globalThis.fetch,clock=Date.now,max_accounts=4,liqflow_key,diagnostic=()=>{}}={}){
 if(mode!=='SHADOW_ONLY')return null;
 if(!Number.isInteger(max_accounts)||max_accounts<1||max_accounts>8)throw Error('ACCOUNT_LIMIT_INVALID');
 if(typeof d1_admission!=='function'||!quota_db||!quota_keys||!scope_registry)throw Error('RUNNER_ADMISSION_OR_POLICY_NOT_CONFIGURED');
 let inFlight=false;
 return {mode:'SHADOW_ONLY',diagnostic,async collect({contract,run_id,acquisition_id,cycle_started_ts}){
  // One deep-check may run at a time; other cycles retain their normal path.
  if(inFlight)return {status:'CONCURRENT_EXTENSION_COLLECTION_DEFERRED',requests:0};inFlight=true;
  try{
   const mapping=scope_registry[contract];
   if(!mapping||mapping.execution_contract!==contract||mapping.native_venue!=='Hyperliquid'||mapping.native_symbol!==contract.replace(/-USDT$/,'')||mapping.multiplier!==1||!mapping.policy_receipt)return {status:'EXACT_NATIVE_SCOPE_NOT_PROVISIONED',requests:0};
   const start=clock();if(start>=Date.parse('2026-10-27T00:00:00Z')&&!liqflow_key)return {status:'FREE_KEY_REQUIRED_AFTER_CUTOVER',requests:0};
   const callBudget=2+max_accounts;const requirements=[
    {quota_key:quota_keys.run.key,policy_receipt:quota_keys.run.policy_receipt,units:callBudget},
    {quota_key:quota_keys.liqflow.key,policy_receipt:quota_keys.liqflow.policy_receipt,units:1},
    {quota_key:quota_keys.hyperliquid.key,policy_receipt:quota_keys.hyperliquid.policy_receipt,units:1+max_accounts},
   ];
   // Cost bound must be measured and approved upstream, not invented by this module.
   const gate=await d1_admission({logical_statements:requirements.length+3,operation:'LIQ_QUOTA_ATOMIC_RESERVATION',new_source_requests:callBudget});
   if(gate?.allowed!==true||gate?.measurement_status!=='VALIDATED')return {status:'D1_COST_ENVELOPE_NOT_VALIDATED_OR_NO_CAPACITY',requests:0};
   const reservation=await reserveLiquidationAllowance(quota_db,{reservation_id:acquisition_id,acquisition_identity:{contract,run_id,acquisition_id},requirements,now_ms:start});
   if(!reservation.allowed)return {status:reservation.status,requests:0,reservation};
   const catalogue=await readJson('https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'metaAndAssetCtxs'},fetch_impl,clock,timeout_ms:12000,max_bytes:2000000});
   if(!catalogue.ok||!Array.isArray(catalogue.payload?.[0]?.universe))return {status:'NATIVE_CATALOG_NOT_CLOSED',requests:1,reservation};
   const symbols=catalogue.payload[0].universe.filter(i=>i?.isDelisted!==true).map(i=>i.name);
   const remain=45000-(clock()-start);if(remain<100)return {status:'WHOLE_EXTENSION_DEADLINE_REACHED',requests:1,reservation};
   const collected=await collectVerifiedHL({symbol:mapping.native_symbol,catalog:symbols,run_id,snapshot_id:acquisition_id,max_accounts,remaining_requests:callBudget-1,fetch_impl,clock,liqflow_key,max_wall_ms:Math.min(45000,remain)});
   return {...collected,requests:(finiteInt(collected.requests)?collected.requests:0)+1,started_ts:start,completed_ts:clock(),reservation,scope_policy_receipt:mapping.policy_receipt,
    scope_alias_verification:'SYMBOL_AND_MULTIPLIER_SCOPE_ONLY_NOT_TOKEN_IDENTITY_PROOF',source_prices_are_htx_targets:false,source_cost_envelope_production_proven:false};
  }finally{inFlight=false;}
 }};
}
