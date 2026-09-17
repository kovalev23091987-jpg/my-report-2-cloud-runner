/*
 * My Report 2 — Stage 3.8 exact-source runtime integration.
 *
 * This module reuses the existing Stage-0 scan, discovery prefilter and bounded
 * Deep Check. It never starts an independent scanner or emits a trade action.
 */

import {
  ENGINE_VERSION,
  MODE,
  STATES,
  TERMINAL_STATES,
  DEFAULT_LIMITS,
  createWatch,
  advanceWatch,
  openingEvent,
  completeRecheck,
  recoverAfterRestart,
  canReenter,
  planRechecks,
  observability,
  safetyEnvelope,
} from "./fast-move-watch-engine.mjs";

export const FAST_MOVE_WATCH_VERSION = "3.8.1-fast-move-watch-hardening-shadow";
export const FAST_MOVE_WATCH_STATUS = "ACTIVE_SHADOW_BOUNDED_NO_EXECUTION";

const MAX_DISCOVERY_MUTATIONS_PER_CYCLE = 1;
const MAX_ACTIVE_ROWS_LOADED = 64;
const MAX_RECENT_TERMINAL_ROWS_LOADED = 48;
const MAX_TARGETED_PRIOR_LOOKUPS_PER_CYCLE = 4;
const EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const EVENT_CLEANUP_BATCH = 100;
const MAX_FINALIZE_WRITES_RESERVED = 4;

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function discoverySignalFlags(row) {
  const flags = Array.isArray(row?.anomaly_flags)
    ? row.anomaly_flags.map(text).filter(Boolean)
    : [];
  const windows = ["5m", "15m", "1h", "4h"];
  const squeeze = windows.some(
    (window) =>
      flags.includes(`${window}:price_change_pct`) &&
      flags.includes(`${window}:oi_change_pct`),
  );
  const priceWindows = windows.filter((window) =>
    flags.includes(`${window}:price_change_pct`),
  );
  return {
    flags,
    signals: {
      anomaly_confirmed: flags.length >= 2,
      squeeze_confirmed: squeeze,
      momentum_confirmed: priceWindows.length >= 2,
      liquidation_magnet_context_confirmed: false,
      exhaustion_confirmed: false,
      edge_spent_confirmed: false,
    },
  };
}

function exactScanRow(scan, contract) {
  const rows = Array.isArray(scan?.contracts) ? scan.contracts : [];
  return rows.find((row) => text(row?.contract_code) === contract) || null;
}

export function buildFastMoveDiscoveryObservation({ scan, discovery_row, now } = {}) {
  const contract = text(discovery_row?.contract);
  const row = exactScanRow(scan, contract);
  const scanTs = finite(scan?.timestamp);
  const flags = discoverySignalFlags(discovery_row);
  const exactIdentity =
    Boolean(row) &&
    text(row?.contract_code) === contract &&
    row?.symbol_fingerprint?.resolution_status === "RESOLVED_HTX_EXACT";
  const scopeClosed =
    row?.instrument_scope?.classification === "CRYPTO_CONFIRMED";
  const current =
    row?.data_status === "CLOSED" &&
    row?.freshness?.stale === false &&
    finite(row?.freshness?.market_age_sec) !== null &&
    row.freshness.market_age_sec <= 300;
  const historyClosed = row?.quality?.history_available === true;
  const coverageClosed =
    current &&
    historyClosed &&
    scopeClosed &&
    scan?.health?.contracts === true &&
    scan?.health?.market === true &&
    scan?.health?.oi === true &&
    scan?.health?.funding === true;

  return {
    contract,
    event_id: `stage0:${scanTs ?? "missing"}:${contract}`,
    source_ts: scanTs,
    max_age_ms: 6 * 60 * 1000,
    freshness_status: current ? "CURRENT" : "NOT_CLOSED",
    coverage_pct: coverageClosed ? 100 : null,
    coverage_status: coverageClosed ? "CLOSED" : "NOT_CLOSED",
    data_quality_status: coverageClosed ? "CLOSED" : "NOT_CLOSED",
    canonical_identity_verified: exactIdentity && scopeClosed,
    external_alias_used: false,
    external_alias_verified: false,
    evidence_ids: [
      `htx-market:${scanTs ?? "missing"}:${contract}`,
      `htx-oi:${scanTs ?? "missing"}:${contract}`,
      `htx-funding:${scanTs ?? "missing"}:${contract}`,
      `stage0-history:${scanTs ?? "missing"}:${contract}`,
    ],
    independence_groups: [
      "HTX_MARKET_BATCH",
      "HTX_OPEN_INTEREST_BATCH",
      "HTX_FUNDING_BATCH",
      "HTX_PERSISTED_STAGE0_HISTORY",
    ],
    signals: flags.signals,
    discovery_rank: finite(discovery_row?.priority_rank),
    discovery_flags: flags.flags,
    liquidation: {
      projected: { status: "UNKNOWN", providers: [], asset_identity_verified: false },
      realized: { status: "UNKNOWN", asset_identity_verified: false },
    },
    observed_at: finite(now),
  };
}

function htxRealizedClosed(deep, contract) {
  const tape = deep?.evidence?.htx_liquidation_tape;
  return (
    text(tape?.contract) === contract &&
    tape?.factual_only === true &&
    tape?.coverage?.htx_factual_long_liquidations === "closed" &&
    tape?.coverage?.htx_factual_short_liquidations === "closed"
  );
}

function projectedClusterLifecycle(liquidation) {
  const clusters = Array.isArray(liquidation?.projected_clusters)
    ? liquidation.projected_clusters
    : [];
  const order = ["SWEPT", "TOUCHED", "APPROACHING", "ACTIVE"];
  return order.find((state) => clusters.some((row) => row?.lifecycle === state)) || "UNKNOWN";
}

