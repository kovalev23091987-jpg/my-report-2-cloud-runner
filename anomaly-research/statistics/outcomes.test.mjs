import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from '../observer/observer.mjs';
import {fixture} from '../observer/fixtures.mjs';
import {commitOutcomePlan,evaluateOutcome,summarizeOutcomes,sourceUtility} from './outcomes.mjs';
const card=()=>fixture().result.events[0];
function plan(c=card(),options={}){return commitOutcomePlan(c,{committed_ts:c.first_known_ts,anchor:{instrument:c.instrument,price:100,source_ts:c.first_known_ts-1,received_ts:c.first_known_ts,raw_sha256:hash('known-price'),raw_ref:'CONTROLLED:KNOWN'},...options});}
function points(p,prices=Array(12).fill(100),step=300000){return prices.map((price,n)=>({instrument:p.instrument,price,source_ts:p.first_known_ts+(n+1)*step,received_ts:p.first_known_ts+(n+1)*step+1,raw_sha256:hash({n,price}),raw_ref:'CONTROLLED:P'+n}));}
const evaluate=(p,ps,extra={})=>evaluateOutcome(p,{direction:'LONG',horizon:'1h',points:ps,as_of_ts:p.first_known_ts+3600001,...extra});
test('CONTROLLED pending horizon never uses supplied future winners',()=>{const p=plan();assert.equal(evaluate(p,points(p,Array(12).fill(110)),{as_of_ts:p.first_known_ts+1}).status,'PENDING');});
for(const [name,prices] of [['SUCCESSFUL',[100,110,...Array(10).fill(110)]],['FALSE',[100,110,90,...Array(9).fill(100)]],['OPPOSITE',[90,110,...Array(10).fill(110)]],['UNWORKED',Array(12).fill(100)]])test(`CONTROLLED LONG ${name} predeclared sampled path`,()=>{
 const p=plan(),o=evaluate(p,points(p,prices));assert.equal(o.status,name);assert.equal(o.complete,true);assert.equal(o.cohort,'CONTROLLED');assert.equal(o.not_executed_profit,true);assert.equal(o.extrema_scope,'OBSERVED_SNAPSHOTS_ONLY');
});
test('SHORT symmetrical outcome without choosing a later winning direction',()=>{const p=plan(),xs=points(p,Array(12).fill(90));assert.equal(evaluate(p,xs,{direction:'SHORT'}).status,'SUCCESSFUL');assert.equal(evaluate(p,xs).status,'OPPOSITE');});
test('known-time price required rather than old candle close',()=>{const c=card();assert.throws(()=>plan(c,{anchor:{instrument:c.instrument,price:100,source_ts:c.event_end_ts-86400000,received_ts:c.first_known_ts,raw_sha256:hash('old'),raw_ref:'OLD'}}),/KNOWN_TIME_ANCHOR/);assert.throws(()=>plan(c,{committed_ts:c.first_known_ts+1}),/KNOWN_TIME_ANCHOR/);});
test('after-target points excluded, partial endpoint and gaps censored',()=>{
 const p=plan(),xs=points(p);assert.equal(evaluate(p,[...xs,...points(p,[1000],7200000)]).status,'UNWORKED');
 assert.equal(evaluate(p,xs.slice(0,-2)).status,'INCOMPLETELY_OBSERVED');assert.equal(evaluate(p,xs.filter((x,n)=>n!==3)).reason,'PATH_GAP');assert.equal(evaluate(p,[]).reason,'POST_KNOWN_PATH_MISSING');
});
test('late unavailable data and wrong asset cannot close an outcome',()=>{
 const p=plan(),xs=points(p);assert.equal(evaluate(p,xs.map(x=>({...x,received_ts:p.first_known_ts+7200000}))).status,'INCOMPLETELY_OBSERVED');
 const wrong=xs.map((x,n)=>n===0?{...x,instrument:{...x.instrument,market:'SPOT'}}:x);assert.equal(evaluate(p,wrong).reason,'UNBOUND_OR_INVALID_PATH');
});
test('duplicate path replays deduped and conflicting same-time price censored',()=>{
 const p=plan(),xs=points(p);assert.equal(evaluate(p,[...xs,xs[0]]).samples,12);assert.equal(evaluate(p,[...xs,{...xs[0],price:1}]).reason,'CONFLICTING_DUPLICATE_POINT');
});
test('CONTROLLED 30d/90d remain separate long-scale outcomes, no expiry',()=>{
 const p=plan(card(),{horizons:['30d','90d'],max_gap_ms:86400001,endpoint_tolerance_ms:86400000}),xs=points(p,[...Array(89).fill(100),110],86400000);
 const a=evaluate(p,xs,{horizon:'30d',as_of_ts:p.first_known_ts+90*86400000+1}),b=evaluate(p,xs,{horizon:'90d',as_of_ts:p.first_known_ts+90*86400000+1});assert.equal(a.status,'UNWORKED');assert.equal(b.status,'SUCCESSFUL');
});
test('cohorts and direction/horizon cells separated, no fake market accuracy',()=>{
 const p=plan(),o=evaluate(p,points(p)),sum=summarizeOutcomes([o,o]);assert.equal(sum.cells[0].total_events,1);assert.equal(sum.cells[0].unworked,1);assert.equal(sum.duplicate_replays,1);assert.equal(sum.empirical_predictive_accuracy,null);assert.equal(sum.recall,null);
 const c=fixture({mode:'LIVE_CAPTURE'}).result.events[0],q=plan(c),a=evaluate(q,points(q));assert.equal(a.cohort,'DECLARED_PROSPECTIVE');assert.equal(a.external_native_commit_ACK_qualified,false);
 const {card_hash,...body}=card(),hist={...body,evidence_class:'RETAINED'};const late=plan({...hist,card_hash:hash(hist)});assert.equal(late.cohort,'BACKFILLED');
});
test('conflicting cohort replay is censored rather than winner selected',()=>{const p=plan(),a=evaluate(p,points(p)),b=evaluate(p,points(p,Array(12).fill(110))),s=summarizeOutcomes([a,b]);assert.equal(s.conflicting_event_cells.length,1);assert.equal(s.cells.length,0);assert.equal(s.total_unique_event_cells,1);assert.equal(s.censored_conflicting_cells,1);});
test('plan and outcome corruption rejected',()=>{const p=plan();assert.throws(()=>evaluate({...p,success_pct:0},points(p)),/PLAN_INTEGRITY/);const o=evaluate(p,points(p));assert.equal(summarizeOutcomes([{...o,status:'SUCCESSFUL'}]).invalid_rows,1);});
function attempt(extra={}){return {attempt_id:'A1',source_id:'S1',upstream:'EXCHANGE',asset_id:'ASSET',role:'CLOSED_CANDLE',available_at:1700000000000,decision_ts:1700000000100,http_requests:1,status:'FACT',exact_identity:true,fresh:true,numeric:true,consumer_used:true,raw_sha256:hash('same-fact'),...extra};}
test('source availability and actual consumer use separate, proxies share upstream',()=>{
 const rows=[attempt(),attempt({attempt_id:'A2',source_id:'PROXY',http_requests:0}),attempt({attempt_id:'A3',status:'EMPTY',numeric:false,consumer_used:false}),attempt({attempt_id:'A4',status:'NOT_ATTEMPTED_ADMISSION',http_requests:0,consumer_used:false})];
 const s=sourceUtility(rows),g=s.upstream_roles[0];assert.equal(s.upstream_roles.length,1);assert.equal(g.distinct_usable_facts,1);assert.equal(g.usable_attempts,2);assert.equal(g.attempts,3);assert.equal(g.admission_deferred,1);assert.equal(g.http_requests,2);assert.equal(s.predictive_accuracy,null);assert.equal(s.weights_changed,false);
});
test('invalid, unbound and future source records excluded and conflict not counted',()=>{
 const a=attempt();const s=sourceUtility([a,a,{...a,raw_sha256:hash('different')},attempt({attempt_id:'F',available_at:1800000000000}),attempt({attempt_id:'I',raw_sha256:''})]);assert.equal(s.conflicts,1);assert.equal(s.duplicates,1);assert.equal(s.invalid,2);assert.equal(s.upstream_roles.length,0);
});
