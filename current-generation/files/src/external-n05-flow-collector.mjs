import {collectPoloniexFlow} from './poloniex-native-flow-collector.mjs';
import {eligiblePoloniexIdentity} from './poloniex-native-four-hour-flow.mjs';
import {collectBackpackFlow} from './backpack-flow-collector.mjs';
import {collectKrakenFlow} from './kraken-flow-collector.mjs';
import {collectBitfinexNativeFlow} from './bitfinex-native-flow-collector.mjs';
import {collectGateFlow} from './gate-flow-collector.mjs';
import {collectGateFuturesTradeSample} from './gate-futures-trade-collector.mjs';
import {collectTurnoverBaseline} from './flow-turnover-collector.mjs';
import {collectBitgetFlow} from './bitget-flow-collector.mjs';
import {collectOkxN12NativeTrades,collectKucoinN12NativeTrades,collectKucoinN12ExactTrades} from './n12-native-public-trade-collector.mjs';
import {collectBinanceNativeFlow} from './binance-native-flow-collector.mjs';
import {exactBinanceNativeIdentity} from './binance-native-four-hour-flow.mjs';
import {exactBitfinexNativeIdentity} from './bitfinex-native-four-hour-flow.mjs';

// These seven exact markets yielded original 240 closed one-minute Poloniex
// candles with native buy-taker amounts in cloud run 38245108128. Prefer the
// proven four-hour route within the unchanged five-call envelope; later
// venues can still supply further facts from the remaining admitted calls.
const poloniexWindowProven=new Set(['ARB-USDT','BTT-USDT','ICP-USDT','JST-USDT','STEEM-USDT','SUN-USDT','WIN-USDT']);
// The retained exact 240-minute windows in
// N05_CURRENT104_SOURCE_COVERAGE_MAP_POST_LINK_PEPE_20261011 are historical,
// not current coverage. Where a proven route trails an unproven route in the
// five-call queue, try it first and still validate its current response.
// This is an operational ordering only; it does not alter score or admission.
const savedFullWindowRoutePreference=Object.freeze({
 'AAVE-USDT':['POLONIEX'],'AVAX-USDT':['KRAKEN'],'BANK-USDT':['BITGET'],
 'BCH-USDT':['KRAKEN'],'BTW-USDT':['POLONIEX'],'DOGE-USDT':['POLONIEX'],
 'DOT-USDT':['KRAKEN'],'ENA-USDT':['BACKPACK'],'ETC-USDT':['POLONIEX'],
 'JUP-USDT':['BACKPACK'],'LTC-USDT':['KRAKEN'],'ONDO-USDT':['BACKPACK'],
 'PENGU-USDT':['BACKPACK'],'RAY-USDT':['BACKPACK'],'SUSHI-USDT':['BITGET'],
 'TRUMP-USDT':['BACKPACK'],'TRX-USDT':['BITGET'],'UNI-USDT':['BACKPACK'],
 'XRP-USDT':['KRAKEN'],
});
export function orderN05VenueRoutes(contract,identity,routes){
 const poloniexEligible=eligiblePoloniexIdentity(contract,identity);
 const preferred=[...(poloniexWindowProven.has(contract)&&poloniexEligible?['POLONIEX']:[]),
  ...(savedFullWindowRoutePreference[contract]||[]).filter(venue=>venue!=='POLONIEX'||poloniexEligible)];
 if(!preferred.length)return routes;
 const preferredRoutes=preferred.flatMap(venue=>routes.filter(route=>route[0]===venue));
 return [...preferredRoutes,...routes.filter(route=>!preferred.includes(route[0]))];
}

