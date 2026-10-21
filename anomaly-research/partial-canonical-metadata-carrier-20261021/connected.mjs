// Prepared callable only. No imports, registration, or invocation at top level.
export async function runPartialCanonicalMetadataCarrierConnected({runtime_root,baseline_runtime_root,repo_root}={}){
 const fs=(await import('node:fs')).default,path=(await import('node:path')).default;
 const {createHash}=await import('node:crypto'),{default:assert}=await import('node:assert/strict');
 const sha=x=>createHash('sha256').update(x).digest('hex'),copy=x=>structuredClone(x);
 const emitted=x=>JSON.stringify(x,null,2).replace(/\n/g,'\n        '),emittedBytes=x=>Buffer.byteLength(emitted(x),'utf8');
 const prefix='anomaly-research/partial-canonical-metadata-carrier-20261021';
 const pins=JSON.parse(fs.readFileSync(path.join(repo_root,prefix,'target-bindings.json'),'utf8'));
 const next=fs.realpathSync(runtime_root),old=fs.realpathSync(baseline_runtime_root);
 assert.notEqual(next,old);assert.equal(path.basename(next),'src');assert.equal(path.basename(old),'src');
 const files=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)).map(n=>path.join(e.name,n)):[e.name]).sort();
 const names=files(next);assert.deepEqual(files(old),names,'Distinct complete assembled src baseline required');
 for(const name of names)assert.equal(sha(fs.readFileSync(path.join(old,name))),name===pins.runtime_file?pins.before_sha256:sha(fs.readFileSync(path.join(next,name))),name);
 const before=fs.readFileSync(path.join(old,pins.runtime_file),'utf8'),after=fs.readFileSync(path.join(next,pins.runtime_file),'utf8');
 assert.equal(sha(after),pins.after_sha256);
 const runner=fs.readFileSync(path.join(next,'..',pins.runner_parent_file),'utf8');
 assert.equal(sha(runner),pins.runner_sha256);assert.equal(sha(fs.readFileSync(path.join(old,'..',pins.runner_parent_file))),pins.runner_sha256);
 const fragment=(text,start,end)=>{assert.equal(text.split(start).length,2,'Unique fragment start');const a=text.indexOf(start),z=text.indexOf(end,a);assert(z>a);return text.slice(a,z);};
 const sources={};
 for(const [name,text]of [['before',before],['after',after]])for(const kind of ['projection','selection']){const body=fragment(text,pins[kind+'_start'],pins[kind+'_end']);assert.equal(sha(body),pins[name+'_'+kind+'_sha256']);sources[name+'_'+kind]=body;}
 const partialBody=fragment(runner,'  if (cron.status !== "SUCCESS" || cron.completed_ts == null)','  console.log("CRON_IDENTITY_BINDING"');
 const fatalStart='main().catch(async(error) => {',a=runner.indexOf(fatalStart),z=runner.lastIndexOf('\n});');assert(a>0&&z>a);
 const fatalBody=runner.slice(a+fatalStart.length,z);assert.equal(sha(partialBody),pins.runner_partial_guard_sha256);assert.equal(sha(fatalBody),pins.runner_fatal_body_sha256);
 const controls=[],originalFetch=globalThis.fetch,originalNow=Date.now;let unexpectedHTTP=0,unexpectedClock=0;
 globalThis.fetch=()=>{unexpectedHTTP++;throw Error('NO_NETWORK_IN_METADATA_CARRIER_CASE');};
 Date.now=()=>{unexpectedClock++;throw Error('EXISTING_CLOCKS_MUST_NOT_REFRESH');};
 try{
  // All actual full-baseline and existing-source pins precede any evaluation.
  const projection={},selection={};
  for(const label of ['before','after']){
   projection[label]=new Function('deep','target','runId','sufficiency','decisionGenerated','validated','finalization','fastMoveWatchObservation','results',sources[label+'_projection']+'\nreturn results[0];');
   selection[label]=new Function('runId','discoveryPrefilter','liveHandoffPlan','boundedDeepCheck','compareOrdinaryDeepCandidates','env',sources[label+'_selection']+'\nreturn env.REPORT2_CURRENT_CYCLE_SELECTION_AUDIT;');
  }
  const partial=new Function('cron','generation','process','env','d1DayAdmission',partialBody);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const fatalExporter=new AsyncFunction('error','canonicalOutputForFailure','fs','markPostAnalysisControlFailure','process','console','cleanupClaimedAnalyticsLease','failedD1RunAccounting',fatalBody);
  const RUN='CONTROLLED_NEW_INITIAL_METADATA_RUN',T=1792600000000;
  const make=(contract='BR-USDT',letter='a')=>{
   const canonical={status:'CLOSED',state:'REJECTED',direction:null,run_id:RUN,snapshot_id:'CONTROLLED:'+contract+':'+T,observed_ts:T,analytical_fingerprint:letter.repeat(64),candidates:[{contract}],metadata:{contract,direction_resolution:{status:'UNKNOWN',direction:null,facts:[],early_receipt:{closed:false,reason:'CONTROLLED_NOT_THE_MISSING_REAL_REASON',source_ts:T-60000,available_at:null,evidence_ids:[]},candidate_direction:'UNKNOWN',authorized_entry_direction:'UNKNOWN'},score_basis:{selected:'CONTROLLED_EXISTING_BASIS',qualified_early_detection_0_100:0,deep_canonical_interest_0_100:null,routed_overall_0_100:0},private_full_payload:{secret:'NEVER_COPY_WHOLE_CANONICAL_METADATA'}}};
   return{canonical_analytical_bundle:{status:'CLOSED',canonical,parity_fingerprint:canonical.analytical_fingerprint,telegram:{status:'READY'},manual:{status:'READY'}},post_v7_canonical_persistence:{status:'CLOSED',persisted:true,publication_id:'PUB:'+letter.repeat(40),contract,direction:null,run_id:RUN,snapshot_id:canonical.snapshot_id,observed_ts:T},direction_candidate:{direction:'SHORT',origin:'DISCOVERY',source_ts:T-1000,confirmation_state:'DISCOVERY_ONLY',direction_raw:'SHORT_WATCH'},stage392_shadow_integration:{full_evidence_persistence:{status:'CLOSED',persisted:true,insert_changes:1,error:null}}};
  };
  const project=(label,deep,contract=deep.canonical_analytical_bundle?.canonical?.metadata?.contract??'BR-USDT',run=RUN)=>projection[label](deep,{contract},run,'PARTIAL',false,false,{status:'CLOSED'},null,[]);
  const select=(label,rows,run=RUN)=>selection[label](run,{shortlist:[{contract:'BR-USDT',selection_score_0_100:90},{contract:'APR-USDT',selection_score_0_100:80}]},{lane:'LIVE_DISCOVERY',top_two_contracts:['BR-USDT','APR-USDT']},{results:rows,plan:{selected:rows.map(row=>({contract:row.contract})),parameters:{configured_max_per_run:2}}},()=>0,{});
  const strip=row=>{const out=copy(row);delete out.canonical_analytical_result.initial_analysis_diagnostic;return out;};
  const stripAudit=a=>{const out=copy(a);delete out.initial_analysis_diagnostics;delete out.initial_analysis_diagnostics_omitted_count;return out;};
  const group=async(name,fn)=>controls.push({name,classification:'NEW_CONTROLLED_COPY_ONLY_NOT_REAL_METADATA_OR_NATIVE_ACK',detail:await fn()});
  let pair,audit,boundary,representativeFailure;
  await group('two exact already-built canonical metadata copies preserve all previous projection and selection fields',async()=>{
   pair=[make(),make('APR-USDT','b')].map(deep=>{const previous=JSON.stringify(deep),oldRow=project('before',deep),row=project('after',deep),d=row.canonical_analytical_result.initial_analysis_diagnostic;assert.deepEqual(strip(row),oldRow);assert.equal(d.complete,true);assert.equal(d.status,'CAPTURED_EXISTING_INITIAL_ANALYSIS');assert.deepEqual(d.metadata,{direction_resolution:deep.canonical_analytical_bundle.canonical.metadata.direction_resolution,score_basis:deep.canonical_analytical_bundle.canonical.metadata.score_basis});assert.notEqual(d.metadata.direction_resolution,deep.canonical_analytical_bundle.canonical.metadata.direction_resolution);assert.equal(d.canonical_direction,null);assert.equal(d.persistence.fingerprint_independently_returned,false);assert.equal(JSON.stringify(deep),previous);assert(!JSON.stringify(d).includes('NEVER_COPY_WHOLE'));assert(emittedBytes(d)<=4096);return row;});
   audit=select('after',pair);assert.deepEqual(stripAudit(audit),select('before',pair));assert.equal(audit.initial_analysis_diagnostics.length,2);assert.equal(audit.initial_analysis_diagnostics_omitted_count,0);for(const d of audit.initial_analysis_diagnostics){assert.equal(d.complete,true);assert.equal(d.metadata.direction_resolution.early_receipt.closed,false);assert.equal(d.metadata.score_basis.qualified_early_detection_0_100,0);}
   return audit.initial_analysis_diagnostics.map(d=>({identity:d.identity,canonical_state:d.canonical_state,direction:d.canonical_direction,complete:d.complete,emitted_utf8_bytes:emittedBytes(d),metadata:d.metadata}));
  });
  await group('literal NULL false zero nested reasons and retained DEDUP identity are preserved',async()=>{
   const deep=make();deep.canonical_analytical_bundle.canonical.metadata.direction_resolution=null;deep.canonical_analytical_bundle.canonical.metadata.score_basis={selected:null,enabled:false,value:0,reason:null,source_ts:T-60000};deep.post_v7_canonical_persistence.status='DEDUPLICATED';deep.post_v7_canonical_persistence.persisted=false;
   const row=project('after',deep),d=select('after',[row]).initial_analysis_diagnostics[0];assert.equal(d.complete,true);assert.equal(d.metadata.direction_resolution,null);assert.deepEqual(d.metadata.score_basis,deep.canonical_analytical_bundle.canonical.metadata.score_basis);assert.equal(d.persistence.persisted,false);return d;
  });
  await group('foreign incomplete canonical and retained persistence identities omit without changing old analysis',async()=>{
   const variants=[['canonical-run',d=>d.canonical_analytical_bundle.canonical.run_id='OTHER'],['canonical-contract',d=>d.canonical_analytical_bundle.canonical.metadata.contract='OTHER-USDT'],['snapshot-missing',d=>d.canonical_analytical_bundle.canonical.snapshot_id=''],['observed-string',d=>d.canonical_analytical_bundle.canonical.observed_ts=String(T)],['fingerprint-invalid',d=>d.canonical_analytical_bundle.canonical.analytical_fingerprint='bad'],['parity-foreign',d=>d.canonical_analytical_bundle.parity_fingerprint='b'.repeat(64)],['receipt-contract',d=>d.post_v7_canonical_persistence.contract='OTHER-USDT'],['receipt-run',d=>d.post_v7_canonical_persistence.run_id='OTHER'],['receipt-snapshot',d=>d.post_v7_canonical_persistence.snapshot_id='OTHER'],['receipt-observed',d=>d.post_v7_canonical_persistence.observed_ts++],['receipt-direction',d=>d.post_v7_canonical_persistence.direction='SHORT'],['receipt-missing',d=>d.post_v7_canonical_persistence=null],['receipt-failure',d=>d.post_v7_canonical_persistence.status='PERSISTENCE_FAILED'],['CLOSED-false',d=>d.post_v7_canonical_persistence.persisted=false],['DEDUP-true',d=>d.post_v7_canonical_persistence.status='DEDUPLICATED']];
   return variants.map(([label,mutate])=>{const deep=make();mutate(deep);const oldRow=project('before',deep,'BR-USDT'),row=project('after',deep,'BR-USDT'),d=row.canonical_analytical_result.initial_analysis_diagnostic;assert.deepEqual(strip(row),oldRow);assert.equal(d.complete,false);assert.equal(d.metadata,null);assert.match(d.status,/^OMITTED_/);return{label,status:d.status,reason:d.omission_reason};});
  });
  await group('legacy metadata absence and old rows remain explicit omissions rather than invented reasons',async()=>{
   const deep=make();delete deep.canonical_analytical_bundle.canonical.metadata.direction_resolution;
   const d=project('after',deep).canonical_analytical_result.initial_analysis_diagnostic;assert.equal(d.status,'OMITTED_LEGACY_METADATA');assert.equal(d.metadata,null);
   const legacy=select('after',[project('before',make())]).initial_analysis_diagnostics[0];assert.equal(legacy.status,'OMITTED_LEGACY_ROW');assert.equal(legacy.identity,null);assert.equal(legacy.metadata,null);return{missing_field:d,legacy_row:legacy};
  });
  await group('exact emitted UTF8 candidate4096 and one byte overflow include envelope escaping and depth4',async()=>{
   const deep=make(),base=project('after',deep).canonical_analytical_result.initial_analysis_diagnostic;let padding=0;
   for(let i=0;i<6;i++){deep.canonical_analytical_bundle.canonical.metadata.direction_resolution.controlled_padding='Ж"\\\n'.repeat(8)+'x'.repeat(padding);const expected={...base,metadata:{direction_resolution:deep.canonical_analytical_bundle.canonical.metadata.direction_resolution,score_basis:deep.canonical_analytical_bundle.canonical.metadata.score_basis}};padding+=4096-emittedBytes(expected);assert(padding>=0);}
   deep.canonical_analytical_bundle.canonical.metadata.direction_resolution.controlled_padding='Ж"\\\n'.repeat(8)+'x'.repeat(padding);
   const row=project('after',deep),d=row.canonical_analytical_result.initial_analysis_diagnostic;assert.equal(d.complete,true);assert.equal(emittedBytes(d),4096);boundary=select('after',[row]).initial_analysis_diagnostics[0];assert.equal(boundary.complete,true);assert.equal(emittedBytes(boundary),4096);
   deep.canonical_analytical_bundle.canonical.metadata.direction_resolution.controlled_padding+='x';const over=project('after',deep).canonical_analytical_result.initial_analysis_diagnostic;assert.equal(over.status,'OMITTED_OVERSIZE');assert.equal(over.complete,false);assert.equal(over.metadata,null);return{exact_emitted_utf8_bytes:emittedBytes(d),selection_exact_emitted_utf8_bytes:emittedBytes(boundary),one_byte_over_status:over.status,omission_emitted_utf8_bytes:emittedBytes(over)};
  });
  await group('cycles and nonlossless metadata never become complete changed facts',async()=>{
   const values=[NaN,undefined,JSON.parse('-0'),1n,()=>{},new Date(T)],out=[];
   for(const value of values){const deep=make();deep.canonical_analytical_bundle.canonical.metadata.direction_resolution.bad=value;const d=project('after',deep).canonical_analytical_result.initial_analysis_diagnostic;assert.equal(d.status,'OMITTED_NON_LOSSLESS_METADATA');assert.equal(d.metadata,null);out.push(d.status);}
   const deep=make();deep.canonical_analytical_bundle.canonical.metadata.direction_resolution.self=deep.canonical_analytical_bundle.canonical.metadata.direction_resolution;const d=project('after',deep).canonical_analytical_result.initial_analysis_diagnostic;assert.equal(d.status,'OMITTED_NON_LOSSLESS_METADATA');out.push(d.status);return{variants:out.length,statuses:out};
  });
  await group('selection rechecks row identity receipt and missing fields and bounds independent candidates to two',async()=>{
   const out=[];for(const [label,mutate]of [['row-run',r=>r.run_id='OTHER'],['row-fingerprint',r=>r.canonical_analytical_result.analytical_fingerprint='e'.repeat(64)],['receipt-after-copy',r=>r.post_v7_canonical_persistence.observed_ts++],['metadata-after-copy',r=>delete r.canonical_analytical_result.initial_analysis_diagnostic.metadata]]){const row=copy(pair[0]);mutate(row);const d=select('after',[row]).initial_analysis_diagnostics[0];assert.equal(d.complete,false);assert.equal(d.status,'OMITTED_UNBOUND_ROW');assert.equal(d.metadata,null);out.push({label,status:d.status});}
   const duplicate=select('after',[copy(pair[0]),copy(pair[0])]);assert.equal(duplicate.initial_analysis_diagnostics[1].omission_reason,'DUPLICATE_RESULT_CONTRACT');
   const three=select('after',[...copy(pair),project('after',make('PEPE-USDT','c'))]);assert.equal(three.initial_analysis_diagnostics.length,2);assert.equal(three.initial_analysis_diagnostics_omitted_count,1);assert.deepEqual(stripAudit(three),select('before',[...copy(pair),project('after',make('PEPE-USDT','c'))]));return{unbound:out,duplicate_omitted:true,max_candidates:three.initial_analysis_diagnostics.length,additional_candidates_omitted:three.initial_analysis_diagnostics_omitted_count};
  });
  await group('existing actual partial guard and fatal exporter retain initial reasons clocks refusal and unknown0or1',async()=>{
   const out=[];
   for(const source of [audit,{...copy(audit),initial_analysis_diagnostics:[boundary]}])for(const unknown of [0,1]){
    const cron={run_id:RUN,status:'PARTIAL',completed_ts:T+1000,universe_total:105,scanned:99,persistence_status:'NOT_CLOSED'},day={allowed:unknown===0,unknown_ops:unknown,next_reservation:{rows_read:54000,rows_written:840}},writes=[],proc={exitCode:0};let error,finalized=0,cleaned=0;
    try{partial(cron,'CONTROLLED_CURRENT_GENERATION',{env:{GITHUB_SHA:'c'.repeat(40),GITHUB_RUN_ID:'CONTROLLED_NEW_METADATA'}},{REPORT2_CURRENT_CYCLE_UNIVERSE_AUDIT:{status:'NOT_CLOSED',checked_analysis_contracts:99},REPORT2_CURRENT_CYCLE_SELECTION_AUDIT:source},day);}catch(e){error=e;}
    assert(error);assert.match(error.message,/CRON_IDENTITY_NOT_SUCCESS/);
    const accounting={status:'CONTROLLED_FAILED_USAGE_FINALIZED',unknown_ops_preserved:unknown,reservation_never_reduced:true,reservation:{rows_read:54000,rows_written:840},usage_after:{requests:11,rows_read:17,rows_written:3,unknown_ops:unknown}};
    await fatalExporter(error,null,{writeFile:async(name,text)=>writes.push({name,text,value:JSON.parse(text)})},()=>{throw Error('NO_CANONICAL_PROMOTION');},proc,{error(){}},async()=>{cleaned++;return{status:'CONTROLLED_NO_SQL'};},{finalizeFailure:async()=>{finalized++;return copy(accounting);}});
    assert.equal(finalized,1);assert.equal(cleaned,1);assert.equal(proc.exitCode,1);assert.equal(writes.length,1);assert.equal(writes[0].name,'report2-failure-accounting.json');const {partial_cron_failure:failure,...rest}=writes[0].value;assert.deepEqual(rest,accounting);assert.deepEqual(failure.candidate_selection_audit,source);assert.deepEqual(failure.d1_day_admission,day);assert.equal(failure.cron.status,'PARTIAL');assert.equal(failure.additional_SQL+failure.additional_source_HTTP,0);assert.equal(failure.full_report_completed||failure.entry_authorized||failure.Telegram_SENT_claimed,false);
    for(const d of source.initial_analysis_diagnostics){assert(writes[0].text.includes(emitted(d)),'Actual existing depth4 candidate JSON fragment');assert(emittedBytes(d)<=4096);assert.equal(d.identity.observed_ts,T);assert.equal(d.source_clocks_refreshed,false);}
    if(!representativeFailure)representativeFailure=writes[0].value;out.push({unknown_preserved:unknown,candidates:source.initial_analysis_diagnostics.length,emitted_candidate_bytes:source.initial_analysis_diagnostics.map(emittedBytes),artifact_sha256:sha(writes[0].text),exitCode:proc.exitCode,refusal:failure.cron.status,new_SQL:0,provider_HTTP:0});
   }
   return out;
  });
  assert.equal(controls.length,8);assert.equal(unexpectedHTTP,0);assert.equal(unexpectedClock,0);
  return{schema:'PARTIAL_INITIAL_ANALYSIS_METADATA_CARRIER_CONNECTED_V1',status:'CONTROLLED_COMPONENT_COMPLETED',control_count:8,controls,representative_exported_failure:representativeFailure,max_candidate_emitted_utf8_bytes:4096,max_candidates:2,fixture_provenance:'NEW_CONTROLLED_ALREADY_BUILT_CANONICAL_METADATA_NOT_RECOVERED_REAL_BR_APR_REASONS',canonical_resolver_or_score_recomputed:false,old_projection_selection_fields_unchanged:true,existing_runner_changed:false,new_SQL:0,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,source_clock_refreshes:unexpectedClock,native_persistence_or_fingerprint_ACK_qualified:false,old_565_588_589_semantic_reexecution:0,actual395777_missing_metadata_recovered:false,initial_direction_cause_or_SENT_fixed:false};
 }catch(error){error.completed_new_control_groups=controls;throw error;}
 finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
}
