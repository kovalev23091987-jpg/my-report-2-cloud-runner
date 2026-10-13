import {verifiedAssetRouteIdentity} from './verified-asset-route-identity.mjs';
import {buildEvidenceV2} from './evidence-source-adapters.mjs';
import {approvedHtxAnalysisAssetForContract,APPROVED_HTX_ANALYSIS_CONTRACTS} from './approved-htx-analysis-scope.mjs';

export const N12_KUCOIN_TOKEN_TRADE_VERSION='n12-kucoin-exact-token-trade-v1-20261012';
const chainIds=Object.freeze({eth:'ethereum',bsc:'bsc',base:'base',sol:'solana',optimism:'optimism',arbitrum:'arbitrum'});
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const address=(chain,value)=>chain==='solana'?String(value||''):String(value||'').toLowerCase();
const validAddress=(chain,value)=>chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value||''):/^0x[0-9a-f]{40}$/.test(String(value||''));
export const N12_APPROVED_BASES=Object.freeze(APPROVED_HTX_ANALYSIS_CONTRACTS.map(row=>row.asset_symbol));

export function exactN12KucoinTokenIdentity(contract,identity,method,asset_binding_proof){
 const base=approvedHtxAnalysisAssetForContract(contract),chain=identity?.chain,mint=address(chain,identity?.contract_or_mint);
 return Boolean(base&&identity?.asset_kind!=='NATIVE'&&verifiedAssetRouteIdentity({contract,asset_identity:identity,identity_method:method,asset_binding_proof})&&Object.values(chainIds).includes(chain)&&validAddress(chain,mint));
}
export function compactN12KucoinTokenCurrencies(payload){
 if(payload?.code!=='200000'||!Array.isArray(payload.data))return null;
 const allowed=new Set(N12_APPROVED_BASES);
 return{code:payload.code,data:payload.data.filter(row=>allowed.has(row?.currency)).map(row=>({currency:row.currency,chains:(Array.isArray(row.chains)?row.chains:[]).filter(c=>Object.hasOwn(chainIds,c?.chainId)&&typeof c.contractAddress==='string'&&c.contractAddress).map(c=>({chainId:c.chainId,contractAddress:c.contractAddress}))}))};
}
export function exactN12KucoinTokenCurrency({contract,identity,identity_method,asset_binding_proof,currencies}={}){
 if(!exactN12KucoinTokenIdentity(contract,identity,identity_method,asset_binding_proof)||currencies?.code!=='200000'||!Array.isArray(currencies?.data))return false;
 const base=contract.slice(0,-5),rows=currencies.data.filter(row=>row?.currency===base);if(rows.length!==1)return false;
 const matching=(rows[0].chains||[]).filter(row=>chainIds[row?.chainId]===identity.chain&&address(identity.chain,row?.contractAddress)===address(identity.chain,identity.contract_or_mint));
 return matching.length===1;
}
export function exactN12KucoinTokenMarket({contract,market,instrument}={}){
 const base=approvedHtxAnalysisAssetForContract(contract);if(!base||!['SPOT','FUTURES'].includes(market))return false;
 if(market==='SPOT')return instrument?.symbol===base+'-USDT'&&instrument?.baseCurrency===base&&instrument?.quoteCurrency==='USDT'&&instrument?.enableTrading===true;
 return instrument?.symbol===base+'USDTM'&&instrument?.baseCurrency===base&&instrument?.quoteCurrency==='USDT'&&instrument?.settleCurrency==='USDT'&&instrument?.status==='Open'&&instrument?.marketStage==='NORMAL'&&finite(instrument?.multiplier)>0;
}
export function normalizeN12KucoinTokenTrades({contract,market,identity,identity_method,asset_binding_proof,currencies,instrument,payload,window_end_ts,observed_ts}={}){
 const root={version:N12_KUCOIN_TOKEN_TRADE_VERSION,status:'EXACT_KUCOIN_TOKEN_TRADE_PAGE_REQUIRED',check_completed:false,evidence:[],summary:null,network_calls:0,internal_only:true};
 if(!exactN12KucoinTokenCurrency({contract,identity,identity_method,asset_binding_proof,currencies})||!exactN12KucoinTokenMarket({contract,market,instrument})||payload?.code!=='200000'||!Array.isArray(payload.data)||payload.data.length>100||!Number.isSafeInteger(window_end_ts)||window_end_ts%60000||!Number.isSafeInteger(observed_ts)||observed_ts<window_end_ts||observed_ts-window_end_ts>120000)return root;
 const multiplier=market==='SPOT'?1:finite(instrument.multiplier),counts=new Map();if(!(multiplier>0))return root;
 for(const row of payload.data){const id=row?.tradeId??row?.sequence;if(typeof id==='string'&&/^\d{1,32}$/.test(id))counts.set(id,(counts.get(id)||0)+1);}
 const accepted=[];let rejected=0;
 for(const row of payload.data){const id=row?.tradeId??row?.sequence,raw=row?.[market==='SPOT'?'time':'ts'],ns=typeof raw==='string'&&/^\d{19}$/.test(raw)?BigInt(raw):null,ts=ns===null?null:Number(ns/1000000n),price=finite(row?.price),size=finite(row?.size),quote=price===null||size===null?null:price*size*multiplier;
  if(typeof id!=='string'||counts.get(id)!==1||!Number.isSafeInteger(ts)||ts<window_end_ts-300000||ts>=window_end_ts||ts>observed_ts||!['buy','sell'].includes(row?.side)||!(price>0&&size>0&&quote>0&&Number.isFinite(quote))){rejected++;continue;}accepted.push({id,ts,side:row.side,quote});}
 const buy=accepted.filter(row=>row.side==='buy').reduce((n,row)=>n+row.quote,0),sell=accepted.filter(row=>row.side==='sell').reduce((n,row)=>n+row.quote,0),total=buy+sell,summary={venue:'KUCOIN',market,returned_rows:payload.data.length,valid_recent_rows:accepted.length,rejected_rows:rejected,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,observed_quote_turnover_usdt:total,taker_imbalance:total?(buy-sell)/total:null,contract_multiplier:multiplier,whole_window_coverage_proven:false,window_start:window_end_ts-300000,window_end:window_end_ts};
 if(!accepted.length)return{...root,status:payload.data.length?'TRADE_VALIDATION_NOT_CLOSED':'CLOSED_EMPTY_BOUNDED_SAMPLE',summary,check_completed:payload.data.length===0};
 const latest=accepted.reduce((a,b)=>a.ts>b.ts?a:b);if(latest.ts+300000<=observed_ts)return{...root,status:'SOURCE_SAMPLE_EXPIRED',summary};
 const physical=`KUCOIN_N12_TOKEN_TRADE_SAMPLE:${contract}:${market}:${latest.id}`,symbol=market==='SPOT'?contract:contract.slice(0,-5)+'USDTM';
 const evidence=buildEvidenceV2({provider_id:`KUCOIN_${market}_TRADES`,upstream_id:`KUCOIN_OFFICIAL_PUBLIC_${market}_TRADES`,asset_id:`HTX:${contract}`,htx_contract:contract,block_id:'N12',metric_family:'ACTUAL_KUCOIN_TOKEN_TAKER_TRADES_BOUNDED',origin_event_id:physical,dependency_group:physical,source_ts:latest.ts,observed_ts,expires_at:Math.min(observed_ts+60000,latest.ts+300000),coverage_status:'BOUNDED_DIRECTIONAL_SAMPLE',coverage_fraction:0,directional_strength:null,unit:'USDT',value:total,extra:{physical_root_key:physical,venue:'KUCOIN',market,independent_venue_root:'KUCOIN',exact_asset_binding:true,identity:{asset_kind:'TOKEN',chain:identity.chain,contract_or_mint:address(identity.chain,identity.contract_or_mint)},identity_method,...(asset_binding_proof?{asset_binding_proof}:{}),source_symbol:symbol,source_clock_policy:'ORIGINAL_KUCOIN_NANOSECONDS',valid_recent_rows:accepted.length,buy_quote_turnover_usdt:buy,sell_quote_turnover_usdt:sell,taker_imbalance:summary.taker_imbalance,contract_multiplier:multiplier,whole_window_coverage_proven:false,score_contribution:0,entry_authorized:false}});
 return{...root,status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,evidence:[evidence],summary};
}
export function validateN12KucoinTokenTrade(row,now){
 const market=row?.market,buy=finite(row?.buy_quote_turnover_usdt),sell=finite(row?.sell_quote_turnover_usdt),total=finite(row?.value),id=row?.identity;
 return row?.block_id==='N12'&&row.metric_family==='ACTUAL_KUCOIN_TOKEN_TAKER_TRADES_BOUNDED'&&['SPOT','FUTURES'].includes(market)&&row.provider_id===`KUCOIN_${market}_TRADES`&&row.upstream_id===`KUCOIN_OFFICIAL_PUBLIC_${market}_TRADES`&&row.venue==='KUCOIN'&&row.independent_venue_root==='KUCOIN'&&row.exact_asset_binding===true&&exactN12KucoinTokenIdentity(row.htx_contract,id,row.identity_method,row.asset_binding_proof)&&row.source_symbol===(market==='SPOT'?row.htx_contract:row.htx_contract.slice(0,-5)+'USDTM')&&row.source_clock_policy==='ORIGINAL_KUCOIN_NANOSECONDS'&&row.coverage_status==='BOUNDED_DIRECTIONAL_SAMPLE'&&row.coverage_fraction===0&&row.directional_strength===null&&row.whole_window_coverage_proven===false&&row.score_contribution===0&&row.entry_authorized===false&&row.unit==='USDT'&&Number.isSafeInteger(row.valid_recent_rows)&&row.valid_recent_rows>0&&buy!==null&&sell!==null&&buy>=0&&sell>=0&&total>0&&Math.abs(buy+sell-total)<=Math.max(.000001,total*.000001)&&Math.abs((buy-sell)/total-row.taker_imbalance)<=1e-9&&finite(row.contract_multiplier)>0&&row.origin_event_id===row.physical_root_key&&String(row.origin_event_id).startsWith(`KUCOIN_N12_TOKEN_TRADE_SAMPLE:${row.htx_contract}:${market}:`)&&Number.isSafeInteger(row.source_ts)&&row.source_ts<=now&&now-row.source_ts<=300000&&row.expires_at>now;
}
