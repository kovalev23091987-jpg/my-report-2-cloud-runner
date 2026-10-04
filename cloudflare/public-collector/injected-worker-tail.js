var __REPORT2_PUBLIC_COLLECTOR_VERSION = "report2-public-collector-v7-retention-before-write-20261004";
var __REPORT2_PUBLIC_COLLECTOR_GENERATION = "MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M";
var __REPORT2_PUBLIC_COLLECTOR_ACTOR = "HUB_PUBLIC_COLLECTOR";
var __REPORT2_PUBLIC_COLLECTOR_SLOT_MS = 5 * 60 * 1e3;
var __REPORT2_PUBLIC_COLLECTOR_RETENTION_MS = 72 * 60 * 60 * 1e3;
var __REPORT2_PUBLIC_COLLECTOR_MAX_PAYLOAD_BYTES = 64 * 1024;
var __REPORT2_PUBLIC_COLLECTOR_MAX_CONTRACTS_PER_SHARD = 64;
var __REPORT2_PUBLIC_COLLECTOR_DAILY_WRITE_CAP = 1e4;

function __report2PublicCollectorSwitch(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}
function __report2PublicCollectorFinite(value) {
  if (value === null || value === void 0 || value === "") return null;
  var n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function __report2PublicCollectorTimestamp(value) {
  var n = __report2PublicCollectorFinite(value);
  if (n === null) return null;
  return n < 1e12 ? Math.trunc(n * 1e3) : Math.trunc(n);
}
function __report2PublicCollectorRows(payload) {
  if (Array.isArray(payload?.ticks)) return payload.ticks;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}
function __report2PublicCollectorContract(row) {
  return String(row?.contract_code ?? row?.symbol ?? "").trim().toUpperCase();
}
function __report2PublicCollectorMap(payload) {
  var map = /* @__PURE__ */ new Map();
  for (var row of __report2PublicCollectorRows(payload)) {
    var contract = __report2PublicCollectorContract(row);
    if (contract) map.set(contract, row);
  }
  return map;
}
function __report2PublicCollectorIntervalHours(funding, info) {
  var direct = __report2PublicCollectorFinite(funding?.funding_interval_hours ?? funding?.funding_interval ?? info?.funding_interval_hours ?? info?.funding_interval);
  if (direct !== null && direct > 0) return direct > 60 ? direct / 60 : direct;
  var a = __report2PublicCollectorTimestamp(funding?.funding_time);
  var b = __report2PublicCollectorTimestamp(funding?.next_funding_time);
  return a !== null && b !== null && b > a ? (b - a) / 36e5 : null;
}
async function __report2PublicCollectorJson(url) {
  var started = Date.now();
  var response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "My-Report-2-Public-Collector/1.0" },
    signal: AbortSignal.timeout(2e4)
  });
  var text = await response.text();
  var payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`PUBLIC_COLLECTOR_INVALID_JSON_HTTP_${response.status}`);
  }
  if (!response.ok) throw new Error(`PUBLIC_COLLECTOR_HTTP_${response.status}`);
  var providerStatus = payload?.status == null ? null : String(payload.status).toLowerCase();
  var providerCode = payload?.code == null ? null : Number(payload.code);
  if ((providerStatus !== null && providerStatus !== "ok") || (providerCode !== null && providerCode !== 200)) {
    throw new Error(`PUBLIC_COLLECTOR_PROVIDER_STATUS_${String(payload?.status ?? payload?.code ?? "UNKNOWN")}`);
  }
  return { payload, elapsed_ms: Date.now() - started, source_ts: __report2PublicCollectorTimestamp(payload?.ts) };
}
async function __report2PublicCollectorHash(text) {
  var digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function __report2PublicCollectorPriorSnapshot(db) {
  var result = await db.prepare(`SELECT bucket,generation,shard,source_timestamps_json,payload FROM report2_market_snapshot_batch_v1
    WHERE actor=?1 AND schema_version='report2-market-snapshot-batch-v1' AND status='COMPLETE'
      AND bucket=(SELECT MAX(bucket) FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND schema_version='report2-market-snapshot-batch-v1' AND status='COMPLETE')
    ORDER BY generation DESC,shard ASC LIMIT 32`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR).all();
  var records = Array.isArray(result?.results) ? result.results : [];
  if (!records.length) return { status: "EMPTY", rows: [], catalog_ts: null };
  var chosenGeneration = records.some(row => row.generation === __REPORT2_PUBLIC_COLLECTOR_GENERATION) ? __REPORT2_PUBLIC_COLLECTOR_GENERATION : records[0].generation;
  records = records.filter(row => row.generation === chosenGeneration);
  var meta = null;
  try {
    meta = JSON.parse(records[0].source_timestamps_json || "{}");
  } catch {
    return { status: "INVALID_METADATA", rows: [], catalog_ts: null };
  }
  var expected = Number(meta?.expected_shards);
  if (!Number.isInteger(expected) || expected < 1 || records.length !== expected || records.some((row, index) => Number(row.shard) !== index)) {
    return { status: "INCOMPLETE_SHARDS", rows: [], catalog_ts: null };
  }
  var rows = [];
  try {
    for (var record of records) rows.push(...JSON.parse(record.payload || "[]"));
  } catch {
    return { status: "INVALID_PAYLOAD", rows: [], catalog_ts: null };
  }
  if (Number(meta?.universe_total) !== rows.length) return { status: "UNIVERSE_MISMATCH", rows: [], catalog_ts: null };
  return { status: "CLOSED", rows, catalog_ts: __report2PublicCollectorTimestamp(meta?.contracts), shard_rows_read: records.length, source_generation: chosenGeneration };
}
function __report2PublicCollectorCatalog(payload) {
  var map = /* @__PURE__ */ new Map();
  for (var row of __report2PublicCollectorRows(payload)) {
    var business = String(row?.business_type ?? "swap").toLowerCase();
    var contract = __report2PublicCollectorContract(row);
    if (contract && Number(row?.contract_status) === 1 && business === "swap") map.set(contract, row);
  }
  return map;
}
function __report2PublicCollectorCachedCatalog(prior) {
  var map = /* @__PURE__ */ new Map();
  for (var row of prior?.rows ?? []) {
    var contract = String(row?.contract ?? "").trim().toUpperCase();
    if (contract && row?.catalog_active !== false) map.set(contract, row);
  }
  return map;
}
async function __report2PublicCollectorPack({ bucket, received_ts, source_timestamps, rows }) {
  var ordered = [...rows].sort((a, b) => String(a.contract).localeCompare(String(b.contract)));
  var groups = [];
  var current = [];
  var currentBytes = 2; // JSON array brackets; commas and UTF-8 row bytes are added once.
  var encoder = new TextEncoder();
  var flush = () => {
    if (current.length) groups.push({ payload: `[${current.join(",")}]`, bytes: currentBytes, contracts: current.length }), current = [], currentBytes = 2;
  };
  for (var row of ordered) {
    var serialized = JSON.stringify(row);
    var rowBytes = encoder.encode(serialized).length;
    if (rowBytes + 2 > __REPORT2_PUBLIC_COLLECTOR_MAX_PAYLOAD_BYTES) throw new Error("PUBLIC_COLLECTOR_SINGLE_CONTRACT_TOO_LARGE");
    if (current.length >= __REPORT2_PUBLIC_COLLECTOR_MAX_CONTRACTS_PER_SHARD || currentBytes + rowBytes + (current.length ? 1 : 0) > __REPORT2_PUBLIC_COLLECTOR_MAX_PAYLOAD_BYTES) flush();
    currentBytes += rowBytes + (current.length ? 1 : 0);
    current.push(serialized);
  }
  flush();
  var metadata = { ...source_timestamps, expected_shards: groups.length, universe_total: ordered.length };
  var shards = [];
  for (var shard = 0; shard < groups.length; shard++) {
    var body = groups[shard];
    shards.push({
      bucket,
      actor: __REPORT2_PUBLIC_COLLECTOR_ACTOR,
      generation: __REPORT2_PUBLIC_COLLECTOR_GENERATION,
      schema_version: "report2-market-snapshot-batch-v1",
      shard,
      source_timestamps: metadata,
      received_ts,
      status: "COMPLETE",
      payload_hash: await __report2PublicCollectorHash(body.payload),
      payload: body.payload,
      contracts: body.contracts,
      payload_bytes: body.bytes
    });
  }
  return shards;
}
async function __report2PublicCollectorClaim(db, bucket, now) {
  var token = crypto.randomUUID();
  var day = Math.floor(bucket / 864e5) * 864e5;
  var daily = await db.prepare(`SELECT COUNT(*) AS slots,COALESCE(SUM(rows_written),0) AS rows_written
    FROM report2_public_collector_usage_v1 WHERE actor=?1 AND generation=?2 AND bucket>=?3 AND state='CLOSED'`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, day).first();
  if (Number(daily?.slots ?? 0) >= 288 || Number(daily?.rows_written ?? 0) >= __REPORT2_PUBLIC_COLLECTOR_DAILY_WRITE_CAP) {
    return { claimed: false, status: "DAILY_BUDGET_BLOCKED", daily };
  }
  var inserted = await db.prepare(`INSERT OR IGNORE INTO report2_public_collector_usage_v1
    (actor,generation,bucket,state,claim_token,lease_until,started_ts,completed_ts,external_requests,rows_read,rows_written,payload_bytes,status,error_text)
    VALUES(?1,?2,?3,'STARTED',?4,?5,?6,NULL,0,0,1,0,'STARTED',NULL)`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, bucket, token, now + 12e4, now).run();
  var row = await db.prepare(`SELECT state,claim_token,lease_until,status FROM report2_public_collector_usage_v1
    WHERE actor=?1 AND generation=?2 AND bucket=?3 LIMIT 1`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, bucket).first();
  if (row?.claim_token === token) return { claimed: true, status: "CLAIMED", token, daily, rows_written: Number(inserted?.meta?.changes ?? 0) };
  if (row?.state === "CLOSED") return { claimed: false, status: "ALREADY_CLOSED", daily };
  if (Number(row?.lease_until ?? 0) > now) return { claimed: false, status: "ALREADY_RUNNING", daily };
  var stolen = await db.prepare(`UPDATE report2_public_collector_usage_v1 SET claim_token=?4,lease_until=?5,started_ts=?6,status='RECLAIMED',error_text=NULL
    WHERE actor=?1 AND generation=?2 AND bucket=?3 AND state='STARTED' AND lease_until<=?6`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, bucket, token, now + 12e4, now).run();
  return Number(stolen?.meta?.changes ?? 0) === 1 ? { claimed: true, status: "RECLAIMED", token, daily, rows_written: 1 } : { claimed: false, status: "CLAIM_RACE_LOST", daily };
}
async function __report2PublicCollectorPersist(db, shards) {
  var statements = shards.map((row) => db.prepare(`INSERT INTO report2_market_snapshot_batch_v1
    (bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
    ON CONFLICT(actor,generation,bucket,shard) DO NOTHING`).bind(row.bucket, row.actor, row.generation, row.schema_version, row.shard, JSON.stringify(row.source_timestamps), row.received_ts, row.status, row.payload_hash, row.payload, row.contracts, row.payload_bytes));
  var writes = await db.batch(statements);
  var check = await db.prepare(`SELECT shard,payload_hash,status FROM report2_market_snapshot_batch_v1
    WHERE actor=?1 AND generation=?2 AND bucket=?3 ORDER BY shard`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, shards[0].bucket).all();
  var rows = Array.isArray(check?.results) ? check.results : [];
  var ok = rows.length === shards.length && rows.every((row, index) => Number(row.shard) === index && row.payload_hash === shards[index].payload_hash && row.status === "COMPLETE");
  if (!ok) throw new Error("PUBLIC_COLLECTOR_IMMUTABLE_READBACK_FAILED");
  return { rows_read: rows.length, rows_written: writes.reduce((sum,row)=>sum+Number(row?.meta?.changes??0),0) };
}
async function __report2PublicCollectorFinalize(db, { bucket, claim_token, state, started_ts, completed_ts, external_requests, rows_read, rows_written, payload_bytes, status, error_text, contract_count, shard_count }) {
  var receipt = await db.prepare(`UPDATE report2_public_collector_usage_v1 SET state=?5,completed_ts=?6,external_requests=?7,rows_read=?8,rows_written=?9,payload_bytes=?10,status=?11,error_text=?12
    WHERE actor=?1 AND generation=?2 AND bucket=?3 AND claim_token=?4 AND state='STARTED'`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, bucket, claim_token, state, completed_ts, external_requests, rows_read, rows_written + 2, payload_bytes, status, error_text ?? null).run();
  if (Number(receipt?.meta?.changes ?? 0) !== 1) throw new Error("PUBLIC_COLLECTOR_FINALIZE_FENCE_FAILED");
  var healthReceipt = await db.prepare(`INSERT INTO report2_public_collector_health_v1
    (actor,generation,last_bucket,last_started_ts,last_completed_ts,status,contract_count,shard_count,external_requests,rows_read,rows_written,payload_bytes,error_text,updated_ts)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?5)
    ON CONFLICT(actor,generation) DO UPDATE SET last_bucket=excluded.last_bucket,last_started_ts=excluded.last_started_ts,last_completed_ts=excluded.last_completed_ts,status=excluded.status,contract_count=excluded.contract_count,shard_count=excluded.shard_count,external_requests=excluded.external_requests,rows_read=excluded.rows_read,rows_written=excluded.rows_written,payload_bytes=excluded.payload_bytes,error_text=excluded.error_text,updated_ts=excluded.updated_ts`).bind(__REPORT2_PUBLIC_COLLECTOR_ACTOR, __REPORT2_PUBLIC_COLLECTOR_GENERATION, bucket, started_ts, completed_ts, status, contract_count ?? 0, shard_count ?? 0, external_requests, rows_read, rows_written + 2, payload_bytes, error_text ?? null).run();
  if (Number(healthReceipt?.meta?.changes ?? 0) !== 1) throw new Error("PUBLIC_COLLECTOR_HEALTH_ACK_FAILED");
  return { rows_written: Number(receipt.meta.changes) + Number(healthReceipt.meta.changes) };
}
async function __report2PublicCollectorScheduled(controller, env) {
  var started = Date.now();
  if (!__report2PublicCollectorSwitch(env?.PUBLIC_COLLECTOR_ENABLED)) throw new Error("PUBLIC_COLLECTOR_DISABLED");
  if (__report2PublicCollectorSwitch(env?.ANALYTICS_ENABLED)) throw new Error("PUBLIC_COLLECTOR_ANALYTICS_ROLE_FORBIDDEN");
  if (__report2PublicCollectorSwitch(env?.DELIVERY_ENABLED)) throw new Error("PUBLIC_COLLECTOR_DELIVERY_ROLE_FORBIDDEN");
  if (__report2PublicCollectorSwitch(env?.CALIBRATION_APPLY_ENABLED)) throw new Error("PUBLIC_COLLECTOR_CALIBRATION_ROLE_FORBIDDEN");
  if (String(env?.REPORT2_CURRENT_GENERATION ?? "") !== __REPORT2_PUBLIC_COLLECTOR_GENERATION) throw new Error("PUBLIC_COLLECTOR_GENERATION_MISMATCH");
  if (!env?.DATA_DB) throw new Error("PUBLIC_COLLECTOR_D1_REQUIRED");
  var scheduled = __report2PublicCollectorTimestamp(controller?.scheduledTime) ?? started;
  var bucket = Math.floor(scheduled / __REPORT2_PUBLIC_COLLECTOR_SLOT_MS) * __REPORT2_PUBLIC_COLLECTOR_SLOT_MS;
  var claim = await __report2PublicCollectorClaim(env.DATA_DB, bucket, started);
  if (!claim.claimed) {
    console.log("REPORT2_PUBLIC_COLLECTOR_NOOP", JSON.stringify({ version: __REPORT2_PUBLIC_COLLECTOR_VERSION, bucket, status: claim.status }));
    return;
  }
  var externalRequests = 0, rowsRead = 2, rowsWritten = Number(claim.rows_written ?? 0), payloadBytes = 0, contractCount = 0, shardCount = 0;
  try {
    // Release expired payload space before any new snapshot allocation. Doing
    // this after persist makes retention unreachable when the database is full.
    // Keep the existing 72-hour cutoff, hourly cadence and 96-row bound.
    if (new Date(bucket).getUTCMinutes() === 0) {
      var cleanup = await env.DATA_DB.prepare(`DELETE FROM report2_market_snapshot_batch_v1 WHERE rowid IN
        (SELECT rowid FROM report2_market_snapshot_batch_v1 WHERE bucket<?1 ORDER BY bucket,shard LIMIT 96)`).bind(bucket - __REPORT2_PUBLIC_COLLECTOR_RETENTION_MS).run();
      rowsRead += Number(cleanup?.meta?.rows_read ?? 0);
      rowsWritten += Number(cleanup?.meta?.rows_written ?? cleanup?.meta?.changes ?? 0);
    }
    var prior = await __report2PublicCollectorPriorSnapshot(env.DATA_DB);
    rowsRead += Number(prior.shard_rows_read ?? 0);
    var cachedCatalog = __report2PublicCollectorCachedCatalog(prior);
    var catalogDue = prior.status !== "CLOSED" || prior.catalog_ts === null || started - prior.catalog_ts >= 36e5;
    var endpoints = {
      market: "https://api.hbdm.com/v2/linear-swap-ex/market/detail/batch_merged",
      oi: "https://api.hbdm.com/linear-swap-api/v1/swap_open_interest",
      funding: "https://api.hbdm.com/linear-swap-api/v1/swap_batch_funding_rate",
      contracts: "https://api.hbdm.com/linear-swap-api/v1/swap_contract_info"
    };
    var attemptJson = (url) => { externalRequests += 1; return __report2PublicCollectorJson(url); };
    var common = await Promise.all([attemptJson(endpoints.market), attemptJson(endpoints.oi), attemptJson(endpoints.funding)]);
    var marketResult = common[0], oiResult = common[1], fundingResult = common[2];
    var marketMap = __report2PublicCollectorMap(marketResult.payload);
    if (!marketMap.size) throw new Error("PUBLIC_COLLECTOR_MARKET_UNIVERSE_EMPTY");
    var unknownContract = [...marketMap.keys()].some((contract) => !cachedCatalog.has(contract));
    var catalogResult = null;
    if (catalogDue || unknownContract) {
      catalogResult = await attemptJson(endpoints.contracts);
    }
    var catalogMap = catalogResult ? __report2PublicCollectorCatalog(catalogResult.payload) : cachedCatalog;
    if (!catalogMap.size) throw new Error("PUBLIC_COLLECTOR_CONTRACT_CATALOG_EMPTY");
    var oiMap = __report2PublicCollectorMap(oiResult.payload);
    var fundingMap = __report2PublicCollectorMap(fundingResult.payload);
    var received = Date.now();
    var rows = [];
    for (var [contract, info] of catalogMap) {
      if (!/^[^-\s]{1,64}-USDT$/u.test(contract)) continue;
      var market = marketMap.get(contract) ?? null;
      var oi = oiMap.get(contract) ?? null;
      var funding = fundingMap.get(contract) ?? null;
      var observedTs = __report2PublicCollectorTimestamp(market?.ts) ?? marketResult.source_ts ?? received;
      var price = __report2PublicCollectorFinite(market?.close ?? market?.last_price ?? market?.price);
      rows.push({
        contract,
        catalog_active: true,
        contract_size: __report2PublicCollectorFinite(info?.contract_size),
        price,
        turnover_24h_usdt: __report2PublicCollectorFinite(market?.trade_turnover ?? market?.vol ?? oi?.trade_turnover),
        oi_contracts: __report2PublicCollectorFinite(oi?.volume),
        oi_value_usdt: __report2PublicCollectorFinite(oi?.value),
        funding_rate: __report2PublicCollectorFinite(funding?.funding_rate),
        funding_interval_hours: __report2PublicCollectorIntervalHours(funding, info),
        observed_ts: observedTs,
        market_age_sec: Math.max(0, received - observedTs) / 1e3,
        source_status: !market || price === null ? "PARTIAL" : "CLOSED",
        missing: [!market ? "market" : null, !oi ? "oi" : null, !funding ? "funding" : null, price === null ? "price" : null].filter(Boolean)
      });
    }
    if (!rows.length) throw new Error("PUBLIC_COLLECTOR_NORMALIZED_UNIVERSE_EMPTY");
    var sourceTimestamps = {
      contracts: catalogResult?.source_ts ?? prior.catalog_ts,
      market: marketResult.source_ts,
      oi: oiResult.source_ts,
      funding: fundingResult.source_ts,
      received
    };
    var shards = await __report2PublicCollectorPack({ bucket, received_ts: received, source_timestamps: sourceTimestamps, rows });
    contractCount = rows.length;
    shardCount = shards.length;
    payloadBytes = shards.reduce((sum, row) => sum + row.payload_bytes, 0);
    var amortizedWrites = shards.length * 2 + 3;
    var allowedSubrequests = catalogResult ? 4 : 3;
    if (externalRequests > allowedSubrequests || amortizedWrites > __REPORT2_PUBLIC_COLLECTOR_DAILY_WRITE_CAP / 288 || payloadBytes > 2 * 1024 * 1024) {
      throw new Error("PUBLIC_COLLECTOR_MEASURED_BUDGET_EXCEEDED");
    }
    var persisted = await __report2PublicCollectorPersist(env.DATA_DB, shards);
    rowsRead += persisted.rows_read;
    rowsWritten += persisted.rows_written;
    await __report2PublicCollectorFinalize(env.DATA_DB, { bucket, claim_token: claim.token, state: "CLOSED", started_ts: started, completed_ts: Date.now(), external_requests: externalRequests, rows_read: rowsRead, rows_written: rowsWritten, payload_bytes: payloadBytes, status: "CLOSED", error_text: null, contract_count: contractCount, shard_count: shardCount });
    console.log("REPORT2_PUBLIC_COLLECTOR_CLOSED", JSON.stringify({ version: __REPORT2_PUBLIC_COLLECTOR_VERSION, generation: __REPORT2_PUBLIC_COLLECTOR_GENERATION, bucket, contracts: contractCount, shards: shardCount, external_requests: externalRequests, rows_read: rowsRead, rows_written: rowsWritten + 2, payload_bytes: payloadBytes, wall_ms: Date.now() - started, analytical_decision: false, telegram: false, bykaranteli: false }));
  } catch (error) {
    var message = String(error?.message ?? error).slice(0, 300);
    await __report2PublicCollectorFinalize(env.DATA_DB, { bucket, claim_token: claim.token, state: "ERROR", started_ts: started, completed_ts: Date.now(), external_requests: externalRequests, rows_read: rowsRead, rows_written: rowsWritten, payload_bytes: payloadBytes, status: "ERROR", error_text: message, contract_count: contractCount, shard_count: shardCount });
    console.error("REPORT2_PUBLIC_COLLECTOR_ERROR", JSON.stringify({ version: __REPORT2_PUBLIC_COLLECTOR_VERSION, bucket, error: message, external_requests: externalRequests, analytical_decision: false, telegram: false, bykaranteli: false }));
    throw error;
  }
}

var __REPORT2_PUBLIC_COLLECTOR_HANDLER = {
  ...worker_default,
  async scheduled(controller, env, ctx) {
    return __report2PublicCollectorScheduled(controller, env, ctx);
  }
};
