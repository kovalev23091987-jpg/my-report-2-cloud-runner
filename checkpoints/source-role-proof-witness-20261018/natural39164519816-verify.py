import json,pathlib,zipfile,hashlib
r=pathlib.Path(__file__).parent;d=r/'extracted';load=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
run=load(r/'run.json');arts=load(r/'artifacts.json');j=load(d/'report2-run-result.json');acc=load(d/'report2-completion-accounting.json');delivery=load(d/'same-run-delivery-proof.json');auto=load(d/'automatic-delivery-audit.json');info=load(d/'telegram-info-proof.json')
head='00e103f37774420f00d2043ba94dbd6dbbab2f5e';rid='1792356159202-1792356174618'
assert run['id']==39164519816 and run['status']=='completed' and run['conclusion']=='success' and run['head_sha']==head
assert all(x['head']==head for x in [j,acc,delivery,auto,info]) and all(x['run_id']==rid for x in [j,acc,delivery,auto]) and info['source_run_id']==rid
assert j['status']=='CLOSED' and j['secrets_included'] is False and acc['secret_values_stored'] is False and acc['contains_SQL_params_or_results'] is False
members={}
for a in arts['artifacts']:
 archive=r/('artifact-'+str(a['id'])+'.zip');assert 'sha256:'+sha(archive.read_bytes())==a['digest']
 with zipfile.ZipFile(archive) as z:
  members[str(a['id'])]={n:sha(z.read(n)) for n in z.namelist()}
  for n in z.namelist():assert (d/n).read_bytes()==z.read(n)
