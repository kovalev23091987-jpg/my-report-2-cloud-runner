export const PROTECTIVE_ASSET_FILTER_VERSION='protective-asset-filter-v1-20260925';
export const MONTHLY_COLLAPSE_THRESHOLD_PCT=-97;
const DAY=86_400_000;
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const arr=v=>Array.isArray(v)?v:[];
function normalize(rows){
  const out=[];
  for(const r of arr(rows)){
    const ts=finite(r?.ts??r?.id),close=finite(r?.close);
    if(ts===null||close===null||close<=0)continue;
    out.push({ts,close});
  }
  out.sort((a,b)=>a.ts-b.ts);
  return out.filter((r,i,a)=>i===0||r.ts!==a[i-1].ts);
}
export function buildProtectiveAssetFilter({daily_candles=[],observed_ts=Date.now()}={}){
  const rows=normalize(daily_candles);
  const latest=rows.at(-1)||null;
  if(!latest)return{version:PROTECTIVE_ASSET_FILTER_VERSION,status:'NOT_CLOSED',reason:'MONTHLY_HISTORY_MISSING',hard_reject:false,monthly_change_pct:null,history_span_days:null,threshold_pct:MONTHLY_COLLAPSE_THRESHOLD_PCT,unknown_as_safe:false};
  const target=latest.ts-29*DAY;
  const base=rows.filter(r=>r.ts<=target).at(-1)||null;
  if(!base)return{version:PROTECTIVE_ASSET_FILTER_VERSION,status:'NOT_CLOSED',reason:'MONTHLY_HISTORY_LT_29D',hard_reject:false,monthly_change_pct:null,history_span_days:rows.length>1?(latest.ts-rows[0].ts)/DAY:0,threshold_pct:MONTHLY_COLLAPSE_THRESHOLD_PCT,unknown_as_safe:false};
  const change=((latest.close/base.close)-1)*100;
  const span=(latest.ts-base.ts)/DAY;
  const hard=change<=MONTHLY_COLLAPSE_THRESHOLD_PCT;
  return{
    version:PROTECTIVE_ASSET_FILTER_VERSION,status:'CLOSED',
    rule_version:'monthly-collapse-protective-v1-owner-authorized-20260925',
    observed_ts:Number(observed_ts)||null,base_ts:base.ts,latest_ts:latest.ts,
    base_close:base.close,latest_close:latest.close,history_span_days:span,
    monthly_change_pct:change,threshold_pct:MONTHLY_COLLAPSE_THRESHOLD_PCT,
    hard_reject:hard,
    reason:hard?'MONTHLY_COLLAPSE_PROTECTIVE_FILTER':null,
    dead_false_asset_guards_retained_elsewhere:true,
    turnover_gate_retained:true,unknown_as_safe:false,missing_as_zero:false,
  };
}
export default{PROTECTIVE_ASSET_FILTER_VERSION,MONTHLY_COLLAPSE_THRESHOLD_PCT,buildProtectiveAssetFilter};