export function buildFastMoveDeepObservation({ deep, discovery_row, now } = {}) {
  const contract = text(deep?.contract);
  const signalFlags = discoverySignalFlags(discovery_row);
  const sufficient = deep?.data_sufficiency?.classification === "SUFFICIENT";
  const complete = deep?.execution?.complete === true;
  const sourceTs = finite(deep?.timestamp);
  const fulfilled = finite(deep?.execution?.fulfilled_components) ?? 0;
  const liquidation = deep?.liquidation_intelligence_shadow || {};
  const providerIdentityClosed =
    liquidation?.asset_identity_verified === true &&
    liquidation?.alias_verified === true &&
    liquidation?.projected_freshness === "CURRENT";
  const projectedLifecycle = projectedClusterLifecycle(liquidation);
  const realizedClosed = htxRealizedClosed(deep, contract);
  const projectedUsable =
    providerIdentityClosed &&
    liquidation?.projected_map_status === "CLOSED";

  return {
    contract,
    event_id: `deep-check:${sourceTs ?? finite(now) ?? "missing"}:${contract}`,
    source_ts: sourceTs,
    max_age_ms: 15 * 60 * 1000,
    freshness_status: sourceTs !== null ? "CURRENT" : "NOT_CLOSED",
    coverage_pct: Math.max(0, Math.min(100, fulfilled * 25)),
    coverage_status: sufficient && complete ? "CLOSED" : "NOT_CLOSED",
    data_quality_status: sufficient && complete ? "GREEN" : "NOT_CLOSED",
    canonical_identity_verified: Boolean(contract) && text(deep?.contract) === contract,
    // Unverified external liquidation evidence is retained in its own lane but
    // is not consumed by this lifecycle observation.
    external_alias_used: projectedUsable,
    external_alias_verified:
      !liquidation?.provider_symbol || liquidation?.alias_verified === true,
    evidence_ids: [
      deep?.shadow_decision?.shadow_id,
      deep?.full_evidence_shadow?.full_evidence_id,
      liquidation?.observation_id,
      `deep-check:${sourceTs ?? "missing"}:${contract}`,
    ].map(text).filter(Boolean),
    independence_groups: [
      "HTX_LIVE_COMPONENTS",
      "HTX_PERSISTED_STAGE0_HISTORY",
      ...(Array.isArray(deep?.full_evidence_shadow?.evidence)
        ? ["PUBLIC_EVIDENCE_ADAPTERS"]
        : []),
    ],
    signals: {
      ...signalFlags.signals,
      liquidation_magnet_context_confirmed:
        projectedUsable &&
        new Set(["ACTIVE", "APPROACHING", "TOUCHED"]).has(projectedLifecycle),
    },
    discovery_rank: finite(discovery_row?.priority_rank),
    discovery_flags: signalFlags.flags,
    liquidation: {
      projected: {
        status: projectedUsable ? "CLOSED" : text(liquidation?.projected_map_status) || "NOT_CLOSED",
        providers: liquidation?.provider ? [text(liquidation.provider)] : [],
        asset_identity_verified: providerIdentityClosed,
        cross_source_consensus: false,
        cluster_state: projectedLifecycle,
      },
      realized: {
        status: realizedClosed ? "CLOSED" : text(liquidation?.realized_status) || "NOT_CLOSED",
        asset_identity_verified: realizedClosed,
        cluster_state: "UNKNOWN",
      },
    },
    observed_at: finite(now),
  };
}

function rowToWatch(row) {
  return {
    engine_version: text(row?.engine_version) || ENGINE_VERSION,
    contract: text(row?.contract),
    generation: finite(row?.generation) ?? 1,
    state: text(row?.lifecycle_state) || STATES.STALE,
    state_before_stale: row?.state_before_stale || null,
    state_entered_ts: finite(row?.state_entered_ts),
    created_ts: finite(row?.created_ts),
    updated_ts: finite(row?.updated_ts),
    last_recheck_ts: finite(row?.last_recheck_ts),
    next_recheck_ts: finite(row?.next_recheck_ts),
    expiry_ts: finite(row?.expiry_ts),
    last_evidence_ts: finite(row?.last_evidence_ts),
    last_event_id: text(row?.last_event_id),
    last_reason_code: text(row?.last_reason_code),
    cadence_class: text(row?.cadence_class) || "WATCH",
    priority_class: text(row?.priority_class) || "WATCH",
    attempt_count: finite(row?.attempt_count) ?? 0,
    deferral_count: finite(row?.deferral_count) ?? 0,
    missed_due_count: finite(row?.missed_due_count) ?? 0,
    counters: parseJson(row?.counters_json, {}),
    cluster_lifecycle: text(row?.cluster_lifecycle) || "UNKNOWN",
    cluster_lifecycle_source: text(row?.cluster_lifecycle_source) || "NONE",
    discovery_rank: finite(row?.discovery_rank),
    discovery_flags: parseJson(row?.discovery_flags_json, []),
    closure_reason: row?.closure_reason || null,
    lease_owner: row?.queue_lease_owner || null,
    lease_expires_ts: finite(row?.queue_lease_expires_ts),
    requires_deep_check: true,
    external_call_estimate: 0,
    d1_write_estimate: 3,
    safety: safetyEnvelope(),
  };
}

async function loadWatches(env) {
  if (!env?.DATA_DB) {
    return { status: "SOURCE_UNSUPPORTED", rows: [], error: "DATA_DB_NOT_CONFIGURED" };
  }
  try {
    const selectBase = `
      SELECT s.*,
        q.lease_owner AS queue_lease_owner,
        q.lease_expires_ts AS queue_lease_expires_ts
      FROM fast_move_watch_state s
      LEFT JOIN fast_move_recheck_queue q
        ON q.contract=s.contract AND q.generation=s.generation
    `;
    const [activeResult, terminalResult] = await env.DATA_DB.batch([
      env.DATA_DB.prepare(`${selectBase}
        WHERE s.lifecycle_state NOT IN ('EXPIRED','CLOSED')
        ORDER BY s.updated_ts DESC
        LIMIT ?1
      `).bind(MAX_ACTIVE_ROWS_LOADED),
      env.DATA_DB.prepare(`${selectBase}
        WHERE s.lifecycle_state IN ('EXPIRED','CLOSED')
        ORDER BY s.updated_ts DESC
        LIMIT ?1
      `).bind(MAX_RECENT_TERMINAL_ROWS_LOADED),
    ]);
    const activeRows = Array.isArray(activeResult?.results) ? activeResult.results : [];
    const terminalRows = Array.isArray(terminalResult?.results) ? terminalResult.results : [];
    return {
      status: activeRows.length > DEFAULT_LIMITS.max_active_watches ? "CAPACITY_OVERFLOW_FAIL_CLOSED" : "CLOSED",
      rows: [...activeRows, ...terminalRows].map(rowToWatch),
      active_rows: activeRows.length,
      error: activeRows.length > DEFAULT_LIMITS.max_active_watches
        ? `ACTIVE_WATCH_CAP_EXCEEDED:${activeRows.length}>${DEFAULT_LIMITS.max_active_watches}`
        : null,
    };
  } catch (error) {
    const message = text(error?.message || error).slice(0, 600);
    return {
      status: /no such table/i.test(message) ? "MIGRATION_REQUIRED" : "PARTIAL",
      rows: [],
      error: message,
    };
  }
}

async function loadWatchByContract(env, contract) {
  const result = await env.DATA_DB.prepare(`
    SELECT s.*,
      q.lease_owner AS queue_lease_owner,
      q.lease_expires_ts AS queue_lease_expires_ts
    FROM fast_move_watch_state s
    LEFT JOIN fast_move_recheck_queue q
      ON q.contract=s.contract AND q.generation=s.generation
    WHERE s.contract=?1
    LIMIT 1
  `).bind(contract).first();
  return result ? rowToWatch(result) : null;
}

