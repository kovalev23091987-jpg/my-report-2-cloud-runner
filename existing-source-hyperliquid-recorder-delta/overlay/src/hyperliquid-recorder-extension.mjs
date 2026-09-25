import { classifyHyperliquidPositionChange as classifyExistingHyperliquidPositionChange } from './existing-source-coverage-normalizers.mjs';

export const HYPERLIQUID_RECORDER_EXTENSION_VERSION='hyperliquid-existing-recorder-extension-v1-20260925';
export const HYPERLIQUID_INFO_ENDPOINT='https://api.hyperliquid.xyz/info';
export const HYPERLIQUID_NEGATIVE_CONTROL_ADDRESS='0x0000000000000000000000000000000000000000';
export const HYPERLIQUID_RECORDER_METHODS=Object.freeze(['metaAndAssetCtxs','fundingHistory','l2Book','clearinghouseState']);
export const classifyHyperliquidPositionChange=classifyExistingHyperliquidPositionChange;

const positionMemory=new Map();
const MAX_POSITION_MEMORY=128;
const arr=v=>Array.isArray(v)?v:[];
const clean=v=>String(v??'').trim();
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};

function baseCoin(contract){
  const s=clean(contract).toUpperCase();
  const m=s.match(/^(.+)-(USDT|USDC|USD)$/);
  return m?m[1]:null;
}
function addressFingerprint(address){
  const s=clean(address).toLowerCase();
  let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return `fnv1a32:${(h>>>0).toString(16).padStart(8,'0')}`;
}
function boundedRemember(key,value){
  if(positionMemory.size>=MAX_POSITION_MEMORY&&!positionMemory.has(key)){
    const first=positionMemory.keys().next().value;
    if(first!==undefined)positionMemory.delete(first);
  }
  positionMemory.set(key,value);
}
function methodFor({observed_ts,force_method}={}){
  const forced=clean(force_method);
  if(forced){
    if(!HYPERLIQUID_RECORDER_METHODS.includes(forced))return null;
    return forced;
  }
  const slot=Math.floor((finite(observed_ts)??Date.now())/300000);
  return HYPERLIQUID_RECORDER_METHODS[((slot%HYPERLIQUID_RECORDER_METHODS.length)+HYPERLIQUID_RECORDER_METHODS.length)%HYPERLIQUID_RECORDER_METHODS.length];
}
function responseStatus(status){
  const n=Number(status);
  if(n===429)return'RATE_LIMITED';
  if(n>=200&&n<300)return'CLOSED';
  return'HTTP_ERROR';
}
async function hyperliquidPost(fetch_impl,body,{timeout_ms=10000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout_ms);
  try{
    const response=await fetch_impl(HYPERLIQUID_INFO_ENDPOINT,{
      method:'POST',
      headers:{'content-type':'application/json','accept':'application/json','user-agent':'my-report-2-hyperliquid-recorder/1.0'},
      body:JSON.stringify(body),
      signal:controller.signal,
    });
    let payload=null;
    try{payload=await response.json();}catch{payload=null;}
    const status=responseStatus(response.status);
    return{status,http_status:response.status,payload};
  }catch(error){
    return{status:error?.name==='AbortError'?'TIMEOUT':'FETCH_ERROR',http_status:null,payload:null,error:String(error?.message||error).slice(0,240)};
  }finally{clearTimeout(timer);}
}
function commonContext({status,method,coin,observed_ts,address,address_role,error=null}={}){
  return{
    version:HYPERLIQUID_RECORDER_EXTENSION_VERSION,status,source:'Hyperliquid',venue:'Hyperliquid',method,coin,
    observed_ts,source_ts:observed_ts,max_age_sec:600,source_compatible:status==='CLOSED',
    known_addresses_are_sample_only:true,address:address||null,address_fingerprint:address?addressFingerprint(address):null,
    address_role:address_role||null,not_global_liquidation_map:true,not_htx_liquidation_map:true,
    directional_vote:false,automatic_voting:false,advisory_only:true,hard_gate:false,score_eligible:false,error,
  };
}
function normalizeMeta(payload,ctx){
  const meta=Array.isArray(payload)?payload[0]:null;
  const states=Array.isArray(payload)?payload[1]:null;
  const index=arr(meta?.universe).findIndex(x=>clean(x?.name).toUpperCase()===ctx.coin);
  const state=index>=0?arr(states)[index]:null;
  const mark=finite(state?.markPx),oi=finite(state?.openInterest),funding=finite(state?.funding);
  const closed=index>=0&&(mark!==null||oi!==null||funding!==null);
  return{...ctx,status:closed?'CLOSED':'NOT_CLOSED',source_compatible:closed,mark_price:mark,open_interest_contracts:oi,open_interest_usd:mark!==null&&oi!==null?mark*oi:null,funding_rate:funding,exact_coin_match:index>=0};
}
function normalizeFunding(payload,ctx){
  const rows=arr(payload).filter(x=>clean(x?.coin).toUpperCase()===ctx.coin).sort((a,b)=>(finite(b?.time)??0)-(finite(a?.time)??0));
  const latest=rows[0]||null,rate=finite(latest?.fundingRate),ts=finite(latest?.time);
  const closed=rate!==null;
  return{...ctx,status:closed?'CLOSED':'NOT_CLOSED',source_compatible:closed,funding_rate:rate,funding_event_ts:ts,funding_history_rows:rows.length,exact_coin_match:rows.length>0};
}
function normalizeBook(payload,ctx){
  const bids=arr(payload?.levels?.[0]),asks=arr(payload?.levels?.[1]);
  const bid=finite(bids[0]?.px),ask=finite(asks[0]?.px),mid=bid!==null&&ask!==null?(bid+ask)/2:null;
  const spread=mid!==null&&mid>0?(ask-bid)/mid*100:null;
  const closed=spread!==null;
  return{...ctx,status:closed?'CLOSED':'NOT_CLOSED',source_compatible:closed,best_bid:bid,best_ask:ask,spread_pct:spread,book_bid_levels:bids.length,book_ask_levels:asks.length};
}
function normalizeState(payload,ctx){
  const positions=arr(payload?.assetPositions).map(x=>x?.position||x).filter(Boolean).map(p=>({
    coin:clean(p?.coin).toUpperCase(),szi:finite(p?.szi),entry_px:finite(p?.entryPx),position_value:finite(p?.positionValue),
  }));
  const current=positions.find(x=>x.coin===ctx.coin)||{coin:ctx.coin,szi:0,entry_px:null,position_value:null};
  const key=`${ctx.address_fingerprint||'NO_ADDRESS'}|${ctx.coin}`;
  const previous=positionMemory.get(key);
  let position_change;
  if(previous===undefined){
    position_change={status:'BASELINE_ESTABLISHED',delta:null,previous_szi:null,current_szi:current.szi??0,directional_vote:false};
  }else{
    const classified=classifyExistingHyperliquidPositionChange({szi:previous},{szi:current.szi??0});
    position_change={...classified,previous_szi:previous,current_szi:current.szi??0,directional_vote:false};
  }
  boundedRemember(key,current.szi??0);
  const closed=Array.isArray(payload?.assetPositions);
  return{...ctx,status:closed?'CLOSED':'NOT_CLOSED',source_compatible:closed,positions,current_position:current,position_change,position_change_state_scope:'BOUNDED_WARM_RECORDER_MEMORY',absence_is_negative:false,global_position_inference:false};
}
function normalizeMethod(method,payload,ctx){
  if(method==='metaAndAssetCtxs')return normalizeMeta(payload,ctx);
  if(method==='fundingHistory')return normalizeFunding(payload,ctx);
  if(method==='l2Book')return normalizeBook(payload,ctx);
  if(method==='clearinghouseState')return normalizeState(payload,ctx);
  return{...ctx,status:'UNSUPPORTED',source_compatible:false,error:'METHOD_UNSUPPORTED'};
}

