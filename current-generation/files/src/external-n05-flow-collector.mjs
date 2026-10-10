import {collectPoloniexFlow} from './poloniex-native-flow-collector.mjs';
import {collectBackpackFlow} from './backpack-flow-collector.mjs';
import {collectKrakenFlow} from './kraken-flow-collector.mjs';
import {collectGateFlow} from './gate-flow-collector.mjs';
import {collectTurnoverBaseline} from './flow-turnover-collector.mjs';
import {collectBitgetFlow} from './bitget-flow-collector.mjs';
import {collectBinanceNativeFlow} from './binance-native-flow-collector.mjs';
import {exactBinanceNativeIdentity} from './binance-native-four-hour-flow.mjs';

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
  caller_reserved_requests:reserved,adapter_results:results.map(({venue,result:{components,receipts,evidence,...result}})=>({venue,...result}))};
}

export async function collectExternalN05Flow(params={}){
 const routes=[];
 if(exactBinanceNativeIdentity(params.contract,params.asset_identity))routes.push(['BINANCE',collectBinanceNativeFlow]);
 if(params.asset_identity?.asset_kind==='NATIVE')routes.push(['KRAKEN',collectKrakenFlow]);
 if(params.asset_identity?.contract_or_mint)routes.push(['GATE',collectGateFlow],['BACKPACK',collectBackpackFlow]);
 routes.push(['BITGET',collectBitgetFlow],['POLONIEX',collectPoloniexFlow]);
 return collectN05VenueRoutes(params,routes);
}
