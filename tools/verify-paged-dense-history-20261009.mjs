import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';


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
 const add=(minute,{generation=compat.generations.at(-1),schema=compat.schema_version,hashBad=false,expected=1,received=null,sourceTs=null,price=100+minute,contract='QNT-USDT',age=0,shard=0}={})=>{
  const ts=T+minute*M,payload=JSON.stringify([{contract,observed_ts:sourceTs??ts,price,market_age_sec:age,source_status:'CLOSED'}]);
  sql.prepare('INSERT INTO report2_market_snapshot_batch_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(ts,'HUB_PUBLIC_COLLECTOR',generation,schema,shard,JSON.stringify({expected_shards:expected,universe_total:expected}),received??ts+100,'COMPLETE',hashBad?'bad':createHash('sha256').update(payload).digest('hex'),payload,1,Buffer.byteLength(payload));
 };
 const series=(opts={})=>{for(let i=0;i<=60;i+=5)add(i,opts);};
 const task=(id,start=T,price=100)=>sql.prepare(`INSERT INTO v3_early_outcome_journal(outcome_id,wave_id,contract_code,direction_hint,first_seen_ts,horizon_hours,target_ts,outcome_status,first_seen_context_json,shadow_only) VALUES(?,?,'QNT-USDT','LONG',?,1,?,'PENDING',?,1)`).run(id,id,start,start+60*M,JSON.stringify({first_seen_price:price}));
 const read=()=>load(db,{contract:'QNT-USDT',startTs:T,endTs:T+60*M,nowTs:NOW});
 return {sql,db,queries,add,series,task,read};
}


fs.mkdirSync('audit-output',{recursive:true});const cases=[];
for(const shards of [6,7])for(const hours of [4,12,24]){
 const f=fixture({after(){}});for(let minute=0;minute<=hours*60;minute+=5)for(let shard=0;shard<shards;shard++)f.add(minute,{expected:shards,shard,contract:shard===0?'QNT-USDT':'DUMMY'+shard+'-USDT'});
 const r=await load(f.db,{contract:'QNT-USDT',startTs:T,endTs:T+hours*60*M,nowTs:T+25*60*M});
 assert.equal(r.status,'CLOSED',JSON.stringify({hours,shards,r}));assert.equal(r.points.length,hours*12+1);assert.equal(new Set(r.points.map(p=>p.ts)).size,r.points.length);assert.equal(r.extrema_scope,'OBSERVED_SNAPSHOTS_ONLY');
 assert.ok(f.queries.every(q=>q.plan.some(p=>/SEARCH/.test(p.detail))&&!q.plan.some(p=>/SCAN report2_market_snapshot_batch_v1/.test(p.detail))),JSON.stringify(f.queries.map(q=>q.plan)));
 cases.push({hours,shards,fixture_rows:(hours*12+1)*shards,price_points:r.points.length,status:r.status,queries:f.queries.length,all_pages_indexed:true});f.sql.close();
}
for(const defect of ['missing_slot','hash_corruption_after_first_page','future_receipt_after_first_page','incomplete_split_slot']){
 const f=fixture({after(){}});for(let minute=0;minute<=24*60;minute+=5){if(defect==='missing_slot'&&minute===900)continue;for(let shard=0;shard<7;shard++){if(defect==='incomplete_split_slot'&&minute===900&&shard===6)continue;f.add(minute,{expected:7,shard,contract:shard===0?'QNT-USDT':'DUMMY'+shard+'-USDT',hashBad:defect==='hash_corruption_after_first_page'&&minute===900&&shard===0,received:defect==='future_receipt_after_first_page'&&minute===900?T+26*60*M:null});}}
 const r=await load(f.db,{contract:'QNT-USDT',startTs:T,endTs:T+24*60*M,nowTs:T+25*60*M});assert.notEqual(r.status,'CLOSED',defect);cases.push({defect,status:r.status,collector_reason:r.collector_reason,not_promoted_to_factual:true});f.sql.close();
}
const proof={schema:'PAGED_DENSE_HISTORY_REGRESSION_20261009_V1',head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,status:'BOUNDED_PAGED6_AND7_SHARD_4H_12H_24H_HISTORY_AND_NEGATIVE_INTEGRITY_REGRESSIONS_PASS',cases,cycle_envelope:{rows_read:budget.rows_read,rows_written:budget.rows_written,requests_soft_cap:budget.requests_soft_cap},sourceHTTP:0,D1:0,MAIN:0,Telegram:0,actual_ENTRY:false,scope:'REAL_SQLITE_HASHED_CONTROLLED_FIXTURE;NOT_ACTUAL_OUTCOME_OR_EMPIRICAL_VALIDATION'};assert.deepEqual(proof.cycle_envelope,{rows_read:3000,rows_written:8,requests_soft_cap:14});fs.writeFileSync('audit-output/paged-dense-history-regression.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
