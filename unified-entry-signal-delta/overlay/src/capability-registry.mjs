export const CAPABILITY_REGISTRY_VERSION='capability-registry-v2-data-first-20260924';

const ORDER=Object.freeze({
  funding:['HTX','Bybit','OKX','Gate'],
  oi:['HTX','Bybit','OKX','Gate'],
  spot_flow:['HTX','OKX','Binance'],
  relative_strength:['OKX','Binance','HTX'],
  depth_slippage:['HTX'],
  smart_money:['Hyperliquid','ByKaranteli'],
  realized_liquidations:['HTX','Bybit','OKX','Gate'],
  projected_liquidations:['PROJECTED_PROVIDER'],
});

const finite=(value)=>{
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
};
const upper=(value)=>String(value??'').trim();
const CLOSED=new Set(['CLOSED','OK','HEALTHY']);
const BAD_HEALTH=new Set(['DOWN','ERROR','RATE_LIMITED','TIMEOUT','UNHEALTHY']);

export function capabilityPlan(metric){
  return {version:CAPABILITY_REGISTRY_VERSION,metric,sources:[...(ORDER[metric]||[])],fail_closed:true,dynamic_primary:true};
}

function normalizedCapability(row,metric,now){
  const source=upper(row?.source||row?.provider||row?.venue);
  if(!source)return null;
  const coverage=finite(row?.coverage_pct??row?.coverage);
  const completeness=finite(row?.completeness_pct??row?.completeness??coverage);
  const authority=finite(row?.authority_rank);
  const sourceTs=finite(row?.source_ts??row?.data_timestamp??row?.timestamp);
  const maxAgeMs=finite(row?.max_age_ms)??((finite(row?.freshness_sla_sec)??finite(row?.max_age_sec))!==null?(finite(row?.freshness_sla_sec)??finite(row?.max_age_sec))*1000:null);
  const ageMs=sourceTs===null?null:now-sourceTs;
  const freshnessClosed=sourceTs===null?Boolean(row?.fresh===true):ageMs>=-60_000&&(maxAgeMs===null||ageMs<=maxAgeMs);
  const health=upper(row?.health??row?.source_health??'UNKNOWN').toUpperCase();
  const connected=row?.connected===true||row?.available===true||row?.attempted===true||row?.receipt_present===true;
  const metricCompatible=!row?.metric||upper(row.metric)===upper(metric);
  const healthy=!BAD_HEALTH.has(health)&&row?.rate_limited!==true&&row?.timeout!==true;
  const usable=connected&&metricCompatible&&freshnessClosed&&healthy&&row?.source_compatible!==false;
  // Rank is analytical only. It never overrides HTX execution gates.
  const score=(completeness??0)*0.34+(coverage??0)*0.26+(authority===null?50:Math.max(0,100-authority))*0.24+(freshnessClosed?16:0);
  return {source,coverage_pct:coverage,completeness_pct:completeness,authority_rank:authority,source_ts:sourceTs,age_ms:ageMs,max_age_ms:maxAgeMs,health,connected,metric_compatible:metricCompatible,fresh:freshnessClosed,healthy,usable,selection_score:score,raw:row};
}

export function rankCapabilitySources({metric,capabilities=[],now=Date.now()}={}){
  const plan=capabilityPlan(metric);
  const allowed=new Set(plan.sources);
  const normalized=(Array.isArray(capabilities)?capabilities:[])
    .map(row=>normalizedCapability(row,metric,now))
    .filter(Boolean)
    .filter(row=>allowed.has(row.source));
  const bySource=new Map(normalized.map(row=>[row.source,row]));
  // Backwards-compatible fallback order exists only when no factual capability
  // metadata is supplied. Once receipts exist, completeness/freshness/health/
  // authority drive analytical source selection.
  if(!normalized.length)return plan.sources.map((source,index)=>({source,usable:true,selection_score:plan.sources.length-index,fallback_order:true}));
  return plan.sources.map((source,index)=>bySource.get(source)||({source,usable:false,selection_score:-Infinity,connected:false,fresh:false,healthy:false,reason:'NO_FACTUAL_CAPABILITY_RECEIPT'}))
    .sort((a,b)=>Number(b.usable)-Number(a.usable)||(b.selection_score-a.selection_score)||(plan.sources.indexOf(a.source)-plan.sources.indexOf(b.source)));
}

function attemptStatus(x){return upper(x?.status||'UNKNOWN').toUpperCase();}
function attemptClosed(x){return CLOSED.has(attemptStatus(x));}

