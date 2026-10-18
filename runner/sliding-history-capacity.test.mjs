import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {SLIDING_HISTORY_POLICY as P,slidingCapacityDecision,expireOldDetails,reserveCapacityExpiryBudget} from './sliding-history-capacity.mjs';
import {reserveLosslessRecoveryBudget} from './lossless-full-evidence-recovery.mjs';
const T=1792308000000,DAY=86400000,inventory=[{uuid:P.primary_id,name:P.primary_name,file_size:4_100_000_000},{uuid:'f66e7081-0e67-49a2-8f69-68af00cdaf92',name:'archive',file_size:10_000_000}];
const decision=()=>slidingCapacityDecision({databases:inventory,complete:true,observed_ts:T,now:T,enabled:true,paid_confirmed:true});
const schema=JSON.parse(fs.readFileSync(new URL('../audit-fixes/t00/fixtures/d1-schema.json',import.meta.url))).rows;
function fixture(){
 const raw=new DatabaseSync(':memory:');
 const tables=['canonical_publication_shadow','full_evidence_shadow_log','v3_recheck_task_shadow','v3_dispatch_publication_binding_shadow','v3_user_lifecycle_shadow','v3_telegram_dispatch_shadow','tz101_entry_area_calibration_signal'];
 for(const name of tables)raw.exec(schema.find(r=>r.type==='table'&&r.name===name).sql);
 for(const r of schema.filter(r=>r.type==='index'&&r.sql&&tables.includes(r.tbl_name)))raw.exec(r.sql);
 if(!raw.prepare('PRAGMA table_info(full_evidence_shadow_log)').all().some(r=>r.name==='stage392_proof_bundle_json'))raw.exec('ALTER TABLE full_evidence_shadow_log ADD COLUMN stage392_proof_bundle_json TEXT');
 raw.exec('CREATE INDEX IF NOT EXISTS idx_full_evidence_shadow_contract_ts ON full_evidence_shadow_log(contract_code,observed_ts)');
 raw.exec(fs.readFileSync(new URL('../current-generation/migrations/007_commands_delivery.sql',import.meta.url),'utf8'));
 raw.exec(fs.readFileSync(new URL('../current-generation/migrations/008_outcomes_calibration_v2.sql',import.meta.url),'utf8'));
 raw.exec("CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,unknown_ops INTEGER)");
 let usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};const calls=[];
 const db={usageSnapshot:()=>({...usage}),prepare(sql){let args=[];return{sql,bind(...a){args=a;return this;},async all(){calls.push(sql);const results=raw.prepare(sql).all(...args).map(r=>({...r})),changes=/\bUPDATE\b/.test(sql)?Number(raw.prepare('SELECT changes() AS n').get().n):0;usage.requests++;usage.rows_read+=results.length;usage.rows_written+=changes;return{results,meta:{changes,rows_read:results.length,rows_written:changes}};},async first(){return(await this.all()).results[0]??null;},async run(){calls.push(sql);const r=raw.prepare(sql).run(...args);usage.requests++;usage.rows_written+=Number(r.changes);return{meta:{changes:Number(r.changes),rows_read:0,rows_written:Number(r.changes)}};}};},async batch(ss){const a=[];for(const s of ss)a.push(await s.all());return a;}};
 const insert=(table,source)=>{const row={...source};for(const col of raw.prepare('PRAGMA table_info('+table+')').all())if(col.notnull&&col.dflt_value===null&&!Object.hasOwn(row,col.name))row[col.name]=/INT|REAL/i.test(col.type)?0:'{}';return raw.prepare('INSERT INTO '+table+'('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').run(...Object.values(row));};
 const add=(id,ts=T-5*DAY,contract='ZEC-USDT')=>{
  const publication_id='PUB:'+String(id).padStart(40,'0'),snapshot_id='S392:'+contract+':'+ts;
  const canonical={status:'CLOSED',state:'REJECTED',run_id:'run:'+String(ts),snapshot_id,observed_ts:ts,direction:'SHORT',scores:{overall_0_100:55,coin_interest_0_100:80,is_probability:false},reason:'ORIGINAL_REASON',metadata:{contract,provider_original_time:ts-1000,raw:'x'.repeat(200000)}};
  const row={publication_id,contract_code:contract,direction:'SHORT',run_id:canonical.run_id,snapshot_id,wave_id:null,decision_id:'decision:'+id,observed_ts:ts,valid_until_ts:null,lifecycle_event:null,canonical_state:'REJECTED',analytical_fingerprint:'original-fingerprint:'+id,canonical_json:JSON.stringify(canonical),presentation_inputs_json:JSON.stringify({raw:'y'.repeat(10000)}),actionability_status:'UNASSESSED',created_ts:ts,shadow_only:1};insert('canonical_publication_shadow',row);
  const e={full_evidence_id:'FE:'+id,shadow_id:'SH:'+id,contract_code:contract,observed_ts:ts,rules_version:'ORIGINAL_RULES',contract_version:'v1',adapters_version:'v1',mode:'FULL_EVIDENCE_SHADOW_NO_EXECUTION',fixed_weights_json:'{}',chain_status_json:'{}',evidence_compact_json:'[{"source":"original","value":42}]',dq_status:'PARTIAL',shadow_only:1,retention_days:180,persisted_ts:ts,stage392_proof_bundle_json:JSON.stringify({snapshot_id,source_ts:ts-1000,raw:'z'.repeat(200000)})};insert('full_evidence_shadow_log',e);return row;
 };
 const old=add(1),latest=add(2,T-1000),rare=add(3,T-9*DAY,'RARE-USDT');
 return{raw,db,calls,old,latest,rare,add,insert,setUsage:u=>Object.assign(usage,u)};
}
const run=f=>expireOldDetails({db:f.db,before_modify:async()=>{},now:T,decision:decision()});
test('paid policy counts every database and starts cleanup before the included account ceiling',()=>{
 const d=decision();assert.equal(d.account_bytes,4_110_000_000);assert.equal(d.reclaim_target_bytes,610_000_000);assert.equal(d.due,true);assert.equal(d.account_ceiling_bytes,5_000_000_000);
 assert.equal(slidingCapacityDecision({databases:inventory,complete:true,observed_ts:T-31*60000,now:T,enabled:true,paid_confirmed:true}).allowed,false);
 assert.equal(slidingCapacityDecision({databases:inventory,complete:true,observed_ts:T,now:T,enabled:true,paid_confirmed:false}).allowed,false);
 assert.equal(slidingCapacityDecision({databases:[inventory[0],inventory[0]],complete:true,observed_ts:T,now:T,enabled:true,paid_confirmed:true}).allowed,false);
 const low=slidingCapacityDecision({databases:[{...inventory[0],file_size:500000000}],complete:true,observed_ts:T,now:T,enabled:true,paid_confirmed:true});assert.equal(low.allowed,true);assert.equal(low.due,false);
});
test('expire old details while retaining original scalar decisions, statistical evidence, source clocks and latest rare-coin bodies',async()=>{
 const f=fixture();try{
  const original=f.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(f.old.publication_id),e=f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='FE:1'").get();
  const result=await run(f);assert.equal(result.canonical_expired.length,1);assert.equal(result.full_evidence_expired.length,1);
  const saved=f.raw.prepare('SELECT * FROM canonical_publication_shadow WHERE publication_id=?').get(f.old.publication_id),c=JSON.parse(saved.canonical_json);
  for(const k of Object.keys(original))if(!['canonical_json','presentation_inputs_json'].includes(k))assert.equal(saved[k],original[k],k);
  const before=JSON.parse(original.canonical_json);assert.deepEqual(c.scores,before.scores);assert.equal(c.reason,before.reason);assert.equal(c.observed_ts,before.observed_ts);assert.equal(c.status,'DETAILS_EXPIRED');assert.equal(c.metadata.history_details_expired,true);assert(saved.canonical_json.length<original.canonical_json.length/20);
  const after=f.raw.prepare("SELECT * FROM full_evidence_shadow_log WHERE full_evidence_id='FE:1'").get();for(const k of Object.keys(e))if(k!=='stage392_proof_bundle_json')assert.equal(after[k],e[k],k);
  assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM canonical_publication_shadow').get().n,3);assert.equal(f.raw.prepare('SELECT COUNT(*) AS n FROM full_evidence_shadow_log').get().n,3);
  for(const r of [f.latest,f.rare])assert.equal(f.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?').get(r.publication_id).canonical_json,r.canonical_json);
  assert.equal(result.source_clocks_refreshed,false);assert.equal(result.physical_bytes_reclaimed,null);assert.equal(result.native_throughput_qualified,false);
 }finally{f.raw.close();}
});
for(const kind of ['ENTRY','ACTIONABLE','FRESH','COMMAND','RECHECK','BINDING','CALIBRATION','DISPATCH','LIFECYCLE'])test('protect '+kind+' and its original full evidence',async()=>{
 const f=fixture();try{const p=f.old;
  if(kind==='ENTRY')f.raw.prepare("UPDATE canonical_publication_shadow SET lifecycle_event='ENTRY' WHERE publication_id=?").run(p.publication_id);
  if(kind==='ACTIONABLE')f.raw.prepare("UPDATE canonical_publication_shadow SET actionability_status='ACTIONABLE' WHERE publication_id=?").run(p.publication_id);
  if(kind==='FRESH')f.raw.prepare('UPDATE canonical_publication_shadow SET created_ts=? WHERE publication_id=?').run(T-1000,p.publication_id);
  if(kind==='COMMAND')f.insert('report2_command_v2',{command_id:'cmd',mode:'FULL',request_channel:'MANUAL',received_at:1,deadline:2,generation:'g',state:'COMPLETED',result_snapshot_id:p.snapshot_id,updated_at:1});
  if(kind==='RECHECK')f.insert('v3_recheck_task_shadow',{task_id:'task',publication_id:p.publication_id,contract_code:p.contract_code,direction:'SHORT',wave_id:'w',snapshot_id:p.snapshot_id,run_id:p.run_id,due_ts:1,expires_ts:2,state:'DONE',created_ts:1,updated_ts:1});
  if(kind==='BINDING')f.insert('v3_dispatch_publication_binding_shadow',{idempotency_key:'k',publication_id:p.publication_id,contract_code:p.contract_code,direction:'SHORT',wave_id:'w',lifecycle_event:'OBSERVE',rules_version:'v',snapshot_id:p.snapshot_id,run_id:p.run_id,observed_ts:1,analytical_fingerprint:'h',presentation_hash:'h',created_ts:1});
  if(kind==='CALIBRATION')f.raw.prepare("UPDATE canonical_publication_shadow SET decision_id=(SELECT decision_id FROM canonical_publication_shadow WHERE publication_id=?) WHERE publication_id=?").run(p.publication_id,p.publication_id),f.insert('tz101_entry_area_calibration_signal',{sample_id:'s',decision_id:p.decision_id,snapshot_id:p.snapshot_id,contract_code:p.contract_code,direction:'SHORT',created_ts:1});
  if(kind==='DISPATCH')f.insert('v3_telegram_dispatch_shadow',{dispatch_id:'d',idempotency_key:'k',contract:p.contract_code,direction:'SHORT',wave_id:'w',lifecycle_event:'OBSERVE',rules_version:'v',state:'SENT',decision_id:p.decision_id,message_hash:'h',created_ts:1,updated_ts:1,shadow_only:1});
  if(kind==='LIFECYCLE')f.raw.prepare("INSERT INTO v3_user_lifecycle_shadow VALUES(?,'SHORT','w','v','WAIT','reason',?,NULL,1,1)").run(p.contract_code,p.observed_ts);
  const before=f.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?').get(p.publication_id).canonical_json;
  const r=await run(f);assert.equal(r.canonical_expired.length,0);assert.equal(r.full_evidence_expired.length,0);assert.equal(f.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?').get(p.publication_id).canonical_json,before);
 }finally{f.raw.close();}
});
test('new protected reference at the final guard prevents expiry; unclosed native usage prevents every query',async()=>{
 const f=fixture();try{await expireOldDetails({db:f.db,before_modify:async()=>{f.raw.prepare("UPDATE canonical_publication_shadow SET actionability_status='ACTIONABLE' WHERE publication_id=?").run(f.old.publication_id);},now:T,decision:decision()});assert.equal(JSON.parse(f.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?').get(f.old.publication_id).canonical_json).status,'CLOSED');}finally{f.raw.close();}
 const g=fixture();try{g.setUsage({unknown_ops:1});await assert.rejects(run(g),/HEADROOM/);assert.equal(g.calls.length,0);}finally{g.raw.close();}
});
test('missing protected table, unexpected mutation trigger and reference census overflow retain all details',async()=>{
 for(const kind of ['SCHEMA','TRIGGER','OVERFLOW']){const f=fixture();try{
  if(kind==='SCHEMA')f.raw.exec('DROP TABLE v3_recheck_task_shadow');
  if(kind==='TRIGGER')f.raw.exec("CREATE TRIGGER expiry_side_effect AFTER UPDATE ON canonical_publication_shadow BEGIN SELECT 1; END");
  if(kind==='OVERFLOW')for(let i=0;i<1025;i++)f.insert('report2_command_v2',{command_id:'cmd:'+i,mode:'FULL',request_channel:'MANUAL',received_at:1,deadline:2,generation:'g',state:'COMPLETED',updated_at:1});
  await assert.rejects(run(f));assert.equal(JSON.parse(f.raw.prepare('SELECT canonical_json FROM canonical_publication_shadow WHERE publication_id=?').get(f.old.publication_id).canonical_json).status,'CLOSED');
 }finally{f.raw.close();}}
});
test('new expiry still shares the two maintenance slots with legacy recovery and never clears unknown or the next full reserve',async()=>{
 const f=fixture();try{
  assert.equal((await reserveCapacityExpiryBudget(f.db,{reservation_id:'RETAINED_HISTORY:10:10',now:T})).allowed,true);
  assert.equal((await reserveLosslessRecoveryBudget(f.db,{reservation_id:'RETAINED_HISTORY:11:11',now:T})).allowed,true);
  assert.equal((await reserveCapacityExpiryBudget(f.db,{reservation_id:'RETAINED_HISTORY:12:12',now:T})).allowed,false);
  assert.equal(f.raw.prepare('SELECT reserve_rows_read FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?').get('RETAINED_HISTORY:10:10').reserve_rows_read,20000);
 }finally{f.raw.close();}
 for(const condition of [{unknown_ops:15,reserve_rows_read:5000,reserve_rows_written:400},{unknown_ops:0,reserve_rows_read:3440000,reserve_rows_written:400}]){const g=fixture();try{g.insert('report2_runner_budget_ledger_shadow',{reservation_id:'OLD:1',day_utc:new Date(T).toISOString().slice(0,10),state:'FINALIZED',started_ts:T,measured_rows_read:1,measured_rows_written:1,...condition});assert.equal((await reserveCapacityExpiryBudget(g.db,{reservation_id:'RETAINED_HISTORY:12:12',now:T})).allowed,false);assert.equal(g.raw.prepare("SELECT unknown_ops FROM report2_runner_budget_ledger_shadow WHERE reservation_id='OLD:1'").get().unknown_ops,condition.unknown_ops);}finally{g.raw.close();}}
});
