# Daily acceptance bound to the current runtime

The scheduled isolated acceptance run 36739966625 failed before its offline or market cycle: its worker pin still pointed to `59a68f1c...`, while the assembled current worker was `85aeb64c...`. Production run 36742666646 completed successfully. This failure was not evidence of provider quota exhaustion or unavailable market data.

The isolated workflow now imports its generation and expected worker hash from the authoritative production workflow in the same checkout. The binding verifies the root generation pointer, generation manifest and checked-in worker against that independent pin, then verifies the assembled worker. It refuses ambiguous pins, generation drift and changed runtime bytes; it never computes the expected pin from the assembled bytes. The source-role CI exercises the exact assembled binding and the existing complete offline gate.

The isolated receipt also records the actual fetched production base instead of an obsolete hard-coded commit. Nansen and VYX receive the existing secret references already used by production, so the daily isolated run can exercise the current source configuration. Existing schedules, isolation, delivery switches, provider budgets, scoring and worker bytes are unchanged. This repair does not start another market or statistics campaign. Passing offline CI establishes the build repair; a future scheduled market cycle must still report its own outcome.

Original missing-data boundaries remain explicit: exact unlock schedules, purpose-bound buybacks, unsupported identity/sector mappings and absent complete historical windows cannot be inferred from substitutes. These are not marked complete by this workflow repair.
