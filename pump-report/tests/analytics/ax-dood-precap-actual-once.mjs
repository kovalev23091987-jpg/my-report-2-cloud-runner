// One ROOT-authorized qualification execution: one actual before/after case
// and one explicitly artificial no-qualified-support edge. Never a market run.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const handoff=resolve(repo,'pump-report/handoffs/analytics/package-ax');
const snapshot='/private/tmp/pump-ax-one-actual-1793006721000';
const privateDir=resolve(snapshot,'receipts');
const inputPath=resolve(repo,'pump-report/.private/observations/owner-dood-current-review-result.json');
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=value=>JSON.stringify(value);
const save=(path,value)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const calls={baseline_actual:0,corrected_actual:0,corrected_artificial_no_qualified:0,analyzePump:0};
const checks={};

await mkdir(privateDir,{recursive:true});
await save(resolve(handoff,'affected-start.json'),{schema:'AX_ONE_QUALIFICATION_START_V1',started_utc:new Date().toISOString(),one_execution:true,actual_cases:1,artificial_edges:1,native:0});
try{
  const bytes=await readFile(inputPath);
  assert.equal(hash(bytes),'280cd8f7725b50f25120e77ec3a24c1a5ffb32f3ccddbfe6734eba3067a945c8');
  const capture=JSON.parse(bytes),analysis=capture.body.manual_result.analysis;
  const originalJSON=json(analysis),analysisSHA=hash(originalJSON);
  assert.equal(analysisSHA,'f23232854632c86bb16261993f4d81f8be32aa2e2917fd06b3fe5b2e4ef0cf42');
  assert.equal(json(capture.body.manual[0].result.analysis),originalJSON);
  assert.equal(analysis.instrument.instrument_id,'BINGX:USDT_M:101207:DOOD-USDT');
  assert.equal(analysis.analysis_ts,1793006914640);
  assert.equal(analysis.ready,false);
  assert.deepEqual(analysis.reasons,['PLAN_POTENTIAL_BELOW_OWNER_MINIMUM']);
  assert.equal(analysis.liquidity.status,'USABLE');
  const sourceReceipt=JSON.parse(await readFile(resolve(handoff,'pure-source-snapshot.json'),'utf8'));
  for(const item of sourceReceipt.files){
    const moduleBytes=await readFile(resolve(snapshot,item.variant,item.path));
    assert.equal(hash(moduleBytes),item.sha256);
    const moduleText=moduleBytes.toString('utf8');
    assert.ok(!/\bimport\s*\(|from\s*['"](?:node:|https?:|[^.])/.test(moduleText),'pure closure only');
  }
  const baseline=await import(pathToFileURL(resolve(snapshot,'baseline/analytics/movement.mjs')).href);
  const corrected=await import(pathToFileURL(resolve(snapshot,'corrected/analytics/movement.mjs')).href);
  const {START_PROFILE:profile}=await import(pathToFileURL(resolve(snapshot,'corrected/profile/start-v1.mjs')).href);
  assert.equal(hash(json(profile)),'e557b045ce0c178d3b5fc54b47c65ee0b777335c6bfdcd8e051dc167d7173b5d');
  const wave=analysis.next_wave;
  const movement={pivots:wave.confirmed_pivots,impulse:wave.impulse,normal_range:wave.impulse.normal_range,next_wave:wave,state:analysis.wave_state,reclaim_level:wave.reclaim_level};
  const movementJSON=json(movement),liquidityJSON=json(analysis.liquidity),profileJSON=json(profile);
  const factId=analysis.activity.details.provenance.fact_id;
  assert.ok(analysis.fact_ids.includes(factId));
  const tick=analysis.instrument.price_tick??null;
  assert.equal(tick,null);
  calls.baseline_actual++;
  const baselinePlan=baseline.constructPlan(movement,analysis.reference_price,analysis.liquidity,factId,tick,profile);
  await save(resolve(privateDir,'baseline-plan.json'),baselinePlan);
  checks.baseline_exact_saved_plan=json(baselinePlan)===json(analysis.plan);
  assert.ok(checks.baseline_exact_saved_plan);

  calls.corrected_actual++;
  const correctedPlan=corrected.constructPlan(movement,analysis.reference_price,analysis.liquidity,factId,tick,profile);
  await save(resolve(privateDir,'corrected-plan.json'),correctedPlan);
  assert.ok(correctedPlan);
  checks.exit_exact_unchanged=json(correctedPlan.exit_zone)===json(baselinePlan.exit_zone);
  checks.invalidation_exact_unchanged=json(correctedPlan.invalidation)===json(baselinePlan.invalidation);
  checks.position_limit_unchanged=correctedPlan.position_limit_usdt===baselinePlan.position_limit_usdt;
  checks.three_qualified_entries=correctedPlan.entry_zones.length===3;
  checks.minimum_existing_owner10=correctedPlan.potential_pct.minimum>=10;
  checks.every_entry_conservative10=correctedPlan.entry_zones.every(e=>100*(correctedPlan.exit_zone.lower/e.upper-1)>=10);
  checks.exact_existing_deeper_anchors=json(correctedPlan.entry_zones.map(e=>e.basis_level.price))===json([0.002361,0.002327,0.002293]);
  checks.all_anchors_and_provenance_preexisting=correctedPlan.entry_zones.every(e=>wave.confirmed_pivots.some(p=>json(p)===json(e.basis_level))&&json(e.basis_fact_ids)===json([e.basis_level.fact_id??factId]));
  checks.entry_geometry_unchanged=correctedPlan.entry_zones.every(e=>{
    const half=Math.max(tick??0,movement.normal_range*profile.entry_zone_normal_range_fraction);
    return e.lower===e.basis_level.price-half&&e.upper===e.basis_level.price+half&&e.upper<analysis.reference_price&&e.lower>wave.invalidation_price;
  });
  checks.no_overlap=correctedPlan.entry_zones.every((a,n,all)=>all.slice(n+1).every(b=>a.lower>b.upper||b.lower>a.upper));
  checks.existing_cap=correctedPlan.entry_zones.length<=profile.maximum_entry_zones;
  for(const ok of Object.values(checks))assert.ok(ok);

  // ARTIFICIAL: retain only the three already saved sub-10 support anchors
  // and the same exit anchor. No invented prices or new source observations.
  const edge={...movement,pivots:[...baselinePlan.entry_zones.map(e=>structuredClone(e.basis_level)),structuredClone(baselinePlan.exit_zone.basis_level)]};
  calls.corrected_artificial_no_qualified++;
  const noQualifiedPlan=corrected.constructPlan(edge,analysis.reference_price,analysis.liquidity,factId,tick,profile);
  await save(resolve(privateDir,'artificial-no-qualified-plan.json'),noQualifiedPlan);
  checks.artificial_no_qualified_returns_null=noQualifiedPlan===null;
  assert.ok(checks.artificial_no_qualified_returns_null);
  checks.original_analysis_unmutated=json(analysis)===originalJSON;
  checks.original_movement_unmutated=json(movement)===movementJSON;
  checks.liquidity_unmutated=json(analysis.liquidity)===liquidityJSON;
  checks.profile_unmutated=json(profile)===profileJSON;
  for(const ok of Object.values(checks))assert.ok(ok);
  assert.deepEqual(calls,{baseline_actual:1,corrected_actual:1,corrected_artificial_no_qualified:1,analyzePump:0});
  const result={schema:'AX_ONE_DOOD_PRECAP_QUALIFICATION_RESULT_V1',status:'PASS',one_script_execution:true,actual_cases:1,artificial_edges:1,calls,checks,
    original_analysis_sha256:analysisSHA,original_analysis_ts:analysis.analysis_ts,original_capture_sha256:hash(bytes),profile_value_sha256:hash(profileJSON),
    baseline_plan_sha256:hash(json(baselinePlan)),corrected_plan_sha256:hash(json(correctedPlan)),
    original_minimum_pct:baselinePlan.potential_pct.minimum,corrected_minimum_pct:correctedPlan.potential_pct.minimum,
    corrected_entry_bounds:correctedPlan.entry_zones.map(e=>({lower:e.lower,upper:e.upper})),exit_bounds:{lower:correctedPlan.exit_zone.lower,upper:correctedPlan.exit_zone.upper},invalidation_price:correctedPlan.invalidation.price,
    full_analyzePump_replay:false,new_live_READY_SENT_or_profitability_proven:false,original_saved_analysis_overwritten:false,
    actual_source_clocks_reaged:false,native_HTTP_RPC_SQL_TG_Worker:0,raw_candles_pivots_orderbook_or_inputs_exported:false,private_plan_receipts:privateDir};
  await save(resolve(handoff,'affected-result.json'),result);
  process.stdout.write(JSON.stringify({status:result.status,actual_cases:1,artificial_edges:1,calls,baseline_exact_saved_plan:checks.baseline_exact_saved_plan,corrected_minimum_pct:result.corrected_minimum_pct,native:0})+'\n');
}catch(error){
  await save(resolve(handoff,'affected-failure.json'),{schema:'AX_ONE_QUALIFICATION_FAILURE_V1',calls,checks,error_name:error.name,error_message:error.message,native:0,do_not_rerun:true});
  throw error;
}
