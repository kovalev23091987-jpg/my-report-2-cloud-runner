"""T retained metadata snapshot join. No HTTP, JS evaluation or classifications from names."""
from pathlib import Path
from collections import Counter,defaultdict
import json,hashlib,time
B=Path(__file__).resolve().parent;ROOT=B.parent.parent.parent
H=lambda b:hashlib.sha256(b).hexdigest()
def J(p):return json.loads(p.read_text())
def S(n,x):(B/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
A=J(B/'T_TRADES_AUTHORITY_V1.json');assert time.time()*1000<A['lease']['expires_ts']
old_hashes={'PACKAGE_FULL_UNIVERSE_TZ_SOURCES_FINAL_V1.json':'9b4fe68bc796dfc1adfb49a2400ccac0bf277c744e117882ff9e78208a204f5a','PACKAGE_OFFLINE_REQUEST_CLOCK_FINAL_V1.json':'c1a556d346fcb7e551ed8f0e4616407ed102878788d4a24c225fe5517320b850','PACKAGE_ANONYMOUS_DISPLAY_INFO_FACTORY_FINAL_V1.json':'00170ce51c86a0ad55b18f5b70a5179e417af88adb9476554279d619978b2900'}
for n,h in old_hashes.items():assert H((B/n).read_bytes())==h
rp=Path('/private/tmp/pump-corrected-metadata-actual.json');raw=rp.read_bytes();assert H(raw)=='66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9'
original=json.loads(raw);b=original['body'];response=b['response'];envelope=response['data'];data=envelope['data'];records=data['result']
assert response['status']==200 and envelope['code']==0 and isinstance(data,dict) and data['searchResult'] is True
assert len(records)==5673
assert all(set(r)=={'coinId','coinName','coinDisplayName','coinType','coinIconUrl'} for r in records)
assert all(isinstance(r['coinType'],int) and isinstance(r['coinName'],str) and isinstance(r['coinId'],int) for r in records)
assert response['receipt_id']=='9c3ba708-0e31-4ebb-b128-3c09ba22cb8b'
assert b['normalized_response_sha256']=='fb6f7cd100a0b2d3a5a9a537b81fba632f1c732de397c07493014a51d7d03f63'
assert b['native_receipt']['state']=='FINALIZED' and b['native_receipt']['usage']=={'requests':11,'rows_read':21,'rows_written':8,'unknown_ops':0}
assert b['resources']['total']==1 and b['resources']['receipts'][0]['state']=='CONFIRMED'
byname=defaultdict(list);byid=defaultdict(list)
for r in records:byname[r['coinName']].append(r);byid[str(r['coinId'])].append(r)
assert len(byname)==5673 and len(byid)==5673
cp=Path('/private/tmp/pump-report-native-catalog-corrected.json');cr=cp.read_bytes()
assert H(cr)=='7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5'
cat=json.loads(cr)['body']['response']['data']['data']
active=[r for r in cat if r.get('status')==1 and r.get('currency')=='USDT' and r.get('symbol','').endswith('-USDT')]
assert len(active)==934
prior=J(B/'FULL_UNIVERSE_934_MATRIX_V1.json');assert len(prior['rows'])==934
native={(str(r['contractId']),r['symbol']):r for r in active}
joined=[];cross=Counter();idcoincidences=[]
for p in prior['rows']:
 n=native[(p['contract_id'],p['symbol'])]
 assert p['native_asset']==n['asset'] and len(byname[n['asset']])==1
 m=byname[n['asset']][0];cross[(str(m['coinType']),p['classification'])]+=1
 equalid=byid.get(str(n['contractId']),[])
 if len(equalid)==1:
  idcoincidences.append({'native_contract_id':str(n['contractId']),'native_asset':n['asset'],'metadata_coinId':equalid[0]['coinId'],'metadata_coinName':equalid[0]['coinName'],'same_native_asset':equalid[0]['coinName']==n['asset']})
 row={k:p[k] for k in ['contract_id','symbol','native_asset','base','quote','settle','asset_id','classification','identity_evidence_ref','owner_delivery_excluded','delivery_eligible_verified','membership_capture_ts','current_membership_verified']}
 row.update({'metadata_name_match':{'coinId_raw':m['coinId'],'coinName_exact':m['coinName'],'coinDisplayName_exact':m['coinDisplayName'],'coinType_raw':m['coinType'],'coinType_present_in_native_reply':True,'coinIconUrl_present':bool(m['coinIconUrl']),'match_kind':'EXACT_CASE_SENSITIVE_NATIVE_ASSET_COINNAME_UNIQUE_CANDIDATE_ONLY','canonical_contract_bridge_proven':False,'coinType_semantic_label':None,'is_positive_crypto_evidence':False},
 'new_identity_promotion':False,'execution_scale_to_underlying':None,'execution_scale_reason':'NOT_ESTABLISHED_FROM_METADATA_OR_DIGITS_IN_SYMBOL','native_name_starts_with_digits':bool(n['asset'] and n['asset'][0].isdigit()),
 'new_market_units_qualified':False,'new_core_qualification_copied':False,'market_coverage_from_prior_frozen_audit':p['fact_states'],'current_market_coverage_verified_by_this_join':False})
 joined.append(row)
assert Counter(r['metadata_name_match']['coinType_raw'] for r in joined)==Counter({0:554,5:380})
assert len([r for r in joined if r['classification']=='VERIFIED_CRYPTO'])==13
assert len([r for r in joined if r['classification']=='UNKNOWN_UNDERLYING'])==919
assert len([r for r in joined if r['delivery_eligible_verified']])==11
assert len(idcoincidences)==2 and all(not r['same_native_asset'] for r in idcoincidences)
names=['bingx-taxonomy-static-api-core.js','bingx-taxonomy-static-entry.js','bingx-taxonomy-static-price-detail.js','bingx-taxonomy-static-price-list.js','bingx-taxonomy-static-services.js','bingx-taxonomy-static-service-config.js','bingx-full-universe-CeOxKRS_.js','bingx-full-universe-qnxfTekn.js','bingx-full-universe-B0gMG_C0.js','bingx-full-universe-layout.js','bingx-full-universe-api-plugin.js','bingx-full-universe-BpjWgUVE.js']
static=[]
for name in names:
 p=Path('/private/tmp')/name;bb=p.read_bytes();s=bb.decode()
 static.append({'path':str(p),'sha256':H(bb),'bytes':len(bb),'literal_coinType_occurrences':s.count('coinType'),'literal_contractId_occurrences':s.count('contractId'),'executed':False})
core=(Path('/private/tmp')/names[0]).read_bytes();consumer=b'coinId:d.id||"",coinName:d.coinName||"",coinDisplayName:d.coinDisplayName||"",coinIconUrl:d.coinIconUrl||"",coinType:d.coinType||0'
at=core.index(consumer)
known_names=['BTC','ETH','SOL','XRP','DOGE','ADA','BNB','SUI','AVAX','LINK','LTC','DOT','TRX','PAXG','XAUT']
known=[{k:byname[n][0][k] for k in ['coinId','coinName','coinDisplayName','coinType']} for n in known_names]
provenance={'private_input':{'path':str(rp),'file_bytes':len(raw),'file_sha256':H(raw),'original_control_response_raw_sha256':original['raw_sha256'],'ROOT_normalized_response_sha256':b['normalized_response_sha256']},'run_id':b['run_id'],'receipt_id':response['receipt_id'],'provider':'BINGX_WEB_METADATA','provider_url':'https://api-app.acc-de.com/api/coin/v1/display-info/list','http_status':response['status'],'business_code':envelope['code'],'provider_metadata_response_timestamp':envelope['timestamp'],'metadata_clock_scope':'Response metadata timestamp; not asset-specific market event time','original_broker_received_ts':response['received_ts'],'control_started_ts':original['started_ts'],'control_received_ts':original['received_ts'],'per_asset_event_ts':None,'per_asset_event_clock_reason':'NO_EVENT_CLOCK_FIELD_IN_METADATA_ROW','native_catalog_private_input':{'path':str(cp),'sha256':H(cr)},'catalog_membership_capture_ts':prior['rows'][0]['membership_capture_ts'],'catalog_to_metadata_receive_age_ms':response['received_ts']-prior['rows'][0]['membership_capture_ts'],'snapshot_join_only':True,'fresh_native_membership_claim':False}
result={'schema':'PUMP_T_CORRECTED_METADATA_ACTUAL_REVIEW_V1','status':'ACTUAL_CODE0_METADATA_ACCESS_PROVEN_ENUM_AND_NATIVE_BRIDGE_UNQUALIFIED','authority':A,'provenance':provenance,'native_schema':{'path':'body.response.data.data.result','envelope_keys':list(envelope),'data_keys':list(data),'searchResult_type':'boolean','searchResult_value':True,'result_rows':5673,'row_keys':sorted(records[0]),'unique_coinNames':5673,'unique_coinIds':5673,'explicit_raw_coinType_counts':dict(Counter(str(r['coinType']) for r in records))},'all934_exact_name_join':{'unique_exact_matches':934,'ambiguous':0,'missing':0,'raw_type_counts':{'0':554,'5':380},'cross_classification':[{'coinType_raw':int(k[0]),'retained_classification':k[1],'count':v} for k,v in cross.items()],'not_canonical_bridge':'Native asset-name equality is useful candidate linkage, not the forbidden ticker-only canonical proof. No direct coinId/native contractId bridge field or semantic mapping is present.'},'id_namespace_guard':{'coinId_is_native_contractId':False,'coincidental_equal_numeric_IDs_with_different_assets':idcoincidences,'BTC_metadata_coinId':1,'BTC_native_contractId':'100','ETH_metadata_coinId':242,'ETH_native_contractId':'101'},'retained_static_review':{'files':static,'public_coinType_enum_definition_found':False,'canonical_contractId_coinId_bridge_found':False,'consumer_fragment':{'file':str(Path('/private/tmp')/names[0]),'file_sha256':H(core),'byte_start':at,'byte_end_exclusive':at+len(consumer),'span_sha256':H(consumer),'observed_id_projection':'coinId:d.id||empty, while actual rows expose coinId not id','observed_type_projection':'coinType:d.coinType||0, default0 explicitly not positive type proof'},'semantic_inference_from_known_examples_allowed':False,'separate_fiat_integration_coinType_param_is_this_enum_proof':False},'known_examples_metadata_only':known,'crypto_classification':{'retained_verified_crypto':13,'owner_BTC_ETH_delivery_excluded_within_crypto':2,'delivery_eligible_retained':11,'retained_gold_backed_excluded':2,'unresolved':919,'unresolved_raw_type0':539,'unresolved_raw_type5':380,'new_promotions':0,'new_exclusions_from_enum_or_names':0,'complete_crypto_N':None,'do_not_assign_N552':'Raw type0 includes13known/2gold/539unknown, but no official enum definition; type5 label and canonical bridge also unknown.'},'language_and_scaling':{'all_scripts_allowed_after_positive_crypto_qualification':True,'metadata_nonASCII_coinNames':sum(not r['coinName'].isascii() for r in records),'metadata_nonASCII_displayNames':sum(not r['coinDisplayName'].isascii() for r in records),'native934_nonASCII_symbols':sum(not r['symbol'].isascii() for r in active),'no_transliteration_or_prefix_strip':True,'scaled_contract_underlying_price_factor':None,'do_not_copy13qualifications_to_new_rows':True},'one_required_primary_basis':'Authoritative exact coinType enum meaning + official canonical/native bridge linking display coinId/coinName to OpenAPI contractId/native asset, including scaled-contract semantics where applicable. No new source search or request admitted.','costs':{'corrected_attempts':1,'corrected_attempt_state':'CONFIRMED_SPENT','native':b['native_receipt']['usage'],'provider_metadata_cumulative_ROOT_reported':'2of2SPENT','ROOT_reported_cumulative':{'provider_attempts':22,'native_requests':365,'rows_read':761,'rows_written':235,'SQL_unknown':0,'old_provider_UNKNOWN_preserved':2},'SQL_unknown0_does_not_clear_provider_UNKNOWN':True},'new_SOURCE_HTTP_SQL_TG_deploy':0,'raw_market_values_exported':False,'new_live_coverage_claim':False}
S('T_CORRECTED_METADATA_ACTUAL_REVIEW_V1.json',result)
S('T_METADATA_934_SNAPSHOT_JOIN_V1.json',{'schema':'PUMP_T_METADATA_934_SNAPSHOT_JOIN_V1','status':'AUDIT_NAME_MATCHES_NO_NEW_CRYPTO_CLASSIFICATION','provenance':provenance,'rows':joined,'counts':result['crypto_classification'],'new_metadata_type_semantic_qualification':False,'new_native_bridge_qualification':False,'new_core_native_checks_by_SOURCE':0,'all_old_unknowns_and_owner_exclusions_preserved':True})
for n,h in old_hashes.items():assert H((B/n).read_bytes())==h
S('T_METADATA_JOIN_INTEGRITY_V1.json',{'schema':'PUMP_T_METADATA_JOIN_INTEGRITY_V1','status':'PASS_AUDIT_ONLY','performed_ts':int(time.time()*1000),'authority':A,'one_affected_static_integrity':True,'checks':{'private_corrected_file_exactSHA':True,'actual_code0_nested5673schema':True,'receipt_original_clock_cost_fields_checked':True,'all934_native_tuples_exact_and_unique_name_matches':True,'rawtype0_554_type5_380':True,'known13_gold2_unknown919_delivery11_preserved':True,'ID_namespace_coincidences_not_promoted':True,'no_default0_ticker_language_scaledprefix_identity_inference':True,'no13core_qualification_copied':True,'old3frozen_manifests_unchanged':True,'no_new_network_or_downloadedJS_execution':True},'native_access_only':'HTTP200/code0 actual, not semantic classification or live universe coverage','new_crypto_promotions':0,'new_source_code_changes':0,'new_HTTP_SQL_TG_deploy':0,'old_tests_replayed':0})
print(json.dumps({'status':'PASS_AUDIT_ONLY','metadata_rows':5673,'snapshot_join_rows':934,'raw_type0':554,'raw_type5':380,'new_promotions':0,'retained_crypto':13,'unknown':919,'full_crypto_N':None,'newIO':0}))

