import fs from 'node:fs';

export const UNIFIED_REPLAY_VERSION='my-report-2-unified-readonly-replay-v1-20260924';
const DAY=86_400_000;
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const rows=x=>Array.isArray(x?.results)?x.results:Array.isArray(x)?x:[];
const countBy=(list,key)=>{const out={};for(const r of list){const k=String(r?.[key]??'UNKNOWN');out[k]=(out[k]||0)+1;}return out;};
const pct=(n,d)=>d>0?Math.round((n/d)*10000)/100:null;

export function summarizeReplay({startTs,endTs,contexts=[],decisions=[],shadowOutcomes=[],earlyOutcomes=[],opportunityEvents=[],opportunityOutcomes=[]}={}){
  const timeClosed=Number.isSafeInteger(startTs)&&Number.isSafeInteger(endTs)&&endTs>=startTs;
  if(!timeClosed)return {version:UNIFIED_REPLAY_VERSION,status:'NOT_CLOSED',reason:'TIME_WINDOW_INVALID'};

  const ctx=contexts.filter(r=>finite(r.observation_ts)!==null&&Number(r.observation_ts)>=startTs&&Number(r.observation_ts)<=endTs);
  const dec=decisions.filter(r=>finite(r.observation_ts)!==null&&Number(r.observation_ts)>=startTs&&Number(r.observation_ts)<=endTs);
  const sh=shadowOutcomes.filter(r=>finite(r.observed_ts)!==null&&Number(r.observed_ts)>=startTs&&Number(r.observed_ts)<=endTs);
  const early=earlyOutcomes.filter(r=>finite(r.first_seen_ts)!==null&&Number(r.first_seen_ts)>=startTs&&Number(r.first_seen_ts)<=endTs);
  const events=opportunityEvents.filter(r=>finite(r.event_close_ts)!==null&&Number(r.event_close_ts)>=startTs&&Number(r.event_close_ts)<=endTs);
  const outcomes=opportunityOutcomes.filter(r=>finite(r.target_ts)!==null&&Number(r.target_ts)>=startTs&&Number(r.target_ts)<=endTs);

  const scores=ctx.flatMap(r=>[finite(r.score_lower_bound),finite(r.score_upper_bound)]).filter(v=>v!==null);
  const scoreLower=ctx.map(r=>finite(r.score_lower_bound)).filter(v=>v!==null);
  const scoreUpper=ctx.map(r=>finite(r.score_upper_bound)).filter(v=>v!==null);
  const maxLower=scoreLower.length?Math.max(...scoreLower):null;
  const maxUpper=scoreUpper.length?Math.max(...scoreUpper):null;
  const technicalCeilingBelow75=maxUpper===null?null:maxUpper<75;

  const closedDirectional=sh.filter(r=>String(r.status)==='CLOSED_FACTUAL'&&[0,1].includes(Number(r.direction_correct)));
  const correct=closedDirectional.filter(r=>Number(r.direction_correct)===1).length;
  const directionalPrecision=pct(correct,closedDirectional.length);
  const byDirection={};
  for(const side of ['LONG','SHORT']){
    const sample=closedDirectional.filter(r=>String(r.direction_hint)===side);
    byDirection[side]={samples:sample.length,correct:sample.filter(r=>Number(r.direction_correct)===1).length,precision_pct:pct(sample.filter(r=>Number(r.direction_correct)===1).length,sample.length)};
  }

  const earlyClosed=early.filter(r=>String(r.outcome_status).startsWith('CLOSED')||finite(r.computed_ts)!==null);
  const prevented=earlyClosed.filter(r=>Number(r.prevented_bad_entry)===1).length;
  const missed=earlyClosed.filter(r=>Number(r.missed_good_entry)===1).length;
  const lateAvoided=earlyClosed.filter(r=>Number(r.late_entry_avoided)===1).length;
  const useful=earlyClosed.filter(r=>Number(r.early_alert_useful)===1).length;

  const controls=events.filter(r=>Number(r.control_group)===1||String(r.event_type)==='CONTROL_NON_ANOMALOUS');
  const anomalies=events.filter(r=>Number(r.control_group)!==1&&String(r.event_type)!=='CONTROL_NON_ANOMALOUS');

  const eventById=new Map(events.map(r=>[String(r.event_id),r]));
  let noLookaheadViolations=0;
  let noLookaheadChecked=0;
  for(const o of outcomes){
    const e=eventById.get(String(o.event_id));
    if(!e)continue;
    noLookaheadChecked++;
    const close=finite(e.event_close_ts),target=finite(o.target_ts),closed=finite(o.closed_ts);
    if(close===null||target===null||target<close||(closed!==null&&closed<target))noLookaheadViolations++;
  }

  const spanDays=Math.max(1,(endTs-startTs)/DAY);
  const entryEligible=dec.filter(r=>String(r.entry_action)==='SHADOW_ENTRY_ELIGIBLE').length;
  const entryPerDay=entryEligible/spanDays;

  return {
    version:UNIFIED_REPLAY_VERSION,status:'CLOSED_READ_ONLY_SUMMARY',window:{start_ts:startTs,end_ts:endTs,days:Math.round(spanDays*100)/100},
    counts:{telegram_contexts:ctx.length,decisions:dec.length,shadow_outcomes:sh.length,early_outcomes:early.length,opportunity_events:events.length,opportunity_outcomes:outcomes.length,negative_controls:controls.length,anomaly_events:anomalies.length},
    score_ceiling:{max_lower_bound:maxLower,max_upper_bound:maxUpper,technical_ceiling_below_75:technicalCeilingBelow75,contexts_below_75_upper:scoreUpper.filter(v=>v<75).length,contexts_total:ctx.length},
    decisions:{entry_eligible:entryEligible,entry_eligible_per_day_observed:Math.round(entryPerDay*1000)/1000,by_entry_action:countBy(dec,'entry_action'),by_data_quality:countBy(dec,'data_quality'),by_direction:countBy(dec,'direction')},
    outcomes:{directional_samples:closedDirectional.length,directional_correct:correct,directional_precision_pct:directionalPrecision,by_direction:byDirection,early_closed:earlyClosed.length,prevented_bad_entry:prevented,missed_good_entry:missed,late_entry_avoided:lateAvoided,early_alert_useful:useful},
    no_lookahead:{checked:noLookaheadChecked,violations:noLookaheadViolations,status:noLookaheadChecked===0?'NOT_CLOSED_NO_MATCHED_OUTCOMES':(noLookaheadViolations===0?'PASS':'FAIL')},
    negative_control:{count:controls.length,status:controls.length>0?'PRESENT':'NOT_CLOSED_NO_CONTROL_ROWS'},
    recall:{status:'NOT_CLOSED_NO_COMPLETE_MARKET_MOVE_DENOMINATOR',value:null},
    expected_real_signals:{status:'NOT_CLOSED_OBSERVED_RATE_ONLY_NOT_FORECAST',value:null,observed_shadow_entry_eligible_per_day:Math.round(entryPerDay*1000)/1000},
    safety:{weights_changed:false,thresholds_changed:false,probability_calibrated:false,production_writes:false},
  };
}

