import fs from 'node:fs';import {createRequire} from 'node:module';
import {normalizeGTrade} from './src/gtrade.mjs';import {compactLiquidationContext} from './src/compact-context.mjs';import {LocalProofStore} from './src/local-proof-store.mjs';
const require=createRequire(import.meta.url),sdk=require('@gainsnetwork/sdk');
const read=n=>JSON.parse(fs.readFileSync(new URL('./evidence/'+n,import.meta.url),'utf8'));
const dataset={variables:read('gtrade_variables_v2.raw'),trades:read('gtrade_trades_v2.raw'),prices:read('gtrade_prices.raw'),receipts:['gtrade_variables_v2','gtrade_trades_v2','gtrade_prices'].map(n=>read(n+'.receipt.json'))};
const evaluation_time=1790489991000;const rows=[];
for(const symbol of ['FIL','RAY','XPL','BTC','ETH','SOL']){
 const c={symbol,route_symbol:symbol,run_id:'CAPTURED_SNAPSHOT_REPLAY',snapshot_id:'REPLAY:'+symbol,as_of_ms:evaluation_time,received_at_ms:evaluation_time,max_age_ms:600000};
 const frame=normalizeGTrade(dataset,c,sdk);rows.push({symbol,status:frame.status,selected:frame.selected_market_positions,retained:frame.zones.length,excluded:frame.excluded_positions?.length,notional_usd:frame.zones.reduce((s,x)=>s+x.notional,0),same_block_atomic:frame.same_block_atomic});
}
const live=JSON.parse(fs.readFileSync(new URL('./proof/live-native-round2.json',import.meta.url),'utf8'));
const frame=live.receipt;const identity={symbol:frame.native_symbol,contract:'FIL-USDT',direction:'LONG',run_id:frame.run_id,snapshot_id:frame.snapshot_id,as_of_ms:frame.analysis_as_of_ms};
const compact=compactLiquidationContext([frame],identity);const store=new LocalProofStore();const ack=store.persist('captured-native',compact);const back=store.load('captured-native',identity);store.close();
const proof={node:process.version,gtrade_sdk_version:require('@gainsnetwork/sdk/package.json').version,replay_evaluation_time:evaluation_time,source_time_not_rewritten:true,gtrade:rows,
 native_captured_as_of:identity.as_of_ms,compact_body_bytes:compact.body_bytes,sqlite:ack,exact_readback:back.fingerprint===compact.fingerprint,
 live_snapshot_was_previously_captured:true,current_live_test:false,actual_D1_migration:false,actual_production_sender_or_manual_renderer_tested:false,production_writes:false,automatic_trade:false};
fs.mkdirSync(new URL('./runs/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./runs/offline-replay.json',import.meta.url),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
