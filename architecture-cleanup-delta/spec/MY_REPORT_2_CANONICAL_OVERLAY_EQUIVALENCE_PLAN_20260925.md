# MY REPORT 2 — CANONICAL OVERLAY EQUIVALENCE PLAN — 2026-09-25

Architecture Cleanup v1 stops adding full `worker.js` copies to new DELTAs. Historical Unified and Free Sources packages remain immutable evidence.

The candidate contains one `canonical-final-overlay` with exactly one final worker copy. Candidate CI reconstructs the production runtime twice:

1. Sequential reference: production overlays -> Unified -> Free Sources V4 -> Architecture Cleanup v1.
2. Canonical path: production overlays -> canonical-final-overlay once.

CI hashes every top-level `src` file in both runtimes. Any byte mismatch fails. The canonical runtime alone is then used for inherited regression, Telegram/TZ10.1 and focused Architecture Cleanup tests.

This proves layer precedence and no feature loss without deleting historical evidence.
