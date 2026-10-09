import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const load=n=>import(pathToFileURL(path.join(root,'src',n)));
const [{buildRuntimeCanonicalBundle:build},{createCombinedLiquidationService:createService},{buildLiquidationSourceAcquisitionAudit:makeAudit,bindLiquidationAcquisitionDiagnostics:bind},{renderCanonicalTelegram:render,renderCanonicalManual:manual,canonicalFingerprint:fingerprint}]=await Promise.all([load('canonical-runtime-adapter.mjs'),load('liquidation-extension/combined-runner-service.mjs'),load('liquidation-source-acquisition-audit.mjs'),load('canonical-publication.mjs')]);
const original=JSON.parse(execFileSync('unzip',['-p','checkpoints/post254-natural-37917588047.zip','report2-run-result.json'],{maxBuffer:16*1024*1024}).toString()),audit=original.liquidation_source_acquisition_audit,T=audit.evaluated_ts;
const args={contract:'RAY-USDT',run_id:original.run_id,snapshot_id:'CONTROLLED_CANONICAL_REVIEW:RAY-USDT',observed_ts:T};
test('assembled adapter preserves decisions and all original market evidence while carrying retained asset-specific diagnostics',()=>{
 const before=build(args),after=build({...args,liquidation_source_acquisition_audit:audit});
 assert.deepEqual(after.canonical.liquidations.acquisition_diagnostics,bind({...args,audit}));
 const without=structuredClone(after.canonical.liquidations);delete without.acquisition_diagnostics;assert.deepEqual(without,before.canonical.liquidations);
 for(const field of ['state','direction','scores','entry','trigger','invalidation','targets','source_receipts','data_quality','hard_gates','observed_ts'])assert.deepEqual(after.canonical[field],before.canonical[field],field);
 for(const field of ['technical_move_potential','dynamic_liquidation_panel','direction_resolution','source_role_view','score_basis'])assert.deepEqual(after.canonical.metadata[field],before.canonical.metadata[field],field);
 assert.equal(build({...args,observed_ts:T-1,liquidation_source_acquisition_audit:audit}).canonical.liquidations.acquisition_diagnostics,undefined);
});
test('assembled source routing retains a skipped exact asset without HTTP, D1 or a false empty-market explanation',async()=>{
 let calls=0;const service=createService({mode:'SHADOW_ONLY',secondary_enabled:false,max_http_per_run:5,clock:()=>T,fetch_impl:async()=>{calls++;throw Error('UNAUTHORIZED_NETWORK');},provider_admit:async()=>{throw Error('UNAUTHORIZED_PROVIDER_ADMISSION');}});
 assert.equal(await service.collect({contract:args.contract,run_id:args.run_id,max_http_for_candidate:5,allowed_source_ids:[]}),null);
 const a=makeAudit({summary:service.summary(),run_id:args.run_id,candidates:[args.contract],evaluated_ts:T});assert.equal(a.routes.length,1);assert.equal(a.routes[0].status,'SKIPPED_NO_COVERAGE_ADMITTED_SOURCE');assert.equal(a.routes[0].source_outcome.evaluated,false);assert.equal(calls,0);assert.equal(a.network_calls,0);assert.equal(a.db_calls,0);
 const c=build({...args,liquidation_source_acquisition_audit:a}).canonical;assert.equal(c.liquidations.acquisition_diagnostics.routes[0].kind,'NOT_EVALUATED');assert.equal(c.liquidations.acquisition_diagnostics.entry_authorized,false);assert.equal(c.state,'REJECTED');
});
test('approved renderer carries original retained reasons with no forced publication or historical text rewrite',()=>{
 const c=structuredClone(original.candidates.find(r=>r.contract==='龙虾-USDT').canonical),saved=JSON.stringify(c);
 const old=render({canonical:c,lifecycle_event:'OBSERVE'});assert.equal(old.ok,true);
 // Explicit later controlled review identity; this is not the old live snapshot.
 c.snapshot_id='CONTROLLED_DELIVERY_REVIEW:龙虾-USDT';c.observed_ts=T;c.liquidations.acquisition_diagnostics=bind({audit,contract:'龙虾-USDT',run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:T});c.analytical_fingerprint=fingerprint(c);
 const out=render({canonical:c,lifecycle_event:'OBSERVE'});assert.equal(out.ok,true);assert(out.text.includes('часть площадок не поддерживает монету'));assert(out.text.includes('выборка не дала подходящих уровней'));assert(out.length<=1800);assert(manual({canonical:c}).text.includes('выборка не дала подходящих уровней'));
 assert.equal(JSON.stringify(original.candidates.find(r=>r.contract==='龙虾-USDT').canonical),saved);assert.equal(c.state,'OBSERVE');assert.equal(c.metadata.validated_signal,false);
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/liquidation-refusal-consumer-proof.json',JSON.stringify({schema:'LIQUIDATION_REFUSAL_CONSUMER_RETAINED_REVIEW_V1',source_run:37917588047,scope:'CONTROLLED_LATER_REVIEW_NOT_ORIGINAL_LIVE_SNAPSHOT',diagnostics:c.liquidations.acquisition_diagnostics,telegram:out,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,new_fresh_SENT:false},null,2)+'\n');
});
