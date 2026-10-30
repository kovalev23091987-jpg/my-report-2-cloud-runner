import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(v).digest('hex'),root=new URL('.',import.meta.url),file=p=>new URL(p,root);
const a=JSON.parse(fs.readFileSync(file('BZ62_OFFLINE_ACTUAL_ADMISSION_V1.json'),'utf8'));
const result={schema:'BZ62_ONE_AFFECTED_SOURCE_WINDOW_CASE_V1',status:'ATTEMPTED_NO_RETRY',Node_processes:1,connected_cases:1,engine_calls:0,builds:0,native_SQL:0,provider_HTTP:0,Cloudflare:0,Telegram:0,production_modified:false,vectors:[]};
const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
try{
  const now=Date.now(),authority=JSON.parse(fs.readFileSync(file('BZ62_OWN_AUTHORITY_FULL_V1.json'),'utf8'));
  assert.equal(a.status,'ADMITTED_NOT_SPENT');assert.equal(a.maximum_Node_processes,1);assert.equal(a.maximum_affected_cases,1);
  assert(now>=a.issued_ts&&now<a.expires_ts&&a.expires_ts<=a.own_lease.working_deadline_ts);
  assert.equal(authority.own_ref_sha,a.own_commit);assert.equal(authority.own_lease.owner,a.own_lease.owner);
  assert.equal(authority.own_lease.status,'ACTIVE');assert.equal(authority.parent_owner,a.own_lease.parent_root_owner);
  assert(authority.fresh_all17_all4_fence_generation===true&&now-authority.checked_ts<=60000);
  for(const [name,digest]of Object.entries(a.frozen_files))assert.equal(hash(fs.readFileSync(file(name))),digest,name);
  fs.writeFileSync(file('BZ62_ONCE.attempt.json'),JSON.stringify({started_ts:now,own_commit:a.own_commit,test_sha256:a.frozen_files['BZ62_QUALIFY_ONCE.mjs']}),{flag:'wx',mode:0o600});
  const [proposed,base,C,M,P]=await Promise.all([import('./stage/analytics/feature-capsule.proposed.mjs'),import('./stage/analytics/feature-capsule.base.mjs'),import('./stage/contracts/index.mjs'),import('./stage/analytics/math.mjs'),import('./stage/profile/start-v1.mjs')]);
  const profile=P.START_PROFILE,interval=60000,seedEnd=Date.UTC(2026,9,30,8),seedStart=seedEnd-300000,start=seedStart-3600000,currentEnd=seedEnd+600000;
  const seedNames=['current_to_impulse_volume_ratio','impulse_to_baseline_volume_ratio','impulse_volume_counter','baseline_median_volume_counter','impulse_return_pct','impulse_baseline_windows','impulse_baseline_status','normal_range'],seedSet=new Set(seedNames);
  const deepFreeze=o=>{if(o&&typeof o==='object'){Object.freeze(o);for(const value of Object.values(o))deepFreeze(value);}return o;};
  function fixture(kind='native'){
    const instrument={instrument_id:'BINGX:PERPETUAL:BZ62-USDT',asset_id:'CRYPTO:BZ62',native_symbol:'BZ62-USDT',base:'BZ62',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO',identity_evidence_ref:'fixture:identity'};
    const key=C.candleNativeComparisonKey(instrument),field=kind==='native'?'volume_native':kind==='base'?'volume_base':'turnover_quote',unit=kind==='native'?'UNKNOWN_NATIVE_UNIT':kind==='base'?'BASE':'USDT';
    const basis={field,unit,comparison_kind:kind==='native'?C.CANDLE_NATIVE_RELATIVE_KIND:'QUALIFIED_ABSOLUTE_SAME_FIELD',comparison_key:kind==='native'?key:null,interval_ms:interval};
    const rows=[];
    for(let t=start;t<currentEnd;t+=interval){
      const seed=t>=seedStart&&t<seedEnd,post=t>=seedEnd,vol=seed?100:post?20:10,open=100,close=seed?105:100;
      rows.push({open_ts:t,close_ts:t+interval,closed:true,open,high:Math.max(open,close)+2,low:98,close,
        volume_base:kind==='base'?vol:kind==='quote'?vol/2:null,turnover_quote:kind==='quote'?vol:null,
        ...(kind==='native'?{volume_native:vol,native_volume_decimal:String(vol),native_quantity_unit:'UNKNOWN',comparison_kind:C.CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key}:{}),
        native_time:t,native_time_semantics:'OPEN_TIME',time_evidence_ref:'fixture:time',volume_evidence_ref:'fixture:quantity'});
    }
    const at=currentEnd+2000,coverage={interval_ms:interval,time_qualified:true,time_evidence_ref:'fixture:time',window_start:start,window_end:currentEnd,available_start:start,available_end:currentEnd,complete:true,
      volume_qualified:kind!=='native',exact_turnover_available:kind==='quote',
      ...(kind==='native'?{relative_volume_qualified:true,time_basis:C.CANDLE_CCXT_TIME_BASIS,comparison_kind:C.CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key,native_quantity_unit:'UNKNOWN',base_volume_qualified:false,quote_volume_qualified:false,turnover_quote_qualified:false,absolute_base_amount_qualified:false,absolute_USD_amount_qualified:false}:{})};
    const fact=(name,value,unit)=>({fact_id:'fixture:'+name,instrument_id:instrument.instrument_id,kind:name,value,unit,source:'CONTROLLED_FIXTURE',venue:'BINGX',origin:'OBSERVED',status:'USABLE',event_ts:currentEnd,received_ts:currentEnd+1000,expires_ts:at+120000,evidence_ref:'fixture:evidence:'+name});
    const candles={...fact('candles',rows,kind==='native'?C.CANDLE_NATIVE_RELATIVE_UNIT:'OHLC_USDT_VOLUME_BASE'),coverage};
    const input={schema_version:C.INPUT_SCHEMA,run_id:'BZ62-CONTROLLED',mode:'MANUAL',run_purpose:'ACCEPTANCE_TEST',analysis_ts:at,instrument,facts:{price:fact('price',100,'USDT'),candles,orderbook:fact('orderbook',{bids:[],asks:[]},'USDT')},liquidations:C.emptyMap(),previous_wave:null};
    const zone=(lower,upper)=>({lower,upper,basis_fact_ids:[candles.fact_id,input.facts.orderbook.fact_id],basis_level:{kind:'CONTROLLED',price:lower,event_ts:seedEnd,known_ts:seedEnd,fact_id:candles.fact_id}});
    const impulse={...basis,start_ts:seedStart,end_ts:seedEnd,volume:500,baseline_median:50,ratio:10,baseline_windows:12,baseline_status:'FULL',normal_range:4,open:100,close:105,low:98,return_pct:M.pct(100,105)};
    const analysis={schema_version:C.ANALYSIS_SCHEMA,contract_version:C.CONTRACT_VERSION,ready:true,wave_id:'BZ62:WAVE',wave_state:'PULLBACK',reference_price:100,analysis_ts:at,run_id:input.run_id,mode:input.mode,run_purpose:input.run_purpose,instrument:structuredClone(instrument),profile_version:profile.version,rules_version:'CONTROLLED_UNEXECUTED_ENGINE',
      fact_ids:[input.facts.price.fact_id,candles.fact_id,input.facts.orderbook.fact_id],activity:{impulse,current_volume:100,current_to_impulse_volume_ratio:0.2,volume_basis:basis,candle_evidence_ref:candles.evidence_ref,
        candle_provenance:{event_ts:candles.event_ts,received_ts:candles.received_ts,source:candles.source,venue:candles.venue,coverage:structuredClone(coverage)},details:{activity_windows:[{window_ms:300000,start_ts:currentEnd-300000,end_ts:currentEnd}]}},
      liquidations:{map_mode:'WITHOUT_MAP',status:'NOT_CHECKED',zones_up:[],zones_down:[]},liquidity:{position_limit_usdt:100,spread_pct:0.1,sizes:[]},growth_windows:[],
      plan:{entry_zones:[zone(95,96)],exit_zone:zone(110,112),invalidation:{kind:'CONTROLLED',price:90},position_limit_usdt:100,potential_pct:{minimum:14,maximum:18,basis:'GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT'}}};
    return {analysis,input,card:{card_id:'CONTROLLED_SAVED_CARD',text:'CONTROLLED_UNSENT',state:'UNKNOWN',expires_ts:at+10000}};
  }
  function syncHeader(x){const f=x.input.facts.candles;x.analysis.activity.candle_provenance={event_ts:f.event_ts,received_ts:f.received_ts,source:f.source,venue:f.venue,coverage:structuredClone(f.coverage)};}
  async function run(name,kind,mutate=()=>{},expected='all_bound'){
    const x=fixture(kind);mutate(x);deepFreeze(x);const before=JSON.stringify(x),analysisHash=await proposed.capsuleDigest(x.analysis),inputHash=await proposed.capsuleDigest(x.input);
    const args={analysis:x.analysis,input:x.input,analysis_key:'pump:analysis:'+analysisHash,implementation_sha256:'a'.repeat(64),recorded_ts:x.analysis.analysis_ts+1,evidence_class:'ARTIFICIAL'};
    if(expected==='contract_reject'){
      await assert.rejects(proposed.prepareFeatureCapsule(args),/CROSS_INSTRUMENT_FACT/);assert.equal(JSON.stringify(x),before);
      result.vectors.push({name,status:'PASS',expected:'CONTRACT_REJECT_NO_BOUND_PROMOTION'});return;
    }
    const old=await base.prepareFeatureCapsule(args),out=await proposed.prepareFeatureCapsule(args),view=await proposed.readFeatureCapsule({capsule:out.capsule,sha256:out.sha256}),features=Object.fromEntries(view.features.map(f=>[f.name,f]));
    const expectedUnknown=expected==='all_unknown'?seedNames:expected==='ratio_unknown'?['current_to_impulse_volume_ratio']:[];
    for(const name of seedNames){const f=features[name];assert(f,name);
      if(expectedUnknown.includes(name)){assert.equal(f.bound,false,name);assert.equal(f.value,null,name);assert.equal(f.source_window_status,'UNKNOWN',name);assert.equal(typeof f.absence_reason,'string');}
      else{assert.equal(f.bound,true,name);assert.notEqual(f.value,null,name);assert.equal(f.source_window_status,'RECONFIRMED_SUPPLIED_CLOSED_ROWS',name);assert.deepEqual(f.value,old.capsule.features.find(z=>z.name===name).value);}
    }
    assert.deepEqual(out.capsule.features.filter(f=>!seedSet.has(f.name)),old.capsule.features.filter(f=>!seedSet.has(f.name)));
    assert.deepEqual(out.capsule.origin,old.capsule.origin);assert.deepEqual(out.capsule.plan,old.capsule.plan);assert.equal(out.capsule.original_plan_sha256,old.capsule.original_plan_sha256);
    assert.deepEqual(out.capsule.retention,old.capsule.retention);assert.equal(out.capsule.analysis_sha256,analysisHash);assert.equal(out.capsule.input_sha256,inputHash);
    assert.equal(out.capsule.origin.t0,x.analysis.analysis_ts);assert.equal(out.capsule.origin.reference_price,x.analysis.reference_price);
    assert.equal(JSON.stringify(x),before);assert.equal(out.capsule.external_provenance_authenticated,false);
    if(name==='old_seed_unread'){assert(seedNames.every(n=>old.capsule.features.find(f=>f.name===n).bound===true));result.original_header_only_defect_reproduced=true;}
    result.vectors.push({name,status:'PASS',unknown_features:expectedUnknown.length,originals_card_T0_P0_unchanged:true});
  }
  await run('full_native_exact','native');await run('full_base_exact','base');await run('full_quote_exact','quote');
  await run('old_seed_unread','native',x=>{x.input.facts.candles.value=x.input.facts.candles.value.filter(r=>r.open_ts>=currentEnd-300000);x.input.facts.candles.coverage.window_start=currentEnd-300000;syncHeader(x);},'all_unknown');
  await run('partial_baseline_gap','native',x=>{x.input.facts.candles.value=x.input.facts.candles.value.filter(r=>r.open_ts!==start+60000);x.input.facts.candles.status='INCOMPLETE';x.input.facts.candles.coverage.complete=false;syncHeader(x);},'all_unknown');
  for(const [name,mutate]of [
    ['foreign_comparison_instrument',x=>{const key='FOREIGN_INSTRUMENT';x.analysis.activity.volume_basis.comparison_key=key;x.analysis.activity.impulse.comparison_key=key;x.input.facts.candles.coverage.volume_comparison_key=key;syncHeader(x);}],
    ['foreign_fact_contract',x=>{x.input.facts.candles.instrument_id='FOREIGN';}],
    ['fact_id_mismatch',x=>{x.input.facts.candles.fact_id='fixture:wrong';}],
    ['evidence_mismatch',x=>{x.input.facts.candles.evidence_ref='fixture:wrong';}],
    ['source_clock_mismatch',x=>{x.analysis.activity.candle_provenance.event_ts--;}],
    ['future_received',x=>{x.input.facts.candles.received_ts=x.analysis.analysis_ts+1;syncHeader(x);}],
    ['event_older_than_seed',x=>{x.input.facts.candles.event_ts=seedStart;syncHeader(x);}],
    ['native_unit_mismatch',x=>{x.analysis.activity.volume_basis.unit='USDT';x.analysis.activity.impulse.unit='USDT';}],
    ['relative_qualification_missing',x=>{x.input.facts.candles.coverage.relative_volume_qualified=false;syncHeader(x);}],
    ['native_absolute_claim',x=>{x.input.facts.candles.coverage.absolute_USD_amount_qualified=true;syncHeader(x);}],
    ['row_time_proof_missing',x=>{x.input.facts.candles.value[0].time_evidence_ref=null;}],
    ['row_time_proof_mismatch',x=>{x.input.facts.candles.value[0].time_evidence_ref='fixture:wrong';}],
    ['row_volume_proof_missing',x=>{x.input.facts.candles.value[0].volume_evidence_ref=null;}],
    ['row_native_time_mismatch',x=>{x.input.facts.candles.value[0].native_time++;}],
    ['native_decimal_conflict',x=>{x.input.facts.candles.value[0].native_volume_decimal='999';}],
    ['conflicting_duplicate',x=>{x.input.facts.candles.value.push({...x.input.facts.candles.value[0],high:999});}],
    ['short_history',x=>{x.analysis.activity.impulse.baseline_status='SHORT_HISTORY';}],
    ['different_profile',x=>{x.analysis.profile_version='UNREVIEWED_PROFILE';}],
    ['row_overflow1441',x=>{while(x.input.facts.candles.value.length<1441)x.input.facts.candles.value.push({...x.input.facts.candles.value[0]});}]
  ])await run(name,'native',mutate,name==='foreign_fact_contract'?'contract_reject':'all_unknown');
  for(const key of ['volume','baseline_median','ratio','normal_range','return_pct','open','close','low','baseline_windows'])await run('saved_'+key+'_mismatch','native',x=>{x.analysis.activity.impulse[key]+=1;},'all_unknown');
  await run('current_range_mismatch','native',x=>{x.analysis.activity.details.activity_windows[0].end_ts-=60000;},'ratio_unknown');
  await run('current_numerator_mismatch','native',x=>{x.analysis.activity.current_volume+=1;},'ratio_unknown');
  Object.assign(result,{status:'PASS_CONTROLLED_NOT_NATIVE',vectors_passed:result.vectors.length,all_saved_scalars_T0_P0_plan_card_unchanged:true,all_non_seed_features_unchanged:true,base_sha256:a.base_sha256,proposed_sha256:a.proposed_sha256,one_Node_process_no_retries:true});
}catch(error){result.status='FAILED_PRESERVED_NO_RETRY';result.error=String(error.stack??error).slice(0,4000);process.exitCode=1;}
finally{globalThis.fetch=realFetch;result.completed_ts=Date.now();fs.writeFileSync(file('BZ62_CASE_RESULT_V1.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
console.log(JSON.stringify(result));
