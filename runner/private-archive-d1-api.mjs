const ACCOUNT='70ee0af85191ea470e74c7383fdec772',DATABASE='f66e7081-0e67-49a2-8f69-68af00cdaf92';
const nonnegative=v=>Number.isSafeInteger(v)&&v>=0;
export class PrivateArchiveD1API {
 constructor({token,fetch_impl=globalThis.fetch,beforeRequest}={}){if(!String(token||'').trim())throw Error('PRIVATE_ARCHIVE_D1_TOKEN_REQUIRED');if(beforeRequest!==undefined&&typeof beforeRequest!=='function')throw Error('PRIVATE_ARCHIVE_BEFORE_REQUEST_CALLBACK_REQUIRED');this.token=String(token).trim();this.fetch_impl=fetch_impl;this.beforeRequest=beforeRequest;this._usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};this.storage_bytes=null;}
 usageSnapshot(){return{...this._usage};}
 async _admit(event){if(this.beforeRequest&&(await this.beforeRequest(event))?.allowed!==true)throw Error('PRIVATE_ARCHIVE_LOCAL_HTTP_ADMISSION_DENIED');}
 async verifyDatabase(){await this._admit({operation:'descriptor',statement_count:0,wire_bytes:0});const r=await this.fetch_impl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}`,{headers:{authorization:'Bearer '+this.token},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('PRIVATE_ARCHIVE_D1_ACCESS_REQUIRED_HTTP_'+r.status);const j=await r.json();if(!j.success||j.result?.uuid!==DATABASE||j.result?.name!=='report2-free-canonical-history')throw Error('PRIVATE_ARCHIVE_DATABASE_BINDING_REQUIRED');return{database_id:DATABASE,name:j.result.name,descriptor_size_is_not_measured_query_size:true};}
 prepare(sql){const db=this;return{args:[],bind(...args){this.args=args;return this;},async first(){return(await db.query(sql,this.args)).results[0]??null;},async all(){return db.query(sql,this.args);},async run(){return db.query(sql,this.args);}};}
 async query(sql,params=[]){
  const text=String(sql).replace(/^\s*--.*$/gm,'').trim(),statements=text.split(';').map(s=>s.trim()).filter(Boolean);
  const allowed=s=>/^SELECT 1(?:\s+AS [a-z_]+)?$/i.test(s)||/^SELECT (?:record_json|COUNT\(\*\) AS [a-z_]+|publication_id,raw_sha256,LENGTH\(CAST\(record_json AS BLOB\)\) AS record_bytes) FROM report2_canonical_cold_archive_v1\b/i.test(s)||/^INSERT INTO report2_canonical_cold_archive_v1\b/i.test(s)||/^CREATE TABLE IF NOT EXISTS report2_canonical_cold_archive_v1\b/i.test(s)||/^CREATE INDEX IF NOT EXISTS report2_canonical_cold_archive_clock_v1\s+ON report2_canonical_cold_archive_v1\b/i.test(s);
  if(!statements.length||statements.some(s=>!allowed(s))||/\b(?:DELETE|UPDATE|DROP|REPLACE|ATTACH|ALTER)\b/i.test(text))throw Error('PRIVATE_ARCHIVE_SQL_ROUTE_REQUIRED');
  const body=JSON.stringify({sql:text,params});
  // A refusal before transport is a known zero SQL attempt. Genuine timeouts
  // below still remain unknown and block the shared native account budget.
  await this._admit({operation:'query',statement_count:statements.length,wire_bytes:new TextEncoder().encode(body).length});
  let response;
  try{response=await this.fetch_impl(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`,{method:'POST',headers:{authorization:'Bearer '+this.token,'content-type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{this._usage.unknown_ops++;throw Error('PRIVATE_ARCHIVE_D1_TRANSPORT_UNMEASURED');}
  if([401,403].includes(response.status))throw Error('PRIVATE_ARCHIVE_D1_QUERY_ACCESS_REQUIRED_HTTP_'+response.status);
  let j;try{j=await response.json();}catch{this._usage.unknown_ops++;throw Error('PRIVATE_ARCHIVE_D1_RESPONSE_UNMEASURED');}
  if(!response.ok||!j.success||!Array.isArray(j.result)||j.result.length!==statements.length){this._usage.unknown_ops++;throw Error('PRIVATE_ARCHIVE_D1_QUERY_NOT_CLOSED');}
  for(const result of j.result){this._usage.requests++;if(result.success!==true||!nonnegative(result.meta?.rows_read)||!nonnegative(result.meta?.rows_written)){this._usage.unknown_ops++;throw Error('PRIVATE_ARCHIVE_D1_USAGE_UNMEASURED');}this._usage.rows_read+=result.meta.rows_read;this._usage.rows_written+=result.meta.rows_written;if(nonnegative(result.meta.size_after))this.storage_bytes=result.meta.size_after;}
  return j.result[j.result.length-1];
 }
}
export function combineMeasuredD1Usage(...usages){
 const result={requests:0,rows_read:0,rows_written:0,unknown_ops:0};for(const usage of usages)for(const key of Object.keys(result)){if(!nonnegative(usage?.[key]))throw Error('COMBINED_D1_USAGE_INVALID');result[key]+=usage[key];}return result;
}
