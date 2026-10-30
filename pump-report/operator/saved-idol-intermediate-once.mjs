import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {OBSERVATION_BOUNDS,readSavedAutoObservation} from './saved-auto-observation.mjs';
import {readSavedOutcomeObservation} from './saved-outcome-observation.mjs';
import {readSavedCatalogSnapshot} from './saved-catalog-snapshot.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--describe'){
  console.log(JSON.stringify({schema:'PUMP_PRODUCTION_OBSERVER_PLAN_V1',status:'PREPARED_NOT_ADMITTED',bounds:OBSERVATION_BOUNDS,
    optional_saved_outcome_PK_reads:3,explicit_read_saved_outcome_admission_required:true,
    optional_latest_auto_candidate_PK_reads:1,explicit_read_latest_auto_candidate_admission_required:true,
    optional_catalog_snapshot_PK_reads:1,explicit_read_catalog_snapshot_admission_required:true,
    exact_admission_required:true,mode:'LOOKUP',old_CONTROL_and_startup_manual_not_used:true,positive_native_admission_before_SQL:true,
    writes:'Existing shared native reservation/finalization only; business state read-only',network_SQL_TG_executed:0}));
  process.exit(0);
}
if(args[0]!=='--execute'||args.length!==4)throw Error('USE --describe OR --execute ADMISSION ATTEMPT PRIVATE_RESULT');
const [admissionPath,attemptArg,resultArg]=args.slice(1),admission=JSON.parse(fs.readFileSync(admissionPath,'utf8')),now=Date.now();
if(admission.schema!=='PUMP_IDOL_INTERMEDIATE_SAVED_RUNS_ADMISSION_V1'||admission.status!=='ADMITTED_NOT_SPENT'||admission.maximum_attempts!==1||
  !/^[a-f0-9]{40}$/.test(admission.authority_main??'')||admission.fresh_all4_own_CAS_FULL_verified!==true||
  admission.provider_whole_native_admitted!==true||!Number.isSafeInteger(admission.expires_ts)||admission.expires_ts>now+900000||
  !Number.isSafeInteger(admission.own_lease?.acquired_ts)||!Number.isSafeInteger(admission.own_lease?.expires_ts)||
  admission.own_lease.expires_ts-admission.own_lease.acquired_ts>5400000||
  !/^[a-f0-9]{64}$/.test(admission.expected_recipient_sha256??'')||
  (admission.read_saved_outcome!==undefined&&typeof admission.read_saved_outcome!=='boolean')||
  (admission.read_latest_auto_candidate!==undefined&&typeof admission.read_latest_auto_candidate!=='boolean')||
  (admission.read_catalog_snapshot!==undefined&&typeof admission.read_catalog_snapshot!=='boolean')||
  !(now<admission.expires_ts&&admission.expires_ts<=admission.own_lease?.expires_ts&&admission.own_lease.acquired_ts<=now)||
  !/^[A-Za-z0-9:._-]{1,160}$/.test(admission.run_id??'')||admission.native_query_cap!==16||admission.market_HTTP!==0||admission.Telegram!==0)throw Error('POSITIVE_EXACT_OBSERVATION_ADMISSION_REQUIRED');
const exactRuns=['40ec24a8-04c3-4666-930c-3ad6b63a2b09','b5efbf9d-050d-4355-a45c-098c1e2378bc','8e111f1e-5b75-46a4-b8b5-7019562ac670','12d7d58b-1f74-40ae-a0bd-16dbac3894dd'];
if(admission.mode!=='LOOKUP'||admission.maximum_selected_runs!==4||JSON.stringify(admission.run_ids)!==JSON.stringify(exactRuns))throw Error('EXACT_IDOL_INTERMEDIATE_RUNS_REQUIRED');
const program=JSON.parse(fs.readFileSync(path.join(root,'checkpoints/pump-report-20261025/ROOT_BUSINESS_SCHEDULE_ADMISSION.json'),'utf8'));
const artifactBytes=fs.readFileSync(program.private_artifact_file),artifact=JSON.parse(artifactBytes);
if(program.status!=='ACTIVATED_RECURRING_PROGRAM_ACTIVE'||sha(artifactBytes)!==program.artifact_sha256||
  program.implementation_sha256!==admission.implementation_sha256||artifact.manifest.implementation_pin.sha256!==admission.implementation_sha256)throw Error('CURRENT_EXACT_BUSINESS_ARTIFACT_REQUIRED');
