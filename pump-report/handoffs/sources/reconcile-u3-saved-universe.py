"""U3: local saved-data scope selection; no network, runtime import or prices."""
import collections
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKOUT = HERE.parents[2]
TZ = '0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc'
INPUTS = {
    'native': (Path('/private/tmp/pump-report-native-catalog-corrected.json'),
               '7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5'),
    'metadata': (Path('/private/tmp/pump-corrected-metadata-actual.json'),
                 '66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9'),
    'root_selection': (CHECKOUT / 'checkpoints/pump-report-20261025/ROOT_CRYPTO_SCOPE_SELECTION_934_V1.json',
                       'c5286f9c3fc173c03d20da3f5d4a229f5b1693d385b865b190b7baa522567d1f'),
    'api_core': (Path('/private/tmp/bingx-taxonomy-static-api-core.js'),
                 '0637057d5eaaf7c03ed912f0984aded646b0659bc39ff106b9a7ca70df259e89'),
    'api_plugin': (Path('/private/tmp/bingx-full-universe-api-plugin.js'),
                   '0a0aa922b666b7de45f663afa3e63b192d9c3acdbc9e406c76bc4e7817de3449'),
}
data = {}
input_proofs = {}
for name, (path, expected) in INPUTS.items():
    raw = path.read_bytes()
    actual = hashlib.sha256(raw).hexdigest()
    assert actual == expected, (name, actual)
    data[name] = raw
    input_proofs[name] = {'path': str(path), 'sha256': actual, 'bytes': len(raw)}

native_all = json.loads(data['native'])['body']['response']['data']['data']
native = [r for r in native_all if r['status'] == 1 and r['currency'] == 'USDT'
          and r['symbol'].endswith('-USDT')]
metadata = json.loads(data['metadata'])['body']['response']['data']['data']['result']
root = json.loads(data['root_selection'])
assert len(native_all) == 1278 and len(native) == 934 and len(metadata) == 5673
assert len({r['coinName'] for r in metadata}) == len(metadata)
assert len({r['coinId'] for r in metadata}) == len(metadata)
assert len({r['symbol'] for r in native}) == 934
assert len({str(r['contractId']) for r in native}) == 934
meta = {r['coinName']: r for r in metadata}
root_by_symbol = {r['symbol']: r for r in root['rows']}
assert len(root_by_symbol) == 934

