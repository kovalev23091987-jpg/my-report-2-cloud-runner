import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createLiquidationAcquisition,buildEarlyLiquidationView} from '../src/liq-canonical-context.mjs';
const runtime=new URL('../../../unified-delivery-base/test-runtime/src/',import.meta.url);
const pub=await import(new URL('canonical-publication.mjs',runtime));
const {runBoundTelegramDeliverySidecar:send}=await import(new URL('bound-telegram-delivery-sidecar.mjs',runtime));
const live=JSON.parse(fs.readFileSync(new URL('../../proof/live-native-round2.json',import.meta.url),'utf8'));
const frame=live.receipt,T=frame.analysis_as_of_ms;
function norm(sql,args){const refs=[];const q=sql.replace(/\?(\d+)/g,(_,n)=>{refs.push(Number(n)-1);return '?';});return refs.length?[q,refs.map(i=>args[i])]:[sql,args];}
class DB{
 constructor(){this.s=new DatabaseSync(':memory:');this.u={requests:0,rows_read:0,rows_written:0,unknown_ops:0};this.dropFinalAck=false;
 this.s.exec(fs.readFileSync(new URL('../../../unified-delivery-base/migrations.sql',import.meta.url),'utf8'));
 this.s.exec(`CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,valid_until_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,PRIMARY KEY(contract,direction,wave_id,rules_version));
 CREATE TABLE v3_telegram_dispatch_shadow(dispatch_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,contract TEXT,direction TEXT,wave_id TEXT,lifecycle_event TEXT,rules_version TEXT,state TEXT,decision_id TEXT,message_hash TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
 CREATE TABLE v3_pipeline_health_shadow(namespace TEXT PRIMARY KEY,status TEXT,reasons_json TEXT,changed_ts INTEGER,last_checked_ts INTEGER,shadow_only INTEGER);
 CREATE TABLE v3_pipeline_health_event_shadow(event_id TEXT PRIMARY KEY,transition TEXT,from_status TEXT,to_status TEXT,reasons_json TEXT,state TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);`);
 }
 prepare(sql){const self=this;return{sql,args:[],bind(...args){this.args=args;return this;},async first(){const[q,a]=norm(sql,this.args),r=self.s.prepare(q).get(...a)??null;self.u.requests++;self.u.rows_read+=r?1:0;return r;},async all(){const[q,a]=norm(sql,this.args),r=self.s.prepare(q).all(...a);self.u.requests++;self.u.rows_read+=r.length;return{success:true,results:r};},async run(){const[q,a]=norm(sql,this.args);self.u.requests++;if(self.dropFinalAck&&sql.includes('telegram_message_id=?3')&&sql.includes("state='SENDING'"))return{success:true,meta:{changes:0}};const r=self.s.prepare(q).run(...a);self.u.rows_written+=Number(r.changes);return{success:true,meta:{changes:Number(r.changes)}};}};}
 async batch(statements){this.s.exec('BEGIN');try{const a=[];for(const s of statements)a.push(/^\s*SELECT/i.test(s.sql)?await s.all():await s.run());this.s.exec('COMMIT');return a;}catch(e){this.s.exec('ROLLBACK');throw e;}}
 usageSnapshot(){return structuredClone(this.u);}
 close(){this.s.close();}
}
function canonical(event='WAIT'){
 const acquisition=createLiquidationAcquisition({contract:'FIL-USDT',run_id:frame.run_id,acquisition_id:'ACQ:SOCKET',receipts:[frame],requests:live.requests,started_ts:live.transport[0].started_ts,completed_ts:T});
 const liq=buildEarlyLiquidationView({legacy:{pump:{is_pump:false}},acquisition,contract:'FIL-USDT',run_id:frame.run_id,snapshot_id:'S:SOCKET',observed_ts:T,max_age_ms:600000});
 const c={version:'CAPTURED_MARKET_WITH_SYNTHETIC_SCENARIO_FOR_DELIVERY_TEST',status:'CLOSED',snapshot_id:'S:SOCKET',run_id:frame.run_id,observed_ts:T,snapshot_time_utc:new Date(T).toISOString(),candidates:[{contract:'FIL-USDT'}],universe:[{contract:'FIL-USDT'}],state:event==='WAIT'?'WAIT_FOR_TRIGGER':event==='ENTRY'?'ENTRY_NOW_ANALYTICAL':event==='IDEA_REMOVED'?'REJECTED':'OBSERVE',direction:'LONG',scores:{overall_0_100:72,coin_interest_0_100:73,is_probability:false,entry_readiness_0_100:null},source_receipts:[],hard_gates:[{gate:'HTX_EXECUTION_TEST_FIXTURE',status:'CLOSED'}],entry:{area:'1,10–1,15 USDT'},trigger:{metric:'price',operator:'>=',value:1.15,unit:'USDT',timeframe:'5m',expires_ts:T+1800000,next_recheck_ts:T+300000,cancel_condition:'цена ниже 1,05 USDT'},invalidation:'цена ниже 1,05 USDT',targets:[{price:1.2}],liquidations:liq,metadata:{contract:'FIL-USDT',source_role_view:{status:'CLOSED',classified:[{source_key:'HTX_OFFICIAL',assigned_roles:['EXECUTION_TRUTH'],registry_known:true,source_family:'HTX'},{source_key:'HL',assigned_roles:['NATIVE_CONTEXT'],registry_known:true,source_family:'HL'}]}},safety:{automatic_execution:false,strategy_weights_changed:false,hard_gates_bypassed:false,validated_signal:false}};
 c.analytical_fingerprint=pub.canonicalFingerprint(c);return c;
}
async function seed(d,{event='WAIT',presentation_inputs={}}={}){
 const c=canonical(event),p=await pub.persistCanonicalSnapshot(d,{canonical:c,wave_id:'W:SOCKET',decision_id:event==='ENTRY'?'D:SOCKET':null,presentation_inputs,now_ts:T});assert.equal(p.persisted,true);
 d.s.prepare('INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)').run('FIL-USDT','LONG','W:SOCKET','v3',event,'fixture',T,T+1800000,T);
 d.s.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,decision_id,message_hash,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'PENDING',?,NULL,?,?,1)`).run('DISP:SOCKET','KEY:SOCKET','FIL-USDT','LONG','W:SOCKET',event,'v3',event==='ENTRY'?'D:SOCKET':null,T,T);
 return{c,p};
}
async function ready(d,event='WAIT'){
 const {c,p}=await seed(d,{event});const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:event}),m=pub.renderCanonicalManual({canonical:c,lifecycle_event:event});
 const f=await pub.finalizePublication(d,{publication_id:p.publication_id,lifecycle_event:event,direction:'LONG',telegram_text:tg.text,manual_text:m.text,now_ts:T});assert.equal(f.deliver,true);
 const b=await pub.bindDispatchToPublication(d,{idempotency_key:'KEY:SOCKET',publication_id:p.publication_id,contract:'FIL-USDT',direction:'LONG',wave_id:'W:SOCKET',lifecycle_event:event,rules_version:'v3',decision_id:event==='ENTRY'?'D:SOCKET':null,now_ts:T});assert.equal(b.bound,true);return{c,p,tg,m};
}
async function receiver(t,reply){
 const received=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const x of req)raw+=x;received.push({method:req.method,url:req.url,body:JSON.parse(raw),authorization_present:Boolean(req.headers.authorization)});const r=await reply(received.length);res.writeHead(r.http??200,{'content-type':'application/json'});res.end(JSON.stringify(r.body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 return{received,url:`http://127.0.0.1:${server.address().port}/test-only`};
}
const cfg=(r,now=T+1000)=>({enabled:true,relay_url:r.url,relay_key:'NONSECRET_LOCAL_FIXTURE_KEY',source_run_id:frame.run_id,now_ts:now,fetch_impl:globalThis.fetch});

