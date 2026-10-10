import {captureBlockWeightAttribution} from './src/block-weight-calibration.mjs';
import { parseStage0CompactPayload } from './src/v3-early-discovery.mjs';
import { resolveEarlyOutcome } from './src/v3-early-persistence-runtime.mjs';
import {
  buildProspectiveEntryAreaSample,
  attachFactualEntryAreaOutcome,
} from './src/tz101-entry-area-calibration.mjs';
import {digest} from './src/upstream-proof-utils.mjs';
import {classifyDeliveryCohort} from './src/prospective-delivery-cohort.mjs';
import {HISTORY_COMPATIBILITY, verifiedCollectorRows, chooseCompleteBucket} from './src/market-history-reader.mjs';

export const R820_PROSPECTIVE_VALIDATION_VERSION = 'r8-20-prospective-v8-fail-closed-readiness-integrity-20261010';
export const R820_ENTRY_ACTIVATION_KEY = 'R8_20_PROSPECTIVE_ACTIVATION_V1';
export const R820_PROSPECTIVE_VALIDATION_BUDGET = Object.freeze({
  rows_read: 3000,
  rows_written: 8,
  requests_soft_cap: 14,
  max_scan_rows_per_path: 320,
  max_collector_rows_per_page: 400,
  max_collector_pages_per_path: 7,
  max_collector_payload_bytes_per_path: 48*1024*1024,
  max_capture_candidates: 12,
  max_early_outcomes_per_cycle: 1,
  max_entry_samples_per_cycle: 1,
  max_entry_outcomes_per_cycle: 1,
});

const HORIZONS = Object.freeze([1, 4, 12, 24]);
const READINESS_MIN_TRAIN = 80;
const READINESS_MIN_HOLDOUT = 40;
const READINESS_REQUIRED_PER_CELL = READINESS_MIN_TRAIN + READINESS_MIN_HOLDOUT;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function int(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}
function text(v) { return v == null ? '' : String(v).trim(); }
function parseJson(v, fallback = null) {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(String(v ?? '')); } catch { return fallback; }
}
function rowsOf(r) { return Array.isArray(r?.results) ? r.results : []; }
function usageDelta(before, after) {
  if (!before || !after) return null;
  return {
    rows_read: Math.max(0, Number(after.rows_read || 0) - Number(before.rows_read || 0)),
    rows_written: Math.max(0, Number(after.rows_written || 0) - Number(before.rows_written || 0)),
    requests: Math.max(0, Number(after.requests || 0) - Number(before.requests || 0)),
    unknown_ops: Math.max(0, Number(after.unknown_ops || 0) - Number(before.unknown_ops || 0)),
  };
}
function base(status, extra = {}) {
  return {
    version: R820_PROSPECTIVE_VALIDATION_VERSION,
    mode: 'SHADOW_PROSPECTIVE_VALIDATION_DATA_ONLY',
    status,
    calibration_only: true,
    live_probability: null,
    validated_signal: false,
    trading_execution: false,
    automatic_weight_tuning: false,
    strategy_weights_changed: false,
    telegram_network_send: false,
    ...extra,
  };
}
function closedStage0Point(row, contract) {
  const parsed = parseStage0CompactPayload(row?.payload_json ?? null, row?.ts ?? null);
  if (parsed.status !== 'CLOSED') return null;
  const point = parsed.rows.get(contract);
  if (!point || point.data_status !== 'CLOSED') return null;
  if (finite(point.market_age_sec) === null || Number(point.market_age_sec) < 0 || Number(point.market_age_sec) > 300) return null;
  if (finite(point.price) === null || Number(point.price) <= 0) return null;
  return { ts: Number(point.ts), price: Number(point.price) };
}

