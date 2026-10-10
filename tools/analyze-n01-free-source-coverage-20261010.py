"""Analyze retained originals only; no network, clocks rewritten, or production changes."""
import gzip,hashlib,json,re,math
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
RUNS=[38044139682,38044298607,38044429000,38044509627]
ROOT=BASE/'checkpoints'
UNIVERSE_PATH=ROOT/'htx-all-modes-crypto-futures-universe-20261004.json.gz'
UNIVERSE=json.loads(gzip.open(UNIVERSE_PATH).read())
SYMBOLS={a['symbol'] for a in UNIVERSE['assets']}
assert len(SYMBOLS)==102
NOW=1791627170000

def sha(b):return hashlib.sha256(b).hexdigest()
def original(run,name):
 p=ROOT/f'n01-free-source-qualification-{run}'
 acquisition=json.loads((p/'acquisition.json').read_text())
 receipt=next(s for s in acquisition['sources'] if s['name']==name)
 b=gzip.open(p/receipt['file']).read()
 assert sha(b)==receipt['sha256'] and sha((p/receipt['file']).read_bytes())==receipt['gzip_sha256']
 return b.decode(),receipt

def rsc(body):
 chunks=[]
 for m in re.finditer(r'self\.__next_f\.push\((\[.*?\])\)</script>',body):
  a=json.loads(m[1])
  if a[0]==1:chunks.append(a[1])
 records=[]
 for line in ''.join(chunks).splitlines():
  try:records.append(json.loads(line.split(':',1)[1]))
  except (ValueError,IndexError):pass
 return records

def walk(value):
 yield value
 if isinstance(value,dict):
  for child in value.values():yield from walk(child)
 elif isinstance(value,list):
  for child in value:yield from walk(child)

def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def future(x):return finite(x) and x>NOW

def dropstab():
 rows=[];receipts=[];pages=[]
 for run,name in [(RUNS[0],'dropstab'),(RUNS[3],'dropstab-page-2')]:
  body,receipt=original(run,name);receipts.append(receipt)
  prop=next(v for v in walk(rsc(body)) if isinstance(v,dict) and isinstance(v.get('fallbackBody'),dict) and 'coins' in v['fallbackBody'])
  pages.append({'page_zero_based':prop['requestParams']['page'],'totalElements':prop['fallbackBody']['totalElements'],'totalPages':prop['fallbackBody']['totalPages'],'filters':prop['requestParams']['filters']})
  for row in prop['fallbackBody']['coins']:
   symbol=row['symbol'].strip().upper()
   if symbol not in SYMBOLS:continue
   data=row.get('fundraisingBaseData',{});vesting=data.get('vesting',{});event=vesting.get('nextUnlockDetails',{})
   if not future(event.get('date')) or not finite(event.get('tokens')) or event['tokens']<=0:continue
   rows.append({'symbol':symbol,'provider_asset_id':row['currencyId'],'provider_slug':row['slug'],'name':row['name'],'future_release':event,'allocation_events':data.get('nextUnlocksBySales',[]),'locked_unlocked_supply':vesting.get('totalUnlockProgress'),'provider_clock':None,'raw_file':receipt['file'],'raw_run':run})
 return {'records':rows,'pages':pages,'scope':'ALL_94_ROWS_OF_PUBLIC_DEFAULT_LARGE_UNLOCK_FILTER;NOT_ALL_PROVIDER_SUPPORTED_COINS','transport':'200_ON_BOTH_PAGES','identity_status':'EXACT_PROVIDER_ID_TO_HTX_BINDING_OPEN','source_publication_clock_status':'NOT_PROVEN;HTTP_DATE_IS_NOT_FACT_CLOCK'}