function stateValues(watch, observation) {
  const freshness = watch.state === STATES.STALE
    ? "NOT_CLOSED"
    : observation?.freshness_status || "CURRENT";
  return [
    watch.contract, watch.generation, ENGINE_VERSION, MODE, watch.state,
    watch.state_before_stale ?? null, watch.state_entered_ts, watch.created_ts,
    watch.updated_ts, watch.last_recheck_ts ?? null, watch.next_recheck_ts ?? null,
    watch.expiry_ts, watch.last_evidence_ts ?? null, watch.last_event_id,
    watch.last_reason_code, watch.cadence_class, watch.priority_class, freshness,
    watch.attempt_count || 0, watch.deferral_count || 0, watch.missed_due_count || 0,
    JSON.stringify(watch.counters || {}), watch.cluster_lifecycle || "UNKNOWN",
    watch.cluster_lifecycle_source || "NONE", observation?.discovery_rank ?? watch.discovery_rank ?? null,
    JSON.stringify(observation?.discovery_flags || watch.discovery_flags || []),
    watch.closure_reason ?? null,
  ];
}

function stateStatement(
  env,
  watch,
  observation,
  { expected_previous = null, finalize_lease = null } = {},
) {
  const values = stateValues(watch, observation);
  const expectedGeneration = finite(expected_previous?.generation);
  const expectedUpdatedTs = finite(expected_previous?.updated_ts);
  const expectedLastEventId = text(expected_previous?.last_event_id) || null;
  const leaseOwner = text(finalize_lease?.owner) || null;
  const requireLease = leaseOwner ? 1 : 0;
  const leaseNow = finite(finalize_lease?.now) ?? 0;
  return env.DATA_DB.prepare(`
    INSERT INTO fast_move_watch_state (
      contract,generation,engine_version,mode,lifecycle_state,state_before_stale,
      state_entered_ts,created_ts,updated_ts,last_recheck_ts,next_recheck_ts,expiry_ts,
      last_evidence_ts,last_event_id,last_reason_code,cadence_class,priority_class,
      freshness_state,attempt_count,deferral_count,missed_due_count,counters_json,
      cluster_lifecycle,cluster_lifecycle_source,discovery_rank,discovery_flags_json,
      closure_reason,lease_owner,lease_expires_ts
    )
    SELECT
      ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,
      ?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,NULL,NULL
    WHERE (
      (
        ?29 IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM fast_move_watch_state current
          WHERE current.contract=?1
        )
        AND (
          SELECT COUNT(*) FROM fast_move_watch_state
          WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED')
        ) < ?28
      )
      OR EXISTS (
        SELECT 1 FROM fast_move_watch_state current
        WHERE current.contract=?1
          AND current.generation=?2
          AND current.generation=?29
          AND current.updated_ts=?30
          AND current.last_event_id=?31
          AND current.lifecycle_state NOT IN ('EXPIRED','CLOSED')
      )
      OR EXISTS (
        SELECT 1 FROM fast_move_watch_state current
        WHERE current.contract=?1
          AND current.generation=?29
          AND current.updated_ts=?30
          AND current.last_event_id=?31
          AND current.lifecycle_state IN ('EXPIRED','CLOSED')
          AND ?2=current.generation+1
          AND (
            SELECT COUNT(*) FROM fast_move_watch_state
            WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED')
          ) < ?28
      )
    )
    AND (
      ?33=0 OR EXISTS (
        SELECT 1 FROM fast_move_recheck_queue q
        WHERE q.contract=?1 AND q.generation=?2
          AND q.status='LEASED' AND q.lease_owner=?32
          AND q.lease_expires_ts>?34
      )
    )
    ON CONFLICT(contract) DO UPDATE SET
      generation=excluded.generation,engine_version=excluded.engine_version,mode=excluded.mode,
      lifecycle_state=excluded.lifecycle_state,state_before_stale=excluded.state_before_stale,
      state_entered_ts=excluded.state_entered_ts,created_ts=excluded.created_ts,
      updated_ts=excluded.updated_ts,last_recheck_ts=excluded.last_recheck_ts,
      next_recheck_ts=excluded.next_recheck_ts,expiry_ts=excluded.expiry_ts,
      last_evidence_ts=excluded.last_evidence_ts,last_event_id=excluded.last_event_id,
      last_reason_code=excluded.last_reason_code,cadence_class=excluded.cadence_class,
      priority_class=excluded.priority_class,freshness_state=excluded.freshness_state,
      attempt_count=excluded.attempt_count,deferral_count=excluded.deferral_count,
      missed_due_count=excluded.missed_due_count,counters_json=excluded.counters_json,
      cluster_lifecycle=excluded.cluster_lifecycle,
      cluster_lifecycle_source=excluded.cluster_lifecycle_source,
      discovery_rank=excluded.discovery_rank,discovery_flags_json=excluded.discovery_flags_json,
      closure_reason=excluded.closure_reason,lease_owner=NULL,lease_expires_ts=NULL
    WHERE (
      (
        fast_move_watch_state.generation=excluded.generation
        AND fast_move_watch_state.generation=?29
        AND fast_move_watch_state.updated_ts=?30
        AND fast_move_watch_state.last_event_id=?31
        AND fast_move_watch_state.lifecycle_state NOT IN ('EXPIRED','CLOSED')
      ) OR (
        fast_move_watch_state.lifecycle_state IN ('EXPIRED','CLOSED')
        AND fast_move_watch_state.generation=?29
        AND fast_move_watch_state.updated_ts=?30
        AND fast_move_watch_state.last_event_id=?31
        AND excluded.generation=fast_move_watch_state.generation+1
        AND (
          SELECT COUNT(*) FROM fast_move_watch_state
          WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED')
        ) < ?28
      )
    )
    AND (
      ?33=0 OR EXISTS (
        SELECT 1 FROM fast_move_recheck_queue q
        WHERE q.contract=excluded.contract AND q.generation=excluded.generation
          AND q.status='LEASED' AND q.lease_owner=?32
          AND q.lease_expires_ts>?34
      )
    )
  `).bind(
    ...values,
    DEFAULT_LIMITS.max_active_watches,
    expectedGeneration,
    expectedUpdatedTs,
    expectedLastEventId,
    leaseOwner,
    requireLease,
    leaseNow,
  );
}

