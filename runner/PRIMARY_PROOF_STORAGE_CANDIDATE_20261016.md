# Lossless primary proof candidate, 16 October 2026

## What was checked

`primary-proof-storage-candidate.mjs` is an **offline candidate**, imported only
by its qualification tool and tests. No production writer/reader imports it.
It does not delete a field or replace the full proof with a public projection.

The candidate keeps the complete original UTF-8 proof in bounded gzip, with
original/gzip hashes, byte lengths and exact row/column identity. Its small JSON
projection preserves the declared INSERT guard's 48 expression occurrences
(47 distinct operation/path pairs). The original is required for every semantic
consumer. Wrong row, changed contract, mismatched projection, altered bytes,
duplicate JSON keys and excessive expansion fail closed.

Three native original rows already retained in archive commit
`b311167b34dc33874c135932997af8bfc12ac83a` were replayed locally. The metadata-only
receipt is `checkpoints/free-storage-20261016/primary-proof-candidate-saved-originals.json`.
Original proof bodies were not exported into a new repository fixture.

| Saved row | Original row JSON bytes | Candidate row JSON bytes |
|---|---:|---:|
| FIL | 228086 | 97773 |
| ZEC | 230675 | 97794 |
| 龙虾 | 195902 | 62872 |
| Total | 654663 | 258439 |

All 43 original row columns, types and proof bytes were reconstructed exactly.
The unchanged declared SQLite INSERT guard accepted both representations;
each distinct JSON expression matched. The actual existing execution reader
received the restored original, issued the same SQL/parameters and returned
the same verified context with three facts for every row. These are historical
original-clock fixture results, not three new live reports.

## Activation is still forbidden

The production producer acknowledges its one native INSERT directly. The
candidate cannot use that acknowledgment for an encoded proof without a
qualified exact decode/readback before the causal persistence acknowledgment.
The existing semantic reader currently parses the stored JSON directly; it
needs explicit, qualified decoding before any new representation is written.

Before activation, qualify the installed native schema/trigger, all callers and
row-export paths from the 17 declared consumer sources, full source bytes and
scalars, original clocks, the prepared/committed receipt order, Worker CPU/heap,
actual wire bytes and native costs, and full natural/manual/LIQ report output.
Only the existing reader replay and declared guard were checked here. An
inventory of source hashes is not qualification of every live consumer.

No primary payload, schema, INSERT, runtime import, quota, source clock,
strategy, pause, report form, writer or rotation flag changed. No production
SQL, source HTTP, forced report or Telegram message was issued.

## Remaining storage and day constraints

The measured reduction is serialized sample data, **not physical D1 space**,
current inflow, native cost or a sustainable day bound. Physical space freed by
this candidate is zero. It does not solve the nominal row deficit: 2 × 48 = 96
maintenance rows/day versus 144 scheduled or 188 with the manual reserve.
Four slots remain an unapproved, unqualified proposal. Neither extra slots nor
compression can be used to bypass day admission or unknown cost.

Both UTC16 maintenance slots remain spent. The next native shared/grouped
qualification is only in a later ordinary permitted UTC day, under the exact
current reader proof, fresh scoped lease and actual admission. Whole-day
collector/hourly/control/late/unknown costs remain open; the previous point
receipts cannot be multiplied into a guaranteed upper bound.
