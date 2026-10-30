import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'runtime'),out=path.resolve('audit-output/native-anomaly-contract'),prefix='checkpoints/native-anomaly-contract-read-20261021';
const plan=JSON.parse(fs.readFileSync(prefix+'/read-plan.json','utf8')),sha=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});
const targets={},ddl=[];let source;
for(const[relative,expected]of Object.entries(plan.runtime_targets)){
 const b=fs.readFileSync(path.join(root,relative)),h=sha(b);if(h!==expected)throw Error('PINNED_TARGET_CHANGED:'+relative);targets[relative]={bytes:b.length,sha256:h,exact_expected:true};
 if(relative.endsWith('.sql')){if(b.length>plan.limits.DDL_per_file_bytes)throw Error('DDL_EXPORT_BOUND');ddl.push({path:relative,sha256:h,source_DDL_text:b.toString('utf8'),executed:false});}else source=b.toString('utf8');
}
// Static source text only. Private module never imported/evaluated or exported whole.
const functions=[...source.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>({name:m[1],line:source.slice(0,m.index).split('\n').length}));
const exports=[...source.matchAll(/export\s+(?:(?:async\s+)?function|(?:const|let|class))\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
const sql=[],literal=/(\x22|\x27|`)(?:\\[\s\S]|(?!\1)[^\\])*\1/g;let m;
while((m=literal.exec(source))){const raw=m[0].slice(1,-1);if(!/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|WITH)\b/i.test(raw))continue;const b=Buffer.from(raw),r={line:source.slice(0,m.index).split('\n').length,bytes:b.length,sha256:sha(b),interpolated:raw.includes('${')};if(b.length<=plan.limits.SQL_literal_bytes)r.literal_SQL_source=raw;else r.omission='SQL_LITERAL_OVER_BOUND';sql.push(r);}
const rows=[];let omitted=0;
source.split('\n').forEach((line,i)=>{if(!/(?:\.prepare\(|\.batch\(|\.exec\(|transaction|atomic|commit|readback|expected_revision|operation_id|first_known|first_seen|outbox|watch|RETURNING|\.changes\b)/i.test(line))return;const b=Buffer.from(line),r={line:i+1,bytes:b.length,sha256:sha(b)};if(b.length>plan.limits.callsite_line_bytes)r.omission='LINE_OVER_BOUND';else if(/(?:password|secret|authorization|bearer|api[_-]?key)/i.test(line))r.omission='CREDENTIAL_RELATED_SOURCE_LINE';else r.source_line=line;if(rows.length<plan.limits.callsite_rows)rows.push(r);else omitted++;});
const result={schema:plan.schema,status:'READ_ONLY_EXISTING_SOURCE_CONTRACT_EXTRACTED',plan,targets,exported_function_names:exports,declared_function_names:functions,literal_SQL:sql,lexical_writer_transaction_ACK_rows:rows,lexical_rows_omitted:omitted,migration_sources:ddl,limits:'Exact lexical source fragments only, not AST/control-flow or native transaction/CAS/domain ACK proof',private_full_JS_source_exported:false,private_module_imported_or_executed:false,production_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_domain_ACK_qualified:false};
const b=Buffer.from(JSON.stringify(result,null,2)+'\n');if(b.length>plan.limits.whole_contract_JSON_bytes)throw Error('WHOLE_CONTRACT_EXPORT_BOUND');fs.writeFileSync(path.join(out,'existing-store-contract.json'),b);fs.writeFileSync(path.join(out,'contract-receipt.json'),JSON.stringify({status:result.status,bytes:b.length,sha256:sha(b),targets,function_count:functions.length,SQL_literal_count:sql.length,writer_rows:rows.length,omitted,private_full_source_export:false,semantic_executions:0,SQL_provider_MAIN_TG:0},null,2)+'\n');
