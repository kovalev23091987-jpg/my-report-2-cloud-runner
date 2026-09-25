import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntimeCanonicalBundle} from '../src/canonical-runtime-adapter.mjs';
import {buildFreeSourceRuntimeSummary} from '../src/source-registry.mjs';

const NOW=1_800_000_000_000;
const receipt=(source)=>({source,status:'CLOSED',source_ts:NOW-1000,observed_ts:NOW,max_age_sec:600,source_compatible:true});
function base(extra_receipts,existing_source_receipts){
 const summary=buildFreeSourceRuntimeSummary({extra_receipts,now:NOW});
 return buildRuntimeCanonicalBundle({contract:'AAVE-USDT',run_id:'R',snapshot_id:'S',observed_ts:NOW,discovery_row:{contract:'AAVE-USDT',rolling_24h_change_pct:5},publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:62}},free_source_summary:summary,existing_source_receipts});
}

test('GoPlus consumer fact reaches one canonical object and both outputs',()=>{
 const b=base([receipt('GoPlus')],{goplus:{status:'CLOSED',flags:{is_honeypot:false,cannot_buy:false},observed_ts:NOW}});
 assert.equal(b.status,'CLOSED');assert.equal(b.canonical.metadata.supporting_context.blocks.supporting_risk.status,'CLOSED');assert.equal(b.telegram.analytical_fingerprint,b.manual.analytical_fingerprint);assert.match(b.manual.text,/Дополнительные риски токена/);assert.match(b.telegram.message,/Доп\. контекст:/);assert.match(b.telegram.message,/GoPlus/);
});

test('DefiLlama consumer fact reaches both formatters without changing state',()=>{
 const b=base([receipt('DefiLlama')],{defillama:{status:'CLOSED',provider:'DefiLlama',protocol:'aave',tvl_usd:1000000}});
 assert.equal(b.canonical.state,'OBSERVE');assert.equal(b.canonical.metadata.supporting_context.no_directional_vote,true);assert.match(b.manual.text,/TVL протокола/);assert.match(b.telegram.message,/TVL протокола/);
});

test('no existing-source receipt has a no-change output path',()=>{
 const b=base([],{});assert.equal(b.canonical.metadata.supporting_context.status,'NOT_CLOSED');assert.doesNotMatch(b.manual.text,/ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ/);assert.doesNotMatch(b.telegram.message,/Доп\. контекст:/);
});
