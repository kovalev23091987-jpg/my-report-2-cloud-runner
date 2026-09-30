import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_T as T,roleFact} from './source-role-fixtures.mjs';
const {sourceKey,buildRoleEvidenceView,independentConfirmationCount,primaryReceiptForRole}=await import(process.env.REPORT2_ROLE_TEST_MODULE||new URL('../files/src/source-role-consumer.mjs',import.meta.url));
const {assessActionability,loadBoundTelegram,canonicalFingerprint}=await import(process.env.REPORT2_ROLE_PUBLICATION_MODULE||new URL('../files/src/canonical-publication.mjs',import.meta.url));
const scope={contract:'SOL-USDT',observed_ts:T};
const view=rows=>buildRoleEvidenceView(rows,scope);
const htx=()=>roleFact({venue:'HTX',metric:'execution_gate_status'});
const observation=rows=>({status:'CLOSED',observed_ts:T,state:'OBSERVE',direction:'LONG',scores:{coin_interest_0_100:75,overall_0_100:null,is_probability:false},entry:{min_price:100,max_price:100},trigger:{metric:'price',operator:'>=',value:100,unit:'USDT',timeframe:'5m',expires_ts:T+600000,next_recheck_ts:T+60000,cancel_condition:'price<95'},targets:[{price:106}],metadata:{contract:'SOL-USDT',source_role_view:view(rows)}});
test('a verified OI receipt does not prove funding, orderbook or execution',()=>{
 const r=view([roleFact({venue:'HTX'})]).classified[0];assert.deepEqual(r.assigned_roles,['OI_PRIMARY']);assert.ok(r.declared_roles.includes('EXECUTION_TRUTH'));assert.equal(r.source_priority_semantics,'STATIC_OPERATIONAL_PRIORITY_NOT_PREDICTIVE_WEIGHT');
});
test('provider names and generic successful snapshots are not measured facts',()=>{
 for(const r of [{source:'HTX'}, {source:'HTX',metric:'HTX_EXECUTION_SNAPSHOT',status:'CLOSED',source_ts:T,observed_ts:T}, {source:'BYBIT',metric:'venue_status',status:'CLOSED'}])assert.deepEqual(view([r]).classified[0].assigned_roles,[]);
});
test('exact provider aliases replace ambiguous substring matching',()=>{
 for(const source of ['FAKE_HTX_MIRROR','AGGREGATE','NOTBINANCE','A BYBIT COMMENT'])assert.equal(sourceKey({source}),null);
 assert.equal(sourceKey({source:'Bybit Public V5'}),'BYBIT_OFFICIAL');assert.equal(sourceKey({source:'HTX',provider:'BINANCE'}),null);
});
for(const [name,patch] of Object.entries({quota:{status:'RATE_LIMITED'},stale:{event_ts:T-3600000},future:{event_ts:T+120000},no_sla:{max_age_sec:null},unknown_quality:{quality_status:'UNKNOWN'},no_identity:{identity_status:'NOT_CLOSED'},foreign:{contract_code:'BTC-USDT'},zero_coverage:{coverage_pct:0},null_value:{normalized_value:null},mismatched_venue:{venue:'HTX'}}))test(`unusable ${name} receipt contributes no role or confirmation`,()=>{
 const r={...roleFact(),...patch};assert.deepEqual(view([r]).classified[0].assigned_roles,[]);assert.equal(independentConfirmationCount([r],'OI_CROSS_VENUE',scope),0);
});
test('fresh factual zero is kept, missing is not coerced to zero',()=>{const r=view([roleFact({value:0})]).classified[0];assert.deepEqual(r.assigned_roles,['OI_CROSS_VENUE']);assert.equal(r.normalized_value,0);});
test('actual Bybit, Gate and OKX metrics have separate exact roles',()=>{
 assert.deepEqual(view([roleFact({venue:'GATE',source:'Gate Public Futures',metric:'funding_rate'})]).classified[0].assigned_roles,['FUNDING_CROSS_VENUE']);
 const v=view([roleFact({venue:'OKX',source:'OKX Public V5',metric:'open_interest_current'})]);assert.equal(v.unknown_sources.length,0);assert.deepEqual(v.classified[0].assigned_roles,['OI_CURRENT_CROSS_VENUE']);assert.equal(v.roles.OI_CROSS_VENUE,undefined);
});
test('duplicate or repackaged same-origin facts do not add confirmations',()=>{
 const direct=roleFact({venue:'BYBIT'}),aggregate=roleFact({venue:'BYBIT',source:'BYKARANTELI'});
 assert.equal(independentConfirmationCount([direct,direct,aggregate],'OI_CROSS_VENUE',scope),1);
});
test('incompatible OI windows are not a two-venue same-metric confirmation',()=>{
 const rows=[roleFact(),roleFact({venue:'GATE',metric:'oi_change_4h',window:'4h'})];
 assert.equal(independentConfirmationCount(rows,'OI_CROSS_VENUE',scope),0);assert.equal(primaryReceiptForRole(rows,'OI_CROSS_VENUE',scope),null);
});
test('comparable exact OI observations expose distinct origins, not calibrated weights',()=>{
 const rows=[roleFact(),roleFact({venue:'GATE'})];assert.equal(independentConfirmationCount(rows,'OI_CROSS_VENUE',scope),2);assert.equal(view(rows).predictive_weight_changed,false);
});
test('different OI observation endpoints cannot be counted as synchronized confirmation',()=>{
 const rows=[roleFact(),roleFact({venue:'GATE',source_ts:T-120000})];assert.equal(independentConfirmationCount(rows,'OI_CROSS_VENUE',scope),0);
});
test('unknown funding settlement interval is not equivalent across venues',()=>{
 const rows=['BYBIT','GATE'].map(venue=>roleFact({venue,metric:'funding_rate',window:'FUNDING_HISTORY'}));assert.equal(independentConfirmationCount(rows,'FUNDING_CROSS_VENUE',scope),0);
});
test('early publication needs HTX execution proof plus a usable distinct origin',()=>{
 const positive=observation([htx(),roleFact()]);assert.equal(assessActionability({canonical:positive,lifecycle_event:'OBSERVE'}).deliver,true);
 for(const rows of [[htx(),{source:'BYBIT'}],[htx(),{...roleFact(),status:'RATE_LIMITED'}],[htx(),roleFact({venue:'HTX',source:'BYKARANTELI'})],[roleFact({venue:'HTX'}),roleFact()]])assert.equal(assessActionability({canonical:observation(rows),lifecycle_event:'OBSERVE'}).reason,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
});
test('old or tampered capability-only metadata is revalidated before publication',()=>{
 const c=observation([htx(),roleFact()]);for(const r of c.metadata.source_role_view.classified){r.fact_contract_status='NOT_CLOSED';r.role_evidence_usable=true;}
 assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,false);
});
test('already-bound legacy OBSERVE cannot bypass source proof at delivery',async()=>{
 const c=observation([htx(),roleFact()]);c.run_id='R';c.snapshot_id='S';
 c.metadata.source_role_view={status:'CLOSED',classified:[{source_key:'HTX_OFFICIAL',source_family:'HTX_OFFICIAL',assigned_roles:['EXECUTION_TRUTH'],registry_known:true},{source_key:'BINANCE_OFFICIAL',source_family:'BINANCE_OFFICIAL',assigned_roles:['OI_CROSS_VENUE'],registry_known:true}]};
 c.analytical_fingerprint=canonicalFingerprint(c);
 const b={publication_id:'P',presentation_hash:'H',analytical_fingerprint:c.analytical_fingerprint,snapshot_id:'S',run_id:'R',observed_ts:T,contract_code:'SOL-USDT',direction:'LONG',lifecycle_event:'OBSERVE',wave_id:'W'};
 const p={...b,actionability_status:'ACTIONABLE',canonical_json:JSON.stringify(c)};
 const db={prepare:q=>({bind:()=>({first:async()=>q.includes('v3_dispatch_publication_binding_shadow')?b:p})})};
 assert.equal((await loadBoundTelegram(db,{idempotency_key:'K',now_ts:T+1000})).status,'OBSERVE_SOURCE_ROLES_NOT_CLOSED');
});
