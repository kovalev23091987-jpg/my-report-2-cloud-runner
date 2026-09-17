import assert from 'node:assert/strict';
import { buildMultiWaveCampaignShadow, campaignSafetyEnvelope, detectPostSweepRetest } from '../src/multi-wave-campaign-engine.mjs';

const now=Date.UTC(2026,8,13,18,0,0), M=60_000;
const safety=campaignSafetyEnvelope();
assert.equal(safety.live_signal,false);
assert.equal(safety.telegram_started,false);
assert.equal(safety.trading_execution,false);

{
  const r=buildMultiWaveCampaignShadow({opportunity:null,input:{contract:'X-USDT'},now});
  assert.equal(r.status,'NO_CAMPAIGN_EVENT');
  assert.equal(r.safety.live_signal,false);
}
{
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',newest_event:{control_group:true,timestamp:now-2*M,event_close_ts:now-M}},now});
  assert.equal(r.status,'NO_CAMPAIGN_EVENT');
  assert.equal(r.campaign,null);
}
{
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:{event_id:'F',timestamp:now+M,event_close_ts:now+2*M,data_quality:'OK',candle:{open:1,high:1,low:1,close:1,volume:1}}},now});
  assert.equal(r.status,'FUTURE_EVENT_REJECTED');
  assert.equal(r.campaign,null);
}
{
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:{event_id:'NO_TS',data_quality:'OK',candle:{open:1,high:1,low:1,close:1,volume:1}}},now});
  assert.equal(r.status,'INVALID_EVENT_FAIL_CLOSED','missing event timestamps must never create a campaign');
}
{
  const event={event_id:'FUTURE_FEATURE',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:1,high:1.1,low:0.9,close:1,volume:1},oi_flush_rebuild:{source_end_ts:now+M,setup_shadow:true}};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},now});
  assert.equal(r.status,'FUTURE_FEATURE_REJECTED','future OI/feature timestamps must fail closed');
}
{
  const event={event_id:'FUTURE_FUNDING',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:1,high:1.1,low:0.9,close:1,volume:1},funding_at_event:{funding_time_ts:now+M,funding_rate:-0.01}};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},now});
  assert.equal(r.status,'FUTURE_FEATURE_REJECTED','future funding must fail closed');
}
{
  const event={event_id:'UNSCOPED_AGGREGATE',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:1,high:1.1,low:0.9,close:1,volume:1},post_event_current:{status:'OK',current_return_pct:0},market_flow:{status:'MISSING'},relative_strength:{status:'MISSING'},spot_perp_basis:{status:'MISSING'},liquidity_sweep:{sweep_detected:false,reclaim_detected:false}};
  const r=buildMultiWaveCampaignShadow({opportunity:{
    contract:'X-USDT',status:'OK',newest_event:event,
    oi_flush_rebuild:{status:'OK',setup_shadow:true,oi_rebuild_pct:99,source_end_ts:now+M},
    spot_perp_basis:{status:'OK',htx_basis_pct:-9,source_end_ts:now+M},
  },now});
  assert.equal(r.evidence.early.oi_rebuild_or_growth,false,'aggregate/future OI must not backfill event-scoped evidence');
  assert.equal(r.evidence.early.basis_dislocation_supportive,false,'aggregate/future basis must not backfill event-scoped evidence');
  assert.equal(r.campaign_context.oi_before,null);
  assert.equal(r.campaign_context.basis_before,null);
}
{
  const event={event_id:'EVENT_LOOKAHEAD',timestamp:now-3*M,event_close_ts:now-2*M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:1,high:1.1,low:0.9,close:1,volume:1},funding_at_event:{funding_time_ts:now-M,funding_rate:-0.01}};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},now});
  assert.equal(r.status,'EVENT_CONTEXT_LOOKAHEAD_REJECTED','post-close funding cannot be relabeled as funding-at-event');
}
{
  const event={event_id:'FUTURE_RECLAIM',timestamp:now-5*M,event_close_ts:now-4*M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:1,high:1.1,low:0.9,close:1,volume:1},post_event_current:{status:'OK',current_return_pct:1},funnel:{stage:'ENTRY_TRIGGER_SHADOW'},liquidity_sweep:{sweep_detected:true,reclaim_detected:true,side:'LOW',pool:{level:1},sweep_ts:now-M,reclaim_time_ms:2*M}};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},now});
  assert.equal(r.status,'INVALID_SWEEP_TIMELINE_REJECTED','future reclaim cannot promote a historical event');
}
{
  const prior={campaign_id:'P',contract_code:'X-USDT',campaign_start:1,current_phase:'ENTRY_CANDIDATE',direction:'LONG',wave_index:0,completed_wave_count:0,base_start:1,base_low:1,base_high:2,last_observed_ts:now-2*M,last_data_quality:'OK'};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:{event_id:'S',timestamp:now-2*M,event_close_ts:now-M,data_quality:'STALE',candle:{open:2,high:2.1,low:1.9,close:2,volume:1}}},prior_campaign:prior,now});
  assert.equal(r.status,'DATA_QUALITY_FAIL_CLOSED');
  assert.equal(r.campaign.current_phase,'ENTRY_CANDIDATE');
}
{
  const baseEvent={event_id:'DIR',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'SHORT',candle:{open:2,high:2.1,low:1.9,close:2,volume:1},post_event_current:{current_return_pct:0}};
  const prior={campaign_id:`MW:X-USDT:${now-20*M}`,contract_code:'X-USDT',campaign_start:now-20*M,first_detected_time:now-20*M,first_detected_price:2,current_phase:'ENTRY_CANDIDATE',direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,base_start:now-20*M,base_low:1.9,base_high:2.1,last_observed_ts:now-3*M,last_data_quality:'OK'};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:baseEvent},prior_campaign:prior,now});
  assert.equal(r.status,'DIRECTION_CONFLICT_FAIL_CLOSED','opposite prospective evidence must not be applied to a locked campaign');
}
{
  const event={event_id:'PARTIAL_POST',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:2,high:2.1,low:1.9,close:2,volume:1},post_event_current:{status:'PARTIAL',current_return_pct:99,low_held:true,reclaim_detected:true},funnel:{stage:'ENTRY_TRIGGER_SHADOW'}};
  const prior={campaign_id:`MW:X-USDT:${now-20*M}`,contract_code:'X-USDT',campaign_start:now-20*M,first_detected_time:now-20*M,first_detected_price:2,current_phase:'ENTRY_CANDIDATE',direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,base_start:now-20*M,base_low:1.9,base_high:2.1,last_observed_ts:now-3*M,last_data_quality:'OK'};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},prior_campaign:prior,now});
  assert.equal(r.campaign.current_phase,'ENTRY_CANDIDATE','partial post-event data cannot trigger entry');
  assert.equal(r.lead_time.move_after_detection_pct,0,'unverified current return must not enter lead-time metrics');
}
{
  const event={event_id:'REWRITE',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:2,high:2.1,low:1.9,close:2,volume:1},post_event_current:{current_return_pct:0}};
  const prior={campaign_id:`MW:X-USDT:${now-20*M}`,contract_code:'X-USDT',campaign_start:now-20*M,first_detected_time:now-19*M,first_detected_price:2,current_phase:'ENTRY_CANDIDATE',direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,base_start:now-20*M,base_low:1.9,base_high:2.1,last_observed_ts:now-3*M,last_data_quality:'OK'};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},prior_campaign:prior,now});
  assert.equal(r.status,'PRIOR_CAMPAIGN_FAIL_CLOSED');
  assert.equal(r.error,'INVALID_DETECTION_TIMELINE','rewritten first_detected_time must be rejected');
}
{
  const base={event_id:'NO_LEAK',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:2,high:2.1,low:1.9,close:2,volume:1},volume_ratio_median:4,body_range_ratio:0.2,post_event_current:{current_return_pct:0},cross_exchange:{cross_exchange_confirmed:true}};
  const a=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:{...base,outcome:{mfe_pct:99,outcome_class:'WIN'}}},now});
  const b=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:{...base,outcome:{mfe_pct:-99,outcome_class:'LOSS'}}},now});
  assert.deepEqual(a.evidence,b.evidence,'outcome payload must not leak into campaign features');
  assert.equal(a.campaign.current_phase,b.campaign.current_phase);
}
{
  const event={event_id:'RETRO_SIDE',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',direction_confidence_at_detection:1,candle:{open:2,high:2.1,low:1.9,close:2,volume:1},post_event_current:{status:'OK',current_return_pct:1},observation_timing:{first_seen_ts:now,retrospective_promotion_forbidden:true},liquidity_sweep:{sweep_detected:false,reclaim_detected:false}};
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',direction_at_detection:'SHORT',newest_event:event},now});
  assert.equal(r.campaign.direction_at_detection,'DIRECTIONLESS_EVENT','late event cannot gain a side from event or aggregate hindsight');
  assert.equal(r.campaign.direction,'DIRECTIONLESS_EVENT');
}
{
  const event={event_id:'IMMUTABLE_EVENT',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:2,high:2.1,low:1.9,close:2,volume:10},post_event_current:{status:'OK',current_return_pct:1},liquidity_sweep:{sweep_detected:false,reclaim_detected:false}};
  const first=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:event},now});
  const rewritten=structuredClone(event);
  rewritten.candle.volume=999;
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:rewritten},prior_campaign:first.campaign,now:now+M});
  assert.equal(r.status,'EVENT_FACT_REWRITE_REJECTED','same event id cannot rewrite immutable candle facts');
}
{
  const level=100;
  const sweep={sweep_detected:true,reclaim_detected:true,side:'LOW',pool:{level},reclaim_ts:now-2*M};
  const candles=[
    {ts:now-M,end_ts:now,open:100,high:101,low:99.9,close:100.5},
    {ts:now+M,end_ts:now+2*M,open:100.5,high:102,low:99.8,close:101.5},
  ];
  const r=detectPostSweepRetest({candles,sweep,asOf:now});
  assert.equal(r.retest_detected,true);
  assert.equal(r.second_reclaim,false,'future candle must not create second reclaim');
}
{
  // malformed numeric/string fields must not throw or produce a live action
  const r=buildMultiWaveCampaignShadow({opportunity:{contract:'X-USDT',status:'OK',newest_event:{event_id:'M',timestamp:now-2*M,event_close_ts:now-M,data_quality:'OK',direction_at_detection:'LONG',candle:{open:'x',high:null,low:0,close:'bad',volume:'nan'},post_event_current:{current_return_pct:'wat'},funnel:{stage:'ENTRY_TRIGGER_SHADOW'}}},input:{contract:'X-USDT',funding:{recent_history:[{funding_time_ts:'bad',funding_rate:'x'}]}},now});
  assert.equal(r.safety.live_signal,false);
  assert.equal(r.safety.live_probability,null);
}

console.log(JSON.stringify({ok:true,suite:'multi-wave-campaign-failure-injection',assertions:'null/control/stale/partial/malformed; future event/candle/OI/funding/reclaim; event-context look-ahead; detection rewrite; direction conflict; event rewrite; outcome isolation'}));
