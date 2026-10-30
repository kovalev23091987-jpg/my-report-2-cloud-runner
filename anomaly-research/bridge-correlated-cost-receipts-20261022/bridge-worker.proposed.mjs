var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// bridge-worker.js
var JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=UTF-8",
  "cache-control": "no-store"
});
var MAX_BODY_BYTES = 15e5;
var MAX_BATCH = 100;
function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
__name(respond, "respond");
function decodeValue(value) {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value && typeof value === "object") {
    if (value.__report2_type === "bigint") return BigInt(value.value);
    if (value.__report2_type === "u8") {
      const binary = atob(String(value.value || ""));
      return Uint8Array.from(binary, (c) => c.charCodeAt(0));
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeValue(v);
    return out;
  }
  return value;
}
__name(decodeValue, "decodeValue");
function authOk(request, env) {
  const secret = String(env?.REPORT2_CLOUD_BRIDGE_TOKEN || "");
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
__name(authOk, "authOk");
function statement(env, sql, params) {
  if (!env?.DATA_DB) throw new Error("DATA_DB_BINDING_MISSING");
  const text = String(sql || "").trim();
  if (!text) throw new Error("SQL_REQUIRED");
  const values = Array.isArray(params) ? decodeValue(params) : [];
  return env.DATA_DB.prepare(text).bind(...values);
}
__name(statement, "statement");
function metaUsage(meta, success = true) {
  const known = (value) => Number.isSafeInteger(value) && value >= 0;
  const rr = known(meta?.rows_read) ? meta.rows_read : null;
  const rw = known(meta?.rows_written) ? meta.rows_written : null;
  return {
    measured: success !== false && rr !== null && rw !== null,
    rows_read: rr,
    rows_written: rw
  };
}
__name(metaUsage, "metaUsage");
function batchUsage(results) {
  const statements = Array.isArray(results) ? results.map((r) => metaUsage(r?.meta, r?.success !== false)) : [];
  return {
    measured: statements.every((x) => x.measured),
    rows_read: statements.reduce((n, x) => n + (x.rows_read ?? 0), 0),
    rows_written: statements.reduce((n, x) => n + (x.rows_written ?? 0), 0),
    statements
  };
}
__name(batchUsage, "batchUsage");
async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error("INVALID_JSON");
  }
}
__name(readJson, "readJson");
// Optional diagnostic identity; never admission, dedupe or reconciliation.
function report2CostClock() {
  try { const t = Date.now(); return Number.isSafeInteger(t) && t >= 0 && t <= 8640000000000000 ? t : null; } catch { return null; }
}
async function report2BoundedCostReceipt(request, body, operation, usage, status, started) {
  try {
    const request_id = request.headers.get("x-report2-request-id");
    if (typeof request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request_id)) return;
    const op = ["first", "all", "run", "raw", "exec", "batch"].includes(operation) ? operation : "UNKNOWN";
    const completed = report2CostClock(), clock_closed = started !== null && completed !== null && started <= completed;
    const base = {schema:"REPORT2_BRIDGE_CORRELATED_COST_V1",implementation_tag:"REPORT2_STRICT06603_CORRELATION_V1",native_record_not_automatic_reconciliation:true,request_id,operation:op,binding:"DATA_DB",server_started_ts:started,server_response_ready_ts:completed,server_clock_closed:clock_closed,clock_basis:"SERVER_AFTER_AUTH_TO_RESPONSE_READY_NOT_BILLING_TIME",http_status_prepared:status,response_delivery:"NOT_OBSERVED",max_statements:100,max_log_UTF8_bytes:32768,diagnostic_identity_only:true,native_cost_reconciliation_qualified:false,native_day_grant_qualified:false};
    const omitted = reason => ({...base,statement_count:null,statements:null,statement_coverage:"OMITTED",whole_record_omission:true,omission_reason:reason,costs_and_SQL_hashes_omitted:true,SQL_params_results_token_error_exported:false});
    let line;
    try {
      const entries = op === "batch" ? body?.statements : op === "UNKNOWN" ? null : [{sql:body?.sql}];
      if (!Array.isArray(entries) || entries.length > 100) line = JSON.stringify(omitted("STATEMENT_BOUND_OR_INPUT_NOT_CLOSED"));
      else if (entries.some(x => typeof x?.sql !== "string")) line = JSON.stringify(omitted("RECEIVED_SQL_TYPE_NOT_CLOSED"));
      else {
        const nativeParts = op === "batch" ? Array.isArray(usage?.statements) ? usage.statements : [] : [usage];
        const coverage = op === "batch" ? nativeParts.length === entries.length : true;
        const known = v => Number.isSafeInteger(v) && v >= 0;
        const statements = [];
        for (let i = 0; i < entries.length; i++) {
          const bytes = new TextEncoder().encode(entries[i].sql);
          const hashed = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
          const wire_sql_sha256 = Array.from(hashed, x => x.toString(16).padStart(2,"0")).join("");
          if (!/^[a-f0-9]{64}$/.test(wire_sql_sha256)) throw Error("HASH_NOT_CLOSED");
          const u = nativeParts[i], rr = known(u?.rows_read) ? u.rows_read : null, rw = known(u?.rows_written) ? u.rows_written : null;
          const measured = coverage && u?.measured === true && rr !== null && rw !== null;
          statements.push({statement_index:i,wire_sql_sha256,rows_read:rr,rows_written:rw,measured,unknown:status !== 200 || !measured});
        }
        const record = {...base,statement_count:entries.length,statements,statement_coverage:coverage?"ORDERED_REQUEST_MEMBERS":"INCOMPLETE_OR_CONFLICTING_NATIVE_MEMBERS",whole_record_omission:false,omission_reason:null,hash_basis:"EXACT_RECEIVED_SQL_UTF8_BEFORE_SERVER_TRIM",SQL_params_results_token_error_exported:false};
        line = JSON.stringify(record);
        if (new TextEncoder().encode(line).byteLength > 32768) line = JSON.stringify(omitted("WHOLE_LOG_UTF8_BOUND"));
      }
    } catch { line = JSON.stringify(omitted("HASH_OR_RECEIPT_BUILD_NOT_CLOSED")); }
    // A console/hash/encoding failure is diagnostic only. Never try logging twice.
    try { if (new TextEncoder().encode(line).byteLength <= 32768) console.log(line); } catch {}
  } catch {}
}
var bridge_worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return respond({
        ok: true,
        service: "my-report-2-d1-bridge",
        version: "v4.4-github-runner-d1-write-shard",
        d1_bound: Boolean(env?.DATA_DB),
        timestamp_utc: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (url.pathname !== "/d1") return respond({ ok: false, error: "NOT_FOUND" }, 404);
    if (request.method !== "POST") return respond({ ok: false, error: "POST_REQUIRED" }, 405);
    if (!authOk(request, env)) return respond({ ok: false, error: "UNAUTHORIZED" }, 401);
    let correlationBody = null, correlationOp = null, correlationUsage = null;
    const correlationStarted = report2CostClock();
    try {
      const body = await readJson(request);
      correlationBody = body;
      const op = String(body?.op || "");
      correlationOp = op;
      let result;
      let usage = { measured: false, rows_read: null, rows_written: null };
      if (op === "first") {
        const out = await statement(env, body.sql, body.params).all();
        const row = Array.isArray(out?.results) ? out.results[0] ?? null : null;
        result = body.column === null || body.column === void 0 ? row : row == null ? null : row[String(body.column)] ?? null;
        usage = metaUsage(out?.meta, out?.success !== false);
      } else if (op === "all") {
        result = await statement(env, body.sql, body.params).all();
        usage = metaUsage(result?.meta, result?.success !== false);
      } else if (op === "run") {
        result = await statement(env, body.sql, body.params).run();
        usage = metaUsage(result?.meta, result?.success !== false);
      } else if (op === "raw") {
        result = await statement(env, body.sql, body.params).raw(body.options || {});
      } else if (op === "exec") {
        const sql = String(body.sql || "").trim();
        if (!sql) throw new Error("SQL_REQUIRED");
        result = await env.DATA_DB.exec(sql);
      } else if (op === "batch") {
        if (!Array.isArray(body.statements) || body.statements.length > MAX_BATCH) throw new Error("INVALID_BATCH");
        result = await env.DATA_DB.batch(body.statements.map((item) => statement(env, item?.sql, item?.params)));
        usage = batchUsage(result);
      } else return respond({ ok: false, error: "UNSUPPORTED_OPERATION" }, 400);
      correlationUsage = usage;
      const response = respond({ ok: true, result, usage });
      await report2BoundedCostReceipt(request, body, op, usage, 200, correlationStarted);
      return response;
    } catch (error) {
      const response = respond({ ok: false, error: String(error?.message || error) }, 500);
      await report2BoundedCostReceipt(request, correlationBody, correlationOp, correlationUsage, 500, correlationStarted);
      return response;
    }
  }
};
export {
  bridge_worker_default as default
};
//# sourceMappingURL=bridge-worker.js.map
