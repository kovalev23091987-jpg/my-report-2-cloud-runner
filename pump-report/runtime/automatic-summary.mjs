// Bounded projection of an already returned AUTO result; never a new-send or outcome proof.
export function autoRunSummary(r, pin) {
  const arr = v => Array.isArray(v) ? v : null;
  const nat = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
  const member = (v, set, fallback) => set.has(v) ? v : fallback;
  const runStates = new Set(['COMPLETE', 'INCOMPLETE', 'EXECUTOR_BUSY']);
  const discoveryStates = new Set(['INCOMPLETE_COVERAGE_OR_RESOURCES', 'READY_IDEAS_FOUND', 'NO_READY_IDEAS_IN_CHECKED_SCOPE']);
  const deliveryStates = new Set(['SENT', 'UNKNOWN', 'ERROR', 'STALE', 'SUPPRESSED', 'RETRYABLE', 'SENDING', 'READY', 'BACKOFF', 'CARD_NOT_FOUND']);
  const codes = new Set([
    'SOURCE_EVIDENCE_PENDING', 'UNIVERSE_QUALIFICATION_INCOMPLETE', 'SOURCE_BUDGET_DEFERRED',
    'PROTECTED_DAY_RESERVE', 'EVEN_DAY_CANDIDATE_ALLOCATION', 'NATIVE_CORE_UNIT_EVIDENCE_REQUIRED',
    'SURPLUS_NATIVE_ADMISSION_REQUIRED', 'SURPLUS_NATIVE_CAPACITY_REQUIRED', 'SURPLUS_PROVIDER_BACKOFF',
    'SURPLUS_LOGICAL_GRANT_LIMIT', 'SURPLUS_LOGICAL_GRANT_ALREADY_SPENT', 'SURPLUS_CANDIDATE_ID_REQUIRED',
    'SURPLUS_IDEMPOTENCY_COST_MISMATCH', 'SURPLUS_NATIVE_DAY_BOUNDARY_REQUIRED',
    'RUN_RESOURCES_DEFERRED', 'EXECUTOR_LEASE_EXPIRED', 'WORK_INDEX_MIGRATING',
    'MANDATORY_PRICE_NOT_USABLE', 'MANDATORY_CANDLES_NOT_USABLE', 'MANDATORY_ORDERBOOK_NOT_USABLE',
    'CURRENT_ACTIVITY_NOT_CONFIRMED', 'NO_SUPPORTED_POSITION_SIZE',
    'INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED', 'PLAN_POTENTIAL_BELOW_OWNER_MINIMUM',
    'PLAN_POTENTIAL_UNQUALIFIED', 'PLAN_INVALIDATED', 'WAVE_LIFETIME_EXPIRED',
    'MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION', 'OWNER_ASSET_DELIVERY_EXCLUDED',
    'NO_SUBSTANTIAL_PLAN_CHANGE', 'RECHECK_FAILED_BEFORE_SEND', 'SCENARIO_RECHECK_FAILED',
    'PUBLICATION_WINDOW_CLOSED', 'TELEGRAM_RATE_LIMIT', 'TELEGRAM_REJECTED', 'TELEGRAM_ACK_UNKNOWN'
  ]);
  const checked = arr(r?.checked), manual = arr(r?.manual), drain = arr(r?.delivery);
  const normal = checked !== null && manual !== null && drain !== null;
  const deferred = arr(r?.deferred) ?? (normal ? [] : null);
  const errors = arr(r?.errors) ?? [];
  const analyses = checked?.filter(x => x?.analysis && typeof x.analysis === 'object').map(x => x.analysis);
  const deliveries = [
    ...(checked ?? []).filter(x => x?.delivery).map(x => ({origin:'CHECKED_INLINE', value:x.delivery})),
    ...(manual ?? []).filter(x => x?.result?.delivery).map(x => ({origin:'MANUAL_INLINE', value:x.result.delivery})),
    ...(drain ?? []).map(value => ({origin:'QUEUE_DRAIN', value}))
  ];
  const rawCodes = [
    ...errors.map(x => typeof x === 'string' ? x : x?.reason),
    ...(deferred ?? []).flatMap(x => [x?.source_coverage?.reason, x?.source_coverage?.detail]),
    ...(checked ?? []).filter(x => !x?.analysis).map(x => x?.source_coverage?.reason),
    ...(analyses ?? []).flatMap(x => arr(x?.reasons) ?? []),
    ...deliveries.map(x => x.value?.reason)
  ].filter(x => typeof x === 'string');
  const reasonCodes = [...new Set(rawCodes.map(x => codes.has(x) ? x : 'OTHER_CODE'))];
  const stateCounts = {};
  for (const x of deliveries) {
    const state = member(x.value?.state, deliveryStates, 'OTHER_STATE');
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
  }
  return {
    schema:'PUMP_AUTO_SUMMARY_V1', mode:'AUTO',
    run_id:typeof r?.run_id === 'string' && /^[a-f0-9-]{36}$/i.test(r.run_id) ? r.run_id : null,
    implementation_pin:typeof pin === 'string' && /^[a-f0-9]{64}$/.test(pin) ? pin : null,
    status:member(r?.status, runStates, 'OTHER_STATUS'),
    discovery_result:member(r?.discovery_result, discoveryStates, null),
    counts:{
      checked_entries:checked?.length ?? null, analysis_results:analyses?.length ?? null,
      ready_results:analyses?.filter(x => x.ready === true).length ?? null,
      ready_auto_eligible_results:analyses?.filter(x => x.ready === true && x.automatic_eligible === true).length ?? null,
      manual_results:manual?.length ?? null, budget_deferred_entries:deferred?.length ?? null,
      source_pending:nat(r?.source_evidence_coverage?.temporarily_deferred),
      catalog_unresolved:nat(errors.find(x => x?.reason === 'UNIVERSE_QUALIFICATION_INCOMPLETE')?.unqualified)
    },
    phase_flags:{
      executor_busy:r?.status === 'EXECUTOR_BUSY',
      analysis_result_seen:analyses === null || analyses === undefined ? null : analyses.length > 0,
      budget_defer_seen:deferred === null ? null : deferred.length > 0,
      delivery_result_seen:normal ? deliveries.length > 0 : null
    },
    reason_codes:reasonCodes.slice(0,12), reason_codes_truncated:reasonCodes.length > 12,
    unlisted_reason_occurrences:rawCodes.filter(x => !codes.has(x)).length,
    delivery:{
      complete_result_envelope:normal,
      reported_occurrences:normal ? deliveries.length : null,
      occurrences_by_state:normal ? stateCounts : null,
      refs:deliveries.slice(0,8).map(({origin, value:d}) => ({
        origin, state:member(d?.state, deliveryStates, 'OTHER_STATE'),
        card_id:typeof d?.card_id === 'string' && /^PUMP:[a-f0-9]{64}$/.test(d.card_id) ? d.card_id : null,
        message_id:/^[1-9][0-9]{0,19}$/.test(String(d?.message_id ?? '')) ? String(d.message_id) : null,
        receipt_readback_reported:typeof d?.receipt_readback === 'boolean' ? d.receipt_readback : null
      })),
      refs_truncated:deliveries.length > 8
    }
  };
}