const proofBytes=fs.readFileSync(admission.full_readback_file),proof=JSON.parse(proofBytes);
if(sha(proofBytes)!==admission.full_readback_sha256||proof.FULL_exact_module_bytes!==true||proof.implementation_sha256!==admission.implementation_sha256||
  proof.artifact_sha256!==program.artifact_sha256||proof.module_count!==artifact.manifest.module_count||
  !Number.isSafeInteger(proof.readback_ts)||proof.readback_ts>now||now-proof.readback_ts>300000||proof.schema!=='ROOT_PRODUCTION_CONTROL_PLANE_READBACK_V1'||proof.control_plane?.automatic_enabled!==true||proof.control_plane?.delivery_enabled!==true||proof.control_plane?.provider_stage!=='PRODUCTION_QUALIFIED'||proof.control_plane?.DATA_DB_id!=='057a2847-2cc4-4e52-8534-1be1596d21d5')throw Error('FRESH_FULL_LIVE_READBACK_REQUIRED');
const credential=fs.readFileSync('/Users/mac/Library/Preferences/.wrangler/config/default.toml','utf8');
const token=credential.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],expiry=credential.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
if(!token||!expiry||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=now+300000)throw Error('REFRESH_WRANGLER_BEFORE_OBSERVATION');
const privateRoot=path.join(root,'pump-report/.private/observations'),inside=p=>path.resolve(p).startsWith(privateRoot+path.sep);
const attemptPath=path.resolve(attemptArg),resultPath=path.resolve(resultArg);
if(!inside(attemptPath)||!inside(resultPath)||attemptPath===resultPath)throw Error('DISTINCT_PRIVATE_OBSERVATION_PATHS_REQUIRED');
fs.mkdirSync(privateRoot,{recursive:true,mode:0o700});
const attemptFd=fs.openSync(attemptPath,'wx',0o600),resultFd=fs.openSync(resultPath,'wx',0o600);
const save=(fd,value)=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(value,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};
let native=null,finalizationStarted=false,calls=0,totalBytes=0;
const evidence={schema:'PUMP_NATIVE_IDOL_INTERMEDIATE_SAVED_RUNS_ACTUAL_V1',authority_main:admission.authority_main,started_ts:now,
  implementation_sha256:admission.implementation_sha256,run_id:admission.run_id,state:'ATTEMPTED_NO_AUTO_RETRY',market_HTTP:0,Telegram:0,observation:null,native_receipt:null};