groups = {
    'NCSK': ('EXCLUDE_TRADFI_STOCK_OR_ETF', 'Stock/equity or equity ETF exposure'),
    'NCSI': ('EXCLUDE_TRADFI_INDEX_OR_INDEX_ETF', 'Noncrypto index or index ETF exposure'),
    'NCCO': ('EXCLUDE_TRADFI_COMMODITY_OR_METAL', 'Commodity/metal exposure'),
    'NCFX': ('EXCLUDE_TRADFI_FX', 'Fiat foreign-exchange exposure'),
}
rows = []
for n in sorted(native, key=lambda r: r['symbol']):
    m = meta[n['asset']]
    prefix = n['asset'][:4]
    if prefix in groups:
        reason, economic = groups[prefix]
        selected, crypto_scope = False, False
        # Positive namespace + display exposure jointly identify excluded classes.
        assert m['coinType'] == 5
        basis = 'Native NC product namespace plus same-venue exact asset/coinName and native/display exposure; raw type5 is corroboration, not a decoded universal enum.'
    elif n['asset'] in ('PAXG', 'XAUT'):
        reason, economic = 'EXCLUDE_GOLD_BACKED', 'Gold-backed token'
        selected, crypto_scope = False, False
        assert 'GOLD' in m['coinDisplayName'] and 'GOLD' in n['displayName']
        basis = 'Explicit GOLD in both native and official metadata display; owner excludes gold-backed products.'
    elif n['asset'] in ('BTC', 'ETH'):
        reason, economic = 'EXCLUDE_OWNER_BTC_ETH', 'Cryptocurrency; owner delivery exclusion'
        selected, crypto_scope = False, True
        basis = 'Native exact unique same-venue identity, crypto product context; separate owner scope exclusion.'
    else:
        reason, economic = 'INCLUDE_CRYPTO_SCOPE', 'Crypto token/coin exposure'
        selected, crypto_scope = True, True
        basis = 'Practical economic scope inference from complete saved native crypto-like product group, unique same-venue exact identity/display, explicit NC TradFi separation and reviewed exceptions; not a documented universal raw coinType enum.'
    # No ASCII/Unicode or ticker-word blacklist. No equality test across ID namespaces.
    assert n['asset'] == m['coinName']
    if crypto_scope:
        assert m['coinType'] == 0
    row = {
        'contract_id': str(n['contractId']), 'symbol': n['symbol'],
        'native_asset': n['asset'], 'native_display_name': n['displayName'],
        'metadata_coin_id': m['coinId'], 'metadata_coin_name': m['coinName'],
        'metadata_display_name': m['coinDisplayName'], 'metadata_coin_type_raw': m['coinType'],
        'venue': 'BINGX', 'market_family': 'USDT_PERPETUAL',
        'crypto_economic_scope_before_owner_exclusion': crypto_scope,
        'selected_for_report_scope': selected, 'scope_reason': reason,
        'economic_scope': economic, 'classification_basis': basis,
        'identity_join': 'EXACT_UNIQUE_SAME_VENUE_ASSET_TO_COIN_NAME',
        'contract_id_and_coin_id_are_distinct_entity_namespaces': True,
        'runtime_registry_promoted': False, 'core_data_or_execution_units_qualified': False,
    }
    assert selected == root_by_symbol[n['symbol']]['selected_for_scope'], n['symbol']
    rows.append(row)

counts = collections.Counter(r['scope_reason'] for r in rows)
assert counts == {
    'INCLUDE_CRYPTO_SCOPE': 550, 'EXCLUDE_OWNER_BTC_ETH': 2,
    'EXCLUDE_GOLD_BACKED': 2, 'EXCLUDE_TRADFI_STOCK_OR_ETF': 363,
    'EXCLUDE_TRADFI_INDEX_OR_INDEX_ETF': 8, 'EXCLUDE_TRADFI_COMMODITY_OR_METAL': 8,
    'EXCLUDE_TRADFI_FX': 1,
}, counts
selected = [r for r in rows if r['selected_for_report_scope']]
excluded = [r for r in rows if not r['selected_for_report_scope']]
assert len(selected) + len(excluded) == 934
assert sum(r['crypto_economic_scope_before_owner_exclusion'] for r in rows) == 552
assert set(r['symbol'] for r in selected).isdisjoint(r['symbol'] for r in excluded)
assert {r['symbol'] for r in rows} == set(root_by_symbol)
assert all(next(r for r in rows if r['native_asset'] == a)['selected_for_report_scope']
           for a in ('4STOCK', 'STONK', 'SPX', 'SI', 'HAJIMI', 'BNLIFE', 'WOTAMALAILE', 'LONGXIA', 'NIULAI'))
unicode_selected = [r['symbol'] for r in selected if not r['metadata_display_name'].isascii()]

