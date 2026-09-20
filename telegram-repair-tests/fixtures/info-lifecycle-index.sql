-- Additive infrastructure index only. No existing table or constraint is changed.
CREATE INDEX IF NOT EXISTS idx_report2_info_lifecycle_fresh
ON v3_user_lifecycle_shadow(shadow_only,status,updated_ts DESC);
