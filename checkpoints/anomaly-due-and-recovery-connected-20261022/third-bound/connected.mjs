// ONE NEW callable, UNEXECUTED by author. No registration or application imports.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const PREFIX='checkpoints/anomaly-due-and-recovery-connected-20261022/third-bound',T=Math.floor(1792653600000/900000)*900000,MIN=60000;
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export async function runDueWatchConsumerConnected({runtime_root,baseline_runtime_root,repo_root}={}){
  const repo=fs.realpathSync(repo_root),src=fs.realpathSync(runtime_root),base=fs.realpathSync(baseline_runtime_root),pkg=path.join(repo,PREFIX);
  const manifest=json(path.join(pkg,'manifest.json')),pins=json(path.join(pkg,'target-pins.json')),link=json(path.join(pkg,'linked-source.json'));
  for(const q of manifest.files){const b=fs.readFileSync(path.join(pkg,q.path));assert.equal(b.length,q.bytes);assert.equal(sha(b),q.sha256);}
  for(const [p,h]of Object.entries(link.files))assert.equal(sha(fs.readFileSync(path.join(repo,p))),h,'NEW_SOURCE_PACKAGE_PIN:'+p);
  const loaderFile=path.join(repo,link.loader.path),loaderBytes=fs.readFileSync(loaderFile);assert.equal(loaderBytes.length,link.loader.bytes);assert.equal(sha(loaderBytes),link.loader.sha256);
  const moduleFile=path.join(src,'anomaly-native-due-watch.mjs');assert.equal(sha(fs.readFileSync(moduleFile)),pins.consumer.sha256);
  let oldWorker=fs.readFileSync(path.join(src,'worker.js'),'utf8');assert.equal(sha(oldWorker),pins.worker.after_sha256);
  for(const insertion of pins.worker.insertions){assert.equal(oldWorker.split(insertion.text).length,2);oldWorker=oldWorker.replace(insertion.text,'');}
  assert.equal(sha(oldWorker),pins.worker.before_sha256);
  const contexts=[],groups=[],oldFetch=globalThis.fetch,oldNow=Date.now;let directory=null,clock=T+60*MIN+30000,network=0,serial=0,api,tape,consumer,observer,DatabaseSync,result;
  const add=(name,variants=1,details={})=>groups.push({name,variants,classification:'NEW_CONTROLLED_DUE_CONSUMER_NOT_NATIVE_QUALIFICATION',...details});
  globalThis.fetch=async()=>{network++;throw Error('PROVIDER_OR_NATIVE_NETWORK_FORBIDDEN');};Date.now=()=>clock;
  try{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'report2-new-due-watch-'));
    const loader=await import(pathToFileURL(loaderFile).href);api=await loader.loadRunnerAnomalyDueParentCapability({runtime_root:src,baseline_runtime_root:base,repo_root:repo});
    assert.equal(api.binding.runtime_files,618);assert.equal(api.binding.non_target_equal,617);
    ({DatabaseSync}=await import('node:sqlite'));tape=await import(pathToFileURL(path.join(src,'htx-signed-tape.mjs')).href);consumer=await import(pathToFileURL(moduleFile).href);observer=await import(pathToFileURL(path.join(src,'anomaly-record-observer.mjs')).href);
    const k=api.kernel,policy={origin:{rows_read:16,rows_written:0},write:{rows_read:64,rows_written:16},read:{rows_read:16,rows_written:0},due:{rows_read:16,rows_written:0}};
    const metadata=(symbol,ts,size=0.001)=>({status:'ok',ts,data:[{contract_code:symbol+'-USDT',symbol,pair:symbol+'-USDT',create_date:'20201021',contract_size:size,price_tick:0.1,business_type:'swap',contract_type:'swap',trade_partition:'USDT',contract_status:1}]});
    function seed(sql,symbol,index,{inactive=false,modify}={}){
      const known=T+30002+index,m=metadata(symbol,T-1000),descriptor=k.opaqueHtxDescriptor({metadata:m,contract:symbol+'-USDT',observed_ts:T,source_ref:'CONTROLLED_DUE_SEED_METADATA'});
      const bars=Array.from({length:21},(_,i)=>({start_ts:T-(21-i)*15*MIN,end_ts:T-(20-i)*15*MIN,open:100,high:i===20?104:101,low:i===20?96:99,close:i===20?100.2:100,volume:i===20?3000:150}));
      const detected=observer.detectClosed({instrument:observer.opaqueRecordInstrument(descriptor),timeframe:'15m',alignment_offset_ms:0,bars,provenance:{raw_sha256:'a'.repeat(64),raw_ref:'CONTROLLED_INITIAL_CANDLE',source_as_of_ts:T+10000,received_ts:known,evidence_class:'CONTROLLED'},known_ts:known,mode:'REPLAY'});assert.equal(detected.events.length,1);
      const card=detected.events[0],model=observer.capture(observer.newMemory({max_active:1,max_cards:2}),card,{watch_mode:'HISTORICAL_REVIEW'}),plan=k.lockedOutcomePlan(card),logical_event_id=k.opaqueLogicalEventKey(card,descriptor);
      const state={evaluated_ts:known,watch:model.state.watch[card.event_id],last_snapshot:{ts:T+10000,id:'CONTROLLED_INITIAL',sha256:'a'.repeat(64)},revisions:[{observation_kind:'CONTROLLED_DUE_SEED',observation_fingerprint:k.digest(logical_event_id)}],outcomes:Object.fromEntries(plan.cells.map(c=>[c.key,{target_ts:c.target_ts,status:'PENDING'}])),outbox:{capture0:{status:'DRAFT',form_status:'NOT_APPROVED',actual_send:false,source_snapshot_id:'CONTROLLED_INITIAL',message_ru:'CONTROLLED DRAFT; no send'}},native_admission_qualified:false,event_first_knowledge_qualified:false,native_epoch_qualified:false};
      if(inactive){state.watch.active=false;state.watch.status='REFUTED';state.watch.hypotheses={LONG:'REFUTED',SHORT:'REFUTED'};}
      modify?.(state);const prepared=k.prepareAnomalyCommit({logical_event_id,operation_id:'ANOMALY_INIT:'+k.digest(logical_event_id),expected_revision:0,card,descriptor,plan,state});
      // Fixture seeding only. This is not a native installation or budget claim.
      sql.prepare(k.COMMIT_SQL).run(prepared.text);return{logical_event_id,card,descriptor,plan,state,prepared};
    }
    function context({symbols=['BTC'],inactiveETH=false,modify,file,existing=false,mode={}}={}){
      serial++;file??=path.join(directory,'due-'+serial+'.sqlite');const sql=new DatabaseSync(file);const seeds={};
      if(!existing){sql.exec(fs.readFileSync(path.join(repo,'current-generation/files/migrations/20261021_anomaly_domain.sql'),'utf8'));symbols.forEach((s,i)=>{seeds[s]=seed(sql,s,i,{inactive:inactiveETH&&s==='ETH',modify});});}
      const wires=[];const db=new api.adapter.RemoteD1Database('https://controlled.invalid/d1','CONTROLLED_NO_NATIVE_TOKEN',{fetchImpl:async(url,request)=>{
        assert.equal(String(url),'https://controlled.invalid/d1');const p=JSON.parse(request.body);wires.push(p);
        if(mode.failBeforeWrite&&p.op==='run')throw Error('CONTROLLED_LOST_BEFORE_WATCH_WRITE');
        let out;if(p.op==='all')out={results:sql.prepare(p.sql).all(...p.params)};else if(p.op==='first')out=sql.prepare(p.sql).get(...p.params)??null;else if(p.op==='run'){const q=sql.prepare(p.sql).run(...p.params);out={success:true,meta:{changes:Number(q.changes)}};}else throw Error('UNEXPECTED_CONTROLLED_SQL');
        if(mode.failAfterWrite&&p.op==='run')throw Error('CONTROLLED_LOST_AFTER_WATCH_WRITE');
        return new Response(JSON.stringify({ok:true,result:out,usage:{measured:true,rows_read:2,rows_written:p.op==='run'?12:0}}),{status:200});
      }});
      const env={DATA_DB:db},reservation={rows_read:54000,rows_written:840},id=`R2RUN:${clock}:0123456789abcdef`,receipt={status:'RESERVED',reservation_id:id,day_utc:new Date(clock).toISOString().slice(0,10),...reservation};
      const http=api.http.createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12});
      const cap=api.install({env,db,reservation,reservation_id:id,receipt,day_admission:{allowed:true},http_budget:http,post_v7:true,cost_bounds:policy});assert.equal(cap.installed,true);assert.equal(cap.due_installed,true);
      const c={file,sql,db,env,cap,wires,seeds,mode,closed:false,id:'CONTROLLED_DUE:'+serial};contexts.push(c);return c;
    }
    const close=async c=>{if(!c.closed){try{await c.cap.close();}finally{c.sql.close();c.closed=true;}}};
    const row=(c,id)=>c.sql.prepare('SELECT * FROM report2_anomaly_bundle_v1 WHERE logical_event_id=?').get(id);
    const cycle=(c,env=c.env)=>consumer.runCapturedAnomalyDueCycle({env,now_ts:clock,limit:2,logical_request_id:c.id});
    function captured({symbol='BTC',close=110,bodyOrder=false,size=0.001,gap=false,age=10000}={}){
      tape.clearHtxSignedTapeSnapshots();const source=clock-age,end=Math.floor(source/(15*MIN))*15*MIN,start=end-15*MIN;
      const data=Array.from({length:90},(_,i)=>{const t=end-90*MIN+i*MIN,last=t>=start;return{id:t/1000,open:100,high:last?Math.max(112,close):101,low:last?Math.min(88,close):99,close:last?close:100,trade_turnover:10};});if(gap)data.pop();
      const m=metadata(symbol,clock-20000,size),p=bodyOrder?{data,ts:source,ch:`market.${symbol}-USDT.kline.1min`,status:'ok'}:{status:'ok',ch:`market.${symbol}-USDT.kline.1min`,ts:source,data};
      const url=`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${symbol}-USDT&period=1min`;
      tape.observeHtxSignedTape(m,`https://api.hbdm.com/linear-swap-api/v1/swap_contract_info?contract_code=${symbol}-USDT`,clock-19000);tape.observeHtxSignedTape(p,url,clock-1);
      tape.observeHtxAcquisitionAttempt({url,stage:'COMPLETED',started_ts:clock-18000,received_ts:clock-12000,http_status:200,body_completed_ts:clock-2,body_text:JSON.stringify(p)});
      return{end,start,body_sha256:sha(JSON.stringify(p))};
    }
    const immutable=(before,after)=>{for(const key of ['card_json','descriptor_json','plan_json','first_known_ts','card_sha256','descriptor_sha256','plan_sha256'])assert.equal(after[key],before[key]);};
    let c,r,before,after,savedFile,savedBTC;
    assert.equal((await consumer.runCapturedAnomalyDueCycle({env:{}})).status,'DUE_HOOK_NOT_AVAILABLE');assert.equal(network,0);
    add('actual_new618_worker_seam_and_missing_hooks_no_selection_or_IO',1,{source_pair_files:618,non_runner_equal:617});
    for(const direction of ['LONG','SHORT']){
      clock=T+60*MIN+30000;c=context({symbols:['BTC','ETH'],inactiveETH:true});const id=c.seeds.BTC.logical_event_id;before=row(c,id);captured({close:direction==='LONG'?110:90});r=await cycle(c);
      assert.equal(r.selected_rows,2);assert.equal(c.wires.length,5);assert.equal(c.wires[0].sql,k.DUE_SQL);assert.equal(r.events.find(x=>x.logical_event_id===id).status,'COMMITTED_RECEIPT_READBACK');assert.equal(r.events.find(x=>x.logical_event_id!==id).reason,'WATCH_INACTIVE_PENDING_OUTCOMES');after=row(c,id);immutable(before,after);assert.equal(after.revision,2);
      const st=JSON.parse(after.state_json);assert.equal(st.watch.hypotheses[direction],'CONFIRMED');assert.equal(st.watch.hypotheses[direction==='LONG'?'SHORT':'LONG'],'REFUTED');assert.equal(Object.values(st.outbox).every(x=>x.status==='DRAFT'&&x.actual_send===false),true);assert.equal(st.revisions.at(-1).price_source_ts,T+60*MIN);assert.equal(Object.values(st.outcomes).every(x=>x.status==='PENDING'),true);
      if(direction==='LONG'){savedFile=c.file;savedBTC=id;}await close(c);
    }
    add('DUE_includes_inactive_pending_and_existing_LONG_SHORT_transitions',2,{first_cut_domain_RPC:5,new_HTTP:0,original16_pending:true});
    clock=T+61*MIN;c=context({file:savedFile,existing:true});before=row(c,savedBTC);captured({bodyOrder:true});r=await cycle(c);assert.equal(r.events.find(x=>x.logical_event_id===savedBTC).reason,'CLOSED_WINDOW_ALREADY_OBSERVED');assert.equal(c.wires.length,3);assert.equal(row(c,savedBTC).state_json,before.state_json);await close(c);
    add('fresh_client_same_closed_facts_new_body_and_clock_no_revision',1,{explicit_CONTROLLED_SQLite_restart:true});
    clock=T+75*MIN+30000;c=context({file:savedFile,existing:true});before=row(c,savedBTC);captured({close:90});r=await cycle(c);after=row(c,savedBTC);immutable(before,after);let st=JSON.parse(after.state_json);assert.equal(st.watch.active,false);assert.equal(st.watch.next_check_ts,T+60*MIN);assert.equal(Object.keys(st.outcomes).length,16);assert.equal(Object.values(st.outcomes).every(x=>x.status==='PENDING'),true);await close(c);
    clock=T+76*MIN;c=context({file:savedFile,existing:true});before=row(c,savedBTC);captured();r=await cycle(c);assert.equal(r.events.find(x=>x.logical_event_id===savedBTC).reason,'WATCH_INACTIVE_PENDING_OUTCOMES');assert.equal(row(c,savedBTC).state_json,before.state_json);await close(c);
    add('real_refutation_closes_watch_without_clearing_mature_pending_due',1,{outcome_evaluator_not_substituted:true});
    for(const mode of ['missing','stale','gap','multiplier','before_known']){
      clock=mode==='before_known'?T+15*MIN+30000:T+60*MIN+30000;c=context();const id=c.seeds.BTC.logical_event_id;before=row(c,id);tape.clearHtxSignedTapeSnapshots();if(mode!=='missing')captured({gap:mode==='gap',size:mode==='multiplier'?0.002:0.001,age:mode==='stale'?180000:10000});r=await cycle(c);assert.equal(r.events[0].status,'DUE_DEFERRED');assert.equal(c.wires.length,2);assert.equal(row(c,id).state_json,before.state_json);assert.equal(row(c,id).next_check_ts,before.next_check_ts);await close(c);
    }
    add('missing_stale_gap_material_mismatch_and_preknown_window_keep_due',5);
    for(const bound of ['revisions','outbox','state_bytes']){
      clock=T+60*MIN+30000;c=context({modify:state=>{if(bound==='revisions')state.revisions=Array.from({length:32},(_,i)=>({...state.revisions[0],controlled_seed:i}));if(bound==='outbox')state.outbox=Object.fromEntries(Array.from({length:32},(_,i)=>['seed'+i,{...state.outbox.capture0}]));if(bound==='state_bytes'){state.padding='';state.padding='x'.repeat(k.DOMAIN_BOUNDS.state-128-Buffer.byteLength(k.canonical(state)));}}});const id=c.seeds.BTC.logical_event_id;before=row(c,id);captured();r=await cycle(c);assert.equal(r.events[0].status,'DEFERRED_CAPACITY');assert.equal(c.wires.length,2);assert.equal(row(c,id).state_json,before.state_json);await close(c);
    }
    add('actual_revision_outbox_and_byte_capacity_preserve_original_state',3);
    for(const bad of ['parent','cost','duplicate','unordered','future','overflow']){
      clock=T+60*MIN+30000;c=context({symbols:bad==='unordered'?['BTC','ETH']:['BTC']});let commits=0;const env={REPORT2_ANOMALY_DOMAIN_DUE:async input=>{const d=await c.env.REPORT2_ANOMALY_DOMAIN_DUE(input),q=structuredClone(d);if(bad==='parent')q.current_parent_admitted=false;if(bad==='cost')q.cost_status='PROJECTION_EXCEEDED_OR_UNKNOWN';if(bad==='duplicate'){q.rows=[q.rows[0],q.rows[0]];q.more_may_exist=true;}if(bad==='unordered')q.rows.reverse();if(bad==='future')q.rows[0].next_check_ts=clock+1;if(bad==='overflow'){q.rows=[q.rows[0],q.rows[0],q.rows[0]];q.more_may_exist=true;}return q;},REPORT2_ANOMALY_DOMAIN_COMMIT:async()=>{commits++;throw Error('WHOLE_DUE_MUST_BE_CHECKED_FIRST');}};
      r=await cycle(c,env);assert.equal(r.status,'DUE_SELECTION_NOT_CLOSED');assert.equal(commits,0);assert.equal(c.wires.length,1);await close(c);
    }
    add('whole_due_rows_and_current_parent_cost_checked_before_any_origin',6);
    clock=T+60*MIN+30000;c=context();before=row(c,c.seeds.BTC.logical_event_id);captured();const dueHook=c.env.REPORT2_ANOMALY_DOMAIN_DUE;r=await cycle(c,{REPORT2_ANOMALY_DOMAIN_DUE:async x=>{const d=structuredClone(await dueHook(x));d.rows[0].revision++;return d;},REPORT2_ANOMALY_DOMAIN_COMMIT:c.env.REPORT2_ANOMALY_DOMAIN_COMMIT});assert.equal(r.events[0].reason,'DUE_REVISION_CHANGED');assert.equal(c.wires.length,2);assert.equal(row(c,c.seeds.BTC.logical_event_id).state_json,before.state_json);await close(c);
    add('stale_due_revision_never_overrides_current_verified_origin',1);
    for(const afterWrite of [false,true]){
      clock=T+60*MIN+30000;c=context({symbols:['BTC','ETH'],mode:afterWrite?{failAfterWrite:true}:{failBeforeWrite:true}});captured();r=await cycle(c);assert.equal(r.events.length,1);assert.equal(r.events[0].status,'UNKNOWN_COMMIT_ACK');assert.equal(r.events[0].effective_prepared_retained_by_source,true);assert.equal(c.wires.length,3);const pending=c.cap.retained_reconciliation()[0].effective_prepared;assert.ok(pending);const unknown=c.db.usageSnapshot().unknown_ops;assert.ok(unknown>0);const again=await cycle(c);assert.equal(again.events[0].status,'UNKNOWN_COMMIT_ACK');assert.equal(c.cap.retained_reconciliation()[0].effective_prepared,pending);assert.equal(c.wires.length,3);assert.equal(c.db.usageSnapshot().unknown_ops,unknown);await close(c);
    }
    add('new_due_cycle_stops_remaining_events_and_retains_unknown_operation',2,{production_pending_journal_qualified:false});
    assert.equal(groups.length,9);assert.equal(network,0);result={schema:'DUE_WATCH_CONSUMER_CONNECTED_V1',status:'NEW_CONTROLLED_DUE_CONSUMER_COMPLETED',groups,controlled_groups:groups.length,nested_variants:groups.reduce((n,g)=>n+g.variants,0),actual_DUE_ORIGIN_WRITE_READBACK:true,actual_existing_observe_and_draftNotice:true,actual_RemoteD1_into_LocalSQLite:true,source_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,old_components_replayed:0,source_component_called:false,independent105_connected:false,native_epoch_qualified:false,event_first_knowledge_qualified:false,native_admission_qualified:false,SENT_claimed:false,outcome_classification_qualified:false,all16_pending_preserved:true,author_semantics:0};
  }catch(error){error.completed_new_due_consumer_groups=groups;throw error;}
  finally{try{for(const c of contexts)if(!c.closed){try{await c.cap.close();}finally{c.sql.close();c.closed=true;}}if(directory!==null)fs.rmSync(directory,{recursive:true,force:true});}finally{globalThis.fetch=oldFetch;Date.now=oldNow;}}
  result.fixture_cleanup_removed=directory===null||!fs.existsSync(directory);return result;
}