function queueStatement(
  env,
  watch,
  now,
  { preserve_active_lease = true, finalize_lease = null } = {},
) {
  const terminal = TERMINAL_STATES.has(watch.state);
  const status = terminal ? (watch.state === STATES.EXPIRED ? "EXPIRED" : "CANCELLED") : "PENDING";
  const due = terminal ? Math.max(1, finite(watch.updated_ts) ?? now) : Math.max(1, finite(watch.next_recheck_ts) ?? now);
  const leaseOwner = text(finalize_lease?.owner) || null;
  const requireLease = leaseOwner ? 1 : 0;
  const leaseNow = finite(finalize_lease?.now) ?? now;
  return env.DATA_DB.prepare(`
    INSERT INTO fast_move_recheck_queue (
      contract,generation,due_ts,priority_class,attempt_count,deferral_count,
      external_call_estimate,d1_write_estimate,requires_deep_check,status,
      lease_owner,lease_expires_ts,dedupe_token,created_ts,updated_ts
    )
    SELECT ?1,?2,?3,?4,?5,?6,0,3,1,?7,NULL,NULL,?8,?9,?10
    WHERE EXISTS (
      SELECT 1 FROM fast_move_watch_state s
      WHERE s.contract=?1 AND s.generation=?2 AND s.last_event_id=?11
    )
    ON CONFLICT(contract,generation) DO UPDATE SET
      due_ts=excluded.due_ts,priority_class=excluded.priority_class,
      attempt_count=excluded.attempt_count,deferral_count=excluded.deferral_count,
      external_call_estimate=0,d1_write_estimate=3,requires_deep_check=1,
      status=CASE
        WHEN ?12=1 AND excluded.status='PENDING'
          AND fast_move_recheck_queue.status='LEASED'
          AND fast_move_recheck_queue.lease_expires_ts>?15
        THEN fast_move_recheck_queue.status ELSE excluded.status END,
      lease_owner=CASE
        WHEN ?12=1 AND excluded.status='PENDING'
          AND fast_move_recheck_queue.status='LEASED'
          AND fast_move_recheck_queue.lease_expires_ts>?15
        THEN fast_move_recheck_queue.lease_owner ELSE NULL END,
      lease_expires_ts=CASE
        WHEN ?12=1 AND excluded.status='PENDING'
          AND fast_move_recheck_queue.status='LEASED'
          AND fast_move_recheck_queue.lease_expires_ts>?15
        THEN fast_move_recheck_queue.lease_expires_ts ELSE NULL END,
      updated_ts=excluded.updated_ts
    WHERE EXISTS (
      SELECT 1 FROM fast_move_watch_state s
      WHERE s.contract=excluded.contract AND s.generation=excluded.generation
        AND s.last_event_id=?11
    ) AND (
      ?14=0 OR (
        fast_move_recheck_queue.status='LEASED'
        AND fast_move_recheck_queue.lease_owner=?13
        AND fast_move_recheck_queue.lease_expires_ts>?15
      )
    )
  `).bind(
    watch.contract, watch.generation, due, watch.priority_class,
    watch.attempt_count || 0, watch.deferral_count || 0, status,
    `${watch.contract}:${watch.generation}`, watch.created_ts, now,
    watch.last_event_id, preserve_active_lease ? 1 : 0,
    leaseOwner, requireLease, leaseNow,
  );
}

function eventStatement(env, event, stateToken) {
  if (!event) return null;
  return env.DATA_DB.prepare(`
    INSERT OR IGNORE INTO fast_move_watch_event (
      event_id,contract,generation,engine_version,observed_ts,source_evidence_ts,
      from_state,to_state,reason_code,evidence_ids_json,evidence_status,
      projected_liquidation_status,realized_liquidation_status
    )
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13
    WHERE EXISTS (
      SELECT 1 FROM fast_move_watch_state s
      WHERE s.contract=?2 AND s.generation=?3 AND s.last_event_id=?14
    )
  `).bind(
    event.event_id, event.contract, event.generation, ENGINE_VERSION,
    event.observed_ts, event.source_evidence_ts ?? null, event.from_state,
    event.to_state, event.reason_code, JSON.stringify(event.evidence_ids || []),
    event.evidence_status || "UNKNOWN", event.projected_liquidation_status || "UNKNOWN",
    event.realized_liquidation_status || "UNKNOWN", stateToken,
  );
}

function generationOpenStatement(env, watch, event) {
  if (!event) return null;
  return env.DATA_DB.prepare(`
    INSERT OR IGNORE INTO fast_move_watch_generation (
      contract,generation,engine_version,opened_ts,opening_event_id,opening_reason,
      closed_ts,final_state,closure_reason,shadow_only,live_signal,trading_execution
    )
    SELECT ?1,?2,?3,?4,?5,?6,NULL,NULL,NULL,1,0,0
    WHERE EXISTS (
      SELECT 1 FROM fast_move_watch_state s
      WHERE s.contract=?1 AND s.generation=?2 AND s.last_event_id=?7
    )
  `).bind(
    watch.contract, watch.generation, ENGINE_VERSION, watch.created_ts,
    event.event_id, event.reason_code, watch.last_event_id,
  );
}

function generationCloseStatement(env, watch) {
  if (!TERMINAL_STATES.has(watch.state)) return null;
  return env.DATA_DB.prepare(`
    UPDATE fast_move_watch_generation
    SET closed_ts=COALESCE(closed_ts,?3),
      final_state=COALESCE(final_state,?4),
      closure_reason=COALESCE(closure_reason,?5)
    WHERE contract=?1 AND generation=?2
      AND EXISTS (
        SELECT 1 FROM fast_move_watch_state s
        WHERE s.contract=?1 AND s.generation=?2
          AND s.lifecycle_state IN ('EXPIRED','CLOSED')
          AND s.last_event_id=?6
      )
  `).bind(
    watch.contract, watch.generation, watch.updated_ts,
    watch.state, watch.closure_reason || watch.last_reason_code || "TERMINAL",
    watch.last_event_id,
  );
}

async function persistBundle(
  env,
  watch,
  observation,
  event,
  now,
  {
    generation_opened = false,
    expected_previous = null,
    preserve_active_lease = true,
    finalize_lease = null,
  } = {},
) {
  const statements = [
    stateStatement(env, watch, observation, { expected_previous, finalize_lease }),
    queueStatement(env, watch, now, { preserve_active_lease, finalize_lease }),
  ];
  const eventSql = eventStatement(env, event, watch.last_event_id);
  if (eventSql) statements.push(eventSql);
  if (generation_opened) {
    const generationSql = generationOpenStatement(env, watch, event);
    if (generationSql) statements.push(generationSql);
  }
  const closeSql = generationCloseStatement(env, watch);
  if (closeSql) statements.push(closeSql);
  if (statements.length > DEFAULT_LIMITS.max_d1_writes_per_cycle) {
    throw new Error(`FAST_MOVE_PERSIST_BUNDLE_UNBOUNDED:${statements.length}`);
  }
  if (finalize_lease && statements.length > MAX_FINALIZE_WRITES_RESERVED) {
    throw new Error(
      `FAST_MOVE_FINALIZE_WRITE_RESERVE_EXCEEDED:${statements.length}>${MAX_FINALIZE_WRITES_RESERVED}`,
    );
  }
  const results = await env.DATA_DB.batch(statements);
  const stateChanges = Number(results?.[0]?.meta?.changes ?? 0);
  return {
    status: stateChanges === 1 ? "CLOSED" : "CAPACITY_REJECTED_OR_STALE_GENERATION",
    admitted: stateChanges === 1,
    statements: statements.length,
    changes: results.map((row) => Number(row?.meta?.changes ?? 0)),
  };
}

