import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME;
const load=n=>import(root?pathToFileURL(path.join(root,'src',n)):new URL('../files/src/'+n,import.meta.url));
const {createCombinedLiquidationService,classifyOperationalSourceOutcome,verifiedDydxReadDiagnostic,buildNativeSourceDiagnostics}=await load('liquidation-extension/combined-runner-service.mjs');
const {decodeDydxPinnedSnapshot,calculateDydxConditionalLevels}=await load('liquidation-extension/dydx-pinned-conditional-levels.mjs');
const tape=await load('htx-signed-tape.mjs');
const {buildHtxFuturesFlowPrimary}=await load('candidate-evidence-v2-runtime.mjs');
const {buildHtxFlowClosureDiagnostic}=await load('source-closure-diagnostics.mjs');
const raw=JSON.parse(gunzipSync(fs.readFileSync('checkpoints/source-inputs/dydx-native-dense-37625020734.json.gz'))),T=Math.max(...raw.raw.map(r=>r.receipt.received_ts)),snapshot=decodeDydxPinnedSnapshot({raw,now:T}),assets=new Set(JSON.parse(gunzipSync(fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz'))).assets.map(a=>a.symbol)),covered=new Set(calculateDydxConditionalLevels(snapshot,{crypto_assets:assets}).levels.map(l=>l.asset)),selected=[...assets].filter(a=>!covered.has(a)).slice(0,2).map(a=>a+'-USDT'),run_id='CONTROLLED_RETAINED_EMPTY_NATIVE_DIAGNOSTIC';
function replay({failure=null}={}){const calls=[],health=[],roles=[];const s=createCombinedLiquidationService({mode:'SHADOW_ONLY',clock:()=>T,secondary_enabled:false,dydx_enabled:true,dydx_automatic_discovery_enabled:true,dydx_crypto_assets:assets,candidate_slots:2,max_http_per_run:5,source_weight_store:{load:async()=>[],record:async r=>{health.push(r);return{recorded:true};},recordRole:async r=>{roles.push(r);return{recorded:true};}},provider_admit:async()=>({allowed:true,new_reservation:true}),fetch_impl:async(url,init)=>{assert.equal(String(url),'https://dydx-rpc.publicnode.com/');const q=JSON.parse(init.body);calls.push(q);if(failure)throw Error(failure);return new Response((q.method==='status'?raw.raw[0]:q.method==='abci_query'?raw.raw[1]:raw.raw[2]).raw_body_utf8);}});
return{s,calls,health,roles};}
const params=contract=>({contract,native_symbol:contract.replace(/-USDT$/,''),run_id,deep_started_ts:T,max_http_for_candidate:5,allowed_source_ids:['DYDX_PINNED_NATIVE'],dydx_position_batch_contracts:selected});
test('current verified empty native page is successful transport with no usable level; both selected assets retain exact original proof and one transport-health sample',async()=>{
 const f=replay();for(const c of selected)assert.equal(await f.s.collect(params(c)),null);
 assert.equal(f.calls.length,3);assert.equal(f.health.length,1);assert.equal(f.health[0].usable,true);assert.equal(f.roles.length,2);assert.ok(f.roles.every(r=>r.role_usable===false));
 const rows=f.s.summary().routed;assert.deepEqual(rows.map(r=>r.source_outcome.attempted_http_count),[3,0]);assert.ok(rows.every(r=>r.source_outcome.operational_success&&r.source_outcome.transport_status==='CLOSED'&&r.source_outcome.role_usable===false));assert.equal(rows[1].health_update.reason,'SHARED_SNAPSHOT_NO_NEW_TRANSPORT');
 for(const r of rows){assert.equal(r.position_proof.source_clock_closed,true);assert.equal(r.position_proof.source_read_proof.source_ts,snapshot.source_ts);assert.equal(r.position_proof.source_read_proof.complete_accounts_read,200);assert.equal(r.position_proof.source_read_proof.block_hash,snapshot.block_hash);assert.equal(r.position_proof.source_read_proof.full_market_census,false);}
 const diag=f.s.diagnostics({run_id,contracts:selected});assert.equal(diag.known_actual_http,3);assert.equal(diag.attempts.length,2);assert.equal(diag.entry_authorized,false);assert.equal(diag.network_calls_added,0);assert.equal(diag.source_clocks_refreshed,false);assert.equal(f.s.summary().shared_budget.reserved_http,3);
 fs.writeFileSync('audit-output/native-empty-original-clock-proof.json',JSON.stringify({scope:'CONTROLLED_TRANSPORT_REPLAY_RETAINED_ACTUAL_NATIVE_INPUT_NOT_FRESH_MAIN',source_cloud_run:37625020734,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,diagnostics:diag,health_samples:f.health.length,roles:f.roles},null,2)+'\n');
});
test('an empty status string or altered identity, source clock, chain, hash, bytes or receipt cannot close operational health',async()=>{
 const f=replay();await f.s.collect(params(selected[0]));const proof=f.s.summary().routed[0].position_proof.source_read_proof;
 const args={status:'DYDX_NO_ELIGIBLE_SAMPLE_LEVEL',actual_http:3,contract:selected[0],run_id,now:T};
 assert.equal(classifyOperationalSourceOutcome(args).operational_success,false);
 for(const mutate of [p=>p.contract=selected[1],p=>p.run_id='OTHER',p=>p.source_ts=T+1,p=>p.validated_at_ts=T+1,p=>p.chain_id='OTHER',p=>p.block_hash='bad',p=>p.transport_receipts[1].sha256='bad',p=>p.transport_receipts[1].bytes=2000001,p=>p.transport_receipts[1].http_status=503,p=>p.complete_accounts_read=201,p=>p.query_basis='UNKNOWN',p=>p.source_clocks_refreshed=true]){const p=structuredClone(proof);mutate(p);assert.equal(verifiedDydxReadDiagnostic(p,{contract:selected[0],run_id,now:T}),false);assert.equal(classifyOperationalSourceOutcome({...args,source_read_proof:p}).operational_success,false);}
 assert.equal(classifyOperationalSourceOutcome({...args,source_read_proof:proof,now:T+120001}).operational_success,false);
});
test('a real native transport exception stays failed and cannot create an empty or successful source proof',async()=>{
 const f=replay({failure:'CONTROLLED_HTTP_FAILURE'});assert.equal(await f.s.collect(params(selected[0])),null);assert.equal(f.calls.length,1);assert.equal(f.health.length,1);assert.equal(f.health[0].usable,false);const r=f.s.summary().routed[0];assert.equal(r.source_outcome.transport_status,'FAILED');assert.equal(r.position_proof.source_clock_closed,false);assert.equal(r.position_proof.source_read_proof,null);
});
test('diagnostics bind one exact run and selected assets without mixing reports, creating coverage or refreshing source clocks',async()=>{
 const f=replay();await f.s.collect(params(selected[0]));const d=f.s.diagnostics({run_id,contracts:selected});assert.equal(d.attempts.length,1);assert.equal(f.s.diagnostics({run_id:'OTHER',contracts:selected}).attempts.length,0);assert.equal(f.s.diagnostics({run_id,contracts:[selected[1]]}).attempts.length,0);assert.equal(buildNativeSourceDiagnostics({run_id,contracts:[selected[0],selected[0]]}),null);assert.equal(buildNativeSourceDiagnostics({run_id,contracts:['BTC-USD']}),null);assert.equal(d.attempts[0].position_proof.source_read_proof.source_ts,snapshot.source_ts);assert.equal(d.entry_authorized,false);
});
const contract='测试1000-USDT',MIN=60000;
function capture(){tape.clearHtxSignedTapeSnapshots();const data={metadata:{status:'ok',ts:T,data:[{contract_code:contract,contract_status:1,business_type:'swap',trade_partition:'USDT',contract_size:1}]},trades:{status:'ok',ts:T,ch:'market.'+contract+'.trade.detail',data:[{data:[]}]},minutes:{status:'ok',ts:T,ch:'market.'+contract+'.kline.1min',data:Array.from({length:5},(_,i)=>({id:Math.floor(T/MIN)*60-(6-i)*60,count:0}))}};
 for(const[k,p]of Object.entries(data)){const route=k==='metadata'?'/linear-swap-api/v1/swap_contract_info':k==='trades'?'/linear-swap-ex/market/history/trade':'/linear-swap-ex/market/history/kline';tape.observeHtxSignedTape(p,'https://api.hbdm.com'+route+'?contract_code='+encodeURIComponent(contract)+'&period=1min',T);}
}
test('HTX persistence exception retains failure stage and original captured clocks without leaking DB errors or manufacturing fresh N05',async()=>{
 capture();const result=await tape.persistCapturedHtxSignedTape({contract,now:T,db_admit:()=>({allowed:true}),db:{prepare(){throw Error('PRIVATE_DATABASE_DETAIL');}}});assert.equal(result.status,'RAW_TAPE_PERSISTENCE_NOT_CLOSED');assert.equal(result.failure_stage,'INSTALL');assert.equal(result.evidence.length,0);
 const primary=buildHtxFuturesFlowPrimary({contract,now:T});assert.equal(primary.check_completed,false);assert.equal(primary.raw_acquisition_diagnostic.status,'RAW_TAPE_PERSISTENCE_NOT_CLOSED');assert.equal(primary.raw_acquisition_diagnostic.failure_stage,'INSTALL');assert.equal(primary.raw_acquisition_diagnostic.new_verified_minutes,5);assert.equal(primary.raw_acquisition_diagnostic.source_clocks.trades.source_ts,T);assert.equal(primary.raw_acquisition_diagnostic.source_clocks.trades.received_ts,T);
 const diag=buildHtxFlowClosureDiagnostic({contract,now:T,signed_flow:{status:primary.signed_raw_flow_status,raw_acquisition_diagnostic:primary.raw_acquisition_diagnostic}});assert.equal(diag.acquisition.failure_stage,'INSTALL');assert.equal(diag.network_calls,0);assert.ok(!JSON.stringify(diag).includes('PRIVATE_DATABASE_DETAIL'));assert.equal(primary.evidence.length,0);
});
test('a durable admission exception also retains original clocks and a later report never rewrites its acquisition clock',async()=>{
 capture();const result=await tape.persistCapturedHtxSignedTape({contract,now:T,db_admit:()=>{throw Error('CONTROLLED_ADMISSION_FAILURE');}});assert.equal(result.failure_stage,'ADMISSION');const primary=buildHtxFuturesFlowPrimary({contract,now:T+300001});assert.equal(primary.check_completed,false);assert.equal(primary.raw_acquisition_diagnostic.observed_ts,T);assert.equal(primary.raw_acquisition_diagnostic.source_clocks.metadata.source_ts,T);assert.equal(primary.network_calls,0);assert.equal(primary.evidence.length,0);
});
test('legacy fallback request estimates never become known actual HTTP in retained diagnostics',()=>{
 const d=buildNativeSourceDiagnostics({run_id,contracts:selected,routed:[{run_id,contract:selected[0],lane:'CONTROLLED_UNKNOWN',status:'FAILED',actual_http:null,source_outcome:{attempted_http_count:1}},{run_id,contract:selected[1],lane:'CONTROLLED_ZERO',status:'CACHE',actual_http:0,source_outcome:{attempted_http_count:0}}]});assert.equal(d.known_actual_http,0);assert.equal(d.unknown_actual_http_rows,1);assert.equal(d.attempts[0].actual_http,null);assert.equal(d.attempts[1].actual_http,0);
});
