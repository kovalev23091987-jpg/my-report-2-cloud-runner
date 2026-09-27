import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here),sha=x=>createHash('sha256').update(x).digest('hex');
const expected={'canonical-runtime-adapter.mjs':'fe7cde5da24ff5b5114d666b7b1f2b1fb1c2494aff1fc5701b5e208b0d42b9c4','canonical-interest-score.mjs':'73ea06f009fad6739ea67c1f6b22db29852a88231bab49a207d3847ce3407332','source-role-consumer.mjs':'03f40361a45bd164c2a18f617264a2e12d1165526e1bb2942004c9e21bcfaf4f','source-role-registry.mjs':'7c38a7757abde79d882a02d4734483f230a6f1bbe7e3605ce057c67f6b9bca99'};
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('EXACT_POSTV7_ANCHOR_REQUIRED:'+a.slice(0,70));return s.replace(a,b);};
export function prepareExactPostV7(){
 fs.mkdirSync(path.join(here,'proof'),{recursive:true});
 const proofs=[];
 for(const variant of ['before','after']){
  const dest=path.join(root,'.verification','postv7-'+variant);fs.rmSync(dest,{recursive:true,force:true});fs.cpSync(path.join(here,'fixtures','base-runtime'),dest,{recursive:true});
  for(const [name,hash] of Object.entries(expected)){const b=fs.readFileSync(path.join(here,'fixtures','postv7-canonical',name));if(sha(b)!==hash)throw Error('POSTV7_CANONICAL_BASE_CHANGED:'+name);fs.writeFileSync(path.join(dest,'src',name),b);}
  if(variant==='after'){
   fs.cpSync(path.join(root,'src'),path.join(dest,'src','liquidation-extension'),{recursive:true});
   const adapter=path.join(dest,'src/canonical-runtime-adapter.mjs');let s=fs.readFileSync(adapter,'utf8');s="import {attachNativeContext} from './liquidation-extension/runtime-bridge.mjs';\n"+s;
   s=once(s,'existing_source_receipts=null,previous_snapshot_context=null,oi_window_receipts=null,','existing_source_receipts=null,previous_snapshot_context=null,oi_window_receipts=null,native_liquidation_acquisition=null,');
   s=once(s,' const canonical=buildCanonicalAnalyticalResult({'," const liquidationContext=attachNativeContext(pump,native_liquidation_acquisition,{contract,run_id,snapshot_id,observed_ts,direction});\n const canonical=buildCanonicalAnalyticalResult({");
   s=once(s,'liquidations:pump,data_quality:','liquidations:liquidationContext,data_quality:');fs.writeFileSync(adapter,s);
   // Preserve the actual saved manual layout. The real bound sender, not the
   // legacy compact preview, is the owner of Telegram delivery in the unified package.
   const manual=path.join(dest,'src/manual-report-formatter.mjs');let m=fs.readFileSync(manual,'utf8');m="import {nativeLiquidationLines,validateNativeLiquidationContext} from './liquidation-extension/native-liquidation-guard.mjs';\n"+m;
   const marker=" if(result.liquidations?.pump?.is_pump===true)lines.push('','ПАМП И ЛИКВИДАЦИИ',`Выше: ${result.liquidations.above?.length||0} подтверждённых зон.`,`Ниже: ${result.liquidations.below?.length||0} подтверждённых зон.`);";
   m=once(m,marker," const nativeLiq=nativeLiquidationLines(result.liquidations,{manual:true});\n if(nativeLiq!==null){const ng=validateNativeLiquidationContext(result);if(!ng.ok)return{ok:false,status:ng.status,text:null};lines.push('',result.liquidations?.pump?.is_pump===true?'ПАМП И ЛИКВИДАЦИИ':'ЛИКВИДАЦИИ',...nativeLiq);}\n else "+marker.trim());fs.writeFileSync(manual,m);
   for(const f of [adapter,manual]){const c=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(c.status!==0)throw Error(c.stderr);}
  }
  proofs.push({variant,adapter_sha256:sha(fs.readFileSync(path.join(dest,'src/canonical-runtime-adapter.mjs'))),manual_sha256:sha(fs.readFileSync(path.join(dest,'src/manual-report-formatter.mjs'))),path:dest});
 }
 const p={status:'EXACT_UNIFIED_CANDIDATE_CANONICAL_AND_SAVED_MANUAL_STAGED',original_archive_sha256:'d81e6ad1678896a0205fafe183d183468720c17b262e51dceb9cbace46135148',proofs,production_changed:false,complete_worker_import:false};fs.writeFileSync(path.join(here,'proof','exact-postv7-bridge.json'),JSON.stringify(p,null,2));return p;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepareExactPostV7()));
