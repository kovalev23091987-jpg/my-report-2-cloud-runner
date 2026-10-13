import json,gzip,pathlib,math,re,datetime,hashlib
root=pathlib.Path('.')
base=json.loads((root/'checkpoints/LIQ_105_SAVED_SOURCE_EVIDENCE_MATRIX_20261013.json').read_text())
allowed={r['contract']:r for r in base['rows'] if r['asset'] not in ['BTC','ETH']}
new=[]; rejected={}; used_files=[]; seen={}; duplicate_pairs=0
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def reject(k):rejected[k]=rejected.get(k,0)+1
for file in sorted(root.glob('checkpoints/**/report2-run-result.json*')):
 try:
  raw=file.read_bytes();data=json.loads(gzip.decompress(raw) if file.suffix=='.gz' else raw)
 except:continue
 if data.get('status')!='CLOSED' or not re.fullmatch('[a-f0-9]{40}',data.get('head','')):continue
 accepted=0
 for c in data.get('candidates',[]):
  contract=c.get('contract');canonical=c.get('canonical') or {};obs=c.get('observed_ts')
  if contract not in allowed:continue
  if not re.fullmatch('PUB:[a-f0-9]{40,64}',c.get('publication_id','')) or not finite(obs) or c.get('run_id')!=data.get('run_id') or canonical.get('run_id')!=c.get('run_id') or canonical.get('snapshot_id')!=c.get('snapshot_id') or canonical.get('observed_ts')!=obs:reject('PUBLICATION_BINDING');continue
  liq=canonical.get('liquidations') or {}
  groups={}
  for lane in ['above','below','calculated_scenarios']:
   for level in liq.get(lane,[]) or []:
    if not isinstance(level,dict):reject('NOT_LEVEL');continue
    source=level.get('source');group=level.get('independence_group')
    if source=='CoinBoss' and group=='COINBOSS_AGGREGATED_CEX_MODEL' and level.get('source_backed_calculated') is True:provider='COINBOSS_MODEL';kind='VENDOR_CALCULATED'
    elif source=='Orderly' and group=='ORDERLY_PUBLIC_POSITIONS' and level.get('price_semantics')=='ORDERLY_ESTIMATED_POSITION_LIQUIDATION_PRICE':provider='ORDERLY_PUBLIC_POSITIONS';kind='REPORTED_POSITION_ESTIMATED_PRICE'
    elif source=='Swolecharts' and group=='SWOLECHARTS_AGGREGATED_MODEL' and level.get('source_backed_calculated') is True:provider='SWOLECHARTS_MODEL';kind='VENDOR_CALCULATED'
    else:reject('NOT_ONE_OF_EXACT_EXTERNAL_PARSER_SHAPES');continue
    t=level.get('source_ts');p=level.get('price')
    if not finite(p) or p<=0 or not finite(t) or t<=0 or t>obs or level.get('side') not in ['ABOVE','BELOW']:reject('PRICE_CLOCK_OR_SIDE');continue
    if kind=='REPORTED_POSITION_ESTIMATED_PRICE' and not(finite(level.get('notional')) and level['notional']>0 or finite(level.get('position_count')) and level['position_count']>0):reject('POSITION_AMOUNT_OR_COUNT_REQUIRED');continue
    g=groups.setdefault(provider,{'count':0,'fresh_5m_count':0,'source_ts_min':t,'source_ts_max':t,'kind':kind,'lanes':set()})
    g['count']+=1;g['fresh_5m_count']+=obs-t<=300000;g['source_ts_min']=min(g['source_ts_min'],t);g['source_ts_max']=max(g['source_ts_max'],t);g['lanes'].add(lane)
  for provider,g in groups.items():
   g['lanes']=sorted(g['lanes']);identity=(c['publication_id'],provider,canonical.get('analytical_fingerprint'));
   if identity in seen:
    duplicate_pairs+=1;continue
   seen[identity]=True;new.append({'contract':contract,'provider':provider,'head':data['head'],'run_id':data['run_id'],'publication_id':c['publication_id'],'snapshot_id':c['snapshot_id'],'observed_ts':obs,'source_report':str(file),'source_report_sha256':hashlib.sha256(raw).hexdigest(),'canonical_state':c.get('canonical_state') or canonical.get('state'),'not_new_current_facts':True,**g});accepted+=1
 if accepted:used_files.append({'path':str(file),'sha256':hashlib.sha256(raw).hexdigest(),'accepted_pairs':accepted})
# Preserve every old qualification. New cases with usable original clocks can
# narrow a numerical proof gap; old hints without clocks never become fresh.
old_numeric=set();old_position=set()
for contract,row in allowed.items():
 for key,s in row['sources'].items():
  if s.get('historical_status') in ['HISTORICAL_NUMERIC_VERIFIED','HISTORICAL_NUMERIC_AGGREGATE_MODEL','HISTORICAL_SOURCE_SNAPSHOT_NUMERIC','HISTORICAL_CONDITIONAL_NUMERIC_VERIFIED','HISTORICAL_PINNED_NUMERIC_VERIFIED'] or s.get('numeric_level_count_min',0)>0 or s.get('numeric_level_count',0) and s.get('numeric_level_count',0)>0:
   old_numeric.add(contract)
   if key not in ['COINBOSS_MODEL','SWOLECHARTS_MODEL']:old_position.add(contract)
# The base may name statuses differently: retain its documented68 as the
# authoritative old total; do not infer a corrected denominator from ad hoc text.
new_qualified={x['contract'] for x in new if x['fresh_5m_count']>0}
added=sorted(new_qualified-old_numeric)
proof={'schema':'LIQ_SAVED_EXTERNAL_ORIGINAL_REPORT_CENSUS_20261013_V1','recorded_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base_matrix':'checkpoints/LIQ_105_SAVED_SOURCE_EVIDENCE_MATRIX_20261013.json','old_documented_numeric_union':base['counts']['historical_any_numeric_union'],'old_numeric_rows_reconstructed_from_tags':len(old_numeric),'old_source_tags_match_documented_count':len(old_numeric)==base['counts']['historical_any_numeric_union'],'old_eligible_assets':103,'report_paths_examined':len(list(root.glob('checkpoints/**/report2-run-result.json*'))),'accepted_original_report_files':used_files,'new_original_external_parser_proofs':new,'new_qualified_asset_union':sorted(new_qualified),'new_assets_beyond_old_tags':added,'new_historical_numeric_union':len(old_numeric|new_qualified) if len(old_numeric)==68 else None,'rejected_level_or_binding_shapes':rejected,'duplicate_original_pairs_not_counted_twice':duplicate_pairs,'sourceHTTP':0,'D1':0,'MAIN':0,'Telegram':0,'source_clocks_refreshed':False,'new_fresh_SENT':False,'current_simultaneous_103_coverage_proven':False,'independent_exchange_convergence_proven':False,'old_deliveries_rewritten':False,'no_local_HTX_models_added':True,'project_complete':False}
(root/'checkpoints/LIQ_SAVED_EXTERNAL_ORIGINAL_REPORT_CENSUS_20261013.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:proof[k] for k in ['report_paths_examined','old_numeric_rows_reconstructed_from_tags','old_source_tags_match_documented_count','new_qualified_asset_union','new_assets_beyond_old_tags','new_historical_numeric_union']},ensure_ascii=False))
