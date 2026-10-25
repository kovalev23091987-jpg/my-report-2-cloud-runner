// One coordinator-owned budget. Adapters receive only its request broker.
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
  const providerPolicy = provider => {
    const policy=policies?.[provider],now=clock();
    if (!policy || !admission?.provider_policy_version || admission.provider_policy_version!==policy.version || !Number.isSafeInteger(admission.expires_ts) || admission.expires_ts<=now || !policy.evidence_ref || !integer(policy.project_daily_cap) || !integer(policy.project_monthly_cap) || !integer(policy.per_minute_cap)) throw new BudgetRefusal('PROVIDER_ADMISSION_REQUIRED',{provider});
    return policy;
  };
  async function reserve({provider,family='CORE',purpose='CORE',candidate_id=null,lane=mode==='STATISTICS'?'statistics':'hot',request_id,cost=1}) {
    const policy=providerPolicy(provider),now=clock();
    if(!request_id||!integer(cost)||cost<1||!Object.hasOwn(run.lanes,lane)||!['CORE','DELIVERY'].includes(purpose))throw new BudgetRefusal('INVALID_HTTP_RESERVATION');
    if(run.total+cost>limits.http_per_run||run.lanes[lane]+cost>limits.lanes[lane])throw new BudgetRefusal('RUN_HTTP_EXHAUSTED');
    if(mode==='AUTO'&&lane==='hot'&&run.lanes.hot+cost+limits.manual_http_run_reserve>limits.lanes.hot)throw new BudgetRefusal('RUN_MANUAL_RESERVE_PROTECTED');
    if(family==='LIQUIDATIONS'&&run.liquidations+cost>limits.liquidations_per_run)throw new BudgetRefusal('MAP_BUDGET_EXHAUSTED');
    if(candidate_id&&(run.candidates[candidate_id]??0)+cost>limits.deep_per_candidate)throw new BudgetRefusal('CANDIDATE_HTTP_EXHAUSTED');
    const protectedHttp=protected_reserves?.http_by_provider?.[provider];
    if(!integer(protectedHttp)||!integer(protected_reserves?.delivery_http)||!integer(protected_reserves?.outcomes_http))throw new BudgetRefusal('PROTECTED_RESERVES_NOT_MEASURED');
    const manualProtection=mode==='MANUAL'?0:protectedHttp;
    const deliveryProtection=family==='DELIVERY'||purpose==='DELIVERY'?0:protected_reserves.delivery_http;
    const outcomesProtection=mode==='STATISTICS'?0:protected_reserves.outcomes_http;
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
      if(spent+cost+manualProtection+deliveryProtection+providerOutcomesProtection>policy.project_daily_cap)throw new BudgetRefusal('PROTECTED_DAY_RESERVE');
      const globalManual=mode==='MANUAL'?0:Object.values(protected_reserves.http_by_provider).reduce((sum,n)=>sum+n,0);
      if((state.days[day]??0)+cost+globalManual+deliveryProtection+outcomesProtection>limits.project_http_day)throw new BudgetRefusal('PROTECTED_DAY_RESERVE');
      if(monthSpent+cost+manualProtection>policy.project_monthly_cap)throw new BudgetRefusal('PROVIDER_MONTH_EXHAUSTED');
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
  async function finalize(receipt,{state='CONFIRMED',http_status=null,retry_after_ms=null}={}) {
    if(!['CONFIRMED','UNKNOWN'].includes(state))throw new BudgetRefusal('INVALID_RECEIPT_STATE');
    await store.atomic('pump:resources',current=>{
      const held=current?.outstanding?.[receipt.request_id];
      if(!held||held.run_id!==run_id)throw new BudgetRefusal('RESERVATION_NOT_OWNED');
      // Counts are monotonic: no HTTP attempt is refunded, including errors.
      if(state==='UNKNOWN')current.unknown[receipt.request_id]={...held,http_status};
      delete current.outstanding[receipt.request_id];
      if(integer(retry_after_ms)&&retry_after_ms>0){const p=current.providers[receipt.provider];p.backoff_until=Math.max(p.backoff_until??0,clock()+retry_after_ms);}
      return {state:current,result:true};
    });
    receipt.state=state;receipt.http_status=http_status;if(state==='UNKNOWN')run.unknown++;
  }
  function assertTarget(provider,url){const policy=providerPolicy(provider),target=new URL(url);if(!policy.allowed_hosts?.includes(target.hostname)||!policy.allowed_paths?.some(path=>target.pathname===path||path.endsWith('*')&&target.pathname.startsWith(path.slice(0,-1))))throw new BudgetRefusal('PROVIDER_ROUTE_NOT_ADMITTED',{provider});}
  function setMode(next){if(!['AUTO','MANUAL','STATISTICS'].includes(next))throw new BudgetRefusal('INVALID_BUDGET_MODE');mode=next;}
  function minimumIntervalMs(provider){const cap=providerPolicy(provider).per_second_cap;return integer(cap)&&cap>0?Math.ceil(1000/cap):0;}
  return {reserve,finalize,assertTarget,setMode,minimumIntervalMs,summary:()=>structuredClone({...run,run_id,mode,limits,protected_reserves})};
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
  async function request({provider,family='CORE',purpose='CORE',cache_key,url,method='GET',timeout_ms=10000,ttl_ms=0,headers={},candidate_id=null,estimated_cost={http:1},deadline_ts=null}) {
    if(method!=='GET'||!cache_key||!provider)throw new BudgetRefusal('INVALID_SOURCE_REQUEST');
    if(!Number.isSafeInteger(timeout_ms)||timeout_ms<=0||timeout_ms>60000||deadline_ts!==null&&!Number.isSafeInteger(deadline_ts))throw new BudgetRefusal('INVALID_SOURCE_DEADLINE');
    const deadline=Math.min(deadline_ts??Infinity,clock()+timeout_ms);
    const target=new URL(url);
    if(target.protocol!=='https:'||target.username||target.password)throw new BudgetRefusal('HTTPS_SOURCE_REQUIRED');
    budget.assertTarget(provider,url);
    const key=provider+':'+cache_key+':'+target.toString();
    if(inFlight.has(key))return inFlight.get(key);
    const work=(async()=>{
      const cached=ttl_ms>0?await store.get('pump:cache:'+key):null;
      if(cached&&cached.received_ts+ttl_ms>=clock())return {...cached,cache_hit:true};
      return paced(provider,async()=>{
      const remaining=deadline-clock();if(remaining<=0)throw new BudgetRefusal('SOURCE_DEADLINE_EXPIRED');
      const request_id=crypto.randomUUID();
      const receipt=await budget.reserve({provider,family,purpose,candidate_id,request_id,cost:estimated_cost.http});
      let response;
      try {
        response=await fetch_impl(target.toString(),{method,headers:{accept:'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(remaining)});
        if(response.status>=300&&response.status<400){await budget.finalize(receipt,{http_status:response.status});await response.body?.cancel();throw new BudgetRefusal('SOURCE_REDIRECT_REFUSED');}
        const advertised=Number(response.headers.get('content-length')??0);if(advertised>max_response_bytes)throw Error('SOURCE_BODY_LIMIT');
        const reader=response.body?.getReader();let total=0;const parts=[];
        if(reader){try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max_response_bytes)throw Error('SOURCE_BODY_LIMIT');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}}
        const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
        const raw=new TextDecoder().decode(bytes);let data=null;try{data=JSON.parse(raw);}catch{data={invalid_json:true};}
        const retry=response.headers.get('retry-after');const retryAfter=retry?(Number.isFinite(Number(retry))?Math.max(0,Number(retry)*1000):Math.max(0,Date.parse(retry)-clock())):null;
        const businessRateLimited=provider==='BINGX'&&String(data?.code)==='100410';
        const effectiveBackoff=retryAfter??(response.status===429||businessRateLimited?60000:null);
        await budget.finalize(receipt,{http_status:response.status,retry_after_ms:effectiveBackoff});
        const result={ok:response.ok,status:response.status,data,headers:{date:response.headers.get('date'),'retry-after':retry},received_ts:clock(),cache_hit:false,receipt_id:request_id};
        if(response.ok&&ttl_ms>0)await store.set('pump:cache:'+key,result);
        return result;
      } catch(error) {
        // A request that might have crossed the network remains charged.
        if(receipt.state==='RESERVED')await budget.finalize(receipt,{state:'UNKNOWN',http_status:response?.status??null});
        throw error;
      }
      },deadline);
    })();inFlight.set(key,work);
    try{return await work;}finally{inFlight.delete(key);}
  }
  return {request,summary:budget.summary};
}
