import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REPORT2_EXISTING_SOURCE_RUNTIME_DIR||'/tmp/report2-existing-source-runtime');
const load=n=>import(pathToFileURL(path.join(root,'src',n)).href);
const NOW=1_800_000_000_000;
test('final runtime exposes existing source consumer through canonical and both formatters',async()=>{
 const {buildRuntimeCanonicalBundle}=await load('canonical-runtime-adapter.mjs');
 const {buildFreeSourceRuntimeSummary}=await load('source-registry.mjs');
 const summary=buildFreeSourceRuntimeSummary({extra_receipts:[{source:'GoPlus',status:'CLOSED',source_ts:NOW-1000,observed_ts:NOW,max_age_sec:600,source_compatible:true}],now:NOW});
 const b=buildRuntimeCanonicalBundle({contract:'USDT-USDT',run_id:'R',snapshot_id:'S',observed_ts:NOW,discovery_row:{contract:'USDT-USDT',rolling_24h_change_pct:0},publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:50}},free_source_summary:summary,existing_source_receipts:{goplus:{status:'CLOSED',flags:{is_honeypot:false,cannot_buy:false},observed_ts:NOW}}});
 assert.equal(b.status,'CLOSED');assert.equal(b.canonical.metadata.supporting_context.blocks.supporting_risk.status,'CLOSED');assert.equal(b.manual.analytical_fingerprint,b.telegram.analytical_fingerprint);assert.match(b.manual.text,/Дополнительные риски токена/);assert.match(b.telegram.message,/Доп\. контекст:/);
});