export function sourceExhaustion({metric,attempts=[],capabilities=[],now=Date.now()}={}){
  const plan=capabilityPlan(metric);
  const rows=Array.isArray(attempts)?attempts:[];
  const allowed=new Set(plan.sources);
  const by=new Map(rows.filter(x=>allowed.has(upper(x?.source))).map(x=>[upper(x.source),x]));
  const ranked=rankCapabilitySources({metric,capabilities,now});
  const trail=[];
  for(const capability of ranked){
    const source=capability.source;
    const x=by.get(source);
    if(!x){
      trail.push({source,status:'NOT_ATTEMPTED',active:false,capability_status:capability.usable?'AVAILABLE':'NOT_AVAILABLE',selection_score:Number.isFinite(capability.selection_score)?capability.selection_score:null});
      continue;
    }
    const status=attemptStatus(x);
    const sourceTs=finite(x?.source_ts??x?.timestamp);
    const maxAgeMs=finite(x?.max_age_ms)??((finite(x?.max_age_sec)!==null)?finite(x.max_age_sec)*1000:null);
    const current=sourceTs===null?x?.fresh!==false:(sourceTs<=now+60_000&&(maxAgeMs===null||now-sourceTs<=maxAgeMs));
    const compatible=x?.source_compatible!==false;
    const factualStatus=attemptClosed(x)&&current&&compatible?'CLOSED':attemptClosed(x)&&!current?'STALE':status;
    trail.push({source,status:factualStatus,value:x?.value??null,timestamp:sourceTs,active:true,current,compatible,selection_score:Number.isFinite(capability.selection_score)?capability.selection_score:null});
    if(factualStatus==='CLOSED')return {status:'CLOSED',source,value:x.value,timestamp:sourceTs,trail,selection:{dynamic:capabilities.length>0,metric,reason:'BEST_FACTUALLY_AVAILABLE_COMPLETE_FRESH_HEALTHY_SOURCE'}};
  }
  const allEligibleAttempted=ranked.filter(x=>x.usable).every(x=>by.has(x.source));
  const allPlanAttempted=plan.sources.length>0&&plan.sources.every(s=>by.has(s));
  const exhausted=capabilities.length>0?allEligibleAttempted:allPlanAttempted;
  return {status:exhausted?'SOURCE_EXHAUSTED':'SOURCE_TOOL_UNAVAILABLE_THIS_RUN',source:null,value:null,timestamp:null,trail,selection:{dynamic:capabilities.length>0,metric}};
}

function pairSpreadPct(a,b){
  const av=Number(a),bv=Number(b);const base=Math.max(1e-12,Math.abs(av),Math.abs(bv));return Math.abs(av-bv)/base*100;
}
function authorityRank(row){const n=finite(row?.authority_rank);return n===null?9999:n;}

export function resolveCrossVenueConflict({metric,rows=[],tolerance_pct=5}={}){
  const valid=(Array.isArray(rows)?rows:[]).filter(x=>attemptClosed(x)&&Number.isFinite(Number(x.value))&&x.source&&x?.source_compatible!==false);
  if(valid.length<2)return {status:'INSUFFICIENT',metric,consensus:null,rows:valid,averaged:false,third_source_required:false};
  const pairs=[];
  for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++)pairs.push({a:valid[i],b:valid[j],spread_pct:pairSpreadPct(valid[i].value,valid[j].value)});
  const compatiblePairs=pairs.filter(p=>p.spread_pct<=Number(tolerance_pct));
  const fullSpread=Math.max(...valid.map(r=>Number(r.value)))-Math.min(...valid.map(r=>Number(r.value)));
  const base=Math.max(1e-12,...valid.map(r=>Math.abs(Number(r.value))));
  const spreadPct=Math.abs(fullSpread)/base*100;
  if(valid.length===2&&compatiblePairs.length===0)return {status:'CONFLICT',metric,consensus:null,spread_pct:spreadPct,rows:valid,averaged:false,third_source_required:true};
  if(valid.length>=3&&compatiblePairs.length){
    // A third independent source may corroborate one side. Choose an actually
    // observed value from the best-authority member of the tightest pair; never average.
    compatiblePairs.sort((x,y)=>x.spread_pct-y.spread_pct||Math.min(authorityRank(x.a),authorityRank(x.b))-Math.min(authorityRank(y.a),authorityRank(y.b)));
    const pair=compatiblePairs[0];
    const chosen=[pair.a,pair.b].sort((a,b)=>authorityRank(a)-authorityRank(b))[0];
    const outliers=valid.filter(row=>row!==pair.a&&row!==pair.b);
    return {status:'RESOLVED_BY_THIRD_SOURCE',metric,consensus:chosen.value,consensus_source:chosen.source,corroborating_sources:[pair.a.source,pair.b.source],outliers,spread_pct:spreadPct,rows:valid,averaged:false,third_source_required:false};
  }
  if(compatiblePairs.length===pairs.length){
    const chosen=[...valid].sort((a,b)=>authorityRank(a)-authorityRank(b))[0];
    return {status:'COMPATIBLE',metric,consensus:chosen.value,consensus_source:chosen.source,spread_pct:spreadPct,rows:valid,averaged:false,third_source_required:false};
  }
  return {status:'CONFLICT',metric,consensus:null,spread_pct:spreadPct,rows:valid,averaged:false,third_source_required:valid.length<3};
}

export function verifyHtxExecutionIdentity({contract_code,htx_contract_code,market_type,tradable,status}={}){
  if(status!=='CLOSED'||tradable!==true)return {status:'NOT_CLOSED',reason:'HTX_EXECUTION_NOT_CONFIRMED'};
  if(String(market_type||'').toUpperCase()!=='FUTURES')return {status:'NOT_CLOSED',reason:'HTX_FUTURES_REQUIRED'};
  if(!contract_code||contract_code!==htx_contract_code)return {status:'NOT_CLOSED',reason:'HTX_SYMBOL_IDENTITY_MISMATCH'};
  return {status:'CLOSED',contract_code,market_type:'FUTURES'};
}
