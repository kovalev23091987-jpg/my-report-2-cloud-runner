-- Separate bounded maintenance only; never installed by a cold deep run.
CREATE INDEX IF NOT EXISTS idx_report2_liq_role_contract_source_time
ON report2_liquidation_role_observation(contract,role,source_id,observed_ts DESC,run_id DESC);
