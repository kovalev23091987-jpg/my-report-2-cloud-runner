import {createHash} from 'node:crypto';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from './d1-preaction-budget-guard.mjs';
import {evidenceSourceAttemptHeadroom,reserveEvidenceSourceAttempts,nativeSourceUsageUnclosed} from '../current-generation/files/src/evidence-source-store.mjs';
import {reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {TWO_NODE_HTTP_LIMITS} from '../current-generation/files/src/two-candidate-policy.mjs';
import {canonicalFingerprint} from '../current-generation/files/src/canonical-publication.mjs';
import {formatTelegramCompact} from '../current-generation/files/src/telegram-compact-formatter.mjs';
export const RECOVERY_DIAGNOSIS=Object.freeze({source_run:'39122290584',run_id:'1792321965799-1792321975225',contracts:['CT-USDT','BR-USDT'],missing:['BTR-USDT','DOS-USDT','GPS-USDT','PIPPIN-USDT','SKR-USDT','UB-USDT'],source:'HTX_PUBLIC_RISK',daily_cap:144,minute_cap:6,url:'https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',reservation:{rows_read:4000,rows_written:160},next_full:{rows_read:59000,rows_written:920}});
const hash=b=>createHash('sha256').update(b).digest('hex');
export function describeMissingCatalog(payload,{received_ts,classify}={}){
 if(payload?.status!=='ok'||!Number.isSafeInteger(payload.ts)||payload.ts>received_ts||received_ts-payload.ts>120000||!Array.isArray(payload.data))throw Error('FRESH_OFFICIAL_CATALOG_REQUIRED');
 return RECOVERY_DIAGNOSIS.missing.map(contract=>{const rows=payload.data.filter(x=>x?.contract_code===contract);return{contract,raw_rows:rows,reason:rows.length===0?'ABSENT_FROM_CURRENT_DEFAULT_CATALOG':rows.length!==1?'DUPLICATE_NATIVE_CATALOG_ROW':Number(rows[0].contract_status)!==1?'NATIVE_CONTRACT_NOT_ACTIVE':String(rows[0].business_type||'swap').toLowerCase()!=='swap'?'NATIVE_NOT_SWAP':classify(rows[0])?.classification!=='CRYPTO_CONFIRMED'?'CURRENT_CLASSIFIER_NOT_CONFIRMED':'ACTIVE_EXACT_CRYPTO_PRESENT',classification:rows.length===1?classify(rows[0]):null};});
}
// Exactly one separately admitted catalog observation plus existing canonical
// rows. No full analysis, expiry, schema creation, scope change or delivery.
export async function runExactRecoveryDiagnosis({db,guard,source_run_id,clock=Date.now,fetch_impl=globalThis.fetch,reconciliation=null,classify,retain=async()=>{}}={}){
 const policy=RECOVERY_DIAGNOSIS,started=clock(),id=`EXACT_RECOVERY_DIAG:${policy.source_run}:${source_run_id}`,sourceId=`HTX_MISSING_SIX_DIAG:${policy.source_run}`,budget=createUnifiedHttpBudget(TWO_NODE_HTTP_LIMITS);
 const out={schema:'EXACT_RECOVERY_OBSTACLE_DIAGNOSIS_V1',source_run:policy.source_run,run_id:policy.run_id,started_ts:started,sourceHTTP:0,MAIN:0,Telegram:0,scope_changed:false,reservations_refunded:false,source_clocks_refreshed:false,canonical_rows:[],status:'NOT_CLOSED'};let reserved=false;
 const room=()=>{const u=db.usageSnapshot();if(nativeSourceUsageUnclosed(db)||u.requests>=31||!evaluateWithinRunReservation({reservation:policy.reservation,currentUsage:u,extraRowsRead:100,extraRowsWritten:8}).allowed)throw Error('CURRENT_NATIVE_COST_OR_HEADROOM_NOT_CLOSED');};
 try{
  await guard('before_admission');
  const daily=await loadDailyUsageAggregate(db,started,{reconciliation});
  out.admission=evaluateDailyReservationBudget({daily,nextReservation:{rows_read:policy.reservation.rows_read+policy.next_full.rows_read,rows_written:policy.reservation.rows_written+policy.next_full.rows_written},maxDailyReads:3500000,maxDailyWrites:70000});
  if(!out.admission.allowed||nativeSourceUsageUnclosed(db))throw Error('ACTUAL_DAY_ADMISSION_DENIED');
  await guard('before_reservation');reserved=true;await reserveRunBudget(db,{reservationId:id,now:started,reservation:policy.reservation});room();
  // Fixed source identity prevents a second acquisition for this known failure.
  const prior=await db.prepare('SELECT source,attempts FROM report2_evidence_source_reservation WHERE reservation_id=?1').bind(sourceId).first();room();if(prior)throw Error('EXACT_SOURCE_DIAGNOSIS_ALREADY_SPENT');
  for(const contract of policy.contracts){
   room();const rows=await db.prepare('SELECT publication_id,contract_code,run_id,snapshot_id,observed_ts,analytical_fingerprint,canonical_json FROM canonical_publication_shadow INDEXED BY idx_canonical_publication_identity WHERE contract_code=?1 AND run_id=?2 LIMIT 2').bind(contract,policy.run_id).all();room();
   if(rows?.results?.length!==1)throw Error('EXACT_PERSISTED_CANONICAL_REQUIRED:'+contract);const row=rows.results[0],canonical=JSON.parse(row.canonical_json);
   if(canonical.metadata?.contract!==contract||canonical.run_id!==policy.run_id||canonical.snapshot_id!==row.snapshot_id||canonical.observed_ts!==row.observed_ts||canonical.analytical_fingerprint!==row.analytical_fingerprint||canonicalFingerprint(canonical)!==row.analytical_fingerprint)throw Error('CANONICAL_IDENTITY_MISMATCH');
   await retain(contract+'.canonical.json',Buffer.from(row.canonical_json));
   const formatted=formatTelegramCompact(canonical,{facts:canonical.reasons||[]});out.canonical_rows.push({...row,canonical_json:undefined,canonical_json_sha256:hash(Buffer.from(row.canonical_json)),compact:formatted});
  }
  const headroom=await evidenceSourceAttemptHeadroom(db,{source:policy.source,attempts:1,daily_cap:policy.daily_cap,now:clock()});room();if(!headroom.allowed)throw Error('EXISTING_HTX_DAY_CAP_DENIED');
  const minute=await db.prepare('SELECT COALESCE(SUM(units),0) AS units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?2 AND created_ts<=?3').bind('HTX',clock()-60000,clock()).first();room();if(typeof minute?.units!=='number'||!Number.isSafeInteger(minute.units)||minute.units<0||minute.units+1>policy.minute_cap)throw Error('EXISTING_HTX_MINUTE_CAP_DENIED');
  const grant=budget.reserve({logical_request_id:sourceId,lane:'background',attempts:1});if(!grant.allowed||grant.duplicate)throw Error('WHOLE_HTTP_DENIED');
  await guard('before_source_reservations');out.source_admission=await reserveEvidenceSourceAttempts(db,{source:policy.source,reservation_id:sourceId,attempts:1,daily_cap:policy.daily_cap,now:clock()});room();if(!out.source_admission.allowed)throw Error('ATOMIC_SOURCE_DAY_DENIED');
  out.minute_admission=await reserveProviderMinuteUnits(db,{provider:'HTX',reservation_id:sourceId,units:1,cap:policy.minute_cap,now:clock()});room();if(!out.minute_admission.allowed)throw Error('ATOMIC_SOURCE_MINUTE_DENIED');
  await guard('before_one_catalog_HTTP');room();out.sourceHTTP++;
  const response=await fetch_impl(policy.url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)}),chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>8388608)throw Error('CATALOG_BODY_BOUND');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks),received_ts=clock();out.catalog={url:policy.url,http_status:response.status,received_ts,bytes:size,body_sha256:hash(bytes)};await retain('linear-default.json',bytes);
  if(response.status!==200)throw Error('CATALOG_HTTP_'+response.status);
  const payload=JSON.parse(bytes);out.catalog.source_ts=payload.ts;out.missing_catalog=describeMissingCatalog(payload,{received_ts,classify});await guard('after_observation');out.status='EXACT_CATALOG_AND_PERSISTED_PRESENTATIONS_READ';
 }catch(error){out.reason=String(error.message).slice(0,240);}
 finally{
  out.usage_before_finalization=db.usageSnapshot();
  if(reserved){try{out.finalization=await finalizeRunUsage(db,{reservationId:id,sourceRunId:source_run_id,usage:out.usage_before_finalization,now:clock()});}catch(error){out.status='FINALIZATION_NOT_CLOSED';out.finalization_error=String(error.message);}}
  out.D1=db.usageSnapshot();out.HTTP=budget.summary();out.full_report_completed=false;out.delivery_proven=false;
 }
 return out;
}
