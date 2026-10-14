import fs from 'node:fs/promises';import vm from 'node:vm';import crypto from 'node:crypto';import {gzipSync,gunzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {loadDailyUsageAggregate,evaluateDailyReservationBudget,evaluateWithinRunReservation,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
import {installEvidenceSourceStore,evidenceSourceAttemptHeadroom,reserveEvidenceSourceAttempts} from '../current-generation/files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../current-generation/files/src/provider-minute-ledger.mjs';
import {createUnifiedHttpBudget} from '../current-generation/files/src/unified-budget.mjs';
import {HTX_CATALOG_URLS,HTX_LINEAR_MARGIN_CATALOG_URLS,mergeHtxLinearCatalogModes,buildHtxCryptoUniverse} from '../current-generation/files/src/htx-crypto-universe.mjs';
import {APPROVED_HTX_SCOPE} from '../current-generation/files/src/approved-htx-analysis-scope.mjs';
import {N15_INITIAL_SOURCE_PREFERENCE} from '../current-generation/files/src/n15-initial-source-preference.mjs';
import {KNOWN_HISTORY_MANIFESTS} from '../cloudflare/free-history/hourly-archive.mjs';
import {renderWeeklyScopeFiles} from '../runner/htx-weekly-scope-package.mjs';
import {HTX_WEEKLY_POLICY,utcWeekKey,planWeeklyHtxUniverse,weeklyScopePackage} from '../runner/htx-weekly-universe-plan.mjs';
import {makeGithubControl,acquireWeeklyPhaseLease,releaseWeeklyPhaseLease} from '../runner/github-bounded-phase-lease.mjs';
import {dispatchWeeklyConnectedCheck} from '../runner/htx-weekly-proposal-check.mjs';
const dir='audit-output/htx-weekly',hash=b=>crypto.createHash('sha256').update(b).digest('hex'),started=Date.now(),week=utcWeekKey(started),policy=HTX_WEEKLY_POLICY;
const out={schema:'HTX_WEEKLY_PRIMARY_UNIVERSE_REFRESH_V1',head:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,week,started_ts:started,sourceHTTP:0,source_reservations_reset:false,MAIN:0,Telegram:0,production_scope_changed:false,receipts:[]};await fs.mkdir(dir,{recursive:true});
const control=makeGithubControl({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN});let lease,db,admitted=false;const sourceId='HTX_WEEKLY_PRIMARY:'+week,id='HTX_WEEKLY_D1:'+process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,reservation={rows_read:policy.D1.reads,rows_written:policy.D1.writes},budget=createUnifiedHttpBudget();
try{
 // A deployable weekly update needs an Actions-created checked proposal. Stop
 // before source/D1 expense when this repository permission is disabled.
 out.github_actions_proposal_permission=process.env.REPORT2_WEEKLY_QUALIFIED_PROPOSALS_ENABLED==='true';
 if(!out.github_actions_proposal_permission)throw Error('ACTIONS_QUALIFIED_PROPOSAL_PERMISSION_REQUIRED');
 for(const prefix of ['evidence/htx-weekly-','maintenance/htx-weekly-']){
  const refs=await control.call('git/matching-refs/heads/'+prefix+week+'-');
  for(const ref of Array.isArray(refs)?refs:[]){
   let prior;try{prior=await control.read(prefix.startsWith('evidence/')?'checkpoints/HTX_WEEKLY_NO_CHANGE_PROOF.json':'checkpoints/HTX_WEEKLY_SCOPE_PROPOSAL.json',ref.object.sha);}catch{continue;}
   if(prior.value.week===week&&Array.isArray(prior.value.source_receipts)&&prior.value.source_receipts.length===6&&prior.value.source_receipts.every(s=>/^[a-f0-9]{64}$/.test(s.body_sha256||'')&&/^[a-f0-9]{64}$/.test(s.compressed_sha256||''))){out.original_proof_ref={ref:ref.ref,head:ref.object.sha};throw Error('CURRENT_WEEK_ORIGINALS_ALREADY_RETAINED_NO_NEW_SOURCE_OR_D1');}
  }
 }
 lease=await acquireWeeklyPhaseLease(control,{now:started,run_id:out.run,expected_main:out.head});out.lease=lease;if(!lease.allowed)throw Error(lease.status);
 const source=await fs.readFile('current-generation/files/src/worker.js','utf8'),a=source.indexOf('function classifyHtxInstrumentScope('),b=source.indexOf('function symbolFingerprint(',a);if(a<0||b<a)throw Error('CURRENT_PRIMARY_CLASSIFIER_REQUIRED');const classify=vm.runInNewContext(source.slice(a,b)+';classifyHtxInstrumentScope',{});
 const previous=JSON.parse(gunzipSync(await fs.readFile(APPROVED_HTX_SCOPE.manifest)));
 db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
 const daily=evaluateDailyReservationBudget({daily:await loadDailyUsageAggregate(db,started),nextReservation:reservation,maxDailyReads:3500000,maxDailyWrites:70000});out.daily_admission=daily;if(!daily.allowed)throw Error('SHARED_D1_DAY_ADMISSION_DENIED');await reserveRunBudget(db,{reservationId:id,now:started,reservation});admitted=true;
 if(!evaluateWithinRunReservation({reservation,currentUsage:db.usageSnapshot(),extraRowsRead:1000,extraRowsWritten:100}).allowed)throw Error('SHARED_D1_HEADROOM_DENIED');
 await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);
 const prior=await db.prepare('SELECT source,attempts FROM report2_evidence_source_reservation WHERE reservation_id=?1').bind(sourceId).first();if(prior)throw Error('THIS_WEEK_ALREADY_ATTEMPTED_NO_CAP_ALIAS');
 const headroom=await evidenceSourceAttemptHeadroom(db,{source:policy.source_family,attempts:6,daily_cap:144,now:started}),minute=await db.prepare('SELECT COALESCE(SUM(units),0) AS units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?2 AND created_ts<=?3').bind('HTX',started-60000,started).first();if(!headroom.allowed||typeof minute?.units!=='number'||!Number.isSafeInteger(minute.units)||minute.units<0||minute.units+6>6)throw Error('EXISTING_SOURCE_DAY_OR_MINUTE_HEADROOM_DENIED');
 const grant=budget.reserve({logical_request_id:sourceId,lane:'background',attempts:6});if(!grant.allowed||grant.duplicate)throw Error('WHOLE_HTTP_ADMISSION_DENIED');
 const sourceGrant=await reserveEvidenceSourceAttempts(db,{source:policy.source_family,reservation_id:sourceId,attempts:6,daily_cap:144,now:started}),minuteGrant=await reserveProviderMinuteUnits(db,{provider:'HTX',reservation_id:sourceId,units:6,cap:6,now:started});out.source_admission=sourceGrant;out.minute_admission=minuteGrant;if(!sourceGrant.allowed||!minuteGrant.allowed)throw Error('ATOMIC_SOURCE_ADMISSION_DENIED');
 async function get(name,url){
  if(Date.now()>=lease.lease.expires_ts)throw Error('OWN_LEASE_EXPIRED');if((await control.call('git/ref/heads/main')).object.sha!==lease.head)throw Error('MAIN_MOVED_DURING_SOURCE_COLLECTION');
  const rec={name,url,received_ts:null};out.receipts.push(rec);out.sourceHTTP++;const response=await fetch(url,{headers:{accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});rec.http_status=response.status;const parts=[];let n=0;for await(const p of response.body){n+=p.length;if(n>8388608)throw Error('SOURCE_BODY_BOUND');parts.push(p);}const raw=Buffer.concat(parts);rec.received_ts=Date.now();rec.body_sha256=hash(raw);rec.bytes=raw.length;rec.file=name+'.json.gz';await fs.writeFile(dir+'/'+rec.file,gzipSync(raw,{mtime:0}));if(response.status!==200)throw Error('HTX_CATALOG_HTTP_'+response.status);const p=JSON.parse(raw);rec.source_ts=p.ts;return p;
 }
 const base=await get('linear-default',HTX_CATALOG_URLS.linear),modes={};for(const [mode,url]of Object.entries(HTX_LINEAR_MARGIN_CATALOG_URLS))modes[mode]=await get('linear-'+mode,url);
 const coin_swap=await get('coin-swap',HTX_CATALOG_URLS.coin_swap),coin_delivery=await get('coin-delivery',HTX_CATALOG_URLS.coin_delivery),observed_ts=Date.now(),linear=mergeHtxLinearCatalogModes({base,modes,observed_ts});out.margin_modes=linear;if(linear.status!=='CLOSED')throw Error('ALL_PRIMARY_MARGIN_MODES_REQUIRED');
 const current=buildHtxCryptoUniverse({catalogs:{linear:linear.payload,coin_swap,coin_delivery},classify_linear:classify,observed_ts});const plan=planWeeklyHtxUniverse({previous,current,now:observed_ts,known_priorities:N15_INITIAL_SOURCE_PREFERENCE}),bytes=Buffer.from(JSON.stringify(current,null,2)+'\n'),pack=plan.status==='CLOSED'?weeklyScopePackage({plan,manifest_bytes:bytes,generation:APPROVED_HTX_SCOPE.generation,previous_scope:APPROVED_HTX_SCOPE}):null;
 await fs.writeFile(dir+'/universe.json.gz',gzipSync(bytes,{mtime:0}));await fs.writeFile(dir+'/source-plan.json',JSON.stringify(plan,null,2)+'\n');if(pack)await fs.writeFile(dir+'/synchronized-scope-package.json',JSON.stringify(pack,null,2)+'\n');out.plan_status=plan.status;out.manifest_sha256=hash(bytes);out.added=plan.added;out.removed=plan.removed;out.status=plan.status==='CLOSED'?'PRIMARY_UNIVERSE_AND_SYNCHRONIZED_PROPOSAL_READY':plan.status;
 // The exact proposal is retained. Production requires its connected checks
 // and synchronized collector/history rollout; no isolated universe write.
 out.production_activation_status='CONNECTED_SCOPE_AND_COLLECTOR_HISTORY_ACCEPTANCE_REQUIRED';
 if(pack){
  const approved_source=await fs.readFile('current-generation/files/src/approved-htx-analysis-scope.mjs','utf8'),hourly_source=await fs.readFile('cloudflare/free-history/hourly-archive.mjs','utf8');
  const known_manifests=KNOWN_HISTORY_MANIFESTS;
  const rendered=renderWeeklyScopeFiles({plan,manifest_bytes:bytes,generation:APPROVED_HTX_SCOPE.generation,previous_scope:APPROVED_HTX_SCOPE,approved_source,hourly_source,known_manifests});
  if(plan.added.length||plan.removed.length){
   if(Date.now()>=lease.lease.expires_ts||(await control.call('git/ref/heads/main')).object.sha!==lease.head)throw Error('CURRENT_OWN_LEASE_AND_MAIN_REQUIRED_BEFORE_PROPOSAL');
   // Parent the proposal before acquisition: its tree must never carry a lease
   // that a later merge could restore after this job releases it.
   const branch='maintenance/htx-weekly-'+week+'-'+out.run,baseTree=(await control.call('git/commits/'+lease.lease.expected_main)).tree.sha,entries=[];
   for(const [path,content]of Object.entries(rendered.files)){const blob=await control.call('git/blobs','POST',{content:content.toString('base64'),encoding:'base64'});entries.push({path,mode:'100644',type:'blob',sha:blob.sha});}
   for(const rec of out.receipts){const compressed=await fs.readFile(dir+'/'+rec.file);rec.compressed_sha256=hash(compressed);rec.path='checkpoints/htx-weekly-originals/'+week+'/'+rec.file;const blob=await control.call('git/blobs','POST',{content:compressed.toString('base64'),encoding:'base64'});entries.push({path:rec.path,mode:'100644',type:'blob',sha:blob.sha});}
   const proposalReceipt=Buffer.from(JSON.stringify({schema:'HTX_WEEKLY_CHECKED_SCOPE_PROPOSAL_V1',week,branch,source_run:String(out.run),lease_owner:lease.lease.owner,proposal_base_sha:lease.lease.expected_main,plan,required_rollout:rendered.required_rollout,source_receipts:out.receipts,observed_ts,production_scope_changed:false,expected_main:lease.head},null,2)+'\n'),blob=await control.call('git/blobs','POST',{content:proposalReceipt.toString('base64'),encoding:'base64'});entries.push({path:'checkpoints/HTX_WEEKLY_SCOPE_PROPOSAL.json',mode:'100644',type:'blob',sha:blob.sha});
   const tree=await control.call('git/trees','POST',{base_tree:baseTree,tree:entries}),commit=await control.call('git/commits','POST',{message:'Weekly exact HTX universe/source proposal '+week,tree:tree.sha,parents:[lease.lease.expected_main]});await control.call('git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
   const pr=await control.call('pulls','POST',{title:'Weekly HTX universe '+week,head:branch,base:'main',draft:true,body:'Official six-catalog membership and synchronized runtime/history/source queues. No production change yet. Requires connected runtime acceptance and all three collector/history rollout readbacks. Source clocks, strategy, weights, caps and paused blocks preserved.'});out.proposal={head:commit.sha,branch,number:pr.number,url:pr.html_url,draft:true,requires_connected_acceptance_before_activation:true};
   out.connected_check=await dispatchWeeklyConnectedCheck(control,{proposal:out.proposal,lease,source_run:out.run});
   await control.call('pulls/'+pr.number,'PATCH',{body:'Original six catalogs retained in this data-only proposal. Exact connected runtime check: '+out.connected_check.url+'. Still requires synchronized public collector, spot/futures history and LIQ forecast history deployment/readback before production activation. Strategy, weights, caps and paused blocks preserved.'});
  }else{
   out.proposal_status='NO_MEMBERSHIP_CHANGE_EXISTING_SCOPE_RETAINED';
   // A no-change catalog is still original evidence. Keep its six exact
   // responses in Git, rather than relying on the expiring Actions artifact.
   if(Date.now()>=lease.lease.expires_ts||(await control.call('git/ref/heads/main')).object.sha!==lease.head)throw Error('CURRENT_OWN_LEASE_AND_MAIN_REQUIRED_BEFORE_PROOF_SAVE');
   const branch='evidence/htx-weekly-'+week+'-'+out.run,entries=[],baseTree=(await control.call('git/commits/'+lease.lease.expected_main)).tree.sha;
   for(const rec of out.receipts){const compressed=await fs.readFile(dir+'/'+rec.file);rec.compressed_sha256=hash(compressed);rec.path='checkpoints/htx-weekly-originals/'+week+'/'+rec.file;const blob=await control.call('git/blobs','POST',{content:compressed.toString('base64'),encoding:'base64'});entries.push({path:rec.path,mode:'100644',type:'blob',sha:blob.sha});}
   const body=Buffer.from(JSON.stringify({schema:'HTX_WEEKLY_NO_MEMBERSHIP_CHANGE_ORIGINALS_V1',week,source_run:String(out.run),source_receipts:out.receipts,plan,production_scope_changed:false},null,2)+'\n'),blob=await control.call('git/blobs','POST',{content:body.toString('base64'),encoding:'base64'});entries.push({path:'checkpoints/HTX_WEEKLY_NO_CHANGE_PROOF.json',mode:'100644',type:'blob',sha:blob.sha});
   const tree=await control.call('git/trees','POST',{base_tree:baseTree,tree:entries}),commit=await control.call('git/commits','POST',{message:'Retain exact weekly HTX unchanged catalog '+week,tree:tree.sha,parents:[lease.lease.expected_main]});await control.call('git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});out.original_proof_ref={branch,head:commit.sha};
  }
 }

}catch(error){out.status='WEEKLY_RECONCILIATION_NOT_ACTIVATED';out.reason=String(error?.message||error).split('\n')[0].slice(0,150);}
finally{
 if(admitted)out.finalized_usage=await finalizeRunUsage(db,{reservationId:id,sourceRunId:out.run,usage:db.usageSnapshot()});if(db){out.D1=db.usageSnapshot();if(out.D1.unknown_ops||out.D1.rows_read>reservation.rows_read||out.D1.rows_written>reservation.rows_written){out.status='WEEKLY_D1_ENVELOPE_NOT_CLOSED';out.production_activation_status='DENIED_UNKNOWN_OR_EXCESS_NATIVE_D1';}}out.whole_http=budget.summary();if(lease?.allowed)out.lease_release=await releaseWeeklyPhaseLease(control,lease);out.completed_ts=Date.now();await fs.writeFile(dir+'/proof.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:out.status,reason:out.reason,sourceHTTP:out.sourceHTTP,added:out.added,removed:out.removed,production_scope_changed:false}));
}
