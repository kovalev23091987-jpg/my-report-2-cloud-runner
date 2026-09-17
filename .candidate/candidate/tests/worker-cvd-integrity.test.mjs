import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workerPath = new URL("../src/worker.js", import.meta.url);
const raw = fs.readFileSync(workerPath, "utf8");
// R3 harness repair: import real modules instead of deleting the complete import
// block and silently omitting newly added dependencies. Assertions are unchanged.
const source = raw.replace(/from "\.\/([^"\n]+)"/g, (_match, name) =>
  `from ${JSON.stringify(new URL(`../src/${name}`, import.meta.url).href)}`);
assert.notEqual(source, raw, "worker import adapter must match once");

const exposed = [
  "createPerDeepCheckFetchCache",
  "flattenTrades",
  "sortedTrades",
  "rawTradeRecordIntegrity",
  "factualMinuteTradeCount",
  "cvdDeltaQuality",
  "strictSpotCvdWindow",
  "summarizePriceRange",
  "summarizeFuturesFlowRange",
  "futuresSnapshot",
].join(",");
const moduleUrl = "data:text/javascript;base64," +
  Buffer.from(`${source}\nexport { ${exposed} };\n`).toString("base64");
const api = await import(moduleUrl);

const MINUTE = 60_000;
const START = 1_800_000_000_000 - (1_800_000_000_000 % MINUTE);

function minuteBars(count = 60) {
  return Array.from({ length: count }, (_, index) => ({
    ts: START + index * MINUTE,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume_contracts: 1,
    volume_base: 1,
    turnover_usdt: 100,
    trade_count: 1,
  }));
}

function trades(count = 60) {
  return Array.from({ length: count }, (_, index) => ({
    "trade-id": `trade-${index}`,
    ts: START + Math.min(index, 59) * MINUTE,
    direction: index % 2 ? "sell" : "buy",
    amount: 1,
    quantity: 1,
    price: 100,
    trade_turnover: 100,
  }));
}

test("futures CVD remains diagnostic when raw records miss factual 1m trade_count", () => {
  const price = api.summarizePriceRange(minuteBars(), START, START + 60 * MINUTE);
  assert.equal(price.exact_1m_bars, true);
  assert.equal(price.trade_count, 60);
  const incomplete = api.summarizeFuturesFlowRange(
    trades(59), START, START + 60 * MINUTE, 1, 1, 120_000, price,
  );
  assert.equal(incomplete.usable, false, "unverified CVD must fail closed");
  assert.equal(incomplete.transport_window_usable, true, "transport coverage remains separately visible");
  assert.equal(incomplete.cvd_delta_quality.status, "INCOMPLETE_OR_UNVERIFIED");
  assert.equal(incomplete.cvd_delta_usable, false);
  assert.equal(incomplete.cvd_delta_quality.raw_trade_count, 59);
  assert.equal(incomplete.cvd_delta_quality.factual_1m_trade_count, 60);
});

test("futures CVD becomes reliable only on an exact count and exact minute grid", () => {
  const price = api.summarizePriceRange(minuteBars(), START, START + 60 * MINUTE);
  const complete = api.summarizeFuturesFlowRange(
    trades(60), START, START + 60 * MINUTE, 1, 1, 120_000, price,
  );
  assert.equal(complete.cvd_delta_quality.status, "COMPLETE");
  assert.equal(complete.cvd_delta_usable, true);
  assert.equal(complete.usable, true);
  assert.equal(complete.cvd_delta_quality.record_integrity.status, "COMPLETE");

  const overcount = api.summarizeFuturesFlowRange(
    trades(61), START, START + 60 * MINUTE, 1, 1, 120_000, price,
  );
  assert.equal(overcount.cvd_delta_usable, false);
  assert.ok(overcount.cvd_delta_quality.completeness_ratio > 1);

  const missingMinute = minuteBars().filter((_, index) => index !== 30);
  const incompletePrice = api.summarizePriceRange(missingMinute, START, START + 60 * MINUTE);
  assert.equal(incompletePrice.exact_1m_bars, false);
  const falseMatchBlocked = api.summarizeFuturesFlowRange(
    trades(59), START, START + 60 * MINUTE, 1, 1, 120_000, incompletePrice,
  );
  assert.equal(falseMatchBlocked.cvd_delta_usable, false);
  assert.equal(falseMatchBlocked.cvd_delta_quality.factual_1m_trade_count, null);
});

