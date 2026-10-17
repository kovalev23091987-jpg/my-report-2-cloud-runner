import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {collectCoingeckoSectorEvidence}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {collectCoinpaprikaSectorEvidence}=await import(modulePath('coinpaprika-sector-evidence.mjs'));
const {createProviderReferenceReader}=await import(modulePath('provider-reference-cache.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(modulePath('evidence-source-store.mjs'));
const {installProviderMinuteLedger}=await import(modulePath('provider-minute-ledger.mjs'));
const {consumeSectorContext}=await import(modulePath('sector-context.mjs'));
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {classifyEvidenceSourceHealth}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
function database(){
 const sqlite=new DatabaseSync(':memory:'),log=[];let unknown=0,hook=()=>{};
 const d={sqlite,log,setHook:f=>hook=f,setUnknown:n=>unknown=n,usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return execute('run',sql,this.args);},async first(){return execute('first',sql,this.args);},async all(){return{results:execute('all',sql,this.args)};}};},async batch(rows){const result=[];for(const r of rows)result.push(await r.run());hook('batch',rows.map(()=>''),[],result);return result;}};
 function execute(method,sql,args){log.push({method,sql,args,after_unknown:unknown!==0});hook('before',sql,args);const s=sqlite.prepare(sql),r=method==='first'?s.get(...args)||null:method==='all'?s.all(...args):s.run(...args);hook('after',sql,args,r);return r;}
 return d;
}
const raw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/tron-sector-live-38570989795/validation.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'09f289569ce20757529c049e06815fd43b3eb03c182f292ad5db6865c4526429');
const actual=JSON.parse(raw),NOW=actual.completed_ts;
const identityRaw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(identityRaw).digest('hex'),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const win=normalizeHtxAssetReferences(JSON.parse(identityRaw)).entries.WIN.identities[0];
const metadata=actual.responses.find(r=>r.url.includes('/contract/'+win.contract_or_mint));
const quotes=actual.responses.find(r=>r.url.includes('&category=oracle&'));
const directory=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/native-sector-rest-38564913120/validation.json.gz',import.meta.url)))).responses.find(r=>r.url.endsWith('/categories/list'));
for(const r of [metadata,quotes,directory])assert.equal(crypto.createHash('sha256').update(r.body).digest('hex'),r.body_sha256);
async function seedWin(d){await installEvidenceSourceStore(d);for(const r of [metadata,directory]){const ttl=r===metadata?21600000:3600000;await writeEvidenceSourceCache(d,{source:'COINGECKO_SECTOR',asset_key:'REFERENCE:provider-reference-cache-v1-20261004:'+crypto.createHash('sha256').update(r.url).digest('hex'),observed_ts:r.received_ts,expires_ts:r.received_ts+ttl,payload:{version:'provider-reference-cache-v1-20261004',url:r.url,received_ts:r.received_ts,expires_ts:r.received_ts+ttl,body:r.body,body_sha256:r.body_sha256}});}}
function failCache(d,{reference=false,unknown=false}={}){let failed=0;d.setHook((phase,sql,args)=>{if(phase==='before'&&typeof sql==='string'&&sql.startsWith('INSERT INTO report2_evidence_source_cache')&&String(args[1]).startsWith('REFERENCE:')===reference){failed++;if(unknown)d.setUnknown(1);throw Error('CONTROLLED_CACHE_FAILURE');}});return()=>failed;}
for(const mode of ['final-known','final-unknown','quote-reference-unknown'])test(`saved exact WIN source and N15 consumer survive ${mode} cache failure`,async t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});const d=database();let calls=0;
 try{await seedWin(d);const failed=failCache(d,{reference:mode.startsWith('quote'),unknown:mode.endsWith('unknown')});
  const r=await collectCoingeckoSectorEvidence({db:d,contract:'WIN-USDT',asset_identity:win,asset_metadata:{},run_id:'SAVED_WIN_CACHE_'+mode,now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response(quotes.body);}});
  assert.equal(calls,1);assert.equal(r.network_calls,1);assert.equal(r.status,'CLOSED');assert.equal(r.evidence.length,1);assert.equal(failed(),1);
  const row=r.evidence[0],consumer=consumeSectorContext({evidence:r.evidence,contract:'WIN-USDT',asset_identity:win,now:NOW});assert.equal(consumer.status,'CLOSED');assert.equal(consumer.facts.length,1);assert.equal(consumer.score_contribution,0);assert.equal(consumer.directional_vote,false);assert.equal(row.target_source_ts,1791983988000);assert.equal(row.source_ts,Math.min(row.target_source_ts,...row.peers.map(p=>p.source_ts)));
  assert.equal(d.log.filter(x=>x.after_unknown).length,0);assert.equal(classifyEvidenceSourceHealth(r,1),'CONTEXT_AVAILABLE');
  if(mode.endsWith('unknown'))assert.equal(d.usageSnapshot().unknown_ops,1);
 }finally{d.sqlite.close();t.mock.timers.reset();}
});
const address='0x514910771AF9Ca656af840dff83E8264EcF986CA',link={chain:'ethereum',contract_or_mint:address},m={id:'link-chainlink',symbol:'LINK',is_active:true,contracts:[{platform:'eth-ethereum',contract:address}],tags:[{id:'oracles'}]},tag={id:'oracles',type:'functional',name:'Oracles',coins:['link-chainlink','p1','p2','p3']};
const quote=(id,symbol,change)=>({id,symbol,last_updated:new Date(NOW-1000).toISOString(),quotes:{USD:{price:1,volume_24h:200000,percent_change_24h:change}}});
const tickers=[quote('link-chainlink','LINK',5),quote('p1','P1',0),quote('p2','P2',1),quote('p3','P3',3)];
for(const unknown of [false,true])test(`CoinPaprika useful facts survive final cache failure with unknown=${unknown}`,async t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});const d=database();let calls=0;
 try{const failed=failCache(d,{unknown});const r=await collectCoinpaprikaSectorEvidence({db:d,contract:'LINK-USDT',asset_identity:link,asset_metadata:{coinpaprika_id:m.id,sector_tag:'oracles'},run_id:'CP_FINAL_'+unknown,now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/coins/')?m:url.includes('/tags/')?tag:tickers));}});assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,calls);assert.equal(calls,3);assert.equal(failed(),1);assert.equal(r.evidence.length,1);const c=consumeSectorContext({evidence:r.evidence,contract:'LINK-USDT',asset_identity:link,now:NOW});assert.equal(c.status,'CLOSED');assert.equal(c.facts[0].source_ts,NOW-1000);assert.equal(c.score_contribution,0);assert.equal(d.log.filter(x=>x.after_unknown).length,0);assert.equal(r.cache_write_receipts[0].status,'CACHE_WRITE_FAILED_VALID_RESPONSE_RETAINED');
 }finally{d.sqlite.close();t.mock.timers.reset();}
});
test('known reference cache failures preserve the remaining admitted chain and source backoff stays optional',async t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});const d=database();let calls=0;
 try{failCache(d,{reference:true});const r=await collectCoinpaprikaSectorEvidence({db:d,contract:'LINK-USDT',asset_identity:link,asset_metadata:{coinpaprika_id:m.id,sector_tag:'oracles'},run_id:'CP_REFERENCE_KNOWN',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/coins/')?m:url.includes('/tags/')?tag:tickers));}});assert.equal(r.status,'CLOSED');assert.equal(calls,3);assert.equal(r.receipts.filter(x=>x.cache_storage_status==='CACHE_WRITE_FAILED_VALID_RESPONSE_RETAINED').length,3);assert.equal(r.evidence.length,1);
 }finally{d.sqlite.close();t.mock.timers.reset();}
});
for(const collector of [collectCoingeckoSectorEvidence,collectCoinpaprikaSectorEvidence])test(`${collector.name} refuses existing unclosed usage before schema/cache/source`,async()=>{
 const d=database();d.setUnknown(1);let calls=0;try{const r=await collector({db:d,contract:'LINK-USDT',asset_identity:link,asset_metadata:{coinpaprika_id:m.id,sector_tag:'oracles'},run_id:'PREEXISTING_UNKNOWN',now:NOW,fetch_impl:async()=>{calls++;}});assert.equal(r.evidence.length,0);assert.equal(r.network_calls,0);assert.equal(d.log.length,0);assert.equal(calls,0);}finally{d.sqlite.close();}
});
for(const stage of ['reference-read','daily-read','daily-batch','minute-reservation'])test(`reference reader stops SQL and transport after unknown ${stage} without refund`,async()=>{
 const d=database();let calls=0,admitted=0,triggered=false;try{await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);d.log.length=0;
 d.setHook((phase,sql)=>{const hit=stage==='reference-read'?phase==='after'&&typeof sql==='string'&&sql.startsWith('SELECT observed_ts'):stage==='daily-read'?phase==='after'&&typeof sql==='string'&&sql==='SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2':stage==='daily-batch'?phase==='batch':phase==='after'&&typeof sql==='string'&&sql.startsWith('INSERT INTO report2_provider_minute_ledger_v1');if(hit&&!triggered){triggered=true;d.setUnknown(1);}});
 const reader=createProviderReferenceReader({db:d,source:'COINGECKO_SECTOR',run_id:'UNKNOWN_'+stage,now:NOW,daily_cap:48,minute_provider:stage==='minute-reservation'?'COINGECKO':null,request_admit:()=>{admitted++;return{allowed:true};},fetch_impl:async()=>{calls++;return new Response('{}');}});
 assert.equal(await reader.get('METADATA','https://api.coingecko.com/api/v3/coins/test-coin',{ttl_ms:60000}),null);assert.equal(triggered,true);assert.equal(calls,0);assert.equal(d.log.filter(x=>x.after_unknown).length,0);assert.equal(reader.summary().admission.status,'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');
 assert.equal(admitted,['daily-batch','minute-reservation'].includes(stage)?1:0);
 if(admitted)assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,1);
 if(stage==='minute-reservation')assert.equal(d.sqlite.prepare('SELECT SUM(units) AS units FROM report2_provider_minute_ledger_v1').get().units,1);
 }finally{d.sqlite.close();}
});
test('429 backoff cache failure retains the original provider failure and exact transport count',async t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});const d=database();try{failCache(d,{unknown:true});const r=await collectCoinpaprikaSectorEvidence({db:d,contract:'LINK-USDT',asset_identity:link,asset_metadata:{coinpaprika_id:m.id,sector_tag:'oracles'},run_id:'CP_429',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>new Response('{}',{status:429})});assert.equal(r.status,'PROVIDER_RATE_LIMITED');assert.equal(r.network_calls,1);assert.equal(r.evidence.length,0);assert.ok(r.provider_backoff.backoff_until>NOW);assert.equal(classifyEvidenceSourceHealth(r,0),'PROVIDER_RATE_LIMITED');assert.equal(d.log.filter(x=>x.after_unknown).length,0);assert.equal(r.cache_write_receipts[1].status,'CACHE_WRITE_SKIPPED_UNCLOSED_NATIVE_USAGE');}finally{d.sqlite.close();t.mock.timers.reset();}
});

