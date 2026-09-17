const FUTURES_BASE = "https://api.hbdm.com";
const SPOT_BASE = "https://api.htx.com";

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

function flattenTrades(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    const result = [];

    for (const item of raw) {
      if (Array.isArray(item?.data)) {
        result.push(...item.data);
      } else if (
        item &&
        typeof item === "object" &&
        item.price !== undefined
      ) {
        result.push(item);
      }
    }

    return result;
  }

  if (Array.isArray(raw?.data)) return flattenTrades(raw.data);
  if (Array.isArray(raw?.tick?.data)) return raw.tick.data;

  return [];
}

function tradeTime(t) {
  return normalizeTs(t?.ts);
}

function sortedTrades(trades) {
  return [...trades].sort(
    (a, b) => (tradeTime(a) || 0) - (tradeTime(b) || 0)
  );
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
  min24h
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

    return {
      ...summarizeSpotTrades(windowTrades),
      window_hours: hours,
      window_start_time: iso(start),
      history_covers_full_window: complete,
      minimum_trades_required: minTrades,
      enough_trades: enoughTrades,
      usable:
        complete &&
        enoughTrades &&
        latestAgeSec !== null &&
        latestAgeSec <= freshnessSec,
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
    fetchJson(endpoints.info),
    fetchJson(endpoints.depth),
    fetchJson(endpoints.bbo),
    fetchJson(endpoints.trades),
    fetchJson(endpoints.oi),
    fetchJson(endpoints.funding),
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

  const orderFlow = summarizeFuturesTrades(tradeList, contractSize);
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
      health.info && health.depth && health.bbo && buyImpact && sellImpact
        ? "closed"
        : "not_closed",
    htx_futures_order_flow: health.trades ? "closed" : "not_closed",
    htx_open_interest: health.oi ? "closed" : "not_closed",
    htx_funding: health.funding ? "closed" : "not_closed",
  };

  return {
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
    note: "CVD/Delta рассчитаны только по возвращенной выборке сделок HTX, не за 24 часа.",
    endpoint_errors: {
      info: infoR.ok ? null : infoR.error,
      depth: depthR.ok ? null : depthR.error,
      bbo: bboR.ok ? null : bboR.error,
      trades: tradesR.ok ? null : tradesR.error,
      oi: oiR.ok ? null : oiR.error,
      funding: fundingR.ok ? null : fundingR.error,
    },
  };
}

/* =========================================================
   SPOT SNAPSHOT — существующий модуль
   ========================================================= */

