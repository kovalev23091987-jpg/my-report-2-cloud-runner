// Pure operator coverage. Accept sanitized evidence metadata, never market values.
const time=x=>Number.isSafeInteger(x)&&x>0;
const kinds=['core','growth_24h','liquidations'];
const code=x=>typeof x==='string'&&/^[A-Z0-9_:.-]{1,160}$/.test(x)?x:null;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const notChecked=o=>/^NOT_CHECKED(?:_|$)/.test(o?.status_at_capture??'');
export function normalizeSourceCoverage({registry,as_of_ts,observations=[],reports=[],summary=null,universe={},delivery_policy={}}){
  if(!Array.isArray(registry)||!time(as_of_ts))throw Error('COVERAGE_REGISTRY_AND_ASOF_REQUIRED');
  const instruments=registry.map(e=>e.instrument??e),ids=new Set(instruments.map(i=>i.instrument_id));
  if(ids.size!==instruments.length||instruments.some(i=>i.classification_status!=='VERIFIED_CRYPTO'))throw Error('COVERAGE_VERIFIED_UNIQUE_IDENTITIES_REQUIRED');
  if(delivery_policy.excluded_asset_ids!==undefined&&(!Array.isArray(delivery_policy.excluded_asset_ids)||delivery_policy.excluded_asset_ids.some(id=>typeof id!=='string'||!id)))throw Error('OWNER_DELIVERY_ASSET_IDS_REQUIRED');
  const excluded=new Set(delivery_policy.excluded_asset_ids??[]);
  if(excluded.size&&(typeof delivery_policy.evidence_ref!=='string'||!delivery_policy.evidence_ref.trim()))throw Error('OWNER_DELIVERY_EXCLUSION_EVIDENCE_REQUIRED');
  const latest=new Map(),everChecked=new Set(),everUsable=new Set();
  for(const o of observations){
    if(!ids.has(o.instrument_id)||!kinds.includes(o.kind)||!time(o.capture_ts)||o.capture_ts>as_of_ts||!o.receipt_ref||!hash(o.artifact_sha256))throw Error('COVERAGE_OBSERVATION_EVIDENCE_REQUIRED');
    for(const k of ['event_ts','received_ts','expires_ts','freshness_upper_bound_ts'])if(o[k]!=null&&!time(o[k]))throw Error('COVERAGE_CLOCK_INVALID');
    if(o.event_ts!=null&&o.received_ts!=null&&o.event_ts>o.received_ts||o.expires_ts!=null&&o.event_ts!=null&&o.expires_ts<o.event_ts)throw Error('COVERAGE_CLOCK_ORDER_INVALID');
    const key=o.instrument_id+'|'+o.kind,old=latest.get(key);
    if(!notChecked(o)){everChecked.add(key);if(o.status_at_capture==='USABLE')everUsable.add(key);}
    if(old?.capture_ts===o.capture_ts&&old.receipt_ref!==o.receipt_ref)throw Error('AMBIGUOUS_COVERAGE_OBSERVATION');
    if(!old||o.capture_ts>=old.capture_ts)latest.set(key,o);
  }
  function cell(o,key){
    if(!o)return{ever_checked:false,ever_usable_at_capture:null,current_fresh:false,not_checked:true,absent:false,unqualified:null,expired:null,current_state:'NOT_CHECKED',reason_codes:['NOT_CHECKED'],event_ts:null,received_ts:null,expires_ts:null,capture_ts:null,receipt_ref:null,artifact_sha256:null};
    // A budget/qualification refusal may have a reservation receipt. It is
    // evidence of a skipped check, not an observed source response. Preserve
    // earlier actual checks separately from the latest attempt's state.
    if(notChecked(o))return{...cell(null),ever_checked:everChecked.has(key),
      ever_usable_at_capture:everChecked.has(key)?everUsable.has(key):null,status_at_capture:o.status_at_capture,
      reason_codes:[...new Set(['NOT_CHECKED',...(o.reason_codes??[]).map(code).filter(Boolean)])],
      event_ts:o.event_ts??null,received_ts:o.received_ts??null,expires_ts:o.expires_ts??null,
      capture_ts:o.capture_ts,receipt_ref:o.receipt_ref,artifact_sha256:o.artifact_sha256,
      freshness_upper_bound_ts:o.freshness_upper_bound_ts??null,freshness_basis:o.freshness_basis??null,
      clock_missing_reason:o.clock_missing_reason??null,evidence_role:'SKIPPED_CHECK_METADATA'};
    const expiry=o.expires_ts??o.freshness_upper_bound_ts??null,expired=expiry===null?null:as_of_ts>expiry;
    const unqualified=o.qualified===false,absent=o.status_at_capture==='ABSENT';
    const fresh=o.status_at_capture==='USABLE'&&o.qualified===true&&time(o.event_ts)&&time(o.received_ts)&&time(o.expires_ts)&&o.received_ts<=as_of_ts&&!expired;
    const state=unqualified?'UNQUALIFIED':absent?'ABSENT':expired?'STALE':fresh?'CURRENT_FRESH':'FRESHNESS_UNKNOWN';
    return{ever_checked:true,ever_usable_at_capture:everUsable.has(key),status_at_capture:o.status_at_capture,
      current_fresh:fresh,not_checked:false,absent,unqualified,expired,current_state:state,
      reason_codes:[...new Set([...(o.reason_codes??[]).map(code).filter(Boolean),...(expired?['SOURCE_EXPIRED_AT_ASOF']:[])])],
      event_ts:o.event_ts??null,received_ts:o.received_ts??null,expires_ts:o.expires_ts??null,
      clock_missing_reason:o.clock_missing_reason??null,capture_ts:o.capture_ts,freshness_upper_bound_ts:o.freshness_upper_bound_ts??null,
      freshness_basis:o.freshness_basis??null,receipt_ref:o.receipt_ref,artifact_sha256:o.artifact_sha256};
  }
  const rows=instruments.map(i=>({instrument_id:i.instrument_id,asset_id:i.asset_id,native_symbol:i.native_symbol,
    crypto_classification:'VERIFIED_CRYPTO',owner_delivery_excluded:excluded.has(i.asset_id),delivery_eligible_verified:!excluded.has(i.asset_id),
    sources:Object.fromEntries(kinds.map(k=>[k,cell(latest.get(i.instrument_id+'|'+k),i.instrument_id+'|'+k)]))}));
  const aggregate=scope=>Object.fromEntries(kinds.map(k=>{const cells=scope.map(r=>r.sources[k]);return[k,{denominator_verified:scope.length,
    ever_checked:cells.filter(c=>c.ever_checked).length,current_fresh:cells.filter(c=>c.current_fresh).length,
    not_checked:cells.filter(c=>c.not_checked).length,absent:cells.filter(c=>c.absent).length,
    unqualified:cells.filter(c=>c.unqualified).length,expired:cells.filter(c=>c.expired).length,
    ever_usable_at_capture:cells.filter(c=>c.ever_usable_at_capture===true).length}];}));
  const totals=aggregate(rows),deliverable=rows.filter(r=>r.delivery_eligible_verified),deliverable_totals=aggregate(deliverable);
  const seen=new Set(),ready=[];
  for(const r of reports){if(!ids.has(r.instrument_id)||!hash(r.artifact_sha256))throw Error('COVERAGE_REPORT_EVIDENCE_REQUIRED');
    if(r.ready!==true||r.mode!=='MANUAL'||r.delivery_state!=='SENT'||r.map_mode!=='WITHOUT_MAP')continue;
    if(!/^[1-9][0-9]*$/.test(String(r.message_id))||!time(r.analysis_ts)||r.analysis_ts>as_of_ts||!code(r.map_reason))throw Error('COVERAGE_SAVED_ANALYSIS_REASON_REQUIRED');
    const key=r.instrument_id+'|'+r.message_id;if(seen.has(key))continue;seen.add(key);
    const classification=['PRODUCTION','ACCEPTANCE_TEST'].includes(r.report_classification)?r.report_classification:'UNCLASSIFIED';
    const ownerExcluded=excluded.has(instruments.find(i=>i.instrument_id===r.instrument_id).asset_id);
    ready.push({instrument_id:r.instrument_id,mode:r.mode,message_id:String(r.message_id),delivery_state:r.delivery_state,map_mode:r.map_mode,
      report_classification:classification,currently_owner_delivery_excluded:ownerExcluded,production_count_eligible:classification==='PRODUCTION'&&!ownerExcluded,
      map_reason_from_saved_analysis:r.map_reason,analysis_ts:r.analysis_ts,artifact_sha256:r.artifact_sha256});
  }
  return{schema:'PUMP_OPERATOR_SOURCE_COVERAGE_V2_OWNER_DELIVERY',as_of_ts,scope:'CURATED_VERIFIED_IDENTITIES_NOT_FULL_EXCHANGE',
    verified_denominator:rows.length,complete_crypto_N:null,unknown_active_USDT:universe.unknown_active_USDT??null,
    deliverable_verified_denominator:deliverable.length,owner_delivery_excluded_verified_count:rows.length-deliverable.length,
    owner_delivery_excluded_asset_ids:[...excluded],owner_delivery_policy_ref:delivery_policy.evidence_ref??null,
    owner_excluded_gold_backed:universe.owner_excluded_gold_backed??null,universe_counts_as_of:universe.as_of_ts??null,
    unknown_identities_outside_verified_denominator:true,rows,totals,deliverable_totals,axes_overlap:true,
    axes_note:'Historical checks and latest not_checked can overlap; unqualified and expired can overlap. Not_checked is not absent. Do not sum these axes as exclusive buckets.',
    ready_without_map_manual_sent_count:ready.filter(r=>r.production_count_eligible).length,
    production_ready_without_map_manual_sent_count:ready.filter(r=>r.production_count_eligible).length,
    acceptance_test_ready_without_map_manual_sent_count:ready.filter(r=>r.report_classification==='ACCEPTANCE_TEST').length,
    historical_ready_without_map_manual_sent_count:ready.length,ready_without_map_reports:ready,
    readiness_count_is_asset_quality_or_probability:false,success_rate_pct:null,probability:null,
    summary_snapshot:summary?{status_at_capture:summary.status,as_of_ts:summary.as_of_ts,independent_waves:summary.independent_waves,
      pending_waves:summary.pending_waves,mature_waves:summary.mature_waves,evidence_class:summary.evidence_class??null,
      mode:summary.mode??null,publication:summary.publication??null,map_mode:summary.map_mode??null,
      report_context:summary.report_context??'UNCLASSIFIED',production_count_eligible:summary.report_context==='PRODUCTION',
      receipt_ref:summary.receipt_ref??null,artifact_sha256:summary.artifact_sha256??null,current_summary_freshness:null}:null};
}
