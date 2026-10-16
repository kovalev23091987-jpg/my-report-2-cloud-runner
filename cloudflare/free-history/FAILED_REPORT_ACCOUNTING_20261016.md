# Failed full report: preserve cost and avoid repeating its failure

The natural full run38840064503, head6700d47b, completed after the first exact
relocation. It scanned105/105 and selectedFIL/SUI; neither canonical result was
persisted and the same-run delivery proof contains noSENT. The exact artifact
12020992278 has digest
`sha256:708af396d1a45d7c88dfc7b1d763105b84a1418d37a1c09961f39c6b01ec8279`.
Known subtotals are42337R/341W from434 attempted statements, with3 unknown native
INSERT operations receivingHTTP500. Totals remain null. This proves failed
persistence; it does not measure current capacity or prove an exchange rate cap.

Two concrete defects are addressed together:

1. The existing same-day guard only consumed a retained9October refusal. It
   therefore ignored this new exact failed-write receipt. The extension reads
   bounded, hash-verified local originals and their exact same-run negative
   delivery proof. It blocks schedule/recovery work only in the originalUTCday,
   emits a currentNOT_CLOSED receipt and preserves the prior3unknown operations
   separately from zero new calls. A later hash-verified native relocation with
   measured physical recovery and independent exact readbacks permits the
   original native admission again. It never resets the daily ledger. Missing,
   foreign, future, corrupt, partially successful or delivered source evidence
   cannot create this refusal. Manual workflow paths remain as configured.
2. The runner recorded failed-run unknown costs in its output but left its
   already reserved ledger row unfinalized. Fatal cleanup now attempts exactly
   one normal accounting UPDATE for that originalR2RUN reservation, after lease
   cleanup. It uses the same monotonicfinalizeRunUsage function. Existing
   successful normal completions are not finalized twice. Failed or unmeasured
   accounting stays explicitly unacknowledged and is not retried or refunded.
   Later costs after a normally finalized run remain a separate whole-day audit
   concern; this package does not claim to close every family or the full day.

The runtime diagnostic distinguishes unmeasured native database cost from a
measured reservation overrun. The established reason token remains compatible;
new fields do not alter financial scores or report/Telegram text.

The exact failed source and delivery originals are retained as gzip files with
both raw and compressed hashes. The prior exact native relocation is retained.
No old receipt, source clock, reference, statistic, pause, weight, quota or
reservation is replaced. BothUTC16maintenance slots remain spent. This work
runs no native maintenance,MAIN/source probe or Telegram send. Code qualification
and a retained refusal are not restoration of the full report. The new failed-run
ledger path still requires observation in an ordinary future run.
