import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT,repo=process.cwd();
const prefix='checkpoints/proof-budget-anomaly-connected-20261020';
const write=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');

test('ONE NEW linked proof preflight, provider admission clocks and independent offline anomaly qualification',async()=>{
  assert.ok(root&&output);fs.mkdirSync(output,{recursive:true});
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-proof-provider-anomaly-'));
  const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_REAL_NATIVE_OR_PROVIDER_OR_TELEGRAM_NETWORK');};
  try {
    const runtimeBaseline=path.join(temp,'runtime-baseline'),checkoutBaseline=path.join(temp,'checkout-baseline');
    fs.cpSync(root,runtimeBaseline,{recursive:true});
    fs.copyFileSync(path.join(repo,prefix,'worker.before.js'),path.join(runtimeBaseline,'src/worker.js'));
    const plan=JSON.parse(fs.readFileSync(path.join(repo,prefix,'provider-component-plan.json')));
    for(const pin of plan.module_pins){
      const relative=pin.path.replace(/^current-generation\/files\//,'');
      assert.notEqual(relative,pin.path);
      fs.copyFileSync(path.join(repo,plan.baseline_prefix,relative),path.join(runtimeBaseline,relative));
    }
    // Exact tracked checkout, never untracked local work or a repository copy
    // inside the uploaded artifact. Only the three frozen module baselines vary.
    const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean);
    for(const relative of tracked){const target=path.join(checkoutBaseline,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repo,relative),target);}
    const anomalyManifest=JSON.parse(fs.readFileSync(path.join(repo,'anomaly-research/closed-order-plan-batch-20261020/manifest.json')));
    for(const pin of anomalyManifest.module_pins.filter(p=>p.changed!==false))fs.copyFileSync(path.join(repo,prefix,'baseline-checkout',pin.path),path.join(checkoutBaseline,pin.path));
    const central=await import(pathToFileURL(path.join(repo,prefix,'proof-preflight-connected.mjs')));
    const proof=await central.runProofPreflightConnected({runtime_root:root,baseline_runtime_root:runtimeBaseline,repo_root:repo});
    assert.equal(proof.status,'PASS');
    write('proof-component-result.json',proof);
    const source=await import(pathToFileURL(path.join(repo,plan.callable_path)));
    const provider=await source[plan.callable_export]({runtime_root:path.join(root,'src'),baseline_runtime_root:path.join(runtimeBaseline,'src'),repo_root:repo});
    assert.equal(provider.status,'CLOSED');assert.equal(provider.control_count,36);
    write('provider-component-result.json',provider);
    const worker=await import(pathToFileURL(path.join(repo,'anomaly-research/closed-order-plan-batch-20261020/connected.mjs')));
    const anomaly=await worker.runClosedOrderPlanConnected({baseline_root:checkoutBaseline,candidate_root:repo,repo_root:repo,budget_receipt_path:path.join(repo,'checkpoints/telegram-native-failure-20261020/native-39423678954/members/report2-failure-accounting.json')});
    write('anomaly-component-result.json',anomaly);
    assert.equal(anomaly.admission.unknown_ops_preserved,1);assert.equal(anomaly.admission.activation_allowed,false);assert.equal(anomaly.actual_send,false);
    write('result.json',{status:'PASS',new_cases:1,Node_version:process.version,components:['existing_proof_storage_contract_preflight','provider_admission_read_clock','independent_OFFLINE_closed_order_replay_plan_binding'],old_accepted_tests_repeated:false,sourceHTTP:0,nativeSQL:0,MAIN:0,Telegram:0,failed_native_proof_subterm_or_cost_recovered:false,historical_unknown_preserved:1,whole_day_admission_restored:false,native_anomaly_ACK_or_accuracy_qualified:false});
  }finally{globalThis.fetch=oldFetch;fs.rmSync(temp,{recursive:true,force:true});}
});
