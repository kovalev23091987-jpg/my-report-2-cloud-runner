import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
globalThis.fetch=async()=>{throw Error('NETWORK_FORBIDDEN_IN_IMMUTABLE_UNIVERSE_REPLAY')};
const root=path.resolve(process.argv[2]||'runtime');
const {loadProspectiveFactualPathForTest:load,prospectiveBudgetGuard:guard}=await import(pathToFileURL(path.join(root,'r8-20-prospective-validation-sidecar.mjs')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const dir='checkpoints/paged-prospective-history-37865298193';
const a=JSON.parse(fs.readFileSync(dir+'/actual-paged-history.json'));
const universeGz=fs.readFileSync('checkpoints/htx-all-modes-crypto-futures-universe-20261004.json.gz');
assert.equal(sha(universeGz),'edfb909938001fe2bdddf79fee8063af095abb47285611f5c5c222788700c613');
const universe=JSON.parse(gunzipSync(universeGz)),contracts=universe.assets.map(row=>row.asset_analysis_contract);
assert.equal(contracts.length,102);assert.equal(new Set(contracts).size,102);
assert.equal(universe.contracts.length,119);assert.equal(universe.catalog_families.length,3);
const sql=new DatabaseSync(':memory:');
sql.exec('CREATE TABLE report2_market_snapshot_batch_v1(bucket INTEGER,actor TEXT,generation TEXT,schema_version TEXT,shard INTEGER,source_timestamps_json TEXT,received_ts INTEGER,status TEXT,payload_hash TEXT,payload TEXT,contract_count INTEGER,payload_bytes INTEGER,PRIMARY KEY(actor,generation,bucket,shard));CREATE INDEX idx_report2_market_snapshot_batch_v1_range ON report2_market_snapshot_batch_v1(generation,bucket,shard);CREATE TABLE scan_runs(ts_bucket INTEGER PRIMARY KEY,ts INTEGER,payload_json TEXT,stage0_coverage_pct REAL,errors INTEGER,stale INTEGER);');
const fields=['bucket','actor','generation','schema_version','shard','source_timestamps_json','received_ts','status','payload_hash','payload','contract_count','payload_bytes'],original=new Map(),direct=new Map(contracts.map(c=>[c,[]]));
for(const page of a.raw_pages){
 const gz=fs.readFileSync(dir+'/actual-paged-history/'+page.file);assert.equal(sha(gz),page.gzip_sha256);
 const raw=gunzipSync(gz);assert.equal(sha(raw),page.raw_sha256);
 for(const row of JSON.parse(raw).result.results){
  const key=[row.actor,row.generation,row.bucket,row.shard].join('|');
  if(original.has(key)){assert.deepEqual(row,original.get(key));continue;}
  original.set(key,row);sql.prepare('INSERT INTO report2_market_snapshot_batch_v1 VALUES('+fields.map(()=>'?').join(',')+')').run(...fields.map(k=>row[k]));
  assert.equal(sha(row.payload),row.payload_hash);
  for(const item of JSON.parse(row.payload))if(direct.has(item.contract)&&item.source_status==='CLOSED'&&item.observed_ts>=a.start_ts&&item.observed_ts<=a.end_ts)direct.get(item.contract).push({ts:item.observed_ts,price:item.price});
 }
}
assert.equal(original.size,1734);
const results=[];let controlledQueries=0,controlledRows=0;
for(const contract of contracts){
 const used={requests:0,rows_read:0,rows_written:0,unknown_ops:0};
 const db={usageSnapshot:()=>({...used}),prepare(query){const wrap=args=>({bind(...v){return wrap(v)},async all(){const indices=[],q=query.replace(/\?(\d+)/g,(_,n)=>{indices.push(Number(n)-1);return '?'}),values=indices.map(i=>args[i]);const plan=sql.prepare('EXPLAIN QUERY PLAN '+q).all(...values);assert.ok(plan.some(p=>/SEARCH/.test(p.detail)));assert.ok(!plan.some(p=>/SCAN report2_market_snapshot_batch_v1/.test(p.detail)));const rows=sql.prepare(q).all(...values);used.requests++;used.rows_read+=rows.length;return{results:rows};}});return wrap([])}};
 const result=await load(guard(db,{requests:0,rows_read:0,rows_written:0,unknown_ops:0}),{contract,startTs:a.start_ts,endTs:a.end_ts,nowTs:a.read_ts});
 assert.equal(result.status,'CLOSED',contract);assert.equal(result.points.length,288,contract);
 const expected=direct.get(contract).sort((x,y)=>x.ts-y.ts);assert.equal(expected.length,288,contract);assert.deepEqual(result.points,expected,contract);
 assert.equal(result.rows_loaded,1734);assert.equal(used.requests,5);assert.ok(used.rows_read<=3000);
 if(contract===a.contract)assert.deepEqual(result.points,a.result.points);
 results.push({contract,status:result.status,points:result.points.length,points_sha256:sha(JSON.stringify(result.points)),first_ts:result.points[0].ts,last_ts:result.points.at(-1).ts,minimum_sampled_price:Math.min(...result.points.map(p=>p.price)),maximum_sampled_price:Math.max(...result.points.map(p=>p.price)),controlled_queries:used.requests,controlled_rows_returned:used.rows_read,original_rows:result.rows_loaded});
 controlledQueries+=used.requests;controlledRows+=used.rows_read;
}
sql.close();
const out={schema:'APPROVED102_ORIGINAL24H_ASSEMBLED_READER_REPLAY_20261009_V1',status:'ALL102_APPROVED_ANALYSIS_CONTRACTS_ORIGINAL24H_READER_CLOSED',tested_head:process.env.GITHUB_SHA,cloud_run:process.env.GITHUB_RUN_ID,source_cloud_run:37865298193,source_tested_head:a.head,source_artifact_id:11588125984,source_artifact_digest:'sha256:7ccc418f0db9ab9c235e3b8c27cef31febd3a686dcdf511ec40500a312fac29b',original_read_ts:a.read_ts,original_start_ts:a.start_ts,original_end_ts:a.end_ts,original_rows:original.size,approved_universe:{original_observed_ts:universe.observed_ts,gzip_sha256:sha(universeGz),assets:102,contracts:119,families:3,new_current_tradeability_claim:false},contracts:results.length,total_points:results.reduce((s,r)=>s+r.points,0),results,controlled_SQLite_queries:controlledQueries,controlled_rows_returned:controlledRows,actual_D1:0,sourceHTTP:0,MAIN:0,Telegram:0,actual_ENTRY:false,new_fresh_SENT:false,source_clocks_refreshed:false,all_continuation_queries_indexed:true,all_original_points_unchanged:true,single_production_cycle_all102_claim:false,all102_30_90day_history:false,empirical_entry_outcome:false,project_complete:false,scope:'ONE_ORIGINAL24H_IMMUTABLE_PRICE_SNAPSHOT_WINDOW_FOR_EACH_APPROVED_ASSET_THROUGH_ASSEMBLED_READER;SEPARATE_OFFLINE_PATHS_NOT_ONE_PRODUCTION_CYCLE;NOT_TRADES_EVENTS_INTRAMINUTE_EXTREMA_OR30_90DAY_HISTORY'};
fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/approved102-original24h-replay.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,results:undefined}));