async function recoveryMaintenance(env, rows, now) {
  const needsExpiry = rows.some((watch) => !TERMINAL_STATES.has(watch.state) && now >= watch.expiry_ts);
  const needsLeaseRecovery = rows.some((watch) => watch.lease_owner && Number(watch.lease_expires_ts || 0) <= now);
  if (!needsExpiry && !needsLeaseRecovery) return null;

  const results = await env.DATA_DB.batch([
    env.DATA_DB.prepare(`
      INSERT OR IGNORE INTO fast_move_watch_event (
        event_id,contract,generation,engine_version,observed_ts,source_evidence_ts,
        from_state,to_state,reason_code,evidence_ids_json,evidence_status,
        projected_liquidation_status,realized_liquidation_status
      )
      SELECT
        contract || ':' || generation || ':' || ?1 || ':EXPIRED_RECOVERY',
        contract,generation,?2,?1,last_evidence_ts,lifecycle_state,'EXPIRED',
        'EXPIRED_DURING_RESTART','[]','NOT_CLOSED','UNKNOWN','UNKNOWN'
      FROM fast_move_watch_state
      WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED') AND expiry_ts<=?1
    `).bind(now, ENGINE_VERSION),
    env.DATA_DB.prepare(`
      UPDATE fast_move_watch_state
      SET lifecycle_state='EXPIRED',updated_ts=?1,next_recheck_ts=NULL,
        closure_reason='EXPIRED_DURING_RESTART',last_reason_code='EXPIRED_DURING_RESTART'
      WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED') AND expiry_ts<=?1
    `).bind(now),
    env.DATA_DB.prepare(`
      UPDATE fast_move_recheck_queue
      SET status='EXPIRED',lease_owner=NULL,lease_expires_ts=NULL,updated_ts=?1
      WHERE status IN ('PENDING','LEASED') AND EXISTS (
        SELECT 1 FROM fast_move_watch_state s
        WHERE s.contract=fast_move_recheck_queue.contract
          AND s.generation=fast_move_recheck_queue.generation
          AND s.lifecycle_state='EXPIRED'
      )
    `).bind(now),
    env.DATA_DB.prepare(`
      UPDATE fast_move_recheck_queue
      SET status='PENDING',lease_owner=NULL,lease_expires_ts=NULL,
        due_ts=MIN(due_ts,?1),updated_ts=?1
      WHERE status='LEASED' AND lease_expires_ts<=?1 AND EXISTS (
        SELECT 1 FROM fast_move_watch_state s
        WHERE s.contract=fast_move_recheck_queue.contract
          AND s.generation=fast_move_recheck_queue.generation
          AND s.lifecycle_state NOT IN ('EXPIRED','CLOSED')
      )
    `).bind(now),
    env.DATA_DB.prepare(`
      UPDATE fast_move_watch_generation
      SET closed_ts=COALESCE(closed_ts,?1),final_state=COALESCE(final_state,'EXPIRED'),
        closure_reason=COALESCE(closure_reason,'EXPIRED_DURING_RESTART')
      WHERE closed_ts IS NULL AND EXISTS (
        SELECT 1 FROM fast_move_watch_state s
        WHERE s.contract=fast_move_watch_generation.contract
          AND s.generation=fast_move_watch_generation.generation
          AND s.lifecycle_state='EXPIRED'
      )
    `).bind(now),
  ]);
  return {
    status: "CLOSED",
    statements: results.length,
    changes: results.map((row) => Number(row?.meta?.changes ?? 0)),
  };
}

async function persistDeferredCounters(env, deferred, now) {
  const rows = Array.isArray(deferred) ? deferred.slice(0, DEFAULT_LIMITS.max_active_watches) : [];
  if (!rows.length) return { statements: 0, changes: 0 };
  const clauses = [];
  const args = [];
  for (const watch of rows) {
    const base = args.length + 1;
    clauses.push(`(contract=?${base} AND generation=?${base + 1})`);
    args.push(watch.contract, watch.generation);
  }
  const nowParameter = args.length + 1;
  args.push(now);
  const result = await env.DATA_DB.prepare(`
    UPDATE fast_move_watch_state
    SET deferral_count=deferral_count+1,missed_due_count=missed_due_count+1
    WHERE lifecycle_state NOT IN ('EXPIRED','CLOSED')
      AND (${clauses.join(" OR ")})
      AND EXISTS (
        SELECT 1 FROM fast_move_recheck_queue q
        WHERE q.contract=fast_move_watch_state.contract
          AND q.generation=fast_move_watch_state.generation
          AND q.status='PENDING' AND q.due_ts<=?${nowParameter}
          AND (q.lease_expires_ts IS NULL OR q.lease_expires_ts<=?${nowParameter})
      )
  `).bind(...args).run();
  return { statements: 1, changes: Number(result?.meta?.changes ?? 0), observed_ts: now };
}

async function cleanupOldEvents(env, now) {
  const result = await env.DATA_DB.prepare(`
    DELETE FROM fast_move_watch_event
    WHERE event_id IN (
      SELECT event_id FROM fast_move_watch_event
      WHERE observed_ts<?1
      ORDER BY observed_ts ASC
      LIMIT ?2
    )
  `).bind(now - EVENT_RETENTION_MS, EVENT_CLEANUP_BATCH).run();
  return { statements: 1, changes: Number(result?.meta?.changes ?? 0) };
}

