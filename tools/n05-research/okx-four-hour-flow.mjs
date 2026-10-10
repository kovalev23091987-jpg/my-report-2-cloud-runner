import {reconcileBitgetFlow} from '../../current-generation/files/src/bitget-four-hour-flow.mjs';
export const OKX_FLOW_VERSION='okx-native-volume-reconciled-flow-v1-20261010';
// Primary project references bind native networks. They are not market clocks.
export const OKX_NATIVE_REFERENCES=Object.freeze({
 ETC:{chain:'ethereum-classic',url:'https://www.okx.com/price/ethereum-classic-etc'},
 NEAR:{chain:'near',url:'https://www.okx.com/price/near-protocol-near'},
 APT:{chain:'aptos',url:'https://www.okx.com/price/aptos-apt'},
 ATOM:{chain:'cosmos',url:'https://www.okx.com/price/cosmos-atom'},
});
export function exactOkxNativeIdentity(contract,identity){
 const base=String(contract||'').replace(/-USDT$/,''),r=OKX_NATIVE_REFERENCES[base];
 return Boolean(r&&contract===base+'-USDT'&&identity?.asset_kind==='NATIVE'&&identity.chain===r.chain&&identity.native_asset_id===r.chain+':mainnet'&&!identity.contract_or_mint);
}
export function exactOkxNativeBinding({contract,identity,instrument}={}){
 return exactOkxNativeIdentity(contract,identity)&&instrument?.instId===contract&&instrument.instType==='SPOT'&&instrument.baseCcy===contract.slice(0,-5)&&instrument.quoteCcy==='USDT'&&instrument.state==='live'&&instrument.ruleType==='normal'&&!instrument.stk;
}
export function normalizeOkxNativeFlow({contract,identity,instrument,candles,pages=[],window_end_ts,observed_ts}={}){
 const start=window_end_ts-14400000,root={version:OKX_FLOW_VERSION,contract,venue:'OKX',market:'SPOT',quote:'USDT',window_start_ts:start,window_end_ts,observed_ts,status:'OKX_FULL_WINDOW_NOT_CLOSED',check_completed:false,score_contribution:0,entry_authorized:false};
 try{
  if(!exactOkxNativeBinding({contract,identity,instrument}))throw Error('EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED');
  if(candles?.code!=='0'||!Array.isArray(candles.data)||candles.data.length!==240)throw Error('NATIVE_240_MINUTE_GRID_REQUIRED');
  const decimal=v=>typeof v==='string'&&/^\d+(\.\d+)?$/.test(v)&&Number.isFinite(Number(v));
  for(const r of candles.data){if(!Array.isArray(r)||r.length!==9||r[8]!=='1')throw Error('NATIVE_CLOSED_FLAG_REQUIRED');if(!r.slice(1,8).every(decimal)||Number(r[3])<=0||Number(r[2])<Number(r[3])||[r[1],r[4]].some(v=>Number(v)<Number(r[3])||Number(v)>Number(r[2])))throw Error('INVALID_NATIVE_OHLC_OR_VOLUME');}
  let previous=null;const ids=new Set(),converted=[];
  if(!pages.length||pages.length>4)throw Error('BOUNDED_TRADE_PAGES_REQUIRED');
  for(let i=0;i<pages.length;i++){
   const p=pages[i];if(p?.code!=='0'||!Array.isArray(p.data)||p.data.length>(i===0?500:100))throw Error('INVALID_TRADE_PAGE');
   const rows=[];for(const r of p.data){const id=r?.tradeId,ts=Number(r?.ts);if(typeof id!=='string'||!/^\d+$/.test(id)||ids.has(id)||previous!==null&&BigInt(id)>=previous||r.instId!==contract||!['buy','sell'].includes(r.side)||!Number.isSafeInteger(ts)||ts<0||ts>observed_ts||!decimal(r.px)||!decimal(r.sz)||Number(r.px)<=0||Number(r.sz)<=0)throw Error('INVALID_DUPLICATE_FOREIGN_OR_NONADVANCING_TRADE');previous=BigInt(id);ids.add(id);if(ts>=start&&ts<window_end_ts)rows.push({tradeId:id,ts:r.ts,symbol:contract.slice(0,-5)+'USDT',side:r.side,price:r.px,size:r.sz});}converted.push({code:'00000',data:rows});
  }
  const flow=reconcileBitgetFlow({contract,market:'SPOT',pages:converted,candles:{code:'00000',data:candles.data.map(r=>[...r.slice(0,6),r[7],r[7]])},window_end_ts,observed_ts});
  if(!flow.check_completed)return{...root,reason:flow.reason,verified_minutes:flow.verified_minutes,trade_count:flow.trade_count,unreconciled_minutes:flow.unreconciled_minutes};
  return{...flow,...root,status:'CLOSED_NATIVE_BASE_QUOTE_RECONCILED_FOUR_HOURS',check_completed:true,exact_asset_binding:true,identity,identity_reference_url:OKX_NATIVE_REFERENCES[contract.slice(0,-5)].url,physical_root:'OKX_OFFICIAL_PUBLIC_TRADES',direction_semantics:'OFFICIAL_PUBLIC_TAKER_SIDE',source_clock_policy:'IMMUTABLE_CLOSED_WINDOW',native_closed_flags_verified:true,raw_trade_counter_independently_verified:false,large_trade_context:null};
 }catch(e){return{...root,reason:e.message};}
}
export function qualifiedOkxNativeComponent(c){return Boolean(c?.version===OKX_FLOW_VERSION&&c.venue==='OKX'&&c.market==='SPOT'&&c.quote==='USDT'&&c.status==='CLOSED_NATIVE_BASE_QUOTE_RECONCILED_FOUR_HOURS'&&c.check_completed===true&&exactOkxNativeIdentity(c.contract,c.identity)&&c.identity_reference_url===OKX_NATIVE_REFERENCES[c.contract.slice(0,-5)].url&&c.physical_root==='OKX_OFFICIAL_PUBLIC_TRADES'&&c.direction_semantics==='OFFICIAL_PUBLIC_TAKER_SIDE'&&c.source_clock_policy==='IMMUTABLE_CLOSED_WINDOW'&&c.native_closed_flags_verified===true&&c.raw_trade_counter_independently_verified===false&&c.verified_minutes===240&&Number.isSafeInteger(c.trade_count)&&c.trade_count>0&&c.score_contribution===0&&c.entry_authorized===false&&c.large_trade_context===null);}
