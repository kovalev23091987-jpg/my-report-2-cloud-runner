import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const url=process.env.REPORT2_TEST_RUNTIME?pathToFileURL(process.env.REPORT2_TEST_RUNTIME+'/src/execution-report-context.mjs'):new URL('../files/src/execution-report-context.mjs',import.meta.url);
const {auditExactN11RenderedSourceBindings,auditExecutionReportRendering}=await import(url);
const path=new URL('../../checkpoints/active-identity-n04-natural-38427005558/report2-run-result.json.gz',import.meta.url);
const original=JSON.parse(gunzipSync(fs.readFileSync(path))),clone=()=>structuredClone(original);
const row=o=>o.candidates[0],source=o=>row(o).execution_context_source;
const mutations={
 'foreign run':o=>o.run_id='FOREIGN',
 'foreign snapshot':o=>row(o).snapshot_id='FOREIGN',
 'missing original source':o=>row(o).execution_context_source=null,
 'unmeasured HTTP-only receipt':o=>source(o).bundle.safety_gate_receipt.persistence.verification_method='HTTP_200',
 'changed original book':o=>source(o).bundle.execution_gate.factual_basis.facts.bids[0][0]*=2,
 'future original source clock':o=>source(o).bundle.execution_gate.factual_basis.facts.book_source_ts=row(o).observed_ts+1,
 'foreign assigned EV2 identity':o=>row(o).block_coverage.blocks.N11.source_checks.PRIMARY_EXECUTION_STRESS.valid_evidence_ids=['EV2:FOREIGN'],
 'foreign assigned physical root':o=>row(o).block_coverage.blocks.N11.source_checks.PRIMARY_EXECUTION_STRESS.physical_root_keys=['FOREIGN'],
 'foreign assigned upstream':o=>row(o).block_coverage.blocks.N11.source_checks.PRIMARY_EXECUTION_STRESS.declared_upstream_ids=['OTHER'],
 'unbound rendered snapshot':o=>row(o).block_rendered_results.snapshot_id='FOREIGN',
 'metadata-only manual':o=>row(o).manual_text='No verified printed facts',
 'missing final printed lines':o=>o.report_text=o.report_text.split('\n').filter(l=>!l.includes('Измеренная глубина')&&!l.includes('Проверка размера')).join('\n'),
 'wrong final contract section':o=>o.report_text=o.report_text.replace('\n'+row(o).contract+'\n','\n'+o.candidates[1].contract+'\n'),
 'wrong immutable rendered receipt IDs':o=>{for(const r of row(o).block_rendered_results.context_receipts.filter(r=>r.block_id==='N11'))r.evidence_ids=['OTHER'];},
};
test('exact saved USELESS and UNI books bind six rendered facts to two assigned EV2 IDs without new acquisition',()=>{
 const before=JSON.stringify(original),a=auditExactN11RenderedSourceBindings(original);assert.equal(a.bindings.length,6);assert.equal(new Set(a.bindings.map(x=>x.producer_evidence_id)).size,2);
 assert.deepEqual([...new Set(a.bindings.map(x=>x.contract))],['USELESS-USDT','UNI-USDT']);assert.equal(a.sourceHTTP+a.D1+a.Telegram,0);assert.equal(a.telegram_delivery_proven,false);
 assert.equal(a.bindings[0].source_ts,1791907383258);assert.ok(a.bindings.every(r=>r.market==='FUTURES'&&r.score_contribution===0&&r.entry_authorized===false&&r.immutable_evidence_ids.length===2));
 assert.equal(a.bindings[0].producer_evidence_id,'EV2:f133f69c4086622a02706ba1e2970d5140361f725a0f7599c87ce53255de76f1');assert.equal(JSON.stringify(original),before);
});
for(const [name,mutate] of Object.entries(mutations))test(`${name} cannot manufacture exact N11 rendered-source use`,()=>{
 const o=clone();mutate(o);const a=auditExactN11RenderedSourceBindings(o);assert.equal(a.bindings.filter(x=>x.contract===original.candidates[0].contract).length,0);
});
test('duplicate saved candidates do not create additional uses or independent source votes',()=>{
 const o=clone();o.candidates.push(structuredClone(o.candidates[0]));assert.equal(auditExactN11RenderedSourceBindings(o).bindings.length,6);
});
test('runtime execution rendering audit recognizes original Russian lines without changing report text',()=>{
 const o=clone(),before=o.report_text;assert.equal(o.execution_report_rendering.context_receipts.length,0);
 const a=auditExecutionReportRendering(o);assert.equal(a.status,'REPORT_TEXT_VERIFIED');assert.equal(a.context_receipts.length,6);assert.deepEqual(a.used_context_block_ids,['N11']);assert.equal(o.report_text,before);assert.equal(a.score_contribution,0);assert.equal(a.entry_authorized,false);
});
