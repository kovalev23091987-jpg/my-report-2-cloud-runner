"""Administrative saved JSON/CSV export. Never executes/imports JS or native IO."""
from pathlib import Path
import collections, csv, datetime, hashlib, json, re

OUT = Path(__file__).resolve().parent
REPO = OUT.parents[3]
PUMP = REPO / 'pump-report'
decoder = json.JSONDecoder()
sources = []

def sha(b):
    return hashlib.sha256(b).hexdigest()

def record(path, expected_blob=None, scope='PUBLIC_SOURCE_OR_SAFE_PROJECTION'):
    p = REPO / path
    b = p.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
    if expected_blob is not None and blob != expected_blob:
        raise ValueError('LOCAL_VS_FRESH_MAIN_SOURCE_DIFF:' + path)
    sources.append(dict(path=path, sha256=sha(b), git_blob_sha=blob, bytes=len(b), scope=scope))
    return b.decode()

pins = json.loads((OUT / 'INPUT_GIT_BLOBS_V1.json').read_text())
texts = {v['path']: record(v['path'], v['git_blob']) for v in pins['inputs']}

def literal(path, name):
    s = texts['pump-report/' + path]
    m = re.search(r'export const ' + name + r'\s*=\s*(?:Object.freeze\(\s*)?', s)
    if m is None:
        raise ValueError('STATIC_JSON_LITERAL_NOT_FOUND:' + name)
    return decoder.raw_decode(s, m.end())[0]

packet_path = 'pump-report/.private/observations/magma-saved-strategy-audit.full.json'
# Extract ONLY the explicitly authorized saved_catalog field. Other original
# analyses/recipient/private fields are never decoded, copied or exported.
packet = record(packet_path, scope='HASH_CONTAINER_AND_DECODE_SAVED_CATALOG_FIELD_ONLY')
m = re.search(r'"saved_catalog"\s*:', packet)
i = m.end()
while packet[i].isspace():
    i += 1
capture = decoder.raw_decode(packet, i)[0]
if capture['status'] != 'BOUND_SAVED_NATIVE_CATALOG_AT_ORIGINAL_RECEIPT' or not capture['snapshot_bytes_clocks_bound'] or not capture['native_source_response_bound']:
    raise ValueError('BOUND_SAVED_CATALOG_REQUIRED')
snapshot = capture['private_evidence']['snapshot']
rows = snapshot['body']['data']
if len(rows) != 1311 or snapshot['row_count'] != len(rows):
    raise ValueError('EXACT_SAVED_CATALOG_ROWS_REQUIRED')

retained = literal('registry/index.mjs', 'BINGX_IDENTITY_REGISTRY')
reviewed = literal('registry/native-reviewed550-data.mjs', 'REVIEWED_ROWS')
coin_rows = literal('sources/native-coin-unit-reviewed-data.mjs', 'NATIVE_COIN_REVIEWED_ROWS')
coin_ref = literal('sources/native-coin-unit-reviewed-data.mjs', 'NATIVE_COIN_REVIEW_REF')
coin_sha = literal('sources/native-coin-unit-reviewed-data.mjs', 'NATIVE_COIN_REVIEW_SHA256')
entries = {e['instrument']['native_symbol']: dict(e, registry_scope='RETAINED13') for e in retained}
for cid, base, symbol, proposal, decision in reviewed:
    entries[symbol] = dict(native_contract_id=cid, native_base=base, registry_scope='REVIEWED539_PRICE_RELATIVE_ONLY',
        instrument=dict(instrument_id='BINGX:USDT_M:' + cid + ':' + symbol, asset_id='BINGX_UNDERLYING:' + base,
            native_symbol=symbol, base=base, venue='BINGX', market_type='PERPETUAL', quote='USDT', settle='USDT', margin='USDT',
            identity_evidence_ref='ROOT_F552_NATIVE_SCOPE_REVIEW:sha256:' + decision), qualifications={},
        identity_original_catalog_received_ts=1792931870932)
coins = {r[3]: r for r in coin_rows}
negative = {}
for path, name in [('registry/native-nontarget380-data.mjs', 'NON_TARGET_BUNDLE'),
                   ('registry/native-reactivated53-data.mjs', 'REACTIVATED_NEGATIVE_BUNDLE'),
                   ('registry/native-usdkrw1-data.mjs', 'USDKRW_NEGATIVE_BUNDLE')]:
    for d in literal(path, name)['decisions']:
        t = d['native_tuple']
        negative[(t['native_contract_id'], t['symbol'], t['asset'], t['currency'], t['status'])] = d

