export const CLOSED_MINUTE_DECOMPOSITION_VERSION='closed-minute-decomposition-v1-20260924';
const MIN=60_000;
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const stamp=v=>{const n=finite(v);return n===null?null:Math.trunc(n);};
function normalizeOneMinute(rows,{now=Date.now()}={}){
  const out=[],rejected=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const t=stamp(row?.ts??row?.timestamp),end=stamp(row?.end_ts??(t===null?null:t+MIN));
    const o=finite(row?.open),h=finite(row?.high),l=finite(row?.low),c=finite(row?.close),v=finite(row?.volume);
    if(t===null||t%MIN!==0||end!==t+MIN||end>now||row?.closed===false||[o,h,l,c].some(x=>x===null)||h<Math.max(o,c)||l>Math.min(o,c)){
      rejected.push({ts:t,reason:'INVALID_OR_UNCLOSED_1M'});continue;
    }
    out.push({...row,ts:t,end_ts:end,open:o,high:h,low:l,close:c,volume:v});
  }
  out.sort((a,b)=>a.ts-b.ts);return {rows:out,rejected};
}
function exactAggregate(rows,minutes){
  const duration=minutes*MIN,by=new Map();
  for(const row of rows){const bucket=Math.floor(row.ts/duration)*duration;if(!by.has(bucket))by.set(bucket,[]);by.get(bucket).push(row);}
  const candles=[];let incomplete=0;
  for(const [start,bars] of [...by.entries()].sort((a,b)=>a[0]-b[0])){
    bars.sort((a,b)=>a.ts-b.ts);let ok=bars.length===minutes;
    for(let i=0;i<bars.length;i++)if(bars[i].ts!==start+i*MIN)ok=false;
    if(!ok){incomplete+=1;continue;}
    candles.push({ts:start,end_ts:start+duration,open:bars[0].open,high:Math.max(...bars.map(x=>x.high)),low:Math.min(...bars.map(x=>x.low)),close:bars.at(-1).close,volume:bars.reduce((s,x)=>s+(finite(x.volume)??0),0),source:'DERIVED_EXACT_CLOSED_1M'});
  }
  return {candles,incomplete_buckets:incomplete};
}
export function decomposeClosedMinuteEvent({one_minute,event_start_ts,event_close_ts,now=Date.now()}={}){
  const start=stamp(event_start_ts),close=stamp(event_close_ts);
  if(start===null||close===null||close<=start||start%MIN!==0||close%MIN!==0)return {version:CLOSED_MINUTE_DECOMPOSITION_VERSION,status:'NOT_CLOSED',reason:'EVENT_BOUNDARY_INVALID',classification_allowed:false};
  const normalized=normalizeOneMinute(one_minute,{now});
  const rows=normalized.rows.filter(r=>r.ts>=start&&r.end_ts<=close),expected=(close-start)/MIN;
  const exact1=rows.length===expected&&rows.every((r,i)=>r.ts===start+i*MIN);
  const three=exactAggregate(rows,3),five=exactAggregate(rows,5);
  const expected3=Number.isInteger(expected/3)?expected/3:null,expected5=Number.isInteger(expected/5)?expected/5:null;
  const closed=exact1&&expected3!==null&&expected5!==null&&three.candles.length===expected3&&five.candles.length===expected5&&three.incomplete_buckets===0&&five.incomplete_buckets===0;
  return {version:CLOSED_MINUTE_DECOMPOSITION_VERSION,status:closed?'CLOSED':'MINUTE_DECOMPOSITION_NOT_CLOSED',classification_allowed:closed,event_start_ts:start,event_close_ts:close,expected_one_minute_bars:expected,one_minute_bars:rows.length,expected_three_minute_bars:expected3,three_minute_bars:three.candles.length,expected_five_minute_bars:expected5,five_minute_bars:five.candles.length,rejected_one_minute_bars:normalized.rejected.length,three_minute:three.candles,five_minute:five.candles,missing_or_incomplete:!closed};
}

export function buildClosedMinuteDecomposition({event,one_minute,now=Date.now(),hypotheses={}}={}){
  const close=stamp(event?.event_close_ts),start=stamp(event?.timestamp);
  if(close!==null&&close>now)return {version:CLOSED_MINUTE_DECOMPOSITION_VERSION,status:'NOT_CLOSED',reason:'EVENT_NOT_CLOSED_YET',classification_allowed:false,classification:null,bars:{'1m':[],'3m':[],'5m':[]}};
  const base=decomposeClosedMinuteEvent({one_minute,event_start_ts:start,event_close_ts:close,now});
  const rows=(Array.isArray(one_minute)?one_minute:[]).filter(r=>stamp(r?.ts)>=start&&stamp(r?.end_ts??(stamp(r?.ts)+MIN))<=close&&r?.closed!==false);
  if(!base.classification_allowed)return {...base,status:'NOT_CLOSED',reason:'INCOMPLETE_OR_GAPPED_1M_HISTORY',classification:null,bars:{'1m':rows,'3m':base.three_minute||[],'5m':base.five_minute||[]}};
  const score=(key)=>finite(hypotheses?.[key]?.evidence_score??hypotheses?.[key]?.score);
  return {...base,status:'CLOSED',reason:null,classification_allowed:true,bars:{'1m':rows,'3m':base.three_minute,'5m':base.five_minute},classification:{
    accumulation:{key:'ABSORPTION_ACCUMULATION',evidence_score:score('ABSORPTION_ACCUMULATION')},
    distribution:{key:'DISTRIBUTION',evidence_score:score('DISTRIBUTION')},
    two_sided_transfer:{key:'TWO_WAY_TRANSFER',evidence_score:score('TWO_WAY_TRANSFER')},
    liquidation_futures_noise:{key:'DERIVATIVE_LIQUIDATION_NOISE',evidence_score:score('DERIVATIVE_LIQUIDATION_NOISE')},
  }};
}

export default {CLOSED_MINUTE_DECOMPOSITION_VERSION,decomposeClosedMinuteEvent,buildClosedMinuteDecomposition};
