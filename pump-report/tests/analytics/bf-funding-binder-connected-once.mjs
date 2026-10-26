// BF: exactly one ARTIFICIAL connected binder -> source -> existing context case.
// Do not import or execute before the precise ROOT admission and own CAS/FULL.
// No old parser/qualifier cases, no full analytics engine, no provider or native IO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=path.join(root,'pump-report/handoffs/analytics/package-bf');
const read=rel=>fs.readFileSync(path.join(root,rel));
const json=rel=>JSON.parse(read(rel).toString('utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
const report={schema:'BF_ONE_CONNECTED_ARTIFICIAL_CASE_ACTUAL_V1',status:'STARTED',
  fixture:'ARTIFICIAL_QUOTES_ONLY_WITH_REAL_REVIEWED_NATIVE_REGISTRY',
  case_count:1,node_invocations:1,source_getOptional_calls:0,existing_explainOptionalFacts_calls:0,
  fake_broker_attempts:0,real_HTTP:0,MCP:0,native_SQL:0,Telegram:0,Worker_deploy:0,
  full_analytics_engine_calls:0,qualifier_or_parser_called_directly:0,old_suite_replays:0};
let locked=false;
try{
  const lock=fs.openSync(path.join(dir,'EXECUTION_ONCE.lock'),'wx');
  locked=true;fs.writeFileSync(lock,'BF one execution entered; never rerun on failure\n');fs.closeSync(lock);
  const frozen=json('pump-report/handoffs/analytics/package-bf/frozen-inputs.json');
  const pre=json('pump-report/handoffs/analytics/package-bf/PREDECLARED_ONE_CASE.json');
  assert.equal(pre.status,'ONE_CASE_READY_NOT_EXECUTED');
  assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))),pre.test_sha256);
  assert.equal(sha(read('pump-report/handoffs/analytics/package-bf/frozen-inputs.json')),pre.frozen_inputs_sha256);
  for(const f of frozen.files){assert.equal(sha(read(f.path)),f.sha256,'FROZEN_INPUT_CHANGED:'+f.path);assert.equal(read(f.path).length,f.bytes);}
  const admission=json('checkpoints/pump-report-20261025/ROOT_BF_OFFLINE_CONNECTED_ADMISSION.json');
  assert.equal(sha(read('checkpoints/pump-report-20261025/ROOT_BF_OFFLINE_CONNECTED_ADMISSION.json')),pre.ROOT_admission_sha256);
  assert.equal(admission.status,'ADMITTED_EXACT_ONE_NEW_BINDER_CONSUMER_CASE');
  assert.equal(admission.limits.node_executions,1);assert.equal(admission.limits.new_cases,1);
  assert.equal(admission.limits.fake_broker_attempts,2);
  assert.ok(Date.now()<admission.expires_ts,'ROOT_OFFLINE_ADMISSION_EXPIRED');
  const guard=json('pump-report/handoffs/analytics/package-bf/affected-authority.json');
  assert.equal(guard.own_owner,pre.own_owner);assert.equal(guard.own_actual_ref_match,true);
  assert.equal(guard.own_exact_bytes_match,true);assert.ok(Date.now()<guard.own_expires_ts);
  assert.ok(Date.now()<guard.root_expires_ts);
  assert.equal(guard.all4_equal,true);assert.equal(guard.fence_active,false);assert.equal(guard.window_owner_paused,false);
  report.preimport_hashes_verified=frozen.files.length;
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [{BINGX_IDENTITY_REGISTRY:seeds},{createReviewedNativeScopeRegistry},
    {REVIEWED_ROWS},{withReviewedFundingQuoteRegistry,REVIEWED_FUNDING_QUOTE_PROFILE:profile},
    {createPumpSources,SOURCE_HTTP_PLAN},{explainOptionalFacts},{START_PROFILE},
    {ownerInstrumentExcluded}]=await Promise.all([
      load('pump-report/registry/index.mjs'),load('pump-report/registry/native-reviewed550.mjs'),
      load('pump-report/registry/native-reviewed550-data.mjs'),load('pump-report/registry/funding-quote-profile.mjs'),
      load('pump-report/sources/index.mjs'),load('pump-report/analytics/context.mjs'),
      load('pump-report/profile/start-v1.mjs'),load('pump-report/contracts/index.mjs')
    ]);
  const handoffProfile=json('pump-report/handoffs/sources/F593_F588_COMPATIBLE_CONSUMER_FUNDING_PROFILE_V1.json').candidate_profile;
  assert.deepEqual(profile,handoffProfile);
  const seedSnapshot=structuredClone(seeds),base=createReviewedNativeScopeRegistry(seeds);
  const beforeSummary=base.summary(),beforeInstruments=structuredClone(base.instruments);
  const registry=withReviewedFundingQuoteRegistry(base);
  assert.equal(registry.summary,base.summary,'SUMMARY_FUNCTION_OR_CLOSURE_REPLACED');
  assert.equal(registry.resolveCatalogDecision,base.resolveCatalogDecision,'NEGATIVE_RESOLVER_FUNCTION_OR_CLOSURE_DROPPED');
  assert.deepEqual(registry.summary(),beforeSummary);
  assert.deepEqual(base.instruments,beforeInstruments);
  const removeFunding=raw=>{const c=structuredClone(raw);if(c.qualifications)delete c.qualifications.funding;return c;};
  for(let n=0;n<seeds.length;n++){
    const old=beforeInstruments[n],next=registry.instruments[n];
    assert.deepEqual(removeFunding(next),removeFunding(old));
    assert.deepEqual(next.instrument,old.instrument);
    assert.equal(Boolean(next.qualifications.funding),!ownerInstrumentExcluded(next.instrument));
    if(!ownerInstrumentExcluded(next.instrument))assert.deepEqual(next.qualifications.funding,handoffProfile);
  }
  const identities=[...seeds.map(e=>({id:e.instrument.instrument_id,symbol:e.instrument.native_symbol,seed:true})),
    ...REVIEWED_ROWS.map(([id,base,symbol])=>({id:'BINGX:USDT_M:'+id+':'+symbol,symbol,seed:false}))];
  assert.equal(identities.length,552);assert.equal(new Set(identities.map(x=>x.id)).size,552);
  let selected=0,selectedSeeds=0,selectedLazy=0;const excluded=[],bound=[];
  for(const def of identities){
    const query={instrument_id:def.id,native_symbol:def.symbol,family:'USDT_M'};
    const old=base.resolve(query),next=registry.resolve(query);
    assert.ok(old&&next,'RESOLVER_ENTRY_MISSING:'+def.symbol);
    assert.deepEqual(removeFunding(next),removeFunding(old),'NON_FUNDING_REGISTRY_FIELDS_CHANGED:'+def.symbol);
    assert.equal(old.qualifications.funding,undefined,'BASE_REGISTRY_MUTATED:'+def.symbol);
    if(ownerInstrumentExcluded(next.instrument)){
      assert.equal(next.qualifications.funding,undefined);excluded.push(next.instrument.base);
    }else{
      selected++;if(def.seed)selectedSeeds++;else selectedLazy++;
      assert.deepEqual(next.qualifications.funding,handoffProfile,'PROFILE_MISSING_OR_DIFFERS:'+def.symbol);
      assert.equal(next.qualifications.funding.unit_proof_parts.unified_fraction.status,'VERIFIED');
      bound.push({instrument_id:next.instrument.instrument_id,path:def.seed?'SEED13':'LAZY539',
        profile_evidence_ref:next.qualifications.funding.evidence_ref});
    }
  }
  assert.equal(selected,550);assert.equal(selectedSeeds,11);assert.equal(selectedLazy,539);
  assert.deepEqual(excluded.sort(),['BTC','ETH']);assert.deepEqual(seeds,seedSnapshot);
  assert.deepEqual(base.summary(),beforeSummary);assert.deepEqual(registry.summary(),beforeSummary);
  report.registry_binding={all_native_identities_resolved:552,selected_profile_bindings:550,
    selected_seed_bindings:selectedSeeds,selected_lazy_bindings:selectedLazy,excluded,
    identical_profile:true,base_registry_unchanged:true,other_entry_fields_unchanged:true,
    resolveCatalogDecision_same_function:true,summary_same_function_and_value:true,
    qualification_class:'OFFLINE_BINDING_ONLY_NOT_550_HTTP_COVERAGE',
    binding_inventory_sha256:sha(Buffer.from(JSON.stringify(bound)))};
  save('registry-bindings-result.json',{...report.registry_binding,bindings:bound});
  const worker=read('pump-report/runtime/worker.mjs').toString('utf8');
  const runner=read('pump-report/runtime/runner.mjs').toString('utf8');
  assert.ok(worker.includes('withReviewedFundingQuoteRegistry(createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY))'));
  const optionalAt=runner.indexOf("sources.getOptional({instrument,run_id,mode,facts:core.facts,deadline_ts,requested_kinds:['trades','funding']})");
  assert.ok(optionalAt>runner.indexOf('if(analysis.ready){'));
  assert.equal(SOURCE_HTTP_PLAN.optional_total_max,2);assert.equal(SOURCE_HTTP_PLAN.automatic_retries,0);
  assert.equal(START_PROFILE.optional_http_upper_bound,2);
  const entry=registry.resolve({native_symbol:'DOOD-USDT'});
  assert.ok(entry);assert.ok(!seeds.some(e=>e.instrument.instrument_id===entry.instrument.instrument_id),'CASE_MUST_EXERCISE_REAL_LAZY_RESOLVER');
  const instrument=entry.instrument,T=1793016000000,quoteTs=T-1000,receiveTs=T-100;
  const calls=[];
  const sources=createPumpSources({identityRegistry:registry,clock:()=>T,broker:{
    async request(req){
      calls.push(req);report.fake_broker_attempts=calls.length;
      assert.ok(calls.length<=2,'FAKE_BROKER_LIMIT_EXCEEDED');
      assert.equal(req.provider,'BINGX');assert.equal(req.family,'USDT_M');assert.equal(req.method,'GET');
      assert.equal(req.candidate_id,instrument.instrument_id);
      const url=new URL(req.url);assert.equal(url.searchParams.get('symbol'),instrument.native_symbol);
      let data;
      if(url.pathname==='/openApi/swap/v2/quote/trades')data={code:0,data:[
        {symbol:instrument.native_symbol,fillId:'593001',price:'2',quoteQty:'12.00',time:T-200,isBuyerMaker:false}]};
      else if(url.pathname==='/openApi/swap/v2/quote/premiumIndex')data={code:0,data:{
        symbol:instrument.native_symbol,lastFundingRate:'-0.0100',fundingIntervalHours:'2',
        updateTime:quoteTs,nextFundingTime:T+7200000}};
      else throw Error('UNEXPECTED_FAKE_ROUTE:'+url.pathname);
      return {ok:true,status:200,data,received_ts:receiveTs,receipt_id:'ARTIFICIAL_BF_RECEIPT_'+calls.length,cache_hit:false};
    }
  }});
  report.source_getOptional_calls++;
  const result=await sources.getOptional({instrument,deadline_ts:T+5000,requested_kinds:['trades','funding']});
  save('source-result.json',{evidence_class:'ARTIFICIAL',instrument_id:instrument.instrument_id,
    synthetic_analysis_ts:T,result,calls:calls.map(r=>({provider:r.provider,family:r.family,method:r.method,
      route:new URL(r.url).pathname,symbol:new URL(r.url).searchParams.get('symbol'),candidate_id:r.candidate_id}))});
  report.existing_explainOptionalFacts_calls++;
  const context=explainOptionalFacts(result.facts,T,START_PROFILE);
  save('consumer-result.json',{evidence_class:'ARTIFICIAL',context});
  assert.equal(calls.length,2);
  assert.deepEqual(calls.map(r=>new URL(r.url).pathname),['/openApi/swap/v2/quote/trades','/openApi/swap/v2/quote/premiumIndex']);
  assert.equal(result.facts.open_interest.status,'NOT_CHECKED');
  assert.equal(result.facts.open_interest.reason,'OPTIONAL_KIND_NOT_REQUESTED');
  assert.equal(result.facts.trades.status,'USABLE');
  const f=result.facts.funding;
  assert.equal(f.instrument_id,instrument.instrument_id);assert.equal(f.status,'USABLE');
  assert.equal(f.unit,'RATE_FRACTION_PER_ACTUAL_PERIOD');assert.equal(f.value.rate,-0.01);
  assert.equal(f.native_value_decimal,'-0.0100');assert.equal(f.value.period_ms,7200000);
  assert.equal(f.event_ts,quoteTs);assert.equal(f.native_rate_quote_update_ts,quoteTs);
  assert.equal(f.received_ts,receiveTs);assert.equal(f.expires_ts,quoteTs+START_PROFILE.freshness_ms.funding);
  assert.notEqual(f.event_ts,f.received_ts);assert.notEqual(f.event_ts,f.value.next_funding_ts);
  assert.equal(f.value.next_funding_ts,T+7200000);
  assert.equal(f.value.rate_snapshot_ts,quoteTs);assert.equal(f.clock_semantics,'RATE_QUOTE_SNAPSHOT');
  assert.equal(f.funding_payment_event_ts,null);assert.equal(f.value.funding_payment_event_ts,null);
  assert.equal(f.coverage.funding_payment_event_ts,null);assert.equal(f.coverage.rate_event_clock_proven,false);
  assert.equal(f.native_metadata_update_ts,null);assert.equal(f.unit_qualification_basis,'ADAPTER_BASED_INFERENCE');
  assert.equal(f.coverage.vendor_unit_guarantee_claimed,false);assert.equal(f.coverage.vendor_quote_clock_guarantee_claimed,false);
  const finding=context.findings.find(x=>x.code==='FUNDING_SNAPSHOT');
  assert.ok(finding,'FUNDING_FINDING_MISSING');assert.ok(finding.text.includes(': -1% за 2 ч;'),finding.text);
  assert.deepEqual(finding.fact_ids,[f.fact_id]);assert.ok(context.fact_ids.includes(f.fact_id));
  assert.deepEqual(context.optional_context.funding.value,{rate:-0.01,period_ms:7200000});
  assert.equal(context.optional_context.funding.event_ts,quoteTs);assert.equal(context.optional_context.funding.received_ts,receiveTs);
  assert.equal(context.optional_context.funding.origin,'OBSERVED');
  assert.equal(context.optional_context.open_interest,undefined);
  assert.equal(report.source_getOptional_calls,1);assert.equal(report.existing_explainOptionalFacts_calls,1);
  report.funding={instrument_id:instrument.instrument_id,status:f.status,rate:f.value.rate,
    period_ms:f.value.period_ms,event_ts:f.event_ts,received_ts:f.received_ts,
    payment_event_ts:f.funding_payment_event_ts,unit_qualification_basis:f.unit_qualification_basis,
    finding_text: finding.text,fact_id:f.fact_id};
  report.fake_routes=calls.map(r=>new URL(r.url).pathname);report.OI_attempts=0;
  report.static_hooks={worker_bound_factory:true,runner_trades_funding_pair:true,existing_ready_gate:true,optional_upper2:true};
  report.status='PASS';save('affected-result.json',report);
  process.stdout.write(JSON.stringify({status:report.status,case_count:1,source_getOptional:1,existing_context:1,
    fake_broker_attempts:2,funding_percent:-1,actual_period_hours:2,payment_event_ts:null,
    offline_selected_bindings:550,native:0})+'\n');
}catch(error){
  if(locked)save('affected-failure.json',{...report,status:'FAIL_NO_RERUN_AUTHORIZED',
    error:{name:error.name,message:error.message,stack:String(error.stack).split('\n').slice(0,10).join('\n')}});
  process.stderr.write(String(error.stack)+'\n');process.exitCode=1;
}
