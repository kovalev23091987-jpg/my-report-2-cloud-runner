import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {checkWeeklyGithubProposal,dispatchWeeklyConnectedCheck} from './htx-weekly-proposal-check.mjs';
import {makeGithubControl} from './github-bounded-phase-lease.mjs';
const original=JSON.parse(fs.readFileSync('checkpoints/htx-crypto-universe-refresh-38071397633/proof.json'));
const main='a'.repeat(40),head='b'.repeat(40),base='c'.repeat(40),week='2026-10-05',source_run='123',branch=`maintenance/htx-weekly-${week}-${source_run}`,now=original.completed_ts;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
 const receipts=original.receipts.map(s=>({...s,compressed_sha256:s.gzip_sha256,path:`checkpoints/htx-weekly-originals/${week}/${s.file}`}));
 const lease={owner:'CODEX:ACTIVE_SOURCE_COVERAGE_AND_QUOTA:'+now,expires_ts:now+1200000,expected_main:base};
 const receipt={schema:'HTX_WEEKLY_CHECKED_SCOPE_PROPOSAL_V1',week,branch,source_run,lease_owner:lease.owner,proposal_base_sha:base,expected_main:main,production_scope_changed:false,source_receipts:receipts,observed_ts:now};
 const phase={lease,latest_own_bounded_continuation_lease:{owner:lease.owner},active_working_state:{owned_lease:lease.owner,owner_weekly_HTX_catalog_sync_authorized:true}};
 const files=['current-generation/files/src/approved-htx-analysis-scope.mjs','cloudflare/free-history/hourly-archive.mjs',`checkpoints/htx-weekly-universe-${week}.json.gz`,`checkpoints/HTX_WEEKLY_SOURCE_QUEUE_${week}.json`,'checkpoints/HTX_WEEKLY_SCOPE_PROPOSAL.json',...receipts.map(s=>s.path)].map(filename=>({filename,status:'added'}));
 const state={phase,receipt,files,fence:{active:false},parents:[{sha:base}],liveMain:main};
 const control={read:async path=>({value:path.includes('CLOUD_PHASE')?state.phase:path.includes('execution-lock')?state.fence:state.receipt}),call:async path=>path==='git/ref/heads/main'?{object:{sha:state.liveMain}}:path.startsWith('git/commits/')?{parents:state.parents}:path.startsWith('compare/')?{files:state.files,commits:[{}]}:assert.fail(path)};
 return{state,control,lease:{allowed:true,head:main,lease}};
}
test('six old real primary bodies preserve their hash and clock in the weekly proposal binding',async()=>{
 const f=fixture();for(const s of f.state.receipt.source_receipts){const b=fs.readFileSync('checkpoints/htx-crypto-universe-refresh-38071397633/'+s.file),raw=gunzipSync(b);assert.equal(hash(b),s.compressed_sha256);assert.equal(hash(raw),s.body_sha256);assert.equal(JSON.parse(raw).ts,s.source_ts);}
 const r=await checkWeeklyGithubProposal(f.control,{head,expected_main:main,source_run,branch,now});assert.equal(r.status,'EXACT_WEEKLY_DATA_ONLY_PROPOSAL_BOUND');assert.equal(r.provider_HTTP,0);assert.equal(r.production_activation_allowed,false);
});
test('unrelated code, phase restoration, removed source body or altered ownership denies the candidate',async()=>{
 for(const mutate of [s=>s.files.push({filename:'current-generation/files/src/worker.js',status:'modified'}),s=>s.files.push({filename:'checkpoints/CLOUD_PHASE_STATE_20261004.json',status:'modified'}),s=>s.files.pop(),s=>s.phase.lease.owner='FOREIGN',s=>s.phase.lease.expires_ts=now,s=>s.fence.active=true,s=>s.receipt.source_receipts[0].source_ts=s.receipt.observed_ts+1,s=>s.parents[0].sha=main,s=>s.liveMain=base]){
  const f=fixture();mutate(f.state);await assert.rejects(checkWeeklyGithubProposal(f.control,{head,expected_main:main,source_run,branch,now}));
 }
});
test('GitHub dispatch 204 is accepted without parsing a nonexistent JSON body',async()=>{
 let called;const c=makeGithubControl({repository:'owner/repo',token:'CONTROLLED_ONLY',fetch_impl:async(url,options)=>{called={url,options};return new Response(null,{status:204});}});
 assert.equal(await c.call('actions/workflows/example.yml/dispatches','POST',{ref:'branch'}),null);assert.ok(called.options.signal);assert.equal(called.options.headers.authorization,'Bearer CONTROLLED_ONLY');
});
test('an Actions-created proposal explicitly dispatches and binds the exact successful common check',async()=>{
 const f=fixture(),calls=[];let clock=now,read=0;
 const c={call:async(path,method,body)=>{calls.push({path,method,body});if(method==='POST')return null;if(path==='git/ref/heads/main')return{object:{sha:main}};read++;return{workflow_runs:[{id:321,head_sha:head,created_at:new Date(now).toISOString(),status:read===1?'in_progress':'completed',conclusion:read===1?null:'success',html_url:'CONTROLLED_CI_URL'}]};}};
 const r=await dispatchWeeklyConnectedCheck(c,{proposal:{head,branch},lease:f.lease,source_run,clock:()=>clock,sleep:async ms=>{clock+=ms;}});assert.equal(r.run,321);assert.equal(r.head,head);assert.equal(calls[0].body.inputs.weekly_expected_main,main);assert.equal(calls[0].body.inputs.weekly_source_run,source_run);assert.equal(r.production_activation_allowed,false);
});
test('failed, ambiguous, moved-head or lease-late checks cannot be treated as success',async()=>{
 for(const mode of ['failure','ambiguous','moved','late']){
  const f=fixture(),rows=[{id:321,head_sha:head,created_at:new Date(now).toISOString(),status:'completed',conclusion:'failure'}];if(mode==='ambiguous')rows.push({...rows[0],id:322});if(mode==='late')f.lease.lease.expires_ts=now+60000;
  const c={call:async(path,method)=>method==='POST'?null:path==='git/ref/heads/main'?{object:{sha:mode==='moved'?base:main}}:{workflow_runs:rows}};
  await assert.rejects(dispatchWeeklyConnectedCheck(c,{proposal:{head,branch},lease:f.lease,source_run,clock:()=>now,sleep:async()=>{throw Error('NO_WAIT_EXPECTED');}}));
 }
});
test('the weekly candidate does not merge, deploy, restore paused blocks or send a report',()=>{
 const source=fs.readFileSync('tools/weekly-htx-universe-refresh.mjs','utf8'),workflow=fs.readFileSync('.github/workflows/htx-weekly-source-universe.yml','utf8');
 assert.match(source,/dispatchWeeklyConnectedCheck/);assert.match(source,/parents:\[lease.lease.expected_main\]/);assert.doesNotMatch(source,/['"]PUT['"].*pulls|wrangler.*deploy|sendMessage|runner-main/);assert.match(workflow,/actions: write/);
});
