import hashlib
import json
from pathlib import Path

p = Path(__file__).parent
d = json.loads((p / 'F560_SELECTED_COST_FUTURE_CAPACITY_V1.json').read_text())
assert hashlib.sha256((p / 'B550_BUDGET_COVERAGE_CADENCE_V1.json').read_bytes()).hexdigest() == d['reuse']['B550_arithmetic_sha256']
assert d['future_manual']['checks'] == 3
assert d['future_manual']['held_HTTP'] == 51 + 3 == 54
assert d['future_manual']['execution_upper_HTTP'] == 3 * 13 == 39
assert d['route_upper_bounds']['delivery']['BINGX'] == 2
assert 120 * 2 == d['continuity']['full_day_discovery_HTTP']
assert 10 * 12 == d['continuity']['full_day_survey_HTTP']
assert 240 + 120 + 39 + 24 == d['HTTP_full_day_examples']['execution_only']['sum'] == 423
assert 25 + 54 + 24 + 24 + 240 + 120 == d['HTTP_full_day_examples']['initial_governor_holds_example']['sum_before_current_attempt'] == 487
assert 140000 + 3 * 5000 + 120 * 5000 + 894 == d['SQL']['with_fixed_manual_known_floor']['R'] == 755894
assert 10440 + 3 * 300 + 120 * 300 + 272 == d['SQL']['with_fixed_manual_known_floor']['W'] == 47612
assert 56000 - 47612 == d['SQL']['writes_to_80pct_before_unquantified_holds'] == 8388
assert 10440 + 900 + 200 * 300 + 272 == 71612 > 70000
assert 10440 + 900 + 300 * 300 + 272 == 101612 > 70000
assert all(v == 0 for v in d['new_IO'].values())
assert d['source_runtime_changed'] is False
print('F560 selected-cost/manual3/future-capacity projection: 1 PASS, 0 FAIL; runtime suites 0; native IO 0')