// Internal orchestration seam: production routes are fixed below. Every route
// shares one caller envelope; each adapter retains its own durable admission.
export async function collectN05VenueRoutes(params={},routes=[],turnoverCollector=collectTurnoverBaseline){
 const results=[];let reserved=0;const originalAdmit=params.request_admit;
 params={...params,request_admit:request=>{
  const n=Number(request?.attempts);
  if(!Number.isSafeInteger(n)||n<1||reserved+n>5)return{allowed:false,status:'CALLER_FIVE_REQUEST_CAP'};
  const grant=originalAdmit?.(request);
  if(grant?.allowed===true&&!grant.duplicate)reserved+=n;
  return grant;
 }};
 // A later failure or exhausted provider cannot erase an earlier complete
 // component. Keep checking routes after five grants: a cache hit costs zero.
 for(const [venue,collect] of routes)results.push({venue,result:await collect(params)});
 const completed=results.filter(({result})=>result.components?.some(c=>c.check_completed===true));
 const first=completed[0]||results.find(r=>r.venue==='BITGET')||results[0];
 let components=results.flatMap(({result})=>result.components||[]),baseline;
 // Current flow has priority over optional historical turnover. Preserve the
 // existing single-baseline scope and never create a separate request budget.
 const target=components.find(c=>c.check_completed===true&&['GATE','BINANCE'].includes(c.venue)&&c.market==='SPOT');
 if(target){baseline=await turnoverCollector(params,target);components=components.map(c=>c===target?{...c,turnover_baseline:baseline}:c);}
 const selected_venues=[...new Set(components.filter(c=>c.check_completed===true).map(c=>c.venue))];
 const flow_network_calls=results.reduce((n,{result})=>n+(result.network_calls||0),0);
 return{...(first?.result||{}),status:completed.length>1?'CLOSED_MULTIPLE_QUALIFIED_VENUE_COMPONENTS':first?.result.status||'NO_QUALIFIED_VENUE_COMPONENT',
  check_completed:completed.length>0,components,evidence:results.flatMap(({result})=>result.evidence||[]),
  network_calls:flow_network_calls+(baseline?.network_calls||0),flow_network_calls,
  receipts:[...results.flatMap(({result})=>result.receipts||[]),...(baseline?.receipts||[])],
  selected_venue:first?.venue||null,selected_venues,source_selection:'MAXIMUM_AVAILABLE_WITHIN_SHARED_FIVE_REQUEST_CAP',
  caller_reserved_requests:reserved,adapter_results:results.map(({venue,result:{components,receipts,evidence,...result}})=>({...result,venue}))};
}

export async function collectExternalN05Flow(params={}){
 const routes=[];
 if(exactBitfinexNativeIdentity(params.contract,params.asset_identity))routes.push(['BITFINEX',collectBitfinexNativeFlow]);
 if(exactBinanceNativeIdentity(params.contract,params.asset_identity))routes.push(['BINANCE',collectBinanceNativeFlow]);
 if(params.asset_identity?.asset_kind==='NATIVE')routes.push(['KRAKEN',collectKrakenFlow]);
 if(params.asset_identity?.contract_or_mint)routes.push(['GATE',collectGateFlow],['BACKPACK',collectBackpackFlow]);
 routes.push(['BITGET',collectBitgetFlow],['POLONIEX',collectPoloniexFlow]);
 // N12 can reuse Gate's already exact-bound spot metadata. This optional
 // futures sample is last and shares the same five-call/Gate ledgers as N05.
 if(params.asset_identity?.contract_or_mint)routes.push(['GATE_FUTURES_N12',collectGateFuturesTradeSample]);
 // Optional N12 exact-asset pages use any room left in the existing five-call
 // N05 envelope. They cannot displace an established four-hour flow route.
 if(params.asset_identity?.asset_kind==='NATIVE')routes.push(['OKX_N12_NATIVE',collectOkxN12NativeTrades],['KUCOIN_N12_NATIVE',collectKucoinN12NativeTrades]);
 if(params.asset_identity?.contract_or_mint)routes.push(['KUCOIN_N12_EXACT_TOKEN',collectKucoinN12ExactTrades]);
 return collectN05VenueRoutes(params,orderN05VenueRoutes(params.contract,params.asset_identity,routes));
}
