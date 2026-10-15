const NAMES=['my-report-2-hub','my-report-2-liq-forecast-history'],HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/,UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const same=(a,b)=>a?.version_id===b?.version_id&&a?.deployment_id===b?.deployment_id&&a?.module_sha256===b?.module_sha256&&a?.settings_sha256===b?.settings_sha256&&a?.crons_sha256===b?.crons_sha256;
const target=(row,w)=>row?.version_id===w?.staged?.version_id&&row?.module_sha256===w?.expected_module_sha256&&row?.settings_sha256===w?.expected_settings_sha256&&row?.crons_sha256===w?.before?.crons_sha256;
// Immutable uploads precede activation. Pool writers remain disabled throughout
// the transition, so a partially deployed reader never receives a new locator.
export async function rolloutFreeArchiveReaders({plan,adapter,guard,save=async()=>{},execute=false,clock=Date.now}={}){
 if(!SHA.test(plan?.head||'')||plan.qualified?.head!==plan.head||plan.qualified.status!=='EXACT_CLOUD_AND_CURRENT_MAIN_CODE_VERIFIED'||!Number.isSafeInteger(plan.qualified.run)||plan.native_schema_run!==38781244995||plan.writer_enabled!==false||plan.workers?.length!==2||plan.workers.some((w,i)=>w.name!==NAMES[i]||!HEX.test(w.module_sha256||'')||!HEX.test(w.target_settings_sha256||'')||!w.required_before))throw Error('EXACT_FREE_ARCHIVE_READER_PLAN_REQUIRED');
 const out={schema:'EXACT_FREE_ARCHIVE_READER_ROLLOUT_V1',head:plan.head,expected_main:plan.expected_main,qualified:plan.qualified,native_schema_run:plan.native_schema_run,writer_enabled:false,automatic_rotation_enabled:false,execute,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,existing_rows_modified:0,workers:[],rollback:[],started_ts:clock()};
 const persist=()=>save(structuredClone(out));const changed=[];
 try{
  await guard({min_headroom_ms:600000});
  for(const w of plan.workers){const before=await adapter.snapshot(w);if(!same(before,w.required_before))throw Error('FREE_ARCHIVE_WORKER_CHANGED_AFTER_PREPARATION');out.workers.push({name:w.name,before,expected_module_sha256:w.module_sha256,expected_settings_sha256:w.target_settings_sha256});}
  await persist();if(!execute){out.status='FREE_ARCHIVE_READER_PLAN_AND_ROLLBACK_ORIGINALS_VERIFIED';await persist();return out;}
  for(const [i,w] of plan.workers.entries()){
   await guard();adapter.requireHeadroom(26);const r=out.workers[i];if(!same(r.before,await adapter.snapshot(w)))throw Error('FREE_ARCHIVE_WORKER_CHANGED_BEFORE_STAGE');
   r.staged=await adapter.stage(w,r.before);if(!UUID.test(r.staged?.version_id||'')||r.staged.activated!==false)throw Error('FREE_ARCHIVE_STAGED_VERSION_REQUIRED');await persist();
  }
  for(const [i,w] of plan.workers.entries()){
   await guard();adapter.requireHeadroom(22);const r=out.workers[i];if(!same(r.before,await adapter.snapshot(w)))throw Error('FREE_ARCHIVE_WORKER_CHANGED_BEFORE_ACTIVATION');
   r.activation_intent={version_id:r.staged.version_id,ts:clock()};changed.push(i);await persist();await adapter.activate(w,r.staged.version_id);
   r.after=await adapter.snapshot(w);if(!target(r.after,r))throw Error('FREE_ARCHIVE_ACTIVATION_READBACK_REQUIRED');await persist();
  }
  for(const [i,w] of plan.workers.entries())if(!target(await adapter.snapshot(w),out.workers[i]))throw Error('FREE_ARCHIVE_FINAL_COORDINATED_READBACK_REQUIRED');
  await guard();out.status='BOTH_FREE_ARCHIVE_READERS_EXACT_MODULES_BINDINGS_AND_CRONS_VERIFIED';out.completed_ts=clock();await persist();return out;
 }catch(error){
  out.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'FREE_ARCHIVE_READER_ROLLOUT_ERROR';
  for(const i of changed.reverse()){
   const w=plan.workers[i],r=out.workers[i];
   try{
    await guard();adapter.requireHeadroom(8);const current=await adapter.snapshot(w);
    if(same(current,r.before)){out.rollback.push({name:w.name,status:'ORIGINAL_STILL_ACTIVE'});continue;}
    if(current.version_id!==r.staged.version_id||current.settings_sha256!==r.expected_settings_sha256||current.crons_sha256!==r.before.crons_sha256)throw Error('FOREIGN_ARCHIVE_READER_STATE_KEEP_CURRENT');
    await adapter.activate(w,r.before.version_id);const back=await adapter.snapshot(w);
    // A rollback selects a previous version with its original bindings. The
    // deployment id changes, but module/settings/crons must match exactly.
    if(back.version_id!==r.before.version_id||back.module_sha256!==r.before.module_sha256||back.settings_sha256!==r.before.settings_sha256||back.crons_sha256!==r.before.crons_sha256)throw Error('FREE_ARCHIVE_EXACT_ROLLBACK_READBACK_REQUIRED');
    out.rollback.push({name:w.name,status:'ORIGINAL_MODULE_AND_BINDINGS_RESTORED'});
   }catch(e){out.rollback.push({name:w.name,status:'ROLLBACK_NOT_ACKNOWLEDGED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'FREE_ARCHIVE_ROLLBACK_ERROR'});}await persist();
  }
  out.status=out.rollback.some(r=>r.status==='ROLLBACK_NOT_ACKNOWLEDGED')?'FREE_ARCHIVE_PARTIAL_STATE_REQUIRES_EXACT_RESUME':'FREE_ARCHIVE_NOT_ACTIVATED_OR_OWN_CHANGES_RESTORED';out.completed_ts=clock();await persist();error.archive_rollout_receipt=out;throw error;
 }
}
