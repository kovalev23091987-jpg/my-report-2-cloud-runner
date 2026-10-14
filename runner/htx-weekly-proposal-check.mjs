// Read-only binding for the bounded weekly branch. This never authorizes a
// production merge or deployment; every changed file must be declared data.
import {HTX_CATALOG_URLS,HTX_LINEAR_MARGIN_CATALOG_URLS} from '../current-generation/files/src/htx-crypto-universe.mjs';
const PHASE='checkpoints/CLOUD_PHASE_STATE_20261004.json';
export async function checkWeeklyGithubProposal(control,{head,expected_main,source_run,branch,now=Date.now()}={}){
 if(!/^[a-f0-9]{40}$/.test(head||'')||!/^[a-f0-9]{40}$/.test(expected_main||'')||!/^\d+$/.test(String(source_run||''))||!/^maintenance\/htx-weekly-\d{4}-\d{2}-\d{2}-\d+$/.test(branch||''))throw Error('EXACT_WEEKLY_PROPOSAL_BINDING_REQUIRED');
 const main=(await control.call('git/ref/heads/main')).object.sha;
 if(main!==expected_main)throw Error('WEEKLY_MAIN_MOVED');
 const [phase,fence,receipt,commit]=await Promise.all([control.read(PHASE,main),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',main),control.read('checkpoints/HTX_WEEKLY_SCOPE_PROPOSAL.json',head),control.call('git/commits/'+head)]);
 const r=receipt.value,l=phase.value.lease;
 if(fence.value.active||!l||l.owner!==r.lease_owner||l.expires_ts<=now||phase.value.latest_own_bounded_continuation_lease?.owner!==l.owner||phase.value.active_working_state?.owned_lease!==l.owner||phase.value.active_working_state?.owner_weekly_HTX_catalog_sync_authorized!==true)throw Error('EXACT_WEEKLY_OWN_LEASE_REQUIRED');
 if(r.schema!=='HTX_WEEKLY_CHECKED_SCOPE_PROPOSAL_V1'||r.expected_main!==main||r.source_run!==String(source_run)||r.branch!==branch||r.production_scope_changed!==false||r.proposal_base_sha!==l.expected_main||commit.parents?.length!==1||commit.parents[0].sha!==r.proposal_base_sha)throw Error('EXACT_WEEKLY_SOURCE_BASE_REQUIRED');
 const names=['linear-default','linear-all','linear-cross','linear-isolated','coin-swap','coin-delivery'],urls=[HTX_CATALOG_URLS.linear,...Object.values(HTX_LINEAR_MARGIN_CATALOG_URLS),HTX_CATALOG_URLS.coin_swap,HTX_CATALOG_URLS.coin_delivery];
 if(!Array.isArray(r.source_receipts)||r.source_receipts.length!==6||r.source_receipts.some((s,i)=>s.name!==names[i]||s.url!==urls[i]||s.http_status!==200||!Number.isSafeInteger(s.source_ts)||!Number.isSafeInteger(s.received_ts)||s.source_ts>s.received_ts||s.received_ts-s.source_ts>300000||s.received_ts>r.observed_ts||r.observed_ts-s.received_ts>300000||s.path!==`checkpoints/htx-weekly-originals/${r.week}/${s.file}`||!/^[a-f0-9]{64}$/.test(s.body_sha256)||!/^[a-f0-9]{64}$/.test(s.compressed_sha256)))throw Error('SIX_ORIGINAL_CATALOG_RECEIPTS_REQUIRED');
 const allowed=['current-generation/files/src/approved-htx-analysis-scope.mjs','cloudflare/free-history/hourly-archive.mjs',`checkpoints/htx-weekly-universe-${r.week}.json.gz`,`checkpoints/HTX_WEEKLY_SOURCE_QUEUE_${r.week}.json`,'checkpoints/HTX_WEEKLY_SCOPE_PROPOSAL.json',...r.source_receipts.map(s=>s.path)];
 const comparison=await control.call('compare/'+r.proposal_base_sha+'...'+head);
 if(!Array.isArray(comparison.files)||comparison.files.some(f=>!allowed.includes(f.filename)||f.status==='removed'||f.status==='renamed')||comparison.files.length!==allowed.length||comparison.commits?.length!==1)throw Error('WEEKLY_DATA_ONLY_DIFF_REQUIRED');
 return{status:'EXACT_WEEKLY_DATA_ONLY_PROPOSAL_BOUND',head,expected_main,source_run:String(source_run),branch,source_receipts:r.source_receipts,receipt:r,provider_HTTP:0,D1:0,production_activation_allowed:false};
}

export async function dispatchWeeklyConnectedCheck(control,{proposal,lease,source_run,clock=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 const start=clock(),deadline=Math.min(start+10*60000,lease.lease.expires_ts-30000),workflow='liq-assembled-offline-20261012.yml';
 if(deadline-start<120000)throw Error('WEEKLY_CONNECTED_CHECK_LEASE_HEADROOM_REQUIRED');
 await control.call('actions/workflows/'+workflow+'/dispatches','POST',{ref:proposal.branch,inputs:{weekly_proposal:true,weekly_expected_main:lease.head,weekly_source_run:String(source_run)}});
 let selected;
 while(clock()<deadline){
  const current=(await control.call('git/ref/heads/main')).object.sha;if(current!==lease.head)throw Error('WEEKLY_MAIN_MOVED_DURING_CHECK');
  const list=await control.call('actions/workflows/'+workflow+'/runs?branch='+encodeURIComponent(proposal.branch)+'&event=workflow_dispatch&per_page=10');
  const runs=(list.workflow_runs||[]).filter(r=>r.head_sha===proposal.head&&Date.parse(r.created_at)>=start-2000);
  if(runs.length>1)throw Error('AMBIGUOUS_WEEKLY_CHECK_RUN');
  selected=runs[0];
  if(selected?.status==='completed'){if(selected.conclusion!=='success')throw Error('WEEKLY_CONNECTED_CHECK_'+selected.conclusion);return{status:'EXACT_WEEKLY_CONNECTED_CHECK_SUCCESS',run:selected.id,head:selected.head_sha,url:selected.html_url,production_activation_allowed:false};}
  await sleep(15000);
 }
 if(selected?.id)await control.call('actions/runs/'+selected.id+'/cancel','POST');
 throw Error('WEEKLY_CONNECTED_CHECK_LEASE_DEADLINE');
}
