/**
 * TZ 10.1 R5: authoritative SAFETY-level hard-veto producer.
 *
 * Scope is deliberately narrow. It decides only whether the factual inputs
 * prove one of the safety blockers owned by this layer (instrument identity /
 * tradability, reference-size executability, critical-data contradiction or
 * critical-data closure). Scenario confirmation, entry timing, invalidation,
 * targets, costs and personal portfolio risk remain separate Final Decision
 * gates and are NEVER converted to CLEAR here.
 *
 * CLEAR therefore means "no producer-owned safety veto", not "enter trade".
 */
import { verifyExecutionFacts } from './tz101-execution-facts.mjs';

export const TZ101_HARD_VETO_VERSION = 'tz101-hard-veto-producer-r5';
export const TZ101_HARD_VETO_RULES_VERSION = 'safety-gate-snapshot-v1';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stamp = (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 1_000_000_000_000;
const cleanContract = (v) => typeof v === 'string' ? v.trim().normalize('NFC') : '';
const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const ENTRY_CRITICAL_CHAINS = new Set(['CROSS_EXCHANGE_DERIVATIVES','MARKET_STRENGTH_SPOT']);
const SUPPORTING_CHAINS = new Set(['SMART_MONEY_ONCHAIN','SUPPORTING_RISK']);

function check(name, status, reason = null, detail = null) {
  return { name, status, reason, detail };
}

function fullEvidenceChecks(full, { contract_code, observed_ts }) {
  const rows = [];
  if (!isObj(full)) {
    rows.push(check('CRITICAL_DATA_ENVELOPE', 'UNKNOWN', 'FULL_EVIDENCE_RECORD_MISSING'));
    return rows;
  }
  const fullContract = cleanContract(full.contract_code ?? full.contract);
  if (!fullContract) rows.push(check('CRITICAL_DATA_IDENTITY', 'UNKNOWN', 'FULL_EVIDENCE_CONTRACT_MISSING'));
  else if (fullContract !== contract_code) rows.push(check('CRITICAL_DATA_IDENTITY', 'REFUTED', 'FULL_EVIDENCE_CONTRACT_MISMATCH'));
  else rows.push(check('CRITICAL_DATA_IDENTITY', 'CONFIRMED'));

  const ts = Number(full.observed_ts);
  if (!stamp(ts)) rows.push(check('CRITICAL_DATA_TIME', 'UNKNOWN', 'FULL_EVIDENCE_TIME_MISSING'));
  else if (ts > observed_ts) rows.push(check('CRITICAL_DATA_TIME', 'REFUTED', 'FULL_EVIDENCE_FROM_FUTURE'));
  else if (ts !== observed_ts) rows.push(check('CRITICAL_DATA_TIME', 'UNKNOWN', 'FULL_EVIDENCE_SNAPSHOT_TIME_NOT_EXACT'));
  else rows.push(check('CRITICAL_DATA_TIME', 'CONFIRMED'));

  const conflicts = Array.isArray(full.conflicts) ? full.conflicts.filter((c) => c?.unresolved !== false) : null;
  if (conflicts === null) rows.push(check('CRITICAL_DATA_CONFLICTS', 'UNKNOWN', 'FULL_EVIDENCE_CONFLICT_SET_MISSING'));
  else if (conflicts.length) rows.push(check('CRITICAL_DATA_CONFLICTS', 'REFUTED', 'UNRESOLVED_CRITICAL_DATA_CONFLICT', { count: conflicts.length }));
  else rows.push(check('CRITICAL_DATA_CONFLICTS', 'CONFIRMED'));

  const dq = full.data_quality;
  const chainStatus = isObj(full.chain_status) ? full.chain_status : null;
  const criticalClosed = chainStatus && [...ENTRY_CRITICAL_CHAINS].every((chain) => chainStatus?.[chain]?.chain_closed === true);
  if (!isObj(dq) || typeof dq.status !== 'string') {
    rows.push(check('CRITICAL_DATA_QUALITY', 'UNKNOWN', 'FULL_EVIDENCE_DATA_QUALITY_MISSING'));
  } else if (Number(dq.unresolved_conflicts ?? 0) > 0 || Number(dq.future_items ?? 0) > 0 || Number(dq.incompatible_items ?? 0) > 0 ||
      ['BLOCKED','CONFLICT','CONFLICTING','FUTURE'].includes(String(dq.status).toUpperCase())) {
    rows.push(check('CRITICAL_DATA_QUALITY', 'REFUTED', 'CRITICAL_DATA_QUALITY_CONTRADICTION_OR_INVALID_SOURCE'));
  } else if (criticalClosed) {
    // A PARTIAL top-level DQ caused only by supporting/advisory blocks does not
    // become a hard veto. Those blocks remain visible uncertainty elsewhere.
    rows.push(check('CRITICAL_DATA_QUALITY', 'CONFIRMED'));
  } else {
    rows.push(check('CRITICAL_DATA_QUALITY', 'UNKNOWN', 'ENTRY_CRITICAL_DATA_CHAINS_NOT_CLOSED'));
  }

  if (!Array.isArray(full.missing_weighted_chains)) {
    rows.push(check('MANDATORY_WEIGHTED_DATA_BLOCKS', 'UNKNOWN', 'MISSING_WEIGHTED_CHAIN_SET_MISSING'));
  } else {
    const missingCritical = full.missing_weighted_chains.map((x)=>String(x).toUpperCase()).filter((x)=>ENTRY_CRITICAL_CHAINS.has(x));
    const supportingMissing = full.missing_weighted_chains.map((x)=>String(x).toUpperCase()).filter((x)=>SUPPORTING_CHAINS.has(x));
    if (missingCritical.length) {
      rows.push(check('MANDATORY_WEIGHTED_DATA_BLOCKS', 'UNKNOWN', 'ENTRY_CRITICAL_WEIGHTED_DATA_BLOCKS_NOT_CLOSED', {
        missing_critical: missingCritical, supporting_uncertainty: supportingMissing,
      }));
    } else {
      rows.push(check('MANDATORY_WEIGHTED_DATA_BLOCKS', 'CONFIRMED', null, { supporting_uncertainty: supportingMissing }));
    }
  }
  return rows;
}

function strictNonTradingVeto(snapshot, contract, observedTs) {
  if (!isObj(snapshot) || snapshot.version !== 'tz101-htx-execution-facts-r3' || snapshot.status !== 'NOT_CLOSED' ||
      snapshot.check !== 'REFUTED' || !Array.isArray(snapshot.reasons) || snapshot.reasons.length !== 1 ||
      snapshot.reasons[0] !== 'HTX_CONTRACT_NOT_TRADING' || !isObj(snapshot.facts)) return null;
  const f = snapshot.facts;
  if (cleanContract(f.contract_code) !== contract || !Number.isSafeInteger(f.contract_status) || f.contract_status === 1 ||
      !stamp(f.instrument_source_ts) || !stamp(f.received_ts) || f.instrument_source_ts > f.received_ts ||
      f.received_ts > observedTs || observedTs - f.instrument_source_ts > 60_000) return null;
  return { contract_status: f.contract_status, source_ts: f.instrument_source_ts, available_ts: f.received_ts };
}

export function produceTz101HardVeto({
  contract_code,
  snapshot_id,
  observed_ts,
  safety_gate_receipt_id,
  full_evidence_record,
  execution_snapshot,
} = {}) {
  const contract = cleanContract(contract_code);
  const snapshot = typeof snapshot_id === 'string' ? snapshot_id.trim() : '';
  if (!contract || !snapshot || !stamp(observed_ts) || typeof safety_gate_receipt_id !== 'string' || !safety_gate_receipt_id.trim()) {
    return null;
  }

  const checks = fullEvidenceChecks(full_evidence_record, { contract_code: contract, observed_ts });
  const factual = verifyExecutionFacts(execution_snapshot, { contract_code: contract, observed_ts });
  const verified = isObj(factual?.facts) && isObj(factual?.plans);
  let executionSourceTs = null;
  let executionAvailableTs = null;
  let executionExpiry = null;

  if (verified) {
    executionSourceTs = factual.facts.book_source_ts;
    executionAvailableTs = factual.facts.received_ts;
    executionExpiry = factual.facts.valid_until_ts;
    checks.push(check('HTX_INSTRUMENT_IDENTITY', factual.facts.contract_code === contract ? 'CONFIRMED' : 'REFUTED',
      factual.facts.contract_code === contract ? null : 'HTX_INSTRUMENT_IDENTITY_MISMATCH'));
    checks.push(check('HTX_FUTURES_TRADING', factual.facts.contract_status === 1 ? 'CONFIRMED' : 'REFUTED',
      factual.facts.contract_status === 1 ? null : 'HTX_CONTRACT_NOT_TRADING'));
    const closedDirections = ['LONG', 'SHORT'].filter((d) => factual.plans[d]?.status === 'CLOSED');
    const allRefuted = ['LONG', 'SHORT'].every((d) => factual.plans[d]?.check === 'REFUTED');
    checks.push(check('REFERENCE_SIZE_EXECUTABILITY', closedDirections.length ? 'CONFIRMED' : allRefuted ? 'REFUTED' : 'UNKNOWN',
      closedDirections.length ? null : allRefuted ? 'REFERENCE_SIZE_NOT_EXECUTABLE_IN_EITHER_DIRECTION' : 'REFERENCE_SIZE_EXECUTABILITY_NOT_CLOSED',
      { closed_directions: closedDirections }));
  } else {
    const nonTrading = strictNonTradingVeto(execution_snapshot, contract, observed_ts);
    if (nonTrading) {
      executionSourceTs = nonTrading.source_ts;
      executionAvailableTs = nonTrading.available_ts;
      executionExpiry = nonTrading.source_ts + 60_000;
      checks.push(check('HTX_INSTRUMENT_IDENTITY', 'CONFIRMED'));
      checks.push(check('HTX_FUTURES_TRADING', 'REFUTED', 'HTX_CONTRACT_NOT_TRADING', { contract_status: nonTrading.contract_status }));
      checks.push(check('REFERENCE_SIZE_EXECUTABILITY', 'UNKNOWN', 'REFERENCE_SIZE_NOT_APPLICABLE_WHILE_CONTRACT_NOT_TRADING'));
    } else {
      checks.push(check('HTX_INSTRUMENT_IDENTITY', 'UNKNOWN', factual?.reasons?.[0] || 'HTX_EXECUTION_FACTS_NOT_CLOSED'));
      checks.push(check('HTX_FUTURES_TRADING', 'UNKNOWN', factual?.reasons?.[0] || 'HTX_EXECUTION_FACTS_NOT_CLOSED'));
      checks.push(check('REFERENCE_SIZE_EXECUTABILITY', 'UNKNOWN', factual?.reasons?.[0] || 'HTX_EXECUTION_FACTS_NOT_CLOSED'));
    }
  }

  const vetoChecks = checks.filter((c) => c.status === 'REFUTED');
  const unknownChecks = checks.filter((c) => c.status === 'UNKNOWN');
  const producerOwnedStatus = vetoChecks.length ? 'VETO' : unknownChecks.length ? 'UNKNOWN' : 'CLEAR';
  // This producer may prove a hard blocker immediately, but it must not turn a
  // clean narrow safety scope into GLOBAL CLEAR while mandatory non-owned hard
  // gates (scenario/invalidation/entry-area/target+all-costs/applicable safety
  // rules) are not yet bound to this immutable safety receipt.
  const status = producerOwnedStatus === 'VETO' ? 'VETO' : 'UNKNOWN';
  const authoritative = status === 'VETO';
  const sourceCandidates = [Number(full_evidence_record?.observed_ts), executionSourceTs].filter(stamp);
  const sourceTs = sourceCandidates.length ? Math.min(...sourceCandidates) : observed_ts;
  const expiryCandidates = [observed_ts + 60_000, executionExpiry].filter(stamp);
  const validUntilTs = expiryCandidates.length ? Math.min(...expiryCandidates) : observed_ts + 60_000;
  const availableCandidates = [observed_ts, executionAvailableTs].filter(stamp);
  const availableTs = availableCandidates.length ? Math.max(...availableCandidates) : observed_ts;

  return {
    version: TZ101_HARD_VETO_VERSION,
    status,
    authoritative,
    contract_code: contract,
    snapshot_id: snapshot,
    source_ts: sourceTs,
    available_ts: availableTs,
    max_age_ms: 60_000,
    valid_until_ts: validUntilTs,
    safety_gate_receipt_id: safety_gate_receipt_id,
    producer_rules_version: TZ101_HARD_VETO_RULES_VERSION,
    scope: 'SAFETY_LEVEL_BLOCKERS_ONLY_OTHER_ENTRY_GATES_REMAIN_SEPARATE',
    checks,
    reasons: uniq(vetoChecks.map((c) => c.reason)),
    unknown_reasons: uniq([
      ...unknownChecks.map((c) => c.reason),
      ...(producerOwnedStatus === 'VETO' ? [] : ['NON_OWNED_HARD_VETO_GATES_NOT_CLOSED']),
    ]),
    producer_owned_status: producerOwnedStatus,
    producer_owned_assessment_complete: producerOwnedStatus !== 'UNKNOWN',
    non_owned_entry_gates: [
      'SCENARIO_REQUIRED_EVIDENCE', 'THESIS_INVALIDATION', 'CURRENT_ENTRY_AREA',
      'REALISTIC_TARGET_RISK_ALL_COSTS', 'APPLICABLE_SAFETY_RULES',
      'PERSONAL_PORTFOLIO_RISK_WHEN_POSITION_CONFIRMED',
    ],
    semantics: status === 'VETO'
      ? 'AT_LEAST_ONE_PRODUCER_OWNED_HARD_BLOCKER_FACTUALLY_CONFIRMED'
      : producerOwnedStatus === 'CLEAR'
        ? 'PRODUCER_OWNED_SCOPE_CLEAR_GLOBAL_HARD_VETO_REMAINS_UNKNOWN_UNTIL_OTHER_GATES_CLOSE'
        : 'NO_VETO_PROVEN_BUT_REQUIRED_PRODUCER_INPUTS_REMAIN_UNKNOWN',
  };
}
