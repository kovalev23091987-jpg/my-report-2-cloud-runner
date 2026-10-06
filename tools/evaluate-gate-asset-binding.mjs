import fs from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts} from '../runtime/src/evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../runtime/src/provider-minute-ledger.mjs';
const now=Date.now(),db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const id='GATE_STATIC_IDENTITY:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const out={schema:'report2-general-gate-static-identity-evaluation-v1',head:process.env.GITHUB_SHA,started_ts:now,sourceHTTP:0,maximum_sourceHTTP:1,MAIN:0,Telegram:0,Nansen:0,production_enabled:false,not_fresh_joint_acceptance:true};
const exact=JSON.parse(gunzipSync(await fs.readFile('original-source/exact-current-data.json.gz')));
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
const contracts=new Set();function walk(v){if(typeof v==='string'&&/^[^-\\s]{1,32}-USDT$/u.test(v))contracts.add(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);}walk(universe);
const candidates=exact.rows.filter(r=>contracts.has(r.contract_code)&&/^[A-Z0-9]{1,32}-USDT$/.test(r.contract_code)&&r.canonical?.metadata?.internal_market_context?.candidate_context?.asset_reference?.identity_method==='HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS'&&['ethereum','solana'].includes(r.canonical.metadata.internal_market_context.candidate_context.asset_reference.identity?.chain)).sort((a,b)=>a.contract_code.localeCompare(b.contract_code));
if(!candidates.length)throw Error('EXACT_EXISTING_UNIVERSE_OFFICIAL_TOKEN_REFERENCE_REQUIRED');
const selected=candidates[0],ref=selected.canonical.metadata.internal_market_context.candidate_context.asset_reference,base=selected.contract_code.slice(0,-5);
if(ref.status!=='CLOSED'||ref.contract!==selected.contract_code||ref.currency!==base||!Number.isSafeInteger(ref.reference_observed_ts)||ref.reference_observed_ts>now||now-ref.reference_observed_ts>86400000||!/^https:\/\/api.huobi.pro\/v2\/reference\/currencies$/.test(ref.receipt?.endpoint||'')||!/^([a-f0-9]{64})$/.test(ref.receipt?.parsed_payload_sha256||''))throw Error('HTX_REFERENCE_CLOCK_OR_RECEIPT_NOT_CLOSED');
out.selection={contract:selected.contract_code,basis:'FIRST_SORTED_RETAINED_ACTUAL_CANDIDATE_WITH_OFFICIAL_HTX_TOKEN_ADDRESS_IN_EXISTING_CRYPTO_UNIVERSE; NO_ADAPTER_COIN_CONFIG',source_cloud_run:exact.source_cloud_run,original_snapshot_id:selected.snapshot_id,official_htx_reference:ref};
out.admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:2500,rows_written:64},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:2500,rows_written:64}});
 try{
  await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);
  out.daily_source_admission=await reserveEvidenceSourceAttempts(db,{source:'GATE_ASSET_REFERENCE',reservation_id:id+':HTTP1',attempts:1,daily_cap:8,now});
  if(!out.daily_source_admission.allowed)throw Error('DAILY_SOURCE_ADMISSION_DENIED');
  out.provider_admission=await reserveProviderMinuteUnits(db,{provider:'GATE',reservation_id:id+':HTTP1',units:1,now,cap:4});
  if(!out.provider_admission.allowed)throw Error('PROVIDER_MINUTE_ADMISSION_DENIED');
  if(db.usageSnapshot().unknown_ops||db.usageSnapshot().rows_read>2200||db.usageSnapshot().rows_written>56)throw Error('D1_HEADROOM_NOT_CLOSED');
  const url='https://api.gateio.ws/api/v4/wallet/currency_chains?currency='+encodeURIComponent(base);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let response,body;
  out.sourceHTTP=1;
  try{response=await fetch(url,{headers:{accept:'application/json'},redirect:'error',signal:controller.signal});body=await response.text();}finally{clearTimeout(timer);}
  const received_ts=Date.now();out.transport={url,http_status:response.status,received_ts,body_sha256:createHash('sha256').update(body).digest('hex'),reference_kind:'STATIC_ASSET_BINDING_ONLY',not_a_live_market_clock:true};
  if(body.length>64000)throw Error('STATIC_REFERENCE_BODY_EXCEEDS_BOUND');
  await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/actual-gate-currency-chains.json.gz',gzipSync(Buffer.from(body),{mtime:0}));
  if(!response.ok){out.status='SOURCE_ACCESS_OR_HTTP_ERROR';out.reason='HTTP_'+response.status;}
  else{
   let rows;try{rows=JSON.parse(body);}catch{throw Error('SOURCE_JSON_NOT_CLOSED');}
   if(!Array.isArray(rows))throw Error('SOURCE_ARRAY_REQUIRED');
   const chainOf=r=>r.chain==='ETH'?'ethereum':r.chain==='SOL'?'solana':null;
   const all=rows.filter(r=>chainOf(r)===ref.identity.chain&&typeof r.contract_address==='string'&&r.contract_address);
   const normalize=a=>ref.identity.chain==='ethereum'?a.toLowerCase():a;
   const exactMatch=all.filter(r=>normalize(r.contract_address)===normalize(ref.identity.contract_or_mint));
   const addresses=new Set(all.map(r=>normalize(r.contract_address)));
   out.chain_rows=rows.length;out.comparable_address_count=addresses.size;out.exact_matches=exactMatch;
   out.identity_binding_usable=addresses.size===1&&exactMatch.length>0;
   out.status=out.identity_binding_usable?'ACTUAL_OFFICIAL_SAME_CHAIN_ADDRESS_BINDING_CLOSED_NOT_JOINT_USE':'OFFICIAL_GATE_ADDRESS_MATCH_NOT_CLOSED';
   out.reason=out.identity_binding_usable?null:!all.length?'SUPPORTED_CHAIN_ADDRESS_NOT_PROVIDED':addresses.size>1?'AMBIGUOUS_GATE_CHAIN_ADDRESSES':'HTX_GATE_ADDRESS_MISMATCH';
   out.binding_known_after_original_decision=received_ts>selected.canonical.observed_ts;
   out.original_canonical_not_promoted=true;out.market_metric_source_clocks_not_refreshed=true;
  }
 }catch(error){out.status='EVALUATION_NOT_CLOSED';out.error=String(error.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.completed_ts=Date.now();out.d1_usage=db.usageSnapshot();
await fs.mkdir('audit-output',{recursive:true});await fs.writeFile('audit-output/gate-identity-source-proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out));
