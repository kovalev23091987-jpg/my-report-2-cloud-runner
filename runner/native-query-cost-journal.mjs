import {createHash} from 'node:crypto';
const count=v=>Number.isSafeInteger(v)&&v>=0;
export function nativeQueryTarget(sql){
 const s=String(sql||'').replace(/\s+/g,' ').trim();
 for(const re of [/\bDELETE\s+FROM\s+["`\[]?([A-Za-z0-9_]+)/i,/\bINSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+["`\[]?([A-Za-z0-9_]+)/i,/\bUPDATE\s+["`\[]?([A-Za-z0-9_]+)/i,/\bFROM\s+["`\[]?([A-Za-z0-9_]+)/i]){const m=s.match(re);if(m)return m[1];}
 return 'OTHER';
}
// Opt-in, metadata only. Recording never issues SQL or exports bound values,
// result bodies, SQL text, credentials or source clocks from those bodies.
export class NativeQueryCostJournal{
 constructor({binding,max_statements=512}={}){if(typeof binding!=='string'||!binding||!Number.isInteger(max_statements)||max_statements<1||max_statements>512)throw Error('BOUNDED_NATIVE_COST_JOURNAL_REQUIRED');this.binding=binding;this.max=max_statements;this.count=0;this.receipts=[];}
 record({operation,sql,usage,http_status=null,force_unknown=false}={}){
  const sequence=++this.count;if(this.receipts.length>=this.max)return;
  const normalized=String(sql||'').replace(/\s+/g,' ').trim(),rr=count(usage?.rows_read)?usage.rows_read:null,rw=count(usage?.rows_written)?usage.rows_written:null;
  this.receipts.push({sequence,binding:this.binding,operation:String(operation||'unknown'),target:nativeQueryTarget(sql),sql_sha256:createHash('sha256').update(normalized).digest('hex'),rows_read:rr,rows_written:rw,unknown:force_unknown||usage?.measured!==true||rr===null||rw===null,http_status:Number.isInteger(http_status)?http_status:null,SQL_params_results_exported:false});
 }
 snapshot(){return{schema:'BOUNDED_NATIVE_QUERY_COST_JOURNAL_V1',binding:this.binding,attempted_statements:this.count,recorded_statements:this.receipts.length,max_recorded_statements:this.max,overflow:this.count>this.receipts.length,receipts:this.receipts.map(r=>({...r})),additional_SQL:0,contains_SQL_params_or_results:false};}
}
