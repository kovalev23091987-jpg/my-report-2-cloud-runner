import fs from 'node:fs/promises';
import {makeGithubControl} from '../../runner/github-bounded-phase-lease.mjs';
import {readMirrorContext,assertMirrorOwner,fullRawBasis} from '../../runner/github-four-mirror-cas.mjs';
const p=JSON.parse(await fs.readFile('checkpoints/existing-fallback-statistics-connected-20261023/qualification-plan.json','utf8'));
if(process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_REF!=='refs/heads/'+p.branch||process.env.GITHUB_RUN_ATTEMPT!=='1')throw Error('EXACT_NEW_COMMON_WORKFLOW_ONLY');
const c=makeGithubControl({repository:'kovalev23091987-jpg/my-report-2-cloud-runner',token:process.env.GITHUB_TOKEN,initial_raw_basis:fullRawBasis(),maximum_calls:1});
const x=await readMirrorContext(c,{expected_main:p.main,maximum_blob_reads:0});assertMirrorOwner(x,p.owner,Date.now(),p.scope_prefix);
if(p.expires_ts-Date.now()<600000)throw Error('INSUFFICIENT_NEW_COMMON_LEASE_HEADROOM');
await fs.mkdir('audit-output/existing-fallback-statistics-connected',{recursive:true});await fs.writeFile('audit-output/existing-fallback-statistics-connected/guard.json',JSON.stringify({main:x.head,owner:p.owner,all4equal:true,checked_ts:Date.now(),GitHub_HTTP:c.metrics.length,native_CF:0})+'\n');
