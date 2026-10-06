import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_TEST_RUNTIME;
const load=rel=>import(root?pathToFileURL(root+'/src/'+rel):new URL('../files/src/'+rel,import.meta.url));
const tape=await load('htx-signed-tape.mjs');
const {buildHtxFuturesFlowPrimary}=await load('candidate-evidence-v2-runtime.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const T=1791289828910,MIN=60000,contract='TEST1000-USDT',end=Math.floor(T/MIN)*MIN-MIN;
// Controlled large transport at the original FIL diagnosis clock. These are
// test fills, never claimed as the lost actual FIL tape or a fresh signal.
function snapshot(count=60){
 const data=Array.from({length:240},(_,i)=>Array.from({length:count},(_,j)=>({id:String(100000000000000000000n+BigInt(i*count+j)),ts:end-240*MIN+i*MIN+1000+j,direction:j%2?'buy':'sell',price:1.1559,amount:3,trade_turnover:3.4677}))).flat();
 return{metadata:{observed_ts:T,payload:{status:'ok',ts:T,data:[{contract_code:contract,contract_status:1,business_type:'swap',trade_partition:'USDT',contract_size:1}]}},trades:{observed_ts:T,payload:{status:'ok',ts:T,ch:`market.${contract}.trade.detail`,data:[{data}]}},minutes:{observed_ts:T,payload:{status:'ok',ts:T,ch:`market.${contract}.kline.1min`,data:Array.from({length:240},(_,i)=>({id:(end-240*MIN+i*MIN)/1000,count}))}}};
}
class Statement{constructor(db,sql,args=[]){Object.assign(this,{db,sql,args});}bind(...args){return new Statement(this.db,this.sql,args);}async run(){this.db.writes++;return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){this.db.reads++;return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');this.reads=0;this.writes=0;}prepare(sql){return new Statement(this,sql);}async batch(rows){return Promise.all(rows.map(s=>s.run()));}}
function capture(s){tape.clearHtxSignedTapeSnapshots();for(const [k,url] of [['metadata','/linear-swap-api/v1/swap_contract_info'],['trades','/linear-swap-ex/market/history/trade'],['minutes','/linear-swap-ex/market/history/kline']])tape.observeHtxSignedTape(s[k].payload,'https://api.hbdm.com'+url+'?contract_code='+contract+'&period=1min',T);}
test('large complete raw transport survives durable bound and reaches exact N05 with unchanged fills and clocks',async()=>{
 const s=snapshot(),a=tape.verifiedSignedMinutes({snapshot:s,contract,now:T});assert.equal(a.minutes.length,240);
 const merged=tape.mergeSignedTape({acquisition:a,now:T});assert.ok(Buffer.byteLength(JSON.stringify(merged.ring))>1500000);assert.equal(merged.storage.encoding,'GZIP_BASE64');assert.ok(merged.storage.storage_bytes<=1500000);
 assert.equal(hash(tape.decodeSignedTapeStorage(merged.storage.payload)),hash(merged.ring));
 capture(s);const db=new DB(),result=await tape.persistCapturedHtxSignedTape({db,contract,now:T,db_admit:e=>{assert.deepEqual(e,{rows_read:16,rows_written:4});return{allowed:true};}});
 assert.equal(result.persisted_minutes,240);assert.equal(result.storage_encoding,'GZIP_BASE64');assert.equal(result.network_calls,0);assert.equal(result.evidence.length,0);assert.ok(result.storage_bytes<=1500000);
 const stored=JSON.parse(db.sqlite.prepare('SELECT payload_json FROM report2_evidence_source_cache').get().payload_json);assert.deepEqual(tape.decodeSignedTapeStorage(stored).minutes,a.minutes);
 const flow=buildHtxFuturesFlowPrimary({contract,now:T});assert.equal(flow.check_completed,true);assert.equal(flow.evidence[0].verified_minutes,240);assert.equal(flow.evidence[0].raw_trade_count,14400);assert.equal(flow.evidence[0].score_contribution,0);assert.equal(flow.evidence[0].entry_authorized,false);assert.equal(consumeBlockResultContext({evidence:flow.evidence,contract,now:T}).facts.length,1);
 tape.clearHtxSignedTapeSnapshots();const before=db.reads;await tape.readSavedHtxSignedTape({db,contract,now:T,db_admit:()=>({allowed:true})});assert.equal(db.reads,before+1);assert.deepEqual(buildHtxFuturesFlowPrimary({contract,now:T}).evidence,flow.evidence);
});
test('retained actual saved ring keeps its original exact N05 evidence under the storage codec',()=>{
 const fixture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/actual-niulai-signed-cache-20261006.json.gz',import.meta.url))));
 const encoded=tape.encodeSignedTapeStorage(fixture.ring),decoded=tape.decodeSignedTapeStorage(encoded.payload);
 assert.deepEqual(decoded,fixture.ring);assert.deepEqual(tape.signedTapeFourHourFlow({ring:decoded,contract:decoded.contract,now:fixture.original_decision_ts}),tape.signedTapeFourHourFlow({ring:fixture.ring,contract:fixture.ring.contract,now:fixture.original_decision_ts}));
});
test('corrupt compressed bytes, hashes, identity, lengths and oversized inflation never become a ring',()=>{
 const ring=tape.mergeSignedTape({acquisition:tape.verifiedSignedMinutes({snapshot:snapshot(),contract,now:T}),now:T}).ring,packed=tape.encodeSignedTapeStorage(ring).payload;
 for(const change of [p=>p.data='invalid!',p=>p.sha256='0'.repeat(64),p=>p.contract='FOREIGN-USDT',p=>p.uncompressed_bytes++,p=>p.encoding='OTHER',p=>p.uncompressed_bytes=8000001]){const p=structuredClone(packed);change(p);assert.equal(tape.decodeSignedTapeStorage(p),null);}
 const bomb={...packed,data:gzipSync(Buffer.alloc(8000001)).toString('base64')};assert.equal(tape.decodeSignedTapeStorage(bomb),null);
});
test('storage success does not close incomplete, stale, future, conflicting or corrupt original minute data',()=>{
 const a=tape.verifiedSignedMinutes({snapshot:snapshot(),contract,now:T}),ring=tape.mergeSignedTape({acquisition:a,now:T}).ring;
 for(const change of [r=>r.minutes.splice(-2,1),r=>r.minutes.at(-1).source_ts=T+1,r=>r.minutes.at(-1).raw_sha256='0'.repeat(64),r=>r.contract='FOREIGN-USDT']){const r=structuredClone(ring);change(r);const decoded=tape.decodeSignedTapeStorage(tape.encodeSignedTapeStorage(r).payload);assert.equal(tape.signedTapeFourHourFlow({ring:decoded,contract,now:T}).check_completed,false);}
 assert.equal(tape.signedTapeFourHourFlow({ring:tape.decodeSignedTapeStorage(tape.encodeSignedTapeStorage(ring).payload),contract,now:T+10*MIN}).check_completed,false);
 const changed=structuredClone(a);changed.minutes[0].fills[0].contracts=4;changed.minutes[0].fills[0].quote_usdt=changed.minutes[0].fills[0].price*4;changed.minutes[0].raw_sha256=hash(changed.minutes[0].fills);assert.equal(tape.mergeSignedTape({previous:ring,acquisition:changed,now:T}).status,'CONFLICTING_COMPLETE_RAW_MINUTE');
});
test('DB denial still prevents persistence and codec does not raise the physical storage cap',async()=>{
 capture(snapshot());const db=new DB();assert.equal((await tape.persistCapturedHtxSignedTape({db,contract,now:T,db_admit:()=>({allowed:false,status:'NO_HEADROOM'})})).status,'NO_HEADROOM');assert.equal(db.writes,0);
 assert.equal(tape.encodeSignedTapeStorage({contract,large:'x'.repeat(8000001)}).status,'RAW_TAPE_STORAGE_BOUND_REACHED');
});
