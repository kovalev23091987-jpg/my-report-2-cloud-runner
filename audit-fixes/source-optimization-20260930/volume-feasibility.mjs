// Read-only public data feasibility. Never imported by the production runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function validateResearchCandles(p,{contract,start,end}){
 const rows=Array.isArray(p?.data)?p.data:[],ids=rows.map(r=>r?.id),window_matches=rows.length===(end-start+1)/60&&new Set(ids).size===rows.length&&ids.every(id=>Number.isInteger(id)&&id>=start&&id<=end&&id%60===0),schema_valid=rows.every(r=>['open','high','low','close','amount','vol','trade_turnover'].every(k=>typeof r[k]==='number'&&Number.isFinite(r[k]))&&r.low>0&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)&&r.amount>=0&&r.vol>=0&&r.trade_turnover>=0);
 return{status:p?.status==='ok'&&p?.ch===`market.${contract}.kline.1min`&&window_matches&&schema_valid?'COMPLETE_MINUTE_CANDLES_NOT_TRADE_PROFILE':'REQUESTED_DAY_OR_SCHEMA_NOT_CLOSED',channel:p?.ch,source_ts:p?.ts,rows:rows.length,first_id:ids[0]??null,last_id:ids.at(-1)??null,requested_start:start,requested_end:end,window_matches,schema_valid,minute_profile_would_be_approximate:true};
}
export async function probeVolumeFeasibility({db,load,fetch_impl,budget,run_id,output_dir,registry_path}){
 const {installEvidenceSourceStore,reserveEvidenceSourceAttempts}=await load('src/evidence-source-store.mjs');
 await installEvidenceSourceStore(db);const receipts=[];
 async function read(url,{source='HTX_LARGE_TRADES',cap=144,max_bytes=8*1024*1024,label}){
  const logical_request_id=`${run_id}:${label}`,grant=budget.reserve({logical_request_id,lane:'background',attempts:1});
  if(!grant.allowed){receipts.push({label,status:grant.status,actual_http:0});return null;}
  const admission=await reserveEvidenceSourceAttempts(db,{source,reservation_id:logical_request_id,attempts:1,daily_cap:cap});
  if(!admission.allowed){receipts.push({label,status:admission.status,actual_http:0});return null;}
  const receipt={label,url,source,actual_http:1,admission};receipts.push(receipt);
  try{
   const response=await fetch_impl(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});receipt.http_status=response.status;receipt.content_type=response.headers.get('content-type');
   if(!response.ok){receipt.status='HTTP_NOT_ADMITTED';receipt.retry_after=response.headers.get('retry-after');receipt.redirect_location=response.status>=300&&response.status<400?response.headers.get('location'):null;await response.body?.cancel();return null;}
   const parts=[];let bytes=0;for await(const part of response.body){bytes+=part.length;if(bytes>max_bytes)throw Error('BOUNDED_BODY_LIMIT');parts.push(part);}const body=Buffer.concat(parts);receipt.bytes=bytes;receipt.sha256=crypto.createHash('sha256').update(body).digest('hex');receipt.status='RECEIVED_NOT_ROLE_VALIDATED';return body;
  }catch(error){receipt.status='TRANSPORT_OR_BODY_NOT_CLOSED';receipt.error=String(error.message).slice(0,140);return null;}
 }
 // Current official data portal: https://futures.htx.com/vision/.
 // The legacy documented huobi.com host failed transport in run 36694180827.
 const date='2026-09-28',contract='SOL-USDT',stem=`${contract}-trades-${date}`,base=`https://futures.htx.com/data/trades/linear-swap/daily/${contract}/${stem}`;
 const archive=await read(base+'.zip',{label:'HTX_OFFICIAL_DAILY_TRADE_ARCHIVE'});let checksum=null;
 if(archive?.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))){fs.writeFileSync(path.join(output_dir,stem+'.zip'),archive);checksum=await read(base+'.CHECKSUM',{label:'HTX_OFFICIAL_DAILY_CHECKSUM',max_bytes:4096});}
 const checksumText=checksum?.toString('utf8')??'',expected=checksumText.match(/\b[a-f0-9]{64}\b/i)?.[0]?.toLowerCase(),archiveValid=!!archive&&!!expected&&crypto.createHash('sha256').update(archive).digest('hex')===expected;
 // HTX explicitly ignores from/to when size is present. Request the date only.
 const candles=await read(`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${contract}&period=1min&from=1790553600&to=1790639999`,{label:'HTX_SAME_UTC_DAY_MINUTE_CANDLES',max_bytes:2*1024*1024});
 let candle_summary=null;if(candles)try{const p=JSON.parse(candles);candle_summary=validateResearchCandles(p,{contract,start:1790553600,end:1790639999});fs.writeFileSync(path.join(output_dir,'volume-research-candles.json'),candles);}catch{}
 const {compileOfficialSourceRegistry}=await load('src/official-source-registry.mjs');const registry=compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(registry_path))).registry;
 const mint=registry.JUP?.contract_or_mint;let dex_summary=null;
 if(registry.JUP?.chain==='solana'&&mint){const raw=await read(`https://api.dexpaprika.com/networks/solana/tokens/${encodeURIComponent(mint)}`,{source:'DEXPAPRIKA_RESEARCH',cap:2,label:'DEXPAPRIKA_EXACT_JUP_FREE_PROBE',max_bytes:1024*1024});if(raw)try{const p=JSON.parse(raw);dex_summary={id:p.id,chain:p.chain,symbol:p.symbol,last_updated:p.last_updated,summary:p.summary??null,exact_identity:p.id===mint&&p.chain==='solana'&&p.symbol==='JUP',enabled_in_reports:false};}catch{}}
 return{status:'RESEARCH_ONLY_NO_PRODUCTION_ADMISSION',network_calls:receipts.reduce((n,r)=>n+r.actual_http,0),receipts,summary:{contract,date,archive_checksum_valid:archiveValid,archive_row_validation:'NOT_YET_PERFORMED',full_window_coverage_proven:false,incremental_trading_edge_proven:false,candle_summary,dex_summary,score_adjustment:0,entry_eligible:false,htx_execution_target_eligible:false},evidence:[],internal_only:true};
}
