import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {fullRawBasis,updateMirrorActive,MIRROR_PATHS} from '../runner/github-four-mirror-cas.mjs';
const out='audit-output/four-mirror-repair';fs.mkdirSync(out,{recursive:true});let control,result;
try{
 const scope=JSON.parse(fs.readFileSync('checkpoints/github-four-mirror-repair-20261019/runtime-scope.json','utf8'));
 if(process.env.GITHUB_REPOSITORY!=='kovalev23091987-jpg/my-report-2-cloud-runner'||process.env.GITHUB_REF!=='refs/heads/work/github-four-mirror-repair-20261019'||process.env.GITHUB_RUN_ATTEMPT!=='1'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||'')||scope.main_technical_operations!==1||scope.source_nativeSQL_MAIN_analysis_Telegram!==0||Date.now()>=scope.expires_ts)throw Error('EXACT_ONE_MAIN_TECHNICAL_SCOPE_REQUIRED');
 const basis=fullRawBasis();basis.forEach((b,i)=>fs.writeFileSync(out+'/full-basis-'+String(i+1).padStart(2,'0')+'.json',b));
 control=makeGithubControl({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,initial_raw_basis:basis,maximum_calls:5,on_response:(row,raw)=>fs.writeFileSync(out+'/response-'+String(row.attempt).padStart(2,'0')+'.json',raw)});
 const marker={schema:'ACTUAL_FOUR_MIRROR_GIT_OBJECT_WRITE_V1',cloud_run:Number(process.env.GITHUB_RUN_ID),code_head:process.env.GITHUB_SHA,source_main:scope.expected_main,fulltext_readback:false,source_HTTP:0,native_SQL:0,MAIN_analysis:0,Telegram:0};
 const written=await updateMirrorActive(control,{expected_main:scope.expected_main,owner:scope.expected_owner,scope_prefix:'GITHUB_FOUR_MIRROR.REPAIR ',message:'Record exact four-mirror technical GitHub write '+process.env.GITHUB_RUN_ID,update:active=>({...active,latest_github_four_mirror_runtime_check:marker})});
 result={schema:'MAIN_TECHNICAL_FOUR_MIRROR_QUALIFICATION_V1',status:'EXACT_MAIN_TECHNICAL_GIT_OBJECT_WRITE_VERIFIED',cloud_run:Number(process.env.GITHUB_RUN_ID),head:process.env.GITHUB_SHA,previous_main:scope.expected_main,new_main:written.head,owner:scope.expected_owner,control_HTTP:control.metrics.length,positive_CAS_ACK_known:written.positive_CAS_ACK_known,ACK_resolved_by_exact_known_commit_readback:written.ACK_resolved_by_exact_known_commit_readback,four_prepared_raw_Git_object_bindings_verified:true,native_fulltext_readback:false,main_branch_rules_accepted_for_this_operation:true,source_HTTP:0,native_SQL:0,MAIN_analysis:0,Telegram:0,retention_or_data_capacity_qualified:false,project_complete:false};
}catch(e){process.exitCode=1;result={schema:'MAIN_TECHNICAL_FOUR_MIRROR_QUALIFICATION_V1',status:'NOT_CLOSED',failure_code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'GITHUB_TECHNICAL_REPLY_NOT_CLOSED',source_HTTP:0,native_SQL:0,MAIN_analysis:0,Telegram:0};}
const attempt=control?.last_mirror_attempt;
if(attempt)attempt.prepared_raws.forEach((b,i)=>fs.writeFileSync(out+'/prepared-'+String(i+1).padStart(2,'0')+'.json',b));
fs.writeFileSync(out+'/qualification.json',JSON.stringify({...result,journal:control?.metrics??[],attempt:attempt?{expected_head:attempt.expected_head,tree:attempt.tree,candidate_commit:attempt.candidate_commit,prepared_blobs:attempt.prepared_blobs.map((v,i)=>({...v,sha256:createHash('sha256').update(attempt.prepared_raws[i]).digest('hex')}))}:null},null,2)+'\n');console.log(JSON.stringify(result));
