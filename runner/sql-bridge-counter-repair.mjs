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
