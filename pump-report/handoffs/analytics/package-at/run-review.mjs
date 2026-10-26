import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

process.umask(0o077);
const out=dirname(fileURLToPath(import.meta.url)),repo=resolve(out,'../../../../');
const frozen='/private/tmp/pump-at-two-originals-1792992423000',pure=resolve(frozen,'pure');
const PIN='e75ecbf4a733202ba0864fae418a1986bce7e484c88420867b0f4976a0f75b8a';
const artifactPath=resolve(repo,'pump-report/.private/native-20261026/pump-receipt65-business-artifact.json');
const ARTIFACT_SHA='04203d493039d1bad3184951e48ddfe95b4d72f8d7c31f812592cfc85bfa979d';
const READER_SHA='b643de03fa3fc0006466b95ad5d6b1572103e21932b395f3a2ad0d6546b3c2c8';
const hash=x=>createHash('sha256').update(x).digest('hex'),jh=x=>hash(JSON.stringify(x));
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const save=async(path,data)=>writeFile(path,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
let readerCalls=0,coreCalls=0;
try{
 const config=JSON.parse(await readFile(resolve(out,'public-confirmations.json'),'utf8'));need(config.length===2,'AT_EXACT_TWO_NEW_ORIGINALS_REQUIRED');
 const artifactBytes=await readFile(artifactPath);need(hash(artifactBytes)===ARTIFACT_SHA,'AT_ARTIFACT_BYTES_MISMATCH');
 const artifact=JSON.parse(artifactBytes),pin=artifact.manifest.implementation_pin,manifest=artifact.manifest.modules;
 need(pin.sha256===PIN&&jh(pin.modules)===PIN&&artifact.manifest.module_count===65&&Object.keys(artifact.modules).length===65,'AT_BUNDLE_PIN_MISMATCH');
 for(const [name,source]of Object.entries(artifact.modules)){
  need(typeof source==='string'&&hash(source)===manifest[name]?.sha256&&Buffer.byteLength(source)===manifest[name]?.bytes,'AT_ARTIFACT_MANIFEST_MODULE_MISMATCH');
  if(name!=='runtime/implementation-pin.mjs')need(hash(source)===pin.modules[name],'AT_PIN_MODULE_HASH_MISMATCH');
 }
 const readerPath=resolve(repo,'pump-report/handoffs/analytics/package-ag/review-launch-capture.mjs');
 need(hash(await readFile(readerPath))===READER_SHA,'AT_ACCEPTED_READER_CHANGED');
 need(hash(await readFile('/private/tmp/pump-e-native-http-forbidden.mjs'))==='7a57d4036d30146735628cb4013f69721fa7cb6794932362f3a2155e36cb6783','AT_HTTP_GUARD_CHANGED');
 const prepared=[];
 for(const c of config){
  const bytes=await readFile(resolve(repo,c.capture_path)),p=c.confirmation;need(hash(bytes)===p.capture_sha256&&bytes.byteLength===p.private_bytes,'AT_CAPTURE_PUBLIC_HASH_MISMATCH');
  const outer=JSON.parse(bytes),body=typeof outer.body==='string'?JSON.parse(outer.body):outer.body,e=body.launch_capture;
  need(outer.http_status===200&&e?.schema==='PUMP_LAUNCH_READINESS_ACTUAL_V1'&&e.analyses?.length===1,'AT_ACTUAL_ENVELOPE_SHAPE_MISMATCH');
  const row=e.analyses[0],o=row.original,a=o.analysis,i=o.input;
  need(i.instrument.base===c.case&&['KIMCHI','APR'].includes(c.case)&&a.mode==='MANUAL'&&a.run_purpose==='PRODUCTION'&&o.evidence_class==='OBSERVED','AT_WRONG_NEW_ORIGINAL');
  need(e.implementation_sha256===PIN&&o.implementation_sha256===PIN&&p.implementation_sha256===PIN,'AT_ORIGINAL_PUBLIC_PIN_MISMATCH');
  need(jh(a)===p.original_analysis_sha256&&jh(i)===p.original_input_sha256&&jh(o)===p.original_sha256&&row.analysis_key==='pump:analysis:'+jh(a),'AT_INDEPENDENT_ORIGINAL_HASH_MISMATCH');
  need(a.ready===false&&a.automatic_eligible===p.automatic_eligible&&JSON.stringify(a.reasons)===JSON.stringify(p.reasons)&&a.card_text===null,'AT_PUBLIC_REFUSAL_MISMATCH');
  need(i.analysis_ts===a.analysis_ts&&o.saved_ts>=a.analysis_ts,'AT_ORIGINAL_CLOCK_MISMATCH');
  const bodies={},responseRows=new Map();
  for(const entry of e.raw_responses??[]){const r=entry.response;if(!r?.receipt_id)continue;need(entry.capture_basis==='BROKER_PARSED_JSON_NOT_WIRE_BYTES','AT_BROKER_BODY_BASIS_MISMATCH');
   const canonical=JSON.stringify(r);need(!Object.hasOwn(bodies,r.receipt_id)||bodies[r.receipt_id]===canonical,'AT_CONFLICTING_RECEIPT_BODY');bodies[r.receipt_id]=canonical;responseRows.set(r.receipt_id,entry);}
  const bindings=[],qualifications={};
  for(const f of Object.values(i.facts).filter(Boolean)){
   const entry=responseRows.get(f.evidence_ref);need(entry&&Object.hasOwn(bodies,f.evidence_ref),'AT_PRIVATE_SOURCE_REFERENCE_MISSING');
   const q={basis:'SAVED_OBSERVED_FACT_AND_BROKER_REQUEST_QUALIFICATION_METADATA_NOT_NEW_VENDOR_PROOF',kind:f.kind,unit:f.unit,
    entry_qualifications:entry.request?.qualifications??null,identity_evidence_ref:f.identity_evidence_ref??null,
    captured_coverage:f.coverage??null,source_module_sha256:pin.modules['sources/index.mjs'],native_semantics_independently_requalified:false};
   const qh=jh(q);qualifications[qh]=q;bindings.push({fact_id:f.fact_id,evidence_ref:f.evidence_ref,fact_sha256:jh(f),body_sha256:hash(bodies[f.evidence_ref]),qualification_sha256:qh});
  }
  prepared.push({case:c.case,public_path:c.public_path,public_git_blob:c.public_git_blob,outer_bytes:bytes.byteLength,outer_hash:hash(bytes),envelope:e,envelope_raw:JSON.stringify(e),o,public:p,bindings,bodies,qualifications});
 }
 const todo=['analytics/index.mjs','profile/start-v1.mjs'],selected=new Map();
 while(todo.length){
  const name=todo.pop();if(selected.has(name))continue;
  need(/^(analytics|contracts|profile)\/[A-Za-z0-9._/-]+\.mjs$/.test(name)&&!name.includes('..'),'AT_NON_PURE_MODULE_REFUSED');
  const source=artifact.modules[name];need(typeof source==='string'&&hash(source)===pin.modules[name]&&hash(source)===manifest[name]?.sha256,'AT_PURE_MODULE_HASH_MISMATCH');
  need(!/\bimport\s*\(|\b(?:fetch|require|eval)\s*\(/.test(source),'AT_DYNAMIC_OR_NATIVE_IMPORT_REFUSED');
  const imports=[...source.matchAll(/(?:import|export)[^\n]*?\bfrom\s*['"]([^'"]+)['"]/g),...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for(const spec of imports){need(spec.startsWith('.'),'AT_BARE_PURE_DEPENDENCY_REFUSED');todo.push(posix.normalize(posix.join(posix.dirname(name),spec)));}
  selected.set(name,{source,sha256:hash(source),bytes:Buffer.byteLength(source),imports});
 }
 let exists=true;try{await access(frozen);}catch{exists=false;}need(!exists,'AT_FROZEN_DIRECTORY_ALREADY_EXISTS');await mkdir(frozen,{mode:0o700});
 for(const [name,m]of selected){const target=resolve(pure,name);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,m.source,{flag:'wx',mode:0o600});need(hash(await readFile(target))===m.sha256,'AT_MATERIALIZED_BYTES_MISMATCH');}
 const materialization={schema:'AT_EXACT65_PURE_MODULE_MATERIALIZATION_V1',artifact_sha256:ARTIFACT_SHA,implementation_sha256:PIN,pin_is_JSON_STRINGIFY_MODULE_MAP_digest:true,all65_manifest_modules_hashes_bytes_verified:true,
  rejected_other65_pin:'5a2c56cf5eb6f3b0fbf32304a146c396adee07e658d34b5cf4c027700f518dac',selected_pure_modules:[...selected].map(([path,m])=>({path,sha256:m.sha256,bytes:m.bytes,imports:m.imports})),pure_snapshot: pure,
  approved_reader_sha256:READER_SHA,runtime_SOURCE_provider_store_delivery_imports:0,native_HTTP_SQL_TG_Worker:0,raw_private_output:false};
 await save(resolve(out,'digest-and-materialization.json'),materialization);
 const {analyzePump}=await import(pathToFileURL(resolve(pure,'analytics/index.mjs')).href),{START_PROFILE}=await import(pathToFileURL(resolve(pure,'profile/start-v1.mjs')).href);
 const {reviewLaunchCapture}=await import(pathToFileURL(readerPath).href),profileHash=jh(START_PROFILE),results=[];
 await save(resolve(out,'execution-start.json'),{schema:'AT_TWO_ACTUAL_REPLAYS_SINGLE_START_V1',intended_cases:['KIMCHI','APR'],intended_reader_calls:2,intended_core_callbacks:2,old_1INCH_or_fixtures_or_suites:0});
 for(const entry of prepared){
  const o=entry.o,a=o.analysis,c={schema:'AG_ROOT_CONFIRMED_CAPTURE_BINDING_V1',envelope_schema:entry.envelope.schema,capture_sha256:hash(entry.envelope_raw),implementation_sha256:PIN,
   profile:START_PROFILE,profile_value_sha256:profileHash,review_ts:Date.now(),originals:[{analysis_key:'pump:analysis:'+entry.public.original_analysis_sha256,analysis_sha256:entry.public.original_analysis_sha256,input_sha256:entry.public.original_input_sha256,original_sha256:entry.public.original_sha256}],source_bindings:entry.bindings,
   source_body_basis:'CANONICAL_JSON_STRINGIFY_OF_ACTUAL_SAVED_BROKER_PARSED_FULL_ENVELOPE_NOT_ORIGINAL_WIRE_BYTES',outer_actual_capture_sha256:entry.outer_hash,artifact_sha256:ARTIFACT_SHA,
   independent_confirmation_source:{public_path:entry.public_path,public_git_blob:entry.public_git_blob},native_semantics_requalified:false};
  const casePrivate=resolve(frozen,entry.case);await mkdir(casePrivate,{mode:0o700});await save(resolve(casePrivate,'confirmation.json'),c);await save(resolve(casePrivate,'canonical-envelope.json'),entry.envelope);await save(resolve(casePrivate,'source-body-bindings.json'),{bodies:entry.bodies,qualifications:entry.qualifications});
  let caseCalls=0,computed=null;readerCalls++;
  const result=await reviewLaunchCapture(entry.envelope_raw,{confirmation:c,recompute:{implementation_sha256:PIN,analyze:(input,profile)=>{
   caseCalls++;coreCalls++;need(caseCalls===1&&coreCalls<=2,'AT_CALLBACK_COUNT_EXCEEDED');need(input.analysis_ts===o.input.analysis_ts&&jh(profile)===profileHash,'AT_CALLBACK_CLOCK_PROFILE_CHANGED');
   computed=analyzePump(input,profile);return computed;}},readSourceBody:async ref=>{need(Object.hasOwn(entry.bodies,ref),'AT_UNKNOWN_PRIVATE_SOURCE_BODY');return entry.bodies[ref];}});
  await save(resolve(out,entry.case+'-review-result.json'),result);
  const equality={full_analysis:computed!==null&&JSON.stringify(computed)===JSON.stringify(a),plan:computed!==null&&JSON.stringify(computed.plan)===JSON.stringify(a.plan),
   reasons:computed!==null&&JSON.stringify(computed.reasons)===JSON.stringify(a.reasons),card_digest:computed!==null&&computed.card_text===a.card_text&&a.card_text===null,
   original_analysis_ts_preserved:computed?.analysis_ts===a.analysis_ts,exact_profile_value_sha256:profileHash};
  const match=result.status==='SUPPLIED_ORIGINALS_MATCHED_ONLY'&&result.rows.length===1&&result.rows[0].status==='MATCHED_NOT_READY_ORIGINAL'&&result.rows[0].factual_recomputation_match===true&&caseCalls===1&&Object.values(equality).every(Boolean);
  const row={case:entry.case,status:match?'MATCHED_REAL_NOT_READY_ORIGINAL':'STOP_CONCRETE_MISMATCH',reader_calls:1,pure_callbacks:caseCalls,original_ready:a.ready,automatic_eligible:computed?.automatic_eligible??null,
   original_reasons:a.reasons,equality,hashes:{outer_capture:entry.outer_hash,canonical_launch_envelope:hash(entry.envelope_raw),analysis:jh(a),input:jh(o.input),original:jh(o),recomputed_analysis:computed?jh(computed):null,plan:computed?jh(computed.plan):null,reasons:computed?jh(computed.reasons):null,card:null},
   card_text_state:'BOTH_NULL_NOT_READY',APR_conservative_plan_minimum_below10:entry.case==='APR'?computed?.plan?.potential_pct?.minimum<10:null,
   source_body_basis:c.source_body_basis,source_bindings:entry.bindings.length,source_bodies_checked:result.usage?.source_bodies??0,source_bytes_checked:result.usage?.source_bytes??0,
   independent_vendor_semantics_or_history_complete:false,native_HTTP_SQL_TG_Worker:0,fixtures_suites_1INCH:0,raw_prices_input_or_plan_levels_exported:false};
  await save(resolve(out,entry.case+'-comparison.json'),row);results.push(row);need(match,'AT_CONCRETE_RECOMPUTATION_MISMATCH_STOP');
 }
 need(readerCalls===2&&coreCalls===2,'AT_EXACT_TWO_CALLBACKS_NOT_COMPLETED');
 const receipt={schema:'AT_EXACT_TWO_ACTUAL_PRODUCTION_REPLAYS_RECEIPT_V1',status:'TWO_NEW_REAL_REFUSALS_FULLY_MATCHED',reader_calls:readerCalls,pure_core_callbacks:coreCalls,
  artifact_sha256:ARTIFACT_SHA,implementation_sha256:PIN,profile_value_sha256:profileHash,cases:results.map(r=>({case:r.case,status:r.status,original_ready:r.original_ready,automatic_eligible:r.automatic_eligible,reasons:r.original_reasons,equality:r.equality})),
  native_HTTP_SQL_TG_Worker:0,fixtures_suites_1INCH_repeated:0,profitability_READY_SENT_all550_proved:false,raw_prices_output:false};
 await save(resolve(out,'execution-receipt.json'),receipt);console.log(JSON.stringify(receipt));
}catch(error){
 const code=typeof error.code==='string'&&/^[A-Z][A-Z0-9_]+$/.test(error.code)?error.code:'AT_LOCAL_PREFLIGHT_OR_REPLAY_FAILED';
 const failure={schema:'AT_TWO_ACTUAL_REPLAY_FAILURE_V1',status:'STOP_NO_RETRY_PENDING_ROOT',code,reader_calls:readerCalls,pure_core_callbacks:coreCalls,native_HTTP_SQL_TG_Worker:0,raw_private_output:false};
 await save(resolve(out,'execution-failure.json'),failure);console.log(JSON.stringify(failure));process.exitCode=2;
}
