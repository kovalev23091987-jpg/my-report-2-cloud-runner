import assert from 'node:assert/strict';
import {
  CAMPAIGN_PHASE,
  DEFAULT_MULTI_WAVE_CONFIG,
  buildMultiWaveCampaignShadow,
  computeFundingTrajectory,
  computeMarketIndependence,
  detectPostSweepRetest,
  deriveCampaignEvidence,
} from '../src/multi-wave-campaign-engine.mjs';

const H=3_600_000, M=60_000;
const now=Date.UTC(2026,8,13,18,0,0);

function funding() {
  return {recent_history:[
    {funding_time_ts:now-12*H,funding_rate:-0.0001},
    {funding_time_ts:now-8*H,funding_rate:-0.0002},
    {funding_time_ts:now-4*H,funding_rate:-0.0004},
    {funding_time_ts:now,funding_rate:-0.0008},
  ]};
}
function external() {
  const asset=[],btc=[],eth=[];
  let ap=100,bp=100,ep=100;
  for(let i=0;i<=24;i++){
    const t=now-(24-i)*H;
    asset.push({ts:t,close:ap}); btc.push({ts:t,close:bp}); eth.push({ts:t,close:ep});
    ap*= i%2===0 ? 1.012 : 0.998;
    bp*= i%3===0 ? 1.002 : 0.999;
    ep*= i%4===0 ? 0.999 : 1.001;
  }
  return {OKX_SPOT:asset,BTC_SPOT:btc,ETH_SPOT:eth};
}
function minuteCandles(){
  const start=now-10*M;
  return [
    {ts:start,end_ts:start+M,open:100,high:101,low:98,close:99,volume:100},
    {ts:start+M,end_ts:start+2*M,open:99,high:101,low:98.5,close:100.5,volume:90},
    {ts:start+2*M,end_ts:start+3*M,open:100.5,high:101,low:99.9,close:100.1,volume:60},
    {ts:start+3*M,end_ts:start+4*M,open:100.1,high:102,low:100,close:100.2,volume:50},
    {ts:start+4*M,end_ts:start+5*M,open:100.2,high:102.5,low:100.1,close:101.8,volume:45},
  ];
}
function opportunity({stage='ENTRY_TRIGGER_SHADOW',direction='LONG',currentReturn=1,phaseQuality='OK'}={}){
  const ev={
    event_id:'E1', timestamp:now-15*M,event_close_ts:now-10*M,event_type:'ANOMALOUS_EFFORT_VS_RESULT',
    data_quality:phaseQuality, direction_at_detection:direction,
    candle:{open:100,high:102,low:98,close:100,volume:1000},
    volume_ratio_median:4, body_range_ratio:0.2,
    cross_exchange:{cross_exchange_confirmed:true},
    market_flow:{status:'OK',delta:-50},
    spot_perp_basis:{status:'OK',htx_basis_pct:-0.2},
    funding_at_event:{funding_rate:-0.0008},
    relative_strength:{status:'OK',improving:true},
    oi_flush_rebuild:{status:'OK',detected:true,setup_shadow:true,oi_rebuild_pct:5},
    liquidity_sweep:{sweep_detected:true,reclaim_detected:true,side:'LOW',pool:{level:100},reclaim_index:1,sweep_ts:now-10*M,reclaim_time_ms:2*M},
    post_event_current:{status:'OK',current_return_pct:currentReturn,low_held:true,reclaim_detected:true,ease_supply_exhaustion:true,event_volume_per_hour:4000,post_event_volume_per_hour:500},
    funnel:{stage},
  };
  return {contract:'TEST-USDT',status:'OK',newest_event:ev,spot_perp_basis:{status:'OK',htx_basis_pct:-0.2}};
}
const input={contract:'TEST-USDT',funding:funding(),external_hourly:external(),primary:{one_minute:minuteCandles()}};

