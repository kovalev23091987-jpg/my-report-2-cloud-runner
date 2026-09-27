import fs from 'node:fs';import {createHash} from 'node:crypto';
import {createRunnerLiquidationExtension} from './src/runner-extension.mjs';import {bindNativeAcquisition} from './src/runtime-bridge.mjs';
if(!process.argv.includes('--live-read-only'))throw Error('EXPLICIT_READ_ONLY_RESEARCH_REQUIRED');
const stamp=new Date().toISOString().replaceAll(/[-:.]/g,'');const dir=new URL('./runs/near-large-'+stamp+'/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
let captured=0,reserved=0;const ids=new Set();
async function researchFetch(url,init){
 const u=new URL(String(url));if(!['api.hyperliquid.xyz','node.liqflow.app'].includes(u.hostname))throw Error('UNAPPROVED_RESEARCH_ENDPOINT');
 const response=await fetch(url,init),bytes=Buffer.from(await response.clone().arrayBuffer());if(bytes.length>2000000)throw Error('RESEARCH_RESPONSE_TOO_LARGE');
 const id=String(++captured).padStart(2,'0');fs.writeFileSync(new URL(id+'.raw',dir),bytes);fs.writeFileSync(new URL(id+'.receipt.json',dir),JSON.stringify({url:String(url),method:init?.method??'GET',request_body:init?.body?JSON.parse(init.body):null,http_status:response.status,received_ts:Date.now(),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,authentication:'NONE',production_request:false},null,2));return response;
}
const admit=async r=>{
 if(ids.has(r.reservation_id)||reserved+r.max_requests>12)return{allowed:false,new_reservation:false};ids.add(r.reservation_id);reserved+=r.max_requests;
 return{allowed:true,new_reservation:true,reservation_id:r.reservation_id,scope:'ONE_OFF_RESEARCH_LOCAL_CAP_NOT_D1_PROOF'};
};
const extension=createRunnerLiquidationExtension({mode:'SHADOW_ONLY',admit,fetch_impl:researchFetch,accounts_per_deep:4,max_http_per_run:12,max_total_ms:45000});
const run='LIVE_RESEARCH_NEAR_LARGE_'+Date.now(),results=[];
for(const symbol of ['FIL','XPL']){
 const start=Date.now(),contract=symbol+'-USDT',acq=await extension.collect({contract,native_symbol:symbol,run_id:run,deep_started_ts:start,max_deep_ms:22000});
 const view=acq?bindNativeAcquisition(acq,{contract,run_id:run,snapshot_id:run+':'+symbol,observed_ts:Date.now(),direction:null}):null;
 if(acq)fs.writeFileSync(new URL(symbol+'.acquisition.json',dir),JSON.stringify(acq,null,2));if(view)fs.writeFileSync(new URL(symbol+'.view.json',dir),JSON.stringify(view,null,2));
 results.push({symbol,status:view?.status??'NO_CLOSED_VIEW',reason:view?.reason??null,sampling_policy:acq?.provenance?.sampling_policy??null,accounts:view?.sample_accounts??0,source_ts:view?.source_ts??null,positive_levels:view?.returned_positive_levels??0,unknown_prices:view?.missing_native_liquidation_prices??null,selected_levels:[...(view?.above??[]),...(view?.below??[])].map(z=>({side:z.side,price:z.native_price,distance_pct:z.distance_pct,notional:z.notional,unit:z.notional_unit,conditional_cross:z.conditional_cross})),hypothetical_levels_used:false,entry_eligible:false,whole_market_coverage_proven:false});
}
const proof={created_utc:new Date().toISOString(),node:process.version,results,reserved_requests:reserved,actual_requests:captured,collector:extension.summary(),scope:'CURRENT_PUBLIC_HTTP_RESEARCH_NOT_PRODUCTION_RUN',source_prices_not_trade_targets:true,production_D1_changed:false,telegram_sent:false,production_enabled:false};
fs.writeFileSync(new URL('proof.json',dir),JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,proof_path:new URL('proof.json',dir).pathname}));
