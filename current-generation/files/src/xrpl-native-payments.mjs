import {createHash} from 'node:crypto';
import {buildEvidenceV2,SOURCE_POLICIES} from './evidence-source-adapters.mjs';
import {normalizeNativeLedgerPair} from './native-ledger-supply.mjs';
import {CHAIN_SUPPLY_EVIDENCE_VERSION} from './chain-supply-evidence.mjs';
import {readEvidenceSourceCache,reserveEvidenceSourceAttempts,writeEvidenceSourceCache} from './evidence-source-store.mjs';

export const XRPL_PAYMENTS_VERSION='xrpl-validated-native-payment-sample-v1-20261007';
const TTL=20*60_000,SOURCE='CHAIN_RPC',URL='https://xrplcluster.com/',hash=s=>/^[a-f0-9]{64}$/i.test(s||''),account=s=>/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(s||'');
export function normalizeXrplNativePayments({contract,identity,ledger_payload,supply_pair_proof,observed_ts}={}){
 const bad=status=>({status,evidence:[],internal_only:true});
 if(contract!=='XRP-USDT'||identity?.chain!=='xrp'||identity.asset_kind!=='NATIVE'||identity.native_asset_id!=='xrp:mainnet'||identity.contract_or_mint!==null)return bad('EXACT_XRPL_NATIVE_IDENTITY_REQUIRED');
 const original=normalizeNativeLedgerPair({...supply_pair_proof,observed_ts}),expanded=normalizeNativeLedgerPair({...supply_pair_proof,current_payload:ledger_payload,observed_ts});
 if(original.status!=='CLOSED'||expanded.status!=='CLOSED'||expanded.current.block_ref!==original.current.block_ref||expanded.current.source_ts!==original.current.source_ts||expanded.current.supply!==original.current.supply)return bad('EXACT_VALIDATED_LEDGER_DEPENDENCY_REQUIRED');
 const rows=ledger_payload?.result?.ledger?.transactions;if(!Array.isArray(rows)||rows.length>2000||!hash(ledger_payload?.result?.ledger?.transaction_hash)||ledger_payload?.result?.ledger?.transaction_hash!==supply_pair_proof.current_payload?.result?.ledger?.transaction_hash)return bad('EXPANDED_VALIDATED_LEDGER_SCHEMA_REQUIRED');
 const seen=new Set(),payments=[];let schema=true;
 for(const row of rows){
  const tx=row?.tx_json||row,meta=row?.metaData||row?.meta,id=row?.hash||tx?.hash;
  if(!tx||!hash(id)||seen.has(id)||typeof tx.TransactionType!=='string'||!meta||typeof meta.TransactionResult!=='string'||!Number.isSafeInteger(meta.TransactionIndex)||meta.TransactionIndex<0){schema=false;continue;}seen.add(id);
  if(tx.TransactionType!=='Payment'||meta.TransactionResult!=='tesSUCCESS')continue;
  // delivered_amount is the documented actually received amount; Amount is
  // deliberately never a fallback, including partial payments.
  const delivered=meta.delivered_amount;
  if(typeof delivered!=='string'||!/^\d+$/.test(delivered)||BigInt(delivered)<=0n||!account(tx.Account)||!account(tx.Destination)||tx.Account===tx.Destination)continue;
  if(payments.length<16)payments.push({tx_hash:id,transaction_index:meta.TransactionIndex,from:tx.Account,to:tx.Destination,delivered_drops:delivered});
 }
 const base={status:payments.length?'CLOSED':schema?'CLOSED_BOUNDED_NATIVE_PAYMENT_CHECK':'EXPANDED_VALIDATED_LEDGER_SCHEMA_REQUIRED',contract,evidence:[],summary:{scope:'FIRST_16_SUCCESSFUL_NATIVE_DELIVERED_PAYMENTS_IN_ONE_EXACT_VALIDATED_LEDGER',ledger_index:expanded.current.ledger_index,ledger_hash:expanded.current.block_ref,returned_transactions:rows.length,accepted_native_payments:payments.length,sample_limit:16,complete_transfer_history:false,exchange_labels_verified:false,direction_neutral:true},internal_only:true};
 if(!payments.length){base.check_completed=schema;return base;}
 const body_sha=createHash('sha256').update(JSON.stringify(ledger_payload)).digest('hex');
 base.evidence.push(buildEvidenceV2({provider_id:SOURCE,upstream_id:'XRPL_INFTF_MAINNET_RPC',asset_id:'xrp:native:mainnet',htx_contract:contract,block_id:'N04',metric_family:'XRPL_VALIDATED_NATIVE_PAYMENT_SAMPLE',origin_event_id:`XRPL_NATIVE_PAYMENTS:${expanded.current.block_ref}`,dependency_group:`XRPL_LEDGER:${expanded.current.block_ref}`,source_ts:expanded.current.source_ts,observed_ts,expires_at:expanded.current.source_ts+TTL,coverage_status:'BOUNDED_VALIDATED_NATIVE_PAYMENT_SAMPLE',coverage_fraction:0,directional_strength:null,risk_strength:null,extra:{chain:'xrp',native_asset_id:'xrp:mainnet',asset_kind:'NATIVE',producer:'XRPL_VALIDATED_LEDGER_DELIVERED_PAYMENT_SAMPLE',quantity_units:'DROPS',decimals:6,ledger_index:expanded.current.ledger_index,block_ref:expanded.current.block_ref,native_payments:payments,validated_ledger_payload:ledger_payload,supply_pair_proof,ledger_response_sha256:body_sha,source_clock_policy:'EXACT_VALIDATED_LEDGER_CLOSE_TIME',exchange_labels_verified:false,event_is_not_market_direction:true,complete_transfer_history:false,entry_authorized:false}}));
 return base;
}
export async function collectXrplNativePayments({db,fetch_impl,request_admit,contract,run_id,asset_identity,now,clock=Date.now,strict_fresh_manual=false}={}){
 const key=`XRPL_NATIVE_PAYMENTS:${XRPL_PAYMENTS_VERSION}:${contract}`,cached=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(!strict_fresh_manual&&cached?.version===XRPL_PAYMENTS_VERSION)return cached;
 const supply=await readEvidenceSourceCache(db,{source:'XRPL_NATIVE_SUPPLY',asset_key:'xrp:native:mainnet',now}),proof=supply?.evidence?.find(r=>r.native_ledger_pair_payload)?.native_ledger_pair_payload;
 if(supply?.version!==CHAIN_SUPPLY_EVIDENCE_VERSION||supply.status!=='CLOSED'||normalizeNativeLedgerPair({...proof,observed_ts:now}).status!=='CLOSED')return{status:'EXACT_CURRENT_NATIVE_LEDGER_DEPENDENCY_REQUIRED',evidence:[],network_calls:0,internal_only:true};
 const reservation_id=`EV2:XRPL_NATIVE_PAYMENT:${run_id}:${contract}:${proof.current_payload.result.ledger_hash}`,whole_job_admission=request_admit?.({logical_request_id:reservation_id,lane:'background',attempts:1});if(whole_job_admission?.allowed!==true)return{status:whole_job_admission?.status||'ADMISSION_REQUIRED',evidence:[],network_calls:0,whole_job_admission};
 const admission=await reserveEvidenceSourceAttempts(db,{source:'XRPL_NATIVE_SUPPLY',reservation_id,attempts:1,daily_cap:24,now});if(!admission.allowed)return{status:admission.status,evidence:[],network_calls:0,admission};
 const parent=await reserveEvidenceSourceAttempts(db,{source:SOURCE,reservation_id:reservation_id+':PARENT',attempts:1,daily_cap:SOURCE_POLICIES[SOURCE].daily_cap,now});if(!parent.allowed)return{status:parent.status,evidence:[],network_calls:0,admission:parent};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let payload=null,http_status=null,error=null;
 try{const r=await fetch_impl(URL,{method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'My-Report-2/native-payments-v1'},redirect:'error',signal:controller.signal,body:JSON.stringify({method:'ledger',params:[{ledger_hash:proof.current_payload.result.ledger_hash,transactions:true,expand:true,api_version:2}]})});http_status=r.status;const body=await r.text();if(Buffer.byteLength(body)>512*1024)error='RESPONSE_TOO_LARGE';else if(!r.ok)error=`HTTP_${r.status}`;else try{payload=JSON.parse(body);}catch{error='SOURCE_SCHEMA_ERROR';}}
 catch(e){error=e?.name==='AbortError'?'TIMEOUT':String(e?.message||e).slice(0,160);}finally{clearTimeout(timer);}
 const observed=clock(),normalized=error?{status:'SOURCE_ERROR',evidence:[],internal_only:true}:normalizeXrplNativePayments({contract,identity:asset_identity,ledger_payload:payload,supply_pair_proof:proof,observed_ts:observed}),result={version:XRPL_PAYMENTS_VERSION,...normalized,network_calls:1,whole_job_admission,admission,receipts:[{route:'XRPL_EXACT_VALIDATED_LEDGER_PAYMENTS',status:normalized.status.startsWith('CLOSED')?'CLOSED':'SOURCE_ERROR',http_status,error:error||normalized.status}],internal_only:true};
 const expires=normalized.status.startsWith('CLOSED')?proof.current_payload.result.ledger.close_time*1000+946684800000+TTL:observed+30*60_000;
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:observed,expires_ts:expires,payload:result});return result;
}
