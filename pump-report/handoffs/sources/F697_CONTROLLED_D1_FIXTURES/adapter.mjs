// PROPOSED, UNEXECUTED. No provider/native/TG connections. ROOT supplies modulesRoot.
import {openControlledD1} from './controlled-sqlite.mjs';
import {verifyConcurrentAndUnknown as verifyFaults} from './faults.mjs';
export {openControlledD1};
export const PUBLIC_FACTORY_SHA256='b8f48cac69d813a3ba025cf364145b96db4d7449914f5ba119ad9bb89c898fed';
export const F697_RUN_IDS=Object.freeze(['F697-AUTO-SENT','F697-AUTO-SAVED-REPAIR','F697-AUTO-UNSENT','F697-MANUAL']);
let current=Date.parse('2026-10-30T09:00:02Z'),context=null;
export const clock=()=>current;
clock.advance=ms=>{if(!Number.isSafeInteger(ms)||ms<0||ms>120000||current+ms>Date.parse('2026-10-30T09:14:00Z'))throw Error('F697_BOUNDED_CLOCK_ADVANCE_REQUIRED');current+=ms;return current;};
clock.set=at=>{if(!Number.isSafeInteger(at)||at<current||at>Date.parse('2026-10-30T09:14:00Z'))throw Error('F697_FORWARD_BOUNDED_CLOCK_REQUIRED');current=at;return current;};

