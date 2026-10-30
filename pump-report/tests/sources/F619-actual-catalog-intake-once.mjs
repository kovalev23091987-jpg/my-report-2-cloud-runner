// F619 PREPARED ONLY. One separately ROOT-admitted actual-file intake; no native/source IO.
// No fixture fallback, writer invocation, source replay, engine or registry activation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = path.join(repo, 'pump-report/handoffs/sources');
const manifestPath = 'pump-report/handoffs/sources/F619_FROZEN_DEPENDENCIES_V1.json';
const authorityPath = 'pump-report/handoffs/sources/F619_EXECUTION_AUTHORITY.json';
const admissionPath = 'checkpoints/pump-report-20261025/ROOT_F619_ACTUAL_FILE_ADMISSION.json';
const outputPath = path.join(out, 'F619_ACTUAL_METADATA_RESULT_V1.json');
const lockPath = path.join(out, 'F619_ACTUAL_INTAKE_ONCE.lock');
const privateRoot = path.join(repo, 'pump-report/.private/observations');
const sha = b => createHash('sha256').update(b).digest('hex');
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const time = x => Number.isSafeInteger(x) && x > 0;
const readBytes = p => fs.readFileSync(path.resolve(repo, p));
const read = p => JSON.parse(readBytes(p).toString('utf8'));
const require = (ok, code) => {if (!ok) throw Error(code);};
let ownsOutput = false, stage = 'EXACT_NEW_ACTUAL_FILE_ADMISSION';
const result = {schema: 'F619_ACTUAL_CATALOG_INTAKE_RESULT_V1', status: 'STARTED', Node_invocations: 1,
  consumer_calls: 0, evidence_class: null, current_global_crypto_N: null, current_global_N_proven: false,
  CORE_qualified: false, maps_qualified: false, registry_activation: 0, counts: null, review: null,
  unknown_identity_proposal_batches: [], source_HTTP: 0, native_SQL: 0, engine: 0, Telegram: 0,
  build: 0, deploy: 0, raw_body_prices_volumes_secrets_exported: false};
function save() {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', {mode: 0o600, flag: ownsOutput ? 'w' : 'wx'});
  ownsOutput = true;
}
function noInput(reason) {
  result.status = 'NO_INPUT'; result.reason = reason;
  result.completed_utc = new Date().toISOString(); save();
  process.stdout.write(JSON.stringify({status: 'NO_INPUT', reason, consumer_calls: 0, current_global_crypto_N: null}) + '\n');
}