def write(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

write('U3_FULL_934_SCOPE_SELECTION_V1.json', {
    'schema': 'SOURCE_U3_SAVED934_ECONOMIC_SCOPE_SELECTION_V1',
    'status': 'RECONCILED_PRACTICAL_SCOPE_SELECTION_WITH_ROOT',
    'tz_sha256': TZ, 'input_proofs': input_proofs,
    'membership_snapshot_utc': '2026-10-25T12:37:50.932Z',
    'metadata_received_utc': '2026-10-25T16:30:02.427Z',
    'scope_count': 550, 'crypto_before_btc_eth_exclusion': 552,
    'excluded_count': 384, 'counts_by_reason': dict(counts),
    'unresolved_scope_rows_after_practical_review': [],
    'scope_count_method': '934 - 380 native TradFi - 2 gold-backed = 552 crypto economic scope; - 2 BTC/ETH owner exclusions = 550 report scope.',
    'inference_disclosure': 'This is a practical economic scope selection, not proof of universal coinType enum semantics or a newly downloaded current market set. Raw type0/type5 alone was not used as the rule. Exact native/display identity and product namespaces/exposure plus explicit owner exclusions determine the selected set.',
    'not_claimed': ['New current membership after saved timestamps', 'Documented universal coinType enum', 'Per-token issuer/chain/CA proof for all552', 'Core data or execution multiplier qualification for550', 'Runtime registry promotion', 'Live API readiness or full-day/six-manual quota sufficiency', 'New native/SQL/Telegram/deploy admission'],
    'unicode_selected_symbols': unicode_selected,
    'primary_borderline_evidence': {
        'provenance': 'ROOT primary-page research and explicit U3 messages; SOURCE did not refetch pages. URLs/findings copied from exact ROOT selection plus its 4STOCK clarification.',
        'root_selection_sha256': input_proofs['root_selection']['sha256'],
        'root_references': root['primary_borderline_references'],
        'additional_4stock_references': [
            {'url': 'https://pro.edgex.exchange/en-US/news/article/4stock-on-edgex-stock-themed-bnb-meme-perpetual', 'finding': 'Stock-themed BNB meme token perpetual, not an equity-backed share.'},
            {'url': 'https://four-meme.gitbook.io/four.meme/stock-meme/4stock', 'finding': 'Four.meme stock meme context; distinguish from unrelated framework4Stock/BNC4.'},
            {'url': 'https://bingx.com/en/support/articles/17534353436815', 'finding': 'BingX listing/funding context for native4STOCK contract; ROOT-reported.'},
        ],
        'ticker_ambiguities_resolved': ['SPX means SPX6900 meme token; separate native SP500 TradFi', 'STONK native meme/utility token; not excluded by word stock', 'SI means SuperInu; not inferred as silver', '4STOCK meme token distinct from unrelated4Stock framework/BNC4', 'MTL token ticker alone does not mean metal-backed instrument'],
    },
    'rows': rows,
})
write('U3_SELECTED_550_SYMBOLS_V1.json', {'schema': 'SOURCE_U3_SELECTED_SYMBOLS_V1', 'count': len(selected), 'symbols': [r['symbol'] for r in selected]})
write('U3_EXCLUDED_384_SCOPE_ROWS_V1.json', {'schema': 'SOURCE_U3_EXCLUDED_SCOPE_ROWS_V1', 'count': len(excluded), 'rows': excluded})
(HERE / 'U3_SELECTED_550_SYMBOLS_V1.txt').write_text('\n'.join(r['symbol'] for r in selected) + '\n')

# Retained static bytes only: a precise optional future action, never an admission.
def span(input_name, start_anchor, end_anchor, include_end=False):
    raw = data[input_name]
    start = raw.index(start_anchor.encode())
    end = raw.index(end_anchor.encode(), start) + (len(end_anchor.encode()) if include_end else 0)
    value = raw[start:end]
    return {'input': input_name, 'file_sha256': input_proofs[input_name]['sha256'],
            'byte_start': start, 'byte_end_exclusive': end,
            'span_sha256': hashlib.sha256(value).hexdigest(), 'utf8': value.decode(), 'executed': False}

spans = [
    span('api_core', 'at={SPOT:30,', '},Eh=', True),
    span('api_core', 'async getPerpetualUCoinList(', 'async getPerpetualUSDCoinList('),
    span('api_core', 'async getTradfiUCoinList(', 'async getCfdCoinList('),
    span('api_plugin', 'async getCoinSimpleList(e)', 'getChainSpotCoinList(e)'),
]
write('U3_FUTURE_PRECISE_CATEGORY_READ_PLAN_V1.json', {
    'schema': 'SOURCE_U3_FUTURE_PRECISE_CATEGORY_READ_PLAN_V1',
    'status': 'FUTURE_ONLY_NOT_ADMITTED_NOT_EXECUTED_NOT_NEEDED_TO_DELAY_PRACTICAL_SCOPE_550',
    'method': 'GET',
    'url': 'https://api-app.acc-de.com/api/coin/v1/quotation/simple-list?bizType=20',
    'params': {'bizType': 20}, 'biz_type_semantics': 'PERPETUAL_U, proved by retained exact enum and getPerpetualUCoinList consumer; FUTURES_U10 is a different product, TRADFI_U22 is separate.',
    'signed_get_payload_literal': '{"bizType":"20"}',
    'request_reconstruction': 'Same public anonymous request headers/sign algorithm as CLOCK_CONTRACT_STATIC_SPANS_V1; new exact query-aware action required. Existing display-info-only factory must remain pinned and must not be silently reused with its empty{} preimage.',
    'public_sign_preimage_order': ['public build sign_prefix', 'Unix-ms timestamp', 'compact UUIDv4 traceId', 'anonymous device UUID', 'platformId30', 'app_version5.3.37', 'empty antiDeviceId', '{"bizType":"20"}'],
    'sign': 'SHA256 uppercase hex; GET numeric20 normalized to string20 before stable sorted JSON.',
    'static_sign_host_prefix_proof': 'pump-report/handoffs/sources/CLOCK_CONTRACT_STATIC_SPANS_V1.json',
    'static_sign_host_prefix_proof_sha256': 'ef395a30cb5c81327ebaf1e1bb5dbc9e4338621a2b3880315fe3b4b3f1e85998',
    'bounded_action_if_root_later_admits': {'provider_attempts_max': 1, 'timeout_ms': 10000, 'max_response_bytes': 2097152, 'redirects': 0, 'retries': 0, 'host_fallback': 0, 'credentials_cookies_tokens': False},
    'expected_shape_from_consumer': 'business response result[]; actual shape/field availability not yet observed for this endpoint.',
    'minimal_export': ['native/same-venue identity fields actually present', 'quotationId/coinId/coinName only if actually returned', 'product/category fields actually present', 'matches/missing/extra versus saved934 and proposed550'],
    'private_only': 'Whole response and any prices/market values; never export guessed fields or identify quotationId as contractId without evidence.',
    'admissions_required_before_any_io': ['ROOT exact new provider-family action', 'whole budget/caps/manual reserves', 'native SQL envelope if runtime needs it', 'exact runtime/server artifact and full readback'],
    'no_rearm': 'Metadata2of2 SPENT, old requests/unknowns/reserves/caps remain unchanged. This plan itself spends0 and grants0.',
    'retained_static_spans': spans,
})

write('U3_SCOPE_RECONCILIATION_CHECK_V1.json', {
    'schema': 'SOURCE_U3_SCOPE_RECONCILIATION_CHECK_V1', 'result': 'PASS_LOCAL_SAVED_DATA_SCOPE_RECONCILIATION',
    'checks': {'input_hashes_exact': True, 'active934_distinct_symbols_ids': True,
               'exact_unique_metadata_matches': 934, 'root_scope_decisions_identical': 934,
               'selected_count': 550, 'excluded_count': 384, 'partition_complete_disjoint': True,
               'crypto_before_btc_eth_exclusion': 552, 'unicode_selected': len(unicode_selected),
               'ambiguous_names_not_blacklisted': True, 'raw_prices_exported': False,
               'downloaded_js_executed': False, 'new_provider_sql_tg_deploy': 0,
               'production_source_code_changes': 0},
    'qualification_limit': 'Checks verify saved snapshot selection and exact ROOT agreement, not per-asset live market data or underlying units.',
})
print(json.dumps({'result': 'PASS_LOCAL_SAVED_DATA_SCOPE_RECONCILIATION', 'input': 934,
                  'selected': 550, 'excluded': 384, 'crypto_before_btc_eth_exclusion': 552,
                  'counts': counts, 'unicode_selected': unicode_selected,
                  'root_decisions_identical': 934, 'new_provider_sql_tg_deploy': 0}, ensure_ascii=False))
