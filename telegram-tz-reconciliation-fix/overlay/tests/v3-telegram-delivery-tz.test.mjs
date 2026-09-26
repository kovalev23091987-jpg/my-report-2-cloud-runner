import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runV3TelegramDeliverySidecar} from '../../test_runtime/src/v3-telegram-delivery-sidecar.mjs';

function norm(sql,args){const picks=[];const q=String(sql).replace(/\?(\d+)/g,(_,n)=>{picks.push(Number(n)-1);return '?';});return picks.length?[q,picks.map(i=>args[i])]:[sql,args];}
class Prep{constructor(owner,sql,args=[]){this.owner=owner;this.sql=sql;this.args=args;}bind(...args){return new Prep(this.owner,this.sql,args);}async first(){const [q,a]=norm(this.sql,this.args);const r=this.owner.db.prepare(q).get(...a)??null;this.owner.read(r?1:0);return r;}async all(){const [q,a]=norm(this.sql,this.args);const r=this.owner.db.prepare(q).all(...a);this.owner.read(r.length);return {results:r};}async run(){const [q,a]=norm(this.sql,this.args);const r=this.owner.db.prepare(q).run(...a);this.owner.write(Number(r.changes||0));return {meta:{changes:Number(r.changes||0)}};}}
class DB{constructor(){this.db=new DatabaseSync(':memory:');this.u={requests:0,rows_read:0,rows_written:0,unknown_ops:0,targets:{}};}prepare(sql){return new Prep(this,sql);}read(n){this.u.requests++;this.u.rows_read+=n;}write(n){this.u.requests++;this.u.rows_written+=n;}async batch(stmts){const out=[];this.db.exec('BEGIN');try{for(const s of stmts){const [q,a]=norm(s.sql,s.args);if(/^\s*(SELECT|PRAGMA)/i.test(q)){const r=this.db.prepare(q).all(...a);this.read(r.length);out.push({results:r});}else{const r=this.db.prepare(q).run(...a);const c=Number(r.changes||0);this.write(c);out.push({meta:{changes:c}});}}this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}usageSnapshot(){return structuredClone(this.u);}}
function schema(d){d.db.exec(`
CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,valid_until_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,PRIMARY KEY(contract,direction,wave_id,rules_version));
CREATE TABLE v3_telegram_dispatch_shadow(dispatch_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,contract TEXT,direction TEXT,wave_id TEXT,lifecycle_event TEXT,rules_version TEXT,state TEXT,decision_id TEXT,message_hash TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
CREATE TABLE v3_early_candidate_wave(wave_id TEXT PRIMARY KEY,contract_code TEXT,lifecycle_stage TEXT,direction_hint TEXT,early_detection_quality_0_100 INTEGER,first_seen_ts INTEGER,first_seen_price REAL,last_seen_ts INTEGER);
CREATE TABLE final_decision_integration_shadow(decision_id TEXT PRIMARY KEY,contract_code TEXT,observation_ts INTEGER,direction TEXT,entry_action TEXT,data_quality TEXT,execution_quality TEXT,independence_state TEXT,timing_state TEXT,risk_state TEXT,hard_veto INTEGER,persisted_ts INTEGER,decision_json TEXT);
CREATE TABLE final_decision_telegram_context_shadow(decision_id TEXT PRIMARY KEY,valid_until_ts INTEGER,status TEXT,score_lower_bound REAL,score_upper_bound REAL,context_json TEXT);
CREATE TABLE shadow_decision_log(contract_code TEXT,observed_ts INTEGER,direction_hint TEXT,dc_long REAL,dc_short REAL,eq_status TEXT,dq_status TEXT,stage TEXT,data_sufficiency TEXT,missing_chains_json TEXT,evidence_flags_json TEXT,created_ts INTEGER);
CREATE TABLE v3_early_feature_snapshot(contract_code TEXT,observed_ts INTEGER,direction_hint TEXT,direction_state TEXT,long_evidence_domain_count INTEGER,short_evidence_domain_count INTEGER,early_detection_quality_0_100 INTEGER,feature_json TEXT,evidence_json TEXT);
CREATE TABLE opportunity_shadow_event(contract_code TEXT,observed_ts INTEGER,timeframe TEXT,event_type TEXT,funnel_stage TEXT,data_quality TEXT,event_json TEXT);
CREATE TABLE multi_wave_campaign_shadow(contract_code TEXT,current_phase TEXT,direction TEXT,entry_trigger_time INTEGER,entry_trigger_price REAL,base_low REAL,base_high REAL,last_observed_ts INTEGER,campaign_json TEXT);
CREATE TABLE liquidation_shadow_observation(contract_code TEXT,observed_ts INTEGER,provider TEXT,asset_identity_verified INTEGER,projected_map_status TEXT,realized_status TEXT,dq_status TEXT,source_ts INTEGER,freshness_status TEXT,projected_clusters_json TEXT,realized_json TEXT,coverage_json TEXT,derived_json TEXT);
CREATE TABLE v3_pipeline_health_shadow(namespace TEXT PRIMARY KEY,status TEXT,reasons_json TEXT,changed_ts INTEGER,last_checked_ts INTEGER,shadow_only INTEGER);
CREATE TABLE v3_pipeline_health_event_shadow(event_id TEXT PRIMARY KEY,transition TEXT,from_status TEXT,to_status TEXT,reasons_json TEXT,state TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
`);}
function insertObserve(d,{now=100000,valid=160000,state='PENDING'}={}){
 d.db.prepare(`INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)`).run('RAY-USDT','LONG','W1','v3','OBSERVE','USEFUL_LIVE_OBSERVATION',now-1000,valid,now-900);
 d.db.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,?,?,?,1)`).run('D1','k1','RAY-USDT','LONG','W1','OBSERVE','v3',state,now-900,now-900);
 d.db.prepare(`INSERT INTO v3_early_candidate_wave VALUES(?,?,?,?,?,?,?,?)`).run('W1','RAY-USDT','DISCOVERY','LONG',73,now-60000,1.0,now-500);
 d.db.prepare(`INSERT INTO shadow_decision_log VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run('RAY-USDT',now-600,'LONG',62,5,'SHADOW_MEASURABLE','PARTIAL','SHADOW_OBSERVE_LONG_BIAS','PARTIAL','[]',JSON.stringify({funding_pct:-0.02,funding_interval_hours:4,oi_1h_change_pct:2.2,oi_4h_change_pct:7.1,spot_flow_delta_pct:3.4,price_24h_pct:8}),now-600);
 d.db.prepare(`INSERT INTO v3_early_feature_snapshot VALUES(?,?,?,?,?,?,?,?,?)`).run('RAY-USDT',now-550,'LONG','DIRECTION_NOT_CLOSED',2,0,73,'{}',JSON.stringify([{domain:'RELATIVE_STRENGTH',side:'LONG',btc_1h_pct_points:1.2,eth_1h_pct_points:1.0,btc_4h_pct_points:2.1,eth_4h_pct_points:1.8}]));
 d.db.prepare(`INSERT INTO opportunity_shadow_event VALUES(?,?,?,?,?,?,?)`).run('RAY-USDT',now-500,'15m','ANOMALOUS_EFFORT_VS_RESULT','EARLY_WATCH','OK',JSON.stringify({volume_ratio_median:4.2,minute_decomposition:{classification_allowed:true,one_minute_bars:15,three_minute_bars:5,five_minute_bars:3},early_anomaly_classification:{accumulation:{evidence_score:70},distribution:{evidence_score:20},two_sided_transfer:{evidence_score:35},liquidation_futures_noise:{evidence_score:25}}}));
 d.db.prepare(`INSERT INTO multi_wave_campaign_shadow VALUES(?,?,?,?,?,?,?,?,?)`).run('RAY-USDT','DISCOVERY','DIRECTIONLESS_EVENT',null,null,0.95,1.02,now-500,'{}');
 d.db.prepare(`INSERT INTO liquidation_shadow_observation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('RAY-USDT',now-500,'HTX',1,'SOURCE_UNSUPPORTED','PARTIAL_HTX_ONLY','NOT_CLOSED',now-500,'CURRENT','[]',JSON.stringify({htx:{total_events:0,long_notional_usdt:0,short_notional_usdt:0}}),'{}','{}');
}

test('OBSERVE uses TZ-compliant Russian message, not raw lifecycle codes',async()=>{
 const d=new DB();schema(d);insertObserve(d);let msg='';
 const r=await runV3TelegramDeliverySidecar(d,{enabled:true,relay_url:'https://relay.test',relay_key:'secret',now_ts:100000,fetch_impl:async(_u,o)=>{msg=JSON.parse(o.body).text;return {ok:true,status:200,json:async()=>({ok:true,message_id:321})};}});
 assert.equal(r.status,'CLOSED');assert.equal(r.sent,1);assert.match(msg,/РАННЕЕ НАБЛЮДЕНИЕ/);assert.match(msg,/Свечной разбор/);assert.match(msg,/Монета интересна: 73 из 100/);assert.doesNotMatch(msg,/USEFUL_LIVE_OBSERVATION|\bOI\b|Funding|receipt|shadow/iu);
});

test('WAIT without exact trigger is never sent and remains retryable',async()=>{
 const d=new DB();schema(d);insertObserve(d);d.db.prepare(`UPDATE v3_user_lifecycle_shadow SET status='WAIT',reason='DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY'`).run();d.db.prepare(`UPDATE v3_telegram_dispatch_shadow SET lifecycle_event='WAIT',idempotency_key='kwait'`).run();let calls=0;
 const r=await runV3TelegramDeliverySidecar(d,{enabled:true,relay_url:'https://relay.test',relay_key:'secret',now_ts:100000,fetch_impl:async()=>{calls++;throw new Error('must not send');}});
 assert.equal(calls,0);assert.equal(r.sent,0);const row=d.db.prepare(`SELECT state,last_error FROM v3_telegram_dispatch_shadow WHERE idempotency_key='kwait'`).get();assert.equal(row.state,'FAILED_RETRYABLE');assert.equal(row.last_error,'WAIT_TRIGGER_NOT_CLOSED');
});

test('disabled network does not touch D1',async()=>{const d=new DB();schema(d);const before=d.usageSnapshot();const r=await runV3TelegramDeliverySidecar(d,{enabled:false});assert.equal(r.status,'NETWORK_DISABLED_FAIL_CLOSED');assert.deepEqual(d.usageSnapshot(),before);});
