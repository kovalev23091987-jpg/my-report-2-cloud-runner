-- V3 natural-proof telemetry on the already-existing cron_runs write.
-- Additive columns only; Worker query count is unchanged.
ALTER TABLE cron_runs ADD COLUMN v3_discovery_shortlist_count INTEGER;
ALTER TABLE cron_runs ADD COLUMN v3_live_shortlist_count INTEGER;
ALTER TABLE cron_runs ADD COLUMN v3_live_deep_check_count INTEGER;
ALTER TABLE cron_runs ADD COLUMN v3_live_zero_reason TEXT;
ALTER TABLE cron_runs ADD COLUMN v3_pipeline_health_status TEXT;
ALTER TABLE cron_runs ADD COLUMN v3_pipeline_health_reason TEXT;
ALTER TABLE cron_runs ADD COLUMN v3_live_lane TEXT;
ALTER TABLE cron_runs ADD COLUMN v3_maintenance_deferred INTEGER;
