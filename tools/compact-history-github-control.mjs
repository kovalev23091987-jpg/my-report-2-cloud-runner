import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {makeGithubControl,acquireWeeklyPhaseLease,releaseWeeklyPhaseLease,readMirrorContext} from '../runner/github-bounded-phase-lease.mjs';
import {assertMirrorOwner,adoptCompactSourceCommit} from '../runner/github-four-mirror-cas.mjs';
import {compactChangedPaths} from './compact-history-changed-paths.mjs';
const saved='/tmp/report2-compact-mirror-context.json',counter='/tmp/report2-compact-control-count.json',published='/tmp/report2-compact-published-head';
const prefix='HTX_COMPACT_4H_SAME_SOURCE_6_PER_DAY_PRICE_ONLY_NO_TELEGRAM',mode=process.argv[2];
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const requireValue=(v,c)=>{if(!v)throw Error(c);};
const output=values=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(values).map(([k,v])=>k+'='+v+'\n').join(''));};
requireValue(process.env.GITHUB_REPOSITORY==='kovalev23091987-jpg/my-report-2-cloud-runner'&&/^\d+$/.test(process.env.GITHUB_RUN_ID||''),'EXACT_COMPACT_REPOSITORY_RUN_REQUIRED');
let used=fs.existsSync(counter)?JSON.parse(fs.readFileSync(counter)).used:0;
const control=makeGithubControl({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,fetch_impl:async(url,options)=>{requireValue(used<11,'COMPACT_GITHUB_CONTROL_11_CAP');used++;fs.writeFileSync(counter,JSON.stringify({used,maximum:11}));return fetch(url,options);}});
if(mode==='acquire'){
 requireValue(!fs.existsSync(saved),'COMPACT_OWN_RECEIPT_ALREADY_EXISTS');
 const receipt=await acquireWeeklyPhaseLease(control,{expected_main:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID,lease_ms:25*60000,maximum_blob_reads:0,scope:prefix});
 if(receipt.allowed){fs.writeFileSync(saved,JSON.stringify({receipt,context:control.mirror_context}));output({acquired:'true',owner:receipt.lease.owner,head:receipt.head});}
 else output({acquired:'false'});
 console.log(JSON.stringify({mode,status:receipt.status,head:receipt.head??null,GitHub_control_HTTP:used,sourceHTTP:0,nativeSQL:0}));
}else if(mode==='guard'||mode==='release'||mode==='persist'){
 const state=JSON.parse(fs.readFileSync(saved,'utf8'));control.mirror_context=state.context;
 if(mode==='release'&&fs.existsSync(published)){
  const h=fs.readFileSync(published,'utf8').trim();requireValue(/^[a-f0-9]{40}$/.test(h)&&git('rev-parse','HEAD')===h,'COMPACT_KNOWN_PUBLISHED_HEAD_REQUIRED');
  if(h!==state.receipt.head){control.mirror_context=adoptCompactSourceCommit(state.context,{head:h,parent:git('rev-parse',h+'^'),changed_paths:compactChangedPaths(state.receipt.head,h),acknowledged:true});state.receipt.head=h;}
 }
 if(mode==='persist'){
  const h=git('rev-parse','HEAD'),changed_paths=compactChangedPaths(state.receipt.head,h);
  adoptCompactSourceCommit(state.context,{head:h,parent:git('rev-parse',h+'^'),changed_paths,acknowledged:true});
  assertMirrorOwner(state.context,state.receipt.lease.owner,Date.now(),prefix);
  git('push','origin','HEAD:main','--force-with-lease=refs/heads/main:'+state.receipt.head);
  fs.writeFileSync(published,h+'\n');console.log(JSON.stringify({mode,status:'KNOWN_SOURCE_ONLY_GIT_PUSH_ACK',head:h,GitHub_API_control_HTTP:used,sourceHTTP:0,nativeSQL:0}));
 }else if(mode==='guard'){
  requireValue(git('rev-parse','HEAD')===state.receipt.head,'COMPACT_EXACT_LEASED_CHECKOUT_REQUIRED');
  const context=await readMirrorContext(control,{expected_main:state.receipt.head,maximum_blob_reads:0});assertMirrorOwner(context,state.receipt.lease.owner,Date.now(),prefix);
  console.log(JSON.stringify({mode,status:'EXACT_FOUR_MIRROR_COMPACT_GUARD',head:context.head,GitHub_control_HTTP:used,sourceHTTP:0,nativeSQL:0}));
 }else{
  let proof;try{proof=JSON.parse(fs.readFileSync('audit-output/htx-compact-4h/actual-batch.json','utf8'));}catch{}
  const phase_changes=proof?{latest_htx_compact_4h_daily:{cloud_run:Number(process.env.GITHUB_RUN_ID),head:proof.head,status:proof.status,sourceHTTP:proof.sourceHTTP,source_http_reserved:proof.source_http_reserved,results:proof.results?.map(x=>({contract:x.contract,status:x.status,observed_bars:x.observed_bars})),D1:proof.D1,source_cap_unchanged:6,native_1m_complete:false,actual_ENTRY:false,project_complete:false}}:{};
  const receipt=await releaseWeeklyPhaseLease(control,state.receipt,{phase_changes,release_key:'last_htx_compact_4h_lease_release'});requireValue(receipt.status==='OWN_WEEKLY_LEASE_RELEASED','COMPACT_OWN_RELEASE_NOT_CLOSED');console.log(JSON.stringify({mode,status:receipt.status,head:receipt.head,GitHub_control_HTTP:used,sourceHTTP:0,nativeSQL:0}));
 }
}else throw Error('EXACT_COMPACT_CONTROL_MODE_REQUIRED');