test('REAL_SOCKET: source capture -> canonical -> SQLite -> queue -> actual sender -> local HTTP receiver',async t=>{
 const d=new DB();t.after(()=>d.close());const {c,p}=await seed(d);const r=await receiver(t,()=>({body:{ok:true,status:'SENT',message_id:9101}}));const out=await send(d,cfg(r));assert.equal(out.sent,1);assert.equal(r.received.length,1);
 const sent=d.s.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(p.publication_id);assert.equal(r.received[0].body.text,sent.telegram_text);assert.equal(sent.analytical_fingerprint,c.analytical_fingerprint);assert.match(sent.manual_text,/Hyperliquid FIL/);assert.match(sent.telegram_text,/USDC/);
 const q=d.s.prepare('SELECT * FROM v3_recheck_task_shadow WHERE publication_id=?').get(p.publication_id);assert(q&&q.state==='PENDING');assert.equal(q.due_ts,c.trigger.next_recheck_ts);
 await send(d,cfg(r,T+2000));assert.equal(r.received.length,1,'SENT dispatch cannot send twice');
});
test('NEGATIVE: successful HTTP without positive message ID is not confirmed delivery',async t=>{
 const d=new DB();t.after(()=>d.close());await seed(d);const r=await receiver(t,()=>({body:{ok:true,status:'SENT'}}));const out=await send(d,cfg(r));assert.equal(out.sent,0);assert.notEqual(d.s.prepare("SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='KEY:SOCKET'").get().state,'SENT');
 await send(d,cfg(r,T+2000));assert.equal(r.received.length,1,'ambiguous delivery must not retry blindly');
});
test('NEGATIVE: manual text tamper is detected by the same presentation hash as Telegram',async t=>{
 const d=new DB();t.after(()=>d.close());const {p}=await ready(d);d.s.prepare('UPDATE canonical_publication_shadow SET manual_text=? WHERE publication_id=?').run('Изменённый ложный отчёт',p.publication_id);const r=await pub.loadExactManual(d,{publication_id:p.publication_id});assert.equal(r.ok,false);
});
test('NEGATIVE: fresh scenario TTL cannot make old liquidation prices current',async t=>{
 const d=new DB();t.after(()=>d.close());await seed(d);const r=await receiver(t,()=>({body:{ok:true,message_id:9102}}));const out=await send(d,cfg(r,T+600001));assert.equal(r.received.length,0);assert.equal(out.sent,0);
});
test('NEGATIVE: rehashed canonical still rejects a different embedded liquidation snapshot',async t=>{
 const d=new DB();t.after(()=>d.close());const c=canonical();c.liquidations.analysis_binding.snapshot_id='WRONG';c.analytical_fingerprint=pub.canonicalFingerprint(c);const p=await pub.persistCanonicalSnapshot(d,{canonical:c,wave_id:'W:SOCKET',now_ts:T});assert.equal(p.persisted,false);
});
test('NEGATIVE: saved manual report cannot silently lose native liquidation facts',async t=>{
 const d=new DB();t.after(()=>d.close());const {c,p}=await seed(d);const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'}),m=pub.renderCanonicalManual({canonical:c,lifecycle_event:'WAIT'});const wrong=m.text.split('\n').filter(x=>!x.includes('Hyperliquid')).join('\n');
 const f=await pub.finalizePublication(d,{publication_id:p.publication_id,lifecycle_event:'WAIT',direction:'LONG',telegram_text:tg.text,manual_text:wrong,now_ts:T});assert.equal(f.deliver,false);
});
test('NEGATIVE: binding before a failed durable recheck must never bypass the recheck on retry',async t=>{
 const d=new DB();t.after(()=>d.close());await seed(d);d.s.exec('DROP TABLE v3_recheck_task_shadow');const r=await receiver(t,()=>({body:{ok:true,message_id:9103}}));await send(d,cfg(r));await send(d,cfg(r,T+2000));assert.equal(r.received.length,0);
});
test('NEGATIVE: network ACK with zero database finalize rows is not a persisted SENT proof',async t=>{
 const d=new DB();t.after(()=>d.close());await seed(d);d.dropFinalAck=true;const r=await receiver(t,()=>({body:{ok:true,message_id:9104}}));const out=await send(d,cfg(r));assert.equal(r.received.length,1);assert.equal(out.sent,0,'no factual persisted-SENT row');assert.equal(d.s.prepare("SELECT state FROM v3_telegram_dispatch_shadow WHERE idempotency_key='KEY:SOCKET'").get().state,'SENDING');
});
test('NEGATIVE: altered stored wave cannot match old dispatch binding',async t=>{
 const d=new DB();t.after(()=>d.close());const {p}=await ready(d);d.s.prepare('UPDATE canonical_publication_shadow SET wave_id=? WHERE publication_id=?').run('OTHER-WAVE',p.publication_id);const r=await pub.loadBoundTelegram(d,{idempotency_key:'KEY:SOCKET',now_ts:T+1000});assert.equal(r.ok,false);
});

