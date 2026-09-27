import fs from 'node:fs/promises';import path from 'node:path';import {fingerprint} from './core.mjs';
export function createCanonicalCapture({directory}={}){
 if(typeof directory!=='string'||!directory)throw Error('CAPTURE_DIRECTORY_REQUIRED');
 const root=path.resolve(directory);const captured=[];
 const capture=async({canonical}={})=>{
  if(canonical?.status!=='CLOSED'||!canonical.liquidations?.native_extension)return {status:'NO_NATIVE_CONTEXT',written:false};
  const {analytical_fingerprint:f,...body}=canonical;
  if(fingerprint(body)!==f)throw Error('CANONICAL_CAPTURE_FINGERPRINT_MISMATCH');
  const key=fingerprint({run:canonical.run_id,snapshot:canonical.snapshot_id,observed:canonical.observed_ts,contract:canonical.metadata?.contract,fingerprint:f});
  await fs.mkdir(root,{recursive:true});const dest=path.join(root,key+'.json');
  const text=JSON.stringify(canonical);if(Buffer.byteLength(text)>250000)throw Error('CAPTURE_CANONICAL_MAX_BYTES');
  try{const old=await fs.readFile(dest,'utf8');if(old!==text)throw Error('CAPTURE_COLLISION');return {status:'ALREADY_CAPTURED_IDENTICAL',written:false,analytical_fingerprint:f};}catch(e){if(e.code!=='ENOENT')throw e;}
  const tmp=dest+'.tmp-'+process.pid;
  try{await fs.writeFile(tmp,text,{flag:'wx',mode:0o600});await fs.rename(tmp,dest);const back=JSON.parse(await fs.readFile(dest,'utf8'));const {analytical_fingerprint:g,...rest}=back;if(g!==f||fingerprint(rest)!==f)throw Error('CAPTURE_READBACK_FAILED');}
  finally{await fs.rm(tmp,{force:true});}
  const result={status:'EXACT_CANONICAL_FILE_READBACK',written:true,analytical_fingerprint:f,bytes:Buffer.byteLength(text),local_artifact_only:true,d1_publication:false,telegram_sent:false};captured.push(result);return result;
 };
 return {capture,summary:()=>({captured:captured.length,rows:captured,production_publication:false})};
}
