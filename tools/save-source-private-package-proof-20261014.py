import collections, datetime, gzip, json, pathlib

root=pathlib.Path(__file__).resolve().parents[1]
read=lambda p:json.loads(gzip.decompress((root/p).read_bytes()))
report=read('checkpoints/active-natural-38492931437/report2-run-result.json.gz')
delivery=read('checkpoints/active-natural-38492931437/same-run-delivery-proof.json.gz')
private=read('checkpoints/active-natural-38492931437/private-canonical-archive-receipt.json.gz')
records=[]
for c in report['candidates']:
    blocks=c['block_coverage']['blocks'];l=c['canonical']['liquidations']
    item={k:c[k] for k in ['contract','publication_id','run_id','snapshot_id','observed_ts','canonical_state']}
    item['active_blocks']={key:{'status':blocks[key]['status'],'checked':blocks[key]['checked'],'context_facts':blocks[key]['valid_context_facts']} for key in ['N04','N05','N10','N11','N12','N15']}
    item['manual_rendered']=c['block_rendered_results']['used_context_block_ids']
    item['paused_excluded']=all(blocks[k]['status']=='BLOCK_PAUSED_BY_OWNER' and not blocks[k]['source_checks'] for k in ['N01','N02','N03','N06','N07','N08','N09','N14','N16'])
    item['future_levels']={'status':l['status'],'provider_zone_count':l['provider_zone_count'],'vendor_scenario_count':l['calculated_scenario_count'],'source_rows':[{'source':s,'kind':kind,'count':n} for (s,kind),n in collections.Counter((x.get('source'),x.get('kind')) for x in l.get('all_zones',[])).items()],'models':sorted({x.get('source') for x in l['calculated_scenarios']})}
    records.append(item)