export async function loadProspectiveReadinessSnapshot(db, { activation_ts, now_ts = Date.now() } = {}) {
  const activationTs = int(activation_ts);
  if (!db?.prepare || activationTs === null) {
    return base('READINESS_NOT_CLOSED', { reason: 'ACTIVATION_OR_DB_INVALID' });
  }
  const [signalsResult, outcomesResult] = await Promise.all([
    db.prepare(`SELECT direction,COUNT(*) AS sample_count,MIN(observed_ts) AS first_observed_ts,MAX(observed_ts) AS last_observed_ts
      FROM tz101_entry_area_calibration_signal
      WHERE created_ts>=?1 AND calibration_only=1 AND live_promotion_allowed=0
        AND direction IN ('LONG','SHORT') AND json_valid(sample_json)=1
        AND json_extract(sample_json,'$.direction')=direction
        AND json_extract(sample_json,'$.observed_ts')=observed_ts
        AND json_extract(sample_json,'$.approved_entry_only')=1
      GROUP BY direction ORDER BY direction`).bind(activationTs).all(),
    db.prepare(`WITH joined AS (
        SELECT o.sample_id,o.direction,o.horizon_hours,o.observed_ts,o.outcome_json,s.sample_json,
          COALESCE(json_extract(s.sample_json,'$.idea_basis'),'UNKNOWN') AS idea_basis,
          COALESCE(json_extract(s.sample_json,'$.cohort_type'),'ANALYTICAL_PROSPECTIVE') AS cohort_type,
          CASE WHEN
            o.calibration_only=1 AND o.live_promotion_allowed=0 AND
            s.calibration_only=1 AND s.live_promotion_allowed=0 AND
            o.direction IN ('LONG','SHORT') AND o.direction=s.direction AND
            o.horizon_hours IN (1,4,12,24) AND o.observed_ts=s.observed_ts AND
            json_valid(o.outcome_json)=1 AND json_valid(s.sample_json)=1 AND
            json_extract(o.outcome_json,'$.status')='CLOSED_FACTUAL' AND
            json_extract(o.outcome_json,'$.direction')=o.direction AND
            json_extract(o.outcome_json,'$.horizon_hours')=o.horizon_hours AND
            json_extract(o.outcome_json,'$.observed_ts')=o.observed_ts AND
            json_extract(s.sample_json,'$.direction')=s.direction AND
            json_extract(s.sample_json,'$.observed_ts')=s.observed_ts AND
            json_extract(s.sample_json,'$.approved_entry_only')=1 AND
            json_type(s.sample_json,'$.idea_basis')='text' AND
            json_type(s.sample_json,'$.cohort_type')='text' AND
            json_type(s.sample_json,'$.source_ids')='array' AND
            json_type(o.outcome_json,'$.directional_return_pct') IN ('integer','real') AND
            json_type(o.outcome_json,'$.mfe_directional_pct_snapshot') IN ('integer','real') AND
            json_type(o.outcome_json,'$.mae_directional_pct_snapshot') IN ('integer','real') AND
            json_type(o.outcome_json,'$.target_touched') IN ('true','false','integer') AND
            json_type(o.outcome_json,'$.invalidation_touched') IN ('true','false','integer')
          THEN 1 ELSE 0 END AS integrity_closed
        FROM tz101_entry_area_calibration_outcome o
        JOIN tz101_entry_area_calibration_signal s ON s.sample_id=o.sample_id
        WHERE o.computed_ts>=?1
      ), base AS (
        SELECT * FROM joined WHERE integrity_closed=1
      )
      SELECT 'BASIS' AS dimension,idea_basis AS dimension_value,direction,horizon_hours,
        COUNT(DISTINCT sample_id) AS closed_samples,MIN(observed_ts) AS first_observed_ts,MAX(observed_ts) AS last_observed_ts,
        AVG(json_extract(outcome_json,'$.directional_return_pct')) AS average_return_pct,
        AVG(json_extract(outcome_json,'$.mfe_directional_pct_snapshot')) AS average_best_move_pct,
        AVG(json_extract(outcome_json,'$.mae_directional_pct_snapshot')) AS average_worst_move_pct,
        SUM(CASE WHEN json_extract(outcome_json,'$.target_touched')=1 THEN 1 ELSE 0 END) AS begin_close_hits,
        SUM(CASE WHEN json_extract(outcome_json,'$.invalidation_touched')=1 THEN 1 ELSE 0 END) AS invalidation_hits
      FROM base GROUP BY idea_basis,direction,horizon_hours
      UNION ALL
      SELECT 'SOURCE' AS dimension,CAST(j.value AS TEXT) AS dimension_value,b.direction,b.horizon_hours,
        COUNT(DISTINCT b.sample_id),MIN(b.observed_ts),MAX(b.observed_ts),
        AVG(json_extract(b.outcome_json,'$.directional_return_pct')),
        AVG(json_extract(b.outcome_json,'$.mfe_directional_pct_snapshot')),
        AVG(json_extract(b.outcome_json,'$.mae_directional_pct_snapshot')),
        SUM(CASE WHEN json_extract(b.outcome_json,'$.target_touched')=1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN json_extract(b.outcome_json,'$.invalidation_touched')=1 THEN 1 ELSE 0 END)
      FROM base b,json_each(b.sample_json,'$.source_ids') j
      GROUP BY CAST(j.value AS TEXT),b.direction,b.horizon_hours
      UNION ALL
      SELECT 'COHORT' AS dimension,cohort_type AS dimension_value,direction,horizon_hours,
        COUNT(DISTINCT sample_id),MIN(observed_ts),MAX(observed_ts),
        AVG(json_extract(outcome_json,'$.directional_return_pct')),
        AVG(json_extract(outcome_json,'$.mfe_directional_pct_snapshot')),
        AVG(json_extract(outcome_json,'$.mae_directional_pct_snapshot')),
        SUM(CASE WHEN json_extract(outcome_json,'$.target_touched')=1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN json_extract(outcome_json,'$.invalidation_touched')=1 THEN 1 ELSE 0 END)
      FROM base GROUP BY cohort_type,direction,horizon_hours
      UNION ALL
      SELECT 'INTEGRITY' AS dimension,'EXCLUDED_INVALID' AS dimension_value,NULL AS direction,NULL AS horizon_hours,
        COUNT(DISTINCT sample_id) AS closed_samples,NULL,NULL,NULL,NULL,NULL,NULL,NULL
      FROM joined WHERE integrity_closed=0
      ORDER BY dimension,direction,horizon_hours,dimension_value`).bind(activationTs).all(),
  ]);
  const signalRows = rowsOf(signalsResult).map(row => ({
    direction: text(row.direction),
    sample_count: Number(row.sample_count) || 0,
    first_observed_ts: int(row.first_observed_ts),
    last_observed_ts: int(row.last_observed_ts),
  }));
  const outcomeRows=rowsOf(outcomesResult);
  const observed=new Map();
  for(const row of outcomeRows.filter(row=>row.dimension==='BASIS')){
    const key=`${text(row.direction)}:${Number(row.horizon_hours)}`,prior=observed.get(key)||{closed_samples:0,first_observed_ts:null,last_observed_ts:null};
    const first=int(row.first_observed_ts),last=int(row.last_observed_ts);
    observed.set(key,{closed_samples:prior.closed_samples+(Number(row.closed_samples)||0),first_observed_ts:prior.first_observed_ts===null?first:first===null?prior.first_observed_ts:Math.min(prior.first_observed_ts,first),last_observed_ts:prior.last_observed_ts===null?last:last===null?prior.last_observed_ts:Math.max(prior.last_observed_ts,last)});
  }
  const excludedInvalidOutcomes=Number(outcomeRows.find(row=>row.dimension==='INTEGRITY')?.closed_samples)||0;
  const performance=outcomeRows.filter(row=>['BASIS','SOURCE','COHORT'].includes(row.dimension)).map(row=>({dimension:text(row.dimension),group:text(row.dimension_value),direction:text(row.direction),horizon_hours:Number(row.horizon_hours),samples:Number(row.closed_samples)||0,average_return_pct:finite(row.average_return_pct),average_best_move_pct:finite(row.average_best_move_pct),average_worst_move_pct:finite(row.average_worst_move_pct),begin_close_hits:Number(row.begin_close_hits)||0,invalidation_hits:Number(row.invalidation_hits)||0}));
  const cells = [];
  for (const direction of ['LONG', 'SHORT']) {
    for (const horizonHours of HORIZONS) {
      const value = observed.get(`${direction}:${horizonHours}`) || {};
      const closedSamples = Number(value.closed_samples) || 0;
      cells.push({
        direction,
        horizon_hours: horizonHours,
        closed_samples: closedSamples,
        missing_samples: Math.max(0, READINESS_REQUIRED_PER_CELL - closedSamples),
        data_ready: closedSamples >= READINESS_REQUIRED_PER_CELL,
        first_observed_ts: value.first_observed_ts ?? null,
        last_observed_ts: value.last_observed_ts ?? null,
      });
    }
  }
  const readyCells = cells.filter(row => row.data_ready).length;
  return base(readyCells === cells.length ? 'CALIBRATION_DATA_READY_NOT_VALIDATED' : 'NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE', {
    activation_ts: activationTs,
    elapsed_days: Number(((Number(now_ts) - activationTs) / (24 * HOUR)).toFixed(3)),
    min_train_per_cell: READINESS_MIN_TRAIN,
    min_holdout_per_cell: READINESS_MIN_HOLDOUT,
    required_per_direction_horizon_cell: READINESS_REQUIRED_PER_CELL,
    ready_cells: readyCells,
    total_cells: cells.length,
    signal_rows: signalRows,
    outcome_cells: cells,
    approved_entry_performance: performance,
    integrity_excluded_outcomes: excludedInvalidOutcomes,
    performance_dimensions:['BASIS','SOURCE','COHORT'],
    data_ready_for_separate_oos_validation: readyCells === cells.length,
    validated_out_of_sample: false,
  });
}

