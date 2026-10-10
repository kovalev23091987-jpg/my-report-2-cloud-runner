export const POLONIEX_FLOW_VERSION='poloniex-native-taker-flow-v1-20261010';
export const POLONIEX_ASSET_REFERENCE='https://api.poloniex.com/v2/currencies';
export const POLONIEX_CANDLE_REFERENCE='https://api-docs.poloniex.com/spot/api/public/market-data';
const tokenChains={ETH:'ethereum',ERC20:'ethereum',BSC:'bsc',BEP20:'bsc',SOL:'solana',SOLANA:'solana',ARBITRUM:'arbitrum',BASE:'base',OPTIMISM:'optimism',POLYGON:'polygon',AVAX:'avalanche'};
const nativeChains={BTC:'bitcoin',ETH:'ethereum',DOGE:'dogecoin',LTC:'litecoin',BCH:'bitcoin-cash',ZEC:'zcash',ETC:'ethereum-classic',XLM:'stellar',NEAR:'near',ADA:'cardano',ATOM:'cosmos',SOL:'solana',BNB:'bsc',BSC:'bsc',AVAX:'avalanche',DOT:'polkadot',TRX:'tron',XRP:'xrp',HBAR:'hedera',APT:'aptos',SUI:'sui'};
const evm=/^0x[0-9a-f]{40}$/i,sol=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function eligiblePoloniexIdentity(contract,identity){
 const base=String(contract||'').replace(/-USDT$/,'');
 if(!base||contract!==base+'-USDT'||!identity)return false;
 if(identity.asset_kind==='NATIVE')return nativeChains[base]===identity.chain&&identity.native_asset_id===identity.chain+':mainnet'&&!identity.contract_or_mint;
 return Object.values(tokenChains).includes(identity.chain)&&(identity.chain==='solana'?sol.test(identity.contract_or_mint||''):evm.test(identity.contract_or_mint||''));
}
export function exactPoloniexBinding({contract,identity,assets,markets}={}){
 if(!eligiblePoloniexIdentity(contract,identity)||!Array.isArray(assets)||!Array.isArray(markets))return false;
 const base=contract.slice(0,-5),a=assets.filter(r=>r.coin===base),m=markets.filter(r=>r.symbol===base+'_USDT');
 if(a.length!==1||m.length!==1||a[0].delisted!==false||a[0].tradeEnable!==true||m[0].state!=='NORMAL'||m[0].baseCurrencyName!==base||m[0].quoteCurrencyName!=='USDT'||m[0].symbolTradeLimit?.symbol!==base+'_USDT')return false;
 const matches=(a[0].networkList||[]).filter(r=>identity.asset_kind==='NATIVE'?nativeChains[r.blockchain]===identity.chain&&!r.contractAddress:tokenChains[r.blockchain]===identity.chain&&typeof r.contractAddress==='string'&&(identity.chain==='solana'?r.contractAddress===identity.contract_or_mint:r.contractAddress.toLowerCase()===identity.contract_or_mint.toLowerCase()));
 return matches.length===1;
}
const dec=v=>{if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v))throw Error('INVALID_DECIMAL');const[a,b='']=v.split('.');if(b.length>18)throw Error('DECIMAL_PRECISION_UNSUPPORTED');return{n:BigInt(a+b)*10n**BigInt(18-b.length),unit:10n**BigInt(18-b.length)};};
const num=n=>{const v=Number(n)/1e18;if(!Number.isFinite(v))throw Error('NONFINITE_VOLUME');return v;};
export function normalizePoloniexNativeFlow({contract,identity,assets,markets,candles,window_end_ts,observed_ts}={}){
 const start=window_end_ts-14400000,root={version:POLONIEX_FLOW_VERSION,contract,venue:'POLONIEX',market:'SPOT',quote:'USDT',status:'POLONIEX_NATIVE_WINDOW_NOT_CLOSED',check_completed:false,window_start_ts:start,window_end_ts,observed_ts,score_contribution:0,entry_authorized:false};
 try{
  if(!exactPoloniexBinding({contract,identity,assets,markets}))throw Error('EXACT_PRIMARY_CHAIN_ADDRESS_BINDING_REQUIRED');
  if(!Number.isSafeInteger(window_end_ts)||window_end_ts%60000||!Number.isSafeInteger(observed_ts)||observed_ts<window_end_ts)throw Error('INVALID_CLOSED_WINDOW');
  if(!Array.isArray(candles)||candles.length!==240)throw Error('NATIVE_240_CLOSED_MINUTE_GRID_REQUIRED');
  const map=new Map();
  for(const r of candles){
   if(!Array.isArray(r)||r.length!==14||r[11]!=='MINUTE_1'||!Number.isSafeInteger(r[12])||r[12]%60000||r[12]<start||r[12]>=window_end_ts||r[13]!==r[12]+59999||map.has(r[12])||!Number.isSafeInteger(r[8])||r[8]<0||!Number.isSafeInteger(r[9])||r[9]>observed_ts||r[9]<r[12])throw Error('INVALID_DUPLICATE_OPEN_OR_FOREIGN_NATIVE_MINUTE');
   const [low,high,open,close]=r.slice(0,4).map(v=>dec(v).n),[total,base,buy,buyBase]=r.slice(4,8).map(dec),vwap=dec(r[10]).n;
   if(low<=0n||high<low||open<low||open>high||close<low||close>high)throw Error('INVALID_NATIVE_OHLC');
   if(buy.n>total.n||buyBase.n>base.n||r[8]===0&&(total.n||base.n||buy.n||buyBase.n)||r[8]>0&&(!total.n||!base.n||vwap<low||vwap>high))throw Error('INVALID_NATIVE_TAKER_VOLUME_OR_COUNT');
   const bound=(q,b)=>q.n*10n**18n+q.unit*10n**18n>=b.n*low&&q.n*10n**18n-q.unit*10n**18n<=b.n*high;
   if(!bound(total,base)||!bound(buy,buyBase)||!bound({n:total.n-buy.n,unit:total.unit+buy.unit},{n:base.n-buyBase.n}))throw Error('NATIVE_QUOTE_AMOUNT_OUTSIDE_PRICE_RANGE');
   map.set(r[12],{buy:buy.n,sell:total.n-buy.n,count:r[8]});
  }
  const minutes=Array.from({length:240},(_,i)=>{const r=map.get(start+i*60000);if(!r)throw Error('MISSING_NATIVE_CLOSED_MINUTE');return r;});
  const sum=n=>{const a=minutes.slice(-n),buy=a.reduce((v,r)=>v+r.buy,0n),sell=a.reduce((v,r)=>v+r.sell,0n),count=a.reduce((v,r)=>v+r.count,0);if(!Number.isSafeInteger(count))throw Error('INVALID_NATIVE_TOTAL_COUNT');return{minutes:n,window_start_ts:window_end_ts-n*60000,window_end_ts,buy_quote:num(buy),sell_quote:num(sell),trade_count:count,imbalance:buy+sell?Number(buy-sell)/Number(buy+sell):null};};
  const full=sum(240);if(full.buy_quote+full.sell_quote<=0)throw Error('NO_TRADED_VOLUME');
  return{...root,...full,status:'CLOSED_NATIVE_TAKER_CANDLES_FOUR_HOURS',check_completed:true,verified_minutes:240,exact_asset_binding:true,identity,identity_reference_url:POLONIEX_ASSET_REFERENCE,identity_binding:'PRIMARY_CURRENCY_NETWORK_AND_EXACT_ADDRESS',physical_root:'POLONIEX_OFFICIAL_SPOT_CANDLES',direction_semantics:'OFFICIAL_NATIVE_BUY_TAKER_QUOTE_AMOUNT',source_clock_policy:'IMMUTABLE_CLOSED_WINDOW',native_trade_count_verified:true,native_aggregate_not_individual_trades:true,large_individual_trades_available:false,large_trade_context:null,recent_windows:[sum(15),sum(60)],not_onchain_exchange_flows:true};
 }catch(e){return{...root,reason:e.message};}
}
export function qualifiedPoloniexNativeComponent(c){return Boolean(c?.version===POLONIEX_FLOW_VERSION&&c.venue==='POLONIEX'&&c.market==='SPOT'&&c.quote==='USDT'&&c.status==='CLOSED_NATIVE_TAKER_CANDLES_FOUR_HOURS'&&c.check_completed===true&&c.verified_minutes===240&&c.exact_asset_binding===true&&eligiblePoloniexIdentity(c.contract,c.identity)&&c.identity_reference_url===POLONIEX_ASSET_REFERENCE&&c.identity_binding==='PRIMARY_CURRENCY_NETWORK_AND_EXACT_ADDRESS'&&c.physical_root==='POLONIEX_OFFICIAL_SPOT_CANDLES'&&c.direction_semantics==='OFFICIAL_NATIVE_BUY_TAKER_QUOTE_AMOUNT'&&c.source_clock_policy==='IMMUTABLE_CLOSED_WINDOW'&&c.native_trade_count_verified===true&&Number.isSafeInteger(c.trade_count)&&c.trade_count>0&&c.large_individual_trades_available===false&&c.large_trade_context===null&&c.score_contribution===0&&c.entry_authorized===false);}