export async function fetchExistingSmartMoneyRecorderRaw({
  fetch_impl=globalThis.fetch,bykaranteli_fetcher=null,contract_code,bykaranteli_api_key='',
  hyperliquid_sample_address='',observed_ts=Date.now(),force_method=null,
}={}){
  const apiKey=clean(bykaranteli_api_key);
  if(apiKey){
    if(typeof bykaranteli_fetcher!=='function')return{
      version:HYPERLIQUID_RECORDER_EXTENSION_VERSION,status:'NOT_CLOSED',reason:'BYKARANTELI_FETCHER_REQUIRED',
      score_eligible:false,directional_vote_eligible:false,calibration_required:true,external_fetches:0,
      recorder_extension:{hyperliquid_supported:true,mode:'EXISTING_BYK_PATH_SELECTED',second_recorder_added:false,smart_money_external_requests_each:1},
    };
    const existing=await bykaranteli_fetcher({fetch_impl,contract_code,api_key:apiKey,observed_ts});
    return{...existing,recorder_extension:{hyperliquid_supported:true,mode:'EXISTING_BYK_PATH_SELECTED',second_recorder_added:false,smart_money_external_requests_each:1,hyperliquid_context:null}};
  }

  const coin=baseCoin(contract_code);
  const method=methodFor({observed_ts,force_method});
  if(!coin||!method)return{
    version:HYPERLIQUID_RECORDER_EXTENSION_VERSION,status:'NOT_CLOSED',reason:!coin?'HTX_CONTRACT_TO_HYPERLIQUID_COIN_NOT_EXACT':'HYPERLIQUID_METHOD_INVALID',
    score_eligible:false,directional_vote_eligible:false,calibration_required:true,external_fetches:0,
    recorder_extension:{hyperliquid_supported:true,mode:'HYPERLIQUID_FALLBACK_NOT_CLOSED',second_recorder_added:false,smart_money_external_requests_each:1},
  };

  const configuredAddress=clean(hyperliquid_sample_address);
  const address=configuredAddress||HYPERLIQUID_NEGATIVE_CONTROL_ADDRESS;
  const addressRole=configuredAddress?'CONFIGURED_KNOWN_SAMPLE_ONLY':'NEGATIVE_CONTROL_ZERO_ADDRESS';
  const body=method==='metaAndAssetCtxs'?{type:'metaAndAssetCtxs'}:
    method==='fundingHistory'?{type:'fundingHistory',coin,startTime:Math.max(0,observed_ts-24*3600_000)}:
    method==='l2Book'?{type:'l2Book',coin}:{type:'clearinghouseState',user:address};

  const raw=await hyperliquidPost(fetch_impl,body);
  const base=commonContext({status:raw.status,method,coin,observed_ts,address:method==='clearinghouseState'?address:null,address_role:method==='clearinghouseState'?addressRole:null,error:raw.error??null});
  const context=raw.status==='CLOSED'?normalizeMethod(method,raw.payload,base):base;

  return{
    version:'tz101-smart-money-raw-r8+hyperliquid-existing-recorder-v1',
    status:'NOT_CLOSED',reason:'BYKARANTELI_NOT_CONFIGURED_HYPERLIQUID_EXISTING_RECORDER_SLOT_USED',
    score_eligible:false,directional_vote_eligible:false,calibration_required:true,external_fetches:1,
    hyperliquid_context:context,
    recorder_extension:{version:HYPERLIQUID_RECORDER_EXTENSION_VERSION,mode:'HYPERLIQUID_ROTATING_FALLBACK_IN_EXISTING_SMART_MONEY_SLOT',method,second_recorder_added:false,smart_money_external_requests_each:1,hot_cycle_external_request_delta:0,methods:[...HYPERLIQUID_RECORDER_METHODS],known_addresses_are_sample_only:true,not_global_liquidation_map:true},
  };
}

