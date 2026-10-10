import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveredEntryCohort,selectEntryAnchor,selectHorizonEndpoint,evaluatePricePath,calculateOutcome,selectMatureOutcomes} from '../files/src/outcome-v2.mjs';
import {evaluateZoneTouch,forecastGroupKey,calibrationReadiness,resolveCalibrationFactor,assignChronologicalSplit} from '../files/src/calibration-v2.mjs';

test('K13: ACTIONABLE without exact SENT receipt is analytical only; SENT dispatch is unique cohort',()=>{
  const publication={event:'ENTRY',publication_id:'P',generation:'G',wave_id:'W',direction:'LONG'},dispatch={publication_id:'P',dispatch_id:'D',recipient_identity:'R'};
  assert.equal(deliveredEntryCohort({publication,dispatch,relay_receipt:{dispatch_id:'D',state:'FAILED'}}).included,false);
  const sent=deliveredEntryCohort({publication,dispatch,relay_receipt:{dispatch_id:'D',state:'SENT',message_id:1,recipient_identity:'R'}});assert.equal(sent.included,true);assert.match(sent.sample_key,/G\|W\|LONG\|P\|D/);
});

test('K13: delivery delay selects first fresh executable HTX side and never stale canonical price',()=>{
  const quotes=[{type:'EXECUTABLE_ASK',source_ts:900,value:90,notional_usd:1000},{type:'EXECUTABLE_ASK',source_ts:1010,value:101,notional_usd:1000}];
  const anchor=selectEntryAnchor({direction:'LONG',delivery_ts:1000,quotes,notional_usd:1000});assert.equal(anchor.anchor_price,101);assert.equal(anchor.delivery_delay_ms,10);
  assert.equal(selectEntryAnchor({direction:'SHORT',delivery_ts:1000,quotes,notional_usd:1000}).status,'ENTRY_REFERENCE_UNAVAILABLE');
});

test('K13: exact horizons use prior closed minute and TP+SL in one candle is ambiguous',()=>{
  const endpoint=selectHorizonEndpoint({anchor_ts:1000,horizon:'h1',candles:[{closed:true,close_ts:1000+3600000-30000,close:105}]});assert.equal(endpoint.status,'CLOSED');
  const path=evaluatePricePath({direction:'LONG',anchor_price:100,target_price:105,invalidation_price:95,candles:[{closed:true,high:106,low:94}]});assert.equal(path.status,'AMBIGUOUS_PATH');assert.equal(path.target_touch,true);assert.equal(path.invalidation_touch,true);
});

test('K13: costs are subtracted once and missing funding prevents exact net claim',()=>{
  const full=calculateOutcome({direction:'SHORT',anchor_price:100,endpoint_price:90,costs:{fees_pct:.1,spread_slippage_pct:.2,funding_pct:.1,provenance:'MODEL'}});assert.ok(Math.abs(full.net_return_pct-9.6)<1e-9);
  assert.equal(calculateOutcome({direction:'LONG',anchor_price:100,endpoint_price:110,costs:{fees_pct:.1,spread_slippage_pct:.2,funding_pct:null}}).net_status,'COST_INCOMPLETE');
});

test('K13: bad first mature row never blocks next and at most eight are selected',()=>{
  const rows=[{status:'PENDING',due_ts:1,attempts:3,history_available:false},...Array.from({length:10},(_,i)=>({id:i,status:'PENDING',due_ts:1,attempts:0,history_available:true}))];const out=selectMatureOutcomes(rows,{now:100000,limit:8});assert.equal(out.selected.length,8);assert.equal(out.skipped[0].next_status,'CENSORED_MISSING_HISTORY');assert.equal(out.cursor_advanced,11);
});

