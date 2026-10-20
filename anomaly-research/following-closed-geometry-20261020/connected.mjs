// ONE proposed coordinator entry, UNEXECUTED. No test registration or autorun.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runFollowingClosedGeometry({repo_root}={}){
 const prefix='anomaly-research/following-closed-geometry-20261020',sha=b=>createHash('sha256').update(b).digest('hex');
 const manifest=JSON.parse(await readFile(resolve(repo_root,prefix,'manifest.json'),'utf8'));
 const pb=await readFile(resolve(repo_root,prefix,'protocol.json'));assert.equal(sha(pb),manifest.protocol_sha256);const protocol=JSON.parse(pb);
 const modelPath=resolve(repo_root,prefix,'geometry.mjs');assert.equal(sha(await readFile(modelPath)),manifest.geometry_sha256);
 const observerPath=resolve(repo_root,'anomaly-research/observer/observer.mjs');assert.equal(sha(await readFile(observerPath)),manifest.observer_hash_module_sha256);
 const {describeFollowingClosed:describe}=await import(pathToFileURL(modelPath).href),{hash}=await import(pathToFileURL(observerPath).href);
 const D=14400000,T=Date.UTC(2026,9,1),target={end_ts:T,close:100},controls=[];
 const bar=(k,change={})=>({start_ts:T+k*D,end_ts:T+(k+1)*D,open:100,high:103,low:98,close:102,cohort_index:k,source_row_index:k,...change});
 const compare=(native_bars,horizon='4h',source_asof_ts=T+30*86400000)=>describe({target,native_bars,horizon,source_asof_ts});
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9);
 const control=(label,fn)=>{const detail=fn();controls.push({label,classification:'CONTROLLED_ARCHIVAL_GEOMETRY_EDGE_CASE',...detail});};
 control('only strictly following closed bars affect comparison',()=>{
  const x=compare([bar(-1,{high:999,low:1,cohort_index:90}),bar(0),bar(1,{high:999,low:1})]);assert.equal(x.status,'FULL_COMPARABLE_CLOSED_CONTEXT');assert.deepEqual(x.future_native_cohort_indices,[0]);near(x.metrics.end_close_change_pct,2);near(x.metrics.following_min_low_relative_close_pct,-2);near(x.metrics.following_max_high_relative_close_pct,3);return {result:x};
 });
 control('exact source boundary eligible; one millisecond before it right censored',()=>{
  const full=compare([bar(0),bar(1)],'4h',T+D),right=compare([bar(0),bar(1)],'4h',T+D-1);assert.equal(full.status,'FULL_COMPARABLE_CLOSED_CONTEXT');assert.equal(full.available_following_closed_bars,1);assert.equal(right.status,'RIGHT_CENSORED_SOURCE_ASOF');assert.equal(right.available_following_closed_bars,0);assert.ok(Object.values(right.metrics).every(v=>v===null));return {full,right};
 });
 control('missing retained left or right edge is insufficient history not zero movement',()=>{
  const six=Array.from({length:6},(_,k)=>bar(k)),left=compare(six.slice(1),'24h'),right=compare(six.slice(0,-1),'24h');assert.equal(left.status,'INSUFFICIENT_RETAINED_FUTURE_HISTORY');assert.equal(right.status,'INSUFFICIENT_RETAINED_FUTURE_HISTORY');assert.ok(Object.values(left.metrics).every(v=>v===null));assert.ok(Object.values(right.metrics).every(v=>v===null));return {left,right};
 });
 control('internal missing native interval is a gap without interpolation',()=>{
  const x=compare(Array.from({length:6},(_,k)=>bar(k)).filter((_,k)=>k!==2),'24h');assert.equal(x.status,'INTERNAL_FUTURE_GAP');assert.equal(x.available_following_closed_bars,5);assert.ok(Object.values(x.metrics).every(v=>v===null));return {result:x};
 });
 control('fully observed zero changes remain numeric zeros',()=>{
  const x=compare([bar(0,{open:100,high:100,low:100,close:100})]);assert.equal(x.status,'FULL_COMPARABLE_CLOSED_CONTEXT');assert.ok(Object.values(x.metrics).every(v=>v===0));return {result:x};
 });
 control('both extremes in one candle do not disclose intrabar ordering',()=>{
  const x=compare([bar(0,{high:110,low:90,close:100})]);assert.equal(x.intrabar_order,'UNKNOWN');assert.equal(x.is_trade_or_directional_outcome,false);near(x.metrics.following_min_low_relative_close_pct,-10);near(x.metrics.following_max_high_relative_close_pct,10);assert.equal(x.metrics.end_close_change_pct,0);return {result:x};
 });
 control('negative end close is signed geometry without selecting SHORT winner',()=>{
  const x=compare([bar(0,{high:101,low:95,close:98})]);near(x.metrics.end_close_change_pct,-2);near(x.metrics.following_min_low_relative_close_pct,-5);near(x.metrics.following_max_high_relative_close_pct,1);assert.equal(x.is_trade_or_directional_outcome,false);return {result:x};
 });
 control('malformed closed prices or duplicate native window fail instead of becoming missing',()=>{
  assert.throws(()=>compare([bar(0,{low:104})]),/CLOSED_FUTURE_OHLC_INVALID/);assert.throws(()=>compare([bar(0),bar(0)]),/NATIVE_GRID_OR_DUPLICATE_INVALID/);assert.throws(()=>describe({target:{end_ts:T,close:null},native_bars:[bar(0)],source_asof_ts:T+D,horizon:'4h'}),/CLOSED_TARGET_COMPARISON_REQUIRED/);return {refusals:'INVALID_PRICE_DUPLICATE_WINDOW_INVALID_COMPARISON_REFERENCE'};
 });
 assert.equal(controls.length,8);

 // Reuse frozen outputs and input rows. No detector, old feature calculation,
 // source qualifier, day/week aggregation, outcome evaluator or provider call.
 const sb=await readFile(resolve(repo_root,protocol.population.study_path));assert.equal(sb.length,protocol.population.study_bytes);assert.equal(sha(sb),protocol.population.study_sha256);const study=JSON.parse(sb);
 assert.equal(study.schema,'HTX_MULTI_CONTRACT_SAVED_DESCRIPTIVE_RESULT_V1');assert.equal(study.findings.length,protocol.population.frozen_findings);assert.equal(study.finding_fact_ledger_sha256,protocol.population.study_fact_ledger_sha256);
 const ledger=createHash('sha256');for(const finding of study.findings)ledger.update(hash(finding)+'\n');assert.equal(ledger.digest('hex'),protocol.population.study_fact_ledger_sha256);
 const gzip=await readFile(resolve(repo_root,protocol.native_source.path));assert.equal(gzip.length,protocol.native_source.gzip_bytes);assert.equal(sha(gzip),protocol.native_source.gzip_sha256);
 const dto=gunzipSync(gzip);assert.equal(dto.length,protocol.native_source.DTO_bytes);assert.equal(sha(dto),protocol.native_source.DTO_sha256);const cohort=JSON.parse(dto);
 assert.equal(cohort.schema,'HTX_SAVED_NATIVE_4H_QUOTE_TURNOVER_COHORT_V1');assert.equal(cohort.artifacts.length,37);
 const contexts=[],groups=new Map(),seen=new Set(),series=new Map(),contextLedger=createHash('sha256');
 const statuses=['RIGHT_CENSORED_SOURCE_ASOF','INSUFFICIENT_RETAINED_FUTURE_HISTORY','INTERNAL_FUTURE_GAP','FULL_COMPARABLE_CLOSED_CONTEXT'];
 for(const finding of study.findings){
  assert.equal(finding.classification,protocol.population.classification);assert.equal(finding.market,'FUTURES');assert.equal(finding.upstream,'HTX');assert.equal(finding.direction,'UNASSIGNED');assert.equal(finding.native_card_created,false);assert.ok(!seen.has(finding.research_id));seen.add(finding.research_id);
  const artifact=cohort.artifacts[finding.cohort_artifact_index],native=artifact?.native;assert.equal(native?.contract,finding.contract_label);assert.equal(native.source_ts,finding.source_as_of_ts);
  if(!series.has(finding.cohort_artifact_index)){
   const rows=native.rows.map((r,index)=>({start_ts:r.open_ts,end_ts:r.end_ts,open:Number(r.native_lexemes.open),high:Number(r.native_lexemes.high),low:Number(r.native_lexemes.low),close:Number(r.native_lexemes.close),cohort_index:index,source_row_index:r.source_row_index}));
   series.set(finding.cohort_artifact_index,{rows,byEnd:new Map(rows.map(r=>[r.end_ts,r]))});
  }
  const s=series.get(finding.cohort_artifact_index),path=finding.timeframe==='4h'?'native.rows':finding.timeframe==='1d'?'derived_utc.day.complete':finding.timeframe==='1w'?'derived_utc.week.complete':null;assert.equal(finding.cohort_series,path);assert.ok(path);
  const original=finding.timeframe==='4h'?native.rows[finding.cohort_bar_index]:finding.timeframe==='1d'?artifact.derived_utc.day.complete[finding.cohort_bar_index]:artifact.derived_utc.week.complete[finding.cohort_bar_index];
  assert.equal(original.end_ts,finding.end_ts);assert.equal(finding.timeframe==='4h'?original.open_ts:original.start_ts,finding.start_ts);assert.equal(Number(finding.timeframe==='4h'?original.native_lexemes.close:original.close_lexeme),finding.close);assert.equal(s.byEnd.get(finding.end_ts)?.close,finding.close);
  for(const horizon of protocol.horizons){
   const context=describe({target:{end_ts:finding.end_ts,close:finding.close},native_bars:s.rows,source_asof_ts:native.source_ts,horizon:horizon.id});assert.equal(context.required_native_bars,horizon.required_native_bars);assert.equal(context.comparison_end_ts,finding.end_ts+horizon.ms);
   const row={context_id:'FOLLOWING_CLOSED_CONTEXT:'+hash({study_sha256:protocol.population.study_sha256,research_id:finding.research_id,horizon:horizon.id}),classification:'ARCHIVAL_TARGET_RELATIVE_PRICE_GEOMETRY_NOT_PREDICTION',research_id:finding.research_id,contract_label:finding.contract_label,market:finding.market,upstream:finding.upstream,target_timeframe:finding.timeframe,target_start_ts:finding.start_ts,target_end_ts:finding.end_ts,target_closed_comparison_price:finding.close,cohort_artifact_index:finding.cohort_artifact_index,target_cohort_series:path,target_cohort_bar_index:finding.cohort_bar_index,...context};
   contexts.push(row);contextLedger.update(hash(row)+'\n');const key=finding.timeframe+':'+horizon.id;if(!groups.has(key))groups.set(key,{target_timeframe:finding.timeframe,horizon:horizon.id,candidate_contexts:0,status_counts:Object.fromEntries(statuses.map(x=>[x,0]))});const group=groups.get(key);group.candidate_contexts++;group.status_counts[context.status]++;
  }
 }
 assert.equal(contexts.length,protocol.population.expected_descriptive_cells);
 const denominators=[...groups.values()];for(const g of denominators){assert.equal(Object.values(g.status_counts).reduce((a,b)=>a+b,0),g.candidate_contexts);g.full_context_share=g.status_counts.FULL_COMPARABLE_CLOSED_CONTEXT/g.candidate_contexts;g.independent_sample_count=null;}
 const finished=Date.now();
 return{schema:'FOLLOWING_CLOSED_ARCHIVAL_GEOMETRY_RESULT_V1',status:'DESCRIPTIVE_CONTEXT_CALCULATION_COMPLETED',protocol_sha256:sha(pb),controls,controlled_group_count:controls.length,inputs:{study_sha256:sha(sb),study_fact_ledger_sha256:protocol.population.study_fact_ledger_sha256,source_DTO_sha256:sha(dto),upstream_count:1},population:{frozen_research_windows:seen.size,context_cells:contexts.length,horizon_count:protocol.horizons.length,independence_unit:null,all_windows_previously_selected_backfilled:true},denominators,contexts,context_ledger_sha256:contextLedger.digest('hex'),calculation_completed_ts:finished,original_native_first_known_ts:null,original_provider_body_completion_ts:null,clock_scope:'CURRENT_ARCHIVAL_CALCULATION_NOT_ORIGINAL_DETECTION',intrabar_order:'UNKNOWN',LONG_SHORT_mirrors_created:0,trade_outcomes_or_winner_or_first_passage_evaluated:false,entry_anchor_levels_trigger_stop_TTL_recheck_research:false,predictive_accuracy:null,precision:null,recall:null,profit:null,independent_sample_count:null,native_instrument_epoch_body_or_event_commit_ACK_qualified:false,actual_card_watch_outbox_or_admission_created:false,existing_outcomes_imported:false,original533_577_qualifier_aggregation_or_feature_calculation_replayed:false,old915_or23_or57_replayed:false,score_effect:0,weights_changed:false,provider_HTTP:0,local_SQL:0,native_SQL:0,MAIN:0,Telegram:0,activation_allowed:false};
}
