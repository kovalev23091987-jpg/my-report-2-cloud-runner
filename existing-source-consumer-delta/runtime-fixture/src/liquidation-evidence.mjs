export const LIQUIDATION_EVIDENCE_VERSION='liquidation-evidence-v1-20260924';
const finite=v=>Number.isFinite(Number(v))?Number(v):null;
export function normalizeLiquidationEvidence({realized=[],projected=[],observed_ts=Date.now()}={}){
  const clean=(rows,kind)=> (Array.isArray(rows)?rows:[]).filter(r=>finite(r?.level_price)>0&&r?.source&&r?.status==='CLOSED').map(r=>({kind,level_price:finite(r.level_price),side:r.side||null,source:r.source,source_ts:r.source_ts??r.observed_ts??null,confidence:kind==='REALIZED'?'OBSERVED':'PROJECTED',lifecycle:r.lifecycle||null}));
  return {version:LIQUIDATION_EVIDENCE_VERSION,observed_ts,realized:clean(realized,'REALIZED'),projected:clean(projected,'PROJECTED')};
}
export function selectLiquidationZones(evidence,{current_price,direction}={}){
  const px=finite(current_price);if(px===null||px<=0)return {nearest:null,largest_distant:null,status:'NOT_CLOSED'};
  const rows=[...(evidence?.realized||[]),...(evidence?.projected||[])].filter(r=>!['SWEPT','INVALIDATED','EXPIRED'].includes(String(r.lifecycle||'').toUpperCase()));
  const desired=String(direction||'').toUpperCase()==='LONG'?'ABOVE':'BELOW';
  const sideRows=rows.filter(r=>desired==='ABOVE'?r.level_price>px:r.level_price<px).map(r=>({...r,distance_pct:(r.level_price/px-1)*100}));
  if(!sideRows.length)return {nearest:null,largest_distant:null,status:'NO_DATA'};
  const nearest=[...sideRows].sort((a,b)=>Math.abs(a.distance_pct)-Math.abs(b.distance_pct))[0];
  const largest_distant=[...sideRows].sort((a,b)=>(finite(b.notional_usdt)||0)-(finite(a.notional_usdt)||0)||Math.abs(b.distance_pct)-Math.abs(a.distance_pct))[0];
  return {nearest,largest_distant,status:'CLOSED',guaranteed_target:false};
}
