import assert from 'node:assert/strict';
import { persistFinalDecisionIntegrationShadow } from '../src/final-decision-integration-runtime.mjs';
import { completeInput, NOW } from './final-decision-integration-fixtures.mjs';

function ack(changes) {
  return {
    success: true,
    results: [],
    meta: {
      changes,
      rows_read: 1,
      rows_written: changes,
      changed_db: changes > 0,
      total_attempts: 1,
      served_by_primary: true,
    },
  };
}

const originalNow = Date.now;
Date.now = () => NOW;
try {
  for (const [changes, expected] of [[1, 'CLOSED'], [0, 'NO_COMMIT_FAIL_CLOSED']]) {
    let sql = '';
    let params = null;
    let runs = 0;
    const env = {
      DATA_DB: {
        prepare(source) {
          sql = source;
          return {
            bind(...bound) {
              params = bound;
              return {
                async run() {
                  runs += 1;
                  return ack(changes);
                },
              };
            },
          };
        },
      },
    };
    const input = completeInput('LONG');
    const result = await persistFinalDecisionIntegrationShadow({
      env,
      input,
      require_exact_insert_ack: true,
      expected_position_cas: {
        contract_code: input.contract_code,
        state: input.position.state,
        state_revision: input.position.state_revision,
      },
    });
    assert.equal(result.status, expected);
    assert.equal(result.statements, 1);
    assert.equal(runs, 1);
    assert.match(sql, /WHERE EXISTS\s*\(\s*SELECT 1 FROM shadow_virtual_position_ledger/s);
    assert.match(sql, /contract_code=\?52 AND state=\?53 AND state_revision=\?54/);
    assert.equal(params.length, 54);
    assert.deepEqual(params.slice(-3), [input.contract_code, 'FLAT', 1]);
    assert.equal(result.position_cas_bound, true);
    assert.equal(result.exact_insert_ack_required, true);
    if (changes === 0) {
      assert.equal(result.commit_state, 'NOT_COMMITTED');
      assert.equal(result.idempotent_duplicate, false);
    }
  }

  // Invalid CAS never reaches D1.
  let prepared = 0;
  const env = { DATA_DB: { prepare() { prepared += 1; throw new Error('should not prepare'); } } };
  const input = completeInput('LONG');
  const invalid = await persistFinalDecisionIntegrationShadow({
    env,
    input,
    require_exact_insert_ack: true,
    expected_position_cas: { contract_code: input.contract_code, state: 'UNKNOWN', state_revision: 1 },
  });
  assert.equal(invalid.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(invalid.statements, 0);
  assert.equal(prepared, 0);
} finally {
  Date.now = originalNow;
}

console.log(JSON.stringify({
  ok: true,
  suite: 'stage392-final-decision-cas',
  final_decision_statements: 1,
  position_cas_in_same_statement: true,
  zero_row_ack_fail_closed: true,
}));
