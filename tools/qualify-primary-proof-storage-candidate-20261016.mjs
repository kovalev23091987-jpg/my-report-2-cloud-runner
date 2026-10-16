// Saved originals only. No fetch, D1 binding, writer, deployment or activation.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {proofSqlContract,encodePrimaryProofCandidate,decodePrimaryProofCandidate} from '../runner/primary-proof-storage-candidate.mjs';
import {loadExecutionReportSource,consumeExecutionReportContext} from '../current-generation/files/src/execution-report-context.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export const SAVED_PROOF_CANDIDATE_INPUTS=Object.freeze([
 {name:'fil',sha256:'ff67ea1eb906d6ed127d2d4fe89b1b63c45938dbd641b53ca9d2f0ff4c58c46b'},
 {name:'zec',sha256:'b9d91ad2f57563fdfcb16b72e5f54166dff6db22ce53ef4b90628fdc290aeca4'},
 {name:'unicode',sha256:'33b3828ef5cedf2322c4316c0a858e196ae970e56142c5b207262ba103ddeced'}
]);
export async function qualifyPrimaryProofStorageCandidate({originals,root=process.cwd()}={}){
 if(!Array.isArray(originals)||originals.length!==3)throw Error('THREE_EXACT_SAVED_ORIGINALS_REQUIRED');
 const triggerPath='current-generation/migrations/011_stage392_post_decision_ack_guard.sql',trigger=fs.readFileSync(path.join(root,triggerPath),'utf8'),contract=proofSqlContract(trigger),records=[];
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'checkpoints/free-storage-20261016/storage-birth-preconditions-401-402.json'),'utf8'));
 const consumer_sources=manifest.files.map(f=>({path:f.path,sha256:sha(fs.readFileSync(path.join(root,f.path))),historical_sha256:f.sha256}));
 for(let i=0;i<originals.length;i++){
  const {raw}=originals[i],expected=SAVED_PROOF_CANDIDATE_INPUTS[i];
  if(typeof raw!=='string'||sha(raw)!==expected.sha256)throw Error('EXACT_SAVED_NATIVE_ROW_HASH_REQUIRED');
  const row=JSON.parse(raw),original=row.stage392_proof_bundle_json,encoded=await encodePrimaryProofCandidate(original,{row,contract}),restored=await decodePrimaryProofCandidate(encoded.stored,{row,contract,expected_raw_sha256:encoded.descriptor.raw_sha256});
  if(restored!==original)throw Error('ORIGINAL_PROOF_BYTES_CHANGED');
  const candidate={...row,stage392_proof_bundle_json:encoded.stored},hydrated={...candidate,stage392_proof_bundle_json:restored};
  if(JSON.stringify(hydrated)!==JSON.stringify(row)||Object.keys(row).length!==43)throw Error('ORIGINAL_ROW_FIELDS_CHANGED');
  const db=new DatabaseSync(':memory:');let expressions=0;
  try{
   const names=Object.keys(row);db.exec('CREATE TABLE full_evidence_shadow_log('+names.map(k=>'"'+k+'" '+(typeof row[k]==='number'?'NUMERIC':'TEXT')).join(',')+')');for(const part of trigger.split('-- report2:statement-break'))db.exec(part);
   const insert=db.prepare('INSERT INTO full_evidence_shadow_log('+names.map(k=>'"'+k+'"').join(',')+') VALUES('+names.map(()=>'?').join(',')+')');
   for(const data of [row,candidate])insert.run(...names.map(k=>data[k]));
   for(const r of contract.requests){const q=db.prepare(`SELECT json_${r.operation}(?1,?2) AS v`);if(JSON.stringify(q.get(original,r.path))!==JSON.stringify(q.get(encoded.stored,r.path)))throw Error('NATIVE_SQL_PROJECTION_CHANGED');expressions++;}
  }finally{db.close();}
  const bundle=JSON.parse(original),run_id='SAVED_PRIMARY_PROOF_CANDIDATE',identity={contract:row.contract_code,run_id,snapshot_id:bundle.snapshot_id,observed_ts:row.observed_ts},requests=[];
  const source=async r=>loadExecutionReportSource({prepare(sql){return{bind(...args){requests.push({sql,args});return this;},async all(){return {results:[r]};}};}},{...identity,canonical:identity},run_id);
  const controlSource=await source(row),hydratedSource=await source(hydrated);
  if(JSON.stringify(controlSource)!==JSON.stringify(hydratedSource)||JSON.stringify(requests[0])!==JSON.stringify(requests[1]))throw Error('CURRENT_EXECUTION_READER_CHANGED');
  const context=s=>consumeExecutionReportContext({...identity,canonical:identity,execution_context_source:s},run_id);
  if(JSON.stringify(context(controlSource))!==JSON.stringify(context(hydratedSource)))throw Error('CURRENT_EXECUTION_CONTEXT_CHANGED');
  records.push({contract_code:row.contract_code,full_evidence_id:row.full_evidence_id,observed_ts:row.observed_ts,native_original_raw_sha256:expected.sha256,original_archive_commit:'b311167b34dc33874c135932997af8bfc12ac83a',original_archive_path:'history/2026-10/'+expected.sha256+'.json',native_row_columns:43,original_row_json_bytes:Buffer.byteLength(raw),candidate_row_json_bytes:Buffer.byteLength(JSON.stringify(candidate)),original_proof_bytes:encoded.raw_bytes,candidate_proof_bytes:encoded.stored_bytes,raw_proof_sha256:encoded.descriptor.raw_sha256,restored_proof_bytes_exact:true,all_other_column_values_and_types_exact:true,declared_SQL_expressions_verified:expressions,unchanged_SQLite_INSERT_guard_passed:true,current_execution_reader_same_SQL_params_output:true,execution_context_status:context(controlSource).status,execution_fact_count:context(controlSource).facts.length});
 }
 return{schema:'SAVED_NATIVE_PRIMARY_PROOF_CANDIDATE_QUALIFICATION_V1',status:'OFFLINE_BYTES_SQL_GUARD_AND_EXISTING_READER_REPLAY_ONLY',candidate_source_hashes:['runner/primary-proof-storage-candidate.mjs','tools/qualify-primary-proof-storage-candidate-20261016.mjs'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(root,p)))})),trigger:{path:triggerPath,sha256:sha(trigger),occurrences:contract.occurrences,distinct_expressions:contract.requests.length,native_trigger_presence_rechecked:false},declared_consumer_sources:consumer_sources,records,totals:records.reduce((a,r)=>({original_row_bytes:a.original_row_bytes+r.original_row_json_bytes,candidate_row_bytes:a.candidate_row_bytes+r.candidate_row_json_bytes,original_proof_bytes:a.original_proof_bytes+r.original_proof_bytes,candidate_proof_bytes:a.candidate_proof_bytes+r.candidate_proof_bytes}),{original_row_bytes:0,candidate_row_bytes:0,original_proof_bytes:0,candidate_proof_bytes:0}),sample_is_not_database_inventory_or_inflow_bound:true,raw_proof_bodies_exported:false,production_SQL:0,sourceHTTP:0,MAIN:0,Telegram:0,production_imports_added:false,new_primary_format_enabled:false,activation_authorized:false,physical_bytes_freed:0,native_cost_or_storage_layout_qualified:false,all_declared_consumers_qualified_for_activation:false,full_day_closed:false,nominal_row_deficit_solved:false,remaining:['Qualify exact installed native schema/trigger and every live caller/import/row-export path, not just declared source inventory.','Integrate explicit decoding before semantic consumption and bind full exact digest/readback before causal persistence acknowledgment. Current producer still acknowledges one native INSERT, so this candidate cannot be switched on.','Qualify Worker compression/decompression CPU, wire/heap/size limits, native insert/query cost and full natural/manual/LIQ output; no native saving follows from SQLite.','Stage392 proof compression preserves data but does not solve96nominal/day versus144scheduled/188manual or prove sustainable byte growth.','No current hot/ENTRY/latest row is replaced; no writer/rotation/cap changes permitted by this candidate.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const dir=process.env.REPORT2_SAVED_PROOF_ORIGINAL_DIR;if(!dir)throw Error('EXPLICIT_SAVED_ORIGINAL_DIRECTORY_REQUIRED');
 const originals=SAVED_PROOF_CANDIDATE_INPUTS.map(r=>({raw:fs.readFileSync(path.join(dir,'report2-native-row-'+r.name+'.json'),'utf8')}));
 const result=await qualifyPrimaryProofStorageCandidate({originals}),output=path.resolve(process.env.REPORT2_PROOF_CANDIDATE_OUTPUT||'audit-output/primary-proof-candidate/saved-native-proof-candidate.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,originals:result.records.length,totals:result.totals,new_primary_format_enabled:false,production_SQL:0,sourceHTTP:0,physical_bytes_freed:0}));
}