test("matching counts cannot hide invalid or duplicate raw trade records", () => {
  const price = api.summarizePriceRange(minuteBars(), START, START + 60 * MINUTE);
  const invalid = trades(60);
  delete invalid[12].direction;
  const invalidPayload = api.summarizeFuturesFlowRange(
    invalid, START, START + 60 * MINUTE, 1, 1, 120_000, price,
  );
  assert.equal(invalidPayload.cvd_delta_quality.trade_count_exact_match, true);
  assert.equal(invalidPayload.cvd_delta_quality.raw_record_integrity_complete, false);
  assert.equal(invalidPayload.cvd_delta_quality.record_integrity.invalid_payload_count, 1);
  assert.equal(invalidPayload.cvd_delta_usable, false);

  const duplicated = trades(60);
  duplicated[59]["trade-id"] = duplicated[58]["trade-id"];
  const duplicateId = api.strictSpotCvdWindow(
    duplicated, minuteBars(), START, START + 60 * MINUTE,
  );
  assert.equal(duplicateId.cvd_delta_quality.trade_count_exact_match, true);
  assert.equal(duplicateId.cvd_delta_quality.record_integrity.duplicate_trade_id_count, 1);
  assert.equal(duplicateId.usable, false);

  const missingId = trades(60);
  delete missingId[4]["trade-id"];
  const noIdentity = api.strictSpotCvdWindow(
    missingId, minuteBars(), START, START + 60 * MINUTE,
  );
  assert.equal(noIdentity.cvd_delta_quality.record_integrity.missing_trade_id_count, 1);
  assert.equal(noIdentity.usable, false);

  const whitespaceId = trades(60);
  whitespaceId[4]["trade-id"] = "   ";
  const blankIdentity = api.strictSpotCvdWindow(
    whitespaceId, minuteBars(), START, START + 60 * MINUTE,
  );
  assert.equal(blankIdentity.cvd_delta_quality.record_integrity.missing_trade_id_count, 1);
  assert.equal(blankIdentity.usable, false);
});

test("bounded raw trade flattening is explicit and fail-closed", () => {
  const exactLimit = api.flattenTrades([{ data: trades(10_000) }]);
  assert.equal(exactLimit.length, 10_000);
  assert.equal(exactLimit._source_truncated, false);
  assert.equal(api.rawTradeRecordIntegrity(exactLimit, { market: "spot" }).complete, true);

  const overLimit = api.flattenTrades([{ data: trades(10_001) }]);
  assert.equal(overLimit.length, 10_000);
  assert.equal(overLimit._source_truncated, true);
  const truncatedIntegrity = api.rawTradeRecordIntegrity(overLimit, { market: "spot" });
  assert.equal(truncatedIntegrity.complete, false);
  assert.equal(truncatedIntegrity.source_truncated, true);

  const malformed = api.flattenTrades([{ data: [...trades(60), "not-a-trade"] }]);
  assert.equal(malformed.length, 60);
  const malformedIntegrity = api.rawTradeRecordIntegrity(malformed, { market: "spot" });
  assert.equal(malformedIntegrity.complete, false);
  assert.equal(malformedIntegrity.source_rows_dropped, 1);

  const propagated = api.sortedTrades(overLimit);
  assert.equal(propagated._source_truncated, true, "sorting must preserve truncation provenance");
});

test("fractional trade_count and non-minute windows cannot certify CVD", () => {
  const fractionalBars = minuteBars();
  fractionalBars[10].trade_count = 0.5;
  const fractionalPrice = api.summarizePriceRange(
    fractionalBars, START, START + 60 * MINUTE,
  );
  assert.equal(fractionalPrice.trade_count_complete, false);
  assert.equal(fractionalPrice.trade_count, null);
  const blocked = api.summarizeFuturesFlowRange(
    trades(60), START, START + 60 * MINUTE, 1, 1, 120_000, fractionalPrice,
  );
  assert.equal(blocked.cvd_delta_usable, false);

  const misaligned = api.factualMinuteTradeCount(
    minuteBars(), START, START + 60 * MINUTE + 1,
  );
  assert.equal(misaligned.status, "MISSING_OR_INCOMPLETE_FACTUAL_1M_COUNTS");
  assert.equal(misaligned.exact_1m_bars, false);
  assert.equal(misaligned.factual_1m_trade_count, null);
});

