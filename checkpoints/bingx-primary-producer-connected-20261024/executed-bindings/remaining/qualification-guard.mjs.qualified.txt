import fs from 'node:fs/promises';
import {makeGithubControl} from '../../runner/github-bounded-phase-lease.mjs';
import {readMirrorContext,assertMirrorOwner,fullRawBasis} from '../../runner/github-four-mirror-cas.mjs';
const P='checkpoints/bingx-primary-producer-connected-20261024',p=JSON.parse(await fs.readFile(P+'/qualification-plan.json','utf8'));
if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_REF!=='refs/heads/'+p.branch||process.env.GITHUB_RUN_ATTEMPT!=='1')throw Error('EXACT_NEW_COMMON_ONLY');
const c=makeGithubControl({repository:'kovalev23091987-jpg/my-report-2-cloud-runner',token:process.env.GITHUB_TOKEN,initial_raw_basis:fullRawBasis(),maximum_calls:1});
const x=await readMirrorContext(c,{expected_main:p.main,maximum_blob_reads:0});assertMirrorOwner(x,p.owner,Date.now(),p.scope_prefix);
if(p.expires_ts-Date.now()<600000)throw Error('LEASE_HEADROOM_REQUIRED');
await fs.mkdir('audit-output/bingx-primary-producer-connected',{recursive:true});await fs.writeFile('audit-output/bingx-primary-producer-connected/guard.json',JSON.stringify({main:x.head,owner:p.owner,all4equal:true,checked_ts:Date.now(),GitHub_HTTP:c.metrics.length,source_HTTP:0,native_CF:0})+'\n');
