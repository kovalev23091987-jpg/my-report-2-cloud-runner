"""ONE new artifact/fact linkage verification. Never imports project runtime."""
import importlib.util
import json
import pathlib

P = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('new_pair_projection', P / 'build-audit.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
checks = []
def check(name, ok):
    checks.append({'name': name, 'pass': bool(ok)})

audit, originals, code = m.build()
for name, value in [('analysis.json', audit), ('originals.json', originals), ('code-paths.json', code)]:
    check('Byte reproducible NEW ' + name,
          (P / name).read_text() == json.dumps(value, ensure_ascii=False, indent=2) + '\n')
check('Exact NEW native run/head', audit['run_id'] == '1792412076494-1792412090239' and audit['native_head'] == m.NATIVE)
check('Exactly two original ZIP and seven members, hash binding only', len(originals['archives']) == 2 and sum(len(x['members']) for x in originals['archives']) == 7)
check('ZIP digests match immutable artifact receipts', all('sha256:' + x['sha256'] == x['expected_digest'] for x in originals['archives']))
check('Every original JSON digest matches saved archive receipt', all(v['sha256'] == v['expected_sha256'] for x in originals['archives'] for v in x['members'].values()))
check('Code paths pinned to native and compatible working base', all(x['native_sha256'] == x['working_base_sha256'] for x in code.values()))
check('All selected source code anchors exist without module execution', all(a['lines'] for x in code.values() for a in x['anchors']))
expected = {
    'CT-USDT': {'state': 'REJECTED', 'score': None, 'gate': [-0.009023, 5.928603202846983, -8.198489751887816, -4.89084651118011],
                'trade_count': '291 сделок', 'buy': '34 712,07', 'sell': '6 240,56', 'spot_window': [1792411860000,1792412160000],
                'gate_observed': 1792412170990, 'gate_expiry': 1792412230990,
                'flow_buy': '110 676,62', 'flow_sell': '65 807,68', 'flow_known': 1792412154378,
                'n15_score': None, 'n15_facts': 1, 'liq': [0,0]},
    'WLD-USDT': {'state': 'OBSERVE', 'score': 0, 'gate': [0.000073,0.014857993401462544,-1.8711837699428968,27.502034174125306],
                 'trade_count': '251 сделок', 'buy': '53 168,05', 'sell': '20 632,52', 'spot_window': [1792411800000,1792412100000],
                 'gate_observed': 1792412120889, 'gate_expiry': 1792412180889,
                 'flow_buy': '145 299,67', 'flow_sell': '106 146,08', 'flow_known': 1792412101862,
                 'n15_score': 0.2682, 'n15_facts': 2, 'liq': [17,8]},
}
for c in audit['cases']:
    key=c['contract'];e=expected[key];g=c['five_useful_groups'];b=c['actual_block_consumers'];gate=c['Gate_boundary']
    check(key+' five targeted groups, no broad matrix', len(g)==5)
    check(key+' state and base-score NULL/zero distinction', c['canonical_state']==e['state'] and b['N12']['score_contribution']==e['score'])
    check(key+' actual Gate role metric values retained', [x['normalized_value'] for x in gate['role_use']]==e['gate'] and all(x['usable'] for x in gate['role_use']))
    check(key+' four role facts belong to one Gate origin', len(gate['role_use'])==4 and all(x['independence_group']=='GATE_OFFICIAL' for x in gate['role_use']))
    check(key+' optional binder skip coexists with verified normalized identities', gate['optional_binding_return']['reason']=='NO_USABLE_GATE_METRIC_REQUIRING_BINDING' and all(x['asset_identity_verified'] is True for x in gate['normalized_identity_fields_as_retained']))
    flow=g['N05_AVAILABLE_HTX_4H'];text=flow['value'].replace('\u00a0',' ')
    check(key+' retained HTX4h displayed amounts and original clock', e['flow_buy'] in text and e['flow_sell'] in text and flow['source_ts']==1792412040000 and flow['observed_ts']==e['flow_known'])
    check(key+' N05 rendered context is not claimed decision use', b['N05']['participation_status']=='USE_NOT_PROVEN' and b['N05']['valid_fact_count']==1)
    spot=g['N12_BOUNDED_CONTEXT']['GATE_SPOT'];origin=spot['component_origins'][0];text=spot['value'].replace('\u00a0',' ')
    check(key+' NEW Gate bounded spot displayed fact retained', e['trade_count'] in text and e['buy'] in text and e['sell'] in text and origin['provider_id']=='GATE_SPOT_TRADES' and origin['market']=='SPOT')
    check(key+' Gate original 5m window/known-by/expiry conserved', [origin['window_start_ts'],origin['window_end_ts']]==e['spot_window'] and origin['observed_ts']==e['gate_observed'] and origin['first_known_ts']==e['gate_observed'] and origin['expires_at']==e['gate_expiry'])
    comp=g['N12_BOUNDED_CONTEXT']['HTX_with_N05_composite'];origins=comp['component_origins']
    check(key+' HTX composite retains exact two IDs and maximum original firstknown', len(origins)==2 and set(comp['evidence_ids'])==set(x['evidence_id'] for x in origins) and comp['composite_first_known_ts']==max(x['first_known_ts'] for x in origins))
    paths=g['N10_SAME_WINDOW_HTX_PATHS'];recent=paths[1:]
    check(key+' three neutral N10 facts and original aligned15m clocks', len(paths)==3 and b['N10']['valid_fact_count']==3 and all(x['original_clock']['window_start_ts']==1792411200000 and x['original_clock']['window_end_ts']==1792412100000 and x['original_clock']['first_known_ts']<=x['original_clock']['observed_ts']<=x['original_clock']['expires_at'] for x in recent))
    check(key+' N15 real consumer contribution is distinct from manual row zero', b['N15']['score_contribution']==e['n15_score'] and b['N15']['valid_fact_count']==e['n15_facts'] and all(x['score_contribution']==0 for x in g['N15_SECTOR_CONTEXT']))
    liquid=g['LIQ_SOURCE_UNITS_AND_LIMITS']
    check(key+' original scoped native/provider models counted separately', [liquid['source_level_count'],liquid['external_model_scenario_count']]==e['liq'])
    check(key+' detailed rendering receipt does not inherit root delivery', c['render_boundary']['telegram_context_receipts']==[] and c['render_boundary']['telegram_delivery_proven'] is False and c['render_boundary']['telegram_message_id'] is None)
    check(key+' shared external5HTTP not double-counted N05+N12', c['source_budget_and_fallback_boundary']['external_N05_status']=='PARTIAL_FOUR_HOUR_FLOW' and c['source_budget_and_fallback_boundary']['shared_N05_N12_actual_http']==5)
wld=next(c for c in audit['cases'] if c['contract']=='WLD-USDT');liq=wld['five_useful_groups']['LIQ_SOURCE_UNITS_AND_LIMITS']
check('WLD1HL native plus16Orderly estimates remain USDC, no exactUSDT', sum(z['kind']=='NATIVE_FUTURE_LEVEL' for z in liq['source_levels'])==1 and sum(z['kind']=='PROVIDER_ESTIMATE' for z in liq['source_levels'])==16 and all(z['price_quote']=='USDC' and z['exact_notional_usdt'] is None and z['decision_target_eligible'] is False for z in liq['source_levels']))
check('WLD8CoinBoss models remain USD with no exact amount or target', len(liq['external_model_scenarios'])==8 and all(x['price_quote']=='USD' and x['notional'] is None and x['exact_notional_usdt'] is None and x['decision_target_eligible'] is False for x in liq['external_model_scenarios']))
check('WLD actual sector contributions retained without recalculation', [r['actual_score_contribution'] for r in wld['actual_block_consumers']['N15']['impact_rows']]==[0.2211,0.0471])
result={'schema':'NEW_CT_WLD_SAVED_FACT_LINKAGE_VERIFICATION_V1','classification':'ARTIFACT_AND_NEW_SAVED_FACT_ASSERTIONS_ONLY_NOT_RUNTIME_OR_NATIVE_ACCEPTANCE',
        'pass':sum(x['pass'] for x in checks),'fail':sum(not x['pass'] for x in checks),'checks':checks,
        'old_tests_or_normalizers':0,'delivery234_or_Gate535_acceptance_repeated':False,
        'project_modules_Node_providerHTTP_nativeSQL_MAIN_Telegram':0}
(P/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('TAP version 13')
for i,x in enumerate(checks,1):print(('ok' if x['pass'] else 'not ok')+' '+str(i)+' - '+x['name'])
print('1..'+str(len(checks)))
raise SystemExit(1 if result['fail'] else 0)
