import {createHash} from 'node:crypto';
const count=v=>Number.isSafeInteger(v)&&v>=0;
const validClientRequestId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const day=t=>count(t)&&t<=8640000000000000?new Date(t).toISOString().slice(0,10):null;
const safeClock=clock=>{try{const t=clock();return day(t)?t:null;}catch{return null;}};
export function nativeQueryTarget(sql){
 const s=String(sql||'').replace(/\s+/g,' ').trim();
 for(const re of [/\bDELETE\s+FROM\s+["`\[]?([A-Za-z0-9_]+)/i,/\bINSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+["`\[]?([A-Za-z0-9_]+)/i,/\bUPDATE\s+["`\[]?([A-Za-z0-9_]+)/i,/\bFROM\s+["`\[]?([A-Za-z0-9_]+)/i]){const m=s.match(re);if(m)return m[1];}
 return 'OTHER';
}
// Opt-in, metadata only. Recording never issues SQL or exports bound values,
// result bodies, SQL text, credentials or source clocks from those bodies.
export class NativeQueryCostJournal{
 constructor({binding,max_statements=512,clock=Date.now}={}){if(typeof binding!=='string'||!binding||!Number.isInteger(max_statements)||max_statements<1||max_statements>512||typeof clock!=='function')throw Error('BOUNDED_NATIVE_COST_JOURNAL_REQUIRED');this.binding=binding;this.max=max_statements;this.count=0;this.receipts=[];this.clock=clock;this.transports=0;}
 beginTransport(client_request_id=null){if(client_request_id!==null&&!validClientRequestId(client_request_id))throw Error('NATIVE_QUERY_CLIENT_REQUEST_ID_INVALID');return Object.freeze({transport_sequence:++this.transports,transport_started_ts:safeClock(this.clock),...(client_request_id===null?{}:{client_request_id})});}
 endTransport(start){return{transport_sequence:start?.transport_sequence??null,transport_started_ts:start?.transport_started_ts??null,transport_completed_ts:safeClock(this.clock),...(validClientRequestId(start?.client_request_id)?{client_request_id:start.client_request_id}:{})};}
 record({operation,sql,wire_sql=sql,usage,http_status=null,force_unknown=false,transport=null}={}){
  const sequence=++this.count;if(this.receipts.length>=this.max)return;
  const normalized=String(sql||'').replace(/\s+/g,' ').trim(),rr=count(usage?.rows_read)?usage.rows_read:null,rw=count(usage?.rows_written)?usage.rows_written:null;
  const start=transport?.transport_started_ts??null,end=transport?.transport_completed_ts??null,clockClosed=day(start)!==null&&day(end)!==null&&start<=end,utcDay=clockClosed&&day(start)===day(end)?day(start):null;
  this.receipts.push({...(validClientRequestId(transport?.client_request_id)?{client_request_id:transport.client_request_id}:{}),transport_sequence:count(transport?.transport_sequence)&&transport.transport_sequence>0?transport.transport_sequence:null,transport_started_ts:start,transport_completed_ts:end,transport_clock_closed:clockClosed,client_utc_day:utcDay,sequence,binding:this.binding,operation:String(operation||'unknown'),target:nativeQueryTarget(sql),sql_sha256:createHash('sha256').update(normalized).digest('hex'),wire_sql_sha256:createHash('sha256').update(String(wire_sql??'')).digest('hex'),rows_read:rr,rows_written:rw,unknown:force_unknown||usage?.measured!==true||rr===null||rw===null,http_status:Number.isInteger(http_status)?http_status:null,SQL_params_results_exported:false});
 }
 snapshot(){return{schema:'BOUNDED_NATIVE_QUERY_COST_JOURNAL_V1',binding:this.binding,attempted_statements:this.count,recorded_statements:this.receipts.length,max_recorded_statements:this.max,overflow:this.count>this.receipts.length,receipts:this.receipts.map(r=>({...r})),additional_SQL:0,contains_SQL_params_or_results:false,clock_basis:'CLIENT_TRANSPORT_INTERVAL_NOT_SERVER_EXECUTION_OR_SOURCE_CLOCK',wire_sql_hash_basis:'EXACT_CLIENT_SENT_SQL_UTF8_NOT_PROOF_OF_SERVER_REWRITE'};}
}
