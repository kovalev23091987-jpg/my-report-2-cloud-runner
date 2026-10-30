import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifiedSwoleRoute, normalizeSwoleMap} from '../../sources/liquidations.mjs';
import {createPumpSources} from '../../sources/index.mjs';
const root = new URL('../../../', import.meta.url);
const expiry = 1792938146287;
assert(Date.now() < expiry, 'own semantic lease expired');
globalThis.fetch = () => {throw Error('OFFLINE_ONLY_NO_PROVIDER_IO');};
const read = async p => JSON.parse(await fs.readFile(new URL(p, root), 'utf8'));
const plan = await read('pump-report/handoffs/sources/SWOLE_BTC_ONE_PROBE_PLAN_V2.json');
const route = await read('pump-report/sources/swole-btc-route-inactive-v1.json');
const registry = await read('pump-report/sources/registry-core8-retained-v1.json');
const btc = structuredClone(registry.instruments.find(e => e.instrument.base === 'BTC'));
assert.equal(plan.request.method, 'GET');
assert.equal(plan.request.url, 'https://swolecharts.com/api/liquidation-levels/BTC');
const url = new URL(plan.request.url); assert.equal(url.host, 'swolecharts.com');
assert.equal(url.pathname, '/api/liquidation-levels/BTC'); assert.equal(url.search, '');
assert.deepEqual(plan.request.query, {}); assert.equal(plan.request.max_attempts, 1);
assert.equal(plan.request.total_attempt_cap, 1); assert.equal(plan.request.automatic_retry, 0);
assert.equal(plan.request.domain_fallback, 0); assert.equal(plan.request.follow_redirects, false);
assert.equal(plan.request.timeout_ms, 10000); assert.equal(plan.request.ttl_ms, 0);
assert.equal(plan.request.maximum_response_bytes_proposed, 262144);
assert.equal(plan.request.key_required_by_public_docs, false);
assert.equal(plan.target.instrument_id, btc.instrument.instrument_id);
assert.equal(plan.broker_request_template.candidate_id, btc.instrument.instrument_id);
assert.equal(plan.broker_request_template.provider, 'SWOLECHARTS');
assert.equal(plan.broker_request_template.family, 'LIQUIDATIONS');
assert.equal(plan.broker_request_template.purpose, 'CORE');
assert.equal(plan.expected_interface.magnitude.unit, 'RELATIVE_INTENSITY');
for (const field of ['actual_field', 'scale_id', 'evidence_ref', 'absolute_USD_amount'])
  assert.equal(plan.expected_interface.magnitude[field], null);
assert.equal(plan.outcome.native_response_verified, false);
assert.equal(plan.outcome.base_idea_must_not_wait, true);
assert.equal(route.active, false); assert.equal(verifiedSwoleRoute(route, btc.instrument), false);
for (const field of ['identity_evidence_ref', 'model_evidence_ref', 'venue', 'market_id', 'price_quote', 'price_mapping'])
  assert.equal(route[field], null);
assert.throws(() => normalizeSwoleMap({}, {route, instrument: btc.instrument}),
  e => e.code === 'LIQUIDATION_ASSET_MAPPING_UNQUALIFIED');
let calls = 0; btc.liquidations.routes = [route];
const source = createPumpSources({identityRegistry: [btc], broker: {async request() {calls++; throw Error('UNEXPECTED_IO');}}});
const result = await source.getLiquidations({instrument: btc.instrument, reference_price: 100});
assert.equal(result.status, 'NOT_CHECKED'); assert.equal(result.reason, 'NO_VERIFIED_LIQUIDATION_ROUTE');
assert.equal(calls, 0);
const files = ['pump-report/handoffs/sources/SWOLE_BTC_ONE_PROBE_PLAN_V2.json',
  'pump-report/sources/swole-btc-route-inactive-v1.json', 'pump-report/handoffs/sources/qualify-swole-one-probe-plan.mjs'];
const hashes = [];
for (const path of files) {const b = await fs.readFile(new URL(path, root));
  hashes.push({path, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex')});}
assert(Date.now() < expiry);
const proof = {schema: 'PUMP_SWOLE_FINITE_PLAN_OFFLINE_QUALIFICATION_V2', status: 'PASS',
  checked_at: new Date().toISOString(), authority_main: '15bddf357cb54bfc6ee033e6140d70bcdb76270e',
  checks: ['exact one GET/no query/no redirect/no retry/10s/256KiB plan', 'same curated BTC candidate',
    'relative magnitude and unknown native fields remain explicit', 'inactive route fails existing validator and normalizer',
    'getLiquidations returns NOT_CHECKED before broker IO'],
  native_response_verified: false, actual_SOURCE_provider_HTTP: 0, actual_SOURCE_SQL: 0, actual_SOURCE_TG: 0,
  actual_provider_weight: null, actual_runtime_SQL_cost: null, old_A33_reexecuted: 0, files: hashes};
await fs.writeFile(new URL('pump-report/handoffs/sources/SWOLE_ONE_PROBE_OFFLINE_QUALIFICATION_V2.json', root), JSON.stringify(proof, null, 2) + '\n');
process.stdout.write(JSON.stringify({status: 'PASS', inactive_validator: false, source_broker_calls: calls, native_response_verified: false}) + '\n');
