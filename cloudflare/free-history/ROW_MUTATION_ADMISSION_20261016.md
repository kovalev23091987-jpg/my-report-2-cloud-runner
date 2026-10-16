# Exact row reference scope and copy admission — 16 October 2026

## Observed defect

Native qualification `38836709187` selected 43 canonical bodies, verified/prepared
13 and moved one. It reserved 2,352 reads per update using a union of references
for up to 48 candidates; 404 of those reads were the observed schema scan.
Thirty rows were deferred by archive HTTP headroom and twelve by native headroom.
The receipt proves one exact LEGACY relocation and 487,424 physical bytes freed.
It does not prove sustained capacity or a complete later report.

## This package

- Derive each row's indexed reference subset from the **complete** discovery
  census. Binding uses its exact publication; recheck, lifecycle and dispatch use
  its exact contract. Keep the global command, calibration and other unindexed
  namespaces complete. The growth margin remains eight per table.
- A body whose contract changed since metadata discovery is refused. The SQL
  builder independently requires its row's contract and publication inside the
  supplied scope. Every update still rechecks matching references, namespace
  creation, a newer witness and every original field.
- Keep the existing cost formula `64 + 4 * sum(bound + 1) + schema allowance`.
  Keep the measured schema allowance and all run, day, wire, HTTP and manual
  reserves. No arbitrary smaller native multiplier is introduced.
- Hold the cumulative future mutation cost while each pending archive revision
  is looked up, inserted and verified. Before admitting another group, execute
  the admitted group and reconcile its actual usage. A group contains at most
  eight originals, fits the existing 1.4 MB wire cap and consumes one of the
  existing six transaction slots. No admitted transaction slot means no new copy.
- Restore every group exactly before its first primary change. Independently
  read up to four native originals, before the first mutation of their group,
  and independently read back up to four changed originals afterwards. Later
  groups can safely fail while earlier exact moves remain in the partial receipt.
- Record before/after group usage and the individual update/readback native
  counters. Missing counters stay null. Fixture counters are not Cloudflare
  native qualifications; neither a model nor the new code declares sustainability.

## Qualification boundary

Controlled SQLite tests exercise retained schema, exact bytes, indexed subsets,
late references and absent namespace races, concurrent contract changes, costly
native counters, wire/transaction headroom, cold/reused revisions and readthrough.
The high-cost fixture deliberately charges 404 schema reads and 1,300 reads per
update; it is a stress case, not a claimed production cost.

Both ordinary UTC16 RETAINED_HISTORY slots are already consumed. This package
makes **no** new native SQL maintenance call, MAIN run, source probe or Telegram
send. No flags, quotas, families, source clocks, reference/statistics rows or
trading policy change. Pool negative results are still not cached.

Separate native receipts in a later admitted ordinary window must qualify the
new row costs, pool placement, physical capacity and throughput. The old 96-row
nominal daily envelope remains below 144 scheduled / 188 with manual reserve.
Automatic writer/rotation flags remain false. The next natural full report after
01:44:46 UTC must independently prove both stored finalists and same-run delivery.
