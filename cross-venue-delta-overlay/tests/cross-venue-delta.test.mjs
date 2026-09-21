import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  collectPublicFullEvidence,
  rawStructuredEndpointAllowed,
} from "../src/public-evidence-adapters.mjs";
import {
  detectEvidenceConflicts,
  summarizeDataQuality,
} from "../src/full-evidence-contract.mjs";
import { buildFullEvidenceShadowRecord } from "../src/full-evidence-shadow-model.mjs";
import {
  assertPlainTextTelegramMessage,
  assertPlainTextTelegramPayload,
  buildPlainTextTelegramPayload,
} from "../plain-text-telegram.mjs";
import { buildObserveInformationalMessage } from "../telegram-info-runtime.mjs";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 21, 12, 0, 0);

function json(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return data; } };
}

function hourlyRows(base) {
  return Array.from({ length: 26 }, (_, i) => {
    const ts = NOW - (26 - i) * HOUR;
    const price = base + i;
    return [ts, String(price), String(price + 1), String(price - 1), String(price + 0.5), "10", ts + HOUR - 1, "", 20, "6"];
  });
}

function okxHourlyRows(base) {
  return Array.from({ length: 26 }, (_, i) => {
    const ts = NOW - (26 - i) * HOUR;
    const price = base + i;
    return [String(ts), String(price), String(price + 1), String(price - 1), String(price + 0.5), "10", "", "", "1"];
  });
}

function bybitHourlyRows(base) {
  return Array.from({ length: 26 }, (_, i) => {
    const ts = NOW - (26 - i) * HOUR;
    const price = base + i;
    return [String(ts), String(price), String(price + 1), String(price - 1), String(price + 0.5), "10"];
  });
}

function ongFetch({ rateLimitOkxSpot = false } = {}) {
  return async (url) => {
    if (url.includes("bybit.com/v5/market/instruments-info")) return json({ retCode:0, retMsg:"OK", result:{ list:[{ symbol:"ONGUSDT", baseCoin:"ONG", quoteCoin:"USDT", settleCoin:"USDT", contractType:"LinearPerpetual", status:"Trading", isPreListing:false, fundingInterval:"60" }] } });
    if (url.includes("okx.com/api/v5/public/instruments") && url.includes("SWAP")) return json({ code:"0", msg:"", data:[{ instId:"ONG-USDT-SWAP", instType:"SWAP", ctValCcy:"ONG", settleCcy:"USDT", state:"live" }] });
    if (url.includes("okx.com/api/v5/public/instruments") && url.includes("SPOT")) {
      if (rateLimitOkxSpot) return json({ code:"50011", msg:"rate limit" }, 429);
      return json({ code:"0", msg:"", data:[] });
    }
    if (url.includes("gateio.ws/api/v4/futures/usdt/contracts/")) return json({ name:"ONG_USDT", funding_interval:3600, in_delisting:false });
    if (url.includes("api.binance.com/api/v3/exchangeInfo")) return json({ symbols:[{ symbol:"ONGUSDT", baseAsset:"ONG", quoteAsset:"USDT", status:"TRADING", isSpotTradingAllowed:true, permissions:["SPOT"] }] });

    if (url.includes("bybit.com/v5/market/funding/history")) return json({ retCode:0, result:{ list:[{ fundingRateTimestamp:String(NOW-HOUR), fundingRate:"-0.0002" },{ fundingRateTimestamp:String(NOW-2*HOUR), fundingRate:"-0.0001" }] } });
    if (url.includes("bybit.com/v5/market/open-interest")) return json({ retCode:0, result:{ list:[{ timestamp:String(NOW-HOUR), openInterest:"110" },{ timestamp:String(NOW-2*HOUR), openInterest:"100" }] } });
    if (url.includes("bybit.com/v5/market/kline")) return json({ retCode:0, result:{ list:bybitHourlyRows(100) } });

    if (url.includes("okx.com/api/v5/public/funding-rate-history")) return json({ code:"0", data:[{ fundingTime:String(NOW-HOUR), realizedRate:"-0.0002" },{ fundingTime:String(NOW-2*HOUR), realizedRate:"-0.0001" }] });
    if (url.includes("okx.com/api/v5/public/open-interest")) return json({ code:"0", data:[{ ts:String(NOW-60_000), oi:"1000", oiUsd:"500000" }] });
    if (url.includes("okx.com/api/v5/market/candles")) return json({ code:"0", data:okxHourlyRows(100) });

    if (url.includes("gateio.ws/api/v4/futures/usdt/contract_stats")) return json(Array.from({ length:26 }, (_, i) => ({ time:(NOW-(26-i)*HOUR)/1000, open_interest:String(100+i), open_interest_usd:String(1000+i*10), mark_price:String(1+i/100), last_funding_rate:"-0.0002", long_taker_size:"60", short_taker_size:"40" })));
    if (url.includes("gateio.ws/api/v4/futures/usdt/candlesticks")) return json(Array.from({ length:26 }, (_, i) => ({ t:(NOW-(26-i)*HOUR)/1000, o:"1", h:"2", l:"0.5", c:String(1+i/100), v:"10" })));

    if (url.includes("api.binance.com/api/v3/klines")) {
      const base = url.includes("BTCUSDT") ? 200 : (url.includes("ETHUSDT") ? 300 : 100);
      return json(hourlyRows(base));
    }
    if (url.includes("api.binance.com/api/v3/depth")) return json({ bids:[["99.9","100"],["99.7","80"]], asks:[["100.1","90"],["100.3","70"]] });
    throw new Error(`UNMOCKED_URL:${url}`);
  };
}

