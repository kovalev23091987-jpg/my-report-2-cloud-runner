import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),hash=x=>createHash('sha256').update(x).digest('hex');
export const EXPECTED_UNIFIED_BASE=Object.freeze({
 'src/worker.js':'d4310484b937d26f1836e51228c53584a72a537bc42538dae869e7ec6a80b922',
 'src/canonical-runtime-adapter.mjs':'fe7cde5da24ff5b5114d666b7b1f2b1fb1c2494aff1fc5701b5e208b0d42b9c4',
 'runner-main.mjs':'2354d4d84e28b2db2cabef5d1fe8233b6842f8bf02d8a2050df0d9c1498157cb',
 'src/manual-report-formatter.mjs':'8fd1bca6a5bf2aef0f70a2adf7a058fe76f1b90e7dce107c028da19f0ee738b1',
 'src/canonical-publication.mjs':'ab96cd68e2f2770d7d71a9901cc7248dc5fdcded4c48f6ad7403ef47e2688248',
 'src/bound-telegram-delivery-sidecar.mjs':'e1e59ef4c0453a45498ea1f5764796623090f82e85b27f9e6000d83af36728c3',
 'src/publication-reconciler.mjs':'5b5e672430a3a7f77dd338aba4b4b964d325d711e17880b8e50d9a8e29401a1b',
 'src/v3-telegram-delivery-sidecar.mjs':'620808636e68f0d74e7214391b03f25656ce0d0968e2edda5dddee7eca8304b6',
 'src/v3-telegram-lifecycle.mjs':'25095c26e455113f6db5ff618ebf5a9d7ec0f94fb1f33693cbed25a134d44e67',
});
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('EXACT_POSTV7_ANCHOR_MISMATCH:'+a.slice(0,100));return s.replace(a,b);};
const read=(r,n)=>fs.readFileSync(path.join(r,n),'utf8');
export function planAfterUnified(runtime){
 const texts={};for(const [rel,expected] of Object.entries(EXPECTED_UNIFIED_BASE)){const p=path.join(runtime,rel);if(!fs.existsSync(p)||!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink())throw Error('ORDINARY_UNIFIED_BASE_REQUIRED:'+rel);const b=fs.readFileSync(p);if(hash(b)!==expected)throw Error('EXACT_UNIFIED_BASE_REQUIRED:'+rel);texts[rel]=b.toString('utf8');}
 let w=texts['src/worker.js'];
 const anchor='  // Receipt observation cannot predate completion of its market inputs.\n  now = Date.now();';
 w=once(w,anchor,`  // All new source facts finish before the analytical cutoff is fixed.\n  let nativeLiquidationAcquisition = null;\n  if (typeof env?.REPORT2_LIQUIDATION_NATIVE_COLLECT === "function" && /^[A-Z0-9]+-USDT$/.test(contract)) {\n    try {\n      nativeLiquidationAcquisition = await env.REPORT2_LIQUIDATION_NATIVE_COLLECT({\n        contract, native_symbol: contract.slice(0,-5), run_id: String(params?.run_id || "").trim() || \`manual-shadow-\${cycleStartedTs}\`,\n        deep_started_ts: cycleStartedTs, max_deep_ms:45000,\n        early_candidate_bridge:params?.discovery_row?.early_candidate_bridge===true,\n        early_candidate_quality_0_100:params?.discovery_row?.early_candidate_quality_0_100??null,\n        manual_liquidation_request:!String(params?.run_id||"").trim(),\n      });\n    } catch { /* Optional source fails closed; never refresh its old timestamps. */ }\n  }\n`+anchor);
 w=once(w,'      run_id:\n        String(params?.run_id || "").trim() ||\n        `manual-shadow-${now}`,','      run_id:\n        String(params?.run_id || "").trim() ||\n        nativeLiquidationAcquisition?.run_id || `manual-shadow-${now}`,');
 w=once(w,'    buildRuntimeCanonicalBundle({\n      contract,','    buildRuntimeCanonicalBundle({\n      native_liquidation_acquisition:nativeLiquidationAcquisition,\n      contract,');
 // The original post-V7 persistCanonicalSnapshot path is preserved in full.
 if(!w.includes('postV7CanonicalPersistence = await persistCanonicalSnapshot'))throw Error('ORIGINAL_PUBLICATION_PERSISTENCE_MISSING');
 texts['src/worker.js']=w;
 let a=texts['src/canonical-runtime-adapter.mjs'];a="import {attachNativeContext} from './liquidation-extension/runtime-bridge.mjs';\n"+a;
 a=once(a,'existing_source_receipts=null,previous_snapshot_context=null,oi_window_receipts=null,','existing_source_receipts=null,previous_snapshot_context=null,oi_window_receipts=null,native_liquidation_acquisition=null,');
 a=once(a,' const canonical=buildCanonicalAnalyticalResult({',' const nativeLiquidationView=attachNativeContext(pump,native_liquidation_acquisition,{contract,run_id,snapshot_id,observed_ts,direction});\n const canonical=buildCanonicalAnalyticalResult({');
 a=once(a,'liquidations:pump,data_quality:','liquidations:nativeLiquidationView,data_quality:');texts['src/canonical-runtime-adapter.mjs']=a;
 let m=texts['src/manual-report-formatter.mjs'];m="import {nativeLiquidationLines,validateNativeLiquidationContext} from './native-liquidation-guard.mjs';\n"+m;
 const old=" if(result.liquidations?.pump?.is_pump===true)lines.push('','ПАМП И ЛИКВИДАЦИИ',`Выше: ${result.liquidations.above?.length||0} подтверждённых зон.`,`Ниже: ${result.liquidations.below?.length||0} подтверждённых зон.`);";
 m=once(m,old," const nativeLines=nativeLiquidationLines(result.liquidations,{manual:true});\n if(nativeLines!==null){const valid=validateNativeLiquidationContext(result);if(!valid.ok)return{ok:false,status:valid.status,text:null};lines.push('',result.liquidations?.pump?.is_pump===true?'ПАМП И ЛИКВИДАЦИИ':'ЛИКВИДАЦИИ',...nativeLines);}\n else "+old.trim());texts['src/manual-report-formatter.mjs']=m;
 let r=texts['runner-main.mjs'];r="import {createCombinedLiquidationService} from './src/liquidation-extension/combined-runner-service.mjs';\nimport {createD1SourceAdmission} from './src/liquidation-extension/d1-source-admission.mjs';\n"+r;
 const call='  await worker.scheduled({ scheduledTime: started, cron: source === "schedule" ? "*/12 * * * *" : "manual" }, env, ctx);';
 r=once(r,call,`  let liquidationSources=null;\n  if(postV7UnifiedEnabled && envText("REPORT2_LIQUIDATION_EXTENSION_MODE",{required:false})==='SHADOW_ONLY'){\n    let scopes=null;try{scopes=JSON.parse(envText("REPORT2_LIQUIDATION_SOURCE_SCOPES_JSON",{required:false})||'null');}catch{}\n    const requiredDownstream={\n      rows_read:4500+V3_EARLY_SIDECAR_BUDGET.rows_read+V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_read+V3_LIQUIDATION_SIDECAR_BUDGET.rows_read+V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_read,\n      rows_written:50+V3_EARLY_SIDECAR_BUDGET.rows_written+V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET.rows_written+V3_LIQUIDATION_SIDECAR_BUDGET.rows_written+V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written+BOUND_TELEGRAM_DELIVERY_BUDGET.rows_written,\n    };\n    const providerAdmit=createD1SourceAdmission({db:env.DATA_DB,scope_bindings:scopes,within_run_budget:e=>evaluateWithinRunReservation({reservation:d1RunReservation,currentUsage:env.DATA_DB.usageSnapshot(),extraRowsRead:requiredDownstream.rows_read+e.extraRowsRead,extraRowsWritten:requiredDownstream.rows_written+e.extraRowsWritten})});\n    liquidationSources=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit:providerAdmit,fetch_impl:globalThis.fetch,accounts_per_deep:4,max_http_per_run:24,max_total_ms:45000});\n    env.REPORT2_LIQUIDATION_NATIVE_COLLECT=liquidationSources.collect;\n  }\n${call}\n  if(liquidationSources)console.log('LIQUIDATION_SOURCES_CANONICAL_RECEIPT',JSON.stringify(liquidationSources.summary()));`);texts['runner-main.mjs']=r;
 // Keep the current V7 sender, formatter and its budget byte-for-byte.
 // The canonical sender uses a separate transport; an old fixture is not a
 // valid replacement for the production TZ-reconciled delivery sidecar.
 for(const name of ['canonical-publication.mjs','bound-telegram-delivery-sidecar.mjs','publication-reconciler.mjs','v3-telegram-lifecycle.mjs'])texts['src/'+name]=read(path.join(here,'unified-delivery'),name);
 const relay='src/bound-telegram-relay.mjs';if(fs.existsSync(path.join(runtime,relay)))throw Error('NEW_RELAY_ALREADY_PRESENT');texts[relay]=read(path.join(here,'unified-delivery'),'bound-telegram-relay.mjs');
 const guard='src/native-liquidation-guard.mjs';if(fs.existsSync(path.join(runtime,guard)))throw Error('NEW_GUARD_ALREADY_PRESENT');texts[guard]=read(path.join(here,'unified-delivery'),'native-liquidation-guard.mjs');
 for(const f of fs.readdirSync(path.join(root,'src')).filter(x=>x.endsWith('.mjs'))){const rel='src/liquidation-extension/'+f;if(fs.existsSync(path.join(runtime,rel)))throw Error('NEW_EXTENSION_PATH_OCCUPIED');texts[rel]=read(path.join(root,'src'),f);}
 // Pinned SDK is installed separately by candidate CI with npm ci --ignore-scripts.
 texts['src/liquidation-extension/package.json']=read(root,'package.json');texts['src/liquidation-extension/package-lock.json']=read(root,'package-lock.json');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'r2liq-syntax-'));try{let i=0;for(const [rel,t] of Object.entries(texts)){if(!/\.(mjs|js)$/.test(rel))continue;const f=path.join(tmp,++i+'.mjs');fs.writeFileSync(f,t);const x=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(x.status!==0)throw Error('PREWRITE_SYNTAX_ERROR:'+rel+':'+x.stderr);}}finally{fs.rmSync(tmp,{recursive:true,force:true});}
 return texts;
}
export function applyAfterUnified(runtime){
 const proofPath=path.join(runtime,'postv7-liquidation-extension-proof.json');
 if(fs.existsSync(proofPath)){const p=JSON.parse(fs.readFileSync(proofPath,'utf8'));if(!p.files?.length||p.files.some(x=>!fs.existsSync(path.join(runtime,x.path))||hash(fs.readFileSync(path.join(runtime,x.path)))!==x.sha256))throw Error('PREVIOUS_INSTALLATION_CHANGED');return {...p,status:'ALREADY_APPLIED_EXACT'};}
 const texts=planAfterUnified(runtime),backups=[];
 const proof={schema:'POSTV7_LIQUIDATION_EXTENSION_V1',status:'APPLIED_TO_LOCAL_RUNTIME_ONLY',base_main:'f7c5c77acfc2640c2c9b396d61560d33bf4fa263',requires_preceding_unified_candidate:true,base_candidate_worker:EXPECTED_UNIFIED_BASE['src/worker.js'],expected_worker_sha256:hash(texts['src/worker.js']),files:Object.entries(texts).map(([path,t])=>({path,sha256:hash(t),bytes:Buffer.byteLength(t)})),production_changed:false,source_mode_default_off:true,actual_publication_path_preserved:true,trade_execution:false};
 try{for(const [rel,t] of Object.entries(texts)){const p=path.join(runtime,rel);backups.push({p,b:fs.existsSync(p)?fs.readFileSync(p):null});fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,t);if(hash(fs.readFileSync(p))!==hash(t))throw Error('POSTWRITE_HASH_MISMATCH');}fs.writeFileSync(proofPath,JSON.stringify(proof,null,2));}
 catch(e){for(const x of backups.reverse()){if(x.b===null)fs.rmSync(x.p,{force:true});else fs.writeFileSync(x.p,x.b);}fs.rmSync(proofPath,{force:true});throw e;}
 return proof;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyAfterUnified(path.resolve(process.argv[2]))));