test('ACTUAL_FORMATTERS: saved runtime manual text and bound sender preserve one native block',async t=>{
 const d=new DB();t.after(()=>d.close());const {buildRuntimeCanonicalBundle}=await import(new URL('../../.verification/staged-runtime/src/canonical-runtime-adapter.mjs',import.meta.url));const f=canonical();
 const acquisition=createLiquidationAcquisition({contract:'FIL-USDT',run_id:frame.run_id,acquisition_id:'ACQ:RUNTIME-TO-RECEIVER',receipts:[frame],requests:live.requests,started_ts:live.transport[0].started_ts,completed_ts:T});
 const result=buildRuntimeCanonicalBundle({contract:'FIL-USDT',run_id:frame.run_id,snapshot_id:'S:SOCKET',observed_ts:T,free_liquidation_acquisition:acquisition,
  discovery_row:{contract:'FIL-USDT',rolling_24h_change_pct:2,early_candidate_quality_0_100:73},publication_shadow:{entry_signal:{state:'WAIT_FOR_TRIGGER',direction:'LONG',trigger:f.trigger},score_interval:{score_lower_bound:72},scenario_plan:{execution_reference_price:1.14}},
  public_evidence:{evidence:[]},liquidation_intelligence:{projected_clusters:[],projected_map_status:'NOT_CLOSED'},free_source_summary:{status:'CLOSED',owner:'source-registry.mjs',registry:{status:'CLOSED',entries:[]},entry_funnel:{status:'CLOSED',blockers:[],blocker_details:[]},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0,d1_write_delta:0}});
 assert.equal(result.manual.ok,true);const {p}=await seed(d);d.s.prepare('DELETE FROM canonical_publication_shadow WHERE publication_id=?').run(p.publication_id);
 const c=result.canonical;const saved=await pub.persistCanonicalSnapshot(d,{canonical:c,presentation_inputs:{manual_text:result.manual.text},wave_id:'W:SOCKET',now_ts:T});assert(saved.persisted);
 const r=await receiver(t,()=>({body:{ok:true,message_id:9105}}));const out=await send(d,cfg(r));assert.equal(out.sent,1,JSON.stringify(out.lifecycle));const manual=await pub.loadExactManual(d,{publication_id:saved.publication_id});assert(manual.ok);assert.equal(manual.text,result.manual.text,'keep the actual manual report layout, not a substitute');assert.equal(manual.analytical_fingerprint,r.received.length===1?c.analytical_fingerprint:'');assert.match(r.received[0].body.text,/Hyperliquid FIL/);
});
test('NEGATIVE: direct renderers reject mismatched native snapshot even outside publication storage',()=>{
 const c=canonical();c.liquidations.analysis_binding.run_id='OTHER';c.analytical_fingerprint=pub.canonicalFingerprint(c);
 assert.equal(pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'WAIT'}).ok,false);assert.equal(pub.renderCanonicalManual({canonical:c,lifecycle_event:'WAIT'}).ok,false);
});
test('REMOVAL: stale market facts do not suppress cancellation of a genuinely delivered idea',async t=>{
 const d=new DB();t.after(()=>d.close());await seed(d,{event:'IDEA_REMOVED'});
 d.s.prepare(`INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,telegram_message_id,created_ts,updated_ts,sent_ts,shadow_only) VALUES('OLD','OLDKEY','FIL-USDT','LONG','W:SOCKET','WAIT','v3','SENT','9199',?,?,?,1)`).run(T-10000,T-5000,T-5000);
 const r=await receiver(t,()=>({body:{ok:true,message_id:9106}}));const out=await send(d,cfg(r,T+3600000));assert.equal(out.sent,1);assert.match(r.received[0].body.text,/ИДЕЯ СНЯТА/);
});
test('NETWORK_BOUNDARY: oversized text is rejected before a real socket receives anything',async t=>{
 const {sendLifecycleRelay}=await import(new URL('v3-telegram-delivery-sidecar.mjs',runtime));const r=await receiver(t,()=>({body:{ok:true,message_id:9107}}));const result=await sendLifecycleRelay({relay_url:r.url,relay_key:'NONSECRET_TEST',text:'А'.repeat(4097),fetch_impl:globalThis.fetch});assert.equal(result.ok,false);assert.equal(result.status,'MESSAGE_TOO_LONG_NO_NETWORK');assert.equal(r.received.length,0);
});

