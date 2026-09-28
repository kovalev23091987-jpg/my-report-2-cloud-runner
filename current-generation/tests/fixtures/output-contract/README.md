# Output contract fixtures

These fixtures capture the effective V4 production composition before internal audit fixes:

- `canonical-publication.mjs` from final reconciliation;
- the manual, compact Telegram, display, native-liquidation and reason modules overwritten by `current-generation`.

Each JSON file contains fixed canonical input and exact rendered output. The regression test only reads these files. The initializer is deliberately one-shot and refuses to overwrite an existing fixture.

Coverage includes both directions, OBSERVE/WAIT/ENTRY/IDEA_REMOVED, full manual, exact-coin and liquidation-only modes, pump zones, and missing canonical data.
