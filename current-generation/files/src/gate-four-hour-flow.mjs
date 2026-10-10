import {reconcileBitgetFlow} from './bitget-four-hour-flow.mjs';
export const GATE_FLOW_VERSION='gate-exact-taker-flow-v1-20261010';
const chains={ETH:'ethereum',ERC20:'ethereum',SOL:'solana',BSC:'bsc',BEP20:'bsc',ARBITRUM:'arbitrum',ARBITRUMONE:'arbitrum',BASE:'base',OP:'optimism',OPTIMISM:'optimism',MATIC:'polygon',POLYGON:'polygon',AVAX_C:'avalanche'};
const address=(chain,v)=>typeof v==='string'&&(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v):/^0x[0-9a-fA-F]{40}$/.test(v))?(chain==='solana'?v:v.toLowerCase()):null;
const decimal=v=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))throw Error('INVALID_DECIMAL');const [a,b='']=v.split('.');if(b.length>18)throw Error('DECIMAL_PRECISION_UNSUPPORTED');return BigInt(a+b)*10n**BigInt(18-b.length);};
const id=v=>typeof v==='string'&&/^\d+$/.test(v)?v:typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?String(v):null;
export function exactGateTokenBinding({contract,identity,currencies,spot}={}){
 const base=String(contract||'').replace(/-USDT$/,''),a=address(identity?.chain,identity?.contract_or_mint);
 if(!a||identity?.asset_kind==='NATIVE'||contract!==base+'-USDT'||!Array.isArray(currencies)||!Array.isArray(spot))return false;
 const markets=spot.filter(r=>r.id===base+'_USDT');if(markets.length!==1||markets[0].base!==base||markets[0].quote!=='USDT'||markets[0].trade_status!=='tradable')return false;
 const rows=currencies.filter(r=>r.currency===base);if(rows.length!==1||rows[0].delisted||rows[0].trade_disabled)return false;
 return(rows[0].chains||[]).filter(r=>chains[r.name]===identity.chain&&address(identity.chain,r.addr)===a).length===1;
}
export function matchGatePublicRestDirection({messages,rest,pair}={}){
 const root={status:'GATE_REST_TAKER_DIRECTION_NOT_PROVEN',verified:false,pair,matches:[],score_contribution:0,entry_authorized:false};
 try{
  if(!/^\S+_USDT$/u.test(pair||'')||!Array.isArray(messages)||!Array.isArray(rest))throw Error('INVALID_PUBLIC_DIRECTION_INPUT');
  const seen=new Set(),matches=[];let candidates=0;
  for(const m of messages){if(m.channel!=='spot.trades'||m.event!=='update')continue;const w=m.result;
   if(w?.currency_pair!==pair||w.money&&w.money!=='USDT'||w.stock&&w.stock!==pair.slice(0,-5)||w.trade_mode&&w.trade_mode!==0||!['buy','sell'].includes(w.side))continue;
   const key=id(w.id_market);if(!key||seen.has(key))continue;
   if(w.range&&w.range!==key+'-'+key)continue;seen.add(key);candidates++;
   const rows=rest.filter(r=>id(r.sequence_id??r.id)===key);if(!rows.length)continue;if(rows.length!==1)throw Error('AMBIGUOUS_REST_TRADE_ID');const r=rows[0];
   if(r.currency_pair!==pair||r.trade_quote&&r.trade_quote!=='USDT'||r.role&&r.role!=='taker'||r.side!==w.side||decimal(r.create_time_ms)!==decimal(w.create_time_ms)||decimal(r.price)!==decimal(w.price)||decimal(r.amount)!==decimal(w.amount))throw Error('SAME_TRADE_DIRECTION_OR_FIELDS_MISMATCH');
   matches.push({rest_id:id(r.id),rest_sequence_id:key,websocket_id:id(w.id),websocket_id_market:key,side:r.side,create_time_ms:r.create_time_ms,amount:r.amount,price:r.price});
  }
  if(matches.length<10||new Set(matches.map(r=>r.side)).size!==2)throw Error('BOTH_SIDES_AND_TEN_EXACT_MATCHES_REQUIRED');
  return{...root,status:'GATE_REST_PUBLIC_TAKER_DIRECTION_PAIRED_PROVEN',verified:true,candidates,matches,id_mapping:'WEBSOCKET_ID_MARKET_TO_REST_SEQUENCE_ID_OR_ID',matched_count:matches.length,side_semantics:'PUBLIC_WEBSOCKET_OFFICIAL_TAKER_SIDE_SAME_EXACT_REST_TRADES',documentation:'https://www.gate.com/docs/developers/apiv4/ws/en/#public-trades-channel',observed_pair_only_not_all_market_census:true};
 }catch(e){return{...root,reason:e.message};}
}
export function normalizeGateSpotFlow({contract,identity,currencies,spot,pages=[],candles,window_end_ts,observed_ts,direction_reference}={}){
 const root={version:GATE_FLOW_VERSION,status:'GATE_FLOW_NOT_CLOSED',venue:'GATE',market:'SPOT',contract,check_completed:false,score_contribution:0,entry_authorized:false};
 try{
  if(!direction_reference?.verified||!direction_reference.reference_id||direction_reference.status!=='GATE_REST_PUBLIC_TAKER_DIRECTION_PAIRED_PROVEN')throw Error('GATE_PRIMARY_PAIRED_TAKER_DIRECTION_PROOF_REQUIRED');
  if(!exactGateTokenBinding({contract,identity,currencies,spot}))throw Error('EXACT_GATE_CHAIN_ADDRESS_REQUIRED');
  if(!Array.isArray(candles)||candles.length!==240||candles.some(r=>!Array.isArray(r)||r.length!==8||r[7]!=='true'))throw Error('GATE_240_NATIVE_CLOSED_MINUTES_REQUIRED');
  const base=contract.slice(0,-5),mapped=[];
  for(const page of pages){if(!Array.isArray(page)||page.length>1000)throw Error('INVALID_GATE_TRADE_PAGE');
   mapped.push({code:'00000',data:page.map(r=>{
    if(r.currency_pair!==base+'_USDT'||r.trade_quote&&r.trade_quote!=='USDT'||r.money&&r.money!=='USDT'||r.stock&&r.stock!==base||r.trade_mode&&r.trade_mode!==0||r.role&&r.role!=='taker'||!id(r.id)||typeof r.create_time_ms!=='string'||!/^\d+(\.\d+)?$/.test(r.create_time_ms))throw Error('FOREIGN_UNIFIED_OR_INVALID_GATE_TRADE');
    return{tradeId:id(r.id),ts:String(Number(BigInt(r.create_time_ms.split('.')[0]))),symbol:base+'USDT',side:r.side,size:r.amount,price:r.price};})});
  }
  const native={code:'00000',data:candles.map(r=>[String(Number(r[0])*1000),r[5],r[3],r[4],r[2],r[6],r[1],r[1]])},flow=reconcileBitgetFlow({contract,market:'SPOT',pages:mapped,candles:native,window_end_ts,observed_ts});
  return{...flow,...root,status:flow.check_completed?'CLOSED_GATE_RECONCILED_TAKER_FOUR_HOURS':root.status,check_completed:flow.check_completed,reason:flow.reason,identity,exact_asset_binding:true,quote:'USDT',physical_root:'GATE_OFFICIAL_PUBLIC_TRADES',direction_semantics:'PAIRED_PUBLIC_REST_TAKER_SIDE',direction_reference_id:direction_reference.reference_id,raw_trade_counter_independently_verified:false,large_individual_trades_available:flow.check_completed===true};
 }catch(e){return{...root,reason:e.message};}
}
export function qualifiedGateSpotComponent(c,direction_reference){
 return Boolean(c?.version===GATE_FLOW_VERSION&&c.status==='CLOSED_GATE_RECONCILED_TAKER_FOUR_HOURS'&&c.check_completed===true&&c.venue==='GATE'&&c.market==='SPOT'&&c.physical_root==='GATE_OFFICIAL_PUBLIC_TRADES'&&c.direction_semantics==='PAIRED_PUBLIC_REST_TAKER_SIDE'&&direction_reference?.verified===true&&c.direction_reference_id===direction_reference.reference_id&&address(c.identity?.chain,c.identity?.contract_or_mint)&&c.identity.asset_kind!=='NATIVE'&&c.exact_asset_binding===true&&c.score_contribution===0&&c.entry_authorized===false);
}
