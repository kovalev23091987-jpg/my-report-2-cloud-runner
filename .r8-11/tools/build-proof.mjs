#!/usr/bin/env node
import fs from 'node:fs/promises';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const by=await read('.r8-11/proof/bybit-liquidation-endurance.json');
const bn=await read('.r8-11/proof/binance-liquidation-endurance.json');
const micro=await read('.r8-11/proof/bybit-microstructure-live.json');
function assert(x,m){if(!x)throw new Error(m);}
assert(by?.proof?.status==='CLOSED','BYBIT_ENDURANCE_NOT_CLOSED');
assert(bn?.proof?.status==='CLOSED','BINANCE_ENDURANCE_NOT_CLOSED');
assert(micro?.status==='R8_11_MICROSTRUCTURE_LIVE_D1_PASS','MICRO_LIVE_D1_NOT_CLOSED');
assert(Number(micro?.d1_usage?.unknown_ops||0)===0,'MICRO_D1_UNKNOWN_OPS');
const out={
  status:'R8_11_COLLECTOR_MICROSTRUCTURE_CONTROLLED_PASS',
  collector_bounded_endurance:{
    bybit:{status:by.proof.status,duration_ms:by.proof.duration_ms,messages:by.proof.messages,normalized_events:by.proof.normalized_events,reconnect_count:by.proof.reconnect_count,error_rate:by.proof.error_rate,coverage_class:by.plan?.coverage_class},
    binance:{status:bn.proof.status,duration_ms:bn.proof.duration_ms,messages:bn.proof.messages,normalized_events:bn.proof.normalized_events,reconnect_count:bn.proof.reconnect_count,error_rate:bn.proof.error_rate,coverage_class:bn.plan?.coverage_class},
    gate:{status:'PARTIAL_HEADER_CAPABILITY_NOT_LIVE_PROVED',reason:'Node WebSocket probe cannot prove required X-Gate-Size-Decimal:1 semantics; Cloudflare DO implementation remains bounded/not deployed.'},
    continuous_production_status:'PARTIAL_REALTIME_COVERAGE',
    continuous_reason:'Bounded network endurance is proven, but no free 24/7 persistent runtime has been production-enabled or endurance-proven. GitHub Actions is probe-only by TZ.'
  },
  microstructure_writer:{status:'CLOSED_LIVE_PUBLIC_WS_TO_D1_READBACK',venue:'BYBIT',contract:'BTC-USDT',bucket_ts:micro.selected_bucket_ts,trade_count:micro.readback?.trade_count,d1_usage:micro.d1_usage},
  production_main_changed:false,
  d1_schema_changed:false,
  d1_shadow_data_written:true,
  telegram_network_enabled:false,
  probability:null,
  validated_signal:false,
  trading_execution:false,
};
await fs.writeFile('.r8-11/proof/R8_11_COLLECTOR_MICROSTRUCTURE_PROOF.json',JSON.stringify(out,null,2)+'\n');
console.log('R8_11_PROOF=PASS');
console.log(JSON.stringify({status:out.status,continuous:out.collector_bounded_endurance.continuous_production_status,micro:out.microstructure_writer.status}));
