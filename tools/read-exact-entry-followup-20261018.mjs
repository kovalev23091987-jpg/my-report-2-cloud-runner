import fs from 'node:fs/promises';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {runExactEntryFollowup} from '../runner/exact-entry-followup.mjs';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {active105OfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {loadVerifiedNativeDayReconciliation} from '../runner/verified-native-day-reconciliation.mjs';
import {APPROVED_HTX_SCOPE} from '../current-generation/files/src/approved-htx-analysis-scope.mjs';
import {reconcileNativeQueryCosts} from '../runner/native-query-cost-reconciliation.mjs';
const dir='audit-output/exact-entry-followup',head=process.env.GITHUB_SHA,owner=process.env.REPORT2_EXPECTED_OWNER;await fs.mkdir(dir,{recursive:true});
let controlHTTP=0,bridgeHTTP=0,lease;
const control=makeGithubControl({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,fetch_impl:async(...args)=>{if(++controlHTTP>24)throw Error('CONTROL_HTTP_BOUND');return fetch(...args);}});
async function guard(){
 if((await control.call('git/ref/heads/main')).object.sha!==head||process.env.REPORT2_EXPECTED_MAIN!==head)throw Error('FRESH_EXACT_MAIN_REQUIRED');
 if(!lease){const [p,f,g,s]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',head),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',head),control.read('REPORT2_CURRENT_GENERATION.json',head),control.read('checkpoints/CURRENT_PROJECT_STATUS.json',head)]);if(!active105OfflineReviewOwner(p.value)||p.value.lease.owner!==owner||f.value.active||g.value.latest_only!==true||s.value.active_working_state?.owned_lease!==owner||!p.value.lease.scope.includes('original OBSERVE/WAIT to ENTRY'))throw Error('EXACT_OWN_ENTRY_SCOPE_REQUIRED');lease=p.value.lease;}
 if(Date.now()>=lease.expires_ts)throw Error('OWN_LEASE_EXPIRED');
}
await guard();
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{nativeQueryReceipts:true,beforeRequest:()=>({allowed:++bridgeHTTP<=24})});
const proof=JSON.parse(await fs.readFile('checkpoints/natural-sent-and-entry-followup-20261018/native-review.json','utf8'));
const reconciliation=loadVerifiedNativeDayReconciliation({root:process.cwd(),generation:APPROVED_HTX_SCOPE.generation,now_ts:Date.now()});
const result=await runExactEntryFollowup({db,guard,proof,source_run_id:process.env.GITHUB_RUN_ID,reconciliation});
result.head=head;result.cloud_run=process.env.GITHUB_RUN_ID;result.owner=owner;result.control_HTTP=controlHTTP;result.bridge_HTTP=bridgeHTTP;result.total_HTTP=controlHTTP+bridgeHTTP;result.journal=db.nativeQueryCostReceipts();result.journal_reconciliation=reconcileNativeQueryCosts({journals:[result.journal],usage:result.D1});
await fs.writeFile(dir+'/proof.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,reason:result.reason,description:result.description,D1:result.D1,control_HTTP:controlHTTP,bridge_HTTP:bridgeHTTP,actual_ENTRY:false,sourceHTTP:0,MAIN:0,Telegram:0}));
if(result.status!=='EXACT_ENTRY_FOLLOWUP_READ_CLOSED'||!result.journal_reconciliation.statement_costs_closed||result.total_HTTP>164)process.exitCode=1;
