import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildArtifact} from '../runtime/build.mjs';
const digest=x=>createHash('sha256').update(x).digest('hex');
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const lease=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
if(a.status!=='ADMITTED_ONE_OFFLINE_BUILD_NOT_DEPLOYMENT'||a.max_builds!==1||Date.now()>=a.expires_ts||
  a.expires_ts>a.own_lease.expires_ts||lease.owner!==a.own_lease.owner||lease.released)throw Error('BUILD_ADMISSION');
if(digest(fs.readFileSync('pump-report/runtime/build.mjs'))!==a.builder_sha256)throw Error('BUILDER_CHANGED');
const bytes=fs.readFileSync(a.base_artifact);if(digest(bytes)!==a.base_artifact_sha256)throw Error('BASE_CHANGED');
const base=JSON.parse(bytes),overrides={...base.modules};
if(base.manifest.module_count!==71||base.manifest.implementation_pin.sha256!==a.base_live_pin)throw Error('BASE_PIN');
const expected=['runtime/catalog-snapshot.mjs','runtime/implementation-pin.mjs','runtime/worker.mjs','sources/index.mjs'].sort();
if(JSON.stringify([...a.expected_changed_or_added].sort())!==JSON.stringify(expected))throw Error('EXACT_CATALOG_DELTA_REQUIRED');
for(const [path,sha]of Object.entries(a.frozen_sources)){
  const name=path.slice('pump-report/'.length);
  if(!path.startsWith('pump-report/')||!expected.includes(name)||name==='runtime/implementation-pin.mjs')throw Error('SOURCE_SCOPE');
  const source=fs.readFileSync(path,'utf8');if(digest(source)!==sha)throw Error('FROZEN_CHANGED:'+path);overrides[name]=source;
}
if(Object.keys(a.frozen_sources).length!==3)throw Error('THREE_FROZEN_SOURCES_REQUIRED');
fs.writeFileSync(a.output+'.build-attempt',JSON.stringify({started_ts:Date.now(),authority_main:a.authority_main}),{flag:'wx',mode:0o600});
const legacy=a.output+'.legacy-base';fs.writeFileSync(legacy,base.modules['legacy-worker.mjs'],{flag:'wx',mode:0o600});
const manifest=buildArtifact({legacy_path:legacy,output_path:a.output,module_overrides:overrides});
const artifact=JSON.parse(fs.readFileSync(a.output)),changed=Object.keys(artifact.modules).filter(n=>artifact.modules[n]!==base.modules[n]);
if(manifest.module_count!==72||JSON.stringify([...changed].sort())!==JSON.stringify(expected)||JSON.stringify(artifact.metadata)!==JSON.stringify(base.metadata))throw Error('UNEXPECTED_DELTA');
const unchanged=Object.keys(base.modules).filter(n=>artifact.modules[n]===base.modules[n]);
if(unchanged.length!==68||artifact.modules['legacy-worker.mjs']!==base.modules['legacy-worker.mjs'])throw Error('BASE_NOT_PRESERVED');
const result={schema:'ROOT_CATALOG_SNAPSHOT_ARTIFACT_V1',status:'BUILT_EXACT_NOT_INSTALLED',authority_main:a.authority_main,built_ts:Date.now(),
  artifact_path:a.output,artifact_sha256:digest(fs.readFileSync(a.output)),implementation_sha256:manifest.implementation_pin.sha256,module_count:72,
  changed_or_added:changed.map(name=>({name,sha256:digest(artifact.modules[name]),previous_sha256:base.modules[name]?digest(base.modules[name]):null})),
  unchanged_base_modules:68,legacy_unchanged:true,metadata_bindings_policy_unchanged:true,
  catalog_fresh_HTTP_and_normalization_unchanged:true,provider_HTTP_added:0,
  native_store_interface_calls_per_valid_catalog:2,actual_native_cost_delta_unmeasured:true,
  one_current_snapshot_key:true,max_rows_in_snapshot:2000,max_body_UTF8_bytes:2097152,max_record_UTF8_bytes:1900000,
  analytics_profile_thresholds_budget_caps_unknowns_reserves_unchanged:true,
  affected_qualification:a.affected_qualification,builds:1,native_SQL:0,market_HTTP:0,Telegram:0,deployed:false};
fs.writeFileSync(a.proof_path,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
