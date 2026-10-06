import {createProviderReferenceReader} from './provider-reference-cache.mjs';

export const GATE_ASSET_BINDING_VERSION='gate-official-asset-binding-v1-20261006';
const TTL=6*60*60*1000;
const normalize=(chain,a)=>chain==='ethereum'&&/^0x[0-9a-fA-F]{40}$/.test(a||'')?a.toLowerCase():chain==='solana'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a||'')?a:null;
const gateChain=c=>c==='ETH'?'ethereum':c==='SOL'?'solana':null;

// This is static asset identity, never a quote clock or a new provider vote.
export function verifyGateOfficialBinding({contract,htx_reference,rows,receipt,now}={}){
 const fail=reason=>({version:GATE_ASSET_BINDING_VERSION,status:'NOT_CLOSED',reason,contract,verified:false});
 if(!/^[A-Z0-9][A-Z0-9]{0,31}-USDT$/.test(contract||''))return fail('EXACT_SAFE_CONTRACT_REQUIRED');
 const h=htx_reference,chain=h?.identity?.chain,address=normalize(chain,h?.identity?.contract_or_mint);
 if(h?.status!=='CLOSED'||h?.contract!==contract||h?.currency!==contract.slice(0,-5)||h?.identity_method!=='HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS'||!address||h?.receipt?.endpoint!=='https://api.huobi.pro/v2/reference/currencies'||!Number.isSafeInteger(h.reference_observed_ts)||h.reference_observed_ts>now||now-h.reference_observed_ts>86400000||!/^[a-f0-9]{64}$/.test(h.receipt.parsed_payload_sha256||''))return fail('OFFICIAL_HTX_EXACT_TOKEN_REFERENCE_REQUIRED');
 const url=`https://api.gateio.ws/api/v4/wallet/currency_chains?currency=${contract.slice(0,-5)}`;
 if(receipt?.url!==url||receipt.http_status!==200||!Number.isSafeInteger(receipt.received_ts)||receipt.received_ts>now||now-receipt.received_ts>=TTL||!/^[a-f0-9]{64}$/.test(receipt.body_sha256||''))return fail('GATE_REFERENCE_CLOCK_OR_PROVENANCE_NOT_CLOSED');
 if(!Array.isArray(rows)||rows.length>100)return fail('GATE_CHAIN_ROWS_NOT_CLOSED');
 const comparable=rows.filter(r=>gateChain(r?.chain)===chain);
 if(!comparable.length)return fail('SUPPORTED_CHAIN_ADDRESS_NOT_PROVIDED');
 const addresses=comparable.map(r=>normalize(chain,r.contract_address));
 if(addresses.some(a=>!a))return fail('GATE_CHAIN_ADDRESS_NOT_EXACT');
 const distinct=new Set(addresses);
 if(distinct.size!==1)return fail('AMBIGUOUS_GATE_CHAIN_ADDRESSES');
 if(!distinct.has(address))return fail('HTX_GATE_ADDRESS_MISMATCH');
 return{version:GATE_ASSET_BINDING_VERSION,status:'CLOSED',verified:true,contract,venue:'GATE',method:'HTX_GATE_OFFICIAL_SAME_CHAIN_ADDRESS',chain,contract_or_mint:address,known_ts:Math.max(h.reference_observed_ts,receipt.received_ts),expires_ts:Math.min(h.reference_observed_ts+86400000,receipt.received_ts+TTL),htx_reference:{...h.receipt,reference_observed_ts:h.reference_observed_ts},gate_reference:{url,http_status:200,received_ts:receipt.received_ts,body_sha256:receipt.body_sha256},reference_kind:'STATIC_ASSET_BINDING_ONLY',independent_origin:'GATE_OFFICIAL',market_clocks_refreshed:false};
}

