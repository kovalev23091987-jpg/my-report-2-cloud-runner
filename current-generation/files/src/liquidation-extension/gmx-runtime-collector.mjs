import {readJson} from './io.mjs';
import {normalizeGmx} from './round2-providers.mjs';
import {createScopedProviderAcquisition} from './scoped-provider-runtime-bridge.mjs';
const address=v=>/^0x[0-9a-f]{40}$/i.test(String(v||''));
const decimal30=v=>{try{return Number(BigInt(String(v)))/1e30;}catch{return 0;}};
export function createGmxRuntimeCollector({fetch_impl=globalThis.fetch,clock=Date.now,max_wall_ms=30000}={}){return async function collect({contract,native_symbol,run_id,acquisition_id,market_address,deadline_ts}={}){
 const market=String(market_address||'').toLowerCase(),start=clock(),deadline=Math.min(Number(deadline_ts)||start+max_wall_ms,start+max_wall_ms);if(!address(market))return{status:'GMX_EXACT_MARKET_REQUIRED',requests:0};
 const read=(url,options={})=>readJson(url,{fetch_impl,clock,timeout_ms:Math.max(1,Math.min(10000,deadline-clock())),max_bytes:6000000,...options});
 // Subsquid stores checksum-cased addresses while the official GMX catalog is
 // normalized to lowercase. A full-address case-insensitive match preserves
 // exact identity without silently turning a live market into an empty one.
 const query='query RepresentativeGmxPositions($market:String!){positions(where:{market_containsInsensitive:$market,sizeInUsd_gt:"0",isSnapshot_eq:false},limit:50,orderBy:sizeInUsd_DESC){id positionKey account market isLong sizeInUsd} squidStatus{height finalizedHeight}}';
 const discovery=await read('https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql',{method:'POST',body:{query,variables:{market}}});
 const rows=discovery.payload?.data?.positions;if(!discovery.ok||!Array.isArray(rows))return{status:'GMX_DISCOVERY_NOT_CLOSED',requests:1,discovery_http_status:discovery.receipt?.http_status??null,discovery_reason:discovery.reason||null};
 const picked=[];for(const isLong of [true,false]){const row=rows.filter(x=>x?.isLong===isLong&&address(x?.account)&&String(x?.market).toLowerCase()===market).sort((a,b)=>decimal30(b.sizeInUsd)-decimal30(a.sizeInUsd))[0];if(row)picked.push(row);}
 for(const row of rows)if(picked.length<3&&address(row?.account)&&String(row?.market).toLowerCase()===market&&!picked.some(x=>String(x.account).toLowerCase()===String(row.account).toLowerCase()))picked.push(row);
 const accountReads=await Promise.all(picked.slice(0,3).map(x=>read(`https://arbitrum.gmxapi.io/v1/positions?address=${encodeURIComponent(x.account)}`)));const completed=clock(),normalized=[];
 for(let i=0;i<accountReads.length;i++)if(accountReads[i].ok)normalized.push(normalizeGmx({payload:accountReads[i].payload,receipt:accountReads[i].receipt,account:picked[i].account,chain:'arbitrum'},{symbol:native_symbol,route_symbol:native_symbol,run_id,snapshot_id:acquisition_id,as_of_ms:completed,received_at_ms:completed,max_age_ms:300000}));
 const usable=normalized.filter(x=>x.usable_for_context===true);if(!usable.length)return{status:'GMX_NATIVE_SAMPLE_NOT_CLOSED',requests:1+accountReads.length,discovery_positions:rows.length,selected_accounts:picked.length,account_http_closed:accountReads.filter(x=>x.ok).length,normalization_statuses:normalized.map(x=>x?.status||'UNKNOWN').slice(0,3)};
 return{status:'GMX_ACQUIRED_SCOPED_CONTEXT',requests:1+accountReads.length,acquisition:createScopedProviderAcquisition({contract,native_symbol,run_id,acquisition_id,provider:'GMX public API',venue:'GMX-arbitrum',price_quote:'USD',collection_started_ts:start,collection_completed_ts:completed,normalized_receipts:usable,transport_receipts:[discovery.receipt,...accountReads.map(x=>x.receipt)]})};
};}
