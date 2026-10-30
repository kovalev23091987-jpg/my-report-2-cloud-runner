import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const P='checkpoints/existing-fallback-statistics-connected-20261023',OUT='audit-output/existing-fallback-statistics-connected',sha=b=>createHash('sha256').update(b).digest('hex');
test('one new connected Bitget fallback and observed-zero statistics qualification',async()=>{
 const root=process.cwd(),out=join(root,OUT);await fs.mkdir(out,{recursive:true});
 const save=async(n,v)=>fs.writeFile(join(out,n),JSON.stringify(v,null,2)+'\n');
 const progress={schema:'FIRST_EXISTING_FALLBACK_STATISTICS_CONNECTED_V1',node:process.version,components:[],new_controlled_groups:0,new_controlled_variants:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,full_private_assembly:false,stage:'BEFORE_IMPORTS',baseline_removed:false};
 let baseline;const oldFetch=globalThis.fetch;
 try{
  const pins=JSON.parse(await fs.readFile(join(root,P,'qualification-pins.json'),'utf8'));
  const check=async()=>{for(const [p,x]of Object.entries(pins.files)){const b=await fs.readFile(join(root,p));assert.equal(b.length,x.bytes,p);assert.equal(sha(b),x.sha256,p);}};
  await check();progress.pinned_files=Object.keys(pins.files).length;await save('common-result.json',progress);
  const sourceBinding=JSON.parse(await fs.readFile(join(root,'checkpoints/source-worker-source-order-fallback-20261023/input-binding.json'),'utf8'));
  const statBinding=JSON.parse(await fs.readFile(join(root,'anomaly-research/history-statistics-consumer-20261023/target-bindings.json'),'utf8'));
  baseline=await fs.mkdtemp(join(tmpdir(),'report2-existing-blocks-baseline-'));
  for(const [p,pin]of Object.entries(sourceBinding.public_import_closure)){
   const b=execFileSync('git',['show','4969da83d00e47c00e48d91ad898e4c1575c1f92:'+p],{cwd:root,maxBuffer:2*1024*1024});
   const expected=p===sourceBinding.target?sourceBinding.before:pin;assert.equal(b.length,expected.bytes,p);assert.equal(sha(b),expected.sha256,p);
   await fs.mkdir(dirname(join(baseline,p)),{recursive:true});await fs.writeFile(join(baseline,p),b);
  }
  const oldStat=execFileSync('git',['show','4969da83d00e47c00e48d91ad898e4c1575c1f92:'+statBinding.target],{cwd:root});assert.equal(sha(oldStat),statBinding.before.sha256);assert.equal(oldStat.length,statBinding.before.bytes);
  progress.actual_baseline_public_closure_files=Object.keys(sourceBinding.public_import_closure).length;progress.baseline_outside_artifact=true;progress.stage='BITGET';await save('common-result.json',progress);
  globalThis.fetch=()=>{throw Error('NATIVE_NETWORK_FORBIDDEN');};
  const source=await import(pathToFileURL(join(root,'checkpoints/source-worker-source-order-fallback-20261023/connected.mjs')).href);
  const first=await source.runBitgetKnownMetadataCacheFallbackConnected({repo_root:root,baseline_repo_root:baseline});await save('bitget-result.json',first);
  progress.components.push({name:'bitget',groups:first.completed_groups,variants:first.completed_variants.length});progress.new_controlled_groups+=first.completed_groups;progress.new_controlled_variants+=first.completed_variants.length;progress.stage='BITGET_RETURN_SAVED';await save('common-result.json',progress);
  assert.equal(first.completed_groups,1);assert.equal(first.completed_variants.length,14);assert.equal(first.native_provider_SQL_IO,0);
  progress.stage='STATISTICS';const stats=await import(pathToFileURL(join(root,'anomaly-research/history-statistics-consumer-20261023/observed-zero-profile-case.proposed.mjs')).href);
  const second=await stats.runObservedZeroStatisticsProfileCase({repo_root:root});await save('statistics-result.json',second);
  progress.components.push({name:'statistics',groups:second.new_groups,variants:second.new_variants});progress.new_controlled_groups+=second.new_groups;progress.new_controlled_variants+=second.new_variants;progress.stage='STATISTICS_RETURN_SAVED';await save('common-result.json',progress);
  assert.equal(second.new_groups,1);assert.equal(second.new_variants,16);assert.equal(second.productionweights_changed,false);
  progress.stage='POSTPINS';await check();progress.pins_before_after_equal=true;assert.equal(progress.new_controlled_groups,2);assert.equal(progress.new_controlled_variants,30);progress.stage='CONTROLLED_COMPONENTS_COMPLETE';
 }catch(error){progress.error={name:error.name,message:error.message,stack:error.stack};if(error.partial_result)await save(progress.stage==='STATISTICS'?'statistics-partial-result.json':'bitget-partial-result.json',error.partial_result);throw error;}
 finally{globalThis.fetch=oldFetch;try{if(baseline)await fs.rm(baseline,{recursive:true,force:true});progress.baseline_removed=true;}catch(error){progress.cleanup_error={message:error.message};throw error;}finally{await save('common-result.json',progress);}}
});
