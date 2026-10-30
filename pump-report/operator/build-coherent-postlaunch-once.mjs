import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildArtifact} from '../runtime/build.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(a.status!=='ADMITTED_ONE_COHERENT_POSTLAUNCH_BUILD'||a.max_builds!==1||Date.now()<a.issued_ts||Date.now()>=a.expires_ts||a.expires_ts>own.expires_ts||own.owner!==a.own_lease.owner||own.released)throw Error('BOUNDED_BUILD_ADMISSION_REQUIRED');
for(const [p,h]of Object.entries(a.frozen_files))if(sha(fs.readFileSync(p))!==h)throw Error('FROZEN_BUILD_FILE_CHANGED:'+p);
const qBytes=fs.readFileSync(a.qualification_path),qualified=JSON.parse(qBytes);
if(sha(qBytes)!==a.qualification_sha256||qualified.status!=='PASS'||qualified.affected_cases!==1||
 qualified.actual_runner_admission_with_same_owned_source!==true||qualified.rebuilt_implementation_binding!==true||
 qualified.full_runner_new_original_mock_SENT!==true||qualified.v3_feature_after_publication!==true||
 qualified.version_aware_reader_compatibility!==true||qualified.native_SQL!==0||qualified.actual_provider_HTTP!==0||qualified.actual_Telegram!==0)
 throw Error('COHERENT_AFFECTED_QUALIFICATION_REQUIRED');
const baseBytes=fs.readFileSync(a.base_artifact),base=JSON.parse(baseBytes);
if(sha(baseBytes)!=='2a1154eeccaa453d96c7b1a471722f8767ae2f71704fb820ccdbc79ceaefcca4'||
 base.manifest.implementation_pin.sha256!=='1941e629f35a0b429caa159c283f0bdeecb488c5c23be33c2b88a3840e59e355'||base.manifest.module_count!==78)
 throw Error('EXACT_CURRENT1941_BASE_REQUIRED');
const stage=JSON.parse(fs.readFileSync(a.stage_manifest)),modules={...base.modules};
if(stage.prepared_pin!==a.prepared_pin||qualified.implementation_sha256!==a.prepared_pin)throw Error('QUALIFIED_PREPARED_PIN_REQUIRED');
for(const [name,p]of Object.entries(a.proposed_sources)){
 const source=fs.readFileSync(p,'utf8');
 if(sha(source)!==stage.module_sha256[name]||a.frozen_files[p]!==stage.module_sha256[name])throw Error('QUALIFIED_SOURCE_REQUIRED:'+name);
 modules[name]=source;
}
fs.writeFileSync(a.output+'.attempt',JSON.stringify({authority_main:a.authority_main,started_ts:Date.now()}),{flag:'wx',mode:0o600});
const legacy=a.output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
const manifest=buildArtifact({legacy_path:legacy,output_path:a.output,module_overrides:modules});
const built=JSON.parse(fs.readFileSync(a.output)),changed=Object.keys(built.modules).filter(n=>built.modules[n]!==base.modules[n]).sort();
const expected=[...Object.keys(a.proposed_sources),'runtime/implementation-pin.mjs'].sort();
if(manifest.implementation_pin.sha256!==a.prepared_pin||manifest.module_count!==stage.module_count_after||
 JSON.stringify(changed)!==JSON.stringify(expected)||JSON.stringify(base.metadata)!==JSON.stringify(built.metadata))
 throw Error('EXACT_COHERENT_FROZEN_BUILD_REQUIRED');
for(const [n,s]of Object.entries(built.modules))if(sha(s)!==stage.module_sha256[n])throw Error('STAGED_BUILD_BYTE_DIFF:'+n);
const proof={schema:'ROOT_COHERENT_POSTLAUNCH_ARTIFACT_V1',status:'QUALIFIED_BUILT_NOT_INSTALLED',authority_main:a.authority_main,
 built_ts:Date.now(),implementation_sha256:manifest.implementation_pin.sha256,artifact_sha256:sha(fs.readFileSync(a.output)),
 module_count:manifest.module_count,changed:changed.map(n=>({name:n,sha256:sha(built.modules[n])})),
 added:changed.filter(n=>!Object.hasOwn(base.modules,n)),unchanged_modules:Object.keys(base.modules).filter(n=>built.modules[n]===base.modules[n]).length,
 qualification_sha256:a.qualification_sha256,builds:1,native_SQL:0,market_HTTP:0,Telegram:0,deployed:false,
 previous_publication_recovery_and_strategy_TTL_caps_unchanged:true};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
