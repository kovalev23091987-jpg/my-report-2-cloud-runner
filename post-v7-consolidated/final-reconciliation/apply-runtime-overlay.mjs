import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const sha=x=>createHash('sha256').update(x).digest('hex');
export function applyFinalReconciliation(runtime){
 const manifest=JSON.parse(fs.readFileSync(path.join(here,'runtime-manifest.json'),'utf8'));
 const proofPath=path.join(runtime,'full-runtime-reconciliation-proof.json');
 if(fs.existsSync(proofPath)){
  const proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));
  if(sha(JSON.stringify(proof.files))!==sha(JSON.stringify(manifest.files))||manifest.files.some(f=>!fs.existsSync(path.join(runtime,f.path))||sha(fs.readFileSync(path.join(runtime,f.path)))!==f.after_sha256))throw Error('FINAL_INSTALLATION_CHANGED');
  return {...proof,status:'ALREADY_APPLIED_EXACT'};
 }
 const changes=manifest.files.map(f=>{
  const target=path.join(runtime,f.path),exists=fs.existsSync(target),before=exists?fs.readFileSync(target):null;
  if((exists?sha(before):null)!==f.before_sha256)throw Error('EXACT_MERGED_BASE_REQUIRED:'+f.path);
  const source=path.join(here,'files',f.path),after=fs.readFileSync(source);
  if(sha(after)!==f.after_sha256)throw Error('OVERLAY_CONTENT_CHANGED:'+f.path);
  if(/\.m?js$/.test(f.path)&&spawnSync(process.execPath,['--check',source]).status!==0)throw Error('SYNTAX_NOT_CLOSED:'+f.path);
  return {target,before,after};
 });
 const proof={schema:'FULL_RUNTIME_RECONCILIATION_V1',status:'APPLIED_LOCAL_RUNTIME',...manifest,production_deployed:false,market_requests:0,telegram_sent:false};
 try{
  for(const c of changes){fs.mkdirSync(path.dirname(c.target),{recursive:true});fs.writeFileSync(c.target,c.after);if(sha(fs.readFileSync(c.target))!==sha(c.after))throw Error('WRITE_READBACK_FAILED');}
  fs.writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
 }catch(e){for(const c of changes.reverse()){if(c.before===null)fs.rmSync(c.target,{force:true});else fs.writeFileSync(c.target,c.before);}fs.rmSync(proofPath,{force:true});throw e;}
 return proof;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyFinalReconciliation(path.resolve(process.argv[2]))));
