// Prepared only. The coordinator invokes this once inside its NEW combined case.
export async function runEarlyLowerBoundConnected({runtime_root,baseline_runtime_root,repo_root}={}) {
 const [{default:assert},{DatabaseSync},fs,path,{pathToFileURL},{createHash}]=await Promise.all([
  import('node:assert/strict'),import('node:sqlite'),import('node:fs'),import('node:path'),import('node:url'),import('node:crypto')]);
 const src=root=>fs.existsSync(path.join(root,'src','v3-telegram-lifecycle-sidecar.mjs'))?path.join(root,'src'):root;
 const current=src(runtime_root),baseline=src(baseline_runtime_root),target='v3-telegram-lifecycle-sidecar.mjs';
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const proposal=JSON.parse(fs.readFileSync(new URL('./coordinator-source-proposal.json',import.meta.url),'utf8'));
 assert.equal(sha(fs.readFileSync(path.join(current,target))),proposal.after_sha256);
 assert.equal(sha(fs.readFileSync(path.join(baseline,target))),proposal.before_sha256);
 const newer=await import(pathToFileURL(path.join(current,target)).href);
 const older=await import(pathToFileURL(path.join(baseline,target)).href);
 const retained=await import(pathToFileURL(path.join(repo_root,'runner','retained-history.mjs')).href);
 assert.deepEqual(newer.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,older.V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET);
 const fixturePath=path.join(repo_root,'audit-fixes/t00/fixtures/d1-schema.json');
 const saved=JSON.parse(fs.readFileSync(fixturePath));
 assert.equal(saved.receipt.source_capture_run_id,36359630895);
 const sqlText=s=>s.replaceAll('\\n','\n');
 const tables=['v3_early_candidate_wave','shadow_decision_log','final_decision_integration_shadow','final_decision_telegram_context_shadow','v3_user_lifecycle_shadow','canonical_publication_shadow'];
 const NOW=1792417044173,RUN='CONTROLLED_INITIAL_WAVE_LOWER_BOUND',A='BTW-USDT',B='ZEC-USDT';
 const wave=(c,n=1)=>'EDW:'+c+':1792416900000:G'+n;
 const hand=c=>({handoff_id:'CONTROLLED_H:'+c,source_run_id:RUN,scan_ts:NOW-90000,contract_code:c,wave_id:wave(c),
  state:'COMPLETED',execution_status:'COMPLETED',deep_check_run_id:RUN,deep_error:null,deep_started_ts:NOW-80000,deep_completed_ts:NOW-10000,handoff_direction:null});
 const raw=new DatabaseSync(':memory:');
 for(const t of tables){const row=saved.rows.find(r=>r.type==='table'&&r.name===t);assert(row,'saved table '+t);raw.exec(sqlText(row.sql));}
 for(const r of saved.rows.filter(r=>r.type==='index'&&tables.includes(r.tbl_name)&&r.sql))raw.exec(sqlText(r.sql));
 const cols=raw.prepare('PRAGMA table_info(canonical_publication_shadow)').all();
 for(const sql of retained.retainedSchemaSql('canonical_publication_shadow',cols))raw.exec(sql);
 const insert=(table,row)=>{const keys=Object.keys(row);raw.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...Object.values(row));};
 const canonical=c=>{const ts=NOW-40000,body={metadata:{contract:c},run_id:RUN,snapshot_id:'S392:'+c+':'+ts,observed_ts:ts,state:'REJECTED',direction:null,analytical_fingerprint:'b'.repeat(64),controlled_padding:'x'.repeat(350)};
  return{publication_id:'CONTROLLED_PUB:'+c,contract_code:c,run_id:RUN,snapshot_id:body.snapshot_id,wave_id:wave(c),direction:null,canonical_state:'REJECTED',analytical_fingerprint:body.analytical_fingerprint,observed_ts:ts,created_ts:NOW-30000,canonical_json:JSON.stringify(body),presentation_inputs_json:'{}',actionability_status:'UNASSESSED',shadow_only:1};};
 const ca=canonical(A),cb=canonical(B);insert('canonical_publication_shadow',ca);
 // A conflicting archived A is hidden by actual retained hot precedence.
 insert('report2_canonical_archive_v1',{...ca,canonical_json:'ARCHIVE_DUPLICATE_MUST_NOT_WIN'});
 const packed=retained.packHistoryRow(cb),archiveCommit='a'.repeat(40);
 const archived=retained.archivedHeader(cb,{commit:archiveCommit,path:packed.path,raw_sha256:packed.envelope.raw_sha256});
 assert(archived.canonical_json.startsWith('R2ARCHIVE_V1:'));
 insert('report2_canonical_archive_v1',archived);
 const originalDateNow=Date.now;Date.now=()=>NOW;
 const scenarios=[];
 const seed=rows=>{raw.exec('DELETE FROM v3_early_candidate_wave');const generations=new Map();
  for(const r of rows){const generation=(generations.get(r.contract_code)||0)+1;generations.set(r.contract_code,generation);
   insert('v3_early_candidate_wave',{wave_id:r.wave_id,contract_code:r.contract_code,generation,first_seen_ts:Math.min(NOW-120000,Number(r.last_seen_ts)-1000),first_seen_detectors_json:'{}',lifecycle_stage:'DISCOVERY',direction_hint:null,direction_state:'DIRECTION_NOT_CLOSED',early_detection_quality_0_100:73,remaining_edge_json:'{}',evidence_refs_json:'[]',last_seen_ts:r.last_seen_ts,shadow_only:1});}};
 const e=(c,ts,n=1)=>({contract_code:c,wave_id:wave(c,n),last_seen_ts:ts});
 async function invoke(module,hs,options,directLoader=false){
  const consumed=[],batches=[];let archiveFetches=0;
  const restorer=retained.createHistoryRestorer({max_fetches:1,fetch_impl:async url=>{
   assert(url.endsWith('/'+archiveCommit+'/'+packed.path));archiveFetches++;
   return{ok:true,text:async()=>JSON.stringify(packed.envelope)};}});
  const db={prepare(sql){return{sql,params:[],bind(...params){return{sql,params};}};},async batch(statements){
   assert.equal(statements.length,options.canonical_required===false?4:5);
   const plain=[];
   for(const s of statements){assert.match(s.sql,/^\s*SELECT\b/);const wire=retained.rewriteRetainedSelect(s.sql);
    const results=raw.prepare(wire).all(...s.params);plain.push({sql:s.sql,wire_sql:wire,params:s.params,results});}
   const restored=await restorer.restore(plain.map(x=>({success:true,results:x.results,meta:{rows_read:null,rows_written:null}})));
   batches.push(plain.map((x,i)=>({...x,results:restored[i].results})));
   restored[0].results=restored[0].results.map(row=>new Proxy(row,{get(target,key,receiver){
    if(key==='last_seen_ts')consumed.push({contract_code:target.contract_code,wave_id:target.wave_id,last_seen_ts:target.last_seen_ts});
    return Reflect.get(target,key,receiver);}}));return restored;
  }};
  const out=await (directLoader?module.loadLifecycleSourceRows:module.runV3TelegramLifecycleSidecar)(db,{source_run_id:RUN,now_ts:NOW,completed_handoffs:{status:'CLOSED',source_run_id:RUN,handoffs:hs},canonical_required:true,...options});
  assert.equal(batches.length,1,'one source batch, no persistence/readback on controlled rejected canonical');
  assert.equal(out.source_read_costs.total_rows_read,null,'localSQLite does not invent D1 costs');
  assert.equal(out.source_read_costs.admission_authorized,false);
  return{out,consumed,batch:batches[0],archiveFetches};
 }
 async function compare(name,rows,hs=[hand(A),hand(B)],options={},mode='active'){
  seed(rows);const old=await invoke(older,hs,options),next=await invoke(newer,hs,options);
  assert.deepEqual(next.out.transitions,old.out.transitions,name+' actual consumer statuses');
  assert.deepEqual(next.batch.slice(1),old.batch.slice(1),name+' other4SQL/params/restored canonical rows');
  assert.equal(next.batch[0].sql.match(/ORDER BY[\s\S]*/)[0],old.batch[0].sql.match(/ORDER BY[\s\S]*/)[0]);
  const active=mode==='active'||mode==='stale';
  assert.equal(/last_seen_ts>=\?/.test(next.batch[0].sql),active,name+' guarded path');
  if(active){assert.deepEqual(next.batch[0].params,[...old.batch[0].params,NOW-600000]);assert.doesNotMatch(next.batch[0].sql,/last_seen_ts\s*(?:<=|BETWEEN)/i);}
  else{assert.equal(next.batch[0].sql,old.batch[0].sql,name+' exact legacy SQL');assert.deepEqual(next.batch[0].params,old.batch[0].params);}
  if(mode!=='stale')assert.deepEqual(next.consumed,old.consumed,name+' exact consumed wave row probes');
  else{assert(old.out.transitions.every(t=>t.status==='WAVE_NOT_CURRENT'));assert.equal(next.consumed.length,0);}
  if(options.canonical_required!==false){assert.match(next.batch[4].wire_sql,/FROM report2_canonical_retained_v1/);assert.equal(next.archiveFetches,1);assert.equal(old.archiveFetches,1);
   assert.equal(next.batch[4].results.find(r=>r.contract_code===A).canonical_json,ca.canonical_json);assert.equal(next.batch[4].results.find(r=>r.contract_code===B).canonical_json,cb.canonical_json);}
  scenarios.push({name,path:active?'LOWER_ONLY':'EXACT_LEGACY',old_early_returned:old.batch[0].results.length,new_early_returned:next.batch[0].results.length,old_consumed_count:old.consumed.length,new_consumed_count:next.consumed.length,old_consumed_sha256:sha(JSON.stringify(old.consumed)),new_consumed_sha256:sha(JSON.stringify(next.consumed)),statuses:next.out.transitions.map(t=>t.status),source_queries:next.batch.length});
 }
 try{
  const fresh=[e(A,NOW-30000),e(B,NOW-30000)];
  const stale=Array.from({length:28},(_,i)=>e(i%2?A:B,NOW-700000-i,i+2));
  await compare('fresh rows and stale tail',fresh.concat(stale));
  await compare('only stale exact named rows',[e(A,NOW-600001),e(B,NOW-600002)],[hand(A),hand(B)],{},'stale');
  await compare('inclusive lower endpoint',[e(A,NOW-600000),e(B,NOW)]);
  const future=Array.from({length:24},(_,i)=>e(i%2?A:B,NOW+1000+i,i+2));
  await compare('future24 still mask named valid rows',fresh.concat(future));
  await compare('future exact named row remains',[e(A,NOW+1),e(B,NOW-30000)]);
  await compare('future padded alias remains',fresh.concat([{...e(A,NOW+1),wave_id:' '+wave(A)+' '}])) ;
  await compare('fresh padded alias still raw-authority refusal',fresh.concat([{...e(A,NOW-20000),wave_id:' '+wave(A)+' '}])) ;
  for(const missing of [null,'',' '+wave(A)+' ',42])await compare('legacy wave '+JSON.stringify(missing),fresh.concat(stale),[{...hand(A),wave_id:missing},hand(B)],{},'legacy');
  await compare('duplicate handoff pair unchanged',fresh.concat(stale),[hand(A),hand(A),hand(B)],{},'legacy');
  await compare('invalid closed handoff time',fresh.concat(stale),[{...hand(A),deep_completed_ts:NOW+1},hand(B)],{},'legacy');
  await compare('foreign named wave remains missing',fresh.concat(stale),[{...hand(A),wave_id:wave(B)},hand(B)]);
  await compare('string now keeps oldSQL',fresh.concat(stale),[hand(A),hand(B)],{now_ts:String(NOW)},'legacy');
  await compare('fractional now keeps oldSQL',fresh.concat(stale),[hand(A),hand(B)],{now_ts:NOW+0.5},'legacy');
  await compare('missing now keeps oldSQL',fresh.concat(stale),[hand(A),hand(B)],{now_ts:undefined},'legacy');
  await compare('noncanonical caller keeps oldSQL',fresh.concat(stale),[hand(A),hand(B)],{canonical_required:false},'legacy');
  seed(fresh.concat(stale));
  const directOld=await invoke(older,[hand(A),hand(B)],{now_ts:undefined},true);
  const directNew=await invoke(newer,[hand(A),hand(B)],{now_ts:undefined},true);
  assert.deepEqual(directNew.batch,directOld.batch,'direct explicitundefined preserves exact legacy SQL/args/results');
  assert.doesNotMatch(directNew.batch[0].sql,/last_seen_ts>=\?/);
  assert.equal(directNew.out.status,'CLOSED');
  scenarios.push({name:'direct loader explicitundefined retains oldSQL',path:'EXACT_LEGACY',direct_loader:true,old_early_returned:directOld.batch[0].results.length,new_early_returned:directNew.batch[0].results.length,statuses:[],source_queries:directNew.batch.length});
  const witness={schema:'ONE_NEW_EARLY_LOWER_BOUND_CONNECTED_WITNESS_V1',scenarios,query_templates_only_one_changed:true,source_queries_per_path:5,noncanonical_queries:4,actual_localSQLite_saved_schema:true,retained_hot_precedence_and_archive_restore:true,controlled_archive_fetch_not_network:true,sourceHTTP_nativeSQL_MAIN_Telegram:0,native_costs:null,native_saving:null,limits:'One NEW controlled localSQLite/source-loader/actual consumer selection case. No native index/plan/cost, delivery/persistence/ENTRY or complete publication qualification; original160 cap and canonical authority unchanged. Counterexample561 is a reference, not rerun/imported.'};
  assert(Buffer.byteLength(JSON.stringify(witness))<=16384);return witness;
 }finally{Date.now=originalDateNow;raw.close();}
}
