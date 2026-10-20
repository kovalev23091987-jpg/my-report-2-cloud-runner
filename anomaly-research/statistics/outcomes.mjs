// Offline descriptive outcomes. No main weights, provider calls, SQL or send.
import {hash,TIMEFRAMES} from '../observer/observer.mjs';
const DAY=86400000;
export const HORIZONS=Object.freeze({'1h':3600000,'4h':14400000,'24h':DAY,'7d':7*DAY,'30d':30*DAY,'90d':90*DAY});
const stamp=x=>Number.isSafeInteger(x)&&x>=1e12,num=x=>typeof x==='number'&&Number.isFinite(x),str=x=>typeof x==='string'&&x.length>0;
const need=(x,m)=>{if(!x)throw Error(m);};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function validCard(c){const {card_hash,...body}=c||{};need(card_hash===hash(body),'CARD_INTEGRITY');}
export function commitOutcomePlan(card,{anchor,committed_ts,success_pct=5,opposite_pct=3,max_gap_ms=330000,endpoint_tolerance_ms=300000,horizons=['1h','4h','24h','7d','30d','90d']}={}){
 validCard(card);
 // An explicitly retained contemporaneous price is required. The old event
 // candle's close cannot stand in for a much later known-time price.
 need(committed_ts===card.first_known_ts&&anchor&&num(anchor.price)&&anchor.price>0&&stamp(anchor.source_ts)&&stamp(anchor.received_ts)&&anchor.source_ts<=anchor.received_ts&&anchor.received_ts<=committed_ts&&committed_ts-anchor.source_ts<=300000&&anchor.instrument&&hash(anchor.instrument)===hash(card.instrument)&&hex(anchor.raw_sha256)&&str(anchor.raw_ref),'KNOWN_TIME_ANCHOR_REQUIRED');
 need(num(success_pct)&&success_pct>0&&success_pct<100&&num(opposite_pct)&&opposite_pct>0&&opposite_pct<100&&Number.isSafeInteger(max_gap_ms)&&max_gap_ms>0&&Number.isSafeInteger(endpoint_tolerance_ms)&&endpoint_tolerance_ms>=0&&endpoint_tolerance_ms<=max_gap_ms&&Array.isArray(horizons)&&horizons.length>0&&new Set(horizons).size===horizons.length&&horizons.every(h=>HORIZONS[h]&&HORIZONS[h]>max_gap_ms),'POLICY_INVALID');
 const cohort=card.evidence_class==='CONTROLLED'?'CONTROLLED':card.discovery==='PROSPECTIVE'&&card.evidence_class==='PROSPECTIVE'?'DECLARED_PROSPECTIVE':'BACKFILLED';
 const body={schema:'ANOMALY_OUTCOME_PLAN_V1',event_id:card.event_id,card_hash:card.card_hash,instrument:card.instrument,timeframe:card.timeframe,first_known_ts:card.first_known_ts,committed_ts,anchor:structuredClone(anchor),success_pct,opposite_pct,max_gap_ms,endpoint_tolerance_ms,horizons:[...horizons],directions:['LONG','SHORT'],cohort,denominator_unit:'ONE_EVENT_HORIZON_DIRECTION',source_clock_preserved:true,external_native_commit_ACK_qualified:false,trade_profit:false};
 return {...body,plan_hash:hash(body)};
}
export function evaluateOutcome(plan,{direction,horizon,points=[],as_of_ts}={}){
 const {plan_hash,...body}=plan||{};need(plan_hash===hash(body),'PLAN_INTEGRITY');
 need(['LONG','SHORT'].includes(direction)&&plan.directions.includes(direction)&&plan.horizons.includes(horizon)&&stamp(as_of_ts)&&as_of_ts>=plan.first_known_ts&&Array.isArray(points)&&points.length<=30000,'OUTCOME_ARGUMENTS');
 const target=plan.first_known_ts+HORIZONS[horizon];
 const base={schema:'ANOMALY_OBSERVED_OUTCOME_V1',event_id:plan.event_id,plan_hash,card_hash:plan.card_hash,instrument:plan.instrument,timeframe:plan.timeframe,cohort:plan.cohort,direction,horizon,target_ts:target,first_known_ts:plan.first_known_ts,as_of_ts,extrema_scope:'OBSERVED_SNAPSHOTS_ONLY',not_executed_profit:true,external_native_commit_ACK_qualified:false};
 const finish=x=>{const o={...base,...x};return {...o,outcome_hash:hash(o)};};
 if(as_of_ts<target)return finish({status:'PENDING',reason:'HORIZON_NOT_MATURE',complete:false});
 const censored=reason=>finish({status:'INCOMPLETELY_OBSERVED',reason,complete:false});
 const byTime=new Map(),proofVariants=new Set();let after=0,notYetKnown=0,duplicateFactReceipts=0;
 for(const p of points){
  if(!stamp(p?.source_ts))return censored('SOURCE_CLOCK_INVALID');
  if(p.source_ts>target){after++;continue;}
  if(p.source_ts<=plan.first_known_ts)continue;
  if(!stamp(p.received_ts)||p.received_ts<p.source_ts||!num(p.price)||p.price<=0||!p.instrument||hash(p.instrument)!==hash(plan.instrument)||!hex(p.raw_sha256)||!str(p.raw_ref))return censored('UNBOUND_OR_INVALID_PATH');
  if(p.received_ts>as_of_ts){notYetKnown++;continue;}
  const prior=byTime.get(p.source_ts);
  if(prior){
   // Re-reading the same bound economic point is not a conflicting price.
   // Receipt/locator revisions are neither new samples nor independent facts.
   if(prior.price!==p.price)return censored('CONFLICTING_DUPLICATE_POINT');
   duplicateFactReceipts++;
   if(p.received_ts<prior.received_ts)byTime.set(p.source_ts,p);
  }else byTime.set(p.source_ts,p);
  proofVariants.add(hash({source_ts:p.source_ts,raw_sha256:p.raw_sha256,raw_ref:p.raw_ref}));
 }
 const xs=[...byTime.values()].sort((a,b)=>a.source_ts-b.source_ts);
 if(!xs.length)return censored('POST_KNOWN_PATH_MISSING');
 let prev=plan.first_known_ts;
 for(const p of xs){if(p.source_ts-prev>plan.max_gap_ms)return censored('PATH_GAP');prev=p.source_ts;}
 if(target-xs.at(-1).source_ts>plan.endpoint_tolerance_ms)return censored('HORIZON_ENDPOINT_MISSING');
 const sign=direction==='LONG'?1:-1,ret=p=>sign*100*(p.price/plan.anchor.price-1),returns=xs.map(ret);
 let favorable=null,opposite=null;
 xs.forEach((p,n)=>{if(favorable===null&&returns[n]>=plan.success_pct)favorable=p.source_ts;if(opposite===null&&returns[n]<=-plan.opposite_pct)opposite=p.source_ts;});
 // Predeclared sampled first-passage. A reversal after the favorable barrier
 // is FALSE; an adverse barrier before it is OPPOSITE. Never choose the side
 // that happened to win, or pretend sampled prices reveal intrabar ordering.
 const status=opposite!==null&&(favorable===null||opposite<favorable)?'OPPOSITE':favorable!==null&&opposite!==null?'FALSE':favorable!==null?'SUCCESSFUL':'UNWORKED';
 return finish({status,reason:'PREDECLARED_SAMPLED_BARRIERS',complete:true,samples:xs.length,actual_end_source_ts:xs.at(-1).source_ts,endpoint_lag_ms:target-xs.at(-1).source_ts,directional_return_pct:returns.at(-1),sampled_mfe_pct:Math.max(0,...returns),sampled_mae_pct:Math.min(0,...returns),favorable_first_observed_ts:favorable,opposite_first_observed_ts:opposite,after_target_points_excluded:after,not_yet_available_points_excluded:notYetKnown,...(duplicateFactReceipts?{duplicate_fact_receipts_excluded:duplicateFactReceipts,duplicate_fact_provenance_variants:proofVariants.size-byTime.size}:{})});
}
// A self-consistent checksum is not producer-schema or native provenance
// validation. Reject malformed summaries without inventing a market outcome.
function summaryRowIssue(o){
 const label=v=>str(v)&&v.trim().length>0;
 if(!o||typeof o!=='object'||Array.isArray(o)||o.schema!=='ANOMALY_OBSERVED_OUTCOME_V1'||!hex(o.outcome_hash)||!hex(o.card_hash)||!hex(o.plan_hash)||!label(o.event_id))return 'OUTCOME_SCHEMA_INVALID';
 const i=o.instrument;
 if(!i||!['asset_id','venue','upstream','contract','quote','price_unit','volume_unit','binding_ref'].every(k=>label(i[k]))||!['FUTURES','SPOT'].includes(i.market)||i.identity_verified!==true||!num(i.multiplier)||i.multiplier<=0||!['VERIFIED_NATIVE','CHAIN_ADDRESS'].includes(i.binding_kind)||i.binding_kind==='CHAIN_ADDRESS'&&(!label(i.chain)||!label(i.address)))return 'OUTCOME_IDENTITY_INVALID';
 if(!str(o.timeframe)||!str(o.horizon)||!Object.hasOwn(TIMEFRAMES,o.timeframe)||!Object.hasOwn(HORIZONS,o.horizon)||!['LONG','SHORT'].includes(o.direction)||!['CONTROLLED','BACKFILLED','DECLARED_PROSPECTIVE'].includes(o.cohort))return 'OUTCOME_COHORT_CELL_INVALID';
 if(o.extrema_scope!=='OBSERVED_SNAPSHOTS_ONLY'||o.not_executed_profit!==true||o.external_native_commit_ACK_qualified!==false||!label(o.reason))return 'OUTCOME_SCOPE_INVALID';
 if(!stamp(o.first_known_ts)||!stamp(o.as_of_ts)||!stamp(o.target_ts)||o.as_of_ts<o.first_known_ts||o.target_ts!==o.first_known_ts+HORIZONS[o.horizon])return 'OUTCOME_CLOCK_INVALID';
 if(o.status==='PENDING')return o.complete===false&&o.as_of_ts<o.target_ts&&o.reason==='HORIZON_NOT_MATURE'?null:'PENDING_STATE_INVALID';
 if(!['INCOMPLETELY_OBSERVED','SUCCESSFUL','FALSE','OPPOSITE','UNWORKED'].includes(o.status))return 'OUTCOME_STATUS_INVALID';
 if(o.as_of_ts<o.target_ts)return 'OUTCOME_NOT_MATURE';
 if(o.status==='INCOMPLETELY_OBSERVED')return o.complete===false?null:'CENSORED_STATE_INVALID';
 const count=v=>Number.isSafeInteger(v)&&v>=0;
 const duplicates=o.duplicate_fact_receipts_excluded,variants=o.duplicate_fact_provenance_variants;
 if((duplicates!==undefined||variants!==undefined)&&(!count(duplicates)||duplicates<1||!count(variants)||variants>duplicates||!count(o.samples)||duplicates+o.samples>30000))return 'OUTCOME_RECEIPT_REPLAY_COUNTS_INVALID';
 if(o.complete!==true||o.reason!=='PREDECLARED_SAMPLED_BARRIERS'||!count(o.samples)||o.samples<1||o.samples>30000||!num(o.directional_return_pct)||!num(o.sampled_mfe_pct)||o.sampled_mfe_pct<0||!num(o.sampled_mae_pct)||o.sampled_mae_pct>0||!count(o.after_target_points_excluded)||!count(o.not_yet_available_points_excluded))return 'COMPLETE_OUTCOME_SHAPE_INVALID';
 if(!stamp(o.actual_end_source_ts)||o.actual_end_source_ts<=o.first_known_ts||o.actual_end_source_ts>o.target_ts||!count(o.endpoint_lag_ms)||o.endpoint_lag_ms!==o.target_ts-o.actual_end_source_ts)return 'OUTCOME_ENDPOINT_INVALID';
 const f=o.favorable_first_observed_ts,a=o.opposite_first_observed_ts;
 if([f,a].some(t=>t!==null&&(!stamp(t)||t<=o.first_known_ts||t>o.actual_end_source_ts)))return 'OUTCOME_PASSAGE_CLOCK_INVALID';
 const expected=a!==null&&(f===null||a<f)?'OPPOSITE':f!==null&&a!==null?'FALSE':f!==null?'SUCCESSFUL':'UNWORKED';
 return o.status===expected?null:'OUTCOME_PASSAGE_STATUS_INVALID';
}
export function summarizeOutcomes(outcomes=[]){
 need(Array.isArray(outcomes)&&outcomes.length<=20000,'BOUNDED_COHORT_REQUIRED');
 const groups=new Map(),invalidReasons={};let invalid=0;
 for(const o of outcomes){let issue=summaryRowIssue(o);if(!issue){const {outcome_hash,...body}=o;issue=outcome_hash===hash(body)?null:'OUTCOME_DIGEST_INVALID';}if(issue){invalid++;invalidReasons[issue]=(invalidReasons[issue]??0)+1;continue;}
  const key=[o.event_id,o.horizon,o.direction].join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
 }
 const cells={},conflicts=[],statusCounts={};let duplicates=0;
 for(const [key,items] of groups){
  const distinct=new Set(items.map(o=>o.outcome_hash));duplicates+=items.length-1;
  if(distinct.size>1){conflicts.push(key);continue;}
  const o=items[0],cellKey=[o.cohort,o.timeframe,o.horizon,o.direction].join('|');
  const cell=cells[cellKey]??={cohort:o.cohort,timeframe:o.timeframe,horizon:o.horizon,direction:o.direction,total_events:0,complete:0,pending:0,censored:0,successful:0,false:0,opposite:0,unworked:0,assets:new Set()};
  cell.total_events++;cell.assets.add(o.instrument.asset_id);
  if(o.status==='PENDING')cell.pending++;else if(o.status==='INCOMPLETELY_OBSERVED')cell.censored++;else if(['SUCCESSFUL','FALSE','OPPOSITE','UNWORKED'].includes(o.status)){cell.complete++;cell[o.status.toLowerCase()]++;}else{cell.censored++;}
  statusCounts[o.status]=(statusCounts[o.status]??0)+1;
 }
 return {schema:'ANOMALY_OUTCOME_COHORTS_V1',cells:Object.values(cells).map(c=>({...c,assets:c.assets.size,descriptive_success_share:c.complete?c.successful/c.complete:null,observation_completion_share:c.total_events?c.complete/c.total_events:null})),status_counts:statusCounts,total_unique_event_cells:groups.size,invalid_rows:invalid,invalid_row_reason_counts:invalidReasons,censored_conflicting_cells:conflicts.length,conflicting_event_cells:conflicts,duplicate_replays:duplicates,empirical_predictive_accuracy:null,independent_sample_count:null,recall:null,weights_changed:false,limitations:['CONTROLLED/BACKFILLED/DECLARED_PROSPECTIVE separated','Summary shape/causality checks do not authenticate card/plan/raw source or native commit ACK','Native contemporaneous commit ACK not qualified by this offline module','Two directions of one event and overlapping horizons/timeframes are correlated; never pool as independent','Recall needs an independent screened-universe baseline; missing facts are not negatives']};
}
export function sourceUtility(attempts=[]){
 need(Array.isArray(attempts)&&attempts.length<=20000,'BOUNDED_ATTEMPTS_REQUIRED');
 const groups=new Map(),unique=new Map();let invalid=0,duplicates=0,conflicts=0;
 for(const a of attempts){
  if(!str(a?.attempt_id)||!str(a.upstream)||!str(a.source_id)||!str(a.asset_id)||!str(a.role)||!stamp(a.available_at)||!stamp(a.decision_ts)||a.available_at>a.decision_ts||!num(a.http_requests)||a.http_requests<0||!Number.isInteger(a.http_requests)||!hex(a.raw_sha256)||!['FACT','EMPTY','ERROR','PARTIAL','NOT_ATTEMPTED_ADMISSION'].includes(a.status)||typeof a.exact_identity!=='boolean'||typeof a.fresh!=='boolean'||typeof a.numeric!=='boolean'||typeof a.consumer_used!=='boolean'){invalid++;continue;}
  if(a.status==='NOT_ATTEMPTED_ADMISSION'&&(a.http_requests!==0||a.consumer_used)){invalid++;continue;}
  if(unique.has(a.attempt_id)){if(hash(unique.get(a.attempt_id))!==hash(a)){unique.set(a.attempt_id,null);conflicts++;}else duplicates++;}else unique.set(a.attempt_id,a);
 }
 for(const a of unique.values()){
  if(!a)continue;const key=[a.upstream,a.role].join('|');const g=groups.get(key)??{upstream:a.upstream,role:a.role,sources:new Set(),assets:new Set(),facts:new Set(),attempts:0,http_requests:0,usable_attempts:0,consumer_used:0,admission_deferred:0};
  g.sources.add(a.source_id);g.assets.add(a.asset_id);
  if(a.status==='NOT_ATTEMPTED_ADMISSION')g.admission_deferred++;else g.attempts++;
  g.http_requests+=a.http_requests;
  const fact=a.status==='FACT'&&a.exact_identity&&a.fresh&&a.numeric;
  if(fact){g.usable_attempts++;g.facts.add(hash({asset_id:a.asset_id,role:a.role,raw_sha256:a.raw_sha256}));}if(fact&&a.consumer_used)g.consumer_used++;groups.set(key,g);
 }
 return {schema:'ANOMALY_OPERATIONAL_SOURCE_UTILITY_V1',upstream_roles:[...groups.values()].map(g=>({...g,sources:[...g.sources].sort(),distinct_assets:g.assets.size,assets:undefined,distinct_usable_facts:g.facts.size,facts:undefined,distinct_facts_per_HTTP:g.http_requests?g.facts.size/g.http_requests:null,consumer_use_per_attempt:g.attempts?g.consumer_used/g.attempts:null})),invalid,duplicates,conflicts,predictive_accuracy:null,causal_incremental_value:null,weights_changed:false,independence_unit:'ACTUAL_UPSTREAM_AND_ROLE'};
}
