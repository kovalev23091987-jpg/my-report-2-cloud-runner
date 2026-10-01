import test from 'node:test';
import assert from 'node:assert/strict';
import {ROLE_T as T,verifiedRoleView} from './source-role-fixtures.mjs';
import {assessActionability,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';

const observation=({interest=75,targets=[]}={})=>({
 status:'CLOSED',
 observed_ts:T,
 state:'OBSERVE',
 direction:'LONG',
 scores:{coin_interest_0_100:interest,overall_0_100:null,is_probability:false},
 entry:{area:'100 USDT',min_price:100,max_price:100},
 trigger:{metric:'price',operator:'>=',value:100,unit:'USDT',timeframe:'5m',expires_ts:T+600000,next_recheck_ts:T+60000,cancel_condition:'price<95'},
 invalidation:{condition:'price<95',price:95},
 targets,
 liquidations:{above:[],below:[]},
 metadata:{contract:'SOL-USDT',idea_basis:'MULTI_FACTOR',source_role_view:verifiedRoleView('SOL-USDT',T)},
});

test('early observation can surface while the 5 percent target is still pending',()=>{
 const canonical=observation();
 const action=assessActionability({canonical,lifecycle_event:'OBSERVE'});
 assert.equal(action.deliver,true);
 assert.equal(action.reason,'EARLY_ACTIONABLE_OBSERVE_TARGET_PENDING');
 const rendered=renderCanonicalTelegram({canonical,lifecycle_event:'OBSERVE'});
 assert.equal(rendered.ok,true);
 assert.match(rendered.text,/Цель после подтверждения входа: пока не подтверждена\./);
});

test('a favorable target remains mandatory for wait and confirmed entry without a fixed percentage',()=>{
 const wait={...observation(),state:'WAIT_FOR_TRIGGER',scores:{coin_interest_0_100:75,overall_0_100:75,is_probability:false}};
 assert.equal(assessActionability({canonical:wait,lifecycle_event:'WAIT'}).reason,'FAVORABLE_TARGET_NOT_PROVEN');
 const smallTarget={...wait,targets:[{price:101,basis:'VERIFIED_STRUCTURE'}]};
 assert.equal(assessActionability({canonical:smallTarget,lifecycle_event:'WAIT'}).deliver,true);
 const entry={...smallTarget,state:'ENTRY_NOW_ANALYTICAL',hard_gates:[{status:'CLOSED'}]};
 assert.equal(assessActionability({canonical:entry,lifecycle_event:'ENTRY'}).deliver,true);
});

test('early observation still rejects a score below 70',()=>{
 const action=assessActionability({canonical:observation({interest:69}),lifecycle_event:'OBSERVE'});
 assert.equal(action.deliver,false);
 assert.equal(action.reason,'CANONICAL_INTEREST_BELOW_USER_THRESHOLD');
});

test('early observation uses the dedicated interest score instead of a duplicate overall threshold',()=>{
 const canonical=observation();canonical.scores.overall_0_100=55;
 const action=assessActionability({canonical,lifecycle_event:'OBSERVE'});
 assert.equal(action.deliver,true);
});

test('early observation with a proven 5 percent target keeps the existing message form',()=>{
 const canonical=observation({targets:[{price:106,basis:'VERIFIED_STRUCTURE'}]});
 const action=assessActionability({canonical,lifecycle_event:'OBSERVE'});
 assert.equal(action.deliver,true);
 assert.equal(action.reason,'EARLY_ACTIONABLE_OBSERVE');
 const rendered=renderCanonicalTelegram({canonical,lifecycle_event:'OBSERVE'});
 assert.equal(rendered.ok,true);
 assert.match(rendered.text,/Цель после подтверждения входа: 106 USDT\./);
});
