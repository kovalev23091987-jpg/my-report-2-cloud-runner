// Structural paths only: no network, no source freshness or HTX identity claim.
export function resolveBinanceColdBatchDirectories(acquisition) {
 const records=acquisition?.archives,layout=acquisition?.storage_layout??'MARKET_MONTH_SINGLE_SYMBOL';
 if(!['MARKET_MONTH_SINGLE_SYMBOL','MARKET_SYMBOL_MONTH'].includes(layout)||!Array.isArray(records)||records.length>612)throw Error('BOUNDED_EXPLICIT_BATCH_LAYOUT_REQUIRED');
 const seen=new Set(),slots=new Set();
 return records.map(record=>{
  const {market,symbol,month}=record??{};
  if(!['spot','usd_m_futures'].includes(market)||typeof symbol!=='string'||!/^[A-Z0-9]{2,24}USDT$/.test(symbol)||typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('EXACT_BATCH_MARKET_SYMBOL_CALENDAR_REQUIRED');
  const key=`${market}|${symbol}|${month}`,slot=`${market}|${month}`;
  if(seen.has(key))throw Error('DUPLICATE_BATCH_ARCHIVE_IDENTITY');
  if(layout==='MARKET_MONTH_SINGLE_SYMBOL'&&slots.has(slot))throw Error('LEGACY_MULTI_SYMBOL_PATH_COLLISION');
  seen.add(key);slots.add(slot);
  return layout==='MARKET_SYMBOL_MONTH'?`${market}/${symbol}/${month}`:`${market}/${month}`;
 });
}
