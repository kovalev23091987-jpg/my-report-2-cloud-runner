"""Finite F571 economic proposal for the single hash-pinned ROOT tuple."""
from pathlib import Path
import hashlib
import json
import os

D = Path(__file__).parent
PRIVATE = Path('/private/tmp/pump-f571-economic-proposal1-private.json')
BUNDLE = Path('/private/tmp/pump-f571-negative1-bundle-private.json')
PUBLIC = D / 'F571_EXACT1_ECONOMIC_PROPOSAL_V1.json'

def sha(b):
    return hashlib.sha256(b).hexdigest()

def write_new(path, value, private=False):
    b = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600 if private else 0o644)
    with os.fdopen(fd, 'wb') as f:
        f.write(b)
    return {'path': str(path), 'sha256': sha(b), 'bytes': len(b), 'mode': oct(path.stat().st_mode & 0o777)}

if any(p.exists() for p in [PRIVATE, BUNDLE, PUBLIC]):
    raise RuntimeError('F571_EXACT1_PROPOSAL_ALREADY_WRITTEN_NO_RERUN')
b = Path('/private/tmp/pump-f571-root-exact-metadata-private.json').read_bytes()
if sha(b) != 'ed1230453ba6d42b5d54d3c1c0853cc3fb3bca691fe788dd51092653cc952ab4':
    raise RuntimeError('EXACT1_PRIVATE_METADATA_JOIN_HASH_REQUIRED')
v = json.loads(b)
t, m = v['native_tuple'], v['metadata_row']
old = v['matching_saved_native_rows']
if v['native_four_tuple_sha256'] != '4d0f372641746988f53d9a9cdce8c7f5dd9e07b5e0abad4030a1028d849f1b8c' or v['saved_native_exact_matches'] != 1 or v['metadata_exact_asset_matches'] != 1:
    raise RuntimeError('FINITE_EXACT_SINGLE_REVIEW_REQUIRED')
if t['asset'] != 'NCFXUSD2KRW' or t['symbol'] != 'NCFXUSD2KRW-USDT' or t['currency'] != 'USDT' or t['status'] != 1 or v['family'] != 'USDT_M':
    raise RuntimeError('EXACT_CURRENT_NATIVE_TUPLE_CHANGED')
if len(old) != 1 or str(old[0]['contractId']) != str(t['contractId']) or old[0]['displayName'] != 'USDKRW-USDT' or old[0]['status'] != 25 or m['coinName'] != t['asset'] or m['coinDisplayName'] != 'USDKRW':
    raise RuntimeError('EXACT_PRIMARY_NATIVE_AND_METADATA_CARRIER_CHANGED')
