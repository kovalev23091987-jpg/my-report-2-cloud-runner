import {resolveGTradeCryptoMarket} from './gtrade.mjs';
import {timestamp,fingerprint} from './core.mjs';
const WEEK=7*86400000;
// Structural routing hints contain no quotes or positions. Every selected
// route must still acquire its own fresh catalog, prices and position clock.
export function buildGTradeRoutingCatalog(raw,{now=Date.now()}={}){
 const source_ts=timestamp(raw?.payload?.lastRefreshed),received_ts=raw?.receipt?.received_ts;
 if(raw?.ok!==true||raw.receipt?.http_status!==200||!Number.isSafeInteger(source_ts)||!Number.isSafeInteger(received_ts)||source_ts>received_ts||received_ts>now||now-source_ts>300000||!/^[a-f0-9]{64}$/.test(raw.receipt.sha256??'')||!Array.isArray(raw.payload?.pairs))return null;
 const symbols=[...new Set(raw.payload.pairs.map(p=>p?.from).filter(x=>typeof x==='string'))];
 const markets=symbols.map(symbol=>({symbol,market:resolveGTradeCryptoMarket(raw.payload,symbol)})).filter(x=>x.market.supported).map(x=>({contract:x.symbol+'-USDT',pair_index:x.market.pair_index}));
 if(!markets.length)return null;
 const body={schema:'GTRADE_STRUCTURAL_ROUTING_CATALOG_V1',source_ts,received_ts,expires_ts:received_ts+WEEK,transport_sha256:raw.receipt.sha256,markets,contains_quotes_or_positions:false,usable_as_liquidation_levels:false};
 return{...body,fingerprint:fingerprint(body)};
}
export function verifiedNativeRotation({catalog,contracts=[],now=Date.now()}={}){
 const no={eligible:false,preferred:null,reason:'NO_EXACT_TWO_MARKET_ROUTING_HINT'};
 if(!catalog||catalog.schema!=='GTRADE_STRUCTURAL_ROUTING_CATALOG_V1'||catalog.contains_quotes_or_positions!==false||catalog.usable_as_liquidation_levels!==false)return no;
 const {fingerprint:hash,...body}=catalog;
 if(hash!==fingerprint(body)||!Number.isSafeInteger(catalog.source_ts)||!Number.isSafeInteger(catalog.received_ts)||catalog.source_ts>catalog.received_ts||catalog.received_ts>now||catalog.expires_ts!==catalog.received_ts+WEEK||now>catalog.expires_ts||!Array.isArray(catalog.markets)||contracts.length!==2||new Set(contracts).size!==2)return no;
 if(contracts.some(code=>typeof code!=='string'||!/^([^\s-]+)-USDT$/u.test(code)||catalog.markets.filter(x=>x.contract===code&&Number.isSafeInteger(x.pair_index)&&x.pair_index>=0).length!==1))return no;
 const preferred=Math.floor(now/2400000)%2===0?'GTRADE_NATIVE':'HYPERLIQUID_NATIVE';
 return{eligible:true,preferred,reason:'ALTERNATING_40_MINUTE_WINDOWS_FOR_TWO_KNOWN_CRYPTO_MARKETS',routing_hint_source_ts:catalog.source_ts,routing_hint_transport_sha256:catalog.transport_sha256,fresh_market_and_position_revalidation_required:true};
}
export async function saveGTradeRoutingCatalog({db,raw,now=Date.now(),db_admit}={}){
 const catalog=buildGTradeRoutingCatalog(raw,{now});
 if(!catalog)return{saved:false,reason:'CATALOG_NOT_CLOSED'};
 if(typeof db_admit!=='function'||db_admit({rows_read:0,rows_written:1})?.allowed!==true)return{saved:false,reason:'D1_BUDGET_NOT_GRANTED'};
 await db.prepare(`INSERT INTO report2_liq_venue_catalog_cache(source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind('GTRADE_ROUTING',catalog.received_ts,catalog.expires_ts,JSON.stringify(catalog)).run();
 return{saved:true,catalog};
}
