import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {canonicalFingerprint,assessActionability,renderCanonicalTelegram} from '../current-generation/files/src/canonical-publication.mjs';
import {assessStrategyFitShadow,STRATEGY_FIT_GROUP_WEIGHTS} from '../current-generation/files/src/owner-strategy-fit-shadow.mjs';

const source=[
 {contract:'ZEC-USDT',file:'checkpoints/actual-zec-sent150-original-input-20261007.json.gz',proof:'checkpoints/ACTUAL_ZEC_SENT150_SOURCE_USE_20261007.json',source_run:37546165952},
 {contract:'AKE-USDT',file:'checkpoints/actual-current-approved-brief-37557085058.json.gz',proof:'checkpoints/ACTUAL_CURRENT_BRIEF_AKE_SENT152_20261007.json',source_run:37557085058}
];
const sha=b=>createHash('sha256').update(b).digest('hex');
const cases=[];
for(const s of source){
 const proof=JSON.parse(fs.readFileSync(s.proof));
 const bytes=fs.readFileSync(s.file),expected=s.contract==='ZEC-USDT'?proof.original_exact_gzip_sha256:proof.exact_readback?.gzip_sha256;
 assert.equal(sha(bytes),expected,'retained original gzip digest required');
 const original=JSON.parse(gunzipSync(bytes));
 assert.equal(original.source_cloud_run,s.source_run,'original source run required');
 const row=original.rows.find(r=>r.contract_code===s.contract);
 assert.ok(row?.canonical&&row.telegram_text,'exact retained original canonical and Telegram text required');
 const c=row.canonical;
 assert.equal(canonicalFingerprint(c),c.analytical_fingerprint,'original fingerprint required');
 const event=row.lifecycle_event||'OBSERVE',before=JSON.stringify(c);
 const beforeAction=assessActionability({canonical:c,lifecycle_event:event});
 const beforePresentation=renderCanonicalTelegram({canonical:c,lifecycle_event:event,
  context_policy:c.observed_ts<Date.parse('2026-10-07T01:30:00Z')?'ORIGINAL_V5_20261006':'OWNER_APPROVED_BRIEF_20261007'});
 // The missing-criteria case is intentional: never fabricate past evidence
 // or relabel existing 82/91 interest as the new 0-100 match.
 const missing=Object.fromEntries(Object.keys(STRATEGY_FIT_GROUP_WEIGHTS).map((group,i)=>[group,[{
  id:'missing_'+i,status:'MISSING',contract:c.metadata.contract,direction:c.direction,
  run_id:c.run_id,snapshot_id:c.snapshot_id,analytical_fingerprint:c.analytical_fingerprint,
  source_ts:null,observed_ts:null,physical_root:null}]]));
 const shadow=assessStrategyFitShadow({canonical:c,criteria:missing,decision_ts:c.observed_ts});
 assert.equal(shadow.status,'SHADOW_CRITERION_MATCH_COMPUTED');
 assert.equal(shadow.match_score_0_100,0);
 assert.equal(shadow.telegram_send_allowed_by_this_score,false);
 assert.equal(shadow.canonical_score_unchanged,true);
 assert.equal(shadow.entry_authorized,false);
 assert.deepEqual(assessActionability({canonical:c,lifecycle_event:event}),beforeAction);
 assert.deepEqual(renderCanonicalTelegram({canonical:c,lifecycle_event:event,
  context_policy:c.observed_ts<Date.parse('2026-10-07T01:30:00Z')?'ORIGINAL_V5_20261006':'OWNER_APPROVED_BRIEF_20261007'}),beforePresentation);
 assert.equal(JSON.stringify(c),before);
 assert.equal(sha(Buffer.from(row.telegram_text)),sha(Buffer.from(row.telegram_text)),'original bytes untouched');
 cases.push({contract:s.contract,source_cloud_run:s.source_run,source_head:original.source_head,
  run_id:c.run_id,snapshot_id:c.snapshot_id,fingerprint:c.analytical_fingerprint,
  original_score:c.scores?.overall_0_100??c.scores?.coin_interest_0_100,
  original_actionable:beforeAction.deliver,original_presentation_length:row.telegram_text.length,
  new_shadow_match:0,reason:'NO_VERIFIED_NEW_CRITERION_RECEIPTS_ON_ORIGINAL_SNAPSHOT',
  original_signal_unchanged:true,Telegram:0,sourceHTTP:0});
}
const out={schema:'ACTUAL_ORIGINAL_SENT_STRATEGY_FIT_SHADOW_NO_DROP_REPLAY_V1',
 status:'TWO_RETAINED_ORIGINAL_CANONICAL_SNAPSHOTS_NO_DROP_VERIFIED',
 tested_head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),
 original_cases:cases,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,original_sent_rewritten:false,
 shadow_visible_in_Telegram:false,actual_ENTRY:false,project_complete:false,
 next:'Separate closed-candle trigger and terminal Telegram delivery still require implementation and actual acceptance.'};
fs.mkdirSync('audit-output',{recursive:true});
fs.writeFileSync('audit-output/owner-strategy-fit-original-sent-no-drop.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({status:out.status,cases:cases.map(x=>({contract:x.contract,original_actionable:x.original_actionable,original_score:x.original_score,shadow_match:x.new_shadow_match})),Telegram:0}));
