import pathlib,json,hashlib,datetime,zipfile
r=pathlib.Path(__file__).parent;d=r/'extracted'
j=json.loads((d/'report2-run-result.json').read_text());c=json.loads((d/'report2-completion-accounting.json').read_text());p=json.loads((d/'same-run-delivery-proof.json').read_text());run=json.loads((r/'run.json').read_text());a=next(x for x in json.loads((r/'artifacts.json').read_text())['artifacts'] if x['id']==12148012066)
assert run['head_sha']==j['head']==c['head']==p['head']=='7da99f9cc93535ae2f023c4d54b07d2665240c58'
assert run['id']==39158392794 and run['conclusion']=='success'
assert j['run_id']==c['run_id']==p['run_id']=='1792351308191-1792351316198'
assert j['canonical_persistence_audit']['status']=='CLOSED' and set(j['canonical_persistence_audit']['present_contracts'])=={'BR-USDT','QNT-USDT'}
scan=j['market_scan_audit'];assert scan['universe_total']==scan['scanned']==105 and scan['scanned_market_data']==99 and scan['errors']==scan['stale']==0 and scan['complete'] is True
u=next(x for x in c['delivery']['lifecycle'] if x['key'].startswith('UNI-USDT|LONG|'));b=u['bound_refusal']
assert u['status']=='EXPIRED_NOT_SENT' and u['reason']=='PUBLICATION_EXPIRED' and not u['sent']
assert b['publication_id']=='PUB:b04d55c4e316cc7454095a12f8e335ad068b1827' and b['run_id']=='1791877285169-1791877293784' and b['snapshot_id']=='S392:UNI-USDT:1791877375471'
assert b['identity_verified'] and b['presentation_verified'] and not b['native_freshness_evaluated']
assert b['checked_ts']>b['publication_valid_until_ts']>b['observed_ts'] and b['checked_ts']==1792351386894
ct=next(x for x in c['delivery']['lifecycle'] if x['key'].startswith('CT-USDT|SHORT|'))
q=ct['bound_receipt'];assert ct['status']=='SENT' and ct['sent'] and ct['message_id']=='221'
assert q['network_result']=='CONFIRMED_SENT' and q['dispatch_finalized'] and q['finalization_status']==q['dispatch_state']=='SENT'
assert q['source_run_id']==j['run_id'] and q['run_id'].startswith('ORIGINAL-TASK-TERMINAL:')
assert q['lifecycle_event']=='IDEA_REMOVED' and q['publication_id']==ct['publication_id']
assert c['delivery']['original_terminal']['original_message_id']=='220' and c['delivery']['original_terminal']['reason']=='ORIGINAL_TTL_EXPIRED'
assert p['status']=='NO_EXACT_SAME_RUN_SENT_CAPTURED' and not p['cases'][0]['same_run_binding_verified']
usage={k:c['usage_after_analytics_lease_release'][k] for k in ['requests','rows_read','rows_written','unknown_ops']}
assert usage=={'requests':509,'rows_read':46550,'rows_written':398,'unknown_ops':0}
assert c['day_admission']['daily']['unknown_ops']==15 and c['day_admission']['daily']['native_cost_reconciliation']['new_or_unmatched_unknown_authorized'] is False
assert not c['whole_day_closed'] and not c['reservations_refunded']
with zipfile.ZipFile(r/'artifact-12148012066.zip') as z:members={n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}
out={'schema':'POST478_EXACT_NATIVE_EXPIRY_AND_TERMINAL_DELIVERY_REVIEW_V1','cloud_run':39158392794,'head':j['head'],'run_id':j['run_id'],'artifact':a['id'],'digest':a['digest'],'member_sha256':members,'market_scan_audit':scan,'both_persisted':['BR-USDT','QNT-USDT'],'pipeline_health':j['pipeline_health'],'candidate_identities':[{k:x.get(k) for k in ['contract','direction','publication_id','snapshot_id','canonical_state','lifecycle_event']} for x in j['candidates']],'old_UNI_exact_current_attempt':u,'PR478_native_expiry_branch_accepted':True,'old_failed_attempt_exact_predicate_reconstructed':False,'old_UNI_cause_limit':'This exact new attempt proves verified bound publication expired at its current check. Earlier attempts lacked checked_ts/binding; their exact native-zone failure is not reconstructed.','actual_CT_removal221':ct,'removal_is_not_current_canonical_same_run_SENT':True,'last_current_canonical_exact_SENT':{'run':39155268524,'message_id':'220','contract':'CT-USDT','lifecycle_event':'OBSERVE'},'current_run_canonical_same_run_SENT':False,'actual_ENTRY':False,'DATA_DB_point':usage,'whole_day_closed':False,'old15unknown_preserved':True,'PR481_native_after_fix_accepted':False,'head_contains_PR478_but_precedes_PR481':True,'new_inspection_source_HTTP_SQL_MAIN_Telegram':0,'project_complete':False}
(r/'coordinator-native-review.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'run':out['cloud_run'],'both_persisted':out['both_persisted'],'UNI':u['status'],'UNI_checked_ts':b['checked_ts'],'removal_message_id':ct['message_id'],'current_canonical_same_run_SENT':False,'actual_ENTRY':False,'DATA_DB_point':usage}))
