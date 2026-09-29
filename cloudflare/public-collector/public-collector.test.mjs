import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {patchWorker} from './patch-worker.mjs';

const basePath=process.env.REPORT2_HUB_MODULE_PATH
  ? path.resolve(process.env.REPORT2_HUB_MODULE_PATH)
  : path.resolve('../cloudflare-hub-secure-36389452215/worker.js');
const injectedPath=new URL('./injected-worker-tail.js',import.meta.url);

class Statement{
  constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.db,this.sql,args);}
  async first(){return this.db.first(this.sql,this.args);}
  async all(){return this.db.all(this.sql,this.args);}
  async run(){return this.db.run(this.sql,this.args);}
}
class FakeD1{
  constructor(){this.usage=null;this.snapshots=[];this.health=null;}
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;}
  async first(sql,args){
    if(sql.includes('COUNT(*) AS slots'))return{slots:0,rows_written:0};
    if(sql.includes('FROM report2_public_collector_usage_v1'))return this.usage;
    throw new Error(`UNEXPECTED_FIRST:${sql}`);
  }
  async all(sql,args){
    if(sql.includes('FROM report2_market_snapshot_batch_v1')&&sql.includes('MAX(bucket)'))return{results:[]};
    if(sql.includes('SELECT shard,payload_hash,status'))return{results:this.snapshots.map(row=>({shard:row.shard,payload_hash:row.payload_hash,status:row.status}))};
    throw new Error(`UNEXPECTED_ALL:${sql}`);
  }
  async run(sql,args){
    if(sql.includes('INSERT OR IGNORE INTO report2_public_collector_usage_v1')){this.usage={state:'STARTED',claim_token:args[3],lease_until:args[4],started_ts:args[5],status:'STARTED'};return{meta:{changes:1}};}
    if(sql.includes('INSERT INTO report2_market_snapshot_batch_v1')){this.snapshots.push({shard:args[4],payload_hash:args[8],status:args[7],payload:args[9]});return{meta:{changes:1}};}
    if(sql.includes('UPDATE report2_public_collector_usage_v1 SET')){this.usage={...this.usage,state:args[4],status:args[10],rows_written:args[8]};return{meta:{changes:1}};}
    if(sql.includes('INSERT INTO report2_public_collector_health_v1')){this.health={status:args[5],contracts:args[6],shards:args[7],external_requests:args[8]};return{meta:{changes:1}};}
    if(sql.includes('DELETE FROM report2_market_snapshot_batch_v1'))return{meta:{changes:0}};
    throw new Error(`UNEXPECTED_RUN:${sql}`);
  }
}

test('T03 Hub overlay replaces legacy scheduled analytics with bounded public collector',async()=>{
  const fallback='const worker_default={fetch(){return new Response("ok")}};\nvar __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v4-linear-pack-20260929";\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
  const base=fs.existsSync(basePath)?fs.readFileSync(basePath,'utf8'):fallback,injected=fs.readFileSync(injectedPath,'utf8').trim();
  const patched=patchWorker(base,injected);
  assert.ok(['PATCHED','UPGRADED','ALREADY_PATCHED'].includes(patched.status));
  assert.match(patched.source,/__REPORT2_PUBLIC_COLLECTOR_HANDLER as default/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-public-collector-')),file=path.join(dir,'worker.mjs');
  fs.writeFileSync(file,patched.source);
  const worker=(await import(`${pathToFileURL(file).href}?test=${Date.now()}`)).default;
  const db=new FakeD1(),scheduledTime=Date.UTC(2026,8,28,12,5,0);
  const unicodeContracts=['币-USDT','測試-USDT','ТОКЕН-USDT','Δ-USDT'];
  const contracts=['SOL-USDT','QNT-USDT',...unicodeContracts,...Array.from({length:355},(_,i)=>`C${String(i).padStart(3,'0')}-USDT`)];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const value=String(url),ts=scheduledTime;
    if(value.includes('batch_merged'))return new Response(JSON.stringify({status:'ok',ts,ticks:contracts.map((contract_code,i)=>({contract_code,close:100+i,trade_turnover:1e6,ts}))}));
    if(value.includes('swap_open_interest'))return new Response(JSON.stringify({status:'ok',ts,data:contracts.map(contract_code=>({contract_code,volume:10,value:1e3}))}));
    if(value.includes('swap_batch_funding_rate'))return new Response(JSON.stringify({status:'ok',ts,data:contracts.map(contract_code=>({contract_code,funding_rate:.001}))}));
    if(value.includes('swap_contract_info'))return new Response(JSON.stringify({status:'ok',ts,data:contracts.map(contract_code=>({contract_code,contract_status:1,business_type:'swap',contract_size:1}))}));
    throw new Error(`UNEXPECTED_FETCH:${value}`);
  };
  try{
    const env={PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M',DATA_DB:db};
    await worker.scheduled({scheduledTime},env,{waitUntil(){}});
    const failedDb=new FakeD1();globalThis.fetch=async()=>new Response(JSON.stringify({status:'error',message:'provider failure'}),{status:200});
    await assert.rejects(worker.scheduled({scheduledTime:scheduledTime+300000},{...env,DATA_DB:failedDb},{waitUntil(){}}),/PUBLIC_COLLECTOR_PROVIDER_STATUS_error/);
    assert.equal(failedDb.usage.state,'ERROR');assert.equal(failedDb.usage.status,'ERROR');assert.equal(failedDb.health.status,'ERROR');
  }finally{globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});}
  assert.equal(db.snapshots.length,6);
  const rows=db.snapshots.flatMap(shard=>{
    assert.equal(crypto.createHash('sha256').update(shard.payload).digest('hex'),shard.payload_hash);
    assert.ok(Buffer.byteLength(shard.payload)<=64*1024);
    return JSON.parse(shard.payload);
  });
  assert.equal(rows.length,361);
  assert.equal(new Set(rows.map(row=>row.contract)).size,361);
  for(const contract of contracts)assert.ok(rows.some(row=>row.contract===contract),contract);
  assert.equal(unicodeContracts.every(contract=>rows.some(row=>row.contract===contract)),true);
  assert.equal(db.health.status,'CLOSED');
  assert.equal(db.health.external_requests,4);
  assert.equal(db.usage.state,'CLOSED');
  assert.equal(db.usage.lease_until-db.usage.started_ts,120_000);
});

