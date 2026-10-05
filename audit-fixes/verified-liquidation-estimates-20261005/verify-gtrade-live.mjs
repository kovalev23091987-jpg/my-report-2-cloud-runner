import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]||'runtime'),load=n=>import(pathToFileURL(path.join(root,n)));
const [{RemoteD1Database},allowances,admission,{createGTradeRuntimeCollector},{bindGTradeAcquisition},{nativeLiquidationLines,validateNativeLiquidationContext}]=await Promise.all([load('report2-d1-adapter.mjs'),load('src/liquidation-extension/install-source-allowances.mjs'),load('src/liquidation-extension/d1-source-admission.mjs'),load('src/liquidation-extension/gtrade-runtime-collector.mjs'),load('src/liquidation-extension/gtrade-runtime-bridge.mjs'),load('src/native-liquidation-guard.mjs')]);
const require=createRequire(path.join(root,'src/liquidation-extension/package.json')),sdk=require('@gainsnetwork/sdk');assert.equal(require('@gainsnetwork/sdk/package.json').version,'1.8.10');
const state=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json')),lock=JSON.parse(fs.readFileSync('audit-fixes/source-optimization-20260930/execution-lock.json'));assert.equal(state.lease?.owner,process.env.REPORT2_CONTINUATION_OWNER);assert.ok(state.lease.expires_ts>Date.now());assert.equal(lock.active,false);
const bytes=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'),universe=JSON.parse(zlib.gunzipSync(bytes));assert.equal(universe.status,'CLOSED');assert.equal(universe.assets.length,102);assert.equal(universe.contracts.length,119);
const started=Date.now(),runId=`GTRADE_BOUNDED_GENERAL:${process.env.GITHUB_RUN_ID}:${started}`,db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),rows=[],hash=b=>crypto.createHash('sha256').update(b).digest('hex');let sourceHTTP=0;
const setup=await allowances.installSourceAllowances({db,now:started});
const admit=admission.createD1SourceAdmission({db,scope_bindings:setup.bindings,within_run_budget:extra=>{const u=db.usageSnapshot();return {allowed:u.unknown_ops===0&&u.rows_read+extra.extraRowsRead<=1000&&u.rows_written+extra.extraRowsWritten<=200};}});
const grant=await admit({reservation_id:'VERIFIED_EST_GENERAL:'+process.env.GITHUB_RUN_ID,contract:universe.assets[0].asset_analysis_contract,run_id:runId,requests:{GTRADE:3},weights:{GTRADE:3},max_requests:3,deadline_ts:started+45000});
const fetch_impl=async(url,options)=>{
 assert.ok(state.lease.expires_ts>Date.now());assert.ok(Date.now()-started<45000);assert.ok(sourceHTTP<3);assert.ok(/^https:\/\/(backend-arbitrum|backend-pricing.eu)\.gains\.trade\/(trading-variables|open-trades|charts)$/.test(String(url)));sourceHTTP++;return fetch(url,options);
};
if(grant.allowed===true&&grant.new_reservation===true){
 const collect=createGTradeRuntimeCollector({sdk,fetch_impl,clock:Date.now});
 for(const asset of universe.assets){
  const contract=asset.asset_analysis_contract,result=await collect({contract,native_symbol:asset.symbol,run_id:runId,acquisition_id:'A:'+contract,deadline_ts:started+45000,snapshot_admitted:true});
  let context=null,render=[];
  if(result.acquisition){
   const observed=Date.now(),snapshot='LIVE_SCOPE:'+contract;context=bindGTradeAcquisition(result.acquisition,{contract,run_id:runId,snapshot_id:snapshot,observed_ts:observed});
   const liquidations={independent_extensions:[context]};assert.equal(validateNativeLiquidationContext({metadata:{contract},run_id:runId,snapshot_id:snapshot,observed_ts:observed,direction:null,liquidations}).ok,true);render=nativeLiquidationLines(liquidations,{manual:true})||[];
  }
  rows.push({contract,status:result.status,requests:result.requests??0,selected_market_positions:result.selected_market_positions??null,normalization_status:result.normalized?.status??null,context_status:context?.status??null,source_clock_closed:context?.source_clock_closed??null,selected_context_levels:(context?.above?.length??0)+(context?.below?.length??0),rendered:render,acquisition_fingerprint:result.acquisition?.acquisition_fingerprint??null,transport_sha256:result.acquisition?.transport_sha256??[]});
 }
}
const report={schema:'report2-bounded-general-gtrade-actual-estimate-v1',status:grant.allowed===true?'ACTUAL_GENERAL_SOURCE_CHECK_COMPLETED':'SOURCE_ADMISSION_NOT_GRANTED',head:process.env.GITHUB_SHA,expected_main:process.env.REPORT2_EXPECTED_MAIN,run_id:runId,started_ts:started,completed_ts:Date.now(),sourceHTTP,MAIN:0,Telegram:0,Nansen:0,assets:universe.assets.length,contracts:universe.contracts.length,universe_sha256:hash(bytes),admission_reason:grant.reason??null,assets_with_scoped_levels:rows.filter(r=>r.selected_context_levels>0).length,assets_with_fresh_position_clock:rows.filter(r=>r.selected_context_levels>0&&r.source_clock_closed===true).length,nonzero_score_effect:0,receipt_only_context_not_trade_confirmation:true,full_report_accepted:false,production_database_coverage_replaced:false,usage:db.usageSnapshot(),rows};
fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/gtrade-general-actual-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined}));
