import {
  FAST_MOVE_WATCH_VERSION,
  FAST_MOVE_WATCH_STATUS,
  buildFastMoveDeepObservation,
  prepareFastMoveWatchCycle,
  finalizeFastMoveWatchCycle,
  fastMoveWatchDataPlaneSummary,
} from "./fast-move-watch-runtime.mjs";

import {
  OPPORTUNITY_VERSION,
  buildOpportunityJournalPrefilter,
  opportunityDataPlaneSummary,
  runOpportunityShadowCycle,
  selectOpportunityJournalCandidate,
} from "./opportunity-intelligence-runtime.mjs";

import {
  MULTI_WAVE_VERSION,
  multiWaveCampaignDataPlaneSummary,
  runMultiWaveCampaignShadowCycle,
} from "./multi-wave-campaign-runtime.mjs";

import {
  prepareTz101DecisionEvidence,
  prepareHtxExecutionFacts,
  checkExecutionHandoff,
  prepareFullEvidenceProofBundle,
  sealFullEvidenceProofBundleAfterAck,
  stage392ProofSafetyEnvelope,
} from "./stage392-proof-runtime.mjs";

import {
  evaluateFinalDecisionUpstreamCompatibility,
} from "./final-decision-upstream-compat-runtime.mjs";

import {
  adaptStage391ToFinalDecisionInput,
} from "./final-decision-integration-adapter.mjs";

import {
  persistFinalDecisionIntegrationShadow,
} from "./final-decision-integration-runtime.mjs";

import {
  runTz101PublicationShadow,
} from "./tz101-publication-runtime.mjs";

import {
  validateByKaranteliProxyTarget,
} from "./tz101-byk-proxy-policy.mjs";

import {
  fetchByKaranteliSmartMoneyRaw,
  smartMoneyRawEvidenceRows,
} from "./tz101-smart-money-evidence.mjs";

const STAGE392_SHADOW_INTEGRATION_VERSION = "3.9.2-final-decision-shadow-lifecycle-hardening";
const TELEGRAM_SHADOW_BRIDGE_VERSION = "3.9.3-telegram-shadow-bridge";
const TELEGRAM_SHADOW_BODYFIX_VERSION = "3.9.3.1-telegram-shadow-bodyfix";

const FUTURES_BASE = "https://api.hbdm.com";
const SPOT_BASE = "https://api.htx.com";
const STAGE0_EXTERNAL_REQUESTS = 4;
const DEEP_CHECK_EXTERNAL_REQUESTS = 39;
const SMART_MONEY_EXTERNAL_REQUESTS = 1;
const WORKERS_FREE_EXTERNAL_LIMIT = 50;
const EXTERNAL_REQUEST_RESERVE = 6;

const JSON_HEADERS = {
  "content-type": "application/json; charset=UTF-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nullableNum(value) {
  if (value === null || value === undefined || value === "") return null;
  return num(value);
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeTs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function iso(value) {
  const ms = normalizeTs(value);
  if (ms === null) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function pctChange(start, end) {
  const a = num(start);
  const b = num(end);
  if (a === null || b === null || a === 0) return null;
  return (b / a - 1) * 100;
}

function normalizeFuturesContract(value) {
  let s = String(value || "ETHFI-USDT")
    .trim()
    .toUpperCase()
    .replace("/", "-")
    .replace("_", "-");

  if (!s.includes("-") && s.endsWith("USDT")) {
    s = `${s.slice(0, -4)}-USDT`;
  }
  return s;
}

function normalizeSpotSymbol(value) {
  return String(value || "ETHFI-USDT")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function fetchJson(url) {
  let timeout = null;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "My-Report-2-HUB/2.2",
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        url,
        http_status: response.status,
        error: "invalid_json",
      };
    }

    const apiOk =
      response.ok &&
      (data?.status === "ok" ||
        data?.code === 200 ||
        data?.success === true ||
        (data?.status === undefined &&
          data?.code === undefined &&
          data?.success === undefined));

    return {
      ok: apiOk,
      url,
      http_status: response.status,
      data,
      error: apiOk
        ? null
        : data?.["err-msg"] ||
          data?.err_msg ||
          data?.message ||
          data?.msg ||
          "api_error",
    };
  } catch (error) {
    return {
      ok: false,
      url,
      http_status: null,
      data: null,
      error:
        error?.name === "AbortError"
          ? "timeout"
          : String(error?.message || error),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function createPerDeepCheckFetchCache(
  fetcher = fetchJson,
  maxUniqueRequests = DEEP_CHECK_EXTERNAL_REQUESTS
) {
  const cache = new Map();
  let logicalRequests = 0;
  let reusedRequests = 0;
  let uniqueExternalRequests = 0;
  let uniqueBlockedRequests = 0;
  const requestCap = Math.max(0, Math.min(
    DEEP_CHECK_EXTERNAL_REQUESTS,
    Number.isSafeInteger(maxUniqueRequests) ? maxUniqueRequests : DEEP_CHECK_EXTERNAL_REQUESTS
  ));
  return {
    fetch(url) {
      logicalRequests += 1;
      const key = String(url);
      if (cache.has(key)) {
        reusedRequests += 1;
        return cache.get(key);
      }
      let pending;
      if (uniqueExternalRequests >= requestCap) {
        uniqueBlockedRequests += 1;
        pending = Promise.resolve({
          ok: false,
          status: null,
          data: null,
          error: "DEEP_CHECK_EXTERNAL_REQUEST_CAP_EXCEEDED_FAIL_CLOSED",
          url: key,
        });
      } else {
        uniqueExternalRequests += 1;
        pending = Promise.resolve().then(() => fetcher(key));
      }
      cache.set(key, pending);
      return pending;
    },
    stats() {
      return {
        logical_requests: logicalRequests,
        unique_request_keys: cache.size,
        unique_external_requests: uniqueExternalRequests,
        unique_blocked_requests: uniqueBlockedRequests,
        unique_external_request_cap: requestCap,
        reused_requests: reusedRequests,
      };
    },
  };
}

function sumDepth(levels, count, unitBaseQty = 1) {
  const slice = Array.isArray(levels) ? levels.slice(0, count) : [];
  let rawQuantity = 0;
  let baseQuantity = 0;
  let notional = 0;

  for (const level of slice) {
    const price = num(level?.[0]);
    const qty = num(level?.[1]);
    if (price === null || qty === null) continue;

    const base = qty * unitBaseQty;
    rawQuantity += qty;
    baseQuantity += base;
    notional += price * base;
  }

  return {
    levels: slice.length,
    raw_quantity: rawQuantity,
    base_quantity: baseQuantity,
    notional_usdt: notional,
  };
}

function orderBookImbalance(bids, asks, count, unitBaseQty = 1) {
  const bid = sumDepth(bids, count, unitBaseQty);
  const ask = sumDepth(asks, count, unitBaseQty);
  const total = bid.notional_usdt + ask.notional_usdt;

  return {
    bid_notional_usdt: bid.notional_usdt,
    ask_notional_usdt: ask.notional_usdt,
    imbalance:
      total > 0 ? (bid.notional_usdt - ask.notional_usdt) / total : null,
    imbalance_pct:
      total > 0
        ? ((bid.notional_usdt - ask.notional_usdt) / total) * 100
        : null,
  };
}

function marketImpact(
  levels,
  targetNotional,
  referencePrice,
  side,
  unitBaseQty = 1
) {
  if (
    !Array.isArray(levels) ||
    levels.length === 0 ||
    !Number.isFinite(targetNotional) ||
    targetNotional <= 0 ||
    !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return null;
  }

  let quoteFilled = 0;
  let baseFilled = 0;
  let rawFilled = 0;
  let levelsUsed = 0;

  for (const level of levels) {
    const price = num(level?.[0]);
    const rawQty = num(level?.[1]);

    if (
      price === null ||
      rawQty === null ||
      price <= 0 ||
      rawQty <= 0
    ) {
      continue;
    }

    const baseAvailable = rawQty * unitBaseQty;
    const quoteAvailable = baseAvailable * price;
    const quoteNeeded = targetNotional - quoteFilled;

    if (quoteNeeded <= 0) break;

    const quoteTake = Math.min(quoteAvailable, quoteNeeded);
    const baseTake = quoteTake / price;

    quoteFilled += quoteTake;
    baseFilled += baseTake;
    rawFilled += baseTake / unitBaseQty;
    levelsUsed += 1;

    if (quoteFilled >= targetNotional * 0.999999) break;
  }

  if (baseFilled <= 0) return null;

  const vwap = quoteFilled / baseFilled;
  const impactBps =
    side === "buy"
      ? (vwap / referencePrice - 1) * 10000
      : (1 - vwap / referencePrice) * 10000;

  return {
    requested_notional_usdt: targetNotional,
    filled_notional_usdt: quoteFilled,
    fill_ratio_pct: (quoteFilled / targetNotional) * 100,
    base_quantity: baseFilled,
    raw_quantity: rawFilled,
    vwap,
    impact_bps: impactBps,
    levels_used: levelsUsed,
    fully_filled: quoteFilled >= targetNotional * 0.999,
  };
}

const MAX_TRADE_CONTAINERS_SCANNED = 2500;
const MAX_RAW_TRADES_FLATTENED = 10000;

function tradeArrayWithScanMetadata(rows, metadata = {}) {
  const output = Array.isArray(rows) ? rows : [];
  Object.defineProperties(output, {
    _source_truncated: { value: metadata.source_truncated === true, enumerable: false },
    _containers_scanned: { value: Number(metadata.containers_scanned || 0), enumerable: false },
    _raw_rows_scanned: { value: Number(metadata.raw_rows_scanned || output.length), enumerable: false },
    _source_rows_dropped: { value: Number(metadata.source_rows_dropped || 0), enumerable: false },
  });
  return output;
}

function flattenTrades(raw) {
  if (!raw) return tradeArrayWithScanMetadata([]);
  const input = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.tick?.data)
        ? raw.tick.data
        : [];
  const result = [];
  const containerLimit = Math.min(input.length, MAX_TRADE_CONTAINERS_SCANNED);
  let sourceTruncated = input.length > containerLimit;
  let rawRowsScanned = 0;
  let sourceRowsDropped = 0;

  outer: for (let index = 0; index < containerLimit; index += 1) {
    const item = input[index];
    const rows = Array.isArray(item?.data) ? item.data : [item];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (rawRowsScanned >= MAX_RAW_TRADES_FLATTENED) {
        sourceTruncated = true;
        break outer;
      }
      rawRowsScanned += 1;
      const trade = rows[rowIndex];
      if (trade && typeof trade === "object") result.push(trade);
      else sourceRowsDropped += 1;
    }
  }

  return tradeArrayWithScanMetadata(result, {
    source_truncated: sourceTruncated,
    containers_scanned: containerLimit,
    raw_rows_scanned: rawRowsScanned,
    source_rows_dropped: sourceRowsDropped,
  });
}

function tradeTime(t) {
  return normalizeTs(t?.ts);
}

function sortedTrades(trades) {
  const sorted = [...trades].sort(
    (a, b) => (tradeTime(a) || 0) - (tradeTime(b) || 0)
  );
  return tradeArrayWithScanMetadata(sorted, {
    source_truncated: trades?._source_truncated === true,
    containers_scanned: trades?._containers_scanned,
    raw_rows_scanned: trades?._raw_rows_scanned,
    source_rows_dropped: trades?._source_rows_dropped,
  });
}

function tradeIdentity(trade) {
  const value =
    trade?.["trade-id"] ??
    trade?.trade_id ??
    trade?.id;
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function rawTradeRecordIntegrity(
  trades,
  { market = "spot", contract_size = null } = {}
) {
  const rows = Array.isArray(trades) ? trades : [];
  const ids = [];
  let missingIdentity = 0;
  let invalidPayload = 0;

  for (const trade of rows) {
    const id = tradeIdentity(trade);
    if (id === null) missingIdentity += 1;
    else ids.push(id);

    const direction = String(trade?.direction || "").toLowerCase();
    const price = nullableNum(trade?.price);
    const amount = nullableNum(trade?.amount);
    const ts = tradeTime(trade);
    const validDirection = direction === "buy" || direction === "sell";
    const validCommon = ts !== null && price !== null && price > 0 && validDirection;
    const validSize = market === "futures"
      ? amount !== null && amount > 0 && (
          (nullableNum(trade?.trade_turnover) ?? 0) > 0 ||
          (nullableNum(trade?.quantity) ?? 0) > 0 ||
          (Number.isFinite(contract_size) && contract_size > 0)
        )
      : amount !== null && amount > 0;
    if (!validCommon || !validSize) invalidPayload += 1;
  }

  const uniqueIds = new Set(ids);
  const duplicateIdentityCount = Math.max(0, ids.length - uniqueIds.size);
  const complete =
    rows.length > 0 &&
    rows?._source_truncated !== true &&
    Number(rows?._source_rows_dropped || 0) === 0 &&
    missingIdentity === 0 &&
    invalidPayload === 0 &&
    duplicateIdentityCount === 0;

  return {
    status: complete ? "COMPLETE" : "INCOMPLETE_OR_INVALID_RAW_RECORDS",
    complete,
    raw_records: rows.length,
    unique_trade_ids: uniqueIds.size,
    missing_trade_id_count: missingIdentity,
    duplicate_trade_id_count: duplicateIdentityCount,
    invalid_payload_count: invalidPayload,
    source_truncated: rows?._source_truncated === true,
    source_containers_scanned: Number(rows?._containers_scanned || 0),
    source_raw_rows_scanned: Number(rows?._raw_rows_scanned || rows.length),
    source_rows_dropped: Number(rows?._source_rows_dropped || 0),
    rule:
      "Every raw trade must have a unique factual trade id, timestamp, buy/sell taker direction, positive price and positive measurable size.",
  };
}

/* =========================================================
   SPOT FLOW
   ========================================================= */

function summarizeSpotTrades(trades) {
  let buyTrades = 0;
  let sellTrades = 0;
  let buyBase = 0;
  let sellBase = 0;
  let buyQuote = 0;
  let sellQuote = 0;

  for (const trade of trades) {
    const price = num(trade?.price);
    const amount = num(trade?.amount);
    const direction = String(
      trade?.direction || ""
    ).toLowerCase();

    if (
      price === null ||
      amount === null ||
      price <= 0 ||
      amount < 0
    ) {
      continue;
    }

    const quote = price * amount;

    if (direction === "buy") {
      buyTrades += 1;
      buyBase += amount;
      buyQuote += quote;
    }

    if (direction === "sell") {
      sellTrades += 1;
      sellBase += amount;
      sellQuote += quote;
    }
  }

  const total = buyQuote + sellQuote;
  const delta = buyQuote - sellQuote;

  return {
    trades: trades.length,
    taker_buy_trades: buyTrades,
    taker_sell_trades: sellTrades,
    taker_buy_base: buyBase,
    taker_sell_base: sellBase,
    taker_buy_usdt: buyQuote,
    taker_sell_usdt: sellQuote,
    delta_base: buyBase - sellBase,
    delta_usdt: delta,
    sample_cvd_base: buyBase - sellBase,
    sample_cvd_usdt: delta,
    total_turnover_usdt: total,
    buy_share_pct:
      total > 0 ? (buyQuote / total) * 100 : null,
    sell_share_pct:
      total > 0 ? (sellQuote / total) * 100 : null,
    delta_pct_of_turnover:
      total > 0 ? (delta / total) * 100 : null,
    buy_sell_ratio:
      sellQuote > 0 ? buyQuote / sellQuote : null,
  };
}

function tradesInWindow(trades, now, hours) {
  const start = now - hours * 60 * 60 * 1000;

  return trades.filter((trade) => {
    const ts = tradeTime(trade);
    return (
      ts !== null &&
      ts >= start &&
      ts <= now + 60000
    );
  });
}

function spotFlowAnalysis(
  trades,
  now,
  freshnessSec,
  min1h,
  min4h,
  min24h,
  factualMinuteKlines = []
) {
  const ordered = sortedTrades(trades);
  const times = ordered
    .map(tradeTime)
    .filter((ts) => ts !== null);

  const firstTs = times.length
    ? times[0]
    : null;

  const lastTs = times.length
    ? times[times.length - 1]
    : null;

  const latestAgeSec =
    lastTs !== null
      ? Math.max(0, now - lastTs) / 1000
      : null;

  const sampleSpanHours =
    firstTs !== null && lastTs !== null
      ? (lastTs - firstTs) / 3600000
      : null;

  const oneHour = tradesInWindow(
    ordered,
    now,
    1
  );

  const fourHours = tradesInWindow(
    ordered,
    now,
    4
  );

  const day = tradesInWindow(
    ordered,
    now,
    24
  );

  function windowResult(
    windowTrades,
    hours,
    minTrades
  ) {
    const start =
      now - hours * 3600000;

    const complete =
      firstTs !== null &&
      firstTs <= start;

    const enoughTrades =
      windowTrades.length >= minTrades;

    const closedEnd = Math.floor(now / 60000) * 60000;
    const closedStart = closedEnd - hours * 3600000;
    const factualCvd = strictSpotCvdWindow(
      ordered,
      factualMinuteKlines,
      closedStart,
      closedEnd
    );

    const rawSummary = summarizeSpotTrades(windowTrades);
    const transportUsable =
      complete &&
      enoughTrades &&
      latestAgeSec !== null &&
      latestAgeSec <= freshnessSec;

    return {
      ...rawSummary,
      window_hours: hours,
      window_start_time: iso(start),
      history_covers_full_window: complete,
      minimum_trades_required: minTrades,
      enough_trades: enoughTrades,
      usable: transportUsable && factualCvd.usable === true,
      transport_window_usable: transportUsable,
      legacy_transport_window_usable: transportUsable,
      cvd_delta_usable:
        factualCvd.usable === true,
      cvd_delta_reliable:
        factualCvd.usable === true,
      cvd_delta_quality:
        factualCvd.cvd_delta_quality,
      raw_delta_is_diagnostic_only:
        factualCvd.usable !== true,
      raw_sample_diagnostic: rawSummary,
      factual_cvd: factualCvd,
    };
  }

  const flow1h = windowResult(
    oneHour,
    1,
    min1h
  );

  const flow4h = windowResult(
    fourHours,
    4,
    min4h
  );

  const flow24h = windowResult(
    day,
    24,
    min24h
  );

  const latestFresh =
    latestAgeSec !== null &&
    latestAgeSec <= freshnessSec;

  let activity = "no_data";

  if (lastTs !== null) {
    if (!latestFresh) {
      activity = "stale";
    } else if (
      oneHour.length < min1h
    ) {
      activity = "low_activity";
    } else {
      activity = "active";
    }
  }

  return {
    ...summarizeSpotTrades(ordered),
    sample_trades: ordered.length,
    first_trade_ts: firstTs,
    first_trade_time: iso(firstTs),
    last_trade_ts: lastTs,
    last_trade_time: iso(lastTs),
    latest_trade_age_sec: latestAgeSec,
    sample_span_hours: sampleSpanHours,

    freshness: {
      max_allowed_age_sec: freshnessSec,
      latest_trade_fresh: latestFresh,
      status:
        lastTs === null
          ? "no_data"
          : latestFresh
          ? "fresh"
          : "stale",
      activity_status: activity,
    },

    windows: {
      "1h": flow1h,
      "4h": flow4h,
      "24h": flow24h,
    },

    quality: {
      sample_usable:
        ordered.length > 0 &&
        latestFresh,
      window_1h_usable:
        flow1h.usable,
      window_4h_usable:
        flow4h.usable,
      window_24h_usable:
        flow24h.usable,
    },
  };
}

/* =========================================================
   FUTURES FLOW
   ========================================================= */

function summarizeFuturesTrades(
  trades,
  contractSize
) {
  let buyContracts = 0;
  let sellContracts = 0;
  let buyBase = 0;
  let sellBase = 0;
  let buyQuote = 0;
  let sellQuote = 0;
  let firstTs = null;
  let lastTs = null;

  for (const trade of trades) {
    const direction = String(
      trade?.direction || ""
    ).toLowerCase();

    const contracts =
      num(trade?.amount) || 0;

    const price =
      num(trade?.price) || 0;

    let base =
      num(trade?.quantity);

    if (
      base === null &&
      Number.isFinite(contractSize) &&
      contractSize > 0
    ) {
      base =
        contracts *
        contractSize;
    }

    if (base === null) {
      base = 0;
    }

    let turnover =
      num(trade?.trade_turnover);

    if (
      turnover === null &&
      price > 0 &&
      base > 0
    ) {
      turnover =
        price * base;
    }

    if (turnover === null) {
      turnover = 0;
    }

    if (direction === "buy") {
      buyContracts += contracts;
      buyBase += base;
      buyQuote += turnover;
    }

    if (direction === "sell") {
      sellContracts += contracts;
      sellBase += base;
      sellQuote += turnover;
    }

    const ts = tradeTime(trade);

    if (ts !== null) {
      if (
        firstTs === null ||
        ts < firstTs
      ) {
        firstTs = ts;
      }

      if (
        lastTs === null ||
        ts > lastTs
      ) {
        lastTs = ts;
      }
    }
  }

  return {
    sample_trades: trades.length,
    // Factual numeric bridge to existing flow consumers. Reliability still
    // comes exclusively from the exact 1m trade-count/payload integrity gate.
    total_turnover_usdt: buyQuote + sellQuote,
    delta_pct_of_turnover: buyQuote + sellQuote > 0
      ? ((buyQuote - sellQuote) / (buyQuote + sellQuote)) * 100
      : null,
    taker_buy_contracts: buyContracts,
    taker_sell_contracts: sellContracts,
    taker_buy_base: buyBase,
    taker_sell_base: sellBase,
    taker_buy_usdt: buyQuote,
    taker_sell_usdt: sellQuote,
    delta_contracts:
      buyContracts - sellContracts,
    delta_base:
      buyBase - sellBase,
    delta_usdt:
      buyQuote - sellQuote,
    sample_cvd_usdt:
      buyQuote - sellQuote,
    first_trade_ts: firstTs,
    first_trade_time: iso(firstTs),
    last_trade_ts: lastTs,
    last_trade_time: iso(lastTs),
  };
}function findContractInfo(data, contract) {
  const list = Array.isArray(data?.data) ? data.data : [];
  return (
    list.find(
      (item) =>
        String(item?.contract_code || "").toUpperCase() === contract.toUpperCase()
    ) ||
    list[0] ||
    null
  );
}

function findBbo(data, contract) {
  const list = Array.isArray(data?.ticks)
    ? data.ticks
    : Array.isArray(data?.data)
    ? data.data
    : [];

  return (
    list.find(
      (item) =>
        String(item?.contract_code || "").toUpperCase() === contract.toUpperCase()
    ) ||
    list[0] ||
    null
  );
}

function findOi(data, contract) {
  const list = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
  return (
    list.find(
      (item) =>
        String(item?.contract_code || "").toUpperCase() === contract.toUpperCase()
    ) ||
    list[0] ||
    null
  );
}

/* =========================================================
   FUTURES SNAPSHOT — существующий модуль
   ========================================================= */

async function futuresSnapshot(params) {
  const requestJson = typeof params?._fetch_json === "function" ? params._fetch_json : fetchJson;
  const contract = normalizeFuturesContract(
    params.contract || params.contract_code || params.symbol || "ETHFI-USDT"
  );

  const notional = clamp(params.notional_usdt ?? params.notional, 10, 1000000, 1000);
  const tradesRequested = Math.round(clamp(params.trades ?? params.size, 1, 2000, 500));

  const endpoints = {
    info:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_contract_info` +
      `?contract_code=${encodeURIComponent(contract)}`,
    depth:
      `${FUTURES_BASE}/linear-swap-ex/market/depth` +
      `?contract_code=${encodeURIComponent(contract)}&type=step0`,
    bbo:
      `${FUTURES_BASE}/linear-swap-ex/market/bbo` +
      `?contract_code=${encodeURIComponent(contract)}`,
    trades:
      `${FUTURES_BASE}/linear-swap-ex/market/history/trade` +
      `?contract_code=${encodeURIComponent(contract)}&size=${tradesRequested}`,
    oi:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_open_interest` +
      `?contract_code=${encodeURIComponent(contract)}`,
    funding:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_funding_rate` +
      `?contract_code=${encodeURIComponent(contract)}`,
  };

  const [infoR, depthR, bboR, tradesR, oiR, fundingR] = await Promise.all([
    requestJson(endpoints.info),
    requestJson(endpoints.depth),
    requestJson(endpoints.bbo),
    requestJson(endpoints.trades),
    requestJson(endpoints.oi),
    requestJson(endpoints.funding),
  ]);

  const contractInfo = findContractInfo(infoR.data, contract);
  let contractSize = num(contractInfo?.contract_size);
  const tradeList = flattenTrades(tradesR.data?.data);

  if ((contractSize === null || contractSize <= 0) && tradeList.length) {
    const testTrade = tradeList.find(
      (trade) => num(trade?.amount) > 0 && num(trade?.quantity) > 0
    );
    if (testTrade) {
      contractSize = num(testTrade.quantity) / num(testTrade.amount);
    }
  }

  const depthTick = depthR.data?.tick || null;
  const bids = Array.isArray(depthTick?.bids) ? depthTick.bids : [];
  const asks = Array.isArray(depthTick?.asks) ? depthTick.asks : [];
  const bboTick = findBbo(bboR.data, contract);

  const bestBid = num(bboTick?.bid?.[0]) ?? num(bids?.[0]?.[0]);
  const bestAsk = num(bboTick?.ask?.[0]) ?? num(asks?.[0]?.[0]);
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = spread !== null && mid > 0 ? (spread / mid) * 10000 : null;

  const unitBaseQty = contractSize !== null && contractSize > 0 ? contractSize : 0;
  const top1Bid = unitBaseQty > 0 ? sumDepth(bids, 1, unitBaseQty) : null;
  const top1Ask = unitBaseQty > 0 ? sumDepth(asks, 1, unitBaseQty) : null;
  const top20Bid = unitBaseQty > 0 ? sumDepth(bids, 20, unitBaseQty) : null;
  const top20Ask = unitBaseQty > 0 ? sumDepth(asks, 20, unitBaseQty) : null;
  const imbalance =
    unitBaseQty > 0 ? orderBookImbalance(bids, asks, 20, unitBaseQty) : null;
  const buyImpact =
    unitBaseQty > 0 && bestAsk !== null
      ? marketImpact(asks, notional, bestAsk, "buy", unitBaseQty)
      : null;
  const sellImpact =
    unitBaseQty > 0 && bestBid !== null
      ? marketImpact(bids, notional, bestBid, "sell", unitBaseQty)
      : null;

  const orderFlowRaw = summarizeFuturesTrades(tradeList, contractSize);
  const orderFlow = {
    ...orderFlowRaw,
    usable: false,
    cvd_delta_usable: false,
    cvd_delta_reliable: false,
    cvd_delta_quality: {
      status: "UNVERIFIED_NO_EXACT_FACTUAL_1M_WINDOW",
      reliable: false,
      record_integrity: rawTradeRecordIntegrity(tradeList, {
        market: "futures",
        contract_size: contractSize,
      }),
    },
    raw_delta_is_diagnostic_only: true,
    raw_sample_diagnostic: orderFlowRaw,
  };
  const oiRaw = findOi(oiR.data, contract);
  const openInterest = oiRaw
    ? {
        contracts: num(oiRaw.volume),
        amount_base: num(oiRaw.amount),
        value_usdt: num(oiRaw.value),
        trade_volume_24h_contracts: num(oiRaw.trade_volume),
        trade_amount_24h_base: num(oiRaw.trade_amount),
        trade_turnover_24h_usdt: num(oiRaw.trade_turnover),
        raw: oiRaw,
      }
    : null;

  const fundingRaw = fundingR.data?.data || null;
  const fundingRate = num(fundingRaw?.funding_rate);
  const estimatedRate = num(fundingRaw?.estimated_rate);
  const funding = fundingRaw
    ? {
        funding_rate: fundingRate,
        funding_rate_pct: fundingRate !== null ? fundingRate * 100 : null,
        estimated_rate: estimatedRate,
        estimated_rate_pct: estimatedRate !== null ? estimatedRate * 100 : null,
        funding_time: iso(fundingRaw?.funding_time),
        next_funding_time: iso(fundingRaw?.next_funding_time),
        raw: fundingRaw,
      }
    : null;

  const health = {
    info: Boolean(infoR.ok && contractInfo),
    depth: Boolean(depthR.ok && bids.length && asks.length),
    bbo: Boolean(bboR.ok && bestBid !== null && bestAsk !== null),
    trades: Boolean(tradesR.ok && tradeList.length),
    oi: Boolean(oiR.ok && oiRaw),
    funding: Boolean(fundingR.ok && fundingRaw),
  };

  const coverage = {
    htx_futures_liquidity:
      health.info &&
      health.depth &&
      bestBid !== null &&
      bestAsk !== null &&
      buyImpact?.fully_filled === true &&
      sellImpact?.fully_filled === true
        ? "closed"
        : "not_closed",
    htx_futures_order_flow_sample: health.trades ? "closed" : "not_closed",
    htx_futures_order_flow: "not_closed",
    htx_open_interest: health.oi ? "closed" : "not_closed",
    htx_funding: health.funding ? "closed" : "not_closed",
  };

  const factualExecution = prepareHtxExecutionFacts({
    contract_code: contract, requested_notional_usdt: notional,
    info_response: infoR, depth_response: depthR, received_ts: Date.now(),
  });
  const snapshot = {
    source: "HTX official public API",
    market: "HTX USDT-M Futures",
    version: "2.1",
    contract,
    requested_notional_usdt: notional,
    trades_requested: tradesRequested,
    timestamp: Date.now(),
    timestamp_utc: new Date().toISOString(),
    contract_info: contractInfo
      ? {
          contract_code: contractInfo.contract_code,
          symbol: contractInfo.symbol,
          contract_size: contractSize,
          price_tick: num(contractInfo.price_tick),
          contract_status: contractInfo.contract_status,
          support_margin_mode: contractInfo.support_margin_mode,
        }
      : null,
    bbo: {
      best_bid: bestBid,
      best_ask: bestAsk,
      spread,
      spread_bps: spreadBps,
    },
    liquidity: {
      best_bid: bestBid,
      best_ask: bestAsk,
      spread,
      spread_bps: spreadBps,
      top_1_depth_bid: top1Bid,
      top_1_depth_ask: top1Ask,
      top_20_depth_bid: top20Bid,
      top_20_depth_ask: top20Ask,
      order_book_imbalance: imbalance,
      buy_market_impact: buyImpact,
      sell_market_impact: sellImpact,
      depth_timestamp: iso(depthTick?.ts) || iso(depthR.data?.ts),
    },
    order_flow: orderFlow,
    htx_open_interest: openInterest,
    open_interest: openInterest,
    htx_funding: funding,
    funding,
    health,
    endpoint_health: health,
    coverage,
    note: "Raw CVD/Delta этой неограниченной по точному окну выборки — только диагностика и всегда fail-closed; достоверный CVD публикуется лишь в синхронизированных окнах при точном совпадении factual 1m trade_count и целостных уникальных trade id.",
    endpoint_errors: {
      info: infoR.ok ? null : infoR.error,
      depth: depthR.ok ? null : depthR.error,
      bbo: bboR.ok ? null : bboR.error,
      trades: tradesR.ok ? null : tradesR.error,
      oi: oiR.ok ? null : oiR.error,
      funding: fundingR.ok ? null : fundingR.error,
    },
  };
  // Internal factual source material is persisted inside the existing proof
  // bundle, not duplicated in every public endpoint/scan serialization.
  Object.defineProperty(snapshot, "_tz101_execution_quote", {value:factualExecution, enumerable:false});
  return snapshot;
}

/* =========================================================
   SPOT SNAPSHOT — существующий модуль
   ========================================================= */

async function spotSnapshot(params) {
  const requestJson = typeof params?._fetch_json === "function" ? params._fetch_json : fetchJson;
  const now = Date.now();
  const inputSymbol = params.symbol || params.pair || params.contract || "ETHFI-USDT";
  const symbol = normalizeSpotSymbol(inputSymbol);
  const notional = clamp(params.notional_usdt ?? params.notional, 10, 1000000, 1000);
  const tradesRequested = Math.round(clamp(params.trades ?? params.size, 1, 2000, 2000));
  const freshnessSec = Math.round(clamp(params.freshness_sec, 60, 3600, 900));
  const min1h = Math.round(clamp(params.min_trades_1h, 1, 10000, 20));
  const min4h = Math.round(clamp(params.min_trades_4h, 1, 10000, 50));
  const min24h = Math.round(clamp(params.min_trades_24h, 1, 100000, 100));

  const endpoints = {
    ticker: `${SPOT_BASE}/market/detail/merged?symbol=${encodeURIComponent(symbol)}`,
    depth:
      `${SPOT_BASE}/market/depth?symbol=${encodeURIComponent(symbol)}` +
      `&type=step0&depth=20`,
    trades:
      `${SPOT_BASE}/market/history/trade?symbol=${encodeURIComponent(symbol)}` +
      `&size=${tradesRequested}`,
    kline_1m:
      `${SPOT_BASE}/market/history/kline?symbol=${encodeURIComponent(symbol)}` +
      `&period=1min&size=2000`,
  };

  const [tickerR, depthR, tradesR, kline1mR] = await Promise.all([
    requestJson(endpoints.ticker),
    requestJson(endpoints.depth),
    requestJson(endpoints.trades),
    requestJson(endpoints.kline_1m),
  ]);

  const ticker = tickerR.data?.tick || null;
  const depthTick = depthR.data?.tick || null;
  const bids = Array.isArray(depthTick?.bids) ? depthTick.bids : [];
  const asks = Array.isArray(depthTick?.asks) ? depthTick.asks : [];

  const bestBid = num(ticker?.bid?.[0]) ?? num(bids?.[0]?.[0]);
  const bestAsk = num(ticker?.ask?.[0]) ?? num(asks?.[0]?.[0]);
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = spread !== null && mid > 0 ? (spread / mid) * 10000 : null;

  const top1Bid = sumDepth(bids, 1, 1);
  const top1Ask = sumDepth(asks, 1, 1);
  const top20Bid = sumDepth(bids, 20, 1);
  const top20Ask = sumDepth(asks, 20, 1);
  const imbalance = orderBookImbalance(bids, asks, 20, 1);
  const buyImpact =
    bestAsk !== null ? marketImpact(asks, notional, bestAsk, "buy", 1) : null;
  const sellImpact =
    bestBid !== null ? marketImpact(bids, notional, bestBid, "sell", 1) : null;

  const tradeList = flattenTrades(tradesR.data?.data);
  const closedSpotMinuteKlines = normalizeKlines(kline1mR.data).filter(
    (row) => row.ts + 60000 <= now
  );
  const orderFlow = spotFlowAnalysis(
    tradeList,
    now,
    freshnessSec,
    min1h,
    min4h,
    min24h,
    closedSpotMinuteKlines
  );

  const health = {
    ticker: Boolean(tickerR.ok && ticker && num(ticker.close) !== null),
    depth: Boolean(depthR.ok && bids.length && asks.length),
    trades_endpoint: Boolean(tradesR.ok),
    trades_received: Boolean(tradesR.ok && tradeList.length),
    factual_1m_trade_count: Boolean(kline1mR.ok && closedSpotMinuteKlines.length),
    latest_trade_fresh: Boolean(orderFlow.freshness.latest_trade_fresh),
    order_flow_1h_usable: Boolean(orderFlow.quality.window_1h_usable),
    order_flow_4h_usable: Boolean(orderFlow.quality.window_4h_usable),
    order_flow_24h_usable: Boolean(orderFlow.quality.window_24h_usable),
  };

  const coverage = {
    htx_spot_market: health.ticker ? "closed" : "not_closed",
    htx_spot_liquidity:
      health.ticker && health.depth && buyImpact && sellImpact ? "closed" : "not_closed",
    htx_spot_order_flow_sample:
      health.trades_received && health.latest_trade_fresh ? "closed" : "not_closed",
    htx_spot_order_flow: health.order_flow_1h_usable ? "closed" : "not_closed",
    htx_spot_order_flow_1h: health.order_flow_1h_usable ? "closed" : "not_closed",
    htx_spot_order_flow_4h: health.order_flow_4h_usable ? "closed" : "not_closed",
    htx_spot_order_flow_24h: health.order_flow_24h_usable ? "closed" : "not_closed",
    htx_spot_cvd_delta_factual_1h:
      orderFlow.windows?.["1h"]?.factual_cvd?.usable === true
        ? "closed"
        : "not_closed",
  };

  let qualityStatus = "RED";
  if (health.ticker && health.depth && health.order_flow_1h_usable) {
    qualityStatus = "GREEN";
  } else if (health.ticker && health.depth && health.trades_received) {
    qualityStatus = "YELLOW";
  }

  return {
    source: "HTX official public API",
    market: "HTX Spot",
    version: "2.1",
    requested_symbol: inputSymbol,
    symbol,
    requested_notional_usdt: notional,
    trades_requested: tradesRequested,
    timestamp: now,
    timestamp_utc: new Date(now).toISOString(),
    quality_status: qualityStatus,
    quality_rules: {
      freshness_sec: freshnessSec,
      min_trades_1h: min1h,
      min_trades_4h: min4h,
      min_trades_24h: min24h,
      rule:
        "GREEN = свежая последняя сделка + достаточно сделок + полное покрытие окна 1ч. YELLOW = данные есть, но текущий поток недостаточно качественный. RED = критических данных нет.",
    },
    ticker_24h: ticker
      ? {
          last_price: num(ticker.close),
          open: num(ticker.open),
          high: num(ticker.high),
          low: num(ticker.low),
          volume_base_24h: num(ticker.amount),
          turnover_quote_24h: num(ticker.vol),
          trade_count_24h: num(ticker.count),
          timestamp: iso(tickerR.data?.ts),
        }
      : null,
    bbo: {
      best_bid: bestBid,
      best_ask: bestAsk,
      spread,
      spread_bps: spreadBps,
    },
    liquidity: {
      best_bid: bestBid,
      best_ask: bestAsk,
      spread,
      spread_bps: spreadBps,
      top_1_depth_bid: top1Bid,
      top_1_depth_ask: top1Ask,
      top_20_depth_bid: top20Bid,
      top_20_depth_ask: top20Ask,
      order_book_imbalance: imbalance,
      buy_market_impact: buyImpact,
      sell_market_impact: sellImpact,
      depth_timestamp: iso(depthTick?.ts) || iso(depthR.data?.ts),
    },
    order_flow: orderFlow,
    health,
    endpoint_health: health,
    coverage,
    note:
      "Spot taker buy/sell рассчитаны из официальных HTX raw trades. Delta/CVD считаются достоверными только при точном совпадении raw trade-records с суммой factual count закрытых 1m свечей того же окна; иначе это диагностическая неполная выборка.",
    endpoint_errors: {
      ticker: tickerR.ok ? null : tickerR.error,
      depth: depthR.ok ? null : depthR.error,
      trades: tradesR.ok ? null : tradesR.error,
      kline_1m: kline1mR.ok ? null : kline1mR.error,
    },
  };
}/* =========================================================
   FUTURES TRAJECTORY — НОВЫЙ МОДУЛЬ ДЛЯ CHAIN 6
   Синхронизирует цену, поток и OI по фактическим временным окнам.
   OI HTX исторически доступен с минимальной гранулярностью 60 минут,
   поэтому 5м/15м OI не выдумывается.
   ========================================================= */

function normalizeKlines(raw) {
  const list = Array.isArray(raw?.data) ? raw.data : [];
  return list
    .map((k) => ({
      ts: normalizeTs(k?.id),
      open: num(k?.open),
      high: num(k?.high),
      low: num(k?.low),
      close: num(k?.close),
      volume_contracts: num(k?.vol),
      volume_base: num(k?.amount),
      turnover_usdt: num(k?.trade_turnover),
      trade_count: nullableNum(k?.count),
    }))
    .filter(
      (k) =>
        k.ts !== null &&
        k.open !== null &&
        k.high !== null &&
        k.low !== null &&
        k.close !== null
    )
    .sort((a, b) => a.ts - b.ts);
}

function summarizePriceRange(klines, startMs, endMs) {
  const bars = klines.filter((k) => k.ts >= startMs && k.ts < endMs);
  const exactMinuteWindow = endMs > startMs && (endMs - startMs) % 60000 === 0;
  const expectedBars = exactMinuteWindow ? (endMs - startMs) / 60000 : null;

  if (!bars.length) {
    return {
      usable: false,
      coverage: "not_closed",
      window_start_time: iso(startMs),
      window_end_time: iso(endMs),
      expected_1m_bars: expectedBars,
      received_1m_bars: 0,
    };
  }

  const first = bars[0];
  const last = bars[bars.length - 1];
  const high = Math.max(...bars.map((k) => k.high));
  const low = Math.min(...bars.map((k) => k.low));

  const volumeContracts = bars.reduce(
    (s, k) => s + (k.volume_contracts || 0),
    0
  );

  const volumeBase = bars.reduce(
    (s, k) => s + (k.volume_base || 0),
    0
  );

  const turnover = bars.reduce(
    (s, k) => s + (k.turnover_usdt || 0),
    0
  );

  const tradeCounts = bars.map((k) => nullableNum(k.trade_count));
  const tradeCountComplete = tradeCounts.every(
    (value) => Number.isSafeInteger(value) && value >= 0
  );
  const exactBars =
    exactMinuteWindow &&
    bars.length === expectedBars &&
    first.ts === startMs &&
    last.ts + 60000 === endMs &&
    new Set(bars.map((row) => row.ts)).size === bars.length &&
    bars.every((row, index) => index === 0 || row.ts - bars[index - 1].ts === 60000);
  const candidateTradeCount = tradeCountComplete
    ? tradeCounts.reduce((sum, value) => sum + value, 0)
    : null;
  const tradeCount = Number.isSafeInteger(candidateTradeCount)
    ? candidateTradeCount
    : null;

  const startsNearBoundary = first.ts <= startMs + 60000;
  const endsNearBoundary = last.ts + 60000 >= endMs - 60000;
  const enoughBars = bars.length >= Math.ceil(expectedBars * 0.95);

  const usable =
    startsNearBoundary &&
    endsNearBoundary &&
    enoughBars;

  const range = high - low;

  return {
    usable,
    coverage: usable ? "closed" : "not_closed",
    window_start_ts: startMs,
    window_start_time: iso(startMs),
    window_end_ts: endMs,
    window_end_time: iso(endMs),
    expected_1m_bars: expectedBars,
    received_1m_bars: bars.length,
    open: first.open,
    high,
    low,
    close: last.close,
    change_pct: pctChange(first.open, last.close),
    close_location_pct:
      range > 0
        ? ((last.close - low) / range) * 100
        : null,
    volume_contracts: volumeContracts,
    volume_base: volumeBase,
    turnover_usdt: turnover,
    trade_count: tradeCount,
    trade_count_complete: tradeCountComplete && tradeCount !== null,
    exact_1m_bars: exactBars,
    first_bar_time: iso(first.ts),
    last_bar_time: iso(last.ts),
  };
}

function tradesInRange(trades, startMs, endMs) {
  const filtered = trades.filter((trade) => {
    const ts = tradeTime(trade);
    return ts !== null && ts >= startMs && ts < endMs;
  });
  return tradeArrayWithScanMetadata(filtered, {
    source_truncated: trades?._source_truncated === true,
    containers_scanned: trades?._containers_scanned,
    raw_rows_scanned: trades?._raw_rows_scanned,
    source_rows_dropped: trades?._source_rows_dropped,
  });
}

function factualMinuteTradeCount(klines, startMs, endMs) {
  const exactMinuteWindow = endMs > startMs && (endMs - startMs) % 60000 === 0;
  const expectedBars = exactMinuteWindow ? (endMs - startMs) / 60000 : null;
  const bars = (Array.isArray(klines) ? klines : [])
    .filter((row) => row.ts >= startMs && row.ts < endMs)
    .sort((a, b) => a.ts - b.ts);
  const exactBars =
    exactMinuteWindow &&
    bars.length === expectedBars &&
    bars[0]?.ts === startMs &&
    bars.at(-1)?.ts + 60000 === endMs &&
    bars.every((row, index) => index === 0 || row.ts - bars[index - 1].ts === 60000);
  const counts = bars.map((row) => nullableNum(row?.trade_count));
  const countFieldsComplete = counts.every(
    (value) => Number.isSafeInteger(value) && value >= 0
  );
  const candidateTradeCount = countFieldsComplete
    ? counts.reduce((sum, value) => sum + value, 0)
    : null;
  const factualTradeCount = Number.isSafeInteger(candidateTradeCount)
    ? candidateTradeCount
    : null;
  return {
    status: exactBars && countFieldsComplete && factualTradeCount !== null
      ? "COMPLETE"
      : "MISSING_OR_INCOMPLETE_FACTUAL_1M_COUNTS",
    expected_1m_bars: expectedBars,
    received_1m_bars: bars.length,
    exact_1m_bars: exactBars,
    trade_count_fields_complete: countFieldsComplete && factualTradeCount !== null,
    factual_1m_trade_count: exactBars && countFieldsComplete && factualTradeCount !== null
      ? factualTradeCount
      : null,
  };
}

function cvdDeltaQuality(rawTradeCount, factualCoverage, recordIntegrity = null) {
  const rawCount = nullableNum(rawTradeCount);
  const factualCount = nullableNum(factualCoverage?.factual_1m_trade_count);
  const countExactMatch =
    factualCoverage?.status === "COMPLETE" &&
    rawCount !== null &&
    factualCount !== null &&
    rawCount === factualCount;
  const payloadComplete = recordIntegrity?.complete === true;
  const exactMatch = countExactMatch && payloadComplete;
  return {
    status: exactMatch ? "COMPLETE" : "INCOMPLETE_OR_UNVERIFIED",
    reliable: exactMatch,
    raw_trade_count: rawCount,
    factual_1m_trade_count: factualCount,
    trade_count_exact_match: countExactMatch,
    raw_record_integrity_complete: payloadComplete,
    record_integrity: recordIntegrity,
    completeness_ratio:
      rawCount !== null && factualCount !== null && factualCount > 0
        ? rawCount / factualCount
        : factualCount === 0 && rawCount === 0
          ? 1
          : null,
    factual_coverage: factualCoverage,
    rule: "Delta/CVD is reliable only when unique, structurally valid raw trade records exactly match factual closed 1m trade_count for the same timestamp window.",
  };
}

function strictSpotCvdWindow(orderedTrades, factualMinuteKlines, startMs, endMs) {
  const inRange = tradesInRange(orderedTrades, startMs, endMs);
  const summary = summarizeSpotTrades(inRange);
  const factual = factualMinuteTradeCount(factualMinuteKlines, startMs, endMs);
  const quality = cvdDeltaQuality(
    inRange.length,
    factual,
    rawTradeRecordIntegrity(inRange, { market: "spot" })
  );
  return {
    ...summary,
    raw_trade_count: inRange.length,
    factual_1m_trade_count: factual.factual_1m_trade_count,
    window_start_ts: startMs,
    window_end_ts: endMs,
    cvd_delta_quality: quality,
    usable: quality.reliable,
    coverage: quality.reliable ? "closed_factual_trade_count_match" : "not_closed_trade_count_mismatch",
  };
}

function summarizeFuturesFlowRange(
  orderedTrades,
  startMs,
  endMs,
  contractSize,
  minTrades,
  boundaryToleranceMs = 120000,
  factualPriceWindow = null
) {
  const times = orderedTrades
    .map(tradeTime)
    .filter((ts) => ts !== null);

  const sampleFirst = times.length
    ? times[0]
    : null;

  const sampleLast = times.length
    ? times[times.length - 1]
    : null;

  const inRange = tradesInRange(
    orderedTrades,
    startMs,
    endMs
  );

  const summary = summarizeFuturesTrades(
    inRange,
    contractSize
  );

  const coversStart =
    sampleFirst !== null &&
    sampleFirst <= startMs;

  const coversEnd =
    sampleLast !== null &&
    sampleLast >= endMs - boundaryToleranceMs;

  const enoughTrades =
    inRange.length >= minTrades;

  const usable =
    coversStart &&
    coversEnd &&
    enoughTrades;

  const factualCoverage = {
    status:
      factualPriceWindow?.usable === true &&
      factualPriceWindow?.exact_1m_bars === true &&
      factualPriceWindow?.trade_count_complete === true &&
      num(factualPriceWindow?.trade_count) !== null
        ? "COMPLETE"
        : "MISSING_OR_INCOMPLETE_FACTUAL_1M_COUNTS",
    expected_1m_bars: nullableNum(factualPriceWindow?.expected_1m_bars),
    received_1m_bars: nullableNum(factualPriceWindow?.received_1m_bars),
    exact_1m_bars: factualPriceWindow?.exact_1m_bars === true,
    trade_count_fields_complete: factualPriceWindow?.trade_count_complete === true,
    factual_1m_trade_count:
      factualPriceWindow?.usable === true &&
      factualPriceWindow?.exact_1m_bars === true &&
      factualPriceWindow?.trade_count_complete === true
        ? nullableNum(factualPriceWindow?.trade_count)
        : null,
  };
  const quality = cvdDeltaQuality(
    inRange.length,
    factualCoverage,
    rawTradeRecordIntegrity(inRange, {
      market: "futures",
      contract_size: contractSize,
    })
  );

  return {
    ...summary,
    window_start_ts: startMs,
    window_start_time: iso(startMs),
    window_end_ts: endMs,
    window_end_time: iso(endMs),
    sample_first_trade_time: iso(sampleFirst),
    sample_last_trade_time: iso(sampleLast),
    history_covers_window_start: coversStart,
    history_covers_window_end: coversEnd,
    minimum_trades_required: minTrades,
    enough_trades: enoughTrades,
    usable: usable && quality.reliable,
    transport_window_usable: usable,
    legacy_transport_window_usable: usable,
    coverage: usable && quality.reliable
      ? "closed_factual_trade_count_and_payload_match"
      : "not_closed_cvd_integrity",
    cvd_delta_quality: quality,
    cvd_delta_usable: quality.reliable,
    cvd_delta_reliable: quality.reliable,
    raw_delta_is_diagnostic_only: !quality.reliable,
    raw_sample_diagnostic: summary,
  };
}

function normalizeOiHistory(raw) {
  const ticks = Array.isArray(raw?.data?.tick)
    ? raw.data.tick
    : [];

  return ticks
    .map((t) => ({
      ts: normalizeTs(t?.ts),
      volume: num(t?.volume),
      value_usdt: num(t?.value),
      amount_type: num(t?.amount_type),
    }))
    .filter(
      (t) =>
        t.ts !== null &&
        t.volume !== null
    )
    .sort((a, b) => a.ts - b.ts);
}

function nearestPoint(
  series,
  targetTs,
  toleranceMs = 5 * 60 * 1000
) {
  if (!Array.isArray(series) || !series.length) {
    return null;
  }

  let best = null;
  let bestDistance = Infinity;

  for (const point of series) {
    const distance = Math.abs(
      point.ts - targetTs
    );

    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return bestDistance <= toleranceMs
    ? best
    : null;
}

function oiAlignedWindow(
  contractSeries,
  baseSeries,
  hours,
  nowMs
) {
  if (!contractSeries.length) {
    return null;
  }

  const endContracts =
    contractSeries[
      contractSeries.length - 1
    ];

  const startTarget =
    endContracts.ts -
    hours * 3600000;

  const startContracts =
    nearestPoint(
      contractSeries,
      startTarget
    );

  if (!startContracts) {
    return null;
  }

  const startBase =
    nearestPoint(
      baseSeries,
      startContracts.ts
    );

  const endBase =
    nearestPoint(
      baseSeries,
      endContracts.ts
    );

  const actualHours =
    (endContracts.ts -
      startContracts.ts) /
    3600000;

  const exactDuration =
    Math.abs(actualHours - hours) <= 0.1;

  const recentStart =
    endContracts.ts -
    24 * 3600000;

  const recent =
    contractSeries.filter(
      (p) =>
        p.ts >= recentStart &&
        p.ts <= endContracts.ts
    );

  const recentMaxContracts =
    recent.length
      ? Math.max(
          ...recent
            .map((p) => p.volume)
            .filter((v) =>
              Number.isFinite(v)
            )
        )
      : null;

  const endContractsValue =
    endContracts.volume;

  const endValueUsdt =
    endContracts.value_usdt;

  const startValueUsdt =
    startContracts.value_usdt;

  const contractsDelta =
    endContractsValue -
    startContracts.volume;

  const baseDelta =
    startBase && endBase
      ? endBase.volume -
        startBase.volume
      : null;

  const valueDelta =
    endValueUsdt !== null &&
    startValueUsdt !== null
      ? endValueUsdt -
        startValueUsdt
      : null;

  const endAgeSec =
    Math.max(
      0,
      nowMs - endContracts.ts
    ) / 1000;

  const fresh =
    endAgeSec <=
    90 * 60;

  const usable = Boolean(
    exactDuration &&
    startBase &&
    endBase &&
    fresh
  );

  return {
    usable,
    coverage:
      usable
        ? "closed"
        : "not_closed",

    source_period: "60min",
    requested_hours: hours,
    actual_hours: actualHours,
    end_age_sec: endAgeSec,
    fresh,
    freshness_limit_sec:
      90 * 60,

    window_start_ts:
      startContracts.ts,

    window_start_time:
      iso(startContracts.ts),

    window_end_ts:
      endContracts.ts,

    window_end_time:
      iso(endContracts.ts),

    contracts: {
      start:
        startContracts.volume,
      end:
        endContractsValue,
      delta:
        contractsDelta,
      change_pct:
        pctChange(
          startContracts.volume,
          endContractsValue
        ),
    },

    base: {
      start:
        startBase?.volume ?? null,
      end:
        endBase?.volume ?? null,
      delta:
        baseDelta,
      change_pct:
        startBase && endBase
          ? pctChange(
              startBase.volume,
              endBase.volume
            )
          : null,
    },

    value_usdt: {
      start:
        startValueUsdt,
      end:
        endValueUsdt,
      delta:
        valueDelta,
      change_pct:
        pctChange(
          startValueUsdt,
          endValueUsdt
        ),
    },

    recent_24h_max_contracts:
      recentMaxContracts,

    distance_from_recent_24h_max_pct:
      recentMaxContracts &&
      recentMaxContracts > 0
        ? (
            endContractsValue /
              recentMaxContracts -
            1
          ) * 100
        : null,
  };
}

function normalizeFundingHistory(raw) {
  const list = Array.isArray(
    raw?.data?.data
  )
    ? raw.data.data
    : [];

  return list
    .map((item) => ({
      funding_time_ts:
        normalizeTs(
          item?.funding_time
        ),

      funding_time:
        iso(
          item?.funding_time
        ),

      funding_rate:
        num(
          item?.funding_rate
        ),

      funding_rate_pct:
        num(
          item?.funding_rate
        ) !== null
          ? num(
              item?.funding_rate
            ) * 100
          : null,

      realized_rate:
        num(
          item?.realized_rate
        ),

      realized_rate_pct:
        num(
          item?.realized_rate
        ) !== null
          ? num(
              item?.realized_rate
            ) * 100
          : null,

      avg_premium_index:
        num(
          item?.avg_premium_index
        ),
    }))
    .filter(
      (item) =>
        item.funding_time_ts !== null
    )
    .sort(
      (a, b) =>
        a.funding_time_ts -
        b.funding_time_ts
    );
}

function median(values) {
  const a = values
    .filter(Number.isFinite)
    .sort((x, y) => x - y);

  if (!a.length) {
    return null;
  }

  const mid =
    Math.floor(
      a.length / 2
    );

  return a.length % 2
    ? a[mid]
    : (
        a[mid - 1] +
        a[mid]
      ) / 2;
}

function fundingTrajectory(
  currentRaw,
  history
) {
  const currentRate =
    num(
      currentRaw?.funding_rate
    );

  const estimatedRate =
    num(
      currentRaw?.estimated_rate
    );

  const fundingTimeTs =
    normalizeTs(
      currentRaw?.funding_time
    );

  const nextFundingTimeTs =
    normalizeTs(
      currentRaw?.next_funding_time
    );

  const intervals = [];

  for (
    let i = 1;
    i < history.length;
    i += 1
  ) {
    const diff =
      history[i].funding_time_ts -
      history[i - 1].funding_time_ts;

    if (diff > 0) {
      intervals.push(
        diff / 3600000
      );
    }
  }

  const derivedIntervalHours =
    fundingTimeTs !== null &&
    nextFundingTimeTs !== null &&
    nextFundingTimeTs >
      fundingTimeTs
      ? (
          nextFundingTimeTs -
          fundingTimeTs
        ) / 3600000
      : median(
          intervals.slice(-10)
        );

  return {
    current:
      currentRaw
        ? {
            funding_rate:
              currentRate,

            funding_rate_pct:
              currentRate !== null
                ? currentRate * 100
                : null,

            estimated_rate:
              estimatedRate,

            estimated_rate_pct:
              estimatedRate !== null
                ? estimatedRate * 100
                : null,

            funding_time_ts:
              fundingTimeTs,

            funding_time:
              iso(
                fundingTimeTs
              ),

            next_funding_time_ts:
              nextFundingTimeTs,

            next_funding_time:
              iso(
                nextFundingTimeTs
              ),
          }
        : null,

    derived_settlement_interval_hours:
      derivedIntervalHours,

    history_count:
      history.length,

    recent_history:
      history
        .slice(-12)
        .reverse(),
  };
}

function priceFlowAlignment(
  price,
  flow
) {
  if (
    !price?.usable ||
    !flow?.usable ||
    flow?.cvd_delta_reliable !== true
  ) {
    return "insufficient";
  }

  const p =
    num(price.change_pct);

  const d =
    num(flow.delta_usdt);

  if (
    p === null ||
    d === null
  ) {
    return "insufficient";
  }

  if (
    d > 0 &&
    p > 0
  ) {
    return "buying_confirms_price_up";
  }

  if (
    d < 0 &&
    p < 0
  ) {
    return "selling_confirms_price_down";
  }

  if (
    d < 0 &&
    p >= 0
  ) {
    return "negative_flow_price_resilient";
  }

  if (
    d > 0 &&
    p <= 0
  ) {
    return "positive_flow_price_weak";
  }

  return "neutral";
}

function oiPriceState(
  price,
  oi
) {
  if (
    !price?.usable ||
    !oi?.usable
  ) {
    return "insufficient";
  }

  const p =
    num(price.change_pct);

  const o =
    num(
      oi?.contracts?.change_pct
    );

  if (
    p === null ||
    o === null
  ) {
    return "insufficient";
  }

  if (
    p > 0 &&
    o > 0
  ) {
    return "price_up_oi_up";
  }

  if (
    p > 0 &&
    o < 0
  ) {
    return "price_up_oi_down";
  }

  if (
    p < 0 &&
    o > 0
  ) {
    return "price_down_oi_up";
  }

  if (
    p < 0 &&
    o < 0
  ) {
    return "price_down_oi_down";
  }

  return "flat_or_mixed";
}

function absorptionCandidate(
  price,
  flow
) {
  if (
    !price?.usable ||
    !flow?.usable ||
    flow?.cvd_delta_reliable !== true
  ) {
    return {
      value: "insufficient",
      rule:
        "Нужны одновременно закрытые price и order-flow окна.",
    };
  }

  const p =
    num(price.change_pct);

  const d =
    num(flow.delta_usdt);

  if (
    p === null ||
    d === null
  ) {
    return {
      value: "insufficient",
      rule:
        "Недостаточно числовых данных.",
    };
  }

  return {
    value:
      d < 0 &&
      p >= 0,

    rule:
      "Кандидат=true только при отрицательном taker Delta и неотрицательном изменении цены в том же окне. Это кандидат на поглощение, не доказательство.",
  };
}

function buildTrajectoryWindow({
  label,
  startMs,
  endMs,
  klines,
  orderedTrades,
  contractSize,
  minTrades,
  oi,
}) {
  const price =
    summarizePriceRange(
      klines,
      startMs,
      endMs
    );

  const flow =
    summarizeFuturesFlowRange(
      orderedTrades,
      startMs,
      endMs,
      contractSize,
      minTrades,
      120000,
      price
    );

  return {
    label,

    synchronized_window_start_ts:
      startMs,

    synchronized_window_start_time:
      iso(startMs),

    synchronized_window_end_ts:
      endMs,

    synchronized_window_end_time:
      iso(endMs),

    price,
    order_flow: flow,
    open_interest: oi,

    derived: {
      price_flow_alignment:
        priceFlowAlignment(
          price,
          flow
        ),

      oi_price_state:
        oi
          ? oiPriceState(
              price,
              oi
            )
          : "insufficient",

      absorption_candidate:
        absorptionCandidate(
          price,
          flow
        ),

      failed_absorption_candidate: {
        value:
          "insufficient",

        reason:
          "Автоматически не заявляется: нужен ранее зафиксированный уровень поглощения и последующая потеря структуры. Сырые синхронизированные данные передаются в Decision Layer.",
      },
    },
  };
}async function futuresTrajectory(params) {
  const requestJson = typeof params?._fetch_json === "function" ? params._fetch_json : fetchJson;
  const now = Date.now();
  const contract = normalizeFuturesContract(
    params.contract || params.contract_code || params.symbol || "ETHFI-USDT"
  );

  const tradesRequested = Math.round(
    clamp(params.trades ?? params.size, 100, 2000, 2000)
  );
  const klineSize = Math.round(clamp(params.kline_size, 1500, 2000, 1600));
  const min5m = Math.round(clamp(params.min_trades_5m, 1, 10000, 5));
  const min15m = Math.round(clamp(params.min_trades_15m, 1, 10000, 10));
  const min1h = Math.round(clamp(params.min_trades_1h, 1, 10000, 20));
  const min4h = Math.round(clamp(params.min_trades_4h, 1, 10000, 50));
  const min24h = Math.round(clamp(params.min_trades_24h, 1, 100000, 100));

  const endpoints = {
    info:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_contract_info` +
      `?contract_code=${encodeURIComponent(contract)}`,

    kline_1m:
      `${FUTURES_BASE}/linear-swap-ex/market/history/kline` +
      `?contract_code=${encodeURIComponent(contract)}&period=1min&size=${klineSize}`,

    kline_15m:
      `${FUTURES_BASE}/linear-swap-ex/market/history/kline` +
      `?contract_code=${encodeURIComponent(contract)}&period=15min&size=2000`,

    kline_1h:
      `${FUTURES_BASE}/linear-swap-ex/market/history/kline` +
      `?contract_code=${encodeURIComponent(contract)}&period=60min&size=2000`,

    kline_1d:
      `${FUTURES_BASE}/linear-swap-ex/market/history/kline` +
      `?contract_code=${encodeURIComponent(contract)}&period=1day&size=200`,

    trades:
      `${FUTURES_BASE}/linear-swap-ex/market/history/trade` +
      `?contract_code=${encodeURIComponent(contract)}&size=${tradesRequested}`,

    oi_contracts:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_his_open_interest` +
      `?contract_code=${encodeURIComponent(contract)}&period=60min&size=30&amount_type=1`,

    oi_base:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_his_open_interest` +
      `?contract_code=${encodeURIComponent(contract)}&period=60min&size=30&amount_type=2`,

    oi_current:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_open_interest` +
      `?contract_code=${encodeURIComponent(contract)}`,

    funding_current:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_funding_rate` +
      `?contract_code=${encodeURIComponent(contract)}`,

    funding_history:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_historical_funding_rate` +
      `?contract_code=${encodeURIComponent(contract)}&page_index=1&page_size=50`,
  };

  const [
    infoR,
    klineR,
    kline15mR,
    kline1hR,
    kline1dR,
    tradesR,
    oiContractsR,
    oiBaseR,
    oiCurrentR,
    fundingCurrentR,
    fundingHistoryR,
  ] = await Promise.all([
    requestJson(endpoints.info),
    requestJson(endpoints.kline_1m),
    requestJson(endpoints.kline_15m),
    requestJson(endpoints.kline_1h),
    requestJson(endpoints.kline_1d),
    requestJson(endpoints.trades),
    requestJson(endpoints.oi_contracts),
    requestJson(endpoints.oi_base),
    requestJson(endpoints.oi_current),
    requestJson(endpoints.funding_current),
    requestJson(endpoints.funding_history),
  ]);

  const contractInfo = findContractInfo(infoR.data, contract);
  let contractSize = num(contractInfo?.contract_size);
  const tradeList = flattenTrades(tradesR.data?.data);

  if ((contractSize === null || contractSize <= 0) && tradeList.length) {
    const testTrade = tradeList.find(
      (trade) => num(trade?.amount) > 0 && num(trade?.quantity) > 0
    );

    if (testTrade) {
      contractSize =
        num(testTrade.quantity) /
        num(testTrade.amount);
    }
  }

  const klinesAll = normalizeKlines(klineR.data);

  const closedKlines = klinesAll.filter(
    (k) => k.ts + 60000 <= now
  );

  const closed1hKlines =
    normalizeKlines(
      kline1hR.data
    ).filter(
      (k) =>
        k.ts +
          60 * 60 * 1000 <=
        now
    );

  const closed15mKlines =
    normalizeKlines(
      kline15mR.data
    ).filter(
      (k) =>
        k.ts +
          15 * 60 * 1000 <=
        now
    );

  const closed1dKlines =
    normalizeKlines(
      kline1dR.data
    ).filter(
      (k) =>
        k.ts +
          24 * 60 * 60 * 1000 <=
        now
    );

  const latestClosed =
    closedKlines.length
      ? closedKlines[closedKlines.length - 1]
      : null;

  const latestClosedEnd =
    latestClosed
      ? latestClosed.ts + 60000
      : null;

  const orderedTrades = sortedTrades(tradeList);

  const oiContracts = normalizeOiHistory(oiContractsR.data);
  const oiBase = normalizeOiHistory(oiBaseR.data);

  const oi1h = oiAlignedWindow(
    oiContracts,
    oiBase,
    1,
    now
  );

  const oi4h = oiAlignedWindow(
    oiContracts,
    oiBase,
    4,
    now
  );

  const oi24h = oiAlignedWindow(
    oiContracts,
    oiBase,
    24,
    now
  );

  const windows = {};

  if (latestClosedEnd !== null) {
    windows["5m"] = buildTrajectoryWindow({
      label: "5m",
      startMs:
        latestClosedEnd -
        5 * 60 * 1000,
      endMs: latestClosedEnd,
      klines: closedKlines,
      orderedTrades,
      contractSize,
      minTrades: min5m,
      oi: {
        usable: false,
        coverage: "not_available",
        reason:
          "HTX historical OI minimum period is 60min; 5m OI is not invented.",
      },
    });

    windows["15m"] = buildTrajectoryWindow({
      label: "15m",
      startMs:
        latestClosedEnd -
        15 * 60 * 1000,
      endMs: latestClosedEnd,
      klines: closedKlines,
      orderedTrades,
      contractSize,
      minTrades: min15m,
      oi: {
        usable: false,
        coverage: "not_available",
        reason:
          "HTX historical OI minimum period is 60min; 15m OI is not invented.",
      },
    });
  }

  function addOiAlignedWindow(
    label,
    oiWindow,
    minTrades
  ) {
    if (!oiWindow) {
      windows[label] = {
        label,
        coverage: "not_closed",
        reason:
          "Недостаточно исторических OI точек для синхронизации окна.",
      };
      return;
    }

    windows[label] = buildTrajectoryWindow({
      label,
      startMs:
        oiWindow.window_start_ts,
      endMs:
        oiWindow.window_end_ts,
      klines:
        closedKlines,
      orderedTrades,
      contractSize,
      minTrades,
      oi:
        oiWindow,
    });
  }

  addOiAlignedWindow(
    "1h",
    oi1h,
    min1h
  );

  addOiAlignedWindow(
    "4h",
    oi4h,
    min4h
  );

  addOiAlignedWindow(
    "24h",
    oi24h,
    min24h
  );

  const fundingHistory =
    normalizeFundingHistory(
      fundingHistoryR.data
    );

  const fundingRaw =
    fundingCurrentR.data?.data ||
    null;

  const funding =
    fundingTrajectory(
      fundingRaw,
      fundingHistory
    );

  const currentOiRaw =
    findOi(
      oiCurrentR.data,
      contract
    );

  const currentOpenInterest =
    currentOiRaw
      ? {
          contracts:
            num(currentOiRaw.volume),

          amount_base:
            num(currentOiRaw.amount),

          value_usdt:
            num(currentOiRaw.value),

          trade_volume_24h_contracts:
            num(currentOiRaw.trade_volume),

          trade_amount_24h_base:
            num(currentOiRaw.trade_amount),

          trade_turnover_24h_usdt:
            num(currentOiRaw.trade_turnover),

          response_timestamp:
            iso(oiCurrentR.data?.ts),
        }
      : null;

  const tradeTimes =
    orderedTrades
      .map(tradeTime)
      .filter(
        (ts) =>
          ts !== null
      );

  const firstTradeTs =
    tradeTimes.length
      ? tradeTimes[0]
      : null;

  const lastTradeTs =
    tradeTimes.length
      ? tradeTimes[
          tradeTimes.length - 1
        ]
      : null;

  const health = {
    info:
      Boolean(
        infoR.ok &&
        contractInfo
      ),

    price_1m:
      Boolean(
        klineR.ok &&
        closedKlines.length
      ),

    price_1h_native:
      Boolean(
        kline1hR.ok &&
        closed1hKlines.length
      ),

    price_15m_native:
      Boolean(
        kline15mR.ok &&
        closed15mKlines.length
      ),

    price_1d_native:
      Boolean(
        kline1dR.ok &&
        closed1dKlines.length
      ),

    trades:
      Boolean(
        tradesR.ok &&
        tradeList.length
      ),

    oi_contracts_history:
      Boolean(
        oiContractsR.ok &&
        oiContracts.length
      ),

    oi_base_history:
      Boolean(
        oiBaseR.ok &&
        oiBase.length
      ),

    oi_current:
      Boolean(
        oiCurrentR.ok &&
        currentOiRaw
      ),

    funding_current:
      Boolean(
        fundingCurrentR.ok &&
        fundingRaw
      ),

    funding_history:
      Boolean(
        fundingHistoryR.ok &&
        fundingHistory.length
      ),
  };

  const coverage = {
    price_5m:
      windows["5m"]?.price?.usable
        ? "closed"
        : "not_closed",

    price_15m:
      windows["15m"]?.price?.usable
        ? "closed"
        : "not_closed",

    price_1h:
      windows["1h"]?.price?.usable
        ? "closed"
        : "not_closed",

    price_4h:
      windows["4h"]?.price?.usable
        ? "closed"
        : "not_closed",

    price_24h:
      windows["24h"]?.price?.usable
        ? "closed"
        : "not_closed",

    flow_5m:
      windows["5m"]?.order_flow?.usable
        ? "closed"
        : "not_closed",

    flow_15m:
      windows["15m"]?.order_flow?.usable
        ? "closed"
        : "not_closed",

    flow_1h:
      windows["1h"]?.order_flow?.usable
        ? "closed"
        : "not_closed",

    flow_4h:
      windows["4h"]?.order_flow?.usable
        ? "closed"
        : "not_closed",

    flow_24h:
      windows["24h"]?.order_flow?.usable
        ? "closed"
        : "not_closed",

    oi_5m: "not_available",
    oi_15m: "not_available",

    oi_1h:
      oi1h?.usable
        ? "closed"
        : "not_closed",

    oi_4h:
      oi4h?.usable
        ? "closed"
        : "not_closed",

    oi_24h:
      oi24h?.usable
        ? "closed"
        : "not_closed",

    funding_current:
      health.funding_current
        ? "closed"
        : "not_closed",

    funding_history:
      health.funding_history
        ? "closed"
        : "not_closed",
  };

  const response = {
    source:
      "HTX official public API",

    market:
      "HTX USDT-M Futures",

    tool:
      "htx_futures_trajectory",

    version:
      "1.2-opportunity-integrity-inputs",

    contract,

    timestamp:
      now,

    timestamp_utc:
      new Date(
        now
      ).toISOString(),

    contract_info:
      contractInfo
        ? {
            contract_code:
              contractInfo.contract_code,

            symbol:
              contractInfo.symbol,

            contract_size:
              contractSize,

            price_tick:
              num(
                contractInfo.price_tick
              ),

            contract_status:
              contractInfo.contract_status,
          }
        : null,

    source_rules: {
      price:
        "Официальные HTX 1m/15m/1h/1d Kline. Native 15m сохраняет точные границы 3d/7d outcome для четвертьчасовых событий; 1ч/4ч/24ч синхронизируются с фактическими часовыми OI timestamp.",

      open_interest:
        "Официальный HTX swap_his_open_interest. Минимальная историческая гранулярность 60min; 5m/15m OI не рассчитывается и не интерполируется.",

      order_flow:
        "Официальные HTX raw trades, максимум 2000 возвращённых trade-records. Границы и минимум сделок описывают только transport coverage; Delta/CVD надёжны исключительно при точном совпадении числа raw records с суммой factual count всех закрытых 1m свечей того же окна.",

      funding:
        "Текущий funding + официальная история settlement. Интервал funding выводится из фактических timestamp, а не предполагается.",
    },

    raw_sample_meta: {
      klines_requested:
        klineSize,

      closed_1m_klines_received:
        closedKlines.length,

      closed_15m_klines_received:
        closed15mKlines.length,

      closed_1h_klines_received:
        closed1hKlines.length,

      closed_1d_klines_received:
        closed1dKlines.length,

      latest_closed_kline_end_time:
        iso(
          latestClosedEnd
        ),

      trades_requested:
        tradesRequested,

      flattened_trades_received:
        orderedTrades.length,

      first_trade_time:
        iso(
          firstTradeTs
        ),

      last_trade_time:
        iso(
          lastTradeTs
        ),

      oi_contract_points:
        oiContracts.length,

      oi_base_points:
        oiBase.length,

      funding_history_points:
        fundingHistory.length,
    },

    current_open_interest:
      currentOpenInterest,

    funding,
    windows,
    health,
    endpoint_health:
      health,
    coverage,

    notes: [
      "1ч/4ч/24ч строятся на одном и том же фактическом интервале цены, raw-trades и исторического OI.",
      "5м/15м содержат цену и поток; OI на этих окнах отсутствует у официального REST-источника HTX и не выдумывается.",
      "failed_absorption_candidate автоматически не подтверждается без ранее идентифицированного уровня поглощения и последующей потери структуры.",
      "Если history trade sample не перекрывает окно полностью или raw trade-record count не совпадает с factual 1m trade_count, Delta/CVD остаются неполной диагностической выборкой независимо от их величины.",
    ],

    endpoint_errors: {
      info:
        infoR.ok
          ? null
          : infoR.error,

      kline_1m:
        klineR.ok
          ? null
          : klineR.error,

      kline_15m:
        kline15mR.ok
          ? null
          : kline15mR.error,

      kline_1h:
        kline1hR.ok
          ? null
          : kline1hR.error,

      kline_1d:
        kline1dR.ok
          ? null
          : kline1dR.error,

      trades:
        tradesR.ok
          ? null
          : tradesR.error,

      oi_contracts:
        oiContractsR.ok
          ? null
          : oiContractsR.error,

      oi_base:
        oiBaseR.ok
          ? null
          : oiBaseR.error,

      oi_current:
        oiCurrentR.ok
          ? null
          : oiCurrentR.error,

      funding_current:
        fundingCurrentR.ok
          ? null
          : fundingCurrentR.error,

      funding_history:
        fundingHistoryR.ok
          ? null
          : fundingHistoryR.error,
    },
  };

  /*
   * These factual source rows are private inputs for Stage 3.9. They
   * are deliberately non-enumerable so the existing trajectory API
   * and stored JSON do not grow without an explicit contract change.
   */
  Object.defineProperty(
    response,
    "_opportunity_shadow_inputs",
    {
      enumerable: false,
      value: {
        one_minute:
          closedKlines,
        fifteen_minute:
          closed15mKlines,
        one_hour:
          closed1hKlines,
        one_day:
          closed1dKlines,
        oi_contracts_hourly:
          oiContracts,
        oi_base_hourly:
          oiBase,
        current_open_interest:
          currentOpenInterest,
        funding,
        windows,
      },
    }
  );

  return response;
}/* =========================================================
   DATA PLANE v3 — P0 INFRASTRUCTURE
   Adds full-universe Stage-0 scanning, optional D1 persistence,
   factual HTX liquidation polling, technical watch output and
   infrastructure quality/status. Existing snapshot/spot/trajectory
   behavior remains unchanged.
   ========================================================= */

function fetchJsonWithMethod(url, method = "GET") {
  let timeout = null;

  return (async () => {
    try {
      const controller =
        new AbortController();

      timeout = setTimeout(
        () => controller.abort(),
        10000
      );

      const response = await fetch(
        url,
        {
          method,
          headers: {
            accept:
              "application/json",

            "content-type":
              "application/json",

            "user-agent":
              "My-Report-2-HUB/3.1-data-plane",
          },

          signal:
            controller.signal,
        }
      );

      const text =
        await response.text();

      let data;

      try {
        data =
          JSON.parse(text);
      } catch {
        return {
          ok: false,
          url,
          http_status:
            response.status,
          data: null,
          error:
            "invalid_json",
        };
      }

      const apiOk =
        response.ok &&
        (
          data?.status === "ok" ||
          data?.code === 200 ||
          data?.success === true ||
          (
            data?.status === undefined &&
            data?.code === undefined &&
            data?.success === undefined
          )
        );

      return {
        ok: apiOk,
        url,
        http_status:
          response.status,
        data,

        error:
          apiOk
            ? null
            : data?.["err-msg"] ||
              data?.err_msg ||
              data?.message ||
              data?.msg ||
              "api_error",
      };
    } catch (error) {
      return {
        ok: false,
        url,
        http_status: null,
        data: null,

        error:
          error?.name ===
          "AbortError"
            ? "timeout"
            : String(
                error?.message ||
                error
              ),
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  })();
}

function asArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function contractKey(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .toUpperCase();
}

function isUnicodeContract(value) {
  return /[^\x00-\x7F]/.test(
    String(value || "")
  );
}

function classifyHtxInstrumentScope(info) {
  const labelsPresent =
    Array.isArray(
      info?.labels
    );

  const tradfiLabelsPresent =
    Array.isArray(
      info?.tradfi_labels
    );

  const labels =
    labelsPresent
      ? info.labels
          .map(
            (value) =>
              String(
                value || ""
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      : [];

  const tradfiLabels =
    tradfiLabelsPresent
      ? info.tradfi_labels
          .map(
            (value) =>
              String(
                value || ""
              ).trim()
          )
          .filter(Boolean)
      : [];

  const businessType =
    String(
      info?.business_type ||
      ""
    )
      .trim()
      .toLowerCase();

  const contractType =
    String(
      info?.contract_type ||
      ""
    )
      .trim()
      .toLowerCase();

  const tradePartition =
    String(
      info?.trade_partition ||
      ""
    )
      .trim()
      .toUpperCase();

  const tradfiLabelSet =
    new Set([
      "tradfi",
      "stock",
      "indices",
      "commodities",
    ]);

  const htxTradfiClassified =
    tradfiLabels.length > 0 ||
    labels.some(
      (label) =>
        tradfiLabelSet.has(
          label
        )
    );

  const evidenceComplete =
    labelsPresent &&
    tradfiLabelsPresent &&
    Boolean(businessType) &&
    Boolean(contractType) &&
    Boolean(tradePartition);

  const correctMarket =
    businessType === "swap" &&
    contractType === "swap" &&
    tradePartition === "USDT";

  let classification =
    "UNKNOWN_FAIL_CLOSED";

  const reasons = [];

  if (!labelsPresent) {
    reasons.push(
      "HTX_LABELS_FIELD_MISSING"
    );
  }

  if (!tradfiLabelsPresent) {
    reasons.push(
      "HTX_TRADFI_LABELS_FIELD_MISSING"
    );
  }

  if (!correctMarket) {
    reasons.push(
      "NOT_ACTIVE_USDT_SWAP_SCOPE"
    );
  }

  if (htxTradfiClassified) {
    reasons.push(
      "HTX_TRADFI_CLASSIFIED"
    );
  }

  if (
    evidenceComplete &&
    correctMarket
  ) {
    classification =
      htxTradfiClassified
        ? "NON_CRYPTO_HTX_CLASSIFIED"
        : "CRYPTO_CONFIRMED";
  }

  if (
    classification ===
      "CRYPTO_CONFIRMED" &&
    !reasons.length
  ) {
    reasons.push(
      "HTX_SCOPE_FIELDS_CONFIRM_CRYPTO"
    );
  }

  return {
    classification,

    eligible_for_crypto_discovery:
      classification ===
      "CRYPTO_CONFIRMED",

    source:
      "HTX swap_contract_info labels/tradfi_labels",

    source_fields_present: {
      labels:
        labelsPresent,

      tradfi_labels:
        tradfiLabelsPresent,

      business_type:
        Boolean(businessType),

      contract_type:
        Boolean(contractType),

      trade_partition:
        Boolean(tradePartition),
    },

    evidence: {
      business_type:
        businessType || null,

      contract_type:
        contractType || null,

      trade_partition:
        tradePartition || null,

      labels,

      tradfi_labels:
        tradfiLabels,
    },

    reasons,
  };
}

function symbolFingerprint(info) {
  const exact =
    String(
      info?.contract_code ||
      ""
    );

  const symbol =
    String(
      info?.symbol ||
      ""
    );

  const multiplierMatch =
    symbol.match(
      /^(\d{2,})/
    );

  const codepoints =
    [...exact].map(
      (ch) =>
        `U+${ch
          .codePointAt(0)
          .toString(16)
          .toUpperCase()
          .padStart(4, "0")}`
    );

  const hasZeroWidth =
    /[\u200B-\u200D\uFEFF]/u.test(
      exact
    ) ||
    /[\u200B-\u200D\uFEFF]/u.test(
      symbol
    );

  const scripts = {
    cjk:
      /\p{Script=Han}/u.test(
        exact
      ) ||
      /\p{Script=Han}/u.test(
        symbol
      ),

    cyrillic:
      /\p{Script=Cyrillic}/u.test(
        exact
      ) ||
      /\p{Script=Cyrillic}/u.test(
        symbol
      ),

    greek:
      /\p{Script=Greek}/u.test(
        exact
      ) ||
      /\p{Script=Greek}/u.test(
        symbol
      ),
  };

  return {
    htx_contract_exact_utf8:
      exact,

    normalized_match_key:
      contractKey(exact),

    symbol_exact_utf8:
      symbol,

    unicode_codepoints:
      codepoints,

    has_non_ascii:
      isUnicodeContract(exact) ||
      isUnicodeContract(symbol),

    has_zero_width:
      hasZeroWidth,

    script_flags:
      scripts,

    multiplier_prefix:
      multiplierMatch
        ? Number(
            multiplierMatch[1]
          )
        : null,

    business_type:
      info?.business_type ||
      "swap",

    pair:
      info?.pair ||
      exact,

    contract_type:
      info?.contract_type ||
      "swap",

    project_identity:
      null,

    contract_address:
      null,

    resolution_status:
      exact
        ? "RESOLVED_HTX_EXACT"
        : "SYMBOL_UNRESOLVED",

    identity_confidence:
      exact
        ? "HTX_CONTRACT_EXACT"
        : "UNRESOLVED",
  };
}

function mapByContract(list) {
  const m =
    new Map();

  for (
    const item
    of asArray(list)
  ) {
    const key =
      contractKey(
        item?.contract_code ||
        item?.contract ||
        item?.pair
      );

    if (key) {
      m.set(
        key,
        item
      );
    }
  }

  return m;
}

function pctDelta(
  current,
  prior
) {
  const c =
    num(current);

  const p =
    num(prior);

  if (
    c === null ||
    p === null ||
    p === 0
  ) {
    return null;
  }

  return (
    c / p - 1
  ) * 100;
}

function fundingIntervalHoursFromRaw(
  funding,
  info
) {
  const explicitCandidates = [
    info?.funding_interval,
    info?.funding_interval_hours,
    info?.funding_interval_hour,
    funding?.funding_interval,
  ];

  for (
    const v
    of explicitCandidates
  ) {
    const n =
      num(v);

    if (
      n !== null &&
      n > 0 &&
      n <= 24
    ) {
      return {
        hours: n,
        source:
          "explicit_field",
      };
    }
  }

  const a =
    normalizeTs(
      funding?.funding_time
    );

  const b =
    normalizeTs(
      funding?.next_funding_time
    );

  if (
    a !== null &&
    b !== null &&
    b > a
  ) {
    return {
      hours:
        (
          b - a
        ) /
        3600000,

      source:
        "funding_timestamps",
    };
  }

  return {
    hours: null,
    source:
      "not_available_in_batch_response",
  };
}

function stageState(
  priceChange,
  oiChange
) {
  const p =
    num(priceChange);

  const o =
    num(oiChange);

  if (
    p === null ||
    o === null
  ) {
    return "insufficient";
  }

  if (
    p > 0 &&
    o > 0
  ) {
    return "price_up_oi_up";
  }

  if (
    p > 0 &&
    o < 0
  ) {
    return "price_up_oi_down";
  }

  if (
    p < 0 &&
    o > 0
  ) {
    return "price_down_oi_up";
  }

  if (
    p < 0 &&
    o < 0
  ) {
    return "price_down_oi_down";
  }

  return "flat_or_mixed";
}

async function loadHistoryTargets(
  env,
  nowMs
) {
  if (!env?.DATA_DB) {
    return {
      available: false,
      reason:
        "D1 binding DATA_DB is not configured",
      targets: {},
    };
  }

  const targets = [
    [
      "5m",
      5 * 60 * 1000,
      3 * 60 * 1000,
    ],
    [
      "15m",
      15 * 60 * 1000,
      5 * 60 * 1000,
    ],
    [
      "1h",
      60 * 60 * 1000,
      10 * 60 * 1000,
    ],
    [
      "4h",
      4 * 60 * 60 * 1000,
      20 * 60 * 1000,
    ],
  ];

  function payloadToMap(
    payloadText,
    snapshotTs = null
  ) {
    const map =
      new Map();

    if (!payloadText) {
      return map;
    }

    let payload;

    try {
      payload =
        JSON.parse(
          payloadText
        );
    } catch {
      return map;
    }

    for (
      const row
      of asArray(
        payload?.contracts
      )
    ) {
      if (
        !Array.isArray(row) ||
        !row.length
      ) {
        continue;
      }

      const [
        contract_code,
        price,
        turnover_24h,
        oi_contracts,
        oi_value_usdt,
        funding_rate,
        funding_interval_hours,
        market_age_sec,
        source_status,
        prior_long_watch = null,
        prior_short_watch = null,
        prior_long_trigger_count = 0,
        prior_short_trigger_count = 0,
      ] = row;

      const key =
        contractKey(
          contract_code
        );

      if (!key) {
        continue;
      }

      map.set(
        key,
        {
          ts:
            snapshotTs,

          contract_code,
          price,
          turnover_24h,
          oi_contracts,
          oi_value_usdt,
          funding_rate,
          funding_interval_hours,
          market_age_sec,
          source_status,
          prior_discovery: {
            long_watch:
              prior_long_watch ===
              true,
            short_watch:
              prior_short_watch ===
              true,
            long_trigger_count:
              Number.isFinite(
                Number(
                  prior_long_trigger_count
                )
              )
                ? Number(
                    prior_long_trigger_count
                  )
                : 0,
            short_trigger_count:
              Number.isFinite(
                Number(
                  prior_short_trigger_count
                )
              )
                ? Number(
                    prior_short_trigger_count
                  )
                : 0,
          },
        }
      );
    }

    return map;
  }

  try {
    const statements =
      targets.map(
        (
          [
            label,
            offset,
            tolerance,
          ]
        ) => {
          const target =
            nowMs -
            Number(offset);

          const bucket =
            Math.floor(
              target /
              300000
            ) *
            300000;

          return env.DATA_DB
            .prepare(`
              SELECT
                ts,
                ts_bucket,
                payload_json
              FROM scan_runs
              WHERE ts_bucket
                BETWEEN ?1 AND ?2
              ORDER BY
                ABS(
                  ts_bucket - ?3
                ) ASC
              LIMIT 1
            `)
            .bind(
              bucket -
                Number(
                  tolerance
                ),

              bucket +
                Number(
                  tolerance
                ),

              bucket
            );
        }
      );

    const results =
      await env.DATA_DB.batch(
        statements
      );

    const out = {};

    let snapshotRowsFound =
      0;

    targets.forEach(
      ([label], i) => {
        const first =
          asArray(
            results?.[i]
              ?.results
          )[0] ||
          null;

        const map =
          payloadToMap(
            first?.payload_json,
            first?.ts ??
              null
          );

        if (first) {
          snapshotRowsFound +=
            1;
        }

        out[label] =
          map;
      }
    );

    return {
      available: true,

      populated:
        snapshotRowsFound >
        0,

      snapshots_found:
        snapshotRowsFound,

      reason:
        snapshotRowsFound >
        0
          ? null
          : "D1 is connected but no prior Stage-0 snapshots exist yet",

      targets:
        out,
    };
  } catch (error) {
    return {
      available: false,

      reason:
        String(
          error?.message ||
          error
        ),

      targets: {},
    };
  }
}

function historyMetrics(
  current,
  row
) {
  if (!row) {
    return {
      available: false,
      price_change_pct: null,
      oi_change_pct: null,
      funding_change_pct_points: null,
      turnover_24h_change_pct: null,
      state: "insufficient",
    };
  }

  const priceChange =
    pctDelta(
      current.price,
      row.price
    );

  const oiChange =
    pctDelta(
      current.oi_contracts,
      row.oi_contracts
    );

  const fundingNow =
    num(
      current.funding_rate
    );

  const fundingPrior =
    num(
      row.funding_rate
    );

  const fundingDelta =
    fundingNow !== null &&
    fundingPrior !== null
      ? (
          fundingNow -
          fundingPrior
        ) * 100
      : null;

  return {
    available: true,

    reference_ts:
      row.ts,

    reference_time:
      iso(row.ts),

    price_change_pct:
      priceChange,

    oi_change_pct:
      oiChange,

    funding_change_pct_points:
      fundingDelta,

    turnover_24h_change_pct:
      pctDelta(
        current.turnover_24h,
        row.turnover_24h
      ),

    prior_discovery:
      row?.prior_discovery ||
      null,

    state:
      stageState(
        priceChange,
        oiChange
      ),
  };
}

function accelerationFromWindows(
  shorter,
  longer,
  shortMinutes,
  longMinutes
) {
  if (
    !shorter?.available ||
    !longer?.available
  ) {
    return null;
  }

  function accel(
    a,
    b
  ) {
    const x =
      num(a);

    const y =
      num(b);

    if (
      x === null ||
      y === null
    ) {
      return null;
    }

    return (
      x /
      shortMinutes
    ) -
    (
      y /
      longMinutes
    );
  }

  return {
    short_window_minutes:
      shortMinutes,

    long_window_minutes:
      longMinutes,

    price_pct_per_min_delta:
      accel(
        shorter.price_change_pct,
        longer.price_change_pct
      ),

    oi_pct_per_min_delta:
      accel(
        shorter.oi_change_pct,
        longer.oi_change_pct
      ),

    funding_pct_points_per_min_delta:
      accel(
        shorter.funding_change_pct_points,
        longer.funding_change_pct_points
      ),

    turnover_24h_pct_per_min_delta_proxy:
      accel(
        shorter.turnover_24h_change_pct,
        longer.turnover_24h_change_pct
      ),

    turnover_note:
      "Rolling-24h turnover change is only an activity-acceleration proxy, not exact interval volume.",
  };
}

function compactStage0Payload(
  scan
) {
  return {
    schema:
      "stage0-compact-v2",

    timestamp:
      scan.timestamp,

    contracts:
      scan.contracts.map(
        (c) => [
          c.contract_code,
          c.price,
          c.turnover_24h_usdt,
          c.open_interest
            ?.contracts ??
            null,
          c.open_interest
            ?.value_usdt ??
            null,
          c.funding
            ?.funding_rate ??
            null,
          c.funding
            ?.interval_hours ??
            null,
          c.freshness
            ?.market_age_sec ??
            null,
          c.data_status,
          c.discovery_shadow
            ?.long_watch ??
            null,
          c.discovery_shadow
            ?.short_watch ??
            null,
          c.discovery_shadow
            ?.long_trigger_count ??
            0,
          c.discovery_shadow
            ?.short_trigger_count ??
            0,
        ]
      ),
  };
}

async function persistStage0(
  env,
  scan
) {
  if (!env?.DATA_DB) {
    return {
      status:
        "SOURCE_UNSUPPORTED",

      reason:
        "D1 binding DATA_DB is not configured",
    };
  }

  try {
    if (
      !scan?.health
        ?.contracts ||
      !scan?.counts
        ?.universe_total
    ) {
      return {
        status:
          "NOT_CLOSED",

        reason:
          "Universe contract list is unavailable/empty; refusing to persist an invalid baseline scan",
      };
    }

    const tsBucket =
      Math.floor(
        scan.timestamp /
        300000
      ) *
      300000;

    const compactPayload =
      compactStage0Payload(
        scan
      );

    const payloadText =
      JSON.stringify(
        compactPayload
      );

    const payloadBytes =
      new TextEncoder()
        .encode(
          payloadText
        )
        .length;

    if (
      payloadBytes >
      1800000
    ) {
      return {
        status:
          "NOT_CLOSED",

        reason:
          `Compact universe payload is ${payloadBytes} bytes and exceeds the 1.8MB safety ceiling`,
      };
    }

    await env.DATA_DB
      .prepare(`
        INSERT OR REPLACE
        INTO scan_runs (
          ts_bucket,
          ts,
          universe_total,
          scanned,
          missing,
          errors,
          stale,
          stage0_coverage_pct,
          payload_json
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5,
          ?6,
          ?7,
          ?8,
          ?9
        )
      `)
      .bind(
        tsBucket,
        scan.timestamp,
        scan.counts
          .universe_total,
        scan.counts
          .scanned,
        scan.counts
          .missing,
        scan.counts
          .errors,
        scan.counts
          .stale,
        scan.coverage
          .stage0_coverage_pct,
        payloadText
      )
      .run();

    const retentionBefore =
      scan.timestamp -
      7 *
      24 *
      60 *
      60 *
      1000;

    await env.DATA_DB
      .prepare(`
        DELETE FROM
          scan_runs
        WHERE
          ts_bucket < ?1
      `)
      .bind(
        retentionBefore
      )
      .run();

    return {
      status:
        "CLOSED",

      rows_written:
        1,

      storage_model:
        "ONE_COMPACT_UNIVERSE_ROW_PER_SCAN",

      ts_bucket:
        tsBucket,

      payload_bytes:
        payloadBytes,

      retention_days:
        7,
    };
  } catch (error) {
    return {
      status:
        "PARTIAL",

      reason:
        String(
          error?.message ||
          error
        ),
    };
  }
}async function htxUniverseScan(params, env, options = {}) {
  const now = Date.now();

  const freshnessSec = Math.round(
    clamp(
      params.freshness_sec,
      30,
      3600,
      300
    )
  );

  const endpoints = {
    contracts:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_contract_info`,

    market:
      `${FUTURES_BASE}/v2/linear-swap-ex/market/detail/batch_merged`,

    oi:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_open_interest`,

    funding:
      `${FUTURES_BASE}/linear-swap-api/v1/swap_batch_funding_rate`,
  };

  const [
    contractsR,
    marketR,
    oiR,
    fundingR,
    history,
  ] = await Promise.all([
    fetchJson(
      endpoints.contracts
    ),

    fetchJson(
      endpoints.market
    ),

    fetchJson(
      endpoints.oi
    ),

    fetchJson(
      endpoints.funding
    ),

    loadHistoryTargets(
      env,
      now
    ),
  ]);

  const allInfo =
    asArray(
      contractsR.data?.data
    );

  const active =
    allInfo.filter(
      (x) => {
        const business =
          String(
            x?.business_type ||
            "swap"
          ).toLowerCase();

        return (
          Number(
            x?.contract_status
          ) === 1 &&
          business === "swap"
        );
      }
    );

  const marketMap =
    mapByContract(
      marketR.data?.ticks ||
      marketR.data?.data
    );

  const oiMap =
    mapByContract(
      oiR.data?.data
    );

  const fundingMap =
    mapByContract(
      fundingR.data?.data
    );

  const apiTimes = {
    contracts:
      normalizeTs(
        contractsR.data?.ts
      ),

    market:
      normalizeTs(
        marketR.data?.ts
      ),

    oi:
      normalizeTs(
        oiR.data?.ts
      ),

    funding:
      normalizeTs(
        fundingR.data?.ts
      ),
  };

  const contracts =
    active.map(
      (info) => {
        const code =
          String(
            info.contract_code ||
            ""
          );

        const key =
          contractKey(
            code
          );

        const market =
          marketMap.get(
            key
          ) ||
          null;

        const oi =
          oiMap.get(
            key
          ) ||
          null;

        const funding =
          fundingMap.get(
            key
          ) ||
          null;

        const price =
          num(
            market?.close ??
            market?.last_price ??
            market?.price
          );

        const turnover =
          num(
            market?.trade_turnover ??
            market?.vol ??
            oi?.trade_turnover
          );

        const marketTs =
          normalizeTs(
            market?.ts
          ) ??
          apiTimes.market;

        const marketAgeSec =
          marketTs !== null
            ? Math.max(
                0,
                now - marketTs
              ) /
              1000
            : null;

        const fundingInterval =
          fundingIntervalHoursFromRaw(
            funding,
            info
          );

        const instrumentScope =
          classifyHtxInstrumentScope(
            info
          );

        const current = {
          price,

          turnover_24h:
            turnover,

          oi_contracts:
            num(
              oi?.volume
            ),

          funding_rate:
            num(
              funding?.funding_rate
            ),
        };

        const transitions = {
          "5m":
            historyMetrics(
              current,
              history.targets?.[
                "5m"
              ]?.get(
                key
              )
            ),

          "15m":
            historyMetrics(
              current,
              history.targets?.[
                "15m"
              ]?.get(
                key
              )
            ),

          "1h":
            historyMetrics(
              current,
              history.targets?.[
                "1h"
              ]?.get(
                key
              )
            ),

          "4h":
            historyMetrics(
              current,
              history.targets?.[
                "4h"
              ]?.get(
                key
              )
            ),
        };

        const missing =
          [];

        if (!market) {
          missing.push(
            "market"
          );
        }

        if (!oi) {
          missing.push(
            "oi"
          );
        }

        if (!funding) {
          missing.push(
            "funding"
          );
        }

        if (
          price === null
        ) {
          missing.push(
            "price"
          );
        }

        const stale =
          marketAgeSec !== null
            ? marketAgeSec >
              freshnessSec
            : true;

        const dataStatus =
          missing.length
            ? "PARTIAL"
            : stale
            ? "STALE"
            : "CLOSED";

        return {
          contract_code:
            code,

          symbol:
            info?.symbol ||
            null,

          symbol_fingerprint:
            symbolFingerprint(
              info
            ),

          instrument_scope:
            instrumentScope,

          contract_size:
            num(
              info?.contract_size
            ),

          price_tick:
            num(
              info?.price_tick
            ),

          price,

          volume_24h_contracts:
            num(
              market?.vol
            ),

          amount_24h_base:
            num(
              market?.amount
            ),

          turnover_24h_usdt:
            turnover,

          open_interest:
            oi
              ? {
                  contracts:
                    num(
                      oi.volume
                    ),

                  amount_base:
                    num(
                      oi.amount
                    ),

                  value_usdt:
                    num(
                      oi.value
                    ),

                  trade_volume_24h_contracts:
                    num(
                      oi.trade_volume
                    ),

                  trade_turnover_24h_usdt:
                    num(
                      oi.trade_turnover
                    ),
                }
              : null,

          funding:
            funding
              ? {
                  funding_rate:
                    num(
                      funding.funding_rate
                    ),

                  funding_rate_pct:
                    num(
                      funding.funding_rate
                    ) !== null
                      ? num(
                          funding.funding_rate
                        ) *
                        100
                      : null,

                  funding_time:
                    iso(
                      funding.funding_time
                    ),

                  interval_hours:
                    fundingInterval.hours,

                  interval_source:
                    fundingInterval.source,
                }
              : null,

          transitions,

          acceleration: {
            "5m_vs_15m":
              accelerationFromWindows(
                transitions["5m"],
                transitions["15m"],
                5,
                15
              ),

            "15m_vs_1h":
              accelerationFromWindows(
                transitions["15m"],
                transitions["1h"],
                15,
                60
              ),
          },

          freshness: {
            market_timestamp:
              iso(
                marketTs
              ),

            market_age_sec:
              marketAgeSec,

            freshness_limit_sec:
              freshnessSec,

            stale,
          },

          quality: {
            market_present:
              Boolean(
                market
              ),

            oi_present:
              Boolean(
                oi
              ),

            funding_present:
              Boolean(
                funding
              ),

            history_available:
              Boolean(
                history.available &&
                history.populated
              ),

            crypto_scope_confirmed:
              instrumentScope
                .eligible_for_crypto_discovery,

            missing,
          },

          data_status:
            dataStatus,
        };
      }
    );

  const scanned =
    contracts.filter(
      (c) =>
        c.data_status ===
          "CLOSED" ||
        c.data_status ===
          "STALE"
    ).length;

  const stale =
    contracts.filter(
      (c) =>
        c.data_status ===
        "STALE"
    ).length;

  const missing =
    contracts.filter(
      (c) =>
        c.data_status ===
        "PARTIAL"
    ).length;

  const unicodeTotal =
    contracts.filter(
      (c) =>
        c.symbol_fingerprint
          .has_non_ascii
    ).length;

  const unicodeResolved =
    contracts.filter(
      (c) =>
        c.symbol_fingerprint
          .has_non_ascii &&
        c.symbol_fingerprint
          .resolution_status ===
          "RESOLVED_HTX_EXACT"
    ).length;

  const universeTotal =
    contracts.length;

  const cryptoScopeConfirmed =
    contracts.filter(
      (c) =>
        c?.instrument_scope
          ?.classification ===
        "CRYPTO_CONFIRMED"
    ).length;

  const nonCryptoHtxClassified =
    contracts.filter(
      (c) =>
        c?.instrument_scope
          ?.classification ===
        "NON_CRYPTO_HTX_CLASSIFIED"
    ).length;

  const instrumentScopeUnknown =
    contracts.filter(
      (c) =>
        c?.instrument_scope
          ?.classification ===
        "UNKNOWN_FAIL_CLOSED"
    ).length;

  const stage0CoveragePct =
    universeTotal
      ? (
          scanned /
          universeTotal
        ) *
        100
      : 0;

  const ages =
    contracts
      .map(
        (c) =>
          c.freshness
            .market_age_sec
      )
      .filter(
        Number.isFinite
      )
      .sort(
        (a, b) =>
          a - b
      );

  const p50 =
    ages.length
      ? ages[
          Math.floor(
            (
              ages.length - 1
            ) *
              0.5
          )
        ]
      : null;

  const p95 =
    ages.length
      ? ages[
          Math.floor(
            (
              ages.length - 1
            ) *
              0.95
          )
        ]
      : null;

  const output = {
    source:
      "HTX official public API",

    market:
      "HTX USDT-M Futures",

    tool:
      "htx_universe_scan",

    version:
      FAST_MOVE_WATCH_VERSION,

    timestamp:
      now,

    timestamp_utc:
      new Date(
        now
      ).toISOString(),

    counts: {
      universe_total:
        universeTotal,

      scanned,
      missing,

      crypto_scope_confirmed:
        cryptoScopeConfirmed,

      non_crypto_htx_classified:
        nonCryptoHtxClassified,

      instrument_scope_unknown:
        instrumentScopeUnknown,

      errors:
        [
          contractsR,
          marketR,
          oiR,
          fundingR,
        ].filter(
          (r) =>
            !r.ok
        ).length,

      stale,

      unicode_contracts:
        unicodeTotal,

      unicode_resolved:
        unicodeResolved,
    },

    coverage: {
      htx_universe:
        contractsR.ok
          ? "closed"
          : "not_closed",

      batch_market:
        marketR.ok
          ? "closed"
          : "not_closed",

      batch_open_interest:
        oiR.ok
          ? "closed"
          : "not_closed",

      batch_funding:
        fundingR.ok
          ? "closed"
          : "not_closed",

      persistent_history:
        !history.available
          ? "SOURCE_UNSUPPORTED"
          : history.populated
          ? "closed"
          : "NO_DATA",

      stage0_coverage_pct:
        stage0CoveragePct,

      crypto_instrument_scope:
        instrumentScopeUnknown === 0
          ? "closed"
          : "not_closed",

      crypto_instrument_scope_pct:
        universeTotal
          ? (
              (
                universeTotal -
                instrumentScopeUnknown
              ) /
              universeTotal
            ) *
            100
          : 0,

      unicode_resolution_pct:
        unicodeTotal
          ? (
              unicodeResolved /
              unicodeTotal
            ) *
            100
          : 100,
    },

    health: {
      contracts:
        contractsR.ok,

      market:
        marketR.ok,

      oi:
        oiR.ok,

      funding:
        fundingR.ok,

      data_db:
        Boolean(
          env?.DATA_DB
        ),
    },

    infrastructure_quality: {
      median_market_age_sec:
        p50,

      p95_market_age_sec:
        p95,

      endpoint_failure_rate_pct:
        25 *
        [
          contractsR,
          marketR,
          oiR,
          fundingR,
        ].filter(
          (r) =>
            !r.ok
        ).length,

      symbol_resolution_success_pct:
        universeTotal
          ? (
              contracts.filter(
                (c) =>
                  c
                    .symbol_fingerprint
                    .resolution_status ===
                  "RESOLVED_HTX_EXACT"
              ).length /
              universeTotal
            ) *
            100
          : 0,

      exotic_unicode_resolution_pct:
        unicodeTotal
          ? (
              unicodeResolved /
              unicodeTotal
            ) *
            100
          : 100,
    },

    history_status: {
      available:
        history.available,

      populated:
        Boolean(
          history.populated
        ),

      snapshots_found:
        history.snapshots_found ??
        0,

      reason:
        history.reason,

      note:
        history.available &&
        history.populated
          ? "Transitions use nearest persisted Stage-0 snapshots."
          : history.available
          ? "D1 is connected, but temporal transitions remain insufficient until prior scans accumulate."
          : "Current scan remains usable, but temporal transitions are insufficient until D1 persistence is configured and populated.",
    },

    contracts,

    endpoint_errors: {
      contracts:
        contractsR.ok
          ? null
          : contractsR.error,

      market:
        marketR.ok
          ? null
          : marketR.error,

      oi:
        oiR.ok
          ? null
          : oiR.error,

      funding:
        fundingR.ok
          ? null
          : fundingR.error,

      history:
        history.available
          ? null
          : history.reason,
    },

    rules: [
      "Exact HTX UTF-8 contract_code is the canonical identity; no translation is used.",
      "Automatic crypto discovery requires current HTX labels and tradfi_labels; TradFi or unknown scope fails closed.",
      "Missing values are never converted to zero.",
      "Transitions are calculated only from persisted historical observations; they are not reconstructed from current snapshots.",
      "Rolling-24h turnover change is labeled as a proxy and is not treated as exact interval volume.",
      "Stage-0 is a data/discovery layer, not a trade-entry decision.",
    ],
  };

  /*
   * Shadow discovery telemetry is computed
   * from the same in-memory Stage-0 scan
   * before persistence. This adds zero HTTP
   * and zero D1 reads/writes. The four tiny
   * compact fields let the next factual scan
   * identify false negatives prospectively.
   */
  const discoveryRecall =
    buildDiscoveryPrefilter(
      output,
      buildDeepCheckQueue(
        output
      ),
      {
        liquidity_percentile:
          0.70,
        early_liquidity_percentile:
          0.45,
        anomaly_percentile:
          0.95,
        early_anomaly_percentile:
          0.80,
        funding_percentile:
          0.95,
        funding_tail_percentile:
          0.10,
        min_anomaly_flags:
          2,
        min_early_flags:
          2,
        max_shortlist:
          24,
      }
    );

  const discoveryTelemetryMap =
    new Map(
      Array.isArray(
        discoveryRecall
          ?.contract_telemetry
      )
        ? discoveryRecall
            .contract_telemetry
            .map(
              (row) => [
                String(
                  row?.contract ||
                  ""
                ).trim(),
                row,
              ]
            )
        : []
    );

  for (const row of output.contracts) {
    const telemetry =
      discoveryTelemetryMap.get(
        String(
          row?.contract_code ||
          ""
        ).trim()
      );

    if (!telemetry) {
      row.discovery_shadow =
        null;
      continue;
    }

    row.discovery_shadow = {
      semantics:
        "DISCOVERY_ONLY_NOT_PROBABILITY_NOT_TRADE_SIGNAL",
      long_watch:
        telemetry.long_watch ===
        true,
      short_watch:
        telemetry.short_watch ===
        true,
      long_trigger_count:
        Array.isArray(
          telemetry.model_routes
        )
          ? telemetry.model_routes
              .filter(
                (route) =>
                  String(route)
                    .startsWith(
                      "LONG_"
                    )
              ).length
          : 0,
      short_trigger_count:
        Array.isArray(
          telemetry.model_routes
        )
          ? telemetry.model_routes
              .filter(
                (route) =>
                  String(route)
                    .startsWith(
                      "SHORT_"
                    )
              ).length
          : 0,
    };
  }

  output.discovery_recall = {
    mode:
      discoveryRecall?.mode ||
      null,
    semantics:
      discoveryRecall
        ?.semantics ||
      null,
    counts:
      discoveryRecall?.counts ||
      null,
    shortlist:
      Array.isArray(
        discoveryRecall
          ?.shortlist
      )
        ? discoveryRecall
            .shortlist
            .map(
              (row) => ({
                priority_rank:
                  row
                    ?.priority_rank ??
                  null,
                contract:
                  row?.contract ??
                  null,
                discovery_direction_hint:
                  row
                    ?.discovery_direction_hint ??
                  null,
                model_routes:
                  row
                    ?.model_routes ??
                  [],
                anomaly_flags_count:
                  row
                    ?.anomaly_flags_count ??
                  0,
              })
            )
        : [],
    false_negative_audit:
      discoveryRecall
        ?.false_negative_audit ||
      [],
    safety: {
      network_calls_generated: 0,
      d1_calls_generated: 0,
      live_probability: false,
      live_signal: false,
      validated_signal: false,
      trading_execution: false,
      decision_layer_weights_changed: false,
    },
  };

  if (
    options.persist ||
    String(
      params.persist ||
      ""
    ).toLowerCase() ===
      "true"
  ) {
    output.persistence =
      await persistStage0(
        env,
        output
      );
  } else {
    output.persistence = {
      status:
        env?.DATA_DB
          ? "NOT_REQUESTED"
          : "SOURCE_UNSUPPORTED",

      reason:
        env?.DATA_DB
          ? null
          : "D1 binding DATA_DB is not configured",
    };
  }

  return output;
}

function buildDeepCheckQueue(scan) {
  const contracts =
    Array.isArray(scan?.contracts)
      ? scan.contracts
      : [];

  const queue = [];
  const excluded = [];

  for (const row of contracts) {
    const reasons = [];
    const softDataGaps = [];

    const contract =
      String(
        row?.contract_code || ""
      ).trim();

    if (!contract) {
      reasons.push(
        "CONTRACT_MISSING"
      );
    }

    if (
      !["CLOSED", "PARTIAL"].includes(
        String(row?.data_status || "")
      )
    ) {
      reasons.push(
        "STAGE0_NOT_USABLE"
      );
    }

    if (
      row?.freshness?.stale !==
      false
    ) {
      reasons.push(
        "MARKET_DATA_NOT_FRESH"
      );
    }

    if (
      row?.quality
        ?.market_present !== true
    ) {
      reasons.push(
        "MARKET_MISSING"
      );
    }

    if (
      row?.quality
        ?.oi_present !== true
    ) {
      softDataGaps.push(
        "OPEN_INTEREST_UNKNOWN"
      );
    }

    if (
      row?.quality
        ?.funding_present !== true
    ) {
      softDataGaps.push(
        "FUNDING_UNKNOWN"
      );
    }

    if (
      row?.quality
        ?.history_available !== true
    ) {
      softDataGaps.push(
        "STAGE0_HISTORY_LIMITED"
      );
    }

    const declaredMissing =
      Array.isArray(row?.quality?.missing)
        ? row.quality.missing.map(
            (value) =>
              String(value || "")
                .trim()
                .toLowerCase()
          )
        : [];

    if (
      declaredMissing.some(
        (value) =>
          value === "market" ||
          value === "price"
      )
    ) {
      reasons.push(
        "ENTRY_DISCOVERY_CRITICAL_MARKET_DATA_MISSING"
      );
    }

    if (
      String(row?.data_status || "") ===
        "PARTIAL" &&
      !softDataGaps.length &&
      !declaredMissing.length &&
      !reasons.length
    ) {
      reasons.push(
        "STAGE0_PARTIAL_UNEXPLAINED"
      );
    }

    if (
      row?.symbol_fingerprint
        ?.resolution_status !==
      "RESOLVED_HTX_EXACT"
    ) {
      reasons.push(
        "SYMBOL_NOT_EXACTLY_RESOLVED"
      );
    }

    if (
      row?.instrument_scope
        ?.classification !==
      "CRYPTO_CONFIRMED"
    ) {
      reasons.push(
        "INSTRUMENT_SCOPE_NOT_CRYPTO_CONFIRMED"
      );
    }

    if (!reasons.length) {
      queue.push({
        contract,
        stage0_status:
          row.data_status,
        freshness_sec:
          row?.freshness
            ?.market_age_sec ??
          null,
        history_available:
          row?.quality
            ?.history_available === true,
        data_readiness:
          softDataGaps.length
            ? "PARTIAL_NEEDS_ENRICHMENT"
            : "CLOSED",
        soft_data_gaps:
          softDataGaps,
      });
    } else {
      excluded.push({
        contract:
          contract || null,
        reasons,
        soft_data_gaps:
          softDataGaps,
      });
    }
  }

  return {
    layer:
      "DEEP_CHECK_QUEUE",
    mode:
      "TECHNICAL_ELIGIBILITY_ONLY",

    counts: {
      universe_total:
        contracts.length,
      eligible:
        queue.length,
      excluded:
        excluded.length,
    },

    queue,
    excluded,

    decision: {
      generated: false,
      direction: null,
      probability: null,
      validated: false,
    },

    rules: [
      "No LONG/SHORT direction is generated.",
      "No trading probability or score is generated.",
      "No validated=true signal is generated.",
      "No strategy weights or Hard Veto rules are changed.",
      "Eligibility means only that Stage-0 evidence is technically suitable for Deep Check.",
      "Missing or stale data excludes a contract from this queue and is never converted to zero.",
    ],
  };
}


function discoveryQuantile(values, percentile) {
  const clean =
    Array.isArray(values)
      ? values
          .filter(
            (value) =>
              Number.isFinite(value)
          )
          .slice()
          .sort(
            (a, b) =>
              a - b
          )
      : [];

  if (!clean.length) {
    return null;
  }

  const p =
    Math.min(
      1,
      Math.max(
        0,
        Number(percentile)
      )
    );

  const position =
    (clean.length - 1) *
    p;

  const lower =
    Math.floor(position);

  const upper =
    Math.ceil(position);

  if (lower === upper) {
    return clean[lower];
  }

  return (
    clean[lower] *
      (upper - position) +
    clean[upper] *
      (position - lower)
  );
}

function buildDiscoveryPrefilter(
  scan,
  deepCheckQueue,
  options = {}
) {
  const contracts =
    Array.isArray(scan?.contracts)
      ? scan.contracts
      : [];

  const technicalQueue =
    Array.isArray(
      deepCheckQueue?.queue
    )
      ? deepCheckQueue.queue
      : [];

  const eligibleContracts =
    new Set(
      technicalQueue
        .map(
          (row) =>
            String(
              row?.contract || ""
            ).trim()
        )
        .filter(Boolean)
    );

  const liquidityPercentile =
    Math.min(
      0.95,
      Math.max(
        0.5,
        Number(
          options
            ?.liquidity_percentile ??
          0.70
        )
      )
    );

  /*
   * Recall lane: preserve the existing
   * p70 core-liquidity lane, but permit
   * earlier factual anomalies to reach
   * the same existing Deep Check / Fast
   * Move fairness pipeline when turnover
   * is alive and all technical evidence
   * is CLOSED/fresh/HTX-exact.
   *
   * This is NOT a lower execution gate.
   * HTX Execution remains mandatory in
   * Deep Check / Final Decision.
   */
  const earlyLiquidityPercentile =
    Math.min(
      0.70,
      Math.max(
        0.20,
        Number(
          options
            ?.early_liquidity_percentile ??
          0.45
        )
      )
    );

  const anomalyPercentile =
    Math.min(
      0.995,
      Math.max(
        0.80,
        Number(
          options
            ?.anomaly_percentile ??
          0.95
        )
      )
    );

  const earlyAnomalyPercentile =
    Math.min(
      anomalyPercentile,
      Math.max(
        0.65,
        Number(
          options
            ?.early_anomaly_percentile ??
          0.80
        )
      )
    );

  const fundingPercentile =
    Math.min(
      0.995,
      Math.max(
        0.80,
        Number(
          options
            ?.funding_percentile ??
          0.95
        )
      )
    );

  const fundingTailPercentile =
    Math.min(
      0.25,
      Math.max(
        0.02,
        Number(
          options
            ?.funding_tail_percentile ??
          0.10
        )
      )
    );

  const minAnomalyFlags =
    Math.min(
      8,
      Math.max(
        1,
        Math.round(
          Number(
            options
              ?.min_anomaly_flags ??
            2
          )
        )
      )
    );

  const minEarlyFlags =
    Math.min(
      8,
      Math.max(
        2,
        Math.round(
          Number(
            options
              ?.min_early_flags ??
            2
          )
        )
      )
    );

  const maxShortlist =
    Math.min(
      50,
      Math.max(
        1,
        Math.round(
          Number(
            options
              ?.max_shortlist ??
            24
          )
        )
      )
    );

  const eligibleRows =
    contracts.filter(
      (row) =>
        eligibleContracts.has(
          String(
            row?.contract_code ||
            ""
          ).trim()
        )
    );

  const finite =
    (value) =>
      Number.isFinite(value);

  const factualNumber =
    (raw) => {
      if (
        raw === null ||
        raw === undefined ||
        raw === ""
      ) {
        return null;
      }

      const value =
        Number(raw);

      return finite(value)
        ? value
        : null;
    };

  const turnoverOf =
    (row) =>
      factualNumber(
        row?.turnover_24h_usdt
      );

  const oiOf =
    (row) =>
      factualNumber(
        row?.open_interest
          ?.value_usdt
      );

  const fundingPctOf =
    (row) =>
      factualNumber(
        row?.funding
          ?.funding_rate_pct
      );

  const fundingIntervalHoursOf =
    (row) =>
      factualNumber(
        row?.funding
          ?.interval_hours
      );

  const fundingPerHourOf =
    (row) => {
      const funding =
        fundingPctOf(row);

      const interval =
        fundingIntervalHoursOf(
          row
        );

      if (!finite(funding)) {
        return null;
      }

      if (
        finite(interval) &&
        interval > 0
      ) {
        return funding / interval;
      }

      /*
       * Missing interval is not silently
       * assumed. Such a row may still use
       * raw funding for the neutral absolute-
       * extreme context flag. Funding sign or
       * interval never creates a LONG/SHORT
       * route; this only affects review priority.
       */
      return null;
    };

  const transitionMetric =
    (
      row,
      window,
      field
    ) =>
      factualNumber(
        row?.transitions
          ?.[window]
          ?.[field]
      );

  const turnoverValues =
    eligibleRows
      .map(turnoverOf)
      .filter(finite);

  const oiValues =
    eligibleRows
      .map(oiOf)
      .filter(finite);

  const turnoverFloor =
    discoveryQuantile(
      turnoverValues,
      liquidityPercentile
    );

  const oiFloor =
    discoveryQuantile(
      oiValues,
      liquidityPercentile
    );

  const earlyTurnoverFloor =
    discoveryQuantile(
      turnoverValues,
      earlyLiquidityPercentile
    );

  const earlyOiFloor =
    discoveryQuantile(
      oiValues,
      Math.min(
        earlyLiquidityPercentile,
        0.40
      )
    );

  const features = [
    ["5m", "price_change_pct"],
    ["5m", "oi_change_pct"],
    ["15m", "price_change_pct"],
    ["15m", "oi_change_pct"],
    ["1h", "price_change_pct"],
    ["1h", "oi_change_pct"],
    ["4h", "price_change_pct"],
    ["4h", "oi_change_pct"],
  ];

  const anomalyThresholds = {};
  const earlyAnomalyThresholds = {};

  for (
    const [
      window,
      field
    ] of features
  ) {
    const values =
      eligibleRows
        .map(
          (row) =>
            transitionMetric(
              row,
              window,
              field
            )
        )
        .filter(finite)
        .map(Math.abs);

    anomalyThresholds[
      `${window}:${field}`
    ] =
      discoveryQuantile(
        values,
        anomalyPercentile
      );

    earlyAnomalyThresholds[
      `${window}:${field}`
    ] =
      discoveryQuantile(
        values,
        earlyAnomalyPercentile
      );
  }

  const nonZeroFundingAbs =
    eligibleRows
      .map(fundingPctOf)
      .filter(
        (value) =>
          finite(value) &&
          value !== 0
      )
      .map(Math.abs);

  const fundingAbsThreshold =
    discoveryQuantile(
      nonZeroFundingAbs,
      fundingPercentile
    );

  const fundingHourlyValues =
    eligibleRows
      .map(fundingPerHourOf)
      .filter(
        (value) =>
          finite(value) &&
          value !== 0
      )
      .sort(
        (a, b) => a - b
      );

  const negativeFundingHourly =
    fundingHourlyValues.filter(
      (value) => value < 0
    );

  const positiveFundingHourly =
    fundingHourlyValues.filter(
      (value) => value > 0
    );

  const negativeFundingTailThreshold =
    negativeFundingHourly.length
      ? discoveryQuantile(
          negativeFundingHourly,
          fundingTailPercentile
        )
      : null;

  const positiveFundingTailThreshold =
    positiveFundingHourly.length
      ? discoveryQuantile(
          positiveFundingHourly,
          1 - fundingTailPercentile
        )
      : null;

  const benchmarkFor =
    (window) => {
      const benchmarkRows =
        ["BTC-USDT", "ETH-USDT"]
          .map(
            (contract) =>
              contracts.find(
                (row) =>
                  String(
                    row?.contract_code ||
                    ""
                  ).trim() ===
                  contract
              )
          )
          .filter(Boolean)
          .filter(
            (row) =>
              ["CLOSED", "PARTIAL"].includes(
                String(row?.data_status || "")
              ) &&
              row?.quality?.market_present ===
                true &&
              row?.freshness?.stale ===
                false
          );

      const values =
        benchmarkRows
          .map(
            (row) =>
              transitionMetric(
                row,
                window,
                "price_change_pct"
              )
          )
          .filter(finite);

      return {
        coverage:
          values.length,

        mean:
          values.length
            ? values.reduce(
                (sum, value) =>
                  sum + value,
                0
              ) /
              values.length
            : null,
      };
    };

  const benchmark1h =
    benchmarkFor("1h");

  const benchmark4h =
    benchmarkFor("4h");

  const relativeStrength =
    (
      row,
      window,
      benchmark
    ) => {
      const move =
        transitionMetric(
          row,
          window,
          "price_change_pct"
        );

      if (
        !finite(move) ||
        !finite(benchmark?.mean)
      ) {
        return null;
      }

      return move -
        benchmark.mean;
    };

  const anomalyPool = [];
  const contractTelemetry = [];
  const belowLiquidity = [];
  const insufficientLiquidityData = [];
  const falseNegativeCandidates = [];

  for (const row of eligibleRows) {
    const contract =
      String(
        row?.contract_code || ""
      ).trim();

    const turnover =
      turnoverOf(row);

    const oiValue =
      oiOf(row);

    if (
      !finite(turnover) ||
      !finite(oiValue) ||
      !finite(turnoverFloor) ||
      !finite(oiFloor) ||
      !finite(earlyTurnoverFloor) ||
      !finite(earlyOiFloor)
    ) {
      insufficientLiquidityData.push(
        contract
      );

      continue;
    }

    const coreLiquidity =
      turnover >= turnoverFloor &&
      oiValue >= oiFloor;

    const earlyLiquidity =
      (
        turnover >= earlyTurnoverFloor &&
        oiValue >= earlyOiFloor
      ) ||
      (
        turnover >= 100000 &&
        oiValue > 0
      );

    const liveTurnoverFloor =
      Math.max(
        100000,
        Number(
          options
            ?.minimum_live_turnover_usdt ??
          100000
        )
      );

    const funding =
      fundingPctOf(row);

    const fundingPerHour =
      fundingPerHourOf(row);

    const negativeFundingTail =
      finite(fundingPerHour) &&
      fundingPerHour < 0 &&
      finite(
        negativeFundingTailThreshold
      ) &&
      fundingPerHour <=
        negativeFundingTailThreshold;

    const positiveFundingTail =
      finite(fundingPerHour) &&
      fundingPerHour > 0 &&
      finite(
        positiveFundingTailThreshold
      ) &&
      fundingPerHour >=
        positiveFundingTailThreshold;

    const legacyFundingExtreme =
      finite(funding) &&
      funding !== 0 &&
      finite(
        fundingAbsThreshold
      ) &&
      Math.abs(funding) >=
        fundingAbsThreshold;

    const fundingExtremeContextRecall =
      (
        negativeFundingTail ||
        positiveFundingTail ||
        legacyFundingExtreme
      ) &&
      turnover >=
        liveTurnoverFloor;

    const strictFlags = [];
    const earlyFlags = [];

    for (
      const [
        window,
        field
      ] of features
    ) {
      const value =
        transitionMetric(
          row,
          window,
          field
        );

      const strictThreshold =
        anomalyThresholds[
          `${window}:${field}`
        ];

      const earlyThreshold =
        earlyAnomalyThresholds[
          `${window}:${field}`
        ];

      if (
        finite(value) &&
        finite(strictThreshold) &&
        strictThreshold > 0 &&
        Math.abs(value) >=
          strictThreshold
      ) {
        strictFlags.push(
          `${window}:${field}`
        );
      }

      if (
        finite(value) &&
        finite(earlyThreshold) &&
        earlyThreshold > 0 &&
        Math.abs(value) >=
          earlyThreshold
      ) {
        earlyFlags.push(
          `${window}:${field}`
        );
      }
    }

    if (legacyFundingExtreme) {
      strictFlags.push(
        "funding:absolute_extreme"
      );
    }

    if (negativeFundingTail) {
      earlyFlags.push(
        "funding:negative_hourly_tail"
      );
    }

    if (positiveFundingTail) {
      earlyFlags.push(
        "funding:positive_hourly_tail"
      );
    }

    const price1h =
      transitionMetric(
        row,
        "1h",
        "price_change_pct"
      );

    const price4h =
      transitionMetric(
        row,
        "4h",
        "price_change_pct"
      );

    const oi15m =
      transitionMetric(
        row,
        "15m",
        "oi_change_pct"
      );

    const oi1h =
      transitionMetric(
        row,
        "1h",
        "oi_change_pct"
      );

    const oi4h =
      transitionMetric(
        row,
        "4h",
        "oi_change_pct"
      );

    const bestOiBuild =
      [
        oi15m,
        oi1h,
        oi4h,
      ]
        .filter(finite)
        .reduce(
          (best, value) =>
            best === null ||
            value > best
              ? value
              : best,
          null
        );

    const rs1h =
      relativeStrength(
        row,
        "1h",
        benchmark1h
      );

    const rs4h =
      relativeStrength(
        row,
        "4h",
        benchmark4h
      );

    const oiBuilding =
      finite(bestOiBuild) &&
      bestOiBuild >= 0.50;

    const strongRelativeLong =
      (
        finite(rs1h) &&
        rs1h >= 0.75
      ) ||
      (
        finite(rs4h) &&
        rs4h >= 1.50
      );

    const strongRelativeShort =
      (
        finite(rs1h) &&
        rs1h <= -0.75
      ) ||
      (
        finite(rs4h) &&
        rs4h <= -1.50
      );

    const positiveMomentum =
      (
        finite(price1h) &&
        price1h >= 0.75
      ) ||
      (
        finite(price4h) &&
        price4h >= 2.00
      );

    const negativeMomentum =
      (
        finite(price1h) &&
        price1h <= -0.75
      ) ||
      (
        finite(price4h) &&
        price4h <= -2.00
      );

    const longRoutes = [];
    const shortRoutes = [];

    if (
      earlyLiquidity &&
      oiBuilding &&
      strongRelativeLong
    ) {
      longRoutes.push(
        "LONG_RELATIVE_STRENGTH_OI_WATCH"
      );
    }

    if (
      earlyLiquidity &&
      oiBuilding &&
      strongRelativeShort
    ) {
      shortRoutes.push(
        "SHORT_RELATIVE_WEAKNESS_OI_WATCH"
      );
    }

    const strictLegacyRoute =
      coreLiquidity &&
      strictFlags.length >=
        minAnomalyFlags;

    const multiEngineRecallRoute =
      earlyLiquidity &&
      earlyFlags.length >=
        minEarlyFlags;

    const longWatch =
      longRoutes.length > 0;

    const shortWatch =
      shortRoutes.length > 0;

    const queueForDeepCheck =
      strictLegacyRoute ||
      multiEngineRecallRoute ||
      fundingExtremeContextRecall ||
      longWatch ||
      shortWatch;

    const priorDiscovery =
      row?.transitions
        ?.["1h"]
        ?.prior_discovery ||
      null;

    const prior4hDiscovery =
      row?.transitions
        ?.["4h"]
        ?.prior_discovery ||
      null;

    const falseNegativeEvents = [];

    const captureFalseNegative =
      (
        window,
        move,
        prior
      ) => {
        if (!finite(move)) {
          return;
        }

        const threshold =
          window === "1h"
            ? 3
            : 6;

        if (
          Math.abs(move) <
          threshold
        ) {
          return;
        }

        const expectedSide =
          move > 0
            ? "LONG"
            : "SHORT";

        const wasQueued =
          expectedSide === "LONG"
            ? prior?.long_watch ===
              true
            : prior?.short_watch ===
              true;

        if (
          prior &&
          wasQueued !== true
        ) {
          falseNegativeEvents.push({
            window,
            direction:
              expectedSide,
            realized_move_pct:
              move,
            label:
              "FALSE_NEGATIVE_CANDIDATE",
          });
        }
      };

    captureFalseNegative(
      "1h",
      price1h,
      priorDiscovery
    );

    captureFalseNegative(
      "4h",
      price4h,
      prior4hDiscovery
    );

    if (
      falseNegativeEvents.length
    ) {
      falseNegativeCandidates.push({
        contract,
        events:
          falseNegativeEvents,
      });
    }

    const allFlags =
      Array.from(
        new Set([
          ...strictFlags,
          ...earlyFlags,
        ])
      );

    const directionHint =
      longWatch &&
      !shortWatch
        ? "LONG_WATCH"
        : shortWatch &&
          !longWatch
        ? "SHORT_WATCH"
        : longWatch &&
          shortWatch
        ? "BIDIRECTIONAL_REQUIRES_DEEP_RESOLUTION"
        : "NEUTRAL_ANOMALY";

    const telemetry = {
      contract,
      core_liquidity:
        coreLiquidity,
      early_liquidity:
        earlyLiquidity,
      queue_for_deep_check:
        queueForDeepCheck,
      long_watch:
        longWatch,
      short_watch:
        shortWatch,
      discovery_direction_hint:
        directionHint,
      model_routes: [
        ...longRoutes,
        ...shortRoutes,
      ],
      strict_flags_count:
        strictFlags.length,
      early_flags_count:
        earlyFlags.length,
      anomaly_flags_count:
        allFlags.length,
      funding_per_hour_pct:
        fundingPerHour,
      funding_directional_vote: false,
      funding_context_only: true,
      relative_strength_1h_pct_points:
        rs1h,
      relative_strength_4h_pct_points:
        rs4h,
      best_oi_build_pct:
        bestOiBuild,
      false_negative_events:
        falseNegativeEvents,
    };

    contractTelemetry.push(
      telemetry
    );

    if (!queueForDeepCheck) {
      if (
        !coreLiquidity &&
        !earlyLiquidity &&
        !fundingExtremeContextRecall
      ) {
        belowLiquidity.push(
          contract
        );
      }

      continue;
    }

    anomalyPool.push({
      contract,
      anomaly_flags_count:
        allFlags.length,
      anomaly_flags:
        allFlags,
      strict_anomaly_flags_count:
        strictFlags.length,
      early_anomaly_flags_count:
        earlyFlags.length,
      discovery_direction_hint:
        directionHint,
      long_watch:
        longWatch,
      short_watch:
        shortWatch,
      model_routes: [
        ...longRoutes,
        ...shortRoutes,
      ],
      discovery_semantics:
        "DISCOVERY_ONLY_NOT_PROBABILITY_NOT_TRADE_SIGNAL",
      core_liquidity:
        coreLiquidity,
      early_liquidity:
        earlyLiquidity,
      turnover_24h_usdt:
        turnover,
      open_interest_value_usdt:
        oiValue,
      funding_rate_pct:
        funding,
      funding_per_hour_pct:
        fundingPerHour,
      funding_directional_vote: false,
      funding_context_only: true,
      relative_strength_1h_pct_points:
        rs1h,
      relative_strength_4h_pct_points:
        rs4h,
      best_oi_build_pct:
        bestOiBuild,
      freshness_sec:
        Number.isFinite(
          Number(
            row?.freshness
              ?.market_age_sec
          )
        )
          ? Number(
              row.freshness
                .market_age_sec
            )
          : null,
      false_negative_events:
        falseNegativeEvents,
    });
  }

  /*
   * Operational scheduling rank only:
   * model-aware discovery watches first,
   * then more independent flags, then
   * factual turnover. Existing Fast-Move
   * fairness/cooldown still decides which
   * one gets the single Deep Check slot.
   */
  anomalyPool.sort(
    (a, b) => {
      const watchDelta =
        Number(
          b.long_watch ||
          b.short_watch
        ) -
        Number(
          a.long_watch ||
          a.short_watch
        );

      if (watchDelta) {
        return watchDelta;
      }

      const modelDelta =
        (
          b.model_routes?.length ||
          0
        ) -
        (
          a.model_routes?.length ||
          0
        );

      if (modelDelta) {
        return modelDelta;
      }

      const flagDelta =
        b.anomaly_flags_count -
        a.anomaly_flags_count;

      if (flagDelta) {
        return flagDelta;
      }

      const turnoverDelta =
        (
          b.turnover_24h_usdt ??
          -Infinity
        ) -
        (
          a.turnover_24h_usdt ??
          -Infinity
        );

      if (turnoverDelta) {
        return turnoverDelta;
      }

      return String(
        a.contract
      ).localeCompare(
        String(
          b.contract
        )
      );
    }
  );

  const shortlist =
    anomalyPool
      .slice(
        0,
        maxShortlist
      )
      .map(
        (
          row,
          index
        ) => ({
          priority_rank:
            index + 1,
          ...row,
        })
      );

  return {
    layer:
      "DISCOVERY_PREFILTER",

    mode:
      "MULTI_ENGINE_RECALL_SHADOW_V1",

    semantics:
      "DISCOVERY_ONLY_NOT_PROBABILITY_NOT_TRADE_SIGNAL",

    parameters: {
      liquidity_percentile:
        liquidityPercentile,
      early_liquidity_percentile:
        earlyLiquidityPercentile,
      anomaly_percentile:
        anomalyPercentile,
      early_anomaly_percentile:
        earlyAnomalyPercentile,
      funding_percentile_nonzero:
        fundingPercentile,
      funding_tail_percentile:
        fundingTailPercentile,
      min_anomaly_flags:
        minAnomalyFlags,
      min_early_flags:
        minEarlyFlags,
      max_shortlist:
        maxShortlist,
    },

    thresholds: {
      turnover_24h_usdt_floor:
        turnoverFloor,
      open_interest_value_usdt_floor:
        oiFloor,
      early_turnover_24h_usdt_floor:
        earlyTurnoverFloor,
      early_open_interest_value_usdt_floor:
        earlyOiFloor,
      funding_abs_nonzero_threshold:
        fundingAbsThreshold,
      negative_funding_hourly_tail_threshold_pct:
        negativeFundingTailThreshold,
      positive_funding_hourly_tail_threshold_pct:
        positiveFundingTailThreshold,
      anomaly:
        anomalyThresholds,
      early_anomaly:
        earlyAnomalyThresholds,
    },

    benchmark: {
      btc_eth_1h:
        benchmark1h,
      btc_eth_4h:
        benchmark4h,
    },

    counts: {
      universe_total:
        contracts.length,
      technical_eligible:
        eligibleRows.length,
      liquidity_pool:
        contractTelemetry.filter(
          (row) =>
            row.core_liquidity
        ).length,
      early_liquidity_pool:
        contractTelemetry.filter(
          (row) =>
            row.early_liquidity
        ).length,
      long_watch:
        contractTelemetry.filter(
          (row) =>
            row.long_watch
        ).length,
      short_watch:
        contractTelemetry.filter(
          (row) =>
            row.short_watch
        ).length,
      anomaly_pool:
        anomalyPool.length,
      shortlist:
        shortlist.length,
      false_negative_candidates:
        falseNegativeCandidates.length,
      below_liquidity:
        belowLiquidity.length,
      insufficient_liquidity_data:
        insufficientLiquidityData.length,
    },

    shortlist,
    contract_telemetry:
      contractTelemetry,
    insufficient_liquidity_contracts:
      insufficientLiquidityData,
    false_negative_audit:
      falseNegativeCandidates,

    decision: {
      generated: false,
      direction: null,
      probability: null,
      validated: false,
    },

    execution: {
      network_calls_generated:
        0,
      d1_calls_generated:
        0,
      deep_check_started:
        false,
      telegram_started:
        false,
    },

    rules: [
      "Discovery Recall uses only factual Stage-0 data already present in memory.",
      "Initial technical admission is HTX-futures-first: fresh market, current price, exact HTX identity and confirmed crypto scope are mandatory; missing OI/funding/history stay explicit UNKNOWN gaps to be enriched and cannot authorize entry.",
      "The existing p70 turnover/OI lane is preserved; the added early lane is discovery-only and never bypasses HTX Execution in Deep Check / Final Decision.",
      "Funding is context only: sign/interval never creates or blocks a LONG/SHORT discovery route; extremes may only affect neutral review priority.",
      "BTC/ETH relative strength uses the same Stage-0 scan/windows; missing benchmark evidence creates no RS flag.",
      "No external HTTP request is generated by this layer.",
      "No D1 request is generated by this layer.",
      "LONG_WATCH/SHORT_WATCH are discovery routing hints only, not trade directions or signals.",
      "No trading probability or Decision Layer score is generated.",
      "No validated=true signal is generated.",
      "No strategy weights or Hard Veto rules are changed.",
      "Priority rank is operational scheduling order only and is not a trade recommendation.",
      "Fast-Move fairness/cooldown remains active; current one-full-Deep-Check-per-invocation capacity is resource-derived, not a permanent strategy rule.",
    ],
  };
}

function schedulerNumber(raw) {
  if (
    raw === null ||
    raw === undefined ||
    raw === ""
  ) {
    return null;
  }

  const value =
    Number(raw);

  return Number.isFinite(value)
    ? value
    : null;
}

function buildBoundedDeepCheckPlan(
  discoveryPrefilter,
  stateRows = [],
  nowMs = Date.now(),
  options = {}
) {
  const HARD_MAX_PER_RUN = 2;

  /*
   * External-request budget is calculated from the actual Deep Check:
   * 6 futures snapshot + 4 spot + 11 trajectory, minus 4 identical HTX
   * requests reused by the per-Deep-Check promise cache, plus 16 public
   * cross-venue + 2 HTX liquidation + 4 projected-map provider = 39. The
   * separate bounded raw Smart Money observation adds 1 more request. Stage-0
   * uses 4 and a 6-call reserve is retained, so the known worst-case envelope
   * remains exactly 4 + 39 + 1 + 6 = 50.
   */
  const DEEP_CHECK_TOTAL_EXTERNAL_REQUESTS =
    DEEP_CHECK_EXTERNAL_REQUESTS + SMART_MONEY_EXTERNAL_REQUESTS;

  const RESOURCE_MAX_PER_RUN =
    Math.max(
      0,
      Math.floor(
        (
          WORKERS_FREE_EXTERNAL_LIMIT -
          STAGE0_EXTERNAL_REQUESTS -
          EXTERNAL_REQUEST_RESERVE
        ) /
          DEEP_CHECK_TOTAL_EXTERNAL_REQUESTS
      )
    );

  const configuredMax =
    Math.round(
      schedulerNumber(
        options?.max_per_run
      ) ?? 1
    );

  const maxPerRun =
    Math.min(
      HARD_MAX_PER_RUN,
      RESOURCE_MAX_PER_RUN,
      Math.max(
        0,
        configuredMax
      )
    );

  const requiredContract =
    String(
      options?.required_contract ||
      ""
    ).trim();

  const requireExactContract =
    options
      ?.require_exact_contract ===
    true;

  const cooldownSec =
    Math.min(
      86400,
      Math.max(
        300,
        Math.round(
          schedulerNumber(
            options?.cooldown_sec
          ) ?? 1800
        )
      )
    );

  const leaseSec =
    Math.min(
      3600,
      Math.max(
        120,
        Math.round(
          schedulerNumber(
            options?.lease_sec
          ) ?? 600
        )
      )
    );

  const shortlist =
    Array.isArray(
      discoveryPrefilter
        ?.shortlist
    )
      ? discoveryPrefilter.shortlist
      : [];

  const confirmedScope =
    Array.isArray(
      options
        ?.confirmed_scope_contracts
    )
      ? new Set(
          options
            .confirmed_scope_contracts
            .map(
              (value) =>
                String(
                  value || ""
                ).trim()
            )
            .filter(Boolean)
        )
      : null;

  /*
   * Automatic execution MUST fail closed
   * until factual instrument scope has
   * been supplied.
   *
   * HTX futures currently contains both
   * crypto and synthetic/non-crypto
   * contracts. Discovery rank alone is
   * therefore not permission to spend
   * Deep Check budget.
   */
  const scopeConfirmed =
    confirmedScope !== null;

  const stateMap =
    new Map();

  for (
    const row
    of Array.isArray(stateRows)
      ? stateRows
      : []
  ) {
    const contract =
      String(
        row?.contract_code || ""
      ).trim();

    if (!contract) {
      continue;
    }

    stateMap.set(
      contract,
      row
    );
  }

  const seen =
    new Set();

  const ready = [];
  const blocked = [];

  for (
    const row
    of shortlist
  ) {
    const contract =
      String(
        row?.contract || ""
      ).trim();

    if (
      !contract ||
      seen.has(contract)
    ) {
      continue;
    }

    seen.add(contract);

    const priorityRank =
      schedulerNumber(
        row?.priority_rank
      );

    const flags =
      schedulerNumber(
        row
          ?.anomaly_flags_count
      ) ?? 0;

    if (
      !scopeConfirmed ||
      !confirmedScope.has(
        contract
      )
    ) {
      blocked.push({
        contract,
        priority_rank:
          priorityRank,
        anomaly_flags_count:
          flags,
        reason:
          scopeConfirmed
            ? "INSTRUMENT_SCOPE_NOT_CONFIRMED"
            : "INSTRUMENT_SCOPE_SOURCE_MISSING",
      });

      continue;
    }

    const state =
      stateMap.get(
        contract
      ) || null;

    const lastStartedTs =
      schedulerNumber(
        state?.last_started_ts
      );

    const lastCompletedTs =
      schedulerNumber(
        state
          ?.last_completed_ts
      );

    const lastCheckTs =
      lastCompletedTs ??
      lastStartedTs;

    const ageSec =
      lastCheckTs === null
        ? null
        : Math.max(
            0,
            (
              nowMs -
              lastCheckTs
            ) /
              1000
          );

    const leaseAgeSec =
      lastStartedTs === null
        ? null
        : Math.max(
            0,
            (
              nowMs -
              lastStartedTs
            ) /
              1000
          );

    const lastStatus =
      String(
        state?.last_status ||
        ""
      ).toUpperCase();

    const activeLease =
      lastStatus ===
        "RUNNING" &&
      leaseAgeSec !== null &&
      leaseAgeSec <
        leaseSec;

    if (activeLease) {
      blocked.push({
        contract,
        priority_rank:
          priorityRank,
        anomaly_flags_count:
          flags,
        reason:
          "ACTIVE_LEASE",
        last_started_ts:
          lastStartedTs,
        lease_age_sec:
          leaseAgeSec,
      });

      continue;
    }

    const cooldownActive =
      ageSec !== null &&
      ageSec <
        cooldownSec;

    if (cooldownActive) {
      blocked.push({
        contract,
        priority_rank:
          priorityRank,
        anomaly_flags_count:
          flags,
        reason:
          "COOLDOWN",
        last_check_ts:
          lastCheckTs,
        age_sec:
          ageSec,
      });

      continue;
    }

    ready.push({
      contract,
      priority_rank:
        priorityRank,
      anomaly_flags_count:
        flags,
      last_check_ts:
        lastCheckTs,
      age_sec:
        ageSec,
    });
  }

  /*
   * Fairness rule:
   *
   * never checked -> oldest checked ->
   * prefilter priority.
   *
   * This prevents a permanently high
   * ranked candidate from starving the
   * rest of the shortlist.
   */
  ready.sort(
    (a, b) => {
      const aTs =
        a.last_check_ts === null
          ? -Infinity
          : a.last_check_ts;

      const bTs =
        b.last_check_ts === null
          ? -Infinity
          : b.last_check_ts;

      if (aTs !== bTs) {
        return aTs - bTs;
      }

      const aRank =
        Number.isFinite(
          a.priority_rank
        )
          ? a.priority_rank
          : Infinity;

      const bRank =
        Number.isFinite(
          b.priority_rank
        )
          ? b.priority_rank
          : Infinity;

      if (aRank !== bRank) {
        return aRank - bRank;
      }

      return String(
        a.contract
      ).localeCompare(
        String(
          b.contract
        )
      );
    }
  );

  /*
   * A Fast-Move queue lease and the Deep Check must refer to exactly
   * the same contract. Independent scheduler fairness may never
   * substitute another symbol after a lease has been claimed.
   */
  const eligibleForSelection =
    requireExactContract
      ? ready.filter(
          (row) =>
            requiredContract &&
            row.contract ===
              requiredContract
        )
      : ready;

  const selected =
    eligibleForSelection.slice(
      0,
      maxPerRun
    );

  const requiredContractStatus =
    !requireExactContract
      ? "NOT_REQUIRED"
      : !requiredContract
        ? "MISSING_FAIL_CLOSED"
        : selected.length === 1
          ? "READY_EXACT_MATCH"
          : "NOT_READY_FAIL_CLOSED";

  const stage0External =
    STAGE0_EXTERNAL_REQUESTS;

  const deepCheckExternal =
    DEEP_CHECK_EXTERNAL_REQUESTS;

  const smartMoneyExternal =
    SMART_MONEY_EXTERNAL_REQUESTS;

  const deepCheckTotalExternal =
    deepCheckExternal +
    smartMoneyExternal;

  const estimatedExternal =
    stage0External +
    selected.length *
      deepCheckTotalExternal;

  return {
    layer:
      "BOUNDED_DEEP_CHECK_SCHEDULER",

    mode:
      "CRON_WIRED_BOUNDED_EXECUTION",

    parameters: {
      hard_max_per_run:
        HARD_MAX_PER_RUN,

      resource_max_per_run:
        RESOURCE_MAX_PER_RUN,

      configured_max_per_run:
        maxPerRun,

      cooldown_sec:
        cooldownSec,

      lease_sec:
        leaseSec,

      scope_required:
        true,

      require_exact_contract:
        requireExactContract,

      required_contract:
        requiredContract ||
        null,

      required_contract_status:
        requiredContractStatus,
    },

    scope_status:
      scopeConfirmed
        ? "CONFIRMED_SET_SUPPLIED"
        : "UNCONFIRMED_FAIL_CLOSED",

    counts: {
      shortlist:
        shortlist.length,

      scope_confirmed:
        scopeConfirmed
          ? shortlist.filter(
              (row) =>
                confirmedScope.has(
                  String(
                    row?.contract ||
                    ""
                  ).trim()
                )
            ).length
          : 0,

      ready:
        ready.length,

      blocked:
        blocked.length,

      selected:
        selected.length,
    },

    selected,
    blocked,

    budget: {
      stage0_external_requests:
        stage0External,

      deep_check_external_requests_each:
        deepCheckExternal,

      smart_money_external_requests_each:
        smartMoneyExternal,

      deep_check_total_external_requests_each:
        deepCheckTotalExternal,

      estimated_external_requests_this_run:
        estimatedExternal,

      workers_free_external_limit:
        WORKERS_FREE_EXTERNAL_LIMIT,

      external_request_reserve:
        EXTERNAL_REQUEST_RESERVE,

      within_known_external_limit:
        estimatedExternal <=
          WORKERS_FREE_EXTERNAL_LIMIT -
            EXTERNAL_REQUEST_RESERVE,

      three_deep_checks_would_estimate:
        stage0External +
        3 *
          deepCheckTotalExternal,
    },

    decision: {
      generated: false,
      direction: null,
      probability: null,
      validated: false,
    },

    execution: {
      started: false,
      deep_checks_started: 0,
      telegram_started: false,
    },

    rules: [
      "Hard execution cap is 2 Deep Checks per cron invocation.",
      "Resource-derived execution cap is 1 Deep Check per cron invocation.",
      "The Fast-Move lease owner supplies the only contract eligible for the matching Deep Check.",
      "Cooldown and active lease are operational resource controls, not trading signals.",
      "Oldest or never-checked eligible candidate is preferred before prefilter priority.",
      "Instrument scope must be factually confirmed before automatic Deep Check execution.",
      "Unknown instrument scope fails closed.",
      "No LONG/SHORT direction is generated here.",
      "No probability is generated here.",
      "No validated=true signal is generated here.",
      "No Telegram call is generated here.",
    ],
  };
}

async function loadDeepCheckSchedulerState(
  env,
  contracts
) {
  if (!env?.DATA_DB) {
    return {
      status:
        "SOURCE_UNSUPPORTED",
      rows: [],
      error:
        "DATA_DB_NOT_CONFIGURED",
    };
  }

  const clean =
    Array.from(
      new Set(
        (
          Array.isArray(
            contracts
          )
            ? contracts
            : []
        )
          .map(
            (value) =>
              String(
                value || ""
              ).trim()
          )
          .filter(Boolean)
      )
    )
      .slice(
        0,
        50
      );

  if (!clean.length) {
    return {
      status: "CLOSED",
      rows: [],
      error: null,
    };
  }

  const placeholders =
    clean
      .map(
        (_, index) =>
          `?${index + 1}`
      )
      .join(", ");

  try {
    const result =
      await env.DATA_DB
        .prepare(`
          SELECT
            contract_code,
            last_started_ts,
            last_completed_ts,
            last_status,
            last_run_id,
            last_sufficiency,
            last_error,
            updated_ts
          FROM deep_check_scheduler_state
          WHERE contract_code IN (
            ${placeholders}
          )
        `)
        .bind(
          ...clean
        )
        .all();

    return {
      status: "CLOSED",
      rows:
        Array.isArray(
          result?.results
        )
          ? result.results
          : [],
      error: null,
    };
  } catch (error) {
    const message =
      String(
        error?.message ||
        error
      );

    return {
      status:
        /no such table/i.test(
          message
        )
          ? "MIGRATION_REQUIRED"
          : "PARTIAL",
      rows: [],
      error: message,
    };
  }
}

async function reserveDeepCheckSchedulerSlot(
  env,
  {
    contract,
    run_id,
    now_ms,
    cooldown_sec,
    lease_sec,
  }
) {
  if (!env?.DATA_DB) {
    return {
      ok: false,
      reserved: false,
      status:
        "SOURCE_UNSUPPORTED",
    };
  }

  const contractCode =
    String(
      contract || ""
    ).trim();

  const runId =
    String(
      run_id || ""
    ).trim();

  const nowMs =
    schedulerNumber(
      now_ms
    );

  const cooldownSec =
    schedulerNumber(
      cooldown_sec
    );

  const leaseSec =
    schedulerNumber(
      lease_sec
    );

  if (
    !contractCode ||
    !runId ||
    nowMs === null ||
    cooldownSec === null ||
    leaseSec === null
  ) {
    return {
      ok: false,
      reserved: false,
      status:
        "INVALID_INPUT",
    };
  }

  const cooldownCutoff =
    nowMs -
    cooldownSec *
      1000;

  const leaseCutoff =
    nowMs -
    leaseSec *
      1000;

  try {
    const result =
      await env.DATA_DB
        .prepare(`
          INSERT INTO
            deep_check_scheduler_state
          (
            contract_code,
            last_started_ts,
            last_completed_ts,
            last_status,
            last_run_id,
            last_sufficiency,
            last_error,
            updated_ts
          )
          VALUES
          (
            ?1,
            ?2,
            NULL,
            'RUNNING',
            ?3,
            NULL,
            NULL,
            ?2
          )
          ON CONFLICT(contract_code)
          DO UPDATE SET
            last_started_ts =
              excluded.last_started_ts,
            last_status =
              'RUNNING',
            last_run_id =
              excluded.last_run_id,
            last_sufficiency =
              NULL,
            last_error =
              NULL,
            updated_ts =
              excluded.updated_ts
          WHERE
            (
              deep_check_scheduler_state
                .last_status !=
                'RUNNING'
              OR
              deep_check_scheduler_state
                .last_started_ts
                IS NULL
              OR
              deep_check_scheduler_state
                .last_started_ts
                <= ?4
            )
            AND
            (
              COALESCE(
                deep_check_scheduler_state
                  .last_completed_ts,
                deep_check_scheduler_state
                  .last_started_ts
              )
              IS NULL
              OR
              COALESCE(
                deep_check_scheduler_state
                  .last_completed_ts,
                deep_check_scheduler_state
                  .last_started_ts
              )
              <= ?5
            )
        `)
        .bind(
          contractCode,
          nowMs,
          runId,
          leaseCutoff,
          cooldownCutoff
        )
        .run();

    const changes =
      Number(
        result?.meta
          ?.changes ??
        0
      );

    return {
      ok: true,
      reserved:
        changes > 0,
      status:
        changes > 0
          ? "RESERVED"
          : "COOLDOWN_OR_ACTIVE_LEASE",
      started_ts:
        changes > 0
          ? nowMs
          : null,
    };
  } catch (error) {
    return {
      ok: false,
      reserved: false,
      status:
        "D1_ERROR",
      error:
        String(
          error?.message ||
          error
        ),
    };
  }
}

async function finalizeDeepCheckSchedulerSlot(
  env,
  {
    contract,
    run_id,
    started_ts,
    completed_ts,
    status,
    sufficiency,
    error,
    details = {},
  }
) {
  if (!env?.DATA_DB) {
    return {
      status:
        "SOURCE_UNSUPPORTED",
    };
  }

  const contractCode =
    String(
      contract || ""
    ).trim();

  const runId =
    String(
      run_id || ""
    ).trim();

  const completedTs =
    schedulerNumber(
      completed_ts
    );

  const startedTs =
    schedulerNumber(
      started_ts
    );

  if (
    !contractCode ||
    !runId ||
    completedTs === null
  ) {
    return {
      status:
        "INVALID_INPUT",
    };
  }

  const finalStatus =
    String(
      status ||
      "COMPLETED"
    );

  const finalError =
    error === null ||
    error === undefined
      ? null
      : String(error)
          .slice(0, 600);

  const gaps =
    Array.isArray(
      details?.gaps
    )
      ? details.gaps
          .map(
            (value) =>
              String(
                value || ""
              ).slice(0, 160)
          )
          .filter(Boolean)
          .slice(0, 100)
      : [];

  const failedComponents =
    Array.isArray(
      details
        ?.failed_components
    )
      ? details
          .failed_components
          .map(
            (value) =>
              String(
                value || ""
              ).slice(0, 120)
          )
          .filter(Boolean)
          .slice(0, 20)
      : [];

  const fulfilledComponents =
    schedulerNumber(
      details
        ?.fulfilled_components
    );

  const decisionGenerated =
    details
      ?.decision_generated ===
    true;

  const validated =
    details?.validated ===
    true;

  const telegramStarted =
    details
      ?.telegram_started ===
    true;

  const retentionBefore =
    completedTs -
    7 *
      24 *
      60 *
      60 *
      1000;

  try {
    const results =
      await env.DATA_DB.batch([
        env.DATA_DB
          .prepare(`
          UPDATE
            deep_check_scheduler_state
          SET
            last_completed_ts = ?3,
            last_status = ?4,
            last_sufficiency = ?5,
            last_error = ?6,
            updated_ts = ?3
          WHERE
            contract_code = ?1
            AND
            last_run_id = ?2
        `)
          .bind(
            contractCode,
            runId,
            completedTs,
            finalStatus,
            sufficiency ??
              null,
            finalError
          ),

        env.DATA_DB
          .prepare(`
            INSERT OR REPLACE INTO
              deep_check_run_log
            (
              run_id,
              contract_code,
              started_ts,
              completed_ts,
              execution_status,
              data_sufficiency,
              gaps_json,
              fulfilled_components,
              failed_components_json,
              decision_generated,
              validated,
              telegram_started,
              error_text,
              created_ts
            )
            VALUES
            (
              ?1, ?2, ?3, ?4,
              ?5, ?6, ?7, ?8,
              ?9, ?10, ?11, ?12,
              ?13, ?14
            )
          `)
          .bind(
            runId,
            contractCode,
            startedTs,
            completedTs,
            finalStatus,
            sufficiency ??
              null,
            JSON.stringify(
              gaps
            ),
            fulfilledComponents,
            JSON.stringify(
              failedComponents
            ),
            decisionGenerated
              ? 1
              : 0,
            validated
              ? 1
              : 0,
            telegramStarted
              ? 1
              : 0,
            finalError,
            completedTs
          ),

        env.DATA_DB
          .prepare(`
            DELETE FROM
              deep_check_run_log
            WHERE
              completed_ts < ?1
          `)
          .bind(
            retentionBefore
          ),
      ]);

    return {
      status: "CLOSED",
      state_changes:
        Number(
          results?.[0]
            ?.meta
            ?.changes ??
          0
        ),

      journal_changes:
        Number(
          results?.[1]
            ?.meta
            ?.changes ??
          0
        ),

      retention_rows_deleted:
        Number(
          results?.[2]
            ?.meta
            ?.changes ??
          0
        ),
    };
  } catch (caught) {
    return {
      status: "PARTIAL",
      error:
        String(
          caught?.message ||
          caught
        ),
    };
  }
}

async function runBoundedDeepCheckScheduler(
  discoveryPrefilter,
  env,
  runId,
  options = {}
) {
  const requiredContract =
    String(
      options?.required_contract ||
      ""
    ).trim();

  const requireExactContract =
    options
      ?.require_exact_contract ===
    true;

  const requiredSkipResult =
    (reason) =>
      requireExactContract &&
      requiredContract
        ? [
            {
              contract:
                requiredContract,
              run_id:
                runId,
              execution_status:
                "SKIPPED",
              reason,
            },
          ]
        : [];

  const shortlist =
    Array.isArray(
      discoveryPrefilter
        ?.shortlist
    )
      ? discoveryPrefilter.shortlist
      : [];

  const contracts =
    shortlist
      .map(
        (row) =>
          String(
            row?.contract ||
            ""
          ).trim()
      )
      .filter(Boolean);

  if (!env?.DATA_DB) {
    return {
      layer:
        "BOUNDED_DEEP_CHECK_EXECUTOR",
      status:
        "SOURCE_UNSUPPORTED_FAIL_CLOSED",
      plan:
        buildBoundedDeepCheckPlan(
          discoveryPrefilter,
          [],
          Date.now(),
          options
        ),
      results:
        requiredSkipResult(
          "DATA_DB_NOT_CONFIGURED"
        ),
      decision: {
        generated: false,
        direction: null,
        probability: null,
        validated: false,
      },
      telegram_started:
        false,
    };
  }

  const state =
    await loadDeepCheckSchedulerState(
      env,
      contracts
    );

  if (
    state.status !==
    "CLOSED"
  ) {
    return {
      layer:
        "BOUNDED_DEEP_CHECK_EXECUTOR",
      status:
        `${state.status}_FAIL_CLOSED`,
      scheduler_state:
        state,
      results:
        requiredSkipResult(
          "SCHEDULER_STATE_NOT_CLOSED"
        ),
      decision: {
        generated: false,
        direction: null,
        probability: null,
        validated: false,
      },
      telegram_started:
        false,
    };
  }

  const now =
    Date.now();

  const plan =
    buildBoundedDeepCheckPlan(
      discoveryPrefilter,
      state.rows,
      now,
      options
    );

  if (
    plan.scope_status !==
      "CONFIRMED_SET_SUPPLIED" ||
    plan.parameters
      ?.required_contract_status ===
      "MISSING_FAIL_CLOSED" ||
    !plan.selected.length
  ) {
    const noTargetReason =
      plan.scope_status !==
        "CONFIRMED_SET_SUPPLIED"
        ? "INSTRUMENT_SCOPE_NOT_CONFIRMED"
        : plan.parameters
            ?.required_contract_status ===
            "MISSING_FAIL_CLOSED"
          ? "REQUIRED_CONTRACT_NOT_SUPPLIED"
          : plan.parameters
              ?.required_contract_status ===
              "NOT_READY_FAIL_CLOSED"
            ? "REQUIRED_CONTRACT_NOT_READY"
            : "NO_READY_TARGETS";

    return {
      layer:
        "BOUNDED_DEEP_CHECK_EXECUTOR",
      status:
        noTargetReason,
      plan,
      results:
        requiredSkipResult(
          noTargetReason
        ),
      decision: {
        generated: false,
        direction: null,
        probability: null,
        validated: false,
      },
      telegram_started:
        false,
    };
  }

  const results = [];

  /*
   * Deep Checks are deliberately
   * sequential. Never Promise.all()
   * multiple buildDeepCheckInput calls.
   */
  for (
    const target
    of plan.selected
  ) {
    const reservation =
      await reserveDeepCheckSchedulerSlot(
        env,
        {
          contract:
            target.contract,
          run_id:
            runId,
          now_ms:
            Date.now(),
          cooldown_sec:
            plan.parameters
              .cooldown_sec,
          lease_sec:
            plan.parameters
              .lease_sec,
        }
      );

    if (
      !reservation
        ?.reserved
    ) {
      results.push({
        contract:
          target.contract,
        run_id:
          runId,
        execution_status:
          "SKIPPED",
        reason:
          reservation
            ?.status ||
          "NOT_RESERVED",
      });

      continue;
    }

    try {
      const deep =
        await buildDeepCheckInput(
          {
            contract:
              target.contract,
            run_id:
              runId,
            capacity_drop_reasons:
              plan.blocked
                .map(
                  (row) =>
                    row?.reason ||
                    null
                )
                .filter(Boolean)
                .slice(0, 12),
            queue_starvation:
              options
                ?.queue_starvation ===
              true,
          },
          env
        );

      const sufficiency =
        deep
          ?.data_sufficiency
          ?.classification ??
        null;

      const decisionGenerated =
        deep
          ?.decision
          ?.validated === true ||
        deep
          ?.decision
          ?.direction != null ||
        deep
          ?.decision
          ?.probability != null;

      const validated =
        deep
          ?.decision
          ?.validated === true;

      const finalization =
        await finalizeDeepCheckSchedulerSlot(
          env,
          {
          contract:
            target.contract,
          run_id:
            runId,
          started_ts:
            reservation
              ?.started_ts ??
            null,
          completed_ts:
            Date.now(),
          status:
            "COMPLETED",
          sufficiency,
          error:
            null,
          details: {
            gaps:
              deep
                ?.data_sufficiency
                ?.gaps ??
              [],

            fulfilled_components:
              deep
                ?.execution
                ?.fulfilled_components ??
              null,

            failed_components:
              deep
                ?.execution
                ?.failed_components ??
              [],

            decision_generated:
              decisionGenerated,

            validated,

            telegram_started:
              false,
          },
          }
        );

      const fastMoveWatchObservation =
        buildFastMoveDeepObservation({
          deep,
          discovery_row:
            target,
          now:
            Date.now(),
        });

      results.push({
        contract:
          target.contract,
        run_id:
          runId,
        execution_status:
          "FULFILLED",
        data_sufficiency:
          sufficiency,
        decision_generated:
          decisionGenerated,
        validated:
          validated,
        journal_status:
          finalization
            ?.status ??
          null,
        fast_move_watch_observation:
          fastMoveWatchObservation,
        opportunity_intelligence_shadow: {
          version:
            deep
              ?.opportunity_intelligence_shadow
              ?.version ??
            null,
          status:
            deep
              ?.opportunity_intelligence_shadow
              ?.status ??
            null,
          anomaly_count:
            deep
              ?.opportunity_intelligence_shadow
              ?.counts
              ?.anomalies ??
            0,
          funnel_stage:
            deep
              ?.opportunity_intelligence_shadow
              ?.newest_event
              ?.funnel
              ?.stage ??
            null,
          persistence_status:
            deep
              ?.opportunity_intelligence_shadow
              ?.persistence
              ?.status ??
            null,
        },
        multi_wave_campaign_shadow: {
          version:
            deep
              ?.multi_wave_campaign_shadow
              ?.version ??
            null,
          status:
            deep
              ?.multi_wave_campaign_shadow
              ?.status ??
            null,
          phase:
            deep
              ?.multi_wave_campaign_shadow
              ?.campaign
              ?.current_phase ??
            null,
          wave_index:
            deep
              ?.multi_wave_campaign_shadow
              ?.campaign
              ?.wave_index ??
            0,
          persistence_status:
            deep
              ?.multi_wave_campaign_shadow
              ?.persistence
              ?.status ??
            null,
        },
      });
    } catch (error) {
      const message =
        String(
          error?.message ||
          error
        );

      const finalization =
        await finalizeDeepCheckSchedulerSlot(
          env,
          {
          contract:
            target.contract,
          run_id:
            runId,
          started_ts:
            reservation
              ?.started_ts ??
            null,
          completed_ts:
            Date.now(),
          status:
            "ERROR",
          sufficiency:
            null,
          error:
            message.slice(
              0,
              600
            ),
          details: {
            gaps: [],
            fulfilled_components:
              0,
            failed_components: [
              "deep_check_execution",
            ],
            decision_generated:
              false,
            validated:
              false,
            telegram_started:
              false,
          },
          }
        );

      results.push({
        contract:
          target.contract,
        run_id:
          runId,
        execution_status:
          "REJECTED",
        error:
          message,
        journal_status:
          finalization
            ?.status ??
          null,
      });
    }
  }

  return {
    layer:
      "BOUNDED_DEEP_CHECK_EXECUTOR",

    status:
      "COMPLETED",

    plan,

    results,

    decision: {
      generated: false,
      direction: null,
      probability: null,
      validated: false,
    },

    telegram_started:
      false,
  };
}

async function htxSymbolResolve(params) {
  const now = Date.now();

  const requestedRaw = String(
    params.contract ||
    params.symbol ||
    params.query ||
    ""
  ).trim();

  const normalizedContract =
    normalizeFuturesContract(
      requestedRaw ||
      "ETHFI-USDT"
    );

  const requestedNfc =
    requestedRaw.normalize(
      "NFC"
    );

  const requestedNfkc =
    requestedRaw.normalize(
      "NFKC"
    );

  const endpoint =
    `${FUTURES_BASE}/linear-swap-api/v1/swap_contract_info`;

  const infoR =
    await fetchJson(
      endpoint
    );

  const active =
    asArray(
      infoR.data?.data
    ).filter(
      (x) =>
        Number(
          x?.contract_status
        ) === 1 &&
        String(
          x?.business_type ||
          "swap"
        ).toLowerCase() ===
          "swap"
    );

  const normalizedKey =
    contractKey(
      normalizedContract
    );

  const exactCandidates =
    active.filter(
      (x) =>
        contractKey(
          x?.contract_code
        ) ===
        normalizedKey
    );

  const rawExactCandidates =
    active.filter(
      (x) =>
        String(
          x?.contract_code ||
          ""
        ) ===
        requestedRaw
    );

  const symbolCandidates =
    active.filter(
      (x) =>
        String(
          x?.symbol ||
          ""
        )
          .normalize("NFC")
          .toUpperCase() ===
        requestedNfc
          .toUpperCase()
    );

  const nfkcDiagnosticCandidates =
    active.filter(
      (x) => {
        const c =
          String(
            x?.contract_code ||
            ""
          )
            .normalize("NFKC")
            .toUpperCase();

        const sym =
          String(
            x?.symbol ||
            ""
          )
            .normalize("NFKC")
            .toUpperCase();

        return (
          c ===
            requestedNfkc.toUpperCase() ||
          sym ===
            requestedNfkc.toUpperCase()
        );
      }
    );

  const combined =
    new Map();

  for (
    const x of [
      ...rawExactCandidates,
      ...exactCandidates,
      ...symbolCandidates,
    ]
  ) {
    const code =
      String(
        x?.contract_code ||
        ""
      );

    if (code) {
      combined.set(
        code,
        x
      );
    }
  }

  const candidates =
    [...combined.values()].map(
      (x) => ({
        contract_code:
          x.contract_code,

        symbol:
          x.symbol,

        fingerprint:
          symbolFingerprint(
            x
          ),

        contract_status:
          x.contract_status,

        contract_size:
          num(
            x.contract_size
          ),

        price_tick:
          num(
            x.price_tick
          ),

        create_date:
          x.create_date ??
          null,
      })
    );

  let resolutionStatus =
    "SYMBOL_UNRESOLVED";

  let resolved =
    null;

  if (
    rawExactCandidates.length ===
    1
  ) {
    resolutionStatus =
      "RESOLVED_HTX_EXACT_RAW";

    resolved =
      candidates.find(
        (x) =>
          x.contract_code ===
          rawExactCandidates[0]
            .contract_code
      ) ||
      null;
  } else if (
    candidates.length ===
    1
  ) {
    resolutionStatus =
      "RESOLVED_HTX_NORMALIZED_INPUT";

    resolved =
      candidates[0];
  } else if (
    candidates.length >
    1
  ) {
    resolutionStatus =
      "AMBIGUOUS";
  }

  return {
    source:
      "HTX official public API",

    tool:
      "htx_symbol_resolve",

    version:
      "1.0",

    timestamp_utc:
      new Date(
        now
      ).toISOString(),

    requested: {
      raw:
        requestedRaw,

      normalized_contract_input:
        normalizedContract,

      nfc:
        requestedNfc,

      nfkc_diagnostic_only:
        requestedNfkc,

      raw_codepoints:
        [...requestedRaw].map(
          (ch) =>
            `U+${ch
              .codePointAt(0)
              .toString(16)
              .toUpperCase()
              .padStart(
                4,
                "0"
              )}`
        ),
    },

    resolution_status:
      resolutionStatus,

    resolved,
    candidates,

    diagnostics: {
      active_universe_total:
        active.length,

      raw_exact_matches:
        rawExactCandidates.length,

      normalized_matches:
        exactCandidates.length,

      symbol_matches:
        symbolCandidates.length,

      nfkc_diagnostic_matches:
        nfkcDiagnosticCandidates.map(
          (x) =>
            x.contract_code
        ),

      nfkc_is_not_auto_accepted:
        true,

      translation_or_alias_guessing_used:
        false,
    },

    health: {
      contract_info:
        infoR.ok,
    },

    coverage: {
      htx_symbol_resolution:
        infoR.ok
          ? "closed"
          : "not_closed",
    },

    endpoint_errors: {
      contract_info:
        infoR.ok
          ? null
          : infoR.error,
    },

    rules: [
      "Exact HTX UTF-8 contract_code is canonical.",
      "NFC normalization may be used for matching; NFKC is diagnostic only and never auto-accepted.",
      "No translation of CJK names and no visual-confusable alias guess is used.",
    ],
  };
}

async function htxStage0History(
  params,
  env
) {
  const now =
    Date.now();

  const contract =
    normalizeFuturesContract(
      params.contract ||
      params.contract_code ||
      "ETHFI-USDT"
    );

  const hours =
    clamp(
      params.hours,
      0.25,
      168,
      6
    );

  const start =
    now -
    hours *
      60 *
      60 *
      1000;

  if (!env?.DATA_DB) {
    return {
      source:
        "My Report 2 D1 compact Stage-0 store",

      tool:
        "htx_stage0_history",

      version:
        "1.0",

      contract,

      timestamp_utc:
        new Date(
          now
        ).toISOString(),

      health: {
        data_db:
          false,
      },

      coverage: {
        persistent_history:
          "SOURCE_UNSUPPORTED",
      },

      series: [],

      endpoint_errors: {
        data_db:
          "D1 binding DATA_DB is not configured",
      },
    };
  }

  try {
    const query =
      await env.DATA_DB
        .prepare(`
          SELECT
            ts,
            ts_bucket,
            universe_total,
            scanned,
            missing,
            errors,
            stale,
            stage0_coverage_pct,
            payload_json
          FROM scan_runs
          WHERE ts_bucket
            BETWEEN ?1 AND ?2
          ORDER BY
            ts_bucket ASC
          LIMIT 2500
        `)
        .bind(
          start,
          now
        )
        .all();

    const key =
      contractKey(
        contract
      );

    const series = [];

    let scanRows =
      0;

    let parseErrors =
      0;

    for (
      const scan
      of asArray(
        query?.results
      )
    ) {
      scanRows +=
        1;

      let payload;

      try {
        payload =
          JSON.parse(
            scan.payload_json ||
            "{}"
          );
      } catch {
        parseErrors +=
          1;

        continue;
      }

      const row =
        asArray(
          payload?.contracts
        ).find(
          (r) =>
            Array.isArray(
              r
            ) &&
            contractKey(
              r[0]
            ) ===
              key
        );

      if (!row) {
        continue;
      }

      const [
        contract_code,
        price,
        turnover_24h,
        oi_contracts,
        oi_value_usdt,
        funding_rate,
        funding_interval_hours,
        market_age_sec,
        source_status,
      ] = row;

      series.push({
        ts:
          scan.ts,

        ts_bucket:
          scan.ts_bucket,

        timestamp_utc:
          iso(
            scan.ts
          ),

        contract_code,

        price:
          num(
            price
          ),

        turnover_24h_usdt:
          num(
            turnover_24h
          ),

        oi_contracts:
          num(
            oi_contracts
          ),

        oi_value_usdt:
          num(
            oi_value_usdt
          ),

        funding_rate:
          num(
            funding_rate
          ),

        funding_rate_pct:
          num(
            funding_rate
          ) !== null
            ? num(
                funding_rate
              ) *
              100
            : null,

        funding_interval_hours:
          num(
            funding_interval_hours
          ),

        market_age_sec:
          num(
            market_age_sec
          ),

        source_status:
          source_status ||
          null,

        scan_stage0_coverage_pct:
          num(
            scan
              .stage0_coverage_pct
          ),
      });
    }

    const expected =
      Math.max(
        1,
        Math.floor(
          (
            hours *
            60
          ) /
            5
        )
      );

    const coveragePct =
      Math.min(
        100,
        (
          series.length /
          expected
        ) *
          100
      );

    return {
      source:
        "My Report 2 D1 compact Stage-0 store",

      tool:
        "htx_stage0_history",

      version:
        "1.0",

      contract,

      requested_hours:
        hours,

      window_start_utc:
        iso(
          start
        ),

      window_end_utc:
        iso(
          now
        ),

      timestamp_utc:
        new Date(
          now
        ).toISOString(),

      health: {
        data_db:
          true,

        payload_parse:
          parseErrors ===
          0,
      },

      coverage: {
        persistent_history:
          "closed",

        expected_5m_points:
          expected,

        received_points:
          series.length,

        approximate_5m_coverage_pct:
          coveragePct,
      },

      scan_rows_read:
        scanRows,

      parse_errors:
        parseErrors,

      series,

      endpoint_errors: {
        data_db:
          null,
      },

      note:
        "Series contains only factual persisted Stage-0 snapshots. Missing scans remain missing; no interpolation is performed.",
    };
  } catch (error) {
    return {
      source:
        "My Report 2 D1 compact Stage-0 store",

      tool:
        "htx_stage0_history",

      version:
        "1.0",

      contract,

      timestamp_utc:
        new Date(
          now
        ).toISOString(),

      health: {
        data_db:
          false,
      },

      coverage: {
        persistent_history:
          "not_closed",
      },

      series: [],

      endpoint_errors: {
        data_db:
          String(
            error?.message ||
            error
          ),
      },
    };
  }
}

const MAX_HTX_LIQUIDATION_ROWS_PER_SIDE = 250;
const MAX_HTX_LIQUIDATION_ROWS_PERSISTED = 500;

function normalizeLiquidationRow(row, requestedType) {
  const created = normalizeTs(row?.created_at);
  const turnover = num(row?.trade_turnover);

  return {
    event_id:
      row?.query_id !== undefined &&
      row?.query_id !== null
        ? String(row.query_id)
        : [
            row?.contract_code ||
              row?.contract ||
              "",
            created || "",
            row?.price || "",
            row?.volume || "",
            row?.direction || "",
          ].join(":"),

    contract_code:
      row?.contract_code ||
      row?.contract ||
      null,

    symbol:
      row?.symbol ||
      null,

    side:
      requestedType === 5
        ? "LONG_LIQUIDATED"
        : requestedType === 6
        ? "SHORT_LIQUIDATED"
        : "UNKNOWN",

    direction:
      row?.direction ||
      null,

    price:
      num(
        row?.price
      ),

    volume_contracts:
      num(
        row?.volume
      ),

    amount_base:
      num(
        row?.amount
      ),

    notional_usdt:
      turnover,

    created_at:
      created,

    created_at_utc:
      iso(
        created
      ),

    source:
      "HTX official public liquidation REST",

    raw_trade_type:
      requestedType,
  };
}

async function persistLiquidations(
  env,
  events,
  eligibleCount = null
) {
  if (!env?.DATA_DB) {
    return {
      status:
        "SOURCE_UNSUPPORTED",

      reason:
        "D1 binding DATA_DB is not configured",
    };
  }

  const input = Array.isArray(events) ? events : [];
  const attempted = input.slice(0, MAX_HTX_LIQUIDATION_ROWS_PERSISTED);
  const eligible = Number.isFinite(Number(eligibleCount))
    ? Math.max(attempted.length, Math.trunc(Number(eligibleCount)))
    : input.length;

  if (!attempted.length) {
    return {
      status:
        "CLOSED",

      rows_written:
        0,

      rows_eligible:
        eligible,

      rows_attempted:
        0,

      rows_capacity_dropped:
        Math.max(0, eligible),

      d1_statements:
        0,
    };
  }

  try {
    const payload = attempted.map((event) => ({
      source: event?.source ?? null,
      event_id: event?.event_id ?? null,
      contract_code: event?.contract_code ?? null,
      ts: event?.created_at ?? null,
      side: event?.side ?? null,
      price: event?.price ?? null,
      volume_contracts: event?.volume_contracts ?? null,
      amount_base: event?.amount_base ?? null,
      notional_usdt: event?.notional_usdt ?? null,
      raw_json: JSON.stringify(event ?? {}),
    }));
    const result = await env.DATA_DB.prepare(`
      INSERT OR IGNORE INTO liquidation_events
      (
        source,
        event_id,
        contract_code,
        ts,
        side,
        price,
        volume_contracts,
        amount_base,
        notional_usdt,
        raw_json
      )
      SELECT
        json_extract(value,'$.source'),
        json_extract(value,'$.event_id'),
        json_extract(value,'$.contract_code'),
        json_extract(value,'$.ts'),
        json_extract(value,'$.side'),
        json_extract(value,'$.price'),
        json_extract(value,'$.volume_contracts'),
        json_extract(value,'$.amount_base'),
        json_extract(value,'$.notional_usdt'),
        json_extract(value,'$.raw_json')
      FROM json_each(?1)
    `).bind(JSON.stringify(payload)).run();

    const dropped = Math.max(0, eligible - attempted.length);

    return {
      status:
        dropped > 0 ? "PARTIAL_BOUNDED" : "CLOSED",

      rows_written:
        Number(result?.meta?.changes ?? 0),

      rows_eligible:
        eligible,

      rows_attempted:
        attempted.length,

      rows_capacity_dropped:
        dropped,

      d1_statements:
        1,
    };
  } catch (error) {
    return {
      status:
        "PARTIAL",

      reason:
        String(
          error?.message ||
          error
        ),
    };
  }
}

async function fetchLiquidationJson(
  url
) {
  const getResult =
    await fetchJsonWithMethod(
      url,
      "GET"
    );

  if (getResult.ok) {
    return {
      ...getResult,

      method_used:
        "GET",

      fallback_used:
        false,
    };
  }

  const postResult =
    await fetchJsonWithMethod(
      url,
      "POST"
    );

  if (postResult.ok) {
    return {
      ...postResult,

      method_used:
        "POST",

      fallback_used:
        true,

      primary_get_error:
        getResult.error,

      primary_get_http_status:
        getResult.http_status,
    };
  }

  return {
    ...postResult,

    method_used:
      "GET_THEN_POST_FAILED",

    fallback_used:
      true,

    primary_get_error:
      getResult.error,

    primary_get_http_status:
      getResult.http_status,

    fallback_post_error:
      postResult.error,

    fallback_post_http_status:
      postResult.http_status,
  };
}

async function htxLiquidationTape(
  params,
  env,
  options = {}
) {
  const now =
    Date.now();

  const contract =
    normalizeFuturesContract(
      params.contract ||
      params.contract_code ||
      "BTC-USDT"
    );

  const lookbackMin =
    Math.round(
      clamp(
        params.lookback_minutes,
        1,
        120,
        120
      )
    );

  const start =
    now -
    lookbackMin *
      60 *
      1000;

  const base =
    `${FUTURES_BASE}/linear-swap-api/v3/swap_liquidation_orders`;

  const makeUrl =
    (type) =>
      `${base}` +
      `?contract=${encodeURIComponent(
        contract
      )}` +
      `&trade_type=${type}` +
      `&start_time=${start}` +
      `&end_time=${now}` +
      `&direct=prev`;

  const [
    longR,
    shortR,
  ] =
    await Promise.all([
      fetchLiquidationJson(
        makeUrl(
          5
        )
      ),

      fetchLiquidationJson(
        makeUrl(
          6
        )
      ),
    ]);

  const longRawRows =
    asArray(
      longR.data?.data
    );

  const shortRawRows =
    asArray(
      shortR.data?.data
    );

  const longRowsTruncated =
    longRawRows.length >
    MAX_HTX_LIQUIDATION_ROWS_PER_SIDE;

  const shortRowsTruncated =
    shortRawRows.length >
    MAX_HTX_LIQUIDATION_ROWS_PER_SIDE;

  const longEvents =
    longRawRows
      .slice(0, MAX_HTX_LIQUIDATION_ROWS_PER_SIDE)
      .map(
      (x) =>
        normalizeLiquidationRow(
          x,
          5
        )
    );

  const shortEvents =
    shortRawRows
      .slice(0, MAX_HTX_LIQUIDATION_ROWS_PER_SIDE)
      .map(
      (x) =>
        normalizeLiquidationRow(
          x,
          6
        )
    );

  const events = [
    ...longEvents,
    ...shortEvents,
  ].sort(
    (
      a,
      b
    ) =>
      (
        a.created_at ||
        0
      ) -
      (
        b.created_at ||
        0
      )
  );

  const latestTs =
    events.length
      ? events[
          events.length -
          1
        ].created_at
      : null;

  const summarize =
    (side) => {
      const rows =
        events.filter(
          (e) =>
            e.side ===
            side
        );

      return {
        events:
          rows.length,

        notional_usdt:
          rows.reduce(
            (
              s,
              e
            ) =>
              s +
              (
                num(
                  e.notional_usdt
                ) ||
                0
              ),
            0
          ),

        amount_base:
          rows.reduce(
            (
              s,
              e
            ) =>
              s +
              (
                num(
                  e.amount_base
                ) ||
                0
              ),
            0
          ),
      };
    };

  const output = {
    source:
      "HTX official public API",

    tool:
      "htx_liquidation_tape",

    version:
      "1.0",

    contract,

    lookback_minutes:
      lookbackMin,

    window_start_utc:
      iso(
        start
      ),

    window_end_utc:
      iso(
        now
      ),

    timestamp:
      now,

    timestamp_utc:
      new Date(
        now
      ).toISOString(),

    factual_only:
      true,

    projected_levels_included:
      false,

    order_book_liquidity_included:
      false,

    summary: {
      long_liquidations:
        summarize(
          "LONG_LIQUIDATED"
        ),

      short_liquidations:
        summarize(
          "SHORT_LIQUIDATED"
        ),

      total_events:
        events.length,

      payload_total_events:
        longRawRows.length +
        shortRawRows.length,

      rows_capacity_dropped:
        Math.max(
          0,
          longRawRows.length +
          shortRawRows.length -
          events.length
        ),
    },

    freshness: {
      latest_event_time:
        iso(
          latestTs
        ),

      latest_event_age_sec:
        latestTs !== null
          ? Math.max(
              0,
              now -
              latestTs
            ) /
            1000
          : null,

      no_event_is_not_an_error:
        events.length ===
        0,
    },

    transport: {
      long_liquidations_method:
        longR.method_used ||
        null,

      short_liquidations_method:
        shortR.method_used ||
        null,

      long_fallback_used:
        Boolean(
          longR.fallback_used
        ),

      short_fallback_used:
        Boolean(
          shortR.fallback_used
        ),
    },

    health: {
      long_liquidations:
        longR.ok,

      short_liquidations:
        shortR.ok,

      bounded_scan_truncated:
        longRowsTruncated ||
        shortRowsTruncated,
    },

    coverage: {
      htx_factual_long_liquidations:
        longR.ok
          ? longRowsTruncated
            ? "partial_bounded"
            : "closed"
          : "not_closed",

      htx_factual_short_liquidations:
        shortR.ok
          ? shortRowsTruncated
            ? "partial_bounded"
            : "closed"
          : "not_closed",
    },

    events,

    endpoint_errors: {
      long_liquidations:
        longR.ok
          ? null
          : longR.error,

      short_liquidations:
        shortR.ok
          ? null
          : shortR.error,
    },
  };

  if (
    options.persist ||
    String(
      params.persist ||
      ""
    ).toLowerCase() ===
      "true"
  ) {
    output.persistence =
      await persistLiquidations(
        env,
        events,
        longRawRows.length +
          shortRawRows.length
      );
  } else {
    output.persistence = {
      status:
        env?.DATA_DB
          ? "NOT_REQUESTED"
          : "SOURCE_UNSUPPORTED",
    };
  }

  return output;
}async function recordCronRun(env, row) {
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
    };
  }

  try {
    await env.DATA_DB
      .prepare(`
        INSERT OR REPLACE INTO cron_runs
        (
          run_id,
          scheduled_time,
          started_ts,
          completed_ts,
          status,
          universe_total,
          scanned,
          persistence_status,
          error_text
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          ?5,
          ?6,
          ?7,
          ?8,
          ?9
        )
      `)
      .bind(
        row.run_id,
        row.scheduled_time,
        row.started_ts,
        row.completed_ts ?? null,
        row.status,
        row.universe_total ?? null,
        row.scanned ?? null,
        row.persistence_status ?? null,
        row.error_text ?? null
      )
      .run();

    return {
      status: "CLOSED",
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      error: String(
        error?.message ||
        error
      ),
    };
  }
}

/* MY_REPORT_2_SHADOW_OUTCOME_MODEL_INLINE_V1 — embedded for Worker/test compatibility. */
const buildShadowOutcomeRecord = (() => {
  const OUTCOME_RULES_VERSION = "shadow-outcome-v1";

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function round4(value) {
    return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
  }

  function upper(value) {
    return String(value ?? "").trim().toUpperCase();
  }

  function latestAtOrBefore(points, targetTs, toleranceMs) {
    let best = null;
    for (const point of points) {
      const ts = finite(point?.ts);
      const price = finite(point?.price);
      if (ts === null || price === null || price <= 0) continue;
      if (ts > targetTs) continue;
      if (targetTs - ts > toleranceMs) continue;
      if (!best || ts > best.ts) best = { ts, price, distance_ms: targetTs - ts };
    }
    return best;
  }

  function earliestAtOrAfter(points, targetTs, toleranceMs) {
    let best = null;
    for (const point of points) {
      const ts = finite(point?.ts);
      const price = finite(point?.price);
      if (ts === null || price === null || price <= 0) continue;
      if (ts < targetTs) continue;
      if (ts - targetTs > toleranceMs) continue;
      if (!best || ts < best.ts) best = { ts, price, distance_ms: ts - targetTs };
    }
    return best;
  }

  function pctFrom(referencePrice, price) {
    const a = finite(referencePrice);
    const b = finite(price);
    if (a === null || b === null || a <= 0) return null;
    return ((b / a) - 1) * 100;
  }

  function buildShadowOutcomeRecord({
    candidate,
    horizon_hours,
    points,
    computed_ts = Date.now(),
    reference_tolerance_ms = 7.5 * 60 * 1000,
    target_tolerance_ms = 7.5 * 60 * 1000,
    expected_interval_ms = 5 * 60 * 1000,
  } = {}) {
    const shadowId = String(candidate?.shadow_id || "").trim();
    const contract = String(candidate?.contract_code || candidate?.contract || "").trim();
    const observedTs = finite(candidate?.observed_ts);
    const direction = upper(candidate?.direction_hint);
    const horizonHours = finite(horizon_hours);
    const computedTs = finite(computed_ts) ?? Date.now();
    const safePoints = Array.isArray(points)
      ? points
          .map((p) => ({ ts: finite(p?.ts), price: finite(p?.price) }))
          .filter((p) => p.ts !== null && p.price !== null && p.price > 0)
          .sort((a, b) => a.ts - b.ts)
      : [];

    const base = {
      outcome_rules_version: OUTCOME_RULES_VERSION,
      shadow_id: shadowId || null,
      contract,
      observed_ts: observedTs,
      rules_version: String(candidate?.rules_version || "").slice(0, 120) || null,
      direction_hint: direction || null,
      dc_shadow_long: finite(candidate?.dc_long ?? candidate?.dc_shadow_long),
      dc_shadow_short: finite(candidate?.dc_short ?? candidate?.dc_shadow_short),
      eq_status: String(candidate?.eq_status || "").slice(0, 80) || null,
      dq_status: String(candidate?.dq_status || "").slice(0, 80) || null,
      stage: String(candidate?.stage || "").slice(0, 100) || null,
      horizon_hours: horizonHours,
      target_ts:
        observedTs !== null && horizonHours !== null
          ? observedTs + horizonHours * 60 * 60 * 1000
          : null,
      source: "STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS",
      reference_selection: "LATEST_AT_OR_BEFORE_SIGNAL",
      target_selection: "EARLIEST_AT_OR_AFTER_HORIZON",
      interpolation_used: false,
      calibration_only: true,
      live_promotion_allowed: false,
      automatic_weight_tuning_enabled: false,
      computed_ts: computedTs,
    };

    if (!shadowId || !contract || observedTs === null || horizonHours === null || horizonHours <= 0) {
      return {
        ...base,
        status: "INVALID_INPUT",
        reason: "shadow_id, contract, observed_ts and positive horizon_hours are required",
      };
    }

    if (direction !== "LONG" && direction !== "SHORT") {
      return {
        ...base,
        status: "SKIPPED_NON_DIRECTIONAL",
        reason: "Only LONG/SHORT shadow hints receive directional outcome calibration",
      };
    }

    const targetTs = base.target_ts;
    const reference = latestAtOrBefore(safePoints, observedTs, reference_tolerance_ms);
    const outcome = earliestAtOrAfter(safePoints, targetTs, target_tolerance_ms);

    if (!reference || !outcome) {
      return {
        ...base,
        status: "INSUFFICIENT_FACTUAL_HISTORY",
        reason: !reference && !outcome
          ? "reference_and_target_snapshots_missing"
          : !reference
            ? "reference_snapshot_missing"
            : "target_snapshot_missing",
        reference_scan_ts: reference?.ts ?? null,
        reference_price: reference?.price ?? null,
        reference_offset_sec: reference ? round4((reference.ts - observedTs) / 1000) : null,
        outcome_scan_ts: outcome?.ts ?? null,
        outcome_price: outcome?.price ?? null,
        target_offset_sec: outcome ? round4((outcome.ts - targetTs) / 1000) : null,
        path_points: 0,
        expected_points: null,
        path_coverage_pct: null,
        raw_return_pct: null,
        directional_return_pct: null,
        mfe_directional_pct_snapshot: null,
        mae_directional_pct_snapshot: null,
        direction_correct: null,
      };
    }

    const startTs = Math.min(reference.ts, outcome.ts);
    const endTs = Math.max(reference.ts, outcome.ts);
    const path = safePoints.filter((p) => p.ts >= startTs && p.ts <= endTs);
    const expectedPoints = Math.max(1, Math.floor((endTs - startTs) / expected_interval_ms) + 1);
    const coveragePct = Math.min(100, (path.length / expectedPoints) * 100);
    const factor = direction === "LONG" ? 1 : -1;
    const directionalPath = path
      .map((p) => pctFrom(reference.price, p.price))
      .filter((v) => v !== null)
      .map((v) => v * factor);
    const rawReturn = pctFrom(reference.price, outcome.price);
    const directionalReturn = rawReturn === null ? null : rawReturn * factor;

    const mfe = directionalPath.length ? Math.max(...directionalPath) : null;
    const mae = directionalPath.length ? Math.min(...directionalPath) : null;

    return {
      ...base,
      status: "CLOSED_FACTUAL",
      reason: null,
      reference_scan_ts: reference.ts,
      reference_price: round4(reference.price),
      reference_offset_sec: round4((reference.ts - observedTs) / 1000),
      outcome_scan_ts: outcome.ts,
      outcome_price: round4(outcome.price),
      target_offset_sec: round4((outcome.ts - targetTs) / 1000),
      path_points: path.length,
      expected_points: expectedPoints,
      path_coverage_pct: round4(coveragePct),
      raw_return_pct: round4(rawReturn),
      directional_return_pct: round4(directionalReturn),
      mfe_directional_pct_snapshot: round4(mfe),
      mae_directional_pct_snapshot: round4(mae),
      direction_correct:
        directionalReturn === null || directionalReturn === 0
          ? null
          : directionalReturn > 0,
      quality_note:
        "MFE/MAE are extrema of factual persisted ~5m Stage-0 snapshots, not intrabar candle highs/lows. Missing scans remain missing; no interpolation is used.",
    };
  }

  return buildShadowOutcomeRecord;
})();


/* =========================================================
   MY_REPORT_2_SHADOW_OUTCOME_CALIBRATION_V1
   Counterfactual outcome journal for shadow telemetry only.
   Uses factual persisted Stage-0 snapshots; no interpolation,
   no live signal promotion, no automatic weight tuning.
   ========================================================= */
function shadowOutcomeContractKey(value) {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .toUpperCase();
}

function shadowOutcomePointFromPayload(payloadText, contractCode, scanTs) {
  let payload;
  try {
    payload = JSON.parse(payloadText || "{}");
  } catch {
    return null;
  }
  const key = shadowOutcomeContractKey(contractCode);
  const rows = Array.isArray(payload?.contracts) ? payload.contracts : [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    if (shadowOutcomeContractKey(row[0]) !== key) continue;
    const price = row[1] === null || row[1] === undefined || row[1] === ""
      ? null
      : Number(row[1]);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      ts: Number(scanTs),
      price,
    };
  }
  return null;
}

async function archiveNewShadowCalibrationSignals(env, nowMs = Date.now()) {
  const now = Number(nowMs) || Date.now();
  const sourceSince = now - 7 * 24 * 60 * 60 * 1000;
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
      source_signals_seen: 0,
      signals_archived: 0,
      error: "D1 binding DATA_DB is not configured",
    };
  }
  try {
    const result = await env.DATA_DB
      .prepare(`
        INSERT OR IGNORE INTO shadow_calibration_signal
        (
          shadow_id, contract_code, observed_ts, rules_version,
          source, mode, direction_hint, dc_long, dc_short,
          eq_status, dq_status, stage, data_sufficiency,
          missing_chains_json, evidence_flags_json,
          calibration_only, live_promotion_allowed, archived_ts
        )
        SELECT
          sd.shadow_id, sd.contract_code, sd.observed_ts, sd.rules_version,
          sd.source, sd.mode, sd.direction_hint, sd.dc_long, sd.dc_short,
          sd.eq_status, sd.dq_status, sd.stage, sd.data_sufficiency,
          sd.missing_chains_json, sd.evidence_flags_json,
          1, 0, ?2
        FROM shadow_decision_log sd
        WHERE sd.observed_ts >= ?1
          AND sd.direction_hint IN ('LONG', 'SHORT')
          AND NOT EXISTS (
            SELECT 1
            FROM shadow_calibration_signal sc
            WHERE sc.shadow_id = sd.shadow_id
          )
        ORDER BY sd.observed_ts ASC
        LIMIT 40
      `)
      .bind(sourceSince, now)
      .run();
    const changes = Number(result?.meta?.changes ?? 0);
    return {
      status: "CLOSED",
      source_signals_seen: changes,
      signals_archived: changes,
      error: null,
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      source_signals_seen: 0,
      signals_archived: 0,
      error: String(error?.message || error).slice(0, 600),
    };
  }
}

async function loadShadowOutcomePath(env, candidate, horizonHours) {
  const observedTs = Number(candidate?.observed_ts);
  const horizon = Number(horizonHours);
  if (!env?.DATA_DB || !Number.isFinite(observedTs) || !Number.isFinite(horizon)) {
    return {
      ok: false,
      points: [],
      error: "invalid_stage0_path_request",
    };
  }
  const targetTs = observedTs + horizon * 60 * 60 * 1000;
  const padMs = 10 * 60 * 1000;
  const fromBucket = Math.floor((observedTs - padMs) / 300000) * 300000;
  const toBucket = Math.floor((targetTs + padMs) / 300000) * 300000;
  try {
    const result = await env.DATA_DB
      .prepare(`
        SELECT ts, payload_json
        FROM scan_runs
        WHERE ts_bucket BETWEEN ?1 AND ?2
        ORDER BY ts_bucket ASC
        LIMIT 500
      `)
      .bind(fromBucket, toBucket)
      .all();
    const rows = Array.isArray(result?.results) ? result.results : [];
    const points = [];
    for (const row of rows) {
      const point = shadowOutcomePointFromPayload(
        row?.payload_json,
        candidate?.contract_code,
        row?.ts
      );
      if (point) points.push(point);
    }
    return { ok: true, points, error: null };
  } catch (error) {
    return {
      ok: false,
      points: [],
      error: String(error?.message || error).slice(0, 600),
    };
  }
}

async function persistShadowOutcomeRecord(env, record) {
  if (!env?.DATA_DB) {
    return { status: "SOURCE_UNSUPPORTED" };
  }
  const directionCorrect =
    record?.direction_correct === true
      ? 1
      : record?.direction_correct === false
        ? 0
        : null;
  try {
    const result = await env.DATA_DB
      .prepare(`
        INSERT OR REPLACE INTO shadow_outcome_log
        (
          shadow_id, contract_code, observed_ts, rules_version,
          outcome_rules_version, direction_hint, dc_long, dc_short,
          eq_status, dq_status, stage, horizon_hours, target_ts,
          reference_selection, target_selection,
          reference_scan_ts, reference_price, reference_offset_sec,
          outcome_scan_ts, outcome_price, target_offset_sec,
          raw_return_pct, directional_return_pct,
          mfe_directional_pct_snapshot, mae_directional_pct_snapshot,
          direction_correct, path_points, expected_points, path_coverage_pct,
          status, reason, source, interpolation_used, calibration_only,
          live_promotion_allowed, automatic_weight_tuning_enabled, computed_ts
        )
        VALUES
        (
          ?1, ?2, ?3, ?4,
          ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, ?12, ?13,
          ?14, ?15,
          ?16, ?17, ?18,
          ?19, ?20, ?21,
          ?22, ?23,
          ?24, ?25,
          ?26, ?27, ?28, ?29,
          ?30, ?31, ?32, 0, 1, 0, 0, ?33
        )
      `)
      .bind(
        record?.shadow_id,
        record?.contract,
        record?.observed_ts,
        record?.rules_version,
        record?.outcome_rules_version || "shadow-outcome-v1",
        record?.direction_hint,
        record?.dc_shadow_long,
        record?.dc_shadow_short,
        record?.eq_status,
        record?.dq_status,
        record?.stage,
        record?.horizon_hours,
        record?.target_ts,
        String(record?.reference_selection || "LATEST_AT_OR_BEFORE_SIGNAL").slice(0, 80),
        String(record?.target_selection || "EARLIEST_AT_OR_AFTER_HORIZON").slice(0, 80),
        record?.reference_scan_ts ?? null,
        record?.reference_price ?? null,
        record?.reference_offset_sec ?? null,
        record?.outcome_scan_ts ?? null,
        record?.outcome_price ?? null,
        record?.target_offset_sec ?? null,
        record?.raw_return_pct ?? null,
        record?.directional_return_pct ?? null,
        record?.mfe_directional_pct_snapshot ?? null,
        record?.mae_directional_pct_snapshot ?? null,
        directionCorrect,
        Number(record?.path_points || 0),
        record?.expected_points ?? null,
        record?.path_coverage_pct ?? null,
        String(record?.status || "UNKNOWN").slice(0, 80),
        record?.reason ? String(record.reason).slice(0, 300) : null,
        String(record?.source || "STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS").slice(0, 100),
        Number(record?.computed_ts) || Date.now()
      )
      .run();
    return {
      status: "CLOSED",
      changes: Number(result?.meta?.changes ?? 0),
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      error: String(error?.message || error).slice(0, 600),
    };
  }
}

async function recordShadowOutcomeSweepState(env, payload) {
  if (!env?.DATA_DB) return;
  try {
    await env.DATA_DB
      .prepare(`
        INSERT OR REPLACE INTO shadow_outcome_state
        (
          state_key, last_sweep_ts, source_signals_seen, signals_archived,
          candidates_seen, tasks_due, tasks_processed, closed_written,
          insufficient_written, last_status, last_error
        )
        VALUES ('main', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      `)
      .bind(
        Number(payload?.last_sweep_ts) || Date.now(),
        Number(payload?.source_signals_seen || 0),
        Number(payload?.signals_archived || 0),
        Number(payload?.candidates_seen || 0),
        Number(payload?.tasks_due || 0),
        Number(payload?.tasks_processed || 0),
        Number(payload?.closed_written || 0),
        Number(payload?.insufficient_written || 0),
        String(payload?.last_status || "UNKNOWN").slice(0, 80),
        payload?.last_error ? String(payload.last_error).slice(0, 600) : null
      )
      .run();
  } catch {}
}

const D1_FREE_QUERY_LIMIT = 50;
const CONSERVATIVE_DEEP_CHECK_D1_QUERY_BUDGET = 48;
const LEGACY_OUTCOME_SWEEP_MAX_D1_QUERIES = 14;

async function runShadowOutcomeCalibrationSweep(env, nowMs = Date.now(), maxTasks = 4) {
  const now = Number(nowMs) || Date.now();
  const horizons = [1, 4, 12, 24];
  const sourceSince = now - 6 * 24 * 60 * 60 * 1000;
  const maturityGraceMs = 10 * 60 * 1000;
  const summary = {
    mode: "CALIBRATION_ONLY_NO_LIVE_PROMOTION",
    source: "STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS",
    last_sweep_ts: now,
    source_signals_seen: 0,
    signals_archived: 0,
    candidates_seen: 0,
    tasks_due: 0,
    tasks_processed: 0,
    closed_written: 0,
    insufficient_written: 0,
    last_status: "CLOSED",
    last_error: null,
    automatic_weight_tuning_enabled: false,
    live_promotion_allowed: false,
  };

  if (!env?.DATA_DB) {
    summary.last_status = "SOURCE_UNSUPPORTED";
    return summary;
  }

  try {
    const archived = await archiveNewShadowCalibrationSignals(env, now);
    summary.source_signals_seen = Number(archived?.source_signals_seen || 0);
    summary.signals_archived = Number(archived?.signals_archived || 0);
    if (archived?.status !== "CLOSED") {
      summary.last_status = "PARTIAL";
      summary.last_error = archived?.error || "shadow_signal_archive_failed";
    }

    const [candidateResult, existingResult] = await Promise.all([
      env.DATA_DB
        .prepare(`
          SELECT
            shadow_id, contract_code, observed_ts, rules_version,
            direction_hint, dc_long, dc_short, eq_status, dq_status, stage
          FROM shadow_calibration_signal
          WHERE observed_ts >= ?1
            AND direction_hint IN ('LONG', 'SHORT')
          ORDER BY observed_ts ASC
          LIMIT 160
        `)
        .bind(sourceSince)
        .all(),
      env.DATA_DB
        .prepare(`
          SELECT shadow_id, horizon_hours
          FROM shadow_outcome_log
          WHERE observed_ts >= ?1
        `)
        .bind(sourceSince)
        .all(),
    ]);

    const candidates = Array.isArray(candidateResult?.results) ? candidateResult.results : [];
    const existing = new Set(
      (Array.isArray(existingResult?.results) ? existingResult.results : [])
        .map((row) => `${row?.shadow_id}:${Number(row?.horizon_hours)}`)
    );
    summary.candidates_seen = candidates.length;

    const due = [];
    for (const candidate of candidates) {
      const observedTs = Number(candidate?.observed_ts);
      if (!Number.isFinite(observedTs)) continue;
      for (const horizon of horizons) {
        const key = `${candidate?.shadow_id}:${horizon}`;
        if (existing.has(key)) continue;
        const targetTs = observedTs + horizon * 60 * 60 * 1000;
        if (now >= targetTs + maturityGraceMs) {
          due.push({ candidate, horizon, target_ts: targetTs });
        }
      }
    }
    due.sort((a, b) => a.target_ts - b.target_ts);
    summary.tasks_due = due.length;

    for (const task of due.slice(0, Math.max(1, Math.min(8, Number(maxTasks) || 4)))) {
      const loaded = await loadShadowOutcomePath(env, task.candidate, task.horizon);
      summary.tasks_processed += 1;
      if (!loaded?.ok) {
        summary.last_status = "PARTIAL";
        summary.last_error = loaded?.error || "stage0_path_load_failed";
        continue;
      }
      const record = buildShadowOutcomeRecord({
        candidate: task.candidate,
        horizon_hours: task.horizon,
        points: loaded.points,
        computed_ts: now,
      });
      const persisted = await persistShadowOutcomeRecord(env, record);
      if (persisted?.status !== "CLOSED") {
        summary.last_status = "PARTIAL";
        summary.last_error = persisted?.error || "outcome_persist_failed";
        continue;
      }
      if (record?.status === "CLOSED_FACTUAL") summary.closed_written += 1;
      if (record?.status === "INSUFFICIENT_FACTUAL_HISTORY") summary.insufficient_written += 1;
    }

    const retentionBefore = now - 180 * 24 * 60 * 60 * 1000;
    try {
      await env.DATA_DB.batch([
        env.DATA_DB
          .prepare(`DELETE FROM shadow_outcome_log WHERE computed_ts < ?1`)
          .bind(retentionBefore),
        env.DATA_DB
          .prepare(`DELETE FROM shadow_calibration_signal WHERE observed_ts < ?1`)
          .bind(retentionBefore),
      ]);
    } catch (error) {
      summary.last_status = "PARTIAL";
      summary.last_error = String(error?.message || error).slice(0, 600);
    }
  } catch (error) {
    summary.last_status = "PARTIAL";
    summary.last_error = String(error?.message || error).slice(0, 600);
  }

  await recordShadowOutcomeSweepState(env, summary);
  return summary;
}

function deepCheckAttemptedForD1Budget(boundedDeepCheck) {
  return Array.isArray(boundedDeepCheck?.results) &&
    boundedDeepCheck.results.some((row) =>
      ["FULFILLED", "ERROR"].includes(String(row?.execution_status || ""))
    );
}

async function dataPlaneStatus(env) {
  const now = Date.now();

  const base = {
    tool:
      "data_plane_status",

    version:
      FAST_MOVE_WATCH_VERSION,

    timestamp_utc:
      new Date(
        now
      ).toISOString(),

    modules: {
      htx_futures_snapshot:
        "ACTIVE_BACKWARD_COMPATIBLE",

      htx_spot_snapshot:
        "ACTIVE_BACKWARD_COMPATIBLE",

      htx_futures_trajectory:
        "ACTIVE_BACKWARD_COMPATIBLE",

      htx_universe_scan:
        "IMPLEMENTED",

      htx_crypto_instrument_scope:
        "ACTIVE_FAIL_CLOSED_FROM_HTX_LABELS",

      bounded_deep_check_scheduler:
        env?.DATA_DB
          ? "CRON_WIRED_MAX_ONE_PER_RUN"
          : "CODE_READY_BINDING_REQUIRED",

      deep_check_run_journal:
        env?.DATA_DB
          ? "ACTIVE_COMPACT_7D_RETENTION"
          : "CODE_READY_BINDING_REQUIRED",

      htx_symbol_resolve:
        "IMPLEMENTED",

      htx_stage0_history:
        env?.DATA_DB
          ? "ACTIVE"
          : "CODE_READY_BINDING_REQUIRED",

      persistent_trajectory_store:
        env?.DATA_DB
          ? "BOUND"
          : "CODE_READY_BINDING_REQUIRED",

      htx_liquidation_tape_rest:
        "IMPLEMENTED",

      htx_liquidation_ws_ingest:
        "NOT_DEPLOYED_REQUIRES_LONG_LIVED_INGEST_ARCHITECTURE",

      liquidation_consensus:
        "SHADOW_ONLY_SINGLE_PROJECTED_PROVIDER_NO_CROSS_SOURCE_CONSENSUS",

      cross_venue_liquidation_intelligence:
        env?.BYKARANTELI_API_KEY
          ? "ACTIVE_SHADOW_BYKARANTELI_PLUS_HTX_REALIZED"
          : "CODE_READY_FREE_API_KEY_REQUIRED",

      fast_move_watch:
        FAST_MOVE_WATCH_STATUS,

      opportunity_intelligence_shadow:
        env?.DATA_DB
          ? "ACTIVE_SHADOW_DATA_COLLECTION_AND_OUTCOMES"
          : "CODE_READY_BINDING_REQUIRED",

      multi_wave_campaign_shadow:
        env?.DATA_DB
          ? "ACTIVE_SHADOW_MULTI_WAVE_CAMPAIGN_LIFECYCLE"
          : "CODE_READY_BINDING_REQUIRED",

      missed_move_recall:
        env?.DATA_DB
          ? "DATA_MODEL_READY"
          : "CODE_READY_BINDING_REQUIRED",

      cron_observability:
        "IMPLEMENTED_DIAGNOSTIC_HEARTBEAT",
    },

    safety: {
      strategy_rules_changed:
        false,

      weights_changed:
        false,

      hard_veto_changed:
        false,

      missing_data_coerced_to_zero:
        false,

      service_binding_hub_changed:
        false,
    },

    storage: {
      d1_binding:
        Boolean(
          env?.DATA_DB
        ),

      binding_name:
        "DATA_DB",

      model:
        "ONE_COMPACT_UNIVERSE_ROW_PER_5M_SCAN",

      retention_days:
        7,

      free_tier_write_design:
        "~1 insert + bounded retention delete per scan; avoids per-contract D1 writes",
    },
  };

  
  base.modules.shadow_decision_layer =
    "ACTIVE_SHADOW_UNCALIBRATED_NO_EXECUTION";
  base.safety.shadow_decision_only = true;
  base.safety.shadow_live_probability_generated = false;
  base.safety.shadow_live_signal_generated = false;
  base.safety.shadow_telegram_dispatch_allowed = false;


  base.modules.shadow_outcome_calibration =
    "ACTIVE_CALIBRATION_ONLY_NO_LIVE_PROMOTION";
  base.safety.shadow_outcome_automatic_weight_tuning = false;
  base.safety.shadow_outcome_live_promotion_allowed = false;
  base.safety.shadow_outcome_interpolation_used = false;


  base.modules.full_evidence_shadow =
    "ACTIVE_EVIDENCE_FUSION_NO_LIVE_PROMOTION";
  base.safety.full_evidence_strategy_weights_changed = false;
  base.safety.full_evidence_automatic_weight_tuning = false;
  base.safety.full_evidence_live_probability_generated = false;
  base.safety.full_evidence_live_signal_generated = false;
  base.safety.full_evidence_validated = false;
  base.safety.full_evidence_telegram_dispatch_allowed = false;
  base.safety.full_evidence_trading_execution_allowed = false;

  base.safety.liquidation_intelligence_shadow_only = true;
  base.safety.liquidation_intelligence_changes_strategy_weights = false;
  base.safety.liquidation_intelligence_new_percentage_weight = false;
  base.safety.liquidation_intelligence_live_probability_generated = false;
  base.safety.liquidation_intelligence_live_signal_generated = false;
  base.safety.liquidation_intelligence_validated = false;
  base.safety.liquidation_intelligence_telegram_dispatch_allowed = false;
  base.safety.liquidation_intelligence_trading_execution_allowed = false;
  base.safety.liquidation_intelligence_guaranteed_tp_generated = false;
  base.safety.liquidation_intelligence_synthetic_heatmap_generated = false;
  base.safety.fast_move_watch_shadow_only = true;
  base.safety.fast_move_watch_scheduler_priority_is_probability = false;
  base.safety.fast_move_watch_changes_strategy_weights = false;
  base.safety.fast_move_watch_new_percentage_weight = false;
  base.safety.fast_move_watch_live_probability_generated = false;
  base.safety.fast_move_watch_live_signal_generated = false;
  base.safety.fast_move_watch_validated_signal_generated = false;
  base.safety.fast_move_watch_telegram_dispatch_allowed = false;
  base.safety.fast_move_watch_trading_execution_allowed = false;
  base.safety.fast_move_watch_automatic_weight_tuning = false;
  base.safety.opportunity_shadow_only = true;
  base.safety.opportunity_live_probability_generated = false;
  base.safety.opportunity_live_signal_generated = false;
  base.safety.opportunity_validated_signal_generated = false;
  base.safety.opportunity_decision_layer_changed = false;
  base.safety.opportunity_strategy_weights_changed = false;
  base.safety.opportunity_fixed_weights_35_30_20_15_unchanged = true;
  base.safety.opportunity_telegram_dispatch_allowed = false;
  base.safety.opportunity_trading_execution_allowed = false;
  base.safety.opportunity_automatic_weight_tuning = false;
  base.safety.multi_wave_campaign_shadow_only = true;
  base.safety.multi_wave_campaign_live_probability_generated = false;
  base.safety.multi_wave_campaign_live_signal_generated = false;
  base.safety.multi_wave_campaign_validated_signal_generated = false;
  base.safety.multi_wave_campaign_decision_layer_changed = false;
  base.safety.multi_wave_campaign_strategy_weights_changed = false;
  base.safety.multi_wave_campaign_telegram_dispatch_allowed = false;
  base.safety.multi_wave_campaign_trading_execution_allowed = false;
  base.safety.multi_wave_campaign_automatic_weight_tuning = false;

if (!env?.DATA_DB) {
    return base;
  }

  try {
    const latest =
      await env.DATA_DB
        .prepare(`
          SELECT
            ts,
            universe_total,
            scanned,
            missing,
            errors,
            stale,
            stage0_coverage_pct
          FROM scan_runs
          ORDER BY ts DESC
          LIMIT 1
        `)
        .first();

    base.storage.latest_scan =
      latest ||
      null;

    base.storage.latest_scan_age_sec =
      latest?.ts
        ? Math.max(
            0,
            now -
              Number(
                latest.ts
              )
          ) /
          1000
        : null;

    base.storage.health =
      "closed";
  } catch (error) {
    base.storage.health =
      "not_closed";

    base.storage.error =
      String(
        error?.message ||
        error
      );
  }

  try {
    const cron =
      await env.DATA_DB
        .prepare(`
          SELECT
            run_id,
            scheduled_time,
            started_ts,
            completed_ts,
            status,
            universe_total,
            scanned,
            persistence_status,
            error_text
          FROM cron_runs
          ORDER BY started_ts DESC
          LIMIT 1
        `)
        .first();

    base.cron = {
      table_available:
        true,

      latest_run:
        cron ||
        null,

      latest_run_age_sec:
        cron?.started_ts
          ? Math.max(
              0,
              now -
                Number(
                  cron.started_ts
                )
            ) /
            1000
          : null,
    };
  } catch (error) {
    base.cron = {
      table_available:
        false,

      latest_run:
        null,

      error:
        String(
          error?.message ||
          error
        ),

      note:
        "Apply the cron_runs diagnostic table migration before relying on cron heartbeat status.",
    };
  }

  try {
    const scheduler =
      await env.DATA_DB
        .prepare(`
          SELECT
            COUNT(*) AS state_rows,
            MAX(updated_ts) AS latest_updated_ts,
            SUM(
              CASE
                WHEN last_status = 'RUNNING'
                THEN 1
                ELSE 0
              END
            ) AS running_rows
          FROM deep_check_scheduler_state
        `)
        .first();

    base.deep_check_scheduler = {
      table_available:
        true,

      state_rows:
        Number(
          scheduler?.state_rows ||
          0
        ),

      running_rows:
        Number(
          scheduler?.running_rows ||
          0
        ),

      latest_updated_ts:
        scheduler
          ?.latest_updated_ts ??
        null,

      latest_update_age_sec:
        scheduler
          ?.latest_updated_ts
          ? Math.max(
              0,
              now -
                Number(
                  scheduler
                    .latest_updated_ts
                )
            ) /
            1000
          : null,
    };
  } catch (error) {
    base.deep_check_scheduler = {
      table_available:
        false,

      state_rows:
        0,

      running_rows:
        0,

      error:
        String(
          error?.message ||
          error
        ),

      note:
        "Apply report2_deep_check_scheduler_state.sql before enabling bounded Deep Check cron execution.",
    };
  }

  try {
    const since24h =
      now -
      24 *
        60 *
        60 *
        1000;

    const journalResults =
      await env.DATA_DB.batch([
        env.DATA_DB
          .prepare(`
            SELECT
              run_id,
              contract_code,
              started_ts,
              completed_ts,
              execution_status,
              data_sufficiency,
              gaps_json,
              fulfilled_components,
              failed_components_json,
              decision_generated,
              validated,
              telegram_started,
              error_text
            FROM deep_check_run_log
            ORDER BY completed_ts DESC
            LIMIT 12
          `),

        env.DATA_DB
          .prepare(`
            SELECT
              COUNT(*) AS total_24h,
              SUM(
                CASE
                  WHEN execution_status = 'COMPLETED'
                  THEN 1
                  ELSE 0
                END
              ) AS completed_24h,
              SUM(
                CASE
                  WHEN execution_status = 'ERROR'
                  THEN 1
                  ELSE 0
                END
              ) AS errors_24h,
              SUM(
                CASE
                  WHEN data_sufficiency = 'SUFFICIENT'
                  THEN 1
                  ELSE 0
                END
              ) AS sufficient_24h,
              SUM(
                CASE
                  WHEN data_sufficiency = 'PARTIAL'
                  THEN 1
                  ELSE 0
                END
              ) AS partial_24h,
              SUM(
                CASE
                  WHEN data_sufficiency = 'INSUFFICIENT'
                  THEN 1
                  ELSE 0
                END
              ) AS insufficient_24h,
              SUM(decision_generated) AS decisions_24h,
              SUM(validated) AS validated_24h,
              SUM(telegram_started) AS telegram_started_24h
            FROM deep_check_run_log
            WHERE completed_ts >= ?1
          `)
          .bind(
            since24h
          ),
      ]);

    const recentRows =
      Array.isArray(
        journalResults?.[0]
          ?.results
      )
        ? journalResults[0]
            .results
        : [];

    const summary =
      Array.isArray(
        journalResults?.[1]
          ?.results
      )
        ? journalResults[1]
            .results[0] ||
          {}
        : {};

    function parseJournalArray(
      value
    ) {
      try {
        const parsed =
          JSON.parse(
            String(
              value || "[]"
            )
          );

        return Array.isArray(
          parsed
        )
          ? parsed
          : [];
      } catch {
        return [];
      }
    }

    base.deep_check_journal = {
      table_available:
        true,

      retention_days:
        7,

      summary_24h: {
        total:
          Number(
            summary?.total_24h ||
            0
          ),

        completed:
          Number(
            summary
              ?.completed_24h ||
            0
          ),

        errors:
          Number(
            summary?.errors_24h ||
            0
          ),

        sufficient:
          Number(
            summary
              ?.sufficient_24h ||
            0
          ),

        partial:
          Number(
            summary?.partial_24h ||
            0
          ),

        insufficient:
          Number(
            summary
              ?.insufficient_24h ||
            0
          ),

        decisions_generated:
          Number(
            summary
              ?.decisions_24h ||
            0
          ),

        validated:
          Number(
            summary
              ?.validated_24h ||
            0
          ),

        telegram_started:
          Number(
            summary
              ?.telegram_started_24h ||
            0
          ),
      },

      recent:
        recentRows.map(
          (row) => ({
            run_id:
              row?.run_id ||
              null,

            contract:
              row
                ?.contract_code ||
              null,

            started_ts:
              row
                ?.started_ts ??
              null,

            completed_ts:
              row
                ?.completed_ts ??
              null,

            completed_age_sec:
              row?.completed_ts
                ? Math.max(
                    0,
                    now -
                      Number(
                        row
                          .completed_ts
                      )
                  ) /
                  1000
                : null,

            execution_status:
              row
                ?.execution_status ||
              null,

            data_sufficiency:
              row
                ?.data_sufficiency ||
              null,

            gaps:
              parseJournalArray(
                row?.gaps_json
              ),

            fulfilled_components:
              schedulerNumber(
                row
                  ?.fulfilled_components
              ),

            failed_components:
              parseJournalArray(
                row
                  ?.failed_components_json
              ),

            decision_generated:
              Number(
                row
                  ?.decision_generated ||
                0
              ) === 1,

            validated:
              Number(
                row?.validated ||
                0
              ) === 1,

            telegram_started:
              Number(
                row
                  ?.telegram_started ||
                0
              ) === 1,

            error:
              row?.error_text ||
              null,
          })
        ),
    };
  } catch (error) {
    base.deep_check_journal = {
      table_available:
        false,

      retention_days:
        7,

      summary_24h:
        null,

      recent: [],

      error:
        String(
          error?.message ||
          error
        ),

      note:
        "Apply report2_deep_check_run_log.sql before relying on Deep Check journal status.",
    };
  }

  
  try {
    const shadowSince =
      now - 24 * 60 * 60 * 1000;

    const shadowSummary =
      await env.DATA_DB
        .prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN direction_hint = 'LONG' THEN 1 ELSE 0 END) AS long_hints,
            SUM(CASE WHEN direction_hint = 'SHORT' THEN 1 ELSE 0 END) AS short_hints,
            SUM(CASE WHEN direction_hint = 'NEUTRAL' THEN 1 ELSE 0 END) AS neutral_hints,
            SUM(CASE WHEN dq_status = 'INSUFFICIENT' THEN 1 ELSE 0 END) AS insufficient,
            SUM(actual_decision_generated) AS actual_decisions_generated,
            SUM(validated) AS validated,
            SUM(telegram_started) AS telegram_started
          FROM shadow_decision_log
          WHERE observed_ts >= ?1
        `)
        .bind(shadowSince)
        .first();

    const shadowRecentResult =
      await env.DATA_DB
        .prepare(`
          SELECT
            shadow_id,
            contract_code,
            observed_ts,
            rules_version,
            source,
            mode,
            direction_hint,
            dc_long,
            dc_short,
            eq_status,
            dq_status,
            stage,
            data_sufficiency,
            missing_chains_json,
            evidence_flags_json,
            calibrated,
            full_decision_eligible,
            actual_decision_generated,
            validated,
            telegram_started
          FROM shadow_decision_log
          ORDER BY observed_ts DESC
          LIMIT 10
        `)
        .all();

    const shadowRecent =
      Array.isArray(shadowRecentResult?.results)
        ? shadowRecentResult.results.map(
            (row) => {
              let missingChains = [];
              let evidenceFlags = {};
              try {
                missingChains = JSON.parse(
                  row?.missing_chains_json || "[]"
                );
              } catch {}
              try {
                evidenceFlags = JSON.parse(
                  row?.evidence_flags_json || "{}"
                );
              } catch {}
              return {
                shadow_id: row?.shadow_id || null,
                contract: row?.contract_code || null,
                observed_ts: Number(row?.observed_ts) || null,
                observed_age_sec:
                  Number.isFinite(Number(row?.observed_ts))
                    ? Math.max(0, now - Number(row.observed_ts)) / 1000
                    : null,
                rules_version: row?.rules_version || null,
                source: row?.source || null,
                mode: row?.mode || null,
                direction_hint: row?.direction_hint || null,
                dc_shadow_long:
                  Number.isFinite(Number(row?.dc_long))
                    ? Number(row.dc_long)
                    : null,
                dc_shadow_short:
                  Number.isFinite(Number(row?.dc_short))
                    ? Number(row.dc_short)
                    : null,
                eq_status: row?.eq_status || null,
                dq_status: row?.dq_status || null,
                stage: row?.stage || null,
                data_sufficiency: row?.data_sufficiency || null,
                required_missing_chains: missingChains,
                evidence_flags: evidenceFlags,
                calibrated: Number(row?.calibrated) === 1,
                full_decision_eligible:
                  Number(row?.full_decision_eligible) === 1,
                actual_decision_generated:
                  Number(row?.actual_decision_generated) === 1,
                validated: Number(row?.validated) === 1,
                telegram_started:
                  Number(row?.telegram_started) === 1,
              };
            }
          )
        : [];

    base.shadow_decision_journal = {
      table_available: true,
      retention_days: 7,
      rules_version:
        "shadow-dc-eq-dq-v1",
      mode:
        "SHADOW_ONLY_NO_EXECUTION",
      calibrated: false,
      full_decision_eligible: false,
      summary_24h: {
        total: Number(shadowSummary?.total ?? 0),
        long_hints: Number(shadowSummary?.long_hints ?? 0),
        short_hints: Number(shadowSummary?.short_hints ?? 0),
        neutral_hints: Number(shadowSummary?.neutral_hints ?? 0),
        insufficient: Number(shadowSummary?.insufficient ?? 0),
        actual_decisions_generated:
          Number(shadowSummary?.actual_decisions_generated ?? 0),
        validated: Number(shadowSummary?.validated ?? 0),
        telegram_started:
          Number(shadowSummary?.telegram_started ?? 0),
      },
      recent: shadowRecent,
      safety: {
        probability_is_live: false,
        signal_is_live: false,
        telegram_wired: false,
      },
    };
  } catch (error) {
    base.shadow_decision_journal = {
      table_available: false,
      retention_days: 7,
      error: String(error?.message || error).slice(0, 600),
      safety: {
        probability_is_live: false,
        signal_is_live: false,
        telegram_wired: false,
      },
    };
  }


  try {
    const outcomeSummary =
      await env.DATA_DB
        .prepare(`
          SELECT
            COUNT(*) AS total_rows,
            COUNT(DISTINCT shadow_id) AS unique_shadow_signals,
            SUM(CASE WHEN status = 'CLOSED_FACTUAL' THEN 1 ELSE 0 END) AS closed_factual,
            SUM(CASE WHEN status = 'INSUFFICIENT_FACTUAL_HISTORY' THEN 1 ELSE 0 END) AS insufficient,
            SUM(CASE WHEN direction_correct = 1 THEN 1 ELSE 0 END) AS direction_correct_rows,
            SUM(CASE WHEN horizon_hours = 1 AND status = 'CLOSED_FACTUAL' THEN 1 ELSE 0 END) AS h1_closed,
            SUM(CASE WHEN horizon_hours = 4 AND status = 'CLOSED_FACTUAL' THEN 1 ELSE 0 END) AS h4_closed,
            SUM(CASE WHEN horizon_hours = 12 AND status = 'CLOSED_FACTUAL' THEN 1 ELSE 0 END) AS h12_closed,
            SUM(CASE WHEN horizon_hours = 24 AND status = 'CLOSED_FACTUAL' THEN 1 ELSE 0 END) AS h24_closed
          FROM shadow_outcome_log
        `)
        .first();

    const outcomeState =
      await env.DATA_DB
        .prepare(`
          SELECT
            last_sweep_ts, source_signals_seen, signals_archived,
            candidates_seen, tasks_due, tasks_processed,
            closed_written, insufficient_written, last_status, last_error
          FROM shadow_outcome_state
          WHERE state_key = 'main'
        `)
        .first();

    const outcomeRecentResult =
      await env.DATA_DB
        .prepare(`
          SELECT
            shadow_id, contract_code, observed_ts, rules_version,
            outcome_rules_version, direction_hint, dc_long, dc_short,
            eq_status, dq_status, stage, horizon_hours, target_ts,
            reference_scan_ts, reference_price, reference_offset_sec,
            outcome_scan_ts, outcome_price, target_offset_sec,
            raw_return_pct, directional_return_pct,
            mfe_directional_pct_snapshot, mae_directional_pct_snapshot,
            direction_correct, path_points, expected_points, path_coverage_pct,
            status, reason, source, interpolation_used, calibration_only,
            live_promotion_allowed, automatic_weight_tuning_enabled, computed_ts
          FROM shadow_outcome_log
          ORDER BY computed_ts DESC
          LIMIT 20
        `)
        .all();

    const outcomeRecent =
      Array.isArray(outcomeRecentResult?.results)
        ? outcomeRecentResult.results.map((row) => ({
            ...row,
            direction_correct:
              row?.direction_correct === null || row?.direction_correct === undefined
                ? null
                : Number(row.direction_correct) === 1,
            interpolation_used: Number(row?.interpolation_used) === 1,
            calibration_only: Number(row?.calibration_only) === 1,
            live_promotion_allowed: Number(row?.live_promotion_allowed) === 1,
            automatic_weight_tuning_enabled:
              Number(row?.automatic_weight_tuning_enabled) === 1,
          }))
        : [];

    base.shadow_outcome_calibration = {
      table_available: true,
      state_available: Boolean(outcomeState),
      mode: "CALIBRATION_ONLY_NO_LIVE_PROMOTION",
      outcome_rules_version: "shadow-outcome-v1",
      horizons_hours: [1, 4, 12, 24],
      source: "STAGE0_COMPACT_FACTUAL_5M_SNAPSHOTS",
      interpolation_used: false,
      snapshot_extrema_note:
        "MFE/MAE use factual persisted ~5m Stage-0 snapshots, not intrabar candle highs/lows.",
      retention_days: 180,
      automatic_weight_tuning_enabled: false,
      live_promotion_allowed: false,
      summary: {
        total_rows: Number(outcomeSummary?.total_rows ?? 0),
        unique_shadow_signals: Number(outcomeSummary?.unique_shadow_signals ?? 0),
        closed_factual: Number(outcomeSummary?.closed_factual ?? 0),
        insufficient: Number(outcomeSummary?.insufficient ?? 0),
        direction_correct_rows: Number(outcomeSummary?.direction_correct_rows ?? 0),
        h1_closed: Number(outcomeSummary?.h1_closed ?? 0),
        h4_closed: Number(outcomeSummary?.h4_closed ?? 0),
        h12_closed: Number(outcomeSummary?.h12_closed ?? 0),
        h24_closed: Number(outcomeSummary?.h24_closed ?? 0),
      },
      last_sweep: outcomeState
        ? {
            last_sweep_ts: Number(outcomeState?.last_sweep_ts) || null,
            last_sweep_age_sec:
              Number.isFinite(Number(outcomeState?.last_sweep_ts))
                ? Math.max(0, now - Number(outcomeState.last_sweep_ts)) / 1000
                : null,
            source_signals_seen: Number(outcomeState?.source_signals_seen ?? 0),
            signals_archived: Number(outcomeState?.signals_archived ?? 0),
            candidates_seen: Number(outcomeState?.candidates_seen ?? 0),
            tasks_due: Number(outcomeState?.tasks_due ?? 0),
            tasks_processed: Number(outcomeState?.tasks_processed ?? 0),
            closed_written: Number(outcomeState?.closed_written ?? 0),
            insufficient_written: Number(outcomeState?.insufficient_written ?? 0),
            status: outcomeState?.last_status || null,
            error: outcomeState?.last_error || null,
          }
        : null,
      recent: outcomeRecent,
      safety: {
        changes_strategy_weights: false,
        promotes_live_signal: false,
        triggers_telegram: false,
        permits_execution: false,
      },
    };
  } catch (error) {
    base.shadow_outcome_calibration = {
      table_available: false,
      state_available: false,
      mode: "CALIBRATION_ONLY_NO_LIVE_PROMOTION",
      automatic_weight_tuning_enabled: false,
      live_promotion_allowed: false,
      error: String(error?.message || error).slice(0, 600),
    };
  }


  try {
    const fullEvidenceSince =
      now - 24 * 60 * 60 * 1000;

    const fullEvidenceSummary =
      await env.DATA_DB
        .prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN htx_execution_gate_closed = 1 THEN 1 ELSE 0 END) AS htx_gate_closed,
            SUM(CASE WHEN dq_status = 'CLOSED' THEN 1 ELSE 0 END) AS dq_closed,
            SUM(CASE WHEN dq_status = 'PARTIAL' THEN 1 ELSE 0 END) AS dq_partial,
            SUM(CASE WHEN full_dc_long IS NOT NULL THEN 1 ELSE 0 END) AS nonnull_dc_long,
            SUM(CASE WHEN full_dc_short IS NOT NULL THEN 1 ELSE 0 END) AS nonnull_dc_short,
            SUM(CASE WHEN live_probability IS NOT NULL THEN 1 ELSE 0 END) AS nonnull_live_probability,
            SUM(full_decision_eligible) AS full_decision_eligible,
            SUM(live_signal) AS live_signals,
            SUM(validated) AS validated,
            SUM(telegram_started) AS telegram_started,
            SUM(trading_execution) AS trading_execution,
            SUM(strategy_weights_changed) AS strategy_weights_changed,
            SUM(automatic_weight_tuning_enabled) AS automatic_weight_tuning_enabled
          FROM full_evidence_shadow_log
          WHERE observed_ts >= ?1
        `)
        .bind(fullEvidenceSince)
        .first();

    const fullEvidenceRecentResult =
      await env.DATA_DB
        .prepare(`
          SELECT
            full_evidence_id, shadow_id, contract_code, observed_ts,
            rules_version, contract_version, adapters_version, mode,
            fixed_weights_json, htx_execution_gate_closed, dq_status,
            dq_usable_items, dq_total_items, dq_independent_groups,
            dq_observed_weight_pct, uncertainty_count,
            missing_weighted_chains_json, chain_status_json,
            conflicts_json, alias_verification_json, evidence_compact_json,
            relative_strength_json, prior_htx_shadow_json,
            full_dc_long, full_dc_short, live_probability,
            full_decision_eligible, live_signal, validated,
            telegram_started, trading_execution,
            strategy_weights_changed, automatic_weight_tuning_enabled,
            missing_data_coerced_to_zero,
            cross_venue_dispersion_called_conflict,
            shadow_only, retention_days, persisted_ts
          FROM full_evidence_shadow_log
          ORDER BY observed_ts DESC
          LIMIT 5
        `)
        .all();

    const parseFullEvidenceJson = (value, fallback) => {
      try {
        return JSON.parse(value || JSON.stringify(fallback));
      } catch {
        return fallback;
      }
    };

    const fullEvidenceRecent =
      Array.isArray(fullEvidenceRecentResult?.results)
        ? fullEvidenceRecentResult.results.map((row) => ({
            full_evidence_id: row?.full_evidence_id || null,
            shadow_id: row?.shadow_id || null,
            contract: row?.contract_code || null,
            observed_ts: Number(row?.observed_ts) || null,
            observed_age_sec:
              Number.isFinite(Number(row?.observed_ts))
                ? Math.max(0, now - Number(row.observed_ts)) / 1000
                : null,
            rules_version: row?.rules_version || null,
            contract_version: row?.contract_version || null,
            adapters_version: row?.adapters_version || null,
            mode: row?.mode || null,
            fixed_decision_weights:
              parseFullEvidenceJson(row?.fixed_weights_json, {}),
            htx_execution_gate_closed:
              Number(row?.htx_execution_gate_closed) === 1,
            data_quality: {
              status: row?.dq_status || null,
              usable_items: Number(row?.dq_usable_items ?? 0),
              total_items: Number(row?.dq_total_items ?? 0),
              independent_groups: Number(row?.dq_independent_groups ?? 0),
              observed_weight_pct:
                row?.dq_observed_weight_pct === null || row?.dq_observed_weight_pct === undefined
                  ? null
                  : Number(row.dq_observed_weight_pct),
              uncertainty_count: Number(row?.uncertainty_count ?? 0),
            },
            missing_weighted_chains:
              parseFullEvidenceJson(row?.missing_weighted_chains_json, []),
            chain_status:
              parseFullEvidenceJson(row?.chain_status_json, {}),
            conflicts:
              parseFullEvidenceJson(row?.conflicts_json, []),
            alias_verification:
              parseFullEvidenceJson(row?.alias_verification_json, {}),
            evidence_compact:
              parseFullEvidenceJson(row?.evidence_compact_json, []),
            detail:
              parseFullEvidenceJson(row?.relative_strength_json, {}),
            prior_htx_shadow:
              parseFullEvidenceJson(row?.prior_htx_shadow_json, {}),
            decision: {
              dc_long: row?.full_dc_long ?? null,
              dc_short: row?.full_dc_short ?? null,
              live_probability: row?.live_probability ?? null,
              full_decision_eligible: Number(row?.full_decision_eligible) === 1,
              live_signal: Number(row?.live_signal) === 1,
              validated: Number(row?.validated) === 1,
              telegram_started: Number(row?.telegram_started) === 1,
              trading_execution: Number(row?.trading_execution) === 1,
            },
            safety: {
              strategy_weights_changed:
                Number(row?.strategy_weights_changed) === 1,
              automatic_weight_tuning_enabled:
                Number(row?.automatic_weight_tuning_enabled) === 1,
              missing_data_coerced_to_zero:
                Number(row?.missing_data_coerced_to_zero) === 1,
              cross_venue_dispersion_called_conflict:
                Number(row?.cross_venue_dispersion_called_conflict) === 1,
              shadow_only: Number(row?.shadow_only) === 1,
              retention_days: Number(row?.retention_days ?? 0),
            },
          }))
        : [];

    base.full_evidence_shadow = {
      table_available: true,
      mode: "FULL_EVIDENCE_SHADOW_NO_EXECUTION",
      rules_version: "full-evidence-shadow-v1",
      contract_version: "full-evidence-v1",
      adapters_version: "public-evidence-adapters-v1",
      fixed_decision_weights: {
        CROSS_EXCHANGE_DERIVATIVES: 35,
        MARKET_STRENGTH_SPOT: 30,
        SMART_MONEY_ONCHAIN: 20,
        SUPPORTING_RISK: 15,
      },
      full_dc_promoted: false,
      full_decision_eligible: false,
      live_probability_generated: false,
      live_signal_generated: false,
      validated: false,
      telegram_started: false,
      trading_execution: false,
      automatic_weight_tuning_enabled: false,
      retention_days: 180,
      summary_24h: {
        total: Number(fullEvidenceSummary?.total ?? 0),
        htx_gate_closed: Number(fullEvidenceSummary?.htx_gate_closed ?? 0),
        dq_closed: Number(fullEvidenceSummary?.dq_closed ?? 0),
        dq_partial: Number(fullEvidenceSummary?.dq_partial ?? 0),
        nonnull_dc_long: Number(fullEvidenceSummary?.nonnull_dc_long ?? 0),
        nonnull_dc_short: Number(fullEvidenceSummary?.nonnull_dc_short ?? 0),
        nonnull_live_probability: Number(fullEvidenceSummary?.nonnull_live_probability ?? 0),
        full_decision_eligible: Number(fullEvidenceSummary?.full_decision_eligible ?? 0),
        live_signals: Number(fullEvidenceSummary?.live_signals ?? 0),
        validated: Number(fullEvidenceSummary?.validated ?? 0),
        telegram_started: Number(fullEvidenceSummary?.telegram_started ?? 0),
        trading_execution: Number(fullEvidenceSummary?.trading_execution ?? 0),
        strategy_weights_changed: Number(fullEvidenceSummary?.strategy_weights_changed ?? 0),
        automatic_weight_tuning_enabled: Number(fullEvidenceSummary?.automatic_weight_tuning_enabled ?? 0),
      },
      recent: fullEvidenceRecent,
      safety: {
        missing_data_is_directional_penalty: false,
        changes_strategy_weights: false,
        promotes_live_probability: false,
        promotes_live_signal: false,
        validates_signal: false,
        triggers_telegram: false,
        permits_execution: false,
      },
    };
  } catch (error) {
    base.full_evidence_shadow = {
      table_available: false,
      mode: "FULL_EVIDENCE_SHADOW_NO_EXECUTION",
      full_dc_promoted: false,
      full_decision_eligible: false,
      live_probability_generated: false,
      live_signal_generated: false,
      validated: false,
      telegram_started: false,
      trading_execution: false,
      automatic_weight_tuning_enabled: false,
      error: String(error?.message || error).slice(0, 600),
    };
  }

  try {
    base.cross_venue_liquidation_intelligence =
      await LIQUIDATION_INTELLIGENCE_API.dataPlaneSummary(env, now);
  } catch (error) {
    base.cross_venue_liquidation_intelligence = {
      table_available: false,
      mode: "LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION",
      shadow_only: true,
      live_probability_generated: false,
      live_signal_generated: false,
      validated_signal_generated: false,
      telegram_started: false,
      trading_execution: false,
      automatic_weight_tuning_enabled: false,
      guaranteed_tp_generated: false,
      synthetic_leverage_heatmap_generated: false,
      error: String(error?.message || error).slice(0, 600),
    };
  }

  try {
    base.fast_move_watch =
      await fastMoveWatchDataPlaneSummary(env, now);
  } catch (error) {
    base.fast_move_watch = {
      table_available: false,
      version: FAST_MOVE_WATCH_VERSION,
      status: "PARTIAL_FAIL_CLOSED",
      mode: "FAST_MOVE_WATCH_SHADOW_NO_EXECUTION",
      scheduler_priority_is_probability: false,
      live_probability_generated: false,
      live_signal_generated: false,
      validated_signal_generated: false,
      telegram_started: false,
      trading_execution: false,
      automatic_weight_tuning_enabled: false,
      shadow_only: true,
      error: String(error?.message || error).slice(0, 600),
    };
  }

  try {
    base.opportunity_intelligence_shadow =
      await opportunityDataPlaneSummary(
        env,
        now
      );
  } catch (error) {
    base.opportunity_intelligence_shadow = {
      table_available: false,
      version:
        OPPORTUNITY_VERSION,
      status:
        "PARTIAL_FAIL_CLOSED",
      mode:
        "OPPORTUNITY_INTELLIGENCE_SHADOW_NO_EXECUTION",
      live_probability:
        null,
      live_signal:
        false,
      validated_signal:
        false,
      decision_layer_changed:
        false,
      strategy_weights_changed:
        false,
      telegram_started:
        false,
      trading_execution:
        false,
      automatic_weight_tuning:
        false,
      shadow_only:
        true,
      error:
        String(
          error?.message ||
          error
        ).slice(0, 600),
    };
  }

  try {
    base.multi_wave_campaign_shadow =
      await multiWaveCampaignDataPlaneSummary(env, now);
  } catch (error) {
    base.multi_wave_campaign_shadow = {
      table_available: false,
      version: MULTI_WAVE_VERSION,
      status: "PARTIAL_FAIL_CLOSED",
      mode: "MULTI_WAVE_CAMPAIGN_SHADOW_NO_EXECUTION",
      live_probability: null,
      live_signal: false,
      validated_signal: false,
      decision_layer_changed: false,
      strategy_weights_changed: false,
      telegram_started: false,
      trading_execution: false,
      automatic_weight_tuning: false,
      shadow_only: true,
      error: String(error?.message || error).slice(0, 600),
    };
  }

return base;
}/* =========================================================
   REQUEST ROUTING
   ========================================================= */

async function parseInput(request) {
  const url = new URL(request.url);
  let body = {};

  if (request.method === "POST") {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  return {
    url,
    params: {
      ...Object.fromEntries(
        url.searchParams.entries()
      ),
      ...(body &&
      typeof body === "object"
        ? body
        : {}),
    },
  };
}


async function sendTelegramMessage(env, text) {
  const botToken = String(env?.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env?.TELEGRAM_CHAT_ID || "").trim();
  const message = String(text ?? "").trim();

  if (!botToken || !chatId) {
    return {
      ok: false,
      status: "NOT_CONFIGURED",
      error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing",
      timestamp_utc: new Date().toISOString(),
    };
  }

  if (!message) {
    return {
      ok: false,
      status: "INVALID_MESSAGE",
      error: "Telegram message is empty",
      timestamp_utc: new Date().toISOString(),
    };
  }

  if (message.length > 4096) {
    return {
      ok: false,
      status: "MESSAGE_TOO_LONG",
      error: "Telegram text exceeds 4096 characters",
      timestamp_utc: new Date().toISOString(),
    };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true,
        }),
      }
    );

    let payload = null;

    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    const ok = response.ok && payload?.ok === true;

    return {
      ok,
      status: ok ? "SENT" : "TELEGRAM_ERROR",
      http_status: response.status,
      telegram_description: payload?.description ?? null,
      message_id: payload?.result?.message_id ?? null,
      timestamp_utc: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      status: "NETWORK_ERROR",
      error: String(error?.message || error),
      timestamp_utc: new Date().toISOString(),
    };
  }
}



/* MY_REPORT_2_SHADOW_DECISION_MODEL_INLINE_V1 — embedded to preserve data: URL test compatibility. */
const buildShadowDecisionTelemetry = (() => {
  const RULES_VERSION = "shadow-dc-eq-dq-v1.3-funding-context-only";

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round2(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  function unwrap(result) {
    if (!result || typeof result !== "object") return {};
    if (result.status === "fulfilled" && result.data && typeof result.data === "object") {
      return result.data;
    }
    if (result.data && typeof result.data === "object" && result.status !== "rejected") {
      return result.data;
    }
    return result;
  }

  function upper(value) {
    return String(value ?? "").trim().toUpperCase();
  }

  function closed(value) {
    return String(value ?? "").trim().toLowerCase() === "closed";
  }

  function verifiedCvdQuality(flow) {
    const quality = flow?.cvd_delta_quality;
    return Boolean(
      flow?.cvd_delta_reliable === true &&
      quality?.status === "COMPLETE" &&
      quality?.reliable === true &&
      quality?.trade_count_exact_match === true &&
      quality?.raw_record_integrity_complete === true &&
      quality?.record_integrity?.complete === true
    );
  }

  function extractSpotDelta(spotData) {
    const candidates = [
      spotData?.order_flow?.windows?.["1h"],
      spotData?.windows?.["1h"]?.order_flow,
      spotData?.flow_windows?.["1h"],
    ];
    for (const flow of candidates) {
      if (!verifiedCvdQuality(flow)) continue;
      const n = finite(
        flow?.factual_cvd?.delta_pct_of_turnover ??
        flow?.delta_pct_of_turnover
      );
      if (n !== null) return n;
    }
    return null;
  }

  function extractReliableFuturesDelta(window) {
    const flow = window?.order_flow;
    return verifiedCvdQuality(flow) ? finite(flow?.delta_pct_of_turnover) : null;
  }

  function extractFundingPct(futuresData) {
    const direct = finite(futuresData?.funding?.funding_rate_pct ?? futuresData?.htx_funding?.funding_rate_pct);
    if (direct !== null) return direct;
    const rate = finite(futuresData?.funding?.funding_rate ?? futuresData?.htx_funding?.funding_rate);
    return rate === null ? null : rate * 100;
  }

  function extractOiChange(window) {
    return finite(
      window?.open_interest?.contracts?.change_pct ??
        window?.open_interest?.value_usdt?.change_pct ??
        window?.open_interest?.change_pct
    );
  }

  function addSignedFeature(state, label, rawValue, normalizer, weight, invert = false) {
    const value = finite(rawValue);
    if (value === null) {
      state.features[label] = { available: false, value: null, weight };
      return;
    }
    const signed = invert ? -value : value;
    const intensity = clamp(Math.abs(signed) / normalizer, 0, 1);
    const contribution = weight * intensity;
    state.availableWeight += weight;
    if (signed > 0) state.longSupport += contribution;
    if (signed < 0) state.shortSupport += contribution;
    state.features[label] = {
      available: true,
      value: round2(value),
      normalizer,
      weight,
      intensity: round2(intensity),
      contribution_long: signed > 0 ? round2(contribution) : 0,
      contribution_short: signed < 0 ? round2(contribution) : 0,
      interpretation: invert ? "contrarian_sign_only" : "directional_sign_only",
    };
  }

  function buildShadowDecisionTelemetry({
    contract,
    now = Date.now(),
    futures,
    spot,
    trajectory,
    history,
    dataSufficiency,
  } = {}) {
    const futuresData = unwrap(futures);
    const spotData = unwrap(spot);
    const trajectoryData = unwrap(trajectory);
    const historyData = unwrap(history);
    const windows = trajectoryData?.windows || {};
    const futureCoverage = futuresData?.coverage || {};
    const trajectoryCoverage = trajectoryData?.coverage || {};
    const spotQuality = upper(spotData?.quality_status || "UNKNOWN");

    const state = {
      longSupport: 0,
      shortSupport: 0,
      availableWeight: 0,
      features: {},
    };

    addSignedFeature(state, "price_1h_pct", windows?.["1h"]?.price?.change_pct, 2, 16);
    addSignedFeature(state, "price_4h_pct", windows?.["4h"]?.price?.change_pct, 5, 12);
    addSignedFeature(state, "price_24h_pct", windows?.["24h"]?.price?.change_pct, 12, 6);
    addSignedFeature(state, "futures_flow_1h_delta_pct", extractReliableFuturesDelta(windows?.["1h"]), 20, 14);
    addSignedFeature(state, "futures_flow_4h_delta_pct", extractReliableFuturesDelta(windows?.["4h"]), 20, 10);
    addSignedFeature(state, "spot_flow_delta_pct", extractSpotDelta(spotData), 20, 10);
    const fundingContext = extractFundingPct(futuresData);
    state.features.funding_pct_contrarian = fundingContext === null
      ? { available: false, value: null, weight: 0, interpretation: "context_only_not_directional" }
      : {
          available: true,
          value: round2(fundingContext),
          normalizer: null,
          weight: 0,
          intensity: null,
          contribution_long: 0,
          contribution_short: 0,
          interpretation: "context_only_not_directional",
        };

    const dcLong = state.availableWeight > 0
      ? (state.longSupport / state.availableWeight) * 100
      : null;
    const dcShort = state.availableWeight > 0
      ? (state.shortSupport / state.availableWeight) * 100
      : null;

    const sampleCoverageValue =
      futureCoverage?.htx_futures_order_flow_sample;
    const sampleCoverageForExecution =
      sampleCoverageValue === null || sampleCoverageValue === undefined
        ? futureCoverage?.htx_futures_order_flow
        : sampleCoverageValue;
    const executionFutureChecks = [
      ["htx_futures_liquidity", closed(futureCoverage?.htx_futures_liquidity)],
      ["htx_futures_order_flow_sample", closed(sampleCoverageForExecution)],
      ["htx_open_interest", closed(futureCoverage?.htx_open_interest)],
      ["htx_funding", closed(futureCoverage?.htx_funding)],
    ];
    const directionalFutureKeys = [
      "htx_futures_order_flow",
    ];
    const coreTrajectoryKeys = [
      "price_1h",
      "price_4h",
      "oi_1h",
      "oi_4h",
      "funding_current",
      "funding_history",
    ];
    const extendedTrajectoryKeys = ["flow_1h", "flow_4h", "flow_24h", "price_24h", "oi_24h"];
    const coverageChecks = [
      ...executionFutureChecks.map(([key, ok]) => ["futures." + key, ok]),
      ...directionalFutureKeys.map((key) => ["futures." + key, closed(futureCoverage?.[key])]),
      ...coreTrajectoryKeys.map((key) => ["trajectory." + key, closed(trajectoryCoverage?.[key])]),
      ...extendedTrajectoryKeys.map((key) => ["trajectory." + key, closed(trajectoryCoverage?.[key])]),
      ["spot.quality_GREEN", spotQuality === "GREEN"],
    ];
    const closedCount = coverageChecks.filter(([, ok]) => ok).length;
    const htxCoveragePct = coverageChecks.length ? (closedCount / coverageChecks.length) * 100 : 0;

    const sufficiency = upper(
      dataSufficiency?.classification ??
        dataSufficiency?.core_classification ??
        dataSufficiency?.overall ??
        dataSufficiency?.status ??
        dataSufficiency?.data_sufficiency ??
        "UNKNOWN"
    );
    const coreFuturesClosed = executionFutureChecks.every(([, ok]) => ok);
    const coreTrajectoryClosed = coreTrajectoryKeys.every((key) => closed(trajectoryCoverage?.[key]));
    const coreFlowClosed = closed(trajectoryCoverage?.flow_1h) && closed(trajectoryCoverage?.flow_4h);

    let dqStatus = "PARTIAL";
    if (sufficiency === "INSUFFICIENT" || !coreFuturesClosed || !coreTrajectoryClosed) {
      dqStatus = "INSUFFICIENT";
    } else if (spotQuality === "GREEN" && coreFlowClosed) {
      dqStatus = "HTX_CLOSED_EXTERNAL_CHAINS_MISSING";
    }

    const liquidityClosed = closed(futureCoverage?.htx_futures_liquidity);
    const tradesSampleClosed = closed(sampleCoverageForExecution);
    const timingMeasurable = closed(trajectoryCoverage?.price_5m) && closed(trajectoryCoverage?.price_15m);

    const spreadBps = finite(futuresData?.liquidity?.spread_bps ?? futuresData?.bbo?.spread_bps);
    const buyImpactBps = finite(futuresData?.liquidity?.buy_market_impact?.impact_bps);
    const sellImpactBps = finite(futuresData?.liquidity?.sell_market_impact?.impact_bps);
    const buyFillPct = finite(futuresData?.liquidity?.buy_market_impact?.fill_ratio_pct);
    const sellFillPct = finite(futuresData?.liquidity?.sell_market_impact?.fill_ratio_pct);
    const htxExecutionGateClosed = Boolean(
      coreFuturesClosed &&
      liquidityClosed &&
      tradesSampleClosed &&
      spreadBps !== null &&
      buyImpactBps !== null &&
      sellImpactBps !== null &&
      buyFillPct !== null && buyFillPct >= 99.9 &&
      sellFillPct !== null && sellFillPct >= 99.9
    );
    const eqStatus = htxExecutionGateClosed && timingMeasurable ? "SHADOW_MEASURABLE" : "NOT_CLOSED";

    let directionHint = "NEUTRAL";
    if (dcLong !== null && dcShort !== null) {
      if (dcLong - dcShort >= 10) directionHint = "LONG";
      if (dcShort - dcLong >= 10) directionHint = "SHORT";
    }

    const stage = dqStatus === "INSUFFICIENT"
      ? "OBSERVE_DATA_INSUFFICIENT"
      : directionHint === "LONG"
        ? "SHADOW_OBSERVE_LONG_BIAS"
        : directionHint === "SHORT"
          ? "SHADOW_OBSERVE_SHORT_BIAS"
          : "SHADOW_OBSERVE_NEUTRAL";

    const requiredMissingChains = [
      "cross_exchange_derivatives",
      "btc_eth_and_sector_relative_strength",
      "smart_money_onchain",
      "supporting_risk_supply_social_fundamentals",
      "external_market_regime_timing",
      "portfolio_risk_if_positions_known",
    ];

    const observedTs = finite(now) ?? Date.now();
    const contractCode = String(contract || futuresData?.contract || trajectoryData?.contract || "").trim();
    const evidenceFlags = {
      funding_pct: round2(extractFundingPct(futuresData)),
      funding_interval_hours: round2(trajectoryData?.funding?.derived_settlement_interval_hours),
      price_1h_pct: round2(windows?.["1h"]?.price?.change_pct),
      price_4h_pct: round2(windows?.["4h"]?.price?.change_pct),
      price_24h_pct: round2(windows?.["24h"]?.price?.change_pct),
      futures_flow_1h_delta_pct: round2(extractReliableFuturesDelta(windows?.["1h"])),
      futures_flow_4h_delta_pct: round2(extractReliableFuturesDelta(windows?.["4h"])),
      spot_flow_delta_pct: round2(extractSpotDelta(spotData)),
      oi_1h_change_pct: round2(extractOiChange(windows?.["1h"])),
      oi_4h_change_pct: round2(extractOiChange(windows?.["4h"])),
      absorption_1h: windows?.["1h"]?.derived?.absorption_candidate?.value ?? null,
      absorption_4h: windows?.["4h"]?.derived?.absorption_candidate?.value ?? null,
      spot_quality: spotQuality,
      stage0_history_available: Boolean(historyData && Object.keys(historyData).length),
      htx_coverage_pct: round2(htxCoveragePct),
    };

    return {
      shadow_id: `${observedTs}:${contractCode || "UNKNOWN"}`,
      contract: contractCode,
      observed_ts: observedTs,
      observed_time_utc: new Date(observedTs).toISOString(),
      source: "DEEP_CHECK_INPUT",
      mode: "SHADOW_ONLY_NO_EXECUTION",
      rules_version: RULES_VERSION,
      calibrated: false,
      probability: null,
      score_semantics:
        "dc_shadow_* are uncalibrated HTX-only directional evidence-support proxies, NOT proven win probabilities and NOT live trading scores.",
      dc_shadow_long: round2(dcLong),
      dc_shadow_short: round2(dcShort),
      direction_hint: directionHint,
      direction_hint_semantics: "Calibration-only heuristic; never authorizes an entry or alert.",
      htx_execution_gate_closed: htxExecutionGateClosed,
      htx_execution_gate_semantics:
        "Factual HTX execution-data closure only: contract/liquidity/recent-trade sample/OI/funding plus full requested-notional fill are measurable. Exact-window CVD remains a separate directional-data-quality lane and is never synthesized. This flag alone never authorizes a trade.",
      eq: {
        status: eqStatus,
        score: null,
        calibrated: false,
        spread_bps: round2(spreadBps),
        buy_impact_bps: round2(buyImpactBps),
        sell_impact_bps: round2(sellImpactBps),
        buy_fill_ratio_pct: round2(buyFillPct),
        sell_fill_ratio_pct: round2(sellFillPct),
        recent_trades_sample_closed: tradesSampleClosed,
        exact_window_cvd_closed: closed(futureCoverage?.htx_futures_order_flow),
        price_5m_closed: closed(trajectoryCoverage?.price_5m),
        price_15m_closed: closed(trajectoryCoverage?.price_15m),
        note: "No good/bad execution threshold is promoted before calibration; raw execution telemetry is retained.",
      },
      dq: {
        status: dqStatus,
        full_score: null,
        htx_coverage_pct: round2(htxCoveragePct),
        htx_checks_closed: closedCount,
        htx_checks_total: coverageChecks.length,
        spot_quality: spotQuality,
        full_decision_sufficient: false,
        note: "HTX data quality can be measured, but full Decision Layer DQ cannot close while required external chains are absent from this Worker.",
      },
      stage,
      data_sufficiency: sufficiency || "UNKNOWN",
      required_missing_chains: requiredMissingChains,
      full_decision_eligible: false,
      actual_decision_generated: false,
      validated: false,
      telegram_started: false,
      live_execution_allowed: false,
      evidence_flags: evidenceFlags,
      feature_contributions: state.features,
      safety: {
        strategy_weights_changed: false,
        hard_veto_promoted: false,
        missing_data_coerced_to_zero: false,
        live_probability_generated: false,
        live_signal_generated: false,
        telegram_dispatch_allowed: false,
      },
      notes: [
        "Long and Short are evaluated separately as shadow telemetry.",
        "No 35/30/20/15 full Decision Layer score is claimed because Chain 2/4/5 and broader relative-strength/regime context are not all present in this Worker.",
        "The 10-point direction-hint margin and feature normalizers are calibration-only heuristics, not promoted trading thresholds.",
        "This record exists to accumulate counterfactual evidence before any live decision or Telegram wiring is permitted.",
      ],
    };
  }

  return buildShadowDecisionTelemetry;
})();


/* =========================================================
   MY_REPORT_2_SHADOW_DECISION_LAYER_V1
   Shadow-only calibration telemetry. No live decision, no
   validation, no Telegram dispatch and no trade execution.
   ========================================================= */
async function persistShadowDecisionTelemetry(env, shadow) {
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
      reason: "D1 binding DATA_DB is not configured",
    };
  }

  const contractCode = String(shadow?.contract || "").trim();
  const observedTs = Number(shadow?.observed_ts);
  if (!contractCode || !Number.isFinite(observedTs)) {
    return {
      status: "INVALID_INPUT",
      reason: "contract and observed_ts are required",
    };
  }

  const shadowId = String(
    shadow?.shadow_id || `${observedTs}:${contractCode}`
  );
  const retentionBefore = observedTs - 7 * 24 * 60 * 60 * 1000;

  try {
    const results = await env.DATA_DB.batch([
      env.DATA_DB
        .prepare(`
          INSERT OR REPLACE INTO shadow_decision_log
          (
            shadow_id,
            contract_code,
            observed_ts,
            rules_version,
            source,
            mode,
            direction_hint,
            dc_long,
            dc_short,
            eq_status,
            dq_status,
            stage,
            data_sufficiency,
            missing_chains_json,
            evidence_flags_json,
            calibrated,
            full_decision_eligible,
            actual_decision_generated,
            validated,
            telegram_started,
            created_ts
          )
          VALUES
          (
            ?1, ?2, ?3, ?4, ?5,
            ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15,
            0, 0, 0, 0, 0, ?16
          )
        `)
        .bind(
          shadowId,
          contractCode,
          observedTs,
          String(shadow?.rules_version || "shadow-unknown").slice(0, 120),
          String(shadow?.source || "DEEP_CHECK_INPUT").slice(0, 80),
          String(shadow?.mode || "SHADOW_ONLY_NO_EXECUTION").slice(0, 80),
          String(shadow?.direction_hint || "NEUTRAL").slice(0, 24),
          Number.isFinite(Number(shadow?.dc_shadow_long))
            ? Number(shadow.dc_shadow_long)
            : null,
          Number.isFinite(Number(shadow?.dc_shadow_short))
            ? Number(shadow.dc_shadow_short)
            : null,
          String(shadow?.eq?.status || "NOT_CLOSED").slice(0, 80),
          String(shadow?.dq?.status || "INSUFFICIENT").slice(0, 80),
          String(shadow?.stage || "SHADOW_OBSERVE").slice(0, 100),
          String(shadow?.data_sufficiency || "UNKNOWN").slice(0, 80),
          JSON.stringify(
            Array.isArray(shadow?.required_missing_chains)
              ? shadow.required_missing_chains.slice(0, 40)
              : []
          ).slice(0, 8000),
          JSON.stringify(shadow?.evidence_flags || {}).slice(0, 12000),
          observedTs
        ),
      env.DATA_DB
        .prepare(`
          DELETE FROM shadow_decision_log
          WHERE observed_ts < ?1
        `)
        .bind(retentionBefore),
    ]);

    return {
      status: "CLOSED",
      shadow_id: shadowId,
      insert_changes: Number(results?.[0]?.meta?.changes ?? 0),
      retention_rows_deleted: Number(results?.[1]?.meta?.changes ?? 0),
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      error: String(error?.message || error).slice(0, 600),
    };
  }
}

/* MY_REPORT_2_PUBLIC_EVIDENCE_ADAPTERS_INLINE_V1 — embedded to preserve data:-URL test compatibility. */
const collectPublicFullEvidence = (() => {
  const PUBLIC_EVIDENCE_ADAPTERS_VERSION = "public-evidence-adapters-v1";

  const HOUR_MS = 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 6500;

  function finiteOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function nfcUpper(value) {
    return text(value).normalize("NFC").toUpperCase();
  }

  function asciiOnly(value) {
    return /^[\x20-\x7E]+$/.test(String(value || ""));
  }

  function pctChange(from, to) {
    const a = finiteOrNull(from);
    const b = finiteOrNull(to);
    if (a === null || b === null || a === 0) return null;
    return ((b / a) - 1) * 100;
  }

  function safeMedian(values) {
    const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length) return null;
    const m = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  }

  function parseHtxUsdtContract(contractCode) {
    const exact = text(contractCode).normalize("NFC");
    const m = exact.match(/^(.+)-USDT$/u);
    if (!m) {
      return {
        ok: false,
        contract_code: exact || null,
        base: null,
        quote: null,
        ascii_base: false,
        reason: "NOT_USDT_CONTRACT_SHAPE",
      };
    }
    const base = m[1];
    return {
      ok: Boolean(base),
      contract_code: exact,
      base,
      quote: "USDT",
      ascii_base: asciiOnly(base),
      reason: base ? null : "EMPTY_BASE",
    };
  }

  function candidateVenueAliases(contractCode) {
    const p = parseHtxUsdtContract(contractCode);
    if (!p.ok || !p.ascii_base) {
      return {
        contract_code: p.contract_code,
        alias_candidate_safe: false,
        reason: p.ok ? "NON_ASCII_REQUIRES_VERIFIED_ALIAS" : p.reason,
        bybit: null,
        okx_swap: null,
        okx_spot: null,
        gate_futures: null,
        binance_futures: null,
        binance_spot: null,
      };
    }
    const base = nfcUpper(p.base);
    return {
      contract_code: p.contract_code,
      alias_candidate_safe: true,
      reason: null,
      bybit: `${base}USDT`,
      okx_swap: `${base}-USDT-SWAP`,
      okx_spot: `${base}-USDT`,
      gate_futures: `${base}_USDT`,
      binance_futures: `${base}USDT`,
      binance_spot: `${base}USDT`,
    };
  }

  async function fetchJson(fetchImpl, url, timeoutMs = FETCH_TIMEOUT_MS) {
    const f = fetchImpl || globalThis.fetch;
    if (typeof f !== "function") {
      return { ok: false, status: null, data: null, error: "FETCH_UNAVAILABLE", url };
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await f(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller?.signal,
      });
      const status = Number(response?.status) || null;
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        return { ok: false, status, data: null, error: `JSON_PARSE:${String(error?.message || error)}`.slice(0, 240), url };
      }
      return {
        ok: Boolean(response?.ok),
        status,
        data,
        error: response?.ok ? null : `HTTP_${status ?? "UNKNOWN"}`,
        url,
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        data: null,
        error: String(error?.name === "AbortError" ? "TIMEOUT" : (error?.message || error)).slice(0, 240),
        url,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function bybitApiError(raw) {
    if (!raw?.ok) return raw?.error || "BYBIT_HTTP_ERROR";
    if (Number(raw?.data?.retCode) !== 0) return `BYBIT_API_${raw?.data?.retCode ?? "UNKNOWN"}:${text(raw?.data?.retMsg) || "ERROR"}`;
    return null;
  }

  function okxApiError(raw) {
    if (!raw?.ok) return raw?.error || "OKX_HTTP_ERROR";
    if (text(raw?.data?.code) !== "0") return `OKX_API_${text(raw?.data?.code) || "UNKNOWN"}:${text(raw?.data?.msg) || "ERROR"}`;
    return null;
  }

  function binanceApiError(raw) {
    if (!raw?.ok) return raw?.error || "BINANCE_HTTP_ERROR";
    if (raw?.data && !Array.isArray(raw.data) && raw.data.code !== undefined) {
      return `BINANCE_API_${raw.data.code}:${text(raw.data.msg) || "ERROR"}`;
    }
    return null;
  }

  function gateApiError(raw) {
    if (!raw?.ok) return raw?.error || "GATE_HTTP_ERROR";
    if (raw?.data && !Array.isArray(raw.data) && raw.data.label) {
      return `GATE_API_${text(raw.data.label) || "UNKNOWN"}:${text(raw.data.message) || "ERROR"}`;
    }
    return null;
  }

  function externalEvidenceBase({ contractCode, chain, metric, source, venue, marketType, nowTs, sourceTs, maxAgeSec, status, value, unit, coveragePct, historyCoveragePct, window, aliasRequired, aliasVerified, sourceCompatible, primaryMarketId, settlementPeriod, note, error }) {
    const venueObservationStatus = status;
    const identityBlocked = Boolean(aliasRequired && !aliasVerified);
    return {
      contract_code: contractCode,
      chain,
      metric,
      source,
      venue,
      market_type: marketType,
      value: value ?? null,
      unit: unit ?? null,
      observed_ts: nowTs,
      source_ts: sourceTs ?? null,
      max_age_sec: finiteOrNull(maxAgeSec),
      now_ts: nowTs,
      status: identityBlocked ? "SOURCE_INCOMPATIBLE" : status,
      venue_observation_status: venueObservationStatus,
      eligible_for_chain_closure: !identityBlocked && status === "CLOSED" && !aliasRequired,
      coverage_pct: coveragePct ?? null,
      history_coverage_pct: historyCoveragePct ?? null,
      window: window ?? null,
      source_health: error ? "ERROR" : (status === "CLOSED" ? "OK" : "DEGRADED"),
      symbol_verified: true,
      alias_required: Boolean(aliasRequired),
      alias_verified: Boolean(aliasVerified),
      alias_verification_scope: aliasRequired ? "VENUE_MARKET_SYMBOL_ONLY" : "NOT_REQUIRED",
      asset_identity_verified: false,
      source_compatible: sourceCompatible !== false,
      independence_group: `${venue}_OFFICIAL_PUBLIC`,
      primary_market_id: primaryMarketId ?? null,
      settlement_period: settlementPeriod ?? null,
      note: note ?? null,
      error: error ?? null,
    };
  }

  function parseBybitInstrumentVerification(payload, expectedSymbol) {
    const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
    const expected = nfcUpper(expectedSymbol);
    const row = rows.find(r => nfcUpper(r?.symbol) === expected) || null;
    const apiOk = Number(payload?.retCode) === 0;
    const ok = apiOk && Boolean(row) &&
      nfcUpper(row?.quoteCoin) === "USDT" &&
      nfcUpper(row?.settleCoin) === "USDT" &&
      nfcUpper(row?.contractType) === "LINEARPERPETUAL" &&
      nfcUpper(row?.status) === "TRADING" &&
      row?.isPreListing !== true;
    return {
      api_ok: apiOk,
      verified: ok,
      exact_symbol: row?.symbol || null,
      base_coin: row?.baseCoin || null,
      quote_coin: row?.quoteCoin || null,
      settle_coin: row?.settleCoin || null,
      contract_type: row?.contractType || null,
      funding_interval_minutes: finiteOrNull(row?.fundingInterval),
      status: row?.status || null,
      error: ok ? null : (!apiOk ? `BYBIT_API_${payload?.retCode ?? "UNKNOWN"}:${text(payload?.retMsg) || "ERROR"}` : "BYBIT_ACTIVE_USDT_PERPETUAL_NOT_VERIFIED"),
    };
  }

  function parseOkxInstrumentVerification(payload, expectedInstId, expectedType) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const expected = nfcUpper(expectedInstId);
    const row = rows.find(r => nfcUpper(r?.instId) === expected) || null;
    const type = nfcUpper(expectedType);
    const apiOk = text(payload?.code) === "0";
    const baseExpected = expected.replace(/-USDT(?:-SWAP)?$/u, "");
    const baseGot = nfcUpper(row?.baseCcy || row?.ctValCcy);
    const quoteOk = type === "SPOT" ? nfcUpper(row?.quoteCcy) === "USDT" : nfcUpper(row?.settleCcy) === "USDT";
    const ok = apiOk && Boolean(row) && nfcUpper(row?.instType) === type &&
      nfcUpper(row?.state) === "LIVE" && baseGot === baseExpected && quoteOk;
    return {
      api_ok: apiOk,
      verified: ok,
      exact_symbol: row?.instId || null,
      base_coin: row?.baseCcy || row?.ctValCcy || null,
      quote_coin: row?.quoteCcy || null,
      settle_coin: row?.settleCcy || null,
      instrument_type: row?.instType || null,
      state: row?.state || null,
      error: ok ? null : (!apiOk ? `OKX_API_${text(payload?.code) || "UNKNOWN"}:${text(payload?.msg) || "ERROR"}` : "OKX_ACTIVE_USDT_MARKET_NOT_VERIFIED"),
    };
  }

  function parseBinanceEchoVerification(payload, expectedSymbol) {
    const expected = nfcUpper(expectedSymbol);
    const rows = Array.isArray(payload?.symbols) ? payload.symbols : [];
    const row = rows.find(r => nfcUpper(r?.symbol) === expected) || null;
    const apiOk = !payload?.code && Array.isArray(payload?.symbols);
    const ok = apiOk && Boolean(row) && nfcUpper(row?.contractType) === "PERPETUAL" &&
      nfcUpper(row?.status) === "TRADING" && nfcUpper(row?.quoteAsset) === "USDT" &&
      nfcUpper(row?.marginAsset) === "USDT";
    return {
      api_ok: apiOk,
      verified: ok,
      exact_symbol: row?.symbol || null,
      base_coin: row?.baseAsset || null,
      quote_coin: row?.quoteAsset || null,
      settle_coin: row?.marginAsset || null,
      contract_type: row?.contractType || null,
      status: row?.status || null,
      error: ok ? null : (!apiOk ? `BINANCE_API_${payload?.code ?? "UNKNOWN"}:${text(payload?.msg) || "ERROR"}` : "BINANCE_ACTIVE_USDT_PERPETUAL_NOT_VERIFIED"),
    };
  }


  function parseGateInstrumentVerification(payload, expectedContract) {
    const expected = nfcUpper(expectedContract);
    const exact = nfcUpper(payload?.name);
    const apiOk = Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && !payload?.label && text(payload?.name));
    const quoteOk = exact.endsWith("_USDT");
    const ok = apiOk && exact === expected && quoteOk && payload?.in_delisting !== true;
    const fundingIntervalSec = finiteOrNull(payload?.funding_interval);
    return {
      api_ok: apiOk,
      verified: ok,
      exact_symbol: payload?.name || null,
      base_coin: exact ? exact.replace(/_USDT$/u, "") : null,
      quote_coin: quoteOk ? "USDT" : null,
      settle_coin: quoteOk ? "USDT" : null,
      contract_type: quoteOk ? "USDT_PERPETUAL" : null,
      funding_interval_minutes: fundingIntervalSec === null ? null : fundingIntervalSec / 60,
      status: payload?.in_delisting === true ? "DELISTING" : (ok ? "TRADING" : null),
      error: ok ? null : (!apiOk ? `GATE_API_${text(payload?.label) || "UNKNOWN"}:${text(payload?.message) || "ERROR"}` : "GATE_ACTIVE_USDT_PERPETUAL_NOT_VERIFIED"),
    };
  }

  function parseBybitFunding(payload) {
    const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
    const series = rows.map(r => ({ ts: finiteOrNull(r?.fundingRateTimestamp), rate: finiteOrNull(r?.fundingRate) }))
      .filter(r => r.ts !== null && r.rate !== null)
      .sort((a, b) => a.ts - b.ts);
    return fundingSeriesSummary(series);
  }

  function parseOkxFunding(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const series = rows.map(r => {
      const realized = finiteOrNull(r?.realizedRate);
      return { ts: finiteOrNull(r?.fundingTime), rate: realized };
    })
      .filter(r => r.ts !== null && r.rate !== null)
      .sort((a, b) => a.ts - b.ts);
    return fundingSeriesSummary(series);
  }

  function parseBinanceFunding(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    const series = rows.map(r => ({ ts: finiteOrNull(r?.fundingTime), rate: finiteOrNull(r?.fundingRate) }))
      .filter(r => r.ts !== null && r.rate !== null)
      .sort((a, b) => a.ts - b.ts);
    return fundingSeriesSummary(series);
  }

  function fundingSeriesSummary(series) {
    const duplicates = Math.max(0, series.length - new Set(series.map(r=>r.ts)).size);
    const deltas = [];
    for (let i = 1; i < series.length; i++) {
      const delta = (series[i].ts - series[i - 1].ts) / HOUR_MS;
      if (delta > 0) deltas.push(delta);
    }
    const latestInterval = deltas.at(-1) ?? null;
    const recent = deltas.slice(-3);
    const intervalConsistent = recent.length > 0 && latestInterval !== null && recent.every(x=>Math.abs(x-latestInterval)<=0.01);
    return {
      series,
      latest: series.at(-1) || null,
      inferred_interval_hours: latestInterval,
      median_interval_hours: safeMedian(deltas),
      duplicate_settlements: duplicates,
      interval_consistent: intervalConsistent,
    };
  }

  function parseBybitOi(payload) {
    const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
    const series = rows.map(r => ({ ts: finiteOrNull(r?.timestamp), oi: finiteOrNull(r?.openInterest) }))
      .filter(r => r.ts !== null && r.oi !== null)
      .sort((a, b) => a.ts - b.ts);
    return { series, latest: series.at(-1) || null };
  }

  function parseOkxOi(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const series = rows.map(r => ({ ts: finiteOrNull(r?.ts), oi: finiteOrNull(r?.oi), oi_ccy: finiteOrNull(r?.oiCcy), oi_usd: finiteOrNull(r?.oiUsd) }))
      .filter(r => r.ts !== null && (r.oi !== null || r.oi_usd !== null))
      .sort((a, b) => a.ts - b.ts);
    return { series, latest: series.at(-1) || null };
  }

  function parseBinanceOi(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    const series = rows.map(r => ({ ts: finiteOrNull(r?.timestamp), oi: finiteOrNull(r?.sumOpenInterest), oi_value: finiteOrNull(r?.sumOpenInterestValue) }))
      .filter(r => r.ts !== null && (r.oi !== null || r.oi_value !== null))
      .sort((a, b) => a.ts - b.ts);
    return { series, latest: series.at(-1) || null };
  }


  function parseGateContractStats(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    const series = rows.map(r => ({
      ts: finiteOrNull(r?.time) === null ? null : finiteOrNull(r?.time) * 1000,
      oi: finiteOrNull(r?.open_interest),
      oi_usd: finiteOrNull(r?.open_interest_usd),
      mark_price: finiteOrNull(r?.mark_price),
      funding_rate: finiteOrNull(r?.last_funding_rate),
      long_taker_size: finiteOrNull(r?.long_taker_size),
      short_taker_size: finiteOrNull(r?.short_taker_size),
      long_liq_usd: finiteOrNull(r?.long_liq_usd_new ?? r?.long_liq_usd),
      short_liq_usd: finiteOrNull(r?.short_liq_usd_new ?? r?.short_liq_usd),
    })).filter(r => r.ts !== null).sort((a,b)=>a.ts-b.ts);
    return { series, latest: series.at(-1) || null };
  }

  function parseGateHourlyCandles(payload, nowTs = Date.now()) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map(r => {
      const openTsSec = finiteOrNull(r?.t);
      const openTs = openTsSec === null ? null : openTsSec * 1000;
      return normalizedCandle(openTs, r?.o, r?.h, r?.l, r?.c, r?.v, openTs !== null && openTs + HOUR_MS <= nowTs);
    }).filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
  }

  function exactHourlyCoverage(series, endTs, hours) {
    const targetTs = endTs - Number(hours) * HOUR_MS;
    const expectedPoints = Number(hours) + 1;
    const inWindow = (Array.isArray(series) ? series : [])
      .filter(r => Number.isFinite(r?.ts) && r.ts >= targetTs && r.ts <= endTs)
      .sort((a,b)=>a.ts-b.ts);
    const timestamps = inWindow.map(r=>r.ts);
    const unique = new Set(timestamps);
    let maxGapMs = null;
    for (let i=1;i<timestamps.length;i++) {
      const gap=timestamps[i]-timestamps[i-1];
      maxGapMs=maxGapMs===null?gap:Math.max(maxGapMs,gap);
    }
    const targetPresent = unique.has(targetTs);
    const endPresent = unique.has(endTs);
    const exactCadence = timestamps.length >= 2 && timestamps.every((ts,i)=>i===0 || ts-timestamps[i-1]===HOUR_MS);
    const closed = targetPresent && endPresent && unique.size === expectedPoints && timestamps.length === expectedPoints && exactCadence;
    return {
      target_ts: targetTs,
      expected_points: expectedPoints,
      received_points: timestamps.length,
      unique_points: unique.size,
      max_gap_ms: maxGapMs,
      target_present: targetPresent,
      end_present: endPresent,
      exact_cadence: exactCadence,
      coverage_pct: expectedPoints ? Math.min(100, unique.size / expectedPoints * 100) : 0,
      closed,
    };
  }

  function oiWindowChange(series, hours) {
    const xs = Array.isArray(series) ? series.filter(r => Number.isFinite(r?.ts) && Number.isFinite(r?.oi)).sort((a,b)=>a.ts-b.ts) : [];
    if (xs.length < 2) return null;
    const end = xs.at(-1);
    const target = end.ts - Number(hours) * HOUR_MS;
    const coverage = exactHourlyCoverage(xs, end.ts, hours);
    let ref = null;
    for (const row of xs) {
      if (row.ts <= target) ref = row;
      else break;
    }
    if (!ref) ref = xs[0];
    return {
      hours: Number(hours),
      from_ts: ref.ts,
      to_ts: end.ts,
      from_oi: ref.oi,
      to_oi: end.oi,
      change_pct: pctChange(ref.oi, end.oi),
      actual_window_hours: (end.ts - ref.ts) / HOUR_MS,
      ...coverage,
      window_target_closed: coverage.closed,
    };
  }

  function candleWindowChange(series, hours) {
    const xs = Array.isArray(series) ? series.filter(r => Number.isFinite(r?.ts) && Number.isFinite(r?.close)).sort((a,b)=>a.ts-b.ts) : [];
    if (xs.length < 2) return null;
    const end = xs.at(-1);
    const target = end.ts - Number(hours) * HOUR_MS;
    const coverage = exactHourlyCoverage(xs, end.ts, hours);
    let ref = null;
    for (const row of xs) {
      if (row.ts <= target) ref = row;
      else break;
    }
    if (!ref) ref = xs[0];
    return {
      hours: Number(hours),
      from_ts: ref.ts,
      to_ts: end.ts,
      from_close: ref.close,
      to_close: end.close,
      change_pct: pctChange(ref.close, end.close),
      actual_window_hours: (end.ts - ref.ts) / HOUR_MS,
      ...coverage,
      window_target_closed: coverage.closed,
    };
  }

  function targetWindowClosed(actualHours, targetHours, toleranceHours = 0.25) {
    const actual = finiteOrNull(actualHours);
    const target = finiteOrNull(targetHours);
    if (actual === null || target === null) return false;
    return Math.abs(actual - target) <= Number(toleranceHours);
  }

  function normalizedCandle(ts, open, high, low, close, volume, closed) {
    const row = {
      ts: finiteOrNull(ts),
      open: finiteOrNull(open),
      high: finiteOrNull(high),
      low: finiteOrNull(low),
      close: finiteOrNull(close),
      volume: finiteOrNull(volume),
      closed: Boolean(closed),
    };
    return row.ts !== null && row.close !== null ? row : null;
  }

  function parseBybitHourlyCandles(payload, nowTs = Date.now()) {
    const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
    return rows.map(r => normalizedCandle(r?.[0], r?.[1], r?.[2], r?.[3], r?.[4], r?.[5], finiteOrNull(r?.[0]) + HOUR_MS <= nowTs))
      .filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
  }

  function parseOkxHourlyCandles(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows.map(r => normalizedCandle(r?.[0], r?.[1], r?.[2], r?.[3], r?.[4], r?.[5], String(r?.[8]) === "1"))
      .filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
  }

  function parseBinanceHourlyCandles(payload, nowTs = Date.now()) {
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map(r => {
      const openTs = finiteOrNull(r?.[0]);
      const closeTs = finiteOrNull(r?.[6]);
      return normalizedCandle(openTs, r?.[1], r?.[2], r?.[3], r?.[4], r?.[5], closeTs !== null ? closeTs < nowTs : openTs + HOUR_MS <= nowTs);
    }).filter(Boolean).filter(r => r.closed).sort((a,b)=>a.ts-b.ts);
  }

  function attachOpportunityHourlyCandles(evidence, candles) {
    Object.defineProperty(evidence, "_opportunity_hourly_candles", {
      enumerable: false,
      value: Array.isArray(candles) ? candles : [],
    });
    return evidence;
  }

  function synchronizedReturns(candidateCandles, btcCandles, ethCandles, windows = [1,4,24]) {
    const maps = [candidateCandles, btcCandles, ethCandles].map(rows => new Map((rows || []).map(r => [Number(r.ts), r])));
    const common = [...maps[0].keys()].filter(ts => maps[1].has(ts) && maps[2].has(ts)).sort((a,b)=>a-b);
    if (common.length < 2) {
      return { common_points: common.length, latest_common_ts: common.at(-1) ?? null, windows: {} };
    }
    const latestTs = common.at(-1);
    const latest = maps.map(m => m.get(latestTs));
    const out = {};
    for (const h of windows) {
      const target = latestTs - Number(h) * HOUR_MS;
      const refTs = common.includes(target) ? target : (common.filter(ts => ts <= target).at(-1) ?? null);
      if (refTs === null) {
        out[`${h}h`] = { status: "NOT_CLOSED", target_ts: target, reference_ts: null };
        continue;
      }
      const refs = maps.map(m => m.get(refTs));
      const c = pctChange(refs[0]?.close, latest[0]?.close);
      const b = pctChange(refs[1]?.close, latest[1]?.close);
      const e = pctChange(refs[2]?.close, latest[2]?.close);
      const actualWindowHours = (latestTs - refTs) / HOUR_MS;
      const coverage = exactHourlyCoverage(common.map(ts=>({ts})), latestTs, Number(h));
      const windowClosed = targetWindowClosed(actualWindowHours, Number(h)) && coverage.closed;
      out[`${h}h`] = {
        status: c === null || b === null || e === null || !windowClosed ? "NOT_CLOSED" : "CLOSED",
        target_ts: target,
        reference_ts: refTs,
        latest_ts: latestTs,
        actual_window_hours: actualWindowHours,
        window_target_closed: windowClosed,
        expected_points: coverage.expected_points,
        received_points: coverage.received_points,
        max_gap_ms: coverage.max_gap_ms,
        coverage_pct: coverage.coverage_pct,
        candidate_pct: c,
        btc_pct: b,
        eth_pct: e,
        vs_btc_pp: c === null || b === null ? null : c - b,
        vs_eth_pp: c === null || e === null ? null : c - e,
      };
    }
    return { common_points: common.length, latest_common_ts: latestTs, windows: out };
  }

  function downMarketRelativeObservations(candidateCandles, benchmarkCandles) {
    const c = new Map((candidateCandles || []).map(r => [Number(r.ts), r]));
    const b = new Map((benchmarkCandles || []).map(r => [Number(r.ts), r]));
    const common = [...c.keys()].filter(ts => b.has(ts)).sort((a,b)=>a-b);
    const rows = [];
    for (let i = 1; i < common.length; i++) {
      const prevTs = common[i-1];
      const ts = common[i];
      if (ts - prevTs !== HOUR_MS) continue;
      const cr = pctChange(c.get(prevTs)?.close, c.get(ts)?.close);
      const br = pctChange(b.get(prevTs)?.close, b.get(ts)?.close);
      if (cr === null || br === null || br >= 0) continue;
      rows.push({ ts, candidate_pct: cr, benchmark_pct: br, relative_pp: cr - br });
    }
    const avg = rows.length ? rows.reduce((s,r)=>s+r.relative_pp,0)/rows.length : null;
    const betterCount = rows.filter(r => r.relative_pp > 0).length;
    return {
      negative_benchmark_hours: rows.length,
      candidate_better_hours: betterCount,
      better_share_pct: rows.length ? (betterCount / rows.length) * 100 : null,
      average_relative_pp: avg,
      rows: rows.slice(-24),
    };
  }

  function buildCrossVenueAssetIdentityProof(contractCode, verification = {}) {
    const aliases = candidateVenueAliases(contractCode);
    const canonicalBase = aliases.alias_candidate_safe
      ? nfcUpper(String(contractCode).replace(/-USDT$/u, ""))
      : null;
    if (!aliases.alias_candidate_safe || !canonicalBase) {
      return {
        verified: false,
        method: "UNSAFE_OR_NON_ASCII_ALIAS_FAIL_CLOSED",
        canonical_base: canonicalBase,
        corroborators: [],
      };
    }

    const matchesBase = (row) =>
      row?.verified === true && nfcUpper(row?.base_coin) === canonicalBase;
    const bybit = matchesBase(verification?.bybit);
    const okxSwap = matchesBase(verification?.okx_swap);
    const okxSpot = matchesBase(verification?.okx_spot);
    const gate = matchesBase(verification?.gate_futures);
    const binance = matchesBase(verification?.binance_futures);
    const corroborators = [];
    if (bybit) corroborators.push("BYBIT_LINEAR_PERP");
    if (okxSwap) corroborators.push("OKX_SWAP");
    if (okxSpot) corroborators.push("OKX_SPOT");
    if (gate) corroborators.push("GATE_USDT_PERP");
    if (binance) corroborators.push("BINANCE_USDT_PERP");

    let verified = false;
    let method = "VENUE_MARKET_SYMBOL_ONLY";
    if (okxSpot && okxSwap) {
      verified = true;
      method = "HTX_CANONICAL_PLUS_OKX_SPOT_SWAP_EXACT_BASE";
    } else if (okxSpot && (bybit || gate || binance)) {
      verified = true;
      method = "HTX_CANONICAL_PLUS_OKX_SPOT_PLUS_EXTERNAL_PERP_EXACT_BASE";
    } else if ((bybit && gate) || (bybit && binance) || (gate && okxSwap)) {
      verified = true;
      method = gate ? "HTX_CANONICAL_PLUS_TWO_EXTERNAL_EXACT_BASE_WITH_GATE" : "HTX_CANONICAL_PLUS_BYBIT_BINANCE_EXACT_BASE";
    }
    return { verified, method, canonical_base: canonicalBase, corroborators };
  }

  function promoteCorroboratedAssetIdentity(evidence, proof) {
    return (Array.isArray(evidence) ? evidence : []).map((row) => {
      if (
        proof?.verified !== true ||
        row?.alias_required !== true ||
        row?.alias_verified !== true ||
        row?.venue_observation_status !== "CLOSED" ||
        row?.source_compatible === false ||
        row?.error
      ) {
        return row;
      }
      return {
        ...row,
        status: "CLOSED",
        eligible_for_chain_closure: true,
        alias_verification_scope: proof.method,
        asset_identity_verified: true,
        note: [row?.note, `asset_identity=${proof.method}`].filter(Boolean).join("; "),
      };
    });
  }

  async function verifyAliases(contractCode, fetchImpl, nowTs) {
    const aliases = candidateVenueAliases(contractCode);
    if (!aliases.alias_candidate_safe) {
      return {
        aliases,
        bybit: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
        okx_swap: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
        okx_spot: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
        gate_futures: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
        binance_futures: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
        binance_spot: { verified: false, status: "SOURCE_INCOMPATIBLE", reason: aliases.reason },
      };
    }

    const urls = {
      bybit: `https://api.bybit.com/v5/market/instruments-info?category=linear&status=Trading&symbol=${encodeURIComponent(aliases.bybit)}`,
      okx_swap: `https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=${encodeURIComponent(aliases.okx_swap)}`,
      okx_spot: `https://www.okx.com/api/v5/public/instruments?instType=SPOT&instId=${encodeURIComponent(aliases.okx_spot)}`,
      gate_futures: `https://api.gateio.ws/api/v4/futures/usdt/contracts/${encodeURIComponent(aliases.gate_futures)}`,
    };
    const [bybitRaw, okxSwapRaw, okxSpotRaw, gateFutRaw] = await Promise.all([
      fetchJson(fetchImpl, urls.bybit),
      fetchJson(fetchImpl, urls.okx_swap),
      fetchJson(fetchImpl, urls.okx_spot),
      fetchJson(fetchImpl, urls.gate_futures),
    ]);
    const wrap = (raw, parsed) => ({ ...parsed, status: parsed.verified ? "CLOSED" : (parsed.api_ok ? "SOURCE_INCOMPATIBLE" : "NOT_CLOSED"), http_status: raw.status, fetched_ts: nowTs, fetch_error: raw.error || (parsed.api_ok ? null : parsed.error) });
    const result = {
      aliases,
      bybit: wrap(bybitRaw, parseBybitInstrumentVerification(bybitRaw.data, aliases.bybit)),
      okx_swap: wrap(okxSwapRaw, parseOkxInstrumentVerification(okxSwapRaw.data, aliases.okx_swap, "SWAP")),
      okx_spot: wrap(okxSpotRaw, parseOkxInstrumentVerification(okxSpotRaw.data, aliases.okx_spot, "SPOT")),
      gate_futures: wrap(gateFutRaw, parseGateInstrumentVerification(gateFutRaw.data, aliases.gate_futures)),
      binance_futures: { verified: false, status: "REPLACED_BY_GATE", reason: "Gate is the active public fallback for this production path." },
      binance_spot: { verified: false, status: "UNUSED_IN_3_7", reason: "No Binance Spot adapter is promoted in 3.7." },
    };
    result.asset_identity = buildCrossVenueAssetIdentityProof(contractCode, result);
    return result;
  }

  async function collectBybitDerivatives(contractCode, alias, verification, fetchImpl, nowTs) {
    const venue = "BYBIT";
    if (!verification?.verified) {
      return [externalEvidenceBase({ contractCode, chain:"CROSS_EXCHANGE_DERIVATIVES", metric:"venue_status", source:"Bybit Public V5", venue, marketType:"LINEAR_PERP", nowTs, status: verification?.status || "NOT_CLOSED", value:null, unit:null, coveragePct:0, aliasRequired:true, aliasVerified:false, sourceCompatible:verification?.status !== "SOURCE_INCOMPATIBLE", primaryMarketId:null, note:verification?.reason || verification?.error, error:verification?.fetch_error || null })];
    }
    const fundUrl = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(alias)}&limit=12`;
    const oiUrl = `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${encodeURIComponent(alias)}&intervalTime=1h&limit=30`;
    const klineUrl = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${encodeURIComponent(alias)}&interval=60&limit=30`;
    const [fundRaw, oiRaw, candleRaw] = await Promise.all([fetchJson(fetchImpl,fundUrl),fetchJson(fetchImpl,oiUrl),fetchJson(fetchImpl,klineUrl)]);
    const fundError = bybitApiError(fundRaw);
    const oiError = bybitApiError(oiRaw);
    const candleError = bybitApiError(candleRaw);
    const fund = parseBybitFunding(fundRaw.data);
    const oi = parseBybitOi(oiRaw.data);
    const oi1h = oiWindowChange(oi.series, 1);
    const oi1hClosed = Boolean(!oiError && oi1h?.window_target_closed);
    const candles = parseBybitHourlyCandles(candleRaw.data, nowTs);
    const price4h = candleWindowChange(candles, 4);
    const price4hClosed = Boolean(!candleError && price4h?.window_target_closed);
    const latestCandle = candles.at(-1) || null;
    const sourceTs = Math.max(fund.latest?.ts || 0, oi.latest?.ts || 0, latestCandle?.ts || 0) || null;
    const settlement = fund.inferred_interval_hours ? `${fund.inferred_interval_hours}h` : (verification.funding_interval_minutes ? `${verification.funding_interval_minutes/60}h` : null);
    const instrumentFundingHours = finiteOrNull(verification.funding_interval_minutes) === null ? null : finiteOrNull(verification.funding_interval_minutes) / 60;
    const fundingPeriodMatchesInstrument = instrumentFundingHours === null || fund.inferred_interval_hours === null || Math.abs(instrumentFundingHours-fund.inferred_interval_hours) <= 0.01;
    const fundingClosed = Boolean(!fundError && fund.latest && fund.series.length >= 2 && settlement && fund.interval_consistent && fund.duplicate_settlements === 0 && fundingPeriodMatchesInstrument);
    return attachOpportunityHourlyCandles([
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"Bybit Public V5",venue,marketType:"LINEAR_PERP",nowTs,sourceTs:fund.latest?.ts,maxAgeSec:Math.max(7200,(fund.inferred_interval_hours||verification.funding_interval_minutes/60||8)*5400),status:fundingClosed?"CLOSED":"NOT_CLOSED",value:fund.latest?.rate,unit:"rate_per_settlement",coveragePct:fundingClosed?100:0,historyCoveragePct:fund.series.length>=2?100:0,window:"FUNDING_HISTORY",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:BYBIT:LINEAR_PERP`,settlementPeriod:settlement,note:`history_points=${fund.series.length}; interval_consistent=${fund.interval_consistent}; duplicate_settlements=${fund.duplicate_settlements}; period_matches_instrument=${fundingPeriodMatchesInstrument}`,error:fundError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"oi_change_1h",source:"Bybit Public V5",venue,marketType:"LINEAR_PERP",nowTs,sourceTs:oi.latest?.ts,maxAgeSec:3*60*60,status:oi1hClosed?"CLOSED":"NOT_CLOSED",value:oi1h?.change_pct,unit:"pct",coveragePct:oi1h?.coverage_pct??0,historyCoveragePct:oi1h?.coverage_pct??0,window:"1h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:BYBIT:LINEAR_PERP`,note:`oi_points=${oi.series.length}; actual_window_hours=${oi1h?.actual_window_hours ?? "NA"}; expected_points=${oi1h?.expected_points??"NA"}; received_points=${oi1h?.received_points??"NA"}; max_gap_ms=${oi1h?.max_gap_ms??"NA"}`,error:oiError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"Bybit Public V5",venue,marketType:"LINEAR_PERP",nowTs,sourceTs:latestCandle?.ts,maxAgeSec:2*60*60,status:price4hClosed?"CLOSED":"NOT_CLOSED",value:price4h?.change_pct,unit:"pct",coveragePct:price4h?.coverage_pct??0,historyCoveragePct:price4h?.coverage_pct??0,window:"4h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:BYBIT:LINEAR_PERP`,note:`closed_hourly_candles=${candles.length}; actual_window_hours=${price4h?.actual_window_hours ?? "NA"}; expected_points=${price4h?.expected_points??"NA"}; received_points=${price4h?.received_points??"NA"}; max_gap_ms=${price4h?.max_gap_ms??"NA"}`,error:candleError}),
    ], candles);
  }

  async function collectOkxDerivatives(contractCode, alias, verification, fetchImpl, nowTs) {
    const venue = "OKX";
    if (!verification?.verified) {
      return [externalEvidenceBase({ contractCode, chain:"CROSS_EXCHANGE_DERIVATIVES", metric:"venue_status", source:"OKX Public V5", venue, marketType:"SWAP", nowTs, status: verification?.status || "NOT_CLOSED", value:null, coveragePct:0, aliasRequired:true, aliasVerified:false, sourceCompatible:verification?.status !== "SOURCE_INCOMPATIBLE", note:verification?.reason || verification?.error, error:verification?.fetch_error || null })];
    }
    const fundUrl = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${encodeURIComponent(alias)}&limit=12`;
    const oiUrl = `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${encodeURIComponent(alias)}`;
    const klineUrl = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(alias)}&bar=1H&limit=30`;
    const [fundRaw, oiRaw, candleRaw] = await Promise.all([fetchJson(fetchImpl,fundUrl),fetchJson(fetchImpl,oiUrl),fetchJson(fetchImpl,klineUrl)]);
    const fundError = okxApiError(fundRaw);
    const oiError = okxApiError(oiRaw);
    const candleError = okxApiError(candleRaw);
    const fund = parseOkxFunding(fundRaw.data);
    const oi = parseOkxOi(oiRaw.data);
    const candles = parseOkxHourlyCandles(candleRaw.data);
    const price4h = candleWindowChange(candles, 4);
    const price4hClosed = Boolean(!candleError && price4h?.window_target_closed);
    const latestCandle = candles.at(-1) || null;
    const settlement = fund.inferred_interval_hours ? `${fund.inferred_interval_hours}h` : null;
    const fundingClosed = Boolean(!fundError && fund.latest && fund.series.length >= 2 && settlement && fund.interval_consistent && fund.duplicate_settlements === 0);
    return attachOpportunityHourlyCandles([
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"OKX Public V5",venue,marketType:"SWAP",nowTs,sourceTs:fund.latest?.ts,maxAgeSec:Math.max(7200,(fund.inferred_interval_hours||8)*5400),status:fundingClosed?"CLOSED":"NOT_CLOSED",value:fund.latest?.rate,unit:"rate_per_settlement",coveragePct:fundingClosed?100:0,historyCoveragePct:fund.series.length>=2?100:0,window:"FUNDING_HISTORY",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SWAP`,settlementPeriod:settlement,note:`realized_history_points=${fund.series.length}; announced_rate_fallback=DISABLED; interval_consistent=${fund.interval_consistent}; duplicate_settlements=${fund.duplicate_settlements}`,error:fundError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"open_interest_current",source:"OKX Public V5",venue,marketType:"SWAP",nowTs,sourceTs:oi.latest?.ts,maxAgeSec:15*60,status:!oiError&&oi.latest?"CLOSED":"NOT_CLOSED",value:oi.latest?.oi_usd ?? oi.latest?.oi,unit:oi.latest?.oi_usd!==null?"usd":"contracts",coveragePct:!oiError&&oi.latest?100:0,window:"CURRENT",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SWAP`,note:"current OI only; not promoted as OI trajectory",error:oiError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"OKX Public V5",venue,marketType:"SWAP",nowTs,sourceTs:latestCandle?.ts,maxAgeSec:2*60*60,status:price4hClosed?"CLOSED":"NOT_CLOSED",value:price4h?.change_pct,unit:"pct",coveragePct:price4h?.coverage_pct??0,historyCoveragePct:price4h?.coverage_pct??0,window:"4h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SWAP`,note:`closed_hourly_candles=${candles.length}; actual_window_hours=${price4h?.actual_window_hours ?? "NA"}; expected_points=${price4h?.expected_points??"NA"}; received_points=${price4h?.received_points??"NA"}; max_gap_ms=${price4h?.max_gap_ms??"NA"}`,error:candleError}),
    ], candles);
  }

  async function collectGateDerivatives(contractCode, alias, verification, fetchImpl, nowTs) {
    const venue = "GATE";
    if (!verification?.verified) {
      return [externalEvidenceBase({ contractCode, chain:"CROSS_EXCHANGE_DERIVATIVES", metric:"venue_status", source:"Gate Public Futures", venue, marketType:"USDT_PERP", nowTs, status: verification?.status || "NOT_CLOSED", value:null, coveragePct:0, aliasRequired:true, aliasVerified:false, sourceCompatible:verification?.status !== "SOURCE_INCOMPATIBLE", note:verification?.reason || verification?.error, error:verification?.fetch_error || null })];
    }
    const statsUrl = `https://api.gateio.ws/api/v4/futures/usdt/contract_stats?contract=${encodeURIComponent(alias)}&interval=1h&limit=30`;
    const candleUrl = `https://api.gateio.ws/api/v4/futures/usdt/candlesticks?contract=${encodeURIComponent(alias)}&interval=1h&limit=30`;
    const [statsRaw, candleRaw] = await Promise.all([fetchJson(fetchImpl,statsUrl), fetchJson(fetchImpl,candleUrl)]);
    const statsError = gateApiError(statsRaw);
    const candleError = gateApiError(candleRaw);
    const stats = parseGateContractStats(statsRaw.data);
    const oiSeries = stats.series.filter(r => r.oi !== null).map(r => ({ts:r.ts,oi:r.oi}));
    const oi1h = oiWindowChange(oiSeries, 1);
    const oi1hClosed = Boolean(!statsError && oi1h?.window_target_closed);
    const candles = parseGateHourlyCandles(candleRaw.data, nowTs);
    const price4h = candleWindowChange(candles, 4);
    const price4hClosed = Boolean(!candleError && price4h?.window_target_closed);
    const latest = stats.latest || null;
    const latestCandle = candles.at(-1) || null;
    const fundingHours = finiteOrNull(verification?.funding_interval_minutes) === null ? null : finiteOrNull(verification.funding_interval_minutes) / 60;
    const settlement = fundingHours && fundingHours > 0 ? `${fundingHours}h` : null;
    const fundingClosed = Boolean(!statsError && latest && latest.funding_rate !== null && settlement);
    const takerDen = latest && latest.long_taker_size !== null && latest.short_taker_size !== null ? latest.long_taker_size + latest.short_taker_size : null;
    const takerDeltaPct = takerDen && takerDen > 0 ? ((latest.long_taker_size - latest.short_taker_size) / takerDen) * 100 : null;
    return attachOpportunityHourlyCandles([
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"funding_rate",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latest?.ts,maxAgeSec:2*60*60,status:fundingClosed?"CLOSED":"NOT_CLOSED",value:latest?.funding_rate,unit:"rate_per_settlement",coveragePct:fundingClosed?100:0,historyCoveragePct:stats.series.length>=2?100:0,window:"CURRENT_HOURLY_STATS",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,settlementPeriod:settlement,note:`stats_points=${stats.series.length}; settlement_period_from_verified_contract=${settlement||"NA"}`,error:statsError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"oi_change_1h",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latest?.ts,maxAgeSec:2*60*60,status:oi1hClosed?"CLOSED":"NOT_CLOSED",value:oi1h?.change_pct,unit:"pct",coveragePct:oi1h?.coverage_pct??0,historyCoveragePct:oi1h?.coverage_pct??0,window:"1h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,note:`oi_points=${oiSeries.length}; actual_window_hours=${oi1h?.actual_window_hours??"NA"}; expected_points=${oi1h?.expected_points??"NA"}; received_points=${oi1h?.received_points??"NA"}`,error:statsError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"price_change_4h",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latestCandle?.ts,maxAgeSec:2*60*60,status:price4hClosed?"CLOSED":"NOT_CLOSED",value:price4h?.change_pct,unit:"pct",coveragePct:price4h?.coverage_pct??0,historyCoveragePct:price4h?.coverage_pct??0,window:"4h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,note:`closed_hourly_candles=${candles.length}; actual_window_hours=${price4h?.actual_window_hours??"NA"}; expected_points=${price4h?.expected_points??"NA"}; received_points=${price4h?.received_points??"NA"}`,error:candleError}),
      externalEvidenceBase({contractCode,chain:"CROSS_EXCHANGE_DERIVATIVES",metric:"taker_balance_1h_raw",source:"Gate Public Futures",venue,marketType:"USDT_PERP",nowTs,sourceTs:latest?.ts,maxAgeSec:2*60*60,status:!statsError&&takerDeltaPct!==null?"CLOSED":"NOT_CLOSED",value:takerDeltaPct,unit:"pct_long_minus_short_of_total",coveragePct:!statsError&&takerDeltaPct!==null?100:0,window:"1h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:GATE:USDT_PERP`,note:"Descriptive taker-flow evidence only; no new decision weight.",error:statsError}),
    ], candles);
  }

  async function collectOkxRelativeStrength(contractCode, alias, verification, fetchImpl, nowTs) {
    if (!verification?.verified) {
      return {
        evidence: [externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"relative_strength_status",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,status:verification?.status||"NOT_CLOSED",value:null,coveragePct:0,aliasRequired:true,aliasVerified:false,sourceCompatible:verification?.status!=="SOURCE_INCOMPATIBLE",note:verification?.reason||verification?.error,error:verification?.fetch_error||null})],
        detail: null,
      };
    }
    const urls = [alias, "BTC-USDT", "ETH-USDT"].map(inst => `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(inst)}&bar=1H&limit=30`);
    const [candidateRaw, btcRaw, ethRaw] = await Promise.all(urls.map(u=>fetchJson(fetchImpl,u)));
    const candidateError = okxApiError(candidateRaw);
    const btcError = okxApiError(btcRaw);
    const ethError = okxApiError(ethRaw);
    const rsError = candidateError || btcError || ethError;
    const candidate = parseOkxHourlyCandles(candidateRaw.data);
    const btc = parseOkxHourlyCandles(btcRaw.data);
    const eth = parseOkxHourlyCandles(ethRaw.data);
    const sync = synchronizedReturns(candidate, btc, eth, [1,4,24]);
    const downBtc = downMarketRelativeObservations(candidate, btc);
    const downEth = downMarketRelativeObservations(candidate, eth);
    const evidence = [];
    if (rsError || Object.keys(sync.windows).length === 0) {
      evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"relative_strength_status",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:sync.latest_common_ts,maxAgeSec:2*60*60,status:"NOT_CLOSED",value:null,coveragePct:0,historyCoveragePct:0,window:"1h/4h/24h",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:"Synchronized candidate/BTC/ETH closed-hourly evidence unavailable.",error:rsError || "INSUFFICIENT_SYNCHRONIZED_CANDLES"}));
    }
    for (const [window, row] of Object.entries(sync.windows)) {
      const status = !rsError && row.status === "CLOSED" ? "CLOSED" : "NOT_CLOSED";
      const note = `synchronized_closed_hourly_points=${sync.common_points}; expected_points=${row.expected_points??"NA"}; received_points=${row.received_points??"NA"}; max_gap_ms=${row.max_gap_ms??"NA"}`;
      evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:`rs_vs_btc_${window}`,source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:row.latest_ts??sync.latest_common_ts,maxAgeSec:2*60*60,status,value:row.vs_btc_pp,unit:"percentage_points",coveragePct:row.coverage_pct??0,historyCoveragePct:row.coverage_pct??0,window,aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note,error:rsError}));
      evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:`rs_vs_eth_${window}`,source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:row.latest_ts??sync.latest_common_ts,maxAgeSec:2*60*60,status,value:row.vs_eth_pp,unit:"percentage_points",coveragePct:row.coverage_pct??0,historyCoveragePct:row.coverage_pct??0,window,aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note,error:rsError}));
    }
    evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"down_market_rs_vs_btc_raw",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:sync.latest_common_ts,maxAgeSec:2*60*60,status:!rsError&&downBtc.negative_benchmark_hours?"CLOSED":"NOT_CLOSED",value:downBtc.average_relative_pp,unit:"average_percentage_points",coveragePct:!rsError&&downBtc.negative_benchmark_hours?100:0,window:"LAST_24_CONTIGUOUS_HOURS",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:`negative_btc_hours=${downBtc.negative_benchmark_hours}; uncalibrated raw feature`,error:rsError}));
    evidence.push(externalEvidenceBase({contractCode,chain:"MARKET_STRENGTH_SPOT",metric:"down_market_rs_vs_eth_raw",source:"OKX Spot Public V5",venue:"OKX",marketType:"SPOT",nowTs,sourceTs:sync.latest_common_ts,maxAgeSec:2*60*60,status:!rsError&&downEth.negative_benchmark_hours?"CLOSED":"NOT_CLOSED",value:downEth.average_relative_pp,unit:"average_percentage_points",coveragePct:!rsError&&downEth.negative_benchmark_hours?100:0,window:"LAST_24_CONTIGUOUS_HOURS",aliasRequired:true,aliasVerified:true,sourceCompatible:true,primaryMarketId:`${alias}:OKX:SPOT`,note:`negative_eth_hours=${downEth.negative_benchmark_hours}; uncalibrated raw feature`,error:rsError}));
    return {
      evidence,
      detail: {
        synchronized_returns: sync,
        down_market_vs_btc: downBtc,
        down_market_vs_eth: downEth,
        hourly_candles: { candidate, btc, eth },
      },
    };
  }

  function fundingPerHourDetail(evidence) {
    const rows = (Array.isArray(evidence) ? evidence : [])
      .filter(r => r?.chain === "CROSS_EXCHANGE_DERIVATIVES" && r?.metric === "funding_rate" && r?.venue_observation_status === "CLOSED" && !r?.error)
      .map(r => {
        const hours = Number(String(r?.settlement_period || "").replace(/h$/i, ""));
        const rate = finiteOrNull(r?.value);
        return {
          venue: r?.venue || null,
          funding_rate: rate,
          settlement_hours: Number.isFinite(hours) && hours > 0 ? hours : null,
          funding_rate_per_hour: rate !== null && Number.isFinite(hours) && hours > 0 ? rate / hours : null,
          source_ts: r?.source_ts ?? null,
          asset_identity_verified: r?.asset_identity_verified === true,
          eligible_for_chain_closure: r?.eligible_for_chain_closure === true,
        };
      });
    const normalized = rows.map(r => r.funding_rate_per_hour).filter(Number.isFinite);
    return {
      rows,
      comparable_venues: normalized.length,
      min_per_hour: normalized.length ? Math.min(...normalized) : null,
      max_per_hour: normalized.length ? Math.max(...normalized) : null,
      spread_per_hour: normalized.length >= 2 ? Math.max(...normalized) - Math.min(...normalized) : null,
      note: "Cross-venue funding dispersion is descriptive evidence, not a same-market source conflict and not a promoted threshold.",
    };
  }

  async function collectPublicFullEvidence({ contract_code, fetch_impl, now_ts = Date.now() } = {}) {
    const contractCode = text(contract_code).normalize("NFC");
    const nowTs = finiteOrNull(now_ts) ?? Date.now();
    const verification = await verifyAliases(contractCode, fetch_impl, nowTs);

    const [bybit, okx, gate, rs] = await Promise.all([
      collectBybitDerivatives(contractCode, verification.aliases.bybit, verification.bybit, fetch_impl, nowTs),
      collectOkxDerivatives(contractCode, verification.aliases.okx_swap, verification.okx_swap, fetch_impl, nowTs),
      collectGateDerivatives(contractCode, verification.aliases.gate_futures, verification.gate_futures, fetch_impl, nowTs),
      collectOkxRelativeStrength(contractCode, verification.aliases.okx_spot, verification.okx_spot, fetch_impl, nowTs),
    ]);

    const externalRequired = [
      externalEvidenceBase({contractCode,chain:"SMART_MONEY_ONCHAIN",metric:"chain_status",source:"EXTERNAL_EVIDENCE_REQUIRED",venue:null,marketType:null,nowTs,status:"NOT_CLOSED",value:null,coveragePct:0,aliasRequired:false,aliasVerified:true,sourceCompatible:true,note:"No autonomous first-party Smart Money/on-chain source is configured inside Worker. Missing data is DQ uncertainty, not directional evidence.",error:null}),
      externalEvidenceBase({contractCode,chain:"SUPPORTING_RISK",metric:"chain_status",source:"EXTERNAL_EVIDENCE_REQUIRED",venue:null,marketType:null,nowTs,status:"NOT_CLOSED",value:null,coveragePct:0,aliasRequired:false,aliasVerified:true,sourceCompatible:true,note:"Supply/social/fundamental evidence remains not_closed unless a factual autonomous source is configured. No synthetic penalty is applied.",error:null}),
      externalEvidenceBase({contractCode,chain:"MARKET_REGIME_TIMING",metric:"chain_status",source:"HTX_TIMING_EXISTING_ONLY",venue:"HTX",marketType:"PERP",nowTs,status:"PARTIAL",value:null,coveragePct:null,aliasRequired:false,aliasVerified:true,sourceCompatible:true,note:"Timing remains a gate/layer without new weight; full promotion disabled in 3.7.",error:null}),
    ];

    const rawEvidence = [...bybit, ...okx, ...gate, ...rs.evidence, ...externalRequired];
    const allEvidence = promoteCorroboratedAssetIdentity(rawEvidence, verification.asset_identity);
    const response = {
      version: PUBLIC_EVIDENCE_ADAPTERS_VERSION,
      contract_code: contractCode,
      observed_ts: nowTs,
      alias_verification: verification,
      evidence: allEvidence,
      cross_venue_derivatives_detail: { funding: fundingPerHourDetail(allEvidence) },
      relative_strength_detail: rs.detail,
      safety: {
        strategy_weights_changed: false,
        missing_data_directional_penalty: false,
        live_promotion: false,
        telegram: false,
        execution: false,
      },
    };
    Object.defineProperty(response, "_opportunity_hourly_candles", {
      enumerable: false,
      value: {
        BYBIT_PERP: bybit._opportunity_hourly_candles || [],
        OKX_PERP: okx._opportunity_hourly_candles || [],
        GATE_PERP: gate._opportunity_hourly_candles || [],
        OKX_SPOT: rs.detail?.hourly_candles?.candidate || [],
        BTC_SPOT: rs.detail?.hourly_candles?.btc || [],
        ETH_SPOT: rs.detail?.hourly_candles?.eth || [],
      },
    });
    return response;
  }
  return collectPublicFullEvidence;
})();

/* MY_REPORT_2_FULL_EVIDENCE_CONTRACT_INLINE_V1 — embedded to preserve data:-URL test compatibility. */
const buildFullEvidenceEnvelope = (() => {
  const EVIDENCE_CONTRACT_VERSION = "full-evidence-v1";

  const FIXED_DECISION_WEIGHTS = Object.freeze({
    CROSS_EXCHANGE_DERIVATIVES: 35,
    MARKET_STRENGTH_SPOT: 30,
    SMART_MONEY_ONCHAIN: 20,
    SUPPORTING_RISK: 15,
  });

  const VALID_STATUS = new Set([
    "CLOSED",
    "PARTIAL",
    "NOT_CLOSED",
    "STALE",
    "FUTURE",
    "CONFLICT",
    "SOURCE_INCOMPATIBLE",
    "UNSUPPORTED",
  ]);

  const VALID_CHAINS = new Set([
    "HTX_EXECUTION",
    "CROSS_EXCHANGE_DERIVATIVES",
    "MARKET_STRENGTH_SPOT",
    "SMART_MONEY_ONCHAIN",
    "SUPPORTING_RISK",
    "MARKET_REGIME_TIMING",
    "PORTFOLIO_RISK",
  ]);

  function finiteOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function textOrNull(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s || null;
  }

  function asBool(v) {
    return v === true;
  }

  function normalizeStatus(v) {
    const s = String(v || "NOT_CLOSED").toUpperCase();
    return VALID_STATUS.has(s) ? s : "NOT_CLOSED";
  }

  function normalizeEvidenceItem(raw = {}) {
    const chain = String(raw.chain || "").toUpperCase();
    const observedTs = finiteOrNull(raw.observed_ts);
    const sourceTs = finiteOrNull(raw.source_ts);
    const maxAgeSec = finiteOrNull(raw.max_age_sec);
    const maxFutureSec = finiteOrNull(raw.max_future_sec) ?? 60;
    const nowTs = finiteOrNull(raw.now_ts) ?? Date.now();
    const effectiveTs = sourceTs;
    const ageSec = effectiveTs === null ? null : (nowTs - effectiveTs) / 1000;
    const staleByAge = maxAgeSec !== null && ageSec !== null && ageSec > maxAgeSec;
    const futureByAge = ageSec !== null && ageSec < -maxFutureSec;
    const symbolVerified = asBool(raw.symbol_verified);
    const aliasRequired = asBool(raw.alias_required);
    const aliasVerified = !aliasRequired || asBool(raw.alias_verified);
    const sourceCompatible = raw.source_compatible !== false;

    let status = normalizeStatus(raw.status);
    if (!sourceCompatible || !aliasVerified) status = "SOURCE_INCOMPATIBLE";
    else if (status === "CLOSED" && sourceTs === null) status = "NOT_CLOSED";
    else if (futureByAge && status === "CLOSED") status = "FUTURE";
    else if (staleByAge && status === "CLOSED") status = "STALE";

    const coveragePct = finiteOrNull(raw.coverage_pct);
    if (status === "CLOSED" && (coveragePct === null || coveragePct <= 0 || coveragePct > 100)) {
      status = "NOT_CLOSED";
    }
    if (status === "CLOSED" && (raw.value === null || raw.value === undefined)) status = "NOT_CLOSED";
    if (status === "CLOSED" && aliasRequired && !asBool(raw.asset_identity_verified)) {
      status = "SOURCE_INCOMPATIBLE";
    }

    return {
      contract_code: textOrNull(raw.contract_code),
      chain: VALID_CHAINS.has(chain) ? chain : null,
      metric: textOrNull(raw.metric),
      source: textOrNull(raw.source),
      venue: textOrNull(raw.venue),
      market_type: textOrNull(raw.market_type),
      value: raw.value ?? null,
      unit: textOrNull(raw.unit),
      observed_ts: observedTs,
      source_ts: sourceTs,
      now_ts: nowTs,
      age_sec: ageSec,
      max_age_sec: maxAgeSec,
      max_future_sec: maxFutureSec,
      status,
      venue_observation_status: textOrNull(raw.venue_observation_status),
      eligible_for_chain_closure: asBool(raw.eligible_for_chain_closure),
      coverage_pct: coveragePct,
      history_coverage_pct: finiteOrNull(raw.history_coverage_pct),
      window: textOrNull(raw.window),
      source_health: textOrNull(raw.source_health),
      symbol_verified: symbolVerified,
      alias_required: aliasRequired,
      alias_verified: aliasVerified,
      alias_verification_scope: textOrNull(raw.alias_verification_scope),
      asset_identity_verified: asBool(raw.asset_identity_verified),
      source_compatible: sourceCompatible,
      independence_group: textOrNull(raw.independence_group),
      primary_market_id: textOrNull(raw.primary_market_id),
      settlement_period: textOrNull(raw.settlement_period),
      note: textOrNull(raw.note),
      error: textOrNull(raw.error),
    };
  }

  function evidenceUsable(item) {
    const e = normalizeEvidenceItem(item);
    return Boolean(
      e.chain &&
      e.metric &&
      e.source &&
      e.contract_code &&
      e.symbol_verified &&
      e.source_compatible &&
      e.alias_verified &&
      (!e.alias_required || e.asset_identity_verified) &&
      e.primary_market_id &&
      e.source_ts !== null &&
      e.max_age_sec !== null && e.max_age_sec > 0 &&
      e.coverage_pct !== null && e.coverage_pct > 0 && e.coverage_pct <= 100 &&
      e.value !== null &&
      e.status === "CLOSED" &&
      e.error === null
    );
  }

  // Deliberately compare only evidence claiming to describe the SAME primary market.
  // Cross-venue differences (e.g. HTX vs Bybit funding) are market dispersion, not a
  // data-source conflict. Same-venue independent sources can conflict and must not
  // be silently averaged.
  function comparisonKey(e) {
    return [e.metric, e.venue || "", e.market_type || "", e.unit || "", e.settlement_period || ""].join("|");
  }

  function detectEvidenceConflicts(items = [], options = {}) {
    const normalized = items.map(normalizeEvidenceItem);
    const timestampToleranceMs = finiteOrNull(options.timestamp_tolerance_ms) ?? 5 * 60 * 1000;
    const relativeTolerance = finiteOrNull(options.relative_tolerance) ?? 0.01;
    const absoluteTolerance = finiteOrNull(options.absolute_tolerance) ?? null;
    const groups = new Map();

    for (const e of normalized) {
      if (!e.metric || !e.contract_code) continue;
      const key = `${e.contract_code}|${comparisonKey(e)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }

    const conflicts = [];
    for (const [key, rows] of groups) {
      const usable = rows.filter(evidenceUsable);
      for (let i = 0; i < usable.length; i++) {
        for (let j = i + 1; j < usable.length; j++) {
          const a = usable[i], b = usable[j];
          if (a.independence_group && b.independence_group && a.independence_group === b.independence_group) continue;
          if (a.primary_market_id && b.primary_market_id && a.primary_market_id !== b.primary_market_id) continue;
          const ta = a.source_ts ?? a.observed_ts;
          const tb = b.source_ts ?? b.observed_ts;
          if (ta !== null && tb !== null && Math.abs(ta - tb) > timestampToleranceMs) continue;
          const av = finiteOrNull(a.value), bv = finiteOrNull(b.value);
          if (av === null || bv === null) continue;
          const absDiff = Math.abs(av - bv);
          const denom = Math.max(Math.abs(av), Math.abs(bv), 1e-12);
          const relDiff = absDiff / denom;
          const material =
            (absoluteTolerance !== null && absDiff > absoluteTolerance) ||
            (relativeTolerance !== null && relDiff > relativeTolerance);
          if (material) {
            conflicts.push({
              key,
              metric: a.metric,
              venue: a.venue,
              source_a: a.source,
              source_b: b.source,
              value_a: av,
              value_b: bv,
              abs_diff: absDiff,
              rel_diff: relDiff,
              timestamp_delta_ms: ta !== null && tb !== null ? Math.abs(ta - tb) : null,
              unresolved: true,
            });
          }
        }
      }
    }
    return conflicts;
  }

  function summarizeDataQuality(items = [], conflicts = []) {
    const normalized = items.map(normalizeEvidenceItem);
    const critical = normalized.filter(e => e.chain && e.chain !== "PORTFOLIO_RISK");
    const usable = critical.filter(evidenceUsable);
    const independent = new Set(usable.map(e => e.independence_group || e.source).filter(Boolean));
    const chainsObserved = new Set(critical.map(e => e.chain));
    const chainsWithUsableEvidence = new Set(usable.map(e => e.chain));
    const stale = critical.filter(e => e.status === "STALE").length;
    const incompatible = critical.filter(e => e.status === "SOURCE_INCOMPATIBLE").length;
    const future = critical.filter(e => e.status === "FUTURE").length;
    const notClosed = critical.filter(e => ["NOT_CLOSED","UNSUPPORTED","PARTIAL","FUTURE"].includes(e.status)).length;
    const unresolvedConflicts = conflicts.filter(c => c.unresolved).length;
    const coverageValues = usable.map(e => e.coverage_pct).filter(v => v !== null);
    const coveragePct = coverageValues.length ? coverageValues.reduce((a,b)=>a+b,0)/coverageValues.length : null;

    let status = "NOT_CLOSED";
    const weightedChainsComplete = Object.keys(FIXED_DECISION_WEIGHTS).every(chain => chainsWithUsableEvidence.has(chain));
    if (usable.length && weightedChainsComplete && independent.size >= 2 && unresolvedConflicts === 0 && stale === 0 && incompatible === 0 && notClosed === 0) status = "CLOSED";
    else if (usable.length) status = "PARTIAL";

    const weightedEvidenceAvailability = {};
    let observedWeightPct = 0;
    for (const [chain, weight] of Object.entries(FIXED_DECISION_WEIGHTS)) {
      const available = chainsWithUsableEvidence.has(chain);
      weightedEvidenceAvailability[chain] = { weight_pct: weight, has_usable_evidence: available };
      if (available) observedWeightPct += weight;
    }

    return {
      status,
      items_total: critical.length,
      usable_items: usable.length,
      independent_evidence_groups: independent.size,
      chains_observed: [...chainsObserved].sort(),
      chains_with_usable_evidence: [...chainsWithUsableEvidence].sort(),
      weighted_evidence_availability: weightedEvidenceAvailability,
      observed_weight_pct: observedWeightPct,
      average_coverage_pct: coveragePct,
      stale_items: stale,
      future_items: future,
      incompatible_items: incompatible,
      not_closed_items: notClosed,
      unresolved_conflicts: unresolvedConflicts,
      uncertainty_flags: [
        ...(stale ? ["STALE_EVIDENCE"] : []),
        ...(future ? ["FUTURE_EVIDENCE"] : []),
        ...(incompatible ? ["SOURCE_OR_SYMBOL_INCOMPATIBLE"] : []),
        ...(notClosed ? ["NOT_CLOSED_EVIDENCE"] : []),
        ...(unresolvedConflicts ? ["UNRESOLVED_CONFLICT"] : []),
        ...(independent.size < 2 ? ["LOW_EVIDENCE_INDEPENDENCE"] : []),
      ],
    };
  }

  function buildFullEvidenceEnvelope({ contract_code, observed_ts, evidence = [], conflict_options = {} } = {}) {
    const rows = evidence.map(row => normalizeEvidenceItem({ ...row, contract_code: row.contract_code ?? contract_code, observed_ts: row.observed_ts ?? observed_ts, now_ts: row.now_ts ?? observed_ts }));
    const conflicts = detectEvidenceConflicts(rows, conflict_options);
    const dq = summarizeDataQuality(rows, conflicts);
    const htxGateRows = rows.filter(e => e.chain === "HTX_EXECUTION" && e.metric === "execution_gate_status");
    const htxExecutionClosed = htxGateRows.length === 1 && htxGateRows.some(e => evidenceUsable(e) && Number(e.value) === 1);

    return {
      contract_version: EVIDENCE_CONTRACT_VERSION,
      contract_code: textOrNull(contract_code),
      observed_ts: finiteOrNull(observed_ts),
      mode: "FULL_EVIDENCE_SHADOW_NO_EXECUTION",
      fixed_decision_weights: { ...FIXED_DECISION_WEIGHTS },
      htx_execution_gate_closed: htxExecutionClosed,
      evidence: rows,
      conflicts,
      data_quality: dq,
      decision: {
        dc_long: null,
        dc_short: null,
        eq: null,
        dq_status: dq.status,
        full_decision_eligible: false,
        live_probability: null,
        validated: false,
        telegram_started: false,
        trading_execution: false,
        weights_changed: false,
        note: "Evidence fusion only. Fixed 35/30/20/15 weights are metadata, not applied to synthetic or missing chain scores. Directional promotion remains disabled until evidence/scoring calibration gates are proven.",
      },
    };
  }
  return buildFullEvidenceEnvelope;
})();

/* MY_REPORT_2_FULL_EVIDENCE_MODEL_INLINE_V1 — embedded to preserve data:-URL test compatibility. */
const buildFullEvidenceShadowRecord = (() => {
  const FULL_EVIDENCE_RULES_VERSION = "full-evidence-shadow-v1";

  function finiteOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function textOrNull(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
  }

  function compactEvidenceRow(row) {
    return {
      contract_code: row?.contract_code || null,
      chain: row?.chain || null,
      metric: row?.metric || null,
      source: row?.source || null,
      venue: row?.venue || null,
      market_type: row?.market_type || null,
      value: row?.value ?? null,
      unit: row?.unit || null,
      observed_ts: row?.observed_ts ?? null,
      source_ts: row?.source_ts ?? null,
      age_sec: row?.age_sec ?? null,
      max_age_sec: row?.max_age_sec ?? null,
      max_future_sec: row?.max_future_sec ?? null,
      status: row?.status || null,
      venue_observation_status: row?.venue_observation_status || null,
      eligible_for_chain_closure: row?.eligible_for_chain_closure === true,
      freshness_status: row?.status === "STALE" ? "STALE" : (row?.status === "FUTURE" ? "FUTURE" : (row?.source_ts == null ? "MISSING_SOURCE_TIMESTAMP" : "CURRENT")),
      coverage_pct: row?.coverage_pct ?? null,
      history_coverage_pct: row?.history_coverage_pct ?? null,
      window: row?.window || null,
      symbol_verified: row?.symbol_verified === true,
      alias_required: row?.alias_required === true,
      alias_verified: row?.alias_verified === true,
      alias_verification_scope: row?.alias_verification_scope || null,
      asset_identity_verified: row?.asset_identity_verified === true,
      source_compatible: row?.source_compatible !== false,
      independence_group: row?.independence_group || null,
      primary_market_id: row?.primary_market_id || null,
      settlement_period: row?.settlement_period || null,
      conflict_status: row?.status === "CONFLICT" ? "CONFLICT" : null,
      source_incompatible: row?.status === "SOURCE_INCOMPATIBLE" || row?.source_compatible === false,
      not_closed: row?.status !== "CLOSED",
      error: row?.error ? String(row.error).slice(0, 180) : null,
      note: row?.note ? String(row.note).slice(0, 240) : null,
    };
  }

  function htxEvidenceFromShadow(shadowDecision, nowTs) {
    const contract = textOrNull(shadowDecision?.contract) || "UNKNOWN";
    const flags = shadowDecision?.evidence_flags || {};
    const htxCoverage = finiteOrNull(shadowDecision?.dq?.htx_coverage_pct ?? flags?.htx_coverage_pct);
    const eqStatus = String(shadowDecision?.eq?.status || "").toUpperCase();
    const dqStatus = String(shadowDecision?.dq?.status || "").toUpperCase();
    const explicitExecutionGate = shadowDecision?.htx_execution_gate_closed === true;
    const htxDqClosed = dqStatus === "CLOSED" || dqStatus.startsWith("HTX_CLOSED");
    // Execution closure and directional-data closure are deliberately separate.
    // Exact-window CVD / spot / trajectory gaps stay visible in DQ but must not
    // turn a factually measurable HTX execution lane into a synthetic failure.
    const executionClosed = explicitExecutionGate && eqStatus === "SHADOW_MEASURABLE" && htxCoverage !== null && htxCoverage > 0;
    const base = {
      contract_code: contract,
      chain: "HTX_EXECUTION",
      source: "HTX_OFFICIAL_VIA_REPORT2_HUB",
      venue: "HTX",
      market_type: "USDT_PERP",
      observed_ts: nowTs,
      source_ts: nowTs,
      max_age_sec: 15 * 60,
      now_ts: nowTs,
      coverage_pct: htxCoverage,
      symbol_verified: true,
      alias_required: false,
      alias_verified: true,
      source_compatible: true,
      independence_group: "HTX_OFFICIAL",
      primary_market_id: `${contract}:HTX:USDT_PERP`,
      settlement_period: null,
      error: null,
    };
    const rows = [
      {
        ...base,
        metric: "execution_gate_status",
        value: executionClosed ? 1 : null,
        unit: "boolean",
        status: executionClosed ? "CLOSED" : "NOT_CLOSED",
        note: `explicit_htx_execution_gate=${explicitExecutionGate}; eq_status=${eqStatus || "UNKNOWN"}; dq_status=${dqStatus || "UNKNOWN"}; htx_dq_closed=${htxDqClosed}; htx_coverage_pct=${htxCoverage ?? "UNKNOWN"}; execution closure does not synthesize missing CVD`,
      },
    ];
    const metrics = [
      ["htx_funding_pct", flags?.funding_pct, "pct"],
      ["htx_price_1h_pct", flags?.price_1h_pct, "pct"],
      ["htx_price_4h_pct", flags?.price_4h_pct, "pct"],
      ["htx_price_24h_pct", flags?.price_24h_pct, "pct"],
      ["htx_oi_1h_change_pct", flags?.oi_1h_change_pct, "pct"],
      ["htx_oi_4h_change_pct", flags?.oi_4h_change_pct, "pct"],
      ["htx_futures_flow_1h_delta_pct", flags?.futures_flow_1h_delta_pct, "pct_of_turnover"],
      ["htx_futures_flow_4h_delta_pct", flags?.futures_flow_4h_delta_pct, "pct_of_turnover"],
      ["htx_spot_flow_delta_pct", flags?.spot_flow_delta_pct, "pct_of_turnover"],
      ["htx_spread_bps", shadowDecision?.eq?.spread_bps, "bps"],
      ["htx_buy_impact_bps", shadowDecision?.eq?.buy_impact_bps, "bps"],
      ["htx_sell_impact_bps", shadowDecision?.eq?.sell_impact_bps, "bps"],
    ];
    for (const [metric, rawValue, unit] of metrics) {
      const value = finiteOrNull(rawValue);
      rows.push({
        ...base,
        metric,
        value,
        unit,
        status: value === null ? "NOT_CLOSED" : "CLOSED",
        note: value === null ? "Metric absent in factual HTX shadow telemetry; not coerced to zero." : null,
      });
    }

    const fundingPct = finiteOrNull(flags?.funding_pct);
    const fundingIntervalHours = finiteOrNull(flags?.funding_interval_hours);
    const fundingRate = fundingPct === null ? null : fundingPct / 100;
    const oi1hChange = finiteOrNull(flags?.oi_1h_change_pct);
    const price4hChange = finiteOrNull(flags?.price_4h_pct);
    const chain2Base = {
      ...base,
      chain: "CROSS_EXCHANGE_DERIVATIVES",
      note: null,
    };
    rows.push({
      ...chain2Base,
      metric: "funding_rate",
      value: fundingRate,
      unit: "rate_per_settlement",
      status: fundingRate !== null && fundingIntervalHours !== null && fundingIntervalHours > 0 ? "CLOSED" : "NOT_CLOSED",
      settlement_period: fundingIntervalHours !== null && fundingIntervalHours > 0 ? `${fundingIntervalHours}h` : null,
      note: fundingRate === null || fundingIntervalHours === null || fundingIntervalHours <= 0
        ? "HTX funding or factual settlement interval is missing; not eligible for cross-venue funding closure."
        : "HTX is the primary execution venue and counts as one factual venue in cross-exchange funding verification.",
    });
    rows.push({
      ...chain2Base,
      metric: "oi_change_1h",
      value: oi1hChange,
      unit: "pct",
      status: oi1hChange === null ? "NOT_CLOSED" : "CLOSED",
      window: "1h",
      note: oi1hChange === null ? "HTX 1h OI trajectory unavailable." : "Factual synchronized HTX 1h OI trajectory reused; no extra fetch.",
    });
    rows.push({
      ...chain2Base,
      metric: "price_change_4h",
      value: price4hChange,
      unit: "pct",
      status: price4hChange === null ? "NOT_CLOSED" : "CLOSED",
      window: "4h",
      note: price4hChange === null ? "HTX 4h price trajectory unavailable." : "Factual synchronized HTX 4h price trajectory reused; no extra fetch.",
    });

    const spotFlow = finiteOrNull(flags?.spot_flow_delta_pct);
    rows.push({
      ...base,
      chain: "MARKET_STRENGTH_SPOT",
      metric: "htx_spot_flow_delta_pct",
      market_type: "SPOT",
      value: spotFlow,
      unit: "pct_of_turnover",
      status: spotFlow === null ? "NOT_CLOSED" : "CLOSED",
      independence_group: "HTX_OFFICIAL_SPOT",
      primary_market_id: `${contract}:HTX:SPOT`,
      note: spotFlow === null
        ? "HTX Spot factual flow is unavailable for this observation; Chain 3 cannot be fully closed from RS alone."
        : "Factual HTX Spot flow carried from shadow telemetry; no directional interpretation is applied here.",
    });

    return rows;
  }

  function chainStatus(envelope) {
    const result = {};
    const chains = [
      "HTX_EXECUTION",
      "CROSS_EXCHANGE_DERIVATIVES",
      "MARKET_STRENGTH_SPOT",
      "SMART_MONEY_ONCHAIN",
      "SUPPORTING_RISK",
      "MARKET_REGIME_TIMING",
      "PORTFOLIO_RISK",
    ];

    const usableRow = (row) =>
      row?.status === "CLOSED" &&
      row?.error === null &&
      row?.symbol_verified === true &&
      row?.source_compatible !== false &&
      row?.alias_verified !== false &&
      (row?.alias_required !== true || row?.asset_identity_verified === true) &&
      row?.primary_market_id &&
      row?.source_ts != null &&
      Number(row?.max_age_sec) > 0 &&
      Number(row?.coverage_pct) > 0 &&
      Number(row?.coverage_pct) <= 100 &&
      row?.value != null;

    for (const chain of chains) {
      const rows = (envelope?.evidence || []).filter(row => row?.chain === chain);
      const usable = rows.filter(usableRow);
      const groups = new Set(usable.map(row => row?.independence_group || row?.source).filter(Boolean));
      const metrics = new Set(usable.map(row => row?.metric).filter(Boolean));
      const venues = new Set(usable.map(row => row?.venue).filter(Boolean));
      const reasons = [];
      let chainClosed = false;

      if (chain === "HTX_EXECUTION") {
        const gate = usable.find(row => row?.metric === "execution_gate_status" && Number(row?.value) === 1);
        chainClosed = Boolean(gate);
        if (!chainClosed) reasons.push("HTX_EXECUTION_GATE_NOT_CLOSED");
      } else if (chain === "CROSS_EXCHANGE_DERIVATIVES") {
        const fundingVenues = new Set(usable.filter(row => row?.metric === "funding_rate").map(row => row?.venue).filter(Boolean));
        const fundingWithoutPeriod = usable.filter(row => row?.metric === "funding_rate" && !row?.settlement_period);
        const oiTrajectory = usable.some(row => /^oi_change_/i.test(String(row?.metric || "")));
        const priceTrajectory = usable.some(row => /^price_change_/i.test(String(row?.metric || "")));
        if (fundingVenues.size < 2) reasons.push("NEED_FUNDING_FROM_2_INDEPENDENT_VENUES");
        if (fundingWithoutPeriod.length) reasons.push("FUNDING_PERIOD_NOT_VERIFIED");
        if (!oiTrajectory) reasons.push("OI_TRAJECTORY_NOT_CLOSED");
        if (!priceTrajectory) reasons.push("PRICE_TRAJECTORY_NOT_CLOSED");
        if (groups.size < 2) reasons.push("LOW_DERIVATIVES_SOURCE_INDEPENDENCE");
        chainClosed = reasons.length === 0;
      } else if (chain === "MARKET_STRENGTH_SPOT") {
        const requiredRs = [
          "rs_vs_btc_1h", "rs_vs_eth_1h",
          "rs_vs_btc_4h", "rs_vs_eth_4h",
          "rs_vs_btc_24h", "rs_vs_eth_24h",
        ];
        const missingRs = requiredRs.filter(metric => !metrics.has(metric));
        const spotConfirmation = usable.some(row =>
          /^htx_spot_/i.test(String(row?.metric || "")) ||
          /^spot_(?:turnover|spread|depth|flow|delta|confirmation)/i.test(String(row?.metric || ""))
        );
        if (missingRs.length) reasons.push(`RS_WINDOWS_MISSING:${missingRs.join(",")}`);
        if (!spotConfirmation) reasons.push("SPOT_CONFIRMATION_NOT_CLOSED");
        chainClosed = reasons.length === 0;
      } else {
        // Chain 4/5 and gate/layer chains remain explicitly not closed unless a
        // later calibrated implementation defines their own minimum closure set.
        chainClosed = false;
        if (usable.length === 0) reasons.push("NO_USABLE_EVIDENCE");
        else reasons.push("NO_PROMOTED_CHAIN_CLOSURE_RULE_IN_3_7");
      }

      result[chain] = {
        items: rows.length,
        usable_items: usable.length,
        independent_groups: groups.size,
        venues: [...venues].sort(),
        usable_metrics: [...metrics].sort(),
        statuses: [...new Set(rows.map(row => row?.status).filter(Boolean))].sort(),
        has_usable_evidence: usable.length > 0,
        closure_status: chainClosed ? "CLOSED" : (usable.length ? "PARTIAL" : "NOT_CLOSED"),
        chain_closed: chainClosed,
        closure_reasons: reasons,
      };
    }
    return result;
  }

  function compactAliasVerification(publicEvidence) {
    const v = publicEvidence?.alias_verification || {};
    const take = (x) => x ? {
      verified: x?.verified === true,
      status: x?.status || null,
      exact_symbol: x?.exact_symbol || null,
      contract_type: x?.contract_type || x?.instrument_type || null,
      settle_coin: x?.settle_coin || null,
      funding_interval_minutes: finiteOrNull(x?.funding_interval_minutes),
      http_status: finiteOrNull(x?.http_status),
      fetch_error: x?.fetch_error || null,
    } : null;
    return {
      alias_candidate_safe: v?.aliases?.alias_candidate_safe === true,
      reason: v?.aliases?.reason || null,
      bybit: take(v?.bybit),
      okx_swap: take(v?.okx_swap),
      okx_spot: take(v?.okx_spot),
      gate_futures: take(v?.gate_futures),
      binance_futures: take(v?.binance_futures),
    };
  }

  function buildFullEvidenceShadowRecord({ shadow_decision, public_evidence, now = Date.now() } = {}) {
    const shadow = shadow_decision || {};
    const publicEvidence = public_evidence || {};
    const observedTs = finiteOrNull(shadow?.observed_ts) ?? finiteOrNull(publicEvidence?.observed_ts) ?? finiteOrNull(now) ?? Date.now();
    const contract = textOrNull(shadow?.contract) || textOrNull(publicEvidence?.contract_code) || "UNKNOWN";
    const htxEvidence = htxEvidenceFromShadow({ ...shadow, contract }, observedTs);
    const external = Array.isArray(publicEvidence?.evidence) ? publicEvidence.evidence : [];
    const envelope = buildFullEvidenceEnvelope({
      contract_code: contract,
      observed_ts: observedTs,
      evidence: [...htxEvidence, ...external],
    });
    const status = chainStatus(envelope);
    const weightedChains = Object.keys(envelope?.fixed_decision_weights || {});
    const missingWeightedChains = weightedChains.filter(chain => status?.[chain]?.chain_closed !== true);
    const compactEvidence = (envelope?.evidence || []).map(compactEvidenceRow);
    const fullId = `${observedTs}:${contract}:full-evidence-v1`;

    return {
      full_evidence_id: fullId,
      shadow_id: shadow?.shadow_id || `${observedTs}:${contract}`,
      contract,
      observed_ts: observedTs,
      observed_time_utc: new Date(observedTs).toISOString(),
      mode: "FULL_EVIDENCE_SHADOW_NO_EXECUTION",
      rules_version: FULL_EVIDENCE_RULES_VERSION,
      contract_version: envelope?.contract_version || null,
      adapters_version: publicEvidence?.version || null,
      fixed_decision_weights: envelope?.fixed_decision_weights || null,
      strategy_weights_changed: false,
      htx_execution_gate_closed: envelope?.htx_execution_gate_closed === true,
      chain_status: status,
      missing_weighted_chains: missingWeightedChains,
      data_quality: envelope?.data_quality || null,
      conflicts: envelope?.conflicts || [],
      alias_verification: compactAliasVerification(publicEvidence),
      evidence_compact: compactEvidence,
      cross_venue_derivatives_detail: publicEvidence?.cross_venue_derivatives_detail || null,
      relative_strength_detail: publicEvidence?.relative_strength_detail || null,
      prior_htx_shadow: {
        dc_shadow_long: finiteOrNull(shadow?.dc_shadow_long),
        dc_shadow_short: finiteOrNull(shadow?.dc_shadow_short),
        direction_hint: shadow?.direction_hint || null,
        eq_status: shadow?.eq?.status || null,
        dq_status: shadow?.dq?.status || null,
        stage: shadow?.stage || null,
        spread_bps: finiteOrNull(shadow?.eq?.spread_bps),
        buy_impact_bps: finiteOrNull(shadow?.eq?.buy_impact_bps),
        sell_impact_bps: finiteOrNull(shadow?.eq?.sell_impact_bps),
      },
      decision: {
        dc_long: null,
        dc_short: null,
        directional_confidence_semantics: "NOT_PROMOTED_IN_3_7",
        eq: null,
        dq_status: envelope?.data_quality?.status || "NOT_CLOSED",
        full_decision_eligible: false,
        live_probability: null,
        live_signal: false,
        validated: false,
        telegram_started: false,
        trading_execution: false,
        note: "3.7 collects/fuses factual evidence and DQ. It does not invent chain scores for missing/unconfigured sources and does not promote a live decision.",
      },
      calibration_link: {
        shadow_outcome_rules_version: "shadow-outcome-v1",
        outcome_horizons_hours: [1,4,12,24],
        automatic_weight_tuning_enabled: false,
      },
      safety: {
        missing_data_coerced_to_zero: false,
        cross_venue_dispersion_called_conflict: false,
        strategy_weights_changed: false,
        full_decision_eligible: false,
        live_probability_generated: false,
        live_signal_generated: false,
        validated: false,
        telegram_dispatch_allowed: false,
        trading_execution_allowed: false,
      },
    };
  }

  const FULL_EVIDENCE_SHADOW_RULES_VERSION = FULL_EVIDENCE_RULES_VERSION;
  return buildFullEvidenceShadowRecord;
})();


/* =========================================================
   MY_REPORT_2_FULL_EVIDENCE_SHADOW_V1
   Full-evidence shadow fusion journal.
   Evidence/DQ only: no live probability, validation, Telegram,
   execution, automatic weight tuning or synthetic missing-data score.
   ========================================================= */
function fullEvidenceJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function fullEvidenceRecordSafe(record) {
  return Boolean(
    record &&
    record.mode === "FULL_EVIDENCE_SHADOW_NO_EXECUTION" &&
    record.strategy_weights_changed === false &&
    Number(record?.fixed_decision_weights?.CROSS_EXCHANGE_DERIVATIVES) === 35 &&
    Number(record?.fixed_decision_weights?.MARKET_STRENGTH_SPOT) === 30 &&
    Number(record?.fixed_decision_weights?.SMART_MONEY_ONCHAIN) === 20 &&
    Number(record?.fixed_decision_weights?.SUPPORTING_RISK) === 15 &&
    record?.decision?.dc_long == null &&
    record?.decision?.dc_short == null &&
    record?.decision?.live_probability == null &&
    record?.decision?.full_decision_eligible === false &&
    record?.decision?.live_signal === false &&
    record?.decision?.validated === false &&
    record?.decision?.telegram_started === false &&
    record?.decision?.trading_execution === false &&
    record?.calibration_link?.automatic_weight_tuning_enabled === false &&
    record?.safety?.missing_data_coerced_to_zero === false &&
    record?.safety?.cross_venue_dispersion_called_conflict === false
  );
}

async function persistFullEvidenceShadowRecord(env, record, { stage392_prepared_proof_bundle = null } = {}) {
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
      persisted: false,
      insert_changes: 0,
      hot_path_statements: 0,
      cleanup_deferred: true,
      error: "D1 binding DATA_DB is not configured",
    };
  }

  if (!fullEvidenceRecordSafe(record)) {
    return {
      status: "REFUSED_UNSAFE_RECORD",
      persisted: false,
      insert_changes: 0,
      hot_path_statements: 0,
      cleanup_deferred: true,
      error: "Full-evidence record violated 3.7 shadow safety invariants",
    };
  }

  const now = Date.now();
  const dq = record?.data_quality || {};
  const proofBundleJson = stage392_prepared_proof_bundle?.bundle
    ? fullEvidenceJson(stage392_prepared_proof_bundle.bundle, null)
    : null;

  try {
    const insert = env.DATA_DB
      .prepare(`
        INSERT OR IGNORE INTO full_evidence_shadow_log
        (
          full_evidence_id, shadow_id, contract_code, observed_ts,
          rules_version, contract_version, adapters_version, mode,
          fixed_weights_json, weight_derivatives,
          weight_market_strength_spot, weight_smart_money_onchain,
          weight_supporting_risk, strategy_weights_changed,
          automatic_weight_tuning_enabled,
          htx_execution_gate_closed, dq_status, dq_usable_items,
          dq_total_items, dq_independent_groups, dq_observed_weight_pct,
          uncertainty_count, missing_weighted_chains_json,
          chain_status_json, conflicts_json, alias_verification_json,
          evidence_compact_json, relative_strength_json,
          prior_htx_shadow_json, full_dc_long, full_dc_short,
          live_probability, full_decision_eligible, live_signal,
          validated, telegram_started, trading_execution,
          missing_data_coerced_to_zero,
          cross_venue_dispersion_called_conflict,
          shadow_only, retention_days, persisted_ts, stage392_proof_bundle_json
        )
        VALUES
        (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
          ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
          ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29,
          ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39,
          ?40, ?41, ?42, ?43
        )
      `)
      .bind(
        record?.full_evidence_id,
        record?.shadow_id,
        record?.contract,
        record?.observed_ts,
        record?.rules_version,
        record?.contract_version,
        record?.adapters_version,
        record?.mode,
        fullEvidenceJson(record?.fixed_decision_weights, {}),
        Number(record?.fixed_decision_weights?.CROSS_EXCHANGE_DERIVATIVES),
        Number(record?.fixed_decision_weights?.MARKET_STRENGTH_SPOT),
        Number(record?.fixed_decision_weights?.SMART_MONEY_ONCHAIN),
        Number(record?.fixed_decision_weights?.SUPPORTING_RISK),
        record?.strategy_weights_changed ? 1 : 0,
        record?.calibration_link?.automatic_weight_tuning_enabled ? 1 : 0,
        record?.htx_execution_gate_closed ? 1 : 0,
        record?.decision?.dq_status || dq?.status || "NOT_CLOSED",
        Number(dq?.usable_items ?? 0),
        Number(dq?.items_total ?? 0),
        Number(dq?.independent_evidence_groups ?? 0),
        dq?.observed_weight_pct ?? null,
        Array.isArray(dq?.uncertainty_flags) ? dq.uncertainty_flags.length : 0,
        fullEvidenceJson(record?.missing_weighted_chains, []),
        fullEvidenceJson(record?.chain_status, {}),
        fullEvidenceJson(record?.conflicts, []),
        fullEvidenceJson(record?.alias_verification, {}),
        fullEvidenceJson(record?.evidence_compact, []),
        fullEvidenceJson({
          relative_strength: record?.relative_strength_detail || null,
          cross_venue_derivatives: record?.cross_venue_derivatives_detail || null,
        }, {}),
        fullEvidenceJson(record?.prior_htx_shadow, {}),
        record?.decision?.dc_long ?? null,
        record?.decision?.dc_short ?? null,
        record?.decision?.live_probability ?? null,
        record?.decision?.full_decision_eligible ? 1 : 0,
        record?.decision?.live_signal ? 1 : 0,
        record?.decision?.validated ? 1 : 0,
        record?.decision?.telegram_started ? 1 : 0,
        record?.decision?.trading_execution ? 1 : 0,
        record?.safety?.missing_data_coerced_to_zero ? 1 : 0,
        record?.safety?.cross_venue_dispersion_called_conflict ? 1 : 0,
        1,
        180,
        now,
        proofBundleJson
      );

    // Stage 3.9.2 deliberately removes Full Evidence retention DELETE from the
    // hot Deep Check. This frees exactly one D1 statement for Final Decision
    // SHADOW persistence while preserving the proven 48/50 peak budget.
    const results = await env.DATA_DB.batch([insert]);
    const insertChanges = Number(results?.[0]?.meta?.changes ?? 0);
    return {
      status: "CLOSED",
      persisted: true,
      insert_changes: insertChanges,
      changes: insertChanges,
      hot_path_statements: 1,
      cleanup_changes: 0,
      cleanup_deferred: true,
      cleanup_policy: "BOUNDED_MAINTENANCE_ONLY_NOT_DEEP_CHECK",
      error: null,
    };
  } catch (error) {
    return {
      status: /no such column|has no column|no such table/i.test(String(error?.message || error))
        ? "MIGRATION_REQUIRED"
        : "PARTIAL",
      persisted: false,
      insert_changes: 0,
      hot_path_statements: 1,
      cleanup_deferred: true,
      error: String(error?.message || error).slice(0, 600),
    };
  }
}

async function runStage392FullEvidenceMaintenance(env, now = Date.now()) {
  if (!env?.DATA_DB) return { status: "SOURCE_UNSUPPORTED", statements: 0, deleted: 0 };
  const cutoff = now - 180 * 24 * 60 * 60 * 1000;
  try {
    const result = await env.DATA_DB.prepare(`
      DELETE FROM full_evidence_shadow_log
      WHERE full_evidence_id IN (
        SELECT full_evidence_id FROM full_evidence_shadow_log
        WHERE observed_ts < ?1
        ORDER BY observed_ts ASC, full_evidence_id ASC
        LIMIT 100
      )
    `).bind(cutoff).run();
    return {
      status: "CLOSED",
      statements: 1,
      deleted: Number(result?.meta?.changes ?? 0),
      batch_cap: 100,
      hot_path: false,
    };
  } catch (error) {
    return {
      status: /no such table|no such column|has no column/i.test(String(error?.message || error)) ? "MIGRATION_REQUIRED" : "PARTIAL_FAIL_CLOSED",
      statements: 1,
      deleted: 0,
      batch_cap: 100,
      hot_path: false,
      error: String(error?.message || error).slice(0, 400),
    };
  }
}

/* STAGE371_CROSS_VENUE_LIQUIDATION_INTELLIGENCE */
const LIQUIDATION_INTELLIGENCE_API = (() => {
  const RULES_VERSION = "cross-venue-liquidation-shadow-v1";
  const CONTRACT_VERSION = "liquidation-evidence-v1";
  const PROVIDER = "ByKaranteli LiqMap Public API";
  const PROVIDER_BASE = "https://bykaranteli.com";
  const PUBLIC_MAP_MAX_AGE_SEC = 30 * 60;
  const REALIZED_MAX_AGE_SEC = 30 * 60;
  const RETENTION_DAYS = 180;
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_LIFECYCLE_STATE_ROWS = 80;
  const MAX_PROVIDER_GRAPH_NODES_SCANNED = 5000;
  const MAX_PROJECTED_RAW_ROWS_SCANNED = 2000;
  const MAX_PROJECTED_CLUSTERS_RETURNED = 500;
  const MAX_REALIZED_ROWS_RETURNED = 100;
  const MAX_COVERAGE_ROWS_SCANNED = 1000;
  const MAX_SYMBOL_REGISTRY_ROWS_SCANNED = 1000;
  const MAX_EXPLICIT_VENUES = 200;

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function txt(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function normalizeTs(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < 1e11) return Math.round(n * 1000);
    if (n > 1e15) return Math.round(n / 1000);
    return Math.round(n);
  }

  function ageStatus(sourceTs, nowTs, maxAgeSec) {
    const ts = normalizeTs(sourceTs);
    if (ts === null) return { status: "MISSING_SOURCE_TIMESTAMP", age_sec: null };
    const skewSec = (ts - nowTs) / 1000;
    if (skewSec > 60) return { status: "FUTURE", age_sec: -skewSec };
    const ageSec = Math.max(0, (nowTs - ts) / 1000);
    if (ageSec > maxAgeSec) return { status: "STALE", age_sec: ageSec };
    return { status: "CURRENT", age_sec: ageSec };
  }

  function parseHtxUsdtContract(contractCode) {
    const exact = txt(contractCode).normalize("NFC").toUpperCase();
    const m = exact.match(/^([\p{L}\p{N}]+)-USDT$/u);
    if (!m) {
      return { exact, base: null, ascii: false, compatible: false, reason: "HTX_USDT_CONTRACT_FORMAT_NOT_VERIFIED" };
    }
    const base = m[1];
    const ascii = /^[A-Z0-9]+$/.test(base);
    return {
      exact,
      base,
      ascii,
      compatible: ascii,
      reason: ascii ? null : "UNICODE_OR_NONASCII_ALIAS_REQUIRES_VERIFIED_MAPPING",
    };
  }

  function providerSymbolFromContract(contractCode) {
    const p = parseHtxUsdtContract(contractCode);
    if (!p.compatible) {
      return {
        ...p,
        provider_symbol: null,
        alias_verified: false,
        alias_verification_scope: "NONE_ZERO_GUESSED_FETCH",
        asset_identity_verified: false,
      };
    }
    return {
      ...p,
      provider_symbol: p.base,
      alias_verified: false,
      alias_verification_scope: "DERIVED_FROM_EXACT_HTX_ASCII_BASE_UNCONFIRMED",
      asset_identity_verified: false,
    };
  }

  async function fetchJson(fetchImpl, url, apiKey, timeoutMs = FETCH_TIMEOUT_MS) {
    const f = fetchImpl || globalThis.fetch;
    if (typeof f !== "function") {
      return { ok: false, http_status: null, data: null, error: "FETCH_UNAVAILABLE", retry_after_sec: null, url };
    }
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const headers = { accept: "application/json" };
      if (txt(apiKey)) headers.authorization = `Bearer ${txt(apiKey)}`;
      const response = await f(url, { method: "GET", headers, signal: controller?.signal });
      const status = Number(response?.status) || null;
      const retryRaw = response?.headers?.get?.("retry-after");
      const retryAfterSec = finite(retryRaw);
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        return {
          ok: false,
          http_status: status,
          data: null,
          error: `INVALID_JSON:${txt(error?.message || error)}`.slice(0, 300),
          retry_after_sec: retryAfterSec,
          url,
        };
      }
      const explicitFailure =
        data?.ok === false || data?.success === false ||
        ["error", "failed", "failure"].includes(txt(data?.status).toLowerCase()) ||
        (data?.error && typeof data.error !== "object") ||
        (finite(data?.code) !== null && finite(data?.code) !== 0 && finite(data?.code) !== 200);
      const ok = Boolean(response?.ok) && !explicitFailure;
      return {
        ok,
        http_status: status,
        data,
        error: ok ? null : (
          txt(data?.error?.message || data?.error || data?.message || data?.msg) ||
          (status === 401 || status === 403 ? "AUTH_REQUIRED_OR_INVALID" : `HTTP_OR_API_${status ?? "UNKNOWN"}`)
        ).slice(0, 300),
        retry_after_sec: retryAfterSec,
        url,
      };
    } catch (error) {
      return {
        ok: false,
        http_status: null,
        data: null,
        error: error?.name === "AbortError" ? "TIMEOUT" : txt(error?.message || error).slice(0, 300),
        retry_after_sec: null,
        url,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function rootSourceTimestamp(payload) {
    const objects = [payload, payload?.meta, payload?.data?.meta, payload?.snapshot, payload?.data];
    const keys = ["generatedAt", "generated_at", "updatedAt", "updated_at", "asOf", "as_of", "timestamp", "ts", "time"];
    for (const obj of objects) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
      for (const key of keys) {
        const ts = normalizeTs(obj[key]);
        if (ts !== null) return ts;
      }
    }
    return null;
  }

  function currentPriceFrom(payload) {
    const objects = [payload, payload?.data, payload?.snapshot, payload?.summary, payload?.market];
    const keys = ["current_price", "currentPrice", "last_price", "lastPrice", "price", "mark_price", "markPrice"];
    for (const obj of objects) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
      for (const key of keys) {
        const n = finite(obj[key]);
        if (n !== null && n > 0) return n;
      }
    }
    return null;
  }

  function explicitVenues(payload) {
    const candidates = [payload?.venues, payload?.venues_covered, payload?.sources, payload?.data?.venues, payload?.data?.sources, payload?.meta?.venues];
    for (const v of candidates) {
      if (Array.isArray(v)) {
        const xs = [...new Set(v.slice(0, MAX_EXPLICIT_VENUES).map(x => txt(typeof x === "object" ? (x?.venue || x?.exchange || x?.name || x?.id) : x)).filter(Boolean))];
        if (xs.length) return xs;
      }
      if (typeof v === "string") {
        const xs = [...new Set(v.slice(0, 20_000).split(/[,;+|]/).slice(0, MAX_EXPLICIT_VENUES).map(txt).filter(Boolean))];
        if (xs.length) return xs;
      }
    }
    return [];
  }

  function normalizeSide(rawSide, levelPrice, currentPrice) {
    const s = txt(rawSide).toUpperCase().replace(/[\s-]+/g, "_");
    if (/LONG/.test(s) && !/SHORT/.test(s)) return "LONG_LIQUIDATION_BELOW";
    if (/SHORT/.test(s)) return "SHORT_LIQUIDATION_ABOVE";
    const p = finite(levelPrice);
    const c = finite(currentPrice);
    if (p !== null && c !== null && c > 0) {
      if (p < c) return "LONG_LIQUIDATION_BELOW";
      if (p > c) return "SHORT_LIQUIDATION_ABOVE";
    }
    return "UNKNOWN";
  }

  function projectedContainerEntries(payload) {
    const found = [];
    const seen = new Set();
    const visited = new WeakSet();
    let graphNodesScanned = 0;
    let graphScanTruncated = false;
    function walk(node, path = "root", depth = 0) {
      if (depth > 5 || node === null || node === undefined) return;
      if (graphNodesScanned >= MAX_PROVIDER_GRAPH_NODES_SCANNED) {
        graphScanTruncated = true;
        return;
      }
      graphNodesScanned += 1;
      if (typeof node === "object") {
        if (visited.has(node)) return;
        visited.add(node);
      }
      if (Array.isArray(node)) {
        const lower = path.toLowerCase();
        const projectedName = /(level|cluster|band|heatmap|zone)/.test(lower);
        const forbidden = /(real|recorded|actual|event|print|executed)/.test(lower);
        if (projectedName && !forbidden && node.length) {
          const key = path + ":" + node.length;
          if (!seen.has(key)) {
            seen.add(key);
            found.push({ path, rows: node });
          }
        }
        for (let i = 0; i < Math.min(node.length, 5); i++) {
          if (graphNodesScanned >= MAX_PROVIDER_GRAPH_NODES_SCANNED) {
            graphScanTruncated = true;
            break;
          }
          walk(node[i], `${path}[${i}]`, depth + 1);
        }
        return;
      }
      if (typeof node !== "object") return;
      for (const [k, v] of Object.entries(node)) {
        if (graphNodesScanned >= MAX_PROVIDER_GRAPH_NODES_SCANNED) {
          graphScanTruncated = true;
          break;
        }
        const lower = k.toLowerCase();
        if (/(real|recorded|actual|events?|prints?|liquidated)/.test(lower)) continue;
        walk(v, `${path}.${k}`, depth + 1);
      }
    }
    walk(payload);
    return { entries: found, graph_nodes_scanned: graphNodesScanned, graph_scan_truncated: graphScanTruncated };
  }

  function rowLevel(row, containerPath, currentPrice, sourceTs, observedTs) {
    if (row === null || row === undefined) return null;
    let obj = row;
    if (Array.isArray(row)) {
      obj = { price: row[0], provider_raw_value: row[1], provider_raw_side: row[2] };
    }
    if (typeof obj !== "object") return null;
    const low = finite(obj.price_low ?? obj.low ?? obj.lower ?? obj.from_price ?? obj.from);
    const high = finite(obj.price_high ?? obj.high ?? obj.upper ?? obj.to_price ?? obj.to);
    const single = finite(obj.level_price ?? obj.price_level ?? obj.liquidation_price ?? obj.price ?? obj.level ?? obj.center ?? obj.mid);
    const price = single ?? (low !== null && high !== null ? (low + high) / 2 : null);
    if (price === null || price <= 0) return null;

    const sizePairs = [
      ["notional_usd", obj.notional_usd], ["notionalUsd", obj.notionalUsd], ["size_usd", obj.size_usd],
      ["sizeUsd", obj.sizeUsd], ["usd_notional", obj.usd_notional], ["quote_qty", obj.quote_qty],
      ["quoteQty", obj.quoteQty], ["notional", obj.notional], ["usd", obj.usd]
    ];
    let rawSize = null;
    let sourceUnit = null;
    for (const [key, value] of sizePairs) {
      const n = finite(value);
      if (n !== null) { rawSize = n; sourceUnit = /usd|quote|notional/i.test(key) ? "USD_NOTIONAL_PROVIDER" : null; break; }
    }
    const strength = finite(obj.normalized_strength ?? obj.normalizedStrength ?? obj.strength ?? obj.density ?? obj.score ?? obj.intensity);
    const rawSide = obj.side ?? obj.position_side ?? obj.positionSide ?? obj.liquidation_side ?? obj.liquidationSide ?? obj.type ?? obj.direction ?? obj.provider_raw_side ?? null;
    const side = normalizeSide(rawSide, price, currentPrice);
    const distancePct = currentPrice && currentPrice > 0 ? ((price / currentPrice) - 1) * 100 : null;
    const leverage = finite(obj.leverage ?? obj.leverage_x ?? obj.leverageX);
    const explicitMajor = obj.major === true || obj.is_major === true || obj.isMajor === true || txt(obj.classification).toUpperCase() === "MAJOR" || txt(obj.tier).toUpperCase() === "MAJOR";
    return {
      evidence_type: "PROJECTED_LIQUIDATION_CLUSTER",
      provider: PROVIDER,
      source_path: containerPath,
      source_ts: sourceTs,
      observed_ts: observedTs,
      raw_side: rawSide === null ? null : txt(rawSide),
      side,
      level_price: price,
      price_low: low,
      price_high: high,
      raw_size: rawSize,
      source_unit: sourceUnit,
      normalized_strength: strength,
      current_price: currentPrice,
      distance_pct: distancePct,
      leverage_bucket: leverage,
      explicit_major: explicitMajor,
      provider_raw: {
        id: txt(obj.id || obj.cluster_id || obj.clusterId) || null,
        label: txt(obj.label || obj.name) || null,
      },
    };
  }

  function summaryClusters(payload, currentPrice, sourceTs, observedTs) {
    const out = [];
    const specs = [
      ["nearest_cluster_below", "LONG_LIQUIDATION_BELOW", false], ["nearestClusterBelow", "LONG_LIQUIDATION_BELOW", false],
      ["nearest_cluster_above", "SHORT_LIQUIDATION_ABOVE", false], ["nearestClusterAbove", "SHORT_LIQUIDATION_ABOVE", false],
      ["largest_long_cluster", "LONG_LIQUIDATION_BELOW", true], ["largestLongCluster", "LONG_LIQUIDATION_BELOW", true],
      ["largest_short_cluster", "SHORT_LIQUIDATION_ABOVE", true], ["largestShortCluster", "SHORT_LIQUIDATION_ABOVE", true],
    ];
    const objects = [payload, payload?.data, payload?.summary, payload?.clusters_summary, payload?.cluster_summary];
    for (const obj of objects) {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
      for (const [key, side, major] of specs) {
        if (!(key in obj)) continue;
        const v = obj[key];
        const row = typeof v === "object" && v !== null ? v : { price: v };
        const parsed = rowLevel({ ...row, side, major: row.major ?? major }, `summary.${key}`, currentPrice, sourceTs, observedTs);
        if (parsed) out.push(parsed);
      }
    }
    return out;
  }

  function dedupeClusters(rows) {
    const out = [];
    const seen = new Set();
    for (const r of rows) {
      const price = finite(r?.level_price);
      if (price === null) continue;
      const key = `${r.side}|${price.toPrecision(12)}|${r.source_path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  function parseProviderSymbolRegistry(payload, expectedSymbol) {
    const target = `${txt(expectedSymbol).toUpperCase()}USDT`;
    const sourceTs = rootSourceTimestamp(payload);
    const rows = Array.isArray(payload?.symbols) ? payload.symbols : [];
    const scanned = rows.slice(0, MAX_SYMBOL_REGISTRY_ROWS_SCANNED);
    const exact = scanned.find((row) => txt(row?.symbol).toUpperCase() === target) || null;
    return {
      source_ts: sourceTs,
      target_symbol: target || null,
      exact_match: Boolean(exact),
      matched_symbol: exact ? txt(exact.symbol).toUpperCase() : null,
      registry_size: rows.length,
      rows_scanned: scanned.length,
      scan_truncated: rows.length > scanned.length,
    };
  }

  function parseProjectedMap(payload, { observedTs, expectedSymbol } = {}) {
    const sourceTs = rootSourceTimestamp(payload);
    const currentPrice = currentPriceFrom(payload);
    const venues = explicitVenues(payload);
    const rows = [];
    const discovered = projectedContainerEntries(payload);
    let rawRowsScanned = 0;
    let rawRowsTruncated = discovered.graph_scan_truncated;
    outer: for (const c of discovered.entries) {
      for (const row of c.rows) {
        if (rawRowsScanned >= MAX_PROJECTED_RAW_ROWS_SCANNED) {
          rawRowsTruncated = true;
          break outer;
        }
        rawRowsScanned += 1;
        const parsed = rowLevel(row, c.path, currentPrice, sourceTs, observedTs);
        if (parsed) rows.push(parsed);
      }
    }
    rows.push(...summaryClusters(payload, currentPrice, sourceTs, observedTs));
    const allClusters = dedupeClusters(rows);
    const clusters = allClusters.slice(0, MAX_PROJECTED_CLUSTERS_RETURNED);
    const clusterOutputTruncated = allClusters.length > clusters.length;
    const responseSymbol = txt(payload?.symbol || payload?.data?.symbol || payload?.market?.symbol || payload?.instrument || payload?.data?.instrument).toUpperCase();
    const symbolMatch = !responseSymbol || !expectedSymbol ? null : (
      responseSymbol === expectedSymbol.toUpperCase() || responseSymbol === `${expectedSymbol.toUpperCase()}USDT`
    );
    return {
      source_ts: sourceTs,
      current_price: currentPrice,
      venues_covered: venues,
      clusters,
      response_symbol: responseSymbol || null,
      response_symbol_match: symbolMatch,
      graph_nodes_scanned: discovered.graph_nodes_scanned,
      raw_rows_scanned: rawRowsScanned,
      scan_truncated: rawRowsTruncated || clusterOutputTruncated,
      cluster_output_truncated: clusterOutputTruncated,
    };
  }

  function findSymbolRows(node, symbol, out = [], depth = 0, path = "root", state = null) {
    const scan = state || { nodes_scanned: 0, scan_truncated: false, matched_rows: 0, output_truncated: false, visited: new WeakSet() };
    if (depth > 6 || node === null || node === undefined) return out;
    if (scan.nodes_scanned >= MAX_PROVIDER_GRAPH_NODES_SCANNED) {
      scan.scan_truncated = true;
      return out;
    }
    scan.nodes_scanned += 1;
    if (typeof node === "object") {
      if (scan.visited.has(node)) return out;
      scan.visited.add(node);
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (scan.nodes_scanned >= MAX_PROVIDER_GRAPH_NODES_SCANNED) {
          scan.scan_truncated = true;
          break;
        }
        findSymbolRows(node[i], symbol, out, depth + 1, `${path}[${i}]`, scan);
      }
      return out;
    }
    if (typeof node !== "object") return out;
    const sym = txt(node.symbol || node.contract || node.instrument || node.instId || node.market).toUpperCase();
    const target = txt(symbol).toUpperCase();
    if (sym && target && (sym === target || sym === `${target}USDT` || sym.replace(/[-_/]/g, "") === `${target}USDT`)) {
      scan.matched_rows += 1;
      if (out.length < MAX_REALIZED_ROWS_RETURNED) out.push({ path, row: node });
      else scan.output_truncated = true;
    }
    for (const [k, v] of Object.entries(node)) {
      if (scan.nodes_scanned >= MAX_PROVIDER_GRAPH_NODES_SCANNED) {
        scan.scan_truncated = true;
        break;
      }
      if (typeof v === "object" && v !== null) findSymbolRows(v, symbol, out, depth + 1, `${path}.${k}`, scan);
    }
    return out;
  }

  function longShortFromObject(obj) {
    if (!obj || typeof obj !== "object") return { longs: null, shorts: null, total: null, unit: null };
    const longKeys = ["long_usd", "longUsd", "longs_usd", "longsUsd", "long_liquidations_usd", "longLiquidationsUsd", "long", "longs"];
    const shortKeys = ["short_usd", "shortUsd", "shorts_usd", "shortsUsd", "short_liquidations_usd", "shortLiquidationsUsd", "short", "shorts"];
    let longs = null, shorts = null;
    for (const k of longKeys) { const n = finite(obj[k]); if (n !== null) { longs = n; break; } }
    for (const k of shortKeys) { const n = finite(obj[k]); if (n !== null) { shorts = n; break; } }
    const total = finite(obj.total_usd ?? obj.totalUsd ?? obj.total ?? obj.recorded_usd ?? obj.recordedUsd);
    const unit = (longs !== null || shorts !== null || total !== null) ? "PROVIDER_REPORTED_NOTIONAL_UNVERIFIED_UNIT" : null;
    return { longs, shorts, total, unit };
  }

  function parseRealizedSummary(payload, expectedSymbol, observedTs) {
    const sourceTs = rootSourceTimestamp(payload);
    const scan = { nodes_scanned: 0, scan_truncated: false, matched_rows: 0, output_truncated: false, visited: new WeakSet() };
    const rows = findSymbolRows(payload, expectedSymbol, [], 0, "root", scan);
    const compact = [];
    for (const item of rows) {
      const ls = longShortFromObject(item.row);
      const venue = txt(item.row.venue || item.row.exchange || item.row.source) || null;
      const eventTs = normalizeTs(item.row.event_time || item.row.timestamp || item.row.ts || item.row.time || sourceTs);
      const price = finite(item.row.price || item.row.bankruptcy_price || item.row.bankruptcyPrice);
      const size = finite(item.row.quote_qty || item.row.quoteQty || item.row.notional_usd || item.row.notionalUsd || item.row.size_usd || item.row.sizeUsd);
      if (ls.longs === null && ls.shorts === null && ls.total === null && price === null && size === null) continue;
      compact.push({
        evidence_type: "REALIZED_LIQUIDATION_AGGREGATE",
        provider: PROVIDER,
        source_path: item.path,
        venue,
        source_ts: eventTs,
        observed_ts: observedTs,
        long_notional: ls.longs,
        short_notional: ls.shorts,
        total_notional: ls.total,
        source_unit: ls.unit,
        event_price: price,
        event_notional: size,
      });
    }
    const topReal = payload?.real_levels?.totals || payload?.data?.real_levels?.totals || null;
    if (topReal && typeof topReal === "object") {
      const ls = longShortFromObject(topReal);
      if (ls.longs !== null || ls.shorts !== null || ls.total !== null) {
        compact.push({
          evidence_type: "REALIZED_LIQUIDATION_AGGREGATE",
          provider: PROVIDER,
          source_path: "real_levels.totals",
          venue: "MULTI_VENUE_RECORDED",
          source_ts: sourceTs,
          observed_ts: observedTs,
          long_notional: ls.longs,
          short_notional: ls.shorts,
          total_notional: ls.total,
          source_unit: ls.unit,
          event_price: null,
          event_notional: null,
        });
      }
    }
    return {
      source_ts: sourceTs,
      rows: compact,
      graph_nodes_scanned: scan.nodes_scanned,
      matched_rows_within_scan: scan.matched_rows,
      scan_truncated: scan.scan_truncated || scan.output_truncated,
    };
  }

  function parseCoverage(payload, observedTs) {
    const sourceTs = rootSourceTimestamp(payload);
    const raw = Array.isArray(payload?.liquidations) ? payload.liquidations : (Array.isArray(payload?.data?.liquidations) ? payload.data.liquidations : []);
    const scanned = raw.slice(0, MAX_COVERAGE_ROWS_SCANNED);
    const venues = scanned.map(r => ({
      venue: txt(r?.venue || r?.exchange || r?.name || r?.id) || null,
      coverage_kind: txt(r?.kind || r?.coverage_kind || r?.coverage || r?.status) || null,
      since: txt(r?.since || r?.since_date) || null,
      events_24h: finite(r?.events_24h ?? r?.events24h ?? r?.count_24h),
      last_record_ts: normalizeTs(r?.last_record || r?.lastRecord || r?.last_ts || r?.lastTs),
    })).filter(r => r.venue);
    return {
      evidence_type: "MULTI_VENUE_MODEL_COVERAGE",
      provider: PROVIDER,
      source_ts: sourceTs,
      observed_ts: observedTs,
      venues,
      rows_scanned: scanned.length,
      scan_truncated: raw.length > scanned.length,
    };
  }

  function explicitUnsupported(payload) {
    const status = txt(payload?.status || payload?.data?.status).toUpperCase();
    const msg = txt(payload?.error?.message || payload?.error || payload?.message || payload?.msg).toUpperCase();
    const combined = status + " " + msg;
    // Only symbol/data semantics count as unsupported. A generic HTTP/route
    // "not found" must remain SOURCE_ERROR rather than being silently accepted.
    return /UNSUPPORTED(?:[_ ]+SYMBOL)?|UNKNOWN[_ ]?SYMBOL|SYMBOL[^\n]{0,80}NOT[_ ]?FOUND|NO[_ ]?DATA/.test(combined);
  }

  function rankClusters(clusters, currentPrice) {
    const above = clusters.filter(r => r.side === "SHORT_LIQUIDATION_ABOVE" && finite(r.level_price) !== null).sort((a,b)=>a.level_price-b.level_price);
    const below = clusters.filter(r => r.side === "LONG_LIQUIDATION_BELOW" && finite(r.level_price) !== null).sort((a,b)=>b.level_price-a.level_price);
    const explicitMajorAbove = above.filter(r => r.explicit_major);
    const explicitMajorBelow = below.filter(r => r.explicit_major);
    const byNotional = rows => rows.filter(r => finite(r.raw_size) !== null && r.source_unit === "USD_NOTIONAL_PROVIDER").sort((a,b)=>b.raw_size-a.raw_size);
    const byStrength = rows => rows.filter(r => finite(r.normalized_strength) !== null).sort((a,b)=>b.normalized_strength-a.normalized_strength);
    const largestAbove = byNotional(above)[0] || null;
    const largestBelow = byNotional(below)[0] || null;
    const strongestAbove = byStrength(above)[0] || null;
    const strongestBelow = byStrength(below)[0] || null;
    function compact(r) {
      if (!r) return null;
      return {
        side: r.side,
        level_price: r.level_price,
        price_low: r.price_low,
        price_high: r.price_high,
        raw_size: r.raw_size,
        source_unit: r.source_unit,
        normalized_strength: r.normalized_strength,
        distance_pct: r.distance_pct,
        leverage_bucket: r.leverage_bucket,
        explicit_major: r.explicit_major,
      };
    }
    function gap(rows) {
      if (rows.length < 2 || !currentPrice) return null;
      return Math.abs((rows[1].level_price / currentPrice - rows[0].level_price / currentPrice) * 100);
    }
    return {
      nearest_projected_cluster_above: compact(above[0] || null),
      nearest_projected_cluster_below: compact(below[0] || null),
      nearest_major_cluster_above: compact(explicitMajorAbove[0] || null),
      nearest_major_cluster_below: compact(explicitMajorBelow[0] || null),
      largest_cluster_above: compact(largestAbove),
      largest_cluster_below: compact(largestBelow),
      strongest_cluster_above: compact(strongestAbove),
      strongest_cluster_below: compact(strongestBelow),
      secondary_cascade_zone_above: compact(above[1] || null),
      secondary_cascade_zone_below: compact(below[1] || null),
      gap_to_next_cluster_above_pct: gap(above),
      gap_to_next_cluster_below_pct: gap(below),
    };
  }

  function htxRealizedCompact(htxTape) {
    if (!htxTape || typeof htxTape !== "object") return null;
    const summary = htxTape.summary || {};
    return {
      evidence_type: "REALIZED_LIQUIDATION_AGGREGATE",
      provider: "HTX official public API",
      venue: "HTX",
      coverage_long: htxTape?.coverage?.htx_factual_long_liquidations || "not_closed",
      coverage_short: htxTape?.coverage?.htx_factual_short_liquidations || "not_closed",
      long_events: finite(summary?.long_liquidations?.events),
      long_notional_usdt: finite(summary?.long_liquidations?.notional_usdt),
      short_events: finite(summary?.short_liquidations?.events),
      short_notional_usdt: finite(summary?.short_liquidations?.notional_usdt),
      total_events: finite(summary?.total_events),
      latest_event_time: htxTape?.freshness?.latest_event_time || null,
      source_ts: normalizeTs(htxTape?.timestamp),
    };
  }

  function clusterKey(contract, cluster) {
    const p = finite(cluster?.level_price);
    if (p === null) return null;
    const normalized = Number(p.toPrecision(10));
    return `${PROVIDER}|${contract}|${cluster.side}|${normalized}`;
  }

  function lifecycleFor(cluster, currentPrice) {
    const p = finite(cluster?.level_price);
    const c = finite(currentPrice);
    if (p === null || c === null || c <= 0) return "ACTIVE";
    const dist = Math.abs((p / c - 1) * 100);
    if (cluster.side === "LONG_LIQUIDATION_BELOW" && c <= p) return "SWEPT";
    if (cluster.side === "SHORT_LIQUIDATION_ABOVE" && c >= p) return "SWEPT";
    if (dist <= 0.15) return "TOUCHED";
    if (dist <= 1.0) return "APPROACHING";
    return "ACTIVE";
  }

  async function collectCrossVenueLiquidationIntelligence({ contract_code, fetch_impl, api_key, now_ts = Date.now(), htx_liquidation_tape = null } = {}) {
    const nowTs = finite(now_ts) ?? Date.now();
    const contract = txt(contract_code).normalize("NFC").toUpperCase();
    const alias = providerSymbolFromContract(contract);
    const baseOutput = {
      version: RULES_VERSION,
      contract_version: CONTRACT_VERSION,
      mode: "LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION",
      contract_code: contract,
      observed_ts: nowTs,
      provider: PROVIDER,
      provider_symbol: alias.provider_symbol,
      alias_verified: alias.alias_verified,
      alias_verification_scope: alias.alias_verification_scope,
      asset_identity_verified: alias.asset_identity_verified,
      cross_source_consensus: "NOT_AVAILABLE_SINGLE_PROJECTED_PROVIDER",
      projected_map_status: "NOT_CLOSED",
      realized_status: "NOT_CLOSED",
      liquidation_dq_status: "NOT_CLOSED",
      projected_clusters: [],
      realized: { provider: [], htx: htxRealizedCompact(htx_liquidation_tape) },
      coverage: null,
      derived: {},
      source_health: {},
      errors: [],
      safety: {
        strategy_weights_changed: false,
        new_percentage_weight: false,
        direction_generated: false,
        live_probability_generated: false,
        live_signal_generated: false,
        validated_signal_generated: false,
        telegram_started: false,
        trading_execution: false,
        automatic_weight_tuning: false,
        guaranteed_tp_generated: false,
        synthetic_leverage_heatmap_generated: false,
        shadow_only: true,
      },
    };

    if (!alias.compatible || !alias.provider_symbol) {
      return {
        ...baseOutput,
        projected_map_status: "SOURCE_INCOMPATIBLE",
        realized_status: baseOutput.realized.htx ? "PARTIAL_HTX_ONLY" : "NOT_CLOSED",
        liquidation_dq_status: "SOURCE_INCOMPATIBLE",
        errors: [alias.reason || "ALIAS_NOT_SAFE"],
        source_health: { external_fetches: 0, key_configured: Boolean(txt(api_key)) },
      };
    }

    if (!txt(api_key)) {
      return {
        ...baseOutput,
        projected_map_status: "CONFIG_REQUIRED_FREE_API_KEY",
        realized_status: baseOutput.realized.htx ? "PARTIAL_HTX_ONLY" : "CONFIG_REQUIRED_FREE_API_KEY",
        liquidation_dq_status: "CONFIG_REQUIRED",
        errors: ["BYKARANTELI_API_KEY_MISSING"],
        source_health: { external_fetches: 0, key_configured: false },
      };
    }

    const q = encodeURIComponent(alias.provider_symbol);
    const urls = {
      liqmap: `${PROVIDER_BASE}/api/liqmap/public?symbol=${q}`,
      liquidations: `${PROVIDER_BASE}/api/public/liquidations?symbol=${q}USDT`,
      coverage: `${PROVIDER_BASE}/api/public/coverage`,
      symbols: `${PROVIDER_BASE}/api/public/symbols?top=1000`,
    };
    const [mapRaw, realizedRaw, coverageRaw, symbolsRaw] = await Promise.all([
      fetchJson(fetch_impl, urls.liqmap, api_key),
      fetchJson(fetch_impl, urls.liquidations, api_key),
      fetchJson(fetch_impl, urls.coverage, api_key),
      fetchJson(fetch_impl, urls.symbols, api_key),
    ]);

    const errors = [];
    for (const [name, raw] of Object.entries({ liqmap: mapRaw, liquidations: realizedRaw, coverage: coverageRaw, symbols: symbolsRaw })) {
      if (!raw.ok) errors.push(`${name}:${raw.error || "ERROR"}`);
      if (raw.retry_after_sec !== null) errors.push(`${name}:RETRY_AFTER_${raw.retry_after_sec}`);
    }

    let projected = {
      source_ts: null, current_price: null, venues_covered: [], clusters: [],
      response_symbol: null, response_symbol_match: null, graph_nodes_scanned: 0,
      raw_rows_scanned: 0, scan_truncated: false, cluster_output_truncated: false,
    };
    if (mapRaw.ok) projected = parseProjectedMap(mapRaw.data, { observedTs: nowTs, expectedSymbol: alias.provider_symbol });
    const mapFresh = ageStatus(projected.source_ts, nowTs, PUBLIC_MAP_MAX_AGE_SEC);
    // A provider may return an explicit "unsupported symbol" payload with a non-2xx
    // status. Classify that semantic result before generic transport/source errors.
    // This keeps unsupported assets fail-closed without mislabelling them as outages.
    const unsupported = explicitUnsupported(mapRaw.data) || /UNSUPPORTED(?:[_ ]+SYMBOL)?|UNKNOWN[_ ]?SYMBOL|SYMBOL[^\n]{0,80}NOT[_ ]?FOUND|NO[_ ]?DATA/i.test(txt(mapRaw.error));
    const responseMismatch = projected.response_symbol_match === false;
    const symbolRegistry = symbolsRaw.ok
      ? parseProviderSymbolRegistry(symbolsRaw.data, alias.provider_symbol)
      : {
          source_ts: null, target_symbol: `${alias.provider_symbol}USDT`, exact_match: false,
          matched_symbol: null, registry_size: 0, rows_scanned: 0, scan_truncated: false,
        };
    const providerAliasVerified = !responseMismatch && (projected.response_symbol_match === true || symbolRegistry.exact_match === true);
    const aliasVerificationScope = projected.response_symbol_match === true
      ? "PROVIDER_RESPONSE_SYMBOL_EXACT_MATCH"
      : (symbolRegistry.exact_match === true ? "PROVIDER_SYMBOL_REGISTRY_EXACT_MATCH" : alias.alias_verification_scope);

    let projectedStatus = "NOT_CLOSED";
    if (unsupported) projectedStatus = "SOURCE_UNSUPPORTED";
    else if (!mapRaw.ok) projectedStatus = mapRaw.http_status === 401 || mapRaw.http_status === 403 ? "AUTH_ERROR" : "SOURCE_ERROR";
    else if (responseMismatch) projectedStatus = "SOURCE_INCOMPATIBLE";
    else if (mapFresh.status !== "CURRENT") projectedStatus = mapFresh.status;
    else if (projected.scan_truncated) projectedStatus = "SOURCE_PAYLOAD_TRUNCATED";
    else if (projected.clusters.length === 0) projectedStatus = "NOT_CLOSED_NO_PROJECTED_LEVELS";
    else if (!providerAliasVerified) projectedStatus = "OBSERVATION_ONLY_ALIAS_UNVERIFIED";
    else projectedStatus = "OBSERVATION_ONLY_IDENTITY_UNVERIFIED";

    const realizedParsed = realizedRaw.ok
      ? parseRealizedSummary(realizedRaw.data, alias.provider_symbol, nowTs)
      : { source_ts: null, rows: [], graph_nodes_scanned: 0, matched_rows_within_scan: 0, scan_truncated: false };
    const realizedFresh = ageStatus(realizedParsed.source_ts, nowTs, REALIZED_MAX_AGE_SEC);
    let realizedStatus = baseOutput.realized.htx ? "PARTIAL_HTX_ONLY" : "NOT_CLOSED";
    if (realizedRaw.ok && realizedParsed.scan_truncated) realizedStatus = "SOURCE_PAYLOAD_TRUNCATED";
    else if (realizedRaw.ok && realizedParsed.rows.length && realizedFresh.status === "CURRENT") realizedStatus = "OBSERVATION_ONLY_IDENTITY_UNVERIFIED";
    else if (!realizedRaw.ok && baseOutput.realized.htx) realizedStatus = "PARTIAL_HTX_ONLY";
    else if (!realizedRaw.ok) realizedStatus = "SOURCE_ERROR";
    else if (realizedFresh.status !== "CURRENT" && realizedParsed.rows.length) realizedStatus = realizedFresh.status;

    const coverage = coverageRaw.ok ? parseCoverage(coverageRaw.data, nowTs) : null;
    const currentPrice = projected.current_price;
    const clusters = projected.clusters.map(c => ({
      ...c,
      canonical_htx_contract: contract,
      provider_symbol: alias.provider_symbol,
      alias_verified: providerAliasVerified,
      alias_verification_scope: aliasVerificationScope,
      asset_identity_verified: false,
      lifecycle: lifecycleFor(c, currentPrice),
      cluster_key: clusterKey(contract, c),
      first_seen: nowTs,
      last_seen: nowTs,
      persistence_observations: 1,
      realized_confirmation_after_touch: null,
      disagreement: null,
      uncertainty: ["ASSET_IDENTITY_NOT_SEPARATELY_VERIFIED", "SINGLE_PROJECTED_MODEL_NO_CROSS_SOURCE_CONSENSUS"],
    }));
    const derived = rankClusters(clusters, currentPrice);
    const coveredVenues = projected.venues_covered;

    let dq = "NOT_CLOSED";
    if (["OBSERVATION_ONLY_IDENTITY_UNVERIFIED", "OBSERVATION_ONLY_ALIAS_UNVERIFIED"].includes(projectedStatus)) dq = projectedStatus;
    else if (["SOURCE_UNSUPPORTED", "SOURCE_INCOMPATIBLE", "AUTH_ERROR", "SOURCE_ERROR", "SOURCE_PAYLOAD_TRUNCATED", "STALE", "FUTURE", "MISSING_SOURCE_TIMESTAMP"].includes(projectedStatus)) dq = projectedStatus;

    return {
      ...baseOutput,
      provider_symbol: alias.provider_symbol,
      alias_verified: providerAliasVerified,
      alias_verification_scope: aliasVerificationScope,
      asset_identity_verified: false,
      projected_map_status: projectedStatus,
      realized_status: realizedStatus,
      liquidation_dq_status: dq,
      projected_source_ts: projected.source_ts,
      projected_source_age_sec: mapFresh.age_sec,
      projected_freshness: mapFresh.status,
      provider_current_price: currentPrice,
      projected_clusters: clusters,
      realized: { provider: realizedParsed.rows, htx: baseOutput.realized.htx },
      coverage,
      derived: {
        ...derived,
        covered_venue_count: coveredVenues.length || null,
        venues_covered: coveredVenues,
        covered_oi_share: null,
        cross_venue_max_cluster: null,
        cross_venue_max_cluster_reason: "Provider is one aggregated multi-venue model; per-venue contribution was not proven by this adapter.",
        cross_source_consensus: "NOT_AVAILABLE",
      },
      source_health: {
        external_fetches: 4,
        key_configured: true,
        liqmap_http_status: mapRaw.http_status,
        realized_http_status: realizedRaw.http_status,
        coverage_http_status: coverageRaw.http_status,
        symbols_http_status: symbolsRaw.http_status,
        liqmap_ok: mapRaw.ok,
        realized_ok: realizedRaw.ok,
        coverage_ok: coverageRaw.ok,
        symbols_ok: symbolsRaw.ok,
        provider_symbol_registry_exact_match: symbolRegistry.exact_match,
        provider_symbol_registry_size: symbolRegistry.registry_size,
        provider_symbol_registry_rows_scanned: symbolRegistry.rows_scanned,
        provider_symbol_registry_scan_truncated: symbolRegistry.scan_truncated,
        projected_graph_nodes_scanned: projected.graph_nodes_scanned,
        projected_raw_rows_scanned: projected.raw_rows_scanned,
        projected_scan_truncated: projected.scan_truncated,
        projected_cluster_output_truncated: projected.cluster_output_truncated,
        realized_graph_nodes_scanned: realizedParsed.graph_nodes_scanned,
        realized_matched_rows_within_scan: realizedParsed.matched_rows_within_scan,
        realized_scan_truncated: realizedParsed.scan_truncated,
        coverage_rows_scanned: coverage?.rows_scanned ?? 0,
        coverage_scan_truncated: coverage?.scan_truncated ?? false,
        retry_after_sec: Math.max(0, ...[mapRaw.retry_after_sec, realizedRaw.retry_after_sec, coverageRaw.retry_after_sec, symbolsRaw.retry_after_sec].filter(Number.isFinite)),
      },
      errors,
    };
  }

  function jsonCompact(value, fallback) {
    try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
  }

  function boundedLifecycleRows(record, observedTs, contract, observationId) {
    const eligible =
      record?.projected_map_status === "OBSERVATION_ONLY_IDENTITY_UNVERIFIED" &&
      record?.alias_verified === true &&
      record?.projected_freshness === "CURRENT";
    const candidates = (eligible && Array.isArray(record?.projected_clusters)
      ? record.projected_clusters
      : [])
      .filter((cluster) => cluster?.cluster_key && finite(cluster?.level_price) !== null)
      .sort((left, right) =>
        Number(right?.explicit_major === true) - Number(left?.explicit_major === true) ||
        Math.abs(finite(left?.distance_pct) ?? Infinity) - Math.abs(finite(right?.distance_pct) ?? Infinity) ||
        txt(left?.cluster_key).localeCompare(txt(right?.cluster_key))
      );
    return {
      eligible_total: candidates.length,
      rows: candidates.slice(0, MAX_LIFECYCLE_STATE_ROWS).map((cluster) => ({
        cluster_key: cluster.cluster_key,
        provider: record?.provider || PROVIDER,
        contract_code: contract,
        side: cluster.side || "UNKNOWN",
        level_price: cluster.level_price,
        price_low: cluster.price_low ?? null,
        price_high: cluster.price_high ?? null,
        source_unit: cluster.source_unit ?? null,
        first_seen_ts: observedTs,
        last_seen_ts: observedTs,
        lifecycle: cluster.lifecycle || "ACTIVE",
        last_distance_pct: cluster.distance_pct ?? null,
        explicit_major: cluster.explicit_major ? 1 : 0,
        last_raw_size: cluster.raw_size ?? null,
        last_strength: cluster.normalized_strength ?? null,
        source_model_version: RULES_VERSION,
        last_observation_id: observationId,
      })),
    };
  }

  function lifecycleStateStatement(env, rows) {
    if (!rows.length) return null;
    return env.DATA_DB.prepare(`
      INSERT INTO liquidation_cluster_state
      (cluster_key,provider,contract_code,side,level_price,price_low,price_high,source_unit,
       first_seen_ts,last_seen_ts,persistence_observations,lifecycle,last_distance_pct,
       explicit_major,last_raw_size,last_strength,source_model_version,last_observation_id)
      SELECT
        json_extract(value,'$.cluster_key'),json_extract(value,'$.provider'),
        json_extract(value,'$.contract_code'),json_extract(value,'$.side'),
        json_extract(value,'$.level_price'),json_extract(value,'$.price_low'),
        json_extract(value,'$.price_high'),json_extract(value,'$.source_unit'),
        json_extract(value,'$.first_seen_ts'),json_extract(value,'$.last_seen_ts'),1,
        json_extract(value,'$.lifecycle'),json_extract(value,'$.last_distance_pct'),
        json_extract(value,'$.explicit_major'),json_extract(value,'$.last_raw_size'),
        json_extract(value,'$.last_strength'),json_extract(value,'$.source_model_version'),
        json_extract(value,'$.last_observation_id')
      FROM json_each(?1)
      WHERE 1
      ON CONFLICT(cluster_key) DO UPDATE SET
        last_seen_ts=excluded.last_seen_ts,
        persistence_observations=liquidation_cluster_state.persistence_observations+1,
        lifecycle=excluded.lifecycle,
        last_distance_pct=excluded.last_distance_pct,
        explicit_major=excluded.explicit_major,
        last_raw_size=excluded.last_raw_size,
        last_strength=excluded.last_strength,
        source_model_version=excluded.source_model_version,
        last_observation_id=excluded.last_observation_id
        /* REPORT2_D1_CLUSTER_WRITE_SHARD_V1: raw liquidation observation remains per-cycle.
           Unchanged cluster-state summary rows are spread across 3 scanner buckets;
           lifecycle / explicit-major changes still persist immediately.
           No schema, signal, Decision Layer, Telegram or trading change. */
        WHERE
          liquidation_cluster_state.last_seen_ts IS NULL
          OR liquidation_cluster_state.lifecycle IS NOT excluded.lifecycle
          OR liquidation_cluster_state.explicit_major IS NOT excluded.explicit_major
          OR (
            excluded.last_seen_ts - liquidation_cluster_state.last_seen_ts >= 300000
            AND (liquidation_cluster_state.rowid % 3) =
                (CAST(excluded.last_seen_ts / 300000 AS INTEGER) % 3)
          )
    `).bind(jsonCompact(rows, []));
  }

  async function persistShadow(env, record, now = Date.now()) {
    if (!env?.DATA_DB) return { status: "SOURCE_UNSUPPORTED", persisted: false, error: "DATA_DB_NOT_CONFIGURED" };
    const observedTs = finite(record?.observed_ts) ?? now;
    const contract = txt(record?.contract_code) || "UNKNOWN";
    const observationId = `${observedTs}:${contract}:liq371`;
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
      const insert = env.DATA_DB.prepare(`
        INSERT OR IGNORE INTO liquidation_shadow_observation
        (
          observation_id, contract_code, observed_ts, rules_version, contract_version, mode,
          provider, provider_symbol, alias_verified, alias_verification_scope, asset_identity_verified,
          projected_map_status, realized_status, dq_status, source_ts, source_age_sec, freshness_status,
          projected_clusters_json, realized_json, coverage_json, derived_json, source_health_json, errors_json,
          live_probability, live_signal, validated_signal, telegram_started, trading_execution,
          strategy_weights_changed, automatic_weight_tuning_enabled, guaranteed_tp_generated,
          synthetic_leverage_heatmap_generated, shadow_only, persisted_ts
        ) VALUES (
          ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,
          ?18,?19,?20,?21,?22,?23,NULL,0,0,0,0,0,0,0,0,1,?24
        )
      `).bind(
        observationId, contract, observedTs, RULES_VERSION, CONTRACT_VERSION,
        "LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION", record?.provider || PROVIDER,
        record?.provider_symbol || null, record?.alias_verified ? 1 : 0,
        record?.alias_verification_scope || null, record?.asset_identity_verified ? 1 : 0,
        record?.projected_map_status || "NOT_CLOSED", record?.realized_status || "NOT_CLOSED",
        record?.liquidation_dq_status || "NOT_CLOSED", record?.projected_source_ts ?? null,
        record?.projected_source_age_sec ?? null, record?.projected_freshness || null,
        jsonCompact(record?.projected_clusters, []), jsonCompact(record?.realized, {}),
        jsonCompact(record?.coverage, {}), jsonCompact(record?.derived, {}),
        jsonCompact(record?.source_health, {}), jsonCompact(record?.errors, []), now
      );

      const lifecycle = boundedLifecycleRows(record, observedTs, contract, observationId);
      const stateStatement = lifecycleStateStatement(env, lifecycle.rows);
      const cleanupObs = env.DATA_DB.prepare(`DELETE FROM liquidation_shadow_observation WHERE observed_ts < ?1`).bind(cutoff);
      const expireState = env.DATA_DB.prepare(`UPDATE liquidation_cluster_state SET lifecycle='EXPIRED' WHERE last_seen_ts < ?1 AND lifecycle NOT IN ('SWEPT','INVALIDATED','EXPIRED')`).bind(now - 24 * 60 * 60 * 1000);
      const deleteState = env.DATA_DB.prepare(`DELETE FROM liquidation_cluster_state WHERE last_seen_ts < ?1`).bind(cutoff);
      const statements = [insert, ...(stateStatement ? [stateStatement] : []), cleanupObs, expireState, deleteState];
      const results = await env.DATA_DB.batch(statements);
      return {
        status: "CLOSED",
        persisted: true,
        insert_changes: Number(results?.[0]?.meta?.changes ?? 0),
        state_rows_eligible: lifecycle.eligible_total,
        state_rows_attempted: lifecycle.rows.length,
        state_rows_capacity_dropped: Math.max(0, lifecycle.eligible_total - lifecycle.rows.length),
        d1_statements: statements.length,
        d1_statement_cap: 5,
        error: null,
      };
    } catch (error) {
      return { status: "PARTIAL", persisted: false, error: txt(error?.message || error).slice(0, 600) };
    }
  }

  async function dataPlaneSummary(env, now = Date.now()) {
    const safe = {
      table_available: false,
      mode: "LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION",
      rules_version: RULES_VERSION,
      contract_version: CONTRACT_VERSION,
      projected_model_provider: PROVIDER,
      cross_source_consensus: "NOT_AVAILABLE_SINGLE_PROJECTED_PROVIDER",
      changes_strategy_weights: false,
      new_percentage_weight: false,
      live_probability_generated: false,
      live_signal_generated: false,
      validated_signal_generated: false,
      telegram_started: false,
      trading_execution: false,
      automatic_weight_tuning_enabled: false,
      guaranteed_tp_generated: false,
      synthetic_leverage_heatmap_generated: false,
      shadow_only: true,
      retention_days: RETENTION_DAYS,
    };
    if (!env?.DATA_DB) return { ...safe, error: "DATA_DB_NOT_CONFIGURED" };
    try {
      const since = now - 24 * 60 * 60 * 1000;
      const summary = await env.DATA_DB.prepare(`
        SELECT COUNT(*) total,
          SUM(CASE WHEN projected_map_status='OBSERVATION_ONLY_IDENTITY_UNVERIFIED' THEN 1 ELSE 0 END) projected_observations,
          SUM(CASE WHEN projected_map_status='SOURCE_UNSUPPORTED' THEN 1 ELSE 0 END) source_unsupported,
          SUM(CASE WHEN projected_map_status='SOURCE_INCOMPATIBLE' THEN 1 ELSE 0 END) source_incompatible,
          SUM(CASE WHEN projected_map_status='CONFIG_REQUIRED_FREE_API_KEY' THEN 1 ELSE 0 END) config_required,
          SUM(CASE WHEN live_probability IS NOT NULL THEN 1 ELSE 0 END) nonnull_live_probability,
          SUM(live_signal) live_signals, SUM(validated_signal) validated_signals,
          SUM(telegram_started) telegram_started, SUM(trading_execution) trading_execution,
          SUM(strategy_weights_changed) strategy_weights_changed,
          SUM(automatic_weight_tuning_enabled) automatic_weight_tuning_enabled,
          SUM(guaranteed_tp_generated) guaranteed_tp_generated,
          SUM(synthetic_leverage_heatmap_generated) synthetic_heatmap_generated
        FROM liquidation_shadow_observation WHERE observed_ts >= ?1
      `).bind(since).first();
      const recentResult = await env.DATA_DB.prepare(`
        SELECT observation_id,contract_code,observed_ts,provider,provider_symbol,alias_verified,
          alias_verification_scope,asset_identity_verified,projected_map_status,realized_status,dq_status,
          source_ts,source_age_sec,freshness_status,derived_json,source_health_json,errors_json,
          live_probability,live_signal,validated_signal,telegram_started,trading_execution,
          strategy_weights_changed,automatic_weight_tuning_enabled,guaranteed_tp_generated,
          synthetic_leverage_heatmap_generated,shadow_only
        FROM liquidation_shadow_observation ORDER BY observed_ts DESC LIMIT 8
      `).all();
      const states = await env.DATA_DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN lifecycle='ACTIVE' THEN 1 ELSE 0 END) active, SUM(CASE WHEN lifecycle='APPROACHING' THEN 1 ELSE 0 END) approaching, SUM(CASE WHEN lifecycle='TOUCHED' THEN 1 ELSE 0 END) touched, SUM(CASE WHEN lifecycle='SWEPT' THEN 1 ELSE 0 END) swept FROM liquidation_cluster_state`).first();
      const parse = (v, fallback) => { try { return JSON.parse(v || JSON.stringify(fallback)); } catch { return fallback; } };
      const recent = Array.isArray(recentResult?.results) ? recentResult.results.map(r => ({
        observation_id: r.observation_id,
        contract: r.contract_code,
        observed_ts: Number(r.observed_ts) || null,
        observed_age_sec: Number.isFinite(Number(r.observed_ts)) ? Math.max(0, now - Number(r.observed_ts))/1000 : null,
        provider: r.provider,
        provider_symbol: r.provider_symbol,
        alias_verified: Number(r.alias_verified) === 1,
        alias_verification_scope: r.alias_verification_scope,
        asset_identity_verified: Number(r.asset_identity_verified) === 1,
        projected_map_status: r.projected_map_status,
        realized_status: r.realized_status,
        liquidation_dq_status: r.dq_status,
        source_ts: Number(r.source_ts) || null,
        source_age_sec: r.source_age_sec === null ? null : Number(r.source_age_sec),
        freshness_status: r.freshness_status,
        derived: parse(r.derived_json, {}),
        source_health: parse(r.source_health_json, {}),
        errors: parse(r.errors_json, []),
        safety: {
          live_probability: r.live_probability ?? null,
          live_signal: Number(r.live_signal) === 1,
          validated_signal: Number(r.validated_signal) === 1,
          telegram_started: Number(r.telegram_started) === 1,
          trading_execution: Number(r.trading_execution) === 1,
          strategy_weights_changed: Number(r.strategy_weights_changed) === 1,
          automatic_weight_tuning_enabled: Number(r.automatic_weight_tuning_enabled) === 1,
          guaranteed_tp_generated: Number(r.guaranteed_tp_generated) === 1,
          synthetic_leverage_heatmap_generated: Number(r.synthetic_leverage_heatmap_generated) === 1,
          shadow_only: Number(r.shadow_only) === 1,
        },
      })) : [];
      return {
        ...safe,
        table_available: true,
        summary_24h: {
          total: Number(summary?.total ?? 0),
          projected_observations: Number(summary?.projected_observations ?? 0),
          source_unsupported: Number(summary?.source_unsupported ?? 0),
          source_incompatible: Number(summary?.source_incompatible ?? 0),
          config_required: Number(summary?.config_required ?? 0),
          nonnull_live_probability: Number(summary?.nonnull_live_probability ?? 0),
          live_signals: Number(summary?.live_signals ?? 0),
          validated_signals: Number(summary?.validated_signals ?? 0),
          telegram_started: Number(summary?.telegram_started ?? 0),
          trading_execution: Number(summary?.trading_execution ?? 0),
          strategy_weights_changed: Number(summary?.strategy_weights_changed ?? 0),
          automatic_weight_tuning_enabled: Number(summary?.automatic_weight_tuning_enabled ?? 0),
          guaranteed_tp_generated: Number(summary?.guaranteed_tp_generated ?? 0),
          synthetic_heatmap_generated: Number(summary?.synthetic_heatmap_generated ?? 0),
        },
        cluster_state: {
          total: Number(states?.total ?? 0), active: Number(states?.active ?? 0), approaching: Number(states?.approaching ?? 0), touched: Number(states?.touched ?? 0), swept: Number(states?.swept ?? 0),
        },
        recent,
      };
    } catch (error) {
      return { ...safe, error: txt(error?.message || error).slice(0, 600) };
    }
  }

  return {
    RULES_VERSION,
    CONTRACT_VERSION,
    providerSymbolFromContract,
    parseProviderSymbolRegistry,
    parseProjectedMap,
    parseRealizedSummary,
    parseCoverage,
    collectCrossVenueLiquidationIntelligence,
    persistShadow,
    dataPlaneSummary,
  };
})();

async function buildDeepCheckInput(params, env) {
  const cycleStartedTs = Date.now();
  let now = cycleStartedTs;
  const sharedFetch = createPerDeepCheckFetchCache();

  const contract =
    normalizeFuturesContract(
      params?.contract ||
      params?.contract_code ||
      params?.symbol ||
      "ETHFI-USDT"
    );

  const futuresParams = {
    contract,
    notional_usdt: 1000,
    trades: 2000,
    _fetch_json: sharedFetch.fetch,
  };

  const spotParams = {
    symbol: contract,
    notional_usdt: 1000,
    trades: 2000,
    freshness_sec: 900,
    _fetch_json: sharedFetch.fetch,
  };

  const trajectoryParams = {
    contract,
    trades: 2000,
    kline_size: 1600,
    _fetch_json: sharedFetch.fetch,
  };

  const historyParams = {
    contract,
    hours: 6,
  };

  const results =
    await Promise.allSettled([
      futuresSnapshot(futuresParams),
      spotSnapshot(spotParams),
      futuresTrajectory(trajectoryParams),
      htxStage0History(
        historyParams,
        env
      ),
    ]);

  // Conservative factual availability bound: all four promises have settled.
  // Keep provider timestamps unchanged; collection time is a different field.
  const componentsAvailableTs = Date.now();

  function settled(result) {
    if (result.status === "fulfilled") {
      return {
        available_ts: componentsAvailableTs,
        execution_status: "FULFILLED",
        data: result.value,
        error: null,
      };
    }

    return {
      execution_status: "REJECTED",
      data: null,
      error: String(
        result.reason?.message ||
        result.reason ||
        "UNKNOWN_ERROR"
      ),
    };
  }

  const futures =
    settled(results[0]);

  const spot =
    settled(results[1]);

  const trajectory =
    settled(results[2]);

  const history =
    settled(results[3]);

  const failedComponents = [
    ["futures_snapshot", futures],
    ["spot_snapshot", spot],
    ["futures_trajectory", trajectory],
    ["stage0_history", history],
  ]
    .filter(
      ([, component]) =>
        component.execution_status !==
        "FULFILLED"
    )
    .map(([name]) => name);


  const dataSufficiency = (() => {
    const closed = (value) =>
      value === "closed";

    const makeComponent = (
      component,
      usable,
      checks
    ) => {
      const gaps =
        checks
          .filter(([, ok]) => !ok)
          .map(([name]) => name);

      let sufficiency =
        "SUFFICIENT";

      if (
        component?.execution_status !==
          "FULFILLED" ||
        !component?.data ||
        !usable
      ) {
        sufficiency =
          "INSUFFICIENT";
      } else if (gaps.length) {
        sufficiency =
          "PARTIAL";
      }

      return {
        execution_status:
          component?.execution_status ??
          "UNKNOWN",
        sufficiency,
        gaps,
      };
    };

    const futuresCoverage =
      futures?.data?.coverage || {};

    const futuresChecks = [
      [
        "htx_futures_liquidity",
        closed(
          futuresCoverage
            .htx_futures_liquidity
        ),
      ],
      [
        "htx_futures_order_flow",
        closed(
          futuresCoverage
            .htx_futures_order_flow
        ),
      ],
      [
        "htx_open_interest",
        closed(
          futuresCoverage
            .htx_open_interest
        ),
      ],
      [
        "htx_funding",
        closed(
          futuresCoverage
            .htx_funding
        ),
      ],
    ];

    const futuresUsable =
      futuresChecks.some(([, ok]) => ok);

    const spotQuality =
      spot?.data?.quality_status ?? null;

    const spotChecks = [
      [
        "quality_status_GREEN",
        spotQuality === "GREEN",
      ],
    ];

    const spotUsable =
      spotQuality === "GREEN" ||
      spotQuality === "YELLOW";

    const trajectoryCoverage =
      trajectory?.data?.coverage || {};

    const trajectoryRequired = [
      "price_5m",
      "price_15m",
      "price_1h",
      "price_4h",
      "price_24h",
      "flow_5m",
      "flow_15m",
      "flow_1h",
      "flow_4h",
      "flow_24h",
      "oi_1h",
      "oi_4h",
      "oi_24h",
      "funding_current",
      "funding_history",
    ];

    const trajectoryChecks =
      trajectoryRequired.map(
        (name) => [
          name,
          closed(
            trajectoryCoverage[name]
          ),
        ]
      );

    const trajectoryUsable =
      trajectoryChecks.some(
        ([, ok]) => ok
      );

    const historyData =
      history?.data || null;

    const historySeries =
      Array.isArray(historyData?.series)
        ? historyData.series
        : [];

    const historyChecks = [
      [
        "data_db",
        historyData?.health
          ?.data_db === true,
      ],
      [
        "persistent_history",
        closed(
          historyData?.coverage
            ?.persistent_history
        ),
      ],
      [
        "series_non_empty",
        historySeries.length > 0,
      ],
    ];

    const historyUsable =
      history?.execution_status ===
        "FULFILLED" &&
      historyData?.health
        ?.data_db === true &&
      historySeries.length > 0;

    const components = {
      futures_snapshot:
        makeComponent(
          futures,
          futuresUsable,
          futuresChecks
        ),

      spot_snapshot:
        makeComponent(
          spot,
          spotUsable,
          spotChecks
        ),

      futures_trajectory:
        makeComponent(
          trajectory,
          trajectoryUsable,
          trajectoryChecks
        ),

      stage0_history:
        makeComponent(
          history,
          historyUsable,
          historyChecks
        ),
    };

    const states =
      Object.values(components)
        .map(
          (component) =>
            component.sufficiency
        );

    let classification =
      "SUFFICIENT";

    if (
      states.includes(
        "INSUFFICIENT"
      )
    ) {
      classification =
        "INSUFFICIENT";
    } else if (
      states.includes("PARTIAL")
    ) {
      classification =
        "PARTIAL";
    }

    const gaps =
      Object.entries(components)
        .flatMap(
          ([name, component]) =>
            component.gaps.map(
              (gap) =>
                name + "." + gap
            )
        );

    return {
      classification,
      sufficient:
        classification ===
        "SUFFICIENT",

      components,

      gaps,

      unavailable_by_design: [
        "futures_trajectory.coverage.oi_5m",
        "futures_trajectory.coverage.oi_15m",
      ],

      history_observed: {
        expected_5m_points:
          historyData?.coverage
            ?.expected_5m_points ??
          null,

        received_points:
          historyData?.coverage
            ?.received_points ??
          null,

        approximate_5m_coverage_pct:
          historyData?.coverage
            ?.approximate_5m_coverage_pct ??
          null,
      },

      decision_effect:
        "NONE_EVIDENCE_CLASSIFICATION_ONLY",
    };
  })();


  
  const shadowDecision =
    buildShadowDecisionTelemetry({
      contract,
      now,
      futures,
      spot,
      trajectory,
      history,
      dataSufficiency,
    });

  const shadowPersistence =
    await persistShadowDecisionTelemetry(
      env,
      shadowDecision
    );

  shadowDecision.persistence =
    shadowPersistence;


  let publicEvidence;
  let publicEvidenceAvailableTs = null;
  try {
    publicEvidence =
      await collectPublicFullEvidence({
        contract_code: contract,
        fetch_impl: fetch,
        now_ts: now,
      });
    publicEvidenceAvailableTs = Date.now();
  } catch (error) {
    publicEvidence = {
      version: "public-evidence-adapters-v1",
      contract_code: contract,
      observed_ts: now,
      alias_verification: null,
      evidence: [],
      relative_strength_detail: null,
      cross_venue_derivatives_detail: null,
      collection_error:
        String(error?.message || error).slice(0, 600),
      safety: {
        strategy_weights_changed: false,
        missing_data_directional_penalty: false,
        live_promotion: false,
        telegram: false,
        execution: false,
      },
    };
  }

  let smartMoneyRaw;
  try {
    smartMoneyRaw = await fetchByKaranteliSmartMoneyRaw({
      fetch_impl: fetch,
      contract_code: contract,
      api_key: env?.BYKARANTELI_API_KEY || "",
      observed_ts: now,
    });
  } catch (error) {
    smartMoneyRaw = {
      version: "tz101-smart-money-raw-r8",
      status: "NOT_CLOSED",
      reason: "SOURCE_FETCH_ERROR",
      score_eligible: false,
      directional_vote_eligible: false,
      calibration_required: true,
      external_fetches: 1,
      error: String(error?.message || error).slice(0, 300),
    };
  }
  // R8/TZ10.1: raw Smart Money is supporting/advisory until calibrated.
  // Keep it observable without contaminating entry-critical Full Evidence DQ.
  // The score interval receives smartMoneyRaw separately; no raw PARTIAL row is
  // injected into publicEvidence.evidence before calibration/promotion.
  if (publicEvidence) {
    publicEvidence.advisory_evidence = [
      ...(Array.isArray(publicEvidence.advisory_evidence) ? publicEvidence.advisory_evidence : []),
      ...smartMoneyRawEvidenceRows(smartMoneyRaw, now),
    ];
  }

  let htxLiquidationShadow;
  try {
    htxLiquidationShadow = await htxLiquidationTape(
      { contract, lookback_minutes: 120, persist: true },
      env,
      { persist: true }
    );
  } catch (error) {
    htxLiquidationShadow = {
      source: "HTX official public API",
      tool: "htx_liquidation_tape",
      contract,
      factual_only: true,
      projected_levels_included: false,
      coverage: {
        htx_factual_long_liquidations: "not_closed",
        htx_factual_short_liquidations: "not_closed",
      },
      endpoint_errors: {
        stage371: String(error?.message || error).slice(0, 600),
      },
    };
  }

  let liquidationIntelligence;
  try {
    liquidationIntelligence =
      await LIQUIDATION_INTELLIGENCE_API.collectCrossVenueLiquidationIntelligence({
        contract_code: contract,
        fetch_impl: fetch,
        api_key: env?.BYKARANTELI_API_KEY || "",
        now_ts: now,
        htx_liquidation_tape: htxLiquidationShadow,
      });
  } catch (error) {
    liquidationIntelligence = {
      version: "cross-venue-liquidation-shadow-v1",
      contract_version: "liquidation-evidence-v1",
      mode: "LIQUIDATION_INTELLIGENCE_SHADOW_NO_EXECUTION",
      contract_code: contract,
      observed_ts: now,
      projected_map_status: "NOT_CLOSED",
      realized_status: "PARTIAL_HTX_ONLY",
      liquidation_dq_status: "NOT_CLOSED",
      projected_clusters: [],
      realized: { provider: [], htx: htxLiquidationShadow },
      errors: [String(error?.message || error).slice(0, 600)],
      safety: {
        strategy_weights_changed: false,
        new_percentage_weight: false,
        direction_generated: false,
        live_probability_generated: false,
        live_signal_generated: false,
        validated_signal_generated: false,
        telegram_started: false,
        trading_execution: false,
        automatic_weight_tuning: false,
        guaranteed_tp_generated: false,
        synthetic_leverage_heatmap_generated: false,
        shadow_only: true,
      },
    };
  }

  liquidationIntelligence.persistence =
    await LIQUIDATION_INTELLIGENCE_API.persistShadow(
      env,
      liquidationIntelligence,
      now
    );

  /*
   * Opportunity Intelligence runs only inside an already bounded Deep
   * Check and consumes the factual data collected above. It does not
   * feed the Decision Layer, Telegram or any execution path.
   */
  // Receipt observation cannot predate completion of its market inputs.
  now = Date.now();
  let opportunityIntelligence;
  try {
    const primaryOpportunityInputs =
      trajectory
        ?.data
        ?._opportunity_shadow_inputs ||
      {};

    const externalHourly =
      publicEvidence
        ?._opportunity_hourly_candles ||
      {};

    const providerClusters =
      [
        ...(
          Array.isArray(
            liquidationIntelligence
              ?.projected_clusters
          )
            ? liquidationIntelligence
                .projected_clusters
            : []
        ),
        ...(
          Array.isArray(
            liquidationIntelligence
              ?.clusters
          )
            ? liquidationIntelligence
                .clusters
            : []
        ),
      ]
        .filter(
          (row) =>
            num(
              row?.level_price ??
              row?.price ??
              row?.level
            ) !== null
        )
        .map(
          (row) => ({
            ...row,
            projected_map_status:
              liquidationIntelligence
                ?.projected_map_status ??
              null,
            provider_evidence_eligible:
              liquidationIntelligence
                ?.asset_identity_verified ===
                true &&
              liquidationIntelligence
                ?.alias_verified ===
                true &&
              liquidationIntelligence
                ?.projected_map_status ===
                "CLOSED" &&
              liquidationIntelligence
                ?.projected_freshness ===
                "CURRENT",
          })
        );

    opportunityIntelligence =
      await runOpportunityShadowCycle({
        env,
        run_id:
          String(
            params?.run_id ||
            ""
          ).trim() ||
          `manual-shadow-${now}`,
        now,
        operational: {
          capacity_drop_reasons:
            Array.isArray(
              params
                ?.capacity_drop_reasons
            )
              ? params
                  .capacity_drop_reasons
                  .slice(0, 12)
              : [],
          queue_starvation:
            params
              ?.queue_starvation ===
            true,
        },
        input: {
          contract,
          primary:
            primaryOpportunityInputs,
          futures_snapshot:
            futures?.data ||
            null,
          spot_snapshot:
            spot?.data ||
            null,
          external_hourly:
            externalHourly,
          funding:
            primaryOpportunityInputs
              ?.funding ||
            trajectory
              ?.data
              ?.funding ||
            null,
          liquidation_clusters:
            providerClusters,
          liquidation_summary: {
            projected_map_status:
              liquidationIntelligence
                ?.projected_map_status ??
              null,
            realized_status:
              liquidationIntelligence
                ?.realized_status ??
              null,
            liquidation_dq_status:
              liquidationIntelligence
                ?.liquidation_dq_status ??
              null,
            projected_cluster_count:
              providerClusters.length,
            source_timestamp:
              liquidationIntelligence
                ?.observed_ts ??
              null,
          },
        },
      });
  } catch (error) {
    opportunityIntelligence = {
      version:
        OPPORTUNITY_VERSION,
      mode:
        "OPPORTUNITY_INTELLIGENCE_SHADOW_NO_EXECUTION",
      status:
        "RUNTIME_FAIL_CLOSED",
      error:
        String(
          error?.message ||
          error
        ).slice(0, 600),
      safety: {
        shadow_only: true,
        live_probability:
          null,
        live_signal:
          false,
        validated_signal:
          false,
        decision_layer_changed:
          false,
        strategy_weights_changed:
          false,
        telegram_started:
          false,
        trading_execution:
          false,
        automatic_weight_tuning:
          false,
      },
    };
  }

  let multiWaveCampaign;
  try {
    multiWaveCampaign =
      await runMultiWaveCampaignShadowCycle({
        env,
        now,
        opportunity:
          opportunityIntelligence,
        input: {
          contract,
          primary:
            trajectory
              ?.data
              ?._opportunity_shadow_inputs ||
            {},
          external_hourly:
            publicEvidence
              ?._opportunity_hourly_candles ||
            {},
          funding:
            trajectory
              ?.data
              ?._opportunity_shadow_inputs
              ?.funding ||
            trajectory
              ?.data
              ?.funding ||
            null,
        },
      });
  } catch (error) {
    multiWaveCampaign = {
      version: MULTI_WAVE_VERSION,
      mode: "MULTI_WAVE_CAMPAIGN_SHADOW_NO_EXECUTION",
      status: "RUNTIME_FAIL_CLOSED",
      error: String(error?.message || error).slice(0, 600),
      safety: {
        shadow_only: true,
        live_probability: null,
        live_signal: false,
        validated_signal: false,
        decision_layer_changed: false,
        strategy_weights_changed: false,
        telegram_started: false,
        trading_execution: false,
        automatic_weight_tuning: false,
      },
    };
  }

  const fullEvidenceShadow =
    buildFullEvidenceShadowRecord({
      shadow_decision: shadowDecision,
      public_evidence: publicEvidence,
      now,
    });

  // Stage 3.9.2 SHADOW proof wiring. Proof material is prepared before the
  // existing Full Evidence INSERT, but it is not considered proven until D1
  // acknowledges exactly one factual insert. No adapter-side proof synthesis is
  // permitted. Final Decision remains a shadow sidecar and does not replace the
  // legacy externally visible NOT_EVALUATED decision below.
  const stage392SnapshotId =
    multiWaveCampaign?.stage392_proofs?.snapshot_id ||
    `S392:${String(contract || "UNKNOWN").normalize("NFC")}:${now}`;

  const tz101DecisionEvidence = prepareTz101DecisionEvidence({
    contract_code: contract,
    snapshot_id: stage392SnapshotId,
    observed_ts: now,
    trajectory: trajectory?.data || null,
    available_ts: trajectory?.available_ts ?? null,
    opportunity_proof: multiWaveCampaign?.stage392_proofs?.opportunity || null,
    public_evidence: publicEvidence || null,
    public_evidence_available_ts: publicEvidenceAvailableTs,
  });

  const preparedFullEvidenceProof =
    prepareFullEvidenceProofBundle({
      record: fullEvidenceShadow,
      contract_code: contract,
      snapshot_id: stage392SnapshotId,
      observed_ts: now,
      shadow_decision: shadowDecision,
      opportunity_proof:
        multiWaveCampaign?.stage392_proofs?.opportunity || null,
      campaign_proof:
        multiWaveCampaign?.stage392_proofs?.campaign || null,
      position_proof:
        multiWaveCampaign?.stage392_proofs?.position || null,
      position_origin_campaign:
        multiWaveCampaign?.stage392_proofs?.position_origin_campaign || null,
      // Factual producer: one PRICE_ACTION domain at most, never a full entry
      // decision. Missing/contrary data stay explicit; no funding/OI votes.
      decision_evidence: tz101DecisionEvidence.rows,
      decision_evidence_audit: tz101DecisionEvidence,
      execution_snapshot: futures?.data?._tz101_execution_quote ?? null,
      committed_ts: now,
    });

  const fullEvidencePersistence =
    await persistFullEvidenceShadowRecord(
      env,
      fullEvidenceShadow,
      {
        stage392_prepared_proof_bundle:
          preparedFullEvidenceProof?.status === "PREPARED_UNACKNOWLEDGED"
            ? preparedFullEvidenceProof
            : null,
      }
    );

  fullEvidenceShadow.persistence =
    fullEvidencePersistence;

  const sealedFullEvidenceProof =
    sealFullEvidenceProofBundleAfterAck(
      preparedFullEvidenceProof,
      fullEvidencePersistence
    );

  // Original snapshot time is never renewed by a slow D1 ACK or later handoff.
  // This checks freshness only; it does not authorize a signal or a trade.
  const executionHandoff = sealedFullEvidenceProof?.status === "CLOSED"
    ? checkExecutionHandoff(sealedFullEvidenceProof?.bundle?.execution_gate, {contract_code:contract, checked_ts:Date.now()})
    : {ok:false, reason:sealedFullEvidenceProof?.reason || "FULL_EVIDENCE_RECEIPT_NOT_CLOSED"};

  let finalDecisionShadowCompatibility = {
    status: "SKIPPED_FAIL_CLOSED",
    ready: false,
    reason:
      sealedFullEvidenceProof?.status === "CLOSED"
        ? "NOT_EVALUATED"
        : sealedFullEvidenceProof?.reason || "FULL_EVIDENCE_RECEIPT_NOT_CLOSED",
    safety: stage392ProofSafetyEnvelope(),
  };

  let finalDecisionShadowPersistence = {
    status: "SKIPPED_FAIL_CLOSED",
    statements: 0,
    reason:
      sealedFullEvidenceProof?.status === "CLOSED"
        ? "NOT_EVALUATED"
        : sealedFullEvidenceProof?.reason || "FULL_EVIDENCE_RECEIPT_NOT_CLOSED",
    safety: stage392ProofSafetyEnvelope(),
  };

  if (!executionHandoff.ok && sealedFullEvidenceProof?.status === "CLOSED") {
    finalDecisionShadowCompatibility.reason = executionHandoff.reason;
    finalDecisionShadowPersistence.reason = executionHandoff.reason;
  }
  if (sealedFullEvidenceProof?.status === "CLOSED" && sealedFullEvidenceProof?.bundle && executionHandoff.ok) {
    const bundle = sealedFullEvidenceProof.bundle;
    const stage391AdapterArgs = {
      shadow_decision: shadowDecision,
      full_evidence: bundle.full_evidence,
      opportunity: bundle.opportunity,
      multi_wave: bundle.campaign,
      decision_evidence: bundle.decision_evidence,
      evidence_registry: bundle.evidence_registry,
      hard_veto: bundle.hard_veto,
      execution_gate: bundle.execution_gate,
      safety_gate_receipt: bundle.safety_gate_receipt,
      position: bundle.position,
      position_origin_campaign: bundle.position_origin_campaign,
      position_management_context: bundle.position_management_context,
      observed_ts: bundle.observed_ts,
      contract_code: bundle.contract_code,
      snapshot_id: bundle.snapshot_id,
    };

    finalDecisionShadowCompatibility =
      evaluateFinalDecisionUpstreamCompatibility(stage391AdapterArgs);

    const adaptedFinalDecisionInput =
      adaptStage391ToFinalDecisionInput(stage391AdapterArgs);

    const positionCasState =
      String(adaptedFinalDecisionInput?.position?.state || "").toUpperCase();
    const positionCasRevision =
      Number(adaptedFinalDecisionInput?.position?.state_revision);
    const positionCasClosed = Boolean(
      adaptedFinalDecisionInput?.position?.persistence?.status === "CLOSED" &&
      ["FLAT", "OPEN_LONG", "OPEN_SHORT"].includes(positionCasState) &&
      Number.isSafeInteger(positionCasRevision) && positionCasRevision >= 1
    );

    // The Final Decision shadow write is the one D1 statement that replaces
    // the old hot-path Full Evidence retention DELETE. It is never invoked
    // unless the immutable upstream proof bundle has a factual exact-insert ACK
    // AND an authoritative virtual-position receipt that can be CAS-bound in
    // the same INSERT. A zero-row ACK is not called a dedupe in this path.
    if (positionCasClosed) {
      finalDecisionShadowPersistence =
        await persistFinalDecisionIntegrationShadow({
          env,
          input: adaptedFinalDecisionInput,
          require_exact_insert_ack: true,
          expected_position_cas: {
            contract_code: bundle.contract_code,
            state: positionCasState,
            state_revision: positionCasRevision,
          },
        });
    } else {
      finalDecisionShadowPersistence = {
        status: "SKIPPED_FAIL_CLOSED",
        statements: 0,
        reason: "AUTHORITATIVE_POSITION_CAS_RECEIPT_REQUIRED",
        safety: stage392ProofSafetyEnvelope(),
      };
    }
  }

  // TZ 10.1 publication stays separate from analytical Final Decision.
  // Publication runtime derives prospective scenario/cost assessments from the
  // exact committed receipts; null here means "derive internally", not absent
  // producers. Missing entry-area/fee/holding proofs remain fail-closed and spend
  // zero Telegram-sidecar D1 statements.
  const finalDecisionPublicationShadow = await runTz101PublicationShadow({
    env,
    final_decision_persistence: finalDecisionShadowPersistence,
    decision_evidence: sealedFullEvidenceProof?.bundle?.decision_evidence || [],
    campaign_proof: sealedFullEvidenceProof?.bundle?.campaign || null,
    execution_gate: sealedFullEvidenceProof?.bundle?.execution_gate || null,
    trajectory: trajectory?.data || null,
    trajectory_available_ts: trajectory?.available_ts ?? null,
    entry_area_rule: null,
    fee_schedule: null,
    holding_plan: null,
    scenario_plan: null,
    cost_assessment: null,
    liquidation_context: null,
    smart_money_raw: smartMoneyRaw,
    observed_ts: now,
  });

return {
    tool: "deep_check_input",
    version: "0.1-evidence-only",

    contract,

    timestamp:
      now,

    timestamp_utc:
      new Date(now).toISOString(),

    mode:
      "EVIDENCE_ONLY_NO_DECISION",

    shadow_decision:
      shadowDecision,

    full_evidence_shadow:
      fullEvidenceShadow,

    liquidation_intelligence_shadow:
      liquidationIntelligence,

    opportunity_intelligence_shadow:
      opportunityIntelligence,

    multi_wave_campaign_shadow:
      multiWaveCampaign,

    stage392_shadow_integration: {
      version: "stage392-shadow-integration-v2-tz101-execution-r3",
      decision_evidence_producer: tz101DecisionEvidence,
      execution_handoff: executionHandoff,
      mode: "SHADOW_ONLY_NO_EXECUTION",
      proof_status:
        sealedFullEvidenceProof?.status || "FAIL_CLOSED",
      proof_reason:
        sealedFullEvidenceProof?.reason || null,
      full_evidence_persistence:
        fullEvidencePersistence,
      final_decision_compatibility:
        finalDecisionShadowCompatibility,
      final_decision_persistence:
        finalDecisionShadowPersistence,
      publication_shadow:
        finalDecisionPublicationShadow,
      safety:
        stage392ProofSafetyEnvelope(),
    },

    decision: {
      validated: false,
      probability: null,
      direction: null,
      status:
        "NOT_EVALUATED",
      reason:
        "This layer only aggregates factual evidence. Decision scoring is intentionally not implemented here.",
    },

    execution: {
      cycle_started_ts: cycleStartedTs,
      components_available_ts: componentsAvailableTs,
      analysis_observed_ts: now,
      requested_components: 4,
      fulfilled_components:
        4 - failedComponents.length,
      failed_components:
        failedComponents,
      complete:
        failedComponents.length === 0,
      shared_fetch_cache:
        sharedFetch.stats(),
    },

    data_sufficiency:
      dataSufficiency,

    evidence: {
      futures_snapshot:
        futures,
      spot_snapshot:
        spot,
      futures_trajectory:
        trajectory,
      stage0_history:
        history,
      htx_liquidation_tape:
        htxLiquidationShadow,
      smart_money_raw:
        smartMoneyRaw,
    },

    safety: {
      strategy_rules_changed:
        false,
      weights_changed:
        false,
      hard_veto_changed:
        false,
      probability_generated:
        false,
      alert_dispatch_triggered:
        false,
    },

    notes: [
      "No trading probability is generated.",
      "No validated=true signal is generated.",
      "No Telegram alert is triggered.",
      "Missing or failed evidence remains explicit.",
      "This output is intended as factual input for a future Decision Layer.",
      "Stage 3.7.1 keeps projected liquidation clusters, factual realized liquidations and cross-source consensus physically/logically separate.",
      "No leverage arithmetic is promoted as a vendor heatmap, and unsupported symbols remain NOT_CLOSED.",
      "Stage 3.9 opportunity telemetry is shadow-only and cannot modify the Decision Layer, weights, alerts or execution.",
    ],
  };
}

function normalizeAlertTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = String(value).trim();
  const numeric = Number(text);

  if (Number.isFinite(numeric)) {
    let n = numeric;

    if (n < 1e12) {
      n *= 1000;
    }

    return n;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function moscowClock(nowMs = Date.now()) {
  const d = new Date(nowMs + 3 * 60 * 60 * 1000);

  return {
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    timestamp_msk:
      d.getUTCFullYear() +
      "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getUTCDate()).padStart(2, "0") +
      " " +
      String(d.getUTCHours()).padStart(2, "0") +
      ":" +
      String(d.getUTCMinutes()).padStart(2, "0") +
      ":" +
      String(d.getUTCSeconds()).padStart(2, "0") +
      " MSK",
  };
}


function telegramShadowAuthOk(request, env) {
  const expectedKey = String(env?.TELEGRAM_TEST_KEY || "").trim();
  const auth = String(request.headers.get("authorization") || "");
  const providedKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return {
    configured: Boolean(expectedKey),
    authorized: Boolean(expectedKey && providedKey && providedKey === expectedKey),
  };
}

async function loadStage392TelegramShadowDecision(env, decisionId = "") {
  if (!env?.DATA_DB) {
    return { ok: false, status: "SOURCE_UNSUPPORTED", error: "DATA_DB_NOT_CONFIGURED", row: null };
  }
  const id = String(decisionId || "").trim().slice(0, 320);
  try {
    const sql = id
      ? `SELECT decision_id, mode, decision_status, contract_code, observation_ts, direction,
                directional_quality, entry_action, entry_quality, data_quality, execution_quality,
                campaign_phase, timing_state, risk_state, position_state, management_action,
                management_intent, management_quality, hard_veto, hard_veto_state, shadow_only,
                live_probability, validated_signal, execution_authorized, telegram_eligible, persisted_ts
           FROM final_decision_integration_shadow
          WHERE decision_id=?1 LIMIT 1`
      : `SELECT decision_id, mode, decision_status, contract_code, observation_ts, direction,
                directional_quality, entry_action, entry_quality, data_quality, execution_quality,
                campaign_phase, timing_state, risk_state, position_state, management_action,
                management_intent, management_quality, hard_veto, hard_veto_state, shadow_only,
                live_probability, validated_signal, execution_authorized, telegram_eligible, persisted_ts
           FROM final_decision_integration_shadow
          ORDER BY persisted_ts DESC LIMIT 1`;
    const row = id
      ? await env.DATA_DB.prepare(sql).bind(id).first()
      : await env.DATA_DB.prepare(sql).first();
    if (!row) return { ok: true, status: "NO_FINAL_DECISION_ROW", row: null };
    return { ok: true, status: "FOUND", row };
  } catch (error) {
    return { ok: false, status: "READ_FAILED", error: String(error?.message || error), row: null };
  }
}

function buildStage392TelegramShadowMessage(row) {
  const reasons = [];
  if (!row || typeof row !== "object") reasons.push("ROW_MISSING");
  if (row?.mode !== "SHADOW_ONLY_NO_EXECUTION") reasons.push("NOT_SHADOW_ONLY");
  if (Number(row?.shadow_only) !== 1) reasons.push("SHADOW_FLAG_NOT_ONE");
  if (row?.live_probability !== null && row?.live_probability !== undefined) reasons.push("LIVE_PROBABILITY_PRESENT");
  if (Number(row?.validated_signal || 0) !== 0) reasons.push("VALIDATED_SIGNAL_PRESENT");
  if (Number(row?.execution_authorized || 0) !== 0) reasons.push("EXECUTION_AUTHORIZED");
  if (Number(row?.telegram_eligible || 0) !== 0) reasons.push("TELEGRAM_ELIGIBLE_UNEXPECTED");
  if (reasons.length) {
    return { ok: false, status: "REJECTED_FAIL_CLOSED", reasons, message: null };
  }

  const direction = ["LONG", "SHORT"].includes(String(row.direction || "").toUpperCase())
    ? String(row.direction).toUpperCase()
    : "НЕ ОПРЕДЕЛЕНО";
  const entryMap = {
    SHADOW_ENTRY_ELIGIBLE: "Теневой кандидат на вход",
    WAIT: "Ожидание",
    REJECT: "Отклонено",
    NOT_EVALUATED: "Не оценено",
  };
  const managementMap = {
    HOLD: "Удерживать (теневая оценка)",
    EXIT: "Выход (теневая оценка)",
    NOT_EVALUATED: "Не оценено",
  };
  const isManagement = ["HOLD", "EXIT"].includes(String(row.management_action || ""));
  const action = isManagement
    ? (managementMap[row.management_action] || String(row.management_action || ""))
    : (entryMap[row.entry_action] || String(row.entry_action || ""));
  const ts = Number(row.observation_ts);
  const observed = Number.isFinite(ts) && ts > 0 ? new Date(ts).toISOString() : "нет данных";
  const lines = [
    "🧪 Мой отчёт 2 — ТЕНЕВОЕ РЕШЕНИЕ",
    "НЕ ТОРГОВЫЙ СИГНАЛ",
    "",
    `${String(row.contract_code || "UNKNOWN")} • ${direction}`,
    `Решение: ${action}`,
    `Фаза: ${String(row.campaign_phase || "UNKNOWN")}`,
    `Качество направления: ${String(row.directional_quality || "NOT_EVALUATED")}`,
    `Качество входа: ${String(row.entry_quality || "NOT_EVALUATED")}`,
    `Качество данных: ${String(row.data_quality || "NOT_EVALUATED")}`,
    `Риск: ${String(row.risk_state || "UNKNOWN")}`,
    `Жёсткий запрет: ${Number(row.hard_veto || 0) === 1 ? "ДА" : "НЕТ"}`,
    `Позиция: ${String(row.position_state || "UNKNOWN")}`,
    `Время решения: ${observed}`,
    "",
    "Режим: только наблюдение. Автоторговля и рабочий сигнал выключены.",
  ];
  const message = lines.join("\n");
  return {
    ok: message.length <= 4096,
    status: message.length <= 4096 ? "READY" : "MESSAGE_TOO_LONG",
    reasons: message.length <= 4096 ? [] : ["MESSAGE_TOO_LONG"],
    message: message.length <= 4096 ? message : null,
  };
}

function validateAlertDispatch(params) {
  const reasons = [];
  const nowMs = Date.now();

  const contract = String(
    params?.contract ||
    params?.symbol ||
    ""
  ).trim();

  const direction = String(
    params?.direction ||
    params?.side ||
    ""
  ).trim().toUpperCase();

  const validated = params?.validated === true;
  const probability = Number(params?.probability);
  const freshnessSec = Number(params?.freshness_sec);

  const signalTs = normalizeAlertTimestamp(
    params?.signal_timestamp_utc ??
    params?.timestamp_utc ??
    params?.signal_timestamp
  );

  const clock = moscowClock(nowMs);

  const inMoscowWindow =
    clock.hour >= 9 &&
    clock.hour < 23;

  let signalAgeSec = null;
  let futureSkewSec = null;

  if (signalTs !== null) {
    signalAgeSec = Math.max(
      0,
      (nowMs - signalTs) / 1000
    );

    futureSkewSec = Math.max(
      0,
      (signalTs - nowMs) / 1000
    );
  }

  if (!contract) {
    reasons.push("CONTRACT_MISSING");
  }

  if (!["LONG", "SHORT"].includes(direction)) {
    reasons.push("DIRECTION_INVALID");
  }

  if (!validated) {
    reasons.push("NOT_VALIDATED");
  }

  if (
    !Number.isFinite(probability) ||
    probability < 70 ||
    probability > 100
  ) {
    reasons.push("PROBABILITY_BELOW_70_OR_INVALID");
  }

  if (
    !Number.isFinite(freshnessSec) ||
    freshnessSec < 0 ||
    freshnessSec > 300
  ) {
    reasons.push("FRESHNESS_MISSING_OR_STALE");
  }

  if (signalTs === null) {
    reasons.push("SIGNAL_TIMESTAMP_MISSING_OR_INVALID");
  } else {
    if (signalAgeSec > 300) {
      reasons.push("SIGNAL_TIMESTAMP_STALE");
    }

    if (futureSkewSec > 60) {
      reasons.push("SIGNAL_TIMESTAMP_IN_FUTURE");
    }
  }

  return {
    allowed:
      reasons.length === 0 &&
      inMoscowWindow,

    reasons,
    contract,
    direction,
    validated,

    probability:
      Number.isFinite(probability)
        ? probability
        : null,

    freshness_sec:
      Number.isFinite(freshnessSec)
        ? freshnessSec
        : null,

    signal_timestamp_utc:
      signalTs !== null
        ? new Date(signalTs).toISOString()
        : null,

    signal_age_sec: signalAgeSec,
    in_moscow_window: inMoscowWindow,
    moscow_time: clock.timestamp_msk,
  };
}


function alertDispatchFingerprint(params, gate) {
  const explicitId = String(
    params?.event_id ||
    params?.signal_id ||
    params?.alert_id ||
    ""
  )
    .trim()
    .slice(0, 200);

  if (explicitId) {
    return "id:v1:" + explicitId;
  }

  return [
    "sig:v1",
    gate?.contract || "",
    gate?.direction || "",
    gate?.signal_timestamp_utc || "",
  ].join("|");
}

async function reserveAlertDispatch(env, params, gate) {
  if (!env?.DATA_DB) {
    return {
      ok: false,
      reserved: false,
      status: "SOURCE_UNSUPPORTED",
      error: "DATA_DB_NOT_CONFIGURED",
    };
  }

  const fingerprint =
    alertDispatchFingerprint(params, gate);

  const signalTs =
    gate?.signal_timestamp_utc
      ? Date.parse(gate.signal_timestamp_utc)
      : NaN;

  if (
    !fingerprint ||
    !Number.isFinite(signalTs)
  ) {
    return {
      ok: false,
      reserved: false,
      status: "INVALID_EVENT_IDENTITY",
      error: "Cannot build stable alert identity",
    };
  }

  const now = Date.now();

  const reasonJson = JSON.stringify({
    summary: String(
      params?.summary ||
      params?.reason ||
      ""
    )
      .trim()
      .slice(0, 600),

    upstream_event_id: String(
      params?.event_id ||
      params?.signal_id ||
      params?.alert_id ||
      ""
    )
      .trim()
      .slice(0, 200),
  });

  try {
    const inserted = await env.DATA_DB.prepare(`
      INSERT OR IGNORE INTO alert_dispatch_log
      (
        event_fingerprint,
        contract_code,
        direction,
        probability,
        signal_ts,
        freshness_sec,
        validated,
        dispatch_status,
        reason_json,
        created_ts
      )
      VALUES
      (?1, ?2, ?3, ?4, ?5, ?6, 1, 'PENDING', ?7, ?8)
    `)
      .bind(
        fingerprint,
        gate.contract,
        gate.direction,
        gate.probability,
        signalTs,
        gate.freshness_sec,
        reasonJson,
        now
      )
      .run();

    const insertedChanges =
      Number(inserted?.meta?.changes || 0);

    if (insertedChanges > 0) {
      return {
        ok: true,
        reserved: true,
        status: "RESERVED",
        fingerprint,
        retry: false,
      };
    }

    const existing = await env.DATA_DB.prepare(`
      SELECT
        id,
        dispatch_status,
        telegram_message_id,
        telegram_http_status,
        created_ts,
        sent_ts
      FROM alert_dispatch_log
      WHERE event_fingerprint = ?1
      LIMIT 1
    `)
      .bind(fingerprint)
      .first();

    if (!existing) {
      return {
        ok: false,
        reserved: false,
        status: "D1_INCONSISTENT",
        error:
          "INSERT OR IGNORE changed 0 rows but duplicate row was not found",
        fingerprint,
      };
    }

    /*
      A failed Telegram transmission may be retried.
      SENT or PENDING events are never transmitted again.
    */
    if (
      String(existing.dispatch_status) ===
      "SEND_FAILED"
    ) {
      const retryReservation =
        await env.DATA_DB.prepare(`
          UPDATE alert_dispatch_log
          SET
            dispatch_status = 'PENDING',
            reason_json = ?2
          WHERE
            event_fingerprint = ?1
            AND dispatch_status = 'SEND_FAILED'
        `)
          .bind(
            fingerprint,
            reasonJson
          )
          .run();

      const retryChanges =
        Number(
          retryReservation?.meta?.changes || 0
        );

      if (retryChanges > 0) {
        return {
          ok: true,
          reserved: true,
          status: "RESERVED_RETRY",
          fingerprint,
          retry: true,
        };
      }
    }

    return {
      ok: true,
      reserved: false,
      status: "DUPLICATE",
      fingerprint,
      existing_status:
        existing.dispatch_status || null,
      existing_message_id:
        existing.telegram_message_id ?? null,
      existing_sent_ts:
        existing.sent_ts ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      reserved: false,
      status: "D1_ERROR",
      fingerprint,
      error: String(
        error?.message || error
      ),
    };
  }
}

async function finalizeAlertDispatch(
  env,
  fingerprint,
  telegram
) {
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
    };
  }

  const sent =
    telegram?.ok === true;

  const finalStatus =
    sent
      ? "SENT"
      : "SEND_FAILED";

  const sentTs =
    sent
      ? Date.now()
      : null;

  try {
    const result =
      await env.DATA_DB.prepare(`
        UPDATE alert_dispatch_log
        SET
          dispatch_status = ?2,
          telegram_message_id = ?3,
          telegram_http_status = ?4,
          sent_ts = ?5
        WHERE
          event_fingerprint = ?1
          AND dispatch_status = 'PENDING'
      `)
        .bind(
          fingerprint,
          finalStatus,
          telegram?.message_id ?? null,
          telegram?.http_status ?? null,
          sentTs
        )
        .run();

    return {
      status: "CLOSED",
      dispatch_status: finalStatus,
      rows_updated:
        Number(result?.meta?.changes || 0),
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      dispatch_status: finalStatus,
      error: String(
        error?.message || error
      ),
    };
  }
}


const ALERT_COOLDOWN_SEC = 30 * 60;

async function reserveAlertCooldown(
  env,
  gate,
  fingerprint
) {
  if (!env?.DATA_DB) {
    return {
      ok: false,
      acquired: false,
      status: "SOURCE_UNSUPPORTED",
      error: "DATA_DB_NOT_CONFIGURED",
    };
  }

  const cooldownKey =
    String(gate.contract) +
    "|" +
    String(gate.direction);

  const now = Date.now();
  const threshold =
    now - ALERT_COOLDOWN_SEC * 1000;

  try {
    const result =
      await env.DATA_DB.prepare(`
        INSERT INTO alert_dispatch_cooldown
        (
          cooldown_key,
          contract_code,
          direction,
          event_fingerprint,
          reserved_ts,
          sent_ts
        )
        VALUES
        (?1, ?2, ?3, ?4, ?5, NULL)

        ON CONFLICT(cooldown_key)
        DO UPDATE SET
          contract_code = excluded.contract_code,
          direction = excluded.direction,
          event_fingerprint = excluded.event_fingerprint,
          reserved_ts = excluded.reserved_ts,
          sent_ts = NULL

        WHERE
          alert_dispatch_cooldown.reserved_ts <= ?6
      `)
        .bind(
          cooldownKey,
          gate.contract,
          gate.direction,
          fingerprint,
          now,
          threshold
        )
        .run();

    const changes =
      Number(result?.meta?.changes || 0);

    if (changes > 0) {
      return {
        ok: true,
        acquired: true,
        status: "ACQUIRED",
        cooldown_key: cooldownKey,
        cooldown_sec:
          ALERT_COOLDOWN_SEC,
        reserved_ts: now,
      };
    }

    const current =
      await env.DATA_DB.prepare(`
        SELECT
          event_fingerprint,
          reserved_ts,
          sent_ts
        FROM alert_dispatch_cooldown
        WHERE cooldown_key = ?1
        LIMIT 1
      `)
        .bind(cooldownKey)
        .first();

    const baseTs =
      Number(current?.reserved_ts || 0);

    const remainingSec =
      Math.max(
        0,
        Math.ceil(
          (
            baseTs +
            ALERT_COOLDOWN_SEC * 1000 -
            now
          ) / 1000
        )
      );

    return {
      ok: true,
      acquired: false,
      status: "COOLDOWN_ACTIVE",
      cooldown_key: cooldownKey,
      cooldown_sec:
        ALERT_COOLDOWN_SEC,
      remaining_sec: remainingSec,
      previous_event_fingerprint:
        current?.event_fingerprint || null,
      previous_sent_ts:
        current?.sent_ts ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      acquired: false,
      status: "D1_ERROR",
      error: String(
        error?.message || error
      ),
    };
  }
}

async function setAlertDispatchStatus(
  env,
  fingerprint,
  status
) {
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
    };
  }

  try {
    const result =
      await env.DATA_DB.prepare(`
        UPDATE alert_dispatch_log
        SET dispatch_status = ?2
        WHERE
          event_fingerprint = ?1
          AND dispatch_status = 'PENDING'
      `)
        .bind(
          fingerprint,
          status
        )
        .run();

    return {
      status: "CLOSED",
      rows_updated:
        Number(result?.meta?.changes || 0),
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      error: String(
        error?.message || error
      ),
    };
  }
}

async function finalizeAlertCooldown(
  env,
  cooldown,
  fingerprint,
  telegram
) {
  if (!env?.DATA_DB) {
    return {
      status: "SOURCE_UNSUPPORTED",
    };
  }

  try {
    if (telegram?.ok === true) {
      const sentTs = Date.now();

      const result =
        await env.DATA_DB.prepare(`
          UPDATE alert_dispatch_cooldown
          SET
            reserved_ts = ?3,
            sent_ts = ?3
          WHERE
            cooldown_key = ?1
            AND event_fingerprint = ?2
        `)
          .bind(
            cooldown.cooldown_key,
            fingerprint,
            sentTs
          )
          .run();

      return {
        status: "CLOSED",
        action: "COOLDOWN_STARTED",
        sent_ts: sentTs,
        rows_updated:
          Number(result?.meta?.changes || 0),
      };
    }

    const result =
      await env.DATA_DB.prepare(`
        DELETE FROM alert_dispatch_cooldown
        WHERE
          cooldown_key = ?1
          AND event_fingerprint = ?2
      `)
        .bind(
          cooldown.cooldown_key,
          fingerprint
        )
        .run();

    return {
      status: "CLOSED",
      action:
        "COOLDOWN_RELEASED_AFTER_SEND_FAILURE",
      rows_deleted:
        Number(result?.meta?.changes || 0),
    };
  } catch (error) {
    return {
      status: "PARTIAL",
      error: String(
        error?.message || error
      ),
    };
  }
}

function detectMode(
  url,
  params
) {
  const path =
    url.pathname.toLowerCase();

  const requested =
    String(
      params.market ||
      params.mode ||
      params.tool ||
      params.action ||
      ""
    ).toLowerCase();

  if (
    path.includes(
      "symbol-resolve"
    ) ||
    path.includes(
      "symbol_resolve"
    ) ||
    requested.includes(
      "symbol_resolve"
    )
  ) {
    return "symbol_resolve";
  }

  if (
    path.includes(
      "stage0-history"
    ) ||
    path.includes(
      "stage0_history"
    ) ||
    requested.includes(
      "stage0_history"
    )
  ) {
    return "stage0_history";
  }

  if (
    path.includes(
      "universe"
    ) ||
    requested.includes(
      "universe_scan"
    )
  ) {
    return "universe";
  }

  if (
    path.includes(
      "liquidation"
    ) ||
    requested.includes(
      "liquidation_tape"
    )
  ) {
    return "liquidations";
  }

  if (
    path.includes(
      "data-plane"
    ) ||
    path.includes(
      "dataplane"
    ) ||
    requested.includes(
      "data_plane_status"
    )
  ) {
    return "data_plane_status";
  }

  if (
    path.includes(
      "trajectory"
    ) ||
    requested.includes(
      "trajectory"
    )
  ) {
    return "trajectory";
  }

  if (
    path.includes(
      "spot"
    ) ||
    requested.includes(
      "spot"
    )
  ) {
    return "spot";
  }

  return "futures";
}

const __REPORT2_ORIGINAL_HANDLER = {
  async fetch(
    request,
    env,
    ctx
  ) {
    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            JSON_HEADERS,
        }
      );
    }

    try {
      const {
        url,
        params,
      } =
        await parseInput(
          request
        );

      if (
        url.pathname ===
          "/health" ||
        url.pathname ===
          "/healthz"
      ) {
        return jsonResponse({
          ok: true,

          service:
            "my-report-2-hub",

          version:
            FAST_MOVE_WATCH_VERSION,

          candidate_version:
            OPPORTUNITY_VERSION,

          stage392_shadow_integration_version:
            STAGE392_SHADOW_INTEGRATION_VERSION,

          telegram_shadow_bridge_version:
            TELEGRAM_SHADOW_BRIDGE_VERSION,

          telegram_shadow_bodyfix_version:
            TELEGRAM_SHADOW_BODYFIX_VERSION,

          modules: {
            telegram_shadow_preview: true,
            telegram_shadow_manual_test: true,
            telegram_shadow_auto_dispatch: false,

            htx_futures_snapshot:
              true,

            htx_spot_snapshot:
              true,

            htx_futures_trajectory:
              true,

            spot_flow_windows_1h_4h_24h:
              true,

            spot_freshness_control:
              true,

            trajectory_price_windows_5m_15m_1h_4h_24h:
              true,

            trajectory_oi_windows_1h_4h_24h:
              true,

            trajectory_funding_history:
              true,

            trajectory_strict_flow_coverage:
              true,

            htx_universe_scan:
              true,

            htx_crypto_instrument_scope:
              true,

            bounded_deep_check_scheduler:
              true,

            deep_check_run_journal:
              true,
      shadow_decision_layer: true,
      shadow_outcome_calibration: true,
      full_evidence_shadow: true,
      cross_venue_liquidation_intelligence: true,
      fast_move_watch: true,
      opportunity_intelligence_shadow: true,
      multi_wave_campaign_shadow: true,

            htx_symbol_resolve:
              true,

            htx_stage0_history:
              true,

            htx_liquidation_tape_rest:
              true,

            persistent_store_code_ready:
              true,

            data_plane_status:
              true,

            cron_observability:
              true,
          },

          timestamp_utc:
            new Date()
              .toISOString(),
        });
      }



      if (url.pathname === "/deep-check-input") {
        if (
          request.method !== "GET" &&
          request.method !== "POST"
        ) {
          return jsonResponse(
            {
              ok: false,
              endpoint:
                "deep-check-input",
              error:
                "METHOD_NOT_ALLOWED",
              allowed_methods: [
                "GET",
                "POST",
              ],
            },
            405
          );
        }

        const expectedKey =
          String(
            env?.ALERT_DISPATCH_KEY ||
            ""
          ).trim();

        const auth =
          String(
            request.headers.get(
              "authorization"
            ) || ""
          );

        const providedKey =
          auth.startsWith("Bearer ")
            ? auth.slice(7).trim()
            : "";

        if (!expectedKey) {
          return jsonResponse(
            {
              ok: false,
              endpoint:
                "deep-check-input",
              error:
                "INTERNAL_KEY_NOT_CONFIGURED",
            },
            503
          );
        }

        if (
          !providedKey ||
          providedKey !== expectedKey
        ) {
          return jsonResponse(
            {
              ok: false,
              endpoint:
                "deep-check-input",
              error:
                "UNAUTHORIZED",
            },
            401
          );
        }

        let params = {};

        if (request.method === "POST") {
          try {
            params =
              await request.json();
          } catch {
            params = {};
          }
        } else {
          params =
            Object.fromEntries(
              url.searchParams.entries()
            );
        }

        const result =
          await buildDeepCheckInput(
            params,
            env
          );

        return jsonResponse(result);
      }


      if (url.pathname === "/telegram-shadow-preview") {
        if (request.method !== "POST") {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-preview", error: "METHOD_NOT_ALLOWED", allowed_method: "POST" }, 405);
        }
        const authState = telegramShadowAuthOk(request, env);
        if (!authState.configured) {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-preview", error: "TELEGRAM_TEST_KEY_NOT_CONFIGURED" }, 503);
        }
        if (!authState.authorized) {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-preview", error: "UNAUTHORIZED" }, 401);
        }
        const body = params && typeof params === "object" ? params : {};
        const loaded = await loadStage392TelegramShadowDecision(env, body?.decision_id);
        if (!loaded.ok) return jsonResponse({ endpoint: "telegram-shadow-preview", sent: false, ...loaded }, 503);
        if (!loaded.row) return jsonResponse({ endpoint: "telegram-shadow-preview", sent: false, ...loaded }, 200);
        const preview = buildStage392TelegramShadowMessage(loaded.row);
        return jsonResponse({
          ok: preview.ok,
          endpoint: "telegram-shadow-preview",
          mode: "STAGE392_SHADOW_PREVIEW_NO_SEND",
          sent: false,
          telegram_api_called: false,
          decision_id: loaded.row.decision_id,
          preview,
          safety: { live_probability: false, live_signal: false, validated_signal: false, trading_execution: false, automatic_dispatch: false },
        }, preview.ok ? 200 : 422);
      }

      if (url.pathname === "/telegram-shadow-test") {
        if (request.method !== "POST") {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-test", error: "METHOD_NOT_ALLOWED", allowed_method: "POST" }, 405);
        }
        const authState = telegramShadowAuthOk(request, env);
        if (!authState.configured) {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-test", error: "TELEGRAM_TEST_KEY_NOT_CONFIGURED" }, 503);
        }
        if (!authState.authorized) {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-test", error: "UNAUTHORIZED" }, 401);
        }
        const body = params && typeof params === "object" ? params : {};
        if (String(body?.confirm || "") !== "SEND_SHADOW_TEST") {
          return jsonResponse({ ok: false, endpoint: "telegram-shadow-test", sent: false, error: "EXPLICIT_CONFIRMATION_REQUIRED", required_confirm: "SEND_SHADOW_TEST" }, 422);
        }
        const loaded = await loadStage392TelegramShadowDecision(env, body?.decision_id);
        if (!loaded.ok) return jsonResponse({ endpoint: "telegram-shadow-test", sent: false, ...loaded }, 503);
        if (!loaded.row) return jsonResponse({ endpoint: "telegram-shadow-test", sent: false, ...loaded }, 200);
        const preview = buildStage392TelegramShadowMessage(loaded.row);
        if (!preview.ok) return jsonResponse({ ok: false, endpoint: "telegram-shadow-test", sent: false, decision_id: loaded.row.decision_id, preview }, 422);
        const telegram = await sendTelegramMessage(env, preview.message);
        return jsonResponse({
          endpoint: "telegram-shadow-test",
          mode: "MANUAL_SHADOW_TEST_ONLY",
          decision_id: loaded.row.decision_id,
          sent: telegram.ok === true,
          safety: { live_probability: false, live_signal: false, validated_signal: false, trading_execution: false, automatic_dispatch: false },
          ...telegram,
        }, telegram.ok ? 200 : 502);
      }

      if (url.pathname === "/alert-dispatch") {
        if (request.method !== "POST") {
          return jsonResponse(
            {
              ok: false,
              endpoint: "alert-dispatch",
              error: "METHOD_NOT_ALLOWED",
              allowed_method: "POST",
            },
            405
          );
        }

        const expectedKey = String(
          env?.ALERT_DISPATCH_KEY || ""
        ).trim();

        const auth = String(
          request.headers.get("authorization") || ""
        );

        const providedKey = auth.startsWith("Bearer ")
          ? auth.slice(7).trim()
          : "";

        if (!expectedKey) {
          return jsonResponse(
            {
              ok: false,
              endpoint: "alert-dispatch",
              error: "ALERT_DISPATCH_KEY_NOT_CONFIGURED",
            },
            503
          );
        }

        if (
          !providedKey ||
          providedKey !== expectedKey
        ) {
          return jsonResponse(
            {
              ok: false,
              endpoint: "alert-dispatch",
              error: "UNAUTHORIZED",
            },
            401
          );
        }

        const gate = validateAlertDispatch(params);

        if (gate.reasons.length) {
          return jsonResponse(
            {
              ok: false,
              endpoint: "alert-dispatch",
              status: "REJECTED_FAIL_CLOSED",
              sent: false,
              gate,
            },
            422
          );
        }

        if (!gate.in_moscow_window) {
          return jsonResponse({
            ok: true,
            endpoint: "alert-dispatch",
            status: "SKIPPED_OUTSIDE_MSK_WINDOW",
            sent: false,
            gate,
          });
        }

        const summary = String(
          params?.summary ||
          params?.reason ||
          ""
        )
          .trim()
          .slice(0, 600);

        const message = [
          "🚨 Мой отчёт 2 — VALIDATED ALERT",
          "",
          gate.direction +
            " " +
            gate.contract +
            " — " +
            gate.probability.toFixed(0) +
            "%",
          "Свежесть: " +
            Math.round(gate.freshness_sec) +
            " сек.",
          "Сигнал: " +
            gate.signal_timestamp_utc,
          summary
            ? "Причина: " + summary
            : null,
        ]
          .filter(Boolean)
          .join("\n");


        const dispatchReservation =
          await reserveAlertDispatch(
            env,
            params,
            gate
          );

        if (!dispatchReservation.ok) {
          return jsonResponse(
            {
              ok: false,
              endpoint: "alert-dispatch",
              status:
                "REJECTED_FAIL_CLOSED_D1",
              sent: false,
              gate,
              dispatch:
                dispatchReservation,
            },
            503
          );
        }

        if (!dispatchReservation.reserved) {
          return jsonResponse({
            ok: true,
            endpoint: "alert-dispatch",
            status: "SKIPPED_DUPLICATE",
            sent: false,
            gate,
            dispatch:
              dispatchReservation,
          });
        }

        const cooldown =
          await reserveAlertCooldown(
            env,
            gate,
            dispatchReservation.fingerprint
          );

        if (!cooldown.ok) {
          const journal =
            await setAlertDispatchStatus(
              env,
              dispatchReservation.fingerprint,
              "SEND_FAILED"
            );

          return jsonResponse(
            {
              ok: false,
              endpoint: "alert-dispatch",
              status:
                "REJECTED_FAIL_CLOSED_COOLDOWN",
              sent: false,
              gate,
              dispatch: {
                ...dispatchReservation,
                cooldown,
                journal,
              },
            },
            503
          );
        }

        if (!cooldown.acquired) {
          const journal =
            await setAlertDispatchStatus(
              env,
              dispatchReservation.fingerprint,
              "SKIPPED_COOLDOWN"
            );

          return jsonResponse({
            ok: true,
            endpoint: "alert-dispatch",
            status: "SKIPPED_COOLDOWN",
            sent: false,
            gate,
            dispatch: {
              ...dispatchReservation,
              cooldown,
              journal,
            },
          });
        }

        const telegram =
          await sendTelegramMessage(
            env,
            message
          );

        const dispatchJournal =
          await finalizeAlertDispatch(
            env,
            dispatchReservation.fingerprint,
            telegram
          );

        const cooldownJournal =
          await finalizeAlertCooldown(
            env,
            cooldown,
            dispatchReservation.fingerprint,
            telegram
          );

        return jsonResponse(
          {
            endpoint: "alert-dispatch",
            sent: telegram.ok === true,
            gate,
            dispatch: {
              ...dispatchReservation,
              journal: dispatchJournal,
              cooldown,
              cooldown_journal:
                cooldownJournal,
            },
            ...telegram,
          },
          telegram.ok ? 200 : 502
        );
      }

      if (url.pathname === "/telegram-test") {
        if (request.method !== "POST") {
          return jsonResponse(
            {
              ok: false,
              endpoint: "telegram-test",
              error: "METHOD_NOT_ALLOWED",
              allowed_method: "POST",
            },
            405
          );
        }

        const expectedKey = String(env?.TELEGRAM_TEST_KEY || "").trim();
        const auth = String(
          request.headers.get("authorization") || ""
        );

        const providedKey = auth.startsWith("Bearer ")
          ? auth.slice(7).trim()
          : "";

        if (!expectedKey) {
          return jsonResponse(
            {
              ok: false,
              endpoint: "telegram-test",
              error: "TELEGRAM_TEST_KEY_NOT_CONFIGURED",
            },
            503
          );
        }

        if (!providedKey || providedKey !== expectedKey) {
          return jsonResponse(
            {
              ok: false,
              endpoint: "telegram-test",
              error: "UNAUTHORIZED",
            },
            401
          );
        }

        const testText =
          typeof params.text === "string" && params.text.trim()
            ? params.text.trim()
            : "✅ Мой отчёт 2 — Telegram Sender из HUB работает.";

        const telegram = await sendTelegramMessage(
          env,
          testText
        );

        return jsonResponse(
          {
            endpoint: "telegram-test",
            ...telegram,
          },
          telegram.ok ? 200 : 502
        );
      }


      const mode =
        detectMode(
          url,
          params
        );

      if (
        mode ===
        "symbol_resolve"
      ) {
        const output =
          await htxSymbolResolve(
            params
          );

        return jsonResponse(
          output
        );
      }

      if (
        mode ===
        "stage0_history"
      ) {
        const output =
          await htxStage0History(
            params,
            env
          );

        return jsonResponse(
          output
        );
      }

      if (
        mode ===
        "universe"
      ) {
        const output =
          await htxUniverseScan(
            params,
            env
          );

        return jsonResponse(
          output
        );
      }

      if (
        mode ===
        "liquidations"
      ) {
        const output =
          await htxLiquidationTape(
            params,
            env
          );

        return jsonResponse(
          output
        );
      }

      if (
        mode ===
        "data_plane_status"
      ) {
        const output =
          await dataPlaneStatus(
            env
          );

        return jsonResponse(
          output
        );
      }

      if (
        mode ===
        "trajectory"
      ) {
        const output =
          await futuresTrajectory(
            params
          );

        return jsonResponse(
          output
        );
      }

      if (
        mode ===
        "spot"
      ) {
        const output =
          await spotSnapshot(
            params
          );

        return jsonResponse(
          output
        );
      }

      const output =
        await futuresSnapshot(
          params
        );

      return jsonResponse(
        output
      );
    } catch (error) {
      return jsonResponse(
        {
          ok: false,

          error:
            String(
              error?.message ||
              error
            ),

          timestamp_utc:
            new Date()
              .toISOString(),
        },
        500
      );
    }
  },

  async scheduled(
    controller,
    env,
    ctx
  ) {
    const startedTs =
      Date.now();

    const scheduledTime =
      num(
        controller
          ?.scheduledTime
      ) ??
      startedTs;

    const runId =
      `${scheduledTime}-${startedTs}`;

    console.log(
      "cron_start",
      JSON.stringify({
        run_id:
          runId,

        scheduled_time:
          scheduledTime,

        started_ts:
          startedTs,
      })
    );

    await recordCronRun(
      env,
      {
        run_id:
          runId,

        scheduled_time:
          scheduledTime,

        started_ts:
          startedTs,

        status:
          "STARTED",
      }
    );

    try {
      const scan =
        await htxUniverseScan(
          {
            freshness_sec:
              300,
          },
          env,
          {
            persist:
              true,
          }
        );

      const deepCheckQueue =
        buildDeepCheckQueue(
          scan
        );

      console.log(
        "deep_check_queue",
        JSON.stringify({
          run_id:
            runId,
          universe_total:
            deepCheckQueue
              ?.counts
              ?.universe_total ??
            0,
          eligible:
            deepCheckQueue
              ?.counts
              ?.eligible ??
            0,
          excluded:
            deepCheckQueue
              ?.counts
              ?.excluded ??
            0,
          mode:
            deepCheckQueue
              ?.mode ??
            null,
          decision_generated:
            deepCheckQueue
              ?.decision
              ?.generated === true,
          validated:
            deepCheckQueue
              ?.decision
              ?.validated === true,
        })
      );

      const discoveryPrefilter =
        scan?.discovery_recall
          ?.shortlist
          ? buildDiscoveryPrefilter(
              scan,
              deepCheckQueue,
              {
                liquidity_percentile:
                  0.70,
                early_liquidity_percentile:
                  0.45,
                anomaly_percentile:
                  0.95,
                early_anomaly_percentile:
                  0.80,
                funding_percentile:
                  0.95,
                funding_tail_percentile:
                  0.10,
                min_anomaly_flags:
                  2,
                min_early_flags:
                  2,
                max_shortlist:
                  24,
              }
            )
          : buildDiscoveryPrefilter(
              scan,
              deepCheckQueue
            );

      console.log(
        "discovery_prefilter",
        JSON.stringify({
          run_id:
            runId,

          mode:
            discoveryPrefilter
              ?.mode ??
            null,

          universe_total:
            discoveryPrefilter
              ?.counts
              ?.universe_total ??
            0,

          technical_eligible:
            discoveryPrefilter
              ?.counts
              ?.technical_eligible ??
            0,

          liquidity_pool:
            discoveryPrefilter
              ?.counts
              ?.liquidity_pool ??
            0,

          anomaly_pool:
            discoveryPrefilter
              ?.counts
              ?.anomaly_pool ??
            0,

          shortlist_count:
            discoveryPrefilter
              ?.counts
              ?.shortlist ??
            0,

          shortlist:
            Array.isArray(
              discoveryPrefilter
                ?.shortlist
            )
              ? discoveryPrefilter
                  .shortlist
                  .map(
                    (row) => ({
                      rank:
                        row
                          ?.priority_rank ??
                        null,

                      contract:
                        row
                          ?.contract ??
                        null,

                      flags:
                        row
                          ?.anomaly_flags_count ??
                        0,
                    })
                  )
              : [],

          decision_generated:
            discoveryPrefilter
              ?.decision
              ?.generated === true,

          direction:
            discoveryPrefilter
              ?.decision
              ?.direction ??
            null,

          probability:
            discoveryPrefilter
              ?.decision
              ?.probability ??
            null,

          validated:
            discoveryPrefilter
              ?.decision
              ?.validated === true,

          network_calls_generated:
            discoveryPrefilter
              ?.execution
              ?.network_calls_generated ??
            null,

          d1_calls_generated:
            discoveryPrefilter
              ?.execution
              ?.d1_calls_generated ??
            null,

          deep_check_started:
            discoveryPrefilter
              ?.execution
              ?.deep_check_started === true,

          telegram_started:
            discoveryPrefilter
              ?.execution
              ?.telegram_started === true,
        })
      );

      const confirmedScopeContracts =
        Array.isArray(
          scan?.contracts
        )
          ? scan.contracts
              .filter(
                (row) =>
                  row
                    ?.instrument_scope
                    ?.classification ===
                  "CRYPTO_CONFIRMED"
              )
              .map(
                (row) =>
                  String(
                    row
                      ?.contract_code ||
                    ""
                  ).trim()
              )
              .filter(Boolean)
          : [];

      const cycleNow =
        Date.now();

      const opportunityJournalPlan =
        await selectOpportunityJournalCandidate({
          env,
          confirmed_contracts:
            confirmedScopeContracts,
          now:
            cycleNow,
        });

      const journalMaintenanceSelected =
        opportunityJournalPlan
          ?.status ===
          "SELECTED_BOUNDED_JOURNAL_MAINTENANCE" &&
        Boolean(
          opportunityJournalPlan
            ?.selected_contract
        );

      /*
       * One deterministic cron slot out of four is reserved for a due
       * factual outcome only when such an outcome exists. On that slot the
       * Stage 3.8 queue is left untouched (no lease is claimed and no debt is
       * fabricated). All other slots retain the Stage 3.8.1 path unchanged.
       */
      const fastMoveWatchCycle =
        journalMaintenanceSelected
          ? {
              version:
                FAST_MOVE_WATCH_VERSION,
              status:
                "DEFERRED_FOR_BOUNDED_OPPORTUNITY_JOURNAL_SLOT",
              adaptive_discovery_prefilter:
                discoveryPrefilter,
              adaptive_cooldown_sec:
                1800,
              selected_contracts: [],
              selected_leases: [],
              writes_used: 0,
              plan: {
                queue_depth: null,
                starvation_indicator:
                  false,
              },
            }
          : await prepareFastMoveWatchCycle({
              env,
              scan,
              discovery_prefilter:
                discoveryPrefilter,
              run_id:
                runId,
              now:
                cycleNow,
            });

      const adaptiveDiscoveryPrefilter =
        journalMaintenanceSelected
          ? buildOpportunityJournalPrefilter(
              discoveryPrefilter,
              opportunityJournalPlan
                ?.candidate
            )
          : fastMoveWatchCycle
              ?.adaptive_discovery_prefilter ||
            discoveryPrefilter;

      console.log(
        "fast_move_watch_prepare",
        JSON.stringify({
          run_id: runId,
          status:
            fastMoveWatchCycle
              ?.status ??
            null,
          selected_contracts:
            fastMoveWatchCycle
              ?.selected_contracts ??
            [],
          adaptive_cooldown_sec:
            fastMoveWatchCycle
              ?.adaptive_cooldown_sec ??
            1800,
          writes_used:
            fastMoveWatchCycle
              ?.writes_used ??
            0,
          queue_depth:
            fastMoveWatchCycle
              ?.plan
              ?.queue_depth ??
            0,
          decision_generated:
            false,
          validated:
            false,
          telegram_started:
            false,
          trading_execution:
            false,
          opportunity_journal_slot:
            opportunityJournalPlan
              ?.status ??
            null,
        })
      );

      const boundedDeepCheck =
        await runBoundedDeepCheckScheduler(
          adaptiveDiscoveryPrefilter,
          env,
          runId,
          {
            max_per_run:
              1,

            cooldown_sec:
              fastMoveWatchCycle
                ?.adaptive_cooldown_sec ??
              1800,

            lease_sec:
              600,

            require_exact_contract:
              true,

            required_contract:
              journalMaintenanceSelected
                ? opportunityJournalPlan
                    ?.selected_contract ??
                  null
                : fastMoveWatchCycle
                    ?.selected_leases?.[0]
                    ?.contract ??
                  null,

            queue_starvation:
              fastMoveWatchCycle
                ?.plan
                ?.starvation_indicator ===
              true,

            confirmed_scope_contracts:
              confirmedScopeContracts,
          }
        );

      console.log(
        "bounded_deep_check_scheduler",
        JSON.stringify({
          run_id:
            runId,

          status:
            boundedDeepCheck
              ?.status ??
            null,

          scope_status:
            boundedDeepCheck
              ?.plan
              ?.scope_status ??
            null,

          confirmed_crypto_contracts:
            confirmedScopeContracts
              .length,

          execution_lane:
            journalMaintenanceSelected
              ? "OPPORTUNITY_JOURNAL_MAINTENANCE"
              : "FAST_MOVE_WATCH",

          opportunity_journal_plan: {
            status:
              opportunityJournalPlan
                ?.status ??
              null,
            selected_contract:
              opportunityJournalPlan
                ?.selected_contract ??
              null,
            due_outcome_count:
              opportunityJournalPlan
                ?.candidate
                ?.due_outcome_count ??
              0,
            oldest_target_ts:
              opportunityJournalPlan
                ?.candidate
                ?.oldest_target_ts ??
              null,
          },

          selected:
            boundedDeepCheck
              ?.plan
              ?.counts
              ?.selected ??
            0,

          estimated_external_requests:
            boundedDeepCheck
              ?.plan
              ?.budget
              ?.estimated_external_requests_this_run ??
            null,

          results:
            Array.isArray(
              boundedDeepCheck
                ?.results
            )
              ? boundedDeepCheck
                  .results
                  .map(
                    (row) => ({
                      contract:
                        row?.contract ??
                        null,
                      execution_status:
                        row
                          ?.execution_status ??
                        null,
                      data_sufficiency:
                        row
                          ?.data_sufficiency ??
                        null,
                      decision_generated:
                        row
                          ?.decision_generated ===
                        true,
                      validated:
                        row?.validated ===
                        true,
                      journal_status:
                        row
                          ?.journal_status ??
                        null,
                    })
                  )
              : [],

          decision_generated:
            boundedDeepCheck
              ?.decision
              ?.generated === true,

          validated:
            boundedDeepCheck
              ?.decision
              ?.validated === true,

          telegram_started:
            boundedDeepCheck
              ?.telegram_started === true,
        })
      );

      const fastMoveWatchFinal =
        journalMaintenanceSelected
          ? {
              version:
                FAST_MOVE_WATCH_VERSION,
              status:
                "NOT_APPLICABLE_OPPORTUNITY_JOURNAL_MAINTENANCE",
              finalized: [],
              writes_used: 0,
            }
          : await finalizeFastMoveWatchCycle({
              env,
              cycle:
                fastMoveWatchCycle,
              deep_check_results:
                boundedDeepCheck
                  ?.results ??
                [],
              discovery_prefilter:
                adaptiveDiscoveryPrefilter,
              now:
                Date.now(),
            });

      console.log(
        "fast_move_watch_finalize",
        JSON.stringify({
          run_id: runId,
          status:
            fastMoveWatchFinal
              ?.status ??
            null,
          finalized:
            fastMoveWatchFinal
              ?.finalized ??
            [],
          writes_used:
            fastMoveWatchFinal
              ?.writes_used ??
            0,
          total_stage38_writes:
            Number(
              fastMoveWatchCycle
                ?.writes_used ??
              0
            ) +
            Number(
              fastMoveWatchFinal
                ?.writes_used ??
              0
            ),
          decision_generated:
            false,
          validated:
            false,
          telegram_started:
            false,
          trading_execution:
            false,
        })
      );


      /*
       * D1 Free allows 50 queries per Worker invocation. The conservative
       * full Deep-Check path uses at most 48 after the JSON1 compaction in
       * Stage 3.9.1. The older calibration sweep can use another 14 queries,
       * so it is deferred whenever a Deep Check was attempted. On idle cron
       * ticks it keeps its existing bounded four-task behavior.
       */
      const deepCheckAttempted =
        deepCheckAttemptedForD1Budget(
          boundedDeepCheck
        );

      const shadowOutcomeSweep =
        deepCheckAttempted
          ? {
              mode:
                "CALIBRATION_ONLY_NO_LIVE_PROMOTION",
              last_status:
                "DEFERRED_D1_FREE_QUERY_BUDGET",
              tasks_processed:
                0,
              closed_written:
                0,
              insufficient_written:
                0,
              d1_queries_used:
                0,
              d1_free_query_limit:
                D1_FREE_QUERY_LIMIT,
              conservative_deep_check_path_queries:
                CONSERVATIVE_DEEP_CHECK_D1_QUERY_BUDGET,
              deferred_legacy_sweep_max_queries:
                LEGACY_OUTCOME_SWEEP_MAX_D1_QUERIES,
              deferred_reason:
                "LEGACY_SHADOW_OUTCOME_SWEEP_WOULD_EXCEED_CONSERVATIVE_D1_FREE_ENVELOPE",
              automatic_weight_tuning_enabled:
                false,
              live_promotion_allowed:
                false,
            }
          : await runShadowOutcomeCalibrationSweep(
              env,
              Date.now(),
              4
            );

      console.log(
        "shadow_outcome_calibration",
        JSON.stringify({
          run_id: runId,
          ...shadowOutcomeSweep,
        })
      );

      // Stage 3.9.2 Full Evidence retention is deliberately outside the hot
      // Deep Check. On idle cron ticks it uses one bounded maintenance query.
      const stage392FullEvidenceMaintenance = deepCheckAttempted
        ? { status: "DEFERRED_D1_FREE_QUERY_BUDGET", statements: 0, deleted: 0, hot_path: false }
        : await runStage392FullEvidenceMaintenance(env, Date.now());

      console.log(
        "stage392_full_evidence_maintenance",
        JSON.stringify({ run_id: runId, ...stage392FullEvidenceMaintenance })
      );
      const persistenceStatus =
        scan?.persistence
          ?.status ||
        null;

      const success =
        Boolean(
          scan?.health
            ?.contracts &&
          scan?.counts
            ?.universe_total >
            0 &&
          persistenceStatus ===
            "CLOSED"
        );

      const completedTs =
        Date.now();

      await recordCronRun(
        env,
        {
          run_id:
            runId,

          scheduled_time:
            scheduledTime,

          started_ts:
            startedTs,

          completed_ts:
            completedTs,

          status:
            success
              ? "SUCCESS"
              : "PARTIAL",

          universe_total:
            scan?.counts
              ?.universe_total ??
            null,

          scanned:
            scan?.counts
              ?.scanned ??
            null,

          persistence_status:
            persistenceStatus,

          error_text:
            success
              ? null
              : JSON.stringify(
                  scan?.endpoint_errors ||
                  scan?.persistence ||
                  {}
                ),
        }
      );

      console.log(
        success
          ? "cron_success"
          : "cron_partial",

        JSON.stringify({
          run_id:
            runId,

          completed_ts:
            completedTs,

          universe_total:
            scan?.counts
              ?.universe_total ??
            null,

          scanned:
            scan?.counts
              ?.scanned ??
            null,

          persistence_status:
            persistenceStatus,
        })
      );
    } catch (error) {
      const completedTs =
        Date.now();

      const message =
        String(
          error?.message ||
          error
        );

      await recordCronRun(
        env,
        {
          run_id:
            runId,

          scheduled_time:
            scheduledTime,

          started_ts:
            startedTs,

          completed_ts:
            completedTs,

          status:
            "ERROR",

          error_text:
            message,
        }
      );

      console.error(
        "cron_error",
        JSON.stringify({
          run_id:
            runId,

          error:
            message,
        })
      );

      throw error;
    }
  },
};

/* REPORT2_GITHUB_BYK_PROXY_V4_1 — protected source proxy only. */
async function __report2CloudByKProxy(request, env) {
 if(request.method!=="POST") return new Response(JSON.stringify({ok:false,error:"POST_REQUIRED"}),{status:405,headers:{"content-type":"application/json","cache-control":"no-store"}});
 const token=String(env?.REPORT2_CLOUD_SOURCE_PROXY_TOKEN||""); if(!token||request.headers.get("authorization")!==`Bearer ${token}`) return new Response(JSON.stringify({ok:false,error:"UNAUTHORIZED"}),{status:401,headers:{"content-type":"application/json","cache-control":"no-store"}});
 const apiKey=String(env?.BYKARANTELI_API_KEY||""); if(!apiKey) return new Response(JSON.stringify({ok:false,error:"PROVIDER_SECRET_MISSING"}),{status:503,headers:{"content-type":"application/json","cache-control":"no-store"}});
 let body; try{const text=await request.text(); if(text.length>8192) throw new Error("BODY_TOO_LARGE"); body=JSON.parse(text||"{}");}catch(e){return new Response(JSON.stringify({ok:false,error:String(e?.message||"INVALID_JSON")}),{status:400,headers:{"content-type":"application/json","cache-control":"no-store"}});}
 let target; try{target=new URL(String(body?.url||""));}catch{return new Response(JSON.stringify({ok:false,error:"INVALID_URL"}),{status:400,headers:{"content-type":"application/json","cache-control":"no-store"}});}
 const policy=validateByKaranteliProxyTarget(target); if(!policy.allowed) return new Response(JSON.stringify({ok:false,error:"URL_NOT_ALLOWED",reason:policy.reason}),{status:403,headers:{"content-type":"application/json","cache-control":"no-store"}});
 const provider=await fetch(target.toString(),{method:"GET",headers:{accept:"application/json",authorization:`Bearer ${apiKey}`,"user-agent":"My-Report-2-HUB/4.1-github-proxy"}}); return new Response(provider.body,{status:provider.status,headers:{"content-type":provider.headers.get("content-type")||"application/json","cache-control":"no-store"}});
}
export default {...__REPORT2_ORIGINAL_HANDLER,async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==="/cloud-bykaranteli-proxy")return __report2CloudByKProxy(request,env);if(typeof __REPORT2_ORIGINAL_HANDLER.fetch!=="function")return new Response("Not Found",{status:404});return __REPORT2_ORIGINAL_HANDLER.fetch(request,env,ctx);}};

