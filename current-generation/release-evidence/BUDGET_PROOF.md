# Budget proof

| Limit | Proven value |
|---|---:|
| Scheduled runs/day | 72 |
| Manual full/day | 3 |
| Manual coin/liquidation-only admissions/day | 5 |
| Reserved burst deep checks/day | 6 |
| BYK 31-day total | 13,330 |
| BYK scheduled + burst | 12,090 |
| Operational cap | 13,500 |
| Official quota | 15,000 |
| Whole analytics job HTTP attempts | 164 |
| D1 daily soft reads/writes | 3,500,000 / 70,000 |
| Planned D1 reads/writes | 3,374,000 / 66,160 |
| Maximum measured full-run D1 reads/writes | 18,690 / 220 |
| Maximum measured full-run D1 requests | 159 |
| Minimum measured run headroom reads/writes | 15,310 / 340 |
| Naive 80-run projection from measured maximum | 1,495,200 / 17,600 |

Timeout/unknown attempts remain charged. Liquidation-only uses zero BYK units but shares the five daily manual-coin admissions. No optional source may bypass the whole-job counter.

HTX public-risk evidence uses three sequential official requests only on a 60-minute cache miss. All three attempts are reserved atomically before transport under a hard 144-attempt UTC-day cap; a cache hit uses zero network calls.

Three full 358-contract controlled runs (`36363772673`, `36371555641`, `36371701490`) completed inside the same 34,000-read/560-write burst reservation with zero unknown operations. The latter two exact receipts came from retained sanitized artifacts, not masked logs.
