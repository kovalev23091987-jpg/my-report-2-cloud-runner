// Prepared ONLY: no imports, test registration, or semantic execution at top level.
export async function runUnresolvedCatalogCarrierConnected({runtime_root,baseline_runtime_root,repo_root}){
 const fs=(await import('node:fs')).default,path=(await import('node:path')).default;
 const {createHash}=await import('node:crypto'),{pathToFileURL}=await import('node:url'),{default:assert}=await import('node:assert/strict');
 const hash=x=>createHash('sha256').update(x).digest('hex'),bytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 const emitted=x=>JSON.stringify(x,null,2).replace(/\n/g,'\n      '),emittedBytes=x=>Buffer.byteLength(emitted(x),'utf8');
 const folder=path.join(repo_root,'checkpoints/source-worker-unresolved-catalog-carrier-20261021');
 const pins=JSON.parse(fs.readFileSync(path.join(folder,'target-bindings.json'),'utf8'));
 const next=fs.realpathSync(runtime_root),old=fs.realpathSync(baseline_runtime_root);
 assert.notEqual(next,old);assert.equal(path.basename(next),'src');assert.equal(path.basename(old),'src');
 const files=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)).map(n=>path.join(e.name,n)):[e.name]).sort();
 const names=files(next);assert.deepEqual(files(old),names,'FULL actual assembled immutable baseline required');
 for(const name of names)assert.equal(hash(fs.readFileSync(path.join(old,name))),name===pins.runtime_helper?pins.before_sha256:hash(fs.readFileSync(path.join(next,name))),name);
 assert.equal(hash(fs.readFileSync(path.join(next,pins.runtime_helper))),pins.after_sha256);
 const runner=fs.readFileSync(path.join(next,'..',pins.runner_parent_file),'utf8');
 assert.equal(hash(runner),pins.runner_sha256);assert.equal(hash(fs.readFileSync(path.join(old,'..',pins.runner_parent_file))),pins.runner_sha256);
 const begin=runner.indexOf('  if (cron.status !== "SUCCESS" || cron.completed_ts == null)'),end=runner.indexOf('  console.log("CRON_IDENTITY_BINDING"',begin);
 const fatalStart='main().catch(async(error) => {',fatal=runner.indexOf(fatalStart),fatalEnd=runner.lastIndexOf('\n});');
 assert(begin>0&&end>begin&&fatal>0&&fatalEnd>fatal);
 const partialBody=runner.slice(begin,end),fatalBody=runner.slice(fatal+fatalStart.length,fatalEnd);
 assert.equal(hash(partialBody),pins.runner_partial_guard_sha256);assert.equal(hash(fatalBody),pins.runner_fatal_body_sha256);
 const controls=[],originalFetch=globalThis.fetch;let attemptedNetwork=0;
 globalThis.fetch=()=>{attemptedNetwork++;throw Error('CONTROLLED_NETWORK_FORBIDDEN');};
 try{
  // All helper/full-baseline/actual-runner pins precede runtime imports/evaluation.
  const candidate=await import(pathToFileURL(path.join(next,pins.runtime_helper)).href),baseline=await import(pathToFileURL(path.join(old,pins.runtime_helper)).href);
  const partial=new Function('cron','generation','process','env','d1DayAdmission',partialBody);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const fatalExporter=new AsyncFunction('error','canonicalOutputForFailure','fs','markPostAnalysisControlFailure','process','console','cleanupClaimedAnalyticsLease','failedD1RunAccounting',fatalBody);
  const copy=x=>structuredClone(x),NOW=1792570324097,received=NOW+628,source=NOW+302,url='https://api.hbdm.com/linear-swap-api/v1/swap_contract_info';
  const missing=['BTR-USDT','DOS-USDT','GPS-USDT','PIPPIN-USDT','SKR-USDT','UB-USDT'],missingSet=new Set(missing);
  const approved=candidate.APPROVED_HTX_ANALYSIS_CONTRACTS;
  assert.equal(approved.length,105);assert(missing.every(c=>approved.some(r=>r.contract_code===c)));
  const row=(r,status=1)=>({contract_code:r.contract_code,symbol:r.asset_symbol,contract_status:status,business_type:'swap',contract_type:'swap',trade_partition:'USDT',labels:[],tradfi_labels:[],public_controlled_note:'CONTROLLED_NOT_NATIVE'});
  const full=approved.map(r=>({...row(r),instrument_scope:{classification:'CRYPTO_CONFIRMED'}})),rows=full.filter(r=>!missingSet.has(r.contract_code));
  const native=(items=rows.map(r=>row({contract_code:r.contract_code,asset_symbol:r.symbol})))=>({ok:true,http_status:200,url,observed_ts:received,data:{status:'ok',ts:source,data:copy(items),public_extra:{kind:'NEW_CONTROLLED_PARSED_PAYLOAD',unicode:'котировка ≠ wire'}}});
  const classifier=()=>({classification:'CRYPTO_CONFIRMED'});
  const invoke=(input=rows,n=native(),diagnostic=true)=>{
   let oldCalls=0,newCalls=0;
   const before=baseline.bindApprovedHtxAnalysisScope(input,{observed_ts:NOW,include_native_availability_diagnostic:diagnostic,native_catalog:{...n,classify:r=>{oldCalls++;return classifier(r);}}});
   const after=candidate.bindApprovedHtxAnalysisScope(input,{observed_ts:NOW,include_native_availability_diagnostic:diagnostic,native_catalog:{...n,classify:r=>{newCalls++;return classifier(r);}}});
   const {native_catalog_parsed_snapshot,...audit}=after.audit;
   assert.deepEqual({contracts:after.contracts,audit},before,'all old outputs/refusal/trace unchanged');assert.equal(oldCalls,newCalls);
   assert.equal(candidate.approvedHtxScopeAccounted(after.audit),baseline.approvedHtxScopeAccounted(before.audit));
   if(native_catalog_parsed_snapshot)assert(emittedBytes(native_catalog_parsed_snapshot)<=pins.public_parsed_snapshot_max_utf8_bytes);
   if(after.audit.native_availability_diagnostic)assert(bytes(after.audit.native_availability_diagnostic)<=pins.existing_diagnostic_max_utf8_bytes);
   return{before,after,snapshot:native_catalog_parsed_snapshot,classifier_calls:newCalls};
  };
  const summarize=x=>({scope_status:x.after.audit.status,accepted:x.after.audit.accepted_analysis_contracts,checked:x.after.audit.checked_analysis_contracts,unresolved:x.after.audit.unresolved_approved_analysis_contracts,classifier_calls:x.classifier_calls,snapshot:x.snapshot?{status:x.snapshot.status,complete:x.snapshot.complete,emitted_utf8_bytes:emittedBytes(x.snapshot),parsed_payload_utf8_bytes:x.snapshot.parsed_payload_utf8_bytes,rows:x.snapshot.parsed_payload?.data?.length??null,parsed_payload_sha256:x.snapshot.parsed_payload?hash(JSON.stringify(x.snapshot.parsed_payload)):null,omission_reason:x.snapshot.omission_reason,attempted_snapshot_utf8_bytes:x.snapshot.attempted_snapshot_utf8_bytes??null}:null});
  const group=async(name,fn)=>controls.push({name,classification:'NEW_CONTROLLED_CATALOG_CARRIER_AND_EXISTING_FAILURE_EXPORTER',detail:await fn()});
  let retained,boundaryRetained;
  await group('99 accepted and six absent retain complete detached parsed public payload',async()=>{
   const n=native(),before=JSON.stringify({rows,n});Object.freeze(n.data.data);Object.freeze(n.data);Object.freeze(n);
   const x=invoke(rows,n);assert.equal(x.after.audit.status,'NOT_CLOSED');assert.deepEqual(x.after.audit.unresolved_approved_analysis_contracts,missing);
   assert.equal(x.snapshot.complete,true);assert.equal(x.snapshot.status,'COMPLETE_PARSED_PUBLIC_CATALOG');assert.deepEqual(x.snapshot.parsed_payload,n.data);assert.notEqual(x.snapshot.parsed_payload,n.data);assert.notEqual(x.snapshot.parsed_payload.data,n.data.data);
   assert.equal(x.snapshot.evaluation_ts,NOW);assert.equal(x.snapshot.catalog_observed_ts,received);assert.equal(x.snapshot.catalog_source_ts,source);assert.equal(x.snapshot.original_body_completion_ts,null);assert.equal(x.snapshot.raw_body_sha256,null);
   assert.equal(JSON.stringify({rows,n}),before);retained=x;return summarize(x);
  });
  await group('aliases and extra public metadata remain visible without changing exact-key refusal',async()=>{
   const n=native();for(const contract of missing)n.data.data.push({...row(approved.find(r=>r.contract_code===contract),3),contract_code:contract.toLowerCase()+' ',other_public_field:{aliases:[contract],typed_status:'3'}});
   const x=invoke(rows,n);assert.deepEqual(x.after.audit.unresolved_approved_analysis_contracts,missing);assert.equal(x.after.audit.officially_unavailable_analysis_contracts.length,0);assert.deepEqual(x.snapshot.parsed_payload,n.data);assert.equal(x.snapshot.parsed_payload.data.length,105);assert.equal(x.after.audit.native_availability_diagnostic.records.every(r=>r.native_catalog_match_count===0),true);return summarize(x);
  });
  await group('six explicit status3 rows keep the successful old shape',async()=>{
   const n=native();for(const contract of missing)n.data.data.push(row(approved.find(r=>r.contract_code===contract),3));const x=invoke(rows,n);assert.equal(x.after.audit.status,'CLOSED');assert.equal(x.after.audit.checked_analysis_contracts,105);assert.equal(x.after.audit.officially_unavailable_analysis_contracts.length,6);assert.equal(x.snapshot,undefined);return summarize(x);
  });
  await group('105 market rows retain old complete shape even with irrelevant missing catalog',async()=>{const x=invoke(full,{ok:false,data:null});assert.equal(x.after.audit.status,'CLOSED');assert.equal(x.snapshot,undefined);return summarize(x);});
  await group('legacy diagnostic optout keeps original unresolved output shape',async()=>{const x=invoke(rows,native(),false);assert.equal(x.snapshot,undefined);assert.equal(x.after.audit.native_availability_diagnostic,undefined);return summarize(x);});
  await group('exact emitted JSON UTF8 boundary includes envelope and multibyte text',async()=>{
   const n=native();n.data.public_padding='Ж'.repeat(32);let padding=0;
   for(let i=0;i<6;i++){n.data.public_padding='Ж'.repeat(32)+'x'.repeat(padding);const expected={...retained.snapshot,parsed_payload_utf8_bytes:bytes(n.data),parsed_payload:n.data};padding+=pins.public_parsed_snapshot_max_utf8_bytes-emittedBytes(expected);assert(padding>=0);}
   n.data.public_padding='Ж'.repeat(32)+'x'.repeat(padding);const x=invoke(rows,n);assert.equal(x.snapshot.complete,true);assert.equal(emittedBytes(x.snapshot),pins.public_parsed_snapshot_max_utf8_bytes);boundaryRetained=x;assert.deepEqual(x.snapshot.parsed_payload,n.data);
   const over=copy(n);over.data.public_padding+='x';const y=invoke(rows,over);assert.equal(y.snapshot.status,'OMITTED_OVERSIZE');assert.equal(y.snapshot.complete,false);assert.equal(y.snapshot.parsed_payload,null);assert.equal(y.snapshot.attempted_snapshot_utf8_bytes,pins.public_parsed_snapshot_max_utf8_bytes+1);return{exact:summarize(x),one_byte_over:summarize(y)};
  });
  await group('oversize payload is omitted as a whole, never a complete prefix or sample',async()=>{const n=native();n.data.public_padding='x'.repeat(2*pins.public_parsed_snapshot_max_utf8_bytes);const x=invoke(rows,n);assert.equal(x.snapshot.status,'OMITTED_OVERSIZE');assert.equal(x.snapshot.complete,false);assert.equal(x.snapshot.parsed_payload,null);return summarize(x);});
  await group('NULL malformed and nonpublic/failed envelopes omit explicitly and preserve refusal',async()=>{
   const out=[];for(const n of [{...native(),data:null},{...native(),ok:false},{...native(),http_status:500},{...native(),url:'CONTROLLED_NOT_PUBLIC_URL'},{...native(),data:{status:'ok',ts:source,data:null}}]){const x=invoke(rows,n);assert.equal(x.snapshot.status,'OMITTED_INVALID_INPUT');assert.equal(x.snapshot.complete,false);assert.equal(x.snapshot.parsed_payload,null);out.push(summarize(x));}
   const empty=invoke(rows,native([]));assert.equal(empty.snapshot.complete,true);assert.deepEqual(empty.snapshot.parsed_payload.data,[]);out.push(summarize(empty));return out;
  });
  await group('cycle nonJSON and valid parsed negative-zero cannot silently become a complete changed payload',async()=>{
   const cycle=native();cycle.data.public_extra.cycle=cycle.data;const values=[cycle];for(const value of [NaN,undefined,JSON.parse('-0'),1n,()=>{},new Date(NOW)]){const n=native();n.data.public_extra.invalid=value;values.push(n);}const out=[];
   for(const n of values){const x=invoke(rows,n);assert.equal(x.snapshot.status,'OMITTED_INVALID_OR_NON_LOSSLESS_JSON');assert.equal(x.snapshot.complete,false);assert.equal(x.snapshot.parsed_payload,null);out.push(summarize(x));}return out;
  });
  await group('existing 8192-byte trace and its overflow flags remain exact',async()=>{
   const n=native();n.data.data.push({...row(approved.find(r=>r.contract_code===missing[0]),3),symbol:'Ж'.repeat(300)});const x=invoke(rows,n);assert.equal(x.after.audit.native_availability_diagnostic.status,'OVERFLOW');assert.deepEqual(x.after.audit.native_availability_diagnostic,x.before.audit.native_availability_diagnostic);assert.equal(x.snapshot.complete,true);return summarize(x);
  });
  const processStub={env:{GITHUB_SHA:'c'.repeat(40),GITHUB_RUN_ID:'CONTROLLED_NEW_CATALOG_CARRIER'}},cron={run_id:'CONTROLLED_NEW_UNRESOLVED_CATALOG',status:'PARTIAL',completed_ts:NOW+1000,universe_total:105,scanned:99,persistence_status:'NOT_CLOSED'};
  function failed(audit,day){try{partial(cron,'CONTROLLED_CURRENT_GENERATION',processStub,{REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT:audit,REPORT2_CURRENT_CYCLE_SELECTION_AUDIT:{status:'CONTROLLED_NOT_A_NEW_DECISION'}},day);}catch(e){return e;}throw Error('ACTUAL_PARTIAL_GUARD_MUST_REFUSE');}
  let exported;
  await group('actual partial guard and existing fatal exporter preserve full carrier, refusal and usage',async()=>{
   const out=[];
   for(const carrier of [retained,boundaryRetained])for(const unknown of [0,1]){
    const day={allowed:unknown===0,unknown_ops:unknown},error=failed(carrier.after.audit,day),writes=[],proc={exitCode:0};let finalized=0,cleaned=0;
    const accounting={status:'CONTROLLED_FAILED_USAGE_FINALIZED',unknown_ops_preserved:unknown,reservation_never_reduced:true,usage_after:{requests:11,rows_read:17,rows_written:3,unknown_ops:unknown}},original=JSON.stringify(accounting);
    await fatalExporter(error,null,{writeFile:async(name,value)=>writes.push({name,value:JSON.parse(value),serialized:value})},()=>{throw Error('NO_CANONICAL_PROMOTION');},proc,{error(){}},async()=>{cleaned++;return{status:'CONTROLLED_CLEANUP_NO_SQL'};},{finalizeFailure:async()=>{finalized++;return copy(accounting);}});
    assert.equal(proc.exitCode,1);assert.equal(finalized,1);assert.equal(cleaned,1);assert.equal(writes.length,1);assert.equal(writes[0].name,'report2-failure-accounting.json');
    const value=writes[0].value,{partial_cron_failure,...rest}=value;assert.deepEqual(rest,accounting);assert.equal(JSON.stringify(accounting),original);assert.deepEqual(partial_cron_failure.approved_universe_audit,carrier.after.audit);assert.deepEqual(partial_cron_failure.approved_universe_audit.native_catalog_parsed_snapshot.parsed_payload,carrier.snapshot.parsed_payload);assert(writes[0].serialized.includes('"native_catalog_parsed_snapshot": '+emitted(carrier.snapshot)));assert(emittedBytes(carrier.snapshot)<=pins.public_parsed_snapshot_max_utf8_bytes);assert.equal(partial_cron_failure.additional_SQL+partial_cron_failure.additional_source_HTTP,0);assert.equal(partial_cron_failure.full_report_completed||partial_cron_failure.entry_authorized||partial_cron_failure.Telegram_SENT_claimed,false);assert.deepEqual(partial_cron_failure.d1_day_admission,day);
    if(!exported)exported=value;out.push({snapshot_emitted_utf8_bytes:emittedBytes(carrier.snapshot),unknown_preserved:unknown,artifact:writes[0].name,parsed_rows:partial_cron_failure.approved_universe_audit.native_catalog_parsed_snapshot.parsed_payload.data.length,artifact_sha256:hash(JSON.stringify(value)),exitCode:proc.exitCode,refusal:partial_cron_failure.cron.status,additional_SQL:0,additional_source_HTTP:0});
   }return out;
  });
  await group('successful cron shape and incomplete-success refusal are unchanged',async()=>{
   const env={REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT:retained.after.audit};assert.equal(partial({...cron,status:'SUCCESS'},'CONTROLLED',processStub,env,{}),undefined);assert.throws(()=>partial({...cron,status:'SUCCESS',completed_ts:null},'CONTROLLED',processStub,env,{}),/CRON_IDENTITY_NOT_SUCCESS/);return{success_guard_return:'UNCHANGED',incomplete_success_refused:true,no_send:true};
  });
  assert.equal(controls.length,12);assert.equal(attemptedNetwork,0);
  return{schema:'UNRESOLVED_PUBLIC_CATALOG_CARRIER_CONTROLLED_COMPONENT_V1',status:'CONTROLLED_COMPONENT_COMPLETED',control_count:12,controls,representative_exported_failure:exported,fixture_provenance:'NEW_CONTROLLED_PUBLIC_PARSED_CATALOG_AND_MEMORY_EXPORTER_NOT_NATIVE_RESPONSE_OR_ACTUAL_REPORT',snapshot_limit_utf8_bytes:pins.public_parsed_snapshot_max_utf8_bytes,old_trace_limit_utf8_bytes:pins.existing_diagnostic_max_utf8_bytes,only_proposed_helper_changed:true,old_scope_outputs_and_gates_unchanged:true,raw_body_or_wire_retained:false,body_completion_ts:null,new_SQL:0,provider_HTTP:0,native_SQL:0,Telegram:0,new_admission:false,new_current_source_facts:false,old_accepted_cases_replayed:false,existing_response395674_recovered:false};
 }catch(error){error.completed_new_control_groups=controls;throw error;}
 finally{globalThis.fetch=originalFetch;}
}
