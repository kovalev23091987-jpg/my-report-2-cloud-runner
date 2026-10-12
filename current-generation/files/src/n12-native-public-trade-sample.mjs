import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {BINANCE_NATIVE_REFERENCES} from './binance-native-four-hour-flow.mjs';

export const N12_NATIVE_PUBLIC_TRADE_VERSION='n12-native-public-trade-sample-v1-20261012';
const WINDOW=300000,TTL=60000;
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const tradeId=x=>typeof x==='string'&&/^\d{1,32}$/.test(x)?x:null;
const NATIVE={...BINANCE_NATIVE_REFERENCES,XMR:{chain:'monero',native_asset_id:'monero:mainnet'}};
export const N12_NATIVE_BASES=Object.freeze(Object.keys(NATIVE));
const marketBase=(venue,market,base)=>venue==='KUCOIN'&&market==='FUTURES'&&base==='BTC'?'XBT':base;

// KuCoin publishes nanosecond timestamps as JSON numbers. Preserve their
// decimal digits before JSON.parse: an ordinary JS Number cannot hold them.
export function parseN12PublicTradeJson(body,{venue}={}){
 const text=String(body||'');
 if(venue!=='KUCOIN')return JSON.parse(text);
 return JSON.parse(text.replace(/"(time|ts)"\s*:\s*(\d{16,20})(?=\s*[,}])/g,'"$1":"$2"'));
}

export function exactN12NativePublicBinding({venue,market,contract,identity,instrument}={}){
 const base=String(contract||'').replace(/-USDT$/,''),reference=NATIVE[base],symbolBase=marketBase(venue,market,base);
 if(!['OKX','KUCOIN'].includes(venue)||!['SPOT','FUTURES'].includes(market)||!reference||contract!==base+'-USDT'||identity?.asset_kind!=='NATIVE'||identity.chain!==reference.chain||identity.native_asset_id!==reference.native_asset_id||identity.contract_or_mint)return false;
 if(venue==='OKX'&&market==='SPOT')return instrument?.instId===base+'-USDT'&&instrument?.instType==='SPOT'&&instrument?.state==='live'&&String(instrument?.instCategory)==='1'&&instrument?.baseCcy===base&&instrument?.quoteCcy==='USDT';
 if(venue==='OKX')return instrument?.instId===base+'-USDT-SWAP'&&instrument?.instType==='SWAP'&&instrument?.state==='live'&&String(instrument?.instCategory)==='1'&&instrument?.ctType==='linear'&&instrument?.settleCcy==='USDT'&&instrument?.ctValCcy===base&&finite(instrument?.ctVal)>0&&finite(instrument?.ctMult)>0;
 if(market==='SPOT')return instrument?.symbol===base+'-USDT'&&instrument?.baseCurrency===base&&instrument?.quoteCurrency==='USDT'&&instrument?.enableTrading===true;
 return instrument?.symbol===symbolBase+'USDTM'&&instrument?.baseCurrency===symbolBase&&instrument?.quoteCurrency==='USDT'&&instrument?.settleCurrency==='USDT'&&instrument?.status==='Open'&&instrument?.marketStage==='NORMAL'&&finite(instrument?.multiplier)>0;
}

const kucoinMs=x=>{
 if(typeof x!=='string'||!/^\d{19}$/.test(x))return null;
 const ns=BigInt(x),ms=ns/1000000n;
 return ms<=BigInt(Number.MAX_SAFE_INTEGER)?Number(ms):null;
};

export function exactN12NativeIdentity(contract,identity){
 const base=String(contract||'').replace(/-USDT$/,''),reference=NATIVE[base];
 return Boolean(reference&&contract===base+'-USDT'&&identity?.asset_kind==='NATIVE'&&identity.chain===reference.chain&&identity.native_asset_id===reference.native_asset_id&&!identity.contract_or_mint);
}

