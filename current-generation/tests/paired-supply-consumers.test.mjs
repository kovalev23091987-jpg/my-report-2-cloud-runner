import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizeChainSupply,collectChainSupplyEvidence,CHAIN_SUPPLY_EVIDENCE_VERSION} from '../files/src/chain-supply-evidence.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2,validateEvidenceV2} from '../files/src/evidence-v2.mjs';
import {DatabaseSync} from 'node:sqlite';
import {installEvidenceSourceStore,writeEvidenceSourceCache} from '../files/src/evidence-source-store.mjs';
import {auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';
const gz=fs.readFileSync(new URL('./fixtures/actual-paired-supply-20261006.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(gz).digest('hex'),'1b0edd90c4fbb91cf62261ffaf70adf868dd14add38b4f63c79cf158e1ed0435');
const actual=JSON.parse(gunzipSync(gz)),input=actual.normalization_input;
test('original-clock actual finalized RPC supply keeps the original N02 N03 facts and zero score',()=>{
 for(const body of actual.raw_source_bodies)assert.equal(createHash('sha256').update(body.body).digest('hex'),body.body_sha256);
 const r=normalizeChainSupply(input),before=actual.retained.result;
 assert.equal(actual.not_new_live_acceptance,true);assert.equal(r.status,'CLOSED');
 assert.deepEqual(r.evidence,before.evidence);
 const facts=consumeBlockResultContext({evidence:r.evidence,contract:input.contract,now:input.observed_ts}).facts;
 assert.deepEqual([...new Set(facts.map(f=>f.block_id))].sort(),['N03']);
 assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:input.observed_ts}).adjustment,0);
});
test('controlled decrease over retained exact identity assigns current supply to N02 without replacing N03',()=>{
 const p=structuredClone(input);p.current.supply=String(BigInt(p.previous.supply)-1n);
 const r=normalizeChainSupply(p),decrease=r.evidence.filter(x=>x.block_id==='N03'),current=r.evidence.filter(x=>x.block_id==='N02');
 assert.equal(decrease.length,1);assert.equal(current.length,1);
 assert.equal(decrease[0].metric_family,'SUPPLY_DECREASE');assert.equal(decrease[0].supply_delta_base_units,'-1');
 assert.equal(current[0].metric_family,'TOTAL_SUPPLY_OBSERVATION');assert.equal(current[0].total_supply_base_units,p.current.supply);assert.equal(current[0].supply_delta_base_units,null);
 assert.equal(current[0].dependency_group,decrease[0].dependency_group);assert.equal(current[0].source_ts,decrease[0].source_ts);assert.equal(current[0].expires_at,decrease[0].expires_at);
 for(const row of r.evidence){assert.equal(validateEvidenceV2(row,{decision_ts:p.observed_ts}).usable,true);assert.equal(row.directional_strength,null);assert.equal(row.risk_strength,null);}
 const facts=consumeBlockResultContext({evidence:r.evidence,contract:p.contract,now:p.observed_ts}).facts;
 assert.deepEqual([...new Set(facts.map(f=>f.block_id))].sort(),['N03']);
 const audit=auditCandidateBlocks({evidence:r.evidence,sources:{CHAIN_SUPPLY:{...r,check_completed:true,network_calls:0},CHAIN_SUPPLY_COMPARISON:{...r,check_completed:true,network_calls:0}},decision_ts:p.observed_ts});
 assert.equal(audit.blocks.N02.observed_facts,0);assert.equal(audit.blocks.N03.observed_facts,1);
 assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:p.observed_ts}).adjustment,0);
 // This branch regression changes an input explicitly; it is not actual burn evidence.
});
test('stale, foreign, unfinalized or incomparable retained supply cannot invent a second usable block',()=>{
 for(const mutate of [p=>p.current.finalized=false,p=>p.current.source_ts=p.observed_ts-86400000,p=>p.previous.address='0x0000000000000000000000000000000000000001',p=>p.previous.decimals=0,p=>p.previous.block_ref=p.current.block_ref]){
  const p=structuredClone(input);p.current.supply=String(BigInt(p.previous.supply)-1n);mutate(p);
  const r=normalizeChainSupply(p);assert.equal(r.evidence.some(x=>x.block_id==='N03'),false);
 }
});

test('legacy decreasing cache supplies both consumers with zero new transport and preserved original clocks',async()=>{
 const p=structuredClone(input);p.current.supply=String(BigInt(p.previous.supply)-1n);
 const normalized=normalizeChainSupply(p),legacy={version:CHAIN_SUPPLY_EVIDENCE_VERSION,...normalized,evidence:normalized.evidence.filter(x=>x.block_id==='N03'),summary:{...normalized.summary,finalized:true}};
 const original=JSON.stringify(legacy.evidence[0]),sql=new DatabaseSync(':memory:');
 const db={prepare(q){return{args:[],bind(...a){this.args=a;return this;},async run(){return sql.prepare(q).run(...this.args);},async first(){return sql.prepare(q).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};
 try{
  await installEvidenceSourceStore(db);await writeEvidenceSourceCache(db,{source:'CHAIN_RPC',asset_key:p.identity.chain+':'+p.identity.contract_or_mint,observed_ts:p.observed_ts,expires_ts:legacy.evidence[0].expires_at,payload:legacy});
  let transports=0,admissions=0;
  const r=await collectChainSupplyEvidence({db,contract:p.contract,run_id:'CONTROLLED_LEGACY_CACHE',asset_identity:p.identity,identity_method:p.identity.identity_method,now:p.observed_ts+1000,clock:()=>p.observed_ts+1000,fetch_impl:async()=>{transports++;throw Error('CACHE_MUST_NOT_FETCH');},request_admit:()=>{admissions++;return{allowed:false};}});
  assert.equal(r.network_calls,0);assert.equal(transports,0);assert.equal(admissions,0);assert.equal(r.cache_status,'HIT');
  assert.equal(JSON.stringify(r.evidence.find(x=>x.block_id==='N03')),original);
  const current=r.evidence.find(x=>x.block_id==='N02');assert.ok(current);assert.equal(current.observed_ts,p.observed_ts);assert.equal(current.first_known_ts,p.observed_ts);assert.equal(current.expires_at,legacy.evidence[0].expires_at);
  const facts=consumeBlockResultContext({evidence:r.evidence,contract:p.contract,now:p.observed_ts+1000}).facts;
  assert.deepEqual([...new Set(facts.map(f=>f.block_id))].sort(),['N03']);
 }finally{sql.close();}
});
