/**
 * TZ 10.1 exact Telegram context sidecar persistence.
 *
 * This module never mutates Final Decision JSON. It writes a separate immutable
 * sidecar only after the analytical Final Decision has been committed AND the
 * publication gate is CLOSED. Missing score/scenario/cost data therefore cause
 * zero D1 statements. This is SHADOW publication metadata only; it does not
 * authorize trading or modify Final Decision weights.
 */
export const TZ101_TELEGRAM_CONTEXT_RUNTIME_VERSION = 'tz101-telegram-context-runtime-r6';
export const TZ101_TELEGRAM_CONTEXT_SCHEMA = 'telegram-final-context-v1';
export const TZ101_TELEGRAM_SCORE_SEMANTICS = 'FOUR_BLOCK_35_30_20_15_V1';
export const MAX_TZ101_TELEGRAM_CONTEXT_BYTES = 24 * 1024;

const plain = v => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const txt = v => typeof v === 'string' && v.trim() ? v.trim() : null;
const finite = v => typeof v === 'number' && Number.isFinite(v);
const intTs = v => Number.isSafeInteger(v) && v >= 1_000_000_000_000;

function stableProjection(value) {
  if (Array.isArray(value)) return value.map(stableProjection);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, stableProjection(value[k])]));
}
function stableJson(value) { return JSON.stringify(stableProjection(value)); }
function bytes(text) { return new TextEncoder().encode(text).byteLength; }
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}
function safety() { return {shadow_only:true,automatic_trade:false,live_probability:null,validated_signal:false,final_decision_json_changed:false}; }

export function buildTz101ExactTelegramContext({decision_summary, publication_gate}={}) {
  const errors=[];
  const d=decision_summary, p=publication_gate, c=p?.telegram_context;
  if(!plain(d)) errors.push('DECISION_SUMMARY_MISSING');
  if(!plain(p) || p.status!=='CLOSED' || !plain(c)) errors.push('PUBLICATION_GATE_NOT_CLOSED');
  const direction=String(d?.direction||'').toUpperCase();
  if(!['LONG','SHORT'].includes(direction)) errors.push('DIRECTION_NOT_CLOSED');
  for(const k of ['decision_id','material_digest','snapshot_id','contract_code','decision_evidence_receipt_id','full_evidence_receipt_id','safety_gate_receipt_id']) if(!txt(d?.[k])) errors.push(`DECISION_BINDING_MISSING:${k}`);
  if(!intTs(d?.observation_ts)) errors.push('OBSERVATION_TS_INVALID');
  if(!finite(c?.score_lower_bound)||!finite(c?.score_upper_bound)||c.score_lower_bound<0||c.score_upper_bound>100||c.score_upper_bound<c.score_lower_bound) errors.push('SCORE_INTERVAL_INVALID');
  if(!Array.isArray(c?.weighted_blocks)||c.weighted_blocks.length!==4) errors.push('WEIGHTED_BLOCKS_INVALID');
  if(!plain(c?.entry)||!txt(c.entry.area)||!txt(c.entry.target)||!txt(c.entry.invalidation)) errors.push('ENTRY_CONTEXT_INVALID');
  if(!plain(c?.funding)||!finite(c.funding.rate_pct)||!finite(c.funding.interval_hours)||c.funding.interval_hours<=0||!intTs(c.funding.observed_ts)) errors.push('FUNDING_CONTEXT_INVALID');
  if(!intTs(c?.valid_until_ts)||intTs(d?.observation_ts)&&c.valid_until_ts<d.observation_ts||intTs(d?.observation_ts)&&c.valid_until_ts>d.observation_ts+15*60_000) errors.push('VALID_UNTIL_INVALID');
  if(errors.length) return {status:'NOT_CLOSED',errors,context:null};
  const context={
    schema:TZ101_TELEGRAM_CONTEXT_SCHEMA,
    score_semantics:TZ101_TELEGRAM_SCORE_SEMANTICS,
    is_probability:false,
    decision_id:d.decision_id,
    material_digest:d.material_digest,
    snapshot_id:d.snapshot_id,
    contract_code:d.contract_code,
    observation_ts:d.observation_ts,
    direction,
    decision_evidence_receipt_id:d.decision_evidence_receipt_id,
    full_evidence_receipt_id:d.full_evidence_receipt_id,
    safety_gate_receipt_id:d.safety_gate_receipt_id,
    score_lower_bound:c.score_lower_bound,
    score_upper_bound:c.score_upper_bound,
    weighted_blocks:c.weighted_blocks,
    entry:c.entry,
    valid_until_ts:c.valid_until_ts,
    funding:c.funding,
    risk:txt(c.risk)||'изменение цены, ликвидности или условий исполнения',
    reasons:Array.isArray(c.reasons)?c.reasons.filter(x=>txt(x)).slice(0,3):[],
    liquidations:plain(c.liquidations)?c.liquidations:{status:'NOT_CONFIRMED',note:'Уровни крупных ликвидаций не подтверждены'},
    user_position_semantics:plain(p.user_position_semantics)?p.user_position_semantics:{user_portfolio_state:'UNKNOWN',user_position_confirmed:false,user_position_quantity_contracts:null,user_management_authorized:false,alert_implies_user_trade:false},
  };
  return {status:'CLOSED',errors:[],context};
}

