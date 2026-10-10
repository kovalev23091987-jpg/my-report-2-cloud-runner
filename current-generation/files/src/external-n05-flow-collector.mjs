import {collectPoloniexFlow} from './poloniex-native-flow-collector.mjs';
import {collectBackpackFlow} from './backpack-flow-collector.mjs';
import {collectKrakenFlow} from './kraken-flow-collector.mjs';
import {collectGateFlow} from './gate-flow-collector.mjs';
import {collectTurnoverBaseline} from './flow-turnover-collector.mjs';
import {collectBitgetFlow} from './bitget-flow-collector.mjs';
import {collectBinanceNativeFlow} from './binance-native-flow-collector.mjs';
import {exactBinanceNativeIdentity} from './binance-native-four-hour-flow.mjs';
// All adapters retain the existing shared caller, venue, role, D1 and whole-job caps.
export async function collectExternalN05Flow(params={}){
 const results=[];let reserved=0;const originalAdmit=params.request_admit;
 params={...params,request_admit:request=>{const n=Number(request?.attempts);if(!Number.isSafeInteger(n)||n<1||reserved+n>5)return{allowed:false,status:'CALLER_FIVE_REQUEST_CAP'};const grant=originalAdmit?.(request);if(grant?.allowed===true&&!grant.duplicate)reserved+=n;return grant;}};
 const merged=result=>({...result,network_calls:results.reduce((n,r)=>n+(r.network_calls||0),0),receipts:results.flatMap(r=>r.receipts||[]),adapter_results:results.map(({components,receipts,...r})=>r)});
 const complete=async result=>{const component=result.components?.find(c=>c.check_completed&&['GATE','BINANCE'].includes(c.venue)&&c.market==='SPOT');if(!component)return result;const baseline=await collectTurnoverBaseline(params,component);return{...result,components:result.components.map(c=>c===component?{...c,turnover_baseline:baseline}:c),network_calls:(result.network_calls||0)+(baseline.network_calls||0),receipts:[...(result.receipts||[]),...(baseline.receipts||[])]};};
 if(exactBinanceNativeIdentity(params.contract,params.asset_identity)){
  const native=await collectBinanceNativeFlow(params);results.push(native);
  if(native.check_completed)return complete(merged({...native,selected_venue:'BINANCE',source_selection:'PRIMARY_VERIFIED_NATIVE_TAKER_CANDLES'}));
 }
 if(params.asset_identity?.asset_kind==='NATIVE'){const kraken=await collectKrakenFlow(params);results.push(kraken);if(kraken.check_completed)return merged({...kraken,selected_venue:'KRAKEN',source_selection:'PRIMARY_NATIVE_PAIRED_TAKER_COUNT_AND_VWAP'});}
 if(params.asset_identity?.contract_or_mint){const gate=await collectGateFlow(params);results.push(gate);if(gate.check_completed)return complete(merged({...gate,selected_venue:'GATE',source_selection:'EXACT_GATE_CHAIN_ADDRESS_PAIRED_TAKER_TRADES'}));}
 if(params.asset_identity?.contract_or_mint){const backpack=await collectBackpackFlow(params);results.push(backpack);if(backpack.check_completed)return merged({...backpack,selected_venue:'BACKPACK',source_selection:'EXACT_CHAIN_ADDRESS_NATIVE_MINUTE_COUNTS'});}
 const bitget=await collectBitgetFlow(params);results.push(bitget);
 if(bitget.check_completed)return merged({...bitget,selected_venue:'BITGET'});
 const poloniex=await collectPoloniexFlow(params);results.push(poloniex);
 if(poloniex.check_completed)return merged({...poloniex,selected_venue:'POLONIEX',source_selection:'EXACT_CHAIN_ADDRESS_NATIVE_TAKER_CANDLES'});
 return{...bitget,network_calls:results.reduce((n,r)=>n+(r.network_calls||0),0),receipts:results.flatMap(r=>r.receipts||[]),components:results.flatMap(r=>r.components||[]),selected_venue:'BITGET',adapter_results:results.map(({components,receipts,...r})=>r)};
}
