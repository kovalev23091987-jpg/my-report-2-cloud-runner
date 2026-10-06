import fs from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {createD1SourceAdmission} from '../runtime/src/liquidation-extension/d1-source-admission.mjs';
import {createSharedSourceBudget} from './gtrade-pinned-evaluation-budget.mjs';
import {readJson} from '../runtime/src/liquidation-extension/io.mjs';
import {normalizeGTrade,resolveGTradeCryptoMarket} from '../runtime/src/liquidation-extension/gtrade.mjs';
const require=createRequire(new URL('../runtime/src/liquidation-extension/package.json',import.meta.url)),sdk=require('@gainsnetwork/sdk'),{ethers}=require('ethers');
if(require('@gainsnetwork/sdk/package.json').version!=='1.8.10')throw Error('PINNED_SDK_REQUIRED');
const abi=JSON.parse(await fs.readFile('tools/gtrade-chain-abi.json','utf8')),iface=new ethers.utils.Interface(abi);
const rpcUrl='https://arb1.arbitrum.io/rpc',diamond='0xFF162c694eAA571f685030649814282eA457f169';
const universe=JSON.parse(gunzipSync(await fs.readFile('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz')));
if(universe.assets.length!==102||universe.contracts.length!==119)throw Error('EXACT_EXISTING_UNIVERSE_REQUIRED');
const phase=JSON.parse(await fs.readFile('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')),fence=JSON.parse(await fs.readFile('audit-fixes/source-optimization-20260930/execution-lock.json','utf8'));
const own='HTX:20261006T065915411Z:general-flow-gmx-clock',guard=()=>{if(phase.lease?.owner!==own||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('OWNER_OR_FENCE_BLOCKED');};
guard();
const now=Date.now(),id='GTRADE_PINNED_SOURCE:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const out={schema:'report2-gtrade-pinned-source-evaluation-v1',head:process.env.GITHUB_SHA,expected_main:process.env.REPORT2_EXPECTED_MAIN,started_ts:now,sourceHTTP:0,maximum_sourceHTTP:5,MAIN:0,Telegram:0,Nansen:0,production_runtime_changes:0,not_fresh_joint_acceptance:true,sdk_version:'1.8.10',official_sdk_abi_commit:'aa7a05a4919ba6667513c128e6bf5806af0be181',universe_assets:102,universe_contracts:119};
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
  const budget=createSharedSourceBudget({provider_admit:admit,max_requests:5,max_parallel:1,max_total_ms:45000,fetch_impl:async(url,init)=>{check();if(out.sourceHTTP>=5)throw Error('BOUNDED_SOURCE_HTTP_EXCEEDED');out.sourceHTTP++;return fetch(url,init);}});
  out.source_admission=await budget.admit({reservation_id:id+':GTRADE',contract:universe.assets[0].asset_analysis_contract,run_id:id,requests:{GTRADE:5},max_requests:5,deadline_ts:Date.now()+45000});
  if(out.source_admission.allowed){
   const rests=[];for(const url of ['https://backend-arbitrum.gains.trade/trading-variables','https://backend-arbitrum.gains.trade/open-trades','https://backend-pricing.eu.gains.trade/charts']){
    const r=await readJson(url,{fetch_impl:budget.fetch,timeout_ms:10000,max_bytes:8000000});check();rests.push(r);out['rest_'+rests.length]=await save('rest-'+rests.length,r);if(!r.ok)throw Error('EXISTING_GTRADE_REST_NOT_CLOSED:'+r.reason);
   }
   const [variables,backendTrades,prices]=rests.map(r=>r.payload);
   if(!Number.isSafeInteger(variables.currentBlock)||variables.currentBlock<=0||!Array.isArray(backendTrades))throw Error('CURRENT_BLOCK_OR_TRADE_SCHEMA_MISSING');
   const symbolByPair=new Map();for(const a of universe.assets){const m=resolveGTradeCryptoMarket(variables,a.symbol);if(m.supported)symbolByPair.set(m.pair_index,a.symbol);}
   const candidates=backendTrades.filter(t=>t.trade?.isOpen===true&&String(t.trade.tradeType)==='0'&&symbolByPair.has(Number(t.trade.pairIndex))&&/^0x[0-9a-f]{40}$/i.test(t.trade.user));
   const accounts=[...new Set(candidates.map(t=>t.trade.user.toLowerCase()))].sort().slice(0,8);
   out.selection={basis:'FIRST_8_SORTED_ACCOUNTS_WITH_EXISTING_EXACT_HTX_UNIVERSE_CRYPTO_MARKET_POSITIONS',backend_supported_positions:candidates.length,backend_accounts:new Set(candidates.map(t=>t.trade.user.toLowerCase())).size,accounts,complete_universe_position_census:false};
   if(!accounts.length)throw Error('NO_EXACT_UNIVERSE_OPEN_ACCOUNTS');
   const tag=ethers.utils.hexValue(variables.currentBlock);
   const rpc=async(name,body)=>{
    const response=await budget.fetch(rpcUrl,{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
    const text=await response.text();if(!response.ok)throw Error('RPC_HTTP_'+response.status);
    let parsed;try{parsed=JSON.parse(text);}catch{throw Error('RPC_JSON_INVALID');}
    out[name]=await save(name,parsed);
    if(!Array.isArray(parsed)||parsed.length!==body.length)throw Error('RPC_BATCH_LENGTH_NOT_CLOSED');
    const byId=new Map();for(const x of parsed){if(x?.jsonrpc!=='2.0'||!Number.isSafeInteger(x.id)||byId.has(x.id)||x.error||!Object.hasOwn(x,'result'))throw Error('RPC_RESPONSE_ID_OR_ERROR_NOT_CLOSED');byId.set(x.id,x.result);}
    if(body.some(x=>!byId.has(x.id)))throw Error('RPC_RESPONSE_ID_MISSING');
    return {byId,receipt:{http_status:response.status,received_ts:Date.now(),sha256:hash(Buffer.from(text)),url:rpcUrl,method:'POST',pinned_block:tag}};
   };
   const call=(fn,args,id)=>({jsonrpc:'2.0',id,method:'eth_call',params:[{to:diamond,data:iface.encodeFunctionData(fn,args)},tag]});
   const first=await rpc('rpc-pinned-positions',[{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:[tag,false]},call('getAllTradesForTraders',[accounts,0,127],3),call('getAllTradeInfosForTraders',[accounts,0,127],4),call('getAllTradesLiquidationParamsForTraders',[accounts,0,127],5)]);
   if(Number(first.byId.get(1))!==42161)throw Error('CHAIN_ID_MISMATCH');
   const block=first.byId.get(2),blockTs=Number(block?.timestamp)*1000,asof=Date.now();
   if(Number(block?.number)!==variables.currentBlock||!/^0x[0-9a-f]{64}$/i.test(block?.hash||'')||!Number.isSafeInteger(blockTs)||blockTs>asof||asof-blockTs>300000)throw Error('PINNED_BLOCK_CLOCK_NOT_CLOSED');
   const tuples=['getAllTradesForTraders','getAllTradeInfosForTraders','getAllTradesLiquidationParamsForTraders'].map((fn,i)=>iface.decodeFunctionResult(fn,first.byId.get(i+3))[0]);
   if(tuples.some(x=>x.length!==tuples[0].length))throw Error('POSITION_INFO_ALIGNMENT_NOT_CLOSED');
   const plain=(value,components)=>Object.fromEntries(components.map((p,i)=>[p.name,p.type==='bool'?value[i]:p.type==='address'?String(value[i]):value[i].toString()]));
   const decoded=tuples[0].map((trade,i)=>({trade:plain(trade,abi.find(x=>x.name==='getAllTradesForTraders').outputs[0].components),tradeInfo:plain(tuples[1][i],abi.find(x=>x.name==='getAllTradeInfosForTraders').outputs[0].components),liquidationParams:plain(tuples[2][i],abi.find(x=>x.name==='getAllTradesLiquidationParamsForTraders').outputs[0].components)}));
   const selected=decoded.filter(t=>t.trade.isOpen===true&&Number(t.trade.collateralIndex)>0&&String(t.trade.tradeType)==='0'&&symbolByPair.has(Number(t.trade.pairIndex))).slice(0,32);
   if(!selected.length)throw Error('NO_VERIFIED_OPEN_CRYPTO_POSITIONS_IN_BOUNDED_SAMPLE');
   const second=await rpc('rpc-pinned-fees',[call('getTradeFeesDataArray',[selected.map(x=>x.trade.user),selected.map(x=>x.trade.index)],1),...selected.map((x,i)=>call('getBorrowingInitialAccFees',[x.trade.collateralIndex,x.trade.user,x.trade.index],i+2))]);
   const fees=iface.decodeFunctionResult('getTradeFeesDataArray',second.byId.get(1))[0];if(fees.length!==selected.length)throw Error('FEE_POSITION_ALIGNMENT_NOT_CLOSED');
   selected.forEach((x,i)=>{x.tradeFeesData=plain(fees[i],abi.find(x=>x.name==='getTradeFeesDataArray').outputs[0].components);x.initialAccFees=plain(iface.decodeFunctionResult('getBorrowingInitialAccFees',second.byId.get(i+2))[0],abi.find(x=>x.name==='getBorrowingInitialAccFees').outputs[0].components);});
   out.pinned_snapshot=await save('verified-pinned-trades',selected);
   out.source_clock={chain_id:42161,contract:diamond,block_number:variables.currentBlock,block_hash:block.hash,block_source_ts:blockTs,all_position_margin_and_fee_eth_calls_same_explicit_block:true,positions_source_clock_known:true,price_source_ts:prices.time,variables_source_ts:variables.lastRefreshed,whole_backend_and_index_same_block_atomic:false,selected_verified_positions:selected.length,complete_selected_account_census:false,partial_sample:true};
   out.rows=[];for(const [ix,symbol]of symbolByPair){
    if(!selected.some(t=>Number(t.trade.pairIndex)===ix))continue;
    const cutoff=Date.now(),n=normalizeGTrade({variables,trades:selected,prices,receipts:[rests[0].receipt,second.receipt,rests[2].receipt]},{symbol,route_symbol:symbol,run_id:id,snapshot_id:id+':'+symbol,as_of_ms:cutoff,received_at_ms:cutoff,max_age_ms:300000},sdk);
    out.rows.push({symbol,status:n.status,selected_market_positions:n.selected_market_positions,estimated_levels:n.normalized_zones?.length??n.zones?.length??null,normalized:n});
   }
   out.normalization=await save('pinned-normalized-markets',out.rows);
   out.status='ACTUAL_PINNED_POSITION_CLOCK_AND_EXISTING_SDK_EVALUATION_COMPLETED';
  }else out.status='EXISTING_GTRADE_ADMISSION_BLOCKED';
  out.source_budget=budget.summary();check();
 }catch(e){out.status='BOUNDED_GTRADE_PINNED_CHECK_NOT_CLOSED';out.error=String(e.message).slice(0,180);}
 finally{out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:process.env.GITHUB_RUN_ID,usage:db.usageSnapshot()});}
}else out.status='D1_ADMISSION_BLOCKED';
out.completed_ts=Date.now();out.d1_usage=db.usageSnapshot();
await fs.writeFile('audit-output/gtrade-pinned-source-proof.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,error:out.error,sourceHTTP:out.sourceHTTP,MAIN:0,Telegram:0,source_clock:out.source_clock,d1_usage:out.d1_usage}));

