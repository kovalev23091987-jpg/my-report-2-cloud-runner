# Post-release QNT receipt-only failure

Existing requirements: exact source clock, distinct missing data, both canonical consumers, no false healthy no-idea result; unified execution TZ sections 3, 4, 7, 9.

Reproduction: PR24 full run 36696678060 at b69e00b8223dd9515a54b41fa44018a44cb94d34 collected Lighter QNT. The adapter correctly retained source_ts=null but labelled its current HTTP receipt USABLE_SCOPED_NATIVE_CONTEXT. Native source-time validation then rejected canonical persistence with NATIVE_LIQUIDATION_SOURCE_TIME_INVALID. The empty publication query nevertheless rendered a normal no-idea report. The release is therefore not accepted merely because Actions succeeded.

Change: source-clock-unproven scoped samples have the explicit USABLE_RECEIPT_ONLY_CONTEXT state. Both canonical guards verify exact binding, fingerprint, receipt age, units and no target/entry eligibility. Display states that the provider state time is unknown. These samples remain excluded from dynamic panel score/target evidence. Known source clocks still fail on future/stale times; receipt time never becomes source time. Compact Telegram retains its existing omission of detailed foreign-venue samples.

The existing runner forwards persisted pipeline health into the manual result. Degraded data or a completed deep check without a persisted candidate becomes PARTIAL_DATA_UNAVAILABLE, with a clear user-facing incomplete-check explanation. It cannot appear as healthy absence of market opportunities. No extra database query, source HTTP call, worker hash change or threshold change.

N17 emits its bounded journal receipt for production audit without changing the worker. Tests cover both real canonical formatters, forged eligibility/source clock, expired receipt, future source clock and missing canonical output. Candidate CI must pass before promotion; both real reports must then be regenerated with Telegram disabled.