try {
  require(process.argv.length === 3 && path.resolve(process.argv[2]) === path.resolve(repo, admissionPath), 'F619_ONE_EXACT_ADMISSION_ARGUMENT_REQUIRED');
  const admissionBytes = readBytes(admissionPath), admission = JSON.parse(admissionBytes.toString('utf8'));
  require(admission.schema === 'ROOT_F619_ACTUAL_FILE_ADMISSION_V1'
    && admission.status === 'ROOT_F619_ONE_ACTUAL_CATALOG_INTAKE_AUTHORIZED'
    && admission.Node_invocations === 1 && admission.max_consumer_calls === 1 && admission.one_use === true,
  'F619_NEW_ACTUAL_FILE_ADMISSION_REQUIRED');
  require(['source_HTTP', 'native_SQL', 'engine', 'Telegram', 'build', 'deploy'].every(k => admission[k] === 0), 'F619_OFFLINE_ONLY_ADMISSION_REQUIRED');
  require(admission.wrapper_sha256 === sha(fs.readFileSync(fileURLToPath(import.meta.url)))
    && admission.frozen_dependencies_sha256 === sha(readBytes(manifestPath)), 'F619_EXACT_ENTRY_MANIFEST_HASH_REQUIRED');
  const auth = read(authorityPath), now = Date.now();
  require(auth.authority_main === admission.authority_main && auth.own_owner === admission.own_owner
    && auth.root_owner === admission.root_owner && auth.own_expires_ts === admission.own_expires_ts
    && auth.root_expires_ts === admission.root_expires_ts && auth.all17_FULL === true && auth.all4_equal === true
    && auth.own_exact_bytes_match === true && auth.own_actual_ref_match === true && auth.owner_paused === false
    && auth.fence === false && time(auth.checked_ts) && now - auth.checked_ts >= 0 && now - auth.checked_ts <= 90000
    && now < auth.own_expires_ts && now < auth.root_expires_ts && now < admission.expires_ts,
  'F619_FRESH_COMPATIBLE_ROOT_SOURCE_FULL_REQUIRED');
  const input = admission.input, expected = admission.expected;
  require(typeof input?.path === 'string' && hex(input.sha256) && Number.isSafeInteger(input.bytes)
    && input.bytes > 0 && input.bytes <= 16777216 && hex(expected?.implementation_sha256)
    && typeof expected.capture_run_id === 'string' && /^[A-Za-z0-9:._-]{1,160}$/.test(expected.capture_run_id)
    && time(expected.as_of_ts), 'F619_EXACT_CAPTURE_FILE_PIN_ASOF_REQUIRED');
  const inputPath = path.resolve(repo, input.path);
  require(inputPath.startsWith(privateRoot + path.sep), 'F619_ROOT_OPERATOR_PRIVATE_OBSERVATION_PATH_REQUIRED');
  const manifest = read(manifestPath), cache = new Map();
  for (const f of manifest.files) {
    const b = readBytes(f.path); require(b.length === f.bytes && sha(b) === f.sha256, 'F619_FROZEN_DEPENDENCY_CHANGED'); cache.set(f.path, b);
  }
  require(process.execArgv.includes(manifest.network_guard.path)
    && sha(fs.readFileSync(manifest.network_guard.path)) === manifest.network_guard.sha256, 'F619_NETWORK_GUARD_REQUIRED');
  globalThis.fetch = async () => {throw Error('F619_REAL_HTTP_FORBIDDEN');};
  require(!fs.existsSync(outputPath), 'F619_EXISTING_RESULT_NO_RERUN');
  const fd = fs.openSync(lockPath, 'wx', 0o600);
  fs.writeFileSync(fd, 'One ROOT-admitted F619 actual-file attempt. Preserve NO_INPUT/failure; no automatic rerun.\n'); fs.closeSync(fd);
  result.admission_sha256 = sha(admissionBytes); result.actual_current_main = auth.actual_current_main;
  result.admission_parent_main = admission.authority_main; result.wrapper_sha256 = admission.wrapper_sha256;
  result.capture_expected_sha256 = input.sha256; result.capture_expected_bytes = input.bytes;

  stage = 'ONE_PINNED_ACTUAL_PRIVATE_CAPTURE';
  if (!fs.existsSync(inputPath)) {
    noInput('ADMITTED_ACTUAL_CAPTURE_FILE_NOT_PRESENT');
  } else {
    const st = fs.lstatSync(inputPath);
    require(st.isFile() && !st.isSymbolicLink() && st.size === input.bytes, 'F619_ACTUAL_CAPTURE_LENGTH_OR_TYPE_MISMATCH');
    require(fs.realpathSync(inputPath).startsWith(fs.realpathSync(privateRoot) + path.sep), 'F619_PRIVATE_REALPATH_REQUIRED');
    const captureBytes = fs.readFileSync(inputPath);
    require(sha(captureBytes) === input.sha256, 'F619_ACTUAL_CAPTURE_BYTE_SHA_MISMATCH');
    let capture; try {capture = JSON.parse(captureBytes.toString('utf8'));} catch {throw Error('F619_ACTUAL_CAPTURE_NOT_JSON_NO_RAW_OUTPUT');}
    require(capture.schema === 'PUMP_NATIVE_SAVED_AUTO_OBSERVATION_ACTUAL_V1'
      && capture.state === 'FINALIZED' && capture.native_receipt?.state === 'FINALIZED'
      && capture.native_receipt.usage?.unknown_ops === 0 && capture.finalization_unknown !== true,
    'F619_FINALIZED_ACTUAL_NATIVE_RECEIPT_REQUIRED');
    require(capture.run_id === expected.capture_run_id && capture.implementation_sha256 === expected.implementation_sha256
      && time(capture.started_ts) && time(capture.completed_ts) && capture.started_ts <= capture.completed_ts
      && capture.completed_ts <= expected.as_of_ts, 'F619_CAPTURE_RUN_PIN_CLOCK_MISMATCH');
    result.capture_sha256 = input.sha256; result.capture_bytes = captureBytes.length;
    result.capture_run_id = capture.run_id; result.native_receipt_state = 'FINALIZED';
    const observation = capture.catalog_snapshot, snapshot = observation?.private_evidence?.snapshot;
    if (snapshot == null) {
      noInput('NO_RETAINED_CATALOG_SNAPSHOT_IN_FINALIZED_ACTUAL_CAPTURE');
    } else {
      stage = 'EXACT_OBSERVED_SNAPSHOT_EXPECTATIONS';
      require(['snapshot_json_sha256', 'body_sha256', 'selected_scope_canonical_sha256',
        'negative_decisions_canonical_sha256'].every(k => hex(expected[k])) && time(expected.received_ts)
        && time(expected.saved_ts) && time(expected.observed_ts) && typeof expected.receipt_id === 'string',
      'F619_ROOT_ACTUAL_SNAPSHOT_HASH_CLOCK_EXPECTATIONS_REQUIRED');
      require(snapshot.evidence_class === 'OBSERVED' && observation.status === 'BOUND_SAVED_NATIVE_CATALOG_AT_ORIGINAL_RECEIPT'
        && observation.native_source_response_bound === true && observation.snapshot_bytes_clocks_bound === true
        && observation.implementation_bound === true && snapshot.implementation_sha256 === expected.implementation_sha256
        && snapshot.receipt_id === expected.receipt_id && snapshot.received_ts === expected.received_ts
        && snapshot.saved_ts === expected.saved_ts && observation.observed_ts === expected.observed_ts
        && capture.started_ts <= observation.observed_ts && observation.observed_ts <= capture.completed_ts,
      'F619_OBSERVED_ORIGINAL_RECEIPT_CLOCK_PIN_REQUIRED');
      require(sha(JSON.stringify(snapshot)) === expected.snapshot_json_sha256
        && sha(JSON.stringify(snapshot.body)) === expected.body_sha256, 'F619_ROOT_SNAPSHOT_BODY_DIGEST_MISMATCH');
      const load = p => import(pathToFileURL(path.resolve(repo, p)).href);
      const [{prepareCatalogSnapshotReview}, {stableCapturedJSON}, base, reactivated, usdkrw] = await Promise.all([
        load(manifest.paths.consumer), load(manifest.paths.canonical), ...manifest.negative_parts.map(p => load(p.path))]);
      const selected = JSON.parse(cache.get(manifest.paths.selected_scope).toString('utf8')).proposals;
      const negatives = [...base.NON_TARGET_BUNDLE.decisions, ...reactivated.REACTIVATED_NEGATIVE_BUNDLE.decisions,
        ...usdkrw.USDKRW_NEGATIVE_BUNDLE.decisions];
      require(selected.length === 550 && negatives.length === 434
        && sha(stableCapturedJSON(selected)) === expected.selected_scope_canonical_sha256
        && sha(stableCapturedJSON(negatives)) === expected.negative_decisions_canonical_sha256,
      'F619_EXACT_FROZEN550_COMPLETE434_REQUIRED');
      stage = 'ONE_OBSERVED_METADATA_CONSUMER';
      result.consumer_calls++;
      const review = prepareCatalogSnapshotReview({observer: capture, expected,
        selected_scope: selected, negative_decisions: negatives, sha256: sha, evidence_mode: 'OBSERVED'});
      require(review.evidence_class === 'OBSERVED_CAPTURE_REVIEW_METADATA_ONLY' && review.current_global_crypto_N === null
        && review.current_global_N_proven === false && review.new_registry_decisions === 0
        && review.prices_volumes_raw_body_exported === false, 'F619_METADATA_ONLY_CONSUMER_BOUNDARY');
      const rowKeys = new Set(['row_index', 'native_tuple', 'native_tuple_sha256', 'disposition', 'saved_decision_ref',
        'new_identity_status', 'economic_classification', 'CORE_units_maps_qualified']);
      const tupleKeys = new Set(['native_contract_id', 'symbol', 'asset', 'currency', 'status']);
      require(review.rows.every(r => Object.keys(r).every(k => rowKeys.has(k)) && r.CORE_units_maps_qualified === false
        && (r.native_tuple === null || Object.keys(r.native_tuple).every(k => tupleKeys.has(k)))), 'F619_METADATA_ALLOWLIST');
      require(sha(JSON.stringify(snapshot)) === expected.snapshot_json_sha256
        && sha(stableCapturedJSON(selected)) === expected.selected_scope_canonical_sha256
        && sha(stableCapturedJSON(negatives)) === expected.negative_decisions_canonical_sha256, 'F619_INPUT_MUTATED');
      const unknown = review.rows.filter(r => r.disposition === 'ACTIVE_USDT_IDENTITY_PROPOSAL_NOT_CHECKED');
      require(unknown.every(r => r.new_identity_status === 'PROPOSAL'
        && r.economic_classification === 'NOT_CHECKED_BY_THIS_CONSUMER'), 'F619_UNKNOWN_MUST_REMAIN_PROPOSAL');
      const batches = [];
      for (let i = 0; i < unknown.length; i += 25) batches.push({batch_index: batches.length,
        capture_sha256: input.sha256, body_sha256: expected.body_sha256,
        snapshot_json_sha256: expected.snapshot_json_sha256, rows: unknown.slice(i, i + 25)});
      require(batches.every(b => b.rows.length > 0 && b.rows.length <= 25), 'F619_FINITE_BATCH_BOUND');
      result.status = 'OBSERVED_METADATA_REVIEW_ONLY'; result.evidence_class = review.evidence_class;
      result.counts = review.counts; result.review = review; result.unknown_identity_proposal_batches = batches;
      result.completed_utc = new Date().toISOString(); save();
      process.stdout.write(JSON.stringify({status: result.status, consumer_calls: 1, capture_sha256: input.sha256,
        row_count: review.raw_catalog_rows, proposal_batches: batches.length, current_global_crypto_N: null,
        native_SQL: 0, HTTP: 0, engine: 0, Telegram: 0}) + '\n');
    }
  }
} catch (error) {
  result.status = 'REJECTED_NO_AUTOMATIC_RERUN'; result.failure_stage = stage;
  result.reason = /^[A-Z0-9_:.-]{1,160}$/.test(error?.message ?? '') ? error.message : 'PRIVATE_OR_UNBOUND_INPUT_ERROR';
  result.completed_utc = new Date().toISOString(); try {save();} catch {}
  process.stderr.write(JSON.stringify({status: result.status, stage, reason: result.reason}) + '\n'); process.exitCode = 1;
}
