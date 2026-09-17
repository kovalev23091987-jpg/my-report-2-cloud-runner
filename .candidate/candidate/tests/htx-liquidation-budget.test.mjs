import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const workerPath = new URL("../src/worker.js", import.meta.url);
const raw = fs.readFileSync(workerPath, "utf8");
const source = raw.replace(
  /^import \{[\s\S]*?\} from "\.\/fast-move-watch-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/opportunity-intelligence-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/multi-wave-campaign-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/stage392-proof-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-upstream-compat-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-adapter\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-runtime\.mjs";\n\n/,
  `const FAST_MOVE_WATCH_VERSION = "TEST";
   const FAST_MOVE_WATCH_STATUS = "TEST";
   const buildFastMoveDeepObservation = () => null;
   const prepareFastMoveWatchCycle = async () => ({});
   const finalizeFastMoveWatchCycle = async () => ({});
   const fastMoveWatchDataPlaneSummary = async () => ({});
   const OPPORTUNITY_VERSION = "TEST";
   const opportunityDataPlaneSummary = async () => ({});
   const runOpportunityShadowCycle = async () => ({});
   const MULTI_WAVE_VERSION = "TEST";
   const multiWaveCampaignDataPlaneSummary = async () => ({});
   const runMultiWaveCampaignShadowCycle = async () => ({});
   const prepareFullEvidenceProofBundle = () => ({ status: "TEST_STUB" });
   const sealFullEvidenceProofBundleAfterAck = () => ({ status: "TEST_STUB" });
   const stage392ProofSafetyEnvelope = () => ({ status: "TEST_STUB" });
   const evaluateFinalDecisionUpstreamCompatibility = () => ({ status: "TEST_STUB" });
   const adaptStage391ToFinalDecisionInput = () => ({ status: "TEST_STUB" });
   const persistFinalDecisionIntegrationShadow = async () => ({ status: "TEST_STUB" });\n\n`,
);
assert.notEqual(source, raw, "worker import adapter must match once");

const moduleUrl = "data:text/javascript;base64," + Buffer.from(
  `${source}\nexport { persistLiquidations, htxLiquidationTape };\n`,
).toString("base64");
const { persistLiquidations, htxLiquidationTape } = await import(moduleUrl);

class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
}

class D1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(`
      CREATE TABLE liquidation_events (
        source TEXT NOT NULL,
        event_id TEXT NOT NULL,
        contract_code TEXT,
        ts INTEGER,
        side TEXT,
        price REAL,
        volume_contracts REAL,
        amount_base REAL,
        notional_usdt REAL,
        raw_json TEXT NOT NULL,
        PRIMARY KEY(source,event_id)
      )
    `);
    this.statements = 0;
  }
  prepare(sql) {
    this.statements += 1;
    return new Statement(this.db, sql);
  }
}

function event(index) {
  return {
    source: "HTX official public liquidation REST",
    event_id: `event-${index}`,
    contract_code: "BTC-USDT",
    created_at: 1_800_000_000_000 + index,
    side: index % 2 ? "LONG_LIQUIDATED" : "SHORT_LIQUIDATED",
    price: 100,
    volume_contracts: 1,
    amount_base: 0.01,
    notional_usdt: 1,
  };
}

test("HTX liquidation persistence uses one bounded JSON1 statement", async () => {
  const DATA_DB = new D1();
  const result = await persistLiquidations({ DATA_DB }, Array.from({ length: 700 }, (_, i) => event(i)), 700);
  assert.equal(result.status, "PARTIAL_BOUNDED");
  assert.equal(result.rows_eligible, 700);
  assert.equal(result.rows_attempted, 500);
  assert.equal(result.rows_capacity_dropped, 200);
  assert.equal(result.rows_written, 500);
  assert.equal(result.d1_statements, 1);
  assert.equal(DATA_DB.statements, 1);
  assert.equal(DATA_DB.db.prepare("SELECT COUNT(*) AS total FROM liquidation_events").get().total, 500);
});

test("HTX liquidation payload scan caps each side and marks coverage partial", async () => {
  const originalFetch = globalThis.fetch;
  const rows = (side) => Array.from({ length: 300 }, (_, index) => ({
    query_id: `${side}-${index}`,
    contract_code: "BTC-USDT",
    created_at: 1_800_000_000_000 + index,
    price: 100,
    volume: 1,
    amount: 0.01,
    trade_turnover: 1,
  }));
  globalThis.fetch = async (url) => {
    const isLong = String(url).includes("trade_type=5");
    const body = JSON.stringify({ status: "ok", data: rows(isLong ? "long" : "short") });
    return { ok: true, status: 200, async text() { return body; } };
  };
  try {
    const result = await htxLiquidationTape({ contract: "BTC-USDT", lookback_minutes: 120 }, {}, {});
    assert.equal(result.events.length, 500);
    assert.equal(result.summary.payload_total_events, 600);
    assert.equal(result.summary.rows_capacity_dropped, 100);
    assert.equal(result.health.bounded_scan_truncated, true);
    assert.equal(result.coverage.htx_factual_long_liquidations, "partial_bounded");
    assert.equal(result.coverage.htx_factual_short_liquidations, "partial_bounded");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