test('a measured transport body survives an unmeasured optional cache ACK without another SQL',async t=>{
 t.mock.timers.enable({apis:['Date'],now:NOW});const d=database();try{await seedWin(d);let changed=false;d.setHook((phase,sql,args)=>{if(!changed&&phase==='after'&&typeof sql==='string'&&sql.startsWith('INSERT INTO report2_evidence_source_cache')&&String(args[1]).startsWith('REFERENCE:')){changed=true;d.setUnknown(1);}});const r=await collectCoingeckoSectorEvidence({db:d,contract:'WIN-USDT',asset_identity:win,run_id:'SAVED_WIN_UNMEASURED_CACHE_ACK',now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>new Response(quotes.body)});assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,1);assert.equal(r.evidence.length,1);assert.equal(r.receipts.at(-1).cache_storage_status,'CACHE_WRITE_UNCLOSED_NATIVE_USAGE');assert.equal(r.cache_write_receipts[0].status,'CACHE_WRITE_SKIPPED_UNCLOSED_NATIVE_USAGE');assert.equal(d.log.filter(x=>x.after_unknown).length,0);assert.equal(consumeSectorContext({evidence:r.evidence,contract:'WIN-USDT',asset_identity:win,now:NOW}).status,'CLOSED');}finally{d.sqlite.close();t.mock.timers.reset();}
});
test('unknown native cost during minute schema setup prevents the following index statements',async()=>{
 const d=database();try{d.setHook((phase,sql)=>{if(phase==='after'&&typeof sql==='string'&&sql.startsWith('CREATE TABLE IF NOT EXISTS report2_provider_minute_ledger_v1'))d.setUnknown(1);});await assert.rejects(installProviderMinuteLedger(d),/SCHEMA_NATIVE_USAGE_NOT_CLOSED/);assert.equal(d.log.length,1);assert.equal(d.log.filter(x=>x.after_unknown).length,0);}finally{d.sqlite.close();}
});
