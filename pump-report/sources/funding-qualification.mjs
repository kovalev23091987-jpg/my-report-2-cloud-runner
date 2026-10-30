// Proof metadata is supplied by ROOT's independently reviewed registry.
// This template is intentionally inactive: the unified fraction premise is unresolved.
export const FUNDING_RATE_QUOTE_SNAPSHOT = 'FUNDING_RATE_QUOTE_SNAPSHOT_V1';
export const BINGX_FUNDING_QUOTE_PATH = '/openApi/swap/v2/quote/premiumIndex';
export const CCXT_BINGX_FUNDING_TRACE_REF = 'CCXT:d3159f7036f93db086cd0414642132fba5401710:bingx.ts:1827-1867:sha256:94bcede8e332f7c877fa6099708d3ce9e0642463366e13e09a068f116ffc98b0';
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const ref = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 512;
const supported = x => record(x) && x.status === 'SUPPORTED_CONSUMER' && x.evidence_ref === CCXT_BINGX_FUNDING_TRACE_REF;

export const BINGX_FUNDING_QUOTE_PROFILE_V1 = Object.freeze({
  mode: FUNDING_RATE_QUOTE_SNAPSHOT,
  evidence_ref: 'F588_BINGX_USDT_M_FUNDING_QUOTE_PROFILE_V1',
  provider: 'BINGX', family: 'USDT_M', route: BINGX_FUNDING_QUOTE_PATH,
  rate_field: 'lastFundingRate', rate_unit: 'RATE_FRACTION',
  qualification_basis: 'ADAPTER_BASED_INFERENCE',
  unit_proof_parts: Object.freeze({
    native_to_unified: Object.freeze({status: 'SUPPORTED_CONSUMER', evidence_ref: CCXT_BINGX_FUNDING_TRACE_REF}),
    unified_fraction: Object.freeze({status: 'UNKNOWN', unit: null, evidence_ref: null})
  }),
  clock_proof: Object.freeze({status: 'SUPPORTED_CONSUMER', evidence_ref: CCXT_BINGX_FUNDING_TRACE_REF,
    field: 'updateTime', role: 'RATE_QUOTE_SNAPSHOT', basis: 'CCXT_SUPPORTED_CONSUMER'}),
  period_proof: Object.freeze({status: 'SUPPORTED_CONSUMER', evidence_ref: CCXT_BINGX_FUNDING_TRACE_REF,
    field: 'fundingIntervalHours', unit: 'HOURS', basis: 'SAME_RESPONSE_ROW'})
});

export function qualifyBingxFundingQuote(q, instrument) {
  const present = record(q) && ref(q.evidence_ref);
  const scope = present && q.mode === FUNDING_RATE_QUOTE_SNAPSHOT
    && q.provider === 'BINGX' && q.family === 'USDT_M' && q.route === BINGX_FUNDING_QUOTE_PATH
    && q.rate_field === 'lastFundingRate' && q.qualification_basis === 'ADAPTER_BASED_INFERENCE'
    && instrument?.venue === 'BINGX' && instrument.market_type === 'PERPETUAL'
    && instrument.quote === 'USDT' && instrument.settle === 'USDT'
    && (instrument.margin === undefined || instrument.margin === 'USDT');
  const unitPart = q?.unit_proof_parts?.unified_fraction;
  const unit = Boolean(scope && q.rate_unit === 'RATE_FRACTION'
    && supported(q.unit_proof_parts?.native_to_unified) && record(unitPart)
    && unitPart.status === 'VERIFIED' && unitPart.unit === 'RATE_FRACTION' && ref(unitPart.evidence_ref));
  const clock = Boolean(scope && supported(q.clock_proof) && q.clock_proof.field === 'updateTime'
    && q.clock_proof.role === 'RATE_QUOTE_SNAPSHOT' && q.clock_proof.basis === 'CCXT_SUPPORTED_CONSUMER');
  const period = Boolean(scope && supported(q.period_proof) && q.period_proof.field === 'fundingIntervalHours'
    && q.period_proof.unit === 'HOURS' && q.period_proof.basis === 'SAME_RESPONSE_ROW');
  const reason = !present ? 'FUNDING_RATE_SOURCE_CLOCK_UNQUALIFIED'
    : !scope ? 'FUNDING_QUOTE_PROFILE_SCOPE_UNQUALIFIED'
      : !unit ? 'FUNDING_RATE_UNIT_UNQUALIFIED'
        : !clock ? 'FUNDING_RATE_SOURCE_CLOCK_UNQUALIFIED'
          : !period ? 'FUNDING_PERIOD_RULE_UNQUALIFIED' : null;
  return {qualified: reason === null, reason, unit_qualified: unit, clock_qualified: clock, period_qualified: period,
    evidence_ref: present ? q.evidence_ref : null,
    unit_evidence_ref: unit ? unitPart.evidence_ref : null,
    unit_qualification_basis: 'ADAPTER_BASED_INFERENCE',
    native_to_unified_evidence_ref: supported(q?.unit_proof_parts?.native_to_unified) ? CCXT_BINGX_FUNDING_TRACE_REF : null,
    clock_evidence_ref: clock ? CCXT_BINGX_FUNDING_TRACE_REF : null,
    period_evidence_ref: period ? CCXT_BINGX_FUNDING_TRACE_REF : null,
    vendor_unit_guarantee_claimed: false, vendor_quote_clock_guarantee_claimed: false};
}
