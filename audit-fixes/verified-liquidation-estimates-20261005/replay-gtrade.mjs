import {mergeLiquidationDisplayZones} from '../../current-generation/files/src/canonical-display.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {normalizeGTrade} from '../../current-generation/files/src/liquidation-extension/gtrade.mjs';
import {createGTradeAcquisition,bindGTradeAcquisition} from '../../current-generation/files/src/liquidation-extension/gtrade-runtime-bridge.mjs';
import {nativeLiquidationLines,validateNativeLiquidationContext} from '../../current-generation/files/src/native-liquidation-guard.mjs';
const sdkRoot=new URL('../../post-v7-consolidated/liquidation/liquidation-extension/package.json',import.meta.url),require=createRequire(sdkRoot),sdk=require('@gainsnetwork/sdk');
assert.equal(require('@gainsnetwork/sdk/package.json').version,'1.8.10');
const root=new URL('../../post-v7-consolidated/liquidation/liquidation-extension/evidence/',import.meta.url),load=n=>JSON.parse(fs.readFileSync(new URL(n,root))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['gtrade_variables_v2','gtrade_trades_v2','gtrade_prices'];
const inputs=names.map(name=>({name,sha256:hash(fs.readFileSync(new URL(name+'.raw',root))),receipt:load(name+'.receipt.json')}));
for(const input of inputs)assert.equal(input.sha256,input.receipt.sha256);
const payload={variables:load(names[0]+'.raw'),trades:load(names[1]+'.raw'),prices:load(names[2]+'.raw'),receipts:inputs.map(i=>i.receipt)};
const universeBytes=fs.readFileSync(new URL('../../checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz',import.meta.url)),universe=JSON.parse(zlib.gunzipSync(universeBytes));
assert.equal(universe.status,'CLOSED');assert.equal(universe.assets.length,102);assert.equal(universe.contracts.length,119);
// Read-only retrospective evidence. Never retime the historical source to today.
const T=1790489991000,runId='HISTORICAL_GTRADE_REPLAY_20260927',rows=[];
for(const asset of universe.assets){
 const contract=asset.asset_analysis_contract,symbol=asset.symbol,snapshot='HISTORICAL:'+contract;
 const normalized=normalizeGTrade(payload,{symbol,route_symbol:symbol,run_id:runId,snapshot_id:snapshot,as_of_ms:T,received_at_ms:T,max_age_ms:300000},sdk);
 let context=null,render=[];
 if(normalized.usable_for_context){
  const acq=createGTradeAcquisition({contract,native_symbol:symbol,run_id:runId,acquisition_id:snapshot,collection_started_ts:Math.min(...inputs.map(i=>i.receipt.received_ts)),collection_completed_ts:T,normalized_receipt:normalized,transport_receipts:payload.receipts});
  context=bindGTradeAcquisition(acq,{contract,run_id:runId,snapshot_id:snapshot,observed_ts:T});
  const liq={independent_extensions:[context]};const check=validateNativeLiquidationContext({metadata:{contract},run_id:runId,snapshot_id:snapshot,observed_ts:T,direction:null,liquidations:liq});assert.equal(check.ok,true,contract+JSON.stringify(check));render=nativeLiquidationLines(liq,{manual:true})||[];
 }
 const shown=context?['ABOVE','BELOW'].reduce((n,side)=>n+Math.min(4,mergeLiquidationDisplayZones((side==='ABOVE'?context.above:context.below).map(z=>({...z,side,price:z.native_price,price_quote:context.price_quote,native_symbol:symbol,source_clock_closed:context.source_clock_closed,distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE'})),side).length),0):0;
 rows.push({contract,status:normalized.status,selected_positions:normalized.selected_market_positions??null,normalized_levels:normalized.zones.length,excluded_positions:normalized.excluded_positions?.length??0,context_status:context?.status??null,source_clock_closed:context?.source_clock_closed??null,selected_context_levels:(context?.above?.length??0)+(context?.below?.length??0),levels_shown:shown,rendered:render});
}
const summary={schema:'report2-general-gtrade-historical-replay-v1',historical_only:true,as_of_ms:T,source_time_not_replaced:true,sourceHTTP:0,MAIN:0,Telegram:0,universe_sha256:hash(universeBytes),assets:rows.length,contracts:119,input_hashes:inputs.map(({name,sha256})=>({name,sha256})),assets_with_numeric_estimates:rows.filter(r=>r.normalized_levels>0).length,assets_with_rendered_estimates:rows.filter(r=>r.levels_shown>0).length,accepted_fresh_level_assets:0,nonzero_score_effect:0,coverage_not_reaccepted:true,rows};
fs.writeFileSync('audit-fixes/verified-liquidation-estimates-20261005/historical-gtrade-replay.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({...summary,rows:rows.map(({rendered,...r})=>r)}));
