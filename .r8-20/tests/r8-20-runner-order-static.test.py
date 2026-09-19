from pathlib import Path
p=Path(__file__).resolve().parents[1]/'runtime-root'/'runner-main.mjs'
s=p.read_text()
assert 'r8-20-prospective-validation-sidecar.mjs' in s
assert 'REPORT2_R8_20_PROSPECTIVE_VALIDATION_ENABLED' in s
assert 'R8_20_PROSPECTIVE_VALIDATION_GATE' in s
assert 'R8_20_PROSPECTIVE_VALIDATION_SIDECAR' in s
# Must be strictly lower priority than Early/liquidation/Telegram delivery.
idx=s.index('R8_20_PROSPECTIVE_VALIDATION_GATE')
for marker in ['V3_EARLY_PERSISTENCE_SIDECAR','V3_REALIZED_LIQUIDATION_SIDECAR','V3_LIQUIDATION_INTELLIGENCE_SIDECAR','V3_TELEGRAM_DELIVERY_SIDECAR']:
    assert s.index(marker) < idx, marker
assert s.index('R8_20_PROSPECTIVE_VALIDATION_SIDECAR') < s.index('D1_POST_CYCLE_RESERVATION_EXCEEDED')
assert 'extraRowsWritten:R820_PROSPECTIVE_VALIDATION_BUDGET.rows_written + 1' in s
assert 'REPORT2_V3_TELEGRAM_NETWORK_ENABLED' in s
print('R8_20_RUNNER_ORDER_STATIC=PASS')
