// Offline diagnostic projection. Never calls sources, D1, MAIN or Telegram.
// It does not reconstruct missing producer inputs or create a live signal.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {verifiedObservationRange} from '../../current-generation/files/src/observation-technical-range.mjs';
import {earlySourceRolesClosed} from '../../current-generation/files/src/observation-source-role-gate.mjs';
import {assessActionability,renderCanonicalTelegram,canonicalFingerprint} from '../../current-generation/files/src/canonical-publication.mjs';
const args=process.argv.slice(2),outIndex=args.indexOf('--out'),outFile=outIndex>=0?args[outIndex+1]:null;
if(outIndex>=0)args.splice(outIndex,2);
if(!args.length)throw Error('RETAINED_CANONICAL_JSON_PATH_REQUIRED');
const proof={schema:'BATCHED_ORIGINAL_CLOCK_PLAN_PROJECTION_V1',scope:'RETAINED_CANONICAL_PLAN_COMPONENT_PROJECTION_NOT_FULL_PRODUCER_REPLAY_OR_FRESH_DELIVERY',sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,originals_unchanged:true,rows:[]};
for(const file of args){const data=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const item of data.rows||data.results||[]){const original=item.canonical;if(!original)continue;
  const before=JSON.stringify(original),contract=original.metadata.contract,range=verifiedObservationRange({evidence:original.metadata.internal_market_context?.evidence_v2?.evidence||[],contract,direction:original.direction,price:original.current_price,decision_ts:original.observed_ts});
  const row={run_id:original.run_id,snapshot_id:original.snapshot_id,original_fingerprint:original.analytical_fingerprint,original_decision_ts:original.observed_ts,original_state:original.state,direction:original.direction,interest:original.scores.coin_interest_0_100,original_plan_reason:original.metadata.scenario_plan_transfer?.fallback_receipt?.reason??null,original_source_roles_closed:earlySourceRolesClosed(original),range:range?{level:range.level,cancel:range.cancel,source_ts:range.source_ts,evidence_id:range.evidence_id}:null,projected_action:null};
  // Only a known plan refusal with a qualified original direction is projected.
  // Other historical missing gates remain missing; no alternate direction,
  // threshold or fabricated confirming receipt is supplied to the consumer.
  if(row.original_plan_reason==='NO_FORWARD_FACTUAL_PRICE_TRIGGER'&&range&&original.metadata.direction_resolution?.status==='CLOSED'&&original.scores.coin_interest_0_100>=70&&original.metadata.protective_filter==null){
   const c=structuredClone(original),ts=c.observed_ts;c.state='OBSERVE';c.entry={area:range.level+' USDT',min_price:range.level,max_price:range.level,basis:range.basis};
   c.trigger={metric:'price',operator:c.direction==='LONG'?'>=':'<=',value:range.level,unit:'USDT',timeframe:'NEXT_CHECK',expires_ts:ts+1800000,cancel_condition:'price'+(c.direction==='LONG'?'<':'>')+range.cancel,next_recheck_ts:ts+300000};c.invalidation={condition:c.trigger.cancel_condition,price:range.cancel};c.targets=[];c.analytical_fingerprint=canonicalFingerprint(c);
   const action=assessActionability({canonical:c,lifecycle_event:'OBSERVE'}),render=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
   assert.deepEqual(c.scores,original.scores);assert.deepEqual(c.source_receipts,original.source_receipts);assert.deepEqual(c.metadata,original.metadata);assert.equal(c.observed_ts,original.observed_ts);
   row.projected_action={reason:action.reason,deliver:action.deliver,approved_text_ready:render.ok,projected_fingerprint:c.analytical_fingerprint,missing_entry_target_not_invented:true};
  }
  assert.equal(JSON.stringify(original),before);proof.rows.push(row);
 }
}
const text=JSON.stringify(proof,null,2)+'\n';if(outFile)fs.writeFileSync(outFile,text);else process.stdout.write(text);
