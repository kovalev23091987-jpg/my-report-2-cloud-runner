import { rankPreselectionMetricSources } from './capability-registry.mjs';

export const PRESELECTION_METRIC_ROUTER_VERSION='preselection-metric-router-v1-20260925';

const text=v=>v===null||v===undefined?'':String(v).trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const arr=v=>Array.isArray(v)?v:[];

export function preselectionMetricFamily(metric){
  const m=text(metric).toLowerCase();
  if(!m)return null;
  if(/funding/.test(m))return'funding';
  if(/open_interest|(^|_)oi(_|$)|oi_change/.test(m))return'oi';
  if(/^rs_vs_(?:btc|eth)_/.test(m))return'relative_strength';
  if(/spot_flow|spot_turnover|spot_order_book_imbalance/.test(m))return'spot_flow';
  if(/realized.*liquid|liquidation.*realized/.test(m))return'realized_liquidations';
  return null;
}

function selectionFact(metric, family, selected){
  const raw=selected?.raw||{};
  return{
    metric,
    metric_family:family,
    source:selected?.source??null,
    provider:selected?.provider??null,
    venue:selected?.venue??null,
    value:raw?.value??raw?.normalized_value??null,
    unit:selected?.unit??raw?.unit??null,
    source_ts:selected?.source_ts??null,
    observed_ts:selected?.received_ts??raw?.observed_ts??null,
    status:'CLOSED',
    source_compatible:raw?.source_compatible!==false,
    primary_market_id:selected?.mapping?.primary_market_id??raw?.primary_market_id??null,
    selection_score:Number.isFinite(Number(selected?.selection_score))?Number(selected.selection_score):null,
    selection_metadata:{
      provider:selected?.provider??null,
      venue:selected?.venue??null,
      mapping:selected?.mapping??null,
      market_type:selected?.market_type??null,
      unit:selected?.unit??null,
      multiplier:selected?.multiplier??null,
      interval:selected?.interval??null,
      interval_status:selected?.interval_status??null,
      history_coverage_pct:selected?.history_coverage_pct??null,
      history_status:selected?.history_status??null,
      freshness_status:selected?.freshness_status??null,
      source_ts:selected?.source_ts??null,
      received_ts:selected?.received_ts??null,
      age_ms:selected?.age_ms??null,
      max_age_ms:selected?.max_age_ms??null,
      coverage_pct:selected?.coverage_pct??null,
      completeness_pct:selected?.completeness_pct??null,
      health:selected?.health??null,
      authority_rank:selected?.authority_rank??null,
      authority_source:selected?.authority_source??null,
      last_success_ts:selected?.last_success_ts??null,
      runtime_state:selected?.runtime_state??null,
      usable:selected?.usable===true,
    },
  };
}

export function buildPreselectionMetricRouter({contract=null,evidence=[],now=Date.now()}={}){
  const groups=new Map();
  for(const row of arr(evidence)){
    const metric=text(row?.metric);
    const family=preselectionMetricFamily(metric);
    if(!metric||!family)continue;
    const key=metric.toLowerCase();
    const bucket=groups.get(key)||{metric,family,rows:[]};
    bucket.rows.push(row);
    groups.set(key,bucket);
  }

  const routes=[];
  const selectedFacts=[];
  for(const bucket of [...groups.values()].sort((a,b)=>a.metric.localeCompare(b.metric))){
    const ranked=rankPreselectionMetricSources({metric:bucket.family,rows:bucket.rows,now});
    const selected=ranked.find(x=>x.usable===true)||null;
    routes.push({
      metric:bucket.metric,
      metric_family:bucket.family,
      status:selected?'CLOSED':'NOT_CLOSED',
      selected_source:selected?.source??null,
      selected_score:Number.isFinite(Number(selected?.selection_score))?Number(selected.selection_score):null,
      ranking:ranked.map(x=>({
        source:x.source,
        usable:x.usable===true,
        selection_score:Number.isFinite(Number(x.selection_score))?Number(x.selection_score):null,
        freshness_status:x.freshness_status??null,
        health:x.health??null,
        coverage_pct:x.coverage_pct??null,
        completeness_pct:x.completeness_pct??null,
        authority_rank:x.authority_rank??null,
        reason:x.reason??null,
      })),
    });
    if(selected)selectedFacts.push(selectionFact(bucket.metric,bucket.family,selected));
  }

  const families=[...new Set(selectedFacts.map(x=>x.metric_family))].sort();
  const selectedSources=[...new Set(selectedFacts.map(x=>x.source).filter(Boolean))].sort();
  const externalSources=selectedSources.filter(x=>x!=='HTX');
  const metadataComplete=selectedFacts.filter(f=>{
    const m=f.selection_metadata||{};
    return Object.prototype.hasOwnProperty.call(m,'provider') &&
      Object.prototype.hasOwnProperty.call(m,'venue') &&
      Object.prototype.hasOwnProperty.call(m,'mapping') &&
      Object.prototype.hasOwnProperty.call(m,'market_type') &&
      Object.prototype.hasOwnProperty.call(m,'unit') &&
      Object.prototype.hasOwnProperty.call(m,'interval') &&
      Object.prototype.hasOwnProperty.call(m,'history_coverage_pct') &&
      Object.prototype.hasOwnProperty.call(m,'freshness_status') &&
      Object.prototype.hasOwnProperty.call(m,'coverage_pct') &&
      Object.prototype.hasOwnProperty.call(m,'health') &&
      Object.prototype.hasOwnProperty.call(m,'authority_rank') &&
      Object.prototype.hasOwnProperty.call(m,'last_success_ts');
  }).length;

  return{
    version:PRESELECTION_METRIC_ROUTER_VERSION,
    status:selectedFacts.length?'CLOSED':'NOT_CLOSED',
    contract:text(contract)||null,
    observed_ts:now,
    route_count:routes.length,
    selected_metric_count:selectedFacts.length,
    selected_family_count:families.length,
    metadata_complete_count:metadataComplete,
    families,
    selected_sources:selectedSources,
    external_selected_sources:externalSources,
    routes,
    selected_facts:selectedFacts,
    htx_execution_only_mandatory:true,
    external_execution_substitution:false,
    htx_turnover_gate_owned_elsewhere:true,
    priority_only:true,
    directional_vote:false,
    hard_gate:false,
    automatic_entry:false,
    strategy_weights_changed:false,
    thresholds_changed:false,
  };
}

export default{PRESELECTION_METRIC_ROUTER_VERSION,preselectionMetricFamily,buildPreselectionMetricRouter};
