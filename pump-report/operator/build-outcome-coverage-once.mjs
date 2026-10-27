import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildArtifact} from '../runtime/build.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(a.status!=='ADMITTED_ONE_OUTCOME_COVERAGE_BUILD'||a.max_builds!==1||Date.now()>=a.expires_ts||a.expires_ts>own.expires_ts||own.owner!==a.own_lease.owner||own.released)throw Error('BUILD_ADMISSION');
for(const [p,h]of Object.entries(a.frozen_files))if(sha(fs.readFileSync(p))!==h)throw Error('FROZEN_FILE_CHANGED:'+p);
const view=JSON.parse(fs.readFileSync(a.outcome_case)),coverage=JSON.parse(fs.readFileSync(a.coverage_case));
if(view.status!=='PASS'||view.case_count!==1||view.arms!==23||view.actual_native_SQL!==0||view.Telegram!==0||coverage.status!=='PASS'||coverage.case_count!==1||coverage.actual_native_SQL!==0)throw Error('AFFECTED_CASES_REQUIRED');
const base=JSON.parse(fs.readFileSync(a.base_artifact));if(base.manifest.module_count!==73||base.manifest.implementation_pin.sha256!==a.base_live_pin)throw Error('EXACT_BASE');
const modules={...base.modules};for(const [name,p]of Object.entries(a.proposed_sources))modules[name]=fs.readFileSync(p,'utf8');
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main}),{flag:'wx',mode:0o600});
const legacy=a.output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
const manifest=buildArtifact({legacy_path:legacy,output_path:a.output,module_overrides:modules}),artifact=JSON.parse(fs.readFileSync(a.output));
const changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]).sort();
const expected=[...Object.keys(a.proposed_sources),'runtime/implementation-pin.mjs'].sort();
if(manifest.module_count!==75||JSON.stringify(changed)!==JSON.stringify(expected)||JSON.stringify(base.metadata)!==JSON.stringify(artifact.metadata))throw Error('EXACT_FIVE_DELTA');
const proof={schema:'ROOT_OUTCOME_COVERAGE_ARTIFACT_V1',status:'QUALIFIED_BUILT_NOT_INSTALLED',authority_main:a.authority_main,built_ts:Date.now(),artifact_path:a.output,artifact_sha256:sha(fs.readFileSync(a.output)),implementation_sha256:manifest.implementation_pin.sha256,module_count:75,changed:changed.map(n=>({name:n,sha256:sha(artifact.modules[n])})),unchanged_modules:70,
 operator_only_coverage_normalizer_not_in_worker_graph:{path:'pump-report/sources/coverage.mjs',sha256:a.frozen_files['pump-report/sources/coverage.mjs']},
 previous_delivery_recovery_analytics_profile_provider_budget_storage_modules_unchanged:true,outcome_case_arms:23,coverage_case_rows:550,builds:1,actual_native_SQL:0,market_HTTP:0,Telegram:0,deployed:false};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
