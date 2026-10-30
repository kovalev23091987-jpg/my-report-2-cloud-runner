// New boundary tests only. The accepted CT/BR 1m→3m/5m replay is not rerun.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {detectClosed} from './observer.mjs';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root));
const audit=JSON.parse(read('checkpoints/source-worker-anomaly-source-feasibility-20261018/analysis.json'));
for(const symbol of ['CT','BR'])test(`RETAINED ${symbol}: incomplete card cannot become new detector evidence`,()=>{
 const row=audit.rows.find(x=>x.contract===symbol+'-USDT'),raw=gunzipSync(read(row.binding.file)),c=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),row.binding.canonical_json_sha256);
 assert.equal(row.futures_event_1m.preceding_comparison_baseline_bars_retained_here,0);
 assert.equal(row.event.first_detection_ts_retained,null);
 // Existing compact event.candle omits volume. Do not relabel it a complete
 // raw provider bar or make the canonical decision's clock an early firstseen.
 const end=c.opportunity.event_close_ts,bar={...c.opportunity.candle,start_ts:end-900000,end_ts:end};
 assert.equal(Object.hasOwn(bar,'volume'),false);
 assert.throws(()=>detectClosed({instrument:{asset_id:'HTX_NATIVE:'+symbol,venue:'HTX',upstream:'HTX',contract:row.contract,market:'FUTURES',quote:'USDT',price_unit:'USDT_PER_BASE',volume_unit:'QUOTE_USDT',multiplier:1,binding_ref:row.binding.file,binding_kind:'VERIFIED_NATIVE',identity_verified:true},timeframe:'15m',alignment_offset_ms:0,bars:[bar],known_ts:c.observed_ts,mode:'REPLAY',provenance:{raw_ref:row.binding.file,raw_sha256:row.binding.canonical_json_sha256,source_as_of_ts:c.observed_ts,received_ts:c.observed_ts,evidence_class:'RETAINED'}}),/OHLCV_INVALID/);
});
