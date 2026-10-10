import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalFingerprint,assessActionability,renderCanonicalTelegram} from '../src/canonical-publication.mjs';
import {assessStrategyFitShadow,STRATEGY_FIT_GROUP_WEIGHTS} from '../src/owner-strategy-fit-shadow.mjs';
const T=Date.UTC(2026,9,10,8),names=Object.keys(STRATEGY_FIT_GROUP_WEIGHTS);
const c={status:'CLOSED',run_id:'R:actual-snapshot-bound',snapshot_id:'S:original',observed_ts:T,
 direction:'LONG',metadata:{contract:'NEAR-USDT'},scores:{overall_0_100:82,coin_interest_0_100:83,is_probability:false}};
c.analytical_fingerprint=canonicalFingerprint(c);
function fixture(overrides={}){
 return Object.fromEntries(names.map((name,i)=>[name,[{id:'criterion_'+i,status:'VERIFIED',contract:c.metadata.contract,
  direction:c.direction,run_id:c.run_id,snapshot_id:c.snapshot_id,analytical_fingerprint:c.analytical_fingerprint,
  source_ts:T-2000,observed_ts:T-1000,max_age_ms:180000,physical_root:'INDEPENDENT:SOURCE:'+i+':CLOSED',...overrides[name]}]]));
}
const assess=(criteria=fixture(),canonical=c)=>assessStrategyFitShadow({canonical,criteria,decision_ts:T});
test('100 is exactly every declared applicable strategy criterion verified, never win probability or ENTRY',()=>{
 const r=assess();assert.equal(r.status,'SHADOW_CRITERION_MATCH_COMPUTED');
 assert.equal(r.match_score_0_100,100);assert.equal(r.all_applicable_criteria_verified,true);
 assert.equal(r.is_probability,false);assert.equal(r.entry_authorized,false);
 assert.equal(r.telegram_send_allowed_by_this_score,false);assert.equal(r.canonical_score_unchanged,true);
 assert.equal(r.production_filter_unchanged,true);assert.equal(r.canonical_overall_score_0_100,82);
});
test('one missing criterion lowers score, cannot pass as verified',()=>{
 const rows=fixture();rows.native_market_confirmation[0]={...rows.native_market_confirmation[0],status:'MISSING',source_ts:null,observed_ts:null,physical_root:null};
 const r=assess(rows);assert.equal(r.match_score_0_100,70);
 assert.equal(r.all_applicable_criteria_verified,false);assert.equal(r.groups[1].awarded,0);
});
test('contradicted risk removes its 15 points, missing is not treated as a positive vote',()=>{
 const rows=fixture();rows.invalidation_risk_and_target[0]={...rows.invalidation_risk_and_target[0],status:'CONTRADICTED',source_ts:null,observed_ts:null,physical_root:null};
 assert.equal(assess(rows).match_score_0_100,85);
});
test('not-applicable criterion cannot make empty group 100',()=>{
 const rows=fixture();rows.entry_scenario_and_settlement[0]={...rows.entry_scenario_and_settlement[0],status:'NOT_APPLICABLE',source_ts:null,observed_ts:null,physical_root:null};
 assert.equal(assess(rows).status,'NOT_CLOSED');
});
test('stale, future and cross-asset receipts fail closed, not merely a lower score',()=>{
 for(const patch of [{source_ts:T+1},{source_ts:T-180001},{contract:'BTC-USDT'},{run_id:'FOREIGN'},{analytical_fingerprint:'WRONG'}]){
  const rows=fixture();Object.assign(rows.native_market_confirmation[0],patch);
  assert.equal(assess(rows).status,'NOT_CLOSED');
 }
});
test('repeated physical source cannot count twice as independent evidence',()=>{
 const rows=fixture();rows.native_market_confirmation[0].physical_root=rows.direction_and_independent_evidence[0].physical_root;
 assert.equal(assess(rows).reason,'VERIFIED_CRITERION_CLOCK_OR_INDEPENDENCE_NOT_CLOSED');
});
test('corrupt canonical fingerprint and score probability fail closed',()=>{
 assert.equal(assess(fixture(),{...c,analytical_fingerprint:'BAD'}).status,'NOT_CLOSED');
 const prob={...c,scores:{...c.scores,is_probability:true}};
 prob.analytical_fingerprint=canonicalFingerprint(prob);
 assert.equal(assess(fixture(),prob).status,'NOT_CLOSED');
});
test('shadow never changes canonical actionability or rendered Telegram bytes',()=>{
 const before=JSON.stringify(c),a=assessActionability({canonical:c,lifecycle_event:'OBSERVE'});
 const t=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
 const r=assess();
 assert.equal(JSON.stringify(c),before);
 assert.deepEqual(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}),a);
 assert.deepEqual(renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}),t);
 assert.equal(r.telegram_text_unchanged,true);
});
