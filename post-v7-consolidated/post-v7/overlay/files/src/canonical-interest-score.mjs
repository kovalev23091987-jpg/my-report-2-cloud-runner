export const CANONICAL_INTEREST_SCORE_VERSION='canonical-interest-score-v1-20260926';
const text=v=>v==null?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
const finite=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const clamp=v=>{const n=finite(v);return n==null?null:Math.max(0,Math.min(100,n));};
const parse=(v,fb)=>{try{return typeof v==='string'?JSON.parse(v):(v??fb);}catch{return fb;}};

// Exact V7 evidence-strength formula moved from Telegram formatting into the
// analytical owner. Coefficients and transforms are intentionally unchanged.
export function computeCanonicalInterestScore({
  direction,
  early_detection_quality_0_100=null,
  dc_long=null,
  dc_short=null,
  dq_status=null,
  evidence_rows=[],
  opportunity_event=null,
}={}){
  const rows=Array.isArray(evidence_rows)?evidence_rows:(parse(evidence_rows,[])||[]);
  const dir=upper(direction); const sign=dir==='SHORT'?-1:1;
  const vals=[];
  const add=v=>{const n=finite(v);if(n!=null)vals.push(Math.max(0,Math.min(100,n)));};
  for(const r of rows){
    const domain=upper(r?.domain??r?.metric_group??r?.metric);
    if(domain==='RELATIVE_STRENGTH'){
      const pp=[r.btc_1h_pct_points,r.eth_1h_pct_points,r.btc_4h_pct_points,r.eth_4h_pct_points]
        .map(finite).filter(v=>v!=null).map(v=>sign*v);
      if(pp.length){const avg=pp.reduce((a,b)=>a+b,0)/pp.length;add(45+55*Math.min(1,Math.max(0,avg)/5));}
    }else if(domain==='OI_ACCELERATION'){
      const z=Math.abs(finite(r.robust_z)??0),p=finite(r.self_percentile);
      add(Math.max(p!=null?p*100:0,45+Math.min(55,z*12)));
    }else if(domain==='FUNDING_TRAJECTORY'){
      const d=Math.abs(finite(r.delta_1h_pct_points)??0);add(45+55*Math.min(1,d/0.05));
    }else if(domain.includes('VOLUME_ACCELERATION')){
      const ratio=finite(r.acceleration_ratio),p=finite(r.percentile??r.self_percentile);
      add(Math.max(p!=null?p*100:0,ratio!=null?45+55*Math.min(1,Math.max(0,ratio-1)/4):60));
    }else if(domain.includes('ORDERFLOW')){
      const delta=Math.abs(finite(r.delta)??0),cvd=Math.abs(finite(r.cvd_change)??0);add(delta||cvd?70:60);
    }else if(domain.includes('LIQUIDATION')){
      const burst=Math.abs(finite(r.burst_velocity)??0);add(55+45*Math.min(1,burst));
    }else if(domain==='EXECUTION_BOOK_SUPPORT'){
      const im=Math.abs(finite(r.imbalance)??0);add(50+50*Math.min(1,im/0.5));
    }else if(domain) add(58);
  }
  const earlyBase=clamp(early_detection_quality_0_100)??50;
  const deep=dir==='SHORT'?finite(dc_short):dir==='LONG'?finite(dc_long):null;
  const dq=upper(dq_status); const dataQ=dq==='CLOSED'?100:dq==='PARTIAL'?72:dq==='INSUFFICIENT'?30:55;
  const ev=opportunity_event||{}; const cls=ev.early_anomaly_classification||{};
  const candleScores=['accumulation','distribution','two_sided_transfer','liquidation_futures_noise']
    .map(k=>finite(cls?.[k]?.evidence_score)).filter(v=>v!=null);
  const candle=candleScores.length?Math.max(...candleScores):null;
  const evidence=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:earlyBase;
  const composite=0.20*earlyBase+0.30*evidence+0.35*(deep??earlyBase)+0.10*dataQ+0.05*(candle??50);
  return Math.round(Math.max(0,Math.min(100,composite)));
}

export function computeCanonicalInterestFromRuntime({direction,discovery_row,shadow_decision,public_evidence,opportunity}={}){
  const evidence=[
    ...(Array.isArray(public_evidence?.evidence)?public_evidence.evidence:[]),
    ...(Array.isArray(public_evidence?.advisory_evidence)?public_evidence.advisory_evidence:[]),
  ];
  return computeCanonicalInterestScore({
    direction,
    early_detection_quality_0_100:discovery_row?.early_candidate_quality_0_100??discovery_row?.early_detection_quality_0_100,
    dc_long:shadow_decision?.dc_shadow_long??shadow_decision?.dc_long,
    dc_short:shadow_decision?.dc_shadow_short??shadow_decision?.dc_short,
    dq_status:shadow_decision?.dq?.status??shadow_decision?.dq_status,
    evidence_rows:evidence,
    opportunity_event:opportunity?.newest_event??opportunity?.event??null,
  });
}
export default{CANONICAL_INTEREST_SCORE_VERSION,computeCanonicalInterestScore,computeCanonicalInterestFromRuntime};
