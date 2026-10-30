import {rewriteRetainedSelect,createHistoryRestorer} from './retained-history.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {createPrivateCanonicalRestorer,privateCanonicalArchivePool} from './private-canonical-history.mjs';
import {NativeQueryCostJournal} from './native-query-cost-journal.mjs';
const DEFAULT_TIMEOUT_MS = 30_000;
const validClientRequestId=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);

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
    if(options.beforeRequest!==undefined&&typeof options.beforeRequest!=='function')throw Error('D1_BEFORE_REQUEST_CALLBACK_REQUIRED');
    this.beforeRequest = options.beforeRequest;
    this.timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(1_000, Number(options.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    this._usage = { requests: 0, rows_read: 0, rows_written: 0, unknown_ops: 0, targets: {} };
    this._unmeasuredReceipts = [];
    this._nativeCostJournal=options.nativeQueryReceipts===true?new NativeQueryCostJournal({binding:'D1_BRIDGE',clock:options.nativeQueryClock??Date.now}):null;
  }

  enableRetainedHistory(options = {}) {
    this._retainedHistory = createHistoryRestorer(options);
  }

  enablePrivateCanonicalHistory(options = {}) {
    if(this._privateRetainedHistory)throw Error('PRIVATE_HISTORY_READER_ALREADY_CONFIGURED');
    const pool=privateCanonicalArchivePool(options.archive_db,options.archive_dbs);
    if([...pool.values()].some(db=>typeof db.usageSnapshot!=='function'))throw Error('PRIVATE_HISTORY_NATIVE_COUNTERS_REQUIRED');
    this._privateRetainedHistory=createPrivateCanonicalRestorer(options);
    this._privateUsageTargets=[...pool].map(([slot,db])=>({slot,db,start:db.usageSnapshot()}));
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
    const out=JSON.parse(JSON.stringify({...this._usage,...(this._unmeasuredReceipts.length?{unmeasured_receipts:this._unmeasuredReceipts}: {})}));
    for(const {slot,db,start} of this._privateUsageTargets||[]){
      const usage=db.usageSnapshot(),delta={};
      for(const key of ['requests','rows_read','rows_written','unknown_ops']){
        const n=usage[key]-start[key];if(!Number.isSafeInteger(n)||n<0)throw Error('PRIVATE_HISTORY_NATIVE_COUNTERS_INVALID');
        delta[key]=n;out[key]+=n;
      }
      out.targets['private-canonical:report2_canonical_cold_archive_v1'+(slot==='LEGACY'?'':':'+slot)]=delta;
    }
    return out;
  }

  nativeQueryCostReceipts(){return this._nativeCostJournal?.snapshot()??null;}

  _recordSingle(op, sql, usage, diagnostic = {}) {
    this._usage.requests += 1;
    const target = `${String(op || "unknown")}:${targetFromSql(sql)}`;
    if (!this._usage.targets[target]) {
      this._usage.targets[target] = { requests: 0, rows_read: 0, rows_written: 0, unknown_ops: 0 };
    }
    const bucket = this._usage.targets[target];
    bucket.requests += 1;
    const readKnown=Number.isSafeInteger(usage?.rows_read)&&usage.rows_read>=0,writeKnown=Number.isSafeInteger(usage?.rows_written)&&usage.rows_written>=0;
    if(readKnown){this._usage.rows_read+=usage.rows_read;bucket.rows_read+=usage.rows_read;}
    if(writeKnown){this._usage.rows_written+=usage.rows_written;bucket.rows_written+=usage.rows_written;}
    this._nativeCostJournal?.record({operation:op,sql,wire_sql:diagnostic.wire_sql??sql,usage,http_status:diagnostic.http_status,force_unknown:diagnostic.force_unknown===true,transport:diagnostic.transport});
    if (usage?.measured !== true || !readKnown || !writeKnown || diagnostic.force_unknown===true) {
      this._usage.unknown_ops += 1;
      bucket.unknown_ops += 1;
      if(this._unmeasuredReceipts.length<10){
        const normalized=String(sql||'').replace(/\s+/g,' ').trim();
        const client_request_id=this._nativeCostJournal?diagnostic.transport?.client_request_id:undefined;
        const receipt={...(validClientRequestId(client_request_id)?{client_request_id}:{}),operation:String(op),target:targetFromSql(sql),sql_kind:normalized.match(/^[A-Za-z]+(?:\s+(?:TABLE|INDEX|UNIQUE INDEX))?/i)?.[0]?.toUpperCase()||'UNKNOWN',sql_sha256:createHash('sha256').update(normalized).digest('hex'),http_status:Number.isInteger(diagnostic.http_status)?diagnostic.http_status:null,failure_class:diagnostic.failure_class||'NATIVE_COUNTERS_NOT_CLOSED',observed_ts:Date.now(),params_or_SQL_text_exported:false};
        this._unmeasuredReceipts.push(receipt);
      }
    }
  }

  _recordUsage(payload, usage, diagnostic = {}) {
    if (payload?.op === "batch" && Array.isArray(payload.statements)) {
      const parts = Array.isArray(usage?.statements) ? usage.statements : [];
      payload.statements.forEach((stmt, i) => this._recordSingle("batch", stmt?.sql, parts[i],{...diagnostic,wire_sql:diagnostic.wire_payload?.statements?.[i]?.sql??stmt?.sql}));
      return;
    }
    this._recordSingle(payload?.op, payload?.sql, usage,{...diagnostic,wire_sql:diagnostic.wire_payload?.sql??payload?.sql});
  }

  async _request(payload) {
    const originalPayload = payload;
    if (this._retainedHistory) {
      if (payload.op === 'batch') payload = {...payload, statements:payload.statements.map(s => ({...s,sql:rewriteRetainedSelect(s.sql)}))};
      else if (payload.sql) payload = {...payload,sql:rewriteRetainedSelect(payload.sql)};
    }
    const wireBody=JSON.stringify(payload);
    // A local transport-budget refusal occurs before any SQL is sent. It is
    // not an unmeasured native operation; real attempted replies retain the
    // existing fail-closed accounting below.
    if(this.beforeRequest){
      const grant=await this.beforeRequest({operation:payload.op,statement_count:payload.op==='batch'?payload.statements.length:1,wire_bytes:Buffer.byteLength(wireBody)});
      if(grant?.allowed!==true)throw Error('D1_LOCAL_HTTP_ADMISSION_DENIED');
    }
    const client_request_id=this._nativeCostJournal?randomUUID():null;
    if(this._nativeCostJournal&&!validClientRequestId(client_request_id))throw Error('D1_CLIENT_REQUEST_ID_INVALID');
    const transportStart=this._nativeCostJournal?.beginTransport(client_request_id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let nativeUsageRecorded = false;
    let httpStatus = null;
    let transportEnd;
    const transport=()=>transportEnd??=this._nativeCostJournal?.endTransport(transportStart);
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          "user-agent": "My-Report-2-GitHub-D1-Adapter/4.3",
          ...(transportStart?.client_request_id?{"x-report2-request-id":transportStart.client_request_id}:{}),
        },
        body: wireBody,
        signal: controller.signal,
      });
      httpStatus=response.status;
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`D1_BRIDGE_INVALID_JSON_HTTP_${response.status}`);
      }
      if (!response.ok || data?.ok !== true) {
        this._recordUsage(originalPayload,data?.usage,{wire_payload:payload,transport:transport(),http_status:httpStatus,force_unknown:true,failure_class:'BRIDGE_RESPONSE_NOT_CLOSED'});
        nativeUsageRecorded=true;
        const code = String(data?.error || `HTTP_${response.status}`);
        throw new Error(`D1_BRIDGE_FAILURE:${code}`);
      }
      this._recordUsage(originalPayload, data?.usage,{wire_payload:payload,transport:transport(),http_status:httpStatus});
      nativeUsageRecorded = true;
      const restored=this._retainedHistory ? await this._retainedHistory.restore(data.result) : data.result;
      if(this._privateRetainedHistory&&originalPayload.op==='first'&&originalPayload.column&&typeof restored==='string'){
        const row=await this._privateRetainedHistory.restore({[originalPayload.column]:restored});return row[originalPayload.column];
      }
      return this._privateRetainedHistory ? await this._privateRetainedHistory.restore(restored) : restored;
    } catch (error) {
      // A failed bridge response does not prove that the SQL was never run.
      // Retain every attempted statement as unknown, without inventing row
      // counts or resetting reservations. Downstream budget guards stay closed.
      // A failure in retained-history restoration after a measured DB reply
      // must not charge the original SQL a second time.
      if (!nativeUsageRecorded) this._recordUsage(originalPayload, null,{wire_payload:payload,transport:transport(),http_status:httpStatus,failure_class:error?.name==='AbortError'?'BRIDGE_TIMEOUT':error?.name==='TypeError'?'BRIDGE_TRANSPORT_FAILURE':httpStatus!==null?'BRIDGE_RESPONSE_NOT_CLOSED':'BRIDGE_FAILURE'});
      if (error?.name === "AbortError") throw new Error("D1_BRIDGE_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export default RemoteD1Database;