test('K13: invalid anchor identity and malformed mature rows stay censored',()=>{
  const quote={type:'EXECUTABLE_BID',source_ts:1010,value:99,notional_usd:1000};
  assert.equal(selectEntryAnchor({direction:'SIDEWAYS',delivery_ts:1000,quotes:[quote],notional_usd:1000}).status,'ENTRY_REFERENCE_INVALID');
  assert.equal(selectEntryAnchor({direction:'SHORT',delivery_ts:'1000',quotes:[quote],notional_usd:1000}).status,'ENTRY_REFERENCE_INVALID');
  assert.equal(selectEntryAnchor({direction:'SHORT',delivery_ts:1000,quotes:[{...quote,source_ts:1000.5}],notional_usd:1000}).status,'ENTRY_REFERENCE_UNAVAILABLE');
  assert.equal(selectEntryAnchor({direction:'SHORT',delivery_ts:1000,quotes:[{...quote,notional_usd:'1000'}],notional_usd:1000}).status,'CLOSED');
  const valid={status:'PENDING',due_ts:1,attempts:0,history_available:true};
  const rows=[valid,{...valid,due_ts:'1'},{...valid,attempts:NaN},{...valid,history_available:'yes'},null];
  const selected=selectMatureOutcomes(rows,{now:100000,limit:8});assert.equal(selected.status,'CLOSED');assert.equal(selected.selected.length,1);assert.equal(selected.invalid.length,4);
  const invalidBatch=selectMatureOutcomes(rows,{now:100000,limit:99});assert.equal(invalidBatch.status,'CENSORED_INVALID_BATCH');assert.equal(invalidBatch.selected.length,0);
});

test('K13: missing or invalid price history is censored, never counted as a closed path or modelled profit',()=>{
  const empty=evaluatePricePath({direction:'LONG',anchor_price:100,target_price:105,invalidation_price:95,candles:[]});
  assert.equal(empty.status,'CENSORED_MISSING_HISTORY');assert.equal(empty.mfe_pct,null);assert.equal(empty.target_touch,null);
  const malformed=evaluatePricePath({direction:'SHORT',anchor_price:100,target_price:90,invalidation_price:110,candles:[{closed:true,high:'missing',low:80}]});
  assert.equal(malformed.status,'CENSORED_INVALID_HISTORY');assert.equal(malformed.mae_pct,null);
  assert.equal(evaluatePricePath({direction:'LONG',anchor_price:0,target_price:105,invalidation_price:95,candles:[{closed:true,high:110,low:90}]}).status,'CENSORED_INVALID_INPUT');
  const target=1000+3600000;
  assert.equal(selectHorizonEndpoint({anchor_ts:1000,horizon:'h1',candles:[{closed:true,close_ts:target-1000,close:'NaN'}]}).status,'CENSORED_INVALID_HISTORY');
  assert.equal(selectHorizonEndpoint({anchor_ts:1000,horizon:'unknown',candles:[]}).status,'CENSORED_INVALID_INPUT');
  const invalid=calculateOutcome({direction:'SHORT',anchor_price:100,endpoint_price:0,costs:{fees_pct:0,spread_slippage_pct:0,funding_pct:0}});
  assert.equal(invalid.net_status,'CENSORED_INVALID_PRICE');assert.equal(invalid.net_return_pct,null);assert.equal(invalid.gross_return_pct,null);
});

test('K14: endpoint +0.6% does not touch levels 105–112.6 without path high',()=>{
  for(const level of [105,106,108,112.6])assert.equal(evaluateZoneTouch({direction:'LONG',level_price:level,path_high:100.6,path_low:99}).zone_touch,false);
});

test('K14: twenty levels of one market episode are one independent forecast group',()=>{
  const keys=new Set(Array.from({length:20},()=>forecastGroupKey({asset:'SOL',wave:'W',upstream_venue:'HL',forecast_family:'ZONES',horizon:'1h'})));assert.equal(keys.size,1);
});

