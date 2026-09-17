#!/usr/bin/env python3
import json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
worker=(ROOT/'src/worker.js').read_text()
fd=(ROOT/'src/final-decision-integration-runtime.mjs').read_text()
mw=(ROOT/'src/multi-wave-campaign-runtime.mjs').read_text()
migration=(ROOT/'migrations/20260914_stage392_receipt_wiring_shadow.sql').read_text()

def c(src,name):
    m=re.search(rf'\b{name}\s*=\s*(\d+)',src)
    assert m, name
    return int(m.group(1))

ledger={
 'cron_started_and_terminal_journal':2,
 'stage0_history_reads_and_compact_persistence':6,
 'opportunity_journal_selection':1,
 'fast_move_bounded_reads':6,
 'fast_move_prepare_plus_finalize_writes':8,
 'deep_check_scheduler_reserve_and_journal':5,
 # Net unchanged: old Full Evidence hot DELETE -1; Final Decision SHADOW INSERT +1.
 'deep_check_shadow_reads_and_writes_stage392_net':17,
 'multi_wave_campaign_shadow':3,
}
assert sum(ledger.values())==48
assert c(worker,'CONSERVATIVE_DEEP_CHECK_D1_QUERY_BUDGET')==48
assert c(worker,'D1_FREE_QUERY_LIMIT')==50
assert c(mw,'MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK')==3
assert c(mw,'MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK')==2
assert c(fd,'MAX_FINAL_DECISION_D1_STATEMENTS_PER_EVALUATION')==1

# Hot Full Evidence path is exactly one statement, no DELETE.
start=worker.index('async function persistFullEvidenceShadowRecord')
end=worker.index('async function runStage392FullEvidenceMaintenance', start)
hot=worker[start:end]
assert 'env.DATA_DB.batch([insert])' in hot
assert 'DELETE FROM full_evidence_shadow_log' not in hot
assert 'hot_path_statements: 1' in hot

# Cleanup exists only in bounded idle maintenance and is deferred on Deep Check.
maint_start=worker.index('async function runStage392FullEvidenceMaintenance')
maint_end=worker.index('/* STAGE371_CROSS_VENUE_LIQUIDATION_INTELLIGENCE */', maint_start)
maint=worker[maint_start:maint_end]
assert 'DELETE FROM full_evidence_shadow_log' in maint
assert 'LIMIT 100' in maint
assert 'statements: 1' in maint
assert 'stage392FullEvidenceMaintenance = deepCheckAttempted' in worker
assert 'DEFERRED_D1_FREE_QUERY_BUDGET' in worker

# Final Decision CAS is a scalar predicate inside the same one INSERT, not a preflight read.
assert 'SELECT 1 FROM shadow_virtual_position_ledger' in fd
assert 'contract_code=?52 AND state=?53 AND state_revision=?54' in fd
assert 'require_exact_insert_ack' in fd
assert 'NO_COMMIT_FAIL_CLOSED' in fd
assert '.all(' not in fd[fd.index('export async function persistFinalDecisionIntegrationShadow'):]
assert '.first(' not in fd[fd.index('export async function persistFinalDecisionIntegrationShadow'):]
assert 'expected_position_cas' in worker

# Multi-Wave genesis/update position CAS is embedded in the same campaign write,
# and the existing single read JOINs the virtual ledger even without a campaign.
assert 'WITH active AS (' in mw
assert 'LEFT JOIN shadow_virtual_position_ledger p ON p.contract_code=?1' in mw
assert "COALESCE((SELECT state_revision FROM shadow_virtual_position_ledger WHERE contract_code=?5),0)=?31" in mw
assert "COALESCE((SELECT state FROM shadow_virtual_position_ledger WHERE contract_code=?5),'ABSENT')=?32" in mw
assert 'expectedPositionRevision' in mw and 'expectedPositionState' in mw

# Position maintenance uses D1 triggers attached to already-counted writes.
assert 'CREATE TRIGGER trg_stage392_campaign_position_insert' in migration
assert 'CREATE TRIGGER trg_stage392_campaign_position_update' in migration
assert 'CREATE TRIGGER trg_stage392_final_decision_open_virtual_position' in migration
assert 'CREATE TRIGGER trg_stage392_final_decision_exit_virtual_position' in migration

print(json.dumps({
 'ok':True,
 'suite':'stage392-capacity-budget',
 'd1_worst_case':sum(ledger.values()),
 'd1_limit':50,
 'full_evidence_hot_statements':1,
 'final_decision_shadow_statements':1,
 'net_peak_change':0,
 'multi_wave_queries_including_read':3,
 'virtual_position_extra_worker_queries':0,
 'maintenance_hot_path':False,
},indent=2))
