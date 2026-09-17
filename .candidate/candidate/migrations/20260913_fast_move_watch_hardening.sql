-- My Report 2 / Stage 3.8.1
-- Additive hardening for generation history. Shadow-only; no live promotion.

CREATE TABLE IF NOT EXISTS fast_move_watch_generation (
  contract TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK (generation >= 1),
  engine_version TEXT NOT NULL,
  opened_ts INTEGER NOT NULL CHECK (opened_ts > 0),
  opening_event_id TEXT NOT NULL UNIQUE,
  opening_reason TEXT NOT NULL,
  closed_ts INTEGER,
  final_state TEXT CHECK (final_state IS NULL OR final_state IN ('EXPIRED','CLOSED')),
  closure_reason TEXT,
  shadow_only INTEGER NOT NULL DEFAULT 1 CHECK (shadow_only = 1),
  live_signal INTEGER NOT NULL DEFAULT 0 CHECK (live_signal = 0),
  trading_execution INTEGER NOT NULL DEFAULT 0 CHECK (trading_execution = 0),
  PRIMARY KEY(contract, generation),
  CHECK (closed_ts IS NULL OR closed_ts >= opened_ts)
);

CREATE INDEX IF NOT EXISTS idx_fast_move_watch_generation_opened
  ON fast_move_watch_generation(opened_ts DESC);
CREATE INDEX IF NOT EXISTS idx_fast_move_watch_generation_contract_closed
  ON fast_move_watch_generation(contract, closed_ts);

-- Idempotent backfill for a database that already has the Stage 3.8 state table.
-- This preserves the current generation boundary even when its original opening
-- event was not journaled by Stage 3.8.
INSERT OR IGNORE INTO fast_move_watch_generation (
  contract,generation,engine_version,opened_ts,opening_event_id,opening_reason,
  closed_ts,final_state,closure_reason,shadow_only,live_signal,trading_execution
)
SELECT
  contract,generation,engine_version,created_ts,
  'BACKFILL:' || contract || ':' || generation,
  'BACKFILL_STAGE38_CURRENT_STATE',
  CASE WHEN lifecycle_state IN ('EXPIRED','CLOSED') THEN updated_ts ELSE NULL END,
  CASE WHEN lifecycle_state IN ('EXPIRED','CLOSED') THEN lifecycle_state ELSE NULL END,
  CASE WHEN lifecycle_state IN ('EXPIRED','CLOSED') THEN COALESCE(closure_reason,last_reason_code,'BACKFILL_TERMINAL') ELSE NULL END,
  1,0,0
FROM fast_move_watch_state;
