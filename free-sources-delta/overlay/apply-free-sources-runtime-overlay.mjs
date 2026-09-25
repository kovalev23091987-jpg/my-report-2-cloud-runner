import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
export const FREE_SOURCES_OVERLAY_VERSION='my-report-2-free-sources-overlay-v1-20260925';
const overlayDir=path.dirname(fileURLToPath(import.meta.url));const sourceDir=path.join(overlayDir,'src');const manifest=JSON.parse(fs.readFileSync(path.join(overlayDir,'manifest.json'),'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');const shaFile=p=>sha(fs.readFileSync(p));const fail=m=>{throw new Error(`FREE_SOURCES_OVERLAY_REFUSED:${m}`);};
function targetState(runtime,entry){const p=path.join(runtime,entry.path);if(!fs.existsSync(p))return 'ABSENT';const h=shaFile(p);if(h===entry.before_sha256)return 'BEFORE';if(h===entry.after_sha256||h===entry.sha256)return 'AFTER';return `UNKNOWN:${h}`;}
function sourceHash(entry){const p=path.join(sourceDir,entry.source);if(!fs.existsSync(p))fail(`SOURCE_MISSING:${entry.source}`);const h=shaFile(p),expected=entry.after_sha256||entry.sha256;if(h!==expected)fail(`SOURCE_SHA_MISMATCH:${entry.source}:${h}`);return h;}
function proof(already=false){return {version:FREE_SOURCES_OVERLAY_VERSION,status:already?'ALREADY_APPLIED':'APPLIED',production_base:manifest.production_base,existing_files:manifest.existing_files.map(x=>({path:x.path,before_sha256:x.before_sha256,after_sha256:x.after_sha256})),new_files:manifest.new_files.map(x=>({path:x.path,sha256:x.sha256})),...manifest.safety};}
export function applyFreeSourcesRuntimeOverlay(runtimeDir){
 const runtime=path.resolve(runtimeDir);for(const e of [...manifest.existing_files,...manifest.new_files])sourceHash(e);
 const es=manifest.existing_files.map(e=>({...e,state:targetState(runtime,e)}));const ns=manifest.new_files.map(e=>({...e,state:targetState(runtime,e)}));
 if(es.every(x=>x.state==='AFTER')&&ns.every(x=>x.state==='AFTER')){const p=proof(true);fs.writeFileSync(path.join(runtime,'free-sources-overlay-proof.json'),JSON.stringify(p,null,2)+'\n');return p;}
 if(!es.every(x=>x.state==='BEFORE'))fail(`NON_ATOMIC_EXISTING_STATE:${es.map(x=>`${x.path}=${x.state}`).join(',')}`);
 if(!ns.every(x=>x.state==='ABSENT'))fail(`NON_ATOMIC_NEW_STATE:${ns.map(x=>`${x.path}=${x.state}`).join(',')}`);
 const prepared=[],backups=[],created=[];
 try{
   for(const e of es){const target=path.join(runtime,e.path),tmp=`${target}.free-sources.tmp`,backup=`${target}.free-sources.backup`;fs.copyFileSync(path.join(sourceDir,e.source),tmp);fs.chmodSync(tmp,fs.statSync(target).mode);if(shaFile(tmp)!==e.after_sha256)fail(`PREPARED_SHA_MISMATCH:${e.path}`);prepared.push({kind:'existing',target,tmp,backup,after:e.after_sha256});}
   for(const e of ns){const target=path.join(runtime,e.path),tmp=`${target}.free-sources.tmp`;fs.copyFileSync(path.join(sourceDir,e.source),tmp);if(shaFile(tmp)!==e.sha256)fail(`PREPARED_SHA_MISMATCH:${e.path}`);prepared.push({kind:'new',target,tmp,after:e.sha256});}
   for(const x of prepared.filter(x=>x.kind==='existing')){fs.renameSync(x.target,x.backup);backups.push(x);fs.renameSync(x.tmp,x.target);}
   for(const x of prepared.filter(x=>x.kind==='new')){fs.renameSync(x.tmp,x.target);created.push(x.target);}
   for(const x of prepared)if(shaFile(x.target)!==x.after)fail(`POST_INSTALL_SHA_MISMATCH:${path.relative(runtime,x.target)}`);
   for(const x of backups)fs.rmSync(x.backup,{force:true});const p=proof(false);fs.writeFileSync(path.join(runtime,'free-sources-overlay-proof.json'),JSON.stringify(p,null,2)+'\n');return p;
 }catch(err){for(const x of prepared)fs.rmSync(x.tmp,{force:true});for(const p of created)fs.rmSync(p,{force:true});for(const x of [...backups].reverse()){fs.rmSync(x.target,{force:true});if(fs.existsSync(x.backup))fs.renameSync(x.backup,x.target);}if(String(err?.message||err).startsWith('FREE_SOURCES_OVERLAY_REFUSED:'))throw err;fail(`ATOMIC_INSTALL_FAILED:${String(err?.message||err)}`);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){const p=applyFreeSourcesRuntimeOverlay(process.argv[2]||'runtime');console.log('FREE_SOURCES_OVERLAY_APPLIED',JSON.stringify(p));}
