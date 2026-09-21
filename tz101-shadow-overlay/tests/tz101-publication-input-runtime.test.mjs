import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {immutableReceipt} from '../src/upstream-proof-utils.mjs';
import {buildHtxFeeScheduleReceipt} from '../src/tz101-fee-source.mjs';
import {
  TZ101_PUBLICATION_INPUT_BUDGET,
  buildTz101PublicationInputBundle,
  loadTz101PublicationInputs,
  persistTz101PublicationInputs,
} from '../src/tz101-publication-input-runtime.mjs';

const NOW=1_789_650_000_000;
const decision={decision_id:'FDI:TEST:1',snapshot_id:'S392:TEST:1',contract_code:'TEST-USDT',direction:'LONG',observation_ts:NOW,campaign_receipt_id:'CMR:1'};
const entry=immutableReceipt({schema_version:'tz101-entry-area-rule-v1',status:'CLOSED',calibration_status:'VALIDATED_OUT_OF_SAMPLE',automatic_rule_promotion:false,
  calibration_receipt_id:'CAL:OOS:1',calibration_dataset_digest:'0123456789abcdef',contract_code:decision.contract_code,snapshot_id:decision.snapshot_id,
  decision_id:decision.decision_id,direction:decision.direction,campaign_receipt_id:decision.campaign_receipt_id,min_price:100,max_price:101,
  source_ts:NOW-5_000,valid_until_ts:NOW+5*60_000},'EAR:1',NOW-4_000);
const fee=buildHtxFeeScheduleReceipt({contract_code:decision.contract_code,observed_ts:NOW,source_record:{venue:'HTX',market_type:'USDT_PERP',contract_code:decision.contract_code,
  fee_role:'TAKER',source_kind:'OFFICIAL_CONSERVATIVE_RATE',source_receipt_id:'HTX:OFFICIAL:1',source_ts:NOW-10_000,valid_until_ts:NOW+60*60_000,
  entry_rate:.0006,exit_rate:.0006,source_authority:'HTX_OFFICIAL',source_url:'https://www.htx.com/support/fees',conservative_for_unknown_account:true}}).fee_schedule;
const hold=immutableReceipt({schema_version:'tz101-holding-plan-v1',status:'CLOSED',contract_code:decision.contract_code,decision_id:decision.decision_id,direction:decision.direction,
  source_kind:'PRECOMMITTED_CAMPAIGN_POLICY',source_receipt_id:'HOLD-POLICY:1',source_ts:NOW-2_000,entry_ts:NOW,planned_exit_no_later_than_ts:NOW+60*60_000,
  prospective_only:true,automatic_trade:false},'HOLD:1',NOW-1_000);

class D1 {
  constructor(sqlite){this.sqlite=sqlite;this.reads=0;this.writes=0;}
  prepare(sql){const db=this;return {bind(...args){return {
    async all(){const results=db.sqlite.prepare(sql).all(...args);db.reads+=results.length;return {success:true,results};},
    async run(){const result=db.sqlite.prepare(sql).run(...args),changes=Number(result.changes||0);db.writes+=changes;return {success:true,meta:{changes,rows_written:changes}};},
  };}};}
}
function migrate(sqlite){sqlite.exec(fs.readFileSync(new URL('../migrations/20260921_tz101_publication_input_shadow.sql',import.meta.url),'utf8'));}

