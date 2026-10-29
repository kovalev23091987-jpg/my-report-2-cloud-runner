// One coordinator-owned budget. Adapters receive only its request broker.
import {automaticWindowOpen} from '../contracts/index.mjs';
import {responseDisposition,temporaryDelay,SOURCE_ERROR_PROFILE} from './source-error-policy.mjs';
import {futureDiscoveryHttp} from './discovery-reserve.mjs';
import {futureCandidateReserve,utcBudgetPeriodEnd} from './future-candidate-reserve.mjs';
import {admittedReadOnlyJSONPost} from './read-only-json-post.mjs';
import {textHash} from './text-hash.mjs';
import {surplusPolicy,surplusGrantKey,surplusGrants,surplusHeld,surplusBaseExtra,surplusNativeCapacity,makeSurplusGrant} from './candidate-surplus.mjs';
export const RESOURCE_LIMITS = Object.freeze({http_per_run:164,project_http_day:900,lanes:{hot:96,background:56,statistics:12},deep_per_candidate:50,liquidations_per_run:8,manual_http_run_reserve:24,d1_reads_day:3500000,d1_writes_day:70000,next_full_reads:59000,next_full_writes:920});
const integer = n => Number.isSafeInteger(n) && n >= 0;
export class BudgetRefusal extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
export const utcDay = ts => new Date(ts).toISOString().slice(0,10);
export const utcMonth = ts => new Date(ts).toISOString().slice(0,7);
const inc = (map,key,n=1) => {map[key]=(map[key]??0)+n;};

