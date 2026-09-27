import fs from 'node:fs';import os from 'node:os';import {spawnSync} from 'node:child_process';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const here=path.dirname(fileURLToPath(import.meta.url));
const BASE={
 'src/worker.js':['a2b3c2d364202b3cbbd3a40407733cb5d385f01b70e43786066fbeb84bb25225','d4310484b937d26f1836e51228c53584a72a537bc42538dae869e7ec6a80b922'],
 'src/canonical-runtime-adapter.mjs':['0f74fa78339a676f65fff06cf968a638b8b33af25ff4dfbde3c7caea1d48245f','fe7cde5da24ff5b5114d666b7b1f2b1fb1c2494aff1fc5701b5e208b0d42b9c4'],
 'src/manual-report-formatter.mjs':['8fd1bca6a5bf2aef0f70a2adf7a058fe76f1b90e7dce107c028da19f0ee738b1'],
 'src/telegram-compact-formatter.mjs':['61ae6f0bdf1096cbc548662dc8597ee3e6ec49edaed6a531c85641b4ac811e65'],
};
function once(s,a,b){if(s.split(a).length!==2)throw Error('EXACT_SINGLE_ANCHOR_REQUIRED:'+a.slice(0,90));return s.replace(a,b);}
export function prepareIntegration(root){
 const prepared=[];
 for(const [rel,allowed] of Object.entries(BASE)){
  const p=path.join(root,rel);const before=fs.readFileSync(p,'utf8');const digest=sha(before);if(!allowed.includes(digest))throw Error('EXACT_FILE_BASE_REQUIRED:'+rel+':'+digest);
  let s=before;
  if(rel.endsWith('/worker.js')){
   s="import { acquireLiquidationsForDeepCheck } from './liq-extension/integration/src/liq-deep-hook.mjs';\n"+s;
   const anchor='  // Receipt observation cannot predate completion of its market inputs.\n  now = Date.now();';
   s=once(s,anchor,"  const freeLiquidationAcquisition = await acquireLiquidationsForDeepCheck(\n    env?.REPORT2_LIQUIDATION_EXTENSION_SERVICE, {contract,run_id:params?.run_id,cycle_started_ts:cycleStartedTs}\n  );\n"+anchor);
   s=once(s,'    buildRuntimeCanonicalBundle({\n      contract,','    buildRuntimeCanonicalBundle({\n      free_liquidation_acquisition: freeLiquidationAcquisition,\n      contract,');
   s=once(s,'      run_id:\n        String(params?.run_id || "").trim() ||\n        `manual-shadow-${now}`,','      run_id:\n        String(params?.run_id || "").trim() ||\n        freeLiquidationAcquisition?.run_id || `manual-shadow-${now}`,');
  }else if(rel.endsWith('canonical-runtime-adapter.mjs')){
   s="import { buildEarlyLiquidationView } from './liq-extension/integration/src/liq-canonical-context.mjs';\n"+s;
   s=once(s,' existing_source_receipts=null,previous_snapshot_context=null,',' free_liquidation_acquisition=null,existing_source_receipts=null,previous_snapshot_context=null,');
   s=once(s,' const overall=finite(publication_shadow?.score_interval?.score_lower_bound);'," const liquidationView=buildEarlyLiquidationView({legacy:pump,acquisition:free_liquidation_acquisition,contract,run_id,snapshot_id,observed_ts});\n const overall=finite(publication_shadow?.score_interval?.score_lower_bound);");
   s=once(s,'liquidations:pump,data_quality:','liquidations:liquidationView,data_quality:');
  }else if(rel.endsWith('manual-report-formatter.mjs')){
   s="import { canonicalLiqLines } from './liq-extension/integration/src/liq-canonical-context.mjs';\n"+s;
   const a=" if(result.liquidations?.pump?.is_pump===true)lines.push('','ПАМП И ЛИКВИДАЦИИ',`Выше: ${result.liquidations.above?.length||0} подтверждённых зон.`,`Ниже: ${result.liquidations.below?.length||0} подтверждённых зон.`);";
   s=once(s,a," const nativeLiqLines=canonicalLiqLines(result.liquidations,{manual:true});\n if(nativeLiqLines)lines.push('',result.liquidations?.pump?.is_pump===true?'ПАМП И ЛИКВИДАЦИИ':'ЛИКВИДАЦИИ',...nativeLiqLines);\n else "+a.trimStart());
  }else{
   s="import { canonicalLiqLines } from './liq-extension/integration/src/liq-canonical-context.mjs';\n"+s;
   const a=" if(result.liquidations?.pump?.is_pump===true){lines.push('Ликвидации:',liqSide(result.liquidations.above,'Выше — продавцы'),liqSide(result.liquidations.below,'Ниже — покупатели'));}";
   s=once(s,a," const nativeLiqLines=canonicalLiqLines(result.liquidations);\n if(nativeLiqLines)lines.push('Ликвидации:',...nativeLiqLines);\n else "+a.trimStart());
  }
  const checkDir=fs.mkdtempSync(path.join(os.tmpdir(),'liq-syntax-'));try{const checkFile=path.join(checkDir,'check.mjs');fs.writeFileSync(checkFile,s);const check=spawnSync(process.execPath,['--check',checkFile],{encoding:'utf8'});if(check.status!==0)throw Error('PREPARED_SYNTAX_INVALID:'+rel+':'+check.stderr);}finally{fs.rmSync(checkDir,{recursive:true,force:true});}
  prepared.push({path:rel,before_sha256:digest,after_sha256:sha(s),content:s});
 }
 return prepared;
}
export function applyIntegration(root){
 const existingProofPath=path.join(root,'liq-canonical-integration-proof.json');
 if(fs.existsSync(existingProofPath)){const old=JSON.parse(fs.readFileSync(existingProofPath,'utf8'));if(!Array.isArray(old.changed)||!Array.isArray(old.extension_files))throw Error('EXISTING_PROOF_NOT_REUSABLE');for(const x of old.changed)if(sha(fs.readFileSync(path.join(root,x.path)))!==x.after_sha256)throw Error('STAGED_RUNTIME_DRIFT');for(const x of old.extension_files)if(sha(fs.readFileSync(path.join(root,x.path)))!==x.sha256)throw Error('STAGED_EXTENSION_DRIFT');return {...old,idempotent:true,no_files_changed:true};}
 const staged=prepareIntegration(root);const extDst=path.join(root,'src/liq-extension');if(fs.existsSync(extDst))throw Error('NEW_EXTENSION_PATH_ALREADY_EXISTS');
 const backups=staged.map(x=>({path:path.join(root,x.path),bytes:fs.readFileSync(path.join(root,x.path))}));
 try{fs.mkdirSync(extDst,{recursive:true});for(const rel of ['src','integration/src'])fs.cpSync(path.join(here,'..',rel),path.join(extDst,rel),{recursive:true});
  for(const x of staged){fs.writeFileSync(path.join(root,x.path),x.content);if(sha(fs.readFileSync(path.join(root,x.path)))!==x.after_sha256)throw Error('POST_WRITE_HASH_MISMATCH');}
 }catch(e){for(const x of backups)fs.writeFileSync(x.path,x.bytes);fs.rmSync(extDst,{recursive:true,force:true});throw e;}
 const extension_files=[];const walk=p=>{for(const d of fs.readdirSync(p,{withFileTypes:true})){const f=path.join(p,d.name);if(d.isDirectory())walk(f);else if(d.isFile())extension_files.push({path:path.relative(root,f),sha256:sha(fs.readFileSync(f))});else throw Error('UNEXPECTED_EXTENSION_FILE_KIND');}};walk(extDst);
 const proof={extension_files,status:'STAGED_CANONICAL_INTEGRATION_NOT_DEPLOYED',changed:staged.map(({content,...x})=>x),collection_default_enabled:false,telegram_network:false,production_changed:false,full_runtime_import_proven:false};
 fs.writeFileSync(path.join(root,'liq-canonical-integration-proof.json'),JSON.stringify(proof,null,2));return proof;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))console.log(JSON.stringify(applyIntegration(path.resolve(process.argv[2])),null,2));
