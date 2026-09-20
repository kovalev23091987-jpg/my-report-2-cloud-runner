import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const normSql=s=>String(s||'').replace(/\bIF NOT EXISTS\b/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'').trim();
export function verifyLegacySchema(objects,expectedSql) {
  if(!Array.isArray(objects))throw new Error('SCHEMA_UNKNOWN');
  const table=objects.find(r=>r.type==='table'&&r.name==='telegram_output_dispatch_journal_v2');
  if(normSql(table?.sql)!==normSql(expectedSql))throw new Error('LEGACY_SCHEMA_DIFFERENT_FAIL_CLOSED');
  if(objects.some(r=>r.type==='trigger'))throw new Error('LEGACY_TRIGGER_REQUIRES_REVIEW');
  if(!objects.some(r=>r.type==='index'&&r.name==='idx_telegram_output_v2_cooldown'))throw new Error('LEGACY_COOLDOWN_INDEX_MISSING');
}
async function main() {
  const mode=process.argv[2];if(!['--check','--apply-index'].includes(mode))throw new Error('MODE_REQUIRED');
  const {RemoteD1Database}=await import('../../runner/report2-d1-adapter.mjs');
  const budget=await import('../../runner/d1-preaction-budget-guard.mjs');
  const {buildR88DailyAdmissionView}=await import(pathToFileURL(path.join(ROOT,'runtime/src/v3-adaptive-budget.mjs')));
  const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});
  const expected=fs.readFileSync(path.join(ROOT,'fixtures/legacy-telegram-journal.sql'),'utf8').split(';')[0];
  const indexSql=fs.readFileSync(path.join(ROOT,'fixtures/info-lifecycle-index.sql'),'utf8').split('\n').filter(l=>!l.trimStart().startsWith('--')).join('\n').trim();
  if(!/^CREATE INDEX IF NOT EXISTS idx_report2_info_lifecycle_fresh\s+ON v3_user_lifecycle_shadow\(shadow_only,status,updated_ts DESC\);$/.test(indexSql))throw new Error('NON_ADDITIVE_INDEX_INPUT');
  const query=async sql=>{const r=await db.prepare(sql).all();if(r?.success===false||!Array.isArray(r?.results))throw new Error('READBACK_UNKNOWN');return r.results;};
  const readLegacy=()=>query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name='telegram_output_dispatch_journal_v2' ORDER BY type,name");
  const legacy=await readLegacy();verifyLegacySchema(legacy,expected);
  const index=await query("SELECT name,sql FROM sqlite_master WHERE name='idx_report2_info_lifecycle_fresh'");
  if(index.length && normSql(index[0].sql)!==normSql(indexSql))throw new Error('INFO_INDEX_DIFFERENT_FAIL_CLOSED');
  let applied=false,reservation=null;
  if(mode==='--apply-index'&&!index.length) {
    const cardinality=await query('SELECT contract FROM v3_user_lifecycle_shadow LIMIT 2049');
    if(cardinality.length>2048)throw new Error('INDEX_BUILD_CAPACITY_REQUIRES_REVIEW');
    const now=Date.now();const raw=await budget.loadDailyUsageAggregate(db,now);
    const daily=buildR88DailyAdmissionView(raw,{rows_read:16000,rows_written:320});
    // Cardinality is capped at 2048 above. The additional 256 writes cover the
    // reservation ledger and conservative DDL metadata accounting without an
    // unbounded or guessed allowance.
    const cap={rows_read:8192,rows_written:2304};
    const admit=budget.evaluateDailyReservationBudget({daily,nextReservation:cap});
    if(!admit.allowed)throw new Error('INDEX_DAILY_BUDGET_BLOCKED:'+admit.status);
    const id=`INFO_INDEX:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
    reservation=await budget.reserveRunBudget(db,{reservationId:id,now,reservation:cap});
    // If the response is lost, keep the reservation charged; never blindly repeat DDL.
    await db.prepare(indexSql).run();applied=true;
    const readback=await query("SELECT name,sql FROM sqlite_master WHERE name='idx_report2_info_lifecycle_fresh'");
    if(readback.length!==1||normSql(readback[0].sql)!==normSql(indexSql))throw new Error('INDEX_READBACK_FAILED');
    const beforeFinal=db.usageSnapshot();
    if(!budget.evaluateWithinRunReservation({reservation:cap,currentUsage:beforeFinal,extraRowsRead:64,extraRowsWritten:4}).allowed)throw new Error('INDEX_USAGE_EXCEEDED');
    await budget.finalizeRunUsage(db,{reservationId:id,sourceRunId:id,usage:beforeFinal});
  }
  const after=await readLegacy();verifyLegacySchema(after,expected);
  if(JSON.stringify(after)!==JSON.stringify(legacy))throw new Error('LEGACY_SCHEMA_CHANGED');
  const usage=db.usageSnapshot();if(usage.unknown_ops!==0 || (mode==='--check'&&usage.rows_written!==0))throw new Error('USAGE_NOT_CLOSED');
  const proof={schema:'info-preflight-v1',status:'PASS',head:process.env.GITHUB_SHA,main:'f12d7c12441c3ddd710b2fd333d90ab402fa6785',legacy_schema:legacy,legacy_unchanged:true,index_present:index.length===1||applied,index_created:applied,reservation,usage,telegram_sent:false,worker_changed:false};
  fs.mkdirSync(path.join(ROOT,'proof'),{recursive:true});fs.writeFileSync(path.join(ROOT,'proof',mode==='--check'?'schema-readonly.json':'schema-index-proof.json'),JSON.stringify(proof,null,2)+'\n');
  console.log('INFO_D1_PREFLIGHT=PASS');console.log('INFO_INDEX_STATE='+(applied?'ADDED':index.length?'ALREADY_PRESENT':'PENDING'));console.log('TELEGRAM_SENT=NO');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('INFO_PREFLIGHT_FAIL='+String(e.message));process.exitCode=1;});
