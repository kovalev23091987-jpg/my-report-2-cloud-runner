export const VENUE_CATALOG_CACHE_VERSION='liquidation-venue-catalog-cache-v1-20260927';
const TTL=24*60*60*1000;
const exactBase=v=>{const s=String(v??'').trim().toUpperCase();return /^[A-Z0-9]+$/.test(s)?s:null;};
async function json(fetch_impl,url){try{const r=await fetch_impl(url,{headers:{accept:'application/json','user-agent':'My-Report-2/venue-catalog-v1'}});return{ok:r.ok,payload:r.ok?await r.json():null,status:r.status};}catch{return{ok:false,payload:null,status:null};}}
function lighterMap(payload){const out={};if(payload?.code!==200||!Array.isArray(payload.order_books))return out;for(const row of payload.order_books){const base=exactBase(row?.symbol);if(!base||row?.market_type!=='perp'||row?.status!=='active'||!Number.isSafeInteger(row?.market_id)||row.market_id<0)continue;out[base]={lighter_market_id:row.market_id};}return out;}
function gmxMap(payload){const out={};if(!Array.isArray(payload))return out;for(const row of payload){const match=String(row?.name??'').trim().toUpperCase().match(/^([A-Z0-9]+)\/USD(?:\b|\s|$)/),address=String(row?.market_token??'').trim().toLowerCase();if(!match||!/^0x[0-9a-f]{40}$/.test(address))continue;out[match[1]]={gmx_market_address:address};}return out;}
export async function loadLiquidationVenueCatalog({db,fetch_impl=globalThis.fetch,now=Date.now()}={}){
 if(!db?.prepare)throw Error('VENUE_CATALOG_DB_REQUIRED');
 await db.prepare(`CREATE TABLE IF NOT EXISTS report2_liq_venue_catalog_cache (source TEXT PRIMARY KEY,observed_ts INTEGER NOT NULL,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL)`).run();
 const cached=await db.prepare(`SELECT source,observed_ts,expires_ts,payload_json FROM report2_liq_venue_catalog_cache WHERE expires_ts>=?1`).bind(now).all(),maps={},receipts=[];
 for(const row of cached?.results||[]){try{maps[row.source]=JSON.parse(row.payload_json);receipts.push({source:row.source,status:'CACHE_HIT',observed_ts:row.observed_ts});}catch{}}
 const jobs=[];if(!maps.LIGHTER)jobs.push(['LIGHTER','https://mainnet.zklighter.elliot.ai/api/v1/orderBooks',lighterMap]);if(!maps.GMX)jobs.push(['GMX','https://arbitrum.gmxapi.io/v1/risk-oracle/markets',gmxMap]);
 for(const [source,url,normalize] of jobs){const raw=await json(fetch_impl,url),map=raw.ok?normalize(raw.payload):{};if(raw.ok&&Object.keys(map).length){maps[source]=map;await db.prepare(`INSERT INTO report2_liq_venue_catalog_cache(source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json`).bind(source,now,now+TTL,JSON.stringify(map)).run();receipts.push({source,status:'REFRESHED',observed_ts:now,count:Object.keys(map).length});}else receipts.push({source,status:'SOURCE_NOT_CLOSED',http_status:raw.status});}
 const entries={};for(const map of Object.values(maps))for(const [base,ids] of Object.entries(map))entries[base]={...(entries[base]||{}),...ids};
 return {version:VENUE_CATALOG_CACHE_VERSION,status:Object.keys(entries).length?'CLOSED':'NOT_CLOSED',observed_ts:now,expires_in_ms:TTL,network_calls:jobs.length,entries,receipts,exact_provider_catalogs_only:true,guessed_aliases:false,internal_only:true};
}
export default{loadLiquidationVenueCatalog};
