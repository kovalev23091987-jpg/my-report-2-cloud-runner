import assert from 'node:assert/strict';
import { buildShadowDecisionTelemetry } from '../src/shadow-decision-model.mjs';
import { buildFullEvidenceEnvelope } from '../src/full-evidence-contract.mjs';
globalThis.buildFullEvidenceEnvelope = buildFullEvidenceEnvelope;
const { buildFullEvidenceShadowRecord } = await import('../src/full-evidence-shadow-model.mjs');

const NOW = 1800000000000;

function baseEvidence() {
  return {
    contract: 'TEST-USDT',
    now: NOW,
    futures: {
      status: 'fulfilled',
      data: {
        contract: 'TEST-USDT',
        coverage: {
          htx_futures_liquidity: 'closed',
          htx_futures_order_flow_sample: 'closed',
          // Exact-window CVD intentionally remains not closed.
          htx_futures_order_flow: 'not_closed',
          htx_open_interest: 'closed',
          htx_funding: 'closed',
        },
        funding: { funding_rate_pct: -0.02 },
        liquidity: {
          spread_bps: 3.2,
          buy_market_impact: { impact_bps: 4.1, fill_ratio_pct: 100 },
          sell_market_impact: { impact_bps: 4.8, fill_ratio_pct: 100 },
        },
      },
    },
    spot: {
      status: 'fulfilled',
      data: { quality_status: 'YELLOW', order_flow: { windows: {} } },
    },
    trajectory: {
      status: 'fulfilled',
      data: {
        coverage: {
          price_5m: 'closed', price_15m: 'closed',
          price_1h: 'closed', price_4h: 'closed', price_24h: 'closed',
          flow_1h: 'not_closed', flow_4h: 'not_closed', flow_24h: 'not_closed',
          oi_1h: 'closed', oi_4h: 'closed', oi_24h: 'closed',
          funding_current: 'closed', funding_history: 'closed',
        },
        windows: {
          '1h': { price: { change_pct: 1.1 }, open_interest: { contracts: { change_pct: 2.2 } } },
          '4h': { price: { change_pct: 1.8 }, open_interest: { contracts: { change_pct: 4.5 } } },
          '24h': { price: { change_pct: 3.4 }, open_interest: { contracts: { change_pct: 7.1 } } },
        },
      },
    },
    history: { status: 'fulfilled', data: { series: [{ ts: NOW - 300000 }] } },
    dataSufficiency: { classification: 'PARTIAL' },
  };
}

// New schema: factual execution lane can close even while exact-window CVD remains not_closed.
const partialCvd = buildShadowDecisionTelemetry(baseEvidence());
assert.equal(partialCvd.htx_execution_gate_closed, true);
assert.equal(partialCvd.eq.status, 'SHADOW_MEASURABLE');
assert.equal(partialCvd.eq.exact_window_cvd_closed, false);
assert.equal(partialCvd.dq.status, 'PARTIAL');
assert.equal(partialCvd.actual_decision_generated, false);
assert.equal(partialCvd.validated, false);
assert.equal(partialCvd.telegram_started, false);
assert.equal(partialCvd.live_execution_allowed, false);

// Full Evidence must preserve the execution closure but keep missing directional/external chains missing.
const full = buildFullEvidenceShadowRecord({
  shadow_decision: partialCvd,
  public_evidence: { version: 'test', observed_ts: NOW, evidence: [] },
  now: NOW,
});
assert.equal(full.htx_execution_gate_closed, true);
assert.equal(full.chain_status.HTX_EXECUTION.chain_closed, true);
assert.ok(full.missing_weighted_chains.includes('CROSS_EXCHANGE_DERIVATIVES'));
assert.ok(full.missing_weighted_chains.includes('MARKET_STRENGTH_SPOT'));
assert.equal(full.decision.full_decision_eligible, false);
assert.equal(full.decision.live_signal, false);
assert.equal(full.decision.validated, false);
assert.equal(full.decision.trading_execution, false);

// Fill below the factual requested-notional threshold must fail execution closure.
const badFill = baseEvidence();
badFill.futures.data.liquidity.buy_market_impact.fill_ratio_pct = 98.7;
const badFillDecision = buildShadowDecisionTelemetry(badFill);
assert.equal(badFillDecision.htx_execution_gate_closed, false);
assert.equal(badFillDecision.eq.status, 'NOT_CLOSED');

// Missing recent trade sample in the new schema must fail closed.
const noSample = baseEvidence();
noSample.futures.data.coverage.htx_futures_order_flow_sample = 'not_closed';
const noSampleDecision = buildShadowDecisionTelemetry(noSample);
assert.equal(noSampleDecision.htx_execution_gate_closed, false);

// Legacy schema compatibility: if the separate sample field did not yet exist,
// a previously CLOSED factual order-flow field can stand in only for sample availability.
const legacy = baseEvidence();
delete legacy.futures.data.coverage.htx_futures_order_flow_sample;
legacy.futures.data.coverage.htx_futures_order_flow = 'closed';
const legacyDecision = buildShadowDecisionTelemetry(legacy);
assert.equal(legacyDecision.htx_execution_gate_closed, true);
assert.equal(legacyDecision.eq.recent_trades_sample_closed, true);
assert.equal(legacyDecision.eq.exact_window_cvd_closed, true);

console.log(JSON.stringify({
  ok: true,
  suite: 'htx-execution-closure',
  assertions: [
    'execution closure separated from exact-window CVD closure',
    'requested-notional fill must be >=99.9% both sides',
    'new-schema sample absence fails closed',
    'legacy coverage remains backward compatible',
    'Full Evidence retains missing external chains and zero live promotion',
  ],
}, null, 2));