test('RECOVERY: failed recheck persistence can be repaired before the first and only network send',async t=>{
 const d=new DB();t.after(()=>d.close());await seed(d);d.s.exec('DROP TABLE v3_recheck_task_shadow');const r=await receiver(t,()=>({body:{ok:true,message_id:9108}}));
 const first=await send(d,cfg(r));assert.equal(first.sent,0);assert.equal(r.received.length,0);assert.equal(d.s.prepare('SELECT COUNT(*) n FROM v3_dispatch_publication_binding_shadow').get().n,0);
 d.s.exec(fs.readFileSync(new URL('../../../unified-delivery-base/migrations.sql',import.meta.url),'utf8'));
 const second=await send(d,cfg(r,T+2000));assert.equal(second.sent,1);assert.equal(r.received.length,1);await send(d,cfg(r,T+3000));assert.equal(r.received.length,1);
});
test('NEGATIVE: manual by publication ID can additionally require exact run and direction',async t=>{
 const d=new DB();t.after(()=>d.close());const {p}=await ready(d);
 const r=await pub.loadExactManual(d,{publication_id:p.publication_id,expected_identity:{run_id:'OTHER'}});assert.equal(r.ok,false);assert.equal(r.status,'MANUAL_EXACT_IDENTITY_MISMATCH');
});
