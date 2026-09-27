# Consolidated post-V7 candidate

This is an additive, exact-base candidate. Production promotion is separate.
The runtime feature flag is 0 and the native-liquidation source mode is OFF.

Reconstruct a fresh decrypted or independently verified authoritative runtime:

```sh
node post-v7-consolidated/full-validation/apply-all-runtime.mjs runtime .
node post-v7-consolidated/full-validation/run-all.mjs . runtime
```

Use Node 24. The pinned gTrade SDK is installed with `npm ci --ignore-scripts`.
Candidate CI receives only the payload decryption key in the decryption step.
It receives no D1, Telegram or source-proxy credentials and performs no migrations.
Source fixtures are historical captures; synthetic timestamps are identified in tests.

The full inherited production gate retains its original eight exclusions and one
historical skip. Test adapters resolve relative imports and current fixture schema;
they preserve analytical assertions. See proof/LATEST_FULL_VALIDATION.json.

The original post-V7 and liquidation components are retained for reproducibility.
Their historical status documents and manifests are not the final release proof.
CONTENT_MANIFEST.json is the current candidate inventory.

Live source allowances, complete deployed-cycle cost, controlled smoke, natural
cycles and prospective 7–14 day calibration remain separate requirements. Scores
are not statistically validated probabilities. Strategy, Hard Gates, 35/30/20/15
weights, recipients and disabled trading execution are retained.
