import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const out=dirname(fileURLToPath(import.meta.url)),frozen='/private/tmp/pump-ag-actual-one-frozen-1792969817000';
const PIN='b784243c8865ff1567e84bc4d5be2bb4517eb0776ed8f11383095844af693b5e';
const files={
  envelope:['/private/tmp/pump-ag-actual-envelope.json','35de0e81d44b3468dd6b4ec80d885753cf01070550c247871185818d305f2de2',1306692],
  confirmation:['/private/tmp/pump-ag-root-independent-confirmation.json','9b83f8149eb32068a356c07e9da59f83769d507d63beeb8b92eb26d1c904c13e',5120],
  bodies:['/private/tmp/pump-ag-actual-source-body-bindings.json','864dd1c1adf969dc58431121171fd492f4455e4872b615ffe19118c03ccba3f5',667428],
  artifact:['/private/tmp/pump-production-launch-prepared-artifact.json','796d01a0bbac4adaf6b481f4c2847eb4fc03b0a99b69964d2364f01b3eec984d',null]};
const hash=x=>createHash('sha256').update(x).digest('hex'),jsonHash=x=>hash(JSON.stringify(x));
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
let readerCalls=0,coreCalls=0;
try{
  const bytes={},values={},digests={};
  for(const [name,[path,sha,size]]of Object.entries(files)){
    const raw=await readFile(path);need(hash(raw)===sha&&(size===null||raw.byteLength===size),'AG_PRIVATE_INPUT_DIGEST_MISMATCH');
    bytes[name]=raw;values[name]=JSON.parse(raw.toString('utf8'));digests[name]={sha256:sha,bytes:raw.byteLength};
  }
  const c=values.confirmation,e=values.envelope,map=values.bodies,artifact=values.artifact,pin=artifact.manifest?.implementation_pin;
  need(c.schema==='AG_ROOT_CONFIRMED_CAPTURE_BINDING_V1'&&e.schema==='PUMP_LAUNCH_READINESS_ACTUAL_V1'&&c.envelope_schema===e.schema,'AG_ROOT_ENVELOPE_CONFIRMATION_MISMATCH');
  need(c.capture_sha256===files.envelope[1]&&c.artifact_sha256===files.artifact[1]&&c.implementation_sha256===PIN&&pin?.sha256===PIN,'AG_ROOT_ARTIFACT_PIN_MISMATCH');
  need(c.source_body_basis==='CANONICAL_JSON_STRINGIFY_OF_ACTUAL_SAVED_BROKER_PARSED_FULL_ENVELOPE_NOT_ORIGINAL_WIRE_BYTES','AG_ROOT_BODY_CANONICALIZATION_UNCONFIRMED');
  need(e.analyses.length===1&&c.originals.length===1,'AG_EXPECTED_SINGLE_ACTUAL_ORIGINAL');
  const row=e.analyses[0],o=row.original,expected=c.originals[0];
  need(jsonHash(o)==='983a902ac64d68ef1ddc3d3d7c712ec0ca3f9cdd1619ed38d979f6a4287a3ba1'&&jsonHash(o.analysis)==='761b9688e7445409e8acd9e0f532422f787eb28d7618c25c10d22564096b08ee'&&jsonHash(o.input)==='90f695fdd9d3797483fcc2159882c9f45efbfff6ec7b3352bbabba3e8a827a4d','AG_ROOT_ORIGINAL_DIGEST_MISMATCH');
  need(expected.original_sha256===jsonHash(o)&&expected.analysis_sha256===jsonHash(o.analysis)&&expected.input_sha256===jsonHash(o.input)&&expected.analysis_key===row.analysis_key,'AG_INDEPENDENT_ORIGINAL_BINDING_MISMATCH');
  need(jsonHash(c.profile)===c.profile_value_sha256&&o.implementation_sha256===PIN,'AG_PROFILE_OR_ORIGINAL_PIN_MISMATCH');
  for(const binding of c.source_bindings){
    need(Object.hasOwn(map.bodies,binding.evidence_ref)&&typeof map.bodies[binding.evidence_ref]==='string'&&hash(map.bodies[binding.evidence_ref])===binding.body_sha256,'AG_PRIVATE_BODY_BINDING_MISMATCH');
    need(Object.hasOwn(map.qualifications,binding.qualification_sha256)&&jsonHash(map.qualifications[binding.qualification_sha256])===binding.qualification_sha256,'AG_QUALIFICATION_DIGEST_MISMATCH');
  }
  const readerPath=resolve(out,'../review-launch-capture.mjs');need(hash(await readFile(readerPath))==='b643de03fa3fc0006466b95ad5d6b1572103e21932b395f3a2ad0d6546b3c2c8','AG_PREPARED_READER_BYTES_CHANGED');
  const todo=['analytics/index.mjs','profile/start-v1.mjs'],selected=new Map();
  while(todo.length){
    const name=todo.pop();if(selected.has(name))continue;
    need(/^(analytics|contracts|profile)\/[A-Za-z0-9._/-]+\.mjs$/.test(name)&&!name.includes('..'),'AG_NON_PURE_ARTIFACT_DEPENDENCY');
    const source=artifact.modules[name];need(typeof source==='string'&&hash(source)===pin.modules[name],'AG_PURE_MODULE_DIGEST_MISMATCH');
    need(!/\bimport\s*\(|\bfetch\s*\(|\b(?:require|eval)\s*\(/.test(source),'AG_DYNAMIC_OR_NATIVE_IMPORT_REFUSED');
    const imports=[...source.matchAll(/(?:import|export)[^\n]*?\bfrom\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
    for(const spec of imports){need(spec.startsWith('.'),'AG_BARE_DEPENDENCY_REFUSED');todo.push(posix.normalize(posix.join(posix.dirname(name),spec)));}
    selected.set(name,{source,sha256:hash(source),bytes:Buffer.byteLength(source),imports});
  }
  let exists=true;try{await access(frozen);}catch{exists=false;}need(!exists,'AG_FROZEN_DIRECTORY_ALREADY_EXISTS');
  for(const [name,m]of selected){const target=resolve(frozen,name);await mkdir(dirname(target),{recursive:true});await writeFile(target,m.source,{flag:'wx'});need(hash(await readFile(target))===m.sha256,'AG_MATERIALIZED_BYTES_MISMATCH');}
  const provenance={schema:'AG_ACTUAL_DIGEST_AND_PURE_MATERIALIZATION_V1',exact_private_digests:digests,implementation_sha256:PIN,
    original_hashes:{analysis:jsonHash(o.analysis),input:jsonHash(o.input),original:jsonHash(o)},source_body_basis:c.source_body_basis,
    supplied_analysis_count:1,source_binding_count:c.source_bindings.length,private_body_count:Object.keys(map.bodies).length,
    modules:[...selected].map(([path,m])=>({path,sha256:m.sha256,bytes:m.bytes,imports:m.imports})),
    runtime_SOURCE_store_budget_delivery_imports:0,source_provider_SQL_TG_deploy:0,raw_private_output:false};
  await writeFile(resolve(out,'digest-and-materialization.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
  const {analyzePump}=await import(pathToFileURL(resolve(frozen,'analytics/index.mjs')).href),{START_PROFILE}=await import(pathToFileURL(resolve(frozen,'profile/start-v1.mjs')).href);
  need(jsonHash(START_PROFILE)===c.profile_value_sha256,'AG_EXACT_PROFILE_MODULE_VALUE_MISMATCH');
  const {reviewLaunchCapture}=await import(pathToFileURL(readerPath).href);
  await writeFile(resolve(out,'reader-call-once.json'),JSON.stringify({schema:'AG_ACTUAL_SINGLE_CALL_MARKER_V1',status:'STARTED',capture_sha256:files.envelope[1],implementation_sha256:PIN},null,2)+'\n',{flag:'wx'});
  readerCalls++;
  const result=await reviewLaunchCapture(bytes.envelope.toString('utf8'),{confirmation:c,recompute:{implementation_sha256:PIN,analyze:(input,profile)=>{coreCalls++;need(coreCalls===1,'AG_MORE_THAN_ONE_CORE_CALLBACK_REFUSED');return analyzePump(input,profile);}},
    readSourceBody:async ref=>{need(Object.hasOwn(map.bodies,ref)&&typeof map.bodies[ref]==='string','AG_EXACT_PRIVATE_BODY_REFERENCE_MISSING');return map.bodies[ref];}});
  await writeFile(resolve(out,'review-result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  const matched=result.status==='SUPPLIED_ORIGINALS_MATCHED_ONLY'&&result.rows.length===1&&result.rows[0].status==='MATCHED_NOT_READY_ORIGINAL'&&result.rows[0].factual_recomputation_match===true;
  await writeFile(resolve(out,'execution-receipt.json'),JSON.stringify({schema:'AG_ACTUAL_SINGLE_REVIEW_EXECUTION_V1',status:matched?'MATCHED_ACTUAL_NOT_READY_ORIGINAL':'RESULT_REQUIRES_ROOT_REVIEW',reader_calls:readerCalls,pure_core_callbacks:coreCalls,fixtures_or_tests:0,source_provider_SQL_TG_deploy:0,result_sha256:jsonHash(result),original_ready:result.rows[0]?.original_ready??null,reasons:result.rows[0]?.reasons??result.reasons??[],raw_private_output:false},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:result.status,rows:result.rows.length,row_status:result.rows[0]?.status??null,reasons:result.rows[0]?.reasons??result.reasons??[],reader_calls:readerCalls,pure_core_callbacks:coreCalls,raw_private_output:false}));
  if(!matched)process.exitCode=2;
}catch(error){
  const code=typeof error.code==='string'&&/^[A-Z][A-Z0-9_]+$/.test(error.code)?error.code:'AG_ACTUAL_LOCAL_REVIEW_FAILED';
  const failure={schema:'AG_ACTUAL_SINGLE_REVIEW_FAILURE_V1',status:'REVIEW_FAILED_OR_DEPENDENCY',code,reader_calls:readerCalls,pure_core_callbacks:coreCalls,source_provider_SQL_TG_deploy:0,raw_private_output:false};
  await writeFile(resolve(out,'execution-failure.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(failure));process.exitCode=1;
}