function mergeAdaptiveShortlist(discoveryPrefilter, scan, selected) {
  const original = Array.isArray(discoveryPrefilter?.shortlist)
    ? discoveryPrefilter.shortlist.map((row) => ({ ...row }))
    : [];
  const byContract = new Map(original.map((row) => [text(row?.contract), row]));
  const technical = new Set(
    (Array.isArray(scan?.contracts) ? scan.contracts : [])
      .filter((row) =>
        row?.data_status === "CLOSED" &&
        row?.freshness?.stale === false &&
        row?.quality?.history_available === true &&
        row?.symbol_fingerprint?.resolution_status === "RESOLVED_HTX_EXACT" &&
        row?.instrument_scope?.classification === "CRYPTO_CONFIRMED")
      .map((row) => text(row?.contract_code)),
  );
  const promoted = [];
  for (const watch of selected) {
    if (!technical.has(watch.contract)) continue;
    promoted.push({
      ...(byContract.get(watch.contract) || {
        contract: watch.contract,
        anomaly_flags_count: 0,
        anomaly_flags: [],
      }),
      priority_rank: promoted.length + 1,
      fast_move_watch_recheck: true,
      fast_move_watch_cadence: watch.cadence_class,
      scheduler_priority_is_probability: false,
    });
    byContract.delete(watch.contract);
  }
  const rest = original
    .filter((row) => byContract.has(text(row?.contract)))
    .map((row, index) => ({ ...row, priority_rank: promoted.length + index + 1 }));
  return {
    ...discoveryPrefilter,
    shortlist: [...promoted, ...rest],
    counts: {
      ...(discoveryPrefilter?.counts || {}),
      shortlist: promoted.length + rest.length,
      fast_move_watch_promoted: promoted.length,
    },
  };
}

async function claimSelected(env, selected, runId, now) {
  const claimed = [];
  for (const watch of selected.slice(0, 1)) {
    const result = await env.DATA_DB.prepare(`
      UPDATE fast_move_recheck_queue
      SET status='LEASED',lease_owner=?3,lease_expires_ts=?4,updated_ts=?5
      WHERE contract=?1 AND generation=?2
        AND status='PENDING' AND due_ts<=?5
        AND (lease_expires_ts IS NULL OR lease_expires_ts<=?5)
    `).bind(
      watch.contract, watch.generation, runId,
      now + DEFAULT_LIMITS.lease_ttl_ms, now,
    ).run();
    if (Number(result?.meta?.changes ?? 0) === 1) {
      claimed.push({
        ...watch,
        lease_owner: runId,
        lease_expires_ts: now + DEFAULT_LIMITS.lease_ttl_ms,
      });
    }
  }
  return claimed;
}

