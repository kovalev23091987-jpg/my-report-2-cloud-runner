import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';

// Real SQLite statements and raw hashed fixtures; actual assembled runtime.
globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN_IN_REGRESSION');};
const runtime=path.resolve(process.argv[2]||'runtime');
const {loadProspectiveFactualPathForTest:load,closeOneEarlyDiscoveryOutcome:early,closeOneEntryAreaOutcome:entry,
 prospectiveBudgetGuard:guard,claimProspectiveQueueTurn:turn,R820_PROSPECTIVE_VALIDATION_BUDGET:budget}=await import(pathToFileURL(path.join(runtime,'r8-20-prospective-validation-sidecar.mjs')).href);
const {HISTORY_COMPATIBILITY:compat}=await import(pathToFileURL(path.join(runtime,'src/market-history-reader.mjs')).href);
const M=60_000,T=Date.UTC(2026,8,30,0),NOW=T+120*M;
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const name of ['20260917_v3_early_discovery_shadow.sql','20260917_tz101_entry_area_calibration_shadow.sql'])sql.exec(fs.readFileSync(path.join(runtime,'migrations',name),'utf8'));
 sql.exec(`CREATE TABLE report2_market_snapshot_batch_v1(bucket INTEGER,actor TEXT,generation TEXT,schema_version TEXT,shard INTEGER,source_timestamps_json TEXT,received_ts INTEGER,status TEXT,payload_hash TEXT,payload TEXT,contract_count INTEGER,payload_bytes INTEGER,PRIMARY KEY(actor,generation,bucket,shard));
 CREATE INDEX idx_report2_market_snapshot_batch_v1_range ON report2_market_snapshot_batch_v1(generation,bucket,shard);
 CREATE TABLE scan_runs(ts_bucket INTEGER PRIMARY KEY,ts INTEGER,payload_json TEXT,stage0_coverage_pct REAL,errors INTEGER,stale INTEGER);`);
 const queries=[];
 const db={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async execute(method){
  const order=[],q=query.replace(/\?(\d+)/g,(_,n)=>{order.push(Number(n)-1);return '?';}),args=order.map(i=>this.args[i]);
  queries.push({query,args,plan:/^\s*SELECT|^\s*WITH/i.test(q)?sql.prepare('EXPLAIN QUERY PLAN '+q).all(...args):[]});
  const st=sql.prepare(q);if(method==='first')return st.get(...args)||null;if(method==='run')return{meta:st.run(...args)};return{results:st.all(...args)};
 },all(){return this.execute('all');},first(){return this.execute('first');},run(){return this.execute('run');}};}};
 const add=(minute,{generation=compat.generations.at(-1),schema=compat.schema_version,hashBad=false,expected=1,received=null,sourceTs=null,price=100+minute,contract='QNT-USDT',age=0}={})=>{
  const ts=T+minute*M,payload=JSON.stringify([{contract,observed_ts:sourceTs??ts,price,market_age_sec:age,source_status:'CLOSED'}]);
  sql.prepare('INSERT INTO report2_market_snapshot_batch_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(ts,'HUB_PUBLIC_COLLECTOR',generation,schema,0,JSON.stringify({expected_shards:expected,universe_total:expected}),received??ts+100,'COMPLETE',hashBad?'bad':createHash('sha256').update(payload).digest('hex'),payload,1,Buffer.byteLength(payload));
 };
 const series=(opts={})=>{for(let i=0;i<=60;i+=5)add(i,opts);};
 const task=(id,start=T,price=100)=>sql.prepare(`INSERT INTO v3_early_outcome_journal(outcome_id,wave_id,contract_code,direction_hint,first_seen_ts,horizon_hours,target_ts,outcome_status,first_seen_context_json,shadow_only) VALUES(?,?,'QNT-USDT','LONG',?,1,?,'PENDING',?,1)`).run(id,id,start,start+60*M,JSON.stringify({first_seen_price:price}));
 const read=()=>load(db,{contract:'QNT-USDT',startTs:T,endTs:T+60*M,nowTs:NOW});
 return {sql,db,queries,add,series,task,read};
}
test('verified collector is closed and explicitly snapshot-only',async t=>{const f=fixture(t);f.series();const r=await f.read();assert.equal(r.status,'CLOSED');assert.equal(r.points.length,13);assert.equal(r.extrema_scope,'OBSERVED_SNAPSHOTS_ONLY');assert.equal(f.queries.length,1);});
for(const [name,options] of Object.entries({hash:{hashBad:true},schema:{schema:'old'},generation:{generation:'UNKNOWN'},future_received:{received:NOW+1},future_source:{sourceTs:NOW+1},incomplete_shards:{expected:2},wrong_asset:{contract:'SOL-USDT'},zero_price:{price:0},negative_age:{age:-1}}))test(`rejects ${name}`,async t=>{const f=fixture(t);f.series(options);const r=await f.read();assert.notEqual(r.status,'CLOSED');assert.equal(r.points.length,0);});
test('internal gap is not accepted from endpoints alone',async t=>{const f=fixture(t);f.add(0);f.add(60);assert.notEqual((await f.read()).status,'CLOSED');});
test('both historical SQL paths use indexed ranges',async t=>{const f=fixture(t);await f.read();for(const q of f.queries){assert.ok(q.plan.some(p=>/SEARCH/.test(p.detail)),JSON.stringify(q.plan));assert.ok(!q.plan.some(p=>/SCAN (report2_market_snapshot_batch_v1|scan_runs)/.test(p.detail)));}assert.ok(!f.queries[0].query.includes('json_each'));});
test('scan fallback retains twenty-minute sampling',async t=>{const f=fixture(t);for(let i=0;i<=60;i+=20){const ts=T+i*M;f.sql.prepare('INSERT INTO scan_runs VALUES(?,?,?,?,0,0)').run(ts,ts,JSON.stringify({schema:'stage0-compact-v2',timestamp:ts,contracts:[['QNT-USDT',100+i,1000,10,1000,.001,8,0,'CLOSED']]}),100);}const r=await f.read();assert.equal(r.status,'CLOSED');assert.equal(r.sampling_minutes,20);assert.equal(r.history_source,'SCAN_RUNS_FALLBACK');});
test('raw row cap rejects truncated collector path',async t=>{const f=fixture(t);for(let i=0;i<321;i++)f.add(i/10);const r=await f.read();assert.notEqual(r.status,'CLOSED');assert.equal(r.collector_reason,'COLLECTOR_RAW_ROW_CAP');});
test('missing old early observation does not starve newer factual outcome',async t=>{const f=fixture(t);f.task('OLD',T-10*24*60*M);f.task('NEW');f.series();assert.equal((await early(f.db,{current_scan_ts:NOW,now_ts:NOW})).outcome_id,'OLD');const r=await early(f.db,{current_scan_ts:NOW,now_ts:NOW+1});assert.equal(r.outcome_id,'NEW');assert.equal(r.status,'CLOSED_FACTUAL');const old=f.sql.prepare("SELECT * FROM v3_early_outcome_journal WHERE outcome_id='OLD'").get();assert.equal(old.outcome_status,'PENDING');assert.equal(old.computed_ts,null);assert.equal(old.raw_return_pct,null);});
test('durable cursor cools retries then permits next sweep',async t=>{const f=fixture(t);f.task('OLD',T-24*60*M);await early(f.db,{current_scan_ts:NOW,now_ts:NOW});const n=f.queries.length;assert.equal((await early({...f.db},{current_scan_ts:NOW,now_ts:NOW+M})).status,'DEFERRED_EARLY_RETRY_COOLDOWN');assert.equal(f.queries.slice(n).some(q=>q.query.includes('FROM scan_runs')),false);assert.equal((await early(f.db,{current_scan_ts:NOW+24*60*M,now_ts:NOW+24*60*M})).outcome_id,'OLD');});
test('new work is not held by retry cooldown',async t=>{const f=fixture(t);f.task('OLD',T-24*60*M);await early(f.db,{current_scan_ts:NOW,now_ts:NOW});f.task('NEW');f.series();assert.equal((await early(f.db,{current_scan_ts:NOW,now_ts:NOW+M})).status,'CLOSED_FACTUAL');});
test('same-time ties advance by id and missing price remains null',async t=>{const f=fixture(t);f.task('A',T,null);f.task('B',T,null);assert.equal((await early(f.db,{current_scan_ts:NOW,now_ts:NOW})).outcome_id,'A');assert.equal((await early(f.db,{current_scan_ts:NOW,now_ts:NOW+1})).outcome_id,'B');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM v3_early_outcome_journal WHERE computed_ts IS NULL').get().n,2);});
test('entry queue advances without fabricating outcome',async t=>{const f=fixture(t);const insert=f.sql.prepare(`INSERT INTO tz101_entry_area_calibration_signal VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,0,?)`);for(const [id,ts] of [['A',T],['B',T+M]])insert.run(id,id,id,'QNT-USDT','LONG',id,id,ts,ts,ts,100,90,101,90,110,'TEST','{}',id,T);assert.equal((await entry(f.db,{current_scan_ts:NOW,activation_ts:T,now_ts:NOW})).sample_id,'A');assert.equal((await entry(f.db,{current_scan_ts:NOW,activation_ts:T,now_ts:NOW+1})).sample_id,'B');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM tz101_entry_area_calibration_outcome').get().n,0);});
test('invalid timestamps do not query or advance queue',async t=>{const f=fixture(t);assert.equal((await early(f.db,{current_scan_ts:null})).reason,'CURRENT_SCAN_TS_INVALID');assert.equal(f.queries.length,0);});
test('queue turn alternates durably even with identical scan times and adapter restart',async t=>{const f=fixture(t);assert.equal(await turn(f.db,NOW),'EARLY');assert.equal(await turn({...f.db},NOW),'ENTRY');assert.equal(await turn(f.db,NOW),'EARLY');});
test('delayed maintenance never starves a queue through timestamp parity',async t=>{const f=fixture(t);assert.equal(await turn(f.db,NOW),'EARLY');assert.equal(await turn(f.db,NOW+80*M),'ENTRY');assert.equal(await turn(f.db,NOW+160*M),'EARLY');});
for(const kind of ['requests','rows_read','rows_written','unknown_ops'])test(`admission blocks before ${kind} boundary SQL`,async()=>{const zero={requests:0,rows_read:0,rows_written:0,unknown_ops:0},used={...zero};let calls=0;const raw={usageSnapshot:()=>({...used}),prepare(){return{async run(){calls++;}};}};const guarded=guard(raw,zero);used[kind]=kind==='unknown_ops'?1:kind==='requests'?budget.requests_soft_cap:budget[kind];await assert.rejects(()=>guarded.prepare('INSERT INTO test VALUES(1)').run(),/ADMISSION_DEFERRED/);assert.equal(calls,0);});
test('history read reserve is admitted before consumption',async()=>{let calls=0;const zero={requests:0,rows_read:0,rows_written:0,unknown_ops:0};const raw={usageSnapshot:()=>({...zero,rows_read:2500}),prepare(){return{async all(){calls++;}};}};await assert.rejects(()=>guard(raw,zero).prepare('SELECT * FROM scan_runs').all(),/ADMISSION_DEFERRED/);assert.equal(calls,0);});
