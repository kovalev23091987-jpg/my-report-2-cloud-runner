#!/usr/bin/env python3
"""Join immutable prior qualifications and exact original report consumers.

No HTTP/D1, no market refresh, no score changes. A report's declared producer
role can resolve market type; names in prose or catalog entries cannot.
"""
import argparse,collections,datetime,gzip,hashlib,json,math,pathlib,re,subprocess,shutil

root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--node',default=shutil.which('node'));args=parser.parse_args()
out=root/args.output
if not args.node:raise ValueError('NODE_RUNTIME_FOR_EXACT_N11_BINDING_REQUIRED')
if out.exists():raise FileExistsError('IMMUTABLE_PROOF_EXISTS')
def read(path):
 p=root/path;b=p.read_bytes();raw=gzip.decompress(b) if p.suffix=='.gz' else b
 return json.loads(raw),{'path':path,'raw_sha256':hashlib.sha256(raw).hexdigest(),'file_sha256':hashlib.sha256(b).hexdigest()}
universe,manifest=read('checkpoints/htx-approved-crypto-futures-universe-20261012.json.gz')
assets={a['asset_analysis_contract']:a['symbol'] for a in universe['assets']}
if len(assets)!=105:raise ValueError('EXACT_APPROVED105_REQUIRED')
active=['N04','N05','N10','N11','N12','N15'];paused=['N01','N02','N03','N06','N07','N08','N09','N14','N16']
prior,prior_ref=read('checkpoints/ACTIVE_CONFIGURED_BLOCKS_104_COVERAGE_RECONCILIATION_20261012.json')
old={r['contract']:r for r in prior['per_asset']}
baseline,baseline_ref=read('checkpoints/ACTIVE_BLOCKS_SAVED_EFFICIENCY_BASELINE_20261013.json')
missing_spot=set(baseline['current105_htx_spot_historical_catalog']['absent_contracts'])
spot,spot_ref=read('checkpoints/n15-spot-coverage-20261012/HTX-SPOT-TICKERS.json.gz')
symbols={r.get('symbol') for r in spot['payload']['data']} if isinstance(spot,dict) and isinstance(spot.get('payload'),dict) else None
# The hashed prior census is authoritative for exact symbols/absence. Quotes,
# candles and consumer use must be proven separately by original reports.
if len(missing_spot)!=15 or not missing_spot<=set(assets):raise ValueError('OWNER_HTX_SPOT_SCOPE_REQUIRED')
liq,liq_ref=read('checkpoints/LIQ_105_SAVED_SOURCE_EVIDENCE_MATRIX_20261013.json')
old_liq={r['contract']:r for r in liq['rows']}
positive={'HISTORICAL_NUMERIC_VERIFIED','HISTORICAL_NUMERIC_AGGREGATE_MODEL','HISTORICAL_SOURCE_SNAPSHOT_NUMERIC','HISTORICAL_CONDITIONAL_NUMERIC_VERIFIED','HISTORICAL_PINNED_NUMERIC_VERIFIED'}
def finite(v):return isinstance(v,(float,int)) and not isinstance(v,bool) and math.isfinite(v)
old_numeric={c for c,r in old_liq.items() if c not in ['BTC-USDT','ETH-USDT'] and any(s.get('historical_status') in positive or finite(s.get('numeric_level_count_min')) and s['numeric_level_count_min']>0 or finite(s.get('numeric_level_count')) and s['numeric_level_count']>0 for s in r['sources'].values())}
if len(old_numeric)!=68:raise ValueError('OLD_NUMERIC_COUNT_RECONCILIATION_REQUIRED')
records=[];files=[];issues=[];seen=set();fresh_external=set();non_analysis_publications=[]
stats=collections.defaultdict(lambda:{'contracts':set(),'fact_contracts':set(),'decision_consumer_contracts':set(),'report_consumer_contracts':set(),'manual_contracts':set(),'prepared_telegram_contracts':set(),'HTTP':0})
def markets(block,source,detail):
 u=set(detail.get('declared_upstream_ids',[]))|set(detail.get('used_declared_upstream_ids',[]))
 if block=='N04':return ['ONCHAIN_NOT_MARKET_SPECIFIC']
 if block=='N15':return ['AGGREGATED_SECTOR_QUOTES_NOT_EXACT_HTX_MARKET']
 if block=='N11' and 'HTX_IMMUTABLE_EXECUTION_BOOK' in u:return ['FUTURES']
 if block=='N10':
  result=[]
  if u&{'HTX_OFFICIAL_CLOSED_1M_CANDLES','HTX_OFFICIAL_CLOSED_CANDLES'}:result.append('FUTURES')
  if u&{'HTX_OFFICIAL_SPOT_CLOSED_1M_CANDLES','BINANCE_OFFICIAL_SPOT_CANDLES','POLONIEX_OFFICIAL_SPOT_CANDLES','BITGET_OFFICIAL_SPOT_CANDLES'}:result.append('SPOT')
  return result or ['MARKET_NOT_RESOLVED_IN_REDUCED_ORIGINAL']
 if block=='N12':
  if 'HTX_OFFICIAL_SPOT_AND_FUTURES_RAW_FILLS' in u:return ['SPOT','FUTURES']
  result=[]
  for kind in ['SPOT','FUTURES']:
   if any(re.fullmatch(r'(?:HTX_PUBLIC|HTX_OFFICIAL|OKX_OFFICIAL_PUBLIC|KUCOIN_OFFICIAL_PUBLIC|BITGET_OFFICIAL)_'+kind+r'_(?:TRADES|RAW_FILLS)',x) for x in u):result.append(kind)
  # The immutable same-run producer checks both markets separately. Its
  # exact CLOSED sample receipts establish useful market presence even when
  # asynchronous samples have no common directional vote.
  routes={r.get('route'):r.get('status') for r in detail.get('receipts',[])}
  if routes.get('HTX_SPOT_SAME_RUN')=='CLOSED_BOUNDED_SAMPLE' and 'SPOT' not in result:result.append('SPOT')
  if routes.get('HTX_FUTURES_SAME_RUN')=='CLOSED_BOUNDED_SAMPLE' and 'FUTURES' not in result:result.append('FUTURES')
  return result or ['MARKET_NOT_RESOLVED_IN_REDUCED_ORIGINAL']
 return ['MARKET_NOT_RESOLVED_IN_REDUCED_ORIGINAL']