export async function prepareFastMoveWatchCycle({ env, scan, discovery_prefilter, run_id, now = Date.now() } = {}) {
  const safe = {
    version: FAST_MOVE_WATCH_VERSION,
    engine_version: ENGINE_VERSION,
    mode: MODE,
    status: "FAIL_CLOSED",
    adaptive_discovery_prefilter: discovery_prefilter,
    adaptive_cooldown_sec: 1800,
    selected_contracts: [],
    selected_leases: [],
    writes_used: 0,
    safety: safetyEnvelope(),
  };
  const loaded = await loadWatches(env);
  if (loaded.status !== "CLOSED") {
    return { ...safe, status: `${loaded.status}_FAIL_CLOSED`, error: loaded.error };
  }

  // Recovery that changes durable scheduler state must itself be durable. Run it
  // as an isolated bounded maintenance step before any new admission/recheck work.
  const maintenance = await recoveryMaintenance(env, loaded.rows, now);
  if (maintenance) {
    const maintenanceRecovered = recoverAfterRestart(loaded.rows, now, DEFAULT_LIMITS);
    const maintenancePlan = {
      selected: [], deferred: [], capacity_rejected: [],
      duplicate_suppressed: maintenanceRecovered.duplicate_suppressed,
      queue_depth: 0, starvation_indicator: false,
    };
    return {
      ...safe,
      status: "CLOSED",
      maintenance_only: true,
      maintenance,
      writes_used: maintenance.statements,
      discovery_mutations: [],
      plan: {
        queue_depth: 0,
        selected: [],
        deferred_count: 0,
        capacity_rejected_count: 0,
        budgets: { rechecks: 0, external_calls: 0, d1_writes: maintenance.statements, deep_checks: 0 },
        starvation_indicator: false,
      },
      observability: observability(maintenanceRecovered.watches, maintenancePlan, now),
      _watches: maintenanceRecovered.watches,
    };
  }

  const recovered = recoverAfterRestart(loaded.rows, now, DEFAULT_LIMITS);
  const watchMap = new Map(recovered.watches.map((watch) => [watch.contract, watch]));
  const rows = Array.isArray(discovery_prefilter?.shortlist) ? discovery_prefilter.shortlist : [];
  let writesUsed = 0;
  let mutations = 0;
  let targetedLookups = 0;
  const mutationResults = [];

  for (const row of rows) {
    if (mutations >= MAX_DISCOVERY_MUTATIONS_PER_CYCLE) break;
    const observation = buildFastMoveDiscoveryObservation({ scan, discovery_row: row, now });
    if (!observation.contract) continue;
    let prior = watchMap.get(observation.contract) || null;

    // State is one row per contract, but terminal rows are loaded only from a
    // bounded recent window. Resolve older terminal state before treating a
    // returning contract as generation 1 again.
    if (!prior && targetedLookups < MAX_TARGETED_PRIOR_LOOKUPS_PER_CYCLE) {
      try {
        targetedLookups += 1;
        prior = await loadWatchByContract(env, observation.contract);
        if (prior) watchMap.set(prior.contract, prior);
      } catch (error) {
        mutationResults.push({
          contract: observation.contract,
          state: null,
          persistence: "TARGETED_LOOKUP_FAIL_CLOSED",
          error: text(error?.message || error).slice(0, 300),
        });
        continue;
      }
    }

    const activeCount = [...watchMap.values()].filter((watch) => !TERMINAL_STATES.has(watch.state)).length;
    if (!prior && activeCount >= DEFAULT_LIMITS.max_active_watches) {
      mutationResults.push({
        contract: observation.contract,
        state: null,
        persistence: "CAPACITY_REJECTED_FAIL_CLOSED",
      });
      continue;
    }

    if (
      prior &&
      !TERMINAL_STATES.has(prior.state) &&
      Boolean(prior.lease_owner) &&
      Number(prior.lease_expires_ts || 0) > now
    ) {
      mutationResults.push({
        contract: observation.contract,
        state: prior.state,
        persistence: "ACTIVE_LEASE_PRESERVED",
      });
      continue;
    }

    try {
      let next = null;
      let event = null;
      let generationOpened = false;
      if (!prior) {
        next = createWatch(observation, now, DEFAULT_LIMITS);
        event = openingEvent(next, observation, now, null);
        generationOpened = true;
      } else if (TERMINAL_STATES.has(prior.state)) {
        const reentry = canReenter(prior, observation, now, DEFAULT_LIMITS);
        if (!reentry.allowed) continue;
        next = {
          ...createWatch(observation, now, DEFAULT_LIMITS),
          generation: reentry.generation,
          last_reason_code: "NEW_DISCOVERY_CONFIRMED",
        };
        event = openingEvent(next, observation, now, prior);
        generationOpened = true;
      } else {
        const advanced = advanceWatch(prior, observation, now, DEFAULT_LIMITS);
        if (advanced.idempotent) continue;
        next = advanced.watch;
        event = advanced.event;
        // A fresh discovery observation may change lifecycle state, but it must
        // not postpone a recheck that was already due before this cron tick.
        if (finite(prior.next_recheck_ts) !== null && prior.next_recheck_ts <= now) {
          next.next_recheck_ts = prior.next_recheck_ts;
        }
      }
      next = {
        ...next,
        discovery_rank: observation.discovery_rank,
        discovery_flags: observation.discovery_flags,
        requires_deep_check: true,
        external_call_estimate: 0,
        d1_write_estimate: 3,
      };
      const persisted = await persistBundle(
        env,
        next,
        observation,
        event,
        now,
        {
          generation_opened: generationOpened,
          expected_previous: prior,
          preserve_active_lease: true,
        },
      );
      writesUsed += persisted.statements;
      if (!persisted.admitted) {
        mutationResults.push({ contract: next.contract, state: next.state, persistence: persisted.status });
        continue;
      }
      mutations += 1;
      watchMap.set(next.contract, next);
      mutationResults.push({ contract: next.contract, state: next.state, persistence: persisted.status });
    } catch (error) {
      mutationResults.push({
        contract: observation.contract || null,
        state: null,
        persistence: "REJECTED_FAIL_CLOSED",
        error: text(error?.message || error).slice(0, 300),
      });
    }
  }

  const plan = planRechecks([...watchMap.values()], now, DEFAULT_LIMITS);
  const canClaim =
    plan.selected.length > 0 &&
    writesUsed + 1 + MAX_FINALIZE_WRITES_RESERVED <= DEFAULT_LIMITS.max_d1_writes_per_cycle;
  const claimed = canClaim
    ? await claimSelected(env, plan.selected, text(run_id) || `stage381-${now}`, now)
    : [];
  writesUsed += claimed.length;
  for (const watch of claimed) watchMap.set(watch.contract, watch);

  const claimedKeys = new Set(claimed.map((watch) => `${watch.contract}:${watch.generation}`));
  const deferredMap = new Map();
  for (const watch of [...plan.selected, ...plan.deferred]) {
    const key = `${watch.contract}:${watch.generation}`;
    if (!claimedKeys.has(key)) deferredMap.set(key, watch);
  }
  const actualDeferred = [...deferredMap.values()];

  const finalizeReserve = claimed.length ? MAX_FINALIZE_WRITES_RESERVED : 0;
  if (
    actualDeferred.length > 0 &&
    writesUsed + 1 + finalizeReserve <= DEFAULT_LIMITS.max_d1_writes_per_cycle
  ) {
    const debt = await persistDeferredCounters(env, actualDeferred, now);
    writesUsed += debt.statements;
    if (debt.changes > 0) {
      for (const watch of actualDeferred) {
        const current = watchMap.get(watch.contract);
        if (!current || current.generation !== watch.generation) continue;
        watchMap.set(watch.contract, {
          ...current,
          deferral_count: (current.deferral_count || 0) + 1,
          missed_due_count: (current.missed_due_count || 0) + 1,
        });
      }
    }
  }

  let cleanup = null;
  if (
    claimed.length === 0 &&
    mutations === 0 &&
    writesUsed + 1 <= DEFAULT_LIMITS.max_d1_writes_per_cycle
  ) {
    cleanup = await cleanupOldEvents(env, now);
    writesUsed += cleanup.statements;
  }

  const adaptive = mergeAdaptiveShortlist(discovery_prefilter, scan, claimed);
  const cadence = claimed[0]?.cadence_class || null;
  const adaptiveCooldown = cadence === "FAST" ? 300 : cadence === "ACTIVE" ? 900 : cadence === "WATCH" ? 3600 : 1800;
  const starvationIndicator = actualDeferred.some((watch) => {
    const current = watchMap.get(watch.contract) || watch;
    return (current.missed_due_count || 0) >= 3;
  });
  const actualPlan = {
    ...plan,
    selected: claimed,
    deferred: actualDeferred,
    starvation_indicator: starvationIndicator,
    budgets: {
      rechecks: claimed.length,
      external_calls: claimed.reduce((sum, watch) => sum + Math.max(0, Number(watch.external_call_estimate ?? 1)), 0),
      d1_writes: writesUsed,
      deep_checks: claimed.filter((watch) => watch.requires_deep_check === true).length,
    },
  };

  return {
    ...safe,
    status: "CLOSED",
    maintenance_only: false,
    adaptive_discovery_prefilter: adaptive,
    adaptive_cooldown_sec: adaptiveCooldown,
    selected_contracts: claimed.map((watch) => watch.contract),
    selected_leases: claimed.map((watch) => ({
      contract: watch.contract,
      generation: watch.generation,
      lease_owner: watch.lease_owner,
      lease_expires_ts: watch.lease_expires_ts,
    })),
    writes_used: writesUsed,
    discovery_mutations: mutationResults,
    targeted_prior_lookups: targetedLookups,
    cleanup,
    plan: {
      queue_depth: plan.queue_depth,
      selected: claimed.map((watch) => ({ contract: watch.contract, cadence_class: watch.cadence_class })),
      deferred_count: actualDeferred.length,
      capacity_rejected_count: plan.capacity_rejected.length + mutationResults.filter((row) => row.persistence === "CAPACITY_REJECTED_FAIL_CLOSED" || row.persistence === "CAPACITY_REJECTED_OR_STALE_GENERATION").length,
      active_lease_blocked_count: plan.active_lease_blocked.length,
      invalid_budget_rejected_count: plan.invalid_budget_rejected.length,
      budgets: actualPlan.budgets,
      starvation_indicator: starvationIndicator,
    },
    observability: observability([...watchMap.values()], actualPlan, now),
    _watches: [...watchMap.values()],
  };
}