{
  const f=computeFundingTrajectory(funding(),now);
  assert.equal(f.status,'OK');
  assert.equal(f.funding_regime_change,'NEGATIVE_DEEPENING');
  assert.ok(f.funding_velocity_per_hour<0);
}
{
  const sparse=computeFundingTrajectory({recent_history:[
    {funding_time_ts:now-H,funding_rate:-0.0001},
    {funding_time_ts:now,funding_rate:-0.0002},
  ]},now);
  assert.equal(sparse.windows['24h'].coverage_status,'PARTIAL','one hour of history cannot claim 24h coverage');
  const conflict=computeFundingTrajectory({recent_history:[
    {funding_time_ts:now-H,funding_rate:-0.0001},
    {funding_time_ts:now-H,funding_rate:0.0001},
    {funding_time_ts:now,funding_rate:-0.0002},
  ]},now);
  assert.equal(conflict.status,'CONFLICTING','conflicting duplicate settlements must fail closed');
  const future=computeFundingTrajectory({recent_history:[...funding().recent_history,{funding_time_ts:now+H,funding_rate:9}]},now);
  assert.equal(future.current_rate,-0.0008,'future funding must not leak into current trajectory');
}
{
  const m=computeMarketIndependence(external(),now,24);
  assert.equal(m.status,'OK');
  assert.ok(Number.isFinite(m.beta_btc));
  assert.ok(Number.isFinite(m.r2_btc));
  assert.ok(Number.isFinite(m.residual_return_btc_pct));
  const conflicting=external();
  conflicting.BTC_SPOT.push({...conflicting.BTC_SPOT.at(-1),close:999});
  assert.equal(computeMarketIndependence(conflicting,now,24).status,'CONFLICTING');
}
{
  const closed=external();
  for(const rows of Object.values(closed)){
    rows.pop();
    for(const row of rows) row.end_ts=row.ts+H;
    rows.unshift({ts:now-25*H,end_ts:now-24*H,close:rows[0].close/1.001});
    rows.push({ts:now,end_ts:now+H,close:999});
  }
  const m=computeMarketIndependence(closed,now+30*M,24);
  assert.equal(m.status,'OK');
  assert.equal(m.end_ts,now-H,'current open hour and future close must be excluded');
  assert.equal(computeMarketIndependence(closed,now+4*H,24).status,'STALE','old synchronized context must not remain current');
}
{
  const ev=opportunity().newest_event;
  const r=detectPostSweepRetest({candles:minuteCandles(),sweep:ev.liquidity_sweep});
  assert.equal(r.retest_detected,true);
  assert.equal(r.second_reclaim,true);
}
{
  let r=buildMultiWaveCampaignShadow({opportunity:opportunity({stage:'EARLY_WATCH'}),input,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.PRE_IMPULSE_WATCH);
  assert.equal(r.campaign.first_detected_time,now,'first detection must use factual system observation time, not historical event candle time');
  assert.equal(r.campaign.campaign_start,now,'campaign start must be the system detection time');
  r=buildMultiWaveCampaignShadow({opportunity:opportunity({stage:'EARLY_WATCH',currentReturn:1.1}),input,prior_campaign:r.campaign,now:now+M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.ENTRY_CANDIDATE);
  r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:1.2}),input,prior_campaign:r.campaign,now:now+2*M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.ENTRY_TRIGGER);
  assert.equal(r.campaign.entry_trigger_time,now+2*M,'entry trigger must use factual observation time');
  const imp=opportunity({currentReturn:5});
  r=buildMultiWaveCampaignShadow({opportunity:imp,input,prior_campaign:r.campaign,now:now+3*M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.IMPULSE);
  assert.equal(r.campaign.wave_index,1);
  assert.equal(r.campaign.impulse_start,now+3*M,'impulse start must be when threshold was first observed');
}
{
  const op=opportunity({direction:''});
  op.newest_event.direction_at_detection=null;
  op.newest_event.liquidity_sweep={sweep_detected:false,reclaim_detected:false};
  let prior={...buildMultiWaveCampaignShadow({opportunity:op,input,now}).campaign,current_phase:CAMPAIGN_PHASE.ENTRY_CANDIDATE,direction:'DIRECTIONLESS_EVENT'};
  const r=buildMultiWaveCampaignShadow({opportunity:op,input,prior_campaign:prior,now:now+M});
  assert.equal(r.direction_at_detection,'DIRECTIONLESS_EVENT');
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.ENTRY_CANDIDATE);
}
{
  const op=opportunity({direction:''});
  op.newest_event.direction_at_detection=null;
  const e=deriveCampaignEvidence({
    opportunity:op,
    funding_metrics:{status:'OK',current_rate:-0.001,funding_regime_change:'NEGATIVE_DEEPENING'},
    independence:{regime:'LOW_CORRELATION'},
    retest:{second_reclaim:true},
    direction:'DIRECTIONLESS_EVENT',
  });
  for(const key of ['funding_crowding_or_deepening','basis_dislocation_supportive','opposing_pressure_ineffective','level_held_or_reclaimed','relative_strength_directional','ease_of_movement_after_event','sweep_and_reclaim','successful_retest_second_reclaim']) {
    assert.equal(e.early[key],false,`directionless evidence must stay neutral: ${key}`);
  }
}
{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-60*M}`,contract_code:'TEST-USDT',campaign_start:now-60*M,first_detected_time:now-60*M,first_detected_price:100,current_phase:CAMPAIGN_PHASE.ENTRY_CANDIDATE,
    direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,base_start:now-60*M,base_low:90,base_high:100,last_observed_ts:now,
  };
  const op=opportunity({currentReturn:20});
  op.newest_event.liquidity_sweep={sweep_detected:false,reclaim_detected:false};
  const r=buildMultiWaveCampaignShadow({opportunity:op,input,prior_campaign:prior,now:now+M});
  assert.equal(r.chase_risk.conditions.far_from_last_base,true);
  assert.equal(r.chase_risk.active,false,'distance alone must not create chase risk');
}

{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-60*M}`,contract_code:'TEST-USDT',campaign_start:now-60*M,current_phase:CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH,
    direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:2,completed_wave_count:2,
    base_start:now-10*M,base_low:98,base_high:102,entry_trigger_time:now-20*M,entry_trigger_price:100,
    impulse_start:now-20*M,impulse_start_price:100,impulse_peak_price:110,impulse_peak_ts:now-5*M,
    last_observed_ts:now-M,first_detected_time:now-60*M,first_detected_price:90,
  };
  const r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:1}),input,prior_campaign:prior,now});
  assert.equal(r.campaign.wave_index,3,'third wave must use the same bounded lifecycle');
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY);
}
{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-60*M}`,contract_code:'TEST-USDT',campaign_start:now-60*M,first_detected_time:now-60*M,first_detected_price:100,current_phase:CAMPAIGN_PHASE.IMPULSE,
    direction_at_detection:'LONG',direction_confidence_at_detection:0.7,
    direction:'LONG',wave_index:1,completed_wave_count:0,base_start:1,base_low:98,base_high:102,
    entry_trigger_time:now-20*M,entry_trigger_price:100,impulse_start:now-20*M,impulse_start_price:100,
    impulse_peak_price:110,impulse_peak_ts:now-5*M,last_observed_ts:now-5*M,
  };
  const op=opportunity({currentReturn:5});
  // current price 105 vs peak 110 => valid reload with structure held.
  let r=buildMultiWaveCampaignShadow({opportunity:op,input,prior_campaign:prior,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.RELOAD_BASE);
  r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:5.1}),input,prior_campaign:r.campaign,now:now+M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH);
  r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:5.2}),input,prior_campaign:r.campaign,now:now+2*M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY);
  assert.equal(r.campaign.wave_index,2);
}

{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-60*M}`,contract_code:'TEST-USDT',campaign_start:now-60*M,current_phase:CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH,
    direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:4,completed_wave_count:4,base_start:now-10*M,base_low:98,base_high:102,
    entry_trigger_time:now-20*M,entry_trigger_price:100,impulse_start:now-20*M,impulse_start_price:100,
    impulse_peak_price:110,impulse_peak_ts:now-5*M,last_observed_ts:now-5*M,first_detected_time:now-60*M,first_detected_price:90,
  };
  let r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:1}),input,prior_campaign:prior,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY);
  assert.equal(r.campaign.wave_index,5,'campaign lifecycle must not stop at a fixed number of waves');
  r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:3.1}),input,prior_campaign:r.campaign,now:now+M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.IMPULSE);
}
{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-30*M}`,contract_code:'TEST-USDT',campaign_start:now-30*M,first_detected_time:now-30*M,first_detected_price:100,
    current_phase:CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY,direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,
    wave_index:2,completed_wave_count:1,base_start:now-10*M,base_low:98,base_high:102,
    entry_trigger_time:now-M,entry_trigger_price:105,last_observed_ts:now-M,
  };
  let r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:7}),input,prior_campaign:prior,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY,'old event return must not inflate a later wave');
  r=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:7.2}),input,prior_campaign:r.campaign,now:now+M});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.IMPULSE,'later wave begins only after move from its own entry trigger');
}
{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-20*M}`,contract_code:'TEST-USDT',campaign_start:now-20*M,current_phase:CAMPAIGN_PHASE.ENTRY_TRIGGER,
    direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:1,completed_wave_count:0,base_start:now-20*M,base_low:98,base_high:102,
    entry_trigger_time:now-5*M,entry_trigger_price:100,last_observed_ts:now-5*M,first_detected_time:now-20*M,first_detected_price:100,
  };
  const adverse=buildMultiWaveCampaignShadow({opportunity:opportunity({currentReturn:-5}),input,prior_campaign:prior,now});
  assert.equal(adverse.campaign.current_phase,CAMPAIGN_PHASE.ENTRY_TRIGGER,'adverse move must not be classified as a LONG impulse');
}
{
  const op=opportunity({direction:'SHORT',currentReturn:-4});
  op.newest_event.relative_strength={status:'OK',improving:false};
  op.newest_event.spot_perp_basis={status:'OK',htx_basis_pct:0.2};
  op.spot_perp_basis={status:'OK',htx_basis_pct:0.2};
  const prior={
    campaign_id:`MW:TEST-USDT:${now-20*M}`,contract_code:'TEST-USDT',campaign_start:now-20*M,current_phase:CAMPAIGN_PHASE.ENTRY_TRIGGER,
    direction:'SHORT',direction_at_detection:'SHORT',direction_confidence_at_detection:0.7,wave_index:1,completed_wave_count:0,base_start:now-20*M,base_low:98,base_high:102,
    entry_trigger_time:now-5*M,entry_trigger_price:100,last_observed_ts:now-5*M,first_detected_time:now-20*M,first_detected_price:100,
  };
  const r=buildMultiWaveCampaignShadow({opportunity:op,input,prior_campaign:prior,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.IMPULSE,'favorable negative return must count as a SHORT impulse');
}
{
  let r=buildMultiWaveCampaignShadow({opportunity:opportunity({stage:'EARLY_WATCH'}),input,now});
  const firstTs=r.campaign.first_detected_time;
  const firstPx=r.campaign.first_detected_price;
  const later=opportunity({stage:'EARLY_WATCH'});
  later.newest_event.timestamp+=M;
  later.newest_event.candle.close=101;
  r=buildMultiWaveCampaignShadow({opportunity:later,input,prior_campaign:r.campaign,now:now+M});
  assert.equal(r.campaign.first_detected_time,firstTs,'first detection timestamp must survive later events');
  assert.equal(r.campaign.first_detected_price,firstPx,'first detection price must survive later events');
}

{
  const op=opportunity({stage:'EARLY_WATCH'});
  const first=buildMultiWaveCampaignShadow({opportunity:op,input,now});
  const retry=buildMultiWaveCampaignShadow({opportunity:op,input,prior_campaign:first.campaign,now:now+M});
  assert.equal(retry.status,'DUPLICATE_OBSERVATION_SKIPPED');
  assert.equal(retry.campaign.current_phase,first.campaign.current_phase,'identical retry must not advance a phase');
  assert.equal(retry.campaign.last_observed_ts,first.campaign.last_observed_ts,'identical retry must not rewrite observation time');
}

{
  const failing=opportunity({stage:'EARLY_WATCH'});
  failing.newest_event.liquidity_sweep={sweep_detected:true,reclaim_detected:false,side:'LOW',pool:{level:100}};
  let r=buildMultiWaveCampaignShadow({opportunity:failing,input,now});
  assert.equal(r.evidence.exhaustion.repeated_reclaim_failure,false);
  const same=opportunity({stage:'EARLY_WATCH',currentReturn:1.1});
  same.newest_event.liquidity_sweep={sweep_detected:true,reclaim_detected:false,side:'LOW',pool:{level:100}};
  r=buildMultiWaveCampaignShadow({opportunity:same,input,prior_campaign:r.campaign,now:now+M});
  assert.equal(r.evidence.exhaustion.repeated_reclaim_failure,false,'same failed event cannot count twice');
  const distinct=opportunity({stage:'EARLY_WATCH',currentReturn:1.2});
  distinct.newest_event.event_id='E2';
  distinct.newest_event.liquidity_sweep={sweep_detected:true,reclaim_detected:false,side:'LOW',pool:{level:100}};
  r=buildMultiWaveCampaignShadow({opportunity:distinct,input,prior_campaign:r.campaign,now:now+2*M});
  assert.equal(r.evidence.exhaustion.repeated_reclaim_failure,true,'two distinct failed reclaims are required');
}

{
  const short=opportunity({direction:'SHORT'});
  short.newest_event.relative_strength={status:'OK',improving:false};
  short.newest_event.spot_perp_basis={status:'OK',htx_basis_pct:0.2};
  short.newest_event.liquidity_sweep={sweep_detected:true,reclaim_detected:true,side:'HIGH',pool:{level:100}};
  const preserved=deriveCampaignEvidence({opportunity:short,funding_metrics:{status:'OK',current_rate:0.001,funding_regime_change:'POSITIVE_DEEPENING'},retest:{second_reclaim:true},direction:'SHORT'});
  assert.equal(preserved.next_impulse.relative_strength_preserved,true);
  assert.equal(preserved.exhaustion.relative_strength_deteriorates,false,'short relative weakness is continuation, not exhaustion');
  short.newest_event.relative_strength.improving=true;
  const deteriorated=deriveCampaignEvidence({opportunity:short,funding_metrics:{status:'OK',current_rate:0.001,funding_regime_change:'POSITIVE_DEEPENING'},retest:{second_reclaim:true},direction:'SHORT'});
  assert.equal(deteriorated.exhaustion.relative_strength_deteriorates,true,'short relative strengthening is exhaustion evidence');
}

{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-60*M}`,contract_code:'TEST-USDT',campaign_start:now-60*M,first_detected_time:now-60*M,first_detected_price:100,
    current_phase:CAMPAIGN_PHASE.IMPULSE,direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,
    wave_index:1,completed_wave_count:0,base_start:now-60*M,base_low:98,base_high:102,
    entry_trigger_time:now-20*M,entry_trigger_price:100,impulse_start:now-10*M,impulse_start_price:104,
    impulse_peak_price:110,impulse_peak_ts:now-5*M,last_observed_ts:now-M,
  };
  const broken=opportunity({currentReturn:5});
  broken.newest_event.post_event_current={...broken.newest_event.post_event_current,low_held:false,reclaim_detected:false,ease_supply_exhaustion:true};
  broken.newest_event.liquidity_sweep={sweep_detected:false,reclaim_detected:false};
  const r=buildMultiWaveCampaignShadow({opportunity:broken,input,prior_campaign:prior,now,config:{...DEFAULT_MULTI_WAVE_CONFIG,exhaustion_evidence_min:99}});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.IMPULSE,'broken structure must not create a reload base');
}

{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-60*M}`,contract_code:'TEST-USDT',campaign_start:now-60*M,first_detected_time:now-60*M,first_detected_price:100,
    current_phase:CAMPAIGN_PHASE.IMPULSE,direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,
    wave_index:1,completed_wave_count:0,base_start:now-60*M,base_low:98,base_high:102,
    entry_trigger_time:now-30*M,entry_trigger_price:100,impulse_start:now-20*M,impulse_start_price:104,
    impulse_peak_price:110,impulse_peak_ts:now-10*M,last_observed_ts:now-M,
  };
  const spent=opportunity({currentReturn:5});
  spent.newest_event.volume_ratio_median=6;
  spent.newest_event.body_range_ratio=0.1;
  spent.newest_event.relative_strength={status:'OK',improving:false};
  spent.newest_event.oi_flush_rebuild={status:'OK',detected:false,setup_shadow:false,oi_rebuild_pct:0};
  spent.newest_event.post_event_current={...spent.newest_event.post_event_current,low_held:false,reclaim_detected:false,ease_supply_exhaustion:false};
  spent.newest_event.liquidity_sweep={sweep_detected:false,reclaim_detected:false};
  const warning=buildMultiWaveCampaignShadow({opportunity:spent,input,prior_campaign:prior,now});
  assert.equal(warning.campaign.current_phase,CAMPAIGN_PHASE.EXHAUSTION_WARNING,'exhaustion must override continuation/reload');
  const stillSpent=structuredClone(spent);
  stillSpent.newest_event.event_id='SPENT-2';
  stillSpent.newest_event.post_event_current.current_return_pct=4.9;
  const edge=buildMultiWaveCampaignShadow({opportunity:stillSpent,input,prior_campaign:warning.campaign,now:now+M});
  assert.equal(edge.campaign.current_phase,CAMPAIGN_PHASE.EDGE_SPENT);
  const finalSpent=structuredClone(stillSpent);
  finalSpent.newest_event.event_id='SPENT-3';
  finalSpent.newest_event.post_event_current.current_return_pct=4.8;
  const closed=buildMultiWaveCampaignShadow({opportunity:finalSpent,input,prior_campaign:edge.campaign,now:now+2*M});
  assert.equal(closed.campaign.current_phase,CAMPAIGN_PHASE.CLOSED);
  assert.equal(closed.campaign.campaign_end,now+2*M);
  const fresh=opportunity({stage:'EARLY_WATCH',currentReturn:1.1});
  fresh.newest_event.event_id='FRESH';
  const reopened=buildMultiWaveCampaignShadow({opportunity:fresh,input,prior_campaign:closed.campaign,now:now+3*M});
  assert.notEqual(reopened.campaign.campaign_id,closed.campaign.campaign_id,'a closed campaign must not block a fresh campaign');
  assert.equal(reopened.campaign.campaign_start,now+3*M);
}


