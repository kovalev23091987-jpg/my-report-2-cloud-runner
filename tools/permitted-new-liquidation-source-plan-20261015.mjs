// Research capture only: no runtime source is enabled by this plan.
export function permittedResearchPlan(batch,{vike_key=''}={}){
 if(batch==='pumpglass')return{allowed:false,status:'AUTOMATION_PERMISSION_REQUIRED',source:'PumpGlass',permission_source:'https://pumpglass.com/terms'};
 if(batch==='vike'){
  if(typeof vike_key!=='string'||vike_key.length<16||vike_key.length>512||/\s|["']/.test(vike_key))return{allowed:false,status:'VIKE_OWNER_KEY_REQUIRED',source:'Vike'};
  return{allowed:true,source:'Vike',provider:'VIKE',maximum_provider_HTTP:3,upstream:'HYPERLIQUID',independent_of_existing_Hyperliquid:false,catalog_url:'https://data.vike.io/v1/hyperliquid/positions/coins'};
 }
 if(batch==='hyperperps')return{allowed:true,source:'HyperPerps',provider:'HYPERPERPS',maximum_provider_HTTP:1,upstream:'HYPERLIQUID',independent_of_existing_Hyperliquid:false,targets:[{requested:'SOL',url:'https://trade.hyperperps.app/api/public/heatmap/SOL',role:'FUTURE_POSITION_HEATMAP'}]};
 return{allowed:false,status:'EXACT_RESEARCH_BATCH_REQUIRED'};
}

export function selectVikeResearchAsset(catalog,{approved_assets,gap_contracts}={}){
 if(!(approved_assets instanceof Set)||approved_assets.size!==105||!Array.isArray(gap_contracts)||!Array.isArray(catalog)||catalog.length>1000)throw Error('EXACT_VIKE_CATALOG_AND_APPROVED105_REQUIRED');
 const seen=new Set(),eligible=new Set();
 for(const row of catalog){
  if(typeof row?.coin!=='string'||seen.has(row.coin))throw Error('EXACT_UNIQUE_VIKE_COIN_REQUIRED');
  seen.add(row.coin);
  if(approved_assets.has(row.coin)&&!['BTC','ETH'].includes(row.coin)&&Number.isSafeInteger(row.count)&&row.count>0&&Number.isFinite(row.total_value)&&row.total_value>0)eligible.add(row.coin);
 }
 const gaps=gap_contracts.map(c=>typeof c==='string'&&c.endsWith('-USDT')?c.slice(0,-5):null);
 if(gaps.some(c=>!approved_assets.has(c)||['BTC','ETH'].includes(c)))throw Error('EXACT_APPROVED_LIQ_GAP_REQUIRED');
 const asset=gaps.find(c=>eligible.has(c))||(eligible.has('SOL')?'SOL':null);
 return{asset,catalog_only:true,exact_unscaled_approved_catalog_assets:[...eligible].sort(),selected_for_historical_gap:gaps.includes(asset),numeric_future_coverage_claimed:false};
}

export function vikeResearchTargets(selection){
 const asset=selection?.asset;
 if(typeof asset!=='string'||['BTC','ETH'].includes(asset)||!selection.exact_unscaled_approved_catalog_assets?.includes(asset))throw Error('EXACT_SELECTED_VIKE_ASSET_REQUIRED');
 return[
  {requested:asset,url:'https://data.vike.io/v1/hyperliquid/coins/'+encodeURIComponent(asset)+'/liquidation-heatmap?bins=100',role:'FUTURE_POSITION_BINS'},
  {requested:asset,url:'https://data.vike.io/v1/hyperliquid/positions?coin='+encodeURIComponent(asset)+'&limit=50',role:'BOUNDED_OPEN_POSITION_SAMPLE'},
 ];
}
