import fs from 'node:fs/promises';
import crypto from 'node:crypto';

function req(name){ const v=String(process.env[name]||'').trim(); if(!v) throw new Error(`${name}_REQUIRED`); return v; }
async function sha256(path){ const b=await fs.readFile(path); return crypto.createHash('sha256').update(b).digest('hex'); }

const expected = new Map([
  ['.promotion/migrations/20260917_final_decision_telegram_context_shadow.sql','b102cd91e100c69cc1507ad010a9504440daa3f1e15993960099f2dadb969ba4'],
  ['.promotion/migrations/20260917_runner_d1_usage_run_shadow.sql','5b525df9481d808004e6b1e5c07a89547869293c254d191fd6817d94478f26d2'],
]);
const expectedCounts = new Map([
  ['.promotion/migrations/20260917_final_decision_telegram_context_shadow.sql',4],
  ['.promotion/migrations/20260917_runner_d1_usage_run_shadow.sql',2],
]);

function splitMigrationSql(sql, path) {
  const noComments = String(sql)
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .trim();
  if (!noComments) throw new Error(`MIGRATION_EMPTY:${path}`);
  const parts = noComments
    .split(/\n(?=CREATE\s+(?:TABLE|INDEX|TRIGGER)\b)/i)
    .map(s => s.trim())
    .filter(Boolean);
  const want = expectedCounts.get(path);
  if (parts.length !== want) throw new Error(`MIGRATION_STATEMENT_COUNT:${path}:want=${want}:got=${parts.length}`);
  for (let i=0;i<parts.length;i++) {
    const stmt = parts[i];
    if (!/^CREATE\s+(TABLE|INDEX|TRIGGER)\b/i.test(stmt)) throw new Error(`MIGRATION_UNEXPECTED_DDL:${path}:${i}`);
    if (!stmt.endsWith(';')) throw new Error(`MIGRATION_MISSING_TERMINATOR:${path}:${i}`);
    if (stmt.includes('\n--')) throw new Error(`MIGRATION_COMMENT_LEAK:${path}:${i}`);
  }
  return parts;
}

for (const [path,want] of expected) {
  const got=await sha256(path); if(got!==want) throw new Error(`MIGRATION_SHA_MISMATCH:${path}:${got}`);
  const sql=await fs.readFile(path,'utf8');
  splitMigrationSql(sql,path);
}

if (process.env.REPORT2_MIGRATION_SPLIT_SELF_TEST === '1') {
  console.log('MIGRATION_SPLIT_SELF_TEST=PASS');
  process.exit(0);
}

const { RemoteD1Database } = await import('../runner/report2-d1-adapter.mjs');
const db = new RemoteD1Database(req('REPORT2_D1_BRIDGE_URL'), req('REPORT2_D1_BRIDGE_TOKEN'), {timeoutMs:45000});
const before = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('final_decision_telegram_context_shadow','report2_runner_budget_ledger_shadow') ORDER BY name`).all();
for (const path of expected.keys()) {
  const sql=await fs.readFile(path,'utf8');
  const statements=splitMigrationSql(sql,path);
  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}
const after = await db.prepare(`SELECT name,type FROM sqlite_master WHERE name IN ('final_decision_telegram_context_shadow','report2_runner_budget_ledger_shadow','trg_final_decision_telegram_context_insert_guard','trg_final_decision_telegram_context_no_update','idx_final_decision_telegram_context_shadow_recent','idx_report2_runner_budget_day') ORDER BY name`).all();
const rows=after?.results||[]; const names=new Set(rows.map(x=>String(x.name)));
for (const n of ['final_decision_telegram_context_shadow','report2_runner_budget_ledger_shadow','trg_final_decision_telegram_context_insert_guard','trg_final_decision_telegram_context_no_update','idx_final_decision_telegram_context_shadow_recent','idx_report2_runner_budget_day']) {
  if(!names.has(n)) throw new Error(`MIGRATION_READBACK_MISSING:${n}`);
}
const sidecar=await db.prepare(`PRAGMA table_info(final_decision_telegram_context_shadow)`).all();
const budget=await db.prepare(`PRAGMA table_info(report2_runner_budget_ledger_shadow)`).all();
if((sidecar?.results||[]).length<10) throw new Error('SIDECAR_SCHEMA_TOO_SMALL');
if((budget?.results||[]).length<10) throw new Error('BUDGET_LEDGER_SCHEMA_TOO_SMALL');
console.log(JSON.stringify({ok:true,status:'MIGRATION_PASS',before:(before?.results||[]).map(x=>x.name),after:rows,sidecar_columns:sidecar.results.length,budget_columns:budget.results.length,usage:db.usageSnapshot()}));
console.log('MIGRATION_RESULT=PASS');
