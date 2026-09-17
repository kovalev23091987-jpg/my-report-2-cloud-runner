import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { persistLiquidationShadow } from "../src/liquidation-intelligence.mjs";

const NOW = Date.parse("2026-09-13T12:00:00Z");

class SqliteD1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { meta: { changes: Number(result.changes || 0) } };
  }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
}

class SqliteD1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys=ON");
    this.db.exec(fs.readFileSync(
      new URL("../migrations/20260913_cross_venue_liquidation_shadow.sql", import.meta.url),
      "utf8",
    ));
    this.maxBatchWidth = 0;
  }
  prepare(sql) { return new SqliteD1Statement(this.db, sql); }
  async batch(statements) {
    this.maxBatchWidth = Math.max(this.maxBatchWidth, statements.length);
    const results = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function projectedClusters(count = 120) {
  return Array.from({ length: count }, (_, index) => ({
    cluster_key: `BTC-USDT:LONG:${String(index).padStart(3, "0")}`,
    side: "LONG",
    level_price: 100 - (index + 1) / 100,
    price_low: 99 - index / 100,
    price_high: 101 - index / 100,
    source_unit: "USD",
    distance_pct: index + 1,
    explicit_major: index >= 110,
    raw_size: 10_000 + index,
    normalized_strength: index / count,
    lifecycle: "ACTIVE",
  }));
}

function record(observedTs) {
  return {
    observed_ts: observedTs,
    contract_code: "BTC-USDT",
    provider: "COINFUTY",
    provider_symbol: "BTC",
    alias_verified: true,
    alias_verification_scope: "PROVIDER_RESPONSE_SYMBOL_EXACT_MATCH",
    asset_identity_verified: false,
    projected_map_status: "OBSERVATION_ONLY_IDENTITY_UNVERIFIED",
    realized_status: "CLOSED",
    liquidation_dq_status: "PARTIAL",
    projected_source_ts: observedTs,
    projected_source_age_sec: 0,
    projected_freshness: "CURRENT",
    projected_clusters: projectedClusters(),
    realized: {},
    coverage: {},
    derived: {},
    source_health: {},
    errors: [],
  };
}

test("120 lifecycle rows are deterministically capped and persisted in five D1 statements", async () => {
  const DATA_DB = new SqliteD1();
  const first = await persistLiquidationShadow({ DATA_DB }, record(NOW), NOW);

  assert.equal(first.status, "CLOSED");
  assert.equal(first.persisted, true);
  assert.equal(first.state_rows_eligible, 120);
  assert.equal(first.state_rows_attempted, 80);
  assert.equal(first.state_rows_capacity_dropped, 40);
  assert.equal(first.d1_statements, 5);
  assert.equal(first.d1_statement_cap, 5);
  assert.equal(DATA_DB.maxBatchWidth, 5);

  const rows = DATA_DB.db.prepare(
    "SELECT cluster_key,explicit_major,persistence_observations FROM liquidation_cluster_state ORDER BY cluster_key",
  ).all();
  assert.equal(rows.length, 80);
  const keys = new Set(rows.map((row) => row.cluster_key));
  for (let index = 110; index < 120; index += 1) {
    assert.equal(keys.has(`BTC-USDT:LONG:${index}`), true, "all explicit major clusters must survive the cap");
  }
  for (let index = 0; index < 70; index += 1) {
    assert.equal(keys.has(`BTC-USDT:LONG:${String(index).padStart(3, "0")}`), true);
  }
  assert.equal(keys.has("BTC-USDT:LONG:070"), false);

  const second = await persistLiquidationShadow({ DATA_DB }, record(NOW + 60_000), NOW + 60_000);
  assert.equal(second.status, "CLOSED");
  assert.equal(second.d1_statements, 5);
  const persistedTwice = DATA_DB.db.prepare(
    "SELECT COUNT(*) AS total FROM liquidation_cluster_state WHERE persistence_observations=2",
  ).get();
  assert.equal(Number(persistedTwice.total), 80);
});

test("D1 batch failure rolls observation and lifecycle state back atomically", async () => {
  const DATA_DB = new SqliteD1();
  const originalBatch = DATA_DB.batch.bind(DATA_DB);
  DATA_DB.batch = async (statements) => {
    statements.splice(1, 0, DATA_DB.prepare("INSERT INTO table_that_does_not_exist VALUES (1)"));
    return originalBatch(statements);
  };

  const result = await persistLiquidationShadow({ DATA_DB }, record(NOW), NOW);
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.persisted, false);
  assert.match(result.error, /table_that_does_not_exist/);
  assert.equal(DATA_DB.db.prepare("SELECT COUNT(*) AS total FROM liquidation_shadow_observation").get().total, 0);
  assert.equal(DATA_DB.db.prepare("SELECT COUNT(*) AS total FROM liquidation_cluster_state").get().total, 0);
});
