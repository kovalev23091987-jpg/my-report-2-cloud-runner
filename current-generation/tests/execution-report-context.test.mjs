import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {consumeExecutionReportContext,loadExecutionReportSource,auditExecutionReportRendering} from '../files/src/execution-report-context.mjs';
import {formatManualRunSummary} from '../files/src/manual-run-summary.mjs';
import {digest} from '../files/src/upstream-proof-utils.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('../../checkpoints/execution-context-source-20261004.json',import.meta.url)));
const run=fixture.origin_run_id;
function candidate(i=0){const s=structuredClone(fixture.rows[i]);return {contract:s.contract_code,run_id:run,snapshot_id:s.bundle.snapshot_id,observed_ts:s.observed_ts,
 canonical:{contract:s.contract_code,run_id:run,snapshot_id:s.bundle.snapshot_id,observed_ts:s.observed_ts,status:'CLOSED',state:'REJECTED',scores:{coin_interest_0_100:68},data_quality:{sufficient:false}},execution_context_source:s};}
const signed=row=>{const b=row.execution_context_source.bundle;b.safety_gate_receipt.content_digest=digest({hard_veto:b.hard_veto,execution_gate:b.execution_gate});b.safety_gate_receipt.persistence.content_digest=b.safety_gate_receipt.content_digest;};
test('real immutable BR and NEAR facts become actual partial report text; no canonical or score mutation',()=>{
 const rows=[candidate(0),candidate(1)],before=JSON.stringify(rows.map(r=>r.canonical));
 const output={run_id:run,status:'PARTIAL_DATA_UNAVAILABLE',candidates:rows};output.report_text=formatManualRunSummary(output);
 const audit=auditExecutionReportRendering(output);assert.deepEqual(audit.used_context_block_ids,['N11','N16']);assert.equal(audit.context_receipts.length,10);
 assert.match(output.report_text,/6\.28575 USDT для 2081 одинаковых контрактов/);assert.match(output.report_text,/1\.553 USDT для 203 одинаковых контрактов/);
 assert.match(output.report_text,/комиссии и funding не включены/);assert.match(output.report_text,/Действие сейчас: не входить/);
 assert.equal(JSON.stringify(rows.map(r=>r.canonical)),before);assert.equal(audit.entry_authorized,false);
 assert.ok(audit.context_receipts.every(f=>f.score_contribution===0&&!f.hard_gate&&!f.directional_vote));
});
test('HTTP receipts, foreign run, snapshot, contract, unpersisted and future clocks cannot create information',()=>{
 for(const mutate of [r=>r.run_id='foreign',r=>r.canonical.run_id='foreign',r=>r.snapshot_id='foreign',r=>r.canonical.contract='OTHER-USDT',
  r=>r.execution_context_source.contract_code='OTHER-USDT',r=>r.execution_context_source.persisted_ts=r.observed_ts-1,
  r=>r.execution_context_source.bundle.safety_gate_receipt.persistence.verification_method='HTTP_200',
  r=>r.execution_context_source.bundle.execution_gate.factual_basis.facts.received_ts=r.observed_ts+1]){
   const r=candidate();mutate(r);assert.equal(consumeExecutionReportContext(r,run).facts.length,0);
 }
});
test('tampered quote rejected even with matching receipt digest; stale book verified as of exact decision time',()=>{
 const altered=candidate();altered.execution_context_source.bundle.execution_gate.factual_basis.plans.LONG.round_trip_quote_loss_ex_fees_funding=0;signed(altered);
 assert.equal(consumeExecutionReportContext(altered,run).reason,'EXECUTION_FACTS_CONTENT_MISMATCH');
 const stale=candidate();stale.execution_context_source.bundle.execution_gate.factual_basis.facts.valid_until_ts=stale.observed_ts-1;signed(stale);
 assert.equal(consumeExecutionReportContext(stale,run).reason,'EXECUTION_FACTS_STALE_OR_FUTURE');
 const r=candidate();assert.ok(consumeExecutionReportContext(r,run).facts.length>0,'historical same-clock facts remain historical, not current trade permission');
});
test('metadata-only or removed rendered lines do not count as used blocks',()=>{
 const output={run_id:run,status:'PARTIAL_DATA_UNAVAILABLE',candidates:[candidate()]};assert.equal(auditExecutionReportRendering(output).context_receipts.length,0);
 output.report_text=formatManualRunSummary(output);output.report_text=output.report_text.split('\n').filter(line=>!line.includes('Издержки входа и выхода')).join('\n');
 assert.deepEqual(auditExecutionReportRendering(output).used_context_block_ids,['N11']);
});
test('reader uses exact existing contract/clock index and refuses ambiguous same-snapshot rows',async()=>{
 const r=candidate(),source=r.execution_context_source;
 let calls=0;const db={prepare(sql){assert.match(sql,/INDEXED BY idx_full_evidence_shadow_contract_ts/);assert.match(sql,/contract_code=\?1 AND observed_ts=\?2/);assert.match(sql,/LIMIT 2/);
  return {bind(...params){assert.deepEqual(params,[r.contract,r.observed_ts]);return {async all(){calls++;return {results:[{...source,stage392_proof_bundle_json:JSON.stringify(source.bundle)}]};}};}};}};
 assert.deepEqual(await loadExecutionReportSource(db,r,run),source);assert.equal(calls,1);
 const noRead={prepare(){throw Error('unexpected read');}};assert.equal(await loadExecutionReportSource(noRead,r,'foreign'),null);
 const duplicate={prepare(){return {bind(){return {async all(){return {results:[source,source].map(s=>({...s,stage392_proof_bundle_json:JSON.stringify(s.bundle)}))};}};}};}};
 assert.equal(await loadExecutionReportSource(duplicate,r,run),null);
});