async function ensureActivation(db, nowTs) {
  const existing = await db.prepare(`SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`)
    .bind(R820_ENTRY_ACTIVATION_KEY).first();
  if (existing) {
    const activationTs = int(existing.updated_ts);
    if (activationTs === null) return { status: 'FAIL_CLOSED', reason: 'ACTIVATION_TS_INVALID' };
    return { status: 'CLOSED', activation_ts: activationTs, created: false };
  }
  const now = int(nowTs);
  if (now === null) return { status: 'FAIL_CLOSED', reason: 'NOW_TS_INVALID' };
  await db.prepare(`INSERT OR IGNORE INTO tz101_entry_area_calibration_state(
    state_key,status,closed_samples,train_samples,holdout_samples,validated_out_of_sample,
    live_promotion_allowed,automatic_rule_promotion,updated_ts
  ) VALUES(?1,'PROSPECTIVE_COLLECTION_ACTIVE_NOT_VALIDATED',0,0,0,0,0,0,?2)`).bind(R820_ENTRY_ACTIVATION_KEY, now).run();
  const readback = await db.prepare(`SELECT state_key,status,updated_ts FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`)
    .bind(R820_ENTRY_ACTIVATION_KEY).first();
  const activationTs = int(readback?.updated_ts);
  if (!readback || activationTs === null || activationTs < now) return { status: 'FAIL_CLOSED', reason: 'ACTIVATION_READBACK_FAILED' };
  return { status: 'CLOSED', activation_ts: activationTs, created: true };
}

function coveredPath(points, start, end, cadence) {
  const ordered = [...points].sort((a,b)=>a.ts-b.ts);
  return ordered.length > 0 && ordered[0].ts <= start + cadence &&
    ordered.at(-1).ts >= end - 15 * MINUTE &&
    ordered.every((p,i)=>!i || p.ts-ordered[i-1].ts <= cadence + MINUTE);
}

async function loadFactualPath(db, { contract, startTs, endTs, allowAfterTarget = false, nowTs = Date.now() } = {}) {
  const start = int(startTs), end = int(endTs);
  if (!text(contract) || start === null || end === null || end < start) return { status: 'INVALID_INPUT', points: [] };
  const upper = Math.min(nowTs, allowAfterTarget ? end + 15 * MINUTE : end);
  const limit = R820_PROSPECTIVE_VALIDATION_BUDGET.max_scan_rows_per_path;
  let collectorReason = 'NO_FACTUAL_PATH';
  try {
    // Each raw page is bounded before parsing and hashing; a long horizon has
    // multiple collector shards per timestamp. Unchanged cycle admission checks
    // every next page and never makes a truncated history factual.
    const longPath=end-start>=4*HOUR,pageLimit=longPath?R820_PROSPECTIVE_VALIDATION_BUDGET.max_collector_rows_per_page:limit;
    const maxPages=longPath?R820_PROSPECTIVE_VALIDATION_BUDGET.max_collector_pages_per_path:1;
    const raw=[];let cursor=null,complete=false,payloadBytes=0;
    for(let page=0;page<maxPages;page++){
      const columns='bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes';
      let sql,args;
      if(cursor){
        // Exclude completed generations before querying. A SQL generation>?x
        // filter over the original IN list still billed their entire range.
        const future=HISTORY_COMPATIBILITY.generations.filter(g=>g>cursor.generation);
        const next=future.length
          ?` UNION ALL SELECT ${columns} FROM report2_market_snapshot_batch_v1 INDEXED BY idx_report2_market_snapshot_batch_v1_range
              WHERE generation IN (${future.map((_,i)=>'?'+(i+5)).join(',')}) AND actor='HUB_PUBLIC_COLLECTOR'
                AND bucket BETWEEN ?${future.length+5} AND ?3`
          :'';
        sql=`SELECT ${columns} FROM report2_market_snapshot_batch_v1 INDEXED BY idx_report2_market_snapshot_batch_v1_range
          WHERE generation=?1 AND actor='HUB_PUBLIC_COLLECTOR'
            AND bucket BETWEEN ?2 AND ?3 AND (bucket,shard)>(?2,?4)${next}
          ORDER BY generation,bucket,shard LIMIT ?${future.length?future.length+6:5}`;
        args=[cursor.generation,cursor.bucket,upper,cursor.shard,...future,...(future.length?[Math.floor(start/(5*MINUTE))*5*MINUTE]:[]),pageLimit+1];
      }else{
        sql=`SELECT ${columns} FROM report2_market_snapshot_batch_v1
          WHERE generation IN (?1,?2,?3) AND actor='HUB_PUBLIC_COLLECTOR' AND bucket BETWEEN ?4 AND ?5
          ORDER BY generation,bucket,shard LIMIT ?6`;
        args=[...HISTORY_COMPATIBILITY.generations,Math.floor(start/(5*MINUTE))*5*MINUTE,upper,pageLimit+1];
      }
      const records=rowsOf(await db.prepare(sql).bind(...args).all()),retained=records.slice(0,pageLimit);
      for(const row of retained){payloadBytes+=new TextEncoder().encode(String(row.payload??'')).byteLength;raw.push(row);}
      if(payloadBytes>R820_PROSPECTIVE_VALIDATION_BUDGET.max_collector_payload_bytes_per_path){collectorReason='COLLECTOR_RAW_BYTE_CAP';break;}
      if(records.length<=pageLimit){complete=true;break;}
      cursor=retained.at(-1);
      if(!cursor||!Number.isSafeInteger(cursor.bucket)||!Number.isSafeInteger(cursor.shard)||!text(cursor.generation)){collectorReason='COLLECTOR_CURSOR_INVALID';break;}
    }
    if (complete) {
      const verified = await verifiedCollectorRows(raw.filter(r=>r.actor==='HUB_PUBLIC_COLLECTOR'), {decisionTs:nowTs});
      const buckets = new Map();
      for (const row of verified.accepted) {
        const groups = buckets.get(row.bucket) || new Map();
        groups.set(row.generation,[...(groups.get(row.generation)||[]),row]);
        buckets.set(row.bucket,groups);
      }
      const points=[];
      for (const [bucket,groups] of buckets) {
        const selected=chooseCompleteBucket(groups,text(contract),HISTORY_COMPATIBILITY.generations.at(-1));
        const row=selected?.row, ts=int(row?.observed_ts), price=finite(row?.price), age=finite(row?.market_age_sec);
        if (row?.contract===text(contract) && row.source_status==='CLOSED' && ts!==null && ts>=start && ts<=upper &&
            Math.abs(ts-Number(bucket))<=5*MINUTE && age!==null && age>=0 && age<=300 && price!==null && price>0) points.push({ts,price});
      }
      points.sort((a,b)=>a.ts-b.ts);
      if (coveredPath(points,start,end,5*MINUTE)) return {status:'CLOSED',points,rows_loaded:raw.length,history_source:'REPORT2_MARKET_SNAPSHOT_BATCH_V1',sampling_minutes:5,extrema_scope:'OBSERVED_SNAPSHOTS_ONLY'};
      collectorReason=verified.rejected.length?'COLLECTOR_INTEGRITY_OR_COVERAGE_GAP':'COLLECTOR_COVERAGE_GAP';
    } else if(!['COLLECTOR_RAW_BYTE_CAP','COLLECTOR_CURSOR_INVALID'].includes(collectorReason))collectorReason='COLLECTOR_RAW_ROW_CAP';
  } catch (error) {
    if (!/no such table/i.test(String(error?.message||error))) throw error;
    collectorReason='COLLECTOR_TABLE_UNAVAILABLE';
  }
  const result = await db.prepare(`SELECT ts_bucket,ts,payload_json,stage0_coverage_pct,errors,stale FROM scan_runs
    WHERE ts_bucket BETWEEN ?1 AND ?2 ORDER BY ts_bucket ASC LIMIT ?3`)
    .bind(Math.floor(start/(5*MINUTE))*5*MINUTE, upper, limit+1).all();
  const rows = rowsOf(result);
  if (rows.length>limit) return {status:'SCAN_RAW_ROW_CAP',points:[],rows_loaded:rows.length,collector_reason:collectorReason};
  const points = [];
  for (const row of rows) {
    if (finite(row.stage0_coverage_pct)<99.9 || finite(row.stage0_coverage_pct)===null || row.errors!==0 || row.stale!==0 || int(row.ts)===null || row.ts>nowTs || Math.abs(row.ts-row.ts_bucket)>5*MINUTE) continue;
    const p = closedStage0Point(row, contract);
    if (p && p.ts===Number(row.ts) && p.ts>=start && p.ts<=upper) points.push(p);
  }
  const complete=coveredPath(points,start,end,20*MINUTE);
  return { status: complete?'CLOSED':points.length?'PARTIAL_FACTUAL_PATH':'NO_FACTUAL_PATH', points, rows_loaded: rows.length, history_source: complete?'SCAN_RUNS_FALLBACK':null, collector_reason:collectorReason, sampling_minutes:20,extrema_scope:'OBSERVED_SNAPSHOTS_ONLY' };
}