test("spot CVD applies the same exact factual count rule", () => {
  const incomplete = api.strictSpotCvdWindow(trades(59), minuteBars(), START, START + 60 * MINUTE);
  assert.equal(incomplete.usable, false);
  assert.equal(incomplete.cvd_delta_quality.trade_count_exact_match, false);
  const complete = api.strictSpotCvdWindow(trades(60), minuteBars(), START, START + 60 * MINUTE);
  assert.equal(complete.usable, true);
  assert.equal(complete.cvd_delta_quality.trade_count_exact_match, true);
});

test("per-Deep-Check cache shares identical concurrent requests without cross-run state", async () => {
  let externalCalls = 0;
  const cache = api.createPerDeepCheckFetchCache(async (url) => {
    externalCalls += 1;
    return { ok: true, url };
  });
  const [a, b, c, d] = await Promise.all([
    cache.fetch("https://example.test/same"),
    cache.fetch("https://example.test/same"),
    cache.fetch("https://example.test/other"),
    cache.fetch("https://example.test/same"),
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, d);
  assert.notDeepEqual(a, c);
  assert.equal(externalCalls, 2);
  assert.deepEqual(cache.stats(), {
    logical_requests: 4,
    unique_request_keys: 2,
    unique_external_requests: 2,
    unique_blocked_requests: 0,
    unique_external_request_cap: 39,
    reused_requests: 2,
  });
  const nextRun = api.createPerDeepCheckFetchCache(async (url) => ({ ok: true, url }));
  assert.deepEqual(nextRun.stats(), {
    logical_requests: 0, unique_request_keys: 0, unique_external_requests: 0,
    unique_blocked_requests: 0, unique_external_request_cap: 39, reused_requests: 0,
  });

  const bounded = api.createPerDeepCheckFetchCache(async (url) => {
    externalCalls += 1;
    return { ok: true, url };
  }, 2);
  const allowedA = await bounded.fetch("https://example.test/a");
  const allowedB = await bounded.fetch("https://example.test/b");
  const blocked = await bounded.fetch("https://example.test/c");
  const blockedAgain = await bounded.fetch("https://example.test/c");
  assert.equal(allowedA.ok, true);
  assert.equal(allowedB.ok, true);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "DEEP_CHECK_EXTERNAL_REQUEST_CAP_EXCEEDED_FAIL_CLOSED");
  assert.deepEqual(blocked, blockedAgain);
  assert.deepEqual(bounded.stats(), {
    logical_requests: 4, unique_request_keys: 3, unique_external_requests: 2,
    unique_blocked_requests: 1, unique_external_request_cap: 2, reused_requests: 1,
  });
});

test("unwindowed futures snapshot labels raw delta as diagnostic, never factual CVD", async () => {
  const oneTrade = {
    id: "futures-one",
    ts: START,
    direction: "buy",
    amount: 1,
    quantity: 1,
    price: 100,
    trade_turnover: 100,
  };
  const request = async (url) => {
    if (url.includes("swap_contract_info")) return { ok: true, data: { data: [{ contract_code: "LSK-USDT", contract_size: 1 }] } };
    if (url.includes("/market/depth")) return { ok: true, data: { tick: { bids: [[99, 10]], asks: [[101, 10]] } } };
    if (url.includes("/market/bbo")) return { ok: true, data: { ticks: [{ contract_code: "LSK-USDT", bid: [99, 10], ask: [101, 10] }] } };
    if (url.includes("history/trade")) return { ok: true, data: { data: [{ data: [oneTrade] }] } };
    if (url.includes("swap_open_interest")) return { ok: true, data: { data: [{ contract_code: "LSK-USDT", volume: 1 }] } };
    if (url.includes("swap_funding_rate")) return { ok: true, data: { data: { funding_rate: 0 } } };
    throw new Error(`unmocked ${url}`);
  };
  const snapshot = await api.futuresSnapshot({ contract: "LSK-USDT", _fetch_json: request });
  assert.equal(snapshot.coverage.htx_futures_order_flow_sample, "closed");
  assert.equal(snapshot.coverage.htx_futures_order_flow, "not_closed");
  assert.equal(snapshot.order_flow.cvd_delta_reliable, false);
  assert.equal(snapshot.order_flow.raw_delta_is_diagnostic_only, true);
  assert.equal(snapshot.order_flow.cvd_delta_quality.status, "UNVERIFIED_NO_EXACT_FACTUAL_1M_WINDOW");
});
