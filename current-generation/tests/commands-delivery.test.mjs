import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {commandId,enqueueCommand,claimCommand,completeCommand,savedResultFresh} from '../files/src/durable-command-queue.mjs';
import {buildPublicationDispatch,transitionRelayReceipt,reconcileExpiredDelivery,removalAllowed} from '../files/src/strict-delivery-binding.mjs';
import fs from 'node:fs';
class S{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new S(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class D{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new S(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const result=[];for(const r of rows)result.push(await r.run());this.sqlite.exec('COMMIT');return result;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}}

test('K12: three commands persist before expensive work and duplicate ID is immutable/idempotent',async()=>{
  const db=new D(),base={request_channel:'MANUAL',received_at:1000,deadline:100000,generation:'G'};
  const rows=[['FULL',null],['COIN','SOL-USDT'],['LIQUIDATION_ONLY','SUI-USDT']];for(const [mode,contract] of rows){const id=commandId({...base,mode,contract,request_nonce:mode});await enqueueCommand(db,{...base,command_id:id,mode,contract});await enqueueCommand(db,{...base,command_id:id,mode,contract});}
  assert.equal(db.sqlite.prepare(`SELECT COUNT(*) n FROM report2_command_v2`).get().n,3);
});

test('K12: command completion requires the existing consumer and stale result is not fresh',async()=>{
  const db=new D(),id='CMD:X',base={command_id:id,mode:'COIN',contract:'SOL-USDT',request_channel:'MANUAL',received_at:1000,deadline:100000,generation:'G'};await enqueueCommand(db,base);assert.equal((await claimCommand(db,{command_id:id,actor:'A',now:2000})).claimed,true);
  assert.equal((await completeCommand(db,{command_id:id,actor:'A',snapshot_id:'S',rendered_text:'текст',delivered_to_existing_channel:false})).completed,false);
  assert.equal((await completeCommand(db,{command_id:id,actor:'A',snapshot_id:'S',rendered_text:'текст',delivered_to_existing_channel:true,now:3000})).completed,true);
  assert.equal(savedResultFresh({state:'COMPLETED',updated_at:3000},{now:10000,max_age_ms:1000}),false);
});

test('K11: publication and dispatch share immutable exact IDs and hashes',()=>{
  const binding=buildPublicationDispatch({publication_id:'P',run_id:'R',snapshot_id:'S',wave_id:'W',contract:'SOL-USDT',direction:'LONG',event:'ENTRY',generation:'G',text:'утверждённый текст',recipient_identity:'RECIPIENT'});
  assert.equal(binding.publication.payload_hash,binding.dispatch.payload_hash);assert.equal(binding.dispatch.publication_id,'P');
});

test('K11: success without positive message ID is not SENT and unknown delivery is never blind-retried',()=>{
  const base={state:'CALL_STARTED',attempts:1,payload_hash:'H',recipient_identity:'R'};
  assert.equal(transitionRelayReceipt(base,{type:'TELEGRAM_RESPONSE',ok:true,message_id:null,recipient_identity:'R'}).state,'FAILED_DEFINITE');
  assert.equal(transitionRelayReceipt(base,{type:'TIMEOUT'}).state,'UNKNOWN_DELIVERY');
  assert.deepEqual(reconcileExpiredDelivery({local:{lease_until:1,attempts:1},relay:{state:'CALL_STARTED'},now:2}),{status:'UNKNOWN_DELIVERY',retry:false});
});

test('K11: repeated SENT reuses message ID, payload mismatch conflicts, and only delivered ENTRY may be removed',()=>{
  const sent={state:'SENT',message_id:12,payload_hash:'H',recipient_identity:'R'};
  assert.equal(transitionRelayReceipt(sent,{payload_hash:'H',recipient_identity:'R'}).reused,true);
  assert.equal(transitionRelayReceipt(sent,{payload_hash:'DIFFERENT',recipient_identity:'R'}).state,'CONFLICT');
  assert.equal(removalAllowed({entry_delivery_state:'SENT',veto_active:true}),true);assert.equal(removalAllowed({entry_delivery_state:'FAILED',veto_active:true}),false);
});

test('K12: manual enqueue job is outside analytics concurrency and must succeed before manual analytics',()=>{
  const workflow=fs.readFileSync(new URL('../../.github/workflows/report2.yml',import.meta.url),'utf8'),enqueue=workflow.slice(workflow.indexOf('  enqueue-manual-command:'),workflow.indexOf('  run-report2:')),run=workflow.slice(workflow.indexOf('  run-report2:'));
  assert.doesNotMatch(enqueue,/concurrency:/);assert.match(run,/needs: \[execution-gate, enqueue-manual-command\]/);assert.match(run,/needs\.enqueue-manual-command\.result == 'success'/);
});

test('K12: authoritative runner claims the command and completes liquidation-only after its existing result consumer',()=>{
  const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
  assert.match(runner,/await claimCommand\(env\.DATA_DB/);assert.match(runner,/DURABLE_MANUAL_COMMAND_NOT_CLAIMED/);
  const outputAt=runner.indexOf("console.log('LIQUIDATION_ONLY_RESULT',renderedResult)"),completeAt=runner.indexOf('await completeCommand(env.DATA_DB');
  assert.ok(outputAt>=0&&completeAt>outputAt,'completion must happen only after the existing result consumer');
});

test('K12: full and coin manual commands complete only after the final existing result is emitted',()=>{
  const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8');
  const resultAt=runner.indexOf('console.log(finalRenderedResult)'),completionAt=runner.lastIndexOf('await completeCommand(env.DATA_DB');
  assert.ok(resultAt>=0&&completionAt>resultAt);assert.match(runner,/if\(source!==['"]schedule['"]\)/);
});
