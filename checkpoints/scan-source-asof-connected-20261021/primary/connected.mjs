// Prepared callable only. No imports, registration, or invocation at top level.
export async function runPresentationPrimaryCompactConnected({runtime_root,baseline_runtime_root,repo_root}={}){
 const fs=(await import('node:fs')).default,path=(await import('node:path')).default;
 const {createHash}=await import('node:crypto'),{default:assert}=await import('node:assert/strict');
 const sha=x=>createHash('sha256').update(x).digest('hex'),copy=x=>structuredClone(x);
 const emitted=x=>JSON.stringify(x,null,2).replace(/\n/g,'\n        '),emittedBytes=x=>Buffer.byteLength(emitted(x),'utf8');
 const prefix='checkpoints/scan-source-asof-connected-20261021/primary';
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
  const RUN='CONTROLLED_POST395878_PRIMARY_COPY',T=1792600000000;
  const make=(contract='ZEC-USDT',letter='a')=>{
   const c={status:'CLOSED',state:'OBSERVE',direction:'LONG',run_id:RUN,snapshot_id:'CONTROLLED:'+contract+':'+T,observed_ts:T,analytical_fingerprint:letter.repeat(64),candidates:[{contract}],metadata:{contract,direction_resolution:{status:'CLOSED',direction:'LONG',facts:[{direction:'LONG',origin:'FINAL_ROUTE',evidence_id:'CONTROLLED_ROUTE'}],early_receipt:{closed:false,reason:'CONTROLLED_NOT_NATIVE_REASON',source_ts:T-60000,available_at:null,evidence_ids:[]}},score_basis:{selected:'CONTROLLED_EXISTING_SCORE_BASIS',qualified_early_detection_0_100:0,deep_canonical_interest_0_100:null,routed_overall_0_100:0},private_full_payload:{secret:'NEVER_COPY_THIS_PRIVATE_FIELD'}}};
   return{canonical_analytical_bundle:{status:'CLOSED',canonical:c,parity_fingerprint:c.analytical_fingerprint,telegram:{status:'READY',length:500,max_length:1600},manual:{status:'READY'}},post_v7_canonical_persistence:{status:'CLOSED',persisted:true,publication_id:'PUB:'+letter.repeat(40),contract,direction:c.direction,run_id:RUN,snapshot_id:c.snapshot_id,observed_ts:T},direction_candidate:{direction:'LONG',origin:'DISCOVERY',source_ts:T-1000,confirmation_state:'DISCOVERY_ONLY',direction_raw:'LONG_WATCH'},stage392_shadow_integration:{full_evidence_persistence:{status:'CLOSED',persisted:true,insert_changes:1,error:null}}};
  };
  const project=(label,deep)=>projection[label](deep,{contract:deep.canonical_analytical_bundle.canonical.metadata.contract},RUN,'PARTIAL',false,false,{status:'CLOSED'},null,[]);
  const select=(label,rows)=>selection[label](RUN,{shortlist:rows.map(r=>({contract:r.contract,selection_score_0_100:80}))},{lane:'LIVE_DISCOVERY',top_two_contracts:rows.map(r=>r.contract)},{results:rows,plan:{selected:rows.map(r=>({contract:r.contract})),parameters:{configured_max_per_run:2}}},()=>0,{});
  const strip=row=>{const o=copy(row);delete o.canonical_analytical_result.initial_analysis_diagnostic;return o;};
  const meta=deep=>({direction_resolution:deep.canonical_analytical_bundle.canonical.metadata.direction_resolution,score_basis:deep.canonical_analytical_bundle.canonical.metadata.score_basis});
  const decode=d=>d.metadata_encoding==='COMPACT_PARSED_JSON_TEXT'?JSON.parse(d.metadata_json):d.metadata;
  const group=async(name,fn)=>controls.push({name,classification:'NEW_CONTROLLED_ACTUAL_BOUNDARY_SHAPE_NOT_RECOVERED_NATIVE_PAYLOAD',detail:await fn()});
  let presentationRow,encodedRow,edgeRow;
  await group('closed retained canonical remains diagnosable when only presentation bundle is NOT_CLOSED',async()=>{
   const d=make();d.canonical_analytical_bundle.status='NOT_CLOSED';d.canonical_analytical_bundle.telegram={status:'MESSAGE_TOO_LONG',length:1701,max_length:1600};const original=JSON.stringify(d),old=project('before',d),next=project('after',d);assert.equal(old.canonical_analytical_result.initial_analysis_diagnostic.status,'OMITTED_UNBOUND_CANONICAL');assert.deepEqual(strip(next),strip(old));const v=select('after',[next]).initial_analysis_diagnostics[0];assert.equal(v.complete,true);assert.equal(v.canonical_status,'CLOSED');assert.equal(v.bundle_status,'NOT_CLOSED');assert.equal(v.telegram_formatter_status,'MESSAGE_TOO_LONG');assert.equal(v.telegram_length,1701);assert.equal(v.telegram_max_length,1600);assert.equal(next.canonical_analytical_result.status,'NOT_CLOSED');assert.deepEqual(decode(v),meta(d));assert.equal(JSON.stringify(d),original);assert(emittedBytes(v)<=4096);assert(!JSON.stringify(v).includes('NEVER_COPY'));presentationRow=next;return v;
  });
  await group('V1 pretty overflow uses lossless compact JSON TEXT without raising4096 or omitting values',async()=>{
   const d=make('USELESS-USDT','b');d.canonical_analytical_bundle.canonical.state='REJECTED';d.canonical_analytical_bundle.canonical.direction=null;d.post_v7_canonical_persistence.direction=null;
   d.canonical_analytical_bundle.canonical.metadata.direction_resolution={status:'UNKNOWN',direction:null,early_receipt:{closed:false,source_ts:T-1000,available_at:null,predicate_receipt:{checks:[{predicate:'CONTROLLED_INITIAL_SCOPE',passed:false}],failed_predicates:['CONTROLLED_INITIAL_SCOPE'],CONTROLLED_ENCODING_LAYOUT_ONLY:Array.from({length:26},()=>({value:null,checked:false}))}}};
   const previous=JSON.stringify(d),old=project('before',d),next=project('after',d),v=select('after',[next]).initial_analysis_diagnostics[0];assert.equal(old.canonical_analytical_result.initial_analysis_diagnostic.status,'OMITTED_OVERSIZE');assert.deepEqual(strip(next),strip(old));assert.equal(v.complete,true);assert.equal(v.schema,'INITIAL_ANALYSIS_METADATA_DIAGNOSTIC_V2');assert.equal(v.metadata_encoding,'COMPACT_PARSED_JSON_TEXT');assert.equal(v.metadata,null);assert.deepEqual(decode(v),meta(d));assert.equal(JSON.stringify(d),previous);assert(emittedBytes(v)<=4096);encodedRow={deep:d,row:next,diagnostic:v};return{encoded_emitted_bytes:emittedBytes(v),metadata_text_bytes:Buffer.byteLength(v.metadata_json),canonical_direction:v.canonical_direction,original_metadata_recovered:false};
  });
  await group('V2 encoded exact4096 and one byte over include envelope escaping anddepth4',async()=>{
   const d=copy(encodedRow.deep);let padding=0;
   for(let i=0;i<4;i++){d.canonical_analytical_bundle.canonical.metadata.direction_resolution.CONTROLLED_EDGE='x'.repeat(padding);const expected={...encodedRow.diagnostic,metadata_json:JSON.stringify(meta(d))};padding+=4096-emittedBytes(expected);assert(padding>=0);}
   d.canonical_analytical_bundle.canonical.metadata.direction_resolution.CONTROLLED_EDGE='x'.repeat(padding);const row=project('after',d),v=select('after',[row]).initial_analysis_diagnostics[0];assert.equal(v.complete,true);assert.equal(emittedBytes(v),4096);assert.deepEqual(decode(v),meta(d));edgeRow=row;
   d.canonical_analytical_bundle.canonical.metadata.direction_resolution.CONTROLLED_EDGE+='x';const old=project('before',d).canonical_analytical_result.initial_analysis_diagnostic,over=project('after',d).canonical_analytical_result.initial_analysis_diagnostic;assert.deepEqual(over,old);assert.equal(over.status,'OMITTED_OVERSIZE');return{edge:4096,one_byte_over:4097,whole_omission:over.status,cap_raised:false};
  });
  await group('presentationNOT_CLOSED never bypasses canonical parity or retained receipt identity',async()=>{
   const changes=[['canonical-status',d=>d.canonical_analytical_bundle.canonical.status='NOT_CLOSED'],['parity',d=>d.canonical_analytical_bundle.parity_fingerprint='f'.repeat(64)],['retained-snapshot',d=>d.post_v7_canonical_persistence.snapshot_id='OTHER']];return changes.map(([name,change])=>{const d=make();d.canonical_analytical_bundle.status='NOT_CLOSED';d.canonical_analytical_bundle.telegram.status='MESSAGE_TOO_LONG';change(d);const row=project('after',d),v=select('after',[row]).initial_analysis_diagnostics[0];assert.equal(v.complete,false);assert.match(v.status,/^OMITTED_/);assert.equal(v.metadata,null);return{name,status:v.status};});
  });
  await group('V2 selected copy rejects presentation mutation invalid encoding and changed receipt while V1 fitting remains exact',async()=>{
   const variants=[['row-status',r=>r.canonical_analytical_result.status='NOT_CLOSED'],['formatter',r=>r.canonical_analytical_result.telegram_formatter_status='OTHER'],['encoded-negative-zero',r=>r.canonical_analytical_result.initial_analysis_diagnostic.metadata_json='{"direction_resolution":-0,"score_basis":null}'],['receipt',r=>r.post_v7_canonical_persistence.snapshot_id='OTHER']];const out=variants.map(([name,change])=>{const r=copy(encodedRow.row);change(r);const v=select('after',[r]).initial_analysis_diagnostics[0];assert.equal(v.complete,false);assert.match(v.status,/^OMITTED_/);return{name,status:v.status};});const d=make(),old=project('before',d),next=project('after',d);assert.deepEqual(next,old);assert.deepEqual(select('after',[next]),select('before',[old]));return{refusals:out,fitting_V1_unchanged:true};
  });
  await group('existing partial and fatal memory exporter preserve V2 with unknown0or1 and original refusal',async()=>{
   const audit=select('after',[presentationRow,encodedRow.row]),out=[];
   for(const unknown of [0,1]){let failure;const cron={run_id:RUN,status:'PARTIAL',completed_ts:T+2,universe_total:105,scanned:99,persistence_status:'NOT_CLOSED',v3_live_zero_reason:'STAGE0_SCAN_FAILED',v3_pipeline_health_reason:'STAGE0_SCAN_FAILED'},env={REPORT2_CURRENT_CYCLE_SELECTION_AUDIT:audit,REPORT2_LAST_STAGE0_UNIVERSE_AUDIT:{expected105:105,checked99:99}},processStub={env:{GITHUB_SHA:'CONTROLLED_HEAD'}};
    try{partial(cron,'CONTROLLED_GENERATION',processStub,env,{allowed:true,status:'CLOSED'});}catch(error){failure=error;}assert(failure?.partial_cron_failure);const files={},usage={requests:17,rows_read:23,rows_written:5,unknown_ops:unknown};await fatalExporter(failure,null,{writeFile:async(name,text)=>{files[name]=text;}},()=>{throw Error('NO_NEW_READER');},{exitCode:0},{error:()=>{}},null,{finalizeFailure:async()=>({status:'CONTROLLED_EXISTING_FINALIZATION',unknown_ops_preserved:unknown,usage_before:usage,usage_after:usage}),usage:()=>usage});const saved=JSON.parse(files['report2-failure-accounting.json']);assert.equal(saved.unknown_ops_preserved,unknown);assert.equal(saved.partial_cron_failure.cron.status,'PARTIAL');assert.deepEqual(saved.partial_cron_failure.candidate_selection_audit.initial_analysis_diagnostics,audit.initial_analysis_diagnostics);out.push({unknown_preserved:unknown,bytes:Buffer.byteLength(files['report2-failure-accounting.json']),diagnostic_bytes:audit.initial_analysis_diagnostics.map(emittedBytes),real_network:0});}
   return out;
  });
  assert.equal(unexpectedHTTP,0);assert.equal(unexpectedClock,0);return{status:'CONTROLLED_COMPONENT_COMPLETED',control_count:controls.length,controls,new_SQL:0,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,source_clock_refreshes:0,canonical_score_direction_or_publication_recalculated:false,old593_component_replayed:false,actual395878_missing_metadata_recovered:false,Telegram_restored:false};
 }catch(error){error.completed_new_control_groups=controls;throw error;}
 finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
}
