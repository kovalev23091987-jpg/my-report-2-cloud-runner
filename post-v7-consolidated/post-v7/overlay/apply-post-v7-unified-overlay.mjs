import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareAvailabilityPatch} from './patches/preserve-producer-availability.mjs';

export const POST_V7_UNIFIED_OVERLAY_VERSION='post-v7-unified-remediation-candidate-v1-20260926';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const shaText=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=m=>{throw new Error(`POST_V7_UNIFIED_OVERLAY_REFUSED:${m}`)};
const BASE=Object.freeze({
  worker:'a2b3c2d364202b3cbbd3a40407733cb5d385f01b70e43786066fbeb84bb25225',
  canonical:'0f74fa78339a676f65fff06cf968a638b8b33af25ff4dfbde3c7caea1d48245f',
  full_evidence:'08d3a04240625a93ac067a4c89adbb5a1f57a2926b2a5e77e2dc490af9c16f61',
});
const TARGET=Object.freeze({
  worker:'d4310484b937d26f1836e51228c53584a72a537bc42538dae869e7ec6a80b922',
  canonical:'fe7cde5da24ff5b5114d666b7b1f2b1fb1c2494aff1fc5701b5e208b0d42b9c4',
  full_evidence:'82cb109313f7c87bcc4c7d1dbd461de8b3c5fe94b8cb687b417bd0c600a96a4a',
});
const replacements=[
  ['src/worker.js','files/src/worker.js',BASE.worker,TARGET.worker],
  ['src/canonical-runtime-adapter.mjs','files/src/canonical-runtime-adapter.mjs',BASE.canonical,TARGET.canonical],
];
const newModules=[
  'canonical-publication.mjs','publication-reconciler.mjs','bound-telegram-delivery-sidecar.mjs','recheck-scheduler.mjs','scheduler-control.mjs',
  'oi-window-receipt.mjs','score-origin-reader.mjs','canonical-interest-score.mjs','source-role-consumer.mjs','source-role-registry.mjs',
  'liquidation-normalizer.mjs','full-evidence-ack.mjs',
].map(n=>[`src/${n}`,`files/src/${n}`]);
function safeTarget(root,rel){const p=path.resolve(root,rel);if(!p.startsWith(path.resolve(root)+path.sep))fail(`UNSAFE_PATH:${rel}`);return p;}
function source(rel){const p=path.join(here,rel);if(!fs.existsSync(p))fail(`SOURCE_MISSING:${rel}`);return p;}
export function applyPostV7UnifiedOverlay(runtimeDir){
 const root=path.resolve(runtimeDir);if(!fs.existsSync(root))fail('RUNTIME_DIR_MISSING');
 const proof={version:POST_V7_UNIFIED_OVERLAY_VERSION,status:'PREPARING',runtime:root,base:BASE,target:TARGET,changed:[],added:[],safety:{production_changed:false,d1_migration:false,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,automatic_execution:false,validated_signal:false,live_probability:false,weights_35_30_20_15_changed:false,hard_gates_changed:false}};
 // exact V7 guards
 for(const [rel,srcRel,before,after] of replacements){const dst=safeTarget(root,rel),src=source(srcRel);if(!fs.existsSync(dst))fail(`TARGET_MISSING:${rel}`);const cur=sha(dst),srcHash=sha(src);if(srcHash!==after)fail(`PACKAGE_HASH_MISMATCH:${rel}:${srcHash}`);if(cur!==before&&cur!==after)fail(`EXACT_BASE_REQUIRED:${rel}:${cur}`);}
 const fe=safeTarget(root,'src/full-evidence-contract.mjs');if(!fs.existsSync(fe))fail('TARGET_MISSING:full-evidence-contract');const feCur=sha(fe);if(feCur!==BASE.full_evidence&&feCur!==TARGET.full_evidence)fail(`EXACT_BASE_REQUIRED:full-evidence-contract:${feCur}`);
 // prepare transformations before touching runtime
 const fePrepared=prepareAvailabilityPatch(fs.readFileSync(fe,'utf8'));if(fePrepared.after_sha256!==TARGET.full_evidence)fail(`FULL_EVIDENCE_TARGET_HASH:${fePrepared.after_sha256}`);
 for(const [rel,srcRel] of newModules){const src=source(srcRel),dst=safeTarget(root,rel);if(fs.existsSync(dst)&&sha(dst)!==sha(src))fail(`NEW_MODULE_COLLISION:${rel}:${sha(dst)}`);}
 const backups=[],created=[];
 try{
   // existing replacements
   for(const [rel,srcRel,before,after] of replacements){const dst=safeTarget(root,rel);if(sha(dst)===after)continue;const bak=dst+'.post-v7-unified.backup';fs.copyFileSync(dst,bak);backups.push([dst,bak]);fs.copyFileSync(source(srcRel),dst);if(sha(dst)!==after)throw new Error(`POST_WRITE_HASH:${rel}`);proof.changed.push({path:rel,before_sha256:before,after_sha256:after});}
   if(sha(fe)!==TARGET.full_evidence){const bak=fe+'.post-v7-unified.backup';fs.copyFileSync(fe,bak);backups.push([fe,bak]);fs.writeFileSync(fe,fePrepared.content);if(sha(fe)!==TARGET.full_evidence)throw new Error('POST_WRITE_HASH:full-evidence-contract');proof.changed.push({path:'src/full-evidence-contract.mjs',before_sha256:BASE.full_evidence,after_sha256:TARGET.full_evidence});}
   for(const [rel,srcRel] of newModules){const dst=safeTarget(root,rel),src=source(srcRel);if(fs.existsSync(dst))continue;fs.copyFileSync(src,dst);created.push(dst);proof.added.push({path:rel,sha256:sha(dst)});}
   // static safety assertions
   const worker=fs.readFileSync(safeTarget(root,'src/worker.js'),'utf8');
   for(const x of ["INSERT INTO full_evidence_shadow_log","ON CONFLICT(full_evidence_id) DO NOTHING","SCHEMA_NOT_CLOSED","persistCanonicalSnapshot","claimDueRecheck","LIVE_RECHECK"])if(!worker.includes(x))throw new Error(`WORKER_ASSERTION_MISSING:${x}`);
   if(worker.includes('INSERT OR IGNORE INTO full_evidence_shadow_log'))throw new Error('FULL_EVIDENCE_OR_IGNORE_STILL_PRESENT');
   const can=fs.readFileSync(safeTarget(root,'src/canonical-runtime-adapter.mjs'),'utf8');for(const x of ['computeCanonicalInterestFromRuntime','source_role_view','oi_window_receipts'])if(!can.includes(x))throw new Error(`CANONICAL_ASSERTION_MISSING:${x}`);
   for(const [,bak] of backups)fs.rmSync(bak,{force:true});proof.status=proof.changed.length||proof.added.length?'APPLIED':'ALREADY_APPLIED';fs.writeFileSync(path.join(root,'post-v7-unified-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');return proof;
 }catch(error){for(const p of created)fs.rmSync(p,{force:true});for(const [dst,bak] of backups.reverse()){fs.rmSync(dst,{force:true});if(fs.existsSync(bak))fs.renameSync(bak,dst);}fail(`ATOMIC_INSTALL_FAILED:${String(error?.message||error)}`);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyPostV7UnifiedOverlay(process.argv[2]||'runtime'),null,2));
