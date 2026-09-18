#!/usr/bin/env python3
import json, os, pathlib, sys, urllib.request, urllib.error
p=pathlib.Path(sys.argv[1]); lines=p.read_text(errors='replace').splitlines(); final=None
for line in reversed(lines):
    s=line.strip()
    if s.startswith('{') and '"ok":true' in s:
        try: final=json.loads(s); break
        except Exception: pass
if not final: raise SystemExit('FINAL_JSON_NOT_FOUND')
start=int(final.get('started_ts') or 0); end=int(final.get('completed_ts') or 0) or start+15*60_000
if start<=0: raise SystemExit('START_TS_MISSING')
url=os.environ.get('REPORT2_D1_BRIDGE_URL','').strip(); token=os.environ.get('REPORT2_D1_BRIDGE_TOKEN','').strip()
if not url or not token: raise SystemExit('D1_BRIDGE_ENV_REQUIRED')
usage={'requests':0,'rows_read':0,'rows_written':0,'unknown_ops':0}
def req(sql,params=None):
    payload={'op':'all','sql':sql,'params':params or []}
    r=urllib.request.Request(url,data=json.dumps(payload,separators=(',',':')).encode(),headers={'content-type':'application/json','accept':'application/json','authorization':'Bearer '+token,'user-agent':'My-Report-2-V3-R8-PostRun-Audit/1.0'},method='POST')
    try:
        with urllib.request.urlopen(r,timeout=45) as x: raw=x.read().decode(); status=x.status
    except urllib.error.HTTPError as e: raise RuntimeError(f'D1_HTTP_{e.code}:{e.read().decode(errors="replace")[-500:]}')
    data=json.loads(raw or '{}')
    if status<200 or status>=300 or data.get('ok') is not True: raise RuntimeError('D1_FAIL:'+str(data.get('error') or status))
    u=data.get('usage') or {}; usage['requests']+=1
    if u.get('measured') is True:
        usage['rows_read']+=int(u.get('rows_read') or 0); usage['rows_written']+=int(u.get('rows_written') or 0)
    else: usage['unknown_ops']+=1
    return (data.get('result') or {}).get('results') or []

def count(rows): return sum(int(r.get('n') or 0) for r in rows)

life=req("SELECT status,COUNT(*) AS n FROM v3_user_lifecycle_shadow WHERE rules_version=?1 AND updated_ts BETWEEN ?2 AND ?3 GROUP BY status",['v3-telegram-shadow-r6',start-1000,end+60_000])
dispatch=req("SELECT state,COUNT(*) AS n FROM v3_telegram_dispatch_shadow WHERE rules_version=?1 AND created_ts BETWEEN ?2 AND ?3 GROUP BY state",['v3-telegram-shadow-r6',start-1000,end+60_000])
realized=req("SELECT COUNT(*) AS n FROM v3_realized_liquidation_aggregate WHERE persisted_ts BETWEEN ?1 AND ?2",[start-1000,end+60_000])
density=req("SELECT COUNT(*) AS n FROM v3_realized_liquidation_density_5m WHERE persisted_ts BETWEEN ?1 AND ?2",[start-1000,end+60_000])
early=req("SELECT lifecycle_stage,COUNT(*) AS n FROM v3_early_candidate_wave WHERE last_seen_ts BETWEEN ?1 AND ?2 GROUP BY lifecycle_stage",[start-1000,end+60_000])
health=req("SELECT namespace,status,reasons_json,changed_ts,last_checked_ts FROM v3_pipeline_health_shadow WHERE namespace='PIPELINE' LIMIT 1")
micro=req("SELECT COUNT(*) AS n, MAX(bucket_ts) AS max_ts FROM v3_market_microstructure_1m WHERE bucket_ts BETWEEN ?1 AND ?2",[start-60*60_000,end+60_000])
if usage['rows_written']!=0 or usage['unknown_ops']!=0: raise RuntimeError('POST_AUDIT_NOT_READ_ONLY')
dispatch_total=count(dispatch)
dispatch_states={str(r.get('state') or ''):int(r.get('n') or 0) for r in dispatch}
if dispatch_states.get('SENT',0)!=0 or dispatch_states.get('SENDING',0)!=0:
    raise RuntimeError('R8_NETWORK_DISPATCH_STATE_FORBIDDEN:'+json.dumps(dispatch,separators=(',',':')))
allowed_dispatch={'PENDING','SUPPRESSED_DEDUP','EXPIRED_NOT_SENT','FAILED_FINAL','FAILED_RETRYABLE'}
if set(dispatch_states)-allowed_dispatch:
    raise RuntimeError('R8_DISPATCH_STATE_UNKNOWN:'+json.dumps(dispatch,separators=(',',':')))
realized_n=count(realized); density_n=count(density); micro_n=count(micro)
# Zero realized rows is valid if no factual liquidation event occurred in the bounded HTX source window.
# Zero microstructure rows is explicit PARTIAL coverage, never converted to zero evidence.
out={
 'status':'R8_POST_RUN_D1_AUDIT_PASS',
 'dispatch_rows':dispatch_total,'dispatch_state_counts':dispatch_states,'telegram_network_sent_rows':dispatch_states.get('SENT',0),
 'controlled_lifecycle_rows':count(life),'lifecycle_status_counts':life,
 'realized_aggregate_rows_written_during_controlled_window':realized_n,
 'realized_density_rows_written_during_controlled_window':density_n,
 'realized_zero_is_signal':False,
 'early_candidate_rows_touched':count(early),'early_lifecycle_counts':early,
 'pipeline_health_row':health[0] if health else None,
 'microstructure_rows_recent':micro_n,
 'microstructure_coverage':'PRESENT' if micro_n>0 else 'PARTIAL_NO_PRODUCTION_ROWS_PROVED',
 'natural_lifecycle_transition_proved':False,
 'audit_usage':usage,'remote_d1_changed_by_audit':False
}
print(json.dumps(out,indent=2,ensure_ascii=False))
print('R8_POST_RUN_D1_AUDIT=PASS')