def cmc():
 rows=[];pages=[]
 for run,name in [(RUNS[0],'cmc'),(RUNS[2],'cmc-page-2'),(RUNS[2],'cmc-page-3')]:
  body,receipt=original(run,name);m=re.search(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>([\s\S]*?)</script>',body)
  data=json.loads(m[1]);q=next(q for q in data['props']['dehydratedState']['queries'] if q['queryKey'][0]=='token-unlocks-page-table')
  listing=q['state']['data'];pages.append({'query':q['queryKey'],'rows':len(listing['tokenUnlockList']),'total':listing['totalCount'],'cache_dehydration_ts':q['state']['dataUpdatedAt'],'cache_time_is_not_schedule_publication_clock':True})
  for row in listing['tokenUnlockList']:
   if row['symbol'] not in SYMBOLS:continue
   event=row.get('nextUnlocked') or {}
   if not future(event.get('date')) or not finite(event.get('tokenAmount')) or event['tokenAmount']<=0:continue
   rows.append({'symbol':row['symbol'],'provider_asset_id':row['cryptoId'],'provider_slug':row['slug'],'name':row['name'],'future_release':event,'allocation_events':row.get('nextUnlockedDetail',[]),'locked_tokens':row.get('tokenLockedAmount'),'unlocked_tokens':row.get('tokenUnlockedAmount'),'provider_clock':None,'raw_file':receipt['file'],'raw_run':run})
 return {'records':rows,'pages':pages,'scope':'PUBLIC_PAGES_1_TO_3_OF_14;REMAINING_CATALOGUE_NOT_CHECKED','transport':'200_WITH_NONEMPTY_TOKEN_UNLOCK_LIST;NOT_LOADING_ONLY','identity_status':'EXACT_CMC_ID_TO_HTX_BINDING_OPEN','source_publication_clock_status':'NOT_PROVEN;QUOTE_CLOCK_AND_CACHE_CLOCK_ARE_NOT_UNLOCK_CLOCK'}

def tokenomist():
 body,receipt=original(RUNS[0],'tokenomist');records=rsc(body);rows=[]
 # Public overview cards include upcoming cliff and daily emission context.
 for parent in walk(records):
  if not isinstance(parent,dict) or not isinstance(parent.get('cliff'),dict) or not isinstance(parent.get('linear'),dict):continue
  for kind in ['cliff','linear']:
   value=parent[kind]
   for row in value.get('tokenList',[]):
    if row.get('symbol') not in SYMBOLS or not finite(row.get('rawValue')) or row['rawValue']<=0:continue
    rows.append({'symbol':row['symbol'],'provider_slug':row['slug'],'name':row['tokenName'],'public_summary_type':kind,'published_value_usd':row['rawValue'],'window':'NEXT_7_DAYS' if kind=='cliff' else 'PER_DAY','exact_future_event_clock':None,'allocations':row.get('allocationList',[]),'provider_clock':None,'raw_run':RUNS[0]})
 table=next(v['initialVestingList'] for v in walk(records) if isinstance(v,dict) and 'initialVestingList' in v)
 full=[];price_only=[]
 for group in table['rows']:
  for values in group['r']:
   row=dict(zip(group['k'],values))
   if row.get('tokenSymbol') not in SYMBOLS:continue
   event=row.get('upcomingEvent')
   if isinstance(event,dict) and future(event.get('dateUnix',0)*1000) and finite(event.get('amount')) and event['amount']>0:
    full.append({'symbol':row['tokenSymbol'],'provider_slug':row['tokenSlug'],'future_release':event,'provider_clock':None,'query_clock_not_publication_clock':table['metadata']['queryDate'],'raw_run':RUNS[0]})
   else:price_only.append(row['tokenSymbol'])
 gates=[]
 for name in ['tokenomist-page-2','tokenomist-page-3']:
  b,r=original(RUNS[3],name);gates.append({'page':name,'http_status':r['http_status'],'semantic_status':'SIGN_IN_REQUIRED' if 'NEXT_REDIRECT' in b and '/auth/signin' in b else 'UNQUALIFIED','http_200_is_not_success':True})
 return {'records':rows+full,'exact_event_assets':sorted({r['symbol'] for r in full}),'price_only_excluded':price_only,'table_trimmed':table['trimmedRows'],'pagination':gates,'scope':'PUBLIC_OVERVIEW_SUMMARIES_AND_FREE_TABLE_ROWS;NO_SIGN_IN_WALL_BYPASS','transport':'200_ROOT_WITH_PUBLIC_DATA;200_PAGINATION_CONTAINS_SIGN_IN_REDIRECT','identity_status':'EXACT_PROVIDER_SLUG_TO_HTX_BINDING_OPEN','source_publication_clock_status':'NOT_PROVEN;QUERY_TIME_NOT_FACT_CLOCK'}

def main():
 sources={'DropsTab':dropstab(),'CoinMarketCap':cmc(),'Tokenomist':tokenomist()}
 identities=json.loads((ROOT/f'n01-free-source-qualification-{RUNS[0]}'/'exact-identities.json').read_text())
 eligible=sorted(s for s,r in identities.items() if r['status']=='CLOSED' and any(i.get('chain')=='solana' and i.get('contract_or_mint') for i in r['identities']))
 _,sf=original(RUNS[0],'streamflow')
 sources['Streamflow']={'records':[],'scope':'PUBLIC_SDK_SOLANA_READ_ROUTE_AND_APP_TESTED;PER_MINT_CHAIN_SEARCH_NOT_QUALIFIED','transport':f"PUBLIC_CONTRACT_LIST_HTTP_{sf['http_status']};APP_200_WITHOUT_LOCKUP_FACTS",'exact_solana_mint_eligible_assets':eligible,'current_exact_identity_eligibility_upper_bound':len(eligible),'eligible_count_is_not_useful_fact_coverage':True,'remaining':'SDK_DOCUMENTED_SENDER_OR_RECIPIENT_REQUIRED;BOUND_EXACT_MINT_RPC_QUERY_ROUTE_NOT_YET_QUALIFIED','identity_status':'HTX_SOLANA_BINDINGS_RETAINED;NO_PROVIDER_LOCKUP_MATCH','source_publication_clock_status':'NO_LOCKUP_FACT_RETURNED'}
 all_assets=set()
 for source,data in sources.items():
  assets=sorted({r['symbol'] for r in data['records']});all_assets.update(assets)
  data.update({'public_useful_information_candidate_assets':assets,'public_useful_information_candidate_count':len(assets),'candidate_fraction':len(assets)/102,'meets_30_percent_candidate_floor':len(assets)>=31,'fully_identity_and_clock_qualified_assets':[],'production_enabled':False,'missing_is_not_zero':True})
 # Diagnostic dollar bucket only, not a new approved strategy threshold.
 # Never inflate large-unlock coverage with mining/staking emission summaries.
 for name,data in sources.items():
  exact=[r for r in data['records'] if isinstance(r.get('future_release'),dict) and 'date' in r['future_release']]
  if name=='Tokenomist':exact=[r for r in data['records'] if isinstance(r.get('future_release'),dict) and 'dateUnix' in r['future_release']]
  data['exact_dated_release_candidate_assets']=sorted({r['symbol'] for r in exact})
  data['undated_emission_summaries_are_not_unlock_events']=True
  upcoming=[r for r in exact if (r['future_release'].get('date') or r['future_release'].get('dateUnix',0)*1000)<=NOW+31*86400000]
  diagnostic=[r for r in upcoming if (r['future_release'].get('usdAmount') or r['future_release'].get('tokenAmountUsd') or r['future_release'].get('value') or 0)>=1000000]
  data['diagnostic_31_day_at_least_1m_usd_candidates']=sorted({r['symbol'] for r in diagnostic})
  data['diagnostic_1m_usd_is_not_approved_strategy_threshold']=True
  data['diagnostic_does_not_prove_medium_large_by_circulation_and_HTX_turnover']=True
 matrix=[{'symbol':s,'sources_with_public_useful_candidate_data':[name for name,d in sources.items() if s in d['public_useful_information_candidate_assets']],'qualified_production_data':False,'status':'CANDIDATE_BINDING_AND_CLOCK_OPEN' if s in all_assets else 'NO_USEFUL_FACT_IN_CHECKED_SCOPE'} for s in sorted(SYMBOLS)]
 usage=[]
 for run in RUNS:
  p=ROOT/f'n01-free-source-qualification-{run}'/'acquisition.json';a=json.loads(p.read_text());assert a['D1']['unknown_ops']==0;usage.append({'run':run,'head':a['head'],'status':a['status'],'sourceHTTP':a['sourceHTTP'],'D1':a['D1'],'acquisition_sha256':sha(p.read_bytes())})
 out={'schema':'N01_FREE_SOURCE_COVERAGE_102_ACTUAL_V1','project_complete':False,'production_changed':False,'universe_sha256':sha(UNIVERSE_PATH.read_bytes()),'universe_count':102,'owner_minimum_fraction':0.30,'minimum_assets':31,'sources':sources,'union_public_useful_information_candidates':sorted(all_assets),'union_candidate_count':len(all_assets),'union_candidate_fraction':len(all_assets)/102,'union_is_not_qualified_live_coverage':True,'union_includes_undated_emission_context_and_small_events_not_strategy_useful_unlock_coverage':True,'source_independence_not_proven':True,'owner_consensus_policy':{'minimum_independent_upstreams':2,'exact_asset_identity_required':True,'match_fields':['RELEASE_KIND','EVENT_PERIOD_AND_TIME_PRECISION','TOKEN_AMOUNT_AND_UNIT','ALLOCATION_SCOPE'],'price_dependent_USD_difference_is_not_token_amount_conflict':True,'missing_data_is_not_no_unlock':True,'explicit_no_event_requires_complete_same_asset_same_period_coverage':True,'different_periods_and_linear_vs_cliff_are_not_comparable':True,'same_upstream_in_two_services_counts_once':True,'incompatible_comparable_sources_block_confirmed_publication':True,'single_source_blocks_confirmed_publication':True,'no_averaging_of_conflicting_values':True,'qualified_independent_consensus_events':[],'all_current_raw_candidates_remain_unconfirmed':True},'matrix':matrix,'acquisitions':usage,'sourceHTTP_total':sum(x['sourceHTTP'] for x in usage),'provider_caps_unchanged':{'DROPSTAB_PUBLIC_UNLOCKS':4,'CMC_PUBLIC_UNLOCKS':4,'TOKENOMIST_PUBLIC_UNLOCKS':4,'STREAMFLOW_PUBLIC_LOCKUPS':4,'HTX_ASSET_REFERENCE':8},'owner_relevance_amendment':{'focus':'MEDIUM_AND_LARGE_UNLOCKS;EXCLUDE_TINY_EVENTS_FROM_USEFUL_COVERAGE','size_metrics':['USD_VALUE','SHARE_OF_CIRCULATING_SUPPLY','RATIO_TO_NORMAL_HTX_TRADING_VOLUME'],'large_does_not_mean_guaranteed_price_fall':True,'provider_default_thresholds_are_not_owner_approved_strategy_thresholds':True,'coverage_30_percent_is_a_source_usefulness_benchmark_not_a_new_signal_gate':True},'next_work':'GENERIC_EXACT_PROVIDER_ID_BINDINGS_AND_PUBLICATION_CLOCK_POLICY;BROADER_PUBLIC_CATALOGUES_WITHIN_DAILY_CAPS;NO_NARROW_SOURCE_PRODUCTION_ACTIVATION'}
 target=ROOT/'N01_FREE_SOURCE_ACTUAL_COVERAGE_20261010.json';target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'path':str(target),'sources':{k:{'candidate_count':v['public_useful_information_candidate_count'],'assets':v['public_useful_information_candidate_assets']} for k,v in sources.items()},'union':len(all_assets),'sourceHTTP_total':out['sourceHTTP_total'],'production_changed':False},ensure_ascii=False))
if __name__=='__main__':main()
