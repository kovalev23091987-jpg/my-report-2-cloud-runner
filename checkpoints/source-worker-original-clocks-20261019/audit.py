"""New delegated clock/gap question against existing ZIPs; no old qualification."""
from pathlib import Path
import hashlib, json, zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
SOURCES = [
    ('39164519816', 'checkpoints/source-worker-strk-wld-natural-20261018/artifact-12150441158.zip', '0cdc0290341cb883234d3812231001c8791f4c5d594d2e4e2c5fe3200dcec1ab'),
    ('39220988644', 'checkpoints/natural-39220988644/report2-run-result.zip', 'bda0dd8951be56f636fce0399054ddd4d065c9c0837142d272e5e3c3a9101133'),
]
out = {'schema': 'SAVED_SOURCE_CLOCK_GAP_AUDIT_V1', 'question': 'N10 final clock through canonical and rendered consumer, plus only new executable gaps',
       'excluded_accepted_packages': [419,425,426,427,431,432,514,519], 'runs': [],
       'no_new_provider_route_proven': True, 'sourceHTTP': 0, 'nativeSQL': 0, 'MAIN': 0, 'Telegram': 0}
for run, path, expected in SOURCES:
    b = (REPO/path).read_bytes()
    if hashlib.sha256(b).hexdigest() != expected: raise ValueError('ZIP digest mismatch')
    with zipfile.ZipFile(REPO/path) as z: member = z.read('report2-run-result.json')
    r = json.loads(member)
    record = {'cloud_run': run, 'head': r['head'], 'run_id': r['run_id'], 'zip_path': path, 'zip_sha256': expected,
              'member_sha256': hashlib.sha256(member).hexdigest(), 'candidates': []}
    for c in r['candidates']:
        receipts = c['block_rendered_results']['context_receipts']
        blocks = {}
        for block in ['N05','N10','N12','N15']:
            d = c['block_decision_use']['blocks'][block]
            blocks[block] = {'valid_fact_count': d['valid_fact_count'], 'rendered_receipt_count': d['rendered_useful_context_receipt_count'],
                             'actual_score_contribution': d['score_contribution'],
                             'route_statuses': {k: {'status': v['status'], 'actual_http': v.get('actual_http')}
                                                for k,v in d['source_accounting'].get('details',{}).items()}}
        n10 = [{'evidence_id': x['evidence_id'], 'physical_root_key': x['physical_root_key'], 'source_ts': x['source_ts'],
                'observed_ts': x['observed_ts'], 'first_known_ts_retained': 'first_known_ts' in x,
                'expiry_retained': 'expires_at' in x, 'original_clock_retained': 'original_clock' in x,
                'component_origins_retained': 'component_origins' in x} for x in receipts if x['block_id']=='N10']
        record['candidates'].append({'contract': c['contract'], 'snapshot_id': c['snapshot_id'], 'blocks': blocks,
          'N10_rendered_clock_projection': n10, 'raw_N10_evidence_in_compact_canonical': 'metadata' in c['canonical'],
          'acquisition_firstknown_reconstructed': False,
          'LIQ_original_statuses': c['canonical']['liquidations'].get('future_source_status'),
          'detailed_telegram_delivery_proven': c['block_rendered_results']['telegram_delivery_proven'],
          'same_run_root_delivery_inherited': False})
    out['runs'].append(record)
out['new_concrete_defects'] = [
    {'id':'N10_FINAL_FIRST_KNOWN_ASSEMBLY_SUBSTITUTION', 'proof_kind':'CURRENT_CODE_COUNTEREXAMPLE_WITH_CONTROLLED_AVAILABILITY',
     'source':'worker settled().available_ts (all components settled, conservative availability bound)',
     'loss':'buildHtxPrimaryTechnicalReceipt ignores trajectory.available_ts; default first_known_ts=final now',
     'historical_exact_acquisition_clock':'UNKNOWN_IN_COMPACT_ORIGINAL', 'entry_or_freshness_extension_proven':False},
    {'id':'N10_RENDERED_CLOCK_PROJECTION_LOSS', 'proof_kind':'TWELVE_EXACT_SAVED_RENDERED_RECEIPTS_AND_CURRENT_CODE',
     'loss':'source_ts and observed_ts retained; first_known_ts/expires_at/window/policy not retained in N10 rendered receipt',
     'canonical_full_evidence_loss_claimed':False, 'repair':'Add exact original_clock metadata from revalidated N10 evidence, no text/form change'},
]
out['remaining_input_boundaries'] = [
    'Both report ZIPs deliberately compact canonical metadata; raw N10 bodies/cache ACK are absent. Do not infer full canonical loss from compact output.',
    'N05 limited full-4h contexts survive; mismatched windows/quotes and partial external flow do not establish a missing qualified joint fact.',
    'N12 composite original-firstknown is accepted519 scope and excluded. Distinct IDs/HTX markets are not independent providers.',
    'N15 actual contributions are not erased by manual context contribution zero. CoinPaprika exact-market refusal has no saved contradictory original.',
    'LIQ exact identity/price-OI refusals lack a newly qualified matching raw input; unknown and uncollected are not measured zero/provider failures.',
    'Historical STRK/WLD raw cache/Backpack activity and current exact provider balances remain unknown; no new acquisition or adapter justified.',
]
(ROOT/'saved-gap-analysis.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'saved_runs': len(out['runs']), 'candidates': sum(len(r['candidates']) for r in out['runs']), 'N10_receipts':sum(len(c['N10_rendered_clock_projection']) for r in out['runs'] for c in r['candidates']), 'new_code_defects': 2}))