export function promoteGateBoundEvidence({contract,public_evidence,binding,now}={}){
 if(binding?.verified!==true||binding.contract!==contract||binding.venue!=='GATE'||binding.known_ts>now||now>=binding.expires_ts)return public_evidence;
 const base=contract.slice(0,-5),instrument=`${base}_USDT:GATE:USDT_PERP`;
 let promoted=0;
 const evidence=(public_evidence?.evidence||[]).map(row=>{
  if(row?.contract_code!==contract||row.venue!=='GATE'||row.primary_market_id!==instrument||row.market_type!=='USDT_PERP'||row.alias_required!==true||row.alias_verified!==true||row.symbol_verified!==true||row.venue_observation_status!=='CLOSED'||row.source_compatible===false||row.error||row.asset_identity_verified===true)return row;
  if(!Number.isSafeInteger(row.source_ts)||row.source_ts>now||!Number.isSafeInteger(row.observed_ts)||row.observed_ts>now||!Number.isFinite(row.max_age_sec)||row.max_age_sec<=0||now-row.source_ts>row.max_age_sec*1000)return row;
  promoted++;
  return{...row,status:'CLOSED',eligible_for_chain_closure:true,asset_identity_verified:true,alias_verification_scope:binding.method,asset_identity_binding:binding,note:[row.note,`asset_identity=${binding.method}`].filter(Boolean).join('; ')};
 });
 return{...public_evidence,evidence,gate_asset_binding:{...binding,promoted_metric_rows:promoted}};
}

export async function bindGateOfficialAssetIdentity({db,fetch_impl=globalThis.fetch,request_admit,db_admit,contract,run_id,public_evidence,supplemental_context,now=Date.now(),clock=()=>Date.now()}={}){
 const result=(reason,binding=null,summary={network_calls:0})=>({status:binding?.status||'NOT_CLOSED',reason,public_evidence:binding?promoteGateBoundEvidence({contract,public_evidence,binding,now:clock()}):public_evidence,binding,...summary,available_ts:binding?.known_ts||null});
 const h=supplemental_context?.asset_reference;
 if(!/^[A-Z0-9][A-Z0-9]{0,31}-USDT$/.test(contract||'')||h?.status!=='CLOSED'||h.identity_method!=='HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS'||!normalize(h.identity?.chain,h.identity?.contract_or_mint)||h.contract!==contract||h.currency!==contract.slice(0,-5)||h.receipt?.endpoint!=='https://api.huobi.pro/v2/reference/currencies'||!Number.isSafeInteger(h.reference_observed_ts)||h.reference_observed_ts>now||now-h.reference_observed_ts>86400000||!/^[a-f0-9]{64}$/.test(h.receipt.parsed_payload_sha256||''))return result('OFFICIAL_HTX_EXACT_TOKEN_REFERENCE_REQUIRED');
 const rows=(public_evidence?.evidence||[]).filter(r=>r.venue==='GATE'&&r.contract_code===contract&&r.asset_identity_verified!==true&&r.alias_verified===true&&r.venue_observation_status==='CLOSED'&&r.source_compatible!==false&&!r.error&&Number.isSafeInteger(r.source_ts)&&now-r.source_ts<=r.max_age_sec*1000);
 if(!rows.length)return result('NO_USABLE_GATE_METRIC_REQUIRING_BINDING');
 if(db_admit?.({rows_read:150,rows_written:16})?.allowed!==true)return result('D1_BINDING_ADMISSION_NOT_CLOSED');
 const reader=createProviderReferenceReader({db,source:'GATE_ASSET_REFERENCE',run_id,request_admit,fetch_impl,now,clock,daily_cap:8,minute_provider:'GATE',minute_cap:4});
 const url=`https://api.gateio.ws/api/v4/wallet/currency_chains?currency=${contract.slice(0,-5)}`;
 const payload=await reader.get('GATE_OFFICIAL_CHAIN_ADDRESS',url,{ttl_ms:TTL,max_bytes:65536,shape:p=>Array.isArray(p)&&p.length<=100});
 const summary=reader.summary();
 if(!payload)return result(summary.admission?.allowed===false?summary.admission.status:summary.provider_backoff?.status||'GATE_REFERENCE_UNAVAILABLE',null,summary);
 const receipt=summary.receipts.at(-1),binding=verifyGateOfficialBinding({contract,htx_reference:h,rows:payload,receipt,now:clock()});
 return result(binding.reason||null,binding,summary);
}