proof={
 'schema':'ACTIVE_SOURCE_NATIVE_BUDGET_AND_PRIVATE_FORECAST_20261014_V1',
 'recorded_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'prior_main':'6426d4d0662bd4722b8287c6d4952f5e0236f89c',
 'last_runtime_commit':'29b4ee19429af54c33f4f8f626ef7237182ae185',
 'current_task':'LIQ_MAXIMUM_USEFUL_COVERAGE_IN_PROGRESS',
 'own_lease':'CODEX:PRIVATE_RESTORE_AND_ACTIVE_SOURCE_AUDIT:1791935767000',
 'source_network_HTTP_added_by_agent':0,'forced_MAIN_runs':0,'new_Telegram_messages_sent_by_agent':0,
 'index_economy_natural':'checkpoints/ACTIVE_INDEX_ECONOMY_NATURAL_20261014.json',
 'cloud_checks':[
  {'run':38488191853,'head':'d1a4a9738c4f55fe1617c691b5e38cb33681b25e','status':'SUCCESS','new_private_forecast_tests':8},
  {'run':38492679468,'head':'efb25f87e63cd9d3eb64e43e965239c388d49d59','status':'SUCCESS','native_budget_tests':17,'native_original_replay_and_batch_tests':24},
  {'run':38493181614,'head':'29b4ee19429af54c33f4f8f626ef7237182ae185','status':'SUCCESS','native_budget_tests':18,'native_original_replay_and_batch_tests':24}],
 'cloud_failure_history':[
  {'run':38490359488,'head':'2b0ca405fa855fda1bf05b0b77937e893c4c2a87','reason':'New fixture disabled automatic dYdX capability; old wiring test omitted current guardedParams.'},
  {'run':38492446337,'head':'7bb83469f7e80aea9a2eafc7434720a649c31446','reason':'New fixture omitted actual bounded-trader-array native getter shape for four QNT IDs. Both original shapes now replayed.'}],
 'native_acquisition_changes':{
  'remaining_complete_chain_preflight_before_prices':True,'one_unusable_following_reserve_can_finish_exact_current_position':True,
  'unknown_and_viable_one_or_two_request_following_routes_keep_reserve':True,'unused_first_room_passed_to_second_with_explicit_caller_ceiling':True,
  'internal_local_budget_refusal_not_supplier_fault':True,'source_weight_values_not_reset':True,
  'native_total_HTTP_cap':4,'overall_LIQ_HTTP_cap':8,'whole_report_HTTP_cap':164,'no_local_HTX_model_enabled':True,
  'old_QNT_original_source_ts':1791273469000,'old_source_control_replay_HTTP_calls':3,'old_source_control_replay_is_not_new_current_coverage':True},
 'native_monthly_cap_census':'checkpoints/NATIVE_INTERNAL_MONTHLY_CAP_AUDIT_20261014.json',
 'private_forecast_consumer':{
  'candidate':'checkpoints/PRIVATE_FORECAST_CONSUMER_CANDIDATE_20261014.json','deployed_run':38488319372,
  'deployed_head':'d1a4a9738c4f55fe1617c691b5e38cb33681b25e','worker_version_id':'20050415-61a2-48b7-bf4a-edcfe08e53c3',
  'worker_name':'my-report-2-liq-forecast-history','private_binding':'f66e7081-0e67-49a2-8f69-68af00cdaf92',
  'natural_first_scheduled_ts':1791938160000,'natural_reservation':'PRIVATE_FORECAST:497760','natural_reservation_finalized':True,
  'native_ledger_measured_reads':24,'native_ledger_measured_writes':13,'native_ledger_requests':13,'unknown_ops':0,
  'natural_original_OP_CT_forecasts_recorded':True,'actual_private_header_consumer_on_production_not_yet_proven':True,
  'source_primary_kept_originals':True,'retry_cursor_preserved_when_private_unavailable_or_corrupt':True,
  'day_reserved_reads':2893000,'day_reserved_writes':50632,'max_daily_reads':3500000,'max_daily_writes':70000},
 'canonical_clock_index':{
  'DDL':'cloudflare/free-history/004_canonical_observation_index.sql','reservation':'CODEX_CANONICAL_INDEX:1791937788000',
  'rows_before':256,'index':'report2_canonical_observed_pub_v1','query_plan_verified_uses_index':True,
  'index_created_measured_reads':519,'index_created_measured_writes':257,'measured_successful_native_operations':{'requests':8,'rows_read':1187,'rows_written':261},
  'api_validation_failure_saved':'checkpoints/canonical-index-native-20261014/index_schema_raw.json',
  'api_validation_failure_reason':'params with multiple statements is not supported','failed_API_native_usage_returned':False,
  'no_claim_of_measured_zero_for_failed_API_request':True,'native_statement_telemetry_and_API_validation_failure_are_separate':True,
  'reservation_ceiling_retained_without_reset':{'reads':10000,'writes':8000},'original_rows_not_modified':True,
  'primary_measured_bytes_after':468975616,'free_pages_known':False},
 'production_readback_extra_reservation':{'id':'CODEX_FORECAST_READBACK:1791939098000','reserved_reads':2000,'reserved_writes':32,'measured_before_finalization':{'requests':4,'rows_read':28,'rows_written':3},'finalization_extra':{'requests':1,'rows_read':1,'rows_written':1},'status':'FINALIZED'},
 'latest_natural_full_report':{'cloud_run':38492931437,'head':report['head'],'run_id':report['run_id'],'status':report['status'],'source':report['source'],'scan':{k:report['market_scan_audit'][k] for k in ['scanned','errors','stale','complete']},'candidates':records,'native_budget':report['liquidation_source_acquisition_audit']['shared_budget'],'new_QNT_gTrade_specific_case_naturally_verified':False,'same_run_delivery':delivery,'private_copy':private,'report_artifact_id':11863270018,'report_artifact_digest':'sha256:2d836e5337c8c4f19fd0179f82605adebc2bc01c20cd3ec41931ac6678a7d03e'},
 'venue_independence':'Hyperliquid and Orderly are distinct primary venues; CoinBoss aggregate model is not an independent venue vote.',
 'latest_confirmed_same_run_SENT':{'cloud_run':38484212820,'head':'6426d4d0662bd4722b8287c6d4952f5e0236f89c','run_id':'1791933985754-1791934005017','contract':'LSK-USDT','message_id':'200','actual_ENTRY':False,'scope':'Original LSK OBSERVE; not latest NEAR/ZEC delivery'},
 'current_saved_use_census':'checkpoints/ACTIVE_SAVED_SOURCE_USE_CENSUS_20261014_FINAL29.json',
 'saved_files':'checkpoints/ACTIVE_PACKAGE_SAVED_FILES_20261014.json','artifact_metadata':'checkpoints/ACTIVE_PACKAGE_ARTIFACT_METADATA_20261014.json',
 'historical_numeric_LIQ':{'eligible':103,'historical_any_numeric':72,'old_numerical_gaps':31,'position_origin_historical':58,'simultaneous_all103_current_coverage':False},
 'unchanged':{'active_blocks':['N04','N05','N10','N11','N12','N15'],'paused_blocks':['N01','N02','N03','N06','N07','N08','N09','N14','N16'],'missing15_HTX_spot_not_replaced':True,'funding_10_15_policy':True,'LIQ_display3_above3_below':True,'core_strategy_and_weights':True,'manual_Telegram_form':True},
 'remaining':[
  'Exact cold-read path for direct price/cancellation Worker and backup, protected active references, rolling/backlog retention; no hot pruning enabled.',
  'Native NEAR/ZEC N04 context unavailable in latest report; full current105 usefulness needs typed corpus/capability work.',
  '31 LIQ numerical proof gaps; do not claim every possible free provider was exhausted.',
  'Conditional GTRADE4000 and DYDX1000 monthly caps do not cover every cold scheduled scenario; quota, utility and fallback reconciliation remains. No cap raised without evidence.',
  'Exact40-minute wall-clock start and full-day/month continuity including manual reserves unproven; observed natural spacing45min.',
  'New gTrade-specific borrower case needs a qualifying natural pair; final classifier29b4 has cloud proof, latest naturalefb25 predates that attribution-only correction.',
  'Entry-decision score and final Telegram form remain mandatory and deferred.'],
 'project_complete':False,'all_blocks_complete':False,'hot_originals_deleted_by_this_package':0}
(root/'checkpoints/ACTIVE_SOURCE_NATIVE_BUDGET_AND_PRIVATE_FORECAST_20261014.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print('Saved consolidated runtime, native billing and original report proof')
