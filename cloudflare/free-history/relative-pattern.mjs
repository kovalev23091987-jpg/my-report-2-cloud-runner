const median=values=>{const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;};
const finitePrice=s=>typeof s?.price==='number'&&Number.isFinite(s.price)&&s.price>0;

// Descriptive hourly pattern only. Same venue, market, hourly buckets and valid adjacent prices.
export function summarizeBtcEthRelativePattern({coin,btc,eth}={}){
  const failure=reason=>({status:reason,score_contribution:0,entry_authorized:false,report_ready:false});
  if(!coin||!btc||!eth||[coin,btc,eth].some(x=>x.status==='IDENTITY_UNVERIFIED'||x.decision_usable!==false)||new Set([coin.market,btc.market,eth.market]).size!==1||new Set([coin.venue,btc.venue,eth.venue]).size!==1||coin.contract==='BTC-USDT'||coin.contract==='ETH-USDT'||btc.contract!=='BTC-USDT'||eth.contract!=='ETH-USDT')return failure('EXACT_SAME_MARKET_SERIES_REQUIRED');
  const map=series=>new Map(series.samples.filter(finitePrice).map(s=>[s.hour_bucket,s.price]));
  const c=map(coin),b=map(btc),e=map(eth),hours=[...c.keys()].filter(h=>b.has(h)&&e.has(h)).sort((x,y)=>x-y),down=[],up=[];
  for(let i=1;i<hours.length;i++){
    const h=hours[i],p=hours[i-1];if(h-p!==3_600_000)continue;
    const cr=100*(c.get(h)/c.get(p)-1),br=100*(b.get(h)/b.get(p)-1),er=100*(e.get(h)/e.get(p)-1);
    if(br<0&&er<0)down.push({hour_bucket:h,coin_pct:cr,btc_pct:br,eth_pct:er,outperformed_both:cr>br&&cr>er,edge_vs_stronger_pct_points:cr-Math.max(br,er)});
    if(br>0&&er>0)up.push({hour_bucket:h,coin_pct:cr,btc_pct:br,eth_pct:er,outperformed_both:cr>br&&cr>er,edge_vs_stronger_pct_points:cr-Math.max(br,er)});
  }
  if(down.length<3||up.length<3)return {...failure('INSUFFICIENT_BOTH_REGIMES'),matched_hourly_points:hours.length,down_hours:down.length,up_hours:up.length};
  return {status:'DESCRIPTIVE_CONTEXT',contract:coin.contract,market:coin.market,venue:coin.venue,matched_hourly_points:hours.length,down_hours:down.length,up_hours:up.length,down_outperformed_both:down.filter(x=>x.outperformed_both).length,up_outperformed_both:up.filter(x=>x.outperformed_both).length,down_median_edge_pct_points:median(down.map(x=>x.edge_vs_stronger_pct_points)),up_median_edge_pct_points:median(up.map(x=>x.edge_vs_stronger_pct_points)),interpretation:'OBSERVED_MATCHED_HOURLY_RETURNS_ONLY',score_contribution:0,entry_authorized:false,report_ready:false};
}
