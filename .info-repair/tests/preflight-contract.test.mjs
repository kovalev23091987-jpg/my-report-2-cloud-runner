import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {verifyLegacySchema,normSql} from '../tools/d1-preflight.mjs';
const sql=fs.readFileSync(new URL('../fixtures/legacy-telegram-journal.sql',import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');db.exec(sql);const objects=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE tbl_name='telegram_output_dispatch_journal_v2'").all();
test('real DDL accepted and whitespace/idempotent CREATE spelling has no effect',()=>{
 assert.doesNotThrow(()=>verifyLegacySchema(objects,sql.split(';')[0]));assert.equal(normSql('CREATE TABLE IF NOT EXISTS x (a TEXT);'),normSql('CREATE TABLE x  (a TEXT)'));
});
test('missing CHECK, unknown trigger, missing index and malformed readback block promotion',()=>{
 for(const mutated of [null,[],objects.map(r=>r.type==='table'?{...r,sql:r.sql.replace("'WATCH70_CANDIDATE'","'FINAL_CHAIN_CANDIDATE'")}:r),objects.filter(r=>r.name!=='idx_telegram_output_v2_cooldown'),[...objects,{type:'trigger',name:'unexpected'}]])assert.throws(()=>verifyLegacySchema(mutated,sql.split(';')[0]));
});
test('final-chain decision contract and fixed weights are outside informational runtime',()=>{
 const s=fs.readFileSync(new URL('../candidate/runner/telegram-info-runtime.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/FROM final_decision_integration_shadow|UPDATE final_decision|DROP TABLE|ALTER TABLE|wrangler deploy/);
 assert.match(s,/ON CONFLICT\(dispatch_key\) DO NOTHING/);assert.doesNotMatch(s,/INSERT OR IGNORE|INSERT OR REPLACE/);
 const output=fs.readFileSync(new URL('../candidate/runner/telegram-output.mjs',import.meta.url),'utf8');
 for(const text of ['["DERIVATIVES_CROSS_VENUE", 35]','["RELATIVE_STRENGTH_SPOT", 30]','["SMART_MONEY_ONCHAIN", 20]','["SUPPORTING_RISK", 15]'])assert.ok(output.includes(text));
});
