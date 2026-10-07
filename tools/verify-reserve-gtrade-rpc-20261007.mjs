import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../current-generation/files/src/liquidation-extension/d1-source-admission.mjs';
import {LIQUIDATION_ALLOWANCE_GENERATION} from '../current-generation/files/src/liquidation-extension/install-source-allowances.mjs';
import {readJson} from '../current-generation/files/src/liquidation-extension/io.mjs';
const pin=await import(pathToFileURL(path.resolve('runtime/src/liquidation-extension/gtrade-pinned-position-snapshot.mjs')));
const url='https://arbitrum-one-rpc.publicnode.com',db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),started=Date.now(),run_id=`GTRADE_RESERVE_RPC:${process.env.GITHUB_RUN_ID}:${started}`,reservation={rows_read:1250,rows_written:100},raw=[];
const proof={schema:'RESERVE_GTRADE_RPC_VERIFICATION_20261007_V1',head:process.env.GITHUB_SHA,run_id,started_ts:started,source_cap:2,sourceHTTP:0,MAIN:0,Telegram:0,paid_access:false,decisions_enabled:false,url,scope:'CURRENT_CHAIN_AND_EXPLICIT_BLOCK_POSITION_READ_CAPABILITY_ONLY; RETAINED_POSITION_IDENTITIES; NO_FRESH_MARKET_MAP_OR_SDK_PRICE_ACCEPTANCE',rows:[]};
fs.mkdirSync('audit-output',{recursive:true});
try{
 const day=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});proof.day_admission=day;
 if(!day.allowed)proof.status='D1_ADMISSION_BLOCKED';
 else{
  await reserveRunBudget(db,{reservationId:run_id,now:started,reservation});
  try{
   const scope_id=`${LIQUIDATION_ALLOWANCE_GENERATION}:${new Date(started).toISOString().slice(0,7).replace('-','')}:GTRADE`,cfg=await db.prepare('SELECT * FROM report2_liq_source_allowance_shadow WHERE scope_id=?1 LIMIT 1').bind(scope_id).first();
   if(cfg?.active!==1||cfg.allowance_units>10000)throw Error('EXISTING_REVIEWED_GTRADE_ALLOWANCE_REQUIRED');
   const admit=createD1SourceAdmission({db,scope_bindings:{GTRADE:{scope_id,config_fingerprint:cfg.config_fingerprint}},within_run_budget:e=>{const u=db.usageSnapshot();return{allowed:u.unknown_ops===0&&u.rows_read+e.extraRowsRead+4<=reservation.rows_read&&u.rows_written+e.extraRowsWritten+4<=reservation.rows_written};}});
   const grant=await admit({reservation_id:run_id,contract:'RETAINED_GTRADE_POSITION_CAPABILITY',run_id,requests:{GTRADE:2},weights:{GTRADE:14},max_requests:2,deadline_ts:started+45000});proof.provider_admission=grant;
   if(grant.allowed!==true||grant.new_reservation!==true)throw Error('DURABLE_PROVIDER_ADMISSION_BLOCKED');
   const read=async body=>{proof.sourceHTTP++;const result=await readJson(url,{method:'POST',body,timeout_ms:10000,max_bytes:2000000});raw.push({body,...result});return result;};
   const metadata=await read([{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:['latest',false]}]);
   if(!metadata.ok||!Array.isArray(metadata.payload)||metadata.payload.length!==2||metadata.payload.some(x=>x.error))throw Error('RESERVE_RPC_METADATA_NOT_CLOSED');
   const answers=new Map(metadata.payload.map(x=>[x.id,x.result])),block=answers.get(2),block_number=Number(block?.number),source_ts=Number(block?.timestamp)*1000;
   if(Number(answers.get(1))!==42161||!Number.isSafeInteger(block_number)||!Number.isSafeInteger(source_ts)||source_ts>metadata.receipt.received_ts||metadata.receipt.received_ts-source_ts>120000||!/^0x[a-f0-9]{64}$/i.test(block?.hash||''))throw Error('RESERVE_RPC_EXACT_CHAIN_OR_CLOCK_NOT_CLOSED');
   proof.chain={chain_id:42161,block_number,source_ts,block_hash:block.hash,receipt:metadata.receipt};
   const retained=JSON.parse(gunzipSync(fs.readFileSync('original-source/verified-pinned-trades.json.gz'))),markets=[...new Set(retained.map(x=>Number(x.trade?.pairIndex)))].filter(Number.isSafeInteger).slice(0,2),selected=markets.flatMap(ix=>pin.selectGTradePinnedPositionSample(retained,ix).selected);
   const body=pin.buildGTradePinnedRpcBatch({current_block:block_number,selected});if(!pin.permittedGTradePinnedRpcBatch(body))throw Error('READ_ONLY_PINNED_BODY_REQUIRED');
   const state=await read(body);proof.pinned_receipt=state.receipt;
   if(!state.ok)throw Error('RESERVE_RPC_PINNED_TRANSPORT_'+state.reason);
   for(const pair_index of markets){const decoded=pin.decodeGTradePinnedRpcSnapshot({body,response:state.payload,selected,current_block:block_number,pair_index,receipt:state.receipt,as_of_ms:Date.now()});proof.rows.push({pair_index,source_ts:decoded.evidence.positions_source_ts,verified_open_positions:decoded.trades.length,excluded_positions:decoded.evidence.excluded_positions,evidence:decoded.evidence});}
   proof.status='ACTUAL_KEYLESS_EXACT_CHAIN_PINNED_POSITION_READ_SUPPORTED';
  }catch(error){proof.status='RESERVE_RPC_NOT_CLOSED';proof.reason=String(error.message).slice(0,180);}
  finally{proof.finalized_usage=await finalizeRunUsage(db,{reservationId:run_id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
 }
}catch(error){proof.status='RESEARCH_PREACTION_NOT_CLOSED';proof.reason=String(error.message).slice(0,180);}
proof.completed_ts=Date.now();proof.d1_usage=db.usageSnapshot();const gz=gzipSync(Buffer.from(JSON.stringify({head:process.env.GITHUB_SHA,run_id,raw})));proof.raw_gzip_sha256=createHash('sha256').update(gz).digest('hex');
fs.writeFileSync('audit-output/reserve-gtrade-rpc-raw.json.gz',gz);fs.writeFileSync('audit-output/reserve-gtrade-rpc-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