async function safeAll(db,sql,binds,label){
  try{return {status:'CLOSED',rows:rows(await db.prepare(sql).bind(...binds).all())};}
  catch(error){return {status:'SOURCE_UNSUPPORTED',rows:[],error:`${label}:${String(error?.message||error).slice(0,220)}`};}
}

export async function runReadOnlyReplay({db,startTs,endTs=Date.now()}={}){
  if(!db)throw new Error('D1_DB_REQUIRED');
  const qs={};
  qs.contexts=await safeAll(db,`SELECT decision_id,snapshot_id,contract_code,observation_ts,direction,score_lower_bound,score_upper_bound,status FROM final_decision_telegram_context_shadow WHERE observation_ts>=?1 AND observation_ts<=?2 ORDER BY observation_ts DESC LIMIT 2048`,[startTs,endTs],'contexts');
  qs.decisions=await safeAll(db,`SELECT decision_id,contract_code,observation_ts,direction,entry_action,data_quality,decision_status,hard_veto_state FROM final_decision_integration_shadow WHERE observation_ts>=?1 AND observation_ts<=?2 ORDER BY observation_ts DESC LIMIT 2048`,[startTs,endTs],'decisions');
  qs.shadowOutcomes=await safeAll(db,`SELECT shadow_id,contract_code,observed_ts,direction_hint,horizon_hours,status,directional_return_pct,mfe_directional_pct_snapshot,mae_directional_pct_snapshot,direction_correct,computed_ts FROM shadow_outcome_log WHERE observed_ts>=?1 AND observed_ts<=?2 ORDER BY observed_ts DESC LIMIT 8192`,[startTs,endTs],'shadow_outcomes');
  qs.earlyOutcomes=await safeAll(db,`SELECT outcome_id,wave_id,contract_code,direction_hint,first_seen_ts,horizon_hours,target_ts,outcome_status,raw_return_pct,directional_return_pct,mfe_pct,mae_pct,realized_r,model_r,lost_rr,prevented_bad_entry,missed_good_entry,late_entry_avoided,early_alert_useful,computed_ts FROM v3_early_outcome_journal WHERE first_seen_ts>=?1 AND first_seen_ts<=?2 ORDER BY first_seen_ts DESC LIMIT 8192`,[startTs,endTs],'early_outcomes');
  qs.opportunityEvents=await safeAll(db,`SELECT event_id,contract_code,timeframe,event_ts,event_close_ts,event_type,control_group,funnel_stage,data_quality FROM opportunity_shadow_event WHERE event_close_ts>=?1 AND event_close_ts<=?2 ORDER BY event_close_ts DESC LIMIT 4096`,[startTs,endTs],'opportunity_events');
  qs.opportunityOutcomes=await safeAll(db,`SELECT event_id,contract_code,horizon,target_ts,status,closed_ts,return_pct,mfe_pct,mae_pct FROM opportunity_shadow_outcome WHERE target_ts>=?1 AND target_ts<=?2 ORDER BY target_ts DESC LIMIT 8192`,[startTs,endTs],'opportunity_outcomes');
  const result=summarizeReplay({startTs,endTs,contexts:qs.contexts.rows,decisions:qs.decisions.rows,shadowOutcomes:qs.shadowOutcomes.rows,earlyOutcomes:qs.earlyOutcomes.rows,opportunityEvents:qs.opportunityEvents.rows,opportunityOutcomes:qs.opportunityOutcomes.rows});
  result.query_status=Object.fromEntries(Object.entries(qs).map(([k,v])=>[k,{status:v.status,rows:v.rows.length,error:v.error??null}]));
  if(Object.values(qs).some(v=>v.status!=='CLOSED'))result.status='PARTIAL_READ_ONLY_SUMMARY_SOURCE_GAPS';
  result.d1_usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  if(result.d1_usage && (Number(result.d1_usage.rows_written)!==0||Number(result.d1_usage.unknown_ops)!==0))throw new Error(`READ_ONLY_REPLAY_WRITE_OR_UNKNOWN:${JSON.stringify(result.d1_usage)}`);
  return result;
}

async function main(){
  const startTs=Number(process.env.REPORT2_REPLAY_START_TS||Date.parse('2026-09-21T10:42:46Z'));
  const endTs=Number(process.env.REPORT2_REPLAY_END_TS||Date.now());
  const {RemoteD1Database}=await import('../runner/report2-d1-adapter.mjs');
  const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30_000});
  const result=await runReadOnlyReplay({db,startTs,endTs});
  const out=process.env.REPORT2_REPLAY_OUTPUT||'unified-readonly-replay.json';
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log('UNIFIED_READONLY_REPLAY',JSON.stringify({status:result.status,counts:result.counts,score_ceiling:result.score_ceiling,outcomes:result.outcomes,no_lookahead:result.no_lookahead,negative_control:result.negative_control,d1_usage:result.d1_usage}));
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])main().catch(e=>{console.error('UNIFIED_READONLY_REPLAY_FATAL',String(e?.stack||e));process.exit(1);});
