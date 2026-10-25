import test from 'node:test';
import assert from 'node:assert/strict';
import {selectOutcomeAnchor} from '../../analytics/anchors.mjs';
import {analyzePump} from '../../analytics/index.mjs';
import {constructPlan} from '../../analytics/movement.mjs';
import {summarizeOutcomes} from '../../analytics/summary.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {input,fact,zone,T,MINUTE} from './fixtures.mjs';

const origin=(id,offset=0,extra={})=>({instrument_id:'ARTIFICIAL:I',asset_id:'ARTIFICIAL:A',wave_id:'W',signal_id:id,t0:T+offset,reference_price:100+offset/MINUTE,
  rules_version:'D_RULES',profile_version:'D_PROFILE',mode:'AUTO',map_mode:'NO_MAP',evidence_class:'ARTIFICIAL',ready:true,...extra});
const snapshot=(id,offset=0,extra={})=>({analysis_id:id,analysis_sha256:'a'.repeat(64),recorded_ts:T+offset,features_known_ts:T+offset,origin:origin(id,offset,extra)});
const event=(id,analysis_id,offset,state='SENT',extra={})=>({event_id:id,analysis_id,event_ts:T+offset,recorded_ts:T+offset,state,message_id:state==='SENT'?'123':null,receipt_ref:state==='SENT'?'ARTIFICIAL_RECEIPT':null,...extra});
const select=extra=>selectOutcomeAnchor({analyses:[snapshot('A'),snapshot('B',MINUTE)],publications:[],as_of_ts:T+5*MINUTE,wave_expires_ts:T+4*60*MINUTE,...extra});
const contexts=()=>{
  const x=input();
  x.facts.trades=fact('trades',[{trade_id:'BUY',event_ts:T-1000,price:112,quantity_base:2,aggressor_side:'BUY'},{trade_id:'SELL',event_ts:T,price:112,quantity_base:1,aggressor_side:'SELL'}],'USDT_PRICE_BASE_QUANTITY');
  x.facts.open_interest=fact('open_interest',10000,'CONTRACTS');
  x.facts.funding=fact('funding',{rate:0.0001,period_ms:8*3600000,next_funding_ts:T+3600000},'RATE_FRACTION_PER_ACTUAL_PERIOD');
  x.facts.market_context=fact('market_context',{returns:[{role:'CANDIDATE',return_pct:12,start_ts:T-15*MINUTE,end_ts:T},{role:'BTC',return_pct:1,start_ts:T-15*MINUTE,end_ts:T},{role:'ETH',return_pct:-1,start_ts:T-15*MINUTE,end_ts:T}]},'RETURN_PERCENT_SAME_WINDOW');
  return x;
};

