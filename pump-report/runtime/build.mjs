import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=text=>createHash('sha256').update(text).digest('hex');
export function buildArtifact({legacy_path,output_path,module_overrides={}}){
  if(!legacy_path||!output_path)throw Error('RETAINED_LEGACY_AND_OUTPUT_PATH_REQUIRED');
  const modules={},visit=name=>{
    if(modules[name])return;
    const text=name==='legacy-worker.mjs'?fs.readFileSync(legacy_path,'utf8'):Object.hasOwn(module_overrides,name)?module_overrides[name]:fs.readFileSync(path.join(root,name),'utf8');
    if(typeof text!=='string')throw Error('MODULE_TEXT_REQUIRED:'+name);
    modules[name]=text;
    if(/(?:\bfrom\s*|\bimport\s*)['"]node:/.test(text))throw Error('NODE_BUILTIN_IN_WORKER:'+name);
    for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)){
      const spec=match[1];if(!spec.startsWith('.'))throw Error('EXTERNAL_IMPORT_NOT_BUNDLED:'+name+':'+spec);
      const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),spec));
      if(dependency.startsWith('../')||dependency.startsWith('/'))throw Error('MODULE_PATH_ESCAPE');
      visit(dependency);
    }
  };
  visit('worker-entry.mjs');
  const pinModule='runtime/implementation-pin.mjs';let implementation_pin=null;
  if(Object.hasOwn(modules,pinModule)){
    const pinned=Object.fromEntries(Object.entries(modules).filter(([name])=>name!==pinModule).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,text])=>[name,digest(text)]));
    implementation_pin={schema:'PUMP_BUNDLED_IMPLEMENTATION_PIN_V1',sha256:digest(JSON.stringify(pinned)),modules:pinned,excluded_self_module:pinModule};
    modules[pinModule]='export const IMPLEMENTATION_PIN='+JSON.stringify(implementation_pin)+';\n';
  }
  const metadata={main_module:'worker-entry.mjs',compatibility_date:'2026-09-11',compatibility_flags:[],keep_bindings:['secret_text','plain_text','d1'],keep_assets:true};
  const manifest={schema:'PUMP_WORKER_ARTIFACT_V1',tz_sha256:'0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc',main_module:metadata.main_module,module_count:Object.keys(modules).length,implementation_pin,modules:Object.fromEntries(Object.entries(modules).map(([name,text])=>[name,{bytes:Buffer.byteLength(text),sha256:digest(text)}])),legacy_scheduled_invoked:false,schedules:[],native_market_proof:false,telegram_proof:false};
  const artifact={metadata,modules,manifest};fs.writeFileSync(output_path,JSON.stringify(artifact),{mode:0o600});
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildArtifact({legacy_path:process.argv[2],output_path:process.argv[3]})));
