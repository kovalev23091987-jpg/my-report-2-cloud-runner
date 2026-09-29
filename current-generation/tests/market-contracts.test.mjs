import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeDirectionCandidate,authorizeEntryDirection,buildHtxReferencePrice,normalizeExecutionStatus,buildHtxExecutionReceipt,rolling24hChange,traceFinalDecision} from '../files/src/market-contracts.mjs';

test('K04: only exact directions and enumerated discovery suffixes are accepted',()=>{
  for(const value of ['LONG','LONG_WATCH','LONG_CANDIDATE','LONG_BIAS'])assert.equal(normalizeDirectionCandidate(value).direction,'LONG');
  for(const value of ['SHORT','SHORT_WATCH'])assert.equal(normalizeDirectionCandidate(value).direction,'SHORT');
  for(const value of ['LONG_GUESS','BULL','SHORT_NOW',''])assert.equal(normalizeDirectionCandidate(value).direction,'UNKNOWN');
});

test('K04: discovery direction cannot authorize ENTRY or override a veto',()=>{
  const candidate=normalizeDirectionCandidate('LONG_WATCH',{origin:'DISCOVERY'});
  assert.equal(authorizeEntryDirection({candidate,final_route_state:'OBSERVE'}).authorized,false);
  assert.equal(authorizeEntryDirection({candidate,final_route_state:'ENTRY_NOW_VALIDATED',final_direction:'LONG',hard_veto:true}).authorized,false);
  assert.deepEqual(authorizeEntryDirection({candidate,final_route_state:'ENTRY_NOW_VALIDATED',final_direction:'SHORT'}).direction,'SHORT');
});

test('K04: HTX mid is explicitly observation-only and is not named mark',()=>{
  const mid=buildHtxReferencePrice({contract:'SOL-USDT',type:'MID_OBSERVATION',bid:99,ask:101,source_ts:1000,received_ts:1001});
  assert.equal(mid.status,'CLOSED');assert.equal(mid.value,100);assert.equal(mid.type,'MID_OBSERVATION');assert.equal(Object.hasOwn(mid,'mark_price'),false);
  assert.equal(buildHtxExecutionReceipt({component:{status:'SUCCESS'},reference_price:mid}).status,'NOT_CLOSED');
});

test('K04: execution receipt needs normalized success and side-specific/VWAP HTX price',()=>{
  const ask=buildHtxReferencePrice({contract:'SOL-USDT',type:'EXECUTABLE_ASK',bid:99,ask:101,source_ts:1000,received_ts:1001});
  assert.equal(normalizeExecutionStatus({ok:true}).status,'UNKNOWN');
  assert.equal(buildHtxExecutionReceipt({component:{execution_status:'SUCCESS'},reference_price:ask}).status,'CLOSED');
});

test('K04: real 24h window is distinct and missing window stays unknown',()=>{
  assert.ok(Math.abs(rolling24hChange({current:110,history_point:{value:100,actual_window_ms:24*60*60_000}}).rolling_24h_change_pct-10)<1e-9);
  assert.equal(rolling24hChange({current:110,history_point:{value:100,actual_window_ms:4*60*60_000}}).status,'UNKNOWN');
});

test('K04: four historical V4 missing final decisions retain exact upstream reason',()=>{
  for(const contract of ['ETC-USDT','ETHFI-USDT','DOT-USDT','LSK-USDT'])assert.deepEqual({...traceFinalDecision(null),contract},{before:'CANDIDATE',after:'REJECTED',reason:'NO_FINAL_DECISION_ROW',contract});
});

test('K04: authoritative worker feeds the frozen adapter only a typed HTX price and strict route',()=>{
 const source=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8');
 assert.match(source,/const htxObservationReferencePrice = buildHtxReferencePrice/);
 assert.match(source,/const entryDirectionAuthorization=authorizeEntryDirection/);
 assert.match(source,/const htxExecutionReceipt=buildHtxExecutionReceipt/);
 assert.match(source,/strictRouteState=entryState&&\(entryDirectionAuthorization\.authorized!==true\|\|htxExecutionReceipt\.status!==['"]CLOSED['"]\)\?['"]REJECTED['"]/);
 assert.match(source,/mark_price:null,ticker:null,ticker_24h:null/);
 assert.match(source,/provider_current_price:null/);
 assert.match(source,/current_price:htxReferencePrice\.status===['"]CLOSED['"]\?htxReferencePrice\.value:null/);
 assert.match(source,/discovery_direction_hint\?\?params\?\.discovery_row\?\.early_candidate_direction_hint/);
 assert.match(source,/snapshot_ts\?\?params\?\.discovery_row\?\.observed_ts/);
 assert.match(source,/confirmation_state:'DISCOVERY_ONLY'/);
 assert.match(source,/const discoverySnapshotTs\s*=/);
 assert.ok((source.match(/snapshot_ts:\s*discoverySnapshotTs/g)||[]).length>=2);
});
