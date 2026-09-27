import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {collectVerifiedHL} from './src/native-verification.mjs';import {readJson} from './src/io.mjs';
const execution_id='native-'+Date.now();const dir=new URL('./runs/'+execution_id+'/',import.meta.url);fs.mkdirSync(dir,{recursive:true});let captureCount=0;
async function capturingFetch(url,init){
 const result=await fetch(url,init);const clone=result.clone();const bytes=Buffer.from(await clone.arrayBuffer());const name=String(++captureCount).padStart(2,'0');
 fs.writeFileSync(new URL(name+'.raw',dir),bytes);
 fs.writeFileSync(new URL(name+'.capture.json',dir),JSON.stringify({url:String(url),method:init?.method??'GET',request_body:init?.body?JSON.parse(init.body):null,http_status:result.status,received_ts:Date.now(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),authentication:'NONE'},null,2));
 return result;
}
if(!process.argv.includes('--live'))throw Error('EXPLICIT_LIVE_READ_ONLY_FLAG_REQUIRED');
const catalogResponse=await readJson('https://api.hyperliquid.xyz/info',{method:'POST',body:{type:'metaAndAssetCtxs'},fetch_impl:capturingFetch});
if(!catalogResponse.ok||!Array.isArray(catalogResponse.payload)||!Array.isArray(catalogResponse.payload[0]?.universe))throw Error('NATIVE_CATALOG_UNAVAILABLE');
const catalog=catalogResponse.payload[0].universe.filter(i=>i.isDelisted!==true).map(i=>i.name);
const runId='LIQ_FREE_NATIVE_READONLY_'+Date.now();
const result=await collectVerifiedHL({symbol:'FIL',catalog,run_id:runId,snapshot_id:runId+':FIL',max_accounts:8,remaining_requests:23,fetch_impl:capturingFetch});
fs.writeFileSync(new URL('result.json',dir),JSON.stringify({node:process.version,runId,native_catalog_received_ts:catalogResponse.receipt.received_ts,production_writes:false,telegram_send:false,trading:false,...result},null,2));
console.log(JSON.stringify({status:result.status,requests_including_catalog:result.requests+1,elapsed_ms:result.receipt?.collection_elapsed_ms,native_responses:result.receipt?.native_account_responses,source_ts:result.receipt?.source_ts,finite_levels:result.receipt?.zones.length,null_prices:result.receipt?.omitted_positions.length,model_prices_used:result.receipt?.model_prices_used,levels:result.receipt?.zones.map(z=>({side:z.liquidated_side,native_price:z.native_price,notional:z.notional,unit:z.notional_unit,conditional_cross:z.conditional_on_other_positions})),target_eligible:result.receipt?.execution_target_eligible,production_wired:false}));