export function createUnifiedBudget({store,run_id,mode,clock=Date.now,policies,limits=RESOURCE_LIMITS,protected_reserves,admission}) {
  if (!store?.atomic || !run_id || !['AUTO','MANUAL','STATISTICS'].includes(mode)) throw new BudgetRefusal('BUDGET_CONTEXT_REQUIRED');
  const run={total:0,lanes:{hot:0,background:0,statistics:0},liquidations:0,candidates:{},unknown:0,receipts:[]};
  let activeSurplus=null;
  const closedSurplusCandidates=new Set();
  function automaticPlan(state,now){
    if(admission?.run_purpose!=='PRODUCTION'||admission.planned_load_fraction===undefined)return null;
    const fraction=admission.planned_load_fraction;
    if(!Number.isFinite(fraction)||fraction<=0||fraction>1)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'INVALID_PLANNED_LOAD'});
    const day=utcDay(now),saved=state.automatic_plans?.[day];
    if(saved){if(!integer(saved.charged)||!integer(saved.limit)||!integer(saved.baseline_charged)||saved.fraction!==fraction||(state.days[day]??0)<saved.baseline_charged+saved.charged)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'AUTOMATIC_PLAN_STATE_UNQUALIFIED'});return saved;}
    const protectedTotal=Object.values(protected_reserves.http_by_provider).reduce((a,b)=>a+b,0)+protected_reserves.delivery_http+protected_reserves.outcomes_http;
    const baseline=state.days?.[day]??0;
    return {schema:'PUMP_PLANNED_AUTOMATIC_DAY_V1',day,created_ts:now,baseline_charged:baseline,
      protected_at_creation:protectedTotal,fraction,limit:Math.floor(Math.max(0,limits.project_http_day-protectedTotal-baseline)*fraction),charged:0};
  }
  function candidatePacing(state,now,plan,discovery){
    const config=admission.candidate_pacing;
    if(mode!=='AUTO'||!config)return null;
    if(!plan||config.version!=='pump-even-day-deep-v2'||config.period_ms!==3600000||config.start_hour!==10||config.end_hour!==20||config.time_zone!=='Europe/Moscow')throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'CANDIDATE_PACING_POLICY_UNQUALIFIED'});
    const day=utcDay(now),key=String(Math.floor(now/config.period_ms)*config.period_ms);
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:config.time_zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now),part=type=>Number(parts.find(p=>p.type===type).value);
    const inDay=part('hour')*3600000+part('minute')*60000+part('second')*1000+now%1000;
    const end=now-inDay+config.end_hour*3600000,periods=Math.max(1,Math.ceil((end-now)/config.period_ms));
    const upper=admission.future_candidates?.http_per_slot,providerCosts=admission.future_candidates?.http_by_provider;
    if(!integer(upper)||upper<1||!providerCosts)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'CANDIDATE_PACING_COST_UNQUALIFIED'});
    let allocation=state.automatic_candidate_allocations?.[day];
    if(allocation){
      if(allocation.version!==config.version||allocation.http_upper_bound!==upper||JSON.stringify(allocation.http_by_provider)!==JSON.stringify(providerCosts)||!integer(allocation.candidates_per_period)||!integer(allocation.remaining_periods)||allocation.remaining_periods<1||allocation.remaining_periods>10||!integer(Number(allocation.first_period))||Number(allocation.first_period)>Number(key)||Number(allocation.first_period)+allocation.remaining_periods*config.period_ms!==end)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'CANDIDATE_ALLOCATION_STATE_UNQUALIFIED'});
    }else{
      const fixed=Object.values(protected_reserves.http_by_provider).reduce((a,b)=>a+b,0)+protected_reserves.delivery_http+protected_reserves.outcomes_http;
      let count=Math.floor(Math.max(0,Math.min(plan.limit-plan.charged-discovery,limits.project_http_day-(state.days[day]??0)-fixed-discovery))/(periods*upper));
      for(const [provider,cost]of Object.entries(providerCosts)){
        if(!integer(cost)||cost<1)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'CANDIDATE_PACING_PROVIDER_COST_UNQUALIFIED'});
        const policy=providerPolicy(provider),p=state.providers?.[provider]??{},reserve=protected_reserves.http_by_provider[provider]+(policy.delivery_source===false?0:protected_reserves.delivery_http)+(policy.outcome_source===false?0:protected_reserves.outcomes_http),later=provider===admission.discovery?.provider?discovery:0;
        count=Math.min(count,Math.floor(Math.max(0,policy.project_daily_cap-(p.days?.[day]??0)-reserve-later)/(periods*cost)),Math.floor(Math.max(0,policy.project_monthly_cap-(p.months?.[utcMonth(now)]??0)-reserve-later)/(periods*cost)));
      }
      allocation={version:config.version,created_ts:now,first_period:key,remaining_periods:periods,http_upper_bound:upper,http_by_provider:{...providerCosts},candidates_per_period:automaticWindowOpen(now)?count:0,baseline_auto_charged:plan.charged};
    }
    const first=Number(allocation.first_period),base=allocation.candidates_per_period,elapsed=(Number(key)-first)/config.period_ms;
    if(!integer(elapsed)||elapsed>=allocation.remaining_periods)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'CANDIDATE_ALLOCATION_CLOCK_UNQUALIFIED'});
    let issuedBefore=0;
    const buckets=Object.entries(state.automatic_deep_pacing?.[day]??{}).sort(([a],[b])=>Number(a)-Number(b));
    for(const [period,bucket]of buckets){
      const index=(Number(period)-first)/config.period_ms;
      if(!integer(index)||index>elapsed||bucket.version!==config.version||!integer(bucket.limit)||!integer(bucket.charged)||!integer(bucket.candidate_count)||issuedBefore+bucket.candidate_count>base*(index+1))throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'CANDIDATE_PACING_STATE_UNQUALIFIED'});
      if(period!==key)issuedBefore+=bucket.candidate_count;
    }
    const saved=state.automatic_deep_pacing?.[day]?.[key],maximum=base*(elapsed+1)-issuedBefore;
    // Places accrue even when discovery finds no candidates. Only unused places
    // from elapsed hours carry forward; future hours and spent attempts stay held.
    return {version:config.version,day,key,created_ts:saved?.created_ts??now,limit:maximum*upper,charged:saved?.charged??0,candidate_count:saved?.candidate_count??0,allocation,carried_in:maximum-base,maximum,issued_before:issuedBefore};
  }
  const assertWorkWindow=()=>{if(admission?.strict_automatic_window===true&&mode!=='MANUAL'&&!automaticWindowOpen(clock()))throw new BudgetRefusal('BUDGET_AUTOMATIC_WINDOW_CLOSED');};
  const providerPolicy = provider => {
    if(Array.isArray(admission?.allowed_providers)&&!admission.allowed_providers.includes(provider))throw new BudgetRefusal('PROVIDER_NOT_IN_RUN_ADMISSION');
    const policy=policies?.[provider],now=clock();
    if (!policy || !admission?.provider_policy_version || admission.provider_policy_version!==policy.version || !Number.isSafeInteger(admission.expires_ts) || admission.expires_ts<=now || !policy.evidence_ref || !integer(policy.project_daily_cap) || !integer(policy.project_monthly_cap) || !integer(policy.per_minute_cap)) throw new BudgetRefusal('PROVIDER_ADMISSION_REQUIRED',{provider});
    return policy;
  };
  async function reserve({provider,family='CORE',purpose='CORE',candidate_id=null,lane=mode==='STATISTICS'?'statistics':'hot',request_id,cost=1}) {
    assertWorkWindow();
    if(candidate_id&&closedSurplusCandidates.has(candidate_id))throw new BudgetRefusal('SURPLUS_CANDIDATE_ALREADY_CLOSED');
    const policy=providerPolicy(provider),now=clock();
    if(!request_id||!integer(cost)||cost<1||!Object.hasOwn(run.lanes,lane)||!['CORE','DELIVERY','DISCOVERY'].includes(purpose))throw new BudgetRefusal('INVALID_HTTP_RESERVATION');
    if(admission.max_http_attempts!==undefined&&(!integer(admission.max_http_attempts)||admission.max_http_attempts<1||admission.max_http_attempts>limits.http_per_run||run.total+cost>admission.max_http_attempts))throw new BudgetRefusal('EXACT_OPERATION_HTTP_EXHAUSTED');
    if(purpose==='DISCOVERY'&&(provider!=='BINGX'||family!=='USDT_M'||candidate_id!==null))throw new BudgetRefusal('INVALID_DISCOVERY_SCOPE');
    if(run.total+cost>limits.http_per_run||run.lanes[lane]+cost>limits.lanes[lane])throw new BudgetRefusal('RUN_HTTP_EXHAUSTED');
    if(mode==='AUTO'&&lane==='hot'&&run.lanes.hot+cost+limits.manual_http_run_reserve>limits.lanes.hot)throw new BudgetRefusal('RUN_MANUAL_RESERVE_PROTECTED');
    if(family==='LIQUIDATIONS'&&run.liquidations+cost>limits.liquidations_per_run)throw new BudgetRefusal('MAP_BUDGET_EXHAUSTED');
    if(candidate_id&&(run.candidates[candidate_id]??0)+cost>limits.deep_per_candidate)throw new BudgetRefusal('CANDIDATE_HTTP_EXHAUSTED');
    const protectedHttp=protected_reserves?.http_by_provider?.[provider];
    if(!integer(protectedHttp)||!integer(protected_reserves?.delivery_http)||!integer(protected_reserves?.outcomes_http))throw new BudgetRefusal('PROTECTED_RESERVES_NOT_MEASURED');
    const manualProtection=mode==='MANUAL'?0:protectedHttp;
    const deliveryProtection=family==='DELIVERY'||purpose==='DELIVERY'?0:protected_reserves.delivery_http;
    const outcomesProtection=mode==='STATISTICS'?0:protected_reserves.outcomes_http;
    const futureDiscovery=futureDiscoveryHttp(now,admission.discovery,{until_ts:utcBudgetPeriodEnd(now,'DAY')});
    const futureDiscoveryMonth=futureDiscoveryHttp(now,admission.discovery,{until_ts:utcBudgetPeriodEnd(now,'MONTH')});
    const futureCandidates=futureCandidateReserve(now,admission.future_candidates);
    const futureCandidatesMonth=futureCandidateReserve(now,admission.future_candidates,{period:'MONTH'});
    // Hold the in-process run envelope before awaiting the durable provider CAS.
    // Concurrent different-provider requests cannot oversubscribe a run.
    run.total+=cost;run.lanes[lane]+=cost;if(family==='LIQUIDATIONS')run.liquidations+=cost;if(candidate_id)inc(run.candidates,candidate_id,cost);
    let row;
    try {row=await store.atomic('pump:resources',state=>{
      state??={schema:'PUMP_SHARED_RESOURCE_V1',days:{},providers:{},outstanding:{},unknown:{}};
      if(state.outstanding[request_id]||state.unknown[request_id])throw new BudgetRefusal('REQUEST_ALREADY_RESERVED');
      const p=state.providers[provider]??={days:{},months:{},recent:[]};
      const day=utcDay(now),month=utcMonth(now),spent=p.days[day]??0,monthSpent=p.months[month]??0;
      let conversion=null;
      if(activeSurplus&&mode==='AUTO'&&purpose!=='DISCOVERY'){
        const grant=surplusGrants(state)[activeSurplus];
        if(!grant||grant.run_id!==run_id||grant.state!=='OPEN')throw new BudgetRefusal('SURPLUS_GRANT_NOT_OWNED');
        if(candidate_id!==null&&candidate_id!==grant.candidate_id)throw new BudgetRefusal('SURPLUS_CANDIDATE_SCOPE_MISMATCH');
        conversion={grant_id:activeSurplus,provider,cost};
      }
      const held=surplusHeld(state,now,{consume:conversion});
      const baseExtra=surplusBaseExtra(state,now,admission);
      p.recent=p.recent.filter(r=>r.ts>now-60000);
      if(integer(policy.per_second_cap)&&p.recent.filter(r=>r.ts>now-1000).reduce((n,r)=>n+r.cost,0)+cost>policy.per_second_cap)throw new BudgetRefusal('PROVIDER_SECOND_EXHAUSTED');
      if(p.recent.reduce((n,r)=>n+r.cost,0)+cost>policy.per_minute_cap)throw new BudgetRefusal('PROVIDER_MINUTE_EXHAUSTED');
      if(integer(policy.qualification_attempt_cap)&&(p.qualification_totals?.[policy.version]??0)+cost>policy.qualification_attempt_cap)throw new BudgetRefusal('QUALIFICATION_ATTEMPTS_EXHAUSTED');
      const providerOutcomesProtection=policy.outcome_source===false?0:outcomesProtection;
      const providerDeliveryProtection=policy.delivery_source===false?0:deliveryProtection;
      if(spent+cost+(held.provider_day[provider]??0)+(baseExtra.http_by_provider[provider]??0)+manualProtection+providerDeliveryProtection+providerOutcomesProtection+(provider===admission.discovery?.provider?futureDiscovery:0)+(futureCandidates.http_by_provider[provider]??0)>policy.project_daily_cap)throw new BudgetRefusal('PROTECTED_DAY_RESERVE');
      const globalManual=mode==='MANUAL'&&admission.run_purpose!=='ACCEPTANCE_TEST'?0:Object.values(protected_reserves.http_by_provider).reduce((sum,n)=>sum+n,0);
      if((state.days[day]??0)+cost+held.http+baseExtra.http+globalManual+deliveryProtection+outcomesProtection+futureDiscovery+futureCandidates.http>limits.project_http_day)throw new BudgetRefusal('PROTECTED_DAY_RESERVE');
      if(monthSpent+cost+(held.provider_month[provider]??0)+(baseExtra.http_by_provider[provider]??0)+manualProtection+providerDeliveryProtection+providerOutcomesProtection+(provider===admission.discovery?.provider?futureDiscoveryMonth:0)+(futureCandidatesMonth.http_by_provider[provider]??0)>policy.project_monthly_cap)throw new BudgetRefusal('PROVIDER_MONTH_EXHAUSTED');
      if((p.backoff_until??0)>now)throw new BudgetRefusal('PROVIDER_BACKOFF');
      const plan=mode==='AUTO'?automaticPlan(state,now):null;
      if(plan&&(purpose==='DISCOVERY'||held.http>0||baseExtra.http>0||conversion)&&plan.charged+cost+held.http+baseExtra.http+futureDiscovery+futureCandidates.http>plan.limit)throw new BudgetRefusal('PROTECTED_DAY_RESERVE',{reason:'PLANNED_AUTO_ALLOCATION_AND_FUTURE_WORK'});
      const pacing=!conversion&&mode==='AUTO'&&(purpose==='DISCOVERY'||purpose==='CORE')?candidatePacing(state,now,plan,futureDiscovery):null;
      inc(state.days,day,cost);inc(p.days,day,cost);inc(p.months,month,cost);p.recent.push({ts:now,cost});
      if(plan){state.automatic_plans??={};plan.charged+=cost;state.automatic_plans[day]=plan;}
      if(pacing){state.automatic_candidate_allocations??={};state.automatic_candidate_allocations[day]??=pacing.allocation;if(purpose==='CORE'){const {allocation,...bucket}=pacing;state.automatic_deep_pacing??={};state.automatic_deep_pacing[day]??={};state.automatic_deep_pacing[day][pacing.key]={...bucket,charged:pacing.charged+cost};}}
      if(integer(policy.qualification_attempt_cap)){p.qualification_totals??={};inc(p.qualification_totals,policy.version,cost);}
      if(conversion){const g=state.automatic_surplus_grants[conversion.grant_id];g.remaining_http-=cost;g.remaining_by_provider[provider]-=cost;g.consumed_http+=cost;g.consumed_by_provider[provider]+=cost;}
      const grantRef=conversion?{surplus_grant_id:conversion.grant_id}:{};
      state.outstanding[request_id]={run_id,provider,cost,ts:now,family,purpose,run_purpose:admission.run_purpose??'UNCLASSIFIED',...grantRef};
      return {state,result:{request_id,run_id,provider,family,purpose,run_purpose:admission.run_purpose??'UNCLASSIFIED',cost,reserved_ts:now,day,month,state:'RESERVED',...grantRef}};
    });}catch(error){
      if(error instanceof BudgetRefusal&&['REQUEST_ALREADY_RESERVED','PROVIDER_SECOND_EXHAUSTED','PROVIDER_MINUTE_EXHAUSTED','QUALIFICATION_ATTEMPTS_EXHAUSTED','PROTECTED_DAY_RESERVE','PROVIDER_MONTH_EXHAUSTED','PROVIDER_BACKOFF','SURPLUS_GRANT_NOT_OWNED','SURPLUS_CANDIDATE_SCOPE_MISMATCH'].includes(error.code)||['SURPLUS_HOLD_STATE_UNQUALIFIED','SURPLUS_HOLD_EXHAUSTED_OR_CLOSED'].includes(error.code)){
        run.total-=cost;run.lanes[lane]-=cost;if(family==='LIQUIDATIONS')run.liquidations-=cost;if(candidate_id)inc(run.candidates,candidate_id,-cost);
      }else run.unknown++;
      throw error;
    }
    run.receipts.push(row);
    return row;
  }
  async function finalize(receipt,{state='CONFIRMED',http_status=null,retry_after_ms=null,temporary_failure=false,successful_response=false,network_attempted=null}={}) {
    if(!['CONFIRMED','UNKNOWN'].includes(state))throw new BudgetRefusal('INVALID_RECEIPT_STATE');
    await store.atomic('pump:resources',current=>{
      const held=current?.outstanding?.[receipt.request_id];
      if(!held||held.run_id!==run_id)throw new BudgetRefusal('RESERVATION_NOT_OWNED');
      // Counts are monotonic: no HTTP attempt is refunded, including errors.
      if(state==='UNKNOWN')current.unknown[receipt.request_id]={...held,http_status};
      delete current.outstanding[receipt.request_id];
      const p=current.providers[receipt.provider];
      if(temporary_failure){p.consecutive_temporary_failures=Math.min(100,(p.consecutive_temporary_failures??0)+1);p.backoff_until=Math.max(p.backoff_until??0,clock()+temporaryDelay(p.consecutive_temporary_failures));}
      else if(successful_response)p.consecutive_temporary_failures=0;
      if(integer(retry_after_ms)&&retry_after_ms>0){const p=current.providers[receipt.provider];p.backoff_until=Math.max(p.backoff_until??0,clock()+retry_after_ms);}
      return {state:current,result:true};
    });
    receipt.state=state;receipt.http_status=http_status;if(typeof network_attempted==='boolean')receipt.network_attempted=network_attempted;if(state==='UNKNOWN')run.unknown++;
  }
  function assertTarget(provider,url,{purpose='CORE',candidate_id=null,method='GET',json_body=null}={}){assertWorkWindow();const policy=providerPolicy(provider),target=new URL(url);if(!policy.allowed_hosts?.includes(target.hostname)||!policy.allowed_paths?.some(path=>target.pathname===path||path.endsWith('*')&&target.pathname.startsWith(path.slice(0,-1))))throw new BudgetRefusal('PROVIDER_ROUTE_NOT_ADMITTED',{provider});if(purpose==='DISCOVERY'&&(method!=='GET'||provider!=='BINGX'||candidate_id!==null||target.search||!['/openApi/swap/v2/quote/contracts','/openApi/swap/v2/quote/ticker'].includes(target.pathname)))throw new BudgetRefusal('INVALID_DISCOVERY_SCOPE');if(method==='POST')return admittedReadOnlyJSONPost(policy,target,json_body);if(method!=='GET'||json_body!==null)throw new BudgetRefusal('INVALID_SOURCE_REQUEST');return {method:'GET'};}
  function setMode(next){if(!['AUTO','MANUAL','STATISTICS'].includes(next))throw new BudgetRefusal('INVALID_BUDGET_MODE');mode=next;}
  function minimumIntervalMs(provider){const cap=providerPolicy(provider).per_second_cap;return integer(cap)&&cap>0?Math.ceil(1000/cap):0;}
  async function providerWindow(provider,cost){
    assertWorkWindow();const policy=providerPolicy(provider),now=clock();
    if(!integer(cost)||cost<1||cost>policy.per_minute_cap)throw new BudgetRefusal('PROVIDER_WINDOW_COST_INVALID');
    const state=await store.get('pump:resources'),p=state?.providers?.[provider];
    if((p?.backoff_until??0)>now)throw new BudgetRefusal('PROVIDER_BACKOFF');
    const recent=(p?.recent??[]).filter(r=>r.ts>now-60000).sort((a,b)=>a.ts-b.ts);
    if(recent.some(r=>!integer(r.ts)||r.ts>now||!integer(r.cost)||r.cost<1))throw new BudgetRefusal('PROVIDER_WINDOW_LEDGER_INVALID');
    let occupied=recent.reduce((n,r)=>n+r.cost,0),not_before_ts=now;
    for(const row of recent){if(occupied+cost<=policy.per_minute_cap)break;occupied-=row.cost;not_before_ts=row.ts+60000;}
    return {not_before_ts,expires_ts:admission.expires_ts,cost,minute_cap:policy.per_minute_cap,forecast_only:true};
  }
  async function admitCandidate({http_upper_bound,http_by_provider,candidate_id=null}={}){
    if(admission?.run_purpose!=='PRODUCTION')return {allowed:true,scope:'NO_PRODUCTION_FORECAST_APPLIED'};
    assertWorkWindow();
    const assess=(state,{ignore_pacing=false,exclude_grant_id=null}={})=>{const now=clock();
    const deny=reason=>({allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:reason});
    if(!integer(http_upper_bound)||http_upper_bound<1||!http_by_provider||Object.values(http_by_provider).some(n=>!integer(n))||Object.values(http_by_provider).reduce((a,b)=>a+b,0)>http_upper_bound)return deny('CANDIDATE_COST_UNQUALIFIED');
    if(admission.max_http_attempts!==undefined&&run.total+http_upper_bound>admission.max_http_attempts)return deny('WHOLE_CANDIDATE_OPERATION_HTTP_LIMIT');
    const day=utcDay(now),month=utcMonth(now),future=futureCandidateReserve(now,admission.future_candidates),futureMonth=futureCandidateReserve(now,admission.future_candidates,{period:'MONTH'});
    const discovery=futureDiscoveryHttp(now,admission.discovery,{until_ts:utcBudgetPeriodEnd(now,'DAY')}),discoveryMonth=futureDiscoveryHttp(now,admission.discovery,{until_ts:utcBudgetPeriodEnd(now,'MONTH')});
    const manual=mode==='MANUAL'?0:Object.values(protected_reserves.http_by_provider).reduce((a,b)=>a+b,0),fixed=manual+protected_reserves.delivery_http+protected_reserves.outcomes_http;
    const held=surplusHeld(state,now,{exclude_grant_id});
    const baseExtra=surplusBaseExtra(state,now,admission);
    if((state.days[day]??0)+http_upper_bound+held.http+baseExtra.http+fixed+discovery+future.http>limits.project_http_day)return deny('WHOLE_CANDIDATE_DAY_CAPACITY');
    const plan=mode==='AUTO'?automaticPlan(state,now):null;
    if(plan&&plan.charged+http_upper_bound+held.http+baseExtra.http+discovery+future.http>plan.limit)return deny('WHOLE_CANDIDATE_PLANNED_ALLOCATION');
    const pacing=candidatePacing(state,now,plan,discovery);
    if(pacing&&http_upper_bound!==pacing.allocation.http_upper_bound)return deny('CANDIDATE_PACING_COST_CHANGED');
    if(!ignore_pacing&&pacing&&pacing.candidate_count>=pacing.maximum)return deny('EVEN_DAY_CANDIDATE_ALLOCATION');
    for(const [provider,cost]of Object.entries(http_by_provider)){
      const policy=providerPolicy(provider),p=state.providers?.[provider]??{},reserve=(mode==='MANUAL'?0:protected_reserves.http_by_provider[provider])+(policy.delivery_source===false?0:protected_reserves.delivery_http)+(policy.outcome_source===false?0:protected_reserves.outcomes_http);
      if(!integer(reserve)||(p.days?.[day]??0)+cost+(held.provider_day[provider]??0)+(baseExtra.http_by_provider[provider]??0)+reserve+(provider===admission.discovery?.provider?discovery:0)+(future.http_by_provider[provider]??0)>policy.project_daily_cap)return deny('WHOLE_CANDIDATE_PROVIDER_DAY');
      if((p.months?.[month]??0)+cost+(held.provider_month[provider]??0)+(baseExtra.http_by_provider[provider]??0)+reserve+(provider===admission.discovery?.provider?discoveryMonth:0)+(futureMonth.http_by_provider[provider]??0)>policy.project_monthly_cap)return deny('WHOLE_CANDIDATE_PROVIDER_MONTH');
      if(ignore_pacing&&(p.backoff_until??0)>now)return deny('SURPLUS_PROVIDER_BACKOFF');
    }
    return {allowed:true,scope:'BOUNDED_WHOLE_CANDIDATE_FORECAST_NOT_AN_IO_RESERVATION',http_upper_bound,...(pacing?{pacing}:{})};
    };
    const state=await store.get('pump:resources')??{days:{},providers:{}},first=assess(state);
    const policy=surplusPolicy(admission,mode);
    const existing=policy&&candidate_id?surplusGrants(state)[surplusGrantKey(run_id,candidate_id)]:null;
    if(policy&&(existing||!first.allowed&&first.detail==='EVEN_DAY_CANDIDATE_ALLOCATION')){
      if(!candidate_id)return {allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'SURPLUS_CANDIDATE_ID_REQUIRED'};
      const answer=await store.atomic('pump:resources',current=>{
        current??={days:{},providers:{}};const key=surplusGrantKey(run_id,candidate_id),known=surplusGrants(current)[key];
        if(known&&known.state!=='OPEN')return {state:current,result:{allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'SURPLUS_LOGICAL_GRANT_ALREADY_SPENT'}};
        if(known&&(known.original_http!==http_upper_bound||JSON.stringify(known.original_by_provider)!==JSON.stringify(http_by_provider)))return {state:current,result:{allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:'SURPLUS_IDEMPOTENCY_COST_MISMATCH'}};
        const checked=known?{allowed:true}:assess(current,{ignore_pacing:true});if(!checked.allowed)return {state:current,result:checked};
        const native=surplusNativeCapacity(store,run_id,policy,clock());if(!native.allowed)return {state:current,result:{allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:native.detail}};
        const s=makeSurplusGrant({state:current,run_id,candidate_id,policy,native,now:clock(),http_upper_bound,http_by_provider});
        if(!s.allowed)return {state:current,result:{allowed:false,reason:'PROTECTED_DAY_RESERVE',detail:s.detail,...(s.surplus_limit?{surplus_limit:s.surplus_limit}:{})}};
        current.automatic_surplus_grants??={};current.automatic_surplus_grants[s.grant_id]??=s.grant;
        return {state:current,result:{allowed:true,scope:'CONDITIONAL_UNASSIGNED_WHOLE_OPERATION_HOLD',surplus_grant_id:s.grant_id,candidate_quota:{kind:'UNASSIGNED_SURPLUS',logical_spent:true,never_refunded:true,idempotent:s.idempotent,http_upper_bound}}};
      });
      if(answer.allowed)activeSurplus=answer.surplus_grant_id;
      return answer;
    }
    if(!first.allowed||!first.pacing)return first;
    return store.atomic('pump:resources',current=>{
      current??={days:{},providers:{}};const checked=assess(current);if(!checked.allowed)return {state:current,result:checked};
      const {pacing,...result}=checked,{allocation,...bucket}=pacing;
      current.automatic_candidate_allocations??={};current.automatic_candidate_allocations[pacing.day]??=allocation;
      current.automatic_deep_pacing??={};current.automatic_deep_pacing[pacing.day]??={};current.automatic_deep_pacing[pacing.day][pacing.key]={...bucket,candidate_count:bucket.candidate_count+1};
      return {state:current,result:{...result,candidate_quota:{period_start:Number(pacing.key),maximum:pacing.maximum,base_per_period:allocation.candidates_per_period,carried_in:pacing.carried_in,issued:bucket.candidate_count+1,remaining:pacing.maximum-bucket.candidate_count-1,day_issued:pacing.issued_before+bucket.candidate_count+1,never_refunded:true}}};
    });
  }
  async function closeCandidate({candidate_id,surplus_grant_id=null}={}){
    if(!surplus_grant_id)return null;
    if(activeSurplus!==surplus_grant_id)throw new BudgetRefusal('SURPLUS_GRANT_NOT_OWNED');
    activeSurplus=null;closedSurplusCandidates.add(candidate_id);
    const usage=typeof store.usage==='function'?store.usage():null;
    if(!usage||usage.unknown_ops>0||store.admission?.expires_ts<=clock())return {state:'UNKNOWN',hold_retained:true};
    return store.atomic('pump:resources',state=>{
      const grant=surplusGrants(state)[surplus_grant_id];
      if(!grant||grant.run_id!==run_id||grant.candidate_id!==candidate_id)throw new BudgetRefusal('SURPLUS_GRANT_NOT_OWNED');
      const unresolved=run.unknown>0||Object.values(state.outstanding??{}).some(r=>r.surplus_grant_id===surplus_grant_id)||Object.values(state.unknown??{}).some(r=>r.surplus_grant_id===surplus_grant_id);
      grant.state=unresolved?'UNKNOWN':'CLOSED';grant.closed_ts=clock();grant.unused_hold_retained_until=unresolved?null:grant.hold_until_ts;
      return {state,result:{state:grant.state,remaining_http:grant.remaining_http,hold_retained:true,logical_spent:true,unused_releases_after:grant.unused_hold_retained_until}};
    });
  }
  return {reserve,finalize,assertTarget,setMode,minimumIntervalMs,providerWindow,admitCandidate,closeCandidate,summary:()=>structuredClone({...run,run_id,mode,limits,protected_reserves})};
}