{
  const first=opportunity({direction:'',stage:'EARLY_WATCH'});
  first.newest_event.direction_at_detection=null;
  first.newest_event.direction_confidence_at_detection=null;
  first.newest_event.liquidity_sweep={sweep_detected:false,reclaim_detected:false};
  let r=buildMultiWaveCampaignShadow({opportunity:first,input,now});
  assert.equal(r.campaign.direction_at_detection,'DIRECTIONLESS_EVENT');
  assert.equal(r.campaign.direction_confidence_at_detection,null);
  const later=opportunity({direction:'LONG',stage:'EARLY_WATCH'});
  later.newest_event.event_id='E2';
  later.newest_event.timestamp=now+M;
  later.newest_event.event_close_ts=now+2*M;
  r=buildMultiWaveCampaignShadow({opportunity:later,input,prior_campaign:r.campaign,now:now+3*M});
  assert.equal(r.campaign.direction,'LONG','later prospective evidence may establish current campaign direction');
  assert.equal(r.campaign.direction_at_detection,'DIRECTIONLESS_EVENT','original detection direction must never be rewritten with hindsight');
  assert.equal(r.campaign.direction_confidence_at_detection,null,'original detection confidence must never be backfilled later');
}


{
  const history=Array.from({length:70},(_,i)=>({from:'A',to:'B',observed_ts:now-(70-i)*M,event_id:`H${i}`,wave_index:0}));
  const prior={
    campaign_id:'MW:TEST-USDT:HISTORY',contract_code:'TEST-USDT',campaign_start:now-100*M,current_phase:CAMPAIGN_PHASE.PRE_IMPULSE_WATCH,
    direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,
    base_start:now-100*M,base_low:98,base_high:102,last_observed_ts:now-M,last_data_quality:'OK',transition_history:history,
    first_detected_time:now-100*M,first_detected_price:100,
  };
  const r=buildMultiWaveCampaignShadow({opportunity:opportunity({stage:'EARLY_WATCH'}),input,prior_campaign:prior,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.ENTRY_CANDIDATE);
  assert.equal(r.campaign.transition_history.length,64,'transition history must stay bounded');
  assert.equal(r.campaign.transition_history.at(-1).to,CAMPAIGN_PHASE.ENTRY_CANDIDATE);
}

{
  const history=Array.from({length:70},(_,i)=>({from:'A',to:'B',observed_ts:now-(70-i)*M,event_id:`N${i}`,wave_index:0}));
  const prior={
    campaign_id:`MW:TEST-USDT:${now-100*M}`,contract_code:'TEST-USDT',campaign_start:now-100*M,current_phase:CAMPAIGN_PHASE.PRE_IMPULSE_WATCH,
    direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,
    base_start:now-100*M,base_low:98,base_high:102,last_observed_ts:now-M,last_data_quality:'OK',transition_history:history,
    first_detected_time:now-100*M,first_detected_price:100,
  };
  const r=buildMultiWaveCampaignShadow({opportunity:opportunity({stage:'EARLY_WATCH'}),input,prior_campaign:prior,now,config:{...DEFAULT_MULTI_WAVE_CONFIG,minimum_independent_early_detectors:99,entry_candidate_evidence_min:99,next_impulse_watch_evidence_min:99,next_impulse_entry_evidence_min:99,exhaustion_evidence_min:99}});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.PRE_IMPULSE_WATCH);
  assert.equal(r.campaign.transition_history.length,64,'history must be bounded even without a transition');
}