export function hyperliquidRegistryReceipt(context){
  if(!context||context.status!=='CLOSED')return null;
  return{source:'Hyperliquid',status:'CLOSED',source_ts:context.source_ts,observed_ts:context.observed_ts,max_age_sec:context.max_age_sec??600,source_compatible:true,metric:`hyperliquid_${context.method}`};
}

export function hyperliquidAdvisoryEvidenceRows(context,{contract_code=null}={}){
  if(!context||context.status!=='CLOSED')return[];
  const common={contract_code,chain:'SMART_MONEY_ONCHAIN',source:'Hyperliquid',venue:'Hyperliquid',market_type:'PERP',observed_ts:context.observed_ts,source_ts:context.source_ts,max_age_sec:context.max_age_sec??600,status:'ADVISORY_CLOSED',venue_observation_status:'CLOSED',eligible_for_chain_closure:false,coverage_pct:100,symbol_verified:true,alias_required:false,alias_verified:true,asset_identity_verified:false,source_compatible:true,independence_group:'HYPERLIQUID_PUBLIC_INFO',primary_market_id:context.coin?`${context.coin}:HYPERLIQUID:PERP`:null,note:'advisory_only; known_addresses_are_sample_only; not_global_liquidation_map; no_directional_vote'};
  const out=[];
  if(finite(context.funding_rate)!==null)out.push({...common,metric:'hyperliquid_funding_rate',value:finite(context.funding_rate),unit:'rate'});
  if(finite(context.open_interest_usd)!==null)out.push({...common,metric:'hyperliquid_open_interest_usd',value:finite(context.open_interest_usd),unit:'USD'});
  if(finite(context.spread_pct)!==null)out.push({...common,metric:'hyperliquid_spread_pct',value:finite(context.spread_pct),unit:'pct'});
  if(context.current_position&&finite(context.current_position.szi)!==null)out.push({...common,metric:'hyperliquid_sample_position_szi',value:finite(context.current_position.szi),unit:'base_asset',note:`${common.note}; address_role=${context.address_role}; position_change=${context.position_change?.status||'UNKNOWN'}`});
  return out;
}

export default{
  HYPERLIQUID_RECORDER_EXTENSION_VERSION,HYPERLIQUID_INFO_ENDPOINT,HYPERLIQUID_NEGATIVE_CONTROL_ADDRESS,HYPERLIQUID_RECORDER_METHODS,
  classifyHyperliquidPositionChange,fetchExistingSmartMoneyRecorderRaw,hyperliquidRegistryReceipt,hyperliquidAdvisoryEvidenceRows,
};
