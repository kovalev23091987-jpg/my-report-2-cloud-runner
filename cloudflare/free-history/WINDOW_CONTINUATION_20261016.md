# Bounded window continuation after the first native qualification

Native run 38802826734 finished with zero selected bodies. Its complete first
128-row metadata window contained 21 basic candidates; all 21 had protected
references. The exact receipt records 1,058 native reads, four writes, no
unknown operations and 39 whole HTTP. Cursor 710 was saved by exact phase CAS
and its owner was released. No archive report payload or capacity recovery was
proved. The original receipt is retained in checkpoints/free-storage-20261016.

The subsequent ordinary full report 38832812483 scanned 105 assets but neither
ENA nor CT was persisted. Twelve native operations remain unmeasured; the
41,666-read/295-write values are known subtotals, not closed totals. It has no
same-run SENT. A green maintenance workflow does not repair this failure.

## Change

One existing admission can now continue through at most four complete empty
windows. Every metadata query still visits at most 128 rows by primary key.
The maximum selected/modified rows remains 48; all conditional reference,
48-hour, latest-per-coin, original-byte and native preflight guards remain.
The next scan is declined when bridge headroom cannot retain three requests
for mutation/readback/finalization. Existing native admission is checked before
each scan; no new reservation family, extra daily slot or budget is introduced.
Incomplete references and unknown native errors never permit skipping a body.
On a later admission refusal only the preceding completely checked cursor can
be saved. Deferral after later candidates resumes at that candidate window,
without redoing preceding complete empty windows.

The receipt records counts of protected references per table. These counts may
overlap; they are not independent rows or deletable payload estimates.

The ordinary manual workflow has an explicit A1-A4 qualification opt-in, false
by default. It requires the exact borrowed owner and manual native preflight.
Both native qualification paths recheck the two immutable readers with eight
Cloudflare GETs before SQL. Permanent writer/rotation flags stay false.

## Remaining gate

The second UTC16 maintenance slot is not spent by these offline tests. A new
native attempt must use a fresh qualified exact main and owned RETAINED_HISTORY
lease, resume cursor 710, pass the existing shared 2/day admission and retain
the same 5,000-read/400-write, 16-bridge, 40-control and 164-whole limits. It may
still refuse because of unknown full-report costs or protected references.
No retry, quota refund or source call is authorized by a code test.

The nominal 96 moved rows/day still does not cover 144 planned body rows/day
or 188 including manual reserve. Actual useful throughput and physical capacity
remain unproved; sustained automatic rotation must not be enabled from this PR.