function htxShadow() {
  return {
    shadow_id:`${NOW}:ONG-USDT`, contract:"ONG-USDT", observed_ts:NOW,
    htx_execution_gate_closed:true,
    dc_shadow_long:73, dc_shadow_short:18, direction_hint:"LONG", stage:"SHADOW_OBSERVE_LONG_BIAS",
    eq:{ status:"SHADOW_MEASURABLE", spread_bps:8, buy_impact_bps:3, sell_impact_bps:4 },
    dq:{ status:"HTX_CLOSED_EXTERNAL_CHAINS_MISSING", htx_coverage_pct:95 },
    evidence_flags:{ funding_pct:-0.01, funding_interval_hours:1, price_1h_pct:1, price_4h_pct:2, price_24h_pct:3, oi_1h_change_pct:5, oi_4h_change_pct:7, futures_flow_1h_delta_pct:2, futures_flow_4h_delta_pct:3, spot_flow_delta_pct:null },
  };
}

test("ONG: absent HTX Spot is closed by verified Binance Spot fallback", async () => {
  const publicEvidence = await collectPublicFullEvidence({ contract_code:"ONG-USDT", now_ts:NOW, fetch_impl:ongFetch() });
  assert.equal(publicEvidence.alias_verification.okx_spot.verified, false);
  assert.equal(publicEvidence.alias_verification.binance_spot.verified, true);
  assert.equal(publicEvidence.spot_verification.external_spot_status, "CONFIRMED");
  assert.equal(publicEvidence.spot_verification.fallback_used, true);
  assert.deepEqual(publicEvidence.spot_verification.reason_codes, ["EXTERNAL_SPOT_FALLBACK_USED"]);
  assert.ok(publicEvidence.evidence.some(row => row.venue === "BINANCE" && row.market_type === "SPOT" && row.status === "CLOSED" && row.reason_code === "EXTERNAL_SPOT_FALLBACK_USED"));

  const record = buildFullEvidenceShadowRecord({ shadow_decision:htxShadow(), public_evidence:publicEvidence, now:NOW });
  assert.equal(record.cross_venue_verification.htx_spot_status, "ABSENT_OR_UNAVAILABLE");
  assert.equal(record.cross_venue_verification.external_spot_status, "CONFIRMED");
  assert.equal(record.cross_venue_verification.fallback_used, true);
  assert.equal(record.chain_status.MARKET_STRENGTH_SPOT.chain_closed, true);
  assert.equal(record.missing_weighted_chains.includes("MARKET_STRENGTH_SPOT"), false);
  const htxSpot = record.evidence_compact.find(row => row.venue === "HTX" && row.chain === "MARKET_STRENGTH_SPOT" && row.metric === "htx_spot_flow_delta_pct");
  assert.equal(htxSpot.value, null);
  assert.equal(htxSpot.fallback_closed, true);
  assert.equal(htxSpot.reason_code, "EXTERNAL_SPOT_FALLBACK_USED");
  assert.match(htxSpot.note, /HTX Spot отсутствует; внешний Spot подтверждён: BINANCE/u);
});

function oiRow(venue, value, offset = 0, { htxMetric = false } = {}) {
  return {
    contract_code:"ONG-USDT",
    chain:htxMetric ? "HTX_EXECUTION" : "CROSS_EXCHANGE_DERIVATIVES",
    metric:htxMetric ? "htx_oi_1h_change_pct" : "oi_change_1h",
    source:`${venue} RAW`, venue, market_type:venue === "OKX" ? "SWAP" : "USDT_PERP",
    value, unit:"pct", window:htxMetric ? null : "1h", observed_ts:NOW, source_ts:NOW-offset,
    now_ts:NOW, max_age_sec:900, status:"CLOSED", coverage_pct:100,
    symbol_verified:true, alias_required:false, alias_verified:true, asset_identity_verified:true,
    source_compatible:true, independence_group:`${venue}_OFFICIAL`, primary_market_id:`ONG:${venue}:PERP`,
  };
}

