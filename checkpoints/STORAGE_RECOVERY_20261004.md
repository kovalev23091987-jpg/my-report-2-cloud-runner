# Storage recovery checkpoint — 2026-10-04

Status: STORAGE_RECOVERY_DEPLOYED_AND_LIVE_COLLECTOR_VERIFIED.

## Confirmed completion — 2026-10-04 07:15 UTC

Owner authorized the precise initial cleanup after backup and then required automatic cleanup. Backup workflow 37184669565 succeeded; artifact 11296487282 and a persistent recovery copy retain all 2,814 expired rows. Every payload hash and the aggregate JSONL hash were verified in CI and independently after download. Backup SHA-256: `876feff4bb23d56bacefa96b7788b4ae59d95f7436c99fd08068cb925217ae8c`.

Exactly 2,814 approved rows were deleted (2,814 measured writes); database size fell from 499,998,720 to 443,547,648 bytes. All 2,412 original retained snapshot hashes were re-read in bounded pages and match the original manifest. No report, command, dispatch or liquidation table was deleted.

Final V7 automatic retention runs before the collector claim INSERT on each five-minute slot, deletes at most eight rows older than 72 hours, uses exact actor/generation scope, skips closed/running/error slots, includes failed-run writes in the daily allowance, and logs database size with a warning at 450 MB. The 10,000-write collector ceiling remains unchanged. This replaces the earlier draft's hourly 96-row deletion, providing the same hourly maximum with smoother writes.

Hub deployment `0eb4b811291b4a929bc8009b088d4ca1`, deployed 07:14:18 UTC: exact source readback matches the candidate, Hub prefix hash `dd2bb80a7517a2a844934894c022f520f96eaf05ce5d51ee6fbcc36e42fc119d` is unchanged, all 12 bindings and both existing cron schedules are preserved. PR78 merged at main `8b7e9b415f6793d85acd5e3f59eaa8a479ae5aa8`.

First post-deployment scheduled collector slot `1791098100000` completed at `1791098152020` (07:15:52 UTC), CLOSED: 370 contracts, six shards, four source requests, 47 measured reads, 19 writes, error_text=null; database 443,625,472 bytes. Eleven collector/backup tests pass, including a full-database regression blocking even claim insertion until retention executes.

This completes the expired market-snapshot cleanup task. It is not acceptance of the full analytical report, two deep candidates, or Telegram signal delivery. Large report/evidence histories remain intact; their long-term archive/capacity policy is a separate outstanding issue and the storage warning does not itself archive them. Liquidation changes remain excluded by the owner.

The sections below record the initial diagnosis and proposal; the confirmed completion above supersedes their initial not-deployed state.

Owner scope: liquidation data and modelling remain unchanged. Continue candidate selection and Telegram work. Current approval covers read-only storage investigation, not deletion.

## Verified live observations

- Production D1 `report2-data-plane`, UUID `057a2847-2cc4-4e52-8534-1be1596d21d5`, reports 499,998,720 bytes.
- Scheduled workflow run 37177111183, job 111361940761: `D1_ERROR: Exceeded maximum DB size`; Stage 0 persistence and canonical/evidence persistence fail, runner exits before Telegram delivery.
- Public collector health independently reports the same DB-size error.
- Standard SELECT queries through Cloudflare connector succeed. Earlier `dbstat` was unavailable; the combined PRAGMA diagnostic was rejected. This was not proof that all SQL access was unavailable.
- Cloud dashboard requires sign-in and continues showing verification error after one reload. No credentials were entered.
- Market snapshots: 5,226 rows, 96,235,926 payload bytes, all `HUB_PUBLIC_COLLECTOR` / V12 contract-integrity generation.
- Full evidence: 886 rows; four principal JSON fields alone total 109,253,689 characters. Canonical publications: 391 rows, principal JSON/text fields total 104,398,431 characters. These histories are not cleanup targets.
- At cutoff `1790837064088`, 2,814 market snapshot rows were expired, with 51,643,435 recorded payload bytes. Exact file-space recovery may differ because SQLite pages/indexes are involved.

## Prepared collector change

Move the existing hourly deletion of at most 96 snapshots older than 72 hours before the new payload insert; retain the cutoff, cadence and row limit. Track deletion rows read/written using actual D1 metadata when available. Upgrade marker to V7; patcher preserves the Hub prefix and can upgrade V6.

Validation: `node --test cloudflare/public-collector/public-collector.test.mjs cloudflare/public-collector/github-backup.test.mjs` — 11/11 PASS. The overflow regression refuses snapshot allocation until retention runs, and also verifies that provider failure retains an ERROR receipt and accounts for cleanup writes.

Limitation: the collector still claims its slot before retention. If even the small claim allocation fails at the present ceiling, a separate initial cleanup is necessary. This patch does not establish indefinite capacity for growing report/evidence histories; archival or storage separation must be designed without discarding verified history.

## Concrete initial cleanup proposal — requires owner approval

Only `report2_market_snapshot_batch_v1`, only actor `HUB_PUBLIC_COLLECTOR`, only generation `MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M`, only `bucket < 1790837064088`. No other tables, newer snapshots, liquidation data, commands, dispatch records or reports.

Before deletion: recount the exact scope, establish a recovery copy of the exact selected rows, verify its row count and hashes, and verify available daily write allowance. Delete in bounded batches, measuring actual indexed writes. Do not expand the frozen cutoff or target scope silently. Read back that the selected rows are absent and retained recent rows are unchanged. Then apply the approved collector update with Hub bindings/routes/cron preserved and validate a fresh scheduled/manual report and actual Telegram receipt when an eligible signal exists.

No cleanup, production deployment, manual report acceptance or Telegram success is claimed by this checkpoint.
