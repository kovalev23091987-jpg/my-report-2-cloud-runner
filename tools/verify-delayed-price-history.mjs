import fs from 'node:fs';
import assert from 'node:assert/strict';
import {inspectArchivePriceWindow} from '../runner/htx-delayed-price-history.mjs';
import {selectHorizonEndpoint} from '../current-generation/files/src/outcome-v2.mjs';
const path=process.argv[2];
if(!path)throw Error('QUALIFIED_HISTORICAL_PRICE_DIRECTORY_REQUIRED');
const manifest=JSON.parse(fs.readFileSync(path+'/archive-price-qualification.json'));
const payload=fs.readFileSync(path+'/qualified-historical-price-minutes.json.gz');
const start=manifest.event_interval[0],args={manifest,payload,contract:'NEAR-USDT',start_ts:start,end_ts:start+3600000,as_of_ts:manifest.qualified_at};
const first=inspectArchivePriceWindow(args);assert.equal(first.status,'CLOSED_HISTORICAL_PRICE_WINDOW');assert.equal(first.candles.length,60);
// This is a coverage probe clock, not an entry or a retrospectively invented signal.
const endpoint=selectHorizonEndpoint({anchor_ts:start,horizon:'h1',candles:first.candles});assert.equal(endpoint.status,'CLOSED');assert.equal(endpoint.endpoint_ts,start+3600000-1);
const bad=inspectArchivePriceWindow({...args,end_ts:start+6*3600000});assert.equal(bad.status,'CENSORED_MISSING_HISTORY');assert.equal(bad.reason,'DISPUTED_OR_MISSING_MINUTE');assert.deepEqual(bad.candles,[]);
for(const patch of [{contract:'FOREIGN-USDT'},{payload:Buffer.from('corrupt')},{as_of_ts:manifest.source_ts-1},{manifest:{...manifest,live_quote_eligible:true}}])assert.equal(inspectArchivePriceWindow({...args,...patch}).status,'CENSORED_MISSING_HISTORY');
fs.writeFileSync(path+'/historical-price-consumer-proof.json',JSON.stringify({schema:'ACTUAL_DELAYED_PRICE_SOURCE_TO_CONSUMER_V1',scope:'ONE_RETAINED_NEAR_DAY_AND_COVERAGE_PROBE_ONLY',archive_sha256:manifest.archive_sha256,source_ts:manifest.source_ts,original_source_clock_refreshed:false,first_hour:{status:first.status,minutes:first.candles.length,endpoint},first_six_hours:{status:bad.status,reason:bad.reason},forbidden_scope_checks:4,entry_samples_created:0,telegram_entry_proven:false,all102_30_90day_history:false,statistical_acceptance:false,project_complete:false},null,2)+'\n');
console.log(JSON.stringify({first_hour:first.status,first_six_hours:bad.status,entry_samples_created:0,project_complete:false}));
