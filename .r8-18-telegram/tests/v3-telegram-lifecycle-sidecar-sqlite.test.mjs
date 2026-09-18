import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runV3TelegramLifecycleSidecar} from '../src/v3-telegram-lifecycle-sidecar.mjs';

function normalizeSql(sql,args){const picks=[];const q=String(sql).replace(/\?(\d+)/g,(_,n)=>{picks.push(Number(n)-1);return '?';});return picks.length?[q,picks.map(i=>args[i])]:[sql,args];}
class Prep{
  constructor(owner,sql,args=[]){this.owner=owner;this.sql=sql;this.args=args;}
  bind(...args){return new Prep(this.owner,this.sql,args);}
  first(){const [sql,args]=normalizeSql(this.sql,this.args);const st=this.owner.db.prepare(sql);const row=st.get(...args)??null;this.owner.read(row?1:0,this.sql);return Promise.resolve(row);}
  all(){const [sql,args]=normalizeSql(this.sql,this.args);const st=this.owner.db.prepare(sql);const out=st.all(...args);this.owner.read(out.length,this.sql);return Promise.resolve({results:out});}
  run(){const [sql,args]=normalizeSql(this.sql,this.args);const st=this.owner.db.prepare(sql);const r=st.run(...args);const changes=Number(r.changes||0);this.owner.write(changes,this.sql);return Promise.resolve({meta:{changes}});}
}
class LocalD1{
  constructor(){this.db=new DatabaseSync(':memory:');this.u={requests:0,rows_read:0,rows_written:0,unknown_ops:0,targets:{}};}
  prepare(sql){return new Prep(this,sql);}
  read(n){this.u.requests++;this.u.rows_read+=n;}
  write(n){this.u.requests++;this.u.rows_written+=n;}
  async batch(stmts){const tx=this.db.prepare('BEGIN');tx.run();const out=[];try{for(const s of stmts){const [sql,args]=normalizeSql(s.sql,s.args);const st=this.db.prepare(sql);if(/^\s*(SELECT|PRAGMA)/i.test(sql)){const r=st.all(...args);this.read(r.length);out.push({results:r});}else{const r=st.run(...args);const c=Number(r.changes||0);this.write(c);out.push({meta:{changes:c}});}}this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  usageSnapshot(){return JSON.parse(JSON.stringify(this.u));}
}
function schema(db){db.exec(`
CREATE TABLE deep_check_run_log(run_id TEXT NOT NULL,contract_code TEXT NOT NULL,execution_status TEXT NOT NULL,data_sufficiency TEXT,error_text TEXT,completed_ts INTEGER,UNIQUE(run_id,contract_code));
CREATE TABLE v3_discovery_deep_handoff_shadow(handoff_id TEXT PRIMARY KEY,source_run_id TEXT NOT NULL,scan_ts INTEGER NOT NULL,contract_code TEXT NOT NULL,base_ticker TEXT,discovery_rank INTEGER,direction TEXT,wave_id TEXT,dedup_reentry_key TEXT,state TEXT NOT NULL,deep_check_run_id TEXT,completed_ts INTEGER,updated_ts INTEGER);
CREATE TABLE v3_early_candidate_wave(wave_id TEXT PRIMARY KEY,contract_code TEXT NOT NULL,generation INTEGER,first_seen_ts INTEGER,lifecycle_stage TEXT,direction_hint TEXT,direction_state TEXT,early_detection_quality_0_100 INTEGER,last_seen_ts INTEGER);
CREATE TABLE shadow_decision_log(shadow_id TEXT PRIMARY KEY,contract_code TEXT NOT NULL,observed_ts INTEGER,rules_version TEXT,direction_hint TEXT,eq_status TEXT,dq_status TEXT,stage TEXT,data_sufficiency TEXT,created_ts INTEGER);
CREATE TABLE final_decision_integration_shadow(decision_id TEXT PRIMARY KEY,contract_code TEXT,observation_ts INTEGER,direction TEXT,directional_quality TEXT,entry_action TEXT,entry_quality TEXT,data_quality TEXT,execution_quality TEXT,independence_state TEXT,timing_state TEXT,risk_state TEXT,position_state TEXT,management_action TEXT,hard_veto INTEGER,persisted_ts INTEGER);
CREATE TABLE final_decision_telegram_context_shadow(decision_id TEXT PRIMARY KEY,score_lower_bound REAL,score_upper_bound REAL,valid_until_ts INTEGER,status TEXT);
CREATE TABLE v3_user_lifecycle_shadow(contract TEXT NOT NULL,direction TEXT NOT NULL,wave_id TEXT NOT NULL,rules_version TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,observation_ts INTEGER NOT NULL,valid_until_ts INTEGER,updated_ts INTEGER NOT NULL,shadow_only INTEGER NOT NULL,PRIMARY KEY(contract,direction,wave_id,rules_version));
CREATE TABLE v3_telegram_dispatch_shadow(dispatch_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,contract TEXT,direction TEXT,wave_id TEXT,lifecycle_event TEXT,rules_version TEXT,state TEXT,decision_id TEXT,message_hash TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
`);}

test('SQLite integration persists OBSERVE lifecycle and no dispatch in shadow persistence-only mode',async()=>{
  const d=new LocalD1();schema(d.db);const now=2_000_000,run='run-1';
  d.db.prepare(`INSERT INTO deep_check_run_log VALUES(?,?,?,?,?,?)`).run(run,'RAY-USDT','COMPLETED','PARTIAL',null,now-5_000);
  d.db.prepare(`INSERT INTO v3_discovery_deep_handoff_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('h1',run,now-20_000,'RAY-USDT','RAY',1,'LONG','W1','k','COMPLETED',run,now-5_000,now-5_000);
  d.db.prepare(`INSERT INTO v3_early_candidate_wave VALUES(?,?,?,?,?,?,?,?,?)`).run('W1','RAY-USDT',1,now-120_000,'PRE_IMPULSE_WATCH','LONG','LONG_WATCH',64,now-10_000);
  d.db.prepare(`INSERT INTO shadow_decision_log VALUES(?,?,?,?,?,?,?,?,?,?)`).run('s1','RAY-USDT',now-10_000,'shadow','LONG','SHADOW_MEASURABLE','HTX_CLOSED_EXTERNAL_CHAINS_MISSING','SHADOW_OBSERVE_LONG_BIAS','PARTIAL',now-9_000);
  const r=await runV3TelegramLifecycleSidecar(d,{source_run_id:run,now_ts:now,d1_pretelegram_budget_closed:true,dispatch_enabled:false});
  assert.equal(r.status,'CLOSED');assert.equal(r.network_send,false);assert.equal(r.dispatch_enabled,false);assert.equal(r.transitions.length,1);assert.equal(r.transitions[0].current_status,'OBSERVE');
  const life=d.db.prepare(`SELECT status,direction,wave_id,shadow_only FROM v3_user_lifecycle_shadow`).get();assert.deepEqual({...life},{status:'OBSERVE',direction:'LONG',wave_id:'W1',shadow_only:1});
  assert.equal(d.db.prepare(`SELECT COUNT(*) n FROM v3_telegram_dispatch_shadow`).get().n,0);
  assert.ok(r.usage_delta.rows_read<=96,r.usage_delta);assert.ok(r.usage_delta.rows_written<=12,r.usage_delta);assert.equal(r.usage_delta.unknown_ops,0);
});

test('SQLite integration remains fail-closed when direction conflicts',async()=>{
  const d=new LocalD1();schema(d.db);const now=2_000_000,run='run-2';
  d.db.prepare(`INSERT INTO deep_check_run_log VALUES(?,?,?,?,?,?)`).run(run,'RAY-USDT','COMPLETED','SUFFICIENT',null,now-5_000);
  d.db.prepare(`INSERT INTO v3_discovery_deep_handoff_shadow VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('h2',run,now-20_000,'RAY-USDT','RAY',1,'LONG','W2','k2','COMPLETED',run,now-5_000,now-5_000);
  d.db.prepare(`INSERT INTO v3_early_candidate_wave VALUES(?,?,?,?,?,?,?,?,?)`).run('W2','RAY-USDT',1,now-120_000,'ENTRY_CANDIDATE','LONG','LONG_WATCH',75,now-10_000);
  d.db.prepare(`INSERT INTO shadow_decision_log VALUES(?,?,?,?,?,?,?,?,?,?)`).run('s2','RAY-USDT',now-10_000,'shadow','SHORT','SHADOW_MEASURABLE','CLOSED','SHADOW_OBSERVE_SHORT_BIAS','SUFFICIENT',now-9_000);
  const r=await runV3TelegramLifecycleSidecar(d,{source_run_id:run,now_ts:now,dispatch_enabled:false});
  assert.equal(r.transitions[0].status,'DIRECTION_CONFLICT_FAIL_CLOSED');
  assert.equal(d.db.prepare(`SELECT COUNT(*) n FROM v3_user_lifecycle_shadow`).get().n,0);
});
