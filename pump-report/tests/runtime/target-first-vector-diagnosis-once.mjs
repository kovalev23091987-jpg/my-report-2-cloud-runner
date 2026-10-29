import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const a=read(process.argv[2]),own=read('checkpoints/CLOUD_PHASE_STATE_20261004.json').lease;
assert.equal(a.status,'ADMITTED_ONE_FIRST_VECTOR_DIAGNOSIS_NO_ENGINE_OR_BUILD');
assert.equal(a.Node_processes,1);assert.equal(a.pure_selector_calls,1);assert(own.owner===a.own_lease.owner&&!own.released&&Date.now()<a.expires_ts);
for(const[p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
fs.writeFileSync(a.output+'.attempt',JSON.stringify({Node:1,pure_selector_calls:1,started_ts:Date.now(),no_real_IO:true}),{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('OFFLINE_NO_NETWORK');};
const artifact=read(a.artifact);
for(const[n,s]of Object.entries(artifact.modules))assert.equal(sha(fs.readFileSync(path.join(a.snapshot,n))),sha(s),n);
const harness=fs.readFileSync(a.harness,'utf8'),start=' const materialize=',stop='\n const target=',begin=harness.indexOf(start),end=harness.indexOf(stop,begin);
assert(begin>=0&&end>begin);
const expression=harness.slice(begin+start.length,end).trim();assert(expression.endsWith(';'));
const vectors=read(a.vectors),materialize=Function('factory','assert','return ('+expression.slice(0,-1)+');')(vectors.factory,assert),input=materialize(vectors.vectors[0]);
const before=JSON.stringify(input),{selectJustifiedPlanTarget}=await import(pathToFileURL(path.resolve(a.snapshot,'analytics/movement.mjs')).href),{START_PROFILE}=await import(pathToFileURL(path.resolve(a.snapshot,'profile/start-v1.mjs')).href);
const result=selectJustifiedPlanTarget(input.movement,input.price,0.5,START_PROFILE,input.at);assert.equal(JSON.stringify(input),before);
const c=input.movement.target_context;
const proof={schema:'ROOT_ONE_FIRST_TARGET_VECTOR_DIAGNOSIS_V1',status:'DIAGNOSED_ONE_CALL_NOT_QUALIFICATION',authority_main:a.authority_main,Node_processes:1,pure_selector_calls:1,engine:0,build:0,native_SQL:0,Cloudflare:0,market_HTTP:0,Telegram:0,
 expected:vectors.vectors[0].expected,input_summary:{price:input.price,at:input.at,impulse:input.movement.impulse,wave:input.movement.next_wave,
  profile:{candle_interval_ms:START_PROFILE.candle_interval_ms,pivot_radius_bars:START_PROFILE.pivot_radius_bars},
  core:{rows:c.core_rows.length,first:c.core_rows[0],last:c.core_rows.at(-1),fact_status:c.core_fact.status,fact_id:c.core_fact.fact_id,event_ts:c.core_fact.event_ts,received_ts:c.core_fact.received_ts,expires_ts:c.core_fact.expires_ts},
  history:{qualified:c.history_qualified,rows:c.history_fact.value.length,fact_id:c.history_fact.fact_id,event_ts:c.history_fact.event_ts,received_ts:c.history_fact.received_ts,expires_ts:c.history_fact.expires_ts}},result,
 unchanged_product_and_fixture:true,failed_original_case_not_replayed:true};
fs.writeFileSync(a.output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
