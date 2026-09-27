import fs from 'node:fs';import http from 'node:http';import {createHash} from 'node:crypto';import {createCombinedLiquidationService} from './src/combined-runner-service.mjs';import {FixtureDB} from './delivery/tests/db-fixture.mjs';
const stamp=new Date().toISOString().replace(/[:.]/g,'');const root=new URL(`./runs/live-multi-delivery-${stamp}/`,import.meta.url);fs.mkdirSync(root,{recursive:true});let calls=0;
const sha=b=>createHash('sha256').update(b).digest('hex');
if(!process.argv.includes('--live'))throw Error('EXPLICIT_LIVE_READ_ONLY_FLAG_REQUIRED');
// This exercise uses fixture quota, not production account admission.
const grantUsed={HYPERLIQUID:0,LIQFLOW:0,GTRADE:0},caps={HYPERLIQUID:5,LIQFLOW:1,GTRADE:3},reservations=new Set();
const provider_admit=async r=>{if(reservations.has(r.reservation_id))return{allowed:false,new_reservation:false};const entries=Object.entries(r.requests);if(entries.some(([p,n])=>!Number.isSafeInteger(n)||n<1||!Object.hasOwn(caps,p)||grantUsed[p]+n>caps[p]))return{allowed:false,new_reservation:false};for(const [p,n]of entries)grantUsed[p]+=n;reservations.add(r.reservation_id);return{allowed:true,new_reservation:true,reservation_id:r.reservation_id,scope:'ISOLATED_TEST_QUOTA_NOT_ACCOUNT_ENTITLEMENT'};};
async function capture(url,init){const index=String(++calls).padStart(2,'0'),response=await fetch(url,init);const bytes=Buffer.from(await response.clone().arrayBuffer());fs.writeFileSync(new URL(index+'.raw',root),bytes);fs.writeFileSync(new URL(index+'.receipt.json',root),JSON.stringify({url:String(url),request_body:init?.body?JSON.parse(init.body):null,method:init?.method??'GET',http_status:response.status,received_ts:Date.now(),sha256:sha(bytes),bytes:bytes.length,credentials_saved:false},null,2));return response;}
const service=createCombinedLiquidationService({mode:'SHADOW_ONLY',provider_admit,fetch_impl:capture,accounts_per_deep:4,max_http_per_run:9,max_total_ms:45000});
const started=Date.now(),runId='ISOLATED_LIVE_LIQ_'+started;
const acquisition=await service.collect({contract:'FIL-USDT',native_symbol:'FIL',run_id:runId,deep_started_ts:started,max_deep_ms:45000,manual_liquidation_request:true});
const observed=Date.now();fs.writeFileSync(new URL('acquisition.json',root),JSON.stringify(acquisition,null,2));
const {buildRuntimeCanonicalBundle}=await import('./.verification/postv7-after/src/canonical-runtime-adapter.mjs');
const publication=await import('../unified-delivery-base/test-runtime/src/canonical-publication.mjs');const {runBoundTelegramDeliverySidecar}=await import('../unified-delivery-base/test-runtime/src/bound-telegram-delivery-sidecar.mjs');
// THESE ARE TRANSPORT-TEST SCENARIO INPUTS. They do not claim real opportunity
// quality, HTX gates, actual price target, or an actionable trading signal.
const bundle=buildRuntimeCanonicalBundle({contract:'FIL-USDT',run_id:runId,snapshot_id:'LIVE_LIQ_TEST:'+observed,observed_ts:observed,
 discovery_row:{contract:'FIL-USDT',rolling_24h_change_pct:2,early_candidate_quality_0_100:80},
 publication_shadow:{entry_signal:{state:'WAIT_FOR_TRIGGER',direction:'LONG',trigger:{metric:'price',operator:'>=',value:1.15,unit:'USDT',timeframe:'5m',expires_ts:observed+600000,next_recheck_ts:observed+120000,cancel_condition:'ТЕСТ ПЕРЕДАЧИ ДАННЫХ — НЕ ТОРГОВЫЙ СИГНАЛ'}},score_interval:{score_lower_bound:72},scenario_plan:{execution_reference_price:1.14}},
 public_evidence:{evidence:[]},liquidation_intelligence:{projected_clusters:[],projected_map_status:'NOT_CLOSED'},native_liquidation_acquisition:acquisition,
 free_source_summary:{status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[]},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0}});
