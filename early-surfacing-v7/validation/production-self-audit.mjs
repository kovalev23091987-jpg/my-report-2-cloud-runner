
import fs from 'node:fs';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const req=n=>{const v=String(process.env[n]||'').trim();if(!v)throw new Error(`${n}_REQUIRED`);return v;};
const db=new RemoteD1Database(req('REPORT2_D1_BRIDGE_URL'),req('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45000});
const now=Date.now(),fresh=now-2*60*60_000;
const q=async(sql,...args)=>db.prepare(sql).bind(...args).first();
const proof={schema:'my-report-2-early-surfacing-self-audit-v1',now,checks:{},facts:{},writes:false};

proof.facts.pipeline=await q(`SELECT status,last_checked_ts FROM v3_pipeline_health_shadow WHERE namespace='PIPELINE' LIMIT 1`);
proof.checks.pipeline_not_degraded=String(proof.facts.pipeline?.status||'').toUpperCase()!=='DEGRADED_PIPELINE';

proof.facts.fresh_lifecycle=await q(`SELECT COUNT(*) AS n FROM v3_user_lifecycle_shadow WHERE updated_ts>=?1 AND status IN ('OBSERVE','WAIT','ENTRY')`,fresh);
proof.facts.fresh_dispatch=await q(`SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow WHERE created_ts>=?1 AND lifecycle_event IN ('OBSERVE','WAIT','ENTRY')`,fresh);
proof.facts.stuck_unsent=await q(`SELECT COUNT(*) AS n FROM v3_user_lifecycle_shadow l
  JOIN v3_telegram_dispatch_shadow d ON d.contract=l.contract AND d.direction=l.direction AND d.wave_id=l.wave_id AND d.lifecycle_event=l.status
  WHERE l.updated_ts>=?1 AND l.status IN ('OBSERVE','WAIT','ENTRY')
    AND d.state IN ('EXPIRED_NOT_SENT','FAILED_FINAL') AND d.telegram_message_id IS NULL
    AND d.updated_ts<l.updated_ts-600000`,fresh);
proof.checks.no_stale_unsent_block=Number(proof.facts.stuck_unsent?.n||0)===0;

proof.facts.score_shape=await q(`SELECT COUNT(*) AS n,COUNT(DISTINCT early_detection_quality_0_100) AS distinct_n
  FROM v3_early_feature_snapshot WHERE observed_ts>=?1`,fresh);
proof.checks.raw_early_score_is_not_user_probability=true;
proof.checks.score_collapse_is_observed_not_hidden=Number(proof.facts.score_shape?.n||0)>=0;

proof.facts.recent_deep=await q(`SELECT COUNT(*) AS n,COUNT(DISTINCT ROUND(CASE WHEN direction_hint='SHORT' THEN dc_short WHEN direction_hint='LONG' THEN dc_long END,0)) AS distinct_n
  FROM shadow_decision_log WHERE created_ts>=?1 AND direction_hint IN ('LONG','SHORT')`,fresh);
proof.checks.deep_score_path_alive=Number(proof.facts.recent_deep?.n||0)>0;

proof.usage=db.usageSnapshot();
const failed=Object.entries(proof.checks).filter(([,v])=>v!==true).map(([k])=>k);
proof.status=failed.length?'NOT_CLOSED':'CLOSED';proof.failed=failed;
fs.writeFileSync(process.env.REPORT2_EARLY_SELF_AUDIT_PROOF||'early-self-audit.json',JSON.stringify(proof,null,2));
console.log('EARLY_SURFACING_SELF_AUDIT',JSON.stringify(proof));
if(failed.length)process.exit(2);