function snapshotAck(result) {
  if(!plain(result)||result.success!==true||!plain(result.meta)) throw new Error('D1_ACK_INVALID');
  const changes=result.meta.changes;
  if(!Number.isSafeInteger(changes)||changes<0||changes>1) throw new Error('D1_ACK_CHANGES_INVALID');
  if(!Number.isSafeInteger(result.meta.rows_written)||result.meta.rows_written<0) throw new Error('D1_ACK_ROWS_WRITTEN_INVALID');
  if(changes===1&&result.meta.rows_written<1) throw new Error('D1_ACK_WRITE_INCONSISTENT');
  if(changes===0&&result.meta.rows_written!==0) throw new Error('D1_ACK_DEDUP_WRITE_INCONSISTENT');
  return {changes,rows_written:result.meta.rows_written};
}

export async function persistTz101ExactTelegramContext({env,decision_summary,publication_gate,persisted_ts=Date.now()}={}) {
  const base={version:TZ101_TELEGRAM_CONTEXT_RUNTIME_VERSION,safety:safety(),statements:0,status:'NOT_CLOSED'};
  const built=buildTz101ExactTelegramContext({decision_summary,publication_gate});
  if(built.status!=='CLOSED') return {...base,reason:'PUBLICATION_CONTEXT_NOT_CLOSED',errors:built.errors};
  if(!env?.DATA_DB||typeof env.DATA_DB.prepare!=='function') return {...base,status:'SOURCE_UNSUPPORTED',reason:'DATA_DB_NOT_CONFIGURED'};
  if(!intTs(persisted_ts)||persisted_ts<decision_summary.observation_ts) return {...base,reason:'PERSISTED_TS_INVALID'};
  const contextJson=stableJson(built.context);
  if(bytes(contextJson)>MAX_TZ101_TELEGRAM_CONTEXT_BYTES) return {...base,reason:'CONTEXT_JSON_TOO_LARGE'};
  const contextDigest=await sha256Hex(contextJson);
  const contextId=`FTC:${decision_summary.decision_id}`;
  try {
    const stmt=env.DATA_DB.prepare(`
      INSERT OR IGNORE INTO final_decision_telegram_context_shadow (
        context_id,decision_id,material_digest,snapshot_id,contract_code,observation_ts,direction,
        decision_evidence_receipt_id,full_evidence_receipt_id,safety_gate_receipt_id,
        score_schema,score_semantics,score_lower_bound,score_upper_bound,valid_until_ts,
        context_json,context_digest,status,persisted_ts
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,'CLOSED',?18)
    `).bind(
      contextId,decision_summary.decision_id,decision_summary.material_digest,decision_summary.snapshot_id,
      decision_summary.contract_code,decision_summary.observation_ts,String(decision_summary.direction).toUpperCase(),
      decision_summary.decision_evidence_receipt_id,decision_summary.full_evidence_receipt_id,decision_summary.safety_gate_receipt_id,
      TZ101_TELEGRAM_CONTEXT_SCHEMA,TZ101_TELEGRAM_SCORE_SEMANTICS,built.context.score_lower_bound,built.context.score_upper_bound,
      built.context.valid_until_ts,contextJson,contextDigest,persisted_ts
    );
    const ack=snapshotAck(await stmt.run());
    return {...base,status:ack.changes===1?'CLOSED':'DEDUPLICATED',statements:1,context_id:contextId,decision_id:decision_summary.decision_id,context_digest:contextDigest,score_lower_bound:built.context.score_lower_bound,score_upper_bound:built.context.score_upper_bound,rows_written_reported:ack.rows_written};
  } catch(error) {
    const message=String(error?.message||error).slice(0,500);
    return {...base,status:/no such table|schema/i.test(message)?'MIGRATION_REQUIRED':'FAIL_CLOSED',statements:1,error:message};
  }
}