fs.writeFileSync(new URL('canonical.json',root),JSON.stringify(bundle.canonical,null,2));fs.writeFileSync(new URL('manual.txt',root),bundle.manual.text??'MANUAL_NOT_CLOSED');
const db=new FixtureDB(),received=[];let server=null;let result=null,manual=null,persist=null;
try{
 const c=bundle.canonical;persist=await publication.persistCanonicalSnapshot(db,{canonical:c,presentation_inputs:{manual_text:bundle.manual.text},wave_id:'TEST_WAVE',now_ts:observed});
 if(persist.persisted){
  db.raw.prepare('INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)').run('FIL-USDT','LONG','TEST_WAVE','v3','WAIT','test',observed,observed+600000,observed);
  db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES('TEST_D','TEST_K','FIL-USDT','LONG','TEST_WAVE','WAIT','v3','PENDING',?,?,1)").run(observed,observed);
  server=http.createServer(async(req,res)=>{let text='';for await(const b of req)text+=b;received.push(JSON.parse(text));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,message_id:98222}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  result=await runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:`http://127.0.0.1:${server.address().port}/ONLY_LOCAL_TEST`,relay_key:'NONSECRET_TEST',now_ts:Date.now(),source_run_id:runId});manual=await publication.loadExactManual(db,{publication_id:persist.publication_id});
 }
 const tg=received[0]?.text??null,source=service.summary();const proof={status:result?.sent===1&&manual?.ok&&tg?.includes('gTrade FIL')&&tg?.includes('Hyperliquid FIL')?'LIVE_TWO_SOURCE_TO_REAL_SENDER_LOOPBACK_PASS':'NOT_CLOSED',
 run_id:runId,node:process.version,started_ts:started,observed_ts:observed,source_elapsed_ms:observed-started,actual_http:calls,quota:{scope:'ISOLATED_FIXTURE_ACCOUNT_QUOTA_NOT_PROVISIONED',caps,grantUsed},collection:source,
 independent_contexts:c?.liquidations?.multi_source_extension?.source_count??0,source_asof:{hyperliquid:c?.liquidations?.native_extension?.source_ts??null,gtrade:c?.liquidations?.independent_extensions?.[0]?.source_ts??null},
 source_clock_modified:false,actionability_scenario_is_synthetic:true,actual_source_responses:true,persist_status:persist?.status,receiver_requests:received.length,sender_sent:result?.sent??0,
 same_saved_manual:manual?.text===bundle.manual.text,same_fingerprint:manual?.analytical_fingerprint===c.analytical_fingerprint,telegram_length:tg?.length??0,manual_length:manual?.text?.length??0,
 canonical_bytes:Buffer.byteLength(JSON.stringify(c)),liquidation_bytes:Buffer.byteLength(JSON.stringify(c.liquidations)),fixture_db_counts:db.usageSnapshot(),live_cloud_D1_used:false,actual_Telegram_user_sent:false,production_changed:false};
 fs.writeFileSync(new URL('proof.json',root),JSON.stringify(proof,null,2));if(tg)fs.writeFileSync(new URL('telegram-test-only.txt',root),tg);console.log(JSON.stringify({...proof,collection:undefined,path:root.pathname}));
 if(proof.status!=='LIVE_TWO_SOURCE_TO_REAL_SENDER_LOOPBACK_PASS')process.exitCode=2;
}finally{if(server)await new Promise(r=>server.close(r));db.close();}
