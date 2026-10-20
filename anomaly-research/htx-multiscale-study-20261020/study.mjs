// UNEXECUTED preparation. Invoke once in a coordinator NEXT common case.
// Read-only retained DTO + pure research features; no detector/card/watch/SQL.
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runHtxMultiscaleStudy({repo_root}={}){
 const started=Date.now(),sha=b=>createHash('sha256').update(b).digest('hex');
 const need=(ok,code)=>{if(!ok)throw Error(code);};
 const stamp=x=>Number.isSafeInteger(x)&&x>=1e12;
 const prefix='anomaly-research/htx-multiscale-study-20261020';
 const manifest=JSON.parse(await readFile(resolve(repo_root,prefix,'manifest.json'),'utf8'));
 const protocolBytes=await readFile(resolve(repo_root,prefix,'protocol.json'));need(sha(protocolBytes)===manifest.protocol_sha256,'FROZEN_PROTOCOL_HASH');
 const protocol=JSON.parse(protocolBytes);
 const observerPath=resolve(repo_root,'anomaly-research/observer/observer.mjs'),observerText=await readFile(observerPath,'utf8');
 const begin=observerText.indexOf('export function features('),end=observerText.indexOf('export function detectClosed(',begin);
 need(begin>=0&&end>begin&&sha(observerText.slice(begin,end))===manifest.features_function_sha256,'EXACT_EXISTING_FEATURE_FUNCTION');
 need(sha(observerText.slice(0,end))===manifest.observer_features_prefix_sha256,'EXACT_FEATURE_DEPENDENCIES_AND_MEDIAN');
 const {features,hash}=await import(pathToFileURL(observerPath).href);
 const compressed=await readFile(resolve(repo_root,protocol.source.path));need(sha(compressed)===protocol.source.gzip_sha256,'FROZEN_COHORT_GZIP_HASH');
 const bytes=gunzipSync(compressed);need(bytes.length===protocol.source.uncompressed_bytes&&sha(bytes)===protocol.source.uncompressed_sha256,'FROZEN_COHORT_DTO_HASH');
 const cohort=JSON.parse(bytes),inputKnownBy=Date.now();
 const policyBytes=await readFile(resolve(repo_root,protocol.source.normative_policy_path));need(sha(policyBytes)===protocol.source.normative_policy_sha256,'FROZEN_QUOTE_UNIT_POLICY');
 need(stamp(started)&&stamp(inputKnownBy)&&inputKnownBy>=started,'STUDY_READ_CLOCK');
 need(cohort.schema===protocol.source.source_schema&&Array.isArray(cohort.artifacts)&&cohort.artifacts.length===protocol.source.contract_label_count,'FROZEN_COHORT_SCHEMA');
 const settings=protocol.fixed_rules,policyHash=hash(settings),metrics=protocol.distributions.metrics;
 const findings=[],streams=[],contracts=[],seenContracts=new Set(),lineageHash=createHash('sha256');
 const pooled=Object.fromEntries(protocol.series.map(s=>[s.timeframe,{timeframe:s.timeframe,contract_label_series:0,series_with_eligible_windows:0,series_not_evaluated:[],candidate_windows:0,eligible_windows:0,gapped_windows:0,undefined_median_windows:0,findings:0,volume_with_geometry:0,extreme_volume_only:0}]));
 const asNumber=(lexeme,positive,where)=>{need(typeof lexeme==='string'&&lexeme.trim().length>0,where+':NUMERIC_LEXEME_MISSING');const n=Number(lexeme);need(Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER&&(positive?n>0:n>=0),where+':NUMERIC_LEXEME_INVALID');return n;};
 const distribution=(values,eligible)=>{
  const x=[...values].sort((a,b)=>a-b),q=p=>x.length?x[Math.max(0,Math.ceil(p*x.length)-1)]:null;
  return{observations:x.length,undefined:eligible-x.length,min:x[0]??null,p50:q(.5),p90:q(.9),p95:q(.95),p99:q(.99),max:x.at(-1)??null,method:'NEAREST_RANK_DESCRIPTIVE_ONLY'};
 };
 const ordered=cohort.artifacts.map((a,index)=>({a,index})).sort((x,y)=>x.a.native.contract<y.a.native.contract?-1:x.a.native.contract>y.a.native.contract?1:0);
 for(const {a,index} of ordered){
  const n=a.native,label=n?.contract;
  need(typeof label==='string'&&label.endsWith('-USDT')&&!seenContracts.has(label),'UNIQUE_CONTRACT_LABEL_GRAIN');seenContracts.add(label);
  need(n.schema==='HTX_SAVED_NATIVE_4H_QUOTE_TURNOVER_V1'&&n.venue==='HTX_USDT_LINEAR_SWAP'&&n.period==='4hour'&&n.quote_currency==='USDT'&&n.native_4h_turnover_field==='trade_turnover','EXPECTED_SAVED_FUTURES_QUOTE_ROLE:'+label);
  need(stamp(n.source_ts)&&n.source_ts<=inputKnownBy&&Array.isArray(n.rows),'ORIGINAL_SOURCE_ASOF:'+label);
  const contractMeta={contract_label:label,artifact_index:index,upstream:'HTX',source_as_of_ts:n.source_ts,original_header_receipt_ts:n.first_known_ts,original_header_receipt_basis:n.first_known_basis,original_body_completion_ts:null,true_original_detection_ts:null,raw_body_sha256:n.original_receipt?.sha256??null,raw_gzip_ref:a.original_files?.raw?.path??null,raw_gzip_sha256:a.original_files?.raw?.sha256??null,native_instrument_epoch_verified:false,spot_context_required:false,derived_timeframes_are_not_new_sources:true};
  let firstNative=null,lastNative=null;
  for(const series of protocol.series){
   const raw=series.timeframe==='4h'?n.rows:series.timeframe==='1d'?a.derived_utc?.day?.complete:a.derived_utc?.week?.complete;
   need(Array.isArray(raw),'EXISTING_COMPLETE_SERIES_REQUIRED:'+label+':'+series.timeframe);
   const native=series.timeframe==='4h',duration=series.duration_ms,offset=series.alignment_offset_ms,seen=new Set();
   const bars=raw.map((r,cohortIndex)=>{
    const where=label+':'+series.timeframe+':'+cohortIndex,start=native?r.open_ts:r.start_ts,finish=r.end_ts;
    need(stamp(start)&&finish===start+duration&&(start-offset)%duration===0&&finish<=n.source_ts&&!seen.has(start),where+':CLOSED_GRID_OR_KEY_INVALID');seen.add(start);
    const lex=native?r.native_lexemes:{open:r.open_lexeme,high:r.high_lexeme,low:r.low_lexeme,close:r.close_lexeme,trade_turnover:r.derived_quote_turnover_usdt_exact};
    const b={start_ts:start,end_ts:finish,open:asNumber(lex?.open,true,where),high:asNumber(lex?.high,true,where),low:asNumber(lex?.low,true,where),close:asNumber(lex?.close,true,where),volume:asNumber(lex?.trade_turnover,false,where),volume_lexeme:lex.trade_turnover,cohort_index:cohortIndex};
    need(b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.low<=b.high,where+':OHLC_GEOMETRY_INVALID');
    if(native)need(Number.isSafeInteger(r.source_row_index)&&r.source_row_index>=0,where+':SOURCE_ROW_POINTER_REQUIRED');
    else need(Array.isArray(r.source_row_indices)&&r.source_row_indices.length===(series.timeframe==='1d'?6:42),where+':DERIVED_COMPLETE_POINTERS_REQUIRED');
    return b;
   }).sort((x,y)=>x.start_ts-y.start_ts);
   if(native){firstNative=bars[0]?.start_ts??null;lastNative=bars.at(-1)?.end_ts??null;}
   const q={input_complete_bars:bars.length,first_background_only_bars:Math.min(settings.lookback,bars.length),candidate_windows:Math.max(0,bars.length-settings.lookback),gapped_windows:0,undefined_median_windows:0,eligible_windows:0,eligible_MAD_zero_windows:0,native_zero_quote_bars:bars.filter(b=>b.volume===0).length,source_declared_incomplete_buckets:native?null:(series.timeframe==='1d'?a.derived_utc.day.incomplete.length:a.derived_utc.week.incomplete.length)};
   const values=Object.fromEntries(metrics.map(k=>[k,[]])),examples=[];let hits=0,shapeHits=0,extremeHits=0;
   for(let k=settings.lookback;k<bars.length;k++){
    const b=bars[k],prior=bars.slice(k-settings.lookback,k),window=[...prior,b];
    if(window.some((x,p)=>p>0&&x.start_ts!==window[p-1].end_ts)){q.gapped_windows++;continue;}
    const f=features(b,prior);
    if(f.volume_ratio===null){q.undefined_median_windows++;continue;}
    need(Number.isFinite(f.volume_ratio),label+':'+series.timeframe+':FINITE_RATIO_REQUIRED');q.eligible_windows++;
    if(f.volume_mad===0)q.eligible_MAD_zero_windows++;
    for(const metric of metrics){if(f[metric]===null)continue;need(Number.isFinite(f[metric]),'FINITE_FEATURE_REQUIRED:'+metric);values[metric].push(f[metric]);}
    const geometry=f.body_ratio!==null&&(f.body_ratio<=settings.small_body||f.upper_wick_ratio>=settings.large_wick||f.lower_wick_ratio>=settings.large_wick);
    const shape=f.volume_ratio>=settings.volume_ratio&&geometry,extreme=f.volume_ratio>=settings.extreme_ratio;
    if(!shape&&!extreme)continue;
    const group=shape?'VOLUME_WITH_GEOMETRY':'EXTREME_VOLUME_ONLY';hits++;if(shape)shapeHits++;else extremeHits++;
    const research_id='HTX_SAVED_QUOTE_RESEARCH:'+hash({input_sha256:protocol.source.uncompressed_sha256,artifact_index:index,contract_label:label,timeframe:series.timeframe,start_ts:b.start_ts,end_ts:b.end_ts,policy_hash:policyHash});
    const finding={research_id,classification:'BACKFILLED_DESCRIPTIVE_NUMERIC_WINDOW',contract_label:label,market:'FUTURES',upstream:'HTX',timeframe:series.timeframe,origin:series.origin,start_ts:b.start_ts,end_ts:b.end_ts,source_as_of_ts:n.source_ts,cohort_artifact_index:index,cohort_series:series.cohort_path,cohort_bar_index:b.cohort_index,background_cohort_bar_indices:prior.map(x=>x.cohort_index),quote_volume_lexeme:b.volume_lexeme,quote_unit:'USDT',volume_semantics:'BOTH_SIDES_AGGREGATE_NOT_SIGNED_TAKER',open:b.open,high:b.high,low:b.low,close:b.close,quote_volume:b.volume,feature_partition:group,features:f,candle_body_fact:b.close>b.open?'CLOSE_ABOVE_OPEN':b.close<b.open?'CLOSE_BELOW_OPEN':'CLOSE_EQUALS_OPEN',direction:'UNASSIGNED',native_card_created:false,policy_hash:policyHash};
    findings.push(finding);lineageHash.update(hash(finding)+'\n');examples.push(finding);examples.sort((x,y)=>y.features.volume_ratio-x.features.volume_ratio||x.start_ts-y.start_ts);if(examples.length>protocol.distributions.examples_per_series)examples.pop();
   }
   need(q.eligible_windows+q.gapped_windows+q.undefined_median_windows===q.candidate_windows,'WINDOW_DENOMINATOR_CONSERVATION:'+label+':'+series.timeframe);
   need(hits===shapeHits+extremeHits&&hits<=q.eligible_windows,'FINDING_PARTITION_CONSERVATION');
   const status=bars.length<=settings.lookback?'INSUFFICIENT_BACKGROUND':q.eligible_windows?'EVALUATED_SAVED_WINDOWS':'NO_ELIGIBLE_BASELINE';
   const stream={contract_label:label,timeframe:series.timeframe,status,origin:series.origin,first_complete_start_ts:bars[0]?.start_ts??null,last_complete_end_ts:bars.at(-1)?.end_ts??null,original_source_asof_ts:n.source_ts,quality:q,finding_count:q.eligible_windows?hits:null,volume_with_geometry:q.eligible_windows?shapeHits:null,extreme_volume_only:q.eligible_windows?extremeHits:null,share_within_eligible_saved_windows:q.eligible_windows?hits/q.eligible_windows:null,distributions:Object.fromEntries(metrics.map(k=>[k,distribution(values[k],q.eligible_windows)])),examples,independent_sample_count:null,predictive_accuracy:null};
   streams.push(stream);const p=pooled[series.timeframe];p.contract_label_series++;p.candidate_windows+=q.candidate_windows;p.eligible_windows+=q.eligible_windows;p.gapped_windows+=q.gapped_windows;p.undefined_median_windows+=q.undefined_median_windows;p.findings+=hits;p.volume_with_geometry+=shapeHits;p.extreme_volume_only+=extremeHits;if(q.eligible_windows)p.series_with_eligible_windows++;else p.series_not_evaluated.push(label);
  }
  contracts.push({...contractMeta,first_retained_native_open_ts:firstNative,last_retained_native_close_ts:lastNative,saved_native_rows:n.rows.length,source_declared_forming_or_excluded:n.excluded?.length??null});
 }
 const finished=Date.now();need(stamp(finished)&&finished>=inputKnownBy,'STUDY_COMPLETION_CLOCK');
 const panels=Object.values(pooled).map(p=>{const {findings:count,...rest}=p;return{...rest,finding_count:p.eligible_windows?count:null,descriptive_hit_share:p.eligible_windows?count/p.eligible_windows:null,independent_observations:false};});
 need(findings.length===panels.reduce((n,p)=>n+(p.finding_count??0),0),'TOTAL_FINDING_RECONCILIATION');
 const totalEligible=panels.reduce((n,p)=>n+p.eligible_windows,0);
 return{schema:'HTX_MULTI_CONTRACT_SAVED_DESCRIPTIVE_RESULT_V1',status:totalEligible?'DESCRIPTIVE_RESEARCH_COMPLETED':'NO_ELIGIBLE_SAVED_WINDOWS',protocol_sha256:sha(protocolBytes),fixed_policy_hash:policyHash,source:{gzip_sha256:sha(compressed),DTO_sha256:sha(bytes),input_scope:'PREVIOUSLY_QUALIFIED_RETAINED_DTO_NOT37RAW_BODY_REVERIFICATION',upstream_count:1,contract_label_count:contracts.length,spot_included:false,finer_15m_30m_1h_available:false,current105_or_synchronous_panel:false,raw_native_body_completion_ts:null},study_clocks:{execution_started_ts:started,DTO_complete_read_hash_parse_known_by_ts:inputKnownBy,research_first_known_ts:finished,execution_completed_ts:finished,elapsed_local_ms:finished-started,original_native_first_detection_ts:null,clock_basis:'CURRENT_RESEARCH_CALCULATION_AFTER_FROZEN_DTO_READ_NOT_PROVIDER_BODY_ACK'},contracts,panels,streams,findings,finding_fact_ledger_sha256:lineageHash.digest('hex'),research_finding_count:totalEligible?findings.length:null,denominator_unit:'ELIGIBLE_OVERLAPPING_CLOSED_WINDOW_NOT_INDEPENDENT_EVENT',independent_sample_count:null,prospective_precision:null,recall:null,trade_outcome_or_sidewinner_evaluated:false,native_instrument_identity_or_commit_ACK_qualified:false,detectClosed_calls:0,actual_card_memory_watch_outbox_admitted:false,main_score_effect:0,weights_changed:false,provider_HTTP:0,native_SQL:0,local_SQL:0,MAIN:0,Telegram:0,prior37qualification_or_aggregation_recomputed:false,prior_BTC_study_replayed:false,activation_allowed:false,native_acquisition_total_HTTP_or_account_headroom:null,limitations:protocol.lineage_limits};
}
