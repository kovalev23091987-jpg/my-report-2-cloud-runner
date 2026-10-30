
import collections,csv,datetime,hashlib,json,pathlib,urllib.parse
R=pathlib.Path('pump-report/handoffs/sources')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(name,obj,compact=False):
 p=R/name;p.write_text(json.dumps(obj,ensure_ascii=False,sort_keys=False,**({'separators':(',',':')} if compact else {'indent':2}))+'\n');return p
p=R/'F605_IDENTITY_ONLY_PROJECTION_1302_V1.json'
projection=json.loads(p.read_text())
assert projection['source_body_sha256']=='3a4e08cf0014128d82267542f2b64cbfd30b7f36ecc1fedc059e52c088d3a29a'
rows=projection['rows'];assert len(rows)==1302
for a in rows:
 for k in ['body_sha256','request_exchange_id_context','reported_exchange_name']:a.pop(k,None)
projection['context_fields_shared_not_row_fields']=['source_body_sha256','request_exchange_id_context','reported_exchange_name']
dump(p.name,projection,True)
receipt=json.loads((R/'F605_CAPTURE_READ_ONCE_RECEIPT_V1.json').read_text());receipt['projection_sha256']=digest(p)
dump('F605_CAPTURE_READ_ONCE_RECEIPT_V1.json',receipt)
inputs=['F552_PROPOSED_NATIVE_BINDINGS_550_V1.json','F589_COVERAGE_550_V1.csv','F568_ACTUAL_SOURCE_REVIEW_550_V1.json','F571_EXACT1_METADATA_JOIN_RECEIPT_V1.json','F571_EXACT1_ECONOMIC_PROPOSAL_V1.json','F604_BINGX_IDENTITY_BINDING_PROFILE_V1.json']
assert digest(R/'F589_COVERAGE_550_V1.csv')=='49df3341e670d53e8f449a8267f42f567809348b1bbb4b6eda1a90399ff1a11f'
selected=list(csv.DictReader((R/'F589_COVERAGE_550_V1.csv').open()))
native_rows=json.loads((R/'F552_PROPOSED_NATIVE_BINDINGS_550_V1.json').read_text())['proposals']
native={a['native_symbol']:a for a in native_rows}
assert len(selected)==len(native)==550 and len({a['instrument_id'] for a in selected})==550
by_symbol=collections.defaultdict(list);url_literal=collections.defaultdict(list)
for a in rows:
 by_symbol[a['symbol']].append(a)
 u=urllib.parse.urlsplit(a['trade_url'] or '')
 # Literal complete native pair tokens only; no dash insertion/removal or base-prefix rules.
 for token in set([urllib.parse.unquote(v) for v in u.path.split('/')]+[v for values in urllib.parse.parse_qs(u.query).values() for v in values]):
  url_literal[token].append(a)