tracked=set(subprocess.check_output(['git','ls-files','-z','checkpoints'],cwd=root).decode().split('\0'))
for p in sorted((root/'checkpoints').glob('**/report2-run-result.json*')):
 if str(p.relative_to(root)) not in tracked:continue
 packed=p.with_name(p.name+'.gz')
 if p.suffix!='.gz' and packed.exists():
  if gzip.decompress(packed.read_bytes())!=p.read_bytes():raise ValueError('ORIGINAL_REPORT_GZIP_MISMATCH: '+str(p.relative_to(root)))
  continue
 d,ref=read(str(p.relative_to(root)))
 if d.get('status')!='CLOSED' or not re.fullmatch('[a-f0-9]{40}',str(d.get('head'))):continue
 # Rebuild the two original identity namespaces from immutable source facts;
 # do not replace this with a label/prose or declared-count inference.
 projected={'run_id':d.get('run_id'),'report_text':d.get('report_text'),'candidates':[{k:c.get(k) for k in ['contract','run_id','snapshot_id','observed_ts','canonical','execution_context_source','block_coverage','block_rendered_results','manual_text']} for c in d.get('candidates',[])]}
 audit=json.loads(subprocess.check_output([args.node,str(root/'tools/audit-n11-rendered-source-binding-20261018.mjs')],input=json.dumps(projected,ensure_ascii=False).encode(),timeout=30))
 if audit.get('schema')!='N11_EXACT_RENDERED_SOURCE_BINDING_V1' or any(audit.get(k)!=0 for k in ['sourceHTTP','D1','Telegram']):raise ValueError('EXACT_N11_BINDING_AUDIT_REQUIRED')
 n11_bindings=audit['bindings']
 accepted=0
 for c in d.get('candidates',[]):
  code=c.get('contract');can=c.get('canonical') or {};key=(c.get('publication_id'),can.get('analytical_fingerprint'))
  if code not in assets or key in seen:continue
  if not (re.fullmatch('PUB:[a-f0-9]{40,64}',str(key[0])) and re.fullmatch('[a-f0-9]{64}',str(key[1])) and c.get('run_id')==d.get('run_id')==can.get('run_id') and c.get('snapshot_id')==can.get('snapshot_id') and c.get('observed_ts')==can.get('observed_ts') and c.get('observed_ts',0)>0):
   issues.append({'file':ref['path'],'contract':code,'reason':'ORIGINAL_BINDING_NOT_CLOSED'});continue
  # Current pause policy is checked only where it already existed in the
  # original. Pre-pause prior qualifications remain separate hashed history.
  coverage=c.get('block_coverage')
  if coverage is None and c.get('snapshot_id')==f"REMOVAL:{code}:{c['observed_ts']}" and can.get('status')=='CLOSED' and can.get('state')=='REJECTED' and not any(finite(v) for v in (can.get('scores') or {}).values()):
   non_analysis_publications.append({'contract':code,'publication_id':key[0],'run_id':c['run_id'],'snapshot_id':c['snapshot_id'],'source_report':ref,'reason':'NON_ANALYSIS_REMOVAL_PUBLICATION_NO_BLOCK_COVERAGE','qualified_block_facts':False,'provider_failure_or_absence_inferred':False})
   continue
  if not isinstance(coverage,dict) or not isinstance(coverage.get('blocks'),dict):
   issues.append({'file':ref['path'],'contract':code,'publication_id':key[0],'reason':'ORIGINAL_BLOCK_COVERAGE_NOT_AVAILABLE'})
   continue
  blocks=coverage['blocks']
  if not all(blocks.get(b,{}).get('status')=='BLOCK_PAUSED_BY_OWNER' for b in paused):continue
  seen.add(key);accepted+=1
  rendered=c.get('block_rendered_results',{});use=c.get('block_decision_use',{});record={'contract':code,'publication_id':key[0],'analytical_fingerprint':key[1],'run_id':c['run_id'],'snapshot_id':c['snapshot_id'],'observed_ts':c['observed_ts'],'head':d['head'],'source_report':ref,'blocks':{},'no_telegram_delivery_inferred':True}
  for block in active:
   b=blocks.get(block,{})
   record['blocks'][block]={'status':b.get('status'),'checked':b.get('checked') is True,'valid_context_facts':b.get('valid_context_facts',0),'source_cells':[]}
   details=use.get('blocks',{}).get(block,{}).get('source_accounting',{}).get('details',{})
   for source,check in b.get('source_checks',{}).items():
    detail=details.get(source,{})
    fact=bool(check.get('valid_evidence_ids')) or int(detail.get('valid_fact_count',0))>0
    decision_consumed=int(detail.get('used_fact_count',0))>0
    http=check.get('network_calls')
    if not isinstance(http,int) or http<0:issues.append({'publication_id':key[0],'block':block,'source':source,'reason':'UNKNOWN_SOURCE_HTTP'});continue
    evidence_ids=set(check.get('valid_evidence_ids',[]))
    def exact_context(receipts):
     return [r for r in receipts if r.get('block_id')==block and set(r.get('evidence_ids',[r.get('evidence_id')]))&evidence_ids]
    manual_context=exact_context(rendered.get('context_receipts',[]))
    bound_n11=[r for r in n11_bindings if block=='N11' and source=='PRIMARY_EXECUTION_STRESS' and r['contract']==code and r['snapshot_id']==c['snapshot_id'] and r['run_id']==c['run_id'] and r['producer_evidence_id'] in evidence_ids]
    manual_context += [{**r,'evidence_ids':[r['producer_evidence_id']]} for r in bound_n11]
    telegram_context=exact_context(rendered.get('telegram_context_receipts',[]))
    manual_rendered=bool(manual_context) and int(detail.get('rendered_fact_count',0))>0 and block in rendered.get('used_context_block_ids',[])
    telegram_prepared=bool(telegram_context) and block in rendered.get('telegram_used_context_block_ids',[])
    clocks=[r['source_ts'] for r in manual_context+telegram_context if finite(r.get('source_ts')) and r['source_ts']<=c['observed_ts']]
    cell={'source':source,'markets':markets(block,source,detail) if fact else ['NO_QUALIFIED_FACT'],'status':check.get('status'),'HTTP_attribution':http,'qualified_fact':fact,'decision_consumer_use':decision_consumed,'report_consumer_use':manual_rendered or telegram_prepared,'nonzero_score':int(detail.get('nonzero_score_fact_count',0))>0,'manual_rendered':manual_rendered,'telegram_prepared':telegram_prepared,'same_run_delivery_not_inferred':True,'validated_evidence_ids':sorted(evidence_ids),'original_source_clocks':sorted(set(clocks)),'clocks_missing_in_reduced_original':not clocks,'declared_upstreams':sorted(set(detail.get('declared_upstream_ids',[]))|set(detail.get('used_declared_upstream_ids',[]))),'physical_roots':sorted(set(detail.get('physical_root_keys',[]))|set(detail.get('used_physical_root_keys',[])))}
    if bound_n11:cell['manual_source_id_binding_proofs']=[{k:r[k] for k in ['producer_evidence_id','producer_physical_root','immutable_evidence_ids','source_ts','observed_ts','label','proof']} for r in bound_n11]
    record['blocks'][block]['source_cells'].append(cell)
    for market in cell['markets']:
     s=stats[(block,source,market)];s['contracts'].add(code);s['HTTP']+=http
     if fact:s['fact_contracts'].add(code)
     if decision_consumed:s['decision_consumer_contracts'].add(code)
     if cell['report_consumer_use']:s['report_consumer_contracts'].add(code)
     if cell['manual_rendered']:s['manual_contracts'].add(code)
     if cell['telegram_prepared']:s['prepared_telegram_contracts'].add(code)
   if any(blocks[b].get('checked') or blocks[b].get('source_checks') or blocks[b].get('maximum_score_points')!=0 for b in paused):issues.append({'publication_id':key[0],'reason':'PAUSED_BLOCK_ACTIVITY'})
  providers=[]
  for level in can.get('liquidations',{}).get('calculated_scenarios',[]) or []:
   if level.get('source') in ['CoinBoss','Swolecharts https://swolecharts.com'] and level.get('source_backed_calculated') is True and finite(level.get('price')) and level['price']>0 and finite(level.get('source_ts')) and 0<=c['observed_ts']-level['source_ts']<=300000:
    providers.append(level['source']);fresh_external.add(code)
  record['LIQ_original_vendor_models']=sorted(set(providers));records.append(record)
 if accepted:files.append({**ref,'original_publications':accepted})

