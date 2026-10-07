import {chooseNativeAccountDiscovery} from './swole-account-discovery.mjs';
export const OFFICIAL_TRADE_DISCOVERY_WEIGHT=70;
const symbolOK=s=>typeof s==='string'&&/^[\p{L}\p{N}_]{1,30}$/u.test(s);
const addressOK=a=>typeof a==='string'&&/^0x[0-9a-f]{40}$/i.test(a)&&!/^0x0{40}$/i.test(a);
const positive=v=>typeof v==='number'?Number.isFinite(v)&&v>0:typeof v==='string'&&v.length<=80&&/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(v)&&Number.isFinite(Number(v))&&Number(v)>0;
// A trade participant is only an address discovery hint. Buy/sell trade side
// does not identify an open position, leverage, direction or liquidation price.
export function parseOfficialTradeAccountDiscovery(trades,{symbol,receipt,now=Date.now()}={}){
 const no=reason=>({ok:false,reason,payload:null});
 if(!symbolOK(symbol)||!Number.isSafeInteger(now)||receipt?.http_status!==200||!Number.isSafeInteger(receipt?.received_ts)||receipt.received_ts>now||now-receipt.received_ts>300000||!/^[a-f0-9]{64}$/.test(receipt?.sha256||'')||!Array.isArray(trades)||trades.length>1000||Buffer.byteLength(JSON.stringify(trades))>2000000)return no('EXACT_FRESH_OFFICIAL_TRADE_DISCOVERY_REQUIRED');
 const accounts=new Map(),seen=new Set();let rejected=0;
 for(const t of trades){
  if(t?.coin!==symbol||!['B','A'].includes(t.side)||!Number.isSafeInteger(t.time)||t.time<=0||t.time>receipt.received_ts||receipt.received_ts-t.time>300000||!Number.isSafeInteger(t.tid)||t.tid<0||!positive(t.px)||!positive(t.sz)||!Number.isFinite(Number(t.px)*Number(t.sz))||!/^0x[0-9a-f]{64}$/i.test(t.hash||'')||!Array.isArray(t.users)||t.users.length!==2||t.users.some(a=>!addressOK(a))){rejected++;continue;}
  const id=t.time+':'+symbol+':'+t.tid;if(seen.has(id))continue;seen.add(id);
  for(const address of new Set(t.users.map(a=>a.toLowerCase()))){const row={address,ranking_notional:Number(t.px)*Number(t.sz),trade_time:t.time},old=accounts.get(address);if(!old||row.ranking_notional>old.ranking_notional||row.ranking_notional===old.ranking_notional&&row.trade_time>old.trade_time)accounts.set(address,row);}
 }
 return{ok:true,reason:null,payload:{coin:symbol,accounts:[...accounts.values()].sort((a,b)=>b.ranking_notional-a.ranking_notional||b.trade_time-a.trade_time||a.address.localeCompare(b.address)),returned_trades:trades.length,fresh_unique_trade_ids:seen.size,rejected_trades:rejected,source:'OFFICIAL_RECENT_TRADES',upstream:'HYPERLIQUID',native_reread_required:true,trade_side_is_not_position_side:true,whole_book_coverage_pct:null}};
}
export function selectOfficialTradeAccountSample(payload,{now=Date.now(),max_accounts=1,exclude_addresses=[]}={}){
 const policy='BOUNDED_ROTATING_RECENT_TRADE_PARTICIPANTS_FOR_CURRENT_NATIVE_REREAD';
 if(payload?.source!=='OFFICIAL_RECENT_TRADES'||!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(max_accounts)||max_accounts<1||max_accounts>8||!Array.isArray(payload.accounts))return{policy,selected:[],eligible_visible_accounts:0};
 const exclude=new Set(exclude_addresses.map(a=>String(a).toLowerCase())),pool=payload.accounts.filter(a=>addressOK(a?.address)&&!exclude.has(a.address.toLowerCase())).slice(0,8),offset=pool.length?Math.floor(now/2400000)%pool.length:0;
 const rotated=[...pool.slice(offset),...pool.slice(0,offset)];
 return{policy,selected:rotated.slice(0,max_accounts).map(a=>({address:a.address,trade_time:a.trade_time,discovery_reason:'OFFICIAL_RECENT_TRADE_PARTICIPANT_REQUIRES_NEW_NATIVE_STATE'})),eligible_visible_accounts:payload.accounts.length,partial_rotating_pool:pool.length};
}
// Short bounded rotation spreads discovery across available paths. All paths
// lead to the same native upstream and require a separately admitted state read.
export function chooseExpandedNativeAccountDiscovery(options={}){
 if(!options.official_trades_enabled)return chooseNativeAccountDiscovery(options);
 if(!symbolOK(options.symbol)||!Number.isSafeInteger(options.now)||options.now<0)return'HYPERLIQUID';
 const paths=['HYPERLIQUID'];
 if(options.swole_enabled&&/^[A-Z0-9]{1,20}$/.test(options.symbol))paths.push('SWOLE_DISCOVERY');
 if(options.now<Date.parse('2026-10-27T00:00:00Z')||String(options.liqflow_key||'').trim())paths.push('LIQFLOW');
 return paths[Math.floor(options.now/2400000)%paths.length];
}
