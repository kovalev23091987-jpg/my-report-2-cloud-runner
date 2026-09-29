// Bounded, read-only diagnosis of the canonical publication boundary.
import fs from 'node:fs/promises';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';

const required=name=>{const value=String(process.env[name]||'').trim();if(!value)throw new Error(`${name}_REQUIRED`);return value;};
const db=new RemoteD1Database(required('REPORT2_D1_BRIDGE_URL'),required('REPORT2_D1_BRIDGE_TOKEN'));
const now=Date.now();
const from=now-48*60*60_000;
const result=await db.prepare(`SELECT contract_code,observed_ts,canonical_state,actionability_status,actionability_reason,canonical_json
  FROM canonical_publication_shadow WHERE observed_ts>=?1 AND observed_ts<=?2
  ORDER BY observed_ts DESC LIMIT 120`).bind(from,now).all();
if(result?.success===false||!Array.isArray(result?.results))throw new Error('READ_NOT_CLOSED');
const rows=result.results.map(row=>{
  let c;try{c=JSON.parse(row.canonical_json);}catch{c={};}
  const m=c.metadata||{},e=c.opportunity||{},s=m.scenario_plan_transfer||{},p=m.technical_move_potential||{};
  return {contract:row.contract_code,observed_ts:row.observed_ts,state:row.canonical_state,
    actionability:row.actionability_status,actionability_reason:row.actionability_reason,
    interest:c.scores?.coin_interest_0_100,overall:c.scores?.overall_0_100,direction:c.direction,
    early:m.direction_resolution?.early_receipt?.closed===true,early_reason:m.direction_resolution?.early_receipt?.candidate?.reason??null,
    route:m.direction_resolution?.facts?.filter(x=>x.origin==='FINAL_ROUTE').length||0,
    event_status:c.opportunity?.status,event_type:e.event_type,minute_classified:e.minute_decomposition?.classification_allowed===true,
    event_id:e.event_id??null,event_close_ts:e.event_close_ts??null,event_timeframe:e.timeframe??null,
    source_roles:{status:m.source_role_view?.status,families:[...new Set((m.source_role_view?.classified??[]).filter(x=>x.registry_known).map(x=>x.source_family))],htx_execution:(m.source_role_view?.classified??[]).some(x=>x.source_key==='HTX_OFFICIAL'&&x.assigned_roles?.includes('EXECUTION_TRUTH'))},
    candle:e.candle?{high:e.candle.high,low:e.candle.low,close:e.candle.close}:null,
    current_price:c.current_price,trigger:c.trigger?.value??null,entry:c.entry?.min_price??null,
    invalidation:c.invalidation?.price??null,target:c.targets?.[0]?.price??null,
    plan:s,potential:{status:p.status??null,reason:p.reason??null,basis:p.basis??null,pct:p.potential_move_pct??null},
    hard_gates:c.hard_gates?.map(g=>({gate:g.gate,status:g.status,reason:g.reason}))??[],
    data_quality:c.data_quality?.classification??null};
});
// Match the high-interest snapshots to their own Deep Check and final rows.
// A numeric interest score is not an actionable Telegram event by itself.
const high=rows.filter(row=>row.interest!==null&&Number(row.interest)>=70).slice(0,12);
const contracts=[...new Set(high.map(row=>row.contract))];
let highTrace=[];
if(contracts.length){
  const marks=contracts.map((_,i)=>`?${i+1}`).join(',');
  const [shadowResult,finalResult]=await Promise.all([
    db.prepare(`SELECT contract_code,observed_ts,direction_hint,eq_status,dq_status,stage,data_sufficiency,created_ts
      FROM shadow_decision_log WHERE contract_code IN (${marks}) AND observed_ts BETWEEN ?${contracts.length+1} AND ?${contracts.length+2}
      ORDER BY observed_ts DESC LIMIT 160`).bind(...contracts,from,now).all(),
    db.prepare(`SELECT contract_code,observation_ts,persisted_ts,direction,directional_quality,data_quality,execution_quality,
      independence_state,timing_state,risk_state,hard_veto
      FROM final_decision_integration_shadow WHERE contract_code IN (${marks}) AND persisted_ts BETWEEN ?${contracts.length+1} AND ?${contracts.length+2}
      ORDER BY persisted_ts DESC LIMIT 160`).bind(...contracts,from,now).all(),
  ]);
  if(shadowResult?.success===false||finalResult?.success===false||!Array.isArray(shadowResult?.results)||!Array.isArray(finalResult?.results))throw new Error('HIGH_TRACE_READ_NOT_CLOSED');
  const nearest=(list,contract,ts,key)=>list.filter(row=>row.contract_code===contract&&Number(row[key])<=ts&&Number(row[key])>=ts-10*60_000)
    .sort((a,b)=>Number(b[key])-Number(a[key]))[0]??null;
  highTrace=high.map(row=>({contract:row.contract,observed_ts:row.observed_ts,interest:row.interest,state:row.state,
    price:row.current_price,candle:row.candle,plan:row.plan,
    shadow:nearest(shadowResult.results,row.contract,row.observed_ts,'observed_ts'),
    final:nearest(finalResult.results,row.contract,row.observed_ts,'persisted_ts')}));
}
const eventResult=await db.prepare(`SELECT contract_code,event_ts,event_close_ts,event_type,funnel_stage,data_quality,
  direction_at_event,directional_evaluation_eligible,observed_ts,independent_sample
  FROM opportunity_shadow_event WHERE event_ts>=?1 AND event_ts<=?2
  ORDER BY event_ts DESC LIMIT 100`).bind(from,now).all();
if(eventResult?.success===false||!Array.isArray(eventResult?.results))throw new Error('EVENT_READ_NOT_CLOSED');
const usage=db.usageSnapshot();
if(usage.rows_written!==0||usage.unknown_ops!==0||usage.rows_read>3000)throw new Error('READ_ONLY_BUDGET_VIOLATION');
await fs.writeFile(process.argv[2]||'report2-idea-chain-diagnostic.json',JSON.stringify({schema:'report2-idea-chain-read-only-v4',from,now,rows,high_trace:highTrace,events:eventResult.results,usage,network_send:false},null,2));
console.log(JSON.stringify({status:'READ_ONLY',rows:rows.length,high70:highTrace.length,events:eventResult.results.length,usage}));
