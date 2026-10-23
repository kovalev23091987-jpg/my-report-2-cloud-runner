from pathlib import Path
import json,zipfile,hashlib,sys
ROOT=Path(__file__).resolve().parent
RUN='1792395072923-1792395084308';HEAD='a4b41da462b43956dc40d6873b8e2769db96d7a6'
def data(archive,member):
 with zipfile.ZipFile(ROOT/'originals'/archive) as z:return json.loads(z.read(member))
def encode(x):return(json.dumps(x,ensure_ascii=False,indent=2,sort_keys=True)+'\n').encode()
def project():
 report=data('report2-run-result.zip','report2-run-result.json');info=data('report2-telegram-info-proof.zip','telegram-info-proof.json')
 inv={}
 for p in sorted((ROOT/'originals').iterdir()):
  inv[p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
  if p.suffix=='.zip':
   with zipfile.ZipFile(p) as z:inv[p.name]['members']={n:{'bytes':len(z.read(n)),'sha256':hashlib.sha256(z.read(n)).hexdigest()} for n in z.namelist()}
 out={'schema':'NEW_NIL_BITGET_CURRENT_SOURCE_CONSUMER_BOUNDARY_V1','cloud_run':39216464096,'native_head':report['head'],'business_run':report['run_id'],'original_inventory':inv,'candidates':[],
 'boundaries':{'raw_full240_cache_and_wire_envelopes':'NOT_RETAINED_IN_COMPACT_ORIGINAL','native_cache_ACK':'NOT_PROVEN_BY_RENDERED_ROW','root_SENT229_and_budget_acceptance':'COORDINATOR_ONLY_NOT_REPEATED','raw32normalizedflag_acceptance':'NOT_REPEATED','current105_or_new_Kraken_connection':False,'old_BR_score_not_forward_filled':True,'new_shared_repair_established':False},
 'native_LIQ_acquisition_diagnostic':report['liquidation_source_acquisition_audit'],'info_stage':info}
 for c in report['candidates']:
  rendered=c['block_rendered_results'];blocks={}
  for b in ['N05','N10','N12','N15']:
   blocks[b]={'coverage':c['block_coverage']['blocks'][b],'consumer':c['block_decision_use']['blocks'][b],'manual_receipts':[q for q in rendered['context_receipts'] if q['block_id']==b]}
  composites=[]
  for q in rendered['context_receipts']:
   if q['block_id']!='N12':continue
   origins=q.get('component_origins',[]);known=[r.get('first_known_ts') for r in origins if isinstance(r.get('first_known_ts'),int)]
   composites.append({'label':q['label'],'outer_source_ts':q.get('source_ts'),'outer_observed_ts':q.get('observed_ts'),'evidence_ids':q.get('evidence_ids',[q.get('evidence_id')]),'component_origins':origins,'DERIVED_latest_component_first_known_ts':max(known) if known else None,'DERIVED_all_components_known_by_candidate':all(k<=c['observed_ts'] for k in known) if origins and len(known)==len(origins) else None,'derived_not_stored_composite_clock':True})
  l=c['canonical']['liquidations']
  out['candidates'].append({'contract':c['contract'],'publication_id':c['publication_id'],'snapshot_id':c['snapshot_id'],'observed_ts':c['observed_ts'],'direction':c['direction'],'canonical_state':c['canonical_state'],'scores':c['canonical']['scores'],'decision_score_status':c['block_decision_use']['score_status'],'decision_direction_closed':c['block_decision_use']['direction_closed'],'source_role_summary':{k:v for k,v in c['source_role_publication_audit'].items() if k not in ['receipts']},'source_priority':c['source_collection_priority'],'shared_transport_attribution':c['block_decision_use']['shared_n05_n12_http_attribution'],'blocks':blocks,'composite_time_boundaries':composites,'manual_text':c['manual_text'],'detailed_Telegram':{k:v for k,v in rendered.items() if k.startswith('telegram')},'liquidations':{k:l.get(k) for k in ['status','reason','all_zones','calculated_scenarios','provider_zone_count','source_receipts','coverage_status','acquisition_diagnostics']},'targets':c['canonical']['targets']})
 return out

def verify(x):
 checks=[]
 def check(n,v):
  assert v,n
  checks.append(n)
 check('original report ZIP SHA',x['original_inventory']['report2-run-result.zip']['sha256']=='69f19988ec9fc089433bf4cb7e240f523849d013162696d9e2b3ec589d6ffd30')
 check('original info ZIP SHA',x['original_inventory']['report2-telegram-info-proof.zip']['sha256']=='24b743be35cedfff597abac838467ac9ea193b98f1edcafe1b52ed974a88ffef')
 run=json.loads((ROOT/'originals/run.json').read_text());check('cloud ID/head exact',run['id']==39216464096 and run['head_sha']==HEAD)
 check('business original native head and run',x['native_head']==HEAD and x['business_run']==RUN)
 check('two exact new candidates',[c['contract'] for c in x['candidates']]==['NIL-USDT','BR-USDT'])
 nil,br=x['candidates'];n5=nil['blocks']['N05'];n10=nil['blocks']['N10'];n12=nil['blocks']['N12'];n15=nil['blocks']['N15']
 check('NIL source gate two origins five receipts',nil['source_role_summary']['status']=='CLOSED' and nil['source_role_summary']['distinct_verified_origins']==['GATE_OFFICIAL','HTX_OFFICIAL'] and nil['source_role_summary']['usable_role_receipt_count']==5)
 check('NIL interest91 not overall/probability',nil['scores']=={'overall_0_100':None,'coin_interest_0_100':91,'entry_readiness_0_100':None,'is_probability':False})
 check('actual NIL four neutral N10 facts',n10['consumer']['valid_fact_count']==4 and n10['consumer']['score_contribution']==0 and len(n10['manual_receipts'])==4)
 bitget=next(q for q in n10['manual_receipts'] if 'Bitget' in q['label'])
 check('actual Bitget N10 evidence ID',bitget['evidence_id']=='EV2:084be88f47dd4db91a7c2613217fec698017857db4c93df8521bd8796f64a37c')
 check('Bitget source and candidate clocks',bitget['source_ts']==1792395120000 and bitget['observed_ts']==1792395207582)
 check('Bitget15m active5 measured price path','активных минут 5' in bitget['value'] and '0,07845 → 0,07863 USDT' in bitget['value'])
 check('Bitget bounded comparison no new target/score','Цель, баллы и разрешение входа этим не меняются' in bitget['value'] and bitget['score_contribution']==0)
 ring=n5['coverage']['source_checks']['PRIMARY_HTX_FUTURES_FLOW']['source_diagnostic']['signed_raw_ring']
 check('primary HTX closed earlier4h retained',ring['status']=='CLOSED_EXACT_FUTURES_FLOW_4H' and ring['reported_window_end_ts']==1792395060000)
 f=n5['manual_receipts'][0];check('available N05 is later BitgetSPOT4h',f['source_ts']==1792395120000 and f['observed_ts']==1792395181364 and f['value'].startswith('BITGET спот:'))
 check('60s distinct windows not merged',f['source_ts']-ring['reported_window_end_ts']==60000)
 check('N05 manual fact not invented decision effect',n5['consumer']['valid_fact_count']==1 and n5['consumer']['participation_status']=='USE_NOT_PROVEN' and n5['consumer']['score_contribution']==0)
 check('N12 two neutral facts',n12['consumer']['valid_fact_count']==2 and n12['consumer']['score_contribution']==0)
 composite=nil['composite_time_boundaries'][0]
 check('three component IDs not three N12 facts',len(composite['evidence_ids'])==3 and len(composite['component_origins'])==3 and len(n12['manual_receipts'])==1)
 check('composite includes N05fourhour and N12Bitget5m',{r['block_id'] for r in composite['component_origins']}=={'N05','N12'} and any(r['provider_id']=='BITGET_SPOT_TRADES' for r in composite['component_origins']))
 check('composite later component availability computed only',composite['outer_observed_ts']==1792395162394 and composite['DERIVED_latest_component_first_known_ts']==1792395181364 and composite['DERIVED_all_components_known_by_candidate'])
 check('18970ms outer-base difference is not runtime future input',composite['DERIVED_latest_component_first_known_ts']-composite['outer_observed_ts']==18970 and nil['observed_ts']>composite['DERIVED_latest_component_first_known_ts'])
 check('manual keeps Bitget recent sell sample','Bitget спот: 8 сделок, покупки 0, продажи 1\u00a0775,07 USDT' in n12['manual_receipts'][0]['value'])
 check('N05/N12 five transport attempts not ten',nil['shared_transport_attribution']['total_http']==5 and nil['shared_transport_attribution']['n05_http']==5 and nil['shared_transport_attribution']['n12_http']==0 and nil['shared_transport_attribution']['no_double_count'])
 check('internal cap skips not provider failures',all(r['http']==0 and r['status']=='CALLER_FIVE_REQUEST_CAP' for r in nil['shared_transport_attribution']['n12_routes']))
 priority=nil['source_priority']['public_venues'];check('useful Bitget routed before Backpack',priority['ordered_collectors'].index('BITGET')<priority['ordered_collectors'].index('BACKPACK') and priority['score_changed'] is False)
 check('two N15 facts real small consumer effect',n15['consumer']['valid_fact_count']==2 and n15['consumer']['score_contribution']==0.0116 and n15['consumer']['participation_status']=='SCORE_EFFECT_PROVEN')
 check('N15 rendered zero does not erase actual effect',len(n15['manual_receipts'])==2 and all(q['score_contribution']==0 for q in n15['manual_receipts']))
 zones=nil['liquidations']['all_zones'];check('one observed native position level',nil['liquidations']['status']=='CLOSED' and len(zones)==1 and zones[0]['kind']=='NATIVE_FUTURE_LEVEL' and zones[0]['estimated'] is False)
 zone=zones[0];check('native USDC not USDT conversion',zone['price_quote']=='USDC' and zone['notional_unit']=='USDC' and zone['notional']==1014198.2706 and zone['exact_notional_usdt'] is None)
 check('legacy notional_usdt alias not native denomination',zone['notional_usdt']==zone['notional'] and zone['notional_unit']=='USDC')
 check('native liquidation is bounded account not target',zone['coverage']=='EXPLICIT_PUBLIC_ACCOUNT_SAMPLE' and zone['position_count']==1 and zone['decision_target_eligible'] is False and nil['targets']==[])
 check('BR exact new base-score missing state',br['decision_score_status']=='BASE_SCORE_MISSING' and br['direction'] is None and br['scores']['coin_interest_0_100'] is None)
 b12=br['blocks']['N12']['consumer'];check('BR unscored diagnostics preserved',b12['valid_fact_count']==1 and b12['score_contribution'] is None and b12['participation_status']=='UNSCORED_DIAGNOSTIC_AND_RENDERING_PROVEN' and b12['score_application_status']=='NO_BASE_SCORE_NO_APPLICATION')
 check('BR zero hypothetical impact not actual application',b12['impact_diagnostic']['score_recomputed'] is False and b12['impact_diagnostic']['rows'][0]['actual_score_contribution']==0 and 'BASE_SCORE_MISSING' in b12['impact_diagnostic']['rows'][0]['reasons'] and b12['score_application_receipt_count']==0)
 check('BR no levels remains unknown unavailable',br['liquidations']['status']=='NOT_CLOSED' and br['liquidations']['reason']=='FACTUAL_FUTURE_LEVELS_NOT_AVAILABLE')
 for c in [nil,br]:check(c['contract']+' detailed block delivery not borrowed',c['detailed_Telegram']['telegram_context_receipts']==[] and c['detailed_Telegram']['telegram_delivery_proven'] is False and c['detailed_Telegram']['telegram_message_id'] is None)
 check('NIL observed approved text is not detailedACK',nil['detailed_Telegram']['telegram_payload_status']=='APPROVED_PAYLOAD_TEXT_OBSERVED')
 check('root budget and SENT acceptance not repeated',x['boundaries']['root_SENT229_and_budget_acceptance']=='COORDINATOR_ONLY_NOT_REPEATED')
 check('analysis byte reproducible',(ROOT/'analysis.json').read_bytes()==encode(x))
 return{'schema':'NEW_NIL_BITGET_ORIGINAL_CONSUMER_BOUNDARY_VERIFICATION_V1','PASS':len(checks),'FAIL':0,'checks':checks,'analysis_sha256':hashlib.sha256(encode(x)).hexdigest(),'old_accepted_suites_or_probes_repeated':0,'native_sourcecode_not_executed':True,'sourceHTTP':0,'native_SQL':0,'MAIN':0,'Telegram':0}
if __name__=='__main__':
 x=project()
 if '--write' in sys.argv:(ROOT/'analysis.json').write_bytes(encode(x))
 else:print(json.dumps(verify(x),ensure_ascii=False,indent=2))