export async function finalizeFastMoveWatchCycle({ env, cycle, deep_check_results, discovery_prefilter, now = Date.now() } = {}) {
  const safe = {
    version: FAST_MOVE_WATCH_VERSION,
    mode: MODE,
    status: "NO_MATCHING_DEEP_CHECK",
    finalized: [],
    writes_used: 0,
    safety: safetyEnvelope(),
  };
  if (!env?.DATA_DB || cycle?.status !== "CLOSED") return { ...safe, status: "FAIL_CLOSED" };
  if (cycle?.maintenance_only === true) return { ...safe, status: "MAINTENANCE_ONLY" };

  const selectedLeases = new Map();
  for (const lease of (Array.isArray(cycle?.selected_leases) ? cycle.selected_leases : [])) {
    const contract = text(lease?.contract);
    const owner = text(lease?.lease_owner);
    const generation = finite(lease?.generation);
    const expires = finite(lease?.lease_expires_ts);
    if (contract && owner && generation !== null && expires !== null) {
      selectedLeases.set(contract, {
        contract,
        generation,
        owner,
        expires,
      });
    }
  }
  if (!selectedLeases.size) {
    return {
      ...safe,
      status: Array.isArray(cycle?.selected_contracts) && cycle.selected_contracts.length
        ? "LEASE_IDENTITY_MISSING_FAIL_CLOSED"
        : "NO_MATCHING_DEEP_CHECK",
    };
  }

  const watchMap = new Map(
    (Array.isArray(cycle?._watches) ? cycle._watches : []).map((watch) => [watch.contract, watch]),
  );
  const results = Array.isArray(deep_check_results) ? deep_check_results : [];
  const finalized = [];
  let writesUsed = 0;
  let completed = false;

  for (const result of results) {
    const contract = text(result?.contract);
    const lease = selectedLeases.get(contract);
    if (!lease) continue;
    const prior = watchMap.get(contract);
    if (!prior || TERMINAL_STATES.has(prior.state) || prior.generation !== lease.generation) continue;

    try {
      if (text(result?.run_id) !== lease.owner) {
        throw new Error("DEEP_CHECK_RUN_ID_DOES_NOT_MATCH_WATCH_LEASE");
      }
      if (lease.expires <= now) {
        throw new Error("FAST_MOVE_WATCH_LEASE_EXPIRED_BEFORE_FINALIZE");
      }

      let watch = completeRecheck(
        prior,
        now,
        { status: result?.fast_move_watch_observation?.coverage_status === "CLOSED" ? "CLOSED" : "NOT_CLOSED" },
        DEFAULT_LIMITS,
      );
      let event = null;
      const observation = result?.fast_move_watch_observation || null;
      if (observation) {
        if (text(observation?.contract) !== contract) {
          throw new Error("DEEP_CHECK_OBSERVATION_CONTRACT_MISMATCH");
        }
        const advanced = advanceWatch(watch, observation, now, DEFAULT_LIMITS);
        watch = advanced.watch;
        event = advanced.event;
        watch.discovery_rank = observation.discovery_rank ?? watch.discovery_rank;
        watch.discovery_flags = observation.discovery_flags || watch.discovery_flags;
      }
      const persisted = await persistBundle(
        env,
        watch,
        observation,
        event,
        now,
        {
          generation_opened: false,
          expected_previous: prior,
          preserve_active_lease: false,
          finalize_lease: { owner: lease.owner, now },
        },
      );
      writesUsed += persisted.statements;
      if (!persisted.admitted) {
        throw new Error("FAST_MOVE_STALE_RESULT_OR_LEASE_LOST");
      }
      finalized.push({ contract, state: watch.state, reason: watch.last_reason_code, persistence: persisted.status });
      completed = true;
      break; // Existing bounded scheduler is max one Deep Check per cron cycle.
    } catch (error) {
      finalized.push({
        contract,
        state: prior.state,
        reason: "STALE_OR_UNBOUND_RESULT_REJECTED",
        persistence: "REJECTED_FAIL_CLOSED",
        error: text(error?.message || error).slice(0, 300),
      });
      break;
    }
  }
  return {
    ...safe,
    status: completed
      ? "CLOSED"
      : finalized.length
        ? "STALE_OR_UNBOUND_RESULT_REJECTED"
        : "NO_MATCHING_DEEP_CHECK",
    finalized,
    writes_used: writesUsed,
  };
}

export async function fastMoveWatchDataPlaneSummary(env, now = Date.now()) {
  const safe = {
    table_available: false,
    version: FAST_MOVE_WATCH_VERSION,
    engine_version: ENGINE_VERSION,
    mode: MODE,
    status: FAST_MOVE_WATCH_STATUS,
    active_watch_count: 0,
    queue_depth: 0,
    due_count: 0,
    state_counts: {},
    scheduler_priority_is_probability: false,
    safety: safetyEnvelope(),
  };
  if (!env?.DATA_DB) return { ...safe, status: "SOURCE_UNSUPPORTED", error: "DATA_DB_NOT_CONFIGURED" };
  try {
    const [states, queue, recent] = await Promise.all([
      env.DATA_DB.prepare(`
        SELECT lifecycle_state,COUNT(*) count
        FROM fast_move_watch_state
        GROUP BY lifecycle_state
      `).all(),
      env.DATA_DB.prepare(`
        SELECT COUNT(*) queue_depth,
          SUM(CASE WHEN status='PENDING' AND due_ts<=?1 THEN 1 ELSE 0 END) due_count,
          SUM(CASE WHEN status='LEASED' AND lease_expires_ts>?1 THEN 1 ELSE 0 END) leased_count
        FROM fast_move_recheck_queue
        WHERE status IN ('PENDING','LEASED')
      `).bind(now).first(),
      env.DATA_DB.prepare(`
        SELECT contract,generation,lifecycle_state,updated_ts,next_recheck_ts,
          cadence_class,last_reason_code,attempt_count,discovery_rank
        FROM fast_move_watch_state
        ORDER BY updated_ts DESC LIMIT 8
      `).all(),
    ]);
    const counts = {};
    for (const row of (Array.isArray(states?.results) ? states.results : [])) {
      counts[text(row?.lifecycle_state) || "UNKNOWN"] = Number(row?.count ?? 0);
    }
    const active = Object.entries(counts)
      .filter(([state]) => ![STATES.EXPIRED, STATES.CLOSED].includes(state))
      .reduce((sum, [, count]) => sum + count, 0);
    return {
      ...safe,
      table_available: true,
      active_watch_count: active,
      queue_depth: Number(queue?.queue_depth ?? 0),
      due_count: Number(queue?.due_count ?? 0),
      leased_count: Number(queue?.leased_count ?? 0),
      state_counts: counts,
      recent: (Array.isArray(recent?.results) ? recent.results : []).map((row) => ({
        contract: row.contract,
        generation: Number(row.generation),
        lifecycle_state: row.lifecycle_state,
        updated_ts: Number(row.updated_ts),
        next_recheck_ts: row.next_recheck_ts === null ? null : Number(row.next_recheck_ts),
        cadence_class: row.cadence_class,
        last_reason_code: row.last_reason_code,
        attempt_count: Number(row.attempt_count),
        discovery_rank: row.discovery_rank === null ? null : Number(row.discovery_rank),
      })),
    };
  } catch (error) {
    const message = text(error?.message || error).slice(0, 600);
    return {
      ...safe,
      status: /no such table/i.test(message) ? "MIGRATION_REQUIRED_FAIL_CLOSED" : "PARTIAL_FAIL_CLOSED",
      error: message,
    };
  }
}