test('D first SENT selects its saved card, not an earlier failed draft or newest analysis',()=>{
  const q=select({publications:[event('FAIL','A',1000,'FAILED'),event('SEND','B',MINUTE+1000)]});
  assert.equal(q.eligible,true);assert.equal(q.anchor.analysis_id,'B');assert.equal(q.summary_origin.t0,T+MINUTE);assert.equal(q.summary_origin.reference_price,101);assert.equal(q.publication.state,'SENT');
});
test('D first possible UNKNOWN fixes original P0 even when a later different card is SENT',()=>{
  const q=select({publications:[event('UNKNOWN','A',1000,'UNKNOWN',{possible_send:true}),event('SEND','B',MINUTE+1000)]});
  assert.equal(q.anchor.analysis_id,'A');assert.equal(q.summary_origin.reference_price,100);assert.equal(q.publication.state,'UNKNOWN');
});
test('D a later receipt for the same card resolves UNKNOWN without moving t0 or map cohort',()=>{
  const publications=[event('U','A',1000,'UNKNOWN',{possible_send:true})],a=select({publications});
  const b=select({publications:[...publications,event('ACK','A',2*MINUTE)],frozen_anchor:a.anchor});
  assert.deepEqual(b.anchor,a.anchor);assert.equal(b.publication.state,'SENT');assert.equal(b.summary_origin.map_mode,'NO_MAP');
});
test('D updates cannot change a published original price or rules',()=>{
  const publications=[event('S','A',1000)],a=select({publications});
  const b=select({publications,frozen_anchor:a.anchor,analyses:[snapshot('A',0,{reference_price:90,rules_version:'NEW'}),snapshot('B',MINUTE)]});
  assert.equal(b.status,'QUARANTINED');assert.equal(b.summary_origin,null);
});
test('D missing original publication ledger is quarantined instead of resetting to UNSENT',()=>{
  const a=select({publications:[event('S','B',MINUTE+1000)]});
  const b=select({frozen_anchor:a.anchor,as_of_ts:T+5*60*MINUTE});assert.equal(b.status,'QUARANTINED');
});
test('D a mature but active never-sent wave remains outside UNSENT statistics',()=>{
  const q=select({as_of_ts:T+5*60*MINUTE,wave_expires_ts:T+6*60*MINUTE});assert.equal(q.status,'PENDING');assert.equal(q.summary_origin,null);assert.equal(q.anchor.analysis_id,'A');
});
test('D expiry admits the first READY unsent card, never the newest draft',()=>{
  const q=select({as_of_ts:T+4*60*MINUTE});assert.equal(q.eligible,true);assert.equal(q.publication.state,'UNSENT');assert.equal(q.summary_origin.t0,T);assert.equal(q.summary_origin.reference_price,100);
});
test('D explicit terminal completion admits UNSENT before expiry',()=>{
  const q=select({terminal:{state:'CANCELLED',event_ts:T+MINUTE,recorded_ts:T+MINUTE}});assert.equal(q.eligible,true);assert.equal(q.publication.state,'UNSENT');
});
test('D future terminal information and future receipt do not leak into an earlier snapshot',()=>{
  const q=select({terminal:{state:'COMPLETED',event_ts:T+6*MINUTE,recorded_ts:T+6*MINUTE},publications:[event('S','A',6*MINUTE)]});assert.equal(q.status,'PENDING');
});
test('D late received terminal event is not known at its event time',()=>{
  const q=select({terminal:{state:'COMPLETED',event_ts:T+MINUTE,recorded_ts:T+6*MINUTE}});assert.equal(q.status,'PENDING');
});
test('D future input features invalidate a snapshot even if its analysis timestamp is old',()=>{
  const a=snapshot('A');a.features_known_ts=T+1;const q=select({analyses:[a]});assert.equal(q.status,'QUARANTINED');assert.equal(q.reason,'INVALID_OR_FUTURE_FEATURE_SNAPSHOT');
});
test('D a publication must bind an already saved ready snapshot',()=>{
  assert.equal(select({publications:[event('S','MISSING',1000)]}).status,'QUARANTINED');
  assert.equal(select({analyses:[snapshot('A',0,{ready:false})],publications:[event('S','A',1000)]}).status,'PENDING');
});
test('D malformed SENT remains possible-send UNKNOWN and never becomes UNSENT',()=>{
  const q=select({publications:[event('S','A',1000,'SENT',{receipt_ref:null})]});assert.equal(q.publication.state,'UNKNOWN');assert.equal(q.anchor.immutable,true);
});
test('D unresolved UNKNOWN possibility is quarantined, not classified as never sent',()=>{
  const q=select({publications:[event('U','A',1000,'UNKNOWN')],as_of_ts:T+5*60*MINUTE});assert.equal(q.status,'QUARANTINED');
});
test('D conflicting immutable IDs, simultaneous originals and cross-wave input are quarantined',()=>{
  const a=snapshot('A'),b=snapshot('A',0,{reference_price:101});assert.equal(select({analyses:[a,b]}).status,'QUARANTINED');
  assert.equal(select({publications:[event('1','A',2*MINUTE),event('2','B',2*MINUTE)]}).reason,'SIMULTANEOUS_ORIGINAL_CARDS_AMBIGUOUS');
  assert.equal(select({analyses:[a,snapshot('B',MINUTE,{wave_id:'OTHER'})]}).reason,'CROSS_WAVE_OR_ASSET_INPUT');
});
test('D adapter is deterministic and pure with shuffled or replayed ledger rows',()=>{
  const x={analyses:[snapshot('A'),snapshot('B',MINUTE)],publications:[event('S','B',MINUTE+1000),event('F','A',1000,'FAILED')],as_of_ts:T+5*MINUTE,wave_expires_ts:T+4*60*MINUTE};
  const before=structuredClone(x),a=selectOutcomeAnchor(x),b=selectOutcomeAnchor({...x,analyses:x.analyses.toReversed(),publications:[...x.publications.toReversed(),x.publications[0]]});assert.deepEqual(x,before);assert.deepEqual(a,b);
});
test('D summary consumes eligible frozen origins and separates mode, map and delivery cohorts',()=>{
  const a=select({publications:[event('S','A',1000)]}),b=select({analyses:[snapshot('M',0,{mode:'MANUAL',map_mode:'PARTIAL_MAP',wave_id:'W2'})],as_of_ts:T+5*60*MINUTE});
  const records=[a,b].map((q,i)=>({record_id:'D'+i,recorded_ts:T+5*60*MINUTE,origin:q.summary_origin,publication:q.publication,outcome:null}));
  const q=summarizeOutcomes(records,{as_of_ts:T+5*60*MINUTE});assert.equal(q.independent_waves,2);assert.equal(q.cohorts.length,2);assert.deepEqual(q.publication_counts,{sent:1,unsent:1,unknown:0});assert.equal(q.probability.value_pct,null);
});
test('D all optional contexts create attributed factual explanations without changing the plan',()=>{
  const x=contexts(),before=structuredClone(x),a=analyzePump(x),base=analyzePump(input());assert.equal(a.ready,true);assert.deepEqual(a.plan,base.plan);assert.equal(a.reference_price,base.reference_price);
  assert.equal(a.trade_context.buy_usdt,224);assert.equal(a.trade_context.sell_usdt,112);
  for(const code of ['TRADE_SAMPLE','OI_SNAPSHOT','FUNDING_SNAPSHOT','RELATIVE_RETURN'])assert.ok(a.findings.some(f=>f.code===code));
  assert.match(a.card_text,/покупки 224 USDT, продажи 112 USDT/);assert.match(a.card_text,/0.01% за 8 ч/);assert.match(a.card_text,/BTC 1%, ETH -1%/);assert.match(a.card_text,/Открытый интерес/);assert.deepEqual(x,before);
});
test('D optional trades use source row clocks rather than a fresh envelope',()=>{
  const x=contexts();x.facts.trades.value.push({event_ts:T-31000,price:112,quantity_base:99999,aggressor_side:'BUY'},{event_ts:T+1,price:112,quantity_base:99999,aggressor_side:'SELL'});
  const a=analyzePump(x);assert.equal(a.trade_context.buy_usdt,224);assert.equal(a.trade_context.sell_usdt,112);assert.equal(a.trade_context.direction_coverage,'PARTIAL_RETURNED_TRADES');
});
test('D stable trade IDs deduplicate replay and conflicting IDs cannot add notional',()=>{
  const x=contexts(),r=x.facts.trades.value[0];x.facts.trades.value.push({...r});assert.equal(analyzePump(x).trade_context.buy_usdt,224);
  x.facts.trades.value.push({...r,quantity_base:20});const a=analyzePump(x);assert.equal(a.trade_context.buy_usdt,0);assert.equal(a.trade_context.sell_usdt,112);
});
test('D anonymous identical executions remain distinct; no artificial dedup by price and time',()=>{
  const x=contexts();const r={event_ts:T,price:112,quantity_base:1,aggressor_side:'BUY'};x.facts.trades.value=[r,{...r}];assert.equal(analyzePump(x).trade_context.buy_usdt,224);
});
test('D unknown units or missing aggressor side never manufacture directional context',()=>{
  const x=contexts();x.facts.trades.unit='CONTRACTS';assert.equal(analyzePump(x).trade_context,undefined);
  x.facts.trades.unit='USDT_PRICE_BASE_QUANTITY';x.facts.trades.value.forEach(r=>r.aggressor_side=null);assert.equal(analyzePump(x).trade_context,undefined);
});
test('D later optional envelope and historical future values cannot change earlier explanation',()=>{
  const x=contexts();for(const k of ['trades','funding','open_interest','market_context'])x.facts[k].received_ts=T+1;
  const a=analyzePump(x),b=analyzePump(input());assert.equal(a.card_text,b.card_text);assert.deepEqual(a.findings,b.findings);
});
test('D asynchronous benchmark windows are not presented as relative strength',()=>{
  const x=contexts();x.facts.market_context.value.returns[1].start_ts-=MINUTE;x.facts.market_context.value.returns[2].end_ts=T+1;
  const a=analyzePump(x);assert.ok(!a.findings.some(f=>f.code==='RELATIVE_RETURN'));assert.doesNotMatch(a.card_text,/BTC 1%/);assert.equal(a.ready,true);
});
test('D OI zero is a valid labeled snapshot, not absent or evidence of shorts',()=>{
  const x=input();x.facts.open_interest=fact('open_interest',0,'CONTRACTS');const a=analyzePump(x);assert.match(a.card_text,/0 CONTRACTS/);assert.doesNotMatch(a.card_text,/набор шорт|растёт открытый интерес/);
});
test('D unqualified OI units and funding period remain additional unknowns without blocking core',()=>{
  const x=contexts();x.facts.open_interest.unit='USD_GUESSED';x.facts.funding.value.period_ms=null;const a=analyzePump(x);assert.equal(a.ready,true);assert.ok(!a.findings.some(f=>['OI_SNAPSHOT','FUNDING_SNAPSHOT'].includes(f.code)));
});
test('D foreign optional context names venue and estimated origin rather than attributing it to BingX',()=>{
  const x=input();x.facts.open_interest=fact('open_interest',100,'USDT');x.facts.open_interest.venue='OTHER';x.facts.open_interest.origin='ESTIMATED';const a=analyzePump(x);assert.match(a.card_text,/OTHER \(оценка\)/);
});
test('D only the entry around the reclaimed level is confirmed, not every lower support',()=>{
  const movement={impulse:{},normal_range:1,state:'SHARP_PULLBACK_RECLAIMED',reclaim_level:108,next_wave:{invalidation_price:90},pivots:[{kind:'HIGH',price:108,known_ts:T-1000},{kind:'LOW',price:104,known_ts:T-2000},{kind:'HIGH',price:120,known_ts:T-3000}]};
  const p=constructPlan(movement,112,{position_limit_usdt:1000},'F',0.01,START_PROFILE);assert.equal(p.entry_zones[0].confirmation_status,'CONFIRMED_RECLAIM');assert.equal(p.entry_zones[1].confirmation_status,'PRELIMINARY_AREA');assert.equal(p.entry_zones[1].confirmation_level,null);assert.match(p.entry_zones[0].explanation,/вершина 108/);assert.match(p.entry_zones[1].explanation,/минимум 104/);assert.match(p.exit_zone.explanation,/120/);
});
test('D maps add sourced context while farther strong zones cannot move the structural exit',()=>{
  const x=contexts(),base=analyzePump(x);x.liquidations={status:'USABLE',zones:[zone('FAR',180,181,{magnitude_value:1e9})],coverage:null};const a=analyzePump(x);assert.deepEqual(a.plan,base.plan);assert.match(a.card_text,/прежняя вершина|прежний минимум/);assert.match(a.card_text,/ближайшая подтверждённая вершина/);assert.equal(a.probability.value_pct,null);
});
test('D maximum six-zone map plus all optional explanations fits Telegram with concrete entry bases',()=>{
  const x=contexts(),zones=[];for(let i=0;i<3;i++){zones.push(zone('U'+i,125+i*10,126+i*10));zones.push(zone('D'+i,90-i*10,91-i*10));}
  for(const z of zones){z.source='SOURCE'.repeat(30);z.venue='VENUE'.repeat(30);z.model_id='MODEL'.repeat(30);z.model_version='VERSION'.repeat(30);z.limitations=['SOURCE_LIMIT'];}
  x.liquidations={status:'USABLE',zones,coverage:null};const a=analyzePump(x);assert.equal(a.ready,true);assert.ok(a.card_text.length<=4096,String(a.card_text.length));assert.equal(a.liquidations.zones_up.length+a.liquidations.zones_down.length,6);
});
test('D audit simultaneous drafts do not obscure an unambiguous published original',()=>{
  const analyses=[snapshot('A'),snapshot('B')];assert.equal(select({analyses}).reason,'SIMULTANEOUS_FIRST_READY_AMBIGUOUS');
  const q=select({analyses,publications:[event('S','B',1000)]});assert.equal(q.eligible,true);assert.equal(q.anchor.analysis_id,'B');
});
test('D audit future or unknown context payload fields never enter initial feature values',()=>{
  const x=contexts();x.facts.market_context.value.future_price=999;x.facts.market_context.value.returns.push({role:'ETH',return_pct:999,start_ts:T,end_ts:T+MINUTE});
  x.facts.funding.value.after_report_outcome='HIT';const a=analyzePump(x);
  assert.equal(a.optional_context.market_context.value.future_price,undefined);assert.ok(a.optional_context.market_context.value.returns.every(r=>r.end_ts<=T));
  assert.equal(a.optional_context.funding.value.after_report_outcome,undefined);assert.equal(a.optional_context.funding.value.next_funding_ts,undefined);
  assert.equal(a.optional_context.funding.event_ts,T);assert.equal(a.optional_context.funding.origin,'OBSERVED');
});
test('D audit unsupported optional shapes stay out of derived features as well as explanations',()=>{
  const x=input();x.facts.market_context=fact('market_context',{future_label:'HIT'},'UNKNOWN');x.facts.open_interest=fact('open_interest',{future_value:999},'CONTRACTS');
  const a=analyzePump(x);assert.equal(a.optional_context,undefined);assert.equal(a.ready,true);
});
test('D audit removed conflicting trade IDs are explicitly partial sample coverage',()=>{
  const x=contexts();x.facts.trades.value.push({...x.facts.trades.value[0],quantity_base:999});const a=analyzePump(x);assert.equal(a.trade_context.direction_coverage,'PARTIAL_RETURNED_TRADES');
});
test('D audit a terminal UNSENT original is immutable and late contradictory publication is quarantined',()=>{
  const a=select({as_of_ts:T+5*60*MINUTE});assert.equal(a.anchor.immutable,true);
  const b=select({as_of_ts:T+6*60*MINUTE,frozen_anchor:a.anchor});assert.equal(b.eligible,true);assert.deepEqual(b.anchor,a.anchor);
  const c=select({as_of_ts:T+6*60*MINUTE,frozen_anchor:a.anchor,publications:[event('LATE','B',5*60*MINUTE)]});assert.equal(c.status,'QUARANTINED');
});
test('D map overlap and a zone before the exit explain context while preserving every planned price',()=>{
  const x=input(),base=analyzePump(x),entry=base.plan.entry_zones[0];
  x.liquidations={status:'USABLE',zones:[zone('ENTRY',entry.lower,entry.upper),zone('BEFORE_EXIT',113,113.1),zone('EXIT',base.plan.exit_zone.lower,base.plan.exit_zone.upper)],coverage:null};
  const a=analyzePump(x);assert.deepEqual(a.plan,base.plan);assert.ok(a.plan_context.liquidation_confluence.entries.some(e=>e.entry_index===0));assert.ok(a.plan_context.liquidation_confluence.intervening_upper_zone_ids.includes('BEFORE_EXIT'));assert.match(a.card_text,/пересекаются/);assert.match(a.card_text,/не гарантирует остановку/);
});
test('D context text is rendered once and does not replace the core movement/plan explanation',()=>{
  const a=analyzePump(contexts());assert.equal(a.card_text.split('покупки 224 USDT').length-1,1);assert.match(a.card_text,/Вход и выход обоснованы/);assert.match(a.card_text,/спокойный откат/);
});
test('D immutable anchor also binds the saved analysis digest so plan or feature changes cannot hide behind unchanged P0',()=>{
  const publications=[event('S','A',1000)],a=select({publications}),rows=[snapshot('A'),snapshot('B',MINUTE)];rows[0].analysis_sha256='b'.repeat(64);
  const b=select({publications,analyses:rows,frozen_anchor:a.anchor});assert.equal(b.status,'QUARANTINED');assert.equal(b.summary_origin,null);assert.equal(b.raw_persistence_verified,false);
});
