// UNEXECUTED. No imports, assertions, product calls or top-level factories run.
// ROOT may instantiate this one affected set under its separate admission.
export const BZ45_VECTOR_STATUS='UNEXECUTED_ARTIFICIAL_FACTORIES_NOT_MARKET_PROOF';
const minute=60000,T=1800000000000;
const clone=x=>structuredClone(x);

function fixture(profile,{laterMinutes=0}={}){
  const end=T+laterMinutes*minute,at=end+2000;
  const instrument={instrument_id:'ARTIFICIAL:BINGX:BZ45-USDT',asset_id:'ARTIFICIAL:BZ45',native_symbol:'BZ45-USDT',
    base:'BZ45',quote:'USDT',settle:'USDT',venue:'BINGX',market_type:'PERPETUAL',classification_status:'VERIFIED_CRYPTO',
    identity_evidence_ref:'ARTIFICIAL_BZ45_ONLY',price_tick:0.01,quantity_step:0.000001,contract_multiplier:1};
  const rows=[];
  for(let n=-305;n<laterMinutes;n++){
    const oldSeed=n>=-200&&n<-195,newSeed=n>=-90&&n<-85;
    const close=oldSeed?98+(n+201)*0.4:n<-90?100:n<-85?100+(n+91)*4:118;
    const open=oldSeed?98+(n+200)*0.4:n===-90?100:n>-90&&n<-85?100+(n+90)*4:close;
    rows.push({open_ts:T+n*minute,close_ts:T+(n+1)*minute,closed:true,open,close,
      high:Math.max(open,close)+0.2,low:n===-100?94:oldSeed?95:Math.min(open,close)-0.2,
      volume_base:oldSeed||newSeed?3000:1000,turnover_quote:null});
  }
  const fact=(kind,value,unit)=>({fact_id:'ARTIFICIAL:BZ45:'+kind+':'+end,instrument_id:instrument.instrument_id,
    kind,value,unit,event_ts:kind==='candles'?end:at,received_ts:kind==='candles'?end+1000:at,
    expires_ts:at+(kind==='orderbook'?15000:kind==='price'?30000:90000),source:'ARTIFICIAL_BZ45',
    primary_provider:'ARTIFICIAL_BZ45',venue:'BINGX',status:'USABLE',origin:'OBSERVED',evidence_ref:'ARTIFICIAL_BZ45_ONLY'});
  const old={instrument_id:instrument.instrument_id,wave_id:'ARTIFICIAL:BZ45:OLD_CANCELLED',state:'CANCELLED',
    created_ts:T-195*minute,expires_ts:T-195*minute+profile.wave_max_age_ms,cancelled_ts:T-10*minute,
    covered_until_ts:T-11*minute,invalidation_price:95,reclaim_level:105,reclaim_breached:true,
    qualification:[{window_ms:86400000,start_ts:T-195*minute-86400000,end_ts:T-195*minute,
      start_price:80,end_price:100,passed:true,fact_ids:['ARTIFICIAL:OLD_QUALIFICATION_MUST_NOT_TRANSFER']}],
    qualification_known_ts:T-195*minute,current_volume:5000,peak_price:120,peak_event_ts:T-85*minute,confirmed_pivots:[],
    impulse:{start_ts:T-200*minute,end_ts:T-195*minute,open:98,close:100,low:95,volume:15000,baseline_median:5000,
      ratio:3,normal_range:0.4,return_pct:100*(100/98-1),field:'volume_base',unit:'BASE',comparison_kind:'QUALIFIED_ABSOLUTE_SAME_FIELD',
      comparison_key:null,interval_ms:minute,baseline_windows:12,baseline_status:'FULL'}};
  const input={schema_version:'PUMP_REPORT_INPUT_V1',run_id:'ARTIFICIAL_BZ45_UNEXECUTED',mode:'AUTO',run_purpose:'ACCEPTANCE_TEST',
    analysis_ts:at,instrument,previous_wave:old,
    liquidations:{status:'ABSENT',reason:'ARTIFICIAL_NO_MAP',zones:[],checked_sources:[],coverage:null},
    facts:{price:fact('price',118,'USDT_PER_BASE'),candles:fact('candles',rows,'OHLC_USDT_VOLUME_BASE'),
      orderbook:fact('orderbook',{asks:[[118.1,1000]],bids:[[117.9,1000]]},'USDT_PRICE_BASE_QUANTITY'),
      ticker_24h:fact('ticker_24h',{open:90,last:118},'USDT_ROLLING_24H')}};
  return {input,rows,price:118,ticker:input.facts.ticker_24h,profile,expected_breach_close:T-99*minute,
    market_proof:false};
}

