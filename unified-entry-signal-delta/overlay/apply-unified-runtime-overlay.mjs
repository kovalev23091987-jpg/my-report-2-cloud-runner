import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const UNIFIED_OVERLAY_VERSION='my-report-2-unified-candidate-overlay-v2-20260924';
export const EXPECTED_PRODUCTION_WORKER_SHA='5eeb4e84c8158455112333ba0f2e53c23e21e612726fffafc30da6878fa69b46';
export const EXPECTED_WORKER_AFTER_SHA='4721646492cbf07fa4f2d1b2216d47116ee271fc38ac02aa6a98d95f547089f3';
export const EXPECTED_OPPORTUNITY_BEFORE_SHA='a5a5f8d762a3d3415ef4b186684b79b74b5eee7b7543dccee6cdaf8c4b6c64f7';
export const EXPECTED_OPPORTUNITY_AFTER_SHA='fd9af7bc700fc52a9e03ce61e66f6a7b5e3b30dd1f9657d4ebfd778f1da13719';
export const EXPECTED_SCENARIO_BEFORE_SHA='c26effff0a029fd877d1c79bee995c03985cc3fea9c05c2d43074d9b73496de4';
export const EXPECTED_SCENARIO_AFTER_SHA='af1b840afcbb1c939bb77c8d2a27b44ee2acf94e14192f00b31fdd656dbd889e';
export const EXPECTED_PUBLICATION_BEFORE_SHA='2c78617a6d2d62086f64a96b2a862a342c467671de553d48cdb71a535fe1d300';
export const EXPECTED_PUBLICATION_AFTER_SHA='41877000041d7dcc799a07a88deb8d935e2d367e237b2facb1ea02285a550c83';

const overlayDir=path.dirname(fileURLToPath(import.meta.url));
const sourceDir=path.join(overlayDir,'src');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const shaFile=p=>sha(fs.readFileSync(p));
function fail(msg){throw new Error(`UNIFIED_CANDIDATE_OVERLAY_REFUSED:${msg}`);}

const EXISTING_FILES=Object.freeze([
  {path:'src/worker.js',before:EXPECTED_PRODUCTION_WORKER_SHA,after:EXPECTED_WORKER_AFTER_SHA,source:'worker.js'},
  {path:'src/opportunity-intelligence-engine.mjs',before:EXPECTED_OPPORTUNITY_BEFORE_SHA,after:EXPECTED_OPPORTUNITY_AFTER_SHA,source:'opportunity-intelligence-engine.mjs'},
  {path:'src/tz101-scenario-plan.mjs',before:EXPECTED_SCENARIO_BEFORE_SHA,after:EXPECTED_SCENARIO_AFTER_SHA,source:'tz101-scenario-plan.mjs'},
  {path:'src/tz101-publication-runtime.mjs',before:EXPECTED_PUBLICATION_BEFORE_SHA,after:EXPECTED_PUBLICATION_AFTER_SHA,source:'tz101-publication-runtime.mjs'},
]);

const NEW_FILES=Object.freeze([
  'entry-signal-router.mjs',
  'entry-area-rule-v2.mjs',
  'capability-registry.mjs',
  'liquidation-evidence.mjs',
  'pump-liquidation-zones.mjs',
  'telegram-compact-formatter.mjs',
  'manual-report-formatter.mjs',
  'canonical-analytical-result.mjs',
  'canonical-runtime-adapter.mjs',
  'closed-minute-decomposition.mjs',
  'htx-turnover-gate.mjs',
  'early-candidate-bridge.mjs',
]);

function expectedSourceSha(entry){
  const source=path.join(sourceDir,entry.source);
  if(!fs.existsSync(source))fail(`SOURCE_MISSING:${entry.source}`);
  const actual=shaFile(source);
  if(actual!==entry.after)fail(`SOURCE_SHA_MISMATCH:${entry.source}:${actual}`);
  return actual;
}

function stateOf(target,before,after){
  if(!fs.existsSync(target))return 'MISSING';
  const actual=shaFile(target);
  if(actual===before)return 'BEFORE';
  if(actual===after)return 'AFTER';
  return `UNKNOWN:${actual}`;
}

function proofFor(runtime,{alreadyApplied=false}={}){
  return {
    version:UNIFIED_OVERLAY_VERSION,
    status:alreadyApplied?'ALREADY_APPLIED':'APPLIED',
    worker_before_sha256:EXPECTED_PRODUCTION_WORKER_SHA,
    worker_after_sha256:EXPECTED_WORKER_AFTER_SHA,
    opportunity_before_sha256:EXPECTED_OPPORTUNITY_BEFORE_SHA,
    opportunity_after_sha256:EXPECTED_OPPORTUNITY_AFTER_SHA,
    scenario_before_sha256:EXPECTED_SCENARIO_BEFORE_SHA,
    scenario_after_sha256:EXPECTED_SCENARIO_AFTER_SHA,
    publication_before_sha256:EXPECTED_PUBLICATION_BEFORE_SHA,
    publication_after_sha256:EXPECTED_PUBLICATION_AFTER_SHA,
    added_files:NEW_FILES.map(name=>`src/${name}`),
    external_request_delta:0,
    d1_query_delta_per_hot_cycle:2,
    d1_write_delta_per_hot_cycle:0,
    production_changed:false,
    hard_gates_bypassed:false,
    strategy_weights_changed:false,
    automatic_execution:false,
    validated_signal_enabled:false,
    live_probability_enabled:false,
    continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',
  };
}

