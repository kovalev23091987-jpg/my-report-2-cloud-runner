import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import * as guard from '../runner/d1-preaction-budget-guard.mjs';
import {encodeCanonicalPublicationRow,decodeCanonicalPublicationRow,retainCanonicalPublicationRow,readCanonicalPublicationArchive} from '../runner/canonical-cold-archive.mjs';
import {PrivateArchiveD1API,combineMeasuredD1Usage} from '../runner/private-archive-d1-api.mjs';
const repo='kovalev23091987-jpg/my-report-2-cloud-runner',reservation={rows_read:5000,rows_written:32};
const publications=['PUB:6b3554505482fa8bc5d52a8c386dfa5605b151b4'];
for(const k of ['GITHUB_TOKEN','GITHUB_RUN_ID','GITHUB_SHA','REPORT2_EXPECTED_MAIN','REPORT2_EXPECTED_LEASE_OWNER','REPORT2_D1_BRIDGE_URL','REPORT2_D1_BRIDGE_TOKEN'])if(!process.env[k])throw Error(k+'_REQUIRED');
if(process.env.GITHUB_REPOSITORY!==repo)throw Error('EXACT_REPOSITORY_REQUIRED');
const api=async path=>{const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('GITHUB_CONTROL_READ_'+r.status);return r.json();};
const main=(await api('git/ref/heads/main')).object.sha;if(main!==process.env.REPORT2_EXPECTED_MAIN||main!==process.env.GITHUB_SHA)throw Error('MAIN_MOVED');
const read=async path=>JSON.parse(Buffer.from((await api('contents/'+path+'?ref='+main)).content,'base64').toString());
const [phase,fence]=await Promise.all([read('checkpoints/CLOUD_PHASE_STATE_20261004.json'),read('audit-fixes/source-optimization-20260930/execution-lock.json')]);
if(phase.lease?.owner!==process.env.REPORT2_EXPECTED_LEASE_OWNER||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),now=Date.now(),id='CANONICAL_COMPRESSION:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT;
const retainPrivate=process.argv.includes('--retain-private'),archive=retainPrivate?new PrivateArchiveD1API({token:process.env.CLOUDFLARE_API_TOKEN}):null;
const usage=()=>combineMeasuredD1Usage(db.usageSnapshot(),...(archive?[archive.usageSnapshot()]:[]));
const out={schema:'REPORT2_PRIVATE_CANONICAL_COMPRESSION_VALIDATION_V1',head:main,cloud_run:process.env.GITHUB_RUN_ID,source_run_id:'1791912429923-1791912455480',status:'NOT_ADMITTED',D1_reservation:reservation,sourceHTTP:0,MAIN:0,Telegram:0,main_rows_modified:0,private_payload_exported:false,records:[],automatic_writer_activated:false,private_retention_pilot:retainPrivate};let admitted=false;
await fs.mkdir('audit-output/canonical-compression',{recursive:true});
try{
 if(archive)out.private_database=await archive.verifyDatabase();
 out.daily_admission=guard.evaluateDailyReservationBudget({daily:await guard.loadDailyUsageAggregate(db,now),nextReservation:reservation});if(!out.daily_admission.allowed)throw Error('D1_DAY_HEADROOM_DENIED');
 await guard.reserveRunBudget(db,{reservationId:id,now,reservation});admitted=true;
 if(archive){await archive.query(await fs.readFile('cloudflare/free-history/003_canonical_cold_archive.sql','utf8'));await archive.query('SELECT 1 AS size_marker');}
 for(const publication of publications){
  if(!guard.evaluateWithinRunReservation({reservation,currentUsage:usage(),extraRowsRead:4,extraRowsWritten:1}).allowed)throw Error('D1_RUN_HEADROOM_DENIED');
  const row=await db.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 AND run_id=?2 LIMIT 1').bind(publication,out.source_run_id).first();if(!row)throw Error('ORIGINAL_PUBLICATION_MISSING');
  const record=encodeCanonicalPublicationRow(row),decoded=decodeCanonicalPublicationRow(record);if(JSON.stringify(row)!==JSON.stringify(decoded))throw Error('ORIGINAL_ROW_READBACK_MISMATCH');
  const {payload_gzip_base64,...manifest}=record;out.records.push({...manifest,full_original_source_row:true,exact_original_bytes_verified:true,source_clocks_refreshed:false,ratio:record.gzip_bytes/record.raw_bytes});
  if(archive){
   const db_admit=e=>guard.evaluateWithinRunReservation({reservation,currentUsage:usage(),extraRowsRead:e.rows_read,extraRowsWritten:e.rows_written+1});
   const stored=await retainCanonicalPublicationRow(archive,record,{db_admit,storage_bytes:archive.storage_bytes});if(!stored.retained)throw Error(stored.status);
   const restored=await readCanonicalPublicationArchive(archive,{publication_id:record.publication_id,raw_sha256:record.raw_sha256,db_admit});if(JSON.stringify(restored.row)!==JSON.stringify(row))throw Error('DURABLE_PRIVATE_ORIGINAL_ROW_MISMATCH');out.records.at(-1).durable_private_receipt=stored;out.records.at(-1).private_reader_verified=true;
  }
 }
 out.status='EXACT_FULL_ORIGINAL_ROW_COMPRESSION_VERIFIED_PRIVATE_PAYLOAD_NOT_EXPORTED';
 if(archive)out.status='DURABLE_PRIVATE_FULL_ORIGINAL_ROW_AND_READER_VERIFIED_NO_MAIN_DELETION';
}catch(e){out.status='VALIDATION_NOT_CLOSED';out.reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;}
finally{
 if(admitted)out.finalized_usage=await guard.finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:usage()});out.D1=usage();if(archive)out.private_archive_D1=archive.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written)out.status='D1_ENVELOPE_NOT_CLOSED';
 out.completed_ts=Date.now();await fs.writeFile('audit-output/canonical-compression/validation.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,records:out.records.length,D1:out.D1}));
}
