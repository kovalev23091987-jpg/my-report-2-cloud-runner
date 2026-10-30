import fs from 'node:fs/promises';import vm from 'node:vm';import {gzipSync} from 'node:zlib';
import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';
import {runExactRecoveryDiagnosis} from '../runner/exact-recovery-diagnosis.mjs';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {active105OfflineReviewOwner} from '../runner/offline-review-authority.mjs';
import {loadVerifiedNativeDayReconciliation} from '../runner/verified-native-day-reconciliation.mjs';
import {APPROVED_HTX_SCOPE} from '../current-generation/files/src/approved-htx-analysis-scope.mjs';
import {reconcileNativeQueryCosts} from '../runner/native-query-cost-reconciliation.mjs';
const dir='audit-output/exact-recovery-diagnosis',head=process.env.GITHUB_SHA,owner=process.env.REPORT2_EXPECTED_OWNER;await fs.mkdir(dir,{recursive:true});
let controlHTTP=0,bridgeHTTP=0;const budgetFetch=async(...args)=>{if(++controlHTTP>24)throw Error('CONTROL_HTTP_BOUND');return fetch(...args);};
const control=makeGithubControl({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,fetch_impl:budgetFetch});let lease;
async function guard(stage){
 if((await control.call('git/ref/heads/main')).object.sha!==head||process.env.REPORT2_EXPECTED_MAIN!==head)throw Error('FRESH_EXACT_MAIN_REQUIRED');
 if(!lease){const [p,f,g,s]=await Promise.all([control.read('checkpoints/CLOUD_PHASE_STATE_20261004.json',head),control.read('audit-fixes/source-optimization-20260930/execution-lock.json',head),control.read('REPORT2_CURRENT_GENERATION.json',head),control.read('checkpoints/CURRENT_PROJECT_STATUS.json',head)]);if(!active105OfflineReviewOwner(p.value)||p.value.lease.owner!==owner||f.value.active||g.value.latest_only!==true||s.value.active_working_state?.owned_lease!==owner||!p.value.lease.scope.includes('specific missing fact'))throw Error('EXACT_OWN_SCOPED_LEASE_REQUIRED');lease=p.value.lease;}
 if(Date.now()>=lease.expires_ts)throw Error('OWN_LEASE_EXPIRED');
}
await guard('preflight');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{nativeQueryReceipts:true,beforeRequest:()=>({allowed:++bridgeHTTP<=32})});
const src=await fs.readFile('current-generation/files/src/worker.js','utf8'),a=src.indexOf('function classifyHtxInstrumentScope('),b=src.indexOf('function symbolFingerprint(',a);if(a<0||b<=a)throw Error('CURRENT_CLASSIFIER_REQUIRED');const classify=vm.runInNewContext(src.slice(a,b)+';classifyHtxInstrumentScope',{});
const reconciliation=loadVerifiedNativeDayReconciliation({root:process.cwd(),generation:APPROVED_HTX_SCOPE.generation,now_ts:Date.now()});
const proof=await runExactRecoveryDiagnosis({db,guard,source_run_id:process.env.GITHUB_RUN_ID,reconciliation,classify,retain:async(name,bytes)=>fs.writeFile(dir+'/'+name+'.gz',gzipSync(bytes,{mtime:0}))});
proof.head=head;proof.cloud_run=process.env.GITHUB_RUN_ID;proof.owner=owner;proof.control_HTTP=controlHTTP;proof.bridge_HTTP=bridgeHTTP;proof.total_HTTP=controlHTTP+bridgeHTTP+proof.sourceHTTP;proof.journal=db.nativeQueryCostReceipts();proof.journal_reconciliation=reconcileNativeQueryCosts({journals:[proof.journal],usage:proof.D1});
await fs.writeFile(dir+'/proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({status:proof.status,reason:proof.reason,sourceHTTP:proof.sourceHTTP,control_HTTP:controlHTTP,bridge_HTTP:bridgeHTTP,D1:proof.D1,missing:proof.missing_catalog?.map(x=>({contract:x.contract,reason:x.reason})),presentations:proof.canonical_rows.map(x=>({contract:x.contract_code,status:x.compact.status,length:x.compact.length,max:x.compact.max_length})),delivery_proven:false}));
if(proof.status!=='EXACT_CATALOG_AND_PERSISTED_PRESENTATIONS_READ'||!proof.journal_reconciliation.statement_costs_closed||proof.total_HTTP>164)process.exitCode=1;
