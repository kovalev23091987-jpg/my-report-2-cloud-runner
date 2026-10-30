import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {analyzePump} from '../../../analytics/index.mjs';
import {input,T,MINUTE} from '../../../tests/analytics/fixtures.mjs';

const tz='/Users/mac/Downloads/MY_REPORT_2_TRANSFER_20261011 3/PUMP_REPORT_DESIGN_HANDOFF_20261025/PUMP_REPORT_TZ_FOR_TRANSFER_RU.md';
const tzsha=createHash('sha256').update(await readFile(tz)).digest('hex');assert.equal(tzsha,'0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc');
const x=input();x.mode='MANUAL';x.run_purpose='PRODUCTION';
for(const r of x.facts.candles.value)for(const k of ['open','high','low','close'])r[k]+=100;
x.facts.candles.value[111].high=270;x.facts.price.value=212;
const first=analyzePump(x);assert.equal(first.ready,true);assert.equal(first.current_threshold_passed,false);assert.deepEqual(first.next_wave.qualification,[]);
x.previous_wave=structuredClone(first.next_wave);x.mode='AUTO';x.analysis_ts=T+5*MINUTE;
let previous=212;for(const [i,close] of [220,225,232,238,245].entries()){x.facts.candles.value.push({open_ts:T+i*MINUTE,close_ts:T+(i+1)*MINUTE,closed:true,open:previous,high:close+0.1,low:previous-0.1,close,volume_base:3000,turnover_quote:null});previous=close;}
x.facts.price.value=245;for(const f of Object.values(x.facts)){f.event_ts=x.analysis_ts;f.received_ts=x.analysis_ts;f.expires_ts=x.analysis_ts+(f.kind==='orderbook'?15000:90000);}
x.facts.orderbook.value={asks:[[245.1,1000],[245.2,1000]],bids:[[244.9,1000],[244.8,1000]]};
const later=analyzePump(x);assert.equal(later.current_threshold_passed,true);assert.equal(later.next_wave.wave_id,first.next_wave.wave_id);

const cancelledInput=input();cancelledInput.run_purpose='PRODUCTION';const initial=analyzePump(cancelledInput);cancelledInput.previous_wave=initial.next_wave;cancelledInput.facts.price.value=98;
const cancelled=analyzePump(cancelledInput);assert.equal(cancelled.wave_state,'CANCELLED');cancelledInput.previous_wave=cancelled.next_wave;cancelledInput.facts.price.value=112;cancelledInput.analysis_ts=T+MINUTE;
for(const f of Object.values(cancelledInput.facts)){if(f.kind!=='candles')f.event_ts=T+MINUTE;f.received_ts=T+MINUTE;f.expires_ts=T+MINUTE+(f.kind==='orderbook'?15000:90000);}
const recovered=analyzePump(cancelledInput);assert.equal(recovered.ready,false);assert.equal(recovered.wave_state,'CANCELLED');assert.equal(recovered.wave_id,cancelled.wave_id);
const result={schema:'PUMP_M_SMALL_COUNTEREXAMPLE_V1',evidence:'ARTIFICIAL_ONLY',tz_sha256:tzsha,native_HTTP:0,native_SQL:0,Telegram:0,engine_fix_applied:false,
  manual_first:{ready:first.ready,current_threshold:first.current_threshold_passed,automatic_eligible:first.automatic_eligible,qualification:first.next_wave.qualification},
  later_AUTO:{ready:later.ready,current_threshold:later.current_threshold_passed,automatic_eligible:later.automatic_eligible,qualification:later.next_wave.qualification,reasons:later.reasons,minimum_potential_pct:later.plan?.potential_pct?.minimum??null,same_wave:later.wave_id===first.wave_id},
  confirmed_defect:later.current_threshold_passed&&later.automatic_eligible===false&&later.next_wave.qualification.length===0,
  cause:'previous?.qualification ?? passedWindows retains an empty [] forever instead of admitting the first later true qualification',
  cancellation_control:{first:cancelled.wave_state,after_recovery:recovered.wave_state,ready:recovered.ready,same_wave:recovered.wave_id===cancelled.wave_id},
  next:'Present this receipt to ROOT. No engine change before ROOT agreement; preserve immutable old wave creation/expiry and nonempty qualifications.'};
await writeFile(new URL('./manual-first-diagnostic.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
