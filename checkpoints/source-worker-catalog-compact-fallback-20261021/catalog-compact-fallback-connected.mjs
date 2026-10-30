// Prepared ONLY: no top-level imports, registration, or automatic invocation.
export async function runCatalogCompactFallbackConnected({runtime_root,baseline_runtime_root,repo_root}){
 const fs=(await import('node:fs')).default,path=(await import('node:path')).default;
 const {createHash}=await import('node:crypto'),{pathToFileURL}=await import('node:url'),{default:assert}=await import('node:assert/strict');
 const hash=x=>createHash('sha256').update(x).digest('hex'),copy=x=>structuredClone(x);
 const compactBytes=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 const emitted=x=>JSON.stringify(x,null,2).replace(/\n/g,'\n      '),emittedBytes=x=>Buffer.byteLength(emitted(x),'utf8');
 const folder=path.join(repo_root,'checkpoints/source-worker-catalog-compact-fallback-20261021');
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
  // Pins precede imports/evaluation. Companion Worker is byteequal in both trees,
  // without requiring its old version or invoking that separate component.
  const candidate=await import(pathToFileURL(path.join(next,pins.runtime_helper)).href),baseline=await import(pathToFileURL(path.join(old,pins.runtime_helper)).href);
  const partial=new Function('cron','generation','process','env','d1DayAdmission',partialBody);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const fatalExporter=new AsyncFunction('error','canonicalOutputForFailure','fs','markPostAnalysisControlFailure','process','console','cleanupClaimedAnalyticsLease','failedD1RunAccounting',fatalBody);
  const NOW=1792575186675,source=1792575187653,received=1792575187913,url='https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',max=pins.public_parsed_snapshot_max_utf8_bytes;
  const missing=['BTR-USDT','DOS-USDT','GPS-USDT','PIPPIN-USDT','SKR-USDT','UB-USDT'],missingSet=new Set(missing),approved=candidate.APPROVED_HTX_ANALYSIS_CONTRACTS;
  assert.equal(approved.length,105);
  const row=r=>({contract_code:r.contract_code,symbol:r.asset_symbol,contract_status:1,business_type:'swap',contract_type:'swap',trade_partition:'USDT',labels:[],tradfi_labels:[]});
  const full=approved.map(r=>({...row(r),instrument_scope:{classification:'CRYPTO_CONFIRMED'}})),rows=full.filter(r=>!missingSet.has(r.contract_code));
  const native=payload=>({ok:true,http_status:200,url,observed_ts:received,data:payload});
  const smallPayload=()=>({status:'ok',ts:source,data:rows.map(r=>row({contract_code:r.contract_code,asset_symbol:r.symbol})),controlled:'NEW_FALLBACK_FIXTURE_NOT_NATIVE'});
  const baseOptions=p=>({observed_ts:NOW,include_native_availability_diagnostic:true,native_catalog:{...native(p),classify:()=>({classification:'CRYPTO_CONFIRMED'})}});
  // Only a template for new dimension/encoding controls, not an old case replay.
  const template=baseline.bindApprovedHtxAnalysisScope(rows,baseOptions(smallPayload())).audit.native_catalog_parsed_snapshot;
  assert.equal(template.schema,'APPROVED_HTX_PUBLIC_PARSED_CATALOG_V1');assert.equal(template.complete,true);
  const v1=p=>({...template,parsed_payload_utf8_bytes:compactBytes(p),parsed_payload:copy(p)});
  const v2=p=>({...v1(p),schema:'APPROVED_HTX_PUBLIC_PARSED_CATALOG_V2',payload_encoding:'COMPACT_PARSED_JSON_TEXT',parsed_payload:null,parsed_payload_json:JSON.stringify(p)});
  const invoke=(payload,input=rows,diagnostic=true)=>{
   let oldCalls=0,newCalls=0;
   const options=call=>({observed_ts:NOW,include_native_availability_diagnostic:diagnostic,native_catalog:{...native(payload),classify:()=>{call();return{classification:'CRYPTO_CONFIRMED'};}}});
   const before=baseline.bindApprovedHtxAnalysisScope(input,options(()=>oldCalls++)),after=candidate.bindApprovedHtxAnalysisScope(input,options(()=>newCalls++));
   const strip=x=>{const {native_catalog_parsed_snapshot,...audit}=x.audit;return{contracts:x.contracts,audit};};
   assert.deepEqual(strip(after),strip(before),'all scope/trace/rows/clocks/refusals stay exact');assert.equal(oldCalls,newCalls);
   assert.equal(candidate.approvedHtxScopeAccounted(after.audit),baseline.approvedHtxScopeAccounted(before.audit));
   const snapshot=after.audit.native_catalog_parsed_snapshot;
   if(snapshot)assert(emittedBytes(snapshot)<=max);
   return{before,after,snapshot,classifier_calls:newCalls};
  };
  const checkV2=(x,p)=>{
   assert.equal(x.before.audit.native_catalog_parsed_snapshot.status,'OMITTED_OVERSIZE');
   assert.equal(x.snapshot.schema,'APPROVED_HTX_PUBLIC_PARSED_CATALOG_V2');assert.equal(x.snapshot.status,'COMPLETE_PARSED_PUBLIC_CATALOG');assert.equal(x.snapshot.complete,true);
   assert.equal(x.snapshot.payload_encoding,'COMPACT_PARSED_JSON_TEXT');assert.equal(x.snapshot.parsed_payload,null);assert.equal(x.snapshot.parsed_payload_json,JSON.stringify(p));assert.deepEqual(JSON.parse(x.snapshot.parsed_payload_json),p);
   assert.equal(x.snapshot.evaluation_ts,NOW);assert.equal(x.snapshot.catalog_source_ts,source);assert.equal(x.snapshot.catalog_observed_ts,received);assert.equal(x.snapshot.original_body_completion_ts,null);assert.equal(x.snapshot.raw_body_sha256,null);
  };
  const summary=x=>({scope_status:x.after.audit.status,checked:x.after.audit.checked_analysis_contracts,unresolved:x.after.audit.unresolved_approved_analysis_contracts,classifier_calls:x.classifier_calls,snapshot:x.snapshot?{schema:x.snapshot.schema,status:x.snapshot.status,complete:x.snapshot.complete,encoding:x.snapshot.payload_encoding??null,parsed_payload_utf8_bytes:x.snapshot.parsed_payload_utf8_bytes,emitted_utf8_bytes:emittedBytes(x.snapshot),encoded_text_utf8_bytes:typeof x.snapshot.parsed_payload_json==='string'?Buffer.byteLength(x.snapshot.parsed_payload_json,'utf8'):null,parsed_json_sha256:typeof x.snapshot.parsed_payload_json==='string'?hash(x.snapshot.parsed_payload_json):null,wire_sha256:x.snapshot.raw_body_sha256,body_completion_ts:x.snapshot.original_body_completion_ts}:null});
  const group=async(name,fn)=>controls.push({name,classification:'NEW_CONTROLLED_COMPACT_ENCODING_FALLBACK_ONLY',detail:await fn()});
  let modeled,retained,boundaryRetained,omitted,representative;
  await group('CONTROLLED388 rows exactly model observed179284 compact and345857 V1 emitted bytes',async()=>{
   const make=(n,t)=>({status:'ok',ts:source,data:[...smallPayload().data,...Array.from({length:289},(_,i)=>row({contract_code:`CONTROLLED_EXTRA_${i}-USDT`,asset_symbol:`CONTROLLED_EXTRA_${i}`}))],model_layout:Array(n).fill(0),model_tuning:Object.fromEntries(Array.from({length:t},(_,i)=>[`k${i}`,0])),model_padding:''});
   const padded=p=>{p.model_padding='';const remaining=179284-compactBytes(p);assert(remaining>=0);p.model_padding='x'.repeat(remaining);assert.equal(compactBytes(p),179284);return p;};
   const gap=p=>emittedBytes(v1(p))-compactBytes(p),g1=gap(padded(make(1,0))),step=gap(padded(make(2,0)))-g1;
   assert(Number.isSafeInteger(step)&&step>0);let p=null;
   for(let t=0;t<4*step&&!p;t++){
    const first=gap(padded(make(1,t))),n=1+(345857-179284-first)/step;
    if(Number.isSafeInteger(n)&&n>=1){const value=padded(make(n,t));if(emittedBytes(v1(value))===345857)p=value;}
   }
   assert(p,'deterministic dimension model must match both actual observed sizes');assert.equal(p.data.length,388);assert.equal(compactBytes(p),179284);assert.equal(emittedBytes(v1(p)),345857);
   const original=JSON.stringify(p),x=invoke(p);checkV2(x,p);assert.equal(x.before.audit.native_catalog_parsed_snapshot.attempted_snapshot_utf8_bytes,345857);assert.equal(x.after.audit.status,'NOT_CLOSED');assert.equal(x.after.audit.checked_analysis_contracts,99);assert.deepEqual(x.after.audit.unresolved_approved_analysis_contracts,missing);assert.equal(x.classifier_calls,0);assert.equal(JSON.stringify(p),original);
   modeled=p;retained=x;return{...summary(x),model_rows:388,modeled_compact:179284,modeled_V1_pretty_depth3:345857,original_native_payload_recovered:false};
  });
  await group('fallback text keeps all aliases nested extras Unicode and escaping losslessly without mutation',async()=>{
   const p=copy(modeled);p.public_extra={aliases:missing.map(x=>x.toLowerCase()+' '),typed_status:'3',unicode:'Ж🙂\u2028\u2029',quoted:'"\\\t\n\r',empty:null,flat:0,nested:{a:[true,false,null,{quote:'"'}]}};
   const original=JSON.stringify(p);Object.freeze(p.public_extra.nested.a);Object.freeze(p.public_extra);Object.freeze(p.data);Object.freeze(p);
   const x=invoke(p);checkV2(x,p);assert.equal(JSON.stringify(p),original);assert.equal(x.after.audit.officially_unavailable_analysis_contracts.length,0);return summary(x);
  });
  await group('actual encoded emitted UTF8 boundary262144 and one extra byte choose whole retention or omission',async()=>{
   const p=copy(modeled);p.boundary_padding='Ж'.repeat(17);let padding=0;
   for(let i=0;i<8;i++){p.boundary_padding='Ж'.repeat(17)+'x'.repeat(padding);padding+=max-emittedBytes(v2(p));assert(padding>=0);}
   p.boundary_padding='Ж'.repeat(17)+'x'.repeat(padding);assert.equal(emittedBytes(v2(p)),max);assert(emittedBytes(v1(p))>max);
   const x=invoke(p);checkV2(x,p);assert.equal(emittedBytes(x.snapshot),max);boundaryRetained=x;
   const over=copy(p);over.boundary_padding+='x';assert.equal(emittedBytes(v2(over)),max+1);const y=invoke(over);
   assert.equal(y.snapshot.status,'OMITTED_OVERSIZE');assert.equal(y.snapshot.complete,false);assert.equal(y.snapshot.parsed_payload,null);assert.equal(y.snapshot.parsed_payload_json,undefined);assert.deepEqual(y.snapshot,y.before.audit.native_catalog_parsed_snapshot);omitted=y;
   return{exact:summary(x),one_byte_over:summary(y),attempted_encoded_one_byte_over:max+1};
  });
  await group('compact undercap can still exceed encoded cap through escaped text overhead',async()=>{
   const p=copy(modeled);p.model_padding='';p.escaping='"\\\n'.repeat(20000);
   assert(compactBytes(p)<max);assert(emittedBytes(v1(p))>max);assert(emittedBytes(v2(p))>max);
   const x=invoke(p);assert.equal(x.snapshot.status,'OMITTED_OVERSIZE');assert.equal(x.snapshot.complete,false);assert.equal(x.snapshot.parsed_payload,null);assert.equal(x.snapshot.parsed_payload_json,undefined);assert.deepEqual(x.snapshot,x.before.audit.native_catalog_parsed_snapshot);
   return{...summary(x),compact_utf8_bytes:compactBytes(p),attempted_encoded_utf8_bytes:emittedBytes(v2(p)),compact_belowcap_is_not_encoded_fit:true};
  });
  await group('both forms overcap preserve exact old whole omission with no prefix or sample',async()=>{
   const p=copy(modeled);p.oversize='x'.repeat(max);const x=invoke(p);
   assert.equal(x.snapshot.complete,false);assert.equal(x.snapshot.parsed_payload,null);assert.equal(x.snapshot.parsed_payload_json,undefined);assert.deepEqual(x.snapshot,x.before.audit.native_catalog_parsed_snapshot);assert.equal(x.snapshot.status,'OMITTED_OVERSIZE');
   return{...summary(x),attempted_encoded_utf8_bytes:emittedBytes(v2(p)),retained_partial_payload:false};
  });
  await group('existing actual partial guard and fatal exporter keep V2/omission and unchanged known unknown accounting',async()=>{
   const processStub={env:{GITHUB_SHA:'c'.repeat(40),GITHUB_RUN_ID:'CONTROLLED_NEW_COMPACT_FALLBACK'}},cron={run_id:'CONTROLLED_NEW_COMPACT_FALLBACK',status:'PARTIAL',completed_ts:received+1,universe_total:105,scanned:99,persistence_status:'NOT_CLOSED'},out=[];
   for(const carrier of [retained,boundaryRetained,omitted])for(const unknown of [0,1]){
    const day={allowed:unknown===0,unknown_ops:unknown};let error;
    try{partial(cron,'CONTROLLED_CURRENT_GENERATION',processStub,{REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT:carrier.after.audit,REPORT2_CURRENT_CYCLE_SELECTION_AUDIT:{status:'CONTROLLED_NO_NEW_DECISION'}},day);}catch(e){error=e;}
    assert(error);assert.match(error.message,/CRON_IDENTITY_NOT_SUCCESS/);
    const writes=[],proc={exitCode:0};let finalized=0,cleaned=0;
    const accounting={status:'CONTROLLED_FAILED_USAGE_FINALIZED',unknown_ops_preserved:unknown,reservation_never_reduced:true,usage_after:{requests:17,rows_read:23,rows_written:5,unknown_ops:unknown}},original=JSON.stringify(accounting);
    await fatalExporter(error,null,{writeFile:async(name,value)=>writes.push({name,serialized:value,value:JSON.parse(value)})},()=>{throw Error('NO_CANONICAL_PROMOTION');},proc,{error(){}},async()=>{cleaned++;return{status:'CONTROLLED_CLEANUP_NO_SQL'};},{finalizeFailure:async()=>{finalized++;return copy(accounting);}});
    assert.equal(proc.exitCode,1);assert.equal(finalized,1);assert.equal(cleaned,1);assert.equal(writes.length,1);assert.equal(writes[0].name,'report2-failure-accounting.json');
    const value=writes[0].value,{partial_cron_failure,...rest}=value;assert.deepEqual(rest,accounting);assert.equal(JSON.stringify(accounting),original);assert.deepEqual(partial_cron_failure.approved_universe_audit,carrier.after.audit);assert.deepEqual(partial_cron_failure.d1_day_admission,day);
    const saved=partial_cron_failure.approved_universe_audit.native_catalog_parsed_snapshot;assert.deepEqual(saved,carrier.snapshot);assert(writes[0].serialized.includes('"native_catalog_parsed_snapshot": '+emitted(saved)));assert(emittedBytes(saved)<=max);
    if(saved.complete){assert.equal(saved.payload_encoding,'COMPACT_PARSED_JSON_TEXT');assert.equal(typeof saved.parsed_payload_json,'string');assert.deepEqual(JSON.parse(saved.parsed_payload_json),JSON.parse(carrier.snapshot.parsed_payload_json));}
    else{assert.equal(saved.parsed_payload,null);assert.equal(saved.parsed_payload_json,undefined);}
    assert.equal(partial_cron_failure.additional_SQL+partial_cron_failure.additional_source_HTTP,0);assert.equal(partial_cron_failure.full_report_completed||partial_cron_failure.entry_authorized||partial_cron_failure.Telegram_SENT_claimed,false);
    if(!representative&&saved.complete)representative=value;
    out.push({encoded_complete:saved.complete,snapshot_emitted_utf8_bytes:emittedBytes(saved),unknown_preserved:unknown,known_usage_preserved:true,artifact_sha256:hash(writes[0].serialized),exitCode:proc.exitCode,additional_SQL:0,additional_source_HTTP:0});
   }return out;
  });
  await group('new fallback fixture optout closed gate and small V1 path retain original shapes',async()=>{
   const legacy=invoke(modeled,rows,false);assert.deepEqual(legacy.after,legacy.before);assert.equal(legacy.snapshot,undefined);
   const closed=invoke(modeled,full,true);assert.deepEqual(closed.after,closed.before);assert.equal(closed.snapshot,undefined);assert.equal(closed.after.audit.status,'CLOSED');
   const small=invoke(smallPayload());assert.deepEqual(small.after,small.before);assert.equal(small.snapshot.schema,'APPROVED_HTX_PUBLIC_PARSED_CATALOG_V1');assert.equal(small.snapshot.payload_encoding,undefined);assert.equal(small.snapshot.parsed_payload_json,undefined);
   assert(compactBytes(retained.after.audit.native_availability_diagnostic)<=pins.existing_diagnostic_max_utf8_bytes);return{legacy_shape_exact:true,closed_shape_exact:true,small_V1_complete_shape_exact:true,trace_exact:true,gates_unchanged:true};
  });
  assert.equal(controls.length,7);assert.equal(attemptedNetwork,0);
  return{schema:'CATALOG_COMPACT_FALLBACK_CONTROLLED_COMPONENT_V1',status:'CONTROLLED_COMPONENT_COMPLETED',control_count:7,controls,representative_exported_failure:representative,fixture_provenance:'NEW_CONTROLLED388_DIMENSION_MODEL_NOT_ACTUAL395777_PAYLOAD',observed_sizes_modeled:{rows:388,compact_utf8:179284,V1_emitted_depth3_utf8:345857},snapshot_limit_utf8_bytes:max,old_trace_limit_utf8_bytes:pins.existing_diagnostic_max_utf8_bytes,only_proposed_helper_changed:true,V1_when_fitting_unchanged:true,old_scope_outputs_and_gates_unchanged:true,source_clocks_refreshed:false,body_completion_ts:null,raw_body_sha256:null,new_SQL:0,provider_HTTP:0,native_SQL:0,Telegram:0,new_admission:false,current_six_missing_cause_fixed:false,actual395777_discarded_payload_recovered:false,old_accepted_cases_replayed:false};
 }catch(error){error.completed_new_control_groups=controls;throw error;}
 finally{globalThis.fetch=originalFetch;}
}
