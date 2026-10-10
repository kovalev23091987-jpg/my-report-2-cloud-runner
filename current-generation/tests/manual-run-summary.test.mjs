import test from 'node:test';
import assert from 'node:assert/strict';
import {enforceManualBlockCoverage,formatManualRunSummary,formatStandaloneLiquidationSourceLines} from '../files/src/manual-run-summary.mjs';

const generated_at='2026-09-29T16:20:34.866Z';
const rejected={contract:'龙虾-USDT',direction:'SHORT',canonical_state:'REJECTED',manual_text:null,
 canonical:{status:'CLOSED',state:'REJECTED',direction:'SHORT',scores:{coin_interest_0_100:73},entry:null,trigger:null,invalidation:null,targets:[]}};

test('rejected run has a ready Russian report without technical diagnostics',()=>{
 const text=formatManualRunSummary({status:'CLOSED',candidates:[rejected],generated_at});
 assert.match(text,/МОЙ ОТЧЁТ 2/u);
 assert.match(text,/ЛОНГ[\s\S]*ШОРТ/u);
 assert.match(text,/龙虾-USDT.*раннюю оценку интереса 73 из 100.*подтверждающая проверка.*отклонена/u);
 assert.match(text,/Действие сейчас: не входить/u);
 assert.doesNotMatch(text,/GitHub|CLOSED|HTX Futures|DEGRADED|источник|запуск|364|72 из 72/u);
});

test('watch is presented with a favorable measured target without a fixed percentage',()=>{
 const watch={...rejected,contract:'QNT-USDT',direction:'LONG',canonical_state:'OBSERVE',canonical:{
  status:'CLOSED',state:'OBSERVE',direction:'LONG',scores:{coin_interest_0_100:73},
  entry:{min_price:100},trigger:{value:100},invalidation:{price:97},targets:[{price:106}],
 }};
 const text=formatManualRunSummary({status:'CLOSED',candidates:[watch],generated_at});
 assert.match(text,/QNT-USDT — Наблюдение; оценка 73 из 100/u);
 assert.match(text,/Уровень входа: 100 USDT/u);
 assert.match(text,/Отмена идеи: цена ниже 97 USDT/u);
 assert.match(text,/Первая цель: 106 USDT/u);
 assert.doesNotMatch(text,/Действие сейчас: не входить/u);
 const smaller=structuredClone(watch);smaller.canonical.targets[0].price=102;
 assert.match(formatManualRunSummary({status:'CLOSED',candidates:[smaller],generated_at}),/Наблюдение[\s\S]*Первая цель: 102 USDT/u);
 const pending=structuredClone(watch);pending.canonical.targets=[];
 assert.match(formatManualRunSummary({status:'CLOSED',candidates:[pending],generated_at}),/Наблюдение[\s\S]*Первая цель: пока не подтверждена/u);
 const expired=structuredClone(watch);expired.valid_until_ts=Date.parse(generated_at)-1000;
 assert.doesNotMatch(formatManualRunSummary({status:'CLOSED',candidates:[expired],generated_at}),/Наблюдение/u);
});

