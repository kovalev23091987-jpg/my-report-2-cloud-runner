import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAMPAIGN_PHASE,
  DEFAULT_MULTI_WAVE_CONFIG,
  buildMultiWaveCampaignShadow,
  computeLeadTimeMetrics,
} from '../src/multi-wave-campaign-engine.mjs';

const H=3_600_000, M=60_000;
const now=Date.UTC(2026,8,13,18,0,0);

function op(direction='LONG', currentReturn=1, stage='EARLY_WATCH') {
  const short=direction==='SHORT';
  return {
    contract:'TEST-USDT', status:'OK',
    newest_event:{
      event_id:'E1', timestamp:now-15*M, event_close_ts:now-10*M,
      data_quality:'OK', direction_at_detection:direction,
      direction_confidence_at_detection:0.7,
      candle:{open:100,high:102,low:98,close:100,volume:1000},
      volume_ratio_median:4, body_range_ratio:0.2,
      cross_exchange:{cross_exchange_confirmed:true},
      market_flow:{status:'OK',delta:short?50:-50},
      spot_perp_basis:{status:'OK',htx_basis_pct:short?0.2:-0.2},
      relative_strength:{status:'OK',improving:short?false:true},
      oi_flush_rebuild:{status:'OK',detected:true,setup_shadow:true,oi_rebuild_pct:5},
      liquidity_sweep:{sweep_detected:false,reclaim_detected:false,side:short?'HIGH':'LOW'},
      post_event_current:{
        status:'OK',current_return_pct:currentReturn,
        low_held:true,high_held:true,reclaim_detected:true,
        ease_supply_exhaustion:!short,ease_demand_exhaustion:short,
        event_volume_per_hour:1000,post_event_volume_per_hour:200,
      },
      funnel:{stage},
    },
  };
}

function prior(phase,direction='LONG',extra={}) {
  return {
    campaign_id:`MW:TEST-USDT:${now-H}`,
    contract_code:'TEST-USDT', campaign_start:now-H, first_detected_time:now-H, first_detected_price:100,
    current_phase:phase, direction, direction_at_detection:direction, direction_confidence_at_detection:0.7,
    wave_index:1, completed_wave_count:1, base_start:now-20*M, base_low:99, base_high:102,
    last_observed_ts:now-4*M, last_data_quality:'OK', transition_history:[], reclaim_failure_event_ids:[],
    ...extra,
  };
}

function retestInput(){
  return {contract:'TEST-USDT',primary:{one_minute:[
    {ts:now-3*M,end_ts:now-2*M,open:100.2,high:100.6,low:99.8,close:100.1,volume:50},
    {ts:now-2*M,end_ts:now-M,open:100.1,high:101.0,low:99.9,close:100.6,volume:45},
    {ts:now-M,end_ts:now,open:100.6,high:101.5,low:100.4,close:101.0,volume:40},
  ]}};
}

test('LONG-only Stage 3.9 funnel stage cannot directly promote a SHORT entry',()=>{
  const opportunity=op('SHORT',-1,'ENTRY_TRIGGER_SHADOW');
  const r=buildMultiWaveCampaignShadow({opportunity,input:{contract:'TEST-USDT'},prior_campaign:prior(CAMPAIGN_PHASE.ENTRY_CANDIDATE,'SHORT',{completed_wave_count:0,wave_index:0}),now});
  assert.equal(r.status,'SHADOW_CAMPAIGN_EVALUATED');
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.ENTRY_CANDIDATE);
});

test('new wave entry clears previous wave impulse fields',()=>{
  const opportunity=op('LONG',1,'EARLY_WATCH');
  opportunity.newest_event.liquidity_sweep={sweep_detected:true,reclaim_detected:true,side:'LOW',pool:{level:100},sweep_ts:now-4*M,reclaim_ts:now-3*M};
  const p=prior(CAMPAIGN_PHASE.NEXT_IMPULSE_WATCH,'LONG',{
    impulse_start:now-35*M,impulse_start_price:100,impulse_peak_price:110,impulse_peak_ts:now-25*M,
  });
  const r=buildMultiWaveCampaignShadow({opportunity,input:retestInput(),prior_campaign:p,now});
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.NEXT_IMPULSE_ENTRY);
  assert.equal(r.campaign.wave_index,2);
  assert.equal(r.campaign.impulse_start,null);
  assert.equal(r.campaign.impulse_start_price,null);
  assert.equal(r.campaign.impulse_peak_price,null);
  assert.equal(r.campaign.impulse_peak_ts,null);
});

test('campaign base is a gate for reload, not merely the newest event low',()=>{
  const opportunity=op('LONG',3,'EARLY_WATCH'); // factual current price = 103
  opportunity.newest_event.post_event_current.low_held=true; // newest event low held, but old campaign base is broken
  const p=prior(CAMPAIGN_PHASE.IMPULSE,'LONG',{
    completed_wave_count:0,base_low:104,base_high:106,
    entry_trigger_time:now-30*M,entry_trigger_price:100,
    impulse_start:now-20*M,impulse_start_price:100,impulse_peak_price:110,impulse_peak_ts:now-10*M,
  });
  const r=buildMultiWaveCampaignShadow({opportunity,input:{contract:'TEST-USDT'},prior_campaign:p,now,config:{...DEFAULT_MULTI_WAVE_CONFIG,exhaustion_evidence_min:99}});
  assert.equal(r.evidence.structure_gate.campaign_base_held,false);
  assert.equal(r.campaign.current_phase,CAMPAIGN_PHASE.IMPULSE,'broken stored campaign base must block RELOAD_BASE');
});

test('per-wave lead time is measured from reload base while campaign lead time remains intact',()=>{
  const opportunity=op('LONG',10,'EARLY_WATCH');
  const current={
    wave_index:2,direction:'LONG',base_start:now-10*M,
    campaign_start:now-H,first_detected_time:now-H,first_detected_price:100,
    entry_trigger_time:now-5*M,entry_trigger_price:108,
    impulse_start:now,impulse_start_price:110,
  };
  const lead=computeLeadTimeMetrics({prior:current,current,opportunity});
  assert.equal(lead.lead_time_minutes,60);
  assert.equal(lead.wave_detection_time,now-10*M);
  assert.equal(lead.wave_lead_time_minutes,10);
});

test('wave upsert preserves factual impulse_end and stores wave-specific lead time',()=>{
  const runtime=readFileSync(new URL('../src/multi-wave-campaign-runtime.mjs',import.meta.url),'utf8');
  assert.match(runtime,/impulse_end=COALESCE\(excluded\.impulse_end,multi_wave_campaign_wave_shadow\.impulse_end\)/);
  assert.match(runtime,/wave_lead_time_minutes \?\? result\?\.lead_time\?\.lead_time_minutes/);
});
