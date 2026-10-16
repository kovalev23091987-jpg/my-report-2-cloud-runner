# Native client accounting and next maintenance evidence

The whole-day review found two additional client gaps, separate from the
already deployed Worker observer repair in PR407:

1. The Node bridge client discarded a valid read or write counter unless both
   counters and `measured:true` were present. Error HTTP replies discarded
   available native metadata before recording the attempted work as unknown.
2. The private archive API discarded known metadata from a short/failed native
   batch and counted a failed multi-statement transport as only one unknown
   operation. A failed reply could leave earlier apparent free capacity cached.

The clients now keep every valid known counter independently and preserve
unknown status. Failed bridge metadata is accounted exactly once. Every
potentially attempted private batch member remains charged as unknown; extra
unmatched replies also remain unknown. Local admission rejection and the
existing explicit private401/403 policy remain zero native attempts. Failed or
incomplete private replies invalidate cached storage size. No reservation is
refunded, replaced or renamed.

## Per-query receipts without additional requests

`NativeQueryCostJournal` is disabled by default. The existing explicit native
maintenance qualification opts in for the bridge and each exact private pool
location. Up to512 statements per binding are retained, in order, as operation,
table target, normalized SQL hash, known/null read/write counters, unknown flag
and HTTP status. No SQL text, values, result bodies, keys or credentials are
exported. Overflow is explicit and makes qualification incomplete. Collecting
receipts adds no SQL, source request or Worker invocation. Successful wire
requests, returned results and usage totals are unchanged by opting in.

The ordinary maintenance artifact now retains separate private/grouped SELECT,
INSERT/readback and shared UPDATE/readback costs. This supplies evidence for a
later native qualification; it does not reduce any present reserve. The actual
installed bridge's partial-counter provenance still needs qualification: a
client journal cannot prove whether an upstream counter was synthesized.

## Scope

The shared runtime overlay includes the new journal dependency. No Cloudflare
Worker module changes or redeployment is required for this Node client repair.
No native maintenance was executed by this package. Both UTC16 slots remain
spent, caps and writer/rotation flags remain unchanged, and the primary proof
compression prototype is still offline only.
