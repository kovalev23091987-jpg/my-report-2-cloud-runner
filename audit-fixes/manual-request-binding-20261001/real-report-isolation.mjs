import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const repo=path.resolve('..'),root=process.cwd(),output=path.join(repo,'audit-output');
fs.mkdirSync(output,{recursive:true});
const mod=name=>import(pathToFileURL(path.join(root,name)).href);
const {RemoteD1Database}=await mod('report2-d1-adapter.mjs');
const original=RemoteD1Database.prototype._request;
const remote=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const schema=await remote.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL").all();
const local=new DatabaseSync(':memory:'),tables=new Set();
const isolated=name=>name==='canonical_publication_shadow'||name==='report2_command_v2'||/^v3_(telegram_|user_lifecycle_|dispatch_publication_|pipeline_health)/.test(name);
for(const row of schema.results){try{local.exec(row.sql);tables.add(row.name);}catch(error){if(isolated(row.name))throw error;}}
assert.ok(tables.has('canonical_publication_shadow')&&tables.has('report2_command_v2'),'exact isolation schemas required');
const localOnly=sql=>[...tables].some(name=>isolated(name)&&new RegExp(`\\b${name}\\b`,'i').test(sql));
const args=(sql,params=[])=>{const indexes=[];const query=sql.replace(/\?(\d+)/g,(_,n)=>{indexes.push(Number(n)-1);return '?';});return [query,indexes.length?indexes.map(i=>params[i]):params];};
let isolatedReads=0,isolatedWrites=0,telegramNetworkCalls=0;
function localRequest(db,payload){
 const [sql,parameters]=args(payload.sql,payload.params),stmt=local.prepare(sql);
 let result,read=0,written=0;
 if(payload.op==='first'){const row=stmt.get(...parameters)??null;read=row?1:0;result=payload.column&&row?row[payload.column]:row;}
 else if(payload.op==='all'){const rows=stmt.all(...parameters);read=rows.length;result={results:rows,success:true,meta:{rows_read:read,rows_written:0,changes:0}};}
 else if(payload.op==='raw'){const rows=stmt.all(...parameters);read=rows.length;result=rows.map(Object.values);}
 else {const ack=stmt.run(...parameters);written=Number(ack.changes);result={success:true,meta:{changes:written,rows_read:0,rows_written:written}};}
 isolatedReads+=read;isolatedWrites+=written;
 db._recordSingle(payload.op,payload.sql,{measured:true,rows_read:read,rows_written:written});
 return result;
}
RemoteD1Database.prototype._request=async function(payload){
 if(payload.op==='batch'&&payload.statements.some(s=>localOnly(s.sql))){const results=[];for(const statement of payload.statements)results.push(await this._request({op:'run',...statement}));return results;}
 if(payload.sql&&localOnly(payload.sql))return localRequest(this,payload);
 const result=await original.call(this,payload);
 // Shared research/budget writes keep their actual production ACK. Mirror
 // these factual rows locally so joins with isolated publication rows work.
 for(const p of payload.op==='batch'?payload.statements:[payload])if(/^(?:\s*)(?:INSERT|UPDATE|DELETE)\b/i.test(p.sql||'')){try{const [sql,parameters]=args(p.sql,p.params);local.prepare(sql).run(...parameters);}catch{}}
 return result;
};
const fetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(url.hostname==='api.telegram.org'||/\/telegram(?:-test|-shadow-test)?\/?$/.test(url.pathname)){telegramNetworkCalls++;throw Error('REAL_ACCEPTANCE_TELEGRAM_NETWORK_FORBIDDEN');}return fetch(input,init);};
assert.equal(process.env.DELIVERY_ENABLED,'0');
assert.equal(process.env.REPORT2_V3_TELEGRAM_NETWORK_ENABLED,'0');
assert.equal(process.env.REPORT2_TELEGRAM_OUTPUT_ENABLED,'0');
const {enqueueIdempotentManualRequest}=await mod('src/manual-result-binding.mjs');
const {parseLiquidationCommand}=await mod('src/liquidation-command-router.mjs');
const intent=parseLiquidationCommand(process.env.REPORT2_MANUAL_COMMAND);
const contract=intent.matched?(intent.contract||null):(process.env.REPORT2_MANUAL_COIN_CONTRACT||null);
const mode=intent.matched?'LIQUIDATION_ONLY':contract?'MANUAL_COIN':'FULL_MANUAL';
const received_at=Date.now();
const command=await enqueueIdempotentManualRequest(remote,{request_nonce:`MANUAL_BINDING_ACCEPTANCE:${process.env.GITHUB_RUN_ID}:${mode}`,request_channel:'ISOLATED_CLOUD_ACCEPTANCE',mode,contract,received_at,deadline:received_at+10*60000,generation:process.env.REPORT2_CURRENT_GENERATION});
process.env.REPORT2_COMMAND_ID=command.command_id;
let finishing=false;
process.on('beforeExit',()=>{
 if(finishing)return;finishing=true;
 const reportPath=path.join(root,'report2-run-result.json');
 const report=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):null;
 const row=local.prepare('SELECT * FROM report2_command_v2 WHERE command_id=?').get(command.command_id)??null;
 const binding=report?.manual_request_binding;
 const ready=!process.exitCode&&report&&report.source==='manual'&&report.report_text&&row?.state==='COMPLETED'&&binding?.state==='COMPLETED'&&binding.command_id===row.command_id&&binding.result_run_id===row.result_snapshot_id&&row.result_snapshot_id===report.run_id&&binding.output_sha256===row.rendered_text_hash&&telegramNetworkCalls===0;
 const proof={schema:'report2-live-manual-binding-acceptance-v1',status:ready?'READY_FOR_EXTERNAL_RUN_VERIFICATION':'NOT_CLOSED',
  head:process.env.GITHUB_SHA,requested_mode:mode,requested_contract:contract,command:row,report_status:report?.status??null,report_run_id:report?.run_id??null,
  workflow_run_verification:'PENDING_EXTERNAL_GITHUB_API',isolated_command_queue:true,isolated_publications:true,
  fabricated_source_ack:false,telegram_network_calls:telegramNetworkCalls,telegram_sent:0,production_replaced:false,
  isolated_reads:isolatedReads,isolated_writes:isolatedWrites};
 fs.writeFileSync(path.join(output,'manual-result-request-proof.json'),JSON.stringify(proof,null,2));
 if(report)fs.copyFileSync(reportPath,path.join(output,'manual-report-result.json'));
 console.log('LIVE_MANUAL_RESULT_BINDING_ACCEPTANCE',JSON.stringify({status:proof.status,command_id:row?.command_id,report_status:proof.report_status,report_run_id:proof.report_run_id,telegram_network_calls:telegramNetworkCalls}));
 if(!ready)process.exitCode=process.exitCode||2;
});
