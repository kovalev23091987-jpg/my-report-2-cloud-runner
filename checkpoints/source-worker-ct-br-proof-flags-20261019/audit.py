"""New saved-original projection; never executes production gates or acquisition."""
from pathlib import Path
import hashlib,json,zipfile,sys
ROOT=Path(__file__).resolve().parent
HEAD='0dc1c7e68064dd88f076546f12994603baba6199'
RUN='1792358587597-1792358599200'
BLOCKS=['N04','N05','N10','N11','N12','N15']
def sha(b): return hashlib.sha256(b).hexdigest()
def encoded(j): return (json.dumps(j,ensure_ascii=False,indent=2,sort_keys=True)+'\n').encode()
def original(name,member):
 with zipfile.ZipFile(ROOT/'originals'/name) as z:return json.loads(z.read(member))
def project():
 report=original('artifact-12150558634.zip','report2-run-result.json')
 info=original('artifact-12150474112.zip','telegram-info-proof.json')
 delivery=original('artifact-12150558634.zip','same-run-delivery-proof.json')
 inventory={}
 for file in sorted((ROOT/'originals').iterdir()):
  b=file.read_bytes();item={'bytes':len(b),'sha256':sha(b)}
  if file.suffix=='.zip':
   with zipfile.ZipFile(file) as z:item['members']={n:{'bytes':len(z.read(n)),'sha256':sha(z.read(n))} for n in z.namelist()}
  inventory[file.name]=item
 out={'schema':'CT_BR_SOURCE_NORMALIZED_FACT_CONSUMER_BOUNDARY_V1','cloud_run':39167567608,'native_head':HEAD,'business_run':RUN,'original_inventory':inventory,'candidates':[],
 'limits':{'raw_source_envelope':'NOT_RETAINED','underlying_raw_missing_field':'UNKNOWN','first_authority_return':'NOT_RECONSTRUCTED','normalized_flags_are_executed_predicate_trace':False,'source_compatible_true_is_positive_binding_proof':False,'coordinator_budget_or_terminal_acceptance_repeated':False,'current_coverage_or_delivery_claim':False,'shared_repair_established':False},
 'original_LIQ_route_audit':report['liquidation_source_acquisition_audit'],
 'binding_purposes':{'N11':'HTX_EXECUTION_INSTRUMENT_AND_BOOK','source_role_gate':'EXACT_CROSS_VENUE_PROJECT_AND_METRIC_FACT','N04':'EXACT_CHAIN_NATIVE_OR_TOKEN_AND_EVENT','N15':'EXACT_PROVIDER_PROJECT_AND_SECTOR_MEMBERSHIP'},
 'info_stage':{k:info['lifecycle'][k] for k in ['mode','network_send','dispatch_enabled','status','completed_handoffs','transitions']},
 'delivery_boundary':{'status':delivery['status'],'delivery_status':delivery['delivery_status'],'case_contracts':[c.get('contract') for c in delivery['cases']],'CT_BR_same_run_SENT':False,'detailed_block_delivery':'NOT_PROVEN','STRK_terminal_case':'COORDINATOR_ONLY_NOT_CT_OR_BR'}}
 for c in report['candidates']:
  blocks={}
  for bid in BLOCKS:
   cov=c['block_coverage']['blocks'][bid];d=c['block_decision_use']['blocks'][bid]
   blocks[bid]={'coverage':{k:cov[k] for k in ['status','observed_facts','valid_context_facts','usable_facts','source_statuses','source_checks','decision_path']},'consumer':{k:v for k,v in d.items() if k not in ['source_accounting']},'source_accounting':d.get('source_accounting'),'manual_receipts':[q for q in c['block_rendered_results']['context_receipts'] if q['block_id']==bid]}
  liq=c['canonical']['liquidations'];x={'contract':c['contract'],'publication_id':c['publication_id'],'snapshot_id':c['snapshot_id'],'observed_ts':c['observed_ts'],'direction':c['direction'],'canonical_state':c['canonical_state'],'lifecycle_event':c['lifecycle_event'],'actionability_status':c['actionability_status'],'actionability_reason':c['actionability_reason'],'scores':c['canonical']['scores'],'source_role_audit':c['source_role_publication_audit'],'blocks':blocks,'manual_text':c['manual_text'],'render_delivery':{k:v for k,v in c['block_rendered_results'].items() if k.startswith('telegram')},'liquidations':{k:liq.get(k) for k in ['status','reason','coverage_status','above','below','all_zones','display_source_zones','calculated_scenarios','provider_zone_count','calculated_scenario_count','displayed_zone_count','display_max_per_side','future_source_status','acquisition_diagnostics','htx_source_backed_model']},'targets':c['canonical']['targets']}
  out['candidates'].append(x)
 return out

