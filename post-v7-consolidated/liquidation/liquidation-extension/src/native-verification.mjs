import {readJson,fetchNativeHLState} from './io.mjs';
import {normalizeNativeHL} from './providers.mjs';
import {seal} from './core.mjs';
// Indexer data discover public accounts only. Native exchange state supplies prices.
export async function collectVerifiedHL({symbol,catalog,run_id,snapshot_id,max_accounts=4,fetch_impl=globalThis.fetch,clock=Date.now,remaining_requests=24,liqflow_key,max_wall_ms=45000}={}){
 if(!Array.isArray(catalog)||!catalog.includes(symbol))return {status:'UNSUPPORTED_NATIVE_INSTRUMENT',requests:0,automatic_execution:false};
 if(!Number.isInteger(max_accounts)||max_accounts<1||max_accounts>8)throw Error('ACCOUNT_BUDGET_MUST_BE_1_TO_8');
 if(!Number.isInteger(max_wall_ms)||max_wall_ms<100||max_wall_ms>45000)throw Error('BOUNDED_WALL_DEADLINE_REQUIRED');
 if(remaining_requests<1+max_accounts)return {status:'BUDGET_PRE_RESERVATION_REQUIRED',requests:0,automatic_execution:false};
 if(clock()>=Date.parse('2026-10-27T00:00:00Z')&&!liqflow_key)return {status:'FREE_API_KEY_REQUIRED_NO_AUTH_BYPASS',requests:0,automatic_execution:false};
 if(typeof run_id!=='string'||!run_id||typeof snapshot_id!=='string'||!snapshot_id)throw Error('ANALYSIS_ID_REQUIRED_BEFORE_NETWORK');
 const started=clock(),deadline=started+max_wall_ms;const transport=[];
 const timeout=()=>Math.max(1,Math.min(12000,deadline-clock()));
 const discovery=await readJson(`https://node.liqflow.app/api/coin/${encodeURIComponent(symbol)}/positions`,{fetch_impl,clock,timeout_ms:timeout(),max_bytes:2000000,...(liqflow_key?{headers:{'X-API-Key':liqflow_key}}:{})});
 transport.push(discovery.receipt);
 if(!discovery.ok||discovery.payload?.coin!==symbol||!Array.isArray(discovery.payload.positions))return {status:'DISCOVERY_NOT_CLOSED',requests:1,transport};
 const seen=new Set(),selected=discovery.payload.positions.filter(p=>/^0x[0-9a-f]{40}$/i.test(p.address)&&!seen.has(p.address.toLowerCase())&&(seen.add(p.address.toLowerCase()),true)).slice(0,max_accounts);
 const states=[],failures=[];let index=0;
 async function worker(){while(index<selected.length){const item=selected[index++];
  if(clock()>=deadline){failures.push({account:item.address,reason:'WALL_DEADLINE_REACHED_NO_REQUEST'});continue;}
  const result=await fetchNativeHLState(item.address,{fetch_impl,clock,timeout_ms:timeout(),max_bytes:2000000});transport.push(result.receipt);
  if(result.ok)states.push({address:item.address,state:result.payload});else failures.push({account:item.address,reason:result.reason});}}
 await Promise.all([worker(),worker()]);
 const as_of=clock();const receipt=normalizeNativeHL({accounts:states,selection_bias:'INDEXER_FIRST_PAGE_SAMPLE; SOURCE_TOTAL_NOT_CENSUS_OF_READ_ACCOUNTS'},
  {symbol,route_symbol:symbol,run_id,snapshot_id,as_of_ms:as_of,received_at_ms:as_of,max_age_ms:120000,execution_alias_verified:false});
 const r=seal({...receipt,discovery_provider:'LiqFlow',discovery_total_positions_reported:discovery.payload.total??null,discovery_page:discovery.payload.page??null,
  native_account_responses:states.length,failed_accounts:failures,sample_incomplete:failures.length>0,model_prices_used:false,transport_sha256:transport.map(x=>x?.sha256??null),
  collection_elapsed_ms:as_of-started,max_wall_ms,execution_target_eligible:false,production_wired:false});
 return {status:receipt.usable_for_context?'NATIVE_VALIDATED_SAMPLE_COLLECTED':'NATIVE_SAMPLE_NOT_CLOSED',requests:transport.length,receipt:r,transport};
}
