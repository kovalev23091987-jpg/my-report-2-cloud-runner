// PREPARED ONLY. Run only after ROOT admits the complete SOURCE+writer hashes.
// All broker responses below are mocks or the explicitly historical 25 Oct fixture.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPumpSources} from '../../sources/index.mjs';

const OLD_RECEIVED_TS = 1792931870932;
const OLD_RECEIPT_ID = '0320c4b0-ce38-48dc-a275-88a6770ec2b1';
const OLD_FILE_SHA256 = '7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5';
const route = '/openApi/swap/v2/quote/contracts';
const mockBody = () => ({code: 0, msg: '', data: [{contractId: 'F614-MOCK', symbol: 'F614_FIXTURE-USDT',
  asset: 'F614_FIXTURE', currency: 'USDT', status: 1}]});
function harness({body = mockBody(), hook, failure = null, received_ts = OLD_RECEIVED_TS,
  receipt_id = 'F614:MOCK:CATALOG'} = {}) {
  const requests = [], response = {ok: true, status: 200, data: body, received_ts, receipt_id, cache_hit: false};
  const broker = {request: async request => {requests.push(request); if (failure !== null) throw failure; return response;}};
  const sources = createPumpSources({broker, identityRegistry: [], clock: () => received_ts + 1000,
    ...(hook === undefined ? {} : {on_catalog_snapshot: hook})});
  return {sources, requests, response};
}
const catalog = h => h.sources.getCatalog({purpose: 'DISCOVERY'});

test('F614 default/null hooks keep the same normalized output and one fresh ttl0 request', async () => {
  const omitted = harness(), explicit = harness({hook: null});
  assert.deepEqual(await catalog(explicit), await catalog(omitted));
  for (const h of [omitted, explicit]) {
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].ttl_ms, 0);
    assert.equal(h.requests[0].purpose, 'DISCOVERY');
    assert.equal(h.requests[0].url, 'https://open-api.bingx.com' + route);
  }
});

test('F614 invalid non-null callback rejects at construction before broker IO', () => {
  let calls = 0;
  for (const hook of [false, 0, '', {}, []]) {
    assert.throws(() => createPumpSources({broker: {request: async () => {calls++;}}, identityRegistry: [],
      on_catalog_snapshot: hook}), error => error.code === 'CATALOG_SNAPSHOT_CALLBACK_INVALID');
  }
  assert.equal(calls, 0);
});

test('F614 awaits one hook, preserves original parsed body/ack/clock, and keeps output', async () => {
  let enter, release, calls = 0, envelope, settled = false;
  const entered = new Promise(resolve => {enter = resolve;});
  const barrier = new Promise(resolve => {release = resolve;});
  const h = harness({hook: async value => {calls++; envelope = value; enter(); await barrier;}});
  const before = structuredClone(h.response.data);
  const pending = catalog(h).then(value => {settled = true; return value;});
  await entered;
  assert.equal(settled, false);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(envelope).sort(), ['body', 'family', 'provider', 'receipt_id', 'received_ts', 'route', 'schema']);
  assert.equal(envelope.schema, 'PUMP_CATALOG_INGRESS_V1');
  assert.equal(envelope.provider, 'BINGX');
  assert.equal(envelope.family, 'USDT_M');
  assert.equal(envelope.route, route);
  assert.equal(envelope.received_ts, h.response.received_ts);
  assert.equal(envelope.receipt_id, h.response.receipt_id);
  assert.strictEqual(envelope.body, h.response.data);
  release();
  assert.deepEqual(await pending, await catalog(harness()));
  assert.deepEqual(h.response.data, before);
  assert.equal(h.requests.length, 1);
});

test('F614 a writer SKIPPED return keeps source output; writer SQL bounds require ROOT cases', async () => {
  let metadata;
  const h = harness({hook: async () => (metadata = {status: 'SKIPPED', reason: 'MOCK_ROOT_BOUND_CHECK'})});
  assert.deepEqual(await catalog(h), await catalog(harness()));
  assert.equal(metadata.status, 'SKIPPED');
  assert.equal(h.requests.length, 1);
});

