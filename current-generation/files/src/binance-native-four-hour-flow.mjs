// Primary venue identity references are structural, never prices or freshness receipts.
export const BINANCE_NATIVE_FLOW_VERSION='binance-native-taker-flow-v1-20261010';
export const BINANCE_NATIVE_REFERENCES=Object.freeze({
 BTC:Object.freeze({chain:'bitcoin',native_asset_id:'bitcoin:mainnet',reference_id:'BINANCE_PRIMARY_BITCOIN_BTC_20261010',url:'https://www.binance.com/en/research/projects/bitcoin'}),
 ETH:Object.freeze({chain:'ethereum',native_asset_id:'ethereum:mainnet',reference_id:'BINANCE_PRIMARY_ETHEREUM_ETH_20261010',url:'https://www.binance.com/en/research/projects/ethereum'}),
 BNB:Object.freeze({chain:'bsc',native_asset_id:'bsc:mainnet',reference_id:'BINANCE_PRIMARY_BSC_BNB_20261010',url:'https://www.binance.com/en/research/projects/bnb'}),
 ADA:Object.freeze({chain:'cardano',native_asset_id:'cardano:mainnet',reference_id:'BINANCE_PRIMARY_CARDANO_ADA_20261010',url:'https://www.binance.com/en/research/projects/cardano'}),
 APT:Object.freeze({chain:'aptos',native_asset_id:'aptos:mainnet',reference_id:'BINANCE_PRIMARY_APTOS_APT_20261010',url:'https://www.binance.com/en/research/projects/aptos'}),
 ATOM:Object.freeze({chain:'cosmos',native_asset_id:'cosmos:mainnet',reference_id:'BINANCE_PRIMARY_COSMOS_ATOM_20261010',url:'https://www.binance.com/en/research/projects/cosmos-network'}),
 LTC:Object.freeze({chain:'litecoin',native_asset_id:'litecoin:mainnet',reference_id:'BINANCE_PRIMARY_LTC_20261010',url:'https://www.binance.com/en/research/projects/litecoin'}),
 BCH:Object.freeze({chain:'bitcoin-cash',native_asset_id:'bitcoin-cash:mainnet',reference_id:'BINANCE_PRIMARY_BCH_20261010',url:'https://www.binance.com/en/research/projects/bitcoin-cash'}),
 DOGE:Object.freeze({chain:'dogecoin',native_asset_id:'dogecoin:mainnet',reference_id:'BINANCE_PRIMARY_DOGE_20261010',url:'https://www.binance.com/en/research/projects/dogecoin'}),
 ZEC:Object.freeze({chain:'zcash',native_asset_id:'zcash:mainnet',reference_id:'BINANCE_PRIMARY_ZEC_20261010',url:'https://www.binance.com/en/research/projects/zcash'}),
 XLM:Object.freeze({chain:'stellar',native_asset_id:'stellar:mainnet',reference_id:'BINANCE_PRIMARY_XLM_20261010',url:'https://www.binance.com/en/research/projects/stellar-lumens'}),
 ETC:Object.freeze({chain:'ethereum-classic',native_asset_id:'ethereum-classic:mainnet',reference_id:'BINANCE_PRIMARY_ETC_20261010',url:'https://www.binance.com/en/research/projects/ethereum-classic'}),
 NEAR:Object.freeze({chain:'near',native_asset_id:'near:mainnet',reference_id:'BINANCE_PRIMARY_NEAR_20261010',url:'https://www.binance.com/en/research/projects/near-protocol'}),
 SOL:Object.freeze({chain:'solana',native_asset_id:'solana:mainnet',reference_id:'BINANCE_PRIMARY_SOL_20261010',url:'https://www.binance.com/en/research/projects/solana'}),
 AVAX:Object.freeze({chain:'avalanche',native_asset_id:'avalanche:mainnet',reference_id:'BINANCE_PRIMARY_AVAX_20261010',url:'https://www.binance.com/en/research/projects/avalanche'}),
 DOT:Object.freeze({chain:'polkadot',native_asset_id:'polkadot:mainnet',reference_id:'BINANCE_PRIMARY_DOT_20261010',url:'https://www.binance.com/en/research/projects/polkadot'}),
 TRX:Object.freeze({chain:'tron',native_asset_id:'tron:mainnet',reference_id:'BINANCE_PRIMARY_TRX_20261010',url:'https://www.binance.com/en/research/projects/tron'}),
 XRP:Object.freeze({chain:'xrp',native_asset_id:'xrp:mainnet',reference_id:'BINANCE_PRIMARY_XRP_20261010',url:'https://www.binance.com/en/research/projects/xrp'}),
 SUI:Object.freeze({chain:'sui',native_asset_id:'sui:mainnet',reference_id:'BINANCE_PRIMARY_SUI_20261010',url:'https://www.binance.com/en/research/projects/sui'}),
 HBAR:Object.freeze({chain:'hedera',native_asset_id:'hedera:mainnet',reference_id:'BINANCE_PRIMARY_HBAR_20261010',url:'https://www.binance.com/en/research/projects/hedera-hashgraph'})
});
export function exactBinanceNativeIdentity(contract,identity){
 const base=String(contract||'').replace(/-USDT$/,''),r=BINANCE_NATIVE_REFERENCES[base];
 return Boolean(r&&contract===base+'-USDT'&&identity?.asset_kind==='NATIVE'&&identity.chain===r.chain&&identity.native_asset_id===r.native_asset_id&&!identity.contract_or_mint);
}
export function exactBinanceNativeBinding({contract,identity,catalog}={}){
 if(!exactBinanceNativeIdentity(contract,identity)||!Array.isArray(catalog?.symbols))return false;
 const base=contract.replace(/-USDT$/,''),rows=catalog.symbols.filter(r=>r.symbol===base+'USDT');
 return rows.length===1&&rows[0].baseAsset===base&&rows[0].quoteAsset==='USDT'&&rows[0].status==='TRADING'&&rows[0].isSpotTradingAllowed===true;
}
const fixed=v=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))throw Error('INVALID_DECIMAL');const [a,b='']=v.split('.');if(b.length>18)throw Error('DECIMAL_PRECISION_UNSUPPORTED');return BigInt(a+b)*10n**BigInt(18-b.length);};
const number=n=>{const v=Number(n)/1e18;if(!Number.isFinite(v))throw Error('NONFINITE_VOLUME');return v;};
export function normalizeBinanceNativeFlow({contract,identity,catalog,candles,window_end_ts,observed_ts}={}){
 const start=window_end_ts-14400000,root={version:BINANCE_NATIVE_FLOW_VERSION,contract,venue:'BINANCE',market:'SPOT',quote:'USDT',status:'NATIVE_FLOW_NOT_CLOSED',check_completed:false,window_start_ts:start,window_end_ts,observed_ts,score_contribution:0,entry_authorized:false};
 try{
  if(!exactBinanceNativeBinding({contract,identity,catalog}))throw Error('EXACT_PRIMARY_NATIVE_ASSET_BINDING_REQUIRED');
  if(!Number.isSafeInteger(window_end_ts)||window_end_ts%60000||!Number.isSafeInteger(observed_ts)||observed_ts<window_end_ts)throw Error('INVALID_CLOSED_WINDOW');
  if(!Array.isArray(candles)||candles.length!==240)throw Error('NATIVE_240_MINUTE_GRID_REQUIRED');
  const minutes=candles.map((r,i)=>{
   if(!Array.isArray(r)||r.length!==12||r[0]!==start+i*60000||r[6]!==r[0]+59999||!Number.isSafeInteger(r[8])||r[8]<0)throw Error('INVALID_OR_MISSING_CLOSED_MINUTE');
   const [open,high,low,close]=[1,2,3,4].map(j=>fixed(r[j]));
   if(low<=0n||open<low||open>high||close<low||close>high||high<low)throw Error('INVALID_OHLC');
   const base=fixed(r[5]),total=fixed(r[7]),buyBase=fixed(r[9]),buy=fixed(r[10]);
   if(buy>total||buyBase>base||(r[8]===0&&(base||total||buy||buyBase))||(r[8]>0&&(!base||!total)))throw Error('INVALID_NATIVE_TAKER_VOLUME');
   return{ts:r[0],buy,sell:total-buy,count:r[8]};
  });
  const sum=length=>{const a=minutes.slice(-length),buy=a.reduce((n,r)=>n+r.buy,0n),sell=a.reduce((n,r)=>n+r.sell,0n),count=a.reduce((n,r)=>n+r.count,0);if(!Number.isSafeInteger(count))throw Error('INVALID_NATIVE_TRADE_COUNT');return{minutes:length,window_start_ts:window_end_ts-length*60000,window_end_ts,buy_quote:number(buy),sell_quote:number(sell),trade_count:count,imbalance:buy+sell?Number(buy-sell)/Number(buy+sell):null};};
  const full=sum(240);if(full.buy_quote+full.sell_quote<=0)throw Error('NO_TRADED_VOLUME');
  return{...root,...full,status:'CLOSED_NATIVE_TAKER_CANDLES_FOUR_HOURS',check_completed:true,verified_minutes:240,exact_asset_binding:true,identity,identity_reference_id:BINANCE_NATIVE_REFERENCES[contract.replace(/-USDT$/,'')].reference_id,physical_root:'BINANCE_OFFICIAL_SPOT_KLINES',direction_semantics:'OFFICIAL_KLINE_TAKER_BUY_QUOTE',source_clock_policy:'IMMUTABLE_CLOSED_WINDOW',native_trade_count_verified:true,large_individual_trades_available:false,large_trade_context:null,recent_windows:[sum(15),sum(60)],native_aggregate_not_individual_trades:true};
 }catch(e){return{...root,reason:e.message};}
}
export function qualifiedBinanceNativeComponent(c){
 return Boolean(c?.version===BINANCE_NATIVE_FLOW_VERSION&&c.status==='CLOSED_NATIVE_TAKER_CANDLES_FOUR_HOURS'&&c.check_completed===true&&exactBinanceNativeIdentity(c.contract,c.identity)&&c.identity_reference_id===BINANCE_NATIVE_REFERENCES[c.contract.replace(/-USDT$/,'')].reference_id&&c.physical_root==='BINANCE_OFFICIAL_SPOT_KLINES'&&c.direction_semantics==='OFFICIAL_KLINE_TAKER_BUY_QUOTE'&&c.source_clock_policy==='IMMUTABLE_CLOSED_WINDOW'&&c.native_trade_count_verified===true&&Number.isSafeInteger(c.trade_count)&&c.trade_count>0&&c.large_individual_trades_available===false&&c.large_trade_context===null&&c.score_contribution===0&&c.entry_authorized===false);
}
