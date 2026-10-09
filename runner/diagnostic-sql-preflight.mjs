import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const identifier=x=>typeof x==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(x);
// This compiles read statements against retained native column identities.
// It neither estimates D1 cost nor substitutes a current native schema check.
export function preflightDiagnosticReads({schema,statements}={}){
 if(schema?.schema!=='RETAINED_NATIVE_READ_COLUMNS_V1'||!schema.tables||!Array.isArray(statements)||!statements.length)throw Error('DIAGNOSTIC_READ_SCHEMA_REQUIRED');
 const local=new DatabaseSync(':memory:');
 try{
  for(const [table,columns]of Object.entries(schema.tables)){
   if(!identifier(table)||!Array.isArray(columns)||!columns.length||columns.some(x=>!identifier(x))||new Set(columns).size!==columns.length)throw Error('DIAGNOSTIC_READ_COLUMNS_INVALID');
   local.exec('CREATE TABLE "'+table+'" ('+columns.map(x=>'"'+x+'" TEXT').join(',')+')');
  }
  for(const sql of statements){
   if(typeof sql!=='string'||sql.length>8192||!/^\s*SELECT\b/i.test(sql)||/;|--|\/\*|\b(?:ATTACH|DETACH|PRAGMA|INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)||!/\bLIMIT\s+[1-9][0-9]*\s*$/i.test(sql))throw Error('DIAGNOSTIC_BOUNDED_SELECT_REQUIRED');
   local.prepare(sql);
  }
  return{status:'READ_QUERIES_COMPILED_LOCALLY_FROM_RETAINED_COLUMNS',statements:statements.length,schema_sha256:createHash('sha256').update(JSON.stringify(schema)).digest('hex'),native_current_schema_verified:false,native_query_plan_verified:false,native_cost_estimated:false,sourceHTTP:0,D1:0};
 }finally{local.close();}
}