test('F614 native callback error preserves the original rejection object', async () => {
  const error = Object.assign(new Error('MOCK_NATIVE_UNKNOWN'), {code: 'NATIVE_SQL_UNKNOWN', unknown_ops: 1});
  const h = harness({hook: async () => {throw error;}});
  await assert.rejects(() => catalog(h), rejected => rejected === error);
  assert.equal(h.requests.length, 1);
});

test('F614 unknown callback error preserves the original rejection object', async () => {
  const error = new Error('MOCK_WRITER_FAILURE');
  const h = harness({hook: async () => {throw error;}});
  await assert.rejects(() => catalog(h), rejected => rejected === error);
});

test('F614 callback non-Error rejection is not converted to source coverage or zero', async () => {
  const sentinel = {kind: 'MOCK_UNCLASSIFIED_REJECTION'};
  let caught = false;
  try {await catalog(harness({hook: async () => {throw sentinel;}}));}
  catch (error) {caught = true; assert.strictEqual(error, sentinel);}
  assert.equal(caught, true);
});

test('F614 existing network error remains source coverage ERROR and does not call the hook', async () => {
  let calls = 0;
  const h = harness({failure: Object.assign(new Error('MOCK_NETWORK_FAILURE'), {code: 'MOCK_NETWORK_FAILURE'}),
    hook: async () => {calls++;}});
  const answer = await catalog(h);
  assert.equal(answer.coverage.status, 'ERROR');
  assert.equal(answer.coverage.reason, 'MOCK_NETWORK_FAILURE');
  assert.equal(calls, 0);
});

test('F614 existing budget refusal remains NOT_CHECKED and does not call the hook', async () => {
  let calls = 0;
  const h = harness({failure: Object.assign(new Error('MOCK_BUDGET_EXHAUSTED'), {code: 'MOCK_BUDGET_EXHAUSTED'}),
    hook: async () => {calls++;}});
  const answer = await catalog(h);
  assert.equal(answer.coverage.status, 'NOT_CHECKED');
  assert.equal(calls, 0);
});

test('F614 nonzero code with array keeps old source refusal and never snapshots', async () => {
  let calls = 0;
  const h = harness({body: {code: 999, data: []}, hook: async () => {calls++;}});
  const answer = await catalog(h);
  assert.equal(answer.coverage.reason, 'BINGX_SUCCESS_ENVELOPE_REQUIRED');
  assert.equal(calls, 0);
});

test('F614 malformed catalog array keeps old source refusal and never snapshots', async () => {
  let calls = 0;
  const h = harness({body: {code: 0, data: {}}, hook: async () => {calls++;}});
  const answer = await catalog(h);
  assert.equal(answer.coverage.reason, 'BINGX_CATALOG_ARRAY_REQUIRED');
  assert.equal(calls, 0);
});

test('F614 old 25 Oct 1278-row fixture stays historical and is not latest1294/249 proof', async () => {
  const bytes = await readFile(new URL('../../.private/evidence/pump-report-native-catalog-corrected.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), OLD_FILE_SHA256);
  const original = JSON.parse(bytes).body.response;
  assert.equal(original.received_ts, OLD_RECEIVED_TS);
  assert.equal(original.receipt_id, OLD_RECEIPT_ID);
  assert.equal(original.data.code, 0);
  assert.equal(original.data.data.length, 1278);
  let snapshot;
  const options = {body: original.data, received_ts: original.received_ts, receipt_id: original.receipt_id};
  const h = harness({...options, hook: async value => {snapshot = value;}});
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(await catalog(h)), digest(await catalog(harness(options))));
  assert.ok(snapshot.body === original.data, 'historical parsed body reference changed');
  assert.equal(snapshot.received_ts, OLD_RECEIVED_TS);
  assert.equal(snapshot.receipt_id, OLD_RECEIPT_ID);
});
