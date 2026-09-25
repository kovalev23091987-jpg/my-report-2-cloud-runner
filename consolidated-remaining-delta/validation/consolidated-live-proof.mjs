import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_CONSOLIDATED_RUNTIME_DIR||'runtime'),load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{buildProtectiveAssetFilter},{buildEvidenceDomainContract}]=await Promise.all([load('protective-asset-filter.mjs'),load('evidence-domain-contract.mjs')]);
async function main(){
 const url='https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=BTC-USDT&period=1day&size=40';
 let r017={status:'NOT_CLOSED',reason:'LIVE_FETCH_NOT_RUN'};
 try{
   const res=await fetch(url,{headers:{accept:'application/json'}});const j=await res.json();
   const rows=Array.isArray(j?.data)?j.data.map(x=>({ts:Number(x.id)*1000,close:Number(x.close)})):[];
   const p=buildProtectiveAssetFilter({daily_candles:rows,observed_ts:Date.now()});
   r017={...p,live_http_status:res.status,live_contract:'BTC-USDT',live_rows:rows.length};
 }catch(e){r017={status:'NOT_CLOSED',reason:'LIVE_FETCH_ERROR',error:String(e?.message||e)};}
 const d=buildEvidenceDomainContract({opportunity:{newest_event:{minute_decomposition:{},liquidity_sweep:{},market_flow:{},funding_at_event:{},relative_strength:{},post_event_current:{},candle:{}},price_oi_matrix:{},spot_perp_basis:{}},public_evidence:{evidence:[{status:'CLOSED',metric:'spot_flow_1h_delta_pct'},{status:'CLOSED',metric:'oi_change_1h'},{status:'CLOSED',metric:'funding_rate',history_coverage_pct:100,window:'FUNDING_HISTORY'},{status:'CLOSED',metric:'htx_spread_bps'},{status:'CLOSED',metric:'rs_vs_btc_1h'}]},liquidation_intelligence:{realized_status:'CLOSED'}});
 const out={version:'consolidated-live-proof-v1-20260925',status:r017.status==='CLOSED'&&d.status==='CLOSED'?'CLOSED':'PARTIAL',r017,r042:d,safety:{production_writes:false,d1_writes:false,telegram_send:false,trading:false,probability_enabled:false}};
 fs.writeFileSync(process.env.REPORT2_CONSOLIDATED_LIVE_OUTPUT||'consolidated-live-proof.json',JSON.stringify(out,null,2)+'\n');
 console.log('CONSOLIDATED_LIVE_PROOF',JSON.stringify({status:out.status,r017:r017.status,r017_change:r017.monthly_change_pct,r042:d.status}));
}
main().catch(e=>{console.error(e);process.exit(1);});
