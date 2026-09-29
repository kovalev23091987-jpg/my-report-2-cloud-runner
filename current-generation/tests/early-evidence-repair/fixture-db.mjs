import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
export const NOW=1790656435972;
export function fixtureDb({corrupt=false,future=false,collector=true}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(fs.readFileSync(new URL('../../../runtime/migrations/20260917_v3_early_discovery_shadow.sql',import.meta.url),'utf8'));
 sql.exec(`CREATE TABLE scan_runs(ts_bucket INTEGER PRIMARY KEY,ts INTEGER,stage0_coverage_pct REAL,errors INTEGER,stale INTEGER,payload_json TEXT);
 CREATE TABLE report2_market_snapshot_batch_v1(bucket INTEGER,actor TEXT,generation TEXT,schema_version TEXT,shard INTEGER,source_timestamps_json TEXT,received_ts INTEGER,status TEXT,payload_hash TEXT,payload TEXT,contract_count INTEGER,payload_bytes INTEGER,PRIMARY KEY(actor,generation,bucket,shard));
 CREATE INDEX collector_generation_bucket ON report2_market_snapshot_batch_v1(generation,bucket);
 CREATE TABLE v3_market_microstructure_1m(contract_code TEXT,bucket_ts INTEGER);`);
 for(const r of read('./real_scans.json'))sql.prepare('INSERT OR REPLACE INTO scan_runs VALUES(?,?,?,?,?,?)').run(Math.floor(r.ts/300000)*300000,r.ts,r.coverage,r.errors,r.stale,JSON.stringify({schema:'stage0-compact-v2',timestamp:r.ts,contracts:r.contracts}));
 const grouped=new Map();
 for(const tuple of read('./real_history.json').rows){const [bucket,received_ts,contract,observed_ts,price,turnover_24h_usdt,oi_contracts,oi_value_usdt,funding_rate,funding_interval_hours,market_age_sec,source_status]=tuple;
 const g=grouped.get(bucket)||{received:received_ts,rows:[]};g.received=Math.max(g.received,received_ts);g.rows.push({contract,observed_ts,price,turnover_24h_usdt,oi_contracts,oi_value_usdt,funding_rate,funding_interval_hours,market_age_sec,source_status});grouped.set(bucket,g);}
 // The market values below are real; the shard envelope is rebuilt for the
 // eight-contract fixture. It is NOT the original 359-contract source hash.
 if(collector)for(const [bucket,g] of grouped){const payload=JSON.stringify(g.rows);sql.prepare('INSERT INTO report2_market_snapshot_batch_v1 VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(bucket,'HUB_PUBLIC_COLLECTOR','MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M','report2-market-snapshot-batch-v1',0,JSON.stringify({expected_shards:1,universe_total:g.rows.length}),future?NOW+1:g.received,'COMPLETE',corrupt?'bad':createHash('sha256').update(payload).digest('hex'),payload,g.rows.length,Buffer.byteLength(payload));}
 const usage={rows_read:0,rows_written:0,requests:0,unknown_ops:0};const queries=[];
 const db={sql,queries,usageSnapshot:()=>({...usage}),prepare(query){return {args:[],bind(...args){this.args=args;return this;},async all(){usage.requests++;queries.push(query);const params=Object.fromEntries(this.args.map((v,i)=>[String(i+1),v]));const st=sql.prepare(query);let results=[];let changes=0;if(/^\s*(SELECT|WITH|PRAGMA)/i.test(query)){results=st.all(params);usage.rows_read+=results.length;}else{changes=Number(st.run(params).changes);usage.rows_written+=changes;}return {results,meta:{changes}};},async first(){return (await this.all()).results[0]||null;},async run(){return this.all();}};},async batch(statements){const result=[];sql.exec('BEGIN');try{for(const st of statements)result.push(await st.all());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return db;
}
