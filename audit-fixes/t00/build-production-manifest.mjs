import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const repo=path.resolve(process.argv[2]||'.');
const runtime=process.argv[3]?path.resolve(process.argv[3]):null;
const output=path.join(repo,'audit-fixes/t00/PRODUCTION_MANIFEST.json');
const posix=p=>path.relative(repo,p).split(path.sep).join('/');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=(dir,predicate=()=>true)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),predicate):(predicate(path.join(dir,e.name))?[path.join(dir,e.name)]:[])):[];
const hashFiles=files=>Object.fromEntries(files.sort().map(file=>[posix(file),sha(file)]));
const text=relative=>fs.readFileSync(path.join(repo,relative),'utf8');
const workflow=text('.github/workflows/report2.yml');
const baseWorkflow=text('post-v7-consolidated/full-validation/base-report2.yml');
const overlayOrder=[...baseWorkflow.matchAll(/^\s*node (\S+) runtime(?:\s+(\S+))?$/gm)].map((m,index)=>({order:index+1,entrypoint:m[1],argument:m[2]||null,sha256:sha(path.join(repo,m[1]))}));
const finalOverlays=[
  'post-v7-consolidated/post-v7/overlay/apply-post-v7-unified-overlay.mjs',
  'post-v7-consolidated/liquidation/liquidation-extension/integration/apply-after-unified.mjs',
  'post-v7-consolidated/final-reconciliation/apply-runtime-overlay.mjs',
  'current-generation/apply-runtime-overlay.mjs',
].map((entrypoint,index)=>({order:overlayOrder.length+index+1,entrypoint,sha256:sha(path.join(repo,entrypoint))}));
const effectiveOverrides=hashFiles([
  ...walk(path.join(repo,'current-generation/files'),p=>/\.(?:js|mjs|json)$/.test(p)),
  path.join(repo,'post-v7-consolidated/final-reconciliation/files/src/canonical-publication.mjs'),
]);
const migrations=hashFiles([
  ...walk(path.join(repo,'current-generation/migrations'),p=>p.endsWith('.sql')),
  ...walk(path.join(repo,'post-v7-consolidated/post-v7'),p=>p.endsWith('.sql')),
  ...walk(path.join(repo,'post-v7-consolidated/liquidation'),p=>p.endsWith('.sql')&&!p.includes('/node_modules/')),
]);
const lockPath=path.join(repo,'post-v7-consolidated/liquidation/liquidation-extension/package-lock.json');
const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
const dependencyVersions=Object.fromEntries(Object.entries(lock.packages||{}).filter(([key])=>key.startsWith('node_modules/')).map(([key,value])=>[key.slice(13),value.version]).sort());
const bindings=[...workflow.matchAll(/^\s{6}([A-Z][A-Z0-9_]+):/gm)].map(m=>m[1]);
const runtimeFiles=runtime&&fs.existsSync(runtime)?walk(runtime,p=>/\.(?:js|mjs|cjs|json|sql)$/.test(p)&&!p.includes('/node_modules/')):[];
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const manifest={
  schema:'my-report-2-production-manifest-v1',
  captured_at:'2026-09-28T02:35:00+03:00',
  production:{repository:'kovalev23091987-jpg/my-report-2-cloud-runner',branch:'main',commit:'2d0a80d93bc67b8a79b5d2609bdf83128be7a1ba',generation:'MY_REPORT_2_CURRENT_20260927_TECHNICAL_5PCT_ENTRY_STATS_V4_20M',expected_worker_sha256:'c25939859bbe3f02a7f3479d1f0f656b4877c06dd72f18e372e4927289ba5a97',observed_successful_run_id:36358867282,observed_run_head_sha:'2d0a80d93bc67b8a79b5d2609bdf83128be7a1ba'},
  audit_branch:{name:git('branch','--show-current'),head:git('rev-parse','HEAD')},
  schedules:{github_analytics:'*/20 * * * *',github_keepalive:'17 3 1 * *',observed_live_hub_legacy:'*/5 * * * *'},
  roles:{ANALYTICS:'GitHub Actions report2.yml',PUBLIC_COLLECTOR:'not separated in V4; legacy Hub schedule still active',RELAY:'my-report-2-hub /telegram-test binding',WATCHDOG:'not isolated in V4'},
  workflow:{path:'.github/workflows/report2.yml',sha256:sha(path.join(repo,'.github/workflows/report2.yml')),entrypoint:'runtime/runner-main.mjs',node:'24',timeout_minutes:10,bindings_without_values:[...new Set(bindings)].sort()},
  reconstruction:{base_runtime_commit:'f7c5c77acfc2640c2c9b396d61560d33bf4fa263',base_workflow_sha256:sha(path.join(repo,'post-v7-consolidated/full-validation/base-report2.yml')),production_overlays:overlayOrder,final_overlays:finalOverlays},
  repository_effective_override_modules:effectiveOverrides,
  migrations,
  dependencies:{lockfile:posix(lockPath),lockfile_sha256:sha(lockPath),lockfile_version:lock.lockfileVersion,packages:dependencyVersions},
  runtime_capture:runtimeFiles.length?{status:'CAPTURED_AUTHORIZED_DECRYPTED_RUNTIME',root:runtime,files:hashFiles(runtimeFiles),worker_sha256:sha(path.join(runtime,'src/worker.js')),tz101_entry_area_calibration_present:fs.existsSync(path.join(runtime,'src/tz101-entry-area-calibration.mjs'))}:{status:'BLOCKED_GITHUB_CONTENTS_WRITE_PERMISSION',files:{},tz101_entry_area_calibration_present:false},
  cloud_inventory:{github_workflows:'READ_CONFIRMED',github_recent_runs:'READ_CONFIRMED',cloudflare_hub_bundle:'AUDIT_EVIDENCE_ONLY_FILE_NOT_PRESENT',cloudflare_bindings:'NAMES_PARTIAL_FROM_WORKFLOW; LIVE_LIST_NOT_AVAILABLE',d1_schema:'AUDIT_EVIDENCE_ONLY_EXACT_SCHEMA_EXPORT_NOT_PRESENT'},
  required_historical_fixtures:{ETC:'AUDIT_FACTS_ONLY_EXACT_ROW_NOT_PRESENT',ETHFI:'AUDIT_FACTS_ONLY_EXACT_ROW_NOT_PRESENT',DOT:'AUDIT_FACTS_ONLY_EXACT_ROW_NOT_PRESENT',LSK:'AUDIT_FACTS_ONLY_EXACT_ROW_NOT_PRESENT',HTX_TIMEOUT:'RUN_36350755672_LOG_AVAILABLE_EXACT_FIXTURE_NOT_CAPTURED',ETC_BINDING_FAILURE:'RUN_LOG_REFERENCES_AVAILABLE_EXACT_FIXTURE_NOT_CAPTURED'},
  completeness:{status:runtimeFiles.length?'PARTIAL_CLOUD_FILES_MISSING':'INCOMPLETE',blocking_missing:['effective live Hub bundle','exact live bindings list without values','exact D1 sqlite schema','six exact sanitized historical fixtures',...(runtimeFiles.length?[]:['authorized decrypted runtime including tz101-entry-area-calibration.mjs'])]},
};
fs.writeFileSync(output,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
console.log(JSON.stringify({status:'MANIFEST_WRITTEN',output:posix(output),completeness:manifest.completeness.status,modules:Object.keys(effectiveOverrides).length,migrations:Object.keys(migrations).length,runtime_files:runtimeFiles.length}));
