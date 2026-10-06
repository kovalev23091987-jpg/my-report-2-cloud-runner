import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../runtime/src/liquidation-extension/d1-source-admission.mjs';
import {createSharedSourceBudget} from '../runtime/src/liquidation-extension/run-source-budget.mjs';
import {readJson} from '../runtime/src/liquidation-extension/io.mjs';
import {normalizeGTrade,resolveGTradeCryptoMarket} from '../runtime/src/liquidation-extension/gtrade.mjs';
import {selectGTradePinnedPositionSample,buildGTradePinnedRpcBatch,decodeGTradePinnedRpcSnapshot,GTRADE_RPC} from '../runtime/src/liquidation-extension/gtrade-pinned-position-snapshot.mjs';
import {createGTradeAcquisition,bindGTradeAcquisition} from '../runtime/src/liquidation-extension/gtrade-runtime-bridge.mjs';
import {nativeLiquidationLines,validateNativeLiquidationContext} from '../runtime/src/native-liquidation-guard.mjs';
const require=createRequire(new URL('../runtime/src/liquidation-extension/package.json',import.meta.url)),sdk=require('@gainsnetwork/sdk');
if(require('@gainsnetwork/sdk/package.json').version!=='1.8.10')throw Error('PINNED_SDK_REQUIRED');
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
if(universe.assets.length!==102||universe.contracts.length!==119)throw Error('EXACT_EXISTING_UNIVERSE_REQUIRED');
const phase=JSON.parse(await fs.readFile('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')),fence=JSON.parse(await fs.readFile('audit-fixes/source-optimization-20260930/execution-lock.json','utf8'));
const own='HTX:20261006T065915411Z:general-flow-gmx-clock',guard=()=>{if(phase.lease?.owner!==own||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');};
guard();
const now=Date.now(),id='GTRADE_SINGLE_PINNED_BATCH:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const out={schema:'report2-general-gtrade-one-batch-live-evaluation-v1',head:process.env.GITHUB_SHA,expected_main:process.env.REPORT2_EXPECTED_MAIN,started_ts:now,sourceHTTP:0,maximum_sourceHTTP:4,MAIN:0,Telegram:0,Nansen:0,production_runtime_changes:0,not_fresh_joint_acceptance:true,sdk_version:'1.8.10',universe_assets:102,universe_contracts:119};
const hash=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir('audit-output',{recursive:true});
const check=()=>{guard();const u=db.usageSnapshot();if(u.unknown_ops!==0||u.rows_read>2300||u.rows_written>60||u.requests>24)throw Error('BOUNDED_D1_USAGE_EXCEEDED');};
const save=async(name,body)=>{const bytes=Buffer.from(JSON.stringify(body)),gz=gzipSync(bytes,{mtime:0});await fs.writeFile('audit-output/'+name+'.json.gz',gz);return{file:name+'.json.gz',json_sha256:hash(bytes),gzip_sha256:hash(gz)};};
out.d1_admission=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,now),nextReservation:{rows_read:2500,rows_written:64},maxDailyReads:3500000,maxDailyWrites:70000});
if(out.d1_admission.allowed){
 await reserveRunBudget(db,{reservationId:id,now,reservation:{rows_read:2500,rows_written:64}});
 try{
  const cfg=await db.prepare("SELECT scope_id,provider,config_fingerprint,window_start_ts,window_end_ts,allowance_units,used_units,active FROM report2_liq_source_allowance_shadow WHERE provider='GTRADE' AND active=1 AND window_start_ts<=?1 AND window_end_ts>?1 ORDER BY window_start_ts DESC LIMIT 2").bind(now).all();check();
  const rows=cfg.results||[];if(rows.length!==1)throw Error('UNIQUE_EXISTING_GTRADE_ALLOWANCE_REQUIRED');
  const c=rows[0],admit=createD1SourceAdmission({db,scope_bindings:{GTRADE:{scope_id:c.scope_id,config_fingerprint:c.config_fingerprint}},within_run_budget:()=>{check();return{allowed:true};}});
  const budget=createSharedSourceBudget({provider_admit:admit,max_requests:4,max_parallel:1,max_total_ms:45000,fetch_impl:async(url,init)=>{check();if(out.sourceHTTP>=4)throw Error('BOUNDED_SOURCE_HTTP_EXCEEDED');out.sourceHTTP++;return fetch(url,init);}});
  out.source_admission=await budget.admit({reservation_id:id+':GTRADE',contract:universe.assets[0].asset_analysis_contract,run_id:id,requests:{GTRADE:4},max_requests:4,deadline_ts:Date.now()+45000});
  if(out.source_admission.allowed){
   const rests=[];for(const url of ['https://backend-arbitrum.gains.trade/trading-variables','https://backend-arbitrum.gains.trade/open-trades','https://backend-pricing.eu.gains.trade/charts']){
    const r=await readJson(url,{fetch_impl:budget.fetch,timeout_ms:10000,max_bytes:8000000});check();rests.push(r);out['rest_'+rests.length]=await save('rest-'+rests.length,r);if(!r.ok)throw Error('GTRADE_REST_NOT_CLOSED:'+r.reason);
   }
   const [variables,trades,prices]=rests.map(r=>r.payload);
   const candidates=universe.assets.filter(a=>!['BTC','ETH'].includes(a.symbol)).map(a=>({asset:a,market:resolveGTradeCryptoMarket(variables,a.symbol)})).filter(x=>x.market.supported).map(x=>({...x,selection:selectGTradePinnedPositionSample(trades,x.market.pair_index)})).filter(x=>x.selection.selected.length).sort((a,b)=>a.asset.symbol.localeCompare(b.asset.symbol));
   if(!candidates.length)throw Error('NO_EXACT_CRYPTO_POSITIONS_IN_EXISTING_UNIVERSE');
   const {asset,market,selection}=candidates[0];out.selection={symbol:asset.symbol,contract:asset.asset_analysis_contract,basis:'FIRST_ALPHABETICAL_EXISTING_UNIVERSE_ASSET_WITH_EXACT_CURRENT_GTRADE_OPEN_POSITIONS; NOT_TOP2_OR_PER_COIN_CONFIGURATION',candidate_count:selection.candidate_count,selected_positions:selection.selected.length,position_policy:selection.policy,complete_position_census:false};
   const body=buildGTradePinnedRpcBatch({current_block:variables.currentBlock,selected:selection.selected});
   const raw=await readJson(GTRADE_RPC,{method:'POST',body,fetch_impl:budget.fetch,timeout_ms:10000,max_bytes:2000000});
   out.rpc=await save('actual-single-pinned-rpc',raw);if(!raw.ok){out.rpc_error={reason:raw.reason,http_status:raw.receipt.http_status,retry_after:raw.receipt.retry_after,provider_error:raw.provider_error};throw Error('GTRADE_PINNED_RPC_NOT_CLOSED:'+raw.reason);}
   const observed=Date.now(),decoded=decodeGTradePinnedRpcSnapshot({body,response:raw.payload,selected:selection.selected,current_block:variables.currentBlock,pair_index:market.pair_index,receipt:raw.receipt,as_of_ms:observed});
   out.verified_snapshot=await save('verified-single-pinned-trades',decoded);
   const transport=[...rests.map(r=>r.receipt),raw.receipt],normalized=normalizeGTrade({variables,trades:decoded.trades,prices,receipts:transport,pinned_positions:decoded.evidence},{symbol:asset.symbol,route_symbol:asset.symbol,run_id:id,snapshot_id:'SOURCE_EVAL:'+asset.symbol,as_of_ms:observed,received_at_ms:observed,max_age_ms:300000},sdk);
   out.normalized=await save('actual-pinned-normalized',normalized);out.source_clock_closed=normalized.source_clock_closed===true;out.estimated_levels=normalized.zones?.length??0;out.excluded_positions=normalized.excluded_positions??[];
   if(normalized.usable_for_context!==true)throw Error('NORMALIZATION_NOT_CLOSED:'+normalized.status);
   const contract=asset.asset_analysis_contract,acq=createGTradeAcquisition({contract,native_symbol:asset.symbol,run_id:id,acquisition_id:'ACTUAL:'+contract,collection_started_ts:now,collection_completed_ts:observed,normalized_receipt:normalized,transport_receipts:transport}),snapshot='SOURCE_EVAL_CANONICAL:'+contract,ctx=bindGTradeAcquisition(acq,{contract,run_id:id,snapshot_id:snapshot,observed_ts:observed});
   const liquidations={independent_extensions:[ctx]},integrity=validateNativeLiquidationContext({metadata:{contract},run_id:id,snapshot_id:snapshot,observed_ts:observed,direction:null,liquidations});
   if(!integrity.ok)throw Error('ESTIMATE_CONTEXT_INTEGRITY_NOT_CLOSED:'+integrity.status);
   out.context=await save('actual-pinned-context',ctx);out.rendered=nativeLiquidationLines(liquidations,{manual:true});out.entry_eligible=ctx.entry_eligible;out.whole_state_atomic=false;out.source_block=decoded.evidence.block_number;out.source_block_timestamp=decoded.evidence.positions_source_ts;out.original_input_clocks={variable:normalized.variable_source_ts,index:normalized.index_source_ts,position:normalized.positions_source_ts};out.status='ACTUAL_ONE_BATCH_POSITION_FEES_CLOCK_CONTEXT_AND_RENDER_CLOSED_NOT_JOINT_ACCEPTANCE';
  }else out.status='EXISTING_GTRADE_ADMISSION_BLOCKED';
  out.source_budget=budget.summary();check();
 }catch(e){out.status='BOUNDED_GENERAL_GTRADE_ONE_BATCH_CHECK_NOT_CLOSED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.completed_ts=Date.now();out.d1_usage=db.usageSnapshot();
await fs.writeFile('audit-output/gtrade-one-batch-live-proof.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,error:out.error,sourceHTTP:out.sourceHTTP,MAIN:0,Telegram:0,selection:out.selection,source_clock_closed:out.source_clock_closed,estimated_levels:out.estimated_levels,d1_usage:out.d1_usage}));
