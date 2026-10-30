import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSourceCoverage} from '../../sources/coverage.mjs';
import {createPumpSources} from '../../sources/index.mjs';

// Prepared F640 affected case only. Synthetic coverage metadata is not a
// native identity, source response, qualification, cost or IO admission.
test('skipped checks retain 550 explicit rows without inventing coverage or erasing history',()=>{
  const registry=Array.from({length:550},(_,i)=>({instrument_id:'FIXTURE:'+i,asset_id:'ASSET:'+i,
    native_symbol:'FIXTURE'+i,classification_status:'VERIFIED_CRYPTO'}));
  const common={capture_ts:1100,receipt_ref:'RESERVATION_ONLY',artifact_sha256:'a'.repeat(64),
    event_ts:null,received_ts:null,expires_ts:null,qualified:false};
  const observations=[
    {...common,instrument_id:'FIXTURE:0',kind:'core',status_at_capture:'NOT_CHECKED',reason_codes:['BUDGET_DENIED']},
    {...common,instrument_id:'FIXTURE:0',kind:'liquidations',status_at_capture:'NOT_CHECKED_BUDGET'},
    {...common,instrument_id:'FIXTURE:1',kind:'core',capture_ts:1000,receipt_ref:'ACTUAL_OLD_RESPONSE',
      event_ts:900,received_ts:1000,expires_ts:1500,qualified:true,status_at_capture:'USABLE'},
    {...common,instrument_id:'FIXTURE:1',kind:'core',status_at_capture:'NOT_CHECKED'},
    {...common,instrument_id:'FIXTURE:2',kind:'core',receipt_ref:'ACTUAL_ABSENCE',qualified:null,status_at_capture:'ABSENT'}
  ];
  const before=JSON.stringify(observations);
  const result=normalizeSourceCoverage({registry,as_of_ts:2000,observations});
  assert.equal(result.rows.length,550);assert.equal(result.verified_denominator,550);
  assert.equal(result.complete_crypto_N,null);
  assert.equal(result.totals.core.ever_checked,2);assert.equal(result.totals.core.not_checked,549);
  assert.equal(result.totals.core.ever_usable_at_capture,1);assert.equal(result.totals.core.absent,1);
  assert.equal(result.totals.core.current_fresh,0);assert.equal(result.totals.core.unqualified,0);
  assert.equal(result.totals.liquidations.ever_checked,0);assert.equal(result.totals.liquidations.not_checked,550);
  const skipped=result.rows[0].sources.core,historical=result.rows[1].sources.core;
  assert.equal(skipped.ever_checked,false);assert.equal(skipped.ever_usable_at_capture,null);
  assert.equal(skipped.not_checked,true);assert.equal(skipped.absent,false);assert.equal(skipped.unqualified,null);
  assert.equal(skipped.current_state,'NOT_CHECKED');assert.equal(skipped.evidence_role,'SKIPPED_CHECK_METADATA');
  assert.equal(skipped.receipt_ref,'RESERVATION_ONLY');assert.equal(skipped.event_ts,null);
  assert.deepEqual(skipped.reason_codes,['NOT_CHECKED','BUDGET_DENIED']);
  assert.equal(historical.ever_checked,true);assert.equal(historical.ever_usable_at_capture,true);
  assert.equal(historical.not_checked,true);assert.equal(historical.current_fresh,false);
  assert.equal(result.rows[2].sources.core.absent,true);assert.equal(result.rows[549].sources.core.not_checked,true);
  assert.equal(result.probability,null);assert.equal(JSON.stringify(observations),before);
  const entries=[...Array.from({length:550},(_,i)=>'FIXTURE'+i),'BTC','ETH'].map(base=>({
    instrument:{instrument_id:'BINGX:'+base+'-USDT',asset_id:'FIXTURE_ASSET:'+base,venue:'BINGX',native_symbol:base+'-USDT',
      base,quote:'USDT',settle:'USDT',margin:'USDT',market_type:'PERPETUAL',classification_status:'VERIFIED_CRYPTO',
      identity_evidence_ref:'F640_SYNTHETIC_IDENTITY_NOT_NATIVE'},native_contract_id:'FIXTURE_'+base,
    native_base:base,family:'USDT_M',qualifications:{},liquidations:{routes:[]}}));
  let requests=0;
  const sources=createPumpSources({identityRegistry:entries,clock:()=>2000,
    broker:{request:()=>{requests++;throw Error('F640_NO_SOURCE_IO');}}});
  const coverage=sources.getCoverage();
  assert.equal(Object.hasOwn(coverage,'selected_registry_coverage'),false,'ordinary coverage shape has no universe payload');
  const selected=sources.getCoverage({include_universe:true}).selected_registry_coverage;
  assert.equal(coverage.instruments.length,0,'legacy observed-only list is unchanged');
  assert.equal(selected.denominator,550);assert.equal(selected.rows.length,550);
  assert.equal(selected.current_global_crypto_N,null);assert.equal(selected.current_full_CORE_proven,false);
  assert.equal(selected.coverage_grants_IO_or_qualification,false);assert.equal(selected.block7_state,'NOT_ACTIVATED_BY_TZ');
  assert(selected.rows.every(row=>Object.keys(row.blocks).length===6&&row.blocks[5].status_at_capture==='REMOVED_BY_OWNER'
    &&row.blocks[1].facts.candles.not_checked&&row.blocks[3].facts.orderbook.not_checked
    &&row.blocks[4].facts.open_interest.not_checked&&row.blocks[6].facts.liquidations.not_checked
    &&row.blocks[6].configured_route_count===0));
  assert.equal(requests,0);
});
