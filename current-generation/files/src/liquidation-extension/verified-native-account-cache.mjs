import {normalizeNativeHL} from './providers.mjs';
import {timestamp} from './core.mjs';
// A nonzero position is not enough: a cache hit must already supply a fresh,
// correctly sided native liquidation price with its ORIGINAL transport clock.
// Reject one unusable account independently, without hiding other valid ones.
export function selectVerifiedNativeAccounts(accounts,{run_id,symbol,now,max_age_ms=120000,max_accounts=8}={}){
 if(!run_id||!symbol||!Number.isSafeInteger(now)||!Number.isSafeInteger(max_accounts)||max_accounts<1||max_accounts>8)return[];
 const seen=new Set(),valid=[];
 for(const account of accounts||[]){
  const address=account?.address?.toLowerCase?.(),transport=account?.http_receipt??account?.receipt;
  if(!/^0x[a-f0-9]{40}$/.test(address||'')||seen.has(address))continue;
  const received=timestamp(transport?.received_ts),source=timestamp(account?.state?.time);
  if(received===null||source===null||source>received||received>now||now-received>max_age_ms||now-source>max_age_ms)continue;
  const receipt=normalizeNativeHL({accounts:[{address,state:account.state}]},{symbol,route_symbol:symbol,run_id,snapshot_id:'ORIGINAL_ACCOUNT_CACHE:'+symbol,as_of_ms:now,received_at_ms:received,max_age_ms});
  if(receipt.usable_for_context!==true||!receipt.zones.some(z=>z.notional>0&&((z.liquidated_side==='LONG'&&z.distance_pct<0)||(z.liquidated_side==='SHORT'&&z.distance_pct>0))))continue;
  seen.add(address);valid.push(account);
 }
 return valid.sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase())).slice(0,max_accounts);
}
