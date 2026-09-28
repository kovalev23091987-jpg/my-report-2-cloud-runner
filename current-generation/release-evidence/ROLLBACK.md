# Rollback

- Code rollback target: production base `2d0a80d93bc67b8a79b5d2609bdf83128be7a1ba` until a newer production release is explicitly recorded.
- Switch rollback: set `ANALYTICS_ENABLED=0`, `PUBLIC_COLLECTOR_ENABLED=0`, `DELIVERY_ENABLED=0`, `CALIBRATION_APPLY_ENABLED=0` as needed; invalid values fail closed.
- Do not delete additive D1 tables or rewrite outcome/history rows during rollback.
- Do not restore the contract-lifetime liquidation queue or twenty-row predictive activation.
- Restore only a manifest-pinned generation with one periodic analytics owner and passing frozen output tests.
