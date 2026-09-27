export async function runSelfAudit(db,{now=Date.now(),since_ts=0,enforce_new=true}={}){
 const fresh=now-2*60*60_000;const enforceNew=enforce_new===true;const auditStart=enforceNew&&Number(since_ts)>0?Math.max(fresh,Number(since_ts)):fresh;const q=async(sql,...args)=>db.prepare(sql).bind(...args).first();
 const proof={schema:'post-v7-full-self-audit-v1',now,checks:{},facts:{},writes:false};
proof.facts.pipeline=await q(`SELECT status,last_checked_ts FROM v3_pipeline_health_shadow WHERE namespace='PIPELINE' LIMIT 1`);
const pipeline=proof.facts.pipeline;proof.checks.pipeline_not_degraded=pipeline?.status==='HEALTHY_NO_IDEA'&&Number.isSafeInteger(pipeline.last_checked_ts)&&pipeline.last_checked_ts>=fresh&&pipeline.last_checked_ts<=now;

proof.facts.fresh_lifecycle=await q(`SELECT COUNT(*) AS n FROM v3_user_lifecycle_shadow WHERE updated_ts>=?1 AND status IN ('OBSERVE','WAIT','ENTRY')`,auditStart);
proof.facts.fresh_dispatch=await q(`SELECT COUNT(*) AS n FROM v3_telegram_dispatch_shadow WHERE created_ts>=?1 AND lifecycle_event IN ('OBSERVE','WAIT','ENTRY')`,auditStart);
proof.facts.stuck_unsent=await q(`WITH latest AS (
  SELECT contract,direction,wave_id,lifecycle_event,MAX(updated_ts) AS max_updated_ts
  FROM v3_telegram_dispatch_shadow GROUP BY contract,direction,wave_id,lifecycle_event
)
SELECT COUNT(*) AS n FROM v3_user_lifecycle_shadow l
JOIN latest x ON x.contract=l.contract AND x.direction=l.direction AND x.wave_id=l.wave_id AND x.lifecycle_event=l.status
JOIN v3_telegram_dispatch_shadow d ON d.contract=x.contract AND d.direction=x.direction AND d.wave_id=x.wave_id AND d.lifecycle_event=x.lifecycle_event AND d.updated_ts=x.max_updated_ts
WHERE l.updated_ts>=?1 AND l.status IN ('OBSERVE','WAIT','ENTRY')
  AND d.state IN ('EXPIRED_NOT_SENT','FAILED_FINAL') AND d.telegram_message_id IS NULL
  AND d.updated_ts<l.updated_ts-600000`,auditStart);
proof.facts.audit_start_ts=auditStart;
proof.facts.enforce_new_only=enforceNew;
proof.checks.no_new_stale_unsent_block=enforceNew ? Number(proof.facts.stuck_unsent?.n||0)===0 : true;

proof.facts.score_shape=await q(`SELECT COUNT(*) AS n,COUNT(DISTINCT early_detection_quality_0_100) AS distinct_n
  FROM v3_early_feature_snapshot WHERE observed_ts>=?1`,fresh);
proof.facts.probability_claim='NOT_A_STATISTICAL_VALIDATION_AUDIT';
proof.checks.score_shape_consistent_with_activity=Number(proof.facts.fresh_lifecycle?.n||0)===0 || (Number(proof.facts.score_shape?.n||0)>0 && Number(proof.facts.score_shape?.distinct_n||0)>0);

proof.facts.recent_deep=await q(`SELECT COUNT(*) AS n,COUNT(DISTINCT ROUND(CASE WHEN direction_hint='SHORT' THEN dc_short WHEN direction_hint='LONG' THEN dc_long END,0)) AS distinct_n
  FROM shadow_decision_log WHERE created_ts>=?1 AND direction_hint IN ('LONG','SHORT')`,fresh);
proof.checks.deep_score_path_consistent_with_activity=Number(proof.facts.fresh_lifecycle?.n||0)===0 || Number(proof.facts.recent_deep?.n||0)>0;

try {
  proof.facts.canonical_binding_mismatch=await q(`SELECT COUNT(*) AS n FROM v3_dispatch_publication_binding_shadow b LEFT JOIN canonical_publication_shadow p ON p.publication_id=b.publication_id WHERE p.publication_id IS NULL OR p.contract_code!=b.contract_code OR COALESCE(p.direction,'')!=b.direction OR p.snapshot_id IS NOT b.snapshot_id OR p.run_id IS NOT b.run_id OR p.observed_ts IS NOT b.observed_ts OR p.analytical_fingerprint IS NOT b.analytical_fingerprint OR p.presentation_hash IS NOT b.presentation_hash OR p.actionability_status!='ACTIONABLE'`);
  proof.checks.canonical_binding_exact=proof.facts.canonical_binding_mismatch?.n===0;
  proof.facts.actionable_wait_without_recheck=await q(`SELECT COUNT(*) AS n FROM canonical_publication_shadow p WHERE p.created_ts>=?1 AND p.actionability_status='ACTIONABLE' AND p.lifecycle_event IN ('OBSERVE','WAIT') AND NOT EXISTS (SELECT 1 FROM v3_recheck_task_shadow r WHERE r.publication_id=p.publication_id)`,auditStart);
  proof.checks.actionable_wait_has_durable_recheck=proof.facts.actionable_wait_without_recheck?.n===0;
} catch (error) {
  proof.facts.post_v7_binding_audit={status:'NOT_MIGRATED_OR_UNAVAILABLE',error:String(error?.message||error).slice(0,240)};
  proof.checks.canonical_binding_exact=false;
  proof.checks.actionable_wait_has_durable_recheck=false;
}

 proof.checks.count_queries_returned= ['fresh_lifecycle','fresh_dispatch','stuck_unsent','score_shape','recent_deep'].every(k=>Number.isSafeInteger(proof.facts[k]?.n)&&proof.facts[k].n>=0);
 proof.failed=Object.entries(proof.checks).filter(([,v])=>v!==true).map(([k])=>k);proof.status=proof.failed.length?'NOT_CLOSED':'CLOSED';return proof;
}
