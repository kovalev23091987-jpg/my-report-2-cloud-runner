#!/usr/bin/env python3
"""Original report -> block -> source -> consumer census. No HTTP or D1.

Counts historical evidence, never current simultaneous all-asset coverage.
Repeated copies of the same original publication/fingerprint count once.
"""
import collections, datetime, gzip, hashlib, json, pathlib, re

root = pathlib.Path(__file__).resolve().parents[1]
active = ['N04', 'N05', 'N10', 'N11', 'N12', 'N15']
paused = ['N01', 'N02', 'N03', 'N06', 'N07', 'N08', 'N09', 'N14', 'N16']
by_source = collections.defaultdict(lambda: {'contracts': set(), 'checks': 0, 'valid_source_checks': 0, 'source_check_HTTP': 0, 'statuses': collections.Counter()})
by_block = {key: {'checked_contracts': set(), 'context_contracts': set(), 'directional_contracts': set(), 'manual_rendered_contracts': set(), 'nonzero_score_contracts': set(), 'original_checks': 0} for key in active}
publications, seen, files, bad, issues = [], set(), [], [], []
for path in sorted((root/'checkpoints').glob('**/report2-run-result.json*')):
    raw = gzip.decompress(path.read_bytes()) if path.suffix == '.gz' else path.read_bytes()
    data = json.loads(raw)
    if data.get('status') != 'CLOSED' or not re.fullmatch('[a-f0-9]{40}', str(data.get('head', ''))):
        continue
    count = 0
    for candidate in data.get('candidates', []):
        canonical = candidate.get('canonical', {})
        pub, run, snapshot, contract, ts = [candidate.get(k) for k in ['publication_id', 'run_id', 'snapshot_id', 'contract', 'observed_ts']]
        fingerprint = canonical.get('analytical_fingerprint')
        if not (re.fullmatch('PUB:[a-f0-9]{40,64}', str(pub)) and re.fullmatch('[a-f0-9]{64}', str(fingerprint)) and run == data.get('run_id') == canonical.get('run_id') and snapshot == canonical.get('snapshot_id') and contract == canonical.get('contract') and isinstance(ts, int) and ts > 0 and ts == canonical.get('observed_ts')):
            bad.append({'file': str(path.relative_to(root)), 'publication_id': pub, 'reason': 'EXACT_ORIGINAL_BINDING_REQUIRED'})
            continue
        key = (pub, fingerprint)
        if key in seen:
            continue
        blocks = candidate.get('block_coverage', {}).get('blocks', {})
        # Do not apply today's pauses retrospectively to a pre-pause report.
        if not all(blocks.get(k, {}).get('status') == 'BLOCK_PAUSED_BY_OWNER' for k in paused):
            continue
        seen.add(key); count += 1
        rendering = candidate.get('block_rendered_results', {})
        decision = candidate.get('block_decision_use', {})
        manual = rendering.get('used_context_block_ids', [])
        record = {'publication_id': pub, 'run_id': run, 'snapshot_id': snapshot, 'contract': contract, 'observed_ts': ts, 'head': data['head'], 'source_report': str(path.relative_to(root)), 'source_report_sha256': hashlib.sha256(raw).hexdigest(), 'manual_rendered': manual, 'block_sources': {}, 'deduplicated_HTTP_groups': {}, 'shared_n05_n12_attribution': decision.get('shared_n05_n12_http_attribution'), 'Telegram_delivery_not_inferred_from_rendering': True}
        groups = {}
        for block in active:
            b = blocks.get(block, {}); total = by_block[block]; total['original_checks'] += 1
            if b.get('checked') is True: total['checked_contracts'].add(contract)
            if b.get('valid_context_facts', 0) > 0: total['context_contracts'].add(contract)
            if b.get('usable_facts', 0) > 0: total['directional_contracts'].add(contract)
            if block in manual: total['manual_rendered_contracts'].add(contract)
            effect = decision.get('blocks', {}).get(block, {})
            if effect.get('score_application_receipt_count', 0) > 0: total['nonzero_score_contracts'].add(contract)
            record['block_sources'][block] = {}
            for source, check in b.get('source_checks', {}).items():
                http = check.get('network_calls'); ev = check.get('valid_evidence_ids', [])
                if not isinstance(http, int) or http < 0:
                    issues.append({'publication_id': pub, 'block': block, 'source': source, 'reason': 'UNQUANTIFIED_HTTP'}); continue
                stats = by_source[(block, source)]; stats['contracts'].add(contract); stats['checks'] += 1
                stats['valid_source_checks'] += bool(ev); stats['source_check_HTTP'] += http; stats['statuses'][check.get('status', 'UNKNOWN')] += 1
                record['block_sources'][block][source] = {'status': check.get('status'), 'HTTP': http, 'valid_evidence_ids': ev, 'checked': check.get('checked'), 'providers': check.get('provider_ids', []), 'upstreams': check.get('declared_upstream_ids', []), 'physical_roots': check.get('physical_root_keys', [])}
                # Same CHAIN_EVENTS call appears in both N04 and N05. Charge
                # its exact receipt once, retain each block's different use.
                group = 'SHARED_CHAIN_EVENTS' if source == 'CHAIN_EVENTS' else 'SHARED_N05_N12_PUBLIC' if source == 'EXTERNAL_N05_FLOW' else source
                shape = json.dumps({'HTTP': http, 'status': check.get('status'), 'receipts': check.get('receipts', [])}, sort_keys=True)
                if group in groups and groups[group]['shape'] != shape:
                    issues.append({'publication_id': pub, 'source_group': group, 'reason': 'SHARED_TRANSPORT_RECEIPTS_DISAGREE'}); continue
                groups[group] = {'shape': shape, 'HTTP': http}
        record['deduplicated_HTTP_groups'] = {k: v['HTTP'] for k, v in groups.items()}
        record['source_checks_HTTP_sum_deduplicated'] = sum(v['HTTP'] for v in groups.values())
        record['not_whole_run_HTTP'] = True
        for block in paused:
            b = blocks[block]
            if b.get('checked') is True or b.get('source_checks') or b.get('maximum_score_points', 0) != 0 or block in manual:
                issues.append({'publication_id': pub, 'block': block, 'reason': 'PAUSED_BLOCK_PARTICIPATION'})
        publications.append(record)
    if count: files.append({'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(raw).hexdigest(), 'new_original_publications': count})

for block, values in by_block.items():
    for key, value in list(values.items()):
        if isinstance(value, set): values[key] = {'historical_count': len(value), 'contracts': sorted(value)}
matrix = []
for (block, source), values in sorted(by_source.items()):
    values['contracts'] = sorted(values['contracts']); values['statuses'] = dict(values['statuses'])
    matrix.append({'block': block, 'source': source, **values, 'cost_is_source_check_attribution_not_independent_HTTP': True})
proof = {'schema': 'ACTIVE_SAVED_SOURCE_USE_CENSUS_20261014_V1', 'recorded_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'active_blocks': active, 'paused_blocks': paused, 'exact_current_pause_policy_required_in_original_report': True, 'original_publications': len(publications), 'original_contracts': sorted({x['contract'] for x in publications}), 'files': files, 'blocks': by_block, 'source_block_matrix': matrix, 'original_records': publications, 'rejected_bindings': bad, 'issues': issues, 'deduplication': 'Only exact original publication/fingerprint once; shared CHAIN_EVENTS transport once per publication; N05/N12 public costs share one group. Vendor/RPC routes do not imply independent primary sources.', 'market_scope': 'Counts exact contract facts per block; spot/futures completeness and venue independence require typed original component proof, not a name, rendering phrase or HTTP count.', 'original_source_clocks_refreshed': False, 'all105_current_useful_coverage_proven': False, 'historical_distinct_venues_implies_current_convergence': False, 'sourceHTTP': 0, 'D1': 0, 'MAIN': 0, 'Telegram': 0, 'project_complete': False}
path = root/'checkpoints/ACTIVE_SAVED_SOURCE_USE_CENSUS_20261014.json'
path.write_text(json.dumps(proof, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'output': str(path.relative_to(root)), 'original_publications': len(publications), 'original_contracts': len(proof['original_contracts']), 'blocks': {k: {'checked': v['checked_contracts']['historical_count'], 'useful_context': v['context_contracts']['historical_count'], 'manual_rendered': v['manual_rendered_contracts']['historical_count'], 'directional': v['directional_contracts']['historical_count']} for k, v in by_block.items()}, 'issues': len(issues), 'rejected_bindings': len(bad)}, ensure_ascii=False))
