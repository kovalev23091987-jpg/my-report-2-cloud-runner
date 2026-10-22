// ONE new prepared component. No registration, application import or autorun.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const PREFIX='anomaly-research/native-card-watch-wire-20261021';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const T=Math.floor(1792608000000/900000)*900000;

// Fixture producer only: these are synthetic source responses, not native facts.
export function createControlledCapturedAnomalyCandidate({tape,ingress,source_offset_ms=10000,known_offset_ms=30002,body_order=false,contract_size=0.001}={}){
  tape.clearHtxSignedTapeSnapshots();
  const row={contract_code:'BTC-USDT',symbol:'BTC',pair:'BTC-USDT',create_date:'20201021',contract_size,price_tick:0.1,business_type:'swap',contract_type:'swap',trade_partition:'USDT',contract_status:1};
  const metadata={status:'ok',ts:T+1000,data:[row]};
  const data=Array.from({length:315},(_,i)=>({id:(T-315*60000+i*60000)/1000,open:100,high:i>=300?104:101,low:i>=300?96:99,close:i>=300?100.2:100,trade_turnover:i>=300?200:10}));
  const minutes=body_order?{data,ts:T+source_offset_ms,ch:'market.BTC-USDT.kline.1min',status:'ok'}:{status:'ok',ch:'market.BTC-USDT.kline.1min',ts:T+source_offset_ms,data};
  const minuteURL='https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=BTC-USDT&period=1min';
  const metaURL='https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code=BTC-USDT';
  tape.observeHtxSignedTape(metadata,metaURL,T+2000);
  tape.observeHtxSignedTape(minutes,minuteURL,T+known_offset_ms-1);
  tape.observeHtxAcquisitionAttempt({url:minuteURL,stage:'COMPLETED',started_ts:T+3000,received_ts:T+known_offset_ms-10002,http_status:200,body_completed_ts:T+known_offset_ms-2,body_text:JSON.stringify(minutes)});
  const candidate=ingress.prepareCapturedAnomalyCardWatch({contract:'BTC-USDT',known_ts:T+known_offset_ms});
  assert.equal(candidate.status,'ANOMALY_DRAFT_CANDIDATE');
  return{candidate,metadata,minutes,known_ts:T+known_offset_ms,body_sha256:sha(JSON.stringify(minutes))};
}

