import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {registerVerifiedNativeDayProof} from './native-day-reconciliation-tokens.mjs';

const GENERATION='MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M';
const ACCOUNT='70ee0af85191ea470e74c7383fdec772',DATABASE='057a2847-2cc4-4e52-8534-1be1596d21d5';
const POINTER='checkpoints/LATEST_VERIFIED_D1_AGGREGATE_RECONCILIATION.json';
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const hash=x=>createHash('sha256').update(x).digest('hex');
const requireFact=(condition,message)=>{if(!condition)throw Error(message);};
const stamp=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)?Date.parse(x):NaN;
const day=x=>new Date(x).toISOString().slice(0,10);
const queryFor=(from,to)=>`{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){d1AnalyticsAdaptiveGroups(limit:16,filter:{databaseId:"${DATABASE}",datetime_geq:"${from}",datetime_leq:"${to}"}){sum{rowsRead rowsWritten readQueries writeQueries} avg{sampleInterval} dimensions{datetimeMinute databaseId}}}}}`;
function checkpoint(root,relative){
 requireFact(typeof relative==='string'&&relative.startsWith('checkpoints/')&&!relative.includes('\\'),'BOUNDED_CHECKPOINT_REQUIRED');
 const base=path.resolve(root,'checkpoints')+path.sep,target=path.resolve(root,relative),realBase=fs.realpathSync(path.resolve(root,'checkpoints'))+path.sep;
 requireFact(target.startsWith(base)&&fs.realpathSync(target).startsWith(realBase),'BOUNDED_CHECKPOINT_REQUIRED');return target;
}
function bytes(root,d,max=2*1024*1024){
 requireFact(/^[a-f0-9]{64}$/.test(d?.sha256||''),'EXACT_FILE_DIGEST_REQUIRED');
 const b=fs.readFileSync(checkpoint(root,d.path));requireFact(b.length<=max&&hash(b)===d.sha256,'EXACT_FILE_DIGEST_REQUIRED');return b;
}
const json=(root,d)=>JSON.parse(bytes(root,d));
function nativeObservation(o,m,now){
 const observed=stamp(o?.observed_at),start=stamp(m.interval.from),end=stamp(m.interval.to),r=o?.response;
 requireFact(o?.schema==='REPORT2_UTC18_NATIVE_INTERVAL_BILLING_ANALYTICS_V1'&&o.control_HTTP===1&&o.native_SQL===0&&o.query===queryFor(m.interval.from,m.interval.to),'EXACT_NATIVE_BILLING_QUERY_REQUIRED');
 requireFact(Number.isFinite(observed)&&observed>=end+3600000&&observed<=now&&r?.success===true&&r.status===200&&Array.isArray(r.errors)&&r.errors.length===0&&Array.isArray(r.messages)&&r.messages.length===0,'CLOSED_NATIVE_BILLING_REPLY_REQUIRED');
 const accounts=r.result?.viewer?.accounts;requireFact(Array.isArray(accounts)&&accounts.length===1,'EXACT_NATIVE_ACCOUNT_REQUIRED');
 const groups=accounts[0].d1AnalyticsAdaptiveGroups;requireFact(Array.isArray(groups)&&groups.length>0&&groups.length<16,'COMPLETE_NATIVE_INTERVAL_REQUIRED');
 const expected=[];for(let t=Math.floor(start/60000)*60000;t<=Math.floor(end/60000)*60000;t+=60000)expected.push(new Date(t).toISOString().replace('.000Z','Z'));
 const seen=new Set(),sum={rowsRead:0,rowsWritten:0,readQueries:0,writeQueries:0};
 for(const g of groups){
  const minute=g?.dimensions?.datetimeMinute;
  requireFact(g?.dimensions?.databaseId===DATABASE&&expected.includes(minute)&&!seen.has(minute)&&g?.avg?.sampleInterval===1,'UNSAMPLED_EXACT_DATABASE_MINUTES_REQUIRED');seen.add(minute);
  for(const k of Object.keys(sum)){requireFact(integer(g?.sum?.[k]),'MEASURED_NATIVE_TOTAL_REQUIRED');sum[k]+=g.sum[k];requireFact(integer(sum[k]),'SAFE_NATIVE_TOTAL_REQUIRED');}
 }
 requireFact(seen.size===expected.length,'COMPLETE_NATIVE_INTERVAL_REQUIRED');return{observed,sum,groups:[...groups].sort((a,b)=>a.dimensions.datetimeMinute.localeCompare(b.dimensions.datetimeMinute))};
}

