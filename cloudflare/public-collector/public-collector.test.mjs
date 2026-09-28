import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    if(sql.includes('INSERT OR IGNORE INTO report2_public_collector_usage_v1')){this.usage={state:'STARTED',claim_token:args[3],lease_until:args[4],status:'STARTED'};return{meta:{changes:1}};}
    if(sql.includes('INSERT INTO report2_market_snapshot_batch_v1')){this.snapshots.push({shard:args[4],payload_hash:args[8],status:args[7],payload:args[9]});return{meta:{changes:1}};}
    if(sql.includes('UPDATE report2_public_collector_usage_v1 SET')){this.usage={...this.usage,state:args[4],status:args[10],rows_written:args[8]};return{meta:{changes:1}};}
    if(sql.includes('INSERT INTO report2_public_collector_health_v1')){this.health={status:args[5],contracts:args[6],shards:args[7],external_requests:args[8]};return{meta:{changes:1}};}
    if(sql.includes('DELETE FROM report2_market_snapshot_batch_v1'))return{meta:{changes:0}};
    throw new Error(`UNEXPECTED_RUN:${sql}`);
  }
}

test('T03 Hub overlay replaces legacy scheduled analytics with bounded public collector',async t=>{
  if(!fs.existsSync(basePath))return t.skip('sanitized exact Hub module is not present in this workspace');
  const base=fs.readFileSync(basePath,'utf8'),injected=fs.readFileSync(injectedPath,'utf8').trim();
  const patched=base.includes('__REPORT2_PUBLIC_COLLECTOR_HANDLER as default')
    ? {source:base,status:'ALREADY_PATCHED'}
    : patchWorker(base,injected);
  assert.ok(['PATCHED','ALREADY_PATCHED'].includes(patched.status));
  assert.match(patched.source,/__REPORT2_PUBLIC_COLLECTOR_HANDLER as default/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'report2-public-collector-')),file=path.join(dir,'worker.mjs');
  fs.writeFileSync(file,patched.source);
  const worker=(await import(`${pathToFileURL(file).href}?test=${Date.now()}`)).default;
  const db=new FakeD1(),scheduledTime=Date.UTC(2026,8,28,12,5,0);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const value=String(url),ts=scheduledTime;
    if(value.includes('batch_merged'))return new Response(JSON.stringify({status:'ok',ts,ticks:[{contract_code:'SOL-USDT',close:100,trade_turnover:1e6,ts},{contract_code:'QNT-USDT',close:125,trade_turnover:5e5,ts}]}));
    if(value.includes('swap_open_interest'))return new Response(JSON.stringify({status:'ok',ts,data:[{contract_code:'SOL-USDT',volume:10,value:1e3},{contract_code:'QNT-USDT',volume:20,value:2e3}]}));
    if(value.includes('swap_batch_funding_rate'))return new Response(JSON.stringify({status:'ok',ts,data:[{contract_code:'SOL-USDT',funding_rate:.001},{contract_code:'QNT-USDT',funding_rate:-.001}]}));
    if(value.includes('swap_contract_info'))return new Response(JSON.stringify({status:'ok',ts,data:[{contract_code:'SOL-USDT',contract_status:1,business_type:'swap',contract_size:1},{contract_code:'QNT-USDT',contract_status:1,business_type:'swap',contract_size:1}]}));
    throw new Error(`UNEXPECTED_FETCH:${value}`);
  };
  try{
    await worker.scheduled({scheduledTime},{PUBLIC_COLLECTOR_ENABLED:'1',ANALYTICS_ENABLED:'0',DELIVERY_ENABLED:'0',REPORT2_CURRENT_GENERATION:'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V11_20M',DATA_DB:db},{waitUntil(){}});
  }finally{globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});}
  assert.equal(db.snapshots.length,1);
  const rows=JSON.parse(db.snapshots[0].payload);
  assert.deepEqual(rows.map(row=>row.contract),['QNT-USDT','SOL-USDT']);
  assert.equal(db.health.status,'CLOSED');
  assert.equal(db.health.external_requests,4);
  assert.equal(db.usage.state,'CLOSED');
});

test('T03 upgrades the already deployed V1 collector without touching the Hub prefix',()=>{
  const injected=fs.readFileSync(injectedPath,'utf8').trim();
  const previous='const hubPrefix=true;\nvar __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v1-20260928";\nconst oldTail=true;\nexport {\n  __REPORT2_PUBLIC_COLLECTOR_HANDLER as default\n};';
  const upgraded=patchWorker(previous,injected);
  assert.equal(upgraded.status,'UPGRADED');
  assert.match(upgraded.source,/const hubPrefix=true/);
  assert.match(upgraded.source,/report2-public-collector-v2-20260928/);
  assert.doesNotMatch(upgraded.source,/report2-public-collector-v1-20260928/);
  assert.equal(upgraded.source.match(/__REPORT2_PUBLIC_COLLECTOR_HANDLER as default/g)?.length,1);
});
