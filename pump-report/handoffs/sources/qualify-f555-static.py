from pathlib import Path
import hashlib
import json

# Read source text only. Never import, transpile or execute the downloaded TS.
root = Path(__file__).resolve().parents[2]
handoff = Path(__file__).resolve().parent
index = json.loads((handoff / 'F555_FULL_BLOBS_AND_LITERAL_INDEX_V1.json').read_text())

for item in index['files']:
    raw = (root.parent / item['path']).read_bytes()
    assert len(raw) == item['bytes']
    assert hashlib.sha256(raw).hexdigest() == item['sha256']
    assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == item['git_blob_sha1']

methods = {}
for item in index['method_ranges']:
    lines = (root.parent / item['path']).read_text().splitlines()
    literal = '\n'.join(lines[item['start_line'] - 1:item['end_line']]) + '\n'
    assert hashlib.sha256(literal.encode()).hexdigest() == item['literal_sha256']
    methods[item['method_marker']] = '\n'.join(
        line for line in literal.splitlines() if not line.lstrip().startswith('//'))

market = methods['override parseMarket (']
book = methods['override async fetchOrderBook (']
pair = methods['parseOrderBookBidAsk (bidask:']
trade = methods['override parseTrade (']
safe_trade = methods['safeTrade (trade:']
assert "const baseId = symbolParts[0]" in market
assert "contractSize = (checkIsInverse) ? inverseContractSize : this.parseNumber ('1')" in market
assert "timestamp, 'bids', 'asks', 0, 1" in book
assert 'bidsCoin' not in book and 'asksCoin' not in book and 'contractSize' not in book
assert 'contractSize' not in methods['parseOrderBook (orderbook:']
assert 'this.safeFloat (bidask, priceKey)' in pair and 'this.safeFloat (bidask, amountKey)' in pair
assert "[ 'id', 't', 'fillId', 'tradeId' ]" in trade
assert "const cost = this.safeString (trade, 'quoteQty')" in trade
assert "if (cost === undefined)" in safe_trade and "'contractSize'" in safe_trade
assert "trade['id']" not in safe_trade and 'createCcxtTradeId' not in trade

unchanged = {
    'sources/index.mjs': '8f87d577837b03d821bcab1d41147e353d556132b88d25b34f7289c024da6c6f',
    'sources/recent-trades.mjs': 'bc6843634b65ddc6c65a0aa4747f2580d309620ef46b7b86da865fada0f68549',
    'sources/registry-curated13-native-relative-v1.json': '76f6a6cca7328b9e41a1141fe0fc93957af722be4095515cf76d632fae2dc516',
}
for name, expected in unchanged.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected

receipt = json.loads((handoff / 'F555_AUTHORITY_AND_DOC_READ_RECEIPT_V1.json').read_text())
assert receipt['primary_document_reads_used'] == receipt['primary_document_read_limit'] == 2
assert receipt['provider_HTTP_SQL_TG_deploy'] == 0
result = {
    'schema': 'SOURCE_F555_STATIC_QUALIFICATION_V1',
    'status': 'PASS_STATIC_BYTES_AND_TRACE_ANCHORS_ONLY',
    'cases_passed': 1, 'cases_failed': 0,
    'full_blob_git_SHA_and_SHA256_matches': 2,
    'method_range_hashes_checked': len(index['method_ranges']),
    'downloaded_code_executed': False,
    'existing_source_and_registry_hashes_unchanged': unchanged,
    'new_runtime_tests_or_old_cases_replayed': 0,
    'native_unit_or_ID_stability_proven': False,
    'qualification_activated': False,
    'new_provider_HTTP_SQL_TG_deploy': 0,
}
(handoff / 'F555_STATIC_QUALIFICATION_V1.json').write_text(json.dumps(result, indent=2) + '\n')
print('F555 static qualification: 1 PASS; 2 full blobs and 9 method hashes; vendor code executions 0.')
