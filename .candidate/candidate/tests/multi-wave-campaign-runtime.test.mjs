import assert from 'node:assert/strict';
import {
  MULTI_WAVE_VERSION,
  runMultiWaveCampaignShadowCycle,
  MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK,
  MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK,
} from '../src/multi-wave-campaign-runtime.mjs';

const now=Date.UTC(2026,8,13,18,0,0);
assert.equal(MULTI_WAVE_VERSION, '3.9.1-multi-wave-campaign-shadow');

function opportunity(stage='ENTRY_TRIGGER_SHADOW') {
  return {
    contract:'TEST-USDT', status:'OK',
    newest_event:{
      event_id:'E1',timestamp:now-900000,event_close_ts:now-600000,data_quality:'OK',
      direction_at_detection:'LONG',direction_confidence_at_detection:0.7,
      candle:{open:100,high:102,low:98,close:100,volume:1000},
      volume_ratio_median:4,body_range_ratio:0.2,
      cross_exchange:{cross_exchange_confirmed:true},
      market_flow:{status:'OK',delta:-10},
      relative_strength:{status:'OK',improving:true},
      spot_perp_basis:{status:'OK',htx_basis_pct:-0.2},
      oi_flush_rebuild:{status:'OK',setup_shadow:true,oi_rebuild_pct:4},
      liquidity_sweep:{sweep_detected:false,reclaim_detected:false},
      post_event_current:{status:'OK',current_return_pct:1,low_held:true,reclaim_detected:true,ease_supply_exhaustion:true,event_volume_per_hour:1000,post_event_volume_per_hour:300},
      funnel:{stage},
    },
    spot_perp_basis:{status:'OK',htx_basis_pct:-0.2},
  };
}

function stmt(sql){return {sql,params:[],bind(...xs){this.params=xs;return this;},async first(){return null;},async all(){return {results:[]};}};}

{
  const batches=[];
  const env={DATA_DB:{prepare(sql){return stmt(sql);},async batch(xs){batches.push(xs);return xs.map(()=>({meta:{changes:1}}));}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity('EARLY_WATCH'),input:{contract:'TEST-USDT'},now});
  assert.equal(r.persistence.status,'CLOSED');
  assert.ok(r.persistence.statements>=1 && r.persistence.statements<=MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK);
  assert.ok(r.persistence.queries_including_campaign_read<=MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK);
  assert.equal(batches.length,1);
  assert.equal(r.safety.live_signal,false);
  assert.equal(r.safety.telegram_started,false);
}

