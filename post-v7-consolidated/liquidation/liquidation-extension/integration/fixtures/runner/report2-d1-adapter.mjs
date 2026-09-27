const DEFAULT_TIMEOUT_MS = 30_000;

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label}_REQUIRED`);
  return text;
}

function jsonSafe(value) {
  if (typeof value === "bigint") return { __report2_type: "bigint", value: value.toString() };
  if (value instanceof Uint8Array) {
    let binary = "";
    for (const byte of value) binary += String.fromCharCode(byte);
    return { __report2_type: "u8", value: btoa(binary) };
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}

function targetFromSql(sql) {
  const s = String(sql || "").replace(/\s+/g, " ").trim();
  const patterns = [
    /\bDELETE\s+FROM\s+["`\[]?([A-Za-z0-9_]+)/i,
    /\bINSERT\s+INTO\s+["`\[]?([A-Za-z0-9_]+)/i,
    /\bUPDATE\s+["`\[]?([A-Za-z0-9_]+)/i,
    /\bFROM\s+["`\[]?([A-Za-z0-9_]+)/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  return "OTHER";
}

export class RemoteD1PreparedStatement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = requiredText(sql, "D1_SQL");
    this.params = Array.from(params ?? []);
  }

  bind(...values) {
    return new RemoteD1PreparedStatement(this.db, this.sql, values);
  }

  first(columnName) {
    return this.db._request({
      op: "first",
      sql: this.sql,
      params: jsonSafe(this.params),
      column: columnName === undefined ? null : String(columnName),
    });
  }

  all() {
    return this.db._request({ op: "all", sql: this.sql, params: jsonSafe(this.params) });
  }

  run() {
    return this.db._request({ op: "run", sql: this.sql, params: jsonSafe(this.params) });
  }

  raw(options = {}) {
    return this.db._request({ op: "raw", sql: this.sql, params: jsonSafe(this.params), options });
  }

  _wire() {
    return { sql: this.sql, params: jsonSafe(this.params) };
  }
}

export class RemoteD1Database {
  constructor(url, token, options = {}) {
    this.url = requiredText(url, "REPORT2_D1_BRIDGE_URL");
    this.token = requiredText(token, "REPORT2_D1_BRIDGE_TOKEN");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(1_000, Number(options.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    this._usage = { requests: 0, rows_read: 0, rows_written: 0, unknown_ops: 0, targets: {} };
  }

  prepare(sql) {
    return new RemoteD1PreparedStatement(this, sql);
  }

  async batch(statements) {
    if (!Array.isArray(statements)) throw new TypeError("D1_BATCH_ARRAY_REQUIRED");
    const encoded = statements.map((stmt, index) => {
      if (!(stmt instanceof RemoteD1PreparedStatement) || stmt.db !== this) {
        throw new TypeError(`D1_BATCH_INVALID_STATEMENT_${index}`);
      }
      return stmt._wire();
    });
    return this._request({ op: "batch", statements: encoded });
  }

  exec(sql) {
    return this._request({ op: "exec", sql: requiredText(sql, "D1_SQL") });
  }

  usageSnapshot() {
    return JSON.parse(JSON.stringify(this._usage));
  }

  _recordSingle(op, sql, usage) {
    this._usage.requests += 1;
    const target = `${String(op || "unknown")}:${targetFromSql(sql)}`;
    if (!this._usage.targets[target]) {
      this._usage.targets[target] = { requests: 0, rows_read: 0, rows_written: 0, unknown_ops: 0 };
    }
    const bucket = this._usage.targets[target];
    bucket.requests += 1;
    if (usage?.measured === true) {
      const rr = Number(usage.rows_read || 0);
      const rw = Number(usage.rows_written || 0);
      this._usage.rows_read += rr;
      this._usage.rows_written += rw;
      bucket.rows_read += rr;
      bucket.rows_written += rw;
    } else {
      this._usage.unknown_ops += 1;
      bucket.unknown_ops += 1;
    }
  }

  _recordUsage(payload, usage) {
    if (payload?.op === "batch" && Array.isArray(payload.statements)) {
      const parts = Array.isArray(usage?.statements) ? usage.statements : [];
      payload.statements.forEach((stmt, i) => this._recordSingle("batch", stmt?.sql, parts[i]));
      return;
    }
    this._recordSingle(payload?.op, payload?.sql, usage);
  }

  async _request(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          "user-agent": "My-Report-2-GitHub-D1-Adapter/4.3",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`D1_BRIDGE_INVALID_JSON_HTTP_${response.status}`);
      }
      if (!response.ok || data?.ok !== true) {
        const code = String(data?.error || `HTTP_${response.status}`);
        throw new Error(`D1_BRIDGE_FAILURE:${code}`);
      }
      this._recordUsage(payload, data?.usage);
      return data.result;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("D1_BRIDGE_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default RemoteD1Database;
