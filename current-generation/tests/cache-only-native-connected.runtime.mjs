import './cache-only-native-caller.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {replay,params,selected,run,T,snapshot,levels,workerCaller,wire} from './cache-only-native-caller.test.mjs';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const {buildRuntimeCanonicalBundle}=await import(pathToFileURL(path.join(root,'src/canonical-runtime-adapter.mjs')));
test('assembled zero-HTTP second-asset caller reaches canonical/manual conditional context while preserving score, direction, entry, targets and approved Telegram',async()=>{
 const f=replay(),env=wire(f.service);await workerCaller(env,{contract:selected[0],cap:5,reserved:true});f.setNow(T+44000);f.forbid();
 const second=await workerCaller(env,{contract:selected[1]}),reference=levels.find(l=>l.asset===selected[1].slice(0,-5)).reference_price;
 const p={contract:selected[1],run_id:run,snapshot_id:'CONTROLLED_CACHE_ONLY:'+selected[1],observed_ts:T+44000,discovery_row:{contract:selected[1],mark_price:reference},publication_shadow:{entry_signal:{state:'REJECTED',direction:null},scenario_plan:{execution_reference_price:reference}}};
 const baseline=buildRuntimeCanonicalBundle(p),result=buildRuntimeCanonicalBundle({...p,native_liquidation_acquisition:second.acquisition});
 for(const key of ['state','direction','scores','entry','trigger','invalidation','targets'])assert.deepEqual(result.canonical[key],baseline.canonical[key],key);
 assert.equal(result.canonical.state,'REJECTED');assert.equal(result.canonical.direction,null);assert.equal(result.canonical.metadata.validated_signal,false);assert.equal(result.canonical.targets?.length??0,0);
 assert.ok(JSON.stringify(result.canonical.liquidations).includes('CALCULATED_CONDITIONAL'));assert.ok(result.manual.text.includes('dYdX'));assert.ok(result.manual.text.includes('расч'));assert.equal(f.calls.length,3);assert.equal(f.grants.length,1);assert.equal(f.service.summary().routed.at(-1).position_proof.source_ts,snapshot.source_ts);
 fs.writeFileSync('audit-output/cache-only-canonical-proof.json',JSON.stringify({schema:'CACHE_ONLY_ASSEMBLED_CANONICAL_PROOF_V1',scope:'CONTROLLED_DENSE_INPUT_AT_ORIGINAL_CLOCK_NOT_FRESH_HTX_REPORT_OR_SENT',contract:selected[1],run_id:run,source_ts:snapshot.source_ts,height:snapshot.height,baseline:baseline.canonical,canonical:result.canonical,manual_text:result.manual.text,service:f.service.summary(),sourceHTTP:0,D1:0,MAIN:0,Telegram:0,new_SENT:false,source_clocks_refreshed:false},null,2)+'\n');
});
