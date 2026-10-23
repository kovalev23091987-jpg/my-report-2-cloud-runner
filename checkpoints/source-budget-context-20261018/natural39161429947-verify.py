import pathlib,json,hashlib,zipfile
r=pathlib.Path(__file__).parent;d=r/'extracted'
j=json.loads((d/'report2-run-result.json').read_text());c=json.loads((d/'report2-completion-accounting.json').read_text());p=json.loads((d/'same-run-delivery-proof.json').read_text());run=json.loads((r/'run.json').read_text());a=next(x for x in json.loads((r/'artifacts.json').read_text())['artifacts'] if x['id']==12148887893)
assert run['id']==39161429947 and run['conclusion']=='success'
assert run['head_sha']==j['head']==c['head']==p['head']=='07703e786565eb2e0bbb4727f70ef6680115c07b'
assert j['run_id']==c['run_id']==p['run_id']=='1792353732784-1792353743745'
assert j['canonical_persistence_audit']['status']=='CLOSED' and set(j['canonical_persistence_audit']['present_contracts'])=={'BTW-USDT','\u9f99\u867e-USDT'}
scan=j['market_scan_audit'];assert scan['universe_total']==scan['scanned']==105 and scan['scanned_market_data']==99 and scan['errors']==scan['stale']==0 and scan['complete'] is True
s=c['statistics'];m=s['maintenance'];cl=m['claim'];co=m['completion']
assert m['schema']=='LOW_PRIORITY_MAINTENANCE_CADENCE_RECEIPT_V1' and m['source']=='schedule' and m['unified_enabled'] and m['scheduled_minute_utc']==2 and m['low_priority_cadence_due']
assert cl['status']=='CLOSED' and cl['claimed'] and cl['due'] and cl['job_key']=='HOURLY_LOW_PRIORITY_STATS' and cl['interval_ms']==3600000
assert cl['lease_started_ts']==1792353846744 and cl['lease_expires_ts']==1792354446744 and cl['lease_started_ts']-cl['last_success_ts']>=cl['interval_ms']
assert co=={'status':'CLOSED','completed':True,'success_recorded':True} and m['projection_SQL_added']==m['projection_HTTP_added']==0
recall=s['discovery_recall'];assert recall['status']=='PARTIAL' and recall['persisted'] and recall['persistence_readback']=='PASS' and recall['horizons']['4h']['matched_contracts']==99 and recall['horizons']['4h']['status']=='CLOSED'
assert recall['horizons']['1h']['reason']==recall['horizons']['24h']['reason']=='BASELINE_SNAPSHOT_MISSING'
pro=s['prospective'];assert pro['status']=='CLOSED' and pro['readiness']['ready_cells']==0 and pro['readiness']['total_cells']==8 and not pro['readiness']['validated_out_of_sample'] and not pro['automatic_weight_tuning']
assert pro['early_outcome']['outcome_id']=='EDW:FIL-USDT:1792233006098:G17:H12' and pro['early_outcome']['reason']=='NO_FACTUAL_PATH' and pro['early_outcome']['rows_loaded']==0
assert s['block_weights']['status']=='WEEKLY_POLICY_ALREADY_ASSESSED'
assert not p['cases'] and p['status']=='NO_EXACT_SAME_RUN_SENT_CAPTURED' and c['delivery']['sent']==0
usage={k:c['usage_after_analytics_lease_release'][k] for k in ['requests','rows_read','rows_written','unknown_ops']};assert usage=={'requests':687,'rows_read':49233,'rows_written':685,'unknown_ops':0}
assert c['day_admission']['daily']['unknown_ops']==15 and not c['day_admission']['daily']['native_cost_reconciliation']['new_or_unmatched_unknown_authorized']
with zipfile.ZipFile(r/'artifact-12148887893.zip') as z:members={n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}
out={'schema':'POST487_EXACT_NATURAL_MAINTENANCE_AND_STATISTICS_REVIEW_V1','cloud_run':39161429947,'head':j['head'],'run_id':j['run_id'],'artifact':a['id'],'digest':a['digest'],'member_sha256':members,'market_scan_audit':scan,'both_persisted':j['canonical_persistence_audit'],'pipeline_health':j['pipeline_health'],'candidate_identities':[{k:x.get(k) for k in ['contract','direction','publication_id','snapshot_id','canonical_state','lifecycle_event','actionability_status']} for x in j['candidates']],'actual_PR487_maintenance_receipt_accepted':True,'maintenance':m,'statistics':s,'statistics_limits':['Completion success uses existing recall/prospective predicate, not all3 statistics.','PARTIAL descriptive4h tail KPI is not predictive trading accuracy.','Missing1h/24h baseline and FIL factualpath are not zero or adverse market outcomes.','Readiness0/8 with no samples is not calibration or weight activation.','One observed FIL hole does not establish starvation: existing module advances durable RECENT/RETAINED cursor before path lookup; queue tests not repeated.','Earlier lost claim reason remains UNKNOWN, not reconstructed from this later receipt.'],'current_canonical_same_run_SENT':False,'actual_ENTRY':False,'DATA_DB_point':usage,'old15unknown_preserved':True,'whole_day_closed':False,'reserved_run_headroom_at_after_lease_cut_only':{'rows_read':54000-usage['rows_read'],'rows_written':840-usage['rows_written']},'new_source_or_budget_admission_authorized':False,'old_standalone_budget_reader_protocol':'REJECTED_NOT_IMPLEMENTED_NOT_RUN','source_HTTP_SQL_MAIN_Telegram_added_by_inspection':0,'project_complete':False}
(r/'coordinator-native-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'run':out['cloud_run'],'maintenance_claim':cl['status'],'completion':co,'recall':recall['status'],'prospective':pro['status'],'ENTRY':False,'current_SENT':False,'D1':usage}))
