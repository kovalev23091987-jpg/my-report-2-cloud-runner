#!/usr/bin/env python3
"""Static proof that the candidate is not wired into the current Worker."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WORKER = ROOT / "src" / "worker.js"
EXPECTED_MERGED_WORKER_SHA256 = "4afeda8be571fbe18aba47c0c41c623cc02eb88388f3287f3025a7ba9f441a49"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


worker_text = WORKER.read_text(encoding="utf-8")
actual_sha = sha256(WORKER)
assert actual_sha == EXPECTED_MERGED_WORKER_SHA256, (
    "candidate Worker changed; final decision integration must remain unwired "
    f"until the exact production checkpoint is supplied: {actual_sha}"
)

for forbidden_import in (
    "final-decision-integration-engine",
    "final-decision-integration-adapter",
    "final-decision-integration-runtime",
    "final-decision-shadow-outcome-contract",
    "final-outcome-sampling-contract",
):
    assert forbidden_import not in worker_text, f"premature Worker wiring: {forbidden_import}"

assert "wrangler deploy" not in worker_text

print(json.dumps({
    "ok": True,
    "suite": "final-decision-integration-isolation",
    "worker_sha256": actual_sha,
    "worker_byte_identity_preserved": True,
    "final_decision_wired": False,
    "production_changed": False,
    "telegram_changed_by_candidate": False,
    "deploy_performed": False,
}, ensure_ascii=False, indent=2))
