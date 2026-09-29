import test from 'node:test';
import assert from 'node:assert/strict';
import {formatManualRunSummary,formatStandaloneLiquidationSourceLines} from '../files/src/manual-run-summary.mjs';

const generated_at='2026-09-29T16:20:34.866Z';
const rejected={contract:'龙虾-USDT',direction:'SHORT',canonical_state:'REJECTED',manual_text:null,
 canonical:{status:'CLOSED',state:'REJECTED',direction:'SHORT',scores:{coin_interest_0_100:73},entry:null,trigger:null,invalidation:null,targets:[]}};

test('rejected run has a ready Russian report without technical diagnostics',()=>{
 const text=formatManualRunSummary({status:'CLOSED',candidates:[rejected],generated_at});
 assert.match(text,/МОЙ ОТЧЁТ 2/u);
 assert.match(text,/ЛОНГ[\s\S]*ШОРТ/u);
 assert.match(text,/龙虾-USDT.*73 из 100.*отклонена/u);
 assert.match(text,/Действие сейчас: не входить/u);
 assert.doesNotMatch(text,/GitHub|CLOSED|HTX Futures|DEGRADED|источник|запуск|364|72 из 72/u);
});

test('watch is presented only with a complete 5 percent plan',()=>{
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
 const unproven=structuredClone(watch);unproven.canonical.targets[0].price=102;
 assert.doesNotMatch(formatManualRunSummary({status:'CLOSED',candidates:[unproven],generated_at}),/Наблюдение/u);
 const expired=structuredClone(watch);expired.valid_until_ts=Date.parse(generated_at)-1000;
 assert.doesNotMatch(formatManualRunSummary({status:'CLOSED',candidates:[expired],generated_at}),/Наблюдение/u);
});

test('failed source status never masquerades as healthy absence of ideas',()=>{
 assert.equal(formatManualRunSummary({status:'NOT_CLOSED',candidates:[],generated_at}),null);
});
test('standalone answer distinguishes projected 0xArchive buckets from direct Hyperliquid prices',()=>{
 const context={schema:'SCOPED_PROVIDER_LIQUIDATION_CONTEXT_V1',status:'USABLE_SCOPED_NATIVE_CONTEXT',provider:'0xArchive',venue:'Hyperliquid',binding:{native_symbol:'FIL'},source_ts:1_800_000_000_000,price_quote:'USD',above:[{native_price:1.1,distance_pct:10,notional:42000,notional_unit:'USD'}],below:[]};
 const lines=formatStandaloneLiquidationSourceLines({independent_extensions:[context]});
 assert.ok(lines.some(line=>line.includes('0xArchive FIL (оценочные зоны Hyperliquid)')));
 assert.ok(lines.some(line=>line.includes('оценочный объём 42000 USD')));
 assert.ok(lines.every(line=>!line.startsWith('Hyperliquid FIL')));
});
