import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const out=dirname(fileURLToPath(import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex'),jh=x=>sha(JSON.stringify(x)),blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});},save=(name,x)=>writeFile(resolve(out,name),JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
let callbacks=0;
try{
 const meta=JSON.parse(await readFile(resolve(out,'affected-source-snapshot.json'),'utf8')),baseline=await readFile(meta.baseline_index,'utf8');
 const expected=baseline.replace('liquidity=measureLiquidity(input.facts.orderbook.value,input.instrument,profile);','liquidity={...measureLiquidity(input.facts.orderbook.value,input.instrument,profile),fact_id:input.facts.orderbook.fact_id,source_ts:input.facts.orderbook.event_ts};').replace('return {...result,manual_text:explainManualAnalysis(result,{day,liquidity})};','return {...result,liquidity,manual_text:explainManualAnalysis(result,{day,liquidity})};');
 const known=new Set(meta.modules.map(m=>m.path)),digests=[];
 for(const m of meta.modules){const b=await readFile(resolve(meta.pure_root,m.path)),s=b.toString('utf8');need(/^(analytics|contracts|profile)\//.test(m.path),'NON_PURE_PATH');
  if(m.path===meta.changed_module)need(s===expected&&blob(Buffer.from(baseline))===m.baseline_git_blob,'UNEXPECTED_ANALYTICS_DELTA');else need(blob(b)===m.baseline_git_blob,'BASELINE_MODULE_CHANGED');
  need(!/\bimport\s*\(|\b(?:fetch|require|eval)\s*\(/.test(s),'DYNAMIC_IO_REFUSED');
  for(const match of [...s.matchAll(/(?:import|export)[^\n]*?\bfrom\s*['"]([^'"]+)['"]/g),...s.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)]){const spec=match[1];need(spec.startsWith('.')&&known.has(posix.normalize(posix.join(posix.dirname(m.path),spec))),'BARE_OR_OUTSIDE_IMPORT_REFUSED');}
  digests.push({path:m.path,sha256:sha(b),baseline_git_blob:m.baseline_git_blob});
 }
 const bytes=await readFile(resolve(out,'../../../../.','pump-report/.private/observations/exact-auto-20261026-reply.json'));need(sha(bytes)==='53f6976b062d92a63f3085eccb516309ddd84a4f9190fe66e9a18d7bb575889a','AUTO_CAPTURE_HASH_MISMATCH');
 const d=JSON.parse(bytes),o=d.latest_auto_candidate.private_evidence.original,a=o.analysis,input=o.input;
 need(jh(a)==='fb73e93a0364c3eea289c1b75b115e193f05fbae11f38c7a0fc154dfb9a8bdc7'&&jh(input)==='c66e85344608b50c66d9b3bf9cfcdd3d899767cdbfad77de2a23f619c532d30f'&&a.mode==='AUTO'&&a.instrument.base==='KIMCHI'&&o.implementation_sha256==='8a0a7ea93f5dd50299bff22b6aac24e98a3abb3dbfc99b79b97981be94e77d44','EXACT_NEW_AUTO_REQUIRED');
 const {analyzePump}=await import(pathToFileURL(resolve(meta.pure_root,'analytics/index.mjs')).href),{START_PROFILE}=await import(pathToFileURL(resolve(meta.pure_root,'profile/start-v1.mjs')).href);
 need(jh(START_PROFILE)==='e557b045ce0c178d3b5fc54b47c65ee0b777335c6bfdcd8e051dc167d7173b5d','EXACT_PROFILE_VALUE_REQUIRED');
 const copy=structuredClone(input),profile=structuredClone(START_PROFILE),beforeInput=jh(copy),beforeProfile=jh(profile);
 await save('affected-start.json',{schema:'AU_ONE_AFFECTED_ACTUAL_START_V1',intended_callbacks:1,original_analysis_sha256:jh(a),original_input_sha256:jh(input),actual_input:'NEW_KIMCHI_AUTO_NOT_OLD_MANUAL',no_native_IO:true});
 callbacks++;const computed=analyzePump(copy,profile),{liquidity:oldLiquidity,...before}=a,{liquidity:newLiquidity,...after}=computed;
 const checks={exactly_one_callback:callbacks===1,input_unmutated:jh(copy)===beforeInput,profile_unmutated:jh(profile)===beforeProfile,original_liquidity_was_null:oldLiquidity===null,
  all_other_analysis_fields_exact_equal:JSON.stringify(before)===JSON.stringify(after),ready_stays_false:computed.ready===false,reasons_unchanged:JSON.stringify(computed.reasons)===JSON.stringify(a.reasons),plan_unchanged:JSON.stringify(computed.plan)===JSON.stringify(a.plan),card_stays_null:computed.card_text===null,manual_text_unchanged:computed.manual_text===a.manual_text,original_analysis_ts_preserved:computed.analysis_ts===input.analysis_ts,
  new_liquidity_present:newLiquidity!==null&&typeof newLiquidity==='object',liquidity_fact_bound:newLiquidity?.fact_id===input.facts.orderbook.fact_id,liquidity_source_clock_preserved:newLiquidity?.source_ts===input.facts.orderbook.event_ts,liquidity_snapshot_only:newLiquidity?.snapshot_only===true};
 need(Object.values(checks).every(Boolean),'AFFECTED_QUALIFICATION_FAILED_STOP');
 const receipt={schema:'AU_ONE_REAL_AUTO_LIQUIDITY_RETENTION_AFFECTED_V1',status:'PASS_EXPECTED_LIQUIDITY_ONLY_DELTA',callbacks,checks,original_analysis_sha256:jh(a),original_input_sha256:jh(input),new_analysis_sha256:jh(computed),new_liquidity_status:newLiquidity.status,new_liquidity_unit:newLiquidity.unit,source_provenance_present:true,profile_value_sha256:jh(START_PROFILE),pure_module_digests:digests,
  strategy_gates_thresholds_or_public_text_changed:false,runtime_SOURCE_provider_store_delivery_imports:0,native_HTTP_RPC_SQL_TG_Worker:0,old_AT_manuals_fixtures_suites_replayed:0,originals_overwritten:false,new_READY_SENT_or_profitability_proven:false,raw_prices_levels_or_input_exported:false};
 await save('affected-result.json',receipt);console.log(JSON.stringify({status:receipt.status,callbacks,checks,new_liquidity_status:newLiquidity.status,raw_export:false,native_HTTP_SQL_TG_Worker:0}));
}catch(error){const failure={schema:'AU_AFFECTED_FAILURE_V1',status:'STOP_NO_AUTOMATIC_RETRY',code:typeof error.code==='string'?error.code:'LOCAL_QUALIFICATION_FAILED',callbacks,native_HTTP_SQL_TG_Worker:0,raw_export:false};await save('affected-failure.json',failure);console.log(JSON.stringify(failure));process.exitCode=2;}
