import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const moduleRoot=process.env.REPORT2_REFERENCE_MODULE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_REFERENCE_MODULE_ROOT)+'/'):new URL('../files/src/',import.meta.url);
const {createProviderReferenceReader}=await import(new URL('provider-reference-cache.mjs',moduleRoot));
const {installEvidenceSourceStore}=await import(new URL('evidence-source-store.mjs',moduleRoot));
const {verifyCoinpaprikaIdentity}=await import(new URL('coinpaprika-sector-evidence.mjs',moduleRoot));
const META_URL='https://api.coinpaprika.com/v1/coins/jup-jupiter-exchange-token';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ready-sector-36745185948.json',import.meta.url)));
const NOW=fixture.provenance.observed_ts; // Received-data projection, not a raw transport replay.
function database(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
async function seed(db,{url=META_URL,received_ts=NOW-1000,expires_ts=NOW+86400000,body=JSON.stringify(fixture.coinpaprika.metadata)}={}){
 const key='REFERENCE:provider-reference-cache-v1-20261004:'+crypto.createHash('sha256').update(url).digest('hex');
 const payload={version:'provider-reference-cache-v1-20261004',url,received_ts,expires_ts,body,body_sha256:crypto.createHash('sha256').update(body).digest('hex')};
 db.sqlite.prepare('INSERT INTO report2_evidence_source_cache VALUES(?,?,?,?,?)').run('COINPAPRIKA_HTX_IDENTITY',key,received_ts,expires_ts,JSON.stringify(payload));return{key,payload};
}
const reader=(db,now=NOW)=>createProviderReferenceReader({db,source:'COINPAPRIKA_SECTOR',run_id:'shared-original-clock',now,daily_cap:48,request_admit:()=>({allowed:false,status:'CAP'}),fetch_impl:()=>{throw Error('NETWORK_FORBIDDEN');}});
test('received exact JUP metadata reuses identity response with shorter age, original hash and no reservation',async()=>{
 const db=database();await installEvidenceSourceStore(db);const {payload}=await seed(db),r=reader(db),m=await r.get('EXACT_COIN_METADATA',META_URL,{ttl_ms:21600000});
 assert.deepEqual(m,fixture.coinpaprika.metadata);assert.equal(verifyCoinpaprikaIdentity(m,{identity:{chain:'solana',contract_or_mint:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'},base:'JUP',coin_id:m.id}),true);
 assert.equal(r.summary().network_calls,0);assert.equal(r.summary().receipts[0].received_ts,payload.received_ts);assert.equal(r.summary().receipts[0].expires_ts,payload.received_ts+21600000);assert.equal(r.summary().receipts[0].cache_owner_source,'COINPAPRIKA_HTX_IDENTITY');assert.equal(r.summary().receipts[0].shared_provider,'COINPAPRIKA');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM report2_evidence_source_reservation').get().n,0);
 assert.equal(db.sqlite.prepare('SELECT payload_json FROM report2_evidence_source_cache').get().payload_json,JSON.stringify(payload));db.sqlite.close();
});
test('longer sibling retention never extends shorter freshness, expired storage or future receipts',async()=>{
 for(const change of [{received_ts:NOW-21600001},{expires_ts:NOW-1},{received_ts:NOW+1}]){const db=database();await installEvidenceSourceStore(db);await seed(db,change);const r=reader(db);assert.equal(await r.get('EXACT_COIN_METADATA',META_URL,{ttl_ms:21600000}),null);assert.equal(r.summary().network_calls,0);assert.equal(r.summary().receipts.length,0);db.sqlite.close();}
});
test('corrupted or wrong-shaped sibling metadata cannot become a reference hit',async()=>{
 for(const kind of ['hash','shape','url']){const db=database();await installEvidenceSourceStore(db);const {key,payload}=await seed(db);if(kind==='hash')payload.body='{}';if(kind==='shape'){payload.body='[]';payload.body_sha256=crypto.createHash('sha256').update(payload.body).digest('hex');}if(kind==='url')payload.url=META_URL+'-other';db.sqlite.prepare('UPDATE report2_evidence_source_cache SET payload_json=? WHERE asset_key=?').run(JSON.stringify(payload),key);const r=reader(db);assert.equal(await r.get('EXACT_COIN_METADATA',META_URL,{ttl_ms:21600000,shape:x=>x&&typeof x==='object'&&!Array.isArray(x)}),null);assert.equal(r.summary().receipts.length,0);db.sqlite.close();}
});
test('quotes, catalogs and query variants never share across source roles; manual bypass remains enforced',async()=>{
 for(const url of ['https://api.coinpaprika.com/v1/tickers?quotes=USD','https://api.coinpaprika.com/v1/exchanges/htx/markets',META_URL+'?quotes=USD']){const db=database();await installEvidenceSourceStore(db);await seed(db,{url});const r=reader(db);assert.equal(await r.get('OTHER',url,{ttl_ms:21600000}),null);db.sqlite.close();}
 const db=database();await installEvidenceSourceStore(db);await seed(db);assert.equal(await reader(db).get('EXACT_COIN_METADATA',META_URL,{ttl_ms:21600000,bypass_cache:true}),null);db.sqlite.close();
});