export function applyUnifiedRuntimeOverlay(runtimeDir){
  const runtime=path.resolve(runtimeDir);
  for(const entry of EXISTING_FILES)expectedSourceSha(entry);

  const existingStates=EXISTING_FILES.map(entry=>({
    ...entry,
    target:path.join(runtime,entry.path),
    state:stateOf(path.join(runtime,entry.path),entry.before,entry.after),
  }));
  const newStates=NEW_FILES.map(name=>{
    const source=path.join(sourceDir,name);
    if(!fs.existsSync(source))fail(`SOURCE_MISSING:${name}`);
    const target=path.join(runtime,'src',name);
    const sourceSha=shaFile(source);
    const targetState=!fs.existsSync(target)?'ABSENT':(shaFile(target)===sourceSha?'AFTER':`UNKNOWN:${shaFile(target)}`);
    return {name,source,target,sourceSha,state:targetState};
  });

  const alreadyExisting=existingStates.every(x=>x.state==='AFTER');
  const alreadyNew=newStates.every(x=>x.state==='AFTER');
  if(alreadyExisting&&alreadyNew){
    const proof=proofFor(runtime,{alreadyApplied:true});
    fs.writeFileSync(path.join(runtime,'unified-candidate-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');
    return proof;
  }

  if(!existingStates.every(x=>x.state==='BEFORE')){
    fail(`NON_ATOMIC_EXISTING_STATE:${existingStates.map(x=>`${x.path}=${x.state}`).join(',')}`);
  }
  if(!newStates.every(x=>x.state==='ABSENT')){
    fail(`NON_ATOMIC_NEW_STATE:${newStates.map(x=>`${x.name}=${x.state}`).join(',')}`);
  }

  const prepared=[];
  const backups=[];
  const created=[];
  try{
    for(const entry of existingStates){
      const source=path.join(sourceDir,entry.source);
      const tmp=`${entry.target}.unified.tmp`;
      fs.copyFileSync(source,tmp);
      fs.chmodSync(tmp,fs.statSync(entry.target).mode);
      if(shaFile(tmp)!==entry.after)fail(`PREPARED_SHA_MISMATCH:${entry.path}`);
      prepared.push({kind:'existing',target:entry.target,tmp,backup:`${entry.target}.unified.backup`,after:entry.after});
    }
    for(const entry of newStates){
      const tmp=`${entry.target}.unified.tmp`;
      fs.copyFileSync(entry.source,tmp);
      if(shaFile(tmp)!==entry.sourceSha)fail(`PREPARED_SHA_MISMATCH:src/${entry.name}`);
      prepared.push({kind:'new',target:entry.target,tmp,after:entry.sourceSha});
    }

    for(const item of prepared.filter(x=>x.kind==='existing')){
      fs.renameSync(item.target,item.backup);
      backups.push(item);
      fs.renameSync(item.tmp,item.target);
    }
    for(const item of prepared.filter(x=>x.kind==='new')){
      fs.renameSync(item.tmp,item.target);
      created.push(item.target);
    }

    for(const entry of EXISTING_FILES){
      const target=path.join(runtime,entry.path);
      if(shaFile(target)!==entry.after)fail(`POST_INSTALL_SHA_MISMATCH:${entry.path}`);
    }
    for(const entry of newStates){
      if(shaFile(entry.target)!==entry.sourceSha)fail(`POST_INSTALL_SHA_MISMATCH:src/${entry.name}`);
    }

    for(const item of backups)fs.rmSync(item.backup,{force:true});
    const proof=proofFor(runtime);
    fs.writeFileSync(path.join(runtime,'unified-candidate-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');
    return proof;
  }catch(error){
    for(const item of prepared)fs.rmSync(item.tmp,{force:true});
    for(const target of created)fs.rmSync(target,{force:true});
    for(const item of [...backups].reverse()){
      fs.rmSync(item.target,{force:true});
      if(fs.existsSync(item.backup))fs.renameSync(item.backup,item.target);
    }
    if(String(error?.message||error).startsWith('UNIFIED_CANDIDATE_OVERLAY_REFUSED:'))throw error;
    fail(`ATOMIC_INSTALL_FAILED:${String(error?.message||error)}`);
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  const runtime=process.argv[2]||'runtime';
  const proof=applyUnifiedRuntimeOverlay(runtime);
  console.log('UNIFIED_CANDIDATE_OVERLAY_APPLIED',JSON.stringify(proof));
}
