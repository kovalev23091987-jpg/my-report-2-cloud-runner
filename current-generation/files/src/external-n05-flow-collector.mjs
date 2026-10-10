import {collectGateFlow} from './gate-flow-collector.mjs';
import {collectTurnoverBaseline} from './flow-turnover-collector.mjs';
import {collectBitgetFlow} from './bitget-flow-collector.mjs';
import {collectBinanceNativeFlow} from './binance-native-flow-collector.mjs';
import {exactBinanceNativeIdentity} from './binance-native-four-hour-flow.mjs';
// Both adapters retain the existing shared caller, venue, role, D1 and whole-job caps.
export async function collectExternalN05Flow(params={}){
 const results=[];
 const complete=async result=>{const component=result.components?.find(c=>c.check_completed&&['GATE','BINANCE'].includes(c.venue)&&c.market==='SPOT');if(!component)return result;const baseline=await collectTurnoverBaseline(params,component);return{...result,components:result.components.map(c=>c===component?{...c,turnover_baseline:baseline}:c),network_calls:(result.network_calls||0)+(baseline.network_calls||0),receipts:[...(result.receipts||[]),...(baseline.receipts||[])]};};
 if(exactBinanceNativeIdentity(params.contract,params.asset_identity)){
  const native=await collectBinanceNativeFlow(params);results.push(native);
  if(native.check_completed)return complete({...native,selected_venue:'BINANCE',source_selection:'PRIMARY_VERIFIED_NATIVE_TAKER_CANDLES',adapter_results:results});
 }
 if(params.asset_identity?.contract_or_mint){const gate=await collectGateFlow(params);results.push(gate);if(gate.check_completed)return complete({...gate,network_calls:results.reduce((n,r)=>n+(r.network_calls||0),0),selected_venue:'GATE',source_selection:'EXACT_GATE_CHAIN_ADDRESS_PAIRED_TAKER_TRADES',adapter_results:results});}
 const bitget=await collectBitgetFlow(params);results.push(bitget);
 return{...bitget,network_calls:results.reduce((n,r)=>n+(r.network_calls||0),0),receipts:results.flatMap(r=>r.receipts||[]),components:results.flatMap(r=>r.components||[]),selected_venue:'BITGET',adapter_results:results.map(({components,receipts,...r})=>r)};
}
