import {readEvidenceSourcePriorityHistory,sourceHistoryStatistics} from './evidence-source-store.mjs';
import {availableFlowContext} from './joint-spot-futures-flow.mjs';
import {validateEvidenceV2} from './evidence-v2.mjs';
const venues=Object.freeze({BITFINEX:{block:'N05',venue:'BITFINEX'},BINANCE:{block:'N05',venue:'BINANCE'},KRAKEN:{block:'N05',venue:'KRAKEN'},GATE:{block:'N05',venue:'GATE'},BACKPACK:{block:'N05',venue:'BACKPACK'},BITGET:{block:'N05',venue:'BITGET'},POLONIEX:{block:'N05',venue:'POLONIEX'},GATE_FUTURES_N12:{block:'N12',providers:['GATE_FUTURES_TRADES']},OKX_N12_NATIVE:{block:'N12',providers:['OKX_SPOT_TRADES','OKX_FUTURES_TRADES']},KUCOIN_N12_NATIVE:{block:'N12',providers:['KUCOIN_SPOT_TRADES','KUCOIN_FUTURES_TRADES']},KUCOIN_N12_EXACT_TOKEN:{block:'N12',providers:['KUCOIN_SPOT_TRADES','KUCOIN_FUTURES_TRADES']}});
export const publicVenueHealthSource=venue=>venues[venue]?`${venues[venue].block}_PUBLIC_VENUE:${venue}`:null;
export function orderPublicVenueRoutes(routes=[],history={}, {contract,now=Date.now()}={}){
 const out=[...routes],statistics={};
 for(const [venue]of routes){const source_id=publicVenueHealthSource(venue);if(source_id)statistics[venue]={...sourceHistoryStatistics(history.observations,{contract,source_id,now}),block_id:venues[venue].block};}
 // N12 samples cannot jump ahead of a four-hour N05 route. Alternatives in
 // each role exchange only their existing slots; static proven order survives
 // unavailable history, tied performance, an unknown or failing source.
 for(const block of ['N05','N12']){const slots=routes.map(([venue],i)=>venues[venue]?.block===block?i:-1).filter(i=>i>=0),ordered=slots.map(i=>routes[i]).sort(([a],[b])=>Number(statistics[b].useful)-Number(statistics[a].useful)||statistics[b].valid_rows_per_http-statistics[a].valid_rows_per_http);slots.forEach((slot,i)=>out[slot]=ordered[i]);}
 return{routes:out,receipt:{status:history.status||'NO_SOURCE_PRIORITY_HISTORY',contract,scope:'EXACT_MARKET_ALTERNATIVES_WITHIN_N05_OR_N12',original_order:routes.map(r=>r[0]),ordered_routes:out.map(r=>r[0]),source_statistics:statistics,sourceHTTP:0,score_changed:false,predictive_weight_changed:false,all_eligible_routes_retained:true}};
}
export async function preparePublicVenuePriority(params={},routes=[]){
 const ids=routes.map(([v])=>publicVenueHealthSource(v)).filter(Boolean);
 const history=ids.length>1?await readEvidenceSourcePriorityHistory(params.db,{contract:params.contract,source_ids:ids,admit:params.source_health_admit,now:params.now??Date.now()}):{status:'NO_PUBLIC_SOURCE_ALTERNATIVES',observations:[]};
 return orderPublicVenueRoutes(routes,history,{contract:params.contract,now:params.now??Date.now()});
}
export function publicVenueHealthObservations(flow={}, {contract,now=Date.now()}={}){
 const adapters=flow?.adapter_results||[];
 if(!Array.isArray(adapters)||!adapters.length||adapters.length>11||new Set(adapters.map(r=>r.venue)).size!==adapters.length)return[];
 const measured=adapters.reduce((n,r)=>n+Number(r.network_calls),0);
 if(!adapters.every(r=>Number.isSafeInteger(r.network_calls)&&r.network_calls>=0)||!Number.isSafeInteger(measured)||measured<1||measured>5||measured!==flow.flow_network_calls||measured>flow.network_calls)return[];
 return adapters.filter(r=>r.network_calls>0&&publicVenueHealthSource(r.venue)).map(r=>{
  const binding=venues[r.venue],evidence=binding.block==='N05'?availableFlowContext({contract,now,external:{components:(flow.components||[]).filter(c=>c.venue===binding.venue)}}).evidence:(flow.evidence||[]).filter(e=>e.block_id==='N12'&&e.htx_contract===contract&&binding.providers.includes(e.provider_id)),valid=evidence.filter(e=>validateEvidenceV2(e,{decision_ts:now}).usable);
  return{source_id:publicVenueHealthSource(r.venue),status:String(r.status||'NOT_EVALUATED'),actual_http:r.network_calls,evidence_rows:evidence.length,valid_rows:valid.length,decision_usable_rows:valid.filter(e=>Number(e.coverage_fraction)>0).length};
 });
}
