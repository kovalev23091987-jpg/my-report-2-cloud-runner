import {fingerprint,selectZones,timestamp} from './core.mjs';
// Data-only contract. Existing manual and Telegram layout owners consume the same
// persisted body; no score, direction, trigger or trade eligibility is generated.
export function compactLiquidationContext(receipts,identity){
 const {contract,direction,run_id,snapshot_id,as_of_ms,symbol}=identity??{};
 if(typeof contract!=='string'||!contract||!['LONG','SHORT'].includes(direction)||!run_id||!snapshot_id||timestamp(as_of_ms)===null||!symbol)throw Error('EXACT_CANONICAL_IDENTITY_REQUIRED');
 const sources=[],seen=new Set();
 for(const r of receipts){const {fingerprint:fp,...body}=r;
  if(fingerprint(body)!==fp||r.run_id!==run_id||r.snapshot_id!==snapshot_id||r.native_symbol!==symbol||r.analysis_as_of_ms!==as_of_ms)throw Error('RECEIPT_BINDING_OR_DIGEST_MISMATCH');
  if(seen.has(fp))continue;seen.add(fp);const selection=selectZones(r);const selected=[...(selection.above??[]),...(selection.below??[])];
  sources.push({provider:r.provider,venue:r.venue??null,upstream_groups:r.upstream_groups,source_fingerprint:fp,evidence_class:r.evidence_class,status:r.status,
   source_ts:r.source_ts??null,observed_at_ms:r.observed_at_ms??r.received_at_ms,source_clock_closed:r.source_clock_closed??(r.source_ts!==null&&r.source_ts!==undefined),
   context_usable:r.usable_for_context===true,coverage:r.coverage??null,whole_book_coverage_pct:r.whole_book_coverage_pct??null,model_validation:r.model_validation_status??null,
   zones:selected.map(z=>({native_price:z.native_price,side:z.liquidated_side,notional:z.notional,notional_unit:z.notional_unit,reference_price:z.native_reference_price,
    distance_pct:z.distance_pct,position_count:z.position_count,selection_roles:z.selection_roles,price_semantics:z.price_semantics,conditional_cross:z.conditional_on_other_positions??null,
    native_revalidation_required:z.native_revalidation_required??r.native_revalidation_required??false})),reason_codes:r.reasons??[],
   execution_alias_verified:r.execution_alias_verified===true});
 }
 const body={schema:'LIQUIDATION_CONTEXT_RESEARCH_V1',identity:{contract,direction,run_id,snapshot_id,as_of_ms,symbol},sources,
  normalized_into_htx_price:false,notional_summed_across_providers:false,independent_votes_generated:false,ready_for_entry:false,delivery_enabled:false,production_wired:false};
 const bytes=Buffer.byteLength(JSON.stringify(body));if(bytes>8192)throw Error('COMPACT_PAYLOAD_OVER_8KB_KEEP_RAW_ELSEWHERE');
 return {...body,fingerprint:fingerprint(body),body_bytes:bytes};
}
export function verifyCompactContext(value,expected){
 if(!value)return false;const {fingerprint:fp,body_bytes,...body}=value;
 return fingerprint(body)===fp&&['contract','direction','run_id','snapshot_id','as_of_ms','symbol'].every(k=>Object.hasOwn(expected,k)&&expected[k]===body.identity[k])&&Buffer.byteLength(JSON.stringify(body))===body_bytes;
}