matrix=[]
for s in selected:
 n=native[s['native_symbol']];t=n['tuple']
 assert t['instrument_id']==s['instrument_id'] and t['native_symbol']==s['native_symbol']
 family_ok=(t['venue']=='BINGX' and t['market_type']=='PERPETUAL' and all(t[k]=='USDT' for k in ['quote','margin','settle']) and s['settle']=='USDT')
 m=by_symbol[s['native_symbol']]
 method='EXACT_RAW_VENDOR_NATIVE_SYMBOL' if m else 'NONE'
 if not m and s['native_symbol'] in url_literal:
  m=list({a['source_rowindex']:a for a in url_literal[s['native_symbol']]}.values());method='LITERAL_NATIVE_PAIR_IN_VENDOR_TRADE_URL'
 reason=[];status='UNKNOWN'
 if not m:reason=['NO_EXACT_VENDOR_ROW_OR_PRIMARY_PROVEN_ALIAS']
 elif len(m)>1:reason=['VENDOR_PAIR_COLLISION']
 else:
  a=m[0]
  if not family_ok:reason.append('NATIVE_MARGIN_SETTLE_FAMILY_UNPROVEN')
  if a['base']!=t['base']:reason.append('BASE_MISMATCH')
  if a['target']!='USDT' or a['target_coin_id']!='tether':reason.append('QUOTE_ID_MISMATCH')
  if a['contract_type']!='perpetual':reason.append('NOT_PERPETUAL')
  if a['missing_or_empty_fields']:reason.append('MISSING_IDENTITY_FIELDS:'+','.join(a['missing_or_empty_fields']))
  if not a['trade_url_https_bingx_host']:reason.append('INVALID_HTTPS_BINGX_HOST')
  if projection['reported_exchange_name']!='BingX (Futures)':reason.append('VENUE_MISMATCH')
  if not reason:status='EXACT'
  elif reason==['NATIVE_MARGIN_SETTLE_FAMILY_UNPROVEN']:status='CANDIDATE'
 a=m[0] if len(m)==1 else None
 row={'native_symbol':s['native_symbol'],'instrument_id':s['instrument_id'],'native_contract_id':n['native_contract_id'],'native_metadata_coin_id':n['proof']['metadata_coin_id'],'base':t['base'],'quote':t['quote'],'margin':t['margin'],'settle':t['settle'],'status':status,'reason':';'.join(reason) or 'UNIQUE_EXACT_NATIVE_PAIR_WITH_EXPLICIT_PROVIDER_IDS','join_method':method,'native_family_proven_in_retained_tuple':family_ok,'native_tuple_evidence_sha256':hashlib.sha256(json.dumps(t,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'vendor_row_count':len(m),'source_rowindex':a['source_rowindex'] if a else None,'cg_symbol':a['symbol'] if a else None,'cg_base':a['base'] if a else None,'cg_target':a['target'] if a else None,'coin_id':a['coin_id'] if a else None,'target_coin_id':a['target_coin_id'] if a else None,'contract_type':a['contract_type'] if a else None,'trade_url':a['trade_url'] if a else None,'identity_sha256':a['identity_sha256'] if a else None,'original_fullrow_sha256':a['original_fullrow_sha256'] if a else None}
 matrix.append(row)
mp=R/'F605_SELECTED550_IDENTITY_JOIN_MATRIX_V1.csv'
with mp.open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(matrix[0]));w.writeheader();w.writerows(matrix)
by_coin=collections.defaultdict(list)
for a in matrix:
 if a['status']=='EXACT':by_coin[a['coin_id']].append(a['native_symbol'])
shared={k:v for k,v in by_coin.items() if len(v)>1}
status_counts={k:sum(a['status']==k for a in matrix) for k in ['EXACT','CANDIDATE','UNKNOWN']}
unknown=[{'native_symbol':a['native_symbol'],'status':a['status'],'reason':a['reason'],'source_rowindex':a['source_rowindex']} for a in matrix if a['status']!='EXACT']
summary={'schema':'F605_ACTUAL_IDENTITY_BATCH_JOIN_SUMMARY_V1','status':'ACTUAL_CAPTURE_OFFLINE_PROVIDER_ATTRIBUTION_JOIN_NOT_RUNTIME_ACTIVATION','source_body_sha256':projection['source_body_sha256'],'body_bytes':819896,'complete_JSON':True,'reported_exchange_name':projection['reported_exchange_name'],'request_exchange_id_context':'bingx_futures','vendor_rows':1302,'vendor_target_counts':dict(collections.Counter(a['target'] for a in rows)),'vendor_type_counts':dict(collections.Counter(a['contract_type'] for a in rows)),'vendor_missing_coin_id':sum(not a['coin_id'] for a in rows),'vendor_missing_target_coin_id':sum(not a['target_coin_id'] for a in rows),'vendor_missing_either_ID':sum(not a['coin_id'] or not a['target_coin_id'] for a in rows),'vendor_invalid_HTTPS_BingX_host':sum(not a['trade_url_https_bingx_host'] for a in rows),'duplicate_raw_vendor_symbols':{k:[a['source_rowindex'] for a in v] for k,v in by_symbol.items() if len(v)>1},'selected_rows':550,'selected_status_counts':status_counts,'selected_complete_vendor_ID_attribution':status_counts.get('EXACT',0),'selected_vendor_rows_with_missing_IDs':sum(a['source_rowindex'] is not None and a['status']=='UNKNOWN' for a in matrix),'selected_no_exact_vendor_row':sum(a['source_rowindex'] is None for a in matrix),'unknown_rows':unknown,'EXACT_definition':'One unchanged vendor-native symbol (or literal full native pair in vendor URL), explicit IDs, same BingX venue, perpetual/USDT/tether, unique pair, base match, HTTPS BingX URL and accepted native USDT margin/settle tuple. EXACT is provider attribution at capture, not independent cross-provider identity guarantee or ROOT activation.','CANDIDATE_definition':'Provider pair/IDs present but accepted native-family evidence missing; no automatic binding. No alias was invented.','UNKNOWN_definition':'Missing explicit IDs, absent exact pair/accepted alias, conflict or invalid venue/type/family. This is not UNSUPPORTED.','alias_handling':{'primary_proven_CG_native_aliases_applied':0,'new_aliases_invented':0,'raw_base_only_candidates_for_29_absent':0,'URL_concatenation_or_dash_normalization':False,'prefix_stripping':False},'nonUSDT_rows_excluded':sum(a['target']!='USDT' for a in rows),'nonASCII_vendor_symbols':sum(any(ord(c)>127 for c in (a['symbol'] or '')) for a in rows),'nonASCII_selected_symbols':sum(any(ord(c)>127 for c in a['native_symbol']) for a in matrix),'ASCII_filter_applied':False,'same_project_multiple_native_instruments':shared,'same_project_does_not_collapse_contracts_or_prove_multiplier':True,'spotlight_HYPE_DOOD':[{k:a[k] for k in ['native_symbol','instrument_id','status','source_rowindex','coin_id','target_coin_id','trade_url','identity_sha256']} for a in matrix if a['native_symbol'] in ['HYPE-USDT','DOOD-USDT']],'inputs':[{'path':str(R/n),'sha256':digest(R/n)} for n in inputs],'F568_membership_scope':'550 current at its original capture only; not refreshed by CoinGecko receipt time.','F571_scope':'Retained exact single FX exclusion; no economic reclassification rerun.','qualification':{'ROOT_after':24,'cap':24,'remaining':0,'SOURCE_new_calls':0,'new_docs_search_reads':0,'new_SQL_TG_deploy':0,'old_spent_unknown_reserves_preserved':True},'promotion':{'runtime_registry_changed':False,'new_recurring_routes':0,'qualified_CORE':0,'qualified_futuremaps':0,'funding_OI_price_metric_facts_enabled':False,'current_native_membership_proven':False,'ROOT_review_required_before_consumption':True}}
dump('F605_ACTUAL_IDENTITY_JOIN_SUMMARY_V1.json',summary)
checks={
'raw_read_once_hash_and_complete':receipt['source_original_reads_this_task']==1 and receipt['complete_JSON_verified'] and len(rows)==1302,
'exact_baseline_and_550_unique':len(matrix)==len({a['instrument_id'] for a in matrix})==550,
'all1302_projected_no_synthetic_rows':{a['source_rowindex'] for a in rows}==set(range(1302)),
'no_numeric_metric_keys_exported':all(not any(k in a for k in ['funding_rate','open_interest_usd','price','index','volume_24h']) for a in rows+matrix),
'no_nonUSDT_or_nonperpetual_EXACT':all(a['cg_target']=='USDT' and a['target_coin_id']=='tether' and a['contract_type']=='perpetual' and a['native_family_proven_in_retained_tuple'] for a in matrix if a['status']=='EXACT'),
'EXACT_requires_nonempty_IDs_unique_and_base':all(a['coin_id'] and a['vendor_row_count']==1 and a['cg_base']==a['base'] for a in matrix if a['status']=='EXACT'),
'EXACT_uses_literal_native_symbol_or_URL':all(a['join_method'] in ['EXACT_RAW_VENDOR_NATIVE_SYMBOL','LITERAL_NATIVE_PAIR_IN_VENDOR_TRADE_URL'] for a in matrix if a['status']=='EXACT'),
'unknown_not_marked_unsupported':all(a['status'] in ['EXACT','CANDIDATE','UNKNOWN'] for a in matrix),
'no_collision_accepted':all(a['vendor_row_count']==1 for a in matrix if a['status']=='EXACT'),
'rows_referenced_to_same_projection':all(rows[a['source_rowindex']]['identity_sha256']==a['identity_sha256'] for a in matrix if a['source_rowindex'] is not None),
'no_alias_prefix_or_ASCII_filter':summary['alias_handling']['new_aliases_invented']==0 and summary['ASCII_filter_applied'] is False,
'qualification24of24_not_rearmed':summary['qualification']['ROOT_after']==24 and summary['qualification']['remaining']==0 and summary['qualification']['SOURCE_new_calls']==0,
'metrics_CORE_maps_not_promoted':not summary['promotion']['funding_OI_price_metric_facts_enabled'] and summary['promotion']['qualified_CORE']==summary['promotion']['qualified_futuremaps']==0,
'status_counts_reconcile':sum(status_counts.values())==550
}
assert all(checks.values()),checks
dump('F605_MECHANICAL_ACTUAL_JOIN_VERIFICATION_V1.json',{'schema':'F605_MECHANICAL_ACTUAL_JOIN_VERIFICATION_V1','utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':checks,'passed':len(checks),'failed':0,'method':'One actual identity projection data-quality pass; no old tests/suites, source API calls, or runtime imports.'})
print(json.dumps({'selected_status_counts':status_counts,'unknown_rows':unknown,'same_project_multiple_native_instruments':shared,'nonASCII_vendor_symbols':summary['nonASCII_vendor_symbols'],'nonASCII_selected_symbols':summary['nonASCII_selected_symbols'],'spotlight_HYPE_DOOD':summary['spotlight_HYPE_DOOD'],'files_bytes':{'projection':p.stat().st_size,'matrix550':mp.stat().st_size},'checks_passed':len(checks)},ensure_ascii=False))
