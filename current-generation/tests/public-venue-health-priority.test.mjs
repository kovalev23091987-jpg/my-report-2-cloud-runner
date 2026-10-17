import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const path=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {orderPublicVenueRoutes,publicVenueHealthObservations,publicVenueHealthSource}=await import(path('public-venue-source-priority.mjs'));
const {evidenceSourceHealthObservation,classifyEvidenceSourceHealth}=await import(path('candidate-evidence-v2-runtime.mjs'));
const {collectN05VenueRoutes}=await import(path('external-n05-flow-collector.mjs'));
const {recordEvidenceSourceHealth}=await import(path('evidence-source-store.mjs'));
const {normalizeBitfinexNativeFlow}=await import(path('bitfinex-native-four-hour-flow.mjs'));
const {normalizeHtxAssetReferences}=await import(path('htx-asset-identity.mjs'));
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p))),end=1791720960000,now=end+18000,contract='DASH-USDT';
const paths={catalog:'checkpoints/n05-bitfinex-pilot-38138499328/BITFINEX-CURRENT-CATALOG.json.gz',candles:'checkpoints/n05-bitfinex-pilot-38138608166/BITFINEX-DASH-CANDLES1M.json.gz',trades:'checkpoints/n05-bitfinex-pilot-38138608166/BITFINEX-DASH-TRADES10000.json.gz',identity:'checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz'};
const c=normalizeBitfinexNativeFlow({contract,identity:normalizeHtxAssetReferences(read(paths.identity)).entries.DASH.identities[0],catalog:read(paths.catalog),candles:read(paths.candles),trades:read(paths.trades),window_end_ts:end,observed_ts:now});assert.equal(c.check_completed,true);
const flow=()=>({status:'CLOSED',network_calls:5,flow_network_calls:5,evidence:[],components:[c],adapter_results:[{venue:'BINANCE',status:'NO_CURRENT_FLOW',network_calls:2},{venue:'BITFINEX',status:'CLOSED',network_calls:3}]});
const historyRow=(venue,extra={})=>({contract,source_id:publicVenueHealthSource(venue),run_id:'real:'+venue,observed_ts:now-1000,actual_http:3,status:'CLOSED',operational_class:'CONTEXT_AVAILABLE',evidence_rows:1,valid_rows:1,decision_usable_rows:0,...extra});
const database=()=>{const sql=new DatabaseSync(':memory:');return{sql,prepare(q){return{bind(...a){this.args=a;return this;},async run(){return sql.prepare(q).run(...(this.args||[]));},async first(){return sql.prepare(q).get(...(this.args||[]))||null;},async all(){return{results:sql.prepare(q).all(...(this.args||[]))};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};};
test('original Bitfinex neutral flow is useful in aggregate and exact venue journal without decision points',()=>{
 const f=flow(),a=evidenceSourceHealthObservation('EXTERNAL_N05_FLOW',f,{contract,decision_ts:now});assert.equal(a.operational_class,'CONTEXT_AVAILABLE');assert.equal(a.valid_rows,1);assert.equal(a.decision_usable_rows,0);assert.equal(a.actual_http,5);
 const rows=publicVenueHealthObservations(f,{contract,now}),good=rows.find(r=>r.source_id===publicVenueHealthSource('BITFINEX'));assert.equal(good.valid_rows,1);assert.equal(good.actual_http,3);assert.equal(good.decision_usable_rows,0);assert.equal(rows.find(r=>r.source_id===publicVenueHealthSource('BINANCE')).valid_rows,0);assert.equal(rows.reduce((n,r)=>n+r.actual_http,0),5);
});
test('foreign, duplicate, partial, stale or future windows cannot make a venue useful; HTTP reconciliation remains strict',()=>{
 for(const patch of [{contract:'OTHER-USDT'},{window_end_ts:end-60000},{observed_ts:now+1},{verified_minutes:239}]){const f=flow();f.components=[{...c,...patch}];assert.equal(publicVenueHealthObservations(f,{contract,now}).find(r=>r.source_id===publicVenueHealthSource('BITFINEX')).valid_rows,0);}
 const f=flow();f.components.push(c);assert.equal(publicVenueHealthObservations(f,{contract,now}).find(r=>r.source_id===publicVenueHealthSource('BITFINEX')).valid_rows,0);assert.equal(publicVenueHealthObservations(flow(),{contract,now:end+300001}).find(r=>r.source_id===publicVenueHealthSource('BITFINEX')).valid_rows,0);
 for(const patch of [{flow_network_calls:4},{network_calls:4},{adapter_results:[...flow().adapter_results,flow().adapter_results[0]]},{adapter_results:[{venue:'BITFINEX',network_calls:6}]}])assert.deepEqual(publicVenueHealthObservations({...flow(),...patch},{contract,now}),[]);
});
test('exact venue histories prioritize N05 and N12 separately, preserve static ties and reject wrong market facts',()=>{
 const routes=[['GATE'],['BITFINEX'],['BITGET'],['GATE_FUTURES_N12'],['OKX_N12_NATIVE']],observations=[historyRow('BITFINEX'),historyRow('OKX_N12_NATIVE',{actual_http:1})],x=orderPublicVenueRoutes(routes,{observations},{contract,now});assert.deepEqual(x.routes.map(r=>r[0]),['BITFINEX','GATE','BITGET','OKX_N12_NATIVE','GATE_FUTURES_N12']);assert.equal(x.receipt.source_statistics.BITFINEX.valid_rows_per_http,1/3);assert.equal(x.receipt.score_changed,false);
 for(const patch of [{contract:'OTHER-USDT'},{observed_ts:now+1},{actual_http:0},{valid_rows:2}])assert.deepEqual(orderPublicVenueRoutes(routes,{observations:[historyRow('BITFINEX',patch)]},{contract,now}).routes,routes);
 assert.deepEqual(orderPublicVenueRoutes(routes,{status:'D1_CAP',observations:[]},{contract,now}).routes,routes);
});
test('journal stores aggregate plus exact attempted venue observations once and no internal skips; no HTTP sum semantics',async()=>{
 const d=database();try{const f=flow(),aggregate=evidenceSourceHealthObservation('EXTERNAL_N05_FLOW',f,{contract,decision_ts:now}),rows=publicVenueHealthObservations(f,{contract,now}).map(r=>({...r,operational_class:classifyEvidenceSourceHealth({...r,network_calls:r.actual_http},r.valid_rows)})),grants=[];
 const r=await recordEvidenceSourceHealth(d,{contract,run_id:'ORIGINAL_REPLAY',observations:[aggregate,...rows],admit:p=>(grants.push(p),{allowed:true}),now});assert.equal(r.status,'CLOSED_OPERATIONAL_JOURNAL');assert.deepEqual(grants,[{rows_read:48,rows_written:13}]);assert.equal(d.sql.prepare('SELECT COUNT(*) AS n FROM report2_evidence_source_health_observation').get().n,3);assert.equal(d.sql.prepare('SELECT valid_rows,decision_usable_rows FROM report2_evidence_source_health_observation WHERE source_id=?').get(publicVenueHealthSource('BITFINEX')).valid_rows,1);
 await recordEvidenceSourceHealth(d,{contract,run_id:'ORIGINAL_REPLAY',observations:[aggregate,...rows],admit:()=>({allowed:true}),now});assert.equal(d.sql.prepare('SELECT COUNT(*) AS n FROM report2_evidence_source_health_observation').get().n,3);
 }finally{d.sql.close();}
});
test('production public orchestrator reads admitted journal, orders proven source, then falls back within same five slots and preserves cache',async()=>{
 const d=database();try{await recordEvidenceSourceHealth(d,{contract,run_id:'ORIGINAL_JOURNAL',observations:publicVenueHealthObservations(flow(),{contract,now}).map(r=>({...r,operational_class:classifyEvidenceSourceHealth({...r,network_calls:r.actual_http},r.valid_rows)})),admit:()=>({allowed:true}),now});let used=0;const seen=[],routes=[['BINANCE',async p=>{seen.push('BINANCE');const g=p.request_admit({attempts:5});if(g.allowed)for(let i=0;i<5;i++)await p.fetch_impl('https://controlled.invalid/'+i);return{status:g.allowed?'CLOSED':'CAP',network_calls:g.allowed?5:0,components:[c]};}],['BITFINEX',async()=>{seen.push('BITFINEX');return{status:'SOURCE_DAILY_CAP_REACHED',network_calls:0};}],['BITGET',async()=>{seen.push('BITGET');return{status:'CLOSED',network_calls:0,components:[]};}]];
 const r=await collectN05VenueRoutes({db:d,contract,now,source_health_admit:()=>({allowed:true}),request_admit:p=>(used+=p.attempts,{allowed:true}),fetch_impl:async()=>new Response('{}')},routes);assert.deepEqual(seen,['BITFINEX','BINANCE','BITGET']);assert.equal(r.caller_reserved_requests,5);assert.equal(used,5);assert.equal(r.network_calls,5);assert.equal(r.source_priority.source_statistics.BITFINEX.useful,true);
 }finally{d.sql.close();}
});
test('retained raw source proof preserves original clocks and digests and claims no new current market coverage',()=>{
 const rows=publicVenueHealthObservations(flow(),{contract,now});fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/public-venue-health-original-proof.json',JSON.stringify({schema:'PUBLIC_VENUE_HEALTH_RETAINED_RAW_REPLAY_V1',contract,original_source_run:38138608166,window_end_ts:c.window_end_ts,observed_ts:c.observed_ts,source_files:Object.entries(paths).map(([role,p])=>({role,path:p,body_sha256:crypto.createHash('sha256').update(zlib.gunzipSync(fs.readFileSync(p))).digest('hex')})),controlled_original_source_count_replay:true,venue_rows:rows,aggregate:evidenceSourceHealthObservation('EXTERNAL_N05_FLOW',flow(),{contract,decision_ts:now}),live_sourceHTTP:0,live_D1:0,MAIN:0,Telegram:0,clocks_refreshed:false,new_current105_coverage_proven:false},null,2)+'\n');
});
test('original Gate N12 futures sample is useful only in its own role and stays separate from N05 and cached-only routes',async()=>{
 const {normalizeGateFuturesTradeSample}=await import(path('gate-futures-trade-sample.mjs')),trades=read('checkpoints/n05-actual-qualification-38049404414/flow-GATE-FUTURES-AAVE.json.gz'),instrument=read('checkpoints/n05-actual-qualification-38049404414/catalog-GATE-FUTURES.json.gz').find(r=>r.name==='AAVE_USDT'),identity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'},clock=Math.round(Math.max(...trades.map(r=>r.create_time_ms))*1000)+1000;
 const actual=normalizeGateFuturesTradeSample({contract:'AAVE-USDT',identity,currencies:[{currency:'AAVE',chains:[{name:'ETH',addr:identity.contract_or_mint}]}],spot:[{id:'AAVE_USDT',base:'AAVE',quote:'USDT',trade_status:'tradable'}],future_contract:instrument,trades,observed_ts:clock});assert.equal(actual.check_completed,true);
 const f={network_calls:2,flow_network_calls:2,evidence:actual.evidence,components:[],adapter_results:[{venue:'GATE',network_calls:0,status:'CLOSED'},{venue:'GATE_FUTURES_N12',network_calls:2,status:actual.status}]},rows=publicVenueHealthObservations(f,{contract:'AAVE-USDT',now:clock});assert.equal(rows.length,1);assert.equal(rows[0].source_id,'N12_PUBLIC_VENUE:GATE_FUTURES_N12');assert.equal(rows[0].valid_rows,1);assert.equal(rows[0].decision_usable_rows,0);
 assert.equal(publicVenueHealthObservations(f,{contract:'OTHER-USDT',now:clock})[0].valid_rows,0);assert.equal(publicVenueHealthObservations({...f,evidence:actual.evidence.map(e=>({...e,provider_id:'OKX_FUTURES_TRADES'}))},{contract:'AAVE-USDT',now:clock})[0].valid_rows,0);
});
