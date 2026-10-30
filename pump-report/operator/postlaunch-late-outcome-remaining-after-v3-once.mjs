import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex'),a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(a.status,'ADMITTED_ONE_REMAINING_AFTER_OFFLINE_CASE_V3');
assert(Date.now()<a.expires_ts&&a.expires_ts<=a.own_lease.expires_ts);
assert.equal(sha(fs.readFileSync(process.argv[1])),a.script_sha256);
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8'));assert.equal(phase.lease.owner,a.own_lease.owner);assert.notEqual(phase.lease.released,true);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const beforeBytes=fs.readFileSync(a.base_artifact_file),afterBytes=fs.readFileSync(a.previously_built_artifact_file);
assert.equal(sha(beforeBytes),a.base_artifact_sha256);assert.equal(sha(afterBytes),a.previously_built_artifact_sha256);
const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);assert.equal(after.manifest.module_count,78);assert.equal(after.manifest.implementation_pin.sha256,a.previously_built_pin);
fs.mkdirSync(a.output_dir,{recursive:true,mode:0o700});const attempt=path.join(a.output_dir,'attempt.json'),fd=fs.openSync(attempt,'wx',0o600);
const proof={schema:'ROOT_POSTLAUNCH_LATE_OUTCOME_REMAINING_AFTER_CASE_V3',state:'ATTEMPTED',authority_main:a.authority_main,evidence_class:'ARTIFICIAL_OFFLINE_ACCEPTANCE_TEST',Node:1,build:0,analyzePump_calls:0,evaluateOutcome_calls:0,late_history_comparisons:0,closed_candidate_guards:0,mock_source_fetches:0,market_HTTP:0,Telegram:0,native_SQL:0,Cloudflare:0,deployed:false,accepted_diagnostic10_runner1_projection9_replayed:false};
const save=()=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(proof,null,2)+'\n',0,'utf8');fs.fsyncSync(fd);};save();
const realFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('REAL_HTTP_FORBIDDEN');};
try{
  const trees={};
  for(const [label,art]of Object.entries({before,after})){
    const dir=path.join(a.existing_snapshot_dir,label);
    for(const [name,text]of Object.entries(art.modules))assert.equal(sha(fs.readFileSync(path.join(dir,name))),sha(text),label+'/'+name);
    const read=n=>import(pathToFileURL(path.join(dir,n)));
    trees[label]={...(await read('runtime/budget.mjs')),...(await read('runtime/store.mjs')),...(await read('runtime/production-policy.mjs')),...(await read('runtime/runner.mjs')),...(await read('contracts/index.mjs')),...(await read('sources/index.mjs')),...(await read('sources/native-relative-qualification.mjs')),...(await read('analytics/outcome.mjs')),...(await read('runtime/outcome-journal.mjs')),...(await read('runtime/saved-outcome.mjs')),...(await read('profile/start-v1.mjs'))};
  }
  let now=Date.parse('2026-10-29T12:30:00Z'),day='2026-10-29',period=Date.parse('2026-10-29T12:00:00Z');const id='00000000-0000-4000-8000-000000000001',candidate='BINGX:USDT_M:123:TEST-USDT';
  const policy={version:'pump-unassigned-candidate-hold-v1',enabled:true,activation_decision_ref:'ARTIFICIAL_EXISTING_APPROVAL',max_grants_per_day:24,max_grants_per_run:1,max_retained_records:200,native_remaining_floor:{requests:600,rows_read:600,rows_written:140}};
  const strip=v=>Array.isArray(v)?v.map(strip):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([k])=>k!=='surplus_limit').map(([k,w])=>[k,strip(w)])):v;
  const grantsFor=c=>{const grants={};for(let i=0;i<c.total;i++){
    const today=i<c.today,run=c.sameRun&&i===0?id:'other-'+i,coin=c.existing&&i===0?candidate:'BINGX:USDT_M:'+(1000+i)+':OTHER'+i+'-USDT',d=today?day:'2026-10-28',created=today?now-60000:Date.parse(d+'T12:00:00Z');
    grants[run+'|'+coin]={version:policy.version,run_id:run,candidate_id:coin,day:d,state:c.existing&&i===0?c.existing:'CLOSED',created_ts:created,original_http:12,remaining_http:11,consumed_http:1,
      original_by_provider:{BINGX:10,TELEGRAM:1},remaining_by_provider:{BINGX:9,TELEGRAM:1},consumed_by_provider:{BINGX:1,TELEGRAM:0},logical_spent:true,activation_decision_ref:policy.activation_decision_ref,native_evidence_ref:'ARTIFICIAL#PUMP:AUTO:'+run,native_expires_ts:created+900000,hold_until_ts:Date.parse(d+'T00:00:00Z')+86400000,closed_ts:created+1,unused_hold_retained_until:Date.parse(d+'T00:00:00Z')+86400000};
  }return grants;};
  async function fixture(t,c){
    const store=new t.MemoryStore(),counts={get:0,atomic:0};const get=store.get.bind(store),atomic=store.atomic.bind(store);
    store.get=async k=>{counts.get++;return get(k);};store.atomic=async(k,fn)=>{counts.atomic++;return atomic(k,fn);};
    const state={schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:0,'2026-10-28':50},providers:{BINGX:{recent:[],days:{[day]:0,'2026-10-28':50},months:{'2026-10':50}},TELEGRAM:{recent:[],days:{[day]:0},months:{'2026-10':0}}},outstanding:{},unknown:{OLD_UNKNOWN:{cost:1}},automatic_surplus_grants:grantsFor(c),
      automatic_plans:{[day]:{schema:'PUMP_PLANNED_AUTOMATIC_DAY_V1',day,created_ts:now,baseline_charged:0,protected_at_creation:102,fraction:0.8,limit:638,charged:0}},
      automatic_candidate_allocations:{[day]:{version:'pump-even-day-deep-v2',created_ts:now,first_period:String(period),remaining_periods:(Date.parse(day+'T17:00:00Z')-period)/3600000,http_upper_bound:12,http_by_provider:{BINGX:10,TELEGRAM:1},candidates_per_period:3,baseline_auto_charged:0}},
      automatic_deep_pacing:{[day]:{[String(period)]:{version:'pump-even-day-deep-v2',day,key:String(period),created_ts:now,limit:36,charged:0,candidate_count:c.baseAvailable?0:3,carried_in:0,maximum:3,issued_before:0}}}};
    await store.set('pump:resources',state);
    store.admission={evidence_ref:'ARTIFICIAL#PUMP:AUTO:'+id,expires_ts:now+840000,max_requests:800,max_rows_read:5000,max_rows_written:300};
    store.finalization_reserve={requests:2,rows_read:2,rows_written:1};store.usage=()=>({requests:c.lowNative?300:0,rows_read:0,rows_written:0,unknown_ops:0});
    const policies={BINGX:{allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/v3/quote/klines'],version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1},TELEGRAM:{version:'ARTIFICIAL',evidence_ref:'ARTIFICIAL',project_daily_cap:47,project_monthly_cap:1457,per_minute_cap:10,delivery_source:false,outcome_source:false}};
    const admission={provider_policy_version:'ARTIFICIAL',expires_ts:now+900000,run_purpose:'PRODUCTION',strict_automatic_window:true,planned_load_fraction:0.8,candidate_pacing:t.PRODUCTION_PLAN.candidate_pacing,future_candidates:t.PRODUCTION_PLAN.future_candidates,candidate_surplus:policy};
    const budget=t.createUnifiedBudget({store,run_id:id,mode:'AUTO',clock:()=>now,policies,protected_reserves:{http_by_provider:{BINGX:54,TELEGRAM:0},delivery_http:24,outcomes_http:24},admission});
    counts.get=0;counts.atomic=0;return{store,budget,counts,state};
  }

  const instrument={instrument_id:candidate,asset_id:'BINGX_UNDERLYING:TEST',native_symbol:'TEST-USDT',base:'TEST',venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO'};
  const manifest=after.manifest;
  // One actual producer→broker→fixed original journal→runner outcome→saved view
  // counterexample, using only ARTIFICIAL in-memory production-shaped fixtures.
  // OBSERVED/PRODUCTION fields below exercise those gates; this file and every
  // exported result remain ARTIFICIAL and are never native delivery evidence.
  now=Date.parse('2026-10-30T07:00:00Z');day='2026-10-30';period=now;
  const t0=Date.parse('2026-10-29T16:07:00Z'),deadline=t0+14400000,lateResults={};
  for(const [label,t]of Object.entries({after:trees.after})){
    const f=await fixture(t,{total:58,today:0}),grant=await f.budget.admitCandidate({candidate_id:candidate,http_upper_bound:12,http_by_provider:{BINGX:10,TELEGRAM:1}});
    assert.equal(grant.allowed,true);assert(grant.surplus_grant_id);
    await f.budget.closeCandidate({candidate_id:candidate,surplus_grant_id:grant.surplus_grant_id});
    const closedBefore=await f.store.get('pump:resources'),held=structuredClone(closedBefore.automatic_surplus_grants[grant.surplus_grant_id]);
    assert.equal(held.state,'CLOSED');
    let sourceFetches=0;const seen=[],i={...instrument,margin:'USDT',identity_evidence_ref:'ARTIFICIAL_INDEPENDENT_IDENTITY'};
    const q=t.createNativeRelativeCandleQualification(i);
    const broker=t.createRequestBroker({budget:f.budget,store:f.store,clock:()=>now,fetch_impl:async(url)=>{
      sourceFetches++;const u=new URL(url);seen.push({start:Number(u.searchParams.get('startTime')),end:Number(u.searchParams.get('endTime'))});
      assert.equal(u.hostname,'open-api.bingx.com');assert.equal(u.pathname,'/openApi/swap/v3/quote/klines');
      assert.equal(seen.at(-1).start,t0);assert.equal(seen.at(-1).end,deadline);
      const wire=Array.from({length:241},(_,n)=>({time:t0+n*60000,open:'100',high:String(n===60?111:n===240?150:101),low:'99',close:'100',volume:'1'}));
      return Response.json({code:0,data:wire});
    }});
    const sources=t.createPumpSources({broker,identityRegistry:[{instrument:i,native_contract_id:'123',family:'USDT_M',qualifications:{candles:q},liquidations:{routes:[]}}],clock:()=>now,profile:t.START_PROFILE});
    f.budget.setMode('STATISTICS');
    const history=await sources.getOutcomeHistory({instrument:i,start_ts:t0,end_ts:deadline});
    proof.history_attempts??=[];proof.history_attempts.push({label,mock_fetches:sourceFetches,status:history.facts?.candles?.status??null,reason:history.facts?.candles?.reason??null,coverage_reason:history.coverage?.reason??null});save();
    assert.equal(sourceFetches,label==='before'?0:1);
    if(label==='after'){assert.equal(history.coverage.complete,true);assert.equal(history.coverage.start_ts,t0);assert.equal(history.coverage.end_ts,deadline);assert.equal(history.facts.candles.expires_ts,null);assert.equal(t.factUsable(history.facts.candles,now),false);}
    const kernel=(args)=>{proof.evaluateOutcome_calls++;return t.evaluateOutcome(args);};
    let journalClock=t0+1;
    const original={schema_version:'PUMP_REPORT_ANALYSIS_V1',instrument:i,run_id:id,mode:'AUTO',run_purpose:'PRODUCTION',analysis_ts:t0,reference_price:100,wave_id:'ARTIFICIAL_EVENING_WAVE',wave_state:'BREAKOUT',next_wave:{expires_ts:t0+3600000},
      ready:true,rules_version:'pump-analytics-v8-post-breach-20261029',profile_version:t.START_PROFILE.version,liquidations:{map_mode:'WITHOUT_MAP'},fact_ids:['ARTIFICIAL_ORIGINAL_PRICE'],
      plan:{entry_zones:[{lower:94,upper:95}],exit_zone:{lower:110,upper:111},invalidation:{kind:'PRICE_BELOW',price:90}}};
    const originalInput={instrument:i,run_id:id,mode:'AUTO',run_purpose:'PRODUCTION',analysis_ts:t0,facts:{price:t.createFact({fact_id:'ARTIFICIAL_ORIGINAL_PRICE',instrument_id:candidate,kind:'price',value:100,unit:'USDT_PER_BASE',event_ts:t0,received_ts:t0,expires_ts:t0+30000,source:'ARTIFICIAL',status:'USABLE'})}};
    const analysisKey='pump:analysis:'+sha(JSON.stringify(original)),savedOriginal={analysis:original,input:originalInput,saved_ts:t0+1,implementation_sha256:label==='before'?a.base_pin:manifest.implementation_pin.sha256,evidence_class:'OBSERVED'};
    await f.store.set(analysisKey,savedOriginal);const frozenOriginal=JSON.stringify(savedOriginal);
    const journal=t.createOutcomeJournal({store:f.store,profile:t.START_PROFILE,clock:()=>journalClock,evidence_class:'OBSERVED'});
    await journal.remember(original,originalInput,analysisKey);
    const cardId='PUMP:'+sha('ARTIFICIAL_EVENING_CARD');
    await f.store.set('pump:card:'+cardId,{card_id:cardId,state:'SENT',analysis:{...original,source_input_key:analysisKey},message_id:'987',receipt:{confirmed_ts:t0+2},updated_ts:t0+2,created_ts:t0+1});
    journalClock=t0+3;await journal.publication(cardId);
    const signalId='pump:signal:'+candidate+':'+original.wave_id,sig=await f.store.get(signalId);assert(sig);assert.equal(sig.t0,t0);assert.equal(sig.deadline_ts,deadline);assert.equal(sig.reference_price,100);
    await f.store.set('pump:wave:'+candidate,{wave_id:'ARTIFICIAL_DIFFERENT_CURRENT_WAVE',state:'EXPIRED',created_ts:now-7200000,expires_ts:now-3600000});
    const runner=t.createPumpRunner({store:f.store,sources,analyzePump:()=>{throw Error('LATE_HISTORY_MUST_NOT_ANALYZE');},evaluateOutcome:kernel,budget:f.budget,delivery:{},clock:()=>now,evidence_class:'OBSERVED',run_purpose:'PRODUCTION'});
    const outcomes=await runner.checkOutcomes({run_id:id});assert.equal(outcomes.length,1);assert.equal(outcomes[0].status,label==='before'?'UNKNOWN':'HIT');
    assert.equal(sourceFetches,label==='before'?0:1);assert.equal(JSON.stringify(await f.store.get(analysisKey)),frozenOriginal);
    const view=await t.readSavedOutcome({store:f.store,analysis_key:analysisKey,clock:()=>now});
    assert.equal(view.status,'RESULT',JSON.stringify({status:view.status,reason:view.reason}));assert.equal(view.outcome.status,label==='before'?'UNKNOWN':'HIT');assert.equal(view.outcome.t0,t0);assert.equal(view.outcome.deadline_ts,deadline);assert.equal(view.outcome.target_price,110);
    const after=await f.store.get('pump:resources');assert.deepEqual(after.automatic_surplus_grants,closedBefore.automatic_surplus_grants);assert.deepEqual(after.unknown,closedBefore.unknown);assert.equal(after.days['2026-10-28'],closedBefore.days['2026-10-28']);
    assert.equal(after.days[day],closedBefore.days[day]+sourceFetches);assert.equal(f.budget.summary().lanes.statistics,sourceFetches);
    if(label==='after'){
      const guardCases=[['AUTO','BINGX','USDT_M','CORE','hot'],['MANUAL','BINGX','USDT_M','CORE','hot'],['STATISTICS','BINGX','USDT_M','CORE','hot'],['STATISTICS','TELEGRAM','USDT_M','CORE','statistics'],['STATISTICS','BINGX','LIQUIDATIONS','CORE','statistics'],['STATISTICS','BINGX','USDT_M','DELIVERY','statistics']];
      for(const [mode,provider,family,purpose,lane]of guardCases){f.budget.setMode(mode);await assert.rejects(f.budget.reserve({provider,family,purpose,lane,candidate_id:candidate,request_id:'ARTIFICIAL_DENY_'+mode+provider+family+purpose+lane}),e=>e.code==='SURPLUS_CANDIDATE_ALREADY_CLOSED');proof.closed_candidate_guards++;}
      f.budget.setMode('STATISTICS');const prior=now;now=Date.parse('2026-10-30T17:01:00Z');await assert.rejects(f.budget.reserve({provider:'BINGX',family:'USDT_M',purpose:'CORE',lane:'statistics',candidate_id:candidate,request_id:'ARTIFICIAL_NIGHT_DENY'}),e=>e.code==='BUDGET_AUTOMATIC_WINDOW_CLOSED');now=prior;proof.closed_candidate_guards++;
      now+=1001;
      await f.store.atomic('pump:resources',state=>{state.days[day]=899;state.providers.BINGX.days[day]=899;return {state,result:true};});
      const protectedBefore=JSON.stringify(await f.store.get('pump:resources'));await assert.rejects(f.budget.reserve({provider:'BINGX',family:'USDT_M',purpose:'CORE',lane:'statistics',candidate_id:candidate,request_id:'ARTIFICIAL_DAY_RESERVE_DENY'}),e=>e.code==='PROTECTED_DAY_RESERVE');assert.equal(JSON.stringify(await f.store.get('pump:resources')),protectedBefore);proof.closed_candidate_guards++;
      const noInWindowHit=history.facts.candles.value.map(r=>({...r,high:101}));noInWindowHit.push({open_ts:deadline,close_ts:deadline+60000,open:100,high:150,low:99,close:100,closed:true});
      const lateOnly=kernel({signal:sig,candles:noInWindowHit,price_points:[],as_of_ts:now});assert.equal(lateOnly.status,'MISS');assert.equal(lateOnly.deadline_ts,deadline);
      const missing=kernel({signal:sig,candles:[],price_points:[],as_of_ts:now});assert.equal(missing.status,'UNKNOWN');assert.equal(missing.deadline_ts,deadline);
    }
    lateResults[label]={status:view.outcome.status,source_mock_fetches:sourceFetches,original_T0:t0,deadline,target:view.outcome.target_price,old_original_unchanged:true,old_wave_reference_preserved:true,CLOSED_grant_and_hold_unchanged:true,statistics_HTTP_charged:sourceFetches};
    proof.mock_source_fetches+=sourceFetches;proof.late_history_comparisons++;save();
  }
  proof.late_history_recovery={before_from_prior_case:{path:'checkpoints/pump-report-20261025/ROOT_POSTLAUNCH_LATE_OUTCOME_REMAINING_CASE_V2.json',completed_comparisons:1,status:'UNKNOWN',basis:'Prior case reached completed before comparison and saved RESULT assertions before after-fixture failure; not replayed'},after:lateResults.after,fixtureSENT987_is_ARTIFICIAL_not_native_production_proof:true};
  assert.equal(proof.closed_candidate_guards,8);assert.equal(proof.evaluateOutcome_calls,3);assert.equal(proof.mock_source_fetches,1);


  proof.state='PASS';proof.finished_ts=Date.now();proof.qualified_artifact_sha256=a.previously_built_artifact_sha256;proof.qualified_pin=a.previously_built_pin;save();fs.writeFileSync(a.result_file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});
}catch(error){proof.state='FAILED_NO_AUTO_RETRY';proof.error=String(error.stack??error).slice(0,3500);proof.finished_ts=Date.now();save();fs.writeFileSync(a.result_file,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});process.exitCode=1;}
finally{globalThis.fetch=realFetch;fs.closeSync(fd);}
console.log(JSON.stringify(proof));
