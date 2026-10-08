import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
const root=process.env.REPORT2_TEST_RUNTIME;
const load=rel=>import(root?pathToFileURL(root+'/src/'+rel):new URL('../files/src/'+rel,import.meta.url));
const tape=await load('htx-signed-tape.mjs'),store=await load('evidence-source-store.mjs');
const {default:actualBridge}=await import('./fixtures/actual-d1-bridge-20261008.mjs');
const T=1791487572939,MIN=60000,contract='TEST1000-USDT',end=Math.floor(T/MIN)*MIN-MIN;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function ring(count){
 const minutes=Array.from({length:240},(_,i)=>{
  const start_ts=end-240*MIN+i*MIN;
  const fills=Array.from({length:count},(_,j)=>({id:String(100000000000000000000n+BigInt(i*count+j)),ts:start_ts+1000+j,side:j%2?'buy':'sell',price:1.1559,contracts:3,quote_usdt:3.4677}));
  return{contract,contract_size:1,start_ts,factual_count:count,source_ts:T,observed_ts:T,fills,raw_sha256:sha(fills)};
 });
 return{version:tape.HTX_SIGNED_TAPE_VERSION,contract,contract_size:1,observed_ts:T,minutes,source:'HTX_OFFICIAL_EXACT_RAW_FILLS',price_quote:'USDT',entry_authorized:false};
}
const input=payload=>({source:'HTX_SIGNED_RAW_TAPE',asset_key:contract,observed_ts:T,expires_ts:T+30*60*MIN,payload});
function boundaryRing(){
 for(let count=20;count<60;count++){const r=ring(count);if(Buffer.byteLength(JSON.stringify(r))<=1500000&&tape.signedTapeStorageWireBytes(r,r)>1500000)return r;}
 throw Error('CONTROLLED_WIRE_BOUNDARY_NOT_REACHED');
}
test('payload below old cap whose exact bridge envelope exceeds cap is losslessly compressed',()=>{
 const r=boundaryRing(),oldBytes=Buffer.byteLength(JSON.stringify(r)),oldWire=tape.signedTapeStorageWireBytes(r,r);
 assert.ok(oldBytes<=1500000);assert.ok(oldWire>1500000);
 const p=tape.encodeSignedTapeStorage(r);assert.equal(p.encoding,'GZIP_BASE64');assert.ok(p.storage_bytes<=1500000);assert.ok(p.wire_bytes<=1500000);
 assert.equal(p.wire_bytes,Buffer.byteLength(JSON.stringify(store.evidenceSourceCacheWriteRequest(input(p.payload)))));
 const decoded=tape.decodeSignedTapeStorage(p.payload);assert.deepEqual(decoded,r);
 assert.deepEqual(tape.signedTapeFourHourFlow({ring:decoded,contract,now:T}),tape.signedTapeFourHourFlow({ring:r,contract,now:T}));
 assert.equal(tape.signedTapeFourHourFlow({ring:decoded,contract,now:T}).check_completed,true);
});
test('wire estimator uses exactly the SQL and parameters sent by cache write',async()=>{
 const r=boundaryRing(),p=tape.encodeSignedTapeStorage(r),expected=store.evidenceSourceCacheWriteRequest(input(p.payload));let writes=0,actual;
 const db={prepare(sql){return{bind(...params){return{async run(){writes++;actual={op:'run',sql,params};if(Buffer.byteLength(JSON.stringify(actual))>1500000)throw Error('D1_BRIDGE_FAILURE:BODY_TOO_LARGE');return{success:true};}};}};}};
 await store.writeEvidenceSourceCache(db,input(p.payload));assert.equal(writes,1);assert.deepEqual(actual,expected);assert.equal(Buffer.byteLength(JSON.stringify(actual)),p.wire_bytes);
});
test('actual deployed bridge rejects old escaped request and accepts unchanged ring through bounded codec',async()=>{
 const r=boundaryRing();let dbCalls=0;
 const env={REPORT2_CLOUD_BRIDGE_TOKEN:'CONTROLLED_ONLY',DATA_DB:{prepare(){return{bind(){return{async run(){dbCalls++;return{success:true,meta:{rows_read:0,rows_written:1}};}};}};}}};
 const request=payload=>new Request('https://controlled.invalid/d1',{method:'POST',headers:{authorization:'Bearer CONTROLLED_ONLY','content-type':'application/json'},body:JSON.stringify(store.evidenceSourceCacheWriteRequest(input(payload)))});
 const rejected=await actualBridge.fetch(request(r),env);assert.equal(rejected.status,500);assert.deepEqual(await rejected.json(),{ok:false,error:'BODY_TOO_LARGE'});assert.equal(dbCalls,0);
 const p=tape.encodeSignedTapeStorage(r),accepted=await actualBridge.fetch(request(p.payload),env);assert.equal(accepted.status,200);assert.equal((await accepted.json()).ok,true);assert.equal(dbCalls,1);assert.deepEqual(tape.decodeSignedTapeStorage(p.payload),r);
 if(process.env.REPORT2_WIRE_BOUND_PROOF)fs.writeFileSync(process.env.REPORT2_WIRE_BOUND_PROOF,JSON.stringify({schema:'ACTUAL_DEPLOYED_BRIDGE_CONTROLLED_WIRE_REPLAY_V1',scope:'CONTROLLED_EXACT_DEPLOYED_BRIDGE_CODE_NOT_HISTORICAL_NEAR_REQUEST',original_clock:T,old_payload_bytes:Buffer.byteLength(JSON.stringify(r)),old_request_bytes:tape.signedTapeStorageWireBytes(r,r),old_bridge_status:rejected.status,old_error:'BODY_TOO_LARGE',new_storage_bytes:p.storage_bytes,new_request_bytes:p.wire_bytes,new_bridge_status:accepted.status,wire_cap:tape.HTX_SIGNED_TAPE_WIRE_CAP,ring_hash:sha(r),decoded_ring_hash:sha(tape.decodeSignedTapeStorage(p.payload)),original_clocks_unchanged:true,all_fills_unchanged:true,sourceHTTP:0,D1:0,Telegram:0,actual_historical_failure_cause_closed:false},null,2)+'\n');
});
test('wire cap accounts for UTF-8 and JSON escaping rather than character count',()=>{
 const r={version:tape.HTX_SIGNED_TAPE_VERSION,contract,observed_ts:T,extra:'🦀"\\'.repeat(230000)};
 const expected=Buffer.byteLength(JSON.stringify(store.evidenceSourceCacheWriteRequest(input(r))));
 assert.equal(tape.signedTapeStorageWireBytes(r,r),expected);assert.ok(expected>1500000);
 const packed=tape.encodeSignedTapeStorage(r);assert.equal(packed.encoding,'GZIP_BASE64');assert.ok(packed.wire_bytes<=1500000);assert.deepEqual(tape.decodeSignedTapeStorage(packed.payload),r);
 assert.equal(tape.signedTapeFourHourFlow({ring:r,contract,now:T}).check_completed,false);
});
test('small valid ring remains JSON and preserves original source clocks and old cap',()=>{
 const r=ring(1),p=tape.encodeSignedTapeStorage(r);assert.equal(p.encoding,'JSON');assert.equal(p.payload,r);assert.equal(p.wire_bytes,store.evidenceSourceCacheWriteWireBytes(input(r)));assert.ok(p.wire_bytes<=tape.HTX_SIGNED_TAPE_WIRE_CAP);
 assert.equal(tape.signedTapeFourHourFlow({ring:r,contract,now:T+10*MIN}).check_completed,false);assert.equal(tape.encodeSignedTapeStorage({contract,observed_ts:T,large:'x'.repeat(8000001)}).payload,null);
});
