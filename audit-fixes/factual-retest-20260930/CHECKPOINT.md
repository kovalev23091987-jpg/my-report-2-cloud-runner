# Factual candle reconfirmation candidate — 2026-09-30

Status: PREPARED, NOT DEPLOYED. Based on production code from 36aeac2b048edb39b9fc6603cce32331ad849574 (PR41 plus an existing manual-request commit). PR42 remains separate and unmerged.

The observation adapter currently discards an already crossed factual anomaly boundary. This candidate retains that boundary for a fresh observation and a scheduled recheck. It requires the current price to remain on the valid side of cancellation and at least 5% to remain to the existing measured target. It does not create an approved entry.

No changes to publication checks, source proof, direction qualification, source freshness, entry approval, scoring, Telegram text, formatters, schedules, D1 schema or provider quotas.

Bounded replay of 83 preserved candidate snapshots is a plan-level check only. Five snapshots scoring at least 70 acquire plans through the reconfirmation change (QNT twice, 龙虾 twice, NIL once). Current source-role revalidation does not establish publication eligibility for these snapshots: usable independent source receipts are missing. Therefore additional Telegram deliveries are NOT proven. Do not merge as a completed solution to notification silence.

The next change must correctly carry actually verified, exact-contract, source-timed numeric HTX and independent market evidence into publication receipts. Existing status-only source wrappers are not usable market confirmations. Do not invent receipts, substitute current quotations into old snapshots, or waive this gate.

Validation: exact observation-plan function exercised with LONG/SHORT reconfirmation, remaining-move, cancellation, malformed-candle and classification controls. Full assembled runtime CI and full historical delivery acceptance remain NOT VERIFIED. Historical messages must not be resent.