export function createRequestBroker({budget,store,fetch_impl=globalThis.fetch.bind(globalThis),clock=Date.now,max_response_bytes=2000000,sleep_impl=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const inFlight=new Map(),providerQueues=new Map(),lastStart=new Map();
  async function paced(provider,work,deadline){
    const interval=budget.minimumIntervalMs?.(provider)??0;if(!interval)return work();
    const prior=providerQueues.get(provider)??Promise.resolve();
    const next=prior.catch(()=>{}).then(async()=>{
      const wait=Math.max(0,(lastStart.get(provider)??-Infinity)+interval-clock());
      if(clock()+wait>=deadline)throw new BudgetRefusal('SOURCE_DEADLINE_EXPIRED');
      if(wait>0)await sleep_impl(wait);
      lastStart.set(provider,clock());return work();
    });providerQueues.set(provider,next);
    try{return await next;}finally{if(providerQueues.get(provider)===next)providerQueues.delete(provider);}
  }
  async function request({provider,family='CORE',purpose='CORE',cache_key,url,method='GET',timeout_ms=10000,ttl_ms=0,headers={},json_body=null,candidate_id=null,estimated_cost={http:1},deadline_ts=null}) {
    if(!['GET','POST'].includes(method)||method==='GET'&&json_body!==null||!cache_key||!provider)throw new BudgetRefusal('INVALID_SOURCE_REQUEST');
    if(!Number.isSafeInteger(timeout_ms)||timeout_ms<=0||timeout_ms>60000||deadline_ts!==null&&!Number.isSafeInteger(deadline_ts))throw new BudgetRefusal('INVALID_SOURCE_DEADLINE');
    const deadline=Math.min(deadline_ts??Infinity,clock()+timeout_ms);
    const target=new URL(url);
    if(target.protocol!=='https:'||target.username||target.password)throw new BudgetRefusal('HTTPS_SOURCE_REQUIRED');
    const route=budget.assertTarget(provider,url,{purpose,candidate_id,method,json_body});
    if(method==='POST'&&(route?.method!=='POST'||route.read_only_json_post!==true||typeof route.body_text!=='string'))throw new BudgetRefusal('EXACT_READONLY_JSON_POST_NOT_ADMITTED');
    const key=provider+':'+cache_key+':'+target.toString()+(method==='POST'?':POST:'+await textHash(route.body_text):'');
    if(inFlight.has(key))return inFlight.get(key);
    const work=(async()=>{
      const negative=await store.get('pump:negative-cache:'+key);
      if(negative&&negative.expires_ts>clock())return {...negative.result,cache_hit:true,negative_cache_hit:true,negative_reason:negative.reason,negative_expires_ts:negative.expires_ts};
      const cached=ttl_ms>0?await store.get('pump:cache:'+key):null;
      if(cached&&cached.received_ts+ttl_ms>=clock())return {...cached,cache_hit:true};
      return paced(provider,async()=>{
      const remaining=deadline-clock();if(remaining<=0)throw new BudgetRefusal('SOURCE_DEADLINE_EXPIRED');
      const request_id=crypto.randomUUID();
      const receipt=await budget.reserve({provider,family,purpose,candidate_id,request_id,cost:estimated_cost.http});
      let response;
      try {
        const request_started_ts=clock();
        // The durable reservation itself can outlive the source deadline.
        // Keep its conservative charge, but never start HTTP after that wait.
        const fetchRemaining=deadline-request_started_ts;
        if(fetchRemaining<=0){
          await budget.finalize(receipt,{http_status:null,network_attempted:false});
          throw Object.assign(new BudgetRefusal('SOURCE_DEADLINE_EXPIRED'),{receipt_id:request_id,network_attempted:false});
        }
        response=await fetch_impl(target.toString(),{method,headers:{accept:'application/json',...headers,...(method==='POST'?{'content-type':'application/json'}:{})},...(method==='POST'?{body:route.body_text}:{}),redirect:'manual',signal:AbortSignal.timeout(fetchRemaining)});
        if(response.status>=300&&response.status<400){await budget.finalize(receipt,{http_status:response.status});await response.body?.cancel();throw new BudgetRefusal('SOURCE_REDIRECT_REFUSED');}
        const advertised=Number(response.headers.get('content-length')??0);if(advertised>max_response_bytes)throw Error('SOURCE_BODY_LIMIT');
        const reader=response.body?.getReader();let total=0;const parts=[];
        if(reader){try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max_response_bytes)throw Error('SOURCE_BODY_LIMIT');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}}
        const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
        const raw=new TextDecoder().decode(bytes);let data=null;try{data=JSON.parse(raw);}catch{data={invalid_json:true};}
        const received_ts=clock(),latency_ms=received_ts>=request_started_ts?received_ts-request_started_ts:null;
        const retry=response.headers.get('retry-after');const retryAfter=retry?(Number.isFinite(Number(retry))?Math.max(0,Number(retry)*1000):Math.max(0,Date.parse(retry)-clock())):null;
        const businessRateLimited=provider==='BINGX'&&String(data?.code)==='100410';
        const disposition=responseDisposition(provider,response.status,data);
        const effectiveBackoff=retryAfter??(response.status===429||businessRateLimited?60000:null);
        await budget.finalize(receipt,{http_status:response.status,retry_after_ms:effectiveBackoff,temporary_failure:disposition==='TEMPORARY',successful_response:disposition==='SUCCESS'});
        const result={ok:response.ok,status:response.status,data,headers:{date:response.headers.get('date'),'retry-after':retry},received_ts,request_started_ts,latency_ms,latency_basis:'FETCH_START_TO_PARSED_RESPONSE_BODY',body_bytes:total,body_bytes_basis:'FETCH_RESPONSE_BODY_BYTES_NOT_COMPRESSED_NETWORK_WIRE',wire_bytes:null,cache_hit:false,receipt_id:request_id,semantic_status:disposition};
        if(disposition==='ROUTE_UNAVAILABLE')await store.set('pump:negative-cache:'+key,{reason:'EXACT_ROUTE_UNAVAILABLE_NOT_ASSET_CLASSIFICATION',expires_ts:result.received_ts+SOURCE_ERROR_PROFILE.negative_ttl_ms,result});
        if(disposition==='SUCCESS'&&ttl_ms>0)await store.set('pump:cache:'+key,result);
        return result;
      } catch(error) {
        // A request that might have crossed the network remains charged.
        if(receipt.state==='RESERVED')await budget.finalize(receipt,{state:'UNKNOWN',http_status:response?.status??null,temporary_failure:error.message!=='SOURCE_BODY_LIMIT'});
        throw error;
      }
      },deadline);
    })();inFlight.set(key,work);
    try{return await work;}finally{inFlight.delete(key);}
  }
  async function awaitProviderWindow({provider,cost,deadline_ts=clock()+60001,before_wait=async()=>{}}){
    if(!Number.isSafeInteger(deadline_ts)||deadline_ts<=clock())throw new BudgetRefusal('SOURCE_WINDOW_DEADLINE_EXPIRED');
    // This read forecasts availability, grants no HTTP and changes no counters.
    // Every later request still needs the original atomic reserve/finalize.
    for(let check=0;check<3;check++){
      const window=await budget.providerWindow(provider,cost),now=clock(),wait=Math.max(0,window.not_before_ts-now);
      if(now+wait>=Math.min(deadline_ts,window.expires_ts))throw new BudgetRefusal('SOURCE_WINDOW_DEADLINE_EXPIRED');
      if(!wait)return {status:'AVAILABLE',provider,cost,checked_ts:now,forecast_only:true};
      await before_wait();await sleep_impl(wait);
    }
    throw new BudgetRefusal('SOURCE_WINDOW_CONCURRENTLY_BUSY');
  }
  return {request,awaitProviderWindow,summary:budget.summary};
}