// This closes only aggregate billable cost for one historical failed run.
// Original per-statement unknowns and every reservation stay unchanged.
// Sampled query insights, a zero-change ACK or an operator flag cannot qualify.
export function loadVerifiedNativeDayReconciliation({root='.',now_ts=Date.now(),generation}={}){
 try{
  requireFact(integer(now_ts)&&generation===GENERATION,'CURRENT_GENERATION_AND_CLOCK_REQUIRED');root=path.resolve(root);
  const pointerBytes=fs.readFileSync(checkpoint(root,POINTER));requireFact(pointerBytes.length<=65536,'BOUNDED_POINTER_REQUIRED');
  const pointer=JSON.parse(pointerBytes);requireFact(pointer.schema==='VERIFIED_D1_AGGREGATE_RECONCILIATION_POINTER_V1','EXACT_RECONCILIATION_POINTER_REQUIRED');
  const m=json(root,pointer.manifest),source=m.source;
  requireFact(m.schema==='VERIFIED_D1_AGGREGATE_RECONCILIATION_V1'&&m.generation===GENERATION&&m.account_id===ACCOUNT&&m.database_id===DATABASE&&m.day_utc===day(now_ts),'CURRENT_BOUND_NATIVE_RECONCILIATION_REQUIRED');
  const begin=stamp(m.interval?.from),end=stamp(m.interval?.to);
  requireFact(Number.isFinite(begin)&&Number.isFinite(end)&&begin<end&&end-begin<=120000&&day(begin)===m.day_utc&&day(end)===m.day_utc,'BOUNDED_SAME_DAY_INTERVAL_REQUIRED');
  const metadata=json(root,m.files.run_metadata),artifacts=json(root,m.files.artifact_metadata),jobs=json(root,m.files.jobs_metadata);
  requireFact(integer(source?.run_id)&&source.run_id>0&&metadata.id===source.run_id&&metadata.head_sha===source.head&&/^[a-f0-9]{40}$/.test(source.head)&&metadata.conclusion==='failure','EXACT_FAILED_RUN_BINDING_REQUIRED');
  requireFact(stamp(metadata.run_started_at)<=begin&&stamp(metadata.updated_at)>=end-60000,'SOURCE_RUN_INTERVAL_REQUIRED');
  const job=jobs.jobs?.find(x=>x.name==='run-report2'&&x.run_id===source.run_id),steps=job?.steps?.filter(x=>x.name==='Full Report 2 cycle');
  requireFact(steps?.length===1&&steps[0].conclusion==='failure'&&stamp(steps[0].started_at)>=begin&&stamp(steps[0].completed_at)+1000<=end,'COMPLETE_RUNNER_STEP_INTERVAL_REQUIRED');
  const artifact=artifacts.artifacts?.find(x=>x.id===source.artifact_id);
  requireFact(artifact?.name==='report2-run-result'&&artifact.digest==='sha256:'+m.files.source_archive.sha256&&artifact.workflow_run?.id===source.run_id&&artifact.workflow_run?.head_sha===source.head,'EXACT_IMMUTABLE_SOURCE_ARTIFACT_REQUIRED');
  const archive=bytes(root,m.files.source_archive,4*1024*1024);
  const raw=execFileSync('unzip',['-p',checkpoint(root,m.files.source_archive.path),'report2-failure-accounting.json'],{maxBuffer:512*1024});
  requireFact(hash(raw)===source.usage_sha256&&archive.length===artifact.size_in_bytes,'EXACT_ORIGINAL_USAGE_REQUIRED');
  const f=JSON.parse(raw),before=f.usage_before,after=f.usage_after,r=f.receipt;
  requireFact(f.status==='FAILED_RUN_NATIVE_USAGE_FINALIZED'&&f.reservation_never_reduced===true&&f.new_SQL_attempts===1&&r?.status==='FINALIZED'&&r.source_run_id===String(source.run_id)&&f.reservation_id===source.reservation_id&&r.reservation_id===source.reservation_id&&/^R2RUN:\d{13}:[a-f0-9]{16}$/.test(source.reservation_id),'EXACT_FAILED_FINALIZATION_REQUIRED');
  requireFact(['requests','rows_read','rows_written','unknown_ops'].every(k=>integer(before?.[k])&&integer(after?.[k]))&&after.unknown_ops>0&&after.unknown_ops===before.unknown_ops&&f.unknown_ops_preserved===after.unknown_ops&&r.unknown_ops===after.unknown_ops,'ORIGINAL_UNKNOWN_COUNTS_PRESERVED_REQUIRED');
  requireFact(after.requests===before.requests+1&&after.rows_read===before.rows_read+1&&after.rows_written===before.rows_written+1&&r.measured_rows_read===before.rows_read&&r.measured_rows_written_accounted===after.rows_written&&r.measured_requests_accounted===after.requests&&r.finalization_read_padding===1&&r.reservation_never_reduced===true,'MEASURED_FINALIZATION_DELTA_REQUIRED');
  const a=nativeObservation(json(root,m.files.billing1),m,now_ts),b=nativeObservation(json(root,m.files.billing2),m,now_ts);
  requireFact(b.observed-a.observed>=60000&&JSON.stringify(a.groups)===JSON.stringify(b.groups),'STABLE_INDEPENDENT_NATIVE_OBSERVATIONS_REQUIRED');
  requireFact(a.sum.rowsRead===after.rows_read&&a.sum.rowsWritten===after.rows_written&&a.sum.readQueries+a.sum.writeQueries===after.requests-after.unknown_ops,'NATIVE_INTERVAL_MUST_EQUAL_ALL_KNOWN_COSTS_AND_COUNTS');
  const started=Number(source.reservation_id.split(':')[1]);requireFact(started>=stamp(steps[0].started_at)&&started<stamp(steps[0].completed_at)+1000,'ORIGINAL_RESERVATION_CLOCK_REQUIRED');
  const handle=Object.freeze({schema:'VERIFIED_NATIVE_DAY_PROOF_HANDLE_V1',day_utc:m.day_utc,reservation_id:source.reservation_id,source_run_id:String(source.run_id),manifest_sha256:pointer.manifest.sha256,historical_unknown_operations:after.unknown_ops,aggregate_billable_rows_read:a.sum.rowsRead,aggregate_billable_rows_written:a.sum.rowsWritten,per_statement_counters_reconstructed:false});
  return registerVerifiedNativeDayProof(handle,{source,receipt:r,after,started,begin,end,expected_reserve:m.original_reservation});
 }catch{return null;}
}

