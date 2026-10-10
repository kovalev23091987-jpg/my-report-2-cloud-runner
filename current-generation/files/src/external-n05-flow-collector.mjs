import {collectBitgetFlow} from './bitget-flow-collector.mjs';
import {collectBinanceNativeFlow} from './binance-native-flow-collector.mjs';
import {exactBinanceNativeIdentity} from './binance-native-four-hour-flow.mjs';
// Both adapters retain the existing shared caller, venue, role, D1 and whole-job caps.
export async function collectExternalN05Flow(params={}){
 const results=[];
 if(exactBinanceNativeIdentity(params.contract,params.asset_identity)){
  const native=await collectBinanceNativeFlow(params);results.push(native);
  if(native.check_completed)return{...native,selected_venue:'BINANCE',source_selection:'PRIMARY_VERIFIED_NATIVE_TAKER_CANDLES',adapter_results:results};
 }
 const bitget=await collectBitgetFlow(params);results.push(bitget);
 return{...bitget,network_calls:results.reduce((n,r)=>n+(r.network_calls||0),0),receipts:results.flatMap(r=>r.receipts||[]),components:results.flatMap(r=>r.components||[]),selected_venue:'BITGET',adapter_results:results.map(({components,receipts,...r})=>r)};
}