rows=[]
for contract,symbol in assets.items():
 history=old.get(contract,{});selected=[r for r in records if r['contract']==contract]
 row={'contract':contract,'asset':symbol,'HTX_futures_approved':True,'HTX_spot_pair_in_original_bulk_catalog':contract not in missing_spot,'external_spot_not_replacement_for_missing_HTX_pair':contract in missing_spot,'prior_104_qualification':history or None,'current_pause_policy_original_publications':[r['publication_id'] for r in selected],'blocks':{},'LIQ_historical_numeric_proven':contract in old_numeric|fresh_external,'LIQ_eligible':contract not in ['BTC-USDT','ETH-USDT']}
 for block in active:
  cells=[cell for r in selected for cell in r['blocks'][block]['source_cells']]
  row['blocks'][block]={'qualified_sources':sorted({c['source'] for c in cells if c['qualified_fact']}),'decision_used_sources':sorted({c['source'] for c in cells if c['decision_consumer_use']}),'report_used_sources':sorted({c['source'] for c in cells if c['report_consumer_use']}),'proven_market_roles':sorted({m for c in cells if c['qualified_fact'] for m in c['markets']}),'manual_sources':sorted({c['source'] for c in cells if c['manual_rendered']}),'prepared_telegram_sources':sorted({c['source'] for c in cells if c['telegram_prepared']}),'current_simultaneous_coverage':False,'missing_proof_not_provider_absence':not any(c['qualified_fact'] for c in cells)}
 rows.append(row)