test('T03 upgrades the already deployed V1 collector without touching the Hub prefix',()=>{
  const injected=fs.readFileSync(injectedPath,'utf8').trim();
  const previous='const hubPrefix=true;\nvar __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v1-20260928";\nconst oldTail=true;\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
  const upgraded=patchWorker(previous,injected);
  assert.equal(upgraded.status,'UPGRADED');
  assert.match(upgraded.source,/const hubPrefix=true/);
  assert.match(upgraded.source,/report2-public-collector-v6-once-pack-retry-20260929/);
  assert.doesNotMatch(upgraded.source,/report2-public-collector-v1-20260928/);
  assert.equal(upgraded.source.match(/__REPORT2_PUBLIC_COLLECTOR_HANDLER as default/g)?.length,1);
});

test('T03 upgrades the deployed V3 collector and preserves the Hub prefix',()=>{
  const injected=fs.readFileSync(injectedPath,'utf8').trim();
  const previous='const hubPrefix=true;\nvar __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v3-contract-integrity-20260928";\nconst oldTail=true;\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
  const upgraded=patchWorker(previous,injected);
  assert.equal(upgraded.status,'UPGRADED');
  assert.match(upgraded.source,/const hubPrefix=true/);
  assert.match(upgraded.source,/report2-public-collector-v6-once-pack-retry-20260929/);
  assert.doesNotMatch(upgraded.source,/report2-public-collector-v3-contract-integrity-20260928/);
});

test('T03 upgrades V4 while retaining exact bounded claims and a shorter backup lease',()=>{
  const injected=fs.readFileSync(injectedPath,'utf8').trim();
  const previous='const worker_default={};\nvar __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v4-linear-pack-20260929";\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
  const upgraded=patchWorker(previous,injected);
  assert.equal(upgraded.status,'UPGRADED');
  assert.match(upgraded.source,/report2-public-collector-v6-once-pack-retry-20260929/);
  assert.doesNotMatch(upgraded.source,/now \+ 24e4/);
  assert.equal((upgraded.source.match(/now \+ 12e4/g)||[]).length,2);
});

test('T03 upgrades deployed V5 and preserves exact JSON bytes in the faster packer',async()=>{
  const injected=fs.readFileSync(injectedPath,'utf8').trim();
  const previous='const hubPrefix=true;\nvar __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v5-backup-lease-20260929";\nconst oldTail=true;\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
  const upgraded=patchWorker(previous,injected);
  assert.equal(upgraded.status,'UPGRADED');
  assert.match(upgraded.source,/const hubPrefix=true/);
  assert.doesNotMatch(upgraded.source,/report2-public-collector-v5-backup-lease-20260929/);
  const pack=Function('worker_default',`${injected}\nreturn __report2PublicCollectorPack;`)({});
  const rows=Array.from({length:145},(_,i)=>({contract:`${['币','Δ','C'][i%3]}${i}-USDT`,price:i,missing:i%7===0?['funding']:[],note:i===0?'тест'.repeat(6000):null}));
  const shards=await pack({bucket:1,received_ts:2,source_timestamps:{market:2},rows});
  const sorted=[...rows].sort((a,b)=>String(a.contract).localeCompare(String(b.contract)));
  const expected=[];let current=[];
  for(const row of sorted){
    const next=[...current,row];
    if(current.length&&(current.length>=64||Buffer.byteLength(JSON.stringify(next))>64*1024)){expected.push(JSON.stringify(current));current=[];}
    current.push(row);
  }
  if(current.length)expected.push(JSON.stringify(current));
  assert.deepEqual(shards.map(row=>row.payload),expected);
  for(const shard of shards)assert.equal(shard.payload_bytes,Buffer.byteLength(shard.payload));
});
