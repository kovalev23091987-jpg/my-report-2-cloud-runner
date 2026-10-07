import {fingerprint,timestamp} from './core.mjs';
import {selectVerifiedNativeAccounts} from './verified-native-account-cache.mjs';
export const NATIVE_WALLET_ROUTING_SOURCE='HYPERLIQUID_WALLET_ROUTING';
const SCHEMA='VERIFIED_NATIVE_WALLET_ROUTING_V1',TTL=7*86400000;
const address=v=>typeof v==='string'&&/^0x[a-f0-9]{40}$/.test(v);
const coin=v=>typeof v==='string'&&/^[\p{L}\p{N}_]{1,30}$/u.test(v);
function validRow(row,now){return row&&address(row.address)&&timestamp(row.verified_source_ts)!==null&&timestamp(row.verified_receipt_ts)!==null&&row.verified_source_ts<=row.verified_receipt_ts&&row.verified_receipt_ts<=now&&now-row.verified_source_ts<=TTL&&/^[a-f0-9]{64}$/.test(row.original_response_sha256||'')&&Array.isArray(row.coins)&&row.coins.length>0&&row.coins.length<=200&&row.coins.every(coin)&&new Set(row.coins).size===row.coins.length&&Object.keys(row).sort().join(',')==='address,coins,original_response_sha256,verified_receipt_ts,verified_source_ts';}
export function validateNativeWalletRouting(raw,{now=Date.now()}={}){
 if(!Number.isSafeInteger(now)||raw?.schema!==SCHEMA||raw?.scope!=='ADDRESS_DISCOVERY_HINT_ONLY_FRESH_NATIVE_REREAD_REQUIRED'||!Array.isArray(raw.accounts)||raw.accounts.length>32||new Set(raw.accounts.map(x=>x?.address)).size!==raw.accounts.length)return null;
 const {routing_fingerprint,...material}=raw;
 if(Object.keys(material).sort().join(',')!=='accounts,schema,scope'||routing_fingerprint!==fingerprint(material))return null;
 return {accounts:raw.accounts.filter(row=>validRow(row,now))};
}
export function selectNativeWalletRouting(raw,{symbol,now=Date.now(),max_accounts=3}={}){
 const closed=validateNativeWalletRouting(raw,{now});if(!closed||!coin(symbol)||!Number.isSafeInteger(max_accounts)||max_accounts<1||max_accounts>8)return[];
 return closed.accounts.filter(x=>x.coins.includes(symbol)).sort((a,b)=>b.verified_source_ts-a.verified_source_ts||b.coins.length-a.coins.length||a.address.localeCompare(b.address)).slice(0,max_accounts).map(x=>({address:x.address}));
}
export function buildNativeWalletRouting({previous=null,accounts=[],run_id,now=Date.now(),max_age_ms=120000}={}){
 if(!run_id||![120000,300000].includes(max_age_ms))return null;
 const rows=new Map((validateNativeWalletRouting(previous,{now})?.accounts||[]).map(x=>[x.address,structuredClone(x)]));let usefulNew=0;
 for(const account of accounts.slice(0,8)){
  const transport=account?.http_receipt??account?.receipt;
  if(transport?.http_status!==200||!/^[a-f0-9]{64}$/.test(transport.sha256||'')||!Array.isArray(account?.state?.assetPositions)||account.state.assetPositions.length>200)continue;
  const symbols=[...new Set(account.state.assetPositions.map(x=>x?.position?.coin).filter(coin))].filter(symbol=>selectVerifiedNativeAccounts([account],{symbol,run_id,now,max_age_ms,max_accounts:1}).length>0).sort();
  if(!symbols.length)continue;
  const row={address:account.address.toLowerCase(),coins:symbols,verified_source_ts:timestamp(account.state.time),verified_receipt_ts:timestamp(transport.received_ts),original_response_sha256:transport.sha256},old=rows.get(row.address);
  if(!old||row.verified_source_ts>=old.verified_source_ts){rows.set(row.address,row);usefulNew++;}
 }
 if(!usefulNew)return null;
 const material={schema:SCHEMA,scope:'ADDRESS_DISCOVERY_HINT_ONLY_FRESH_NATIVE_REREAD_REQUIRED',accounts:[...rows.values()].sort((a,b)=>b.verified_source_ts-a.verified_source_ts||b.coins.length-a.coins.length||a.address.localeCompare(b.address)).slice(0,32)};
 return {...material,routing_fingerprint:fingerprint(material)};
}
export async function saveNativeWalletRouting({db,previous,accounts,run_id,now=Date.now(),db_admit}={}){
 const routing=buildNativeWalletRouting({previous,accounts,run_id,now});if(!routing)return{status:'NO_NEW_VERIFIED_WALLET_HINT',routing:previous};
 if(typeof db_admit!=='function'||(await db_admit({rows_read:2,rows_written:1}))?.allowed!==true)return{status:'D1_WRITE_NOT_ADMITTED',routing:previous};
 const observed=Math.max(...routing.accounts.map(x=>x.verified_source_ts));
 const result=await db.prepare('INSERT INTO report2_liq_venue_catalog_cache(source,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4) ON CONFLICT(source) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json WHERE excluded.observed_ts>=report2_liq_venue_catalog_cache.observed_ts').bind(NATIVE_WALLET_ROUTING_SOURCE,observed,observed+TTL,JSON.stringify(routing)).run();
 if(result?.success!==true||!Number.isSafeInteger(result?.meta?.changes))return{status:'D1_WRITE_ACK_UNKNOWN',routing:previous};
 if(result.meta.changes!==1)return{status:'NEWER_ROUTING_ROW_RETAINED',routing:previous};
 return{status:'STRUCTURAL_WALLET_HINTS_SAVED',routing,accounts:routing.accounts.length,new_source_HTTP:0,future_levels_accepted:false};
}