export async function closeOneEarlyDiscoveryOutcome(db, { current_scan_ts, now_ts = Date.now() } = {}) {
  const currentTs = int(current_scan_ts);
  if (currentTs === null) return { status: 'NOT_CLOSED', reason: 'CURRENT_SCAN_TS_INVALID' };
  const queueKey='R8_20_EARLY_OUTCOME_CURSOR_V1';
  const state=await db.prepare(`SELECT status FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`).bind(queueKey).first();
  const cursor=parseJson(state?.status,{});
  // A historical hole can precede thousands of mature observations. Keep its
  // original cursor, but alternate it with a separate recent cursor at the same
  // one-outcome cap. Neither lane supplies prices or authorizes an ENTRY.
  const recentFloor=Math.max(0,currentTs-24*HOUR);
  const excluded=int(cursor.last_attempt_retry_after_ts)>now_ts?text(cursor.last_attempt_id):'';
  const select=async (target,id)=>db.prepare(`SELECT outcome_id,wave_id,contract_code,direction_hint,first_seen_ts,horizon_hours,target_ts,
      outcome_status,first_seen_context_json,computed_ts,shadow_only
    FROM v3_early_outcome_journal
    WHERE shadow_only=1 AND computed_ts IS NULL AND outcome_status='PENDING' AND target_ts BETWEEN ?1 AND ?2
      AND (target_ts>?1 OR outcome_id>?3) AND outcome_id<>?4
    ORDER BY target_ts ASC,outcome_id ASC LIMIT 1`).bind(target,currentTs,id,excluded).first();
  const recent=parseJson(JSON.stringify(cursor.recent_cursor??{}),{});
  const laneCursor=lane=>lane==='RECENT'?recent:cursor;
  const inLane=async lane=>{
    const c=laneCursor(lane),floor=lane==='RECENT'?recentFloor:0;
    const remembered=int(c.target_ts),target=Math.max(floor,remembered??floor);
    const id=remembered!==null&&remembered>=floor?text(c.outcome_id):'';
    let task=await select(target,id);
    const retryAfter=int(c.retry_after_ts)??0;
    if(!task&&c.outcome_id&&now_ts>=retryAfter)task=await select(floor,'');
    return {task,lane,retryAfter};
  };
  let selected=await inLane(cursor.next_lane==='RETAINED'?'RETAINED':'RECENT');
  if(!selected.task)selected=await inLane(selected.lane==='RECENT'?'RETAINED':'RECENT');
  const {task,lane}=selected;
  if (!task && (cursor.outcome_id||recent.outcome_id)) return {status:'DEFERRED_EARLY_RETRY_COOLDOWN',closed:0,retry_after_ts:Math.max(int(cursor.retry_after_ts)??0,int(recent.retry_after_ts)??0)};
  if (!task) return { status: 'CLOSED_NO_DUE_EARLY_OUTCOME', closed: 0 };
  // Advance before attempting history. Failed/missing observations stay PENDING,
  // with null results, and are revisited on a later sweep. New due tasks are not
  // held behind an old hole. The queue key never modifies activation/readiness.
  const progress={target_ts:Number(task.target_ts),outcome_id:text(task.outcome_id),retry_after_ts:Number(now_ts)+24*HOUR};
  const next={...cursor,...(lane==='RETAINED'?progress:{}),recent_cursor:lane==='RECENT'?progress:recent,next_lane:lane==='RECENT'?'RETAINED':'RECENT',last_attempt_id:text(task.outcome_id),last_attempt_retry_after_ts:Number(now_ts)+24*HOUR};
  await db.prepare(`INSERT INTO tz101_entry_area_calibration_state
    (state_key,status,closed_samples,train_samples,holdout_samples,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts)
    VALUES(?1,?2,0,0,0,0,0,0,?3) ON CONFLICT(state_key) DO UPDATE SET status=excluded.status,updated_ts=excluded.updated_ts`)
    .bind(queueKey,JSON.stringify(next),Number(now_ts)).run();
  const context = parseJson(task.first_seen_context_json, {});
  const firstPrice = finite(context?.first_seen_price);
  if (firstPrice === null || firstPrice <= 0) return { status: 'NOT_CLOSED', reason: 'FIRST_SEEN_PRICE_MISSING', outcome_id: task.outcome_id };
  const path = await loadFactualPath(db, { contract: text(task.contract_code), startTs: Number(task.first_seen_ts), endTs: Number(task.target_ts), allowAfterTarget: false, nowTs:now_ts });
  if (path.status !== 'CLOSED') return { status: 'NOT_CLOSED', reason: path.status, outcome_id: task.outcome_id, rows_loaded: path.rows_loaded || 0 };
  const resolved = resolveEarlyOutcome({ task, first_seen_price: firstPrice, price_path: path.points, computed_ts: now_ts });
  if (resolved.status !== 'CLOSED') return { status: 'NOT_CLOSED', reason: resolved.reason || resolved.status, outcome_id: task.outcome_id, rows_loaded: path.rows_loaded || 0 };
  const o = resolved.outcome;
  const ack = await db.prepare(`UPDATE v3_early_outcome_journal SET
      outcome_status='CLOSED_FACTUAL',raw_return_pct=?1,directional_return_pct=?2,mfe_pct=?3,mae_pct=?4,computed_ts=?5
    WHERE outcome_id=?6 AND shadow_only=1 AND computed_ts IS NULL AND outcome_status='PENDING'`)
    .bind(o.raw_return_pct, o.directional_return_pct, o.mfe_pct, o.mae_pct, Number(o.computed_ts), text(task.outcome_id)).run();
  const changes = Number(ack?.meta?.changes ?? ack?.changes ?? 0);
  return {
    status: changes === 1 ? 'CLOSED_FACTUAL' : changes === 0 ? 'DEDUPLICATED' : 'FAIL_CLOSED',
    closed: changes === 1 ? 1 : 0,
    outcome_id: text(task.outcome_id),
    contract_code: text(task.contract_code),
    direction_hint: text(task.direction_hint) || null,
    horizon_hours: Number(task.horizon_hours),
    rows_loaded: path.rows_loaded || 0,
    history_source: path.history_source || null,
  };
}

