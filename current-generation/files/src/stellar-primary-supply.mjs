import {createHash} from 'node:crypto';
import {decimalBaseUnits} from './native-ledger-supply.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';

export const STELLAR_SUPPLY_URL='https://dashboard.stellar.org/api/v3/lumens';
export const STELLAR_SUPPLY_TTL=6*60*60_000;
export function normalizeStellarPublishedSupply({contract,identity,payload,observed_ts}={}){
 const bad=status=>({status,evidence:[],internal_only:true});
 if(contract!=='XLM-USDT'||identity?.chain!=='stellar'||identity.asset_kind!=='NATIVE'||identity.native_asset_id!=='stellar:mainnet'||identity.contract_or_mint!==null)return bad('EXACT_STELLAR_NATIVE_IDENTITY_REQUIRED');
 const ts=typeof payload?.updatedAt==='string'&&/Z$/.test(payload.updatedAt)?Date.parse(payload.updatedAt):NaN;
 if(!Number.isSafeInteger(ts)||!Number.isSafeInteger(observed_ts)||ts>observed_ts||observed_ts-ts>STELLAR_SUPPLY_TTL)return bad('PRIMARY_METRIC_CLOCK_NOT_CURRENT');
 const values={};for(const key of ['originalSupply','inflationLumens','burnedLumens','totalSupply','upgradeReserve','feePool','sdfMandate','circulatingSupply']){values[key]=decimalBaseUnits(payload[key],7);if(values[key]===null)return bad('PRIMARY_SUPPLY_METRIC_SCHEMA_REQUIRED');}
 const n=key=>BigInt(values[key]);
 if(n('originalSupply')+n('inflationLumens')-n('burnedLumens')!==n('totalSupply')||n('totalSupply')-n('upgradeReserve')-n('feePool')-n('sdfMandate')!==n('circulatingSupply')||n('originalSupply')!==1000000000000000000n)return bad('PRIMARY_SUPPLY_COMPONENTS_DO_NOT_RECONCILE');
 const sha=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 const evidence=buildEvidenceV2({provider_id:'STELLAR_NATIVE_SUPPLY',upstream_id:'STELLAR_SDF_PUBLISHED_LUMEN_METRICS',asset_id:'stellar:native:mainnet',htx_contract:contract,block_id:'N02',metric_family:'STELLAR_PUBLISHED_SUPPLY_METRICS',origin_event_id:`SDF_LUMEN_METRICS:${payload.updatedAt}`,dependency_group:'STELLAR_SDF_LUMEN_SUPPLY',source_ts:ts,observed_ts,expires_at:ts+STELLAR_SUPPLY_TTL,coverage_status:'PRIMARY_PUBLISHED_SUPPLY_COMPONENTS',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{chain:'stellar',asset_kind:'NATIVE',native_asset_id:'stellar:mainnet',token_address:null,decimals:7,supply_values_base_units:values,primary_payload:payload,primary_payload_sha256:sha,official_url:STELLAR_SUPPLY_URL,source_clock_policy:'ORIGINAL_PRIMARY_UPDATED_AT',chain_finalized_block_verified:false,burn_or_buyback_change_verified:false,future_unlocks_checked:false,entry_authorized:false}});
 return{status:'CLOSED',contract,evidence:[evidence],summary:{finalized:false,supply_measure:'SDF_PUBLISHED_TOTAL_AND_CIRCULATING_LUMEN_METRICS',chain_finalized_block_verified:false,comparison_verified:false},internal_only:true};
}
export async function fetchStellarPublishedSupply(fetch_impl){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const r=await fetch_impl(STELLAR_SUPPLY_URL,{headers:{accept:'application/json','user-agent':'My-Report-2/primary-native-supply-v1'},redirect:'error',signal:controller.signal}),body=await r.text();let payload=null;if(Buffer.byteLength(body)<=32*1024)try{payload=JSON.parse(body);}catch{}
  return{attempts:1,payload:r.ok?payload:null,receipts:[{route:'STELLAR_PRIMARY_LUMEN_METRICS',ok:r.ok&&payload!==null,http_status:r.status,error:r.ok&&payload?'':`HTTP_OR_SCHEMA_${r.status}`}]};
 }catch(e){return{attempts:1,payload:null,receipts:[{route:'STELLAR_PRIMARY_LUMEN_METRICS',ok:false,http_status:null,error:e?.name==='AbortError'?'TIMEOUT':String(e?.message||e).slice(0,160)}]};}finally{clearTimeout(timer);}
}