export function normalizeN12NativePublicTrades({venue,market,contract,identity,instrument,payload,window_end_ts,observed_ts}={}){
 const root={version:N12_NATIVE_PUBLIC_TRADE_VERSION,status:'EXACT_NATIVE_PUBLIC_TRADE_PAGE_REQUIRED',check_completed:false,evidence:[],summary:null,network_calls:0,internal_only:true};
 if(!exactN12NativePublicBinding({venue,market,contract,identity,instrument})||!Number.isSafeInteger(window_end_ts)||window_end_ts%60000||!Number.isSafeInteger(observed_ts)||observed_ts<window_end_ts||observed_ts-window_end_ts>120000||!Array.isArray(payload?.data)||payload.data.length>500||payload.code!==(venue==='OKX'?'0':'200000'))return root;
 const base=contract.slice(0,-5),symbolBase=marketBase(venue,market,base),expected=venue==='OKX'?base+'-USDT'+(market==='FUTURES'?'-SWAP':''):symbolBase+(market==='SPOT'?'-USDT':'USDTM');
 const multiplier=market==='SPOT'?1:finite(venue==='OKX'?instrument.ctVal*instrument.ctMult:instrument.multiplier);
 if(!(multiplier>0))return root;
 const counts=new Map();
 for(const row of payload.data){const id=tradeId(row?.tradeId??row?.sequence);if(id)counts.set(id,(counts.get(id)||0)+1);}
 const accepted=[];let rejected=0;
 for(const row of payload.data){
  const id=tradeId(row?.tradeId??row?.sequence),ts=venue==='KUCOIN'?kucoinMs(row?.[market==='SPOT'?'time':'ts']):finite(row?.ts),price=finite(venue==='OKX'?row?.px:row?.price),size=finite(venue==='OKX'?row?.sz:row?.size),side=String(row?.side||'').toLowerCase(),quote=price===null||size===null?null:price*size*multiplier;
  if(!id||counts.get(id)!==1||(venue==='OKX'&&row?.instId!==expected)||!Number.isSafeInteger(ts)||ts<window_end_ts-WINDOW||ts>=window_end_ts||ts>observed_ts||!(price>0&&size>0&&quote>0&&Number.isFinite(quote))||!['buy','sell'].includes(side)){rejected++;continue;}
  accepted.push({id,ts,side,quote});
 }
 const buy=accepted.filter(x=>x.side==='buy').reduce((n,x)=>n+x.quote,0),sell=accepted.filter(x=>x.side==='sell').reduce((n,x)=>n+x.quote,0),total=buy+sell;
 const summary={venue,market,returned_rows:payload.data.length,valid_recent_rows:accepted.length,rejected_rows:rejected,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,observed_quote_turnover_usdt:total,taker_imbalance:total?(buy-sell)/total:null,contract_multiplier:multiplier,whole_window_coverage_proven:false,window_start:window_end_ts-WINDOW,window_end:window_end_ts};
 if(!accepted.length)return{...root,status:payload.data.length?'TRADE_VALIDATION_NOT_CLOSED':'CLOSED_EMPTY_BOUNDED_SAMPLE',summary,check_completed:payload.data.length===0};
 const latest=accepted.reduce((a,b)=>a.ts>b.ts?a:b),physical=`${venue}_N12_NATIVE_TRADE_SAMPLE:${contract}:${market}:${latest.id}`;
 if(latest.ts+WINDOW<=observed_ts)return{...root,status:'SOURCE_SAMPLE_EXPIRED',summary};
 const evidence=buildEvidenceV2({provider_id:`${venue}_${market}_TRADES`,upstream_id:`${venue}_OFFICIAL_PUBLIC_${market}_TRADES`,asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_NATIVE_PUBLIC_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:latest.ts,observed_ts,expires_at:Math.min(observed_ts+TTL,latest.ts+WINDOW),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,unit:'USDT',value:total,extra:{physical_root_key:physical,venue,market,independent_venue_root:venue,exact_asset_binding:true,identity,source_symbol:expected,contract_multiplier:multiplier,source_clock_policy:venue==='KUCOIN'?'ORIGINAL_KUCOIN_NANOSECONDS':'ORIGINAL_OKX_MILLISECONDS',valid_recent_rows:accepted.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:summary.taker_imbalance,whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false}});
 return{...root,status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,evidence:[evidence],summary};
}

export function validateN12NativePublicTrade(row,now){
 const buy=finite(row?.buy_quote_turnover_usdt),sell=finite(row?.sell_quote_turnover_usdt),total=finite(row?.value),base=String(row?.htx_contract||'').replace(/-USDT$/,''),reference=NATIVE[base],venue=row?.venue,market=row?.market;
 return ['OKX','KUCOIN'].includes(venue)&&['SPOT','FUTURES'].includes(market)&&row.block_id==='N12'&&row.metric_family==='ACTUAL_NATIVE_PUBLIC_TAKER_TRADES_BOUNDED'&&row.provider_id===`${venue}_${market}_TRADES`&&row.upstream_id===`${venue}_OFFICIAL_PUBLIC_${market}_TRADES`&&row.independent_venue_root===venue&&row.exact_asset_binding===true&&reference&&row.identity?.asset_kind==='NATIVE'&&row.identity.chain===reference.chain&&row.identity.native_asset_id===reference.native_asset_id&&!row.identity.contract_or_mint&&row.source_symbol===(venue==='OKX'?base+'-USDT'+(market==='FUTURES'?'-SWAP':''):marketBase(venue,market,base)+(market==='SPOT'?'-USDT':'USDTM'))&&row.source_clock_policy===(venue==='KUCOIN'?'ORIGINAL_KUCOIN_NANOSECONDS':'ORIGINAL_OKX_MILLISECONDS')&&row.coverage_status==='BOUNDED_DIRECTIONAL_SAMPLE'&&row.coverage_fraction===0&&row.directional_strength===null&&row.whole_window_coverage_proven===false&&row.score_contribution===0&&row.entry_authorized===false&&row.unit==='USDT'&&Number.isSafeInteger(row.valid_recent_rows)&&row.valid_recent_rows>0&&buy!==null&&sell!==null&&buy>=0&&sell>=0&&total>0&&Math.abs(buy+sell-total)<=Math.max(.000001,total*.000001)&&Math.abs((buy-sell)/total-row.taker_imbalance)<=1e-9&&finite(row.contract_multiplier)>0&&row.origin_event_id===row.physical_root_key&&String(row.origin_event_id).startsWith(`${venue}_N12_NATIVE_TRADE_SAMPLE:${row.htx_contract}:${market}:`)&&Number.isSafeInteger(row.source_ts)&&row.source_ts<=now&&now-row.source_ts<=WINDOW&&row.expires_at>now;
}