def verify(a):
 checks=[]
 def check(name,condition):
  if not condition:raise AssertionError(name)
  checks.append(name)
 inv=a['original_inventory'];check('report ZIP original SHA',inv['artifact-12150558634.zip']['sha256']=='767027644c540b55b7c1d6c25c5d321cde9893956479320680ac53174098c42a');check('info ZIP original SHA',inv['artifact-12150474112.zip']['sha256']=='b837207cb7b55898d49d3314dff2932e23401ecedf1c7b7684cf837ea8b6a127')
 run=json.loads((ROOT/'originals/run.json').read_text());check('cloud head and run',run['id']==39167567608 and run['head_sha']==HEAD)
 check('exact two new candidates',[x['contract'] for x in a['candidates']]==['CT-USDT','BR-USDT'])
 report=original('artifact-12150558634.zip','report2-run-result.json');check('business head and run',report['head']==HEAD and report['run_id']==RUN)
 info=original('artifact-12150474112.zip','telegram-info-proof.json');check('info same head and run',info['head']==HEAD and info['source_run_id']==RUN)
 ct,br=a['candidates'];cr=ct['source_role_audit'];rr=br['source_role_audit']
 check('CT closed three exact origins',cr['status']=='CLOSED' and cr['distinct_verified_origins']==['GATE_OFFICIAL','HTX_OFFICIAL','OKX_OFFICIAL'])
 check('CT 15 usable of21',cr['usable_role_receipt_count']==15 and cr['classified_receipt_count']==21)
 check('CT exclusions exact',cr['exclusion_reason_counts']=={'SOURCE_NOT_CLOSED':2,'FACT_OR_IDENTITY_NOT_VERIFIED':1,'UNKNOWN_OR_CONFLICTING_PROVIDER':3})
 check('BR gate narrow refusal',rr['status']=='NOT_CLOSED' and rr['reasons']==['FEWER_THAN_TWO_VERIFIED_DISTINCT_ORIGINS'] and rr['distinct_verified_origins']==['HTX_OFFICIAL'])
 check('BR1usable of11',rr['usable_role_receipt_count']==1 and rr['classified_receipt_count']==11)
 expected={'decision_usable':False,'fact_contract_status':'NOT_CLOSED','identity_status':'NOT_CLOSED','identity_object_status':'NOT_CLOSED','source_compatible':True,'freshness_status':'CURRENT_AT_OBSERVATION','normalization_status':'LEGACY_VALUE_PASSTHROUGH'}
 gates=[r for r in rr['receipts'] if r['source_key']=='GATE_OFFICIAL'];check('BR four Gate metrics',[r['metric'] for r in gates]==['FUNDING_RATE','OI_CHANGE_1H','PRICE_CHANGE_4H','TAKER_BALANCE_1H_RAW'])
 for r in gates:
  check('BR '+r['metric']+' seven normalized flags',r['retained_fact_proof']==expected)
  check('BR '+r['metric']+' excluded NULL not0',r['normalized_value'] is None and not r['usable'] and r['exclusion_reason']=='FACT_OR_IDENTITY_NOT_VERIFIED')
  check('BR '+r['metric']+' original receipt clock',r['received_ts']==1792358613385 and r['max_age_sec']==7200)
 taker=next(r for r in cr['receipts'] if r['source_key']=='GATE_OFFICIAL' and r['metric']=='TAKER_BALANCE_1H_RAW')
 check('CT status first despite unclosed laterflags',taker['exclusion_reason']=='SOURCE_NOT_CLOSED' and taker['retained_fact_proof']==expected)
 turnover=next(r for r in cr['receipts'] if r['metric']=='SPOT_TURNOVER_24H');check('CT turnover identity/fact boundary',turnover['exclusion_reason']=='FACT_OR_IDENTITY_NOT_VERIFIED' and turnover['normalized_value'] is None and turnover['retained_fact_proof']==expected)
 transitions=a['info_stage']['transitions'];check('CT actual info transition retained',transitions[0]=={'contract':'CT-USDT','wave_id':'EDW:CT-USDT:1792344030224:G7','direction':'SHORT','status':'CLOSED','previous_status':'IDEA_REMOVED','current_status':'OBSERVE','reason':'USEFUL_LIVE_OBSERVATION','removal_receipt':None,'dispatch':None,'score_0_100':82})
 check('BR actual sidecar nonpublishable only',transitions[1]=={'contract':'BR-USDT','status':'CANONICAL_STATE_NOT_PUBLISHABLE','reason':'CANONICAL_STATE_NOT_PUBLISHABLE','current_status':None,'dispatch':None})
 for c,counts,interest,state in [(ct,[1,1,3,1,2,1],83,'OBSERVE'),(br,[0,1,2,1,1,0],82,'REJECTED')]:
  symbol=c['contract'];check(symbol+' canonical score not probability',c['scores']=={'overall_0_100':None,'coin_interest_0_100':interest,'entry_readiness_0_100':None,'is_probability':False} and c['canonical_state']==state)
  check(symbol+' null lifecycle unassessed',c['lifecycle_event'] is None and c['actionability_status']=='UNASSESSED' and c['actionability_reason'] is None)
  for bid,count in zip(BLOCKS,counts):check(symbol+' '+bid+' exact retained fact count',c['blocks'][bid]['consumer']['valid_fact_count']==count)
  n05=c['blocks']['N05'];check(symbol+' N05 manual use not decision use',n05['consumer']['participation_status']=='USE_NOT_PROVEN' and len(n05['manual_receipts'])==1 and n05['consumer']['score_contribution']==0)
  check(symbol+' N11 neutral execution only',c['blocks']['N11']['consumer']['participation_status']=='NEUTRAL_ASSESSMENT_AND_RENDERING_PROVEN' and c['blocks']['N11']['consumer']['score_contribution']==0)
  check(symbol+' no detailed telegram proof',not c['render_delivery']['telegram_delivery_proven'] and c['render_delivery']['telegram_message_id'] is None and c['render_delivery']['telegram_context_receipts']==[])
  check(symbol+' actualtargets empty',c['targets']==[])
 check('CT N15 actual decimal preserved',ct['blocks']['N15']['consumer']['score_contribution']==0.9548)
 check('BR N12 tiny real effect not erased',br['blocks']['N12']['consumer']['score_contribution']==0.0028 and br['blocks']['N12']['consumer']['participation_status']=='SCORE_EFFECT_PROVEN')
 check('BR chain and sector identity purposes distinct',br['blocks']['N04']['coverage']['source_statuses']['CHAIN_EVENTS']=='EXACT_ASSET_IDENTITY_REQUIRED' and br['blocks']['N15']['coverage']['source_statuses']['COINGECKO_SECTOR']=='EXACT_SECTOR_REGISTRY_REQUIRED')
 check('BR external missingidentity not providerfailure',br['blocks']['N05']['coverage']['source_statuses']['EXTERNAL_N05_FLOW']=='EXACT_ASSET_IDENTITY_REQUIRED')
 check('CT chain event not flow',ct['blocks']['N04']['consumer']['score_contribution']==0)
 check('CT modelunits and target boundary',all(z['price_quote']=='USD' and z['exact_notional_usdt'] is None and z['decision_target_eligible'] is False and z['kind']=='PROJECTED' for z in ct['liquidations']['calculated_scenarios']))
 check('CT saved native route unsupported not broken',a['original_LIQ_route_audit']['routes'][0]['status']=='UNSUPPORTED_NATIVE_SYMBOL' and a['original_LIQ_route_audit']['routes'][0]['source_outcome']['operational_success'] is True)
 check('CT calculated8 no nativelevels',ct['liquidations']['status']=='CALCULATED_CONTEXT_ONLY' and ct['liquidations']['provider_zone_count']==0 and len(ct['liquidations']['calculated_scenarios'])==8)
 check('BR no available levels not measured0',br['liquidations']['status']=='NOT_CLOSED' and br['liquidations']['calculated_scenarios']==[] and br['liquidations']['reason']=='FACTUAL_FUTURE_LEVELS_NOT_AVAILABLE')
 check('no CT BR SENT borrowed from STRK',a['delivery_boundary']['case_contracts']==['STRK-USDT'] and not a['delivery_boundary']['CT_BR_same_run_SENT'])
 check('no firstauthority/raw reconstruction',a['limits']['first_authority_return']=='NOT_RECONSTRUCTED' and a['limits']['underlying_raw_missing_field']=='UNKNOWN')
 check('projection byte reproducible',(ROOT/'analysis.json').read_bytes()==encoded(a))
 return {'schema':'NEW_CT_BR_ORIGINAL_BOUNDARY_ASSERTIONS_V1','PASS':len(checks),'FAIL':0,'checks':checks,'analysis_sha256':sha(encoded(a)),'prior_accepted_suites_rerun':0,'new_provider_native_SQL_WS_MAIN_Telegram':0}
if __name__=='__main__':
 a=project()
 if '--write' in sys.argv:(ROOT/'analysis.json').write_bytes(encoded(a))
 else:print(json.dumps(verify(a),ensure_ascii=False,indent=2))