scan=j['market_scan_audit'];assert scan['universe_total']==scan['scanned']==105 and scan['scanned_market_data']==99 and scan['complete'] and scan['errors']==scan['stale']==0
persist=j['canonical_persistence_audit'];assert persist['status']=='CLOSED' and persist['run_id']==rid and persist['present_contracts']==['STRK-USDT','WLD-USDT'] and not persist['missing_contracts']
assert [c['contract'] for c in j['candidates']]==['STRK-USDT','WLD-USDT']
assert all(c['run_id']==c['canonical']['run_id']==rid and c['snapshot_id']==c['canonical']['snapshot_id'] and c['canonical_state']=='OBSERVE' for c in j['candidates'])
ctx=acc['existing_run_budget_context'];assert ctx['schema']=='EXISTING_RUN_BUDGET_CONTEXT_V1' and ctx['run_id']==rid and ctx['recorded_ts']<=acc['recorded_ts']
usage={k:acc['usage_after_analytics_lease_release'][k] for k in ['requests','rows_read','rows_written','unknown_ops']};assert usage==ctx['native_run']['usage']=={'requests':719,'rows_read':46872,'rows_written':609,'unknown_ops':0}
assert ctx['native_run']['reservation']=={k:acc['reservation'][k] for k in ['rows_read','rows_written']}=={'rows_read':54000,'rows_written':840} and ctx['native_run']['remaining_at_this_cut']=={'rows_read':7128,'rows_written':231}
assert ctx['HTTP']['used']=={'hot':84,'background':28,'statistics':0} and ctx['HTTP']['limits']=={'whole_job':164,'hot':96,'background':56,'statistics':12} and ctx['HTTP']['total_reserved']==sum(ctx['HTTP']['used'].values())==112 and ctx['HTTP']['reported_remaining_slots']==52
assert ctx['HTTP']['actual_HTTP'] is None and ctx['HTTP']['admissible_extra_HTTP'] is None and ctx['HTTP']['consistent']
assert ctx['earlier_day_admission']['reported_unknown_ops']==acc['day_admission']['daily']['unknown_ops']==15 and ctx['earlier_day_admission']['reconciliation']['historical_unknown_operations_preserved']==15
assert ctx['earlier_day_admission']['reconciliation']['new_or_unmatched_unknown_authorized'] is False and ctx['earlier_day_admission']['reconciliation']['serialized_copy_is_not_a_proof_token'] is True
assert ctx['native_liquidation_service']=={'scope':'EXISTING_NATIVE_LIQ_SERVICE_NOT_ALL_LIQ_PROVIDERS_OR_JOB','reserved_http':4,'gross_reserved_http':None,'claimed_http':None,'actual_http':4,'max_http_per_run':4}
assert ctx['required_next_full_reservation_by_policy']=={'rows_read':59000,'rows_written':920} and ctx['observed_next_full_reservation'] is None
assert all(ctx[k] is None for k in ['provider_day_month_rolling60s_headroom','manual_provider_reserve_headroom','independent_global_native_capacity'])
assert ctx['admission_authorized'] is False and ctx['whole_day_closed'] is False and ctx['native_run']['future_work_admitted'] is False and ctx['additional_SQL']==ctx['additional_source_HTTP']==0
assert delivery['status']=='EXACT_SAME_RUN_SENT_CAPTURED' and delivery['delivery_status']=='CLOSED' and len(delivery['cases'])==1
proof=delivery['cases'][0];candidate=j['candidates'][0]
for k in ['publication_id','contract','direction','wave_id','run_id','snapshot_id','observed_ts','lifecycle_event']:assert proof[k]==candidate[k],k
assert proof['analytical_fingerprint']==candidate['canonical']['analytical_fingerprint'] and proof['telegram_message_id']=='222' and proof['lifecycle_event']=='OBSERVE' and proof['contract']=='STRK-USDT' and proof['direction']=='SHORT'
assert proof['same_run_binding_verified'] and proof['exact_SENT'] and proof['dispatch_finalized'] and proof['task_at_delivery_verified'] and not proof['actual_ENTRY'] and not proof['task_state_after_delivery_known']
task=proof['task_at_delivery'];assert task['state']=='PENDING' and task['run_id']==rid and task['snapshot_id']==candidate['snapshot_id'] and task['due_ts']==1792356600866 and task['expires_ts']==candidate['valid_until_ts']==1792358100866
assert auto['status']=='EXACT_SAME_RUN_SENT_ARTIFACT_VERIFIED' and auto['exact_SENT']==1 and auto['actual_ENTRY']==0
transitions=info['lifecycle']['transitions'];assert transitions[0]['contract']=='STRK-USDT' and transitions[0]['wave_id']==proof['wave_id'] and transitions[0]['current_status']=='OBSERVE' and transitions[1]['contract']=='WLD-USDT' and transitions[1]['status']=='CAPACITY_DEFERRED'
maintenance=acc['statistics']['maintenance'];assert maintenance['scheduled_minute_utc']==42 and maintenance['low_priority_cadence_due'] is False and maintenance['claim']['status']=='NOT_DUE' and maintenance['claim']['claimed'] is False and maintenance['completion'] is None
out={'schema':'POST493_ACTUAL_CONTEXT_AND_STRK_SAME_RUN_DELIVERY_REVIEW_V1','cloud_run':39164519816,'head':head,'run_id':rid,'artifacts':[{k:a[k] for k in ['id','name','digest']} for a in arts['artifacts']],'member_sha256':members,'actual_PR493_completion_context_accepted':True,'context_export_location':'report2-completion-accounting.json.existing_run_budget_context','context_in_report2_run_result_projection':False,'existing_run_budget_context':ctx,'market_scan_audit':{'universe_total':105,'numeric':99,'officially_suspended':6,'complete':True,'errors':0,'stale':0},'both_persisted':persist,'same_run_delivery_proof':proof,'separate_WLD_lifecycle_refusal':transitions[1],'current_canonical_same_run_SENT':True,'message_id':'222','actual_ENTRY':False,'task_after_delivery_current_state':'UNKNOWN_NOT_READ','maintenance':maintenance,'DATA_DB_point':usage,'old15unknown_preserved':True,'whole_day_closed':False,'provider_or_new_native_admission_authorized':False,'new_source_HTTP_nativeSQL_MAIN_Telegram_by_inspection':0,'statistics_or_anomaly_accuracy_qualified':False,'project_complete':False}
(r/'coordinator-native-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'run':39164519816,'actual493context':True,'SENT':True,'message_id':'222','contract':'STRK-USDT','both_persisted':['STRK-USDT','WLD-USDT'],'ENTRY':False,'task_at_delivery':'PENDING','D1':usage,'provider_or_new_native_admission':False}))
