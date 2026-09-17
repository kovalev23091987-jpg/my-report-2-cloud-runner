export const LIQUIDATION_INTELLIGENCE_VERSION = "cross-venue-liquidation-shadow-v1";
export const LIQUIDATION_CONTRACT_VERSION = "liquidation-evidence-v1";

/* STAGE371_CORE_START */
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
/* STAGE371_CORE_END */

export const providerSymbolFromContract = LIQUIDATION_INTELLIGENCE_API.providerSymbolFromContract;
export const parseProviderSymbolRegistry = LIQUIDATION_INTELLIGENCE_API.parseProviderSymbolRegistry;
export const parseProjectedMap = LIQUIDATION_INTELLIGENCE_API.parseProjectedMap;
export const parseRealizedSummary = LIQUIDATION_INTELLIGENCE_API.parseRealizedSummary;
export const parseCoverage = LIQUIDATION_INTELLIGENCE_API.parseCoverage;
export const collectCrossVenueLiquidationIntelligence = LIQUIDATION_INTELLIGENCE_API.collectCrossVenueLiquidationIntelligence;
export const persistLiquidationShadow = LIQUIDATION_INTELLIGENCE_API.persistShadow;
