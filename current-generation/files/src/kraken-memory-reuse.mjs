import {qualifiedKrakenNativeComponent} from './kraken-four-hour-flow.mjs';
import {KRAKEN_PUBLIC_TAKER_REFERENCE} from './kraken-public-taker-reference.mjs';
import {normalizeKrakenN12BoundedTradeSample} from './kraken-n12-bounded-trade-sample.mjs';

// Only references to already collected originals. This property is deliberately
// absent from persisted N05 cache payloads and JSON report projections.
export function captureKrakenMemoryReuse({contract,component,payload,observed_ts,expires_ts,trade_receipts=[],now}={}){
 const empty={evidence:[]};
 try{
  if(!qualifiedKrakenNativeComponent(component,KRAKEN_PUBLIC_TAKER_REFERENCE)||component.contract!==contract||
   observed_ts!==component.observed_ts||payload?.observed_ts!==observed_ts||
   ![now,observed_ts,expires_ts].every(Number.isSafeInteger)||observed_ts>now||
   expires_ts!==component.window_end_ts+300000||expires_ts<=now)return empty;
  const cache={observed_ts,expires_ts,payload};
  Object.defineProperty(component,'_n05_kraken_reuse',{enumerable:false,configurable:false,writable:false,value:Object.freeze({cache,trade_receipts})});
  return normalizeKrakenN12BoundedTradeSample({contract,component,cache,trade_receipts,now});
 }catch{return empty;}
}
