// The cache key locates a candidate; it cannot establish which requested
// asset, venue, market or closed window the retained fact actually describes.
// Keep the provider validator and original clocks, then bind the whole sample
// to this invocation before a cache hit can suppress the normal fallback.
const sameIdentity=(a,b)=>a?.chain===b?.chain&&(a?.asset_kind==='NATIVE'||b?.asset_kind==='NATIVE'
 ?a.asset_kind===b.asset_kind&&a.native_asset_id===b.native_asset_id&&a.contract_or_mint==null&&b.contract_or_mint==null
 :a?.asset_kind==='TOKEN'&&b?.asset_kind==='TOKEN'&&typeof a.contract_or_mint==='string'&&typeof b.contract_or_mint==='string'&&(a.chain==='solana'?a.contract_or_mint===b.contract_or_mint:a.contract_or_mint.toLowerCase()===b.contract_or_mint.toLowerCase()));

export function exactCachedN12TradeResult(result,{contract,identity,venue,market,now,window_end_ts=null,validate}={}){
 if(result?.check_completed!==true||result.status!=='CLOSED_BOUNDED_SAMPLE'||!Array.isArray(result.evidence)||result.evidence.length!==1||typeof validate!=='function'||!Number.isSafeInteger(now))return false;
 const summary=result.summary,row=result.evidence[0];
 if(summary?.venue!==venue||summary.market!==market||row?.htx_contract!==contract||row.asset_id!==`HTX:${contract}`||row.venue!==venue||row.market!==market||!sameIdentity(row.identity,identity)||!validate(row,now))return false;
 if(!Number.isSafeInteger(row.observed_ts)||!Number.isSafeInteger(row.first_known_ts)||row.source_ts>row.observed_ts||row.observed_ts>now||row.first_known_ts<row.observed_ts||row.first_known_ts>now||!Number.isSafeInteger(row.expires_at)||row.expires_at>Math.min(row.observed_ts+60000,row.source_ts+300000))return false;
 if(window_end_ts!==null&&(!Number.isSafeInteger(window_end_ts)||summary.window_end!==window_end_ts||summary.window_start!==window_end_ts-300000||row.source_ts<summary.window_start||row.source_ts>=window_end_ts))return false;
 return true;
}
