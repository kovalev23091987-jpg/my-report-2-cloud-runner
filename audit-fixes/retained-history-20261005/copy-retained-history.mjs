import fs from 'node:fs';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {packHistoryRow,unpackHistoryRow,REPOSITORY,HISTORY_HOT_WINDOW_MS} from '../../current-generation/files/src/retained-history.mjs';
import assert from 'node:assert/strict';
const token=process.env.GITHUB_TOKEN;if(!token)throw Error('ARCHIVE_GITHUB_TOKEN_REQUIRED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const request=db._request.bind(db);
db._request=async p=>{if(!['first','all'].includes(p.op)||!/^\s*SELECT\b/i.test(p.sql)||db.usageSnapshot().rows_read>1400)throw Error('ARCHIVE_COPY_READ_ONLY_GUARD');return request(p);};
const cutoff=Date.now()-HISTORY_HOT_WINDOW_MS;
const selected=[];
for(const [table,sql] of [
 ['full_evidence_shadow_log','SELECT * FROM full_evidence_shadow_log WHERE observed_ts<?1 ORDER BY observed_ts,full_evidence_id LIMIT 1'],
 ['canonical_publication_shadow',"SELECT * FROM canonical_publication_shadow WHERE observed_ts<?1 AND canonical_state='REJECTED' AND bound_ts IS NULL ORDER BY observed_ts,publication_id LIMIT 1"],
]){
 const rows=(await db.prepare(sql).bind(cutoff).all()).results||[];
 for(const row of rows){
  const raw=JSON.stringify(row);
  for(const [key,value] of Object.entries(process.env))if(/TOKEN|SECRET|KEY/.test(key)&&value.length>=12&&raw.includes(value))throw Error('ARCHIVE_SECRET_REDACTION_REQUIRED');
  const packed=packHistoryRow(row);assert.deepEqual(unpackHistoryRow(packed.envelope,packed.envelope.raw_sha256),row);selected.push({table,row,...packed});
 }
}
const api=async(method,path,body,allow404=false)=>{
 const r=await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`,{method,headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
 if(allow404&&r.status===404)return null;
 if(!r.ok)throw Error(`ARCHIVE_GITHUB_${method}_${r.status}`);
 return r.json();
};
const branch='report2-retained-history';
let ref=await api('GET',`git/ref/heads/${branch}`,null,true);
let previous=ref?.object.sha;
if(!previous){
 const tree=await api('POST','git/trees',{tree:[{path:'README.md',mode:'100644',type:'blob',content:'Immutable compressed public report evidence. Original bytes and clocks are verified before any hot-storage relocation.\n'}]});
 const commit=await api('POST','git/commits',{message:'Initialize retained public report evidence archive',tree:tree.sha,parents:[process.env.ARCHIVE_EXPECTED_MAIN]});
 await api('POST','git/refs',{ref:`refs/heads/${branch}`,sha:commit.sha});previous=commit.sha;
}
let commit=previous;
if(selected.length){
 const parent=await api('GET',`git/commits/${previous}`);
 const tree=await api('POST','git/trees',{base_tree:parent.tree.sha,tree:selected.map(s=>({path:s.path,mode:'100644',type:'blob',content:JSON.stringify(s.envelope)+'\n'}))});
 const created=await api('POST','git/commits',{message:'Preserve exact cold public evidence before hot-storage migration',tree:tree.sha,parents:[previous]});
 const fresh=await api('GET',`git/ref/heads/${branch}`);if(fresh.object.sha!==previous)throw Error('ARCHIVE_BRANCH_MOVED');
 await api('PATCH',`git/refs/heads/${branch}`,{sha:created.sha,force:false});commit=created.sha;
 for(const s of selected){
  const r=await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${s.path}`,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error(`ARCHIVE_PUBLIC_READ_HTTP_${r.status}`);
  const envelope=await r.json();assert.deepEqual(unpackHistoryRow(envelope,s.envelope.raw_sha256),s.row);
 }
}
const proof={schema:'report2-retained-public-history-copy-v1',read_at:Date.now(),status:'COPY_VERIFIED_ORIGINAL_DATABASE_UNCHANGED',archive_commit:commit,copied:selected.map(s=>({table:s.table,path:s.path,raw_sha256:s.envelope.raw_sha256,raw_bytes:s.envelope.raw_bytes,contract:s.row.contract_code,observed_ts:s.row.observed_ts})),usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0,database_write:0,original_rows_deleted:0};
fs.writeFileSync('audit-output/retained-history-copy.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