export async function runNativeCardWatchWireConnected({runtime_root,baseline_runtime_root,repo_root}={}){
  const repo=fs.realpathSync(repo_root),src=fs.realpathSync(runtime_root),baseSrc=fs.realpathSync(baseline_runtime_root),pkg=path.join(repo,PREFIX);
  const manifest=json(path.join(pkg,'manifest.json')),pins=json(path.join(pkg,'target-pins.json')),link=json(path.join(pkg,'linked-source.json'));
  for(const item of manifest.files){const b=fs.readFileSync(path.join(pkg,item.path));assert.equal(b.length,item.bytes);assert.equal(sha(b),item.sha256,'OWN_PACKAGE_PIN:'+item.path);}
  const loaderPath=path.join(repo,link.loader.path),loaderBytes=fs.readFileSync(loaderPath);
  assert.equal(loaderBytes.length,link.loader.bytes);assert.equal(sha(loaderBytes),link.loader.sha256,'SOURCE_LOADER_PIN');
  for(const [rel,pin]of Object.entries(link.files)){const b=fs.readFileSync(path.join(repo,rel));assert.equal(sha(b),pin,'LINKED_SOURCE_PIN:'+rel);}
  const runtime=path.dirname(src);
  for(const [relative,repoPath]of [['src/worker.js','current-generation/files/src/worker.js'],['src/anomaly-native-domain.mjs','current-generation/files/src/anomaly-native-domain.mjs'],['src/anomaly-native-ingress.mjs','current-generation/files/src/anomaly-native-ingress.mjs'],['src/anomaly-record-observer.mjs','anomaly-research/observer/observer.mjs']]){
    const b=fs.readFileSync(path.join(runtime,relative));assert.equal(b.length,pins.targets[repoPath].after_bytes);assert.equal(sha(b),pins.targets[repoPath].after_sha256,'ACTUAL_NEW_RUNTIME_PIN:'+relative);
  }
  // Reconstruct before bytes without importing the Worker or replaying old cases.
  const worker=fs.readFileSync(path.join(src,'worker.js'),'utf8');let beforeWorker=worker;
  for(const insertion of pins.worker_insertions){assert.equal(beforeWorker.split(insertion.new_text).length,2);beforeWorker=beforeWorker.replace(insertion.new_text,'');}
  assert.equal(sha(beforeWorker),pins.targets['current-generation/files/src/worker.js'].before_sha256);
  const legacyCall=worker.indexOf('      await runOpportunityShadowCycle({');
  const optional=worker.indexOf(pins.worker_insertions[2].new_text);
  assert.ok(legacyCall>0&&legacyCall<optional&&optional<worker.indexOf('  const executionRefresh = await refreshHtxExecutionQuoteIfNeeded({'));
  const kernelText=fs.readFileSync(path.join(src,'anomaly-native-domain.mjs'),'utf8'),append='\n'+fs.readFileSync(path.join(pkg,'origin-kernel.insertion.txt'),'utf8');
  assert.ok(kernelText.endsWith(append));assert.equal(sha(kernelText.slice(0,-append.length)),pins.targets['current-generation/files/src/anomaly-native-domain.mjs'].before_sha256);
  const observerText=fs.readFileSync(path.join(src,'anomaly-record-observer.mjs'),'utf8'),typed=fs.readFileSync(path.join(pkg,'opaque-boundary.insertion.txt'),'utf8');
  const branch=" if(i?.binding_kind==='OPAQUE_NATIVE_RECORD'){need(hash(i)===hash(opaqueRecordInstrument(i.native_record)),'OPAQUE_NATIVE_INSTRUMENT_MISMATCH');return clone(i);}\n";
  assert.equal(observerText.split(typed).length,2);assert.equal(observerText.split(branch).length,2);
  assert.equal(sha(observerText.replace(typed,'').replace(branch,'')),pins.targets['anomaly-research/observer/observer.mjs'].before_sha256);
  const oldFetch=globalThis.fetch,oldNow=Date.now;let clock=T+30002,networkAttempts=0;
  globalThis.fetch=async()=>{networkAttempts++;throw Error('NATIVE_PROVIDER_NETWORK_FORBIDDEN');};Date.now=()=>clock;
  const contexts=[],groups=[];
  let directory=null,component,api,tape,ingress,DatabaseSync,serial=0;
  const add=(name,variants=1,detail={})=>groups.push({name,variants,classification:'NEW_CONTROLLED_INGRESS_RESTART_NOT_NATIVE_QUALIFICATION',...detail});
  try{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'report2-new-anomaly-ingress-'));
    const loader=await import(pathToFileURL(loaderPath).href);
    api=await loader.loadRunnerAnomalyParentCapability({runtime_root:src,baseline_runtime_root:baseSrc,repo_root:repo});
    ({DatabaseSync}=await import('node:sqlite'));
    tape=await import(pathToFileURL(path.join(src,'htx-signed-tape.mjs')).href);
    ingress=await import(pathToFileURL(path.join(src,'anomaly-native-ingress.mjs')).href);
    const observer=await import(pathToFileURL(path.join(src,'anomaly-record-observer.mjs')).href);
    const policy={origin:{rows_read:16,rows_written:0},write:{rows_read:64,rows_written:16},read:{rows_read:16,rows_written:0}};
    const createContext=(file,existing=false)=>{
      serial++;if(file===undefined)file=path.join(directory,'fixture-'+serial+'.sqlite');
      const sql=new DatabaseSync(file);if(!existing)sql.exec(fs.readFileSync(path.join(runtime,'migrations/20261021_anomaly_domain.sql'),'utf8'));
      const trace=[],mode={},retained=[];
      const db=new api.adapter.RemoteD1Database('https://controlled.invalid/d1','CONTROLLED_NO_NATIVE_TOKEN',{fetchImpl:async(url,request)=>{
        assert.equal(String(url),'https://controlled.invalid/d1');const p=JSON.parse(request.body);
        assert.ok([api.kernel.ORIGIN_SQL,api.kernel.COMMIT_SQL,api.kernel.READBACK_SQL].includes(p.sql),'UNEXPECTED_SQL_BEYOND_NEW_THREE');
        trace.push({op:p.op,SQL_sha256:sha(p.sql),params_sha256:sha(JSON.stringify(p.params))});
        if(mode.failBeforeWrite&&p.op==='run')throw Error('CONTROLLED_LOST_REPLY_BEFORE_WRITE');
        const before=Number(sql.prepare('SELECT total_changes() AS n').get().n);let result;
        if(p.op==='first')result=sql.prepare(p.sql).get(...p.params)??null;
        else if(p.op==='run'){const r=sql.prepare(p.sql).run(...p.params);result={success:true,meta:{changes:Number(r.changes)}};}
        else throw Error('CONTROLLED_SQL_OPERATION_NOT_ALLOWED');
        if(mode.failAfterWrite&&p.op==='run')throw Error('CONTROLLED_LOST_REPLY_AFTER_WRITE');
        if(p.sql===api.kernel.ORIGIN_SQL&&result&&mode.orphanReply)result={...result,operation_id:null,request_sha256:null};
        if(p.sql===api.kernel.ORIGIN_SQL&&result&&mode.oversizeOrigin)result={...result,card_json:'x'.repeat(32769)};
        return new Response(JSON.stringify({ok:true,result,usage:{measured:true,rows_read:4,rows_written:Number(sql.prepare('SELECT total_changes() AS n').get().n)-before}}),{status:200,headers:{'content-type':'application/json'}});
      }});
      const env={DATA_DB:db},reservation={rows_read:54000,rows_written:840},reservation_id=`R2RUN:${T+serial}:0123456789abcdef`;
      const receipt={status:'RESERVED',reservation_id,day_utc:new Date(clock).toISOString().slice(0,10),...reservation};
      const http_budget=api.http.createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12});
      const capability=api.install({env,db,reservation,reservation_id,receipt,day_admission:{allowed:true},http_budget,post_v7:true,cost_bounds:policy,on_receipt:record=>{retained.push(structuredClone(record));}});
      assert.equal(capability.installed,true);assert.deepEqual(capability.protected_budget,{rows_read:9448,rows_written:244});
      const context={file,sql,db,env,trace,mode,retained,capability,closed:false};contexts.push(context);return context;
    };
    const close=async c=>{if(c.closed)return;await c.capability.close();c.sql.close();c.closed=true;};
    const call=async(c,candidate)=>c.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:candidate.logical_event_id,prepare_from_origin:candidate.prepare_from_origin});
    const row=(c,id)=>c.sql.prepare(api.kernel.ORIGIN_SQL).get(id)??null;
    const immutable=r=>({card_json:r.card_json,card_sha256:r.card_sha256,first_known_ts:r.first_known_ts,descriptor_json:r.descriptor_json,descriptor_sha256:r.descriptor_sha256,plan_json:r.plan_json,plan_sha256:r.plan_sha256});
    const capture=options=>createControlledCapturedAnomalyCandidate({tape,ingress,...options});

    const prepareText=pins.worker_insertions[1].new_text;
    let shaperCalls=0;const env={};const absent=new Function('env','prepareCapturedAnomalyCardWatch','contract','now',prepareText+'\nreturn anomalyDomainCandidate;');
    assert.equal(absent(env,()=>{shaperCalls++;throw Error('MISSING_HOOK_MUST_SKIP_SHAPER');},'BTC-USDT',clock),null);assert.equal(shaperCalls,0);assert.deepEqual(Object.keys(env),[]);
    add('actual_new_worker_insertions_preserve_before_bytes_and_missing_hook_skips_shaper',1,{old_cycle_not_invoked:true,legacy_bytehash_preserved:true});

    let first=capture({}),initial=first.candidate.prepare_from_origin(null);
    const parts={card:JSON.parse(initial.request.card_json),descriptor:JSON.parse(initial.request.descriptor_json),plan:JSON.parse(initial.request.plan_json),state:JSON.parse(initial.request.state_json)};
    assert.equal(parts.card.instrument.identity_verified,false);assert.equal(parts.card.instrument.asset_id,null);assert.equal(parts.descriptor.instrument_epoch,null);assert.equal(parts.card.discovery,'BACKFILLED');
    assert.equal(parts.card.provenance.raw_sha256,first.body_sha256);assert.equal(parts.plan.cells.length,16);assert.equal(parts.state.watch.active,true);
    assert.ok(parts.plan.cells.some(x=>x.direction==='LONG'&&x.horizon_ms===7776000000)&&parts.plan.cells.some(x=>x.direction==='SHORT'&&x.horizon_ms===7776000000));
    assert.ok(Object.values(parts.state.outcomes).every(x=>x.status==='PENDING'));assert.equal(parts.state.outbox.capture0.status,'DRAFT');assert.equal(parts.state.outbox.capture0.actual_send,false);
    for(const name of ['native_epoch_qualified','event_first_knowledge_qualified','native_admission_qualified'])assert.equal(parts.state[name],false);
    assert.throws(()=>observer.detectClosed({instrument:{...parts.card.instrument,identity_verified:true},timeframe:'15m',alignment_offset_ms:0,bars:[],known_ts:first.known_ts,provenance:parts.card.provenance}),/OPAQUE_NATIVE_INSTRUMENT_MISMATCH/);
    add('same_completed_capture_uses_existing_detector_opaque_false_and_full_original_plan',2,{provider_HTTP:0,SQL:0,first_knowledge_scope:'WORKER_RECORD_ONLY'});

    let c=createContext();let result=await call(c,first.candidate);assert.equal(result.status,'COMMITTED_RECEIPT_READBACK');assert.equal(c.trace.length,3);
    assert.equal(c.retained.length,1);assert.equal(c.capability.receipts().records[0].status,'COMMITTED_RECEIPT_READBACK');
    assert.equal(c.capability.receipts().records[0].request_sha256,result.effective_prepared.request.request_sha256);
    const origin=row(c,first.candidate.logical_event_id),original=immutable(origin);assert.equal(origin.revision,1);assert.equal(origin.operation_id,initial.request.operation_id);
    assert.equal(api.kernel.verifyAnomalyOriginRow(origin,first.candidate.logical_event_id).receipt.status,'COMMITTED_RECEIPT_READBACK');
    add('actual_source_capability_initial_origin_write_readback_three_rpc',1,{full_runtime_files:api.binding.runtime_files,non_target_equal:api.binding.non_target_equal});

    const file=c.file;await close(c);clock=T+60002;c=createContext(file,true);
    const later=capture({known_offset_ms:60002});assert.equal(later.candidate.logical_event_id,first.candidate.logical_event_id);assert.notEqual(later.candidate.first_known_ts,first.candidate.first_known_ts);
    result=await call(c,later.candidate);assert.equal(result.status,'STORED_DUPLICATE');assert.equal(c.trace.length,1);assert.deepEqual(immutable(row(c,later.candidate.logical_event_id)),original);
    const format=capture({known_offset_ms:65002,body_order:true});clock=T+65002;assert.notEqual(format.body_sha256,first.body_sha256);assert.equal(format.candidate.observation_fingerprint,first.candidate.observation_fingerprint);
    result=await call(c,format.candidate);assert.equal(result.status,'STORED_DUPLICATE');assert.equal(c.trace.length,2);assert.equal(row(c,format.candidate.logical_event_id).revision,1);
    add('fresh_client_memory_clock_and_body_format_do_not_create_new_initial_or_revision',2,{restart_is_CONTROLLED_client_restart:true,auto_durable_pending_journal_proven:false});

    clock=T+90002;const newFacts=capture({source_offset_ms:70000,known_offset_ms:90002});assert.equal(newFacts.candidate.logical_event_id,first.candidate.logical_event_id);assert.notEqual(newFacts.candidate.observation_fingerprint,first.candidate.observation_fingerprint);
    const previousState=JSON.parse(row(c,newFacts.candidate.logical_event_id).state_json),beforeRPC=c.trace.length;
    result=await call(c,newFacts.candidate);assert.equal(result.status,'COMMITTED_RECEIPT_READBACK');assert.equal(c.trace.length-beforeRPC,3);
    const changed=row(c,newFacts.candidate.logical_event_id),nextState=JSON.parse(changed.state_json);assert.equal(changed.revision,2);assert.deepEqual(immutable(changed),original);
    assert.deepEqual(nextState.watch,previousState.watch);assert.deepEqual(nextState.outbox,previousState.outbox);assert.deepEqual(nextState.outcomes,previousState.outcomes);assert.deepEqual(nextState.last_snapshot,previousState.last_snapshot);assert.equal(nextState.revisions.length,2);
    assert.ok(changed.operation_id.startsWith('ANOMALY_OBS:'));await close(c);
    add('new_source_facts_same_event_append_only_revision_preserving_original_and_due_plan',1,{new_notice_sent:false,watch_price_or_outcome_evaluation:false});

    for(const capacity of ['revisions','outbox']){
      clock=T+30002;c=createContext();first=capture({});await call(c,first.candidate);
      const fill=retained=>{
        const state=structuredClone(retained.state);
        if(capacity==='revisions')while(state.revisions.length<32)state.revisions.push({CONTROLLED_reference:state.revisions.length});
        else while(Object.keys(state.outbox).length<32)state.outbox['CONTROLLED_'+Object.keys(state.outbox).length]={...state.outbox.capture0};
        return api.kernel.prepareAnomalyCommit({logical_event_id:retained.logical_event_id,operation_id:'CONTROLLED_CAPACITY_'+capacity,expected_revision:retained.revision,card:retained.card,descriptor:retained.descriptor,plan:retained.plan,state});
      };
      result=await c.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:first.candidate.logical_event_id,prepare_from_origin:fill});assert.equal(result.status,'COMMITTED_RECEIPT_READBACK');
      clock=T+90002;const next=capture({source_offset_ms:70000,known_offset_ms:90002}),before=c.trace.length;
      result=await call(c,next.candidate);assert.equal(result.status,'DEFERRED_CAPACITY');assert.equal(c.trace.length-before,1);assert.equal(row(c,next.candidate.logical_event_id).revision,2);await close(c);
    }
    clock=T+30002;c=createContext();first=capture({});await call(c,first.candidate);
    clock=T+90002;const material=capture({source_offset_ms:70000,known_offset_ms:90002,contract_size:0.002});assert.equal(material.candidate.logical_event_id,first.candidate.logical_event_id);
    const verified=api.kernel.verifyAnomalyOriginRow(row(c,first.candidate.logical_event_id),first.candidate.logical_event_id);assert.throws(()=>material.candidate.prepare_from_origin(verified),/MATERIAL_MULTIPLIER_CONFLICT/);
    const wires=c.trace.length;result=await call(c,material.candidate);assert.equal(c.trace.length-wires,1);assert.equal(row(c,first.candidate.logical_event_id).revision,1);await close(c);
    add('saturated_revision_or_outbox_and_material_multiplier_conflict_defer_without_drop',3);

    for(const afterWrite of [false,true]){
      clock=T+30002;c=createContext();first=capture({});c.mode[afterWrite?'failAfterWrite':'failBeforeWrite']=true;
      result=await call(c,first.candidate);assert.equal(result.status,'UNKNOWN_COMMIT_ACK');const pending=result.effective_prepared;assert.ok(pending);assert.equal(result.new_operation_id_allowed,false);assert.equal(c.trace.length,2);
      const unknownBefore=c.db.usageSnapshot(),again=await call(c,first.candidate);assert.equal(again,result);assert.equal(c.trace.length,2);assert.ok(unknownBefore.unknown_ops>0);
      await assert.rejects(c.db.prepare('SELECT 1').first(),/D1_LOCAL_HTTP_ADMISSION_DENIED|ANOMALY_NATIVE_USAGE_NOT_CLOSED/);assert.equal(c.trace.length,2);
      const lostFile=c.file,oldDb=c.db;await close(c);clock=T+60002;c=createContext(lostFile,true);
      if(afterWrite){const fresh=capture({known_offset_ms:60002});result=await call(c,fresh.candidate);assert.equal(result.status,'STORED_DUPLICATE');assert.equal(c.trace.length,1);assert.equal(result.origin_receipt.origin.operation_id,pending.request.operation_id);assert.equal(result.origin_receipt.origin.request_sha256,pending.request.request_sha256);}
      else{result=await c.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:pending.request.logical_event_id,prepare_from_origin:origin=>{assert.equal(origin,null);return pending;}});assert.equal(result.status,'COMMITTED_RECEIPT_READBACK');assert.equal(result.effective_prepared,pending);assert.equal(c.trace.length,3);}
      assert.equal(result.operation_id,pending.request.operation_id);assert.equal(oldDb.usageSnapshot().unknown_ops,unknownBefore.unknown_ops);await close(c);
    }
    add('lost_before_or_after_write_keeps_same_pending_prepared_opid_and_old_unknown',2,{pending_DTO_explicitly_retained_by_CONTROLLED_harness:true,production_durable_pending_artifact_not_qualified:true});

    for(const mode of ['orphanReply','oversizeOrigin']){
      clock=T+30002;c=createContext();first=capture({});await call(c,first.candidate);c.mode[mode]=true;let callbackCalls=0;const before=c.trace.length;
      result=await c.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:first.candidate.logical_event_id,prepare_from_origin:()=>{callbackCalls++;return initial;}});
      assert.equal(result.status,'ORIGIN_NOT_CLOSED');assert.equal(callbackCalls,0);assert.equal(c.trace.length-before,1);assert.equal(row(c,first.candidate.logical_event_id).revision,1);await close(c);
    }
    add('orphan_left_join_and_oversize_origin_never_become_absence_or_new_initial',2);
    assert.equal(groups.length,8);assert.equal(networkAttempts,0);
    component={schema:'NATIVE_CARD_WATCH_WIRE_CONNECTED_V1',status:'NEW_CONTROLLED_INGRESS_RESTART_COMPONENT_COMPLETED',groups,controlled_groups:groups.length,nested_variants:groups.reduce((n,g)=>n+g.variants,0),actual_existing_detector_card_watch:true,actual_same_tape_capture_map:true,actual_source_capability_factory:true,actual_RemoteD1_into_LocalSQLite:true,original_kernel_atomic_DDL_unchanged:true,source_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,old_components_replayed:0,author_semantics:0,independent105_connected:false,native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false,SENT_claimed:false,production_durable_pending_artifact_qualified:false};
  } catch(error){error.completed_new_ingress_groups=groups;throw error;}
  finally{
    try{
      for(const c of contexts)if(!c.closed){try{await c.capability.close();}finally{c.sql.close();c.closed=true;}}
      if(directory!==null)fs.rmSync(directory,{recursive:true,force:true});
    }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
  }
  component.fixture_cleanup_removed=directory===null||!fs.existsSync(directory);return component;
}
