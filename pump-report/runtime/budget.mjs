// One coordinator-owned budget. Adapters receive only its request broker.
import {automaticWindowOpen} from '../contracts/index.mjs';
import {responseDisposition,temporaryDelay,SOURCE_ERROR_PROFILE} from './source-error-policy.mjs';
import {futureDiscoveryHttp} from './discovery-reserve.mjs';
import {futureCandidateReserve,utcBudgetPeriodEnd} from './future-candidate-reserve.mjs';
import {admittedReadOnlyJSONPost} from './read-only-json-post.mjs';
import {textHash} from './text-hash.mjs';
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
  const assertWorkWindow=()=>{if(admission?.strict_automatic_window===true&&mode!=='MANUAL'&&!automaticWindowOpen(clock()))throw new BudgetRefusal('BUDGET_AUTOMATIC_WINDOW_CLOSED');};
  const providerPolicy = provider => {
    if(Array.isArray(admission?.allowed_providers)&&!admission.allowed_providers.includes(provider))throw new BudgetRefusal('PROVIDER_NOT_IN_RUN_ADMISSION');
    const policy=policies?.[provider],now=clock();
    if (!policy || !admission?.provider_policy_version || admission.provider_policy_version!==policy.version || !Number.isSafeInteger(admission.expires_ts) || admission.expires_ts<=now || !policy.evidence_ref || !integer(policy.project_daily_cap) || !integer(policy.project_monthly_cap) || !integer(policy.per_minute_cap)) throw new BudgetRefusal('PROVIDER_ADMISSION_REQUIRED',{provider});
    return policy;
  };
  async function reserve({provider,family='CORE',purpose='CORE',candidate_id=null,lane=mode==='STATISTICS'?'statistics':'hot',request_id,cost=1}) {
    assertWorkWindow();
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
      p.recent=p.recent.filter(r=>r.ts>now-60000);
      if(integer(policy.per_second_cap)&&p.recent.filter(r=>r.ts>now-1000).reduce((n,r)=>n+r.cost,0)+cost>policy.per_second_cap)throw new BudgetRefusal('PROVIDER_SECOND_EXHAUSTED');
      if(p.recent.reduce((n,r)=>n+r.cost,0)+cost>policy.per_minute_cap)throw new BudgetRefusal('PROVIDER_MINUTE_EXHAUSTED');
      if(integer(policy.qualification_attempt_cap)&&(p.qualification_totals?.[policy.version]??0)+cost>policy.qualification_attempt_cap)throw new BudgetRefusal('QUALIFICATION_ATTEMPTS_EXHAUSTED');
      const providerOutcomesProtection=policy.outcome_source===false?0:outcomesProtection;
      const providerDeliveryProtection=policy.delivery_source===false?0:deliveryProtection;
      if(spent+cost+manualProtection+providerDeliveryProtection+providerOutcomesProtection+(provider===admission.discovery?.provider?futureDiscovery:0)+(futureCandidates.http_by_provider[provider]??0)>policy.project_daily_cap)throw new BudgetRefusal('PROTECTED_DAY_RESERVE');
      const globalManual=mode==='MANUAL'&&admission.run_purpose!=='ACCEPTANCE_TEST'?0:Object.values(protected_reserves.http_by_provider).reduce((sum,n)=>sum+n,0);
      if((state.days[day]??0)+cost+globalManual+deliveryProtection+outcomesProtection+futureDiscovery+futureCandidates.http>limits.project_http_day)throw new BudgetRefusal('PROTECTED_DAY_RESERVE');
      if(monthSpent+cost+manualProtection+providerDeliveryProtection+providerOutcomesProtection+(provider===admission.discovery?.provider?futureDiscoveryMonth:0)+(futureCandidatesMonth.http_by_provider[provider]??0)>policy.project_monthly_cap)throw new BudgetRefusal('PROVIDER_MONTH_EXHAUSTED');
      if((p.backoff_until??0)>now)throw new BudgetRefusal('PROVIDER_BACKOFF');
      inc(state.days,day,cost);inc(p.days,day,cost);inc(p.months,month,cost);p.recent.push({ts:now,cost});
      if(integer(policy.qualification_attempt_cap)){p.qualification_totals??={};inc(p.qualification_totals,policy.version,cost);}
      state.outstanding[request_id]={run_id,provider,cost,ts:now,family,purpose};
      return {state,result:{request_id,run_id,provider,family,purpose,cost,reserved_ts:now,day,month,state:'RESERVED'}};
    });}catch(error){
      if(error instanceof BudgetRefusal&&['REQUEST_ALREADY_RESERVED','PROVIDER_SECOND_EXHAUSTED','PROVIDER_MINUTE_EXHAUSTED','QUALIFICATION_ATTEMPTS_EXHAUSTED','PROTECTED_DAY_RESERVE','PROVIDER_MONTH_EXHAUSTED','PROVIDER_BACKOFF'].includes(error.code)){
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
  return {reserve,finalize,assertTarget,setMode,minimumIntervalMs,providerWindow,summary:()=>structuredClone({...run,run_id,mode,limits,protected_reserves})};
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
