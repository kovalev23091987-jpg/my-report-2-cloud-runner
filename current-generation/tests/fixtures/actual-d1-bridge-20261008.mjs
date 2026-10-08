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
function metaUsage(meta) {
  const rr = Number(meta?.rows_read);
  const rw = Number(meta?.rows_written);
  const measured = Number.isFinite(rr) || Number.isFinite(rw);
  return {
    measured,
    rows_read: Number.isFinite(rr) ? rr : 0,
    rows_written: Number.isFinite(rw) ? rw : 0
  };
}
__name(metaUsage, "metaUsage");
function batchUsage(results) {
  const statements = Array.isArray(results) ? results.map((r) => metaUsage(r?.meta)) : [];
  return {
    measured: statements.every((x) => x.measured),
    rows_read: statements.reduce((n, x) => n + x.rows_read, 0),
    rows_written: statements.reduce((n, x) => n + x.rows_written, 0),
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
    try {
      const body = await readJson(request);
      const op = String(body?.op || "");
      let result;
      let usage = { measured: false, rows_read: 0, rows_written: 0 };
      if (op === "first") {
        const out = await statement(env, body.sql, body.params).all();
        const row = Array.isArray(out?.results) ? out.results[0] ?? null : null;
        result = body.column === null || body.column === void 0 ? row : row == null ? null : row[String(body.column)] ?? null;
        usage = metaUsage(out?.meta);
      } else if (op === "all") {
        result = await statement(env, body.sql, body.params).all();
        usage = metaUsage(result?.meta);
      } else if (op === "run") {
        result = await statement(env, body.sql, body.params).run();
        usage = metaUsage(result?.meta);
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
      return respond({ ok: true, result, usage });
    } catch (error) {
      return respond({ ok: false, error: String(error?.message || error) }, 500);
    }
  }
};
export {
  bridge_worker_default as default
};
//# sourceMappingURL=bridge-worker.js.map