save(attemptFd,{state:evidence.state,run_id:admission.run_id,authority_main:admission.authority_main,started_ts:now});save(resultFd,evidence);
try{
  const snapshot=attemptPath+'.modules';fs.mkdirSync(snapshot,{mode:0o700});
  for(const [name,text] of Object.entries(artifact.modules)){
    const dest=path.resolve(snapshot,name);if(!dest.startsWith(snapshot+path.sep)||!name.endsWith('.mjs')||typeof text!=='string')throw Error('ARTIFACT_MODULE_PATH_INVALID');
    fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.writeFileSync(dest,text,{flag:'wx',mode:0o600});
  }
  const {reserveNativeRun,finalizeNativeRun,NATIVE_POLICY,LOOKUP_ENVELOPE}=await import(pathToFileURL(path.join(snapshot,'runtime/native-budget.mjs')));
  if(LOOKUP_ENVELOPE.rows_read!==500||LOOKUP_ENVELOPE.rows_written!==30||LOOKUP_ENVELOPE.max_runs_day!==10)throw Error('OBSERVATION_LOOKUP_ENVELOPE_CHANGED');
  const {DISCOVERY_PLAN}=await import(pathToFileURL(path.join(snapshot,'runtime/discovery-reserve.mjs')));
  const db={prepare(sql){return {bind(...params){return {async all(){
    if(Date.now()>=admission.expires_ts||calls>=16)throw Error('OBSERVATION_IO_BOUND_REACHED');
    calls++;
    const r=await fetch('https://api.cloudflare.com/client/v4/accounts/70ee0af85191ea470e74c7383fdec772/d1/database/057a2847-2cc4-4e52-8534-1be1596d21d5/query',{
      method:'POST',headers:{Authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql,params}),redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(r.status!==200)throw Error('D1_API_HTTP_'+r.status);
    const chunks=[];let size=0;for await(const bytes of r.body){size+=bytes.length;totalBytes+=bytes.length;if(size>8388608||totalBytes>12582912)throw Error('OBSERVATION_RESPONSE_BOUND');chunks.push(bytes);}
    const envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(envelope.success!==true||!Array.isArray(envelope.result)||envelope.result.length!==1)throw Error('D1_QUERY_ACK_UNBOUND');
    return envelope.result[0];
  }}}}}};
  native=await reserveNativeRun({db,run_id:admission.run_id,mode:'LOOKUP',run_purpose:'PRODUCTION',policy:{...NATIVE_POLICY,evidence_ref:'checkpoints/pump-report-20261025/ROOT_BUSINESS_SCHEDULE_ADMISSION.json'},future_schedule:DISCOVERY_PLAN});
  evidence.intermediate=[];
  for(const id of exactRuns){const result=await native.store.get('pump:run:'+id);if(result&&result.run_id!==id)throw Error('EXACT_RUN_ID_CONFLICT');evidence.intermediate.push({run_id:id,result});}
  evidence.scope={selected_run_PK:4,business_queries_max:4,total_queries_max:8,hard_query_cap:16,rows_read_cap:500,rows_write_cap:30,whole_history_claimed:false};
  finalizationStarted=true;evidence.native_receipt=await finalizeNativeRun(native);evidence.state='FINALIZED';
}catch(error){
  evidence.error=String(error.code??error.message??'OBSERVATION_FAILED').slice(0,160);evidence.state='FAILED_OR_UNKNOWN_NO_AUTO_RETRY';
  if(native&&!finalizationStarted&&native.store.usage().unknown_ops===0){
    try{finalizationStarted=true;const {finalizeNativeRun}=await import(pathToFileURL(path.join(attemptPath+'.modules','runtime/native-budget.mjs')));evidence.native_receipt=await finalizeNativeRun(native);}catch{evidence.finalization_unknown=true;}
  }
  evidence.native_usage=native?.store.usage()??null;process.exitCode=1;
}finally{
  evidence.completed_ts=Date.now();evidence.native_api_calls_attempted=calls;evidence.response_bytes=totalBytes;
  save(resultFd,evidence);save(attemptFd,{state:evidence.state,run_id:admission.run_id,authority_main:admission.authority_main,completed_ts:evidence.completed_ts,native_api_calls_attempted:calls,result_sha256:sha(fs.readFileSync(resultPath)),no_auto_retry:true});
  fs.closeSync(resultFd);fs.closeSync(attemptFd);
}
console.log(JSON.stringify({state:evidence.state,runs:evidence.intermediate?.map(x=>({run_id:x.run_id,status:x.result?.status??'MISSING',checked:x.result?.checked?.map(c=>({symbol:c.analysis?.instrument?.native_symbol,ready:c.analysis?.ready,delivery:c.delivery?.state})),deferred_count:x.result?.deferred?.length??null})),native_receipt:evidence.native_receipt,market_HTTP:0,Telegram:0,error:evidence.error??null}));
