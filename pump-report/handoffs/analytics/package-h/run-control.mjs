import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createMaterializedSummary,foldOutcomeRecord,readMaterializedSummary} from '../../../analytics/materialized-summary.mjs';
import {summarizeOutcomes} from '../../../analytics/summary.mjs';

const sourceURL=new URL('../package-b/examples.json',import.meta.url),raw=await readFile(sourceURL),saved=JSON.parse(raw),source_sha256=createHash('sha256').update(raw).digest('hex');
const manifest=JSON.parse(await readFile(new URL('../package-b/qualification.json',import.meta.url),'utf8'));
assert.equal(manifest.files.find(f=>f.path==='pump-report/handoffs/analytics/package-b/examples.json').sha256,source_sha256);
const at=saved.options.as_of_ts;let aggregate=createMaterializedSummary({materialization_id:'H_SAVED_ARTIFICIAL_CONTROL',as_of_ts:at});const waves=new Map();
for(const record of saved.records){const key=JSON.stringify([record.origin.instrument_id,record.origin.wave_id]),wave=waves.get(key),result=await foldOutcomeRecord({aggregate,wave,event:{kind:'OUTCOME_RECORD',event_id:record.record_id,revision:(wave?.event_revision??0)+1,record},as_of_ts:at});aggregate=result.aggregate;waves.set(key,result.wave);}
const materialized=readMaterializedSummary(aggregate,{as_of_ts:at}),batch=summarizeOutcomes(saved.records,{as_of_ts:at});
const fields=['independent_waves','mature_waves','pending_waves','outcomes','mature_outcomes','pending_known_hits','denominators','gapped_mature_waves','coverage_unknown_mature_waves','enclosing_no_hit_proof_mature_waves','origin_conflict_waves','outcome_conflict_waves','identity_conflict_waves','publication_counts','reason_counts'];
const pick=q=>Object.fromEntries(fields.map(k=>[k,q[k]]));
const project=q=>({...pick(q),cohorts:q.cohorts.map(c=>({cohort_key:c.cohort_key,...pick(c)}))});
assert.deepEqual(project(materialized),project(batch));
const result={evidence:'SAVED_ARTIFICIAL_CONTRACT_CONTROL_NOT_NATIVE_PERFORMANCE',source:'pump-report/handoffs/analytics/package-b/examples.json',source_sha256,source_manifest_exact:true,records:saved.records.length,waves:waves.size,counters_and_cohorts_exact:true,
  materialized_projection:project(materialized),batch_projection:project(batch),materialized_state:aggregate,probability_pct:null,native_IO:0};
await writeFile(new URL('./control-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({records:result.records,waves:result.waves,cohorts:materialized.cohorts.length,exact:result.counters_and_cohorts_exact,native_IO:0,probability_pct:null})+'\n');
