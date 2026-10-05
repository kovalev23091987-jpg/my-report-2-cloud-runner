import test from 'node:test';import assert from 'node:assert/strict';
import {nansenFlowEvidence,resolveNansenFlowPrimary,auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {normalizeNansenFlows} from '../files/src/specialist-candidate-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
const end=Date.parse('2026-10-05T07:00:00Z'),now=end+600000,identity={chain:'bsc',contract_or_mint:'0x'+'1'.repeat(40)},params={contract:'龙虾-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',now};
const payload={pagination:{is_last_page:true},data:[5,6].map(h=>({date:`2026-10-05T0${h}:00:00Z`,bucket_end:`2026-10-05T0${h+1}:00:00Z`,is_complete:true,total_inflows_cex:10,total_outflows_cex:-4}))};
const source=()=>normalizeNansenFlows(payload,{base:'龙虾',identity,now,window_end:end});
test('shared labelled-flow producer retains exact-token semantics, raw outflow sign and established bounded weight',()=>{
 const resolved=resolveNansenFlowPrimary(source(),params);const actualAudit=auditCandidateBlocks({evidence:resolved.evidence,sources:{NANSEN_FLOWS:resolved},decision_ts:now});assert.equal(actualAudit.blocks.N05.checked,true);assert.equal(actualAudit.blocks.N05.usable_facts,1);assert.equal(auditCandidateBlocks({evidence:resolved.evidence,sources:{NANSEN_FLOWS:resolved},decision_ts:now,strict_fresh:true}).blocks.N05.checked,false);
 const evidence=nansenFlowEvidence(source(),params);assert.equal(evidence.length,1);assert.equal(evidence[0].asset_id,`bnb:${identity.contract_or_mint}`);assert.equal(evidence[0].value,12);assert.equal(evidence[0].directional_strength,-12/28);assert.equal(evidence[0].label_authority,'NANSEN');assert.equal(evidence[0].individual_addresses_verified,false);
 assert.equal(consumeBlockResultContext({evidence,contract:params.contract,now}).facts[0].block_id,'N05');assert.ok(consumeEvidenceV2(evidence,{base_interest:70,decision_ts:now}).adjustment<0);
});
test('foreign, incomplete, null, stale and unit-corrupted CLOSED receipts cannot enter the producer',()=>{
 const valid=source();
 const mutations=[s=>s.identity.contract_or_mint='0x'+'2'.repeat(40),s=>s.symbol='OTHER',s=>s.pagination_complete=false,s=>s.buckets[0].is_complete=false,s=>s.buckets[0].total_inflows_cex=null,s=>s.buckets[0].bucket_end=s.buckets[1].bucket_end,s=>s.source_ts-=1,s=>s.unit='USD',s=>s.label='smart_money',s=>s.window_start_ts-=3600000,s=>s.observed_ts=now+1];
 for(const change of mutations){const s=structuredClone(valid);change(s);assert.deepEqual(nansenFlowEvidence(s,params),[]);assert.equal(resolveNansenFlowPrimary(s,params).status,'INVALID_FLOW_BINDING_OR_COMPLETE_WINDOW');}
 assert.deepEqual(nansenFlowEvidence(valid,{...params,now:now+3600001}),[]);
});
test('two provider-confirmed zero buckets are retained as factual zero with no directional contribution',()=>{
 const s=normalizeNansenFlows({...payload,data:payload.data.map(x=>({...x,total_inflows_cex:0,total_outflows_cex:0}))},{base:'龙虾',identity,now,window_end:end}),evidence=nansenFlowEvidence(s,params);
 assert.equal(evidence.length,1);assert.equal(evidence[0].verified_zero_flow_window,true);assert.equal(evidence[0].value,0);assert.equal(evidence[0].directional_strength,0);assert.equal(consumeEvidenceV2(evidence,{base_interest:70,decision_ts:now}).adjustment,0);assert.equal(consumeBlockResultContext({evidence,contract:params.contract,now}).facts.length,1);
 assert.deepEqual(nansenFlowEvidence(undefined,params),[]);
});
test('unattempted token primary remains incomplete; documented native absence is not useful flow data',()=>{
 const token=resolveNansenFlowPrimary(undefined,params);assert.equal(token.status,'NOT_EVALUATED');assert.equal(token.check_completed,false);assert.equal(auditCandidateBlocks({sources:{NANSEN_FLOWS:token},decision_ts:now}).blocks.N05.checked,false);
 const native=resolveNansenFlowPrimary(undefined,{contract:'ADA-USDT',asset_identity:{chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null},identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',now});assert.equal(native.status,'CAPABILITY_CHECKED_NO_EXACT_ROUTE');assert.equal(native.network_calls,0);assert.deepEqual(native.evidence,[]);assert.equal(auditCandidateBlocks({sources:{NANSEN_FLOWS:native},decision_ts:now}).blocks.N05.observed_facts,0);
});

test('actual local admission denial remains explicit and never becomes useful flow or a no-event claim',()=>{
 const denied={source:'NANSEN_FLOWS',status:'LOCAL_BUDGET_OR_BACKOFF',actual_http:0};
 const r=resolveNansenFlowPrimary(undefined,{...params,supplemental_context:{receipts:[denied]}});
 assert.equal(r.status,'LOCAL_BUDGET_OR_BACKOFF');assert.equal(r.reason,'EXISTING_PROVIDER_ADMISSION_DENIED');assert.deepEqual(r.receipts,[denied]);assert.deepEqual(r.evidence,[]);assert.equal(r.check_completed,false);assert.equal(r.network_calls,0);
 assert.equal(auditCandidateBlocks({sources:{NANSEN_FLOWS:r},decision_ts:now}).blocks.N05.checked,false);
 for(const receipt of [{...denied,actual_http:1},{...denied,source:'OTHER'},{...denied,status:'UNKNOWN'}])assert.equal(resolveNansenFlowPrimary(undefined,{...params,supplemental_context:{receipts:[receipt]}}).status,'NOT_EVALUATED');
});