counts = collections.Counter()
symbols = collections.Counter(r.get('symbol') for r in rows)
inventory = []
pending = []
unclassified = []
for index, row in enumerate(rows):
    symbol, asset, currency, status = (row.get(k) for k in ['symbol', 'asset', 'currency', 'status'])
    cid = str(row.get('contractId', ''))
    e = entries.get(symbol)
    exact = bool(e and cid == e['native_contract_id'] and asset == e['instrument']['base'])
    neg = negative.get((cid, symbol, asset, currency, status))
    if not isinstance(symbol, str) or not symbol or symbols[symbol] != 1:
        disposition = 'INVALID_OR_DUPLICATE'
    elif not symbol.endswith('-USDT') or currency != 'USDT':
        disposition = 'NON_USDT'
    elif type(status) is not int or status != 1:
        disposition = 'INACTIVE'
    elif asset in ['PAXG', 'XAUT'] or symbol in ['PAXG-USDT', 'XAUT-USDT']:
        disposition = 'OWNER_GOLD_EXCLUDED'
    elif neg and e:
        disposition = 'IDENTITY_CONFLICT_HOLD'
    elif neg:
        disposition = 'KNOWN_NON_TARGET_EXACT_TUPLE'
    elif not e:
        disposition = 'UNCLASSIFIED_HOLD'
    elif not exact:
        disposition = 'IDENTITY_MISMATCH_HOLD'
    else:
        disposition = 'KNOWN_CRYPTO'
    known = disposition == 'KNOWN_CRYPTO'
    delivery = known and symbol not in ['BTC-USDT', 'ETH-USDT']
    instrument_id = e['instrument']['instrument_id'] if exact else ''
    unit_ref = ''
    if exact and e['qualifications'].get('orderbook'):
        unit_ref = e['qualifications']['orderbook']['evidence_ref']
    elif exact and instrument_id in coins:
        c = coins[instrument_id]
        if c[:3] == [cid, asset, symbol] and c[4] == e['instrument']['asset_id']:
            unit_ref = coin_ref + '#' + c[5]
    elif exact and symbol == 'APT-USDT' and cid == '100164' and asset == 'APT':
        unit_ref = 'checkpoints/pump-report-20261025/ROOT_F559_APT_EXECUTION_UNIT_REVIEW.json'
    deep = delivery and bool(unit_ref)
    if delivery:
        counts['delivery_eligible'] += 1
        counts['deep_unit_eligible' if deep else 'unit_pending'] += 1
        if not deep:
            pending.append(symbol)
    if disposition == 'UNCLASSIFIED_HOLD':
        unclassified.append(symbol)
    counts[disposition] += 1
    profile = ('CRYPTO_WITH_UNIT_PROOF' if unit_ref else 'CRYPTO_UNIT_HOLD') if known else ('HOLD_IDENTITY' if 'HOLD' in disposition else 'OUT_OF_TARGET_AT_SAVED_CAPTURE')
    inventory.append(dict(catalog_row=index, native_symbol=symbol, native_contract_id=cid, native_asset=asset,
        settlement=currency, native_status=status, disposition=disposition, exact_positive_registry_tuple=exact,
        instrument_id=instrument_id, asset_id=e['instrument']['asset_id'] if exact else '',
        identity_ref=e['instrument']['identity_evidence_ref'] if exact else (neg['decision_id'] if neg else ''),
        identity_original_received_ts=e.get('identity_original_catalog_received_ts') if exact else (neg['proof'].get('catalog_original_received_ts') if neg else None),
        registry_scope=e['registry_scope'] if exact else '', delivery_eligible=delivery, deep_unit_eligible=deep,
        native_coin_unit_ref=unit_ref, semantic_profile=profile, saved_observation_ref='OBS_' + symbol.split('-')[0] if symbol in ['MAGMA-USDT', 'SOPH-USDT', 'IDOL-USDT'] and exact else '',
        current_CORE_proven=False, catalog_received_ts=snapshot['received_ts']))

expected = dict(KNOWN_CRYPTO=549, delivery_eligible=547, deep_unit_eligible=538, unit_pending=9,
    UNCLASSIFIED_HOLD=40, NON_USDT=49, INACTIVE=237, OWNER_GOLD_EXCLUDED=2, KNOWN_NON_TARGET_EXACT_TUPLE=434)
