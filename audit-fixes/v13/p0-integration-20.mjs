import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {FixtureDB} from '../../post-v7-consolidated/liquidation/liquidation-extension/delivery/tests/db-fixture.mjs';
import {rawRoleFact} from '../../current-generation/tests/source-role-fixtures.mjs';

const runtime=path.resolve(process.argv[2]||'runtime');
const adapter=await import(pathToFileURL(path.join(runtime,'src/canonical-runtime-adapter.mjs')));
const publication=await import(pathToFileURL(path.join(runtime,'src/canonical-publication.mjs')));
const sender=await import(pathToFileURL(path.join(runtime,'src/bound-telegram-delivery-sidecar.mjs')));
const NOW=1790634600000;
const results=[];
const check=async(number,name,fn)=>{try{await fn();results.push({number,name,status:'PASS'});}catch(error){results.push({number,name,status:'FAIL',error:String(error?.message||error)});throw error;}};

const receipt=({direction='LONG',sourceTs=NOW-20_000,availableAt=sourceTs,wave='W1',contract='ABC-USDT',evidenceId='E1'}={})=>({
 status:'CLOSED',contract,wave_id:wave,direction_hint:direction,direction_state:`${direction}_WATCH`,source_ts:sourceTs,available_at:availableAt,
 feature_observed_ts:sourceTs,evidence_ids:[evidenceId],evidence:[{status:'CLOSED',domain:'RELATIVE_STRENGTH',side:direction,source_ts:sourceTs,available_at:availableAt,max_age_sec:900}],
});
const discovery=({quality=82,direction='LONG',sourceTs=NOW-20_000,wave='W1',contract='ABC-USDT',early=true,evidenceId='E1'}={})=>({
 contract,early_candidate_bridge:early,early_candidate_quality_0_100:quality,early_candidate_operational_priority_0_100:88,
 early_candidate_wave_id:wave,wave_id:wave,early_candidate_direction_hint:direction,early_candidate_source_ts:sourceTs,early_candidate_available_at:sourceTs,
 early_candidate_receipt:receipt({direction,sourceTs,wave,contract,evidenceId}),rolling_24h_change_pct:2,current_price:100,
 htx_futures_turnover_gate:{status:'CLOSED',allowed:true,turnover_usd_equivalent:2_000_000},
});
const plan=({remaining=6,target=106}={})=>({entry_area_min_price:99,entry_area_max_price:101,entry_area:'99–101 USDT',execution_reference_price:100,invalidation:{condition:'цена ниже 96 USDT',price:96},target_price:target,remaining_move_pct:remaining});
const trigger=({direction='LONG'}={})=>({metric:'price',operator:direction==='LONG'?'>=':'<=',value:direction==='LONG'?101:99,unit:'USDT',timeframe:'5m',expires_ts:NOW+600_000,next_recheck_ts:NOW+300_000,cancel_condition:direction==='LONG'?'цена ниже 96 USDT':'цена выше 104 USDT'});
const inputs=({quality=82,direction='LONG',remaining=6,target=106,overall=null,hard=false,early=true,sourceTs=NOW-20_000,wave='W1',contract='ABC-USDT',routeState='REJECTED'}={})=>({
 contract,run_id:'R1',snapshot_id:'S1',observed_ts:NOW,discovery_row:discovery({quality,direction,sourceTs,wave,contract,early}),
 publication_shadow:{entry_signal:{state:routeState,direction,hard_veto:hard,trigger:trigger({direction})},score_interval:{score_lower_bound:overall},scenario_plan:plan({remaining,target}),publication_gate:{status:'NOT_CLOSED'}},
 public_evidence:{contract_code:contract,observed_ts:NOW,evidence:[rawRoleFact({venue:'HTX',metric:'execution_gate_status',contract,ts:NOW}),rawRoleFact({venue:'BINANCE',contract,ts:NOW})]},
 futures_component:{ok:true,available_ts:NOW,data:{ts:NOW}},liquidation_intelligence:{projected_clusters:[],projected_map_status:'NOT_CLOSED'},
 free_source_summary:{status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[]},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0},
});
const build=opts=>adapter.buildRuntimeCanonicalBundle(inputs(opts));
const actionable=c=>publication.assessActionability({canonical:c,lifecycle_event:'OBSERVE'});

