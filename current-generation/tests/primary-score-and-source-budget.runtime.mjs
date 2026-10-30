import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

test('ONE NEW connected qualification: retained primary metadata and bounded initial source reads',async()=>{
 const runtime=path.resolve(process.env.REPORT2_PRIMARY_COMMON_RUNTIME||'runtime');
 const output=path.resolve(process.env.REPORT2_PRIMARY_COMMON_OUTPUT||'audit-output/primary-source-connected');
 fs.mkdirSync(output,{recursive:true});
 const originalFetch=globalThis.fetch;
 globalThis.fetch=()=>{throw Error('NO_PROVIDER_OR_NATIVE_NETWORK_IN_OFFLINE_CASE');};
 try{
  const primaryPath=path.resolve('anomaly-research/btw-primary-base-score-peer-20261019/primary-selection-connected.mjs');
  const primary=await import(pathToFileURL(primaryPath));
  const primaryResult=await primary.runPrimarySelectionDiagnosticConnected({
   runner_text:fs.readFileSync(path.join(runtime,'runner-main.mjs'),'utf8'),
   retained_report_text:fs.readFileSync('checkpoints/natural-39255752857/report2-run-result/report2-run-result.json','utf8'),
  });
  assert.equal(primaryResult.original392557_predicates_recovered,0);
  assert.equal(primaryResult.existing_SELECT_and_bindings_equal,true);
  // Preserve a completed new component even if a later component fails.
  fs.writeFileSync(path.join(output,'primary-result.json'),JSON.stringify(primaryResult,null,2)+'\n');
  let sourceResult=null;
  if(process.env.REPORT2_PRIMARY_COMMON_SOURCE_HARNESS){
   const module=await import(pathToFileURL(path.resolve(process.env.REPORT2_PRIMARY_COMMON_SOURCE_HARNESS)));
   const name=process.env.REPORT2_PRIMARY_COMMON_SOURCE_EXPORT;
   assert(name&&typeof module[name]==='function','Exact new source component export required');
   const baseline=fs.mkdtempSync(path.join(os.tmpdir(),'report2-primary-source-baseline-'));
   try{
    fs.cpSync(runtime,baseline,{recursive:true});
    fs.copyFileSync('checkpoints/source-worker-early-freshness-sql-20261019/sidecar.before.mjs',path.join(baseline,'src/v3-telegram-lifecycle-sidecar.mjs'));
    sourceResult=await module[name]({runtime_root:runtime,baseline_runtime_root:baseline,repo_root:process.cwd(),native_original_root:path.resolve('checkpoints/natural-39261413199')});
   }finally{fs.rmSync(baseline,{recursive:true,force:true});}
   fs.writeFileSync(path.join(output,'source-result.json'),JSON.stringify(sourceResult,null,2)+'\n');
  }
  const witness={schema:'ONE_NEW_PRIMARY_METADATA_AND_INITIAL_SOURCE_CONNECTED_WITNESS_V1',new_cases:1,PASS:1,FAIL:0,
   primary:primaryResult,source:sourceResult,old_accepted_cases_manually_repeated:false,
   source_HTTP_nativeSQL_MAIN_Telegram:0,ENTRY_followup_or_physicalstorage:false,
   native_read_reduction_or_delivery_fixed:false,
   limits:'Offline source-row/projection qualification only. Initial metadata is explicitly CONTROLLED and does not recover omitted original predicates; native costs, current provider admission and actual same-run delivery require separate saved ordinary evidence.'};
  fs.writeFileSync(path.join(output,'common-witness.json'),JSON.stringify(witness,null,2)+'\n');
 }finally{globalThis.fetch=originalFetch;}
});