export async function createF697Adapter({modulesRoot}={}) {
  if(context)throw Error('F697_ONE_ADAPTER_PER_CONNECTED_CASE');
  const {pathToFileURL}=await import('node:url'),{resolve}=await import('node:path');
  const root=modulesRoot instanceof URL?new URL(modulesRoot.href.endsWith('/')?modulesRoot.href:modulesRoot.href+'/'):
    pathToFileURL(resolve(modulesRoot)+'/');
  const load=p=>import(new URL(p,root).href);
  const [contracts,provider,production,profile,budget]=await Promise.all([
    'contracts/index.mjs','runtime/provider-policy.mjs','runtime/production-policy.mjs','profile/start-v1.mjs','runtime/budget.mjs'
  ].map(load));
  // The pin is computed over the actual supplied implementation, not a placeholder.
  const {readdir,readFile}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
  const files=[];
  async function walk(relative){for(const entry of (await readdir(new URL(relative,root),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const p=relative+entry.name;if(entry.isDirectory())await walk(p+'/');else if(entry.isFile()&&p.endsWith('.mjs'))files.push(p);
  }}
  for(const directory of ['analytics/','contracts/','profile/','runtime/','sources/'])await walk(directory);
  const hash=createHash('sha256'),implementation_files=[];
  for(const p of files.sort()){const bytes=await readFile(new URL(p,root));hash.update(p+'\0');hash.update(bytes);hash.update('\0');
    implementation_files.push({path:p,sha256:createHash('sha256').update(bytes).digest('hex')});}
  context={root,load,contracts,provider,production,profile:profile.START_PROFILE,budget,
    implementation_sha256:hash.digest('hex'),implementation_files};
  return {modulesRoot:root,openControlledD1,buildFixtures,clock,verifyConcurrentAndUnknown};
}

// Public accepted factory's OHLC/base-volume shape, rebased and identity-separated.
// Native row evidence describes only artificial fixtures, never real market proof.
function fixtureInput({instrument,run_id,mode='AUTO',at=clock(),end=Math.floor(at/60000)*60000}) {
  const {contracts:C,profile}=context,tail=[102,105,110,115,117,118,117.5,116,115,109,110,111,112,113,114];
  const rows=[];let previous=100;
  for(let i=0;i<121;i++){
    const close=i<106?100+2*Math.sin(i*Math.PI/5):tail[i-106],open=previous,open_ts=end-(121-i)*60000;
    rows.push({open_ts,close_ts:open_ts+60000,closed:true,open,high:Math.max(open,close)+0.1,low:Math.min(open,close)-0.1,close,
      volume_base:i>=106?3000:1000,turnover_quote:null,native_time:open_ts,native_time_semantics:'OPEN_TIME',
      time_evidence_ref:'CONTROLLED:F697:EXACT_CLOSED_MINUTE',volume_evidence_ref:'CONTROLLED:F697:BASE_VOLUME_NOT_TURNOVER'});previous=close;
  }
  const fact=(kind,value,unit,event_ts=at,receipt='CONTROLLED:F697:PUBLIC_FACTORY')=>C.createFact({
    fact_id:'CONTROLLED:F697:'+instrument.instrument_id+':'+kind+':'+event_ts+':'+receipt,
    instrument_id:instrument.instrument_id,asset_id:instrument.asset_id,market_type:'PERPETUAL',quote:'USDT',settle:'USDT',kind,value,unit,
    event_ts,received_ts:at,expires_ts:event_ts+profile.freshness_ms[kind],source:'ARTIFICIAL_FIXTURE',primary_provider:'ARTIFICIAL_FIXTURE',
    venue:'BINGX',status:'USABLE',origin:'OBSERVED',evidence_ref:receipt,identity_evidence_ref:instrument.identity_evidence_ref,
    coverage:kind==='candles'?{complete:true,window_start:rows[0].open_ts,window_end:end,interval_ms:60000,
      time_qualified:true,volume_qualified:true,scope:'CONTROLLED_121_CLOSED_MINUTES_NOT_FULL_4H_SEARCH'}:{scope:'CONTROLLED_ARTIFICIAL_ONLY'}});
  return {schema_version:C.INPUT_SCHEMA,run_id,mode,run_purpose:'PRODUCTION',analysis_ts:at,instrument:structuredClone(instrument),previous_wave:null,
    liquidations:C.emptyMap('ABSENT','CONTROLLED_F697_NO_FUTURE_MAP'),facts:{
      price:fact('price',114,'USDT_PER_BASE'),candles:fact('candles',rows,'OHLC_USDT_VOLUME_BASE',end),
      orderbook:fact('orderbook',{asks:[[114.1,1000],[114.2,1000]],bids:[[113.9,1000],[113.8,1000]]},'USDT_PRICE_BASE_QUANTITY')}};
}

function resourcesFixture(now,version) {
  const day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7),old=now-120000;
  const grant=(state,run_id)=>({version:'pump-unassigned-candidate-hold-v1',run_id,candidate_id:'CONTROLLED:LEGACY',day,state,created_ts:old,
    original_http:2,remaining_http:1,consumed_http:1,original_by_provider:{BINGX:2},remaining_by_provider:{BINGX:1},consumed_by_provider:{BINGX:1},
    logical_spent:true,native_expires_ts:old+60000,hold_until_ts:Date.parse(day+'T00:00:00Z')+86400000,
    native_evidence_ref:'CONTROLLED:F697:RETAINED_HOLD',activation_decision_ref:'CONTROLLED:F697:RETAINED_HOLD'});
  return {schema:'PUMP_SHARED_RESOURCE_V1',days:{[day]:25},providers:{
    BINGX:{days:{[day]:24},months:{[month]:24},recent:[],qualification_totals:{[version]:24}},
    TELEGRAM:{days:{[day]:1},months:{[month]:1},recent:[],qualification_totals:{[version]:1}}},outstanding:{},
    unknown:{'CONTROLLED:F697:OLD_UNKNOWN':{run_id:'CONTROLLED:OLD',provider:'BINGX',cost:1,ts:old,family:'USDT_M',purpose:'CORE',run_purpose:'ACCEPTANCE_TEST'}},
    automatic_surplus_grants:{'CONTROLLED:CLOSED|CONTROLLED:LEGACY':grant('CLOSED','CONTROLLED:CLOSED'),
      'CONTROLLED:UNKNOWN|CONTROLLED:LEGACY':grant('UNKNOWN','CONTROLLED:UNKNOWN')},
    fixture_only:true,accounting_evidence:'SYNTHETIC_RETAINED_SPENDS_UNKNOWN_CLOSED_HOLDS_NOT_PRIVATE_ACTUAL_LEDGER'};
}

export async function buildFixtures({analytics,now=clock(),db}={}) {
  if(!context||!db?.seed||!analytics?.analyzePump)throw Error('F697_CONFIGURED_SQLITE_ANALYTICS_REQUIRED');
  const assert=(await import('node:assert/strict')).default,C=context.contracts;
  const instruments=['F697SENT','F697UNSENT','F697MANUAL'].map(base=>({
    instrument_id:'ARTIFICIAL:BINGX:'+base+'-USDT',asset_id:'ARTIFICIAL:'+base,native_symbol:base+'-USDT',base,
    quote:'USDT',settle:'USDT',venue:'BINGX',market_type:'PERPETUAL',classification_status:'VERIFIED_CRYPTO',
    identity_evidence_ref:'CONTROLLED:F697:PUBLIC_FACTORY_IDENTITY:'+base,native_contract_id:'CONTROLLED:'+base,
    price_tick:0.01,quantity_step:0.000001,contract_multiplier:1}));
  const policies=context.production.productionPolicies(context.provider.PROVIDER_POLICIES);
  assert.equal(policies.BINGX.project_daily_cap,900);assert.equal(policies.BINGX.project_monthly_cap,27900);
  assert.equal(policies.TELEGRAM.project_daily_cap,47);assert.equal(policies.TELEGRAM.project_monthly_cap,1457);
  assert.equal(policies.BINGX.qualification_attempt_cap,undefined);assert.equal(context.profile.manual_checks_daily_reserve,3);
  const provider_admission=context.production.productionAdmission({evidence_ref:'CONTROLLED:F697:NOT_PRODUCTION_IO_ADMISSION',expires_ts:now+900000},
    context.provider.PROVIDER_POLICY_VERSION,{mode:'AUTO'});
  const initial_resources=resourcesFixture(now,context.provider.PROVIDER_POLICY_VERSION);
  db.seed('pump:resources',initial_resources,now);
  const initial_native_ledger=[
    {reservation_id:'CONTROLLED:F697:LEGACY_FINALIZED',day_utc:new Date(now).toISOString().slice(0,10),reserve_rows_read:100,
      reserve_rows_written:5,state:'FINALIZED',started_ts:now-120000,measured_rows_read:100,measured_rows_written:5,measured_requests:2,
      unknown_ops:0,source_run_id:'CONTROLLED:F697:LEGACY',completed_ts:now-119000},
    {reservation_id:'CONTROLLED:F697:LEGACY_UNKNOWN_PREVIOUS_DAY',day_utc:new Date(now-86400000).toISOString().slice(0,10),reserve_rows_read:5000,
      reserve_rows_written:300,state:'RESERVED',started_ts:now-86400000,unknown_ops:1}
  ];
  for(const row of initial_native_ledger)db.seedLedger(row);
  context.retained={initial_resources:structuredClone(initial_resources),initial_native_ledger:structuredClone(initial_native_ledger)};
  const input=fixtureInput({instrument:instruments[0],run_id:F697_RUN_IDS[0],at:now});
  // This assertion executes only in ROOT's admitted case, never during preparation.
  const actual=analytics.analyzePump(input,context.profile);
  assert.equal(actual.ready,true,JSON.stringify(actual.reasons));assert.equal(actual.automatic_eligible,true);
  const runContexts=new Map(),source_traces=[];let previousIndex=-1;
  function inputForRun(run_id) {
    const index=F697_RUN_IDS.indexOf(run_id);if(index<0)throw Error('F697_EXACT_FOUR_RUN_IDS_REQUIRED');
    if(runContexts.has(run_id))return structuredClone(runContexts.get(run_id));
    if(index!==previousIndex+1)throw Error('F697_RUN_SEQUENCE_REQUIRED');
    if(index>0)clock.advance(61000);previousIndex=index;
    const instrument=instruments[index===2?1:index===3?2:0];
    const selected={instrument:structuredClone(instrument),input:fixtureInput({instrument,run_id,mode:index===3?'MANUAL':'AUTO'})};
    runContexts.set(run_id,selected);return structuredClone(selected);
  }
  function assess_source_evidence(instrument) {
    const entry=instruments.find(i=>i.instrument_id===instrument?.instrument_id);
    const keys=['asset_id','native_symbol','base','quote','settle','venue','market_type','classification_status','identity_evidence_ref'];
    const eligible=!!entry&&keys.every(k=>entry[k]===instrument[k]);
    return {eligible,reason:eligible?'CONTROLLED_PUBLIC_FACTORY_IDENTITY_AND_UNITS_BOUND':'CONTROLLED_IDENTITY_MISMATCH',
      evidence_ref:eligible?entry.identity_evidence_ref:null,controlled_only:true,real_source_qualification:false};
  }
  function makeSources({input:selected,instrument,run_id,clock:sourceClock=clock,emptyCatalog=false,store,budget,guard}={}) {
    if(!store?.atomic||!budget?.reserve||!guard?.projection_budget)throw Error('F697_ROOT_MUST_PASS_ACTUAL_STORE_BUDGET_GUARD');
    if(!assess_source_evidence(instrument).eligible||selected.run_id!==run_id)throw Error('F697_SELECTED_IDENTITY_REQUIRED');
    const trace={run_id,attempts:[],cache_results:[],optional_attempts:0};source_traces.push(trace);
    const endpoint={catalog:'/openApi/swap/v2/quote/contracts',overview:'/openApi/swap/v2/quote/ticker',day:'/openApi/swap/v3/quote/klines',
      price:'/openApi/swap/v1/ticker/price',candles:'/openApi/swap/v3/quote/klines',orderbook:'/openApi/swap/v2/quote/depth',
      trades:'/openApi/swap/v2/quote/trades',funding:'/openApi/swap/v2/quote/premiumIndex'};
    const broker=context.budget.createRequestBroker({budget,store,clock:sourceClock,sleep_impl:async ms=>{clock.advance(ms);},
      fetch_impl:async url=>{
        const u=new URL(url);if(u.hostname!=='open-api.bingx.com'||!Object.values(endpoint).includes(u.pathname))throw Error('F697_UNEXPECTED_MOCK_ROUTE');
        trace.attempts.push({url,ts:sourceClock()});if(trace.attempts.length>10)throw Error('F697_BINGX_TEN_ATTEMPT_BOUND');
        return new Response(JSON.stringify({code:0,msg:'',data:{controlled:true,instrument_id:instrument.instrument_id}}),
          {status:200,headers:{'content-type':'application/json'}});
      }});
    async function request(kind,{purpose='CORE',force=false,discovery=false,deadline_ts=null}={}) {
      // Wait on the real provider-window forecast; the reserve still decides.
      await broker.awaitProviderWindow({provider:'BINGX',cost:1,deadline_ts:sourceClock()+60001});
      const url=new URL('https://open-api.bingx.com'+endpoint[kind]);
      if(!discovery){url.searchParams.set('symbol',instrument.native_symbol);if(kind==='day'||kind==='candles')url.searchParams.set('window',kind);}
      const response=await broker.request({provider:'BINGX',family:'USDT_M',purpose,
        cache_key:'F697:'+kind+':'+(discovery?'BULK':instrument.instrument_id),url:url.href,
        candidate_id:discovery?null:instrument.instrument_id,ttl_ms:force?0:30000,timeout_ms:10000,deadline_ts});
      assert.equal(response.ok,true);assert.equal(response.semantic_status,'SUCCESS');
      trace.cache_results.push({kind,cache_hit:response.cache_hit===true,receipt_id:response.receipt_id});return response;
    }
    const refresh=(at=sourceClock())=>fixtureInput({instrument,run_id,mode:selected.mode,at,end:selected.facts.candles.value.at(-1).close_ts});
    return {
      async getCatalog({purpose='CORE'}={}){
        if(emptyCatalog)return {instruments:[],coverage:{status:'USABLE',controlled_saved_empty_catalog:true}};
        await request('catalog',{purpose,discovery:true});return {instruments:[structuredClone(instrument)],coverage:{status:'USABLE',total:1,qualified:1,controlled_only:true}};
      },
      async getOverview({purpose='CORE',instruments:requested=[instrument]}={}){
        if(emptyCatalog||!requested.length)return {observations:[],coverage:{status:'USABLE',controlled_saved_empty_catalog:true}};
        // Same actual broker cache key/URL as discovery. CORE reuses its fresh
        // bulk quote without an eleventh cold request; no normalized clock rebirth.
        const receipt=await request('overview',{purpose,discovery:true});
        return {observations:requested.map(i=>{assert.equal(i.instrument_id,instrument.instrument_id);const price=refresh(receipt.received_ts).facts.price;
          price.evidence_ref=receipt.receipt_id;price.fact_id+=':'+receipt.receipt_id;return {instrument:structuredClone(i),facts:{price},
          reported_change_pct:25,reported_change_basis:'CONTROLLED_DISCOVERY_HINT_NOT_CORE_GROWTH_PROOF'};}),coverage:{status:'USABLE',controlled_only:true}};
      },
      async getDayGrowth(){await request('day');return {facts:{},coverage:{status:'ABSENT',reason:'PUBLIC_FACTORY_HAS_EXACT_SHORT_WINDOWS_NO_FULL_24H'}};},
      async getCore({only_facts=['price','candles','orderbook'],force_refresh=false,purpose='CORE'}={}){
        const facts={};for(const kind of only_facts){const receipt=await request(kind,{purpose,force:force_refresh});
          const fresh=refresh(receipt.received_ts).facts[kind];facts[kind]={...fresh,evidence_ref:receipt.receipt_id,fact_id:fresh.fact_id+':'+receipt.receipt_id};}
        return {facts,coverage:{status:'USABLE',controlled_only:true,normalizer_requalification:false}};
      },
      async getOptional({deadline_ts=null}={}){
        for(const kind of ['trades','funding']){trace.optional_attempts++;assert(trace.optional_attempts<=2);await request(kind,{deadline_ts});}
        return {facts:{},coverage:{status:'ABSENT',reason:'CONTROLLED_OPTIONAL_ROUTES_ACCOUNTED_NO_FABRICATED_ENRICHMENT'}};
      },
      async getLiquidations(){return C.emptyMap('ABSENT','CONTROLLED_NO_ADMITTED_FUTURE_MAP');},
      async getOutcomeHistory(){throw Error('F697_NO_MARKET_OUTCOME_SYNTHESIS_IN_SOURCE_CASE');},
      getCoverage:()=>({status:'CONTROLLED',instrument_id:instrument.instrument_id}),
      controlledTrace:()=>structuredClone(trace)
    };
  }
  return {input,instrument:instruments[0],policies,protected_reserves:structuredClone(context.provider.PROTECTED_HTTP),provider_admission,
    profile:context.profile,initial_resources:structuredClone(initial_resources),initial_native_ledger:structuredClone(initial_native_ledger),inputForRun,makeSources,assess_source_evidence,
    run_ids:[...F697_RUN_IDS],recipient:'F697_CONTROLLED_RECIPIENT',manual_symbol:'F697MANUAL',manual_request_id:'F697-MANUAL-REQUEST-ONE',
    implementation_sha256:context.implementation_sha256,implementation_files:context.implementation_files,
    public_factory_sha256:PUBLIC_FACTORY_SHA256,verifyConcurrentAndUnknown,
    controlledSourceSnapshot:()=>structuredClone(source_traces),controlledDB:db};
}

export async function verifyConcurrentAndUnknown(options={}) {
  if(!context)throw Error('F697_ADAPTER_CONFIGURATION_REQUIRED');
  const assert=(await import('node:assert/strict')).default;
  const state=options.db.peek('pump:resources'),initial=context.retained.initial_resources;
  for(const [day,cost] of Object.entries(initial.days))assert(state.days[day]>=cost);
  for(const [provider,saved] of Object.entries(initial.providers)){
    assert.deepEqual(state.providers[provider].qualification_totals,saved.qualification_totals);
    for(const [day,cost] of Object.entries(saved.days))assert(state.providers[provider].days[day]>=cost);
    for(const [month,cost] of Object.entries(saved.months))assert(state.providers[provider].months[month]>=cost);
  }
  for(const [key,value] of Object.entries(initial.unknown))assert.deepEqual(state.unknown[key],value);
  for(const [key,value] of Object.entries(initial.automatic_surplus_grants))assert.deepEqual(state.automatic_surplus_grants[key],value);
  for(const saved of context.retained.initial_native_ledger){
    const row=options.db.inspect('SELECT * FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1',[saved.reservation_id])[0];
    for(const [key,value] of Object.entries(saved))assert.equal(row[key],value);
  }
  const faults=await verifyFaults({...options,load:context.load});
  return {...faults,retained_state_verified:true,main_sqlite_counters:options.db.counters()};
}