{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-900000}`,contract_code:'TEST-USDT',campaign_start:now-900000,
    first_detected_time:now-900000,first_detected_price:100,current_phase:'ENTRY_CANDIDATE',direction:'LONG',
    direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,base_start:now-900000,base_low:98,base_high:102,
    last_observed_ts:now-600000,last_data_quality:'OK'
  };
  const batches=[];
  const env={DATA_DB:{prepare(sql){
    const s=stmt(sql);
    s.first=async()=>sql.includes('FROM multi_wave_campaign_shadow')?{...prior,campaign_json:JSON.stringify(prior)}:null;
    return s;
  },async batch(xs){batches.push(xs);return xs.map(()=>({meta:{changes:1}}));}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity(),input:{contract:'TEST-USDT'},now:now+60000});
  assert.equal(r.campaign.current_phase,'ENTRY_TRIGGER');
  assert.equal(r.persistence.status,'CLOSED');
  assert.equal(r.persistence.statements,2,'campaign + wave must fit Stage 3.9.1 D1 headroom');
  assert.equal(r.persistence.queries_including_campaign_read,3,'prior read + two writes must fit exact 3-query headroom');
  assert.equal(batches[0].length,2);
  assert.ok(Array.isArray(r.campaign.transition_history) && r.campaign.transition_history.length>=1,'transition history must persist inside campaign_json');
}

{
  const prior={
    campaign_id:`MW:TEST-USDT:${now-900000}`,contract_code:'TEST-USDT',campaign_start:now-900000,
    first_detected_time:now-900000,first_detected_price:100,current_phase:'ENTRY_CANDIDATE',direction:'LONG',
    direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,
    base_start:now-900000,base_low:98,base_high:102,last_observed_ts:now-600000,last_data_quality:'OK',
  };
  const stats={first:0,batch:0,writeStatements:0};
  const env={DATA_DB:{prepare(sql){
    const s=stmt(sql);
    s.first=async()=>{stats.first+=1;return sql.includes('FROM multi_wave_campaign_shadow')?{...prior,campaign_json:JSON.stringify(prior)}:null;};
    return s;
  },async batch(xs){stats.batch+=1;stats.writeStatements+=xs.length;throw new Error('forced atomic batch failure');}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity(),input:{contract:'TEST-USDT'},now:now+60000});
  assert.equal(r.persistence.status,'PARTIAL_FAIL_CLOSED');
  assert.equal(r.persistence.retry_attempts,0,'failure path must not retry or create a query storm');
  assert.equal(r.persistence.queries_attempted_including_campaign_read,3);
  assert.deepEqual(stats,{first:1,batch:1,writeStatements:2},'one read plus one two-statement atomic batch only');
}

{
  const stale=opportunity();
  stale.newest_event.data_quality='STALE';
  const stats={first:0,batch:0};
  const env={DATA_DB:{prepare(sql){const s=stmt(sql);s.first=async()=>{stats.first+=1;return null;};return s;},async batch(){stats.batch+=1;return [];}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:stale,input:{contract:'TEST-USDT'},now});
  assert.equal(r.status,'DATA_QUALITY_FAIL_CLOSED');
  assert.equal(r.persistence.status,'SKIPPED_FAIL_CLOSED');
  assert.equal(r.persistence.queries_including_campaign_read,1);
  assert.deepEqual(stats,{first:1,batch:0},'fail-closed analysis must perform zero writes');
}

{
  const firstEnv={DATA_DB:{prepare(sql){return stmt(sql);},async batch(xs){return xs.map(()=>({meta:{changes:1}}));}}};
  const first=await runMultiWaveCampaignShadowCycle({env:firstEnv,opportunity:opportunity('EARLY_WATCH'),input:{contract:'TEST-USDT'},now});
  const stats={first:0,batch:0};
  const env={DATA_DB:{prepare(sql){
    const s=stmt(sql);
    s.first=async()=>{stats.first+=1;return {...first.campaign,campaign_json:JSON.stringify(first.campaign)};};
    return s;
  },async batch(){stats.batch+=1;return [];}}};
  const duplicate=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity('EARLY_WATCH'),input:{contract:'TEST-USDT'},now:now+60000});
  assert.equal(duplicate.status,'DUPLICATE_OBSERVATION_SKIPPED');
  assert.equal(duplicate.persistence.status,'SKIPPED_DUPLICATE');
  assert.deepEqual(stats,{first:1,batch:0},'cron retry with identical material snapshot must not write or advance phase');
}

{
  const env={DATA_DB:{prepare(){throw new Error('D1 unavailable');}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity(),input:{contract:'TEST-USDT'},now});
  assert.equal(r.status,'LOAD_FAIL_CLOSED');
  assert.equal(r.safety.live_signal,false);
}

{
  const row={campaign_id:'scalar',contract_code:'TEST-USDT',campaign_start:now-1000,current_phase:'ENTRY_CANDIDATE',direction:'LONG',direction_at_detection:'LONG',direction_confidence_at_detection:0.7,wave_index:0,completed_wave_count:0,last_observed_ts:now-500};
  let batches=0;
  const env={DATA_DB:{prepare(sql){const s=stmt(sql);s.first=async()=>({...row,campaign_json:JSON.stringify({...row,current_phase:'IMPULSE'})});return s;},async batch(){batches+=1;return [];}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity(),input:{contract:'TEST-USDT'},now});
  assert.equal(r.status,'LOAD_FAIL_CLOSED');
  assert.equal(batches,0,'corrupt active campaign must never be overwritten or retried');
}

{
  // Genesis campaign must reuse the same existing ledger read and CAS the
  // factual FLAT revision in the campaign INSERT itself. No preflight query.
  let campaignStmt=null;
  const ledgerOnly={position_state:'FLAT',position_state_revision:7,position_persisted_ts:now-1000,position_last_observed_ts:now-1000};
  const env={DATA_DB:{prepare(sql){
    const s=stmt(sql);
    s.first=async()=>sql.includes('WITH active AS')?ledgerOnly:null;
    return s;
  },async batch(xs){campaignStmt=xs[0];return xs.map(()=>({meta:{changes:1}}));}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity('EARLY_WATCH'),input:{contract:'TEST-USDT'},now});
  assert.equal(r.persistence.status,'CLOSED');
  assert.ok(campaignStmt.sql.includes('shadow_virtual_position_ledger WHERE contract_code=?5'));
  assert.equal(campaignStmt.params[30],7,'existing ledger revision must be the same-statement CAS');
  assert.equal(campaignStmt.params[31],'FLAT','existing ledger state must be the same-statement CAS');
  assert.equal(r.persistence.queries_including_campaign_read,2,'ledger JOIN read + one campaign write only for pre-wave genesis');
}

{
  // Concurrent ledger mutation between JOIN-read and campaign write must make
  // the scalar CAS produce zero changes and fail closed without retry/query storm.
  const ledgerOnly={position_state:'FLAT',position_state_revision:7,position_persisted_ts:now-1000,position_last_observed_ts:now-1000};
  let batches=0;
  const env={DATA_DB:{prepare(sql){const s=stmt(sql);s.first=async()=>sql.includes('WITH active AS')?ledgerOnly:null;return s;},
    async batch(xs){batches+=1;return xs.map((_,i)=>({meta:{changes:i===0?0:1}}));}}};
  const r=await runMultiWaveCampaignShadowCycle({env,opportunity:opportunity('EARLY_WATCH'),input:{contract:'TEST-USDT'},now});
  assert.equal(r.persistence.status,'PARTIAL_FAIL_CLOSED');
  assert.match(r.persistence.error,/MULTI_WAVE_CAS_CONFLICT:0/);
  assert.equal(batches,1);
  assert.equal(r.persistence.retry_attempts,0);
}

console.log(JSON.stringify({ok:true,suite:'multi-wave-campaign-runtime',assertions:'actual 1-read/2-write cap; atomic batch; zero retry; fail-closed zero-write; duplicate zero-write; scalar/JSON corruption rejection; genesis ledger same-read CAS; concurrent ledger mutation fail-closed; runtime export/link contract'}));
