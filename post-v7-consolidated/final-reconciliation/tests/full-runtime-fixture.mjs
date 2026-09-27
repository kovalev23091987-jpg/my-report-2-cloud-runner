import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createLiquidationAcquisition,buildEarlyLiquidationView} from '../../liquidation/liquidation-extension/integration/src/liq-canonical-context.mjs';
const runtime=process.env.REPORT2_TEST_RUNTIME?new URL('file://'+process.env.REPORT2_TEST_RUNTIME.replace(/\/$/,'')+'/src/'):new URL('../../../repository/runtime/src/',import.meta.url);
const pub=await import(new URL('canonical-publication.mjs',runtime));
const {runBoundTelegramDeliverySidecar:send}=await import(new URL('bound-telegram-delivery-sidecar.mjs',runtime));
const live=JSON.parse(fs.readFileSync(new URL('../../liquidation/liquidation-extension/proof/live-native-round2.json',import.meta.url),'utf8'));
const frame=live.receipt,T=frame.analysis_as_of_ms;
function norm(sql,args){const refs=[];const q=sql.replace(/\?(\d+)/g,(_,n)=>{refs.push(Number(n)-1);return '?';});return refs.length?[q,refs.map(i=>args[i])]:[sql,args];}
class DB{
 constructor(){this.s=new DatabaseSync(':memory:');this.u={requests:0,rows_read:0,rows_written:0,unknown_ops:0};this.dropFinalAck=false;
 this.s.exec(fs.readFileSync(new URL('../../post-v7/migrations.sql',import.meta.url),'utf8'));
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


export {DB,canonical,seed,ready,receiver,cfg,frame,T,pub,send};
