CREATE TABLE IF NOT EXISTS report2_candidate_task_v2(contract TEXT NOT NULL,wave_id TEXT NOT NULL,task_kind TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,first_seen INTEGER NOT NULL,due_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,lease_until INTEGER,lease_owner TEXT,priority INTEGER NOT NULL,terminal_reason TEXT,state TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(contract,wave_id,task_kind));
CREATE INDEX IF NOT EXISTS idx_report2_candidate_task_v2_due ON report2_candidate_task_v2(state,due_at,priority,created_at);
INSERT INTO report2_candidate_task_v2(contract,wave_id,task_kind,attempts,created_at,first_seen,due_at,expires_at,priority,terminal_reason,state,updated_at)
SELECT 'SOL-USDT','LEGACY_PRE_V5','NEW_CANDIDATE',3,1,1,1,1,0,'LEGACY_DONE_ATTEMPTS_3','COMPLETED',1
WHERE EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='liquidation_candidate_queue')
ON CONFLICT(contract,wave_id,task_kind) DO NOTHING;
