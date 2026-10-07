import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
const integer=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const label=x=>typeof x==='string'?x.replace(/[\x00-\x1f]/g,' ').slice(0,120):null;
function originalPositionProof(p){
 if(!p||typeof p!=='object')return null;
 const search=p.position_search;
 return{schema:label(p.schema),source_clock_closed:p.source_clock_closed===true,native_snapshot_verified:p.native_snapshot_verified===true,source_ts:integer(p.source_ts),observed_ts:integer(p.observed_ts),height:typeof p.height==='string'&&/^\d{1,18}$/.test(p.height)?p.height:null,block_hash:typeof p.block_hash==='string'&&/^[a-fA-F0-9]{64}$/.test(p.block_hash)?p.block_hash:null,receipt_sha256:Array.isArray(p.receipt_sha256)&&p.receipt_sha256.length===3&&p.receipt_sha256.every(h=>/^[a-f0-9]{64}$/.test(h))?[...p.receipt_sha256]:[],status:label(p.status),reason:label(p.reason),position_search:search?{automatic:search.automatic===true,query_basis:label(search.query_basis),page_limit:integer(search.page_limit),complete_accounts_read:integer(search.complete_accounts_read),source_ts:integer(search.source_ts),source_clock_refreshed:search.source_clock_refreshed===true,full_market_census:search.full_market_census===true}:null,source_clocks_refreshed:false,diagnostic_only:true};
}
export function buildLiquidationSourceAcquisitionAudit({summary,run_id,candidates=[],evaluated_ts}={}){
 if(typeof run_id!=='string'||!run_id||run_id.length>160||integer(evaluated_ts)===null||!Array.isArray(candidates)||candidates.length>2||candidates.some(c=>!isExactHtxUsdtSwapKey(c))||new Set(candidates).size!==candidates.length)return null;
 const rows=Array.isArray(summary?.routed)?summary.routed.filter(r=>r.run_id===run_id&&candidates.includes(r.contract)):[];if(rows.length>24)return null;
 const routes=rows.map(r=>({contract:r.contract,run_id,lane:label(r.lane),status:label(r.status),role_usable:r.usable===true,attempt:integer(r.attempt),source_outcome:{evaluated:r.source_outcome?.evaluated===true,operational_success:r.source_outcome?.operational_success===true,actual_http:integer(r.source_outcome?.attempted_http_count),transport_status:label(r.source_outcome?.transport_status),schema_status:label(r.source_outcome?.schema_status),coverage_status:label(r.source_outcome?.coverage_status),failure_origin:label(r.source_outcome?.failure_origin)},position_proof:originalPositionProof(r.position_proof)}));
 const budget=summary?.shared_budget??{},body={schema:'LIQUIDATION_SOURCE_ACQUISITION_AUDIT_V1',run_id,evaluated_ts,candidates:[...candidates],routes,shared_budget:{reserved_http:integer(budget.reserved_http),actual_http:integer(budget.actual_http),max_http_per_run:integer(summary?.total_http_cap)},source_clocks_refreshed:false,diagnostic_only:true,internal_only:true,network_calls:0,db_calls:0,entry_authorized:false};
 return Buffer.byteLength(JSON.stringify(body))<=16384?body:null;
}
