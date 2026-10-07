import {chooseExpandedNativeAccountDiscovery,parseOfficialTradeAccountDiscovery,selectOfficialTradeAccountSample,OFFICIAL_TRADE_DISCOVERY_WEIGHT} from '../current-generation/files/src/liquidation-extension/official-trade-account-discovery.mjs';
import {selectVerifiedNativeAccounts} from '../current-generation/files/src/liquidation-extension/verified-native-account-cache.mjs';
const freshAccount=(a,now)=>Number.isSafeInteger(a?.state?.time)&&Number.isSafeInteger(a?.receipt?.received_ts)&&a.state.time<=a.receipt.received_ts&&a.receipt.received_ts<=now&&now-a.state.time<=300000&&now-a.receipt.received_ts<=300000&&Array.isArray(a.state.assetPositions);
// One weekly invocation, exact original clocks, no persistent wallet cache.
// The caller owns the shared120 HTTP/D1 caps and existing source allowances.
export function createWeeklyNativeCoverageSession({run_id,source_admit,read_json,select_accounts,normalize_native,available_requests,on_request,clock=Date.now,liqflow_key='',read_swole=null,official_trades_enabled=false}={}){
 if(!run_id||[source_admit,read_json,select_accounts,normalize_native,available_requests,on_request,clock].some(x=>typeof x!=='function'))throw Error('WEEKLY_NATIVE_DEPENDENCIES_REQUIRED');
 const accounts=new Map();let catalog=null,catalogAttempted=false;
 const reserve=(contract,requests,suffix,extra_weights=null)=>source_admit({reservation_id:`LIQ_COVERAGE_NATIVE:${run_id}:${suffix}`,contract,run_id,requests,weights:extra_weights??(Object.hasOwn(requests,'HYPERLIQUID')?{HYPERLIQUID:suffix==='CATALOG'?22:2}:{}),max_requests:Object.values(requests).reduce((a,b)=>a+b,0),deadline_ts:clock()+45000});
 async function read(provider,url,options){on_request(provider);return read_json(url,options);}
 async function ensureCatalog(){
  if(catalogAttempted)return catalog;catalogAttempted=true;
  if(available_requests()<1)return null;
  const grant=await reserve('ALL_CRYPTO_FUTURES',{HYPERLIQUID:1},'CATALOG');
  if(grant?.allowed!==true||grant?.new_reservation!==true)return{ok:false,reason:`CATALOG_QUOTA:${grant?.reason||'NOT_GRANTED'}`};
  catalog=await read('HYPERLIQUID','https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'metaAndAssetCtxs'},timeout_ms:12000,max_bytes:8000000});return catalog;
 }
 async function collect({contract,symbol,mark_price=null,allow_discovery=true}={}){
  if(contract!==symbol+'-USDT')throw Error('EXACT_NATIVE_MARKET_REQUIRED');
  const now=clock(),cached=selectVerifiedNativeAccounts([...accounts.values()],{run_id,symbol,now,max_age_ms:300000,max_accounts:8});
  let sample=cached,transport=[],reason=null;
  if(!sample.length){
   if(!allow_discovery)return{status:'SAME_RUN_CACHE_MISS',receipt:null,network_calls:0,reused_accounts:0};
   if(official_trades_enabled&&(!catalog?.ok||!catalog.payload?.[0]?.universe?.some(r=>r?.name===symbol&&r?.isDelisted!==true)))return{status:catalog?.ok?'EXACT_SOURCE_MARKET_UNSUPPORTED':'QUOTA_DEFERRED',reason:'CURRENT_OFFICIAL_CATALOG_REQUIRED',receipt:null,network_calls:0,reused_accounts:0};
   let discoveryProvider=chooseExpandedNativeAccountDiscovery({now,liqflow_key,swole_enabled:typeof read_swole==='function',symbol,official_trades_enabled});
   if(available_requests()<2)return{status:'QUOTA_DEFERRED',reason:'WEEKLY_HTTP_ENVELOPE',receipt:null,network_calls:0,reused_accounts:0};
   let grant=await reserve(contract,discoveryProvider==='HYPERLIQUID'?{HYPERLIQUID:2}:{[discoveryProvider]:1,HYPERLIQUID:1},contract+':'+discoveryProvider,discoveryProvider==='HYPERLIQUID'?{HYPERLIQUID:OFFICIAL_TRADE_DISCOVERY_WEIGHT+2}:null);
   if(discoveryProvider==='SWOLE_DISCOVERY'&&grant?.reservation_not_created===true&&grant?.reason==='FREE_QUOTA_EXHAUSTED'&&(now<Date.parse('2026-10-27T00:00:00Z')||liqflow_key)){discoveryProvider='LIQFLOW';grant=await reserve(contract,{LIQFLOW:1,HYPERLIQUID:1},contract+':LIQFLOW');}
   if(grant?.allowed!==true||grant?.new_reservation!==true)return{status:'QUOTA_DEFERRED',reason:grant?.reason||'NOT_GRANTED',receipt:null,network_calls:0,reused_accounts:0};
   let list;if(discoveryProvider==='HYPERLIQUID'){const raw=await read('HYPERLIQUID','https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'recentTrades',coin:symbol},timeout_ms:12000,max_bytes:2000000});list=raw.ok?{...parseOfficialTradeAccountDiscovery(raw.payload,{symbol,receipt:raw.receipt,now:clock()}),receipt:raw.receipt}:raw;}else if(discoveryProvider==='SWOLE_DISCOVERY'){on_request(discoveryProvider);list=await read_swole(symbol,{clock,timeout_ms:12000});}else list=await read('LIQFLOW',`https://node.liqflow.app/api/coin/${encodeURIComponent(symbol)}/positions`,{...(liqflow_key?{headers:{'X-API-Key':liqflow_key}}:{}),timeout_ms:12000,max_bytes:2000000});transport.push(list.receipt);
   const selected=discoveryProvider==='HYPERLIQUID'?selectOfficialTradeAccountSample(list.ok?list.payload:null,{now:clock(),max_accounts:1,exclude_addresses:[...accounts.keys()]}).selected:list.ok&&list.payload?.coin===symbol&&Array.isArray(list.payload.positions)?select_accounts(list.payload.positions,{mark_price,max_accounts:1}).selected:[];
   if(!selected.length)return{status:list.ok?'NO_REAL_NUMERIC_LEVELS':'QUOTA_DEFERRED',reason:list.reason||'NO_DISCOVERED_ACCOUNT',receipt:null,network_calls:transport.length,reused_accounts:0,transport};
   const state=await read('HYPERLIQUID','https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'clearinghouseState',user:selected[0].address},timeout_ms:12000,max_bytes:2000000});transport.push(state.receipt);
   if(!state.ok)return{status:'QUOTA_DEFERRED',reason:state.reason||'STATE_READ_NOT_CLOSED',receipt:null,network_calls:transport.length,reused_accounts:0,transport};
   const account={address:selected[0].address,state:state.payload,receipt:state.receipt};sample=[account];
   if(freshAccount(account,clock())&&accounts.size<120)accounts.set(account.address.toLowerCase(),structuredClone(account));
  }
  const observed=clock(),receipt=normalize_native({accounts:sample.map(a=>({address:a.address,state:a.state,received_at_ms:a.receipt.received_ts})),selection_bias:cached.length?'BOUNDED_ORIGINAL_SAME_RUN_NATIVE_ACCOUNTS_WITH_VERIFIED_LEVELS':'ONE_ACCOUNT_WEEKLY_CAPABILITY_SAMPLE_NOT_WHOLE_BOOK' },
   {symbol,route_symbol:symbol,run_id,snapshot_id:`COVERAGE:${contract}:${observed}`,as_of_ms:observed,received_at_ms:Math.max(...sample.map(a=>a.receipt.received_ts)),max_age_ms:300000});
  return{status:receipt.usable_for_context?'NATIVE_SAMPLE_NORMALIZED':'NO_REAL_NUMERIC_LEVELS',reason:receipt.usable_for_context?null:receipt.status,receipt,network_calls:transport.length,reused_accounts:cached.length,original_transport_sha256:sample.map(a=>a.receipt.sha256),transport};
 }
 return{ensureCatalog,collect};
}
