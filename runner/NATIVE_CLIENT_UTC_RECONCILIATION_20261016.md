# Client query evidence for the next permitted native qualification

This package adds evidence to the existing opt-in maintenance qualification. It sends no additional SQL and changes no reservation, quota, source clock, production SQL, writer/rotation flag, report, or strategy. No UTC16 maintenance is authorized by this package.

## Concrete gaps

PR410's per-query journal had no request interval. Job start/end alone cannot assign a query spanning UTC midnight to a specific day. It also hashed normalized logical SQL. Retained-history rewriting can change SQL before transport, and whitespace normalization can hide a difference inside string literals.

The journal now retains client transport start/completion times and a transport sequence shared by all batch members. The interval starts after local admission and ends after response parsing or transport failure, before archive restoration. Concurrent requests retain distinct start identities even when completion order differs. Failed/partial replies keep the same interval and each known counter. Missing/backward clocks and midnight-spanning requests remain unallocated; a client interval never proves the server's billing timestamp or source observation time.

The old normalized logical fingerprint remains for compatibility. `wire_sql_sha256` separately hashes the exact UTF-8 SQL sent by this client, including any client-side retained rewrite. SQL/params/results/credentials are not exported. This hash does not prove an installed bridge's later server-side transformation or counter provenance.

## Reconciliation

`reconcileNativeQueryCosts` compares the disjoint bridge and private binding journals with the existing combined usage snapshot. It validates bounded counts, sequences, native known-or-null counters, duplicate bindings, shared batch intervals and exact aggregate arithmetic. Repeated identical SQL attempts are counted separately. Extra, missing, overflowed, partial, conflicting or unsafe evidence prevents qualification. Known subtotals remain distinct from unknown operations.

Only explicit manual native qualification writes this reconciliation into `proof.json`. Incomplete evidence makes that qualification fail; cursor handling and owner cleanup remain in the existing finalization path. The reconciler is offline, adds no transport calls and is not a new runtime admission rule. It always reports `whole_day_closed=false`, `daily_total=null`, `daily_upper_bound=null`, `native_billing_day_verified=false`, `admission_authorized=false` and `reservations_changed=false`.

Controlled tests cover normal/failed/batched/private/concurrent clients, midnight crossing, absent/backward clocks, duplicate bindings, counter overflow, aggregate mismatch, exact wire SQL and archive restoration. They do not qualify native costs, current installed bridge provenance, daily limits, physical space, shared399/grouped406 throughput, or delivery of a report.

Both UTC16 RETAINED_HISTORY slots remain spent. Next native qualification must use the later ordinary permitted UTC day, current exact code/readers, fresh own scoped lease and actual admission. Keep original unknown costs and all reserved amounts. Existing primary-proof compression remains offline and disabled.