test("OI conflict is never averaged and an already-collected third venue resolves only by majority", () => {
  const rows = [oiRow("HTX", 5, 0, { htxMetric:true }), oiRow("BYBIT", -4, 20_000), oiRow("GATE", 3, 40_000)];
  const conflicts = detectEvidenceConflicts(rows);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].cross_venue_divergence, true);
  assert.equal(conflicts[0].values_averaged, false);
  assert.equal(conflicts[0].third_source_used, true);
  assert.equal(conflicts[0].resolution_status, "THIRD_SOURCE_MAJORITY");
  assert.equal(conflicts[0].majority_direction, "UP");
  assert.equal(conflicts[0].unresolved, false);
  assert.deepEqual(conflicts[0].source_metrics, ["htx_oi_1h_change_pct", "oi_change_1h"]);
  assert.deepEqual(conflicts[0].chains, ["CROSS_EXCHANGE_DERIVATIVES", "HTX_EXECUTION"]);

  const unresolved = detectEvidenceConflicts(rows.slice(0, 2));
  assert.equal(unresolved[0].unresolved, true);
  assert.equal(unresolved[0].resolution_status, "UNRESOLVED_THIRD_SOURCE_REQUIRED");
  const dq = summarizeDataQuality(rows.slice(0, 2), unresolved);
  assert.ok(dq.uncertainty_flags.includes("UNRESOLVED_CONFLICT"));

  const blockedRecord = buildFullEvidenceShadowRecord({
    shadow_decision:htxShadow(),
    public_evidence:{ contract_code:"ONG-USDT", observed_ts:NOW, evidence:[oiRow("BYBIT", -4, 20_000)] },
    now:NOW,
  });
  assert.ok(blockedRecord.chain_status.CROSS_EXCHANGE_DERIVATIVES.closure_reasons.includes("UNRESOLVED_CROSS_VENUE_CONFLICT"));
  assert.equal(blockedRecord.cross_venue_verification.unresolved_critical_conflict, true);
});

test("rate limit remains missing, never zero, and Binance Spot fallback is used", async () => {
  const result = await collectPublicFullEvidence({ contract_code:"ONG-USDT", now_ts:NOW, fetch_impl:ongFetch({ rateLimitOkxSpot:true }) });
  assert.equal(result.alias_verification.okx_spot.fetch_error, "SOURCE_RATE_LIMITED");
  assert.notEqual(result.alias_verification.okx_spot.value, 0);
  assert.equal(result.alias_verification.binance_spot.verified, true);
  assert.equal(result.spot_verification.fallback_used, true);
  assert.ok(result.evidence.some(row => row.venue === "BINANCE" && row.status === "CLOSED" && row.value !== null));
});

test("Telegram and providers remain plain-text/raw-structured only", () => {
  const row = {
    contract:"ONG-USDT", direction:"LONG", wave_id:"W:ONG:1", status:"OBSERVE",
    reason:"DIRECTION_CLOSED_ENTRY_WINDOW_NOT_READY", observation_ts:NOW-10_000,
    updated_ts:NOW-5_000, valid_until_ts:NOW+120_000, early_last_seen_ts:NOW-5_000,
    evidence_observed_ts:NOW-5_000, early_detection_quality_0_100:73,
    current_evidence_json:JSON.stringify([
      { domain:"RELATIVE_STRENGTH", side:"LONG", status:"CLOSED" },
      { domain:"OI_ACCELERATION", side:"BOTH", status:"CLOSED" },
      { domain:"ORDERFLOW_ABSORPTION", side:"LONG", status:"CLOSED" },
    ]),
  };
  const built = buildObserveInformationalMessage(row, { now:NOW });
  assert.equal(built.ok, true);
  assertPlainTextTelegramMessage(built.message);
  const payload = buildPlainTextTelegramPayload(built.message);
  assert.deepEqual(Object.keys(payload), ["text"]);
  assertPlainTextTelegramPayload(payload);
  assert.throws(() => assertPlainTextTelegramPayload({ text:"ok", image:"x" }), /TEXT_ONLY/);
  assert.throws(() => assertPlainTextTelegramMessage("![chart](data:image/png;base64,x)"), /VISUAL/);
  assert.equal(rawStructuredEndpointAllowed("https://api.binance.com/api/v3/klines?symbol=ONGUSDT"), true);
  assert.equal(rawStructuredEndpointAllowed("https://example.test/chart/ONGUSDT"), false);
  assert.equal(rawStructuredEndpointAllowed("https://example.test/data?widget=ONGUSDT"), false);
  const adapterSource = fs.readFileSync(new URL("../src/public-evidence-adapters.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(adapterSource, /https?:\/\/[^\s"']*\/(?:chart|widget|card|image|media|attachment)(?:\/|\?|$)/iu);
});
