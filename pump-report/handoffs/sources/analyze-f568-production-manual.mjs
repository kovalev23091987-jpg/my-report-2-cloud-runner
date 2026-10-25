// One read of the exact ROOT-authorized private capture. Console/public output
// contains hashes, counts, status/reason labels; it never contains raw values.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {reviewCapturedProductionManual} from '../../sources/captured-production-manual-review.mjs';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';

const options = {}, args = process.argv.slice(2);
for (let n = 0; n < args.length; n += 2) {
  if (!args[n]?.startsWith('--') || args[n + 1] === undefined || Object.hasOwn(options, args[n].slice(2))) throw Error('UNIQUE_KEY_VALUE_ARGUMENTS_REQUIRED');
  options[args[n].slice(2)] = args[n + 1];
}
if (Object.keys(options).some(k => !['input', 'sha256', 'bytes', 'pin', 'capture-id', 'output', 'as-of'].includes(k))) throw Error('UNKNOWN_ARGUMENT');
if (options.input !== '/private/tmp/pump-production-manual-one-reply.json'
  || !/^[a-f0-9]{64}$/.test(options.sha256 ?? '') || !/^[a-f0-9]{64}$/.test(options.pin ?? '')
  || options['capture-id'] !== 'pump-first-production-manual-20261026-one' || !options.output) throw Error('EXACT_ROOT_CAPTURE_AND_DIGEST_ARGUMENTS_REQUIRED');
const expectedBytes = Number(options.bytes);
if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > 16777216) throw Error('EXPECTED_BOUNDED_BYTES_REQUIRED');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const readPinnedJSON = (url, expectedHash) => {
  const bytes = fs.readFileSync(url);
  if (hash(bytes) !== expectedHash) throw Error('FROZEN_PUBLIC_INPUT_SHA_MISMATCH');
  return JSON.parse(bytes.toString('utf8'));
};
const expected = readPinnedJSON(new URL('./F552_PROPOSED_NATIVE_BINDINGS_550_V1.json', import.meta.url), 'a1d1d8b96f6cf7106ba4224e1fbf4fe52059f4448cc4667e0332976b692eb66c').proposals;
const negative = readPinnedJSON(new URL('./F552_KNOWN_NON_TARGET_380_V1.json', import.meta.url), '82007a6a9dd1581fcdbba5c98e63d2ff67281ed37f72373280db5f96f35c2896').decisions;
const savedNative = readPinnedJSON('/private/tmp/pump-report-native-catalog-corrected.json', '7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5').body.response.data.data;
if (fs.existsSync(options.output)) throw Error('OUTPUT_EXISTS_NO_OVERWRITE');
const stat = fs.statSync(options.input);
if (!stat.isFile() || stat.size !== expectedBytes || stat.size > 16777216) throw Error('PRIVATE_CAPTURE_LENGTH_MISMATCH');
// This is the single new private capture read. No previous F550 is opened.
const bytes = fs.readFileSync(options.input);
if (hash(bytes) !== options.sha256) throw Error('PRIVATE_CAPTURE_SHA_MISMATCH');
let capture;
try {capture = JSON.parse(bytes.toString('utf8'));} catch {throw Error('PRIVATE_CAPTURE_JSON_INVALID_NO_RAW_OUTPUT');}
const now = options['as-of'] === undefined ? Date.now() : Number(options['as-of']);
const result = await reviewCapturedProductionManual({capture, expected, negative_decisions: negative, saved_native_rows: savedNative,
  registry: createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY), as_of_ts: now, sha256: hash,
  expected_pin: options.pin, expected_capture_id: options['capture-id'], file_sha256: options.sha256, file_bytes: bytes.length});
fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({schema: result.schema, input_sha256: options.sha256, output_sha256: hash(fs.readFileSync(options.output)),
  catalog_rows: result.catalog.raw_rows, verified_crypto: result.catalog.source_qualified_crypto,
  exact_selected_members: result.catalog.current_exact_online_selected_members,
  source_unqualified_reasons: result.catalog.source_unqualified_reason_counts,
  current_dispositions: result.catalog.current_disposition_counts,
  active_unresolved: result.catalog.active_USDT_identity_unresolved_count,
  prices_at_original_receive: result.prices.at_original_receive_counts,
  bulk_price_packets: result.prices.captured_bulk_ticker_packets, selected_source_facts: result.selected_source_CORE.facts,
  core_or_analysis_recalculated: false, new_HTTP_SQL_TG: 0}));