console.log(JSON.stringify({ok:true,suite:'multi-wave-campaign-engine',assertions:'funding gaps/conflicts/windows; synchronized closed-hour independence; sweep retest; factual detection/entry/impulse times; directionless and long/short symmetry; retry idempotency; distinct reclaim failures; continuation/exhaustion; close/reopen; bounded history; waves 2/3/5+'}));


{
  const op=opportunity({direction:'LONG'});
  const fundingVariants=[
    {status:'OK',current_rate:-0.001,funding_regime_change:'NEGATIVE_DEEPENING'},
    {status:'OK',current_rate:0.001,funding_regime_change:'POSITIVE_DEEPENING'},
    {status:'OK',current_rate:0,funding_regime_change:'STABLE'},
    {status:'MISSING',current_rate:null,funding_regime_change:null},
  ];
  const evidenceRows=fundingVariants.map(funding_metrics=>deriveCampaignEvidence({
    opportunity:structuredClone(op),
    funding_metrics,
    independence:{regime:'LOW_CORRELATION'},
    retest:{second_reclaim:true},
    direction:'LONG',
  }));
  for(const row of evidenceRows){
    assert.equal(row.early.funding_crowding_or_deepening,false,'funding sign/regime must not be an early directional vote');
    assert.equal(row.next_impulse.funding_reloads_crowding,false,'funding sign/regime must not promote a next impulse');
  }
  assert.ok(evidenceRows.every(row=>row.early_count===evidenceRows[0].early_count),'early evidence count must be invariant to funding sign');
  assert.ok(evidenceRows.every(row=>row.next_impulse_count===evidenceRows[0].next_impulse_count),'next-impulse evidence count must be invariant to funding sign');
}
