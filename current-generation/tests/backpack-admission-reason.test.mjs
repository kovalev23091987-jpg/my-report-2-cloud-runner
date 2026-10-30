import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {collectBackpackFlow}=await import(modulePath('backpack-flow-collector.mjs'));
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {installEvidenceSourceStore}=await import(modulePath('evidence-source-store.mjs'));
const {installProviderMinuteLedger}=await import(modulePath('provider-minute-ledger.mjs'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url));
const original=JSON.parse(read('checkpoints/n05-backpack-missing4-38134543735/batch-summary.json')),data={};
for(const name of ['BACKPACK-ASSETS','BACKPACK-MARKETS','BACKPACK-ENA-CANDLES','BACKPACK-ENA-TRADES']){
 const r=original.originals.find(r=>r.name===name),bytes=read('checkpoints/n05-backpack-missing4-38134543735/'+r.file),body=zlib.gunzipSync(bytes);assert.equal(sha(bytes),r.gzip_sha256);assert.equal(sha(body),r.body_sha256);data[name]={body,payload:JSON.parse(body),receipt:r};
}
const identity=normalizeHtxAssetReferences(JSON.parse(zlib.gunzipSync(read('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz')))).entries.ENA.identities[0],now=data['BACKPACK-ENA-TRADES'].receipt.received_ts;
function database(){const sqlite=new DatabaseSync(':memory:');let unknown=0,hook=()=>{};const log=[];return{sqlite,log,markUnknown:()=>unknown=1,usageSnapshot:()=>({unknown_ops:unknown}),hook:f=>hook=f,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){log.push({sql,after_unknown:unknown!==0});hook(sql,this.args);return sqlite.prepare(sql).run(...this.args);},async first(){log.push({sql,after_unknown:unknown!==0});return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){const out=[];for(const row of rows)out.push(await row.run());return out;}};}
async function run(stage,mode){
 const db=database();await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);let calls=0,grants=0;
 if(mode==='unknown')db.hook((sql,args)=>{if(sql.startsWith('INSERT INTO report2_evidence_source_cache')&&args[1]===(stage==='markets'?'METADATA:ASSETS':'METADATA:SPOT')){db.markUnknown();throw Error('CONTROLLED_UNKNOWN_METADATA_WRITE');}});
 const limit=stage==='markets'?2:3,requested=[];
 const out=await collectBackpackFlow({db,contract:'ENA-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'BACKPACK_ADMISSION_REASON',now,clock:()=>now,source_health_admit:()=>({allowed:true}),request_admit:()=>{grants++;return grants===limit&&['cap','manual'].includes(mode)?{allowed:false,status:mode==='cap'?'CALLER_FIVE_REQUEST_CAP':'MANUAL_RESERVE_PROTECTED'}:{allowed:true};},fetch_impl:async u=>{
  calls++;requested.push(u);const target=stage==='markets'?u.endsWith('/markets'):u.includes('/klines?');
  if(target&&mode==='429')return new Response('{}',{status:429});
  if(target&&mode==='schema')return new Response(stage==='markets'?'{}':'[]');
  const key=u.endsWith('/assets')?'BACKPACK-ASSETS':u.endsWith('/markets')?'BACKPACK-MARKETS':u.includes('/klines?')?'BACKPACK-ENA-CANDLES':'BACKPACK-ENA-TRADES';
  if(mode==='empty-assets'&&key==='BACKPACK-ASSETS'||mode==='empty-markets'&&key==='BACKPACK-MARKETS')return new Response('[]');
  return new Response(data[key].body);
 }});
 return{db,out,calls,grants,requested};
}
for(const stage of ['markets','candles'])for(const mode of ['cap','manual','429','unknown'])test(`Backpack ${stage} preserves ${mode} refusal instead of inventing an asset/grid diagnosis`,async()=>{
 const r=await run(stage,mode);try{
  const expected=mode==='cap'?'CALLER_FIVE_REQUEST_CAP':mode==='manual'?'MANUAL_RESERVE_PROTECTED':mode==='429'?'HTTP_429':'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE';
  assert.equal(r.out.status,expected);assert.equal(r.out.status,r.out.receipts.at(-1).status);assert.equal(r.out.check_completed,false);assert.equal(r.out.evidence.length,0);
  const acquiredBeforeTarget=stage==='markets'?1:2;assert.equal(r.calls,acquiredBeforeTarget+(mode==='429'?1:0));
  assert.equal(r.db.sqlite.prepare('SELECT SUM(attempts) AS n FROM report2_evidence_source_daily').get().n,r.calls);
  if(mode==='unknown'){assert.equal(r.db.usageSnapshot().unknown_ops,1);assert.equal(r.db.log.filter(r=>r.after_unknown).length,0);}
 }finally{r.db.sqlite.close();}
});
for(const stage of ['markets','candles'])test(`Backpack ${stage} malformed received schema stays distinct from caller admission`,async()=>{
 const r=await run(stage,'schema');try{assert.equal(r.out.status,stage==='markets'?'INVALID_BACKPACK_MARKET_METADATA':'NATIVE_240_MINUTE_GRID_REQUIRED');assert.equal(r.out.receipts.at(-1).http_status,200);assert.equal(r.out.receipts.at(-1).status,'RECEIVED_NOT_QUALIFIED');assert.equal(r.calls,stage==='markets'?2:3);assert.equal(r.out.check_completed,false);}finally{r.db.sqlite.close();}
});
for(const mode of ['empty-assets','empty-markets'])test(`Backpack ${mode} remains genuine checked negative binding with no trade/candle request`,async()=>{
 const r=await run('markets',mode);try{assert.equal(r.out.status,'EXACT_BACKPACK_TOKEN_BINDING_REQUIRED');assert.equal(r.calls,2);assert(!r.requested.some(u=>u.includes('/klines?')||u.includes('/trades/')));assert.equal(r.out.check_completed,false);}finally{r.db.sqlite.close();}
});
