import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {deriveHtxRecentPathEvidence,loadN10ReusedVenuePaths,verifyN10ReusedVenuePathEvidence} from '../current-generation/files/src/htx-technical-structure.mjs';
import {consumeBlockResultContext} from '../current-generation/files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../current-generation/files/src/evidence-v2.mjs';

const input=JSON.parse(gunzipSync(fs.readFileSync(new URL('./N10_PREVIOUS_SAVED_ZEC_INPUT_20261011.json.gz',import.meta.url))));
const window=input.primary.receipts[0].actual_price_windows.find(w=>w.label==='15m');
const source_ts=input.primary.receipts[0].trajectory_source_ts;
const now=input.observed_ts;
assert.equal(input.primary.check_completed,true);
assert.equal(window.window_end_ts,1791710640000);
for(const venue of ['BINANCE','POLONIEX']){
 const rows=input.cache[venue].payload.candles;
 assert.equal(rows.length,240);
 assert.equal(input.cache[venue].observed_ts,input.components.find(c=>c.venue===venue).observed_ts);
}
let reads=0;
const db={prepare(sql){assert.match(sql,/report2_evidence_source_cache/);return{bind(source,key,expiry){return{async first(){reads++;const venue=source.split(':').at(-1);assert.equal(key,`NATIVE_FLOW:ZEC-USDT:${window.window_end_ts}`);const row=input.cache[venue];return row.expires_ts>=expiry?{observed_ts:row.observed_ts,expires_ts:row.expires_ts,payload_json:JSON.stringify(row.payload)}:null;}}}}}};
const route=await loadN10ReusedVenuePaths({db,contract:input.contract,flow_result:{components:input.components},primary_receipt:input.primary,now});
const htx=deriveHtxRecentPathEvidence({contract:input.contract,window,source_ts,observed_ts:now});
const evidence=[...htx,...route.evidence];
const facts=consumeBlockResultContext({contract:input.contract,evidence,now}).facts;
assert.equal(reads,2);
assert.equal(route.provider_http,0);
assert.equal(route.evidence.length,2);
assert.equal(htx.length,1);
assert.ok(route.evidence.every(row=>verifyN10ReusedVenuePathEvidence(row,{now})));
assert.equal(facts.length,3);
assert.deepEqual(facts.map(f=>f.source),['HTX / закрытые минутные свечи','Binance / спотовые закрытые свечи','Poloniex / спотовые закрытые свечи']);
assert.equal(consumeEvidenceV2(evidence,{base_interest:70,decision_ts:now}).final_interest,70);
console.log(JSON.stringify({snapshot_id:input.snapshot_id,observed_ts:now,window_start:window.window_start_ts,window_end:window.window_end_ts,route_status:route.status,cache_reads:reads,provider_http:route.provider_http,evidence:route.evidence.map(row=>({venue:row.venue,source_ts:row.source_ts,first_known_ts:row.first_known_ts,active_minute_count:row.active_minute_count,path_open:row.path_open,path_high:row.path_high,path_low:row.path_low,path_close:row.path_close,change_pct:row.change_pct,htx_close_gap_pct:row.htx_close_gap_pct,comparison_status:row.comparison_status,evidence_id:row.evidence_id,raw_hash:row.raw_hash})),htx:{source_ts:htx[0].source_ts,change_pct:htx[0].change_pct,evidence_id:htx[0].evidence_id},facts:facts.map(f=>({source:f.source,label:f.label,value:f.value,physical_root_key:f.physical_root_key})),score_unchanged:true},null,2));