function decisionSummaryFromRow(row) {
  return {
    decision_id: text(row?.decision_id),
    snapshot_id: text(row?.snapshot_id),
    contract_code: text(row?.contract_code),
    direction: text(row?.direction),
    campaign_receipt_id: text(row?.campaign_receipt_id),
    observation_ts: int(row?.observation_ts),
  };
}

export async function captureOneEntryAreaSample(db, { activation_ts, now_ts = Date.now() } = {}) {
  const activationTs = int(activation_ts);
  if (activationTs === null) return { status: 'NOT_CAPTURED', reason: 'ACTIVATION_TS_INVALID' };
  const result = await db.prepare(`SELECT
      f.decision_id,f.snapshot_id,f.contract_code,f.direction,f.campaign_receipt_id,f.observation_ts,f.persisted_ts,
      f.decision_status,f.shadow_only,f.live_probability,f.validated_signal,f.execution_authorized,f.telegram_eligible,
      j.receipt_json,p.publication_id,p.wave_id AS publication_wave_id,p.canonical_json,
      (SELECT td.dispatch_id FROM v3_dispatch_publication_binding_shadow b
        JOIN v3_telegram_dispatch_shadow td ON td.idempotency_key=b.idempotency_key
        WHERE b.publication_id=p.publication_id AND b.lifecycle_event='ENTRY' AND td.lifecycle_event='ENTRY'
          AND td.state='SENT' AND CAST(td.telegram_message_id AS INTEGER)>0 AND td.sent_ts IS NOT NULL
        ORDER BY td.sent_ts ASC,td.dispatch_id ASC LIMIT 1) AS telegram_dispatch_id,
      (SELECT td.telegram_message_id FROM v3_dispatch_publication_binding_shadow b
        JOIN v3_telegram_dispatch_shadow td ON td.idempotency_key=b.idempotency_key
        WHERE b.publication_id=p.publication_id AND b.lifecycle_event='ENTRY' AND td.lifecycle_event='ENTRY'
          AND td.state='SENT' AND CAST(td.telegram_message_id AS INTEGER)>0 AND td.sent_ts IS NOT NULL
        ORDER BY td.sent_ts ASC,td.dispatch_id ASC LIMIT 1) AS telegram_message_id,
      (SELECT td.sent_ts FROM v3_dispatch_publication_binding_shadow b
        JOIN v3_telegram_dispatch_shadow td ON td.idempotency_key=b.idempotency_key
        WHERE b.publication_id=p.publication_id AND b.lifecycle_event='ENTRY' AND td.lifecycle_event='ENTRY'
          AND td.state='SENT' AND CAST(td.telegram_message_id AS INTEGER)>0 AND td.sent_ts IS NOT NULL
        ORDER BY td.sent_ts ASC,td.dispatch_id ASC LIMIT 1) AS telegram_confirmed_ts
    FROM final_decision_integration_shadow f
    JOIN stage392_multi_wave_receipt_journal j ON j.receipt_id=f.campaign_receipt_id
    JOIN canonical_publication_shadow p ON p.decision_id=f.decision_id
      AND p.lifecycle_event='ENTRY' AND p.actionability_status='ACTIONABLE'
    WHERE f.persisted_ts>=?1
      AND f.decision_status='SHADOW_EVALUATED'
      AND f.direction IN ('LONG','SHORT')
      AND f.shadow_only=1 AND f.live_probability IS NULL AND f.validated_signal=0 AND f.execution_authorized=0 AND f.telegram_eligible=0
      -- Anchor JSON is validated after the bounded retained-history reader
      -- restores exact archived columns. SQL must not parse archive locators.
      AND NOT EXISTS (SELECT 1 FROM tz101_entry_area_calibration_signal s WHERE s.decision_id=f.decision_id)
    ORDER BY f.persisted_ts ASC,f.decision_id ASC
    LIMIT ${R820_PROSPECTIVE_VALIDATION_BUDGET.max_capture_candidates}`).bind(activationTs).all();
  const candidates = rowsOf(result);
  if (!candidates.length) return { status: 'CLOSED_NO_CAPTURABLE_DECISION', captured: 0 };
  for (const row of candidates) {
    const decision = decisionSummaryFromRow(row);
    const proof = parseJson(row.receipt_json, null);
    let sampleRecord = buildProspectiveEntryAreaSample({ decision_summary: decision, campaign_proof: proof, observed_ts: now_ts });
    if (sampleRecord.status !== 'CAPTURED_PROSPECTIVE') continue;
    const canonical=parseJson(row.canonical_json,null),entryPrice=finite(canonical?.current_price),target=finite(canonical?.targets?.find?.(item=>finite(item?.price??item)!==null)?.price??canonical?.targets?.[0]),direction=text(decision.direction);
    const remaining=entryPrice&&target?(direction==='LONG'?(target/entryPrice-1)*100:(1-target/entryPrice)*100):null;
    if(!canonical||!['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(text(canonical.state))||entryPrice===null||entryPrice<=0||target===null||target<=0||remaining===null||remaining<=0)continue;
    const sourceIds=[...new Set([
      ...(Array.isArray(canonical?.source_receipts)?canonical.source_receipts:[]).flatMap(item=>[text(item?.source),text(item?.venue)]),
      ...(Array.isArray(canonical?.metadata?.supplemental_score_adjustment?.receipts)?canonical.metadata.supplemental_score_adjustment.receipts:[]).map(item=>text(item?.source_id)),
      ...[canonical?.liquidations?.native_extension,...(Array.isArray(canonical?.liquidations?.independent_extensions)?canonical.liquidations.independent_extensions:[])].filter(Boolean).flatMap(item=>[text(item?.provider),text(item?.source)]),
    ].filter(Boolean))];
    const revised=structuredClone(sampleRecord.sample);
    revised.entry_trigger_price=entryPrice;revised.target_price=target;revised.target_move_pct=remaining;
    revised.features={...revised.features,target_distance_pct:remaining};
    const deliveryCohort=classifyDeliveryCohort({publication_id:row.publication_id,wave_id:row.publication_wave_id,direction,telegram_dispatch_id:row.telegram_dispatch_id,telegram_message_id:row.telegram_message_id,telegram_confirmed_ts:row.telegram_confirmed_ts});
    const telegramConfirmed=deliveryCohort.delivery_channels.telegram_confirmed;
    revised.approved_entry_only=true;revised.publication_id=text(row.publication_id);revised.idea_basis=text(canonical?.metadata?.idea_basis)||'MULTI_FACTOR';revised.source_ids=sourceIds;
    revised.cohort_type=deliveryCohort.cohort_type;
    revised.delivery_proof={telegram:{confirmed:telegramConfirmed,dispatch_id:telegramConfirmed?text(row.telegram_dispatch_id):null,message_id:telegramConfirmed?text(row.telegram_message_id):null,confirmed_ts:telegramConfirmed?int(row.telegram_confirmed_ts):null,publication_id:text(row.publication_id),wave_id:text(row.publication_wave_id)||null},manual:{confirmed:false,reason:'NO_EXACT_MANUAL_DELIVERY_ACK_BOUND_TO_PUBLICATION'}};
    revised.outcome_wave_key=deliveryCohort.outcome_wave_key;revised.delivery_channels=deliveryCohort.delivery_channels;revised.one_wave_one_outcome=true;
    revised.begin_close_price=target;revised.minimum_reportable_move_pct=null;
    const blockAttribution=captureBlockWeightAttribution(canonical);if(blockAttribution)revised.block_weight_attribution=blockAttribution;
    const revisedDigest=digest(revised);sampleRecord={...sampleRecord,sample_id:`EAC:${revisedDigest}`,material_digest:revisedDigest,sample:revised};
    const s = sampleRecord.sample;
    const ack = await db.prepare(`INSERT OR IGNORE INTO tz101_entry_area_calibration_signal(
      sample_id,decision_id,snapshot_id,contract_code,direction,campaign_receipt_id,campaign_id,observed_ts,
      anchor_committed_ts,entry_trigger_time,entry_trigger_price,base_low,base_high,invalidation_price,target_price,
      scenario_type,sample_json,material_digest,calibration_only,live_promotion_allowed,automatic_rule_promotion,created_ts
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,1,0,0,?19)`)
      .bind(sampleRecord.sample_id,s.decision_id,s.snapshot_id,s.contract_code,s.direction,s.campaign_receipt_id,s.campaign_id,s.observed_ts,
        s.anchor_committed_ts,s.entry_trigger_time,s.entry_trigger_price,s.base_low,s.base_high,s.invalidation_price,s.target_price,
        s.scenario_type,JSON.stringify(s),sampleRecord.material_digest,Number(now_ts)).run();
    const changes = Number(ack?.meta?.changes ?? ack?.changes ?? 0);
    return {
      status: changes === 1 ? 'CAPTURED_PROSPECTIVE' : changes === 0 ? 'DEDUPLICATED' : 'FAIL_CLOSED',
      captured: changes === 1 ? 1 : 0,
      sample_id: sampleRecord.sample_id,
      decision_id: s.decision_id,
      contract_code: s.contract_code,
      direction: s.direction,
      observed_ts: s.observed_ts,
    };
  }
  return { status: 'CLOSED_NO_VALID_PROSPECTIVE_ANCHOR', captured: 0, candidates_examined: candidates.length };
}

function pathCoveragePct(points, startTs, endTs) {
  const span = Math.max(0, Number(endTs) - Number(startTs));
  const expected = Math.max(1, Math.floor(span / (5 * MINUTE)) + 1);
  return Math.min(100, (100 * points.length) / expected);
}

function buildEntryAreaFactualOutcome({ sample, horizonHours, points, targetTs } = {}) {
  const entry = finite(sample?.entry_trigger_price);
  if (entry === null || entry <= 0 || !HORIZONS.includes(Number(horizonHours))) return { status: 'NOT_CLOSED', reason: 'SAMPLE_OR_HORIZON_INVALID' };
  const ordered = (Array.isArray(points) ? points : []).filter(p => int(p?.ts) !== null && finite(p?.price) !== null && Number(p.price) > 0).sort((a,b)=>a.ts-b.ts);
  const outcomePoint = ordered.find(p => Number(p.ts) >= Number(targetTs));
  if (!outcomePoint || Number(outcomePoint.ts) > Number(targetTs) + 15 * MINUTE) return { status: 'NOT_CLOSED', reason: 'FACTUAL_TARGET_SCAN_NOT_COVERED' };
  const path = ordered.filter(p => Number(p.ts) <= Number(outcomePoint.ts));
  if (!path.length) return { status: 'NOT_CLOSED', reason: 'FACTUAL_PATH_EMPTY' };
  const rawSeries = path.map(p => ((Number(p.price) / entry) - 1) * 100);
  const sign = sample.direction === 'SHORT' ? -1 : sample.direction === 'LONG' ? 1 : 0;
  if (!sign) return { status: 'NOT_CLOSED', reason: 'DIRECTION_INVALID' };
  const dirSeries = rawSeries.map(x => sign * x);
  return {
    status: 'CLOSED_FACTUAL',
    record: {
      status: 'CLOSED_FACTUAL',
      contract_code: sample.contract_code,
      direction_hint: sample.direction,
      observed_ts: sample.observed_ts,
      horizon_hours: Number(horizonHours),
      target_ts: Number(targetTs),
      outcome_scan_ts: Number(outcomePoint.ts),
      directional_return_pct: dirSeries.at(-1),
      mfe_directional_pct_snapshot: Math.max(...dirSeries),
      mae_directional_pct_snapshot: Math.min(...dirSeries),
      path_coverage_pct: pathCoveragePct(path, sample.observed_ts, outcomePoint.ts),
      source: 'HTX_PUBLIC_HISTORY_FACTUAL_NO_INTERPOLATION',
      interpolation_used: false,
      calibration_only: true,
      live_promotion_allowed: false,
    },
  };
}

export async function closeOneEntryAreaOutcome(db, { current_scan_ts, activation_ts, now_ts = Date.now() } = {}) {
  const currentTs = int(current_scan_ts), activationTs = int(activation_ts);
  if (currentTs === null || activationTs === null) return { status: 'NOT_CLOSED', reason: 'TIMESTAMP_INVALID' };
  const queueKey='R8_20_ENTRY_OUTCOME_CURSOR_V1';
  const state=await db.prepare(`SELECT status FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`).bind(queueKey).first();
  const cursor=parseJson(state?.status,{});
  const select=async (target,id)=>db.prepare(`WITH horizons(horizon_hours) AS (VALUES(1),(4),(12),(24))
    SELECT s.sample_id,s.decision_id,s.contract_code,s.direction,s.observed_ts,s.sample_json,s.material_digest,
           h.horizon_hours,(s.observed_ts + h.horizon_hours*3600000) AS target_ts
    FROM tz101_entry_area_calibration_signal s
    CROSS JOIN horizons h
    LEFT JOIN tz101_entry_area_calibration_outcome o ON o.sample_id=s.sample_id AND o.horizon_hours=h.horizon_hours
    WHERE s.created_ts>=?1 AND o.sample_id IS NULL AND (s.observed_ts + h.horizon_hours*3600000)<=?2
      AND ((s.observed_ts + h.horizon_hours*3600000)>?3 OR
        ((s.observed_ts + h.horizon_hours*3600000)=?3 AND s.sample_id>?4))
    ORDER BY target_ts ASC,s.sample_id ASC LIMIT 1`).bind(activationTs,currentTs,target,id).all();
  let row=rowsOf(await select(int(cursor.target_ts)??0,text(cursor.sample_id)))[0]||null;
  let retryAfter=int(cursor.retry_after_ts)??0;
  if (!row && cursor.sample_id && now_ts>=retryAfter) {row=rowsOf(await select(0,''))[0]||null;retryAfter=0;}
  if (!row && cursor.sample_id && now_ts<retryAfter) return {status:'DEFERRED_ENTRY_RETRY_COOLDOWN',closed:0,retry_after_ts:retryAfter};
  if (!row) return { status: 'CLOSED_NO_DUE_ENTRY_OUTCOME', closed: 0 };
  await db.prepare(`INSERT INTO tz101_entry_area_calibration_state
    (state_key,status,closed_samples,train_samples,holdout_samples,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts)
    VALUES(?1,?2,0,0,0,0,0,0,?3) ON CONFLICT(state_key) DO UPDATE SET status=excluded.status,updated_ts=excluded.updated_ts`)
    .bind(queueKey,JSON.stringify({target_ts:Number(row.target_ts),sample_id:text(row.sample_id),retry_after_ts:retryAfter||Number(now_ts)+24*HOUR}),Number(now_ts)).run();
  const sample = parseJson(row.sample_json, null);
  const sampleRecord = {
    status: 'CAPTURED_PROSPECTIVE',
    sample_id: text(row.sample_id),
    material_digest: text(row.material_digest),
    sample,
  };
  const path = await loadFactualPath(db, { contract: text(row.contract_code), startTs: Number(row.observed_ts), endTs: Number(row.target_ts), allowAfterTarget: true, nowTs:now_ts });
  if (path.status !== 'CLOSED') return { status: 'NOT_CLOSED', reason: path.status, sample_id: row.sample_id, horizon_hours: Number(row.horizon_hours), rows_loaded: path.rows_loaded || 0 };
  const factual = buildEntryAreaFactualOutcome({ sample, horizonHours: Number(row.horizon_hours), points: path.points, targetTs: Number(row.target_ts) });
  if (factual.status !== 'CLOSED_FACTUAL') return { status: 'NOT_CLOSED', reason: factual.reason, sample_id: row.sample_id, horizon_hours: Number(row.horizon_hours), rows_loaded: path.rows_loaded || 0 };
  const attached = attachFactualEntryAreaOutcome({ sample_record: sampleRecord, outcome_record: factual.record, computed_ts: now_ts });
  if (attached.status !== 'CLOSED_FACTUAL') return { status: 'NOT_CLOSED', reason: attached.reason || attached.status, sample_id: row.sample_id, horizon_hours: Number(row.horizon_hours) };
  const o = {...attached.outcome,block_weight_outcome_basis:{source:factual.record.source,interpolation_used:factual.record.interpolation_used,path_coverage_pct:factual.record.path_coverage_pct}};
  const outcomeDigest=digest(o);
  const ack = await db.prepare(`INSERT OR IGNORE INTO tz101_entry_area_calibration_outcome(
      sample_id,horizon_hours,contract_code,direction,observed_ts,target_ts,outcome_scan_ts,outcome_json,material_digest,
      path_order_status,calibration_only,live_promotion_allowed,computed_ts
    ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,1,0,?11)`)
    .bind(attached.sample_id,o.horizon_hours,o.contract_code,o.direction,o.observed_ts,o.target_ts,o.outcome_scan_ts,
      JSON.stringify(o),outcomeDigest,o.path_order_status,o.computed_ts).run();
  const changes = Number(ack?.meta?.changes ?? ack?.changes ?? 0);
  return {
    status: changes === 1 ? 'CLOSED_FACTUAL' : changes === 0 ? 'DEDUPLICATED' : 'FAIL_CLOSED',
    closed: changes === 1 ? 1 : 0,
    sample_id: attached.sample_id,
    contract_code: o.contract_code,
    direction: o.direction,
    horizon_hours: o.horizon_hours,
    path_order_status: o.path_order_status,
    rows_loaded: path.rows_loaded || 0,
    history_source: path.history_source || null,
  };
}

// This admission guard prevents launching the NEXT statement after quota is
// exhausted. Indexed/raw-row-bounded history queries address the measured large
// read. It is not a database-engine hard cap on rows billed by one statement.
export function prospectiveBudgetGuard(db, before) {
  let pendingRequests=0,pendingReads=0,pendingWrites=0;
  const wrap=(statement,sql)=>({
    bind(...args){return wrap(statement.bind(...args),sql);},
    ...Object.fromEntries(['all','first','run'].map(method=>[method,async (...args)=>{
      const delta=usageDelta(before,db.usageSnapshot());
      const writes=/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)?1:0;
      const history=/FROM\s+(report2_market_snapshot_batch_v1|scan_runs)\b/i.test(sql);
      const rowReserve=/FROM\s+report2_market_snapshot_batch_v1\b/i.test(sql)?R820_PROSPECTIVE_VALIDATION_BUDGET.max_collector_rows_per_page:R820_PROSPECTIVE_VALIDATION_BUDGET.max_scan_rows_per_path;
      const readReserve=history?2*(rowReserve+1)+8:1;
      if (!delta || delta.unknown_ops || delta.requests+pendingRequests+1>R820_PROSPECTIVE_VALIDATION_BUDGET.requests_soft_cap ||
          delta.rows_read+pendingReads+readReserve>R820_PROSPECTIVE_VALIDATION_BUDGET.rows_read ||
          delta.rows_written+pendingWrites+writes>R820_PROSPECTIVE_VALIDATION_BUDGET.rows_written) {
        throw new Error('PROSPECTIVE_BUDGET_ADMISSION_DEFERRED');
      }
      pendingRequests++;pendingReads+=readReserve;pendingWrites+=writes;
      try {return await statement[method](...args);}
      finally {pendingRequests--;pendingReads-=readReserve;pendingWrites-=writes;}
    }]))
  });
  return {prepare(sql){return wrap(db.prepare(sql),sql);},usageSnapshot:()=>db.usageSnapshot()};
}

export async function claimProspectiveQueueTurn(db, nowTs) {
  const key='R8_20_OUTCOME_QUEUE_TURN_V1';
  const state=await db.prepare(`SELECT status FROM tz101_entry_area_calibration_state WHERE state_key=?1 LIMIT 1`).bind(key).first();
  const turn=state?.status==='ENTRY'?'ENTRY':'EARLY';
  await db.prepare(`INSERT INTO tz101_entry_area_calibration_state
    (state_key,status,closed_samples,train_samples,holdout_samples,validated_out_of_sample,live_promotion_allowed,automatic_rule_promotion,updated_ts)
    VALUES(?1,?2,0,0,0,0,0,0,?3) ON CONFLICT(state_key) DO UPDATE SET status=excluded.status,updated_ts=excluded.updated_ts`)
    .bind(key,turn==='EARLY'?'ENTRY':'EARLY',Number(nowTs)).run();
  return turn;
}

export async function runR820ProspectiveValidationSidecar(db, { current_scan_ts, source_run_id = null, now_ts = Date.now() } = {}) {
  const common = base('STARTED', { source_run_id: text(source_run_id) || null });
  if (!db?.prepare) return base('SOURCE_UNSUPPORTED', { source_run_id: common.source_run_id });
  const before = typeof db.usageSnapshot === 'function' ? db.usageSnapshot() : null;
  if (!before) return base('USAGE_ACCOUNTING_REQUIRED',{source_run_id:common.source_run_id});
  db=prospectiveBudgetGuard(db,before);
  try {
    const activation = await ensureActivation(db, now_ts);
    if (activation.status !== 'CLOSED') return base('MIGRATION_REQUIRED_OR_ACTIVATION_FAILED', { source_run_id: common.source_run_id, activation });

    // Durable alternation: hourly maintenance can be delayed by admission and
    // is not the trading cadence. Timestamp parity could starve an entire queue.
    // Capture is still attempted each admitted invocation. Caps are unchanged.
    const earlyTurn=(await claimProspectiveQueueTurn(db,now_ts))==='EARLY';
    const early = earlyTurn?await closeOneEarlyDiscoveryOutcome(db, { current_scan_ts, now_ts }):{status:'DEFERRED_FAIR_QUEUE_ROTATION',closed:0};
    let capture = { status: activation.created ? 'ACTIVATED_NO_RETROSPECTIVE_BACKFILL' : 'NOT_RUN', captured: 0 };
    let entryOutcome = { status: activation.created ? 'ACTIVATED_NO_RETROSPECTIVE_BACKFILL' : 'NOT_RUN', closed: 0 };
    if (!activation.created) {
      capture = await captureOneEntryAreaSample(db, { activation_ts: activation.activation_ts, now_ts });
      entryOutcome = earlyTurn?{status:'DEFERRED_FAIR_QUEUE_ROTATION',closed:0}:await closeOneEntryAreaOutcome(db, { current_scan_ts, activation_ts: activation.activation_ts, now_ts });
    }
    // Keep a factual outcome even when its bounded pages leave no room for
    // the separate readiness read; this never promotes it to validated.
    const beforeReadiness=usageDelta(before,db.usageSnapshot());
    const readiness = beforeReadiness && beforeReadiness.requests+2<=R820_PROSPECTIVE_VALIDATION_BUDGET.requests_soft_cap
      ? await loadProspectiveReadinessSnapshot(db, { activation_ts: activation.activation_ts, now_ts })
      : base('READINESS_DEFERRED_REQUEST_ENVELOPE',{data_ready_for_separate_oos_validation:false,validated_out_of_sample:false});
    const after = typeof db.usageSnapshot === 'function' ? db.usageSnapshot() : null;
    const delta = usageDelta(before, after);
    if (delta && (delta.rows_read > R820_PROSPECTIVE_VALIDATION_BUDGET.rows_read || delta.rows_written > R820_PROSPECTIVE_VALIDATION_BUDGET.rows_written || delta.requests > R820_PROSPECTIVE_VALIDATION_BUDGET.requests_soft_cap || delta.unknown_ops > 0)) {
      return base('BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED', { source_run_id: common.source_run_id, activation, early, entry_sample: capture, entry_outcome: entryOutcome, readiness, usage_delta: delta });
    }
    return base('CLOSED', {
      source_run_id: common.source_run_id,
      activation,
      early_outcome: early,
      entry_sample: capture,
      entry_outcome: entryOutcome,
      readiness,
      usage_delta: delta,
      prospective_only: true,
      retrospective_backfill: false,
    });
  } catch (error) {
    const msg = String(error?.message || error);
    const migration = /no such table|no such column/i.test(msg);
    const after = typeof db.usageSnapshot === 'function' ? db.usageSnapshot() : null;
    return base(msg==='PROSPECTIVE_BUDGET_ADMISSION_DEFERRED'?'DEFERRED_BUDGET_ADMISSION':migration ? 'MIGRATION_REQUIRED' : 'ERROR_FAIL_CLOSED', { source_run_id: common.source_run_id, error: msg, usage_delta: usageDelta(before, after) });
  }
}

export default {
  R820_PROSPECTIVE_VALIDATION_VERSION,
  R820_PROSPECTIVE_VALIDATION_BUDGET,
  runR820ProspectiveValidationSidecar,
  closeOneEarlyDiscoveryOutcome,
  captureOneEntryAreaSample,
  closeOneEntryAreaOutcome,
  loadProspectiveReadinessSnapshot,
  classifyDeliveryCohort,
};

export { loadFactualPath as loadProspectiveFactualPathForTest };