async function spotSnapshot(params) {
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
  };

  const [tickerR, depthR, tradesR] = await Promise.all([
    fetchJson(endpoints.ticker),
    fetchJson(endpoints.depth),
    fetchJson(endpoints.trades),
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
  const orderFlow = spotFlowAnalysis(
    tradeList,
    now,
    freshnessSec,
    min1h,
    min4h,
    min24h
  );

  const health = {
    ticker: Boolean(tickerR.ok && ticker && num(ticker.close) !== null),
    depth: Boolean(depthR.ok && bids.length && asks.length),
    trades_endpoint: Boolean(tradesR.ok),
    trades_received: Boolean(tradesR.ok && tradeList.length),
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
      "Spot taker buy/sell, Delta и CVD рассчитаны из официальных HTX raw trades. Старые сделки больше не дают ложный статус closed. Окна 1ч, 4ч и 24ч проверяются отдельно.",
    endpoint_errors: {
      ticker: tickerR.ok ? null : tickerR.error,
      depth: depthR.ok ? null : depthR.error,
      trades: tradesR.ok ? null : tradesR.error,
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
      trade_count: num(k?.count),
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
  const expectedBars = Math.max(1, Math.round((endMs - startMs) / 60000));

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

  const tradeCount = bars.reduce(
    (s, k) => s + (k.trade_count || 0),
    0
  );

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
    first_bar_time: iso(first.ts),
    last_bar_time: iso(last.ts),
  };
}

function tradesInRange(trades, startMs, endMs) {
  return trades.filter((trade) => {
    const ts = tradeTime(trade);
    return ts !== null && ts >= startMs && ts < endMs;
  });
}

function summarizeFuturesFlowRange(
  orderedTrades,
  startMs,
  endMs,
  contractSize,
  minTrades,
  boundaryToleranceMs = 120000
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
    usable,
    coverage: usable ? "closed" : "not_closed",
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
    !flow?.usable
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
    !flow?.usable
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
      minTrades
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
    tradesR,
    oiContractsR,
    oiBaseR,
    oiCurrentR,
    fundingCurrentR,
    fundingHistoryR,
  ] = await Promise.all([
    fetchJson(endpoints.info),
    fetchJson(endpoints.kline_1m),
    fetchJson(endpoints.trades),
    fetchJson(endpoints.oi_contracts),
    fetchJson(endpoints.oi_base),
    fetchJson(endpoints.oi_current),
    fetchJson(endpoints.funding_current),
    fetchJson(endpoints.funding_history),
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

  return {
    source:
      "HTX official public API",

    market:
      "HTX USDT-M Futures",

    tool:
      "htx_futures_trajectory",

    version:
      "1.0",

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
        "Официальные HTX 1m Kline. Для 1ч/4ч/24ч границы синхронизируются с фактическими часовыми OI timestamp.",

      open_interest:
        "Официальный HTX swap_his_open_interest. Минимальная историческая гранулярность 60min; 5m/15m OI не рассчитывается и не интерполируется.",

      order_flow:
        "Официальные HTX raw trades, максимум 2000 возвращённых trade-records. Окно closed только если фактическая выборка перекрывает обе границы окна и содержит минимум сделок.",

      funding:
        "Текущий funding + официальная история settlement. Интервал funding выводится из фактических timestamp, а не предполагается.",
    },

    raw_sample_meta: {
      klines_requested:
        klineSize,

      closed_1m_klines_received:
        closedKlines.length,

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
      "Если history trade sample не перекрывает окно полностью, flow coverage остаётся not_closed независимо от величины Delta.",
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
      "stage0-compact-v1",

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
      "3.3-bounded-deep-check-cron",

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
      row?.data_status !==
      "CLOSED"
    ) {
      reasons.push(
        "STAGE0_NOT_CLOSED"
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
      reasons.push(
        "OPEN_INTEREST_MISSING"
      );
    }

    if (
      row?.quality
        ?.funding_present !== true
    ) {
      reasons.push(
        "FUNDING_MISSING"
      );
    }

    if (
      row?.quality
        ?.history_available !== true
    ) {
      reasons.push(
        "STAGE0_HISTORY_MISSING"
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
          true,
      });
    } else {
      excluded.push({
        contract:
          contract || null,
        reasons,
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
    Array.isArray(
      scan?.contracts
    )
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

  const maxShortlist =
    Math.min(
      50,
      Math.max(
        1,
        Math.round(
          Number(
            options
              ?.max_shortlist ??
            12
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

  const fundingOf =
    (row) =>
      factualNumber(
        row?.funding
          ?.funding_rate_pct
      );

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
  }

  /*
   * Funding is intentionally evaluated
   * only among NON-ZERO funding values.
   *
   * Current HTX universe has many exact
   * zero values, so a percentile across
   * the whole universe would collapse
   * toward zero and would not represent
   * true funding extremity.
   *
   * Sign is ignored here. This is
   * discovery only, not LONG/SHORT logic.
   */
  const nonZeroFundingAbs =
    eligibleRows
      .map(fundingOf)
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

  const liquidityPool = [];
  const belowLiquidity = [];
  const insufficientLiquidityData = [];

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
      !finite(oiFloor)
    ) {
      insufficientLiquidityData.push(
        contract
      );

      continue;
    }

    if (
      turnover < turnoverFloor ||
      oiValue < oiFloor
    ) {
      belowLiquidity.push(
        contract
      );

      continue;
    }

    liquidityPool.push(row);
  }

  const anomalyPool = [];

  for (const row of liquidityPool) {
    const contract =
      String(
        row?.contract_code || ""
      ).trim();

    const flags = [];

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

      const threshold =
        anomalyThresholds[
          `${window}:${field}`
        ];

      if (
        finite(value) &&
        finite(threshold) &&
        Math.abs(value) >=
          threshold
      ) {
        flags.push(
          `${window}:${field}`
        );
      }
    }

    const funding =
      fundingOf(row);

    if (
      finite(funding) &&
      funding !== 0 &&
      finite(
        fundingAbsThreshold
      ) &&
      Math.abs(funding) >=
        fundingAbsThreshold
    ) {
      flags.push(
        "funding:absolute_extreme"
      );
    }

    if (
      flags.length <
      minAnomalyFlags
    ) {
      continue;
    }

    anomalyPool.push({
      contract,

      anomaly_flags_count:
        flags.length,

      anomaly_flags:
        flags,

      turnover_24h_usdt:
        turnoverOf(row),

      open_interest_value_usdt:
        oiOf(row),

      funding_rate_pct:
        funding,

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
    });
  }

  /*
   * This is an operational priority
   * ordering, NOT a trading score.
   *
   * 1. More independent anomaly flags
   *    first.
   * 2. Higher factual 24h turnover only
   *    breaks ties.
   * 3. Contract name makes ordering
   *    deterministic.
   *
   * Funding sign is never used to infer
   * LONG or SHORT.
   */
  anomalyPool.sort(
    (a, b) => {
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
      "NEUTRAL_UNIVERSE_RELATIVE_ANOMALY_ONLY",

    parameters: {
      liquidity_percentile:
        liquidityPercentile,

      anomaly_percentile:
        anomalyPercentile,

      funding_percentile_nonzero:
        fundingPercentile,

      min_anomaly_flags:
        minAnomalyFlags,

      max_shortlist:
        maxShortlist,
    },

    thresholds: {
      turnover_24h_usdt_floor:
        turnoverFloor,

      open_interest_value_usdt_floor:
        oiFloor,

      funding_abs_nonzero_threshold:
        fundingAbsThreshold,

      anomaly:
        anomalyThresholds,
    },

    counts: {
      universe_total:
        contracts.length,

      technical_eligible:
        eligibleRows.length,

      liquidity_pool:
        liquidityPool.length,

      anomaly_pool:
        anomalyPool.length,

      shortlist:
        shortlist.length,

      below_liquidity:
        belowLiquidity.length,

      insufficient_liquidity_data:
        insufficientLiquidityData.length,
    },

    shortlist,

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
      "Discovery Prefilter uses only factual Stage-0 data already present in memory.",
      "No external HTTP request is generated by this layer.",
      "No D1 request is generated by this layer.",
      "No LONG/SHORT direction is generated.",
      "No trading probability or trading score is generated.",
      "No validated=true signal is generated.",
      "No strategy weights or Hard Veto rules are changed.",
      "Anomaly detection is universe-relative and uses absolute magnitude, not directional interpretation.",
      "Funding sign is ignored; only non-zero absolute funding extremity may create a discovery flag.",
      "Rolling-24h turnover transition proxy is not used as exact interval volume.",
      "Priority rank is operational scheduling order only and is not a trade recommendation.",
      "Deep Check is not started by this function.",
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

  const configuredMax =
    Math.round(
      schedulerNumber(
        options?.max_per_run
      ) ?? 1
    );

  const maxPerRun =
    Math.min(
      HARD_MAX_PER_RUN,
      Math.max(
        0,
        configuredMax
      )
    );

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

  const selected =
    ready.slice(
      0,
      maxPerRun
    );

  const stage0External =
    4;

  const deepCheckExternal =
    17;

  const estimatedExternal =
    stage0External +
    selected.length *
      deepCheckExternal;

  return {
    layer:
      "BOUNDED_DEEP_CHECK_SCHEDULER",

    mode:
      "CRON_WIRED_BOUNDED_EXECUTION",

    parameters: {
      hard_max_per_run:
        HARD_MAX_PER_RUN,

      configured_max_per_run:
        maxPerRun,

      cooldown_sec:
        cooldownSec,

      lease_sec:
        leaseSec,

      scope_required:
        true,
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

      estimated_external_requests_this_run:
        estimatedExternal,

      workers_free_external_limit:
        50,

      within_known_external_limit:
        estimatedExternal <= 50,

      three_deep_checks_would_estimate:
        stage0External +
        3 *
          deepCheckExternal,
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
      "Initial production configuration is intended to use max_per_run=1.",
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
    completed_ts,
    status,
    sufficiency,
    error,
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

  try {
    const result =
      await env.DATA_DB
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
          String(
            status ||
            "COMPLETED"
          ),
          sufficiency ??
            null,
          error ??
            null
        )
        .run();

    return {
      status: "CLOSED",
      changes:
        Number(
          result?.meta
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
      results: [],
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
      results: [],
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
    !plan.selected.length
  ) {
    return {
      layer:
        "BOUNDED_DEEP_CHECK_EXECUTOR",
      status:
        plan.scope_status ===
        "CONFIRMED_SET_SUPPLIED"
          ? "NO_READY_TARGETS"
          : "SCOPE_UNCONFIRMED_FAIL_CLOSED",
      plan,
      results: [],
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
          },
          env
        );

      const sufficiency =
        deep
          ?.data_sufficiency
          ?.classification ??
        null;

      await finalizeDeepCheckSchedulerSlot(
        env,
        {
          contract:
            target.contract,
          run_id:
            runId,
          completed_ts:
            Date.now(),
          status:
            "COMPLETED",
          sufficiency,
          error:
            null,
        }
      );

      results.push({
        contract:
          target.contract,
        execution_status:
          "FULFILLED",
        data_sufficiency:
          sufficiency,
        decision_generated:
          deep
            ?.decision
            ?.validated === true ||
          deep
            ?.decision
            ?.direction != null ||
          deep
            ?.decision
            ?.probability != null,
        validated:
          deep
            ?.decision
            ?.validated === true,
      });
    } catch (error) {
      const message =
        String(
          error?.message ||
          error
        );

      await finalizeDeepCheckSchedulerSlot(
        env,
        {
          contract:
            target.contract,
          run_id:
            runId,
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
        }
      );

      results.push({
        contract:
          target.contract,
        execution_status:
          "REJECTED",
        error:
          message,
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
}function normalizeLiquidationRow(row, requestedType) {
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
  events
) {
  if (!env?.DATA_DB) {
    return {
      status:
        "SOURCE_UNSUPPORTED",

      reason:
        "D1 binding DATA_DB is not configured",
    };
  }

  if (!events.length) {
    return {
      status:
        "CLOSED",

      rows_written:
        0,
    };
  }

  try {
    const sql = `
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
      VALUES (
        ?1,
        ?2,
        ?3,
        ?4,
        ?5,
        ?6,
        ?7,
        ?8,
        ?9,
        ?10
      )
    `;

    const statements =
      events.map(
        (e) =>
          env.DATA_DB
            .prepare(
              sql
            )
            .bind(
              e.source,
              e.event_id,
              e.contract_code,
              e.created_at,
              e.side,
              e.price,
              e.volume_contracts,
              e.amount_base,
              e.notional_usdt,
              JSON.stringify(
                e
              )
            )
      );

    let written = 0;

    for (
      let i = 0;
      i < statements.length;
      i += 50
    ) {
      const r =
        await env.DATA_DB.batch(
          statements.slice(
            i,
            i + 50
          )
        );

      written +=
        r.reduce(
          (
            s,
            x
          ) =>
            s +
            (
              x?.meta?.changes ||
              0
            ),
          0
        );
    }

    return {
      status:
        "CLOSED",

      rows_written:
        written,
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

  const longEvents =
    asArray(
      longR.data?.data
    ).map(
      (x) =>
        normalizeLiquidationRow(
          x,
          5
        )
    );

  const shortEvents =
    asArray(
      shortR.data?.data
    ).map(
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
    },

    coverage: {
      htx_factual_long_liquidations:
        longR.ok
          ? "closed"
          : "not_closed",

      htx_factual_short_liquidations:
        shortR.ok
          ? "closed"
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
        events
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

async function dataPlaneStatus(env) {
  const now = Date.now();

  const base = {
    tool:
      "data_plane_status",

    version:
      "3.3-bounded-deep-check-cron",

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
        "SCAFFOLD_ONLY_NOT_PROMOTED",

      fast_move_watch:
        "SCAFFOLD_ONLY_REQUIRES_VALIDATED_TECHNICAL_THRESHOLDS",

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



async function buildDeepCheckInput(params, env) {
  const now = Date.now();

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
    trades: 500,
  };

  const spotParams = {
    symbol: contract,
    notional_usdt: 1000,
    trades: 2000,
    freshness_sec: 900,
  };

  const trajectoryParams = {
    contract,
    trades: 2000,
    kline_size: 1600,
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

  function settled(result) {
    if (result.status === "fulfilled") {
      return {
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
      requested_components: 4,
      fulfilled_components:
        4 - failedComponents.length,
      failed_components:
        failedComponents,
      complete:
        failedComponents.length === 0,
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

export default {
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
            "3.3-bounded-deep-check-cron",

          modules: {
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
        buildDiscoveryPrefilter(
          scan,
          deepCheckQueue,
          {
            liquidity_percentile:
              0.70,

            anomaly_percentile:
              0.95,

            funding_percentile:
              0.95,

            min_anomaly_flags:
              2,

            max_shortlist:
              12,
          }
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

      const boundedDeepCheck =
        await runBoundedDeepCheckScheduler(
          discoveryPrefilter,
          env,
          runId,
          {
            max_per_run:
              1,

            cooldown_sec:
              1800,

            lease_sec:
              600,

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
