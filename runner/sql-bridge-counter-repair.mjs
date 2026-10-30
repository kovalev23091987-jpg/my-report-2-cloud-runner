// Pure source repair for the exact installed SQL bridge. No deployment or SQL.
import {createHash} from 'node:crypto';
import {historyVersionMetadata} from './htx-coordinated-rollout.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export const INSTALLED_SQL_BRIDGE_SOURCE_SHA256='70c3b56e3c93612379e5d344ba9e856e0150d0be83e2fb9b66acdfc62dc99df8';
const OLD_META=`function metaUsage(meta) {
  const rr = Number(meta?.rows_read);
  const rw = Number(meta?.rows_written);
  const measured = Number.isFinite(rr) || Number.isFinite(rw);
  return {
    measured,
    rows_read: Number.isFinite(rr) ? rr : 0,
    rows_written: Number.isFinite(rw) ? rw : 0
  };
}`;
const NEW_META=`function metaUsage(meta, success = true) {
  const known = (value) => Number.isSafeInteger(value) && value >= 0;
  const rr = known(meta?.rows_read) ? meta.rows_read : null;
  const rw = known(meta?.rows_written) ? meta.rows_written : null;
  return {
    measured: success !== false && rr !== null && rw !== null,
    rows_read: rr,
    rows_written: rw
  };
}`;
export function repairExactInstalledSQLBridge(source){
 if(typeof source!=='string'||sha(source)!==INSTALLED_SQL_BRIDGE_SOURCE_SHA256)throw Error('EXACT_INSTALLED_SQL_BRIDGE_SOURCE_REQUIRED');
 const edits=[
  [OLD_META,NEW_META],
  ['results.map((r) => metaUsage(r?.meta))','results.map((r) => metaUsage(r?.meta, r?.success !== false))'],
  ['n + x.rows_read','n + (x.rows_read ?? 0)'],
  ['n + x.rows_written','n + (x.rows_written ?? 0)'],
  ['let usage = { measured: false, rows_read: 0, rows_written: 0 };','let usage = { measured: false, rows_read: null, rows_written: null };'],
  ['usage = metaUsage(out?.meta);','usage = metaUsage(out?.meta, out?.success !== false);'],
  ['usage = metaUsage(result?.meta);','usage = metaUsage(result?.meta, result?.success !== false);']
 ];let patched=source;const spans=[];
 for(const [before,after]of edits){const count=source.split(before).length-1,required=before==='usage = metaUsage(result?.meta);'?2:1;if(count!==required)throw Error('EXACT_SQL_BRIDGE_REPAIR_SPAN_REQUIRED');patched=patched.split(before).join(after);spans.push({before_sha256:sha(before),after_sha256:sha(after),occurrences:count});}
 return{source:patched,proof:{schema:'EXACT_INSTALLED_SQL_BRIDGE_COUNTER_REPAIR_V1',status:'OFFLINE_COUNTER_REPAIR_PREPARED',original_module_sha256:sha(source),patched_module_sha256:sha(patched),changed_spans:spans,known_native_counters_preserved_independently:true,missing_or_invalid_counter_is_null:true,SQL_or_params_changed:false,auth_or_binding_or_operation_changed:false,limits_or_response_result_changed:false,source_clocks_changed:false,production_activation_authorized:false,native_reply_accepted:false,SQL:0,sourceHTTP:0,Worker_invocations:0,uploads:0,activations:0}};
}

export function sqlBridgeCounterVersionMetadata({settings,runtime,head,active_version,latest_uploaded_version}={}){
 const names=['DATA_DB','REPORT2_CLOUD_BRIDGE_TOKEN','REPORT2_DENO_BRIDGE_TOKEN'];
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(active_version||'')||active_version!==latest_uploaded_version||!Array.isArray(settings?.bindings)||settings.bindings.length!==3||new Set(settings.bindings.map(b=>b.name)).size!==3||settings.bindings.some(b=>!names.includes(b.name)||b.name!=='DATA_DB'&&b.type!=='secret_text'))throw Error('EXACT_SQL_BRIDGE_EXISTING_BINDINGS_REQUIRED');
 const d1=settings.bindings.filter(b=>b.name==='DATA_DB'),metadata=historyVersionMetadata({settings:{...settings,bindings:d1},runtime,config:{compatibility_date:settings.compatibility_date,d1_databases:[{binding:'DATA_DB',database_id:'057a2847-2cc4-4e52-8534-1be1596d21d5'}]},head,main_module:'bridge-worker.js'});
 metadata.bindings=settings.bindings.map(b=>b.name==='DATA_DB'?{name:b.name,type:'d1',id:b.id??b.database_id}:{name:b.name,type:'inherit'});metadata.annotations['workers/message']='Exact SQL bridge counter repair '+head;return metadata;
}

// Append only. Existing counter repair and version metadata stay byte exact.
export function addExactSQLBridgeCostCorrelation(source){
  const required='06603b69686f7f14b62d1ab551af18555d4f506c4edd7cb7cee3ca58a1e904bf';
  if(typeof source!=='string'||sha(source)!==required)throw Error('EXACT_STRICT_SQL_BRIDGE_SOURCE_REQUIRED');
  const helpers=String.raw`// Optional diagnostic identity; never admission, dedupe or reconciliation.
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
`;
  const edits=[
    ['var bridge_worker_default = {',helpers+'var bridge_worker_default = {'],
    ['    try {\n      const body = await readJson(request);\n      const op = String(body?.op || "");','    let correlationBody = null, correlationOp = null, correlationUsage = null;\n    const correlationStarted = report2CostClock();\n    try {\n      const body = await readJson(request);\n      correlationBody = body;\n      const op = String(body?.op || "");\n      correlationOp = op;'],
    ['      return respond({ ok: true, result, usage });','      correlationUsage = usage;\n      const response = respond({ ok: true, result, usage });\n      await report2BoundedCostReceipt(request, body, op, usage, 200, correlationStarted);\n      return response;'],
    ['      return respond({ ok: false, error: String(error?.message || error) }, 500);','      const response = respond({ ok: false, error: String(error?.message || error) }, 500);\n      await report2BoundedCostReceipt(request, correlationBody, correlationOp, correlationUsage, 500, correlationStarted);\n      return response;']
  ];
  let patched=source;const spans=[];
  for(const [before,after]of edits){if(patched.split(before).length!==2)throw Error('EXACT_COST_CORRELATION_SPAN_REQUIRED');patched=patched.replace(before,after);spans.push({before_sha256:sha(before),after_sha256:sha(after),occurrences:1});}
  return{source:patched,proof:{schema:'EXACT_STRICT_BRIDGE_COST_CORRELATION_TEXT_V1',original_module_sha256:sha(source),patched_module_sha256:sha(patched),changed_spans:spans,header:'x-report2-request-id',request_id_shape:'CANONICAL_LOWERCASE_UUID_V4',max_batch:100,max_log_UTF8_bytes:32768,SQL_or_params_changed:false,response_JSON_or_usage_changed:false,auth_binding_limits_changed:false,extra_SQL:0,extra_fetch:0,response_clone:0,large_body_or_result_copy:0,logging_failure_changes_original_reply:false,identity_is_admission_dedupe_retry_or_reconciliation:false,old_unknown_recovered:false,native_cost_or_log_availability_qualified:false,production_activation_authorized:false}};
}
