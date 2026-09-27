import {readJson} from './io.mjs';
import {normalizeLighter} from './round2-providers.mjs';
import {createScopedProviderAcquisition} from './scoped-provider-runtime-bridge.mjs';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export function createLighterRuntimeCollector({fetch_impl=globalThis.fetch,clock=Date.now,max_wall_ms=30000}={}){return async function collect({contract,native_symbol,run_id,acquisition_id,market_id,deadline_ts}={}){
 const start=clock(),deadline=Math.min(Number(deadline_ts)||start+max_wall_ms,start+max_wall_ms);if(!Number.isSafeInteger(market_id)||market_id<0)return{status:'LIGHTER_EXACT_MARKET_REQUIRED',requests:0};
 const get=url=>readJson(url,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,deadline-clock())),max_bytes:4000000});
 const trades=await get(`https://mainnet.zklighter.elliot.ai/api/v1/recentTrades?market_id=${market_id}&limit=50`);if(!trades.ok||trades.payload?.code!==200||!Array.isArray(trades.payload.trades))return{status:'LIGHTER_DISCOVERY_NOT_CLOSED',requests:1};
 const candidates=[];for(const t of trades.payload.trades){if(t.market_id!==market_id)continue;const makerAsk=t.is_maker_ask===true;for(const row of [{id:t.ask_account_id,pos:makerAsk?t.maker_position_size_before:t.taker_position_size_before},{id:t.bid_account_id,pos:makerAsk?t.taker_position_size_before:t.maker_position_size_before}]){const p=finite(row.pos);if(Number.isSafeInteger(row.id)&&p!==null&&p!==0)candidates.push({id:row.id,side:p>0?'LONG':'SHORT',size:Math.abs(p)});}}
 const unique=[];for(const s of ['LONG','SHORT']){const list=candidates.filter(x=>x.side===s).sort((a,b)=>b.size-a.size);for(const x of list)if(!unique.some(y=>y.id===x.id)){unique.push(x);break;}}
 for(const x of candidates.sort((a,b)=>b.size-a.size))if(unique.length<3&&!unique.some(y=>y.id===x.id))unique.push(x);
 const accountReads=await Promise.all(unique.slice(0,3).map(x=>get(`https://mainnet.zklighter.elliot.ai/api/v1/account?by=index&value=${x.id}&active_only=true`)));const completed=clock(),normalized=[];
 for(let i=0;i<accountReads.length;i++)if(accountReads[i].ok)normalized.push(normalizeLighter({payload:accountReads[i].payload,receipt:accountReads[i].receipt,account_index:String(unique[i].id),market_id},{symbol:native_symbol,route_symbol:native_symbol,run_id,snapshot_id:acquisition_id,as_of_ms:completed,received_at_ms:completed,max_age_ms:300000}));
 const usable=normalized.filter(x=>x.usable_for_context===true);if(!usable.length)return{status:'LIGHTER_NATIVE_SAMPLE_NOT_CLOSED',requests:1+accountReads.length};
 return{status:'LIGHTER_ACQUIRED_SCOPED_CONTEXT',requests:1+accountReads.length,acquisition:createScopedProviderAcquisition({contract,native_symbol,run_id,acquisition_id,provider:'Lighter official',venue:'Lighter',price_quote:'USDC',collection_started_ts:start,collection_completed_ts:completed,normalized_receipts:usable,transport_receipts:[trades.receipt,...accountReads.map(x=>x.receipt)]})};
};}