export function postBreachVectorFactories(profile){
  const make=options=>fixture(profile,options);
  return [
    {name:'known_closed_cause_and_late_receipt',make:()=>make(),expect:{new_distinct_wave:true,
      created_equals_current_analysis:true,anchor_equals_selected_impulse_end:true,expiry_from_anchor:true,
      receipt_after_prior_cancel_allowed:true,old_previous_unchanged:true,READY_not_required:true}},
    {name:'partial_closed_path_uses_conservative_boundary',make:()=>{const x=make();
      x.rows.splice(x.rows.findIndex(r=>r.open_ts===T-150*minute),1);return x;},
      expect:{new_post_breach_marker:false,old_cancelled_preserved:true}},
    {name:'qualified_incomplete_prefix_does_not_block_complete_required_path',make:()=>{const x=make();
      x.rows.splice(0,100);x.input.facts.candles.status='INCOMPLETE';
      x.input.facts.candles.coverage={time_qualified:true,volume_qualified:true};return x;},
      expect:{new_distinct_wave:true,only_required_path_must_be_continuous:true,raw_fact_status_unchanged:'INCOMPLETE'}},
    {name:'expired_old_wave_keeps_original_expiry_cutoff',make:()=>{const x=make(),p=x.input.previous_wave;
      p.state='EXPIRED';p.cancelled_ts=null;p.created_ts=T-300*minute;p.expires_ts=p.created_ts+profile.wave_max_age_ms;
      p.impulse.start_ts=p.created_ts-5*minute;p.impulse.end_ts=p.created_ts;return x;},
      expect:{new_post_breach_marker:false,state:'EXPIRED',old_expiry_unchanged:true}},
    {name:'later_first_observation_does_not_give_extra_lifetime',make:()=>make({laterMinutes:5}),
      compare_to:'known_closed_cause_and_late_receipt',expect:{same_seed_anchor_and_expiry:true,created_equals_later_analysis:true}},
    {name:'continuation_keeps_identity_origin_anchor_and_expiry',make:()=>make(),
      continueWith:firstNextWave=>{const x=make({laterMinutes:5});x.input.previous_wave=clone(firstNextWave);return x;},
      expect:{identity_origin_anchor_created_expiry_unchanged:true,qualification_not_inherited_from_predecessor:true}},
    {name:'legacy_without_closed_cause_remains_conservative',make:()=>{const x=make();
      x.rows.find(r=>r.open_ts===T-100*minute).low=95;return x;},
      expect:{new_post_breach_marker:false,old_cancelled_preserved:true}},
    {name:'distinct_identity_and_previous_object_immutability',make:()=>make(),
      expect:{new_id_differs_from_prior:true,new_id_contains_post_breach_version:true,previous_deep_equal_before_after:true}},
    {name:'active_to_cancel_has_no_same_call_rearm',make:()=>{const x=make(),p=x.input.previous_wave;
      p.state='CALM_PULLBACK';p.cancelled_ts=null;p.covered_until_ts=T-101*minute;return x;},
      expect:{same_old_wave_id:true,state:'CANCELLED',cancelled_equals_current_analysis:true,new_post_breach_marker:false}},
    {name:'broken_new_seed_is_not_rescued_by_cold_base',make:()=>{const x=make();
      x.rows.find(r=>r.open_ts===T-30*minute).low=90;return x;},
      expect:{new_post_breach_marker:false,reason:'POST_BREACH_INTACT_SEED_REQUIRED',old_cancelled_preserved:true}},
    {name:'cause_fact_identity_mismatch_no_event_rearm',make:()=>{const x=make();
      x.input.facts.candles.instrument_id='ARTIFICIAL:OTHER';return x;},expect:{proved_cause:null}},
    {name:'future_proof_receipt_is_not_known',make:()=>{const x=make();
      x.input.facts.candles.received_ts=x.input.analysis_ts+1;return x;},expect:{proved_cause:null}},
    {name:'partial_new_lifetime_marker_cannot_reset_as_legacy',make:()=>{const x=make();
      x.input.previous_wave.lifetime_anchor_ts=x.input.previous_wave.impulse.end_ts;return x;},
      expect:{reason:'WAVE_LIFETIME_METADATA_INVALID',no_reanchor:true}},
    {name:'invalid_anchor_on_new_previous_cannot_reset',make:()=>make(),
      continueWith:firstNextWave=>{const x=make({laterMinutes:5});x.input.previous_wave=clone(firstNextWave);
        x.input.previous_wave.lifetime_anchor_ts+=minute;return x;},
      expect:{reason:'WAVE_LIFETIME_METADATA_INVALID',no_reanchor:true,previous_deep_equal_before_after:true}},
    // BZ46 narrow additions. Existing 14 descriptors/expected remain unchanged.
    {name:'partial_cold_metadata_cannot_prove_cause',make:()=>{const x=make(),p=x.input.previous_wave;
      p.invalidation_price=96;p.cold_first_structural_base={wave_id:p.wave_id,invalidation_price:96,
        invalidation_observation_start:p.impulse.end_ts,structural_anchor_ts:p.impulse.end_ts,
        first_input_asof_ts:p.created_ts+1000,source_received_ts:p.created_ts+500};return x;},
      expect:{proved_cause:null}},
    {name:'cold_low_pivot_wrong_fact_link_cannot_prove_cause',make:()=>{const x=make(),p=x.input.previous_wave;
      p.invalidation_price=96;p.cold_first_structural_base={kind:'COLD_FIRST_STRUCTURAL_BASE_V1',
        wave_id:p.wave_id,invalidation_price:96,invalidation_observation_start:p.impulse.end_ts,
        structural_anchor_ts:p.impulse.end_ts,first_input_asof_ts:p.created_ts+1000,source_received_ts:p.created_ts+500,
        source_fact_id:'ARTIFICIAL:BZ46:COLD_FACT',base_pivot:{kind:'LOW',price:96,event_ts:p.impulse.end_ts-minute,
          known_ts:p.impulse.end_ts,fact_id:'ARTIFICIAL:BZ46:WRONG_COLD_FACT'}};return x;},
      expect:{proved_cause:null}}
  ];
}

// Instantiation is explicit and remains ROOT's admitted operation, never import.
export function createPostBreachVectors({profile}){
  return postBreachVectorFactories(profile).map(({name,make,expect,...rest})=>
    ({id:name,...make(),expected:expect,...rest}));
}
