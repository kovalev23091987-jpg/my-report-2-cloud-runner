# Owner amendment: Nansen deferred

Owner instruction received 2026-10-05: continue the current completion without Nansen. Nansen may be checked separately after its provider access and durable admission are actually available.

Current completion policy:

- make zero new Nansen HTTP requests and do not wait for a Nansen quota or access reset;
- do not treat the deferral, a denied request, or a missing route as a useful N05 fact;
- N05 may close without Nansen only from an exact, complete four-hour HTX futures taker-flow window built from 240 verified one-minute raw-fill buckets for the same contract;
- HTX futures flow is market-flow context, not labelled token deposits or withdrawals, not an independent upstream vote, and contributes zero score and no entry authorization;
- if neither exact Nansen flow nor exact HTX four-hour flow exists, N05 stays open honestly;
- do not change the 70-point threshold, strategy weights, entry rules, source quotas, manual reserve, canonical form, or Telegram admission;
- preserve Nansen code and durable receipts for a later separate check; do not reset counters, retime stale data, or substitute another provider under the Nansen identity.

This amendment removes Nansen as a blocker. It does not waive factual source-to-consumer acceptance for N05 or any other core block.
