# Native accounting: known subtotals and unknown work

The collector observer and the measured private-reader wrapper previously
discarded an entire statement's known counters when the other native counter was
missing, or an acknowledgement reported failure. They now retain each valid
nonnegative native counter independently. The unknown operation remains unknown;
totals and admission remain unclosed. The private reader keeps its original
exception path. No SQL, parameters, source calls or admission caps change.

The saved-only reconciliation tool reuses the two already accepted, immutable
Tail originals. It checks raw SHA, native message hash, worker/version/deployment,
cleanup and execution clocks, then deduplicates invocation ids. Conflicting
receipts and midnight-spanning executions remain unresolved. It reprojects the
original messages rather than trusting a cached projection.

The three observed invocations total 482 known reads and 41 writes. Of these,
147 reads/4 writes are the private-price SOURCE component already nested inside
the PRIVATE_PRICE family. The remaining observed subtotal is 335 reads/37 writes.
These are point observations, not daily spend, ceilings or spare capacity.

The nine planned family envelopes remain a separate model: 3266708 reads and
58920 writes. The tool never adds point spend to that model and calls the result
a day bound. It records current source hashes and unresolved collector, hourly,
control and failed/late costs. It retains the 96-row nominal maintenance capacity
versus 144 planned/188 with manual reserve, without enabling four maintenance
slots or changing the current two slots.

The retained 8 October bridge fixture marks a statement measured when either
counter is finite. That immutable historical fixture was not edited. It is a
specific gap in qualifying the currently installed bridge metadata contract;
the fixture does not prove the currently installed implementation. No current
runtime is rejected or declared repaired solely from that historical snapshot.

CLI: `node tools/audit-native-day-costs-20261016.mjs`. It reads saved repository
files and writes an offline audit artifact. It performs no network or SQL calls,
does not reset unknown work and cannot authorize runtime admission. A successful
audit deliberately leaves `whole_day_closed=false` until the missing day bounds
and actual native accounting are qualified.