test('K14: factor stays one without all future gates and chronological test is untouched by selection',()=>{
  const rows=Array.from({length:199},(_,i)=>({asset:`A${i%20}`,wave:`W${i}`,upstream_venue:'HL',forecast_family:'Z',horizon:'4h',direction:i%2?'LONG':'SHORT',observed_ts:Date.UTC(2026,0,1)+i*4*3600000}));const readiness=calibrationReadiness(rows);assert.equal(readiness.eligible,false);assert.equal(resolveCalibrationFactor({apply_enabled:true,state:'ACTIVE',candidate_factor:1.25,readiness}).factor,1);
  const split=assignChronologicalSplit(Array.from({length:10},(_,i)=>({observed_ts:i})));assert.deepEqual(split.map(x=>x.split),['TRAIN','TRAIN','TRAIN','TRAIN','TRAIN','TRAIN','VALIDATION','VALIDATION','TEST','TEST']);
});


test('K13: a delivered-entry cohort requires exact identities and a positive integer message id',()=>{
  const publication={event:'ENTRY',publication_id:'P',generation:'G',wave_id:'W',direction:'LONG'};
  const dispatch={publication_id:'P',dispatch_id:'D',recipient_identity:'R'};
  const relay_receipt={dispatch_id:'D',recipient_identity:'R',state:'SENT',message_id:'173'};
  assert.equal(deliveredEntryCohort({publication,dispatch,relay_receipt}).included,true);
  for(const invalid of [0,-1,'1.5','Infinity','NaN',null]){
    assert.equal(deliveredEntryCohort({publication,dispatch,relay_receipt:{...relay_receipt,message_id:invalid}}).included,false);
  }
  assert.equal(deliveredEntryCohort({publication,dispatch:{...dispatch,recipient_identity:undefined},relay_receipt:{...relay_receipt,recipient_identity:undefined}}).included,false);
  assert.equal(deliveredEntryCohort({publication:{...publication,direction:null},dispatch,relay_receipt}).included,false);
  assert.equal(deliveredEntryCohort({publication:{...publication,wave_id:''},dispatch,relay_receipt}).included,false);
});

test('K14: malformed or nonpositive OHLC cannot become a closed zone touch',()=>{
  for(const input of [
    {direction:'LONG',level_price:100,path_high:110,path_low:120},
    {direction:'SHORT',level_price:100,path_high:120,path_low:0},
    {direction:'LONG',level_price:0,path_high:110,path_low:90},
    {direction:'LONG',level_price:100,path_high:'NaN',path_low:90}
  ])assert.deepEqual(evaluateZoneTouch(input),{status:'CENSORED',zone_touch:null});
  assert.deepEqual(evaluateZoneTouch({direction:'LONG',level_price:100,path_high:110,path_low:90}),{status:'CLOSED',zone_touch:true});
});

test('K14: malformed prospective observations cannot create calibration readiness or crash a batch',()=>{
  const valid={asset:'SOL',wave:'W1',upstream_venue:'HL',forecast_family:'ZONES',horizon:'1h',direction:'LONG',observed_ts:Date.UTC(2026,9,10)};
  const rows=[valid,{...valid,wave:'W2',observed_ts:'broken'},{...valid,wave:'W3',direction:'SIDEWAYS'},{...valid,wave:'W4',asset:null},{...valid,wave:'W5',observed_ts:Infinity}];
  const result=calibrationReadiness(rows);
  assert.equal(result.independent_waves,1);assert.equal(result.excluded_invalid,4);assert.equal(result.eligible,false);
});

test('K14: activation gates reject invalid factors and impossible coverage while leaving shadow weights at one',()=>{
  const good={apply_enabled:true,state:'ACTIVE',candidate_factor:1.1,readiness:{eligible:true},test_lower_bound:.1,action_coverage:.9,hard_gates_unchanged:true,costs_not_worse:true,false_data_not_worse:true};
  assert.equal(resolveCalibrationFactor(good).factor,1.1);
  for(const bad of [{candidate_factor:NaN},{candidate_factor:Infinity},{candidate_factor:0},{action_coverage:1.1},{action_coverage:NaN},{test_lower_bound:2}]){
    const result=resolveCalibrationFactor({...good,...bad});assert.equal(result.factor,1);assert.equal(result.status,'SHADOW_FACTOR_ONE');
  }
  assert.equal(resolveCalibrationFactor({...good,apply_enabled:false}).factor,1);
});
