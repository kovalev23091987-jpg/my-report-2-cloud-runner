import test from 'node:test';import assert from 'node:assert/strict';
import {createPumpWorker} from '../../runtime/worker.mjs';
import {SUMMARY_INDEX_ACCEPTANCE_ID} from '../../runtime/provider-policy.mjs';
const env={PUMP_CONTROL_KEY:'ARTIFICIAL_TEST_KEY',DATA_DB:{prepare(){throw Error('UNEXPECTED_DATABASE');}}};
const request=(path,body)=>new Request('https://artificial.invalid'+path,{method:'POST',headers:{'x-pump-control-key':env.PUMP_CONTROL_KEY},body:JSON.stringify(body)});
test('summary-only acceptance rejects previous grants and malformed bounds before database or provider IO',async()=>{
 const worker=createPumpWorker();for(const [path,body] of [
 ['/pump/summary',{}],['/pump/summary',{grant_id:'arbitrary',max_records:4}],['/pump/summary',{grant_id:SUMMARY_INDEX_ACCEPTANCE_ID,max_records:40}],['/pump/summary',{grant_id:SUMMARY_INDEX_ACCEPTANCE_ID,max_records:4,extra:true}],
 ['/pump/manual',{symbol:'SOL'}],['/pump/manual-result',{request_id:'old'}],['/pump/run',{}],['/pump/metadata-probe',{grant_id:'pump-bingx-crypto-metadata-signed-20261025-one'}],['/pump/integration-check',{grant_id:'pump-j-integration-sol-20261025-one'}],['/pump/delivery-check',{diagnostic_id:'pump-delivery-qualification-20261025-one'}]]){
 const response=await worker.fetch(request(path,body),env,{});assert.equal(response.status,400);assert.equal((await response.json()).error,'EXACT_SUMMARY_INDEX_ACCEPTANCE_REQUIRED');}
});
test('the one exact summary uses the existing LOOKUP family and deterministic non-rearmable reservation',async()=>{
 const old=Date.now;Date.now=()=>Date.parse('2026-10-25T17:30:00Z');let captured=null;
 try{const worker=createPumpWorker(),database={prepare(sql){assert.ok(sql.includes('report2_runner_budget_ledger_shadow'));return{bind(...args){captured=args;return this;},async all(){throw Error('ARTIFICIAL_STOP_BEFORE_NATIVE_IO');}};}};
 const response=await worker.fetch(request('/pump/summary',{grant_id:SUMMARY_INDEX_ACCEPTANCE_ID,max_records:4}),{...env,DATA_DB:database},{});assert.equal(response.status,503);assert.equal((await response.json()).error,'NATIVE_RESERVATION_ACK_UNKNOWN');assert.equal(captured[0],'PUMP:LOOKUP:'+SUMMARY_INDEX_ACCEPTANCE_ID);assert.equal(captured[2],500);assert.equal(captured[3],30);
 }finally{Date.now=old;}
});
