import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {readReadyHtxVolumeProfile,observeHtxVolumeSnapshot} from './htx-volume-profile.mjs';
import {parseHtxTradePayload} from './htx-trade-json.mjs';
export async function collectReadyHtxVolumeProfile({contract,run_id,request_admit,fetch_impl=globalThis.fetch,clock=Date.now}={}){
 const ready=readReadyHtxVolumeProfile({contract,now:clock()});if(ready.status==='CLOSED')return {...ready,network_calls:0};
 if(!isExactHtxUsdtSwapKey(contract||''))return {...ready,network_calls:0};
 const admission=request_admit?.({logical_request_id:`VOLUME_PROFILE:${run_id}:${contract}`,lane:'background',attempts:3});
 if(!admission?.allowed||admission.duplicate)return {...ready,reason:admission?.status||'ADMISSION_REQUIRED',network_calls:0};
 const suffix=`contract_code=${encodeURIComponent(contract)}`;
 const paths=[`/linear-swap-api/v1/swap_contract_info?${suffix}`,`/linear-swap-ex/market/history/kline?${suffix}&period=1min&size=241`,`/linear-swap-ex/market/history/trade?${suffix}&size=2000`];
 const receipts=await Promise.all(paths.map(async path=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000),url='https://api.hbdm.com'+path;try{const r=await fetch_impl(url,{headers:{accept:'application/json'},signal:controller.signal,redirect:'error'});if(!r.ok)return {http_status:r.status,status:r.status===429?'TEMPORARY_RATE_LIMIT':'SOURCE_UNAVAILABLE'};const raw=await r.text();if(raw.length>8*1024*1024)return {status:'BODY_LIMIT'};const p=path.includes('/history/trade?')?parseHtxTradePayload(raw):JSON.parse(raw);observeHtxVolumeSnapshot(p,url,clock());return {http_status:r.status,status:p.status};}catch{return {status:'TRANSPORT_UNAVAILABLE'};}finally{clearTimeout(timer);}}));
 return {...readReadyHtxVolumeProfile({contract,now:clock()}),network_calls:3,receipts,admission};
}
