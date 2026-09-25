export const EVIDENCE_DOMAIN_CONTRACT_VERSION='evidence-domain-contract-v1-20260925';
const arr=v=>Array.isArray(v)?v:[];
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const txt=v=>String(v??'').trim();
const evidence=(pub,re)=>[...arr(pub?.evidence),...arr(pub?.advisory_evidence)].filter(x=>x);
const closed=(rows,re)=>rows.some(x=>String(x?.status||'').toUpperCase()==='CLOSED'&&re.test(txt(x?.metric)));
const state=(ok,source)=>({status:ok?'CLOSED':'EXPLICIT_MISSING',source:ok?source:null,missing_is_zero:false});
export function buildEvidenceDomainContract({opportunity=null,public_evidence=null,futures_component=null,liquidation_intelligence=null}={}){
  const ev=evidence(public_evidence);
  const newest=opportunity?.newest_event||null;
  const d={
    effort_result:state(Boolean(newest?.minute_decomposition||newest?.hypotheses),'Opportunity minute/hypothesis model'),
    wick_close_reclaim:state(Boolean(newest?.liquidity_sweep||newest?.candle),'Opportunity candle/sweep model'),
    flows:state(Boolean(newest?.market_flow)||closed(ev,/flow|taker/i),'Spot/Futures factual flow'),
    oi_trajectory:state(Boolean(opportunity?.price_oi_matrix)||closed(ev,/open_interest|oi_change|(^|_)oi_/i),'Per-venue OI trajectory'),
    funding_history:state(Boolean(newest?.funding_at_event)||ev.some(x=>String(x?.status).toUpperCase()==='CLOSED'&&/funding/i.test(txt(x?.metric))&&(finite(x?.history_coverage_pct)>0||/history/i.test(txt(x?.window)))),'Funding history'),
    basis:state(Boolean(opportunity?.spot_perp_basis),'Spot-perp basis'),
    order_book:state(closed(ev,/spread_bps|impact_bps|order_book/i)||Boolean(futures_component?.data?.depth||futures_component?.data?.order_book),'HTX factual book/execution'),
    liquidations:state(Boolean(liquidation_intelligence?.realized_status||liquidation_intelligence?.projected_map_status||newest?.liquidations),'Liquidation intelligence'),
    relative_strength:state(closed(ev,/^rs_vs_(btc|eth)_/i)||Boolean(newest?.relative_strength),'Relative strength'),
    price_response:state(Boolean(newest?.post_event_current||newest?.candle),'Opportunity price response'),
  };
  const statuses=Object.values(d).map(x=>x.status);
  return{
    version:EVIDENCE_DOMAIN_CONTRACT_VERSION,status:statuses.every(x=>x==='CLOSED'||x==='EXPLICIT_MISSING')?'CLOSED':'NOT_CLOSED',
    domains:d,
    closed_count:statuses.filter(x=>x==='CLOSED').length,
    explicit_missing_count:statuses.filter(x=>x==='EXPLICIT_MISSING').length,
    all_required_domains_declared:Object.keys(d).length===10,
    optional_missing_stays_explicit:true,unknown_as_zero:false,directional_vote_added:false,
  };
}
export default{EVIDENCE_DOMAIN_CONTRACT_VERSION,buildEvidenceDomainContract};
