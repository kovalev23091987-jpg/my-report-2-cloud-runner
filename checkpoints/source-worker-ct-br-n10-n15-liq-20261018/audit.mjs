import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const select=(value,keys)=>Object.fromEntries(keys.map(k=>[k,value?.[k]??null]));
const binding=JSON.parse(readFileSync(resolve(dir,'scope.json')));
const original=JSON.parse(readFileSync(resolve(root,binding.existing_original_binding)));
const archive=resolve(root,binding.existing_archive);
assert.equal(sha(readFileSync(archive)),original.archive_sha256);
const members=JSON.parse(execFileSync('python3',['-c',`import json,sys,zipfile,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 print(json.dumps({n:{'sha256':hashlib.sha256(z.read(n)).hexdigest(),'value':json.loads(z.read(n))} for n in z.namelist() if n.endswith('.json')}))`,archive],{maxBuffer:3*1024*1024}));
for(const [name,row] of Object.entries(members))assert.equal(row.sha256,original.member_sha256[name]);
const find=name=>{const matches=Object.entries(members).filter(([p])=>p.split('/').at(-1)===name);assert.equal(matches.length,1);return matches[0][1].value;};
const output=find('report2-run-result.json');
assert.equal(output.head,original.workflow.head_sha);
assert.equal(output.run_id,'1792348881418-1792348897657');
assert.deepEqual(output.candidates.map(c=>c.contract),['CT-USDT','BR-USDT']);
const decisionFields=['checked','observed_fact_count','valid_fact_count','directional_eligible_fact_count','score_application_receipt_count','score_contribution','score_application_status','control_check_reported','control_decision_effect_proven','decision_assessment_receipt_count','unscored_diagnostic_receipt_count','rendered_useful_context_receipt_count','participating','participation_status'];
const coverageFields=['status','checked','observed_facts','valid_context_facts','usable_facts','source_statuses','decision_consumer','maximum_score_points','decision_path','evidence_rejection_reasons'];
const facts=[],candidates=[];
for(const c of output.candidates){
 const rendered=c.block_rendered_results,manual=rendered.context_receipts.filter(r=>['N10','N15'].includes(r.block_id));
 assert.equal(rendered.run_id,c.run_id);assert.equal(rendered.snapshot_id,c.snapshot_id);
 const ct=c.contract==='CT-USDT';
 assert.equal(manual.filter(r=>r.block_id==='N10').length,ct?3:2);
 assert.equal(manual.filter(r=>r.block_id==='N15').length,ct?1:0);
 assert.equal(rendered.telegram_context_receipts.filter(r=>['N10','N15'].includes(r.block_id)).length,0);
 for(const r of manual){
  assert.ok(c.manual_text.includes(`- ${r.label}: ${r.value}`));
  assert.equal(r.consumer,'MANUAL_CONFIRMED_CONTEXT');assert.equal(r.score_contribution,0);
  assert.ok(Number.isSafeInteger(r.source_ts)&&r.source_ts<=r.observed_ts&&r.observed_ts<=c.observed_ts);
  const check=Object.values(c.block_coverage.blocks[r.block_id].source_checks).find(s=>s.valid_evidence_ids.includes(r.evidence_id));assert.ok(check);
  assert.ok(check.physical_root_keys.includes(r.physical_root_key));
  const range=r.block_id==='N10'&&r.physical_root_key.includes(':60min:');
  const path=r.block_id==='N10'&&!range;
  // Derive a window only from this retained root AND this retained candle-count
  // label plus the bound normalizer. These are not recovered raw candle rows.
  const end=r.block_id==='N10'?Number(r.physical_root_key.split(':').at(-1)):null;
  const duration=range?20*3600000:path?15*60000:null;
  if(path)assert.equal(r.source_ts,end);
  if(range)assert.ok(r.source_ts>end);
  const fact={...r,contract:c.contract,run_id:c.run_id,snapshot_id:c.snapshot_id,
   venue:r.block_id==='N10'?'HTX':null,market:r.block_id==='N10'?(r.physical_root_key.startsWith('htx-spot:')?'SPOT':'FUTURES'):'AGGREGATED_VENUES',
   quote:r.block_id==='N10'?'USDT':'USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE',
   window_start_ts:end===null?null:end-duration,window_end_ts:end,
   window_basis:end===null?'PROVIDER_ROLLING_24H_LABEL_ONLY_NO_EXPLICIT_START_END':'ROOT_CANDLE_END_AND_RETAINED_CANDLE_COUNT_BOUND_NORMALIZER',
   source_clock_is_window_end:path,first_known_ts:null,expires_at:null,raw_hash:null,
   missing_fields_basis:'NOT_RETAINED_IN_THIS_COMPACT_ORIGINAL_NO_FULL_EVIDENCE_RECONSTRUCTION'};
  facts.push(fact);
 }
 const blocks=Object.fromEntries(['N10','N15'].map(b=>{const d=c.block_decision_use.blocks[b],coverage=c.block_coverage.blocks[b];return[b,{coverage:select(coverage,coverageFields),decision:select(d,decisionFields),impact_diagnostic:d.impact_diagnostic,source_checks:coverage.source_checks,source_accounting:select(d.source_accounting,['valid_provider_ids','used_provider_ids','nonzero_score_provider_ids','unscored_diagnostic_provider_ids','used_declared_upstream_ids','used_physical_root_keys','routes_with_actual_use','routes_with_nonzero_score','provider_or_upstream_count_is_not_independent_vote_count'])}];}));
 assert.equal(blocks.N10.decision.participation_status,'NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN');
 assert.equal(blocks.N10.decision.control_decision_effect_proven,false);
 assert.equal(blocks.N10.decision.score_contribution,ct?0:null);
 const liq=c.canonical.liquidations,scenarios=liq.calculated_scenarios;
 assert.equal(liq.status,'CALCULATED_CONTEXT_ONLY');assert.equal(liq.coverage_status,'NO_FACTUAL_FUTURE_LEVELS');
 assert.equal(liq.provider_zone_count,0);assert.equal(liq.displayed_zone_count,0);
 assert.equal(liq.all_zones.length,0);assert.equal(liq.above.length,0);assert.equal(liq.below.length,0);
 assert.equal(scenarios.length,8);assert.equal(liq.calculated_scenario_count,8);
 assert.equal(liq.htx_source_backed_model.status,'DISABLED_BY_OWNER_ON_REQUEST_ONLY');
 assert.equal(liq.future_source_status.coinboss.network_calls,1);
 const sourceTs=ct?1792348759714:1792348757019,sourceReference=ct?.30405:.42898;
 for(const s of scenarios){
  assert.equal(s.source,'CoinBoss');assert.equal(s.source_ts,sourceTs);assert.ok(s.source_ts<c.observed_ts);
  assert.equal(s.price_quote,'USD');assert.equal(s.distance_reference_price,sourceReference);
  assert.equal(s.distance_reference_basis,'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE');
  assert.ok(Math.abs(s.distance_pct-(s.price/sourceReference-1)*100)<1e-10);
  assert.equal(s.side,s.price>sourceReference?'ABOVE':'BELOW');
  assert.equal(s.scenario_only,true);assert.equal(s.source_backed_calculated,true);assert.equal(s.estimated,true);assert.equal(s.decision_target_eligible,false);
  assert.equal(s.amount_semantics,'MODELED_INTENSITY_TIER_NOT_OBSERVED_POSITION');
  for(const key of ['position_count','position_key','notional','exact_notional_usdt'])assert.equal(s[key],null);
 }
 const lines=c.manual_text.split('\n').filter(l=>l.startsWith('Ликвидационные уровни '));assert.equal(lines.length,2);
 const displayed=lines.map(line=>{const prices=[...line.matchAll(/расчётный уровень ≈([\d,]+) USD/g)].map(m=>Number(m[1].replace(',','.')));assert.equal(prices.length,2);assert.ok(prices.length<=3);for(const price of prices)assert.ok(scenarios.some(s=>s.price===price));return{side:line.startsWith('Ликвидационные уровни выше')?'ABOVE':'BELOW',prices,line};});
 assert.ok(c.manual_text.includes('сценарии по рыночным данным, а не наблюдаемые позиции или подтверждённые объёмы будущих ликвидаций'));
 assert.ok(c.manual_text.includes('к цене источника'));
 assert.deepEqual(c.canonical.targets,[]);
 candidates.push({...select(c,['contract','publication_id','run_id','snapshot_id','wave_id','direction','observed_ts','canonical_state']),blocks,
  manual_fact_ids:manual.map(r=>r.evidence_id),detailed_N10_N15_telegram_receipts:[],telegram_payload_status:rendered.telegram_payload_status,
  liquidations:{...select(liq,['status','coverage_status','reason','current_price','future_levels_status','provider_zone_count','calculated_scenario_count','displayed_zone_count','source_receipts','htx_source_backed_model','coverage_admission','future_source_status','acquisition_diagnostics']),
   scenarios,model_source_age_at_candidate_ms:c.observed_ts-sourceTs,model_received_ts:null,model_first_known_ts:null,raw_model_body_present:false,
   displayed_model_levels:displayed,displayed_model_count:displayed.reduce((n,r)=>n+r.prices.length,0),displayed_zone_count_excludes_separate_model_rendering:true,
   full_position_census:false,detailed_Telegram_LIQ_model_display_proven:false,target_consumer_has_no_levels:true}});
}
const [ct,br]=candidates,ctSector=ct.blocks.N15;
assert.equal(ctSector.decision.score_contribution,1.1698);assert.equal(ctSector.decision.score_application_receipt_count,1);assert.equal(ctSector.decision.participation_status,'SCORE_EFFECT_PROVEN');
assert.equal(ctSector.decision.unscored_diagnostic_receipt_count,1);
const impact=ctSector.impact_diagnostic.rows[0];assert.equal(impact.actual_score_contribution,1.1698);assert.equal(impact.block_cap,2);
assert.equal(ctSector.coverage.maximum_score_points,.6);
const sectorFact=facts.find(r=>r.block_id==='N15');assert.equal(sectorFact.physical_root_key,'ethereum:0x0a092e544da31150b439a1aaa1a3a2214a867f46|concrete:decentralized-finance-defi:1792348917000');
assert.equal(sectorFact.score_contribution,0); // presentation receipt, NOT score application
assert.equal(br.blocks.N15.decision.score_contribution,null);assert.equal(br.blocks.N15.decision.participating,false);
assert.equal(br.blocks.N15.coverage.source_statuses.COINGECKO_SECTOR,'EXACT_SECTOR_REGISTRY_REQUIRED');
for(const c of candidates)assert.equal(c.blocks.N15.coverage.source_statuses.COINPAPRIKA_SECTOR,'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA');
const paths=facts.filter(r=>r.contract==='CT-USDT'&&r.block_id==='N10'&&!r.physical_root_key.includes(':60min:'));
assert.equal(paths.length,2);assert.equal(paths[0].window_end_ts,paths[1].window_end_ts);assert.equal(paths[0].window_start_ts,paths[1].window_start_ts);
const acquisition=output.liquidation_source_acquisition_audit;assert.equal(acquisition.routes.length,1);assert.equal(acquisition.routes[0].contract,'CT-USDT');assert.equal(acquisition.routes[0].status,'UNSUPPORTED_NATIVE_SYMBOL');assert.equal(acquisition.routes[0].source_outcome.actual_http,1);assert.equal(acquisition.shared_budget.actual_http,1);
assert.equal(acquisition.network_calls,0); // pure audit builder, NOT all LIQ collection
const sourcePaths=['htx-technical-structure.mjs','sector-relative-strength-review.mjs','coinboss-liquidation-levels.mjs','block-result-context.mjs','candidate-evidence-v2-runtime.mjs','block-score-policy.mjs','evidence-v2.mjs','block-decision-use-audit.mjs'].map(p=>'current-generation/files/src/'+p);
const code=sourcePaths.map(path=>{const bytes=readFileSync(resolve(root,path)),workingBlob=execFileSync('git',['rev-parse',binding.working_base+':'+path],{cwd:root,encoding:'utf8'}).trim(),originalBlob=execFileSync('git',['rev-parse',output.head+':'+path],{cwd:root,encoding:'utf8'}).trim();assert.equal(workingBlob,originalBlob);return{path,original_git_blob:originalBlob,working_base_git_blob:workingBlob,sha256:sha(bytes)};});
const analysis={schema:'SAVED_CT_BR_N10_N15_LIQ_CONSUMER_AUDIT_V1',working_base:binding.working_base,original:{cloud_run:original.cloud_run,artifact_id:original.artifact_id,archive:binding.existing_archive,archive_sha256:original.archive_sha256,source_head:output.head,run_id:output.run_id,generated_at:output.generated_at,member_sha256:original.member_sha256},source_code:code,facts,candidates,
 liquidation_route_accounting:{audit_builder_network_calls:acquisition.network_calls,audit_builder_db_calls:acquisition.db_calls,native_acquisition_http:acquisition.shared_budget.actual_http,native_routes:acquisition.routes,CoinBoss_retained_http_by_contract:Object.fromEntries(candidates.map(c=>[c.contract,c.liquidations.future_source_status.coinboss.network_calls])),not_entire_run_HTTP_and_not_complete_provider_accounting:true},
 diagnostic_proposal:{kind:'COVERAGE_STATIC_CAP_LABEL_DIFFERS_FROM_APPLIED_POLICY_CAP',contract:'CT-USDT',block:'N15',coverage_maximum_score_points:.6,actual_resolved_policy_cap:2,actual_retained_contribution:1.1698,proposal:'Coordinator may distinguish static legacy cap from the resolved per-evidence policy cap in internal coverage diagnostics; reuse resolveBlockCap and existing receipt. Do not clamp contribution, change weights, strategy or user form.',new_runtime_or_strategy_bug_claimed:false,shared_files_changed:false},
 acceptance:{new_blocks_not_PR477_repeat:['N10','N15','LIQ'],manual_N10_facts:5,manual_N15_facts:1,CT_N15_retained_actual_score:1.1698,BR_N15_fact_and_use_proven:false,LIQ_raw_model_scenarios:16,LIQ_displayed_model_levels:8,factual_future_position_levels:0,N10_control_effect_or_entry_proven:false,detailed_N10_N15_Telegram_fact_display:false,detailed_LIQ_Telegram_display:false,raw_provider_payload_replayed:false,all105_fresh_coverage:false,current_connection_qualified:false},
 limits:['Raw candle rows, sector peer basket, target quote/reference body and CoinBoss body are absent in this compact original. No new provider identity or complete raw replay is inferred.', 'N10 windows are explicitly derived from retained root + candle-count label using unchanged normalizer; unavailable raw hash/expiry/first-known clocks remain NULL. N15 rolling24h has no reconstructed explicit endpoints.', 'CT spot/futures aligned15m windows are two markets on one HTX upstream, not independent sources; BR has no retained N10 spot fact, no new listing/availability conclusion.', 'CT CoinGecko is one aggregated provider; retained root binds concrete Ethereum address, not 50 independent providers or full-sector coverage. Three actual HTTP plus one cached metadata receipt, not four new HTTP.', 'CoinPaprika cached market lookup with HTTP200 and zero new HTTP produced no sector fact for either finalist; no automatic retry, identity override or cap increase authorized.', 'N15 presentation score0 and unscored review0 do not erase actual score1.1698; BR unknown contribution stays NULL. Static coverage cap0.6 is not substituted for resolved policycap2.', 'CoinBoss model prices/distances remain USD relative to its original reference; source age at final snapshot is not transport receipt age. The two markets/current HTXUSDT price do not authorize FX conversion or replacement of source reference.', 'LIQ canonical displayed_zone_count0 refers to factual-zone output; manual text separately renders four model levels per asset from eight retained scenarios. No observed positions, exact notional, score, entry or target authority.', 'Only CT Hyperliquid unsupported-symbol attempt is captured in native audit; operational/schema success is not source coverage, BR has no captured native route. Audit-builder0 does not mean acquisition0 or allprovider accounting closed.', 'PR477 exact CT same-run220 delivery is reused as its separate accepted proof; this package does not rerun delivery assertions or infer detailed block/model publication from it.'],
 worker_effect:{provider_HTTP:0,native_SQL:0,new_run_acquisition:0,deploy_MAIN_Telegram:0,production_changes:false,accepted_test_suites_repeated:0,strategy_score_weights_forms_pauses_caps_or_unknown_changed:false}};
writeFileSync(process.argv[2]||resolve(dir,'analysis.json'),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',manual_N10_facts:5,manual_N15_facts:1,CT_actual_N15_score:1.1698,BR_N15_score:null,LIQ_scenarios:16,LIQ_manual_model_levels:8,factual_position_levels:0,new_source_HTTP:0,accepted_suites_repeated:0}));
