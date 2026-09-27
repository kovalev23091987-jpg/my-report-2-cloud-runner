-- CANDIDATE ONLY: never executed against production by this package.
-- Empty tables authorize no source requests. Provisioning quotas is separate.
CREATE TABLE IF NOT EXISTS report2_liq_quota_v1 (
 quota_key TEXT PRIMARY KEY,
 capacity INTEGER NOT NULL CHECK(capacity >= 0),
 reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= capacity),
 valid_until_ms INTEGER NOT NULL,
 policy_receipt TEXT NOT NULL CHECK(length(policy_receipt)>0)
);
CREATE TABLE IF NOT EXISTS report2_liq_reservation_v1 (
 reservation_id TEXT PRIMARY KEY,
 acquisition_hash TEXT NOT NULL,
 attempt_nonce TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('PENDING','RESERVED')),
 requirements_json TEXT NOT NULL CHECK(json_valid(requirements_json)),
 created_ts INTEGER NOT NULL
);
