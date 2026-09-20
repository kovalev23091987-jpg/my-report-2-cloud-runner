CREATE TABLE IF NOT EXISTS telegram_output_dispatch_journal_v2 (
  dispatch_key TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('MORNING_REPORT','SHADOW_FINAL_DECISION','WATCH70_CANDIDATE')),
  source_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('RESERVED','SENT','SEND_FAILED')),
  reserved_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  message_hash TEXT NOT NULL,
  telegram_message_id TEXT,
  telegram_http_status INTEGER,
  error_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_telegram_output_v2_cooldown
ON telegram_output_dispatch_journal_v2(category,source_ref,status,updated_ts DESC);
