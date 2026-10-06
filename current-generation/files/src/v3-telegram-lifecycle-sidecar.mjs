import {assessActionability,renderCanonicalTelegram} from './canonical-publication.mjs';
import {canonicalLifecycleAuthority} from './canonical-lifecycle-authority.mjs';
import {prepareLifecycleTransition} from './v3-telegram-runtime.mjs';

export const V3_TELEGRAM_LIFECYCLE_SIDECAR_VERSION='v3-telegram-lifecycle-sidecar-v2-canonical-authority-20261005';
export const V3_TELEGRAM_SHADOW_RULES_VERSION='v3-telegram-shadow-r6';
export const V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET=Object.freeze({
  rows_read: 160,
  rows_written:12,
  requests_soft_cap:10,
  max_completed_handoffs:6,
  // D1 counts index maintenance as writes: one transition plus its optional
  // dispatch costs up to eight rows with the deployed schema, not two.
  max_persist_transitions:1,
});

const TERMINAL=new Set(['EXIT','EDGE_SPENT','EXCLUDE']);
const INTERESTING=new Set(['DISCOVERY','PRE_IMPULSE_WATCH','ENTRY_CANDIDATE','ENTRY_TRIGGER','RELOAD_BASE','RELOAD_WATCH']);
function text(v){return v==null?'':String(v).trim();}
function upper(v){return text(v).toUpperCase();}
function finite(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function direction(v){const d=upper(v);return d==='LONG'||d==='SHORT'?d:null;}
function rows(x){if(x?.success===false||!Array.isArray(x?.results))throw new Error('LIFECYCLE_READ_RESULT_UNKNOWN');return x.results;}
function usageDelta(before,after){if(!before||!after)return null;return {rows_read:Math.max(0,Number(after.rows_read||0)-Number(before.rows_read||0)),rows_written:Math.max(0,Number(after.rows_written||0)-Number(before.rows_written||0)),requests:Math.max(0,Number(after.requests||0)-Number(before.requests||0)),unknown_ops:Math.max(0,Number(after.unknown_ops||0)-Number(before.unknown_ops||0))};}
function bool(v){return v===true||v===1||v==='1';}
function latestFor(list,contract,tsKey='observed_ts'){
  return (Array.isArray(list)?list:[]).filter(x=>text(x?.contract_code??x?.contract)===contract)
    .sort((a,b)=>(finite(b?.[tsKey])??0)-(finite(a?.[tsKey])??0))[0]||null;
}
function exactWaveOrLatest(list,contract,waveId){
  const arr=(Array.isArray(list)?list:[]).filter(x=>text(x?.contract_code)===contract);
  if(waveId)return arr.find(x=>text(x?.wave_id)===waveId)||null;
  return arr.sort((a,b)=>(finite(b?.last_seen_ts)??0)-(finite(a?.last_seen_ts)??0))[0]||null;
}
function priorLifecycleFor(list,contract,waveId){
  const arr=(Array.isArray(list)?list:[]).filter(x=>text(x?.contract)===contract&&(!waveId||text(x?.wave_id)===waveId));
  return arr.sort((a,b)=>(finite(b?.updated_ts)??0)-(finite(a?.updated_ts)??0))[0]||null;
}
function normalizedSufficiency(v){return upper(v||'UNKNOWN');}
function shadowDirectional(row){
  if(!row)return null;
  const d=direction(row.direction_hint); if(!d)return null;
  const stage=upper(row.stage);
  if(stage==='OBSERVE_DATA_INSUFFICIENT')return null;
  if(stage!==`SHADOW_OBSERVE_${d}_BIAS`)return null;
  return d;
}
function finalDirectional(row){
  if(!row)return null;
  const d=direction(row.direction); if(!d)return null;
  if(upper(row.directional_quality)!=='CLOSED')return null;
  return d;
}
function isCurrentTs(ts,now,maxAgeMs=10*60_000){return typeof ts==='number'&&Number.isSafeInteger(ts)&&ts>0&&ts<=now&&ts>=now-maxAgeMs;}

export function deriveLifecycleContext({handoff,early,shadow,final,previous,now_ts=Date.now(),d1_pretelegram_budget_closed=true,dispatch_enabled=false,canonical=null,canonical_required=false}={}){
  const now=Math.trunc(finite(now_ts)??Date.now());
  const contract=text(handoff?.contract_code);
  const wave=text(handoff?.wave_id)||text(early?.wave_id)||text(previous?.wave_id);
  if(!contract)return {status:'IDENTITY_NOT_CLOSED',ctx:null};
  if(!wave)return {status:'WAVE_NOT_CLOSED',ctx:null};
  if(!isCurrentTs(handoff.deep_started_ts,now)||!isCurrentTs(handoff.deep_completed_ts,now)||
    handoff.deep_started_ts<handoff.scan_ts||handoff.deep_completed_ts<handoff.deep_started_ts)return {status:'DEEP_TIME_NOT_CLOSED',ctx:null};
  if(!early || text(early.contract_code)!==contract || text(early.wave_id)!==wave ||
    !isCurrentTs(early.last_seen_ts,now) || (finite(early.first_seen_ts)!==null && early.first_seen_ts>handoff.scan_ts))return {status:'WAVE_NOT_CURRENT',ctx:null};
  if(shadow && (text(shadow.contract_code)!==contract || !isCurrentTs(shadow.observed_ts,now) ||
    (finite(handoff.deep_started_ts)!==null && shadow.observed_ts<handoff.deep_started_ts) ||
    (finite(shadow.created_ts)!==null && shadow.created_ts>now)))return {status:'SHADOW_NOT_CURRENT',ctx:null};
  if(shadow && (shadow.observed_ts>handoff.deep_completed_ts || !isCurrentTs(shadow.created_ts,now) || shadow.created_ts<shadow.observed_ts))return {status:'SHADOW_TIME_NOT_CLOSED',ctx:null};
  if(final && (text(final.contract_code||contract)!==contract || !isCurrentTs(final.observation_ts,now) ||
    !isCurrentTs(final.persisted_ts,now)))return {status:'FINAL_NOT_CURRENT',ctx:null};
  const deepCompleted=upper(handoff?.state)==='COMPLETED'&&upper(handoff?.execution_status)==='COMPLETED'&&!text(handoff?.deep_error);
  const scanTs=finite(handoff?.scan_ts);
  const dataCurrent=isCurrentTs(handoff?.scan_ts,now);
  const hdir=direction(handoff?.handoff_direction);
  const sdir=shadowDirectional(shadow);
  const fdir=finalDirectional(final);
  const priorDir=direction(previous?.direction);
  const currentDirs=[fdir,sdir,hdir,direction(early.direction_hint)].filter(Boolean);
  const conflict=new Set(currentDirs).size>1;
  let dir=conflict?null:(fdir||sdir||hdir||null);
  const finalRisk=upper(final?.risk_state);
  const finalHard=Number(final?.hard_veto||0)===1;
  const lifecycle=upper(early?.lifecycle_stage||final?.campaign_phase||'DISCOVERY');
  const finalDirectionDestroyed=Boolean(final&&['NEUTRAL','INSUFFICIENT'].includes(upper(final.direction)));
  const directionDestroyed=conflict||finalDirectionDestroyed;
  const terminal=TERMINAL.has(lifecycle);
  const dataUnusable=Boolean(final&&['BLOCKED','INSUFFICIENT'].includes(upper(final.data_quality)))||upper(shadow?.dq_status)==='INSUFFICIENT';
  const removal=finalHard?'HARD_VETO':finalRisk==='INVALIDATED'?'INVALIDATED':terminal?lifecycle:directionDestroyed?'DIRECTION_DESTROYED':dataUnusable?'DATA_UNUSABLE':null;
  if(removal && !['OBSERVE','WAIT','ENTRY'].includes(upper(previous?.status)))return {status:'RISK_BLOCKED',reason:removal,ctx:null};
  // Current canonical publication owns new idea direction; removal keeps the existing prior-visible cleanup path.
  let observationPublication=null;
  if(canonical_required&&!removal){
    const authority=canonicalLifecycleAuthority({row:canonical,handoff,early,now_ts:now});
    if(authority.status!=='CLOSED')return {...authority,ctx:null};
    if(conflict||dir&&dir!==authority.direction)return {status:'CANONICAL_DIRECTION_MISMATCH',ctx:null};
    dir=authority.direction;
    if(authority.canonical_state==='OBSERVE'){
      const observationCanonical=JSON.parse(canonical.canonical_json);
      const action=assessActionability({canonical:observationCanonical,lifecycle_event:'OBSERVE'});
      if(action.deliver!==true)return{status:action.reason,ctx:null};
      const presentation=renderCanonicalTelegram({canonical:observationCanonical,lifecycle_event:'OBSERVE'});
      if(presentation.ok!==true)return{status:presentation.status,ctx:null};
      observationPublication=canonical;
    }
  }
  if(!dir&&removal&&priorDir)dir=priorDir;
  if(!dir)return {status:conflict?'DIRECTION_CONFLICT_FAIL_CLOSED':'DIRECTION_NOT_CLOSED',ctx:null};
  if(hdir&&dir!==hdir&&!removal)return {status:'HANDOFF_DIRECTION_CONFLICT_FAIL_CLOSED',ctx:null};
  const shadowSuff=normalizedSufficiency(handoff?.data_sufficiency||shadow?.data_sufficiency);
  const observationUseful=Boolean(shadowDirectional(shadow)||fdir);
  const sufficientObservation=deepCompleted&&observationUseful&&['PARTIAL','SUFFICIENT'].includes(shadowSuff)&&
    ['PARTIAL','HTX_CLOSED_EXTERNAL_CHAINS_MISSING','CLOSED'].includes(upper(shadow?.dq_status))&&
    upper(shadow?.eq_status)==='SHADOW_MEASURABLE'&&upper(shadow?.stage)!=='OBSERVE_DATA_INSUFFICIENT';
  const finalCurrent=Boolean(final&&isCurrentTs(final.persisted_ts??final.observation_ts,now,10*60_000));
  const contextClosed=upper(final?.telegram_context_status)==='CLOSED';
  const validUntil=finite(final?.valid_until_ts)??((scanTs??now)+5*60_000);
  const score=finite(final?.score_lower_bound)??finite(early?.early_detection_quality_0_100);
  const earlyQuality=finite(early?.early_detection_quality_0_100);
  const materialHash=[
    dir,
    lifecycle,
    score==null?'NA':String(Math.round(score/5)*5),
    earlyQuality==null?'NA':String(Math.round(earlyQuality/5)*5),
    upper(shadow?.stage||''),
    upper(shadow?.dq_status||''),
    upper(final?.timing_state||'')
  ].join('|');
  const ctx={
    contract,direction:dir,wave_id:wave,rules_version:V3_TELEGRAM_SHADOW_RULES_VERSION,
    ...(observationPublication?{canonical_observation_publication:observationPublication}:{}),
    dispatch_enabled:dispatch_enabled===true,
    deep_check_completed:deepCompleted,
    identity_current:true,
    data_current:dataCurrent,
    lifecycle_stage:lifecycle,
    removal_reason:removal,
    hard_veto:finalHard,
    structure_broken:finalRisk==='INVALIDATED',
    data_unusable:dataUnusable,
    direction_destroyed:directionDestroyed,
    final_row_exists:Boolean(final),
    data_quality:upper(final?.data_quality||'NOT_EVALUATED'),
    execution_quality:upper(final?.execution_quality||'NOT_EVALUATED'),
    evidence_independence:upper(final?.independence_state||'NOT_EVALUATED'),
    direction_confirmed:Boolean(fdir),
    evidence_independence_sufficient:upper(final?.independence_state)==='CLOSED',
    timing_state:upper(final?.timing_state||lifecycle||'NOT_EVALUATED'),
    freshness_future_pass:finalCurrent&&isCurrentTs(final?.observation_ts,now,10*60_000),
    final_score_threshold_pass:score!==null&&score>=70,
    d1_pretelegram_budget_closed:bool(d1_pretelegram_budget_closed),
    dedup_pass:true,
    valid_until_active:validUntil>=now,
    superseded:Boolean(final&&(!contextClosed||upper(final.telegram_context_status)==='SUPERSEDED')),
    edge_spent:upper(final?.timing_state)==='EDGE_SPENT'||lifecycle==='EDGE_SPENT',
    structure_interesting:Boolean(early&&INTERESTING.has(lifecycle)),
    useful_observation:observationUseful,
    data_sufficient_for_observation:sufficientObservation,
    position_open:Boolean(final&&['OPEN_LONG','OPEN_SHORT'].includes(upper(final.position_state))),
    management_action:upper(final?.management_action||'NOT_EVALUATED'),
    observation_ts:finite(final?.observation_ts)??finite(shadow?.observed_ts)??scanTs??now,
    valid_until_ts:validUntil,
    decision_id:text(final?.decision_id)||null,
    score_0_100:score,
    message_hash:materialHash,
    ticker:contract,
    shadow_only:true,
  };
  return {status:'CLOSED',ctx,inputs:{deepCompleted,dataCurrent,hdir,sdir,fdir,priorDir,removal,score,contextClosed}};
}

export async function loadCompletedLifecycleHandoffs(db,{source_run_id,now_ts=Date.now()}={}){
  const run=text(source_run_id),now=Math.trunc(finite(now_ts)??Date.now());
  if(!run)return {status:'SOURCE_RUN_ID_REQUIRED',handoffs:[]};
  let handoffs=[];
  try{
    const q=await db.prepare(`SELECT h.handoff_id,h.source_run_id,h.scan_ts,h.contract_code,h.base_ticker,h.discovery_rank,
      h.direction AS handoff_direction,h.wave_id,h.dedup_reentry_key,h.state,h.deep_check_run_id,h.completed_ts,h.updated_ts,
      d.execution_status,d.data_sufficiency,d.error_text AS deep_error,d.started_ts AS deep_started_ts,d.completed_ts AS deep_completed_ts
      FROM deep_check_run_log d CROSS JOIN v3_discovery_deep_handoff_shadow h
      ON h.handoff_id=d.v3_handoff_id AND h.contract_code=d.contract_code AND h.source_run_id=d.run_id
      WHERE d.run_id=?1 AND h.state='COMPLETED' AND h.deep_check_run_id=d.run_id
      ORDER BY COALESCE(h.discovery_rank,999999),h.updated_ts DESC LIMIT ${V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.max_completed_handoffs}`).bind(run).all();
    handoffs=rows(q);
  }catch(error){const msg=String(error?.message||error);return {status:/no such table|no such column/i.test(msg)?'MIGRATION_REQUIRED':'PARTIAL',handoffs:[],error:msg};}
  return {status:handoffs.length?'CLOSED':'CLOSED_NO_COMPLETED_HANDOFF',source_run_id:run,handoffs};
}

export async function loadLifecycleSourceRows(db,{source_run_id,now_ts=Date.now(),completed_handoffs=null,canonical_required=false}={}){
  const run=text(source_run_id),now=Math.trunc(finite(now_ts)??Date.now());
  const completed=completed_handoffs || await loadCompletedLifecycleHandoffs(db,{source_run_id,now_ts});
  if(completed.source_run_id && completed.source_run_id!==run)return {status:'SOURCE_RUN_MISMATCH',handoffs:[]};
  if(completed.status!=='CLOSED')return {...completed,early:[],shadow:[],final:[],previous:[]};
  const handoffs=completed.handoffs;
  const contracts=[...new Set(handoffs.map(x=>text(x.contract_code)).filter(Boolean))];
  const placeholders=contracts.map((_,i)=>`?${i+1}`).join(',');
  const minScan=Math.min(...handoffs.map(x=>finite(x.scan_ts)??now))-5*60_000;
  const args=[...contracts,minScan,now];
  try{
    const queries=[
      db.prepare(`SELECT wave_id,contract_code,generation,first_seen_ts,lifecycle_stage,direction_hint,direction_state,
        early_detection_quality_0_100,last_seen_ts FROM v3_early_candidate_wave WHERE contract_code IN (${placeholders})
        ORDER BY last_seen_ts DESC LIMIT 24`).bind(...contracts),
      db.prepare(`SELECT shadow_id,contract_code,observed_ts,rules_version,direction_hint,eq_status,dq_status,stage,data_sufficiency,created_ts
        FROM shadow_decision_log WHERE contract_code IN (${placeholders}) AND observed_ts BETWEEN ?${contracts.length+1} AND ?${contracts.length+2}
        ORDER BY observed_ts DESC LIMIT 24`).bind(...args),
      db.prepare(`SELECT f.decision_id,f.contract_code,f.observation_ts,f.direction,f.directional_quality,f.entry_action,f.entry_quality,
        f.data_quality,f.execution_quality,f.independence_state,f.timing_state,f.risk_state,f.position_state,f.management_action,
        f.hard_veto,f.persisted_ts,c.score_lower_bound,c.score_upper_bound,c.valid_until_ts,c.status AS telegram_context_status
        FROM final_decision_integration_shadow f LEFT JOIN final_decision_telegram_context_shadow c ON c.decision_id=f.decision_id
        WHERE f.contract_code IN (${placeholders}) AND f.persisted_ts BETWEEN ?${contracts.length+1} AND ?${contracts.length+2}
        ORDER BY f.persisted_ts DESC LIMIT 24`).bind(...args),
      db.prepare(`SELECT contract,direction,wave_id,rules_version,status,reason,observation_ts,valid_until_ts,updated_ts
        FROM v3_user_lifecycle_shadow WHERE contract IN (${placeholders}) AND rules_version=?${contracts.length+1}
        ORDER BY updated_ts DESC LIMIT 24`).bind(...contracts,V3_TELEGRAM_SHADOW_RULES_VERSION),
    ];
    if(canonical_required)queries.push(db.prepare(`SELECT publication_id,contract_code,run_id,snapshot_id,wave_id,direction,canonical_state,analytical_fingerprint,observed_ts,created_ts,canonical_json FROM canonical_publication_shadow WHERE run_id=?1 AND contract_code IN (${contracts.map((_,i)=>`?${i+2}`).join(',')}) ORDER BY created_ts DESC,publication_id ASC LIMIT 6`).bind(run,...contracts));
    const result=await db.batch(queries);
    return {status:'CLOSED',handoffs,early:rows(result?.[0]),shadow:rows(result?.[1]),final:rows(result?.[2]),previous:rows(result?.[3]),canonical:canonical_required?rows(result?.[4]):[]};
  }catch(error){const msg=String(error?.message||error);return {status:/no such table|no such column/i.test(msg)?'MIGRATION_REQUIRED':'PARTIAL',handoffs,early:[],shadow:[],final:[],previous:[],error:msg};}
}

export async function runV3TelegramLifecycleSidecar(db,{source_run_id,now_ts=Date.now(),d1_pretelegram_budget_closed=true,dispatch_enabled=false,completed_handoffs=null,canonical_required=false}={}){
  const base={version:V3_TELEGRAM_LIFECYCLE_SIDECAR_VERSION,mode:'SHADOW_ONLY',network_send:false,dispatch_enabled:dispatch_enabled===true,probability:null,validated_signal:false,trading_execution:false};
  if(!db?.prepare||!db?.batch)return {...base,status:'SOURCE_UNSUPPORTED',transitions:[]};
  const before=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const loaded=await loadLifecycleSourceRows(db,{source_run_id,now_ts,completed_handoffs,canonical_required});
  if(loaded.status!=='CLOSED'){
    const after=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
    return {...base,status:loaded.status,error:loaded.error??null,transitions:[],usage_delta:usageDelta(before,after)};
  }
  const transitions=[];
  let persistAttempts=0;
  const loadedDelta=usageDelta(before,typeof db.usageSnapshot==='function'?db.usageSnapshot():null);
  if(loadedDelta && (loadedDelta.rows_read>V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read || loadedDelta.unknown_ops>0))return {...base,status:'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',transitions,usage_delta:loadedDelta};
  for(const h of loaded.handoffs.slice(0,V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.max_completed_handoffs)){
    const contract=text(h.contract_code),waveId=text(h.wave_id);
    const early=exactWaveOrLatest(loaded.early,contract,waveId);
    const shadow=latestFor(loaded.shadow,contract,'observed_ts');
    const final=latestFor(loaded.final,contract,'persisted_ts');
    const previous=priorLifecycleFor(loaded.previous,contract,waveId||text(early?.wave_id));
    const exactCanonical=(loaded.canonical||[]).filter(row=>row.contract_code===contract&&(!waveId||row.wave_id===waveId));
    if(canonical_required&&exactCanonical.length>1){transitions.push({contract,status:'AMBIGUOUS_CURRENT_RUN_CANONICAL',current_status:null,dispatch:null});continue;}
    const derived=deriveLifecycleContext({handoff:h,early,shadow,final,previous,now_ts,d1_pretelegram_budget_closed,dispatch_enabled,canonical:exactCanonical[0]||null,canonical_required});
    if(derived.status!=='CLOSED'){transitions.push({contract,status:derived.status,reason:derived.reason??null,current_status:null,dispatch:null});continue;}
    if(persistAttempts>=V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.max_persist_transitions){transitions.push({contract,status:'CAPACITY_DEFERRED',current_status:null,dispatch:null});continue;}
    persistAttempts++;
    const persisted=await prepareLifecycleTransition(db,derived.ctx,now_ts);
    if(persisted.status==='CLOSED') {
      try {
        const proof=await db.prepare(`SELECT status,reason,observation_ts,valid_until_ts,updated_ts,shadow_only FROM v3_user_lifecycle_shadow
          WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND rules_version=?4 LIMIT 1`)
          .bind(contract,derived.ctx.direction,derived.ctx.wave_id,derived.ctx.rules_version).first();
        if(!proof || proof.status!==persisted.current_status || proof.reason!==persisted.reason ||
          proof.observation_ts!==derived.ctx.observation_ts || proof.valid_until_ts!==derived.ctx.valid_until_ts ||
          proof.updated_ts!==now_ts || proof.shadow_only!==1)persisted.status='PERSISTENCE_READBACK_FAILED';
      } catch {persisted.status='PERSISTENCE_READBACK_FAILED';}
    }
    transitions.push({contract,wave_id:derived.ctx.wave_id,direction:derived.ctx.direction,status:persisted.status,previous_status:persisted.previous_status??null,current_status:persisted.current_status??null,reason:persisted.reason??null,dispatch:persisted.dispatch?{state:persisted.dispatch.state,idempotency_key:persisted.dispatch.idempotency_key}:null,score_0_100:derived.ctx.score_0_100});
  }
  const after=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;
  const delta=usageDelta(before,after);
  if(delta&&(delta.rows_read>V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_read||delta.rows_written>V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET.rows_written||delta.unknown_ops>0))return {...base,status:'BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED',transitions,usage_delta:delta};
  if(transitions.some(t=>['PARTIAL','PERSISTENCE_READBACK_FAILED','MIGRATION_REQUIRED','SOURCE_UNSUPPORTED'].includes(t.status)))return {...base,status:'PERSISTENCE_NOT_CLOSED',transitions,usage_delta:delta};
  return {...base,status:transitions.length?'CLOSED':'CLOSED_NO_TRANSITION',completed_handoffs:loaded.handoffs.length,transitions,usage_delta:delta};
}

export default {V3_TELEGRAM_LIFECYCLE_SIDECAR_VERSION,V3_TELEGRAM_LIFECYCLE_SIDECAR_BUDGET,V3_TELEGRAM_SHADOW_RULES_VERSION,deriveLifecycleContext,loadLifecycleSourceRows,runV3TelegramLifecycleSidecar};