reconciliation = dict(derived_counts=dict(counts), expected_saved_summary=expected,
    counts_match=all(counts[k] == v for k, v in expected.items()), unique_native_symbols=len(symbols),
    raw_rows=len(rows), exclusive_dispositions_total=sum(counts[k] for k in ['KNOWN_CRYPTO','UNCLASSIFIED_HOLD','NON_USDT','INACTIVE','OWNER_GOLD_EXCLUDED','KNOWN_NON_TARGET_EXACT_TUPLE']),
    unit_pending_symbols=sorted(pending), active_unclassified_symbols=sorted(unclassified),
    registry_missing_from_snapshot=sorted(set(entries) - set(symbols)),
    original_run_catalog_receipt='a64a3b55-3b9f-466f-a003-ab13cbcb76a3', original_run_catalog_received_ts=1793343647956,
    original_bulk_price_receipt='44df4ada-11b4-49d6-9db6-aa4b64fab572', aggregate_price_expected=547, aggregate_price_checked=547,
    original_run_and_later_catalog_receipts_are_same=False,
    bulk_price_per_tuple_attribution='NOT_RECONSTRUCTED_FROM_AGGREGATE_COUNTERS', current_global_crypto_N=None,
    current_CORE_all=False, current_538_fresh_CORE_claim=False)
if not reconciliation['counts_match'] or reconciliation['exclusive_dispositions_total'] != len(rows):
    raise ValueError('CATALOG_RECONCILIATION_FAILED')

audit = json.loads(texts['checkpoints/pump-report-20261025/ROOT_RECENT_THREE_SIGNAL_STRATEGY_AUDIT_V1.json'])
observations = {}
for s in audit['signals']:
    facts = [{k: f.get(k) for k in ['kind','status','reason','event_ts','received_ts','expires_ts','used_fact_id','received_before_analysis']} for f in s['source_facts']]
    observations['OBS_' + s['symbol'].split('-')[0]] = dict(native_symbol=s['symbol'], instrument_id=s['instrument_id'],
        analysis_msk=s['analysis_msk'], source_projection='checkpoints/pump-report-20261025/ROOT_RECENT_THREE_SIGNAL_STRATEGY_AUDIT_V1.json#signals/' + s['symbol'],
        facts=facts, current_validity='HISTORICAL_EXPIRED_NOT_REFRESHED',
        actual_unit_headers_in_this_safe_fact_projection=None,
        unit_header_limitation='Safe source_facts omits unit headers; use semantic profiles as evidence prerequisites, never invent missing observed units.',
        funding_observed_unit=s.get('funding',{}).get('unit') if s.get('funding') else None,
        funding_observed_period_ms=s.get('funding',{}).get('value',{}).get('period_ms') if s.get('funding') else None,
        OI=s['open_interest'], future_map=dict(status=s['liquidations']['status'],reason=s['liquidations']['reason'],qualified_route_count=0))

common = dict(price=dict(role='MANDATORY', expected_unit='USDT_PER_NATIVE_BASE', evidence='EXACT_IDENTITY_PLUS_SAVED_NORMALIZER_CONTRACT', actual='NOT_CHECKED_PER_TUPLE_AT_CATALOG_RECEIPT', event_clock='ACTUAL_NATIVE_EVENT_REQUIRED',ttl_ms=30000),
    candles=dict(role='MANDATORY_CLOSED_GROWTH_AND_MOVEMENT', semantic_proof='OWNER_APPROVED_CCXT_OPEN_TIME_AND_SAME_NATIVE_FIELD', unit='OHLC_USDT_NATIVE_REPORTED_QUANTITY', native_quantity_unit='UNKNOWN', actual='NOT_CHECKED_FOR_THIS_INVENTORY', ttl_ms=90000, independent_vendor_time_guarantee=False),
    volume=dict(role='MANDATORY', comparison='SAME_NATIVE_REPORTED_QUANTITY_WITH_MATCHED_5M_SEED_AND_1H_BASELINE', absolute_BASE_or_USDT_amount_qualified=False, actual='NOT_CHECKED_FOR_THIS_INVENTORY'),
    growth24h=dict(role='CONDITIONAL_ALTERNATIVE_GROWTH_PROOF_NOT_UNIVERSAL_REQUIRED_HISTORY', route='CLOSED_KLINES_EXACT24H', rolling_ticker_is_not_exact_proof=True, actual='NOT_CHECKED_FOR_THIS_INVENTORY'),
    orderbook=dict(role='MANDATORY_LIQUIDITY', semantic_proof='ROW_NATIVE_COIN_UNIT_REF_REQUIRED', expected_unit='USDT_PRICE_BASE_QUANTITY',actual='NOT_CHECKED_FOR_THIS_INVENTORY', native_event_and_two_sided_COIN_arrays_required=True, ttl_ms=15000),
    plan=dict(role='MANDATORY', actual='NOT_ANALYZED_IN_F701', static_unit_or_overlay_does_not_prove_plan=True),
    trades=dict(role='OPTIONAL', semantics='UNIQUE_RECENT_EXECUTIONS_QUOTE_USDT_WITH_AGGRESSOR_PROOF', actual='NOT_CHECKED_FOR_THIS_INVENTORY', ttl_ms=30000, window_ms=30000),
    funding=dict(role='OPTIONAL', semantic_proof='REVIEWED_FUNDING_QUOTE_PROFILE_ADAPTER_BASED_INFERENCE', expected_unit='RATE_FRACTION_PER_ACTUAL_PERIOD', clock='SOURCE_UPDATE_TIME_NOT_RECEIPT_REBIRTH;ACTUAL_PERIOD_REQUIRED', actual='NOT_CHECKED_FOR_THIS_INVENTORY', ttl_ms=300000),
    open_interest=dict(role='OPTIONAL', semantic_proof='HOLD_NATIVE_UNIT_MULTIPLIER_AND_CLOCK_PROOF', actual='NOT_CHECKED', current_requests=0),
    future_liquidations=dict(role='OPTIONAL_NONBLOCKING', actual='NOT_CHECKED_NO_QUALIFIED_ROUTE', qualified_routes=0, empty_routes_is_not_UNSUPPORTED=True),
    precision_multiplier=dict(actual='UNKNOWN_NOT_TRADING', tick_step_or_contract_multiplier_not_inferred=True))