test('exact bundle persists once, deduplicates, and survives a fresh DB adapter',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tz101-input-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'inputs.sqlite');let sqlite=new DatabaseSync(file);migrate(sqlite);let db=new D1(sqlite);
  const first=await persistTz101PublicationInputs({env:{DATA_DB:db},decision_summary:decision,entry_area_rule:entry,fee_schedule:fee,holding_plan:hold,persisted_ts:NOW+1_000});
  assert.equal(first.status,'CLOSED');assert.equal(first.rows_written,1);assert.equal(first.rows_read,1);
  const again=await persistTz101PublicationInputs({env:{DATA_DB:db},decision_summary:decision,entry_area_rule:entry,fee_schedule:fee,holding_plan:hold,persisted_ts:NOW+2_000});
  assert.equal(again.status,'DEDUPLICATED');assert.equal(again.rows_written,0);
  sqlite.close();sqlite=new DatabaseSync(file);db=new D1(sqlite);t.after(()=>sqlite.close());
  const loaded=await loadTz101PublicationInputs({env:{DATA_DB:db},decision_summary:decision,observed_ts:NOW+3_000});
  assert.equal(loaded.status,'CLOSED');assert.deepEqual(loaded.entry_area_rule,entry);assert.deepEqual(loaded.fee_schedule,fee);assert.deepEqual(loaded.holding_plan,hold);
  assert.equal(db.reads,1);assert.deepEqual(TZ101_PUBLICATION_INPUT_BUDGET,{load_rows_read:1,persist_rows_read:1,persist_rows_written:1});
});

test('invalid or retroactive contracts fail before D1',async()=>{
  const expired=structuredClone(entry);expired.valid_until_ts=NOW-1;
  assert.equal(buildTz101PublicationInputBundle({decision_summary:decision,entry_area_rule:expired,fee_schedule:fee,holding_plan:hold}).status,'NOT_CLOSED');
  const late=structuredClone(hold);late.source_ts=NOW+1;
  assert.equal(buildTz101PublicationInputBundle({decision_summary:decision,entry_area_rule:entry,fee_schedule:fee,holding_plan:late}).reason,'HOLDING_PLAN_RECEIPT_NOT_CLOSED');
});

test('unknown D1 write acknowledgement fails closed and never claims persistence',async()=>{
  const sqlite=new DatabaseSync(':memory:');migrate(sqlite);const real=new D1(sqlite);
  const db={prepare(sql){const prepared=real.prepare(sql);return {bind(...args){const bound=prepared.bind(...args);return {...bound,async run(){await bound.run();return {success:true,meta:{changes:1}};}};}};}};
  const out=await persistTz101PublicationInputs({env:{DATA_DB:db},decision_summary:decision,entry_area_rule:entry,fee_schedule:fee,holding_plan:hold,persisted_ts:NOW+1_000});
  assert.equal(out.status,'FAIL_CLOSED');assert.match(out.reason,/D1_WRITE_ACK_INVALID/);sqlite.close();
});

test('acknowledged write followed by readback failure reports the exact D1 spend',async()=>{
  const sqlite=new DatabaseSync(':memory:');migrate(sqlite);const real=new D1(sqlite);
  const db={prepare(sql){const prepared=real.prepare(sql);return {bind(...args){const bound=prepared.bind(...args);return {...bound,
    async all(){throw new Error('INJECTED_READBACK_FAILURE');},
  };}};}};
  const out=await persistTz101PublicationInputs({env:{DATA_DB:db},decision_summary:decision,entry_area_rule:entry,fee_schedule:fee,holding_plan:hold,persisted_ts:NOW+1_000});
  assert.equal(out.status,'FAIL_CLOSED');assert.equal(out.statements,2);assert.equal(out.rows_written,1);assert.match(out.reason,/INJECTED_READBACK_FAILURE/);sqlite.close();
});

test('missing migration and immutable update/delete attempts stop safely',async()=>{
  const missing=new D1(new DatabaseSync(':memory:'));
  const noTable=await loadTz101PublicationInputs({env:{DATA_DB:missing},decision_summary:decision,observed_ts:NOW});
  assert.equal(noTable.status,'MIGRATION_REQUIRED');missing.sqlite.close();
  const sqlite=new DatabaseSync(':memory:');migrate(sqlite);const db=new D1(sqlite);
  await persistTz101PublicationInputs({env:{DATA_DB:db},decision_summary:decision,entry_area_rule:entry,fee_schedule:fee,holding_plan:hold,persisted_ts:NOW+1_000});
  assert.throws(()=>sqlite.exec("UPDATE tz101_publication_input_shadow SET status='CLOSED'"),/IMMUTABLE/);
  assert.throws(()=>sqlite.exec('DELETE FROM tz101_publication_input_shadow'),/IMMUTABLE/);sqlite.close();
});
