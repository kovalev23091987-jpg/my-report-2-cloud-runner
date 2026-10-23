import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const P='checkpoints/independent-capture-and-origin-connected-20261023',out='audit-output/independent-capture-and-origin';
const sha=b=>createHash('sha256').update(b).digest('hex');
const enc=x=>JSON.stringify(x,null,2)+'\n';
async function inventory(root){const rows={};async function walk(at,pre=''){for(const ent of await fs.readdir(at,{withFileTypes:true})){const rel=pre?pre+'/'+ent.name:ent.name,p=path.join(at,ent.name),s=await fs.lstat(p);assert(!s.isSymbolicLink());if(s.isDirectory())await walk(p,rel);else{assert(s.isFile());rows[rel]=sha(await fs.readFile(p));}}}await walk(root);return Object.fromEntries(Object.entries(rows).sort(([a],[b])=>a.localeCompare(b)));}
test('one new independent capture and exact context origins chain',async()=>{
 const plan=JSON.parse(await fs.readFile(P+'/qualification-plan.json','utf8')),runtime=path.resolve('runtime');
 await fs.mkdir(out,{recursive:true});let temp=null,active=null;const completed=[],summary={schema:'FIRST_INDEPENDENT_CAPTURE_AND_CONTEXT_ORIGIN_COMMON_V1',old_components_replayed:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,private_module_bodies_exported:false,components:completed};
 try{
  for(const [p,pin]of Object.entries(plan.runtime_pins))assert.equal(sha(await fs.readFile(path.join(runtime,p))),pin,p);
  const current=await inventory(runtime);assert.equal(Object.keys(current).length,plan.expected_assembled_files);summary.actual_assembled_files=Object.keys(current).length;summary.actual_assembled_inventory_sha256=sha(enc(current));
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'report2-independent-origin-'));assert(!path.resolve(temp).startsWith(path.resolve(out)+path.sep));
  const globalOld=path.join(temp,'global-old');await fs.cp(runtime,globalOld,{recursive:true,errorOnExist:true,force:false});
  for(const target of plan.targets){const b=execFileSync('git',['show',plan.expected_main+':'+target.repo_path],{encoding:null,maxBuffer:4*1024*1024,env:{...process.env,GIT_NO_LAZY_FETCH:'1'}});assert.equal(b.length,target.before_bytes);assert.equal(sha(b),target.before_sha256);await fs.writeFile(path.join(globalOld,target.runtime_path),b);}
  const old=await inventory(globalOld);assert.deepEqual(Object.keys(old),Object.keys(current));const diff=Object.keys(old).filter(p=>old[p]!==current[p]);assert.deepEqual(diff.sort(),plan.targets.map(t=>t.runtime_path).sort());summary.actual_global_old_inventory_sha256=sha(enc(old));summary.global_old_basis='Same actual encrypted-base assembly and unchanged assembler; only exact pre-change Git blobs restored for declared direct-copy overlay targets';summary.other_runtime_files_byte_equal=Object.keys(old).length-diff.length;
  await fs.writeFile(out+'/assembly-pair.json',enc({...summary,actual_changed_runtime_paths:diff,private_file_bodies_exported:false}));
  for(const component of plan.components){active=component.output;const stage=path.join(temp,component.name+'-before');await fs.cp(runtime,stage,{recursive:true,errorOnExist:true,force:false});for(const rel of component.baseline_targets){const target=plan.targets.find(t=>t.runtime_path===rel);assert(target);await fs.copyFile(path.join(globalOld,rel),path.join(stage,rel));}
   const stageInv=await inventory(stage),stageDiff=Object.keys(current).filter(p=>current[p]!==stageInv[p]);assert.deepEqual(stageDiff.sort(),[...component.baseline_targets].sort());
   const source=await fs.readFile(component.path);assert.equal(sha(source),component.sha256);let result;
   try{const mod=await import(pathToFileURL(path.resolve(component.path)));result=await mod[component.export]({repo_root:process.cwd(),runtime_root:runtime,baseline_runtime_root:stage});}
   catch(error){await fs.writeFile(out+'/'+component.output.replace('.json','-partial.json'),enc({schema:'NEW_COMPONENT_PARTIAL_BEFORE_THROW_V1',component:component.name,message:error.message,code:error.code??null,partial:error.partial_result??error.partialResult??null}));throw error;}
   await fs.writeFile(out+'/'+component.output,enc(result));completed.push({name:component.name,output:component.output,sha256:sha(enc(result)),status:result?.status,actual_groups:result?.[component.groups_field],actual_variants:result?.[component.variants_field],qualified:false});await fs.writeFile(out+'/completed-components.json',enc(completed));
   if(component.expected_status!==null)assert.equal(result?.status,component.expected_status);
   if(component.groups_field)assert.equal(result?.[component.groups_field],component.groups);
   if(component.variants_field)assert.equal(result?.[component.variants_field],component.variants);
   completed[completed.length-1].qualified=true;await fs.writeFile(out+'/completed-components.json',enc(completed.filter(x=>x.qualified))); 
  }
  for(const [p,pin]of Object.entries(plan.runtime_pins))assert.equal(sha(await fs.readFile(path.join(runtime,p))),pin,p);
  summary.status='COMPLETE';summary.actual_NEW_CONTROLLED_groups=completed.reduce((n,c)=>n+c.actual_groups,0);summary.actual_NEW_CONTROLLED_variants=completed.reduce((n,c)=>n+c.actual_variants,0);assert.equal(summary.actual_NEW_CONTROLLED_groups,plan.total_new_groups);assert.equal(summary.actual_NEW_CONTROLLED_variants,plan.total_new_variants);
 }catch(error){await fs.writeFile(out+'/failure-context.json',enc({schema:'FIRST_NEW_COMMON_FAILURE_V1',message:error.message,code:error.code??null,active_component:active,completed,partial:error.partial_result??error.partialResult??null}));throw error;}
 finally{if(temp){await fs.rm(temp,{recursive:true,force:false});summary.temp_fixture_cleanup_removed=true;}await fs.writeFile(out+'/common-summary.json',enc(summary));}
});
