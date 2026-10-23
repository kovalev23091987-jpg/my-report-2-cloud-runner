// New integrated controlled measurement. No old accepted replay/test execution.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {hash,newMemory,capture,observe,serialize,dueEvents} from '../observer/observer.mjs';
import {fixture,snapshot} from '../observer/fixtures.mjs';
import {estimateCapacity,arithmeticHeadroom} from './capacity.mjs';
const card=fixture().result.events[0],cardBytes=Buffer.byteLength(JSON.stringify(card));
const ordinary=estimateCapacity({new_events_day:10,deep_rechecks_day:20,card_bytes:cardBytes});
const peak=estimateCapacity({new_events_day:100,deep_rechecks_day:200,card_bytes:cardBytes});
const measured=[];
for(const count of [10,104,128]){
 let memory=newMemory();
 // Explicitly request historical CONTROLLED observation for this benchmark;
 // default replay capture is record-only after the starvation repair.
 for(let n=0;n<count;n++)memory=capture(memory,fixture({asset:'CONTROLLED:MEASURE:'+n}).result.events[0],{watch_mode:'HISTORICAL_REVIEW'}).state;
 const bytesBefore=Buffer.byteLength(serialize(memory)),cpu=process.cpuUsage(),heap=process.memoryUsage().heapUsed,t0=performance.now();
 const ids=Object.keys(memory.cards);
 for(const id of ids){const c=memory.cards[id],s=snapshot(c,{id:'MEASURE:'+id,price:100});memory=observe(memory,{event_id:id,snapshot:s,now_ts:s.received_ts+1}).state;}
 const elapsed=performance.now()-t0,used=process.cpuUsage(cpu),heapDelta=process.memoryUsage().heapUsed-heap;
 const bytesAfter=Buffer.byteLength(serialize(memory));
 assert.equal(Object.keys(memory.watch).length,count);assert.ok(Object.values(memory.watch).every(w=>w.active&&w.observed_count===1));
 measured.push({evidence_class:'CONTROLLED_LOCAL_NODE',events:count,one_tick_event_updates:count,wall_ms:elapsed,cpu_user_us:used.user,cpu_system_us:used.system,heap_delta_bytes:heapDelta,serialized_state_before_bytes:bytesBefore,serialized_state_after_bytes:bytesAfter,due_next_tick:dueEvents(memory,card.first_known_ts+600000).events.length,peak_heap_measured:false,cloudflare_CPU_or_native_SQL_qualified:false});
}
const root=new URL('../../',import.meta.url),auditPath='checkpoints/source-worker-anomaly-source-feasibility-20261018/analysis.json',auditBytes=fs.readFileSync(new URL(auditPath,root));
const audit=JSON.parse(auditBytes);
const actualBoundary=audit.rows.map(r=>({contract:r.contract,evidence_class:r.evidence_class,first_detection_ts_retained:r.event?.first_detection_ts_retained??null,prospective_outcome_eligible:false,reason:r.event?'MISSING_ORIGINAL_FIRSTKNOWN_AND_KNOWN_TIME_ANCHOR_AND_MATCHED_LATER_PATH':'COMPACT_ARTIFACT_WITHOUT_ORIGINAL_CANDLE_ARRAYS'}));
assert.equal(actualBoundary.length,4);assert.ok(actualBoundary.every(x=>!x.prospective_outcome_eligible));
const result={schema:'ANOMALY_CONTROLLED_COST_AND_REAL_DATA_BOUNDARY_V1',node:process.version,platform:process.platform,card_serialized_bytes:cardBytes,scenarios:{ordinary,peak},local_measurement:measured,actual_retained_boundary:{accepted_audit_path:auditPath,accepted_audit_raw_SHA256:createHash('sha256').update(auditBytes).digest('hex'),rows:actualBoundary,empirical_success_rate:null,raw_provider_replay_repeated:false},nominal_reference_only:{existing_daily_envelope_R:3499996,existing_daily_envelope_W:69983,nominal_limit_R:3500000,nominal_limit_W:70000,nominal_difference_R:4,nominal_difference_W:17,actual_free_residual:null,scope:'Copied historical main full-run projection; not live measured all-consumer capacity'},admission_without_native_measurements:arithmeticHeadroom({}),activation:false,limitations:['One controlled local pass per event count; not sustained benchmark, SLA, p95, Worker limit or native billing proof','Pure reducer clones total memory for every event; O(E²) per tick. A real durable indexed store needs a different transactional adapter and qualification','Creation writes18/event,2futures+2optionalspotpages and64KiB rawbody are explicit scenario assumptions, not measured native costs','Longer actual lifetimes, event rate or source pagination increases queue; no autoexpiry or silent eviction']};
fs.writeFileSync(new URL('./measured-scenarios.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',cardBytes,ordinary_active:ordinary.expected_active_events,ordinary_HTTP:ordinary.source_HTTP.total_floor_day,peak_active:peak.expected_active_events,peak_HTTP:peak.source_HTTP.total_floor_day,measurement:measured.map(x=>({events:x.events,wall_ms:x.wall_ms,serialized_bytes:x.serialized_state_after_bytes})),actual_eligible_events:0,network:0,SQL:0,Telegram:0}));
