import {createHash} from 'node:crypto';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';

export const HEDERA_SUPPLY_URL='https://mainnet.mirrornode.hedera.com/api/v1/network/supply';
export const HEDERA_SUPPLY_TTL=6*60*60_000;
const unsigned=v=>typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)&&v.length<=20?BigInt(v):null;
export function hederaConsensusMilliseconds(value){
 if(typeof value!=='string'||!/^\d{1,10}(?:\.\d{1,9})?$/.test(value))return null;
 const [seconds,fraction='']=value.split('.'),ms=BigInt(seconds)*1000n+BigInt(fraction.padEnd(9,'0'))/1000000n;
 return ms>0n&&ms<=BigInt(Number.MAX_SAFE_INTEGER)?Number(ms):null;
}
export function normalizeHederaPublishedSupply({contract,identity,payload,observed_ts}={}){
 const bad=status=>({status,evidence:[],internal_only:true});
 if(contract!=='HBAR-USDT'||identity?.chain!=='hedera'||identity.asset_kind!=='NATIVE'||identity.native_asset_id!=='hedera:mainnet'||identity.contract_or_mint!==null)return bad('EXACT_HEDERA_NATIVE_IDENTITY_REQUIRED');
 const ts=hederaConsensusMilliseconds(payload?.timestamp);
 if(ts===null||!Number.isSafeInteger(observed_ts)||ts>observed_ts||observed_ts-ts>HEDERA_SUPPLY_TTL)return bad('PRIMARY_METRIC_CLOCK_NOT_CURRENT');
 const released=unsigned(payload?.released_supply),total=unsigned(payload?.total_supply);
 if(released===null||total===null||total!==5000000000000000000n||released>total)return bad('PRIMARY_TINYBAR_SUPPLY_SCHEMA_REQUIRED');
 const values={released_supply:String(released),total_supply:String(total),unreleased_supply:String(total-released)};
 const evidence=buildEvidenceV2({provider_id:'HEDERA_NATIVE_SUPPLY',upstream_id:'HEDERA_OFFICIAL_MAINNET_MIRROR_PUBLISHED_SUPPLY',asset_id:'hedera:native:mainnet',htx_contract:contract,block_id:'N02',metric_family:'HEDERA_PUBLISHED_SUPPLY_METRICS',origin_event_id:`HEDERA_SUPPLY:${payload.timestamp}`,dependency_group:'HEDERA_PUBLISHED_NETWORK_SUPPLY',source_ts:ts,observed_ts,expires_at:ts+HEDERA_SUPPLY_TTL,coverage_status:'PRIMARY_PUBLISHED_RELEASED_AND_TOTAL_SUPPLY',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{chain:'hedera',asset_kind:'NATIVE',native_asset_id:'hedera:mainnet',token_address:null,decimals:8,unit:'tinybar',supply_values_base_units:values,consensus_timestamp:payload.timestamp,primary_payload:payload,primary_payload_sha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),official_url:HEDERA_SUPPLY_URL,source_clock_policy:'ORIGINAL_PRIMARY_CONSENSUS_TIMESTAMP',chain_finalized_block_verified:false,circulating_supply_verified:false,burn_or_buyback_change_verified:false,future_unlocks_checked:false,entry_authorized:false}});
 return{status:'CLOSED',contract,evidence:[evidence],summary:{finalized:false,supply_measure:'HEDERA_PUBLISHED_RELEASED_AND_TOTAL_TINYBAR_SUPPLY',chain_finalized_block_verified:false,comparison_verified:false},internal_only:true};
}
export async function fetchHederaPublishedSupply(fetch_impl){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const r=await fetch_impl(HEDERA_SUPPLY_URL,{headers:{accept:'application/json','user-agent':'My-Report-2/primary-native-supply-v1'},redirect:'error',signal:controller.signal}),body=await r.text();let payload=null;if(Buffer.byteLength(body)<=32*1024)try{payload=JSON.parse(body);}catch{}
  return{attempts:1,payload:r.ok?payload:null,receipts:[{route:'HEDERA_PRIMARY_NETWORK_SUPPLY',ok:r.ok&&payload!==null,http_status:r.status,error:r.ok&&payload?'':`HTTP_OR_SCHEMA_${r.status}`}]};
 }catch(e){return{attempts:1,payload:null,receipts:[{route:'HEDERA_PRIMARY_NETWORK_SUPPLY',ok:false,http_status:null,error:e?.name==='AbortError'?'TIMEOUT':String(e?.message||e).slice(0,160)}]};}finally{clearTimeout(timer);}
}
