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
  const m=c.metadata||{},e=c.opportunity?.newest_event||{},s=m.scenario_plan_transfer||{},p=m.technical_move_potential||{};
  return {contract:row.contract_code,observed_ts:row.observed_ts,state:row.canonical_state,
    actionability:row.actionability_status,actionability_reason:row.actionability_reason,
    interest:c.scores?.coin_interest_0_100,overall:c.scores?.overall_0_100,direction:c.direction,
    early:m.direction_resolution?.early_receipt?.closed===true,early_reason:m.direction_resolution?.early_receipt?.candidate?.reason??null,
    route:m.direction_resolution?.facts?.filter(x=>x.origin==='FINAL_ROUTE').length||0,
    event_status:c.opportunity?.status,event_type:e.event_type,minute_classified:e.minute_decomposition?.classification_allowed===true,
    candle:e.candle?{high:e.candle.high,low:e.candle.low,close:e.candle.close}:null,
    current_price:c.current_price,trigger:c.trigger?.value??null,entry:c.entry?.min_price??null,
    invalidation:c.invalidation?.price??null,target:c.targets?.[0]?.price??null,
    plan:s,potential:{status:p.status??null,reason:p.reason??null,basis:p.basis??null,pct:p.potential_move_pct??null},
    hard_gates:c.hard_gates?.map(g=>({gate:g.gate,status:g.status,reason:g.reason}))??[],
    data_quality:c.data_quality?.classification??null};
});
const usage=db.usageSnapshot();
if(usage.rows_written!==0||usage.unknown_ops!==0||usage.rows_read>3000)throw new Error('READ_ONLY_BUDGET_VIOLATION');
await fs.writeFile(process.argv[2]||'report2-idea-chain-diagnostic.json',JSON.stringify({schema:'report2-idea-chain-read-only-v1',from,now,rows,usage,network_send:false},null,2));
console.log(JSON.stringify({status:'READ_ONLY',rows:rows.length,high70:rows.filter(r=>r.interest>=70).length,usage}));
