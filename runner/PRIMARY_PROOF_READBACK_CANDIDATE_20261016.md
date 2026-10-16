# Offline row and causal readback candidate

This package extends PR410's offline codec qualification. No production module imports the candidate. It adds no SQL, source request, Worker call, new stored format, native receipt, persistence ACK, or physical free space.

## Independent expected bytes

`preparePrimaryProofReadbackCandidate` builds a metadata expectation from the original pre-insert row. It binds every native scalar's type and exact value, the raw proof UTF-8 hash, full original/stored row digests, exact identity and projection contract. The expectation includes no raw bodies. It must be retained independently by a future producer; deriving it from the returned row would invalidate the intended trust boundary. The self-digest detects accidental mutation, not an attacker able to replace the expectation.

Restoration checks full rows, exact partial projections and explicitly identified scalar exports. Missing/null/zero/string/number are distinct. New or missing columns, a wrong identity, changed bytes/types, an altered contract or a corrupt payload cannot pass the supplied expectation. Full JSON row key order is preserved. Large proof contents are decoded with the earlier bounded codec before semantic use.

The readback verifier requires one successful insert, independently known native counters, exactly one returned complete row, zero readback writes, chronological insert-then-readback intervals, the exact stored row digest, then complete decoded original equality. Duplicate/no-change insert or partial/failed/unmeasured replies refuse. Its positive result remains `OFFLINE_PRIMARY_PROOF_READBACK_VERIFIED_V1` with `production_ACK_authorized=false`, `native_receipt_accepted=false`, `new_primary_format_enabled=false`. It cannot create the existing producer's authoritative causal receipt.

## Scope of the saved-original replay

Three immutable historical native originals FIL/ZEC/龙虾 exercise the new row/scalar readers, the actual existing execution-context reader with the same SQL/params/output, and the existing immutable archive pack/marker-restoration path followed by proof decoding. All43 fields/types and exact original proof bytes survive. The simulated insert/readback costs and historical clocks are controlled fixtures, never new native persistence. Only metadata/digests are saved.

The earlier17-file inventory mixes proof/table consumers and canonical-only readers.14 listed files contain neither the proof-column nor full-evidence-table literal. This narrows the direct literal scope; it does not prove a complete dynamic call graph. The refreshed metadata lists exact hashes and source matches, while generic bridge SQL, scalar/raw row exports and runtime import/caller routes remain open.

## Activation remains blocked

The current producer still acknowledges its existing single insert and has no decoded exact readback. Its production code and runtime overlay are unchanged. A future integration requires actual native schema/trigger, qualified independent expectations and all caller/export paths, measured Worker CPU/heap/wire, budget/admission for additional readback and costs for both finalists, plus natural/manual/LIQ and same-run delivery acceptance. Client clocks do not establish server billing timestamps. No reserve is lowered from these tests.

This candidate does not solve the96-row/day maintenance envelope versus144 scheduled/188 manual-reserve rows. The4x48 proposal and permanent writer/rotation flags remain disabled. Both UTC16 maintenance slots remain spent; the next native399+406 qualification is only in a later ordinary permitted UTC-day window with fresh own scoped lease, exact code/readers and actual budget admission.

## Ordered batch alternative, still offline

Cloudflare documents ordered statement execution, transactional failure/rollback and ordered results for D1 batch: https://developers.cloudflare.com/d1/worker-api/d1-database/ (checked16Oct2026). The candidate compiles an exact bounded INSERT followed by a full-row SELECT in one client batch. It binds SQL/params order to the independent expectation and rejects changed plans, reordered results, duplicate inserts, unknown costs or changed stored bytes. It uses the batch transport interval and documented ordering; no per-statement timestamps are invented.

A controlled existing Node bridge adapter plus SQLite transaction qualifies2SQL statements through1client HTTP call. This is one extra SQL versus the current single insert, potentially no extra HTTP round trip. It does not prove installed bridge behavior, native read costs, trigger CPU, production transaction/wire limits or day admission; no reserve or hot-path budget is reduced or increased. The request and a conservatively bounded reply fit the existing1.4MB candidate ceiling, otherwise compilation refuses. Native qualification and safe production integration remain required.