# A finite, explicit review of this pinned USD/KRW exposure, not a prefix,
# language, status or numeric coinType classifier. USDT is settlement here.
review = {'kind': 'EXPLICIT_SINGLE_NATIVE_AND_OFFICIAL_DISPLAY_ECONOMIC_CARRIER', 'native_product_display': old[0]['displayName'], 'metadata_official_display': m['coinDisplayName'], 'reviewed_official_underlying': 'USD/KRW foreign-exchange pair: United States dollar versus South Korean won', 'economic_exposure': 'FX', 'policy': 'ROOT_F552_BOUNDED_EXPLICIT_PRIMARY_CARRIER_INFERENCE_REUSED', 'finite_native_four_tuple_sha256': v['native_four_tuple_sha256'], 'generic_numeric_coinType_enum': False, 'generic_name_prefix_or_language_classifier': False, 'current_status_does_not_prove_crypto': True}
tuple_ = {'native_contract_id': str(t['contractId']), 'symbol': t['symbol'], 'asset': t['asset'], 'currency': t['currency'], 'family': 'USDT_M', 'current_status': 1}
proposal = {'schema': 'F571_EXACT1_PRIVATE_ECONOMIC_PROPOSAL_V1', 'native_tuple': tuple_, 'native_tuple_sha256': v['native_four_tuple_sha256'], 'proposal': 'KNOWN_NON_TARGET', 'economicdecision': 'KNOWN_NON_TARGET', 'economic_exposure': 'FX', 'scope_reason': 'NON_CRYPTO_FX_PAIR', 'saved_previous_status': 25, 'primarycarrier': review, 'primary_evidence': {'current_ROOT_exact_input_sha256': v['ROOT_input_sha256'], 'current_capture_sha256': v['actual2_capture_sha256'], 'current_receipt_and_original_clock_pointer': 'Exact ROOT input unresolved row and capture evidence; no recapture clock substituted', 'native_saved_sha256': v['native_saved_sha256'], 'display_info_sha256': v['metadata_saved_sha256'], 'metadata_endpoint': v['metadata_endpoint'], 'metadata_row_sha256': v['metadata_row_sha256'], 'unique_native_four_tuple_match': True, 'unique_native_asset_to_coinName_match': True, 'coinId_is_native_contractId_namespace': False, 'raw_coinType_not_decoded': m.get('coinType')}, 'economic_inference_explicit': True, 'ROOT_registry_adoption_required': True, 'registry_activation_performed': False, 'known550_processing_unaffected': True, 'new_crypto_claimed': 0, 'new_unit_or_cross_venue_identity_proof': False, 'limitation': 'One exact native tuple and its FX exposure only; USDT settlement does not make FX crypto. No generic enum/category join or actual IO grant.'}
# One new affected proposal-consistency check, against the real retained join.
assert proposal['native_tuple']['asset'] == m['coinName']
assert proposal['native_tuple']['native_contract_id'] == str(old[0]['contractId'])
assert proposal['native_tuple']['current_status'] == 1 and proposal['saved_previous_status'] == 25
assert proposal['economicdecision'] == 'KNOWN_NON_TARGET' and proposal['economic_exposure'] == 'FX'
assert not proposal['registry_activation_performed'] and not proposal['new_unit_or_cross_venue_identity_proof']
private = write_new(PRIVATE, {'schema': 'F571_EXACT1_PRIVATE_PROPOSALS_V1', 'proposals': [proposal], 'formal_classification_inference_used': True, 'no_registry_mutation': True}, True)
bundle = write_new(BUNDLE, {'schema': 'F571_NEGATIVE1_PROPOSAL_BUNDLE_PRIVATE_V1', 'rows': [{'native_tuple': {**tuple_, 'status': 1}, 'economicdecision': 'KNOWN_NON_TARGET', 'economic_exposure': 'FX', 'scope_reason': 'NON_CRYPTO_FX_PAIR', 'native_tuple_sha256': proposal['native_tuple_sha256'], 'evidence_sha256': private['sha256'], 'ROOT_review_required': True}], 'existing433_negative_rows_not_read_or_rewritten': True, 'ROOT_registry_merge_required': True, 'activation_performed': False}, True)
summary = {'schema': 'F571_EXACT1_ECONOMIC_PROPOSAL_V1', 'status': 'SINGLE_EXPLICIT_FX_NON_TARGET_PROPOSAL_READY_FOR_ROOT_REVIEW', 'current_ROOT_input_sha256': v['ROOT_input_sha256'], 'actual2_capture_sha256': v['actual2_capture_sha256'], 'native_tuple_sha256': proposal['native_tuple_sha256'], 'current_status': 1, 'saved_previous_status': 25, 'proposal': 'KNOWN_NON_TARGET', 'economic_exposure': 'FX', 'underlying_review': 'Official native USDKRW display carries USD/KRW foreign-exchange exposure. Native USDT settlement is separate from underlying classification.', 'primary_evidence': proposal['primary_evidence'], 'metadata_exact_asset_matches': 1, 'saved_native_exact_matches': 1, 'economic_inference_explicit': True, 'no_generic_numeric_coinType_enum_or_name_prefix_classifier': True, 'private_outputs': [private, bundle], 'new_affected_proposal_consistency': {'executions': 1, 'result': 'PASS', 'basis': 'Actual exact retained single-row join, native four-tuple, current and old status, FX carrier and no automatic activation'}, 'formal_runtime_tests': 0, 'old_tests_replayed': 0, 'F571_initial_capture_selection_failed_stays_failed': True, 'initial_exact_join_path_resolution_failure_before_input_read': True, 'completed_exact_metadata_joins': 1, 'current_capture_rereads': 0, 'old550_prices_CORE_reader_or_old53_reclassification_reruns': 0, 'new_provider_metadata_docs_RPC_SQL_TG_deploy': 0, 'new_crypto_or_unit_or_crossvenue_proofs': 0, 'SOURCE_registry_changes': 0, 'whole_scope_count_claim': 'Not recomputed; ROOT owns adoption and whole current coverage', 'minimum_missing_primary_input_for_this_single_economic_proposal': None}
public = write_new(PUBLIC, summary)
print(json.dumps({'proposal': summary['proposal'], 'economic_exposure': 'FX', 'current_tuples': 1, 'consistency': 'PASS', 'private_outputs': [private, bundle], 'public_summary': public, 'capture_rereads': 0}, ensure_ascii=False))
