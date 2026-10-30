// One predeclared controlled geometry scenario. Synthetic P is never a quote.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const handoff=resolve(repo,'pump-report/handoffs/analytics/package-az');
const snapshot='/private/tmp/pump-az-one-controlled-1793010070000';
const privateDir=resolve(snapshot,'receipts');
const sourcePath=resolve(repo,'pump-report/.private/observations/owner-dood-current-review-result.json');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value);
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const calls={baseline_synthetic:0,fixed_synthetic:0,fixed_all_HIGH_future_known:0,fixed_no_eligible_entry:0,fixed_missing_analysis_clock:0,fixed_inactive_wave:0,formatter_full:0,formatter_compact:0,analyzePump:0};
const checks={};
await mkdir(privateDir,{recursive:true});
await save(resolve(handoff,'affected-start.json'),{schema:'AZ_ONE_CONTROLLED_START_V1',started_utc:new Date().toISOString(),script_executions:1,controlled_cases:1,ARTIFICIAL_PRICE_NOT_SOURCE_FACT:true,native:0});
try{
  const sourceBytes=await readFile(sourcePath);
  assert.equal(hash(sourceBytes),'280cd8f7725b50f25120e77ec3a24c1a5ffb32f3ccddbfe6734eba3067a945c8');
  const capture=JSON.parse(sourceBytes),analysis=capture.body.manual_result.analysis,originalJSON=json(analysis);
  assert.equal(hash(originalJSON),'f23232854632c86bb16261993f4d81f8be32aa2e2917fd06b3fe5b2e4ef0cf42');
  assert.equal(analysis.reference_price,0.002505);
  assert.equal(analysis.analysis_ts,1793006914640);
  assert.equal(analysis.automatic_eligible,true);
  assert.equal(analysis.liquidity.status,'USABLE');
  const sourceReceipt=JSON.parse(await readFile(resolve(handoff,'pure-source-snapshot.json'),'utf8'));
  for(const item of sourceReceipt.files){
    const bytes=await readFile(resolve(snapshot,item.variant,item.path));assert.equal(hash(bytes),item.sha256);
    assert.ok(!/\bimport\s*\(|from\s*['"](?:node:|https?:|[^.])/.test(bytes.toString('utf8')),'pure closure only');
  }
  const baseline=await import(pathToFileURL(resolve(snapshot,'baseline/analytics/movement.mjs')).href);
  const fixed=await import(pathToFileURL(resolve(snapshot,'corrected/analytics/movement.mjs')).href);
  const {planExitLines}=await import(pathToFileURL(resolve(snapshot,'corrected/analytics/presentation.mjs')).href);
  const {START_PROFILE:profile}=await import(pathToFileURL(resolve(snapshot,'corrected/profile/start-v1.mjs')).href);
  assert.equal(hash(json(profile)),'e557b045ce0c178d3b5fc54b47c65ee0b777335c6bfdcd8e051dc167d7173b5d');
  const wave=analysis.next_wave,at=analysis.analysis_ts,factId=analysis.activity.details.provenance.fact_id,tick=analysis.instrument.price_tick??null;
  const movement={active:true,pivots:wave.confirmed_pivots,impulse:wave.impulse,normal_range:wave.impulse.normal_range,next_wave:wave,state:analysis.wave_state,reclaim_level:wave.reclaim_level};
  const movementJSON=json(movement),liquidityJSON=json(analysis.liquidity),profileJSON=json(profile);
  const known=p=>Number.isSafeInteger(p.event_ts)&&Number.isSafeInteger(p.known_ts)&&p.event_ts<=p.known_ts&&p.known_ts<=at&&typeof p.fact_id==='string'&&p.fact_id.length>0;
  const highs=movement.pivots.filter(p=>p.kind==='HIGH'&&known(p));
  const half=Math.max(tick??0,movement.normal_range*profile.entry_zone_normal_range_fraction);
  const P=Math.max(...highs.map(p=>p.price))+2*half;
  const top=highs.filter(p=>p.event_ts>=movement.impulse.start_ts).sort((a,b)=>b.price-a.price||a.known_ts-b.known_ts)[0];
  assert.ok(P>Math.max(...highs.map(p=>p.price)));
  assert.equal(top.price,0.00266);
  const params=[movement,P,analysis.liquidity,factId,tick,profile,at];
  calls.baseline_synthetic++;
  const before=baseline.constructPlan(...params);
  await save(resolve(privateDir,'baseline-synthetic-plan.json'),before);
  checks.new_condition_baseline_null=before===null;assert.ok(checks.new_condition_baseline_null);

  calls.fixed_synthetic++;
  const after=fixed.constructPlan(...params);
  await save(resolve(privateDir,'fixed-synthetic-plan.json'),after);
  assert.ok(after);
  checks.target_is_exact_preexisting_current_wave_HIGH=json(after.exit_zone.basis_level)===json(top);
  checks.target_clock_known_not_reaged=after.exit_zone.basis_level.known_ts<=at&&after.exit_zone.basis_level.event_ts>=wave.impulse.start_ts;
  checks.target_width_unchanged=after.exit_zone.lower===top.price-half&&after.exit_zone.upper===top.price+half;
  checks.target_below_synthetic_report=after.exit_zone.upper<P;
  checks.no_new_target_for_profit=after.exit_zone.basis_level.price===Math.max(...highs.filter(p=>p.event_ts>=wave.impulse.start_ts).map(p=>p.price));
  checks.invalidation_exact_saved=json(after.invalidation)===json(analysis.plan.invalidation);
  checks.liquidity_limit_exact_saved=after.position_limit_usdt===analysis.plan.position_limit_usdt;
  checks.owner10_each_entry=after.entry_zones.every(e=>100*(after.exit_zone.lower/e.upper-1)>=10)&&after.potential_pct.minimum>=10;
  checks.cap3_and_nonoverlap=after.entry_zones.length===3&&after.entry_zones.every((a,n,all)=>all.slice(n+1).every(b=>a.lower>b.upper||b.lower>a.upper));
  checks.entry_anchors_original_known=after.entry_zones.every(e=>known(e.basis_level)&&movement.pivots.some(p=>json(p)===json(e.basis_level))&&e.lower>wave.invalidation_price&&e.upper<P);
  checks.target_and_entries_original_fact_ids=json(after.exit_zone.basis_fact_ids)===json([top.fact_id])&&after.entry_zones.every(e=>json(e.basis_fact_ids)===json([e.basis_level.fact_id]));
  const floor=Math.min(...after.entry_zones.map(e=>e.upper));
  const obstacles=movement.pivots.filter(p=>p.kind==='HIGH'&&known(p)&&p.price>floor&&p.price<after.exit_zone.lower).sort((a,b)=>a.price-b.price||a.known_ts-b.known_ts);
  checks.all_intermediate_known_HIGHs_preserved=obstacles.length>0&&json(after.exit_zone.intermediate_highs)===json(obstacles);
  checks.obstacle_provenance_original=after.exit_zone.intermediate_highs.every(p=>known(p)&&movement.pivots.some(q=>json(p)===json(q)));
  for(const value of Object.values(checks))assert.ok(value);

  const futureHigh={...movement,pivots:movement.pivots.map(p=>p.kind==='HIGH'?{...p,known_ts:at+1}:p)};
  calls.fixed_all_HIGH_future_known++;
  const noKnownHigh=fixed.constructPlan(futureHigh,P,analysis.liquidity,factId,tick,profile,at);
  await save(resolve(privateDir,'negative-future-known-HIGH.json'),noKnownHigh);
  checks.no_eligible_known_HIGH_is_null=noKnownHigh===null;assert.ok(checks.no_eligible_known_HIGH_is_null);
  const onlyTop={...movement,pivots:[top]};
  calls.fixed_no_eligible_entry++;
  const noEntry=fixed.constructPlan(onlyTop,P,analysis.liquidity,factId,tick,profile,at);
  await save(resolve(privateDir,'negative-no-entry.json'),noEntry);
  checks.no_eligible_entry_is_null=noEntry===null;assert.ok(checks.no_eligible_entry_is_null);
  calls.fixed_missing_analysis_clock++;
  const noClock=fixed.constructPlan(movement,P,analysis.liquidity,factId,tick,profile);
  await save(resolve(privateDir,'negative-no-clock.json'),noClock);
  checks.missing_exact_analysis_clock_is_null=noClock===null;assert.ok(checks.missing_exact_analysis_clock_is_null);
  const inactive={...movement,active:false,next_wave:{...wave,state:'CANCELLED',cancelled_ts:at}};
  calls.fixed_inactive_wave++;
  const noActiveWave=fixed.constructPlan(inactive,P,analysis.liquidity,factId,tick,profile,at);
  await save(resolve(privateDir,'negative-inactive-wave.json'),noActiveWave);
  checks.inactive_wave_is_null=noActiveWave===null;assert.ok(checks.inactive_wave_is_null);

  calls.formatter_full++;const full=planExitLines(after);
  await save(resolve(privateDir,'truthful-full-lines.json'),full);
  calls.formatter_compact++;const compact=planExitLines(after,{compact:true});
  await save(resolve(privateDir,'truthful-compact-lines.json'),compact);
  const prices=[...new Set(obstacles.map(p=>p.price))].sort((a,b)=>a-b),px=n=>Number(n.toPrecision(10)).toString();
  checks.renderer_labels_future_pullback=full[0].includes('после будущего отката')&&full[0].includes('прежней подтверждённой вершине');
  checks.renderer_does_not_claim_above_report=!full.join(' ').includes('выше цены')&&!compact.join(' ').includes('выше цены');
  checks.renderer_shows_all_known_obstacle_levels=prices.every(p=>full[1].includes(px(p)));
  checks.compact_shows_first3_and_honest_remainder=prices.slice(0,3).every(p=>compact[1].includes(px(p)))&&(prices.length<=3||compact[1].includes('и ещё '+(prices.length-3)));
  checks.renderer_does_not_guarantee_passage=full[1].includes('не гарантированы')&&compact[1].includes('не гарантированы');
  checks.synthetic_price_not_written_to_source_fact=analysis.reference_price===0.002505&&json(analysis)===originalJSON;
  checks.original_movement_and_clocks_unmutated=json(movement)===movementJSON;
  checks.original_liquidity_profile_unmutated=json(analysis.liquidity)===liquidityJSON&&json(profile)===profileJSON;
  checks.capture_bytes_unmutated=hash(await readFile(sourcePath))===hash(sourceBytes);
  for(const value of Object.values(checks))assert.ok(value);
  assert.deepEqual(calls,{baseline_synthetic:1,fixed_synthetic:1,fixed_all_HIGH_future_known:1,fixed_no_eligible_entry:1,fixed_missing_analysis_clock:1,fixed_inactive_wave:1,formatter_full:1,formatter_compact:1,analyzePump:0});
  const result={schema:'AZ_ONE_CONTROLLED_PRIOR_HIGH_FALLBACK_RESULT_V1',status:'PASS',script_executions:1,controlled_geometry_cases:1,calls,checks,
    source_capture_sha256:hash(sourceBytes),source_analysis_sha256:hash(originalJSON),source_analysis_ts:at,source_reference_unchanged:analysis.reference_price,
    ARTIFICIAL_geometry_parameter_P:P,synthetic_P_is_NOT_a_sourcefact_market_quote_or_new_snapshot:true,
    fixed_plan_sha256:hash(json(after)),target_bounds:{lower:after.exit_zone.lower,upper:after.exit_zone.upper},target_anchor_known_ts:top.known_ts,
    entry_bounds:after.entry_zones.map(e=>({lower:e.lower,upper:e.upper})),minimum_potential_pct:after.potential_pct.minimum,intermediate_HIGH_count:obstacles.length,intermediate_unique_price_count:prices.length,
    full_text_sha256:hash(json(full)),compact_text_sha256:hash(json(compact)),private_result_receipts:privateDir,
    accepted_AX_normal_branch_replayed:false,new_live_READY_SENT_or_profitability_proven:false,source_clocks_reaged:false,
    native_market_RPC_SQL_TG_Worker:0,raw_candles_pivots_orderbook_or_source_input_exported:false};
  await save(resolve(handoff,'affected-result.json'),result);
  process.stdout.write(JSON.stringify({status:'PASS',controlled_geometry_cases:1,calls,minimum_potential_pct:result.minimum_potential_pct,intermediate_unique_price_count:prices.length,native:0})+'\n');
}catch(error){
  await save(resolve(handoff,'affected-failure.json'),{schema:'AZ_CONTROLLED_FAILURE_V1',calls,checks,error_name:error.name,error_message:error.message,do_not_rerun:true,native:0});
  throw error;
}