test('failed source status never masquerades as healthy absence of ideas',()=>{
 assert.equal(formatManualRunSummary({status:'NOT_CLOSED',candidates:[],generated_at}),null);
});
test('manual run always returns the owner layout instead of stored technical text',()=>{
 const approved='МОЙ ОТЧЁТ 2\n\nКАНОНИЧЕСКОЕ СОСТОЯНИЕ\nНаблюдение по QNT-USDT.';
 const ids=['N02','N03','N04','N05','N06','N07','N08','N09','N10','N11','N12','N14','N15','N16'];
 const blocks=Object.fromEntries(ids.map((id,i)=>[id,{status:i<2?'ADMISSIBLE_FACTUAL_CONTEXT':i<8?'FACTS_PRESENT_NOT_DECISION_ADMISSIBLE':'CHECKED_NO_USABLE_FACTS'}]));
 const output={status:'CLOSED',source:'manual',candidates:[{manual_text:approved,block_coverage:{coverage_count:14,checked_block_count:14,usable_block_count:2,all_blocks_checked:true,blocks}}],generated_at};
 const checked=enforceManualBlockCoverage(output);
 assert.equal(checked.status,'CLOSED');
 const rendered=formatManualRunSummary(checked);
 assert.match(rendered,/Проверка дополнительных блоков: 14 из 14; неподтверждённых: 0/u);
 assert.match(rendered,/Новые допущенные факты: 2 блока; сведения без допуска в решение: 6; событий не обнаружено: 6/u);
 assert.match(rendered,/ЛОНГ[\s\S]*ШОРТ/u);
 assert.doesNotMatch(rendered,/КАНОНИЧЕСКОЕ СОСТОЯНИЕ/u);
});
test('manual run fails closed when any candidate lacks a active 14 block check',()=>{
 const output={status:'CLOSED',source:'manual',candidates:[{manual_text:'НЕ ПОКАЗЫВАТЬ',block_coverage:{coverage_count:14,checked_block_count:12,all_blocks_checked:false}}],generated_at};
 const checked=enforceManualBlockCoverage(output);
 assert.equal(checked.status,'PARTIAL_DATA_UNAVAILABLE');
 assert.equal(checked.reason,'BLOCK_OUTCOME_AUDIT_MISSING');
 assert.match(formatManualRunSummary(checked),/12 из 14/u);
 assert.doesNotMatch(formatManualRunSummary(checked),/НЕ ПОКАЗЫВАТЬ/u);
});
test('empty manual run cannot claim a vacuous 14 of 14 check',()=>{
 const checked=enforceManualBlockCoverage({status:'CLOSED_NO_CANONICAL_CANDIDATE',source:'manual',candidates:[],generated_at});
 assert.equal(checked.status,'PARTIAL_DATA_UNAVAILABLE');
 assert.equal(checked.block_audit.candidate_count,0);
 assert.equal(checked.block_audit.all_candidates_fully_checked,false);
 assert.match(formatManualRunSummary(checked),/0 из 14/u);
 assert.doesNotMatch(formatManualRunSummary(checked),/Проверка дополнительных блоков: 14 из 14/u);
});
test('workflow dispatch is treated as a manual owner run and fails closed on partial coverage',()=>{
 const checked=enforceManualBlockCoverage({status:'CLOSED',source:'workflow_dispatch',candidates:[{block_coverage:{coverage_count:14,checked_block_count:14,all_blocks_checked:false}}],generated_at});
 assert.equal(checked.status,'PARTIAL_DATA_UNAVAILABLE');
 assert.match(formatManualRunSummary(checked),/14 из 14/u);
});
test('standalone answer distinguishes projected 0xArchive buckets from direct Hyperliquid prices',()=>{
 const context={schema:'SCOPED_PROVIDER_LIQUIDATION_CONTEXT_V1',status:'USABLE_SCOPED_NATIVE_CONTEXT',provider:'0xArchive',venue:'Hyperliquid',binding:{native_symbol:'FIL'},source_ts:1_800_000_000_000,price_quote:'USD',above:[{native_price:1.1,distance_pct:10,notional:42000,notional_unit:'USD'}],below:[]};
 const lines=formatStandaloneLiquidationSourceLines({independent_extensions:[context]});
 assert.ok(lines.some(line=>line.includes('0xArchive FIL (оценочные зоны Hyperliquid)')));
 assert.ok(lines.some(line=>line.includes('оценочный объём 42000 USD')));
 assert.ok(lines.every(line=>!line.startsWith('Hyperliquid FIL')));
});

test('partial analysis preserves only verified same-run rendered facts without creating an entry plan',async()=>{
 const fs=await import('node:fs');
 const {consumeBlockResultContext,auditRenderedBlockResults}=await import('../files/src/block-result-context.mjs');
 const {formatManualReport}=await import('../files/src/manual-report-formatter.mjs');
 const c=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
 c.metadata.supporting_context={facts:consumeBlockResultContext({evidence:c.metadata.internal_market_context.evidence_v2.evidence,contract:c.metadata.contract,now:c.observed_ts}).facts};
 const manual=formatManualReport(c);
 const row={contract:c.metadata.contract,run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,canonical:c,manual_text:manual.text,block_rendered_results:auditRenderedBlockResults({canonical:c,manual})};
 const output={status:'PARTIAL_DATA_UNAVAILABLE',run_id:c.run_id,candidates:[row]};
 const text=formatManualRunSummary(output);
 assert.match(text,/Проверка не завершена/u);assert.match(text,/238 токенов/u);assert.match(text,/Действие сейчас: не входить/u);
 assert.doesNotMatch(text,/Уровень входа:/u);
 for(const mutate of [r=>r.run_id='foreign',r=>r.snapshot_id='foreign',r=>r.manual_text='',r=>r.block_rendered_results.status='UNVERIFIED']){
  const changed=structuredClone(row);mutate(changed);assert.doesNotMatch(formatManualRunSummary({...output,candidates:[changed]}),/238 токенов/u);
 }
});
