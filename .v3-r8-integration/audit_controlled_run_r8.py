#!/usr/bin/env python3
import json, pathlib, sys
p=pathlib.Path(sys.argv[1]); lines=p.read_text(errors='replace').splitlines(); final=None
for line in reversed(lines):
    s=line.strip()
    if s.startswith('{') and '"ok":true' in s:
        try: final=json.loads(s); break
        except Exception: pass
if not final: raise SystemExit('CONTROLLED_RUN_FINAL_JSON_NOT_FOUND')
want='72f0cab80ac9c38c4b3a84116b40c16fb54d5944ce20e1da2b6c399a386bc36c'
assert final.get('ok') is True
assert final.get('worker_sha256')==want,(final.get('worker_sha256'),want)
assert int(final.get('universe_total') or 0)>0
assert int(final.get('scanned') or 0)==int(final.get('universe_total') or 0)
assert float(final.get('stage0_coverage_pct') or 0)>=99.9
assert final.get('bykaranteli_secret_exported') is False
pre=final.get('v3_sidecars_preaction_budget') or {}
assert pre.get('allowed') is True,pre

def closed_status(x): return str((x or {}).get('status') or '').upper().startswith('CLOSED')
for key in ('v3_early_sidecar','v3_realized_liquidation_sidecar','v3_liquidation_sidecar','v3_pipeline_health_sidecar'):
    x=final.get(key) or {}
    assert x.get('mode')=='SHADOW_ONLY',(key,x)
    assert x.get('market_signal') in (False,None),(key,x)
    assert x.get('validated_signal') in (False,None),(key,x)
    assert x.get('trading_execution') in (False,None),(key,x)

# Early Discovery may have no candidate/microstructure rows; missing must stay explicit, not fabricated.
early=final.get('v3_early_sidecar') or {}
assert closed_status(early),early
micro=str(early.get('microstructure_status') or 'UNKNOWN').upper()
assert micro not in ('MIGRATION_REQUIRED','PARTIAL','SOURCE_UNSUPPORTED','INPUT_LOAD_PARTIAL'),early

# REALIZED uses factual HTX persisted liquidation events only; raw tape must not be duplicated.
real=final.get('v3_realized_liquidation_sidecar') or {}
assert closed_status(real),real
assert real.get('source')=='HTX_PERSISTED_FACTUAL_LIQUIDATION_EVENTS',real
assert real.get('coverage')=='PARTIAL_BOUNDED_HTX_REST',real
assert real.get('near_realtime') is False,real
assert real.get('projected_map') is False,real
assert real.get('modelled_proxy') is False,real
assert int(real.get('raw_events_persisted') or 0)==0,real

# Projected provider lane remains distinct; identity-not-closed is allowed observation-only.
proj=final.get('v3_liquidation_sidecar') or {}
assert closed_status(proj),proj
assert proj.get('guaranteed_tp') is False,proj
assert final.get('v3_critical_feed_state')=='OK',final.get('v3_critical_feed_state')

health=final.get('v3_pipeline_health_sidecar') or {}
assert health.get('status')=='CLOSED',health
h=(health.get('health') or {})
bad={'LIVE_DEEP_CHECK_SILENT_DROP','MAINTENANCE_STARVED_LIVE','SOURCE_HANDOFF_LOST','CRITICAL_FEED_DEGRADED','PERSISTENT_DB_FAILURE'}
assert not (bad & set(h.get('reasons') or [])),h

life=final.get('v3_telegram_lifecycle_sidecar') or {}
assert life.get('mode')=='SHADOW_ONLY',life
assert life.get('network_send') is False,life
assert life.get('dispatch_enabled') is True,life
assert life.get('validated_signal') is False,life
assert life.get('trading_execution') is False,life
assert life.get('status') in ('CLOSED','CLOSED_NO_TRANSITION','CLOSED_NO_COMPLETED_HANDOFF'),life


delivery=final.get('v3_telegram_delivery_sidecar') or {}
assert delivery.get('network_send') is False,delivery
assert int(delivery.get('sent') or 0)==0,delivery
assert delivery.get('status') in ('NETWORK_DISABLED_FAIL_CLOSED','BUDGET_BLOCKED_FAIL_CLOSED'),delivery
assert final.get('v3_telegram_journal_enabled') is True,final.get('v3_telegram_journal_enabled')
assert final.get('v3_telegram_network_enabled') is False,final.get('v3_telegram_network_enabled')

# Existing production Telegram output is explicitly disabled for controlled R8.
tg=final.get('telegram_output') or {}
assert not (tg.get('morning') or {}).get('sent',False),tg
assert not (tg.get('shadow_decision') or {}).get('sent',False),tg
assert not (tg.get('watch70') or {}).get('sent',False),tg
bud=final.get('d1_post_cycle_budget') or {}
assert bud.get('allowed') is True,bud
usage=final.get('d1_usage') or {}
assert int(usage.get('unknown_ops') or 0)==0,usage
assert int(usage.get('projected_daily_rows_read') or 0)<=int(usage.get('safety_budget_daily_rows_read') or 0),usage
assert int(usage.get('projected_daily_rows_written') or 0)<=int(usage.get('safety_budget_daily_rows_written') or 0),usage
out={
 'status':'CONTROLLED_R8_RUN_AUDIT_PASS','worker_sha256':want,
 'started_ts':final.get('started_ts'),'completed_ts':final.get('completed_ts'),'cron_run_id':final.get('cron_run_id'),
 'universe_total':final.get('universe_total'),'scanned':final.get('scanned'),'stage0_coverage_pct':final.get('stage0_coverage_pct'),
 'v3_early_status':early.get('status'),'microstructure_status':micro,'microstructure_coverage':'PARTIAL_UNTIL_PRODUCTION_WRITER_PROVED',
 'v3_realized_status':real.get('status'),'v3_realized_events_loaded':real.get('events_loaded'),'v3_realized_raw_events_persisted':real.get('raw_events_persisted'),
 'v3_projected_status':proj.get('status'),'v3_critical_feed_state':final.get('v3_critical_feed_state'),
 'v3_pipeline_health_status':health.get('status'),'v3_pipeline_health':h,
 'v3_telegram_lifecycle_status':life.get('status'),'v3_telegram_lifecycle_transitions':len(life.get('transitions') or []),
 'v3_telegram_dispatch_enabled':life.get('dispatch_enabled'),'v3_telegram_network_send':delivery.get('network_send'),'v3_telegram_delivery_status':delivery.get('status'),'v3_telegram_delivery_sent':delivery.get('sent'),
 'telegram_sent':False,'d1_usage':usage,'production_main_changed':False
}
print(json.dumps(out,indent=2,ensure_ascii=False))
print('CONTROLLED_R8_RUN_PROOF=PASS')
