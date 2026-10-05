import fs from 'node:fs';
import assert from 'node:assert/strict';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../../runner/d1-preaction-budget-guard.mjs';
import {packHistoryRow,unpackHistoryRow,archivedHeader,exactArchiveSql,createHistoryRestorer,REPOSITORY,HISTORY_HOT_WINDOW_MS,HISTORY_TABLES} from '../../current-generation/files/src/retained-history.mjs';
const token=process.env.GITHUB_TOKEN;if(!token)throw Error('ARCHIVE_GITHUB_TOKEN_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const reservation={rows_read:5000,rows_written:400},reservationId=`RETAINED_HISTORY:${process.env.GITHUB_RUN_ID}:${Date.now()}`;
const request=db._request.bind(db);
db._request=async p=>{
 if(!['first','all','run'].includes(p.op)||!/^\s*(SELECT|PRAGMA (?:page_count|page_size)|INSERT INTO report2_(?:full_evidence|canonical)_archive_v1|INSERT OR IGNORE INTO report2_runner_budget_ledger_shadow|UPDATE report2_runner_budget_ledger_shadow|DELETE FROM (?:full_evidence_shadow_log|canonical_publication_shadow))\b/i.test(p.sql)||db.usageSnapshot().rows_read>4500||db.usageSnapshot().rows_written>360||db.usageSnapshot().unknown_ops||db.usageSnapshot().requests>115)throw Error('ARCHIVE_MIGRATION_BOUND_EXHAUSTED');
 return request(p);
};
const daily=await loadDailyUsageAggregate(db),admission=evaluateDailyReservationBudget({daily,nextReservation:reservation});
if(!admission.allowed)throw Error(`ARCHIVE_D1_DAILY_ADMISSION_${admission.status}`);
await reserveRunBudget(db,{reservationId,reservation});
let error=null;const moved=[];let before=null,after=null,commit=null,archiveHTTP=0;
try{
const databaseBytes=async()=>{const pages=await db.prepare('PRAGMA page_count').first(),size=await db.prepare('PRAGMA page_size').first();return{database_bytes:Number(pages.page_count)*Number(size.page_size)};};
before=await databaseBytes();
const cutoff=Date.now()-HISTORY_HOT_WINDOW_MS,selected=[];
for(const [table,sql] of [
 ['full_evidence_shadow_log','SELECT * FROM full_evidence_shadow_log WHERE observed_ts<?1 ORDER BY observed_ts,full_evidence_id LIMIT 12'],
 ['canonical_publication_shadow',"SELECT * FROM canonical_publication_shadow WHERE observed_ts<?1 AND canonical_state='REJECTED' AND bound_ts IS NULL AND NOT EXISTS (SELECT 1 FROM v3_dispatch_publication_binding_shadow b WHERE b.publication_id=canonical_publication_shadow.publication_id) ORDER BY observed_ts,publication_id LIMIT 12"],
]){
 const rows=(await db.prepare(sql).bind(cutoff).all()).results||[];
 for(const row of rows){
  const raw=JSON.stringify(row);for(const [key,value] of Object.entries(process.env))if(/TOKEN|SECRET|KEY/.test(key)&&value.length>=12&&raw.includes(value))throw Error('ARCHIVE_SECRET_REDACTION_REQUIRED');
  const packed=packHistoryRow(row);assert.deepEqual(unpackHistoryRow(packed.envelope,packed.envelope.raw_sha256),row);selected.push({table,row,...packed});
 }
}
const api=async(method,path,body)=>{
 const r=await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`,{method,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(`ARCHIVE_GITHUB_${method}_${r.status}`);return r.json();
};
commit=(await api('GET','git/ref/heads/report2-retained-history')).object.sha;
if(selected.length){
 const parent=await api('GET',`git/commits/${commit}`),previous=commit;
 const tree=await api('POST','git/trees',{base_tree:parent.tree.sha,tree:selected.map(s=>({path:s.path,mode:'100644',type:'blob',content:JSON.stringify(s.envelope)+'\n'}))});
 commit=(await api('POST','git/commits',{message:'Preserve exact cold report history before conditional relocation',tree:tree.sha,parents:[previous]})).sha;
 if((await api('GET','git/ref/heads/report2-retained-history')).object.sha!==previous)throw Error('ARCHIVE_BRANCH_MOVED');
 await api('PATCH','git/refs/heads/report2-retained-history',{sha:commit,force:false});
}
const restorer=createHistoryRestorer({max_fetches:24});
// Verify every durable public object before any original row is removed.
for(const s of selected){
 const r=await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${s.path}`,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error(`ARCHIVE_PUBLIC_READ_HTTP_${r.status}`);
 assert.deepEqual(unpackHistoryRow(await r.json(),s.envelope.raw_sha256),s.row);
}
for(const s of selected){
 const header=archivedHeader(s.row,{commit,path:s.path,raw_sha256:s.envelope.raw_sha256}),plan=exactArchiveSql(s.table,s.row,header);
 await db.prepare(plan.insert.sql).bind(...plan.insert.params).run();
 const stored=await db.prepare(plan.read.sql).bind(...plan.read.params).first();
 assert.deepEqual(await restorer.restore(stored),s.row);
 const ack=await db.prepare(plan.remove.sql).bind(...plan.remove.params).run();
 if(ack?.meta?.changes!==1)throw Error('ARCHIVE_EXACT_ORIGINAL_DELETE_NOT_CONFIRMED');
 const spec=HISTORY_TABLES[s.table];
 const final=await db.prepare(`SELECT * FROM ${spec.view} WHERE ${spec.key}=?1 LIMIT 1`).bind(s.row[spec.key]).first();
 assert.deepEqual(await restorer.restore(final),s.row);
 moved.push({table:s.table,id:s.row[spec.key],contract:s.row.contract_code,observed_ts:s.row.observed_ts,raw_bytes:s.envelope.raw_bytes,raw_sha256:s.envelope.raw_sha256,path:s.path});
}
after=await databaseBytes();
archiveHTTP=restorer.usage().archive_http+selected.length;
}catch(e){error=String(e.message).slice(0,240);}finally{
 try{await finalizeRunUsage(db,{reservationId,sourceRunId:`RETAINED_HISTORY:${process.env.GITHUB_RUN_ID}`,usage:db.usageSnapshot()});}catch(e){error=error||String(e.message).slice(0,240);}
}
const proof={schema:'report2-verified-retained-history-relocation-v1',status:error?'PARTIAL_RELOCATION_SAFE_HISTORY_RETAINED':'EXACT_ARCHIVE_AND_READTHROUGH_VERIFIED',error,read_at:Date.now(),archive_commit:commit,before,after,moved,usage:db.usageSnapshot(),archive_http:archiveHTTP,sourceHTTP:0,MAIN:0,Telegram:0,hot_window_ms:HISTORY_HOT_WINDOW_MS,history_discarded:false,source_reservations_reset:false,admission,reservationId};
fs.writeFileSync('audit-output/retained-history-relocation.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
if(error)process.exitCode=1;
