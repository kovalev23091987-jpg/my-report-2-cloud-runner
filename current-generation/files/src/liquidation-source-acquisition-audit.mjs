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
// Bind attempted-source diagnostics to the canonical asset/snapshot. This is
// never a native state proof, source freshness, or an additional market vote.
export function bindLiquidationAcquisitionDiagnostics({audit,contract,run_id,snapshot_id,observed_ts}={}){
 if(audit?.schema!=='LIQUIDATION_SOURCE_ACQUISITION_AUDIT_V1'||audit.run_id!==run_id||!isExactHtxUsdtSwapKey(contract)||!audit.candidates?.includes(contract)||typeof snapshot_id!=='string'||!snapshot_id||snapshot_id.length>320||integer(observed_ts)===null||integer(audit.evaluated_ts)===null||audit.evaluated_ts>observed_ts||observed_ts-audit.evaluated_ts>300000||audit.diagnostic_only!==true||audit.source_clocks_refreshed!==false||audit.entry_authorized!==false)return null;
 const selected=Array.isArray(audit.routes)?audit.routes.filter(r=>r.contract===contract&&r.run_id===run_id):[];
 if(selected.length>12)return null;
 const routes=selected.map(r=>{
  const o=r.source_outcome||{},status=label(r.status),safeStatus=status?.startsWith('SOURCE_EXCEPTION:')?'SOURCE_EXCEPTION':/^[A-Z0-9_:]+$/.test(status||'')?status:'UNCLASSIFIED_SOURCE_STATUS';
  const kind=r.role_usable===true?'ROLE_USABLE':o.evaluated===true&&o.operational_success===true&&o.coverage_status==='EMPTY_BOUNDED_SAMPLE'?'EMPTY_BOUNDED_LEVEL_SAMPLE':o.evaluated===true&&o.coverage_status==='UNSUPPORTED'?'ASSET_UNSUPPORTED':safeStatus==='SKIPPED_CANDIDATE_HTTP_ENVELOPE'||safeStatus?.startsWith('QUOTA_NOT_GRANTED:')||o.failure_origin==='PROVIDER_QUOTA'?'REQUEST_LIMIT':o.evaluated===true&&o.operational_success!==true?'SOURCE_NOT_CLOSED':o.evaluated!==true?'NOT_EVALUATED':'NO_ELIGIBLE_LEVEL';
  return {lane:label(r.lane),status:safeStatus,kind,actual_http:integer(o.actual_http),source_ts:integer(r.position_proof?.source_ts),original_clock_retained:integer(r.position_proof?.source_ts)!==null,complete_accounts_read:integer(r.position_proof?.position_search?.complete_accounts_read),full_market_census:r.position_proof?.position_search?.full_market_census===true};
 });
 const result={schema:'BOUND_LIQUIDATION_ACQUISITION_DIAGNOSTICS_V1',contract,run_id,snapshot_id,observed_ts,evaluated_ts:audit.evaluated_ts,routes,status:routes.length?'ATTEMPT_DIAGNOSTICS_RETAINED':'NO_CAPTURED_ROUTE',source_clocks_refreshed:false,diagnostic_only:true,source_state_proof:false,score_contribution:0,entry_authorized:false};
 return Buffer.byteLength(JSON.stringify(result))<=8192?result:null;
}
export function liquidationAcquisitionAbsenceText(receipt){
 if(receipt?.schema!=='BOUND_LIQUIDATION_ACQUISITION_DIAGNOSTICS_V1'||receipt.diagnostic_only!==true||receipt.source_clocks_refreshed!==false||receipt.source_state_proof!==false||receipt.score_contribution!==0||receipt.entry_authorized!==false)return null;
 const kinds=new Set((Array.isArray(receipt.routes)?receipt.routes:[]).map(r=>r.kind));
 if(kinds.has('ROLE_USABLE'))return 'Источник вернул контекст, но подходящие уровни не подтверждены.';
 const facts=[];
 if(kinds.has('EMPTY_BOUNDED_LEVEL_SAMPLE'))facts.push('проверенная выборка не дала подходящих уровней');
 if(kinds.has('ASSET_UNSUPPORTED'))facts.push('часть площадок не поддерживает монету');
 if(kinds.has('REQUEST_LIMIT'))facts.push('часть запросов ограничена лимитом');
 if(kinds.has('SOURCE_NOT_CLOSED'))facts.push('часть источников не удалось проверить');
 return facts.length?facts.map((v,i)=>i?v:v[0].toUpperCase()+v.slice(1)).join('; ')+'.':null;
}