matrix=[]
for (block,source,market),s in sorted(stats.items()):
 for k in list(s):
  if isinstance(s[k],set):s[k]=sorted(s[k])
 matrix.append({'block':block,'source':source,'market_role':market,**s,'HTTP_may_be_shared_between_cells_do_not_sum':True,'market_role_not_an_independent_source':True})
block_counts={}
for block in active:
 block_counts[block]={'historical_qualified_assets_in_current_pause_report_subset':sum(bool(r['blocks'][block]['qualified_sources']) for r in rows),'historical_decision_consumer_assets_in_that_subset':sum(bool(r['blocks'][block]['decision_used_sources']) for r in rows),'historical_report_consumer_assets_in_that_subset':sum(bool(r['blocks'][block]['report_used_sources']) for r in rows),'historical_spot_market_role_assets_in_that_subset':sum('SPOT' in r['blocks'][block]['proven_market_roles'] for r in rows),'historical_futures_market_role_assets_in_that_subset':sum('FUTURES' in r['blocks'][block]['proven_market_roles'] for r in rows),'whole_105_current_coverage_proven':False}
proof={'schema':'ACTIVE105_TYPED_SOURCE_USE_COVERAGE_V1','recorded_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifest':manifest,'prior_reused':[prior_ref,baseline_ref,liq_ref,spot_ref],'source_reports':files,'active_blocks':active,'paused_blocks':paused,'original_publications':len(records),'original_report_distinct_assets':len({r['contract'] for r in records}),'block_counts':block_counts,'source_block_market_matrix':matrix,'asset_rows':rows,'original_records':records,'LIQ':{'eligible':103,'historical_original_numeric_union':len(old_numeric|fresh_external),'historical_gaps':sorted(set(assets)-{'BTC-USDT','ETH-USDT'}-old_numeric-fresh_external),'new_vs_base':sorted(fresh_external-old_numeric),'original_raw_source_clocks_not_refreshed':True},'cost_semantics':'Cell HTTP is attribution only: shared N04/N05 transport and N05/N12 adapters must be deduplicated using their original shared receipt before summing. Market dimensions do not multiply source quotas.','market_semantics':'Market type uses validated declared upstream roles and explicit normalized same-run trade receipts. Catalog/prose/score do not establish useful per-market facts. N04 is on-chain; N15 uses aggregate sector quotes; N11 is futures-only.','historical_39_external_N05_not_replaced_by_reduced_subset':True,'no_telegram_SENT_inferred':True,'N11_rendered_source_binding':'EXACT_IMMUTABLE_BOOK_PRODUCER_AND_FINAL_CONTRACT_SCOPED_LINES','N11_binding_auditor':{'path':'tools/audit-n11-rendered-source-binding-20261018.mjs','sha256':hashlib.sha256((root/'tools/audit-n11-rendered-source-binding-20261018.mjs').read_bytes()).hexdigest()},'non_analysis_publications_excluded':non_analysis_publications,'issues':issues,'sourceHTTP':0,'D1':0,'MAIN':0,'Telegram':0,'all_blocks_complete':False,'project_complete':False}
out.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':args.output,'original_publications':len(records),'distinct_assets':proof['original_report_distinct_assets'],'block_counts':block_counts,'LIQ_numeric_historical':proof['LIQ']['historical_original_numeric_union'],'LIQ_gaps':len(proof['LIQ']['historical_gaps']),'issues':len(issues)},ensure_ascii=False))