await check(1,'current early 82 becomes one actionable OBSERVE',()=>{const b=build({});assert.equal(b.canonical.state,'OBSERVE');assert.equal(b.canonical.direction,'LONG');assert.equal(b.canonical.scores.coin_interest_0_100,82);assert.equal(actionable(b.canonical).deliver,true);assert.equal(b.telegram.ok,true);});
await check(2,'OBSERVE does not invent overall or ENTRY',()=>{const c=build({overall:null}).canonical;assert.equal(c.state,'OBSERVE');assert.equal(c.scores.overall_0_100,null);assert.notEqual(c.state,'ENTRY_NOW_ANALYTICAL');});
await check(3,'deep factual interest may authorize OBSERVE without early origin flag',()=>{assert.equal(adapter.selectCanonicalPublicationState({route_state:'REJECTED',interest:71,direction:'LONG',observe_contract_closed:true}),'OBSERVE');});
await check(4,'interest 69 is rejected',()=>{assert.equal(adapter.selectCanonicalPublicationState({route_state:'REJECTED',interest:69,direction:'LONG',observe_contract_closed:true}),'REJECTED');});
await check(5,'positive 4.9 percent plan remains eligible for early observation',()=>{const c=build({remaining:4.9,target:104.9}).canonical;assert.equal(c.state,'OBSERVE');assert.equal(actionable(c).deliver,true);});
await check(6,'hard veto is rejected',()=>{assert.equal(build({hard:true}).canonical.state,'REJECTED');});
await check(7,'neutral label cannot erase valid LONG receipt',()=>{const d=discovery({});d.direction_hint='NEUTRAL';const r=adapter.resolveCanonicalDirection({route:{state:'REJECTED',direction:'NEUTRAL'},discovery:d,decision_ts:NOW});assert.equal(r.status,'CLOSED');assert.equal(r.direction,'LONG');});
await check(8,'opposite valid directions conflict',()=>{const r=adapter.resolveCanonicalDirection({route:{state:'WAIT_FOR_TRIGGER',direction:'SHORT'},discovery:discovery({direction:'LONG'}),decision_ts:NOW});assert.equal(r.status,'CONFLICT');assert.equal(r.direction,null);});
await check(9,'stale future and foreign receipts are ignored',()=>{for(const d of [discovery({sourceTs:NOW-16*60_000}),discovery({sourceTs:NOW+1}),discovery({contract:'ABC-USDT'})]){if(d===undefined)continue;}const stale=adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:discovery({sourceTs:NOW-16*60_000}),decision_ts:NOW});const future=adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:discovery({sourceTs:NOW+1}),decision_ts:NOW});const foreign=discovery({});foreign.early_candidate_receipt.contract='XYZ-USDT';assert.equal(stale.status,'UNKNOWN');assert.equal(future.status,'UNKNOWN');assert.equal(adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:foreign,decision_ts:NOW}).status,'UNKNOWN');});
await check(10,'wave mismatch cannot bind direction',()=>{const d=discovery({});d.early_candidate_receipt.wave_id='OTHER';assert.equal(adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:d,decision_ts:NOW}).status,'UNKNOWN');});
await check(11,'new episode does not revive expired receipt',()=>{const old=discovery({sourceTs:NOW-20*60_000,wave:'OLD'}),fresh=discovery({sourceTs:NOW-5_000,wave:'NEW',evidenceId:'E2'});assert.equal(adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:old,decision_ts:NOW}).status,'UNKNOWN');assert.equal(adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:fresh,decision_ts:NOW}).direction,'LONG');});

