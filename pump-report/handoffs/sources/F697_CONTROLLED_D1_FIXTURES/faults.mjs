// Mandatory fault witnesses. Every returned boolean follows actual assertions.
import {openControlledD1} from './controlled-sqlite.mjs';
export async function verifyConcurrentAndUnknown({D1Store,createNativeTailGuard,db,clock,load}={}) {
  const assert=(await import('node:assert/strict')).default;
  if(!D1Store||!createNativeTailGuard||!db?.snapshot||!clock||!load)throw Error('F697_FAULT_CONTEXT_REQUIRED');
  const N=await load('runtime/native-budget.mjs');
  const local=await openControlledD1({maxStatements:30});
  let now=clock();const localClock=()=>now,run_id='F697-PENDING';
  const admission={evidence_ref:'CONTROLLED:F697:PENDING:'+run_id,expires_ts:now+900000,
    max_requests:4,max_rows_read:5000,max_rows_written:300};
  const store=new D1Store({db:local,clock:localClock,admission,finalization_reserve:{requests:2,rows_read:2,rows_written:1}});
  const required=store.reserveStage({run_id,phase:'REQUIRED_TAIL',workload_id:'pending-and-required-coexist',
    envelope:{requests:1,rows_read:1,rows_written:0},expires_ts:admission.expires_ts});
  const gate=local.barrierNext((query,args)=>query.startsWith('SELECT value_json')&&args[0]==='F697_PENDING');
  const pending=store.get('F697_PENDING');
  let pendingWitness,refusal,before,after;
  try{
    await gate.entered;
    pendingWitness=store.stageTotals();
    assert.equal(pendingWitness.pending.requests,1);assert.equal(pendingWitness.pending.rows_read,1);
    assert.equal(pendingWitness.held.requests,1);
    before=local.counters();
    await assert.rejects(store.get('F697_OPTIONAL'),error=>{refusal=error.code;return /QUERY_COUNT_PROTECTED/.test(error.code);});
    after=local.counters();assert.equal(after.attempted,before.attempted);assert.equal(after.executed,before.executed);
    assert.equal(store.stageTotals().held.requests,1);
  }finally{gate.release();}
  await pending;assert.equal(store.stageTotals().pending.requests,0);store.releaseStage(required);
  const token=store.reserveStage({run_id,phase:'EXPIRING',workload_id:'expiry',
    envelope:{requests:1,rows_read:1,rows_written:0},expires_ts:now+1000});
  const foreign=new D1Store({db:local,clock:localClock,admission:{...admission,evidence_ref:'CONTROLLED:F697:FOREIGN:OTHER'}});
  assert.throws(()=>foreign.withStage(token),/NOT_OWNED/);
  assert.throws(()=>store.withStage({}),/NOT_OWNED/);
  now+=1001;const expiryBefore=local.counters();
  await assert.rejects(store.withStage(token).get('F697_EXPIRED'),/EXHAUSTED_OR_NOT_OWNED/);
  assert.equal(local.counters().attempted,expiryBefore.attempted);store.releaseStage(token);
  // Fresh isolated shadow ledger, never reuse/rearm one of the four case runs.
  const unknownDB=await openControlledD1({maxStatements:30});
  const native=await N.reserveNativeRun({db:unknownDB,run_id:'F697-ACK-UNKNOWN',mode:'AUTO',clock,
    policy:{...N.NATIVE_POLICY,evidence_ref:'CONTROLLED:F697:FAULT_NOT_PRODUCTION_ADMISSION'}});
  const actualGuard=createNativeTailGuard({store:native.store,run_id:native.run_id,mode:'AUTO',clock});
  assert(actualGuard.projection_budget);
  const error=unknownDB.ackUnknownNext((q,args)=>q.startsWith('INSERT INTO pump_report_state_v1')&&args[0]==='F697_UNKNOWN');
  await assert.rejects(native.store.set('F697_UNKNOWN',{controlled_ack_may_have_committed:true}),e=>e===error);
  assert.equal(native.store.usage().unknown_ops,1);
  assert.deepEqual(unknownDB.peek('F697_UNKNOWN'),{controlled_ack_may_have_committed:true});
  const ledger=unknownDB.inspect('SELECT * FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1',[native.reservation_id])[0];
  assert.equal(ledger.state,'RESERVED');const unknownBefore=unknownDB.counters();
  await assert.rejects(N.finalizeNativeRun(native,{clock}),/UNKNOWN_NATIVE_RUN_REMAINS_RESERVED/);
  assert.equal(unknownDB.counters().attempted,unknownBefore.attempted);
  assert.equal(unknownDB.inspect('SELECT state FROM report2_runner_budget_ledger_shadow WHERE reservation_id=?1',[native.reservation_id])[0].state,'RESERVED');
  const witness={schema:'F697_ACTUAL_CONTROLLED_FAULT_WITNESSES_V1',
    concurrent_optional_borrow_denied:after.attempted===before.attempted&&pendingWitness.pending.requests===1&&pendingWitness.held.requests===1,
    unknown_blocks_finalize:native.store.usage().unknown_ops===1&&ledger.state==='RESERVED',
    foreign_or_expired_stage_denied:local.counters().attempted===expiryBefore.attempted,
    pending_before_await:pendingWitness,optional_refusal:refusal,optional_counter_before:before,optional_counter_after:after,
    unknown_usage:native.store.usage(),unknown_ledger:ledger,pending_sqlite:local.snapshot(),unknown_sqlite:unknownDB.snapshot(),
    accounting_basis:'CONTROLLED_SQLITE_NOT_NATIVE_PHYSICAL',production_admission:false};
  local.close();unknownDB.close();return witness;
}
