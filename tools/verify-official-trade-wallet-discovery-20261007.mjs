import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../current-generation/files/src/liquidation-extension/d1-source-admission.mjs';
import {LIQUIDATION_ALLOWANCE_GENERATION} from '../current-generation/files/src/liquidation-extension/install-source-allowances.mjs';
const load=f=>import(pathToFileURL(path.resolve('runtime/src/liquidation-extension/'+f))),{readJson}=await load('io.mjs'),{normalizeNativeHL}=await load('providers.mjs'),{buildNativeWalletRouting}=await load('native-wallet-routing.mjs');
const started=Date.now(),run_id=`OFFICIAL_TRADE_DISCOVERY:${process.env.GITHUB_RUN_ID}:${started}`,symbol='PENGU',db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),reservation={rows_read:1250,rows_written:100},raw=[];
const proof={schema:'OFFICIAL_TRADE_WALLET_DISCOVERY_RESEARCH_20261007_V1',head:process.env.GITHUB_SHA,run_id,symbol,started_ts:started,source_cap:3,sourceHTTP:0,MAIN:0,Telegram:0,decisions_enabled:false,rows:[],reason:'Actual last natural PENGU future-level gap; verify native trade-participant address discovery and up to2 current native states; no inference of position side from trade side'};
fs.mkdirSync('audit-output',{recursive:true});
try{
 const day=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});proof.day_admission=day;
 if(!day.allowed)proof.status='D1_ADMISSION_BLOCKED';else{
  await reserveRunBudget(db,{reservationId:run_id,now:started,reservation});
  try{
   const scope_id=`${LIQUIDATION_ALLOWANCE_GENERATION}:${new Date(started).toISOString().slice(0,7).replace('-','')}:HYPERLIQUID`,cfg=await db.prepare('SELECT * FROM report2_liq_source_allowance_shadow WHERE scope_id=?1 LIMIT 1').bind(scope_id).first();
   if(cfg?.active!==1||cfg.allowance_units>10000)throw Error('EXISTING_REVIEWED_NATIVE_ALLOWANCE_REQUIRED');
   const admit=createD1SourceAdmission({db,scope_bindings:{HYPERLIQUID:{scope_id,config_fingerprint:cfg.config_fingerprint}},within_run_budget:e=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+e.extraRowsRead+4<=reservation.rows_read&&u.rows_written+e.extraRowsWritten+4<=reservation.rows_written};}});
   const grant=await admit({reservation_id:run_id,contract:symbol+'-USDT',run_id,requests:{HYPERLIQUID:3},weights:{HYPERLIQUID:74},max_requests:3,deadline_ts:started+45000});proof.provider_admission=grant;
   if(grant.allowed!==true||grant.new_reservation!==true)throw Error('DURABLE_PROVIDER_ADMISSION_BLOCKED');
   const read=async body=>readJson('https://api.hyperliquid.xyz/info',{method:'POST',body,timeout_ms:10000,max_bytes:2000000,fetch_impl:async(...args)=>{if(proof.sourceHTTP>=3)throw Error('RESEARCH_HTTP_CAP');proof.sourceHTTP++;return fetch(...args);}});
   const list=await read({type:'recentTrades',coin:symbol});raw.push({provider:'OFFICIAL_RECENT_TRADES',...list});proof.discovery_receipt=list.receipt;
   if(!list.ok||!Array.isArray(list.payload)||!list.payload.length||list.payload.length>1000)throw Error('OFFICIAL_TRADE_DISCOVERY_SCHEMA_NOT_CLOSED');
   const accounts=new Map(),seen=new Set();
   for(const t of list.payload){
    if(t.coin!==symbol||!['B','A'].includes(t.side)||!Number.isSafeInteger(t.time)||t.time>list.receipt.received_ts||list.receipt.received_ts-t.time>300000||!Number.isSafeInteger(t.tid)||!(Number(t.px)>0)||!(Number(t.sz)>0)||!Array.isArray(t.users)||t.users.length!==2||t.users.some(a=>typeof a!=='string'||!/^0x[0-9a-f]{40}$/i.test(a)))continue;
    const id=t.time+':'+symbol+':'+t.tid;if(seen.has(id))continue;seen.add(id);
    for(const address of t.users.map(a=>a.toLowerCase()).filter(a=>a!=='0x'+'0'.repeat(40))){const row={address,notional:Number(t.px)*Number(t.sz),time:t.time},previous=accounts.get(address);if(!previous||row.notional>previous.notional||row.notional===previous.notional&&row.time>previous.time)accounts.set(address,row);}
   }
   const selected=[...accounts.values()].sort((a,b)=>b.notional-a.notional||b.time-a.time||a.address.localeCompare(b.address)).slice(0,2);proof.discovery={returned_trades:list.payload.length,fresh_trade_ids:seen.size,visible_addresses:accounts.size,selected:selected.map(x=>({address:x.address,trade_time:x.time})),notional_ranking_only:true,trade_side_is_not_position_side:true};
   if(!selected.length)throw Error('NO_VALID_NATIVE_TRADE_PARTICIPANT_ADDRESS');
   for(const selectedAccount of selected){
    const state=await read({type:'clearinghouseState',user:selectedAccount.address});raw.push({provider:'HYPERLIQUID',address:selectedAccount.address,...state});
    const c={symbol,route_symbol:symbol,run_id,snapshot_id:'RESEARCH:'+symbol+':'+state.receipt.received_ts,as_of_ms:Date.now(),received_at_ms:state.receipt.received_ts,max_age_ms:120000};
    const normalized=state.ok?normalizeNativeHL({accounts:[{address:selectedAccount.address,state:state.payload}],selection_bias:'LARGEST_RECENT_PUBLIC_TRADE_PARTICIPANTS_NOT_COMPLETE_POSITION_CENSUS'},c):null;
    const levels=normalized?.usable_for_context?normalized.zones.filter(z=>z.notional>0&&((z.liquidated_side==='LONG'&&z.distance_pct<0)||(z.liquidated_side==='SHORT'&&z.distance_pct>0))):[];
    const hints=state.ok?buildNativeWalletRouting({accounts:[{address:selectedAccount.address,state:state.payload,http_receipt:state.receipt}],run_id,now:c.as_of_ms}):null;
    proof.rows.push({address:selectedAccount.address,receipt:state.receipt,status:normalized?.status??state.reason,source_ts:normalized?.source_ts??null,current_levels:levels.length,normalized,additional_structural_coin_capability:hints?.accounts[0]?.coins??[]});
   }
   proof.status=proof.rows.some(x=>x.current_levels>0)?'ACTUAL_OFFICIAL_TRADE_DISCOVERY_AND_CURRENT_NATIVE_LEVELS_VERIFIED':'DISCOVERY_PRESENT_NO_CURRENT_NUMERIC_LEVELS';
  }catch(error){proof.status='DISCOVERY_NOT_CLOSED';proof.reason=String(error.message).slice(0,180);}
  finally{proof.finalized_usage=await finalizeRunUsage(db,{reservationId:run_id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
 }
}catch(error){proof.status='RESEARCH_PREACTION_NOT_CLOSED';proof.reason=String(error.message).slice(0,180);}
proof.completed_ts=Date.now();proof.d1_usage=db.usageSnapshot();const gz=gzipSync(Buffer.from(JSON.stringify({head:process.env.GITHUB_SHA,run_id,raw})));proof.raw_gzip_sha256=createHash('sha256').update(gz).digest('hex');
fs.writeFileSync('audit-output/official-trade-wallet-discovery-raw.json.gz',gz);fs.writeFileSync('audit-output/official-trade-wallet-discovery-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({head:proof.head,run_id,status:proof.status,sourceHTTP:proof.sourceHTTP,rows:proof.rows.map(x=>({address:x.address,status:x.status,source_ts:x.source_ts,current_levels:x.current_levels})),MAIN:0,Telegram:0}));
