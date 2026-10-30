import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {DISPLAY_INFO_REQUEST_CONTRACT, createSubtleSha256,
  createAnonymousDisplayInfoRequestFactory} from '../../sources/bingx-anonymous-display-info-request.mjs';

// Independent expected vector frozen in the prior static clock-contract packet.
const AT = 1792942912381;
const DEVICE = '00000000-0000-4000-8000-000000000002';
const TRACE = '00000000-0000-4000-8000-000000000001';
const PREIMAGE = '95d65c73dc5c4370ae9018fb7f2eab6917929429123810000000000004000800000000000000100000000000040008000000000000002305.3.37{}';
const EXPECTED = '16878C74854E8BC1784A92E8A50C9D424D8757DBCCB3E58F9468A45847A5C2BC';
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const identifiers = (...values) => () => values.shift();
const options = extra => ({clock: () => AT, uuid: identifiers(DEVICE, TRACE), sha256: hash, time_zone_hours: 0, ...extra});

test('pinned anonymous exact no-query GET matches independent SHA vector and public header contract', async () => {
  const inputs = [];
  const factory = createAnonymousDisplayInfoRequestFactory(options({
    sha256: text => { inputs.push(text); return hash(text); }
  }));
  const result = await factory.build();
  assert.deepEqual(inputs, [PREIMAGE]);
  assert.equal(hash(PREIMAGE).toUpperCase(), EXPECTED);
  assert.deepEqual(result, {
    url: 'https://api-app.acc-de.com/api/coin/v1/display-info/list',
    method: 'GET',
    headers: {
      Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest',
      platformId: '30', appSiteId: '0', channel: 'official', reg_channel: 'official',
      app_version: '5.3.37', device_id: DEVICE.replace(/-/g, ''), lang: 'en',
      appId: '30004', mainAppId: '10009', timeZone: '0', device_brand: '', antiDeviceId: '',
      timestamp: String(AT), traceId: TRACE.replace(/-/g, ''), sign: EXPECTED
    }
  });
  assert.deepEqual(Object.keys(result).sort(), ['headers', 'method', 'url']);
  assert.equal(new URL(result.url).search, '');
  assert.equal(Object.keys(result.headers).some(name => /authorization|cookie|token|nonce|signature/i.test(name)), false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.headers) && Object.isFrozen(factory));
  assert.equal(DISPLAY_INFO_REQUEST_CONTRACT.app_version, '5.3.37');
});

test('injected real crypto.subtle SHA-256 supports the same request without Node code in production module', async () => {
  const sha256 = createSubtleSha256(webcrypto.subtle);
  assert.equal(await sha256(PREIMAGE), EXPECTED);
  const result = await createAnonymousDisplayInfoRequestFactory(options({sha256, time_zone_hours: 5.75})).build();
  assert.equal(result.headers.sign, EXPECTED);
  assert.equal(result.headers.timeZone, '5.75');
  await assert.rejects(createSubtleSha256({digest: async () => new ArrayBuffer(31)})('x'),
    {code: 'METADATA_SHA256_BYTES_REQUIRED'});
});

test('malformed clocks are refused before UUID generation or hash work, including seconds and microseconds', async () => {
  for (const value of [undefined, null, '1792942912381', NaN, Infinity, -1, 0, 1792942912, AT + 0.5, AT * 1000]) {
    let uuidCalls = 0, hashCalls = 0;
    const factory = createAnonymousDisplayInfoRequestFactory(options({
      clock: () => value, uuid: () => { uuidCalls++; return DEVICE; },
      sha256: () => { hashCalls++; return EXPECTED; }
    }));
    await assert.rejects(factory.build(), {code: 'METADATA_UNIX_MILLISECONDS_REQUIRED'});
    assert.equal(uuidCalls, 0);
    assert.equal(hashCalls, 0);
  }
});

test('invalid or duplicated UUIDs never produce a signed request; compact uppercase v4 is normalized', async () => {
  for (const value of [null, '', 'not-a-uuid', ' ' + DEVICE, DEVICE + '\n',
    '00000000-0000-7000-8000-000000000002', '00000000-0000-4000-7000-000000000002']) {
    let hashes = 0;
    const factory = createAnonymousDisplayInfoRequestFactory(options({
      uuid: identifiers(value, TRACE), sha256: () => { hashes++; return EXPECTED; }
    }));
    await assert.rejects(factory.build(), {code: 'METADATA_UUID_V4_REQUIRED'});
    assert.equal(hashes, 0);
  }
  await assert.rejects(createAnonymousDisplayInfoRequestFactory(options({uuid: identifiers(DEVICE, DEVICE)})).build(),
    {code: 'METADATA_DISTINCT_DEVICE_AND_TRACE_REQUIRED'});
  const good = await createAnonymousDisplayInfoRequestFactory(options({
    uuid: identifiers(DEVICE.replace(/-/g, '').toUpperCase(), TRACE.replace(/-/g, '').toUpperCase())
  })).build();
  assert.equal(good.headers.sign, EXPECTED);
});

test('dependencies, truthful timezone units and malformed hash results fail closed', async () => {
  for (const extra of [{clock: null}, {uuid: null}, {sha256: null}]) {
    assert.throws(() => createAnonymousDisplayInfoRequestFactory(options(extra)),
      {code: 'METADATA_CLOCK_UUID_HASH_REQUIRED'});
  }
  for (const value of [undefined, null, '0', NaN, Infinity, 15, -15, 1 / 61]) {
    assert.throws(() => createAnonymousDisplayInfoRequestFactory(options({time_zone_hours: value})),
      {code: 'METADATA_TIMEZONE_HOURS_REQUIRED'});
  }
  for (const value of [undefined, '', 'a'.repeat(63), 'g'.repeat(64), EXPECTED + '\n', new Uint8Array(32)]) {
    await assert.rejects(createAnonymousDisplayInfoRequestFactory(options({sha256: () => value})).build(),
      {code: 'METADATA_SHA256_HEX_REQUIRED'});
  }
  assert.throws(() => createSubtleSha256(null), {code: 'METADATA_SUBTLE_DIGEST_REQUIRED'});
});

test('anonymous device is stable per factory while each build receives a fresh timestamp and trace', async () => {
  let now = AT, calls = 0;
  const ids = identifiers(DEVICE, TRACE, '00000000-0000-4000-8000-000000000003');
  const factory = createAnonymousDisplayInfoRequestFactory(options({
    clock: () => now, uuid: () => { calls++; return ids(); }
  }));
  const first = await factory.build();
  now += 1;
  const second = await factory.build();
  assert.equal(calls, 3);
  assert.equal(first.headers.device_id, second.headers.device_id);
  assert.notEqual(first.headers.traceId, second.headers.traceId);
  assert.equal(Number(second.headers.timestamp) - Number(first.headers.timestamp), 1);
  assert.notEqual(first.headers.sign, second.headers.sign);
});