profiles = dict(CRYPTO_WITH_UNIT_PROOF=dict(facts=common, scope='Saved semantic eligibility only; actual whole CORE unproven'),
    CRYPTO_UNIT_HOLD=dict(facts=common, override=dict(orderbook='HOLD_NATIVE_CORE_UNIT_EVIDENCE_REQUIRED', deep_IO='DEFERRED;DISCOVERY_NOT_EXCLUDED')),
    HOLD_IDENTITY=dict(all_mandatory_optional='HOLD_EXACT_IDENTITY_BEFORE_FACT_ATTRIBUTION', unsupported_claimed=False),
    OUT_OF_TARGET_AT_SAVED_CAPTURE=dict(all_mandatory_optional='OUT_OF_SCOPE_AT_SAVED_RECEIPT_NOT_UNSUPPORTED'))
metadata = dict(schema='F701_SAVED_PER_INSTRUMENT_COVERAGE_V1', authority_main=pins['authority_main'],
    basis='DERIVED_STATIC_EXACT_TUPLE_JOIN_OF_ONE_BOUND_SAVED_CATALOG_AND_FRESH_MAIN_SAVED_PROOFS_NOT_RUNTIME_REPLAY',
    inventory_file='F701_COVERAGE_1311.csv', rows=len(inventory), profiles=profiles, historical_observations=observations,
    catalog=dict(exact_private_container_sha256=sources[-1]['sha256'], authorized_field='saved_catalog.private_evidence.snapshot',
        body_sha256_original_reported=snapshot['body_sha256'], body_hash_basis='EXISTING_SAVED_READER_BOUND_ACK;NOT_REBUILT_JS_JSON_STRINGIFY',
        received_ts=snapshot['received_ts'], saved_ts=snapshot['saved_ts'], observed_ts=capture['observed_ts'], source_event_ts=None,
        received_MSK=datetime.datetime.fromtimestamp(snapshot['received_ts']/1000,datetime.timezone(datetime.timedelta(hours=3))).isoformat(),
        original_producer_pin=snapshot['implementation_sha256'], receipt_id=snapshot['receipt_id'], native_source_response_bound=True,
        no_current_membership_or_live_freshness_claim=True), reconciliation=reconciliation,
    source_files=sources, fact_profiles_are_not_native_receipts=True, full_CORE_539_overlay_promoted=False,
    current_OI_request_count=0, current_future_map_route_count=0, provider_or_native_IO=0, Node_import_tests=0,
    budget_reset=False, protected_pauses=9, OWNER_deferrals=2)
fields = list(inventory[0])
with (OUT/'F701_COVERAGE_1311.csv').open('w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(inventory)
metadata['inventory_sha256']=sha((OUT/'F701_COVERAGE_1311.csv').read_bytes())
(OUT/'F701_MATRIX_METADATA_V1.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
(OUT/'F701_RECONCILIATION_V1.json').write_text(json.dumps(reconciliation,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(rows=len(inventory),counts=dict(counts),counts_match=reconciliation['counts_match'],
    inventory_bytes=(OUT/'F701_COVERAGE_1311.csv').stat().st_size,inventory_sha256=metadata['inventory_sha256'],
    metadata_bytes=(OUT/'F701_MATRIX_METADATA_V1.json').stat().st_size,received_MSK=metadata['catalog']['received_MSK']),ensure_ascii=False))
