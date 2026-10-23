// ONE NEW callable, PREPARED UNEXECUTED. No registration, app autorun or SQLite.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {types as nodeUtilTypes} from 'node:util';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const PREFIX='anomaly-research/pending-operation-journal-20261023';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function runPendingOperationJournalConnected({repo_root}={}) {
  const groups=[],contexts=[],oldFetch=globalThis.fetch,oldNow=Date.now;let directory=null,network=0,serial=0,output=null,error=null;
  const add=(name,variants,detail={})=>groups.push({name,variants,status:'NEW_CONTROLLED_LOCAL_JOURNAL_ONLY',...detail});
  globalThis.fetch=async()=>{network++;throw Error('PENDING_JOURNAL_NATIVE_NETWORK_FORBIDDEN');};
  const T=1792749630000;Date.now=()=>T;
  try {
    const root=fs.realpathSync(repo_root),pkg=path.join(root,PREFIX),manifest=JSON.parse(fs.readFileSync(path.join(pkg,'manifest.json'),'utf8')),pins=JSON.parse(fs.readFileSync(path.join(pkg,'target-bindings.json'),'utf8'));
    for(const [name,pin]of Object.entries(manifest.payloads)){assert.ok(!name.includes('..')&&!path.isAbsolute(name));const b=fs.readFileSync(path.join(pkg,name));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
    const target=fs.readFileSync(path.join(root,pins.target));assert.equal(target.length,pins.after_bytes);assert.equal(sha(target),pins.after_sha256);
    for(const [rel,pin]of Object.entries(pins.unchanged_dependencies)){const b=fs.readFileSync(path.join(root,rel));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
    const runner=target.toString('utf8'),start=runner.indexOf('async function persistRunnerAnomalyReceipts('),end=runner.indexOf('\nasync function main()',start),block=runner.slice(start,end);assert.ok(start>0&&end>start);
    // ROOT fixture binding repair only: execute the exact literal budget declarations
    // from whole-file-pinned public carriers; their unrelated private lifecycle
    // import graph is not needed by this new journal capability case.
    const readPinnedBudgetDeclaration=(rel,name)=>{
      const source=fs.readFileSync(path.join(root,rel),'utf8'),prefix='export const '+name+'=Object.freeze({',start=source.indexOf(prefix);
      assert.ok(start>=0&&source.indexOf(prefix,start+prefix.length)<0);
      const end=source.indexOf('});',start);assert.ok(end>start&&end-start<2048);
      const declaration=source.slice(start,end+3);return new Function(declaration.replace(/^export /,'')+'\nreturn '+name+';')();
    };
    const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
    const k=await load('current-generation/files/src/anomaly-native-domain.mjs'),adapter=await load('runner/report2-d1-adapter.mjs'),guard=await load('runner/d1-preaction-budget-guard.mjs'),http=await load('current-generation/files/src/unified-budget.mjs'),lifecycle={V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET:readPinnedBudgetDeclaration('current-generation/files/src/v3-telegram-lifecycle-sidecar.mjs','V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET')},delivery={BOUND_TELEGRAM_DELIVERY_BUDGET:readPinnedBudgetDeclaration('current-generation/files/src/bound-telegram-delivery-sidecar.mjs','BOUND_TELEGRAM_DELIVERY_BUDGET')};
    const build=fsBackend=>new Function('fs','resolve','crypto','Buffer','Date','process','nodeUtilTypes','canonicalAnomalyJSON','prepareAnomalyCommit','verifyAnomalyReadback','readAnomalyOrigin','commitAnomalyBundle','readDueAnomalyBundles','ORIGIN_SQL','COMMIT_SQL','READBACK_SQL','DUE_SQL','evaluateWithinRunReservation','V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET','BOUND_TELEGRAM_DELIVERY_BUDGET',block+'\nreturn {open:openRunnerAnomalyPendingJournal,preflight:preflightRunnerAnomalyPendingJournal,install:installRunnerAnomalyParentCapability,persist:persistRunnerAnomalyReceipts};')(fsBackend,path.resolve,crypto,Buffer,Date,process,nodeUtilTypes,k.canonical,k.prepareAnomalyCommit,k.verifyAnomalyReadback,k.readAnomalyOrigin,k.commitAnomalyBundle,k.readDueAnomalyBundles,k.ORIGIN_SQL,k.COMMIT_SQL,k.READBACK_SQL,k.DUE_SQL,guard.evaluateWithinRunReservation,lifecycle.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,delivery.BOUND_TELEGRAM_DELIVERY_BUDGET);
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'report2-pending-journal-'));
    const baseIdentity={generation:'CONTROLLED_JOURNAL_NOT_NATIVE',source_head:'b'.repeat(40),cloud_run_id:'150001',reservation_id:`R2RUN:${T}:0123456789abcdef`,day_utc:new Date(T).toISOString().slice(0,10)};
    const makePrepared=(operation='CONTROLLED_INIT')=>{
      const descriptor={schema:'OPAQUE_HTX_NATIVE_LISTING_DATE_RECORD_V1',venue:'HTX',market:'LINEAR_SWAP',contract_code:'BTC-USDT',symbol:'BTC',pair:'BTC-USDT',business_type:'swap',contract_type:'swap',trade_partition:'USDT',raw_native_listing_date:'20201021',raw_contract_size:0.001,raw_price_tick:0.1,metadata_source_ts:T-32000,metadata_observed_ts:T-31000,source_ref:'CONTROLLED_LOCAL_JOURNAL',parsed_metadata_row_sha256:'a'.repeat(64),raw_body_sha256:null,listing_ts:null,instrument_epoch:null,native_epoch_qualified:false};
      const card={event_start_ts:T-930000,event_end_ts:T-30000,first_known_ts:T-10000,timeframe:'15m',instrument:{contract:'BTC-USDT'},CONTROLLED_fixture_only:true};card.card_hash=k.digest(card);
      const plan=k.lockedOutcomePlan(card),logical_event_id=k.opaqueLogicalEventKey(card,descriptor),state={evaluated_ts:T-10000,watch:{active:true,next_check_ts:T+300000},last_snapshot:{ts:T-30000,id:'CONTROLLED_ORIGINAL',sha256:'a'.repeat(64)},revisions:[],outcomes:Object.fromEntries(plan.cells.map(c=>[c.key,{status:'PENDING',target_ts:c.target_ts}])),outbox:{first:{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,source_snapshot_id:'CONTROLLED_ORIGINAL',message_ru:'Контролируемый черновик. Отправки нет.'}},native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false};
      return k.prepareAnomalyCommit({logical_event_id,operation_id:operation,expected_revision:0,card,descriptor,plan,state});
    };
    const prepared=makePrepared();
    const makeRow=p=>{const r=p.request,s=JSON.parse(r.state_json);return{...r,operation_id:r.operation_id,request_sha256:r.request_sha256,logical_event_id:r.logical_event_id,receipt_logical_event_id:r.logical_event_id,expected_revision:r.expected_revision,applied_revision:r.expected_revision+1,revision:r.expected_revision+1,last_operation_id:r.operation_id,receipt_card_sha256:r.card_sha256,receipt_descriptor_sha256:r.descriptor_sha256,receipt_plan_sha256:r.plan_sha256,receipt_state_sha256:r.state_sha256,receipt_first_known_ts:r.first_known_ts,watch_active:Number(s.watch.active),next_check_ts:s.watch.next_check_ts,last_snapshot_ts:s.last_snapshot.ts,server_recorded_ts_floor_ms:T};};
    const policy={origin:{rows_read:16,rows_written:0},write:{rows_read:64,rows_written:16},read:{rows_read:16,rows_written:0},due:{rows_read:16,rows_written:0}};
    async function context({file,expected,mode={},identity=baseIdentity,omitJournal=false,cost_bounds=policy}={}){
      serial++;const dir=path.join(directory,'context-'+serial);fs.mkdirSync(dir);file??=path.join(dir,'pending.private');const trace=[],modeRef=mode;let db,store=null;
      const mapFile=x=>typeof x==='string'&&x.startsWith('report2-anomaly-domain-receipts.json')?path.join(dir,x):x;
      const backend={...fsp,writeFile:(name,...args)=>fsp.writeFile(mapFile(name),...args),rename:async(from,to)=>{
        if(String(from).endsWith('.next')){const s=JSON.parse(await fsp.readFile(from,'utf8')),phase=s.records.at(-1)?.phase;if(modeRef.failPhase===phase)throw Error('CONTROLLED_JOURNAL_RENAME_FAILURE');if(modeRef.changeUsageAtIntent&&phase==='WRITE_STARTED'){modeRef.changeUsageAtIntent=false;const prior=db.usageSnapshot;db.usageSnapshot=()=>({...prior.call(db),rows_read:prior.call(db).rows_read+1});}}
        return fsp.rename(mapFile(from),mapFile(to));
      }};
      const api=build(backend),journal=omitJournal?null:await api.open({file,identity,expected_sha256:expected??null,initialize_empty:expected===undefined});
      db=new adapter.RemoteD1Database('https://controlled.invalid/pending-journal','CONTROLLED_NO_TOKEN',{fetchImpl:async(url,options)=>{
        assert.equal(String(url),'https://controlled.invalid/pending-journal');const q=JSON.parse(options.body);trace.push(q);
        let reply;
        if(q.sql===k.ORIGIN_SQL)reply=store;
        else if(q.sql===k.COMMIT_SQL){
          const disk=JSON.parse(fs.readFileSync(file,'utf8')),e=disk.records.at(-1);assert.equal(e.phase,'WRITE_STARTED');assert.equal(e.prepared_text,q.params[0]);assert.equal(e.request_sha256,prepared.request.request_sha256);assert.equal(e.expected_revision,0);
          if(modeRef.beforeWrite)throw Error('CONTROLLED_LOST_BEFORE_WRITE');store=makeRow(prepared);if(modeRef.afterWrite)throw Error('CONTROLLED_LOST_AFTER_WRITE');reply={success:true,meta:{changes:0},CONTROLLED_known_write_reply:true,...(modeRef.largeReply?{CONTROLLED_oversize:'x'.repeat(70000)}:{})};
        }else if(q.sql===k.READBACK_SQL){const e=JSON.parse(fs.readFileSync(file,'utf8')).records.at(-1);assert.equal(e.phase,'READBACK_STARTED');assert.equal(JSON.parse(e.write_reply_text).CONTROLLED_known_write_reply,true);reply=store;}
        else throw Error('UNEXPECTED_NEW_JOURNAL_SQL_TEMPLATE');
        return new Response(JSON.stringify({ok:true,result:reply,usage:{measured:true,rows_read:modeRef.exceedWrite&&q.sql===k.COMMIT_SQL?100:2,rows_written:q.sql===k.COMMIT_SQL?2:0}}),{status:200});
      }});
      const env={DATA_DB:db},reservation={rows_read:54000,rows_written:840},receipt={status:'RESERVED',reservation_id:identity.reservation_id,day_utc:identity.day_utc,...reservation};
      const cap=api.install({env,db,reservation,reservation_id:identity.reservation_id,receipt,day_admission:{allowed:true},http_budget:http.createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12}),post_v7:true,cost_bounds,pending_journal:journal,on_receipt:s=>api.persist(s,{pending_checkpoint:journal?.checkpoint()??null})});
      const c={dir,file,api,journal,db,env,cap,trace,mode:modeRef};contexts.push(c);return c;
    }
    const call=c=>c.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:prepared.request.logical_event_id,prepare_from_origin:origin=>{assert.equal(origin,null);return prepared;}});
    const reject=(f,pattern)=>assert.rejects(f,pattern),data=file=>JSON.parse(fs.readFileSync(file,'utf8'));
    let c=await context();assert.equal(c.cap.installed,true);let r=await call(c);assert.equal(r.status,'COMMITTED_RECEIPT_READBACK');assert.equal(c.trace.length,3);let disk=data(c.file),e=disk.records[0];assert.equal(e.phase,'RETURNED');assert.equal(e.prepared_text,prepared.text);assert.deepEqual(JSON.parse(e.readback_reply_text),makeRow(prepared));assert.equal(JSON.parse(e.write_reply_text).CONTROLLED_known_write_reply,true);
    const firstCommitted={file:c.file,sha256:c.journal.checkpoint().file_sha256};
    const metadata=fs.readFileSync(path.join(c.dir,'report2-anomaly-domain-receipts.json'),'utf8');assert.equal(data(path.join(c.dir,'report2-anomaly-domain-receipts.json')).pending_checkpoint.file_sha256,c.journal.checkpoint().file_sha256);assert.equal(metadata.includes(prepared.text),false);assert.equal(metadata.includes('known_write_reply'),false);
    add('EXACT_PREPARED_AND_INTENT_BEFORE_ACTUAL_SDK_TRANSPORT_THEN_KNOWN_REPLIES_BEFORE_RETURN',1,{CONTROLLED_bridge_SQL_templates:3,private_pending_not_exported_in_metadata:true});
    const actual=build(fsp),missing=path.join(directory,'missing.private');await reject(()=>actual.open({file:missing,identity:baseIdentity,expected_sha256:'a'.repeat(64)}),/ENOENT/);await reject(()=>actual.open({file:c.file,identity:baseIdentity,expected_sha256:null,initialize_empty:true}),/EEXIST|UNRESOLVED_SEQUENCE_CLAIM/);await reject(()=>actual.open({file:c.file,identity:baseIdentity,expected_sha256:'a'.repeat(64)}),/EXPECTED_SHA_CONFLICT/);await reject(()=>actual.open({file:c.file,identity:{...baseIdentity,cloud_run_id:'150002'},expected_sha256:sha(fs.readFileSync(c.file))}),/IDENTITY_OR_SHAPE_CONFLICT/);
    const corrupt=path.join(directory,'corrupt.private');fs.writeFileSync(corrupt,'{"broken":',{mode:0o600});await reject(()=>actual.open({file:corrupt,identity:baseIdentity,expected_sha256:sha(fs.readFileSync(corrupt))}),/JSON|Unexpected|Expected/i);
    const sym=path.join(directory,'link.private');fs.symlinkSync(c.file,sym);await reject(()=>actual.open({file:sym,identity:baseIdentity,expected_sha256:sha(fs.readFileSync(c.file))}),/REAL_FILE_REQUIRED/);
    add('EXPLICIT_TRUSTED_INIT_AND_MISSING_CORRUPT_FOREIGN_EXPECTATION_REFUSALS',6,{ENOENT_never_means_empty:true});
    for(const mode of [{beforeWrite:true},{afterWrite:true}]){
      c=await context({mode});r=await call(c);assert.equal(r.status,'UNKNOWN_COMMIT_ACK');assert.equal(c.trace.length,2);assert.equal(c.db.usageSnapshot().unknown_ops,1);const original=r.effective_prepared.text,cut=c.journal.checkpoint();await c.cap.close();
      const restart=await context({file:c.file,expected:cut.file_sha256});assert.equal(restart.cap.installed,true);let callbacks=0;const restored=await restart.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:prepared.request.logical_event_id,prepare_from_origin:()=>{callbacks++;throw Error('NO_NEW_OPERATION');}});assert.equal(callbacks,0);assert.equal(restart.trace.length,0);assert.equal(restored.operation_id,prepared.request.operation_id);assert.equal(restored.effective_prepared.text,original);assert.equal(restored.effective_prepared.request.card_json,prepared.request.card_json);assert.equal(restored.effective_prepared.request.first_known_ts,prepared.request.first_known_ts);assert.equal(JSON.parse(restored.effective_prepared.request.plan_json).cells.length,16);assert.ok(Object.values(JSON.parse(restored.effective_prepared.request.state_json).outbox).every(x=>x.status==='DRAFT'&&x.actual_send===false));assert.equal(Object.isFrozen(restored.effective_prepared.request),true);assert.equal(restored.retained_prior_usage.unknown_ops,1);assert.equal(restored.automatic_SQL_retry,false);assert.equal(restored.new_operation_id_allowed,false);assert.equal(restart.db.usageSnapshot().unknown_ops,0);await reject(()=>restart.db.prepare('SELECT 1').first(),/ADMISSION|JOURNAL|USAGE/);assert.equal(restart.trace.length,0);
    }
    add('BEFORE_AND_AFTER_WRITE_UNKNOWN_REOPEN_SAME_IDENTITY_NO_NEW_CALLBACK_OR_SQL',2,{fresh_SDK_zero_does_not_reset_retained_unknown:true});
    c=await context({mode:{exceedWrite:true}});r=await call(c);assert.equal(r.status,'COMMIT_REPLY_RETAINED_RECONCILIATION_REQUIRED');assert.equal(c.trace.length,2);assert.equal(r.write_reply.CONTROLLED_known_write_reply,true);const saved=data(c.file).records[0];assert.equal(JSON.parse(saved.write_reply_text).CONTROLLED_known_write_reply,true);assert.equal(saved.usage_after.rows_read,102);const fresh=await context({file:c.file,expected:c.journal.checkpoint().file_sha256});const restored=await fresh.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:prepared.request.logical_event_id,prepare_from_origin:()=>{throw Error('NO_NEW_ID');}});assert.equal(restored.known_write_reply.CONTROLLED_known_write_reply,true);assert.equal(restored.retained_prior_usage.rows_read,102);assert.equal(fresh.trace.length,0);
    add('KNOWN_WRITE_REPLY_AND_EXCEEDED_COST_RETAINED_BEFORE_ANY_READBACK',1,{known_reply_not_native_ACK:true});
    const pendingSample={file:c.file,sha256:c.journal.checkpoint().file_sha256};
    const wire={op:'run',sql:k.COMMIT_SQL,params:[prepared.text]},readWire={op:'first',sql:k.READBACK_SQL,params:[prepared.request.operation_id],column:null},known={success:true,CONTROLLED:true},usage={requests:1,rows_read:2,rows_written:0,unknown_ops:0};
    for(const phase of ['PREPARED','WRITE_STARTED','WRITE_REPLY','READBACK_STARTED','READBACK_REPLY']){
      const file=path.join(directory,'phase-'+phase+'.private'),j=await actual.open({file,identity:baseIdentity,expected_sha256:null,initialize_empty:true});await j.begin(prepared,usage);
      if(phase!=='PREPARED')await j.beforeIO(wire,usage);if(['WRITE_REPLY','READBACK_STARTED','READBACK_REPLY'].includes(phase))await j.afterIO(wire,known,usage);if(['READBACK_STARTED','READBACK_REPLY'].includes(phase))await j.beforeIO(readWire,usage);if(phase==='READBACK_REPLY')await j.afterIO(readWire,makeRow(prepared),usage);
      const reopened=await build(fsp).open({file,identity:baseIdentity,expected_sha256:j.checkpoint().file_sha256});assert.equal(reopened.blocked(),true);const one=reopened.restored()[0];assert.equal(one.restored_pending_phase,phase);assert.equal(one.effective_prepared.text,prepared.text);assert.equal(one.new_operation_id_allowed,false);if(['WRITE_REPLY','READBACK_STARTED','READBACK_REPLY'].includes(phase))assert.deepEqual(one.known_write_reply,known);
    }
    add('LOCAL_REOPEN_AT_EACH_PREPARED_INTENT_AND_KNOWN_REPLY_BOUNDARY',5,{process_kill_or_power_loss_simulated:false});
    for(const failPhase of ['PREPARED','WRITE_STARTED','WRITE_REPLY']){
      c=await context({mode:{failPhase}});r=await call(c);assert.notEqual(r.status,'COMMITTED_RECEIPT_READBACK');assert.equal(c.trace.some(q=>q.sql===k.READBACK_SQL),false);assert.equal(c.trace.filter(q=>q.sql===k.COMMIT_SQL).length,failPhase==='WRITE_REPLY'?1:0);assert.equal(fs.existsSync(c.file+'.next'),true);await reject(()=>build(fsp).open({file:c.file,identity:baseIdentity,expected_sha256:sha(fs.readFileSync(c.file))}),/UNRESOLVED_NEXT_FILE/);
      if(failPhase==='WRITE_REPLY')assert.equal(JSON.parse(data(c.file+'.next').records[0].write_reply_text).CONTROLLED_known_write_reply,true);
    }
    add('FAILED_ATOMIC_REPLACEMENT_STOPS_TRANSPORT_OR_READBACK_AND_REQUIRES_EXPLICIT_RECOVERY',3,{next_candidate_not_auto_promoted:true});
    c=await context({mode:{changeUsageAtIntent:true}});r=await call(c);assert.equal(c.trace.length,1);assert.equal(c.trace[0].sql,k.ORIGIN_SQL);assert.notEqual(r.status,'COMMITTED_RECEIPT_READBACK');assert.equal(data(c.file).records[0].prepared_text,prepared.text);
    add('PARENT_AND_USAGE_RECHECK_AFTER_ASYNC_JOURNAL_BEFORE_SQL',1);
    c=await context({omitJournal:true});assert.equal(c.cap.installed,false);assert.equal(c.trace.length,0);c=await context({cost_bounds:null});assert.equal(c.cap.installed,false);assert.equal(c.trace.length,0);
    add('MISSING_JOURNAL_AND_NULL_NATIVE_POLICY_STAY_UNINSTALLED',2,{native_activation_or_default_policy_change:false});
    const file=path.join(directory,'identity-conflicts.private'),j=await actual.open({file,identity:baseIdentity,expected_sha256:null,initialize_empty:true});await j.begin(prepared,usage);const held=j.checkpoint();await reject(()=>j.begin(prepared,usage),/ACTIVE_PENDING_BLOCKS_SQL/);assert.equal(j.checkpoint().file_sha256,held.file_sha256);
    const changed=data(file);changed.records[0].operation_id='FOREIGN';fs.writeFileSync(file,k.canonical(changed));await reject(()=>build(fsp).open({file,identity:baseIdentity,expected_sha256:sha(fs.readFileSync(file))}),/IMMUTABLE_REQUEST_CONFLICT/);
    add('ACTIVE_OPERATION_AND_PREPARED_IDENTITY_CANNOT_BE_REPLACED',2);
    // New local concurrency boundary: stale writer read precedes the winner,
    // but its delayed exclusive sequence claim cannot overwrite the winner.
    const concurrent=path.join(directory,'concurrent.private');let enter,release;const entered=new Promise(r=>{enter=r;}),released=new Promise(r=>{release=r;});
    const init=await build(fsp).open({file:concurrent,identity:baseIdentity,expected_sha256:null,initialize_empty:true}),empty=init.checkpoint().file_sha256;
    const winner=await build(fsp).open({file:concurrent,identity:baseIdentity,expected_sha256:empty});
    const delayedBackend={...fsp,open:async(name,...args)=>{if(String(name)===concurrent+'.step-001'){enter();await released;}return fsp.open(name,...args);}};
    const delayed=await build(delayedBackend).open({file:concurrent,identity:baseIdentity,expected_sha256:empty}),loser=delayed.begin(prepared,usage);
    await entered;await winner.begin(prepared,usage);release();await reject(()=>loser,/EEXIST/);assert.equal(data(concurrent).records[0].prepared_text,prepared.text);assert.equal(sha(fs.readFileSync(concurrent)),winner.checkpoint().file_sha256);
    const interrupted=path.join(directory,'interrupted.private'),stopped=await build(fsp).open({file:interrupted,identity:baseIdentity,expected_sha256:null,initialize_empty:true});fs.writeFileSync(interrupted+'.step-001','CONTROLLED interrupted claim',{mode:0o600});await reject(()=>build(fsp).open({file:interrupted,identity:baseIdentity,expected_sha256:stopped.checkpoint().file_sha256}),/UNRESOLVED_SEQUENCE_CLAIM/);
    fs.unlinkSync(concurrent+'.step-001');await reject(()=>build(fsp).open({file:concurrent,identity:baseIdentity,expected_sha256:winner.checkpoint().file_sha256}),/ENOENT/);
    add('IMMUTABLE_SEQUENCE_CLAIM_PREVENTS_DELAYED_WRITER_OVERWRITE_AND_LOST_STEP_REOPEN',3,{exclusive_claims_not_auto_removed:true});
    const preArgs={generation:baseIdentity.generation,source_head:baseIdentity.source_head,cloud_run_id:baseIdentity.cloud_run_id};
    const prior=await actual.preflight({...preArgs,file:firstCommitted.file,expected_sha256:firstCommitted.sha256});assert.equal(prior.status,'CLOSED_PRIOR_JOURNAL_PRECHECKED');assert.equal(prior.SQL,0);
    await reject(()=>actual.preflight({...preArgs,file:pendingSample.file,expected_sha256:pendingSample.sha256}),/PENDING_RESTART_STOPS_BEFORE_NEW_PARENT_SQL/);
    const emptyTarget=path.join(directory,'explicit-empty-target.private'),newTarget=await actual.preflight({...preArgs,file:emptyTarget,expected_sha256:'INITIALIZE_EMPTY'});assert.equal(newTarget.status,'EXPLICIT_EMPTY_TARGET_CHECKED_NOT_CREATED');assert.equal(fs.existsSync(emptyTarget),false);
    const mainStart=runner.indexOf('\nasync function main()'),early=runner.indexOf('await preflightRunnerAnomalyPendingJournal(',mainStart),dbBuild=runner.indexOf('  const env = buildEnv();',mainStart);assert.ok(early>mainStart&&early<dbBuild);
    await reject(()=>actual.preflight({...preArgs,file:emptyTarget,expected_sha256:undefined}),/INDEPENDENT_EXPECTED_SHA_REQUIRED/);await reject(()=>actual.preflight({...preArgs,source_head:'FOREIGN',file:emptyTarget,expected_sha256:'INITIALIZE_EMPTY'}),/CURRENT_EXECUTION_IDENTITY_REQUIRED/);
    add('RESTORED_PENDING_PREFLIGHT_BEFORE_NEW_PARENT_SDK_CONSTRUCTION',5,{actual_preflight_called:true,MAIN_not_executed:true,explicit_init_does_not_create_before_parent:true});
    c=await context({mode:{largeReply:true}});r=await call(c);assert.equal(r.known_reply_persistence_failed,true);assert.equal(r.write_reply.CONTROLLED_oversize.length,70000);assert.equal(c.trace.length,2);assert.equal(c.trace.some(q=>q.sql===k.READBACK_SQL),false);const bounded=data(c.file).records[0];assert.equal(bounded.prepared_text,prepared.text);assert.equal(bounded.write_reply_text,null);assert.equal(JSON.parse(bounded.result_text).known_reply_persistence_failed,true);
    const boundedRestart=await context({file:c.file,expected:c.journal.checkpoint().file_sha256});const overflowRestored=await boundedRestart.env.REPORT2_ANOMALY_DOMAIN_COMMIT({logical_event_id:prepared.request.logical_event_id,prepare_from_origin:()=>{throw Error('NO_OVERSIZE_RETRY');}});assert.equal(overflowRestored.known_reply_persistence_failed,true);assert.equal(overflowRestored.known_write_reply,null);assert.equal(boundedRestart.trace.length,0);
    add('OVERSIZED_KNOWN_REPLY_REMAINS_RETURNED_BUT_PERSISTENCE_IS_NOT_FABRICATED',1,{reply_persistence_not_qualified:true,fail_closed_before_readback:true});
    assert.equal(groups.length,12);assert.equal(network,0);
    output={schema:'PENDING_OPERATION_JOURNAL_CONNECTED_V1',status:'NEW_CONTROLLED_PENDING_JOURNAL_COMPONENT_RETURNED',groups,actual_new_CONTROLLED_groups:groups.length,actual_new_CONTROLLED_variants:groups.reduce((n,g)=>n+g.variants,0),actual_existing_runner_fs_and_capability:true,actual_RemoteD1_client_with_CONTROLLED_reply_transport:true,local_same_workspace_restart_only:true,cross_job_or_native_durability_qualified:false,native_ACK_qualified:false,installed_schema_qualified:false,provider_HTTP:0,native_SQL:0,SQLite:0,MAIN:0,Telegram:0,old_components_replayed:0,author_execution:0};
  }catch(e){error=e;}
  finally{
    try{for(const c of contexts)try{await c.cap.close();}catch{}if(directory)fs.rmSync(directory,{recursive:true,force:true});}catch(e){if(!error)error=e;}
    finally{Date.now=oldNow;globalThis.fetch=oldFetch;}
  }
  if(error){error.partial_result={schema:'PENDING_JOURNAL_PARTIAL_V1',groups,actual_completed_groups:groups.length,actual_completed_variants:groups.reduce((n,g)=>n+g.variants,0),network_attempts:network,global_restored:Date.now===oldNow&&globalThis.fetch===oldFetch};throw error;}
  return{...output,fixture_cleanup_removed:true,global_restored:Date.now===oldNow&&globalThis.fetch===oldFetch};
}
