import {createRequire} from 'node:module';
import {fingerprint,timestamp,seal} from './core.mjs';
const require=createRequire(import.meta.url);
export const GTRADE_DIAMOND='0xFF162c694eAA571f685030649814282eA457f169';
export const GTRADE_RPC='https://arb1.arbitrum.io/rpc';
const ABI=[{"inputs":[{"internalType":"address[]","name":"_traders","type":"address[]"},{"internalType":"uint256","name":"_offset","type":"uint256"},{"internalType":"uint256","name":"_limit","type":"uint256"}],"name":"getAllTradeInfosForTraders","outputs":[{"components":[{"internalType":"uint32","name":"createdBlock","type":"uint32"},{"internalType":"uint32","name":"tpLastUpdatedBlock","type":"uint32"},{"internalType":"uint32","name":"slLastUpdatedBlock","type":"uint32"},{"internalType":"uint16","name":"maxSlippageP","type":"uint16"},{"internalType":"uint48","name":"lastOiUpdateTs","type":"uint48"},{"internalType":"uint48","name":"collateralPriceUsd","type":"uint48"},{"internalType":"enum ITradingStorage.ContractsVersion","name":"contractsVersion","type":"uint8"},{"internalType":"uint32","name":"lastPosIncreaseBlock","type":"uint32"},{"internalType":"uint8","name":"__placeholder","type":"uint8"}],"internalType":"struct ITradingStorage.TradeInfo[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function","signature":"0x01e87cb0"},{"inputs":[{"internalType":"address[]","name":"_traders","type":"address[]"},{"internalType":"uint256","name":"_offset","type":"uint256"},{"internalType":"uint256","name":"_limit","type":"uint256"}],"name":"getAllTradesForTraders","outputs":[{"components":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint32","name":"index","type":"uint32"},{"internalType":"uint16","name":"pairIndex","type":"uint16"},{"internalType":"uint24","name":"leverage","type":"uint24"},{"internalType":"bool","name":"long","type":"bool"},{"internalType":"bool","name":"isOpen","type":"bool"},{"internalType":"uint8","name":"collateralIndex","type":"uint8"},{"internalType":"enum ITradingStorage.TradeType","name":"tradeType","type":"uint8"},{"internalType":"uint120","name":"collateralAmount","type":"uint120"},{"internalType":"uint64","name":"openPrice","type":"uint64"},{"internalType":"uint64","name":"tp","type":"uint64"},{"internalType":"uint64","name":"sl","type":"uint64"},{"internalType":"bool","name":"isCounterTrade","type":"bool"},{"internalType":"uint160","name":"positionSizeToken","type":"uint160"},{"internalType":"uint24","name":"__placeholder","type":"uint24"}],"internalType":"struct ITradingStorage.Trade[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function","signature":"0x33ea7f74"},{"inputs":[{"internalType":"address[]","name":"_traders","type":"address[]"},{"internalType":"uint256","name":"_offset","type":"uint256"},{"internalType":"uint256","name":"_limit","type":"uint256"}],"name":"getAllTradesLiquidationParamsForTraders","outputs":[{"components":[{"internalType":"uint40","name":"maxLiqSpreadP","type":"uint40"},{"internalType":"uint40","name":"startLiqThresholdP","type":"uint40"},{"internalType":"uint40","name":"endLiqThresholdP","type":"uint40"},{"internalType":"uint24","name":"startLeverage","type":"uint24"},{"internalType":"uint24","name":"endLeverage","type":"uint24"}],"internalType":"struct IPairsStorage.GroupLiquidationParams[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function","signature":"0x556e838f"},{"inputs":[{"internalType":"uint8","name":"_collateralIndex","type":"uint8"},{"internalType":"address","name":"_trader","type":"address"},{"internalType":"uint32","name":"_index","type":"uint32"}],"name":"getBorrowingInitialAccFees","outputs":[{"components":[{"internalType":"uint64","name":"accPairFee","type":"uint64"},{"internalType":"uint64","name":"accGroupFee","type":"uint64"},{"internalType":"uint48","name":"block","type":"uint48"},{"internalType":"uint80","name":"__placeholder","type":"uint80"}],"internalType":"struct IBorrowingFees.BorrowingInitialAccFees","name":"","type":"tuple"}],"stateMutability":"view","type":"function","signature":"0xab6192ed"},{"inputs":[{"internalType":"address[]","name":"_trader","type":"address[]"},{"internalType":"uint32[]","name":"_index","type":"uint32[]"}],"name":"getTradeFeesDataArray","outputs":[{"components":[{"internalType":"uint128","name":"realizedTradingFeesCollateral","type":"uint128"},{"internalType":"int128","name":"realizedPnlCollateral","type":"int128"},{"internalType":"uint128","name":"manuallyRealizedNegativePnlCollateral","type":"uint128"},{"internalType":"uint128","name":"alreadyTransferredNegativePnlCollateral","type":"uint128"},{"internalType":"uint128","name":"virtualAvailableCollateralInDiamond","type":"uint128"},{"internalType":"uint128","name":"__placeholder","type":"uint128"},{"internalType":"int128","name":"initialAccFundingFeeP","type":"int128"},{"internalType":"uint128","name":"initialAccBorrowingFeeP","type":"uint128"}],"internalType":"struct IFundingFees.TradeFeesData[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function","signature":"0x2b9455fd"}];
let api=null;
function interfaceFor(){if(!api){const {ethers}=require('ethers');api={ethers,iface:new ethers.utils.Interface(ABI)};}return api;}
const integer=v=>{if(typeof v==='number')return Number.isSafeInteger(v)&&v>=0?v:null;if(typeof v==='string'&&/^\d+$/.test(v)){const n=Number(v);return Number.isSafeInteger(n)?n:null;}return null;};
const addr=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v);
const id=t=>String(t.user).toLowerCase()+':'+t.index;
export function selectGTradePinnedPositionSample(trades,pair_index){
 const seen=new Set(),rows=(Array.isArray(trades)?trades:[]).filter(r=>{
  const t=r?.trade;if(!t||t.isOpen!==true||String(t.tradeType)!=='0'||integer(t.pairIndex)!==pair_index||!addr(t.user)||integer(t.index)===null||integer(t.collateralIndex)===null||integer(t.collateralIndex)<1||seen.has(id(t)))return false;
  seen.add(id(t));return true;
 }).sort((a,b)=>id(a.trade).localeCompare(id(b.trade)));
 const longs=rows.filter(r=>r.trade.long===true),shorts=rows.filter(r=>r.trade.long===false),chosen=[...longs.slice(0,2),...shorts.slice(0,2)];
 for(const r of rows)if(chosen.length<4&&!chosen.includes(r))chosen.push(r);
 return {selected:chosen,candidate_count:rows.length,policy:'SORTED_VISIBLE_POSITION_IDS_MAX4_BALANCED_LONG_SHORT',complete_position_census:false};
}
export function permittedGTradePinnedRpcBatch(body){
 if(!Array.isArray(body)||!body.length||body.length>10)return false;
 const ids=new Set(),tags=new Set();let blockReads=0,chainReads=0;
 const okay=body.every(r=>{
  if(r?.jsonrpc!=='2.0'||!Number.isSafeInteger(r.id)||ids.has(r.id)||!Array.isArray(r.params))return false;ids.add(r.id);
  if(r.method==='eth_chainId'){chainReads++;return r.params.length===0&&chainReads===1;}
  if(r.method==='eth_getBlockByNumber'){blockReads++;const tag=r.params[0];if(r.params.length!==2||!/^0x[1-9a-f][0-9a-f]*$/i.test(tag)||r.params[1]!==false||blockReads!==1)return false;tags.add(tag.toLowerCase());return true;}
  if(r.method!=='eth_call'||r.params.length!==2||!/^0x[1-9a-f][0-9a-f]*$/i.test(r.params[1]))return false;
  tags.add(r.params[1].toLowerCase());const c=r.params[0];
  if(!c||Object.keys(c).sort().join(',')!=='data,to'||String(c.to).toLowerCase()!==GTRADE_DIAMOND.toLowerCase())return false;
  try{
   const t=interfaceFor().iface.parseTransaction({data:c.data});if(!t)return false;
   if(['getAllTradesForTraders','getAllTradeInfosForTraders','getAllTradesLiquidationParamsForTraders'].includes(t.name))return t.args[0].length>0&&t.args[0].length<=4&&Number(t.args[1])===0&&Number(t.args[2])===127;
   if(t.name==='getTradeFeesDataArray')return t.args[0].length>0&&t.args[0].length<=4&&t.args[0].length===t.args[1].length;
   if(t.name==='getBorrowingInitialAccFees')return Number(t.args[0])>0;
   return false;
  }catch{return false;}
 });
 return okay&&tags.size===1;
}
export function buildGTradePinnedRpcBatch({current_block,selected}){
 if(!Number.isSafeInteger(current_block)||current_block<=0||!Array.isArray(selected)||!selected.length||selected.length>4)throw Error('GTRADE_PINNED_SELECTION_INVALID');
 const {ethers,iface}=interfaceFor(),tag=ethers.utils.hexValue(current_block),accounts=[...new Set(selected.map(r=>r.trade.user.toLowerCase()))];
 const call=(fn,args,n)=>({jsonrpc:'2.0',id:n,method:'eth_call',params:[{to:GTRADE_DIAMOND,data:iface.encodeFunctionData(fn,args)},tag]});
 const body=[{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_getBlockByNumber',params:[tag,false]},call('getAllTradesForTraders',[accounts,0,127],3),call('getAllTradeInfosForTraders',[accounts,0,127],4),call('getAllTradesLiquidationParamsForTraders',[accounts,0,127],5),call('getTradeFeesDataArray',[selected.map(r=>r.trade.user),selected.map(r=>r.trade.index)],6),...selected.map((r,i)=>call('getBorrowingInitialAccFees',[r.trade.collateralIndex,r.trade.user,r.trade.index],i+7))];
 if(!permittedGTradePinnedRpcBatch(body))throw Error('GTRADE_PINNED_BATCH_NOT_ALLOWLISTED');return body;
}
function plain(tuple,fn){const components=ABI.find(x=>x.name===fn).outputs[0].components;return Object.fromEntries(components.map((p,i)=>[p.name,p.type==='bool'?tuple[i]:p.type==='address'?String(tuple[i]):tuple[i].toString()]));}
export function decodeGTradePinnedRpcSnapshot({body,response,selected,current_block,pair_index,receipt,as_of_ms,max_age_ms=300000}){
 if(!permittedGTradePinnedRpcBatch(body)||fingerprint(body)!==fingerprint(buildGTradePinnedRpcBatch({current_block,selected}))||!Array.isArray(response)||response.length!==body.length||timestamp(as_of_ms)===null||receipt?.http_status!==200||timestamp(receipt.received_ts)===null||receipt.received_ts>as_of_ms||as_of_ms-receipt.received_ts>max_age_ms||!/^[0-9a-f]{64}$/.test(receipt.sha256||''))throw Error('GTRADE_PINNED_RPC_ENVELOPE_INVALID');
 const answers=new Map();for(const r of response){if(r?.jsonrpc!=='2.0'||!Number.isSafeInteger(r.id)||answers.has(r.id)||r.error||!Object.hasOwn(r,'result'))throw Error('GTRADE_PINNED_RPC_RESPONSE_INVALID');answers.set(r.id,r.result);}
 if(body.some(r=>!answers.has(r.id)))throw Error('GTRADE_PINNED_RPC_ID_MISSING');
 const block=answers.get(2),ts=Number(block?.timestamp)*1000,number=Number(block?.number);
 if(Number(answers.get(1))!==42161||number!==current_block||!/^0x[0-9a-f]{64}$/i.test(block?.hash||'')||timestamp(ts)===null||ts>receipt.received_ts||as_of_ms-ts>max_age_ms)throw Error('GTRADE_PINNED_BLOCK_CLOCK_NOT_CLOSED');
 const {iface}=interfaceFor(),functions=['getAllTradesForTraders','getAllTradeInfosForTraders','getAllTradesLiquidationParamsForTraders'],tuples=functions.map((fn,i)=>iface.decodeFunctionResult(fn,answers.get(i+3))[0]);
 if(tuples.some(a=>a.length!==tuples[0].length))throw Error('GTRADE_PINNED_POSITION_INFO_ALIGNMENT_INVALID');
 const open=new Map();tuples[0].forEach((t,i)=>{const trade=plain(t,functions[0]);if(Number(trade.collateralIndex)===0)return;const key=id(trade);if(open.has(key))throw Error('GTRADE_PINNED_DUPLICATE_POSITION');open.set(key,{trade,tradeInfo:plain(tuples[1][i],functions[1]),liquidationParams:plain(tuples[2][i],functions[2])});});
 const fees=iface.decodeFunctionResult('getTradeFeesDataArray',answers.get(6))[0];
 if(fees.length!==selected.length)throw Error('GTRADE_PINNED_FEES_ALIGNMENT_INVALID');
 const trades=[],excluded=[];selected.forEach((r,i)=>{
  const key=id(r.trade),live=open.get(key);
  if(!live||live.trade.isOpen!==true||String(live.trade.tradeType)!=='0'||integer(live.trade.pairIndex)!==pair_index||integer(live.trade.collateralIndex)!==integer(r.trade.collateralIndex)){excluded.push({position_id:key,reason:'DISCOVERED_POSITION_NOT_OPEN_WITH_SAME_EXACT_MARKET_AND_COLLATERAL_AT_PINNED_BLOCK'});return;}
  live.tradeFeesData=plain(fees[i],'getTradeFeesDataArray');live.initialAccFees=plain(iface.decodeFunctionResult('getBorrowingInitialAccFees',answers.get(i+7))[0],'getBorrowingInitialAccFees');trades.push(live);
 });
 const evidence=seal({schema:'GTRADE_EXPLICIT_BLOCK_POSITION_SNAPSHOT_V1',chain_id:42161,contract:GTRADE_DIAMOND,block_number:current_block,block_hash:block.hash,positions_source_ts:ts,pair_index,received_ts:receipt.received_ts,source_response_sha256:receipt.sha256,request_fingerprint:fingerprint(body),trades_fingerprint:fingerprint(trades),verified_open_positions:trades.length,selected_discovery_positions:selected.length,excluded_positions:excluded,complete_position_census:false,selection_policy:'SORTED_VISIBLE_POSITION_IDS_MAX4_BALANCED_LONG_SHORT',margin_and_fee_inputs_same_explicit_block:true});
 return {trades,evidence};
}
export function verifyGTradePinnedPositionSnapshot(evidence,{trades,current_block,pair_index,as_of_ms,max_age_ms=300000}){
 if(evidence?.schema!=='GTRADE_EXPLICIT_BLOCK_POSITION_SNAPSHOT_V1')return false;
 const {fingerprint:f,...body}=evidence;
 return fingerprint(body)===f&&evidence.chain_id===42161&&evidence.contract===GTRADE_DIAMOND&&evidence.block_number===current_block&&evidence.pair_index===pair_index&&evidence.margin_and_fee_inputs_same_explicit_block===true&&evidence.complete_position_census===false&&evidence.verified_open_positions===trades?.length&&evidence.trades_fingerprint===fingerprint(trades)&&timestamp(evidence.positions_source_ts)!==null&&timestamp(evidence.received_ts)!==null&&evidence.positions_source_ts<=evidence.received_ts&&evidence.received_ts<=as_of_ms&&as_of_ms-evidence.positions_source_ts<=max_age_ms&&as_of_ms-evidence.received_ts<=max_age_ms;
}
