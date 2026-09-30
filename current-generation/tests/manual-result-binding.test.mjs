import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const {enqueueIdempotentManualRequest,bindManualReport,verifyBoundManualReport}=await import(process.env.REPORT2_MANUAL_BINDING_MODULE||new URL('../files/src/manual-result-binding.mjs',import.meta.url).href);
import {claimCommand,completeCommand} from '../files/src/durable-command-queue.mjs';
const NOW=1790803000000,GEN='CURRENT_TEST',SHA='a'.repeat(40);
class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');}
 prepare(raw){const indexes=[];const sql=raw.replace(/\?(\d+)/g,(_,n)=>{indexes.push(+n-1);return '?';});let values=[];
  const parameters=()=>indexes.length?indexes.map(i=>values[i]):values;
  const stmt={bind:(...p)=>{values=p;return stmt;},run:async()=>({success:true,meta:{changes:Number(this.db.prepare(sql).run(...parameters()).changes)}}),first:async()=>this.db.prepare(sql).get(...parameters())??null,all:async()=>({results:this.db.prepare(sql).all(...parameters())})};return stmt;}
}
const request=(nonce,now=NOW)=>({request_nonce:nonce,request_channel:'GITHUB_CONTENTS_TRIGGER',mode:'FULL_MANUAL',contract:null,generation:GEN,received_at:now,deadline:now+1800000});
async function fixture(source='manual',schema='my-report-2-canonical-run-output-v1'){
 const db=new D1(),row=await enqueueIdempotentManualRequest(db,request('ONE'));
 await claimCommand(db,{command_id:row.command_id,actor:'OWNER',now:NOW+1});
 const report={schema,generation:GEN,head:SHA,source,run_id:'RUN:ONE',status:'CLOSED',candidates:[],report_text:'Новых подходящих идей нет.',generated_at:new Date(NOW+1000).toISOString()};
 const completion=await completeCommand(db,{command_id:row.command_id,actor:'OWNER',snapshot_id:report.run_id,rendered_text:JSON.stringify(report),delivered_to_existing_channel:true,now:NOW+1000});
 const command=await db.prepare('SELECT * FROM report2_command_v2 WHERE command_id=?1').bind(row.command_id).first();
 const output=bindManualReport(report,{command:row,completion,workflow_run_id:101,commit_sha:SHA});
 return{db,command_id:row.command_id,generation:GEN,commit_sha:SHA,command,run:{id:101,status:'completed',conclusion:'success',head_sha:SHA},report:output};
}
test('one request retries without extending deadline or creating a duplicate',async()=>{const db=new D1(),a=await enqueueIdempotentManualRequest(db,request('N')),b=await enqueueIdempotentManualRequest(db,request('N',NOW+10000));assert.deepEqual(b,a);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM report2_command_v2').first()).n,1);});
test('concurrent enqueue of the same nonce retains the actual winning receipt',async()=>{const db=new D1();const [a,b]=await Promise.all([enqueueIdempotentManualRequest(db,request('N')),enqueueIdempotentManualRequest(db,request('N',NOW+1000))]);assert.deepEqual(a,b);});
test('two genuine manual commands have different identities',async()=>{const db=new D1(),a=await enqueueIdempotentManualRequest(db,request('N1')),b=await enqueueIdempotentManualRequest(db,request('N2'));assert.notEqual(a.command_id,b.command_id);});
test('same nonce cannot change instrument or generation',async()=>{const db=new D1();await enqueueIdempotentManualRequest(db,request('N'));await assert.rejects(enqueueIdempotentManualRequest(db,{...request('N'),mode:'MANUAL_COIN',contract:'QNT-USDT'}),/IMMUTABLE_CONFLICT/);await assert.rejects(enqueueIdempotentManualRequest(db,{...request('N'),generation:'OLD'}),/IMMUTABLE_CONFLICT/);});
test('successful exact manual result and repeated read return the same text',async()=>{const f=await fixture(),a=verifyBoundManualReport(f);assert.equal(a.ok,true);assert.deepEqual(verifyBoundManualReport(f),a);});
test('scheduled recovery belongs to the original manual command',async()=>{assert.equal(verifyBoundManualReport(await fixture('manual_recovery')).ok,true);});
test('workflow-dispatch and liquidation reports require the same exact binding',async()=>{assert.equal(verifyBoundManualReport(await fixture('workflow_dispatch','my-report-2-liquidation-run-output-v1')).ok,true);});
test('newer scheduled report cannot replace the manual result',async()=>{const f=await fixture();f.report.source='schedule';f.report.generated_at=new Date(NOW+2000).toISOString();assert.equal(verifyBoundManualReport(f).status,'SCHEDULED_REPORT_NOT_MANUAL');});
test('a second manual command cannot receive the first command result',async()=>{const f=await fixture();f.command_id='CMD:SECOND';assert.equal(verifyBoundManualReport(f).ok,false);});
test('successful workflow without completed request is not a completed manual report',async()=>{const f=await fixture();f.command.state='RUNNING';assert.equal(verifyBoundManualReport(f).status,'COMMAND_RUNNING');});
test('failed run cannot display a bound report',async()=>{const f=await fixture();f.run.conclusion='failure';assert.equal(verifyBoundManualReport(f).status,'MANUAL_RUN_NOT_SUCCESSFUL');});
test('wrong run and obsolete commit cannot display a result',async()=>{const f=await fixture();f.run.id=102;assert.equal(verifyBoundManualReport(f).status,'MANUAL_RUN_BINDING_MISMATCH');f.run.id=101;f.commit_sha='b'.repeat(40);assert.equal(verifyBoundManualReport(f).status,'CURRENT_COMMIT_MISMATCH');});
test('edited text cannot pass the completed queue content hash',async()=>{const f=await fixture();f.report.report_text='Другой отчёт.';assert.equal(verifyBoundManualReport(f).status,'MANUAL_REPORT_CONTENT_MISMATCH');});
test('old report cannot become new by copying its binding',async()=>{const f=await fixture();f.report.manual_request_binding.received_at=NOW-100;assert.equal(verifyBoundManualReport(f).status,'MANUAL_REQUEST_RECEIPT_MISMATCH');});
test('binding refuses a false completion digest',()=>{const report={source:'manual',run_id:'R'};assert.throws(()=>bindManualReport(report,{command:{command_id:'C'},completion:{completed:true,status:'COMPLETED',text_hash:'wrong'}}),/HASH_MISMATCH/);});
test('expired request stays expired when the handler is retried',async()=>{const db=new D1(),a=await enqueueIdempotentManualRequest(db,request('N'));await claimCommand(db,{command_id:a.command_id,actor:'A',now:NOW+1900000});const b=await enqueueIdempotentManualRequest(db,request('N',NOW+1900100));assert.equal(b.state,'EXPIRED');assert.equal(b.deadline,a.deadline);});
