import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);const hash=s=>createHash('sha256').update(s).digest('hex');
const BASE={
 'src/worker.js':'a2b3c2d364202b3cbbd3a40407733cb5d385f01b70e43786066fbeb84bb25225',
 'src/canonical-runtime-adapter.mjs':'0f74fa78339a676f65fff06cf968a638b8b33af25ff4dfbde3c7caea1d48245f',
};
function replaceOnce(s,a,b){if(s.split(a).length!==2)throw Error('UNIQUE_RUNTIME_ANCHOR_REQUIRED:'+a.slice(0,60));return s.replace(a,b);}
export function candidateTexts(runtime){
 const texts=Object.fromEntries(Object.keys(BASE).map(k=>[k,fs.readFileSync(path.join(runtime,k),'utf8')]));
 for(const [f,h] of Object.entries(BASE))if(hash(texts[f])!==h)throw Error('EXACT_RUNTIME_BASE_MISMATCH:'+f);
 let w=texts['src/worker.js'];
 w=replaceOnce(w,'  // Receipt observation cannot predate completion of its market inputs.\n  now = Date.now();',`  // New source collection is Node-runner injected, quota-admitted, SHADOW ONLY.\n  // It must finish BEFORE analytical snapshot time is frozen. No Telegram logic.\n  let nativeLiquidationAcquisition = null;\n  if (typeof env?.REPORT2_LIQUIDATION_NATIVE_COLLECT === "function" &&\n      /^[A-Z0-9]+-USDT$/.test(contract)) {\n    try {\n      nativeLiquidationAcquisition = await env.REPORT2_LIQUIDATION_NATIVE_COLLECT({\n        contract, run_id: String(params?.run_id || "").trim() || \`manual-shadow-\${cycleStartedTs}\`, native_symbol: contract.slice(0,-5),\n        deep_started_ts: cycleStartedTs, max_deep_ms: 45000,\n        early_candidate_bridge: params?.discovery_row?.early_candidate_bridge === true,\n        early_candidate_quality_0_100: params?.discovery_row?.early_candidate_quality_0_100 ?? null,\n        manual_liquidation_request: !String(params?.run_id || "").trim(),\n      });\n    } catch { nativeLiquidationAcquisition = null; }\n  }\n  // Receipt observation cannot predate completion of its market inputs.\n  now = Date.now();`);
 w=replaceOnce(w,'      run_id:\n        String(params?.run_id || "").trim() ||\n        `manual-shadow-${now}`,','      run_id:\n        String(params?.run_id || "").trim() ||\n        nativeLiquidationAcquisition?.run_id || `manual-shadow-${now}`,');
 w=replaceOnce(w,'      previous_snapshot_context:\n        previousSnapshotContext,','      previous_snapshot_context:\n        previousSnapshotContext,\n      native_liquidation_acquisition:\n        nativeLiquidationAcquisition,');
 w=replaceOnce(w,'return {\n    tool: "deep_check_input",',`  if (nativeLiquidationAcquisition && typeof env?.REPORT2_LIQUIDATION_CANONICAL_CAPTURE === "function") {\n    try {\n      await env.REPORT2_LIQUIDATION_CANONICAL_CAPTURE({canonical: canonicalAnalyticalBundle?.canonical});\n    } catch { /* Failed artifact capture is not a successful D1 publication. */ }\n  }\n\nreturn {\n    tool: "deep_check_input",`);
 let a=texts['src/canonical-runtime-adapter.mjs'];
 a="import { attachNativeContext } from './liquidation-extension/runtime-bridge.mjs';\n"+a;
 a=replaceOnce(a,' existing_source_receipts=null,previous_snapshot_context=null,',' existing_source_receipts=null,previous_snapshot_context=null,native_liquidation_acquisition=null,');
 a=replaceOnce(a,' const canonical=buildCanonicalAnalyticalResult({',` const liquidationsWithNativeContext=attachNativeContext(pump,native_liquidation_acquisition,{contract,run_id,snapshot_id,observed_ts,direction});\n const canonical=buildCanonicalAnalyticalResult({`);
 a=replaceOnce(a,'  liquidations:pump,data_quality:data_sufficiency??null,free_sources:freeSources,','  liquidations:liquidationsWithNativeContext,data_quality:data_sufficiency??null,free_sources:freeSources,');
 return {'src/worker.js':w,'src/canonical-runtime-adapter.mjs':a};
}
export function patchCurrentRuntime(runtimeDir){
 const runtime=path.resolve(runtimeDir),proofFile=path.join(runtime,'liquidation-extension-wiring-proof.json');
 const copyModules=['core.mjs','providers.mjs','io.mjs','runtime-bridge.mjs','runner-extension.mjs','select-native-account-sample.mjs','run-source-budget.mjs','d1-source-admission.mjs','canonical-capture.mjs','gtrade.mjs','gtrade-runtime-bridge.mjs','gtrade-runtime-collector.mjs','multi-runner-extension.mjs','combined-runner-service.mjs'];
 if(fs.existsSync(proofFile)){
  const p=JSON.parse(fs.readFileSync(proofFile,'utf8'));
  if(!p.files.every(f=>fs.existsSync(path.join(runtime,f.path))&&hash(fs.readFileSync(path.join(runtime,f.path)))===f.after_sha256))throw Error('PARTIAL_PREVIOUS_EXTENSION_STATE');
  return {...p,status:'ALREADY_APPLIED'};
 }
 const replacements=candidateTexts(runtime);const runnerPath=path.join(runtime,'runner-main.mjs');
 const authoritativeRunner=fs.readFileSync(path.join(here,'runner-main.base.mjs'),'utf8');
 const runnerCurrent=fs.readFileSync(runnerPath,'utf8');if(hash(runnerCurrent)!==hash(authoritativeRunner))throw Error('RUNNER_BASE_HASH_MISMATCH');
 let r=runnerCurrent;
 r="import { createCombinedLiquidationService } from './src/liquidation-extension/combined-runner-service.mjs';\nimport { createD1SourceAdmission } from './src/liquidation-extension/d1-source-admission.mjs';\nimport { createCanonicalCapture } from './src/liquidation-extension/canonical-capture.mjs';\n"+r;
 const anchor='  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/12 * * * *" : "manual" }, env, ctx);';
 r=replaceOnce(r,anchor,`  let nativeLiquidationExtension=null;\n  let nativeLiquidationCapture=null;\n  // OFF is the exact no-network compatibility path. No allowance is auto-created.\n  if (envText("REPORT2_LIQUIDATION_EXTENSION_MODE", {required:false}) === "SHADOW_ONLY") {\n    let scopeBindings=null;\n    try {scopeBindings=JSON.parse(envText("REPORT2_LIQUIDATION_SOURCE_SCOPES_JSON", {required:false}) || "null");} catch {}\n    const providerAdmit=createD1SourceAdmission({db:env.DATA_DB,scope_bindings:scopeBindings,\n      within_run_budget:extra=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:4500+extra.extraRowsRead,extraRowsWritten:80+extra.extraRowsWritten})});\n    nativeLiquidationExtension=createCombinedLiquidationService({mode:"SHADOW_ONLY",provider_admit:providerAdmit,fetch_impl:globalThis.fetch,accounts_per_deep:4,max_http_per_run:24,max_total_ms:45000});\n    nativeLiquidationCapture=createCanonicalCapture({directory:resolve("liquidation-shadow-proof")});\n    env.REPORT2_LIQUIDATION_NATIVE_COLLECT=nativeLiquidationExtension.collect;\n    env.REPORT2_LIQUIDATION_CANONICAL_CAPTURE=nativeLiquidationCapture.capture;\n  }\n${anchor}\n  if (nativeLiquidationExtension) console.log("NATIVE_LIQUIDATION_EXTENSION_SHADOW",JSON.stringify({collection:nativeLiquidationExtension.summary(),capture:nativeLiquidationCapture.summary()}));`);
 replacements['runner-main.mjs']=r;
 for(const n of copyModules){const target='src/liquidation-extension/'+n;if(fs.existsSync(path.join(runtime,target)))throw Error('NEW_MODULE_ALREADY_PRESENT:'+n);replacements[target]=fs.readFileSync(path.join(root,'src',n),'utf8');}
 const proof={schema:'LIQUIDATION_EXTENSION_RUNTIME_WIRING_V1',status:'APPLIED',base_main:'f7c5c77acfc2640c2c9b396d61560d33bf4fa263',mode:'SHADOW_ONLY_DEFAULT_OFF',files:Object.entries(replacements).map(([p,s])=>({path:p,before_sha256:fs.existsSync(path.join(runtime,p))?hash(fs.readFileSync(path.join(runtime,p))):null,after_sha256:hash(s)})),
  expected_candidate_worker_sha256:hash(wFrom(replacements)),production_changed:false,telegram_sender_changed:false,formatter_layout_changed:false,score_weights_changed:false,source_quota_migration_applied:false,full_runtime_e2e:false};
 const saved=[];
 try{for(const [rel,s] of Object.entries(replacements)){const p=path.join(runtime,rel);fs.mkdirSync(path.dirname(p),{recursive:true});const old=fs.existsSync(p)?fs.readFileSync(p):null;saved.push({p,old});const temp=p+'.liq-tmp';fs.writeFileSync(temp,s);fs.renameSync(temp,p);}for(const f of proof.files)if(hash(fs.readFileSync(path.join(runtime,f.path)))!==f.after_sha256)throw Error('POST_PATCH_HASH_MISMATCH');fs.writeFileSync(proofFile,JSON.stringify(proof,null,2));}
 catch(e){for(const {p,old} of saved.reverse()){if(old===null)fs.rmSync(p,{force:true});else fs.writeFileSync(p,old);}throw e;}
 return proof;
}
function wFrom(r){return r['src/worker.js'];}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(patchCurrentRuntime(process.argv[2])));
