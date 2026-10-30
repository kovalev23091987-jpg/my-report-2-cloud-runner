import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildArtifact} from '../runtime/build.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const names=['analytics/presentation.mjs','analytics/zones.mjs','sources/liquidations.mjs','sources/hyperliquid-observed-positions.mjs','runtime/worker.mjs','runtime/delivery.mjs','runtime/runner.mjs','runtime/telegram-send.mjs'].sort();
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const own=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(a.status!=='ADMITTED_ONE_PUBLICATION_RECOVERY_BUILD'||a.max_builds!==1||Date.now()<a.issued_ts||Date.now()>=a.expires_ts||a.expires_ts>own.expires_ts||own.owner!==a.own_lease.owner||own.released)throw Error('BUILD_ADMISSION');
if(sha(fs.readFileSync('pump-report/operator/build-publication-recovery-once.mjs'))!==a.operator_sha256||sha(fs.readFileSync('pump-report/runtime/build.mjs'))!==a.builder_sha256)throw Error('FROZEN_OPERATOR_BUILDER_REQUIRED');
const qualifiedBytes=fs.readFileSync(a.qualification_path),qualified=JSON.parse(qualifiedBytes);
if(sha(qualifiedBytes)!==a.qualification_sha256||qualified.status!=='PASS_CONTROLLED_MEMORY_NOT_NATIVE'||qualified.result?.status!=='PASS'||qualified.result.affected_cases!==1||qualified.result.actual_provider_HTTP!==0||qualified.result.native_SQL!==0||qualified.result.actual_Telegram!==0)throw Error('AFFECTED_QUALIFICATION_REQUIRED');
const bytes=fs.readFileSync(a.base_artifact),base=JSON.parse(bytes);
if(sha(bytes)!==a.base_artifact_sha256||a.base_artifact_sha256!=='1b4403a02c6d93a3555c5e1a0ce623c1e907a0edd52ce563878791cb7eba4378'||base.manifest.module_count!==78||base.manifest.implementation_pin.sha256!==a.base_live_pin||a.base_live_pin!=='dfd7b37b9ce06ba3ce6b7a06ae0f7e17e2fafffc198aaa292185c97d18450452')throw Error('EXACT_LIVE_BASE_REQUIRED');
if(JSON.stringify(Object.keys(a.proposed_sources).sort())!==JSON.stringify(names))throw Error('EXACT_EIGHT_SOURCES_REQUIRED');
const modules={...base.modules};
for(const [name,e] of Object.entries(a.proposed_sources)){
  const source=fs.readFileSync(e.path,'utf8');
  if(sha(source)!==e.sha256||qualified.files_sha256[e.path]!==e.sha256)throw Error('QUALIFIED_SOURCE_CHANGED:'+name);
  modules[name]=source;
}
fs.writeFileSync(a.output+'.attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main}),{flag:'wx',mode:0o600});
const legacy=a.output+'.legacy';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
const manifest=buildArtifact({legacy_path:legacy,output_path:a.output,module_overrides:modules});
const artifact=JSON.parse(fs.readFileSync(a.output)),changed=Object.keys(artifact.modules).filter(name=>artifact.modules[name]!==base.modules[name]).sort();
if(manifest.module_count!==78||JSON.stringify(Object.keys(artifact.modules).sort())!==JSON.stringify(Object.keys(base.modules).sort())||JSON.stringify(changed)!==JSON.stringify([...names,'runtime/implementation-pin.mjs'].sort())||JSON.stringify(base.metadata)!==JSON.stringify(artifact.metadata))throw Error('EXACT_NINE_MODULE_DELTA_REQUIRED');
for(const name of names)if(sha(artifact.modules[name])!==a.proposed_sources[name].sha256)throw Error('QUALIFIED_SOURCE_DIFFERS:'+name);
const proof={schema:'ROOT_PUBLICATION_RECOVERY_ARTIFACT_V1',status:'QUALIFIED_BUILT_NOT_INSTALLED',authority_main:a.authority_main,built_ts:Date.now(),artifact_path:a.output,artifact_sha256:sha(fs.readFileSync(a.output)),implementation_sha256:manifest.implementation_pin.sha256,module_count:78,changed:changed.map(name=>({name,sha256:sha(artifact.modules[name])})),unchanged_modules:69,qualification_sha256:a.qualification_sha256,builds:1,native_SQL:0,market_HTTP:0,Telegram:0,deployed:false,old_TTL_strategy_caps_source_clocks_unchanged:true};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(proof));
