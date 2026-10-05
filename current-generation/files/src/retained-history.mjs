import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const RETAINED_HISTORY_SCHEMA='report2-retained-history-v1';
export const REPOSITORY='kovalev23091987-jpg/my-report-2-cloud-runner';
export const HISTORY_TABLES=Object.freeze({
 full_evidence_shadow_log:{key:'full_evidence_id',archive:'report2_full_evidence_archive_v1',view:'report2_full_evidence_retained_v1'},
 canonical_publication_shadow:{key:'publication_id',archive:'report2_canonical_archive_v1',view:'report2_canonical_retained_v1'},
});
const sha=s=>createHash('sha256').update(s).digest('hex');
const name=s=>{if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s))throw Error('HISTORY_IDENTIFIER_INVALID');return `"${s}"`;};
const marker=/^R2ARCHIVE_V1:([a-f0-9]{64}):([a-f0-9]{40}):(history\/\d{4}-\d{2}\/[a-f0-9]{64}\.json):([a-zA-Z_][a-zA-Z0-9_]*)$/;
export function packHistoryRow(row){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('HISTORY_ROW_INVALID');
 const raw=Buffer.from(JSON.stringify(row));
 if(raw.length>2*1024*1024)throw Error('HISTORY_ROW_TOO_LARGE');
 const raw_sha256=sha(raw),month=new Date(Number(row.observed_ts)).toISOString().slice(0,7);
 return {path:`history/${month}/${raw_sha256}.json`,envelope:{schema:RETAINED_HISTORY_SCHEMA,raw_sha256,raw_bytes:raw.length,payload_b64:gzipSync(raw,{level:9}).toString('base64')}};
}
export function unpackHistoryRow(envelope,expected){
 if(envelope?.schema!==RETAINED_HISTORY_SCHEMA||envelope.raw_sha256!==expected||!Number.isSafeInteger(envelope.raw_bytes)||envelope.raw_bytes>2*1024*1024||typeof envelope.payload_b64!=='string'||envelope.payload_b64.length>3*1024*1024)throw Error('HISTORY_ENVELOPE_INVALID');
 const raw=gunzipSync(Buffer.from(envelope.payload_b64,'base64'),{maxOutputLength:2*1024*1024});
 if(raw.length!==envelope.raw_bytes||sha(raw)!==expected)throw Error('HISTORY_DIGEST_MISMATCH');
 const row=JSON.parse(raw.toString('utf8'));
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('HISTORY_ROW_INVALID');
 return row;
}
export function archivedHeader(row,{commit,path,raw_sha256}={}){
 if(!/^[a-f0-9]{40}$/.test(commit)||path!==`history/${new Date(Number(row.observed_ts)).toISOString().slice(0,7)}/${raw_sha256}.json`||sha(Buffer.from(JSON.stringify(row)))!==raw_sha256)throw Error('HISTORY_LOCATOR_INVALID');
 return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='string'&&(k.endsWith('_json')||k==='manual_text'||k==='telegram_text')&&v.length>256?`R2ARCHIVE_V1:${raw_sha256}:${commit}:${path}:${k}`:v]));
}
export function rewriteRetainedSelect(sql){
 if(!/^\s*SELECT\b/i.test(sql))return sql;
 let changed=false,out=sql;
 for(const [table,spec] of Object.entries(HISTORY_TABLES)){
  const re=new RegExp(`\\b(FROM|JOIN)\\s+${table}\\b`,'gi');
  out=out.replace(re,(_,clause)=>{changed=true;return `${clause} ${spec.view}`;});
 }
 if(changed){
  // Archived strings must be restored before parsing; SQL cannot parse the locator as JSON.
  if(/\bjson_\w+\s*\(/i.test(out))throw Error('HISTORY_JSON_SQL_REQUIRES_EXPLICIT_READER');
  out=out.replace(/\s+INDEXED\s+BY\s+[a-zA-Z_][a-zA-Z0-9_]*/gi,'');
 }
 return out;
}
export function createHistoryRestorer({fetch_impl=globalThis.fetch,max_fetches=4,request_admit=null}={}){
 const cache=new Map();let fetches=0;
 const restore=async value=>{
  if(Array.isArray(value))return Promise.all(value.map(restore));
  if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await restore(v)])));
  if(typeof value!=='string'||!value.startsWith('R2ARCHIVE_V1:'))return value;
  const m=value.match(marker);if(!m)throw Error('HISTORY_LOCATOR_INVALID');
  const [,digest,commit,path,column]=m,key=`${commit}:${path}`;
  if(!cache.has(key)){
   if(fetches>=max_fetches)throw Error('HISTORY_FETCH_BUDGET_EXHAUSTED');
   if(request_admit){const grant=request_admit({logical_request_id:`RETAINED_HISTORY:${key}`,lane:'background',attempts:1});if(grant?.allowed!==true||grant.duplicate)throw Error('HISTORY_WHOLE_JOB_HTTP_ADMISSION_REQUIRED');}
   fetches++;
   cache.set(key,(async()=>{const r=await fetch_impl(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/${path}`,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{accept:'application/json'}});if(!r.ok)throw Error(`HISTORY_SOURCE_HTTP_${r.status}`);const body=await r.text();if(Buffer.byteLength(body)>3*1024*1024)throw Error('HISTORY_RESPONSE_TOO_LARGE');return unpackHistoryRow(JSON.parse(body),digest);})());
  }
  const row=await cache.get(key);
  if(!Object.hasOwn(row,column)||typeof row[column]!=='string')throw Error('HISTORY_COLUMN_MISMATCH');
  return row[column];
 };
 return {restore,usage:()=>({archive_http:fetches,cached_rows:cache.size})};
}
export function retainedSchemaSql(table,columns){
 const spec=HISTORY_TABLES[table];if(!spec||!Array.isArray(columns)||!columns.some(c=>c.name===spec.key))throw Error('HISTORY_SCHEMA_INVALID');
 const names=columns.map(c=>c.name),defs=columns.map(c=>`${name(c.name)} ${/^(TEXT|INTEGER|REAL|BLOB|NUMERIC)$/i.test(c.type||'')?c.type:'TEXT'}${c.name===spec.key?' PRIMARY KEY':''}`);
 const qualified=(alias)=>names.map(n=>`${alias}.${name(n)}`).join(',');
 return [
  `CREATE TABLE IF NOT EXISTS ${spec.archive} (${defs.join(',')})`,
  `CREATE INDEX IF NOT EXISTS idx_${spec.archive}_contract_ts ON ${spec.archive}(contract_code,observed_ts)`,
  `CREATE INDEX IF NOT EXISTS idx_${spec.archive}_ts ON ${spec.archive}(observed_ts)`,
  `CREATE VIEW IF NOT EXISTS ${spec.view} AS SELECT ${qualified('h')} FROM ${table} h UNION ALL SELECT ${qualified('a')} FROM ${spec.archive} a WHERE NOT EXISTS (SELECT 1 FROM ${table} h WHERE h.${name(spec.key)}=a.${name(spec.key)})`,
 ];
}
export function exactArchiveSql(table,row,header){
 const spec=HISTORY_TABLES[table],cols=Object.keys(row);
 if(!spec||cols.length>95||JSON.stringify(cols)!==JSON.stringify(Object.keys(header)))throw Error('HISTORY_COLUMN_SET_INVALID');
 return {
  insert:{sql:`INSERT INTO ${spec.archive} (${cols.map(name).join(',')}) VALUES (${cols.map((_,i)=>`?${i+1}`).join(',')}) ON CONFLICT(${name(spec.key)}) DO NOTHING`,params:Object.values(header)},
  read:{sql:`SELECT * FROM ${spec.archive} WHERE ${name(spec.key)}=?1 LIMIT 1`,params:[row[spec.key]]},
  remove:{sql:`DELETE FROM ${table} WHERE ${cols.map((k,i)=>`${name(k)} IS ?${i+1}`).join(' AND ')}`,params:Object.values(row)},
 };
}
