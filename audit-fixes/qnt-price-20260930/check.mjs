// One bounded diagnostic of public prices: no credentials, retries, database,
// Telegram, orders, polling, or historical-data accumulation.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const requests=[
 ['htx_contract','https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code=QNT-USDT'],
 ['htx_index','https://api.hbdm.com/linear-swap-api/v1/swap_index?contract_code=QNT-USDT'],
 ['htx_last_trade','https://api.hbdm.com/linear-swap-ex/market/trade?contract_code=QNT-USDT'],
 ['htx_mark','https://api.hbdm.com/index/market/history/linear_swap_mark_price_kline?contract_code=QNT-USDT&period=1min&size=1'],
 ['okx_contract','https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=QNT-USDT-SWAP'],
 ['okx_last_trade','https://www.okx.com/api/v5/market/ticker?instId=QNT-USDT-SWAP'],
 ['okx_index','https://www.okx.com/api/v5/market/index-tickers?instId=QNT-USDT'],
 ['okx_spot','https://www.okx.com/api/v5/market/ticker?instId=QNT-USDT']
];
const started_at=Date.now();await fs.mkdir('qnt-price-output',{recursive:true});
const receipts=await Promise.all(requests.map(async([id,url])=>{
 const start=Date.now();try{const response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{accept:'application/json'}});const raw=await response.text(),received_ts=Date.now();if(raw.length>524288)return{id,url,http_status:response.status,error:'BODY_TOO_LARGE',received_ts};
 const sha256=createHash('sha256').update(raw).digest('hex');await fs.writeFile(`qnt-price-output/${id}.json`,raw);let payload;try{payload=JSON.parse(raw);}catch{return{id,url,http_status:response.status,sha256,error:'NON_JSON',received_ts};}
 return{id,url,http_status:response.status,received_ts,duration_ms:received_ts-start,sha256,payload};
 }catch(e){return{id,url,error:e.name,received_ts:Date.now()};}
}));
const by=Object.fromEntries(receipts.map(r=>[r.id,r]));
const summary={status:'READ_ONLY_EXACT_PRICE_DIAGNOSTIC',started_at,finished_at:Date.now(),http_calls:requests.length,maximum_http:8,production_writes:0,telegram_calls:0,orders:0,history_accumulated:false,
 htx_contract:by.htx_contract.payload?.data,
 htx_index:by.htx_index.payload,
 htx_last_trade:by.htx_last_trade.payload,
 htx_mark:by.htx_mark.payload,
 okx_contract:by.okx_contract.payload?.data,
 okx_last_trade:by.okx_last_trade.payload,
 okx_index:by.okx_index.payload,
 okx_spot:by.okx_spot.payload,
 receipts:receipts.map(({payload,...r})=>r)};
await fs.writeFile('qnt-price-output/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