const canonical=({run='R1',snapshot='S1',wave='W1',state='OBSERVE',direction='LONG',interest=82,overall=null,remaining=6}={})=>{
 const c=build({quality:interest,direction,remaining,target:direction==='LONG'?106:94,overall,wave,routeState:state==='OBSERVE'?'REJECTED':state}).canonical;
 c.run_id=run;c.snapshot_id=snapshot;c.state=state;c.direction=direction;c.analytical_fingerprint=publication.canonicalFingerprint(c);return c;
};
const render=c=>({telegram:publication.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}),manual:publication.renderCanonicalManual({canonical:c,lifecycle_event:'OBSERVE'})});
await check(12,'repeat persistence is idempotent',async()=>{const db=new FixtureDB();try{const c=canonical(),a=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:'W1',now_ts:NOW}),b=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:'W1',now_ts:NOW});assert.equal(a.status,'CLOSED');assert.equal(b.status,'DEDUPLICATED');assert.equal(a.publication_id,b.publication_id);}finally{db.close();}});
await check(13,'failed persistence creates no dispatch binding',async()=>{const db=new FixtureDB();try{const c=canonical();c.scores.coin_interest_0_100=99;const p=await publication.persistCanonicalSnapshot(db,{canonical:c,wave_id:'W1',now_ts:NOW});assert.equal(p.persisted,false);assert.equal(db.raw.prepare('SELECT count(*) n FROM v3_dispatch_publication_binding_shadow').get().n,0);}finally{db.close();}});
await check(14,'formatter refusal prevents transport',()=>{const c=canonical();c.direction=null;c.analytical_fingerprint=publication.canonicalFingerprint(c);assert.equal(publication.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}).ok,false);});
await check(15,'positive provider response records SENT and message id',async()=>{const db=new FixtureDB();try{const c=canonical(),p=await publication.persistCanonicalSnapshot(db,{canonical:c,presentation_inputs:{manual_text:render(c).manual.text},wave_id:'W1',now_ts:NOW});db.raw.prepare('INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)').run('ABC-USDT','LONG','W1','v3','OBSERVE','fixture',NOW,NOW+600000,NOW);db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'PENDING',?,?,1)").run('D15','K15','ABC-USDT','LONG','W1','OBSERVE','v3',NOW,NOW);let calls=0;const out=await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:'https://relay.invalid/test',relay_key:'LOCAL_TEST_ONLY',source_run_id:'R1',now_ts:NOW+1000,fetch_impl:async()=>{calls++;return new Response(JSON.stringify({ok:true,message_id:15001}),{status:200,headers:{'content-type':'application/json'}});}});assert.equal(out.sent,1);assert.equal(calls,1);assert.equal(db.raw.prepare("SELECT state,telegram_message_id FROM v3_telegram_dispatch_shadow WHERE idempotency_key='K15'").get().telegram_message_id,'15001');assert.ok(p.publication_id);}finally{db.close();}});
await check(16,'provider failure is never SENT or blindly duplicated',async()=>{const db=new FixtureDB();try{const c=canonical(),p=await publication.persistCanonicalSnapshot(db,{canonical:c,presentation_inputs:{manual_text:render(c).manual.text},wave_id:'W1',now_ts:NOW});db.raw.prepare('INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)').run('ABC-USDT','LONG','W1','v3','OBSERVE','fixture',NOW,NOW+600000,NOW);db.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'PENDING',?,?,1)").run('D16','K16','ABC-USDT','LONG','W1','OBSERVE','v3',NOW,NOW);await sender.runBoundTelegramDeliverySidecar(db,{enabled:true,relay_url:'https://relay.invalid/test',relay_key:'LOCAL_TEST_ONLY',source_run_id:'R1',now_ts:NOW+1000,fetch_impl:async()=>new Response(JSON.stringify({ok:false}),{status:500})});assert.notEqual(db.raw.prepare("SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='K16'").get().state,'SENT');assert.ok(p.publication_id);}finally{db.close();}});
await check(17,'removal without prior delivery is not actionable',()=>{assert.equal(publication.assessActionability({canonical:canonical({state:'REJECTED'}),lifecycle_event:'IDEA_REMOVED',prior_sent:false}).deliver,false);});
await check(18,'manual and Telegram share one canonical fingerprint',()=>{const c=canonical(),r=render(c);assert.equal(r.telegram.analytical_fingerprint,c.analytical_fingerprint);assert.equal(r.manual.analytical_fingerprint,c.analytical_fingerprint);});
await check(19,'missing target remains an honest early observation with target pending',()=>{const c=build({remaining:null,target:null}).canonical;assert.equal(c.state,'OBSERVE');assert.equal(c.metadata?.scenario_plan_transfer?.target_proof_status,'PENDING_FOR_EARLY_OBSERVATION');assert.equal(actionable(c).deliver,true);});
await check(20,'next cycle uses its own evidence and does not refresh old evidence',()=>{const first=adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:discovery({sourceTs:NOW-10_000,evidenceId:'E1'}),decision_ts:NOW});const nextTs=NOW+20*60_000;const old=adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:discovery({sourceTs:NOW-10_000,evidenceId:'E1'}),decision_ts:nextTs});const current=adapter.resolveCanonicalDirection({route:{state:'REJECTED'},discovery:discovery({sourceTs:nextTs-10_000,evidenceId:'E2'}),decision_ts:nextTs});assert.equal(first.direction,'LONG');assert.equal(old.status,'UNKNOWN');assert.equal(current.direction,'LONG');});

const failed=results.filter(row=>row.status!=='PASS');
console.log(JSON.stringify({schema:'report2-v13-p0-integration-20-v1',status:failed.length?'FAIL':'PASS',runtime,passed:results.length-failed.length,failed:failed.length,results},null,2));
if(failed.length)process.exitCode=1;
