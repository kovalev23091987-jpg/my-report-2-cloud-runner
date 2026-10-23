#!/usr/bin/env python3
"""Check NEW documentation capture hashes and narrow normative claims only.

The initial tool capture is private scratch, not a market/provider original.
Full page bodies are deliberately not republished. A changed later page cannot
silently replace the exact hashed initial documentation evidence.
"""
import argparse
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--capture', required=True)
args = parser.parse_args()
HERE = Path(__file__).resolve().parent
receipt = json.loads((HERE / 'documentation-receipts.json').read_text())
findings = json.loads((HERE / 'findings.json').read_text())
scope = json.loads((HERE / 'scope.json').read_text())
capture = json.loads(Path(args.capture).read_text())
raw = {d['id']: d for d in capture['documents']}
checks = []


def check(name, value):
    if not value:
        raise AssertionError(name)
    checks.append(name)


def sha(value):
    return hashlib.sha256(value).hexdigest()


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
            self.row = []
        if tag in ['td', 'th'] and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ['td', 'th'] and self.cell is not None:
            self.row.append(''.join(self.cell).strip())
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None


check('exact four document calls and one developer search', receipt['documentation_tool_calls'] == scope['actual_document_tool_calls'] == 4 and receipt['developer_search_calls'] == scope['actual_developer_search_calls'] == 1)
check('no old English docs or accepted suites repeated', scope['prior_accepted_checks_or_English_docs_repeated'] == 0)
tables = {}
for d in receipt['documents']:
    source = raw[d['id']]
    for field, label in [('markdown', 'markdown'), ('html', 'processed_html')]:
        b = source[field].encode()
        check(d['id'] + ' exact ' + label + ' tool-body hash/bytes', sha(b) == d[label + '_sha256'] and len(b) == d[label + '_bytes'])
    check(d['id'] + ' exact official current Chinese final URL', d['final_url'].startswith('https://www.mexc.com/zh-MY/api-docs/futures/') and d['locale'] == 'zh-MY' and d['version_label'] == 'current')
    check(d['id'] + ' no raw wire/event clock or full-body publication invented', d['raw_wire_digest_or_provider_event_clock'] is None and d['full_document_body_committed'] is False)
    p = Tables()
    p.feed(source['html'])
    tables[d['id']] = p.rows
    for fragment in d['bounded_schema_fragments']:
        check(d['id'] + ' exact bounded source fragment', fragment in source['markdown'])

kline = {r[0]: r for r in tables['kline'] if r}
trades = {r[0]: r for r in tables['trades'] if r}
check('kline vol response label has no normative denomination', kline['vol'] == ['vol', 'double', '成交量'])
check('amount only example, no response table row in processed HTML', 'amount' not in kline and '"amount"' in raw['kline']['markdown'])
check('start/end seconds are REQUEST parameters', kline['start'][-1] == '开始时间戳，单位秒' and kline['end'][-1] == '结束时间戳，单位秒')
check('T is only BUY/SELL label in response table', trades['T'] == ['T', 'int', '成交方向,1:买,2:卖'])
check('t is only trade-time label, no explicit unit', trades['t'] == ['t', 'long', '成交时间'])
check('O describes BOTH maker and taker; does not assign T aggressor', 'taker和maker' in trades['O'][-1] and 'T' not in trades['O'][-1])
guide = next(d for d in receipt['documents'] if d['id'] == 'guide')['bounded_schema_fragments'][0]
check('millisecond statement scoped to signed Request-Time header', '所有签名接口' in guide and 'Request-Time' in guide and '毫秒' in guide)
check('different-provider/third-party developer results not admitted', len(receipt['developer_search_results']) == 5 and all(r['used_as_MEXC_normative_proof'] is False for r in receipt['developer_search_results']))
check('all unresolved actual denomination/time/aggressor fields stay NULL', all(v is None for v in findings['unresolved_normative_fields'].values()))
check('no installed source, current fact, identity or delivery qualification', findings['consumer_admission']['source_connected'] is False and findings['consumer_admission']['current_asset_listing_or_binding'] is None and findings['consumer_admission']['current_useful_fact_or_delivery'] is False)
check('all four scrape feedback receipts accepted', set(receipt['scrape_feedback_accepted']) == set(raw))
check('no market/native/WS/deploy/MAIN/Telegram/shared/cap/unknown mutations', scope['provider_market_HTTP_native_SQL_WS_deploy_MAIN_Telegram'] == scope['runtime_shared_main_phase_fence_status_generation_changes'] == 0 and scope['caps_unknown_and_reserves_changed'] is False)

files = {p.name: {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in sorted(HERE.iterdir()) if p.is_file() and p.name != 'verification.json'}
check('exact scoped five input files, no full-source-body copy', set(files) == {'documentation-receipts.json', 'findings.json', 'review-ru.json', 'scope.json', 'verify.py'})
report = {'schema': 'NEW_MEXC_PRIMARY_DOC_GAP_VERIFICATION_V1', 'status': 'PASS', 'new_document_assertions': len(checks), 'assertions': checks, 'files': files, 'verification_trust': 'Initial Firecrawl processed-body hashes checked against local scratch; not independent provider/wire/native replay. Full documents are not committed.', 'unresolved_normative_fields_preserved_NULL': True, 'market_HTTP_SQL_WS_deploy_MAIN_Telegram': 0, 'old_accepted_suites_repeated': 0}
body = (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode()
(HERE / 'verification.json').write_bytes(body)
print(json.dumps({'status': 'PASS', 'new_document_assertions': len(checks), 'verification_sha256': sha(body)}))
