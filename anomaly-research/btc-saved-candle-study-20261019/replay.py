# -*- coding: utf-8 -*-
"""One bounded study of six saved CSVs. No network, application or DB imports."""
import bisect,collections,csv,datetime,hashlib,io,json,os,subprocess,sys,tempfile,time,zipfile
from decimal import Decimal
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
P=HERE/'protocol.json'
PLAN=json.loads(P.read_text())
PROTO_HEAD='09665dd8'
PROTO_SHA='3ebe8877025b14ec46a958030726d20ce4f17d20ab094628983f42a4ce47722a'
CHECKS=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def encoded(v):return (json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
def check(n,v,detail=None):
 if not v:raise AssertionError(n)
 CHECKS.append({'name':n,'pass':True,'detail':detail})
def stamp(ms):return datetime.datetime.fromtimestamp(ms/1000,datetime.timezone.utc).isoformat()
def guard():
 lease=json.loads(Path('/private/tmp/report2-anomaly-lease.json').read_text())
 assert lease['lease']['status']=='ACTIVE' and time.time()*1000<lease['lease']['expires_ts']
 assert lease['lease']['owner']==PLAN['own_lease']['lease']['owner']
 return lease

def main():
 guard()
 check('Protocol committed before first calculation; fixed offline formula pinned',sha(P.read_bytes())==PROTO_SHA and subprocess.check_output(['git','show',PROTO_HEAD+':'+str(P.relative_to(ROOT))],cwd=ROOT)==P.read_bytes() and sha((ROOT/PLAN['features_reused']['module']).read_bytes())==PLAN['features_reused']['sha256'])
 blob=(ROOT/PLAN['outer_zip']['path']).read_bytes();assert sha(blob)==PLAN['outer_zip']['sha256']
 outer=zipfile.ZipFile(io.BytesIO(blob));minutes={k:[] for k in PLAN['markets']};sources=[]
 for spec in PLAN['original_archives']:
  b=outer.read(spec['zip_member']);assert sha(b)==spec['zip_sha256']
  cb=zipfile.ZipFile(io.BytesIO(b)).read(spec['csv_member']);assert sha(cb)==spec['csv_sha256']
  rows=csv.reader(io.StringIO(cb.decode()));header=next(rows) if spec['raw_header'] else None;assert header==spec['raw_header']
  scale=1000 if spec['original_timestamp_unit']=='microseconds' else 1
  series=minutes[spec['market']];count=0;first=None;last=None;sid=spec['market']+':'+spec['month']
  for line,row in enumerate(rows,2 if header else 1):
   assert len(row)==12
   native=int(row[0]);assert native%scale==0;t=native//scale;assert int(row[6])+1==native+60000*scale
   o,h,l,c=[Decimal(row[j]) for j in range(1,5)];v=Decimal(row[7]);assert all(x.is_finite() for x in [o,h,l,c,v]) and l>0 and l<=min(o,c)<=max(o,c)<=h and v>=0
   if series:assert series[-1]['t']+60000==t
   x={'t':t,'open':row[1],'high':row[2],'low':row[3],'close':row[4],'v':row[7],'source_id':sid,'csv_line':line};series.append(x);count+=1
   if first is None:first={'native_timestamp_lexeme':row[0],'csv_line':line,'raw_fields_1_to_10':row[1:11]}
   last={'native_timestamp_lexeme':row[0],'csv_line':line,'raw_fields_1_to_10':row[1:11]}
  assert count==spec['rows'];sources.append({**spec,'source_id':sid,'first_row_lexemes':first,'last_row_lexemes':last,'readback':'Exact stored bytes, not a new provider response'})
 check('Six exact raw CSV hashes and original timestamp/close-edge/field shape',len(sources)==6 and sum(len(v) for v in minutes.values())==264960)
 check('Both same-market minute series strictly contiguous and no duplicates',all(len(v)==132480 and v[0]['t']==1780272000000 and v[-1]['t']+60000==1788220800000 for v in minutes.values()))
 check('All actual OHLC and literal column7 finite/nonnegative; native lexemes retained',True,{'validated_rows':264960,'volume_unit_promoted':False,'native_publication_ts':None})
 known=int(time.time()*1000);aggregate=[];coverage=[]
 for market,xs in minutes.items():
  for tf,d in PLAN['aggregation']['timeframes'].items():
   offset=345600000 if tf=='1w' else 0;groups=collections.defaultdict(list)
   for x in xs:groups[(x['t']-offset)//d*d+offset].append(x)
   bars=[];partial=[]
   for start,rows in groups.items():
    end=start+d
    if len(rows)!=d//60000 or rows[0]['t']!=start or rows[-1]['t']+60000!=end:
     partial.append({'start_ts':start,'end_ts':end,'observed_minutes':len(rows),'expected_minutes':d//60000});continue
    ranges=[]
    for x in rows:
     if ranges and ranges[-1]['source_id']==x['source_id']:ranges[-1]['last_csv_line']=x['csv_line'];ranges[-1]['rows']+=1
     else:ranges.append({'source_id':x['source_id'],'first_csv_line':x['csv_line'],'last_csv_line':x['csv_line'],'rows':1})
    bar={'start_ts':start,'end_ts':end,'open':rows[0]['open'],'high':str(max(Decimal(x['high']) for x in rows)),'low':str(min(Decimal(x['low']) for x in rows)),'close':rows[-1]['close'],'raw_column7_sum':str(sum((Decimal(x['v']) for x in rows),Decimal(0))),'source_ranges':ranges,'original_minute_count':len(rows)}
    bar['bar_sha256']=sha(encoded(bar));bars.append(bar)
   assert sum(x['original_minute_count'] for x in bars)+sum(x['observed_minutes'] for x in partial)==len(xs)
   assert sum((Decimal(b['raw_column7_sum']) for b in bars),Decimal(0))==sum((Decimal(x['v']) for start,rows in groups.items() if len(rows)==d//60000 and rows[0]['t']==start and rows[-1]['t']+60000==start+d for x in rows),Decimal(0))
   aggregate.append({'market':market,'timeframe':tf,'bars':bars});coverage.append({'market':market,'timeframe':tf,'calendar':'DERIVED_UTC_MONDAY' if tf=='1w' else 'DERIVED_UTC','complete_bars':len(bars),'partial_buckets_excluded':partial,'raw_minutes':len(xs),'no_zero_fill':True})
 expected={'15m':8832,'30m':4416,'1h':2208,'4h':552,'1d':92,'1w':13}
 check('Complete UTC aggregation conserves minute membership and exact literal field sums',all(x['complete_bars']==expected[x['timeframe']] for x in coverage),{'series':12,'partial_week_minutes_per_market':1440})
 check('Daily and weekly are derived UTC, incomplete final week excluded',all((not x['partial_buckets_excluded']) if x['timeframe']!='1w' else len(x['partial_buckets_excluded'])==1 and x['partial_buckets_excluded'][0]['observed_minutes']==1440 for x in coverage))
 with tempfile.TemporaryDirectory(prefix='report2-btc-saved-') as td:
  inp=Path(td)/'input.json';out=Path(td)/'features.json';inp.write_bytes(encoded({'study_first_known_ts':known,'series':aggregate}))
  node=Path('/Users/mac/.nvm/versions/node/v24.21.0/bin/node');assert node.is_file()
  result=subprocess.run([str(node),str(HERE/'compute-features.mjs'),str(inp),str(out),str(P)],capture_output=True,text=True,cwd=ROOT)
  print(result.stdout,end='');assert result.returncode==0,result.stderr
  f=json.loads(out.read_text());assert f['protocol_sha256']==PROTO_SHA
 check('Existing pure features functional replay and actual June prefix invariance',all(x['pass'] for x in f['prefixChecks']),f['prefixChecks'])
 check('All detected backgrounds are exactly20 past contiguous same-interval bars',all(len(e['background'])==20 and e['background'][-1]['end_ts']==e['candle']['start_ts'] and all(b['end_ts']<=e['candle']['start_ts'] for b in e['background']) for e in f['events']))
 check('No fabricated weekly baseline or production admission',all(s['candidates']==0 and s['insufficient_history'] for s in f['series'] if s['timeframe']=='1w'))
 # Each saved minute close is a sample; no intrabar order inferred from OHLC extremes.
 hs=PLAN['historical_descriptive_path_protocol']['horizons_ms'];durations=list(hs.items());path_counts=collections.Counter();outcomes=[]
 indexed={k:([x['t']+60000 for x in xs],[float(x['close']) for x in xs]) for k,xs in minutes.items()}
 for event in f['events']:
  ts,prices=indexed[event['market']];end=event['candle']['end_ts'];anchor=float(event['candle']['close']);start=bisect.bisect_right(ts,end)
  # Four literal price barriers give both sides without choosing a winning side.
  upper_success=anchor*1.05;lower_success=anchor*.95;lower_adverse=anchor*.97;upper_adverse=anchor*1.03
  first={k:None for k in ['long_favorable','long_adverse','short_favorable','short_adverse']};lo=hi=anchor;j=start
  for horizon,d in durations:
   target=end+d;stop=bisect.bisect_right(ts,target)
   while j<stop:
    price=prices[j];clock=ts[j];lo=min(lo,price);hi=max(hi,price)
    if first['long_favorable'] is None and price>=upper_success:first['long_favorable']=clock
    if first['long_adverse'] is None and price<=lower_adverse:first['long_adverse']=clock
    if first['short_favorable'] is None and price<=lower_success:first['short_favorable']=clock
    if first['short_adverse'] is None and price>=upper_adverse:first['short_adverse']=clock
    j+=1
   complete=stop>start and ts[stop-1]==target and stop-start==d//60000
   for direction,sign,pre in [('LONG',1,'long'),('SHORT',-1,'short')]:
    fav=first[pre+'_favorable'];adv=first[pre+'_adverse'];status=('OPPOSITE' if adv is not None and (fav is None or adv<fav) else 'FALSE' if fav is not None and adv is not None else 'SUCCESSFUL' if fav is not None else 'UNWORKED') if complete else 'INCOMPLETELY_OBSERVED'
    record={'event_id':event['event_id'],'market':event['market'],'timeframe':event['timeframe'],'direction':direction,'horizon':horizon,'namespace':'RETROSPECTIVE_VIRTUAL_CLOSE_PATH_NOT_REAL_ALERT_OUTCOME','virtual_anchor_end_ts':end,'actual_first_known_ts':known,'target_ts':target,'status':status,'complete':complete,'saved_postevent_samples':stop-start,'last_sample_ts':ts[stop-1] if stop>start else None,'favorable_first_sample_ts':fav,'adverse_first_sample_ts':adv,'endpoint_directional_return_pct':sign*(prices[stop-1]/anchor-1)*100 if complete else None,'sampled_mfe_pct':(hi/anchor-1)*100 if sign==1 else (1-lo/anchor)*100,'sampled_mae_pct':(lo/anchor-1)*100 if sign==1 else (1-hi/anchor)*100,'censor_reason':None if complete else 'SAVED_WINDOW_END_BEFORE_TARGET_OR_MISSING_ENDPOINT'}
    outcomes.append(record);path_counts[(event['market'],event['timeframe'],direction,horizon,status)]+=1
 check('Both hypothetical directions and all fixed horizons retained without winner selection',len(outcomes)==len(f['events'])*2*len(hs) and len({(r['event_id'],r['direction'],r['horizon']) for r in outcomes})==len(outcomes))
 check('All complete paths have exact endpoint and expected contiguous minute count',all((r['last_sample_ts']==r['target_ts'] and r['saved_postevent_samples']==hs[r['horizon']]//60000) if r['complete'] else r['endpoint_directional_return_pct'] is None and r['status']=='INCOMPLETELY_OBSERVED' for r in outcomes))
 check('Backfill chronology retained, no real post-first-known path or accuracy claim',known>max(x['t']+60000 for xs in minutes.values() for x in xs) and all(e['first_known_ts']==known for e in f['events']),{'conservative_study_known_ts':known,'saved_archive_available_range':[min(s['available_at'] for s in sources),max(s['available_at'] for s in sources)],'actual_prospective_cells':0})
 # Independent direct sampled check on each first actual event/timeframe/market, not old test suites.
 chosen={}
 for e in f['events']:chosen.setdefault((e['market'],e['timeframe']),e)
 omap={(r['event_id'],r['direction'],r['horizon']):r for r in outcomes};independent=0
 for e in chosen.values():
  ts,prices=indexed[e['market']];anchor=float(e['candle']['close']);end=e['candle']['end_ts'];a=bisect.bisect_right(ts,end)
  for horizon,d in durations:
   b=bisect.bisect_right(ts,end+d)
   if not (b>a and ts[b-1]==end+d):continue
   for direction,sign in [('LONG',1),('SHORT',-1)]:
    # Exact same predeclared price-threshold comparisons avoid changing rounding policy.
    fav=next((ts[k] for k in range(a,b) if (prices[k]>=anchor*1.05 if sign==1 else prices[k]<=anchor*.95)),None)
    adv=next((ts[k] for k in range(a,b) if (prices[k]<=anchor*.97 if sign==1 else prices[k]>=anchor*1.03)),None)
    r=omap[(e['event_id'],direction,horizon)];assert r['favorable_first_sample_ts']==fav and r['adverse_first_sample_ts']==adv;independent+=1
 check('First actual candidate per market/timeframe matches independent direct sampled first-passage scan',independent>0,{'compared_cells':independent})
 pairs=[]
 for tf in PLAN['aggregation']['timeframes']:
  by={m:{(e['candle']['start_ts'],e['candle']['end_ts']) for e in f['events'] if e['market']==m and e['timeframe']==tf} for m in PLAN['markets']};fu,sp=by['usd_m_futures'],by['spot'];pairs.append({'timeframe':tf,'futures_candidates':len(fu),'spot_candidates':len(sp),'same_window_both':len(fu&sp),'futures_only':len(fu-sp),'spot_only':len(sp-fu),'independent_upstreams':1,'status':'COINCIDENT_RESEARCH_RULE_HITS_NOT_NATIVE_VOLUME_OR_CAUSAL_CONFIRMATION'})
 check('Paired market windows are exact; spot never removes a futures candidate',all(x['futures_candidates']==x['same_window_both']+x['futures_only'] and x['spot_candidates']==x['same_window_both']+x['spot_only'] for x in pairs))
 cells=[]
 for s in f['series']:
  for direction in ['LONG','SHORT']:
   for horizon in hs:
    counts={status:path_counts[(s['market'],s['timeframe'],direction,horizon,status)] for status in ['SUCCESSFUL','FALSE','OPPOSITE','UNWORKED','INCOMPLETELY_OBSERVED']};assert sum(counts.values())==s['candidates'];cells.append({'market':s['market'],'timeframe':s['timeframe'],'direction':direction,'horizon':horizon,'descriptive_candidate_cells':s['candidates'],'counts':counts,'empirical_precision':None,'recall':None})
 guard()
 (HERE/'events.jsonl').write_bytes(b''.join(encoded(e) for e in f['events']))
 (HERE/'historical-paths.jsonl').write_bytes(b''.join(encoded(r) for r in outcomes))
 summary={'schema':'ACTUAL_SAVED_BTC_CANDLE_STUDY_V1','protocol_sha256':PROTO_SHA,'protocol_precalculation_commit':subprocess.check_output(['git','rev-parse',PROTO_HEAD],cwd=ROOT).decode().strip(),'main_at_acquire':PLAN['main_at_plan'],'recorded_ts':int(time.time()*1000),'actual_study_first_known_ts':known,'study_first_known_utc':stamp(known),'input_sources':sources,'source_archive':PLAN['outer_zip'],'native_source_publication_ts':None,'quantity_unit_status':'PENDING_OFFICIAL_DEFINITION_AND_NATIVE_CARRIER; relative ratios stay within exactly same file field/market/series','price_role':'SAVED_HISTORICAL_PRICE_ONLY','discovery':'BACKFILLED','upstream_count':1,'distinct_assets':1,'production_anomaly_cards':0,'prospective_qualified_events':0,'prospective_precision':None,'prospective_recall':None,'activated':False,'entry_authorized':False,'main_score_effect':0,'coverage':coverage,'series':f['series'],'same_window_spot_futures':pairs,'historical_price_path_cells':cells,'new_connected_actual_data_case':{'pass':1,'fail':0,'assertion_groups':len(CHECKS),'groups':CHECKS,'old450455_or_source_suites_run':0,'provider_HTTP':0,'native_SQL':0,'production_imports':0},'artifacts':{n:{'sha256':sha((HERE/n).read_bytes()),'bytes':(HERE/n).stat().st_size,'lines':len(f['events']) if n=='events.jsonl' else len(outcomes)} for n in ['events.jsonl','historical-paths.jsonl']},'limits_ru':['Все события найдены после рынка; first_known не подменён июньским close. Oct9 receipt clocks не доказывают wire completion/source publication.','Колонка7 — literal field, единицы не квалифицированы; относительная величина не стала native turnover/агрессией.','LONG/SHORT path labels — отдельный виртуальный ретроспективный опыт от event close, не реальные сигналы и не входы. Полный фактический post-firstknown результат отсутствует.','Все события одного BTC и одного upstream, перекрывающиеся бары/горизонты/два рынка не независимые испытания; причинная полезность источника/accuracy/recall/доходность NULL.','Дневные/недельные бары получены с UTC календарём, не заявлены как native биржевые.13полных недель не дают20прошлых недель фона.','Использована существующая purefeatures formula; detectClosed и production admit не вызваны, identity/unit authority не выдуманы.','ENTRY followup и physicalstorage остаются DEFERRED; новые native/runtime/TG действия не выполнялись.']}
 (HERE/'result.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'case':'ONE_NEW_SAVED_ACTUAL_DATA_CANDLE_STUDY','pass':1,'fail':0,'assertion_groups':len(CHECKS),'raw_rows':264960,'events':len(f['events']),'retrospective_virtual_path_cells':len(outcomes),'series':f['series'],'artifact_SHA256':{n:sha((HERE/n).read_bytes()) for n in ['result.json','events.jsonl','historical-paths.jsonl']}},ensure_ascii=False))
if __name__=='__main__':main()
