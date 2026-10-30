import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseRecentTrades} from '../../sources/recent-trades.mjs';

// Offline-only exact captured input. Export metadata, never market values/raw.
const input = process.argv[2], output = process.argv[3];
const expected = '0170bba73bc1fd2d56796d2c448258f6192a8c8fb612ab438d4f3d017de60e07';
try {
  if (!input || !output) throw Error('EXACT_INPUT_OUTPUT_REQUIRED');
  const bytes = fs.readFileSync(input), hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (hash !== expected || bytes.length !== 1186568) throw Error('EXACT_CAPTURE_HASH_REQUIRED');
  let capture; try { capture = JSON.parse(bytes); } catch { throw Error('CAPTURE_JSON_INVALID'); }
  if (capture.body?.schema !== 'PUMP_SOURCE_FEASIBILITY_ACTUAL_V1') throw Error('EXACT_CAPTURE_SCHEMA_REQUIRED');
  const raw = capture.body.raw_responses?.[0], response = raw?.response;
  if (response?.receipt_id !== '41da702e-03f3-49fd-a095-4808a88fe670' || response.status !== 200
    || response.received_ts !== 1792958218994 || !response.ok) throw Error('EXACT_TRADE_RECEIPT_REQUIRED');
  const registry = JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json', import.meta.url)));
  const sol = registry.instruments.find(x => x.instrument.base === 'SOL');
  const parsed = parseRecentTrades(response.data, {instrument: sol.instrument, received_ts: response.received_ts});
  const times = parsed.value.map(x => x.event_ts).filter(Number.isSafeInteger);
  const result = {schema: 'SOURCE_F553_ACTUAL1000_ANALYSIS_V1', input_sha256: hash, input_bytes: bytes.length,
    receipt_id: response.receipt_id, http_status: response.status, business_code: response.data.code,
    received_ts: response.received_ts, latency_ms: response.latency_ms, fetch_response_body_bytes: response.body_bytes,
    fetch_response_body_bytes_basis: response.body_bytes_basis, wire_bytes: response.wire_bytes ?? null,
    source_status: 'SUCCESS', normalized_status: parsed.qualified ? 'QUALIFIED_SAMPLE' : 'INCOMPLETE',
    reason: parsed.reason, normalized_rows: parsed.value.length, qualified: parsed.qualified,
    qualified_event_ts: parsed.event_ts, coverage: parsed.coverage,
    retained_row_time_min: times.length ? Math.min(...times) : null,
    retained_row_time_max: times.length ? Math.max(...times) : null,
    no_price_quantity_or_raw_values_exported: true, native_calls_executed: 0,
    full_CORE_assessed: false, optional_failure_blocks_CORE: false};
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(JSON.stringify({status: result.normalized_status, rows: result.normalized_rows,
    qualified: result.qualified, invalid_id: result.coverage.invalid_id}) + '\n');
} catch (error) {
  const safe = /^[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : 'OFFLINE_ANALYSIS_FAILED';
  process.stderr.write(safe + '\n'); process.exitCode = 1;
}
