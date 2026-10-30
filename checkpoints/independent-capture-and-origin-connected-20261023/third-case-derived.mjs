// ONE ROOT-owned callable, TEXT proposal. Author execution: UNEXECUTED.
// Run serially only after applying the two exact proposed target edits.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const sha=s=>createHash('sha256').update(s).digest('hex');
const prefix='anomaly-research/independent-capture-ingress-20261023';
function span(text,marker){
  const starts=[];let offset=0;for(const line of text.split('\n')){if(line.startsWith(marker))starts.push(offset);offset+=line.length+1;}
  assert.equal(starts.length,1,'unique column-zero actual Worker function marker');
  const start=starts[0],rest=text.slice(start+marker.length),next=/\n(?:export )?(?:async )?function [A-Za-z_$]/.exec(rest);
  assert(next,'bounded next actual top-level function');return text.slice(start,start+marker.length+next.index+1);
}
export async function runIndependentCaptureIngressCases({repo_root}={}){
  assert.equal(typeof repo_root,'string');const root=resolve(repo_root),binding=JSON.parse(await readFile(join(root,'checkpoints/independent-capture-and-origin-connected-20261023/third-stage-bindings.json'),'utf8'));
  const groups=[],cases=[];let temp=null;let pinCount=0;
  try{
  for(const [file,pin] of Object.entries(binding.targets)){
    const bytes=await readFile(join(root,file));assert.equal(bytes.length,pin.after_bytes,file);assert.equal(sha(bytes),pin.after_sha256,file);pinCount++;
  }
  const ingressTarget='current-generation/files/src/anomaly-native-ingress.mjs',workerText=await readFile(join(root,'current-generation/files/src/worker.js'),'utf8'),parts={};
  for(const [name,pin] of Object.entries(binding.worker_functions)){
    parts[name]=span(workerText,pin.start_marker);assert.equal(Buffer.byteLength(parts[name]),pin.bytes,name);assert.equal(sha(parts[name]),pin.sha256,name);pinCount++;
  }
  const copied=[];
  for(const [runtime,pin] of Object.entries(binding.public_closure)){
    const bytes=await readFile(join(root,pin.source)),target=runtime===ingressTarget?binding.targets[ingressTarget]:null;
    assert.equal(bytes.length,target?target.after_bytes:pin.bytes,pin.source);assert.equal(sha(bytes),target?target.after_sha256:pin.sha256,pin.source);copied.push({runtime,bytes});pinCount++;
  }
  // This exact alias is already in apply-runtime-overlay.mjs. Public files only.
  const overlay=await readFile(join(root,binding.runtime_alias.accepted_overlay),'utf8');
  assert.equal(Buffer.byteLength(overlay),binding.runtime_alias.overlay_bytes);assert.equal(sha(overlay),binding.runtime_alias.overlay_sha256);assert.equal(overlay.split(binding.runtime_alias.exact_existing_statement).length,2);pinCount++;
  temp=await mkdtemp(join(tmpdir(),'report2-independent-ingress-'));let transport=null;
  try{
    for(const {runtime,bytes} of copied){const file=join(temp,runtime);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
    const url=n=>pathToFileURL(join(temp,'current-generation/files/src',n)).href;
    const ingress=await import(url('anomaly-native-ingress.mjs')),parser=await import(url('htx-trade-json.mjs')),tape=await import(url('htx-signed-tape.mjs'));
    const scope=await import(url('approved-htx-analysis-scope.mjs')),domain=await import(url('anomaly-native-domain.mjs'));
    const context=vm.createContext({Date,URL,AbortController,Buffer,setTimeout,clearTimeout,
      observeHtxAcquisitionAttempt:tape.observeHtxAcquisitionAttempt,parseHtxMarketJson:parser.parseHtxMarketJson,
      fetch:(...args)=>{assert(transport,'no default or real fetch');return transport(...args);}});
    const fetchJson=vm.runInContext('('+parts.fetchJson+')',context),classify=vm.runInContext('('+parts.classifyHtxInstrumentScope+')',context);
    const roster=ingress.independentAnomalyCaptureRoster(),seed=ingress.initialIndependentAnomalyCaptureCursor(),cursor=JSON.parse(seed);
    const run=async(name,fn)=>{tape.clearHtxSignedTapeSnapshots();transport=null;await fn();cases.push(name);};
    const group=async(name,fn)=>{const start=cases.length;await fn();groups.push({name,cases:cases.slice(start),status:'CONTROLLED_PASS'});};
    const noNative=r=>{for(const key of ['native_epoch_qualified','event_first_knowledge_qualified','native_admission_qualified','SENT_claimed'])assert.equal(r[key],false,key);assert.equal(r.continuous105_coverage_qualified,false);assert.equal(r.durable_cursor_qualified,false);assert.equal(r.spot.used,false);};
    function driver(options={}){
      const seen=[],admissions=[],drafts=[];
      transport=async(url,init)=>{
        assert.equal(init.method,'GET');assert.equal(new URL(url).hostname,'api.hbdm.com');seen.push(url);
        const u=new URL(url),contract=u.searchParams.get('contract_code'),asset=contract.slice(0,-5),now=Date.now();let payload;
        if(u.pathname==='/linear-swap-api/v1/swap_contract_info'){
          let row={contract_code:contract,symbol:asset,pair:contract,contract_status:1,business_type:'swap',contract_type:'swap',trade_partition:'USDT',create_date:'20200101',contract_size:1,price_tick:0.001,labels:[],tradfi_labels:[]};
          if(options.missingLabels)delete row.labels;if(options.forex)row.labels=['forex'];if(options.wrongSymbol)row.symbol='OTHER';
          payload={status:'ok',ts:now-(options.staleMetadata?120001:0),data:options.absent?[]:options.duplicate?[row,{...row}]:[row]};
        }else{
          assert.equal(u.pathname,'/linear-swap-ex/market/history/kline');assert.equal(u.searchParams.get('period'),'1min');assert.equal(u.searchParams.get('size'),'2000');
          const end=Math.floor(now/900000)*900000,start=end-21*900000,data=Array.from({length:315},(_,index)=>({id:(start+index*60000)/1000,open:100,high:index>=300?105:101,low:index>=300?95:99,close:100,trade_turnover:!options.normal&&index>=300?300:30,vol:30,amount:30,count:1}));
          if(options.gap)data.splice(120,1);if(options.futureOnly)data.splice(0,315,{...data[0],id:(end+60000)/1000});
          payload={status:'ok',ch:`market.${options.wrongChannel?'BTC-USDT':contract}.kline.1min`,ts:now,data};
        }
        const text=options.invalidJSON&&seen.length===2?'not-json':JSON.stringify(payload);
        return{ok:true,status:200,text:async()=>text};
      };
      const env={REPORT2_ANOMALY_INDEPENDENT_CAPTURE_ENABLED:'1',REPORT2_ANOMALY_CAPTURE_CURSOR:options.cursor??seed,
        REPORT2_ANOMALY_CAPTURE_IO:async(request,execute)=>{admissions.push(request);assert.equal(request.attempts,1);assert.equal(request.requires_current_parent_provider_shared_day_minute_budget,true);assert.equal(request.requires_preserved_main_LIQ_manual_reserve,true);assert.equal(request.requires_available_anomaly_persistence_slot,true);assert.equal(request.contract,new URL(request.url).searchParams.get('contract_code'));if(options.denyAt===admissions.length)return{allowed:true};return await execute();},
        REPORT2_ANOMALY_DOMAIN_COMMIT:async candidate=>{drafts.push(candidate);const prepared=candidate.prepare_from_origin(null);assert.equal(prepared.request.logical_event_id,candidate.logical_event_id);const card=JSON.parse(prepared.request.card_json),descriptor=JSON.parse(prepared.request.descriptor_json);assert.equal(card.instrument.contract,new URL(seen[0]).searchParams.get('contract_code'));assert.equal(descriptor.source_ref,'SAME_HTX_INDEPENDENT_CURSOR_CAPTURE_METADATA_RECORD');assert.equal(card.capture_mode,'REPLAY');assert.equal(card.discovery,'BACKFILLED');assert.equal(card.knowledge_limits.first_durable_recorded_ts,null);if(options.parentReply)return options.parentReply(candidate,prepared);return{status:'COMMITTED_RECEIPT_READBACK',logical_event_id:candidate.logical_event_id,operation_id:prepared.request.operation_id,cost_status:'WITHIN_CALLER_PROJECTION',native_admission_qualified:false};}};
      return{env,seen,admissions,drafts,call:()=>ingress.runIndependentCapturedAnomalyIngress({env,run_id:'CONTROLLED_NEW_INDEPENDENT_INGRESS',fetch_json:fetchJson,classify_contract:classify})};
    }
    await group('default_off_and_real_callbacks',async()=>{
      await run('OFF has no IO even with other callbacks',async()=>{const d=driver();d.env.REPORT2_ANOMALY_INDEPENDENT_CAPTURE_ENABLED='0';const r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_DEFAULT_OFF');assert.equal(d.seen.length,0);noNative(r);});
      await run('enabled caller boolean is no actual IO capability',async()=>{const d=driver();d.env.REPORT2_ANOMALY_CAPTURE_IO=true;const r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_ACTUAL_CALLBACKS_REQUIRED');assert.equal(d.seen.length,0);});
      await run('missing parent domain callback avoids pointless capture IO',async()=>{const d=driver();delete d.env.REPORT2_ANOMALY_DOMAIN_COMMIT;assert.equal((await d.call()).status,'INDEPENDENT_CAPTURE_ACTUAL_CALLBACKS_REQUIRED');assert.equal(d.seen.length,0);});
    });
    await group('fixed_registry_and_explicit_cursor',async()=>{
      await run('105/122 structural membership is not available coverage',async()=>{assert.equal(roster.analysis_assets,105);assert.equal(roster.native_contracts,122);assert.equal(roster.unsupported_other_native_contracts,17);assert.equal(roster.current_useful_coverage,null);assert.equal(scope.APPROVED_HTX_ANALYSIS_CONTRACTS[0].contract_code,'AAVE-USDT');});
      for(const [name,text] of [['missing',undefined],['foreign',domain.canonical({...cursor,roster_sha256:'0'.repeat(64)})],['index105',domain.canonical({...cursor,next_index:105})],['extra',domain.canonical({...cursor,grant:true})],['noncanonical',' '+seed]])await run('cursor '+name+' refuses before IO',async()=>{const d=driver();d.env.REPORT2_ANOMALY_CAPTURE_CURSOR=text;assert.equal((await d.call()).status,'INDEPENDENT_CURSOR_NOT_CLOSED');assert.equal(d.seen.length,0);});
      await run('last explicit registry slot wraps without claiming whole sweep',async()=>{const d=driver({cursor:domain.canonical({...cursor,next_index:104}),absent:true}),r=await d.call();assert.equal(r.selected_contract,scope.APPROVED_HTX_ANALYSIS_CONTRACTS[104].contract_code);assert.equal(JSON.parse(r.next_cursor_proposed).next_index,0);assert.equal(r.full_roster_sweep_completed,false);});
    });
    await group('actual_worker_capture_to_public_observer',async()=>{
      await run('AAVE outside supplied top2 uses exact parser body completion and existing observer',async()=>{const d=driver();d.env.REPORT2_DEEP_TOP2=['BTC-USDT','ETH-USDT'];const r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_OBSERVER_RETURNED');assert.equal(r.selected_contract,'AAVE-USDT');assert.equal(d.seen.length,2);assert.equal(d.admissions.length,2);assert.equal(d.drafts.length,1);assert.equal(r.source_HTTP_attempts,2);assert.equal(r.useful_closed_windows,1);assert.equal(JSON.parse(r.next_cursor_proposed).next_index,1);assert.equal(r.discovery_not_promoted_from_REPLAY,true);const basis=tape.capturedHtxAnomalyBasis({contract:'AAVE-USDT',now:Date.now()});assert.equal(r.provenance.body_text_sha256,basis.body_receipt.body_knowledge.body_text_sha256);assert.equal(r.provenance.hash_scope,'SHA256_UTF8_RESPONSE_TEXT');noNative(r);});
      await run('quiet factual closed window advances without creating event',async()=>{const d=driver({normal:true}),r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_CLOSED_NO_EVENT_IN_LAST_15M');assert.equal(r.useful_closed_windows,1);assert.equal(d.drafts.length,0);assert.equal(JSON.parse(r.next_cursor_proposed).next_index,1);});
    });
    await group('each_IO_requires_actual_execution_result',async()=>{
      for(const i of [1,2])await run('IO '+i+' boolean reply cannot execute or continue',async()=>{const d=driver({denyAt:i}),r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_NOT_CLOSED');assert.equal(d.seen.length,i-1);assert.equal(d.drafts.length,0);assert.equal(r.next_cursor_proposed,seed);noNative(r);});
      await run('returned fabricated payload cannot become capture',async()=>{const d=driver();d.env.REPORT2_ANOMALY_CAPTURE_IO=async request=>({ok:true,url:request.url,http_status:200,data:{status:'ok',ts:Date.now(),data:[]}});const r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_NOT_CLOSED');assert.equal(d.seen.length,0);});
      await run('completed execution but copied result identity is refused',async()=>{const d=driver();d.env.REPORT2_ANOMALY_CAPTURE_IO=async(_request,execute)=>({...await execute()});assert.equal((await d.call()).status,'INDEPENDENT_CAPTURE_NOT_CLOSED');assert.equal(d.seen.length,1);assert.equal(d.drafts.length,0);});
      await run('saved execute closure expires when callback returns',async()=>{const d=driver();let saved;d.env.REPORT2_ANOMALY_CAPTURE_IO=async(_request,execute)=>{saved=execute;return true;};await d.call();assert.throws(()=>saved(),/ONCE_CURRENT_DEADLINE/);assert.equal(d.seen.length,0);});
      await run('second execute is refused with at most one source attempt',async()=>{const d=driver();d.env.REPORT2_ANOMALY_CAPTURE_IO=async(_request,execute)=>{const r=await execute();assert.throws(()=>execute(),/ONCE_CURRENT_DEADLINE/);return r;};const r=await d.call();assert.equal(d.seen.length,2);assert.equal(r.status,'INDEPENDENT_CAPTURE_OBSERVER_RETURNED');});
    });
    await group('metadata_is_current_exact_and_classified',async()=>{
      for(const option of ['absent','duplicate','missingLabels','forex','wrongSymbol','staleMetadata'])await run('metadata '+option+' creates no candle IO or draft',async()=>{const d=driver({[option]:true}),r=await d.call();assert.equal(d.seen.length,1);assert.equal(d.drafts.length,0);assert.equal(r.useful_closed_windows,0);assert.equal(r.next_cursor_proposed===seed,option==='staleMetadata');noNative(r);});
    });
    await group('completed_minute_payload_remains_exact',async()=>{
      for(const option of ['gap','futureOnly','wrongChannel','invalidJSON'])await run('minutes '+option+' is not useful window or event',async()=>{const d=driver({[option]:true}),r=await d.call();assert.equal(d.seen.length,2);assert.equal(d.drafts.length,0);assert.equal(r.useful_closed_windows,0);noNative(r);});
      await run('parsed caller payload with no completion receipt is not captured authority',async()=>{const d=driver(),r=await ingress.runIndependentCapturedAnomalyIngress({env:d.env,run_id:'NO_COMPLETION',classify_contract:classify,fetch_json:async url=>{const response=await transport(url,{method:'GET'}),data=parser.parseHtxMarketJson(await response.text(),url);return{ok:true,url,http_status:200,data};}});assert.equal(r.status,'INDEPENDENT_SAME_COMPLETED_CAPTURE_NOT_CLOSED');assert.equal(d.drafts.length,0);});
    });
    await group('parent_unknown_or_unbound_never_advances_cursor',async()=>{
      for(const [name,reply] of [['unknown',()=>({status:'UNKNOWN_COMMIT_ACK',new_operation_id_allowed:false})],['missing cost',candidate=>({status:'COMMITTED_RECEIPT_READBACK',logical_event_id:candidate.logical_event_id})],['wrong event',()=>({status:'COMMITTED_RECEIPT_READBACK',logical_event_id:'WRONG',cost_status:'WITHIN_CALLER_PROJECTION'})],['reply persistence failed',candidate=>({status:'COMMITTED_RECEIPT_READBACK',logical_event_id:candidate.logical_event_id,cost_status:'WITHIN_CALLER_PROJECTION',known_reply_persistence_failed:true})]])await run('parent '+name+' holds exact cursor and native qualifiers',async()=>{const d=driver({parentReply:reply}),r=await d.call();assert.equal(r.status,'INDEPENDENT_CAPTURE_OBSERVER_RETURNED');assert.equal(r.next_cursor_proposed,seed);assert.equal(d.seen.length,2);noNative(r);});
      await run('bound existing stored-duplicate origin receipt advances without new native claim',async()=>{const d=driver({parentReply:candidate=>({status:'STORED_DUPLICATE',logical_event_id:candidate.logical_event_id,write_required:false,durable_new_observation:false,origin_receipt:{status:'VERIFIED_RETAINED_ORIGIN',cost_status:'WITHIN_CALLER_PROJECTION'}})}),r=await d.call();assert.equal(JSON.parse(r.next_cursor_proposed).next_index,1);noNative(r);});
    });
    // Pins re-read; no source acquisition/network/SQL/native sender exists in this callable.
    for(const {runtime,bytes} of copied){const current=await readFile(join(root,binding.public_closure[runtime].source));assert.equal(sha(current),sha(bytes));}
    return{schema:'INDEPENDENT_CAPTURE_INGRESS_CONTROLLED_RESULT_V1',groups,group_count:groups.length,case_count:cases.length,public_pin_checks_before:pinCount,public_closure_entries:copied.length,controlled_transport_only:true,author_execution:'UNEXECUTED',future_callable_execution:'CONTROLLED_PUBLIC_CLOSURE_ONLY',provider_HTTP:0,native_SQL:0,Telegram:0,native_admission_qualified:false,native_epoch_qualified:false,event_first_knowledge_qualified:false,continuous105_coverage_qualified:false,installed_scheduler_qualified:false,actual_budget_policy_qualified:false,empirical_accuracy:null};
  }finally{transport=null;await rm(temp,{recursive:true,force:true});temp=null;}
  }catch(error){const e=error instanceof Error?error:Error(String(error));e.partial_result={schema:'INDEPENDENT_CAPTURE_CONTROLLED_PARTIAL_V1',groups,cases,group_count:groups.length,case_count:cases.length,public_pin_checks_before:pinCount,provider_HTTP:0,native_SQL:0,Telegram:0};throw e;}
}
