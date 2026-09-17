import {
  CAMPAIGN_PHASE,
  MULTI_WAVE_MODE,
  MULTI_WAVE_RULES_VERSION,
  MULTI_WAVE_VERSION,
  buildMultiWaveCampaignShadow,
  campaignSafetyEnvelope,
} from "./multi-wave-campaign-engine.mjs";
import {
  prepareMultiWaveDecisionBridge,
  sealMultiWaveDecisionBridgeAfterAck,
  verifyStoredMultiWaveDecisionBridge,
} from "./multi-wave-decision-bridge-producer.mjs";
import {
  buildOpportunityProofFromAdmissionWitness,
  buildPositionOriginSeed,
  positionFromLedgerRow,
  positionOriginFromLedgerRow,
  stage392ProofSafetyEnvelope,
} from "./stage392-proof-runtime.mjs";

export const MULTI_WAVE_RUNTIME_VERSION = "multi-wave-campaign-runtime-v2-stage392-receipts";
export const MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK = 2;
export const MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK = 3;

function text(value) { return value === null || value === undefined ? "" : String(value).trim(); }
function finite(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function json(value, fallback = null) { try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); } }
function parse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }

async function loadActiveCampaignState(env, contract) {
  if (!env?.DATA_DB || !text(contract)) return null;
  try {
    const row = await env.DATA_DB.prepare(`
      WITH active AS (
        SELECT campaign_id,contract_code,campaign_start,current_phase,direction,
               direction_at_detection,direction_confidence_at_detection,wave_index,
               completed_wave_count,last_observed_ts,campaign_json,stage392_proof_bundle_json
        FROM multi_wave_campaign_shadow
        WHERE contract_code=?1 AND current_phase!='CLOSED'
        ORDER BY last_observed_ts DESC LIMIT 1
      )
      SELECT c.campaign_id,c.contract_code,c.campaign_start,c.current_phase,c.direction,
             c.direction_at_detection,c.direction_confidence_at_detection,c.wave_index,
             c.completed_wave_count,c.last_observed_ts,c.campaign_json,
             c.stage392_proof_bundle_json,
             p.state AS position_state,p.state_revision AS position_state_revision,
             p.position_id,p.entry_ts,p.direction AS position_direction,p.campaign_id AS position_campaign_id,
             p.entry_wave_id,p.entry_decision_observation_ts,p.entry_decision_material_digest,
             p.entry_decision_id,p.entry_action_id,p.origin_entry_trigger_price,
             p.origin_entry_observation_id,p.origin_campaign_state_revision,
             p.origin_source_campaign_receipt_id,p.origin_source_campaign_content_digest,
             p.origin_source_campaign_committed_ts,p.last_observed_ts AS position_last_observed_ts,
             p.persisted_ts AS position_persisted_ts
      FROM (SELECT 1 AS seed) s
      LEFT JOIN active c ON 1=1
      LEFT JOIN shadow_virtual_position_ledger p ON p.contract_code=?1
      WHERE c.campaign_id IS NOT NULL OR p.contract_code IS NOT NULL
      LIMIT 1
    `).bind(text(contract)).first();
    if (!row) return null;
    const campaign = row?.campaign_json ? parse(row.campaign_json, null) : null;
    if (row?.campaign_id && (!campaign || typeof campaign !== "object")) throw new Error("ACTIVE_CAMPAIGN_JSON_INVALID");
    if (campaign) {
      const scalarMismatch = (
        campaign.campaign_id !== row.campaign_id ||
        campaign.contract_code !== row.contract_code ||
        finite(campaign.campaign_start) !== finite(row.campaign_start) ||
        campaign.current_phase !== row.current_phase ||
        campaign.direction !== row.direction ||
        campaign.direction_at_detection !== row.direction_at_detection ||
        finite(campaign.direction_confidence_at_detection) !== finite(row.direction_confidence_at_detection) ||
        finite(campaign.wave_index) !== finite(row.wave_index) ||
        finite(campaign.completed_wave_count) !== finite(row.completed_wave_count) ||
        finite(campaign.last_observed_ts) !== finite(row.last_observed_ts)
      );
      if (scalarMismatch) throw new Error("ACTIVE_CAMPAIGN_JSON_SCALAR_MISMATCH");
    }
    const proofBundle = row?.stage392_proof_bundle_json ? parse(row.stage392_proof_bundle_json, null) : null;
    if (proofBundle && !campaign) throw new Error("STAGE392_PROOF_WITHOUT_ACTIVE_CAMPAIGN");
    const storedBridge = proofBundle?.campaign_bridge || null;
    if (storedBridge) {
      const verified = verifyStoredMultiWaveDecisionBridge(storedBridge);
      if (!verified.ok) throw new Error(`STAGE392_STORED_CAMPAIGN_RECEIPT_INVALID:${verified.reason}`);
      const proven = storedBridge.campaign;
      const proofOperationalMismatch = (
        proven?.campaign_id !== campaign?.campaign_id ||
        proven?.contract_code !== campaign?.contract_code ||
        finite(proven?.campaign_start) !== finite(campaign?.campaign_start) ||
        proven?.current_phase !== campaign?.current_phase ||
        proven?.direction !== campaign?.direction ||
        finite(proven?.wave_index) !== finite(campaign?.wave_index) ||
        finite(proven?.completed_wave_count) !== finite(campaign?.completed_wave_count) ||
        finite(proven?.last_observed_ts) !== finite(campaign?.last_observed_ts)
      );
      if (proofOperationalMismatch) throw new Error('STAGE392_CAMPAIGN_PROOF_OPERATIONAL_MISMATCH');
    }
    const positionRow = row?.position_state ? {
      state: row.position_state,
      state_revision: row.position_state_revision,
      position_id: row.position_id,
      entry_ts: row.entry_ts,
      direction: row.position_direction,
      campaign_id: row.position_campaign_id,
      entry_wave_id: row.entry_wave_id,
      entry_decision_observation_ts: row.entry_decision_observation_ts,
      entry_decision_material_digest: row.entry_decision_material_digest,
      entry_decision_id: row.entry_decision_id,
      entry_action_id: row.entry_action_id,
      origin_entry_trigger_price: row.origin_entry_trigger_price,
      origin_entry_observation_id: row.origin_entry_observation_id,
      origin_campaign_state_revision: row.origin_campaign_state_revision,
      origin_source_campaign_receipt_id: row.origin_source_campaign_receipt_id,
      origin_source_campaign_content_digest: row.origin_source_campaign_content_digest,
      origin_source_campaign_committed_ts: row.origin_source_campaign_committed_ts,
      last_observed_ts: row.position_last_observed_ts,
      persisted_ts: row.position_persisted_ts,
    } : null;
    return { campaign, proof_bundle: proofBundle, position_row: positionRow, prior_last_observed_ts: finite(row.last_observed_ts) };
  } catch (error) {
    if (/no such table|no such column/i.test(text(error?.message || error))) throw new Error(`STAGE392_MIGRATION_REQUIRED:${text(error?.message || error)}`);
    throw error;
  }
}

export async function loadActiveCampaign(env, contract) {
  const state = await loadActiveCampaignState(env, contract);
  return state?.campaign || null;
}

function campaignUpsert(env, result, now, {
  proofBundle = null,
  expectedLastObservedTs = null,
  expectedPositionRevision = 0,
  expectedPositionState = "ABSENT",
} = {}) {
  const c = result.campaign;
  return env.DATA_DB.prepare(`
    INSERT INTO multi_wave_campaign_shadow (
      campaign_id,version,rules_version,mode,contract_code,campaign_start,campaign_end,
      current_phase,direction,direction_at_detection,direction_confidence_at_detection,wave_index,completed_wave_count,
      base_start,base_low,base_high,entry_trigger_time,entry_trigger_price,impulse_start,
      impulse_start_price,impulse_peak_price,impulse_peak_ts,last_event_id,last_event_ts,
      last_observed_ts,last_data_quality,campaign_json,persisted_ts,stage392_proof_bundle_json
    ) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26,?27,?28,?29
    WHERE COALESCE((SELECT state_revision FROM shadow_virtual_position_ledger WHERE contract_code=?5),0)=?31
      AND COALESCE((SELECT state FROM shadow_virtual_position_ledger WHERE contract_code=?5),'ABSENT')=?32
    ON CONFLICT(campaign_id) DO UPDATE SET
      campaign_end=excluded.campaign_end,current_phase=excluded.current_phase,direction=excluded.direction,
      wave_index=excluded.wave_index,completed_wave_count=excluded.completed_wave_count,
      base_start=excluded.base_start,base_low=excluded.base_low,
      base_high=excluded.base_high,entry_trigger_time=excluded.entry_trigger_time,entry_trigger_price=excluded.entry_trigger_price,
      impulse_start=excluded.impulse_start,impulse_start_price=excluded.impulse_start_price,
      impulse_peak_price=excluded.impulse_peak_price,impulse_peak_ts=excluded.impulse_peak_ts,
      last_event_id=excluded.last_event_id,last_event_ts=excluded.last_event_ts,last_observed_ts=excluded.last_observed_ts,
      last_data_quality=excluded.last_data_quality,campaign_json=excluded.campaign_json,persisted_ts=excluded.persisted_ts,
      stage392_proof_bundle_json=excluded.stage392_proof_bundle_json
    WHERE multi_wave_campaign_shadow.last_observed_ts IS ?30
      AND COALESCE((SELECT state_revision FROM shadow_virtual_position_ledger WHERE contract_code=excluded.contract_code),0)=?31
      AND COALESCE((SELECT state FROM shadow_virtual_position_ledger WHERE contract_code=excluded.contract_code),'ABSENT')=?32
  `).bind(
    c.campaign_id, MULTI_WAVE_VERSION, MULTI_WAVE_RULES_VERSION, MULTI_WAVE_MODE, c.contract_code,
    c.campaign_start, c.campaign_end, c.current_phase, c.direction, c.direction_at_detection || "DIRECTIONLESS_EVENT", finite(c.direction_confidence_at_detection),
    Number(c.wave_index || 0), Number(c.completed_wave_count || 0), c.base_start, finite(c.base_low), finite(c.base_high),
    c.entry_trigger_time, finite(c.entry_trigger_price), c.impulse_start, finite(c.impulse_start_price),
    finite(c.impulse_peak_price), c.impulse_peak_ts, c.last_event_id, c.last_event_ts, c.last_observed_ts,
    c.last_data_quality || "PARTIAL", json(c, {}), now, proofBundle ? json(proofBundle, {}) : null,
    expectedLastObservedTs,
    Number(expectedPositionRevision || 0),
    text(expectedPositionState) || "ABSENT",
  );
}


function waveUpsert(env, result, now) {
  const c = result.campaign;
  if (!c || Number(c.wave_index || 0) <= 0) return null;
  const waveId = `${c.campaign_id}:W${Number(c.wave_index)}`;
  return env.DATA_DB.prepare(`
    INSERT INTO multi_wave_campaign_wave_shadow (
      wave_id,campaign_id,contract_code,wave_index,direction,base_start,base_low,base_high,
      entry_trigger_time,entry_trigger_price,impulse_start,impulse_start_price,impulse_peak,
      impulse_peak_ts,impulse_end,oi_before,funding_before,basis_before,flow_before,
      move_before_entry_pct,move_after_entry_pct,lead_time_minutes,wave_json,persisted_ts
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)
    ON CONFLICT(wave_id) DO UPDATE SET
      -- Wave-origin facts become immutable once first persisted. A later campaign
      -- RELOAD_BASE belongs to the campaign/current next-wave setup; it must not
      -- rewrite the completed/current wave's original base or entry identity.
      base_start=COALESCE(multi_wave_campaign_wave_shadow.base_start,excluded.base_start),
      base_low=COALESCE(multi_wave_campaign_wave_shadow.base_low,excluded.base_low),
      base_high=COALESCE(multi_wave_campaign_wave_shadow.base_high,excluded.base_high),
      entry_trigger_time=COALESCE(multi_wave_campaign_wave_shadow.entry_trigger_time,excluded.entry_trigger_time),
      entry_trigger_price=COALESCE(multi_wave_campaign_wave_shadow.entry_trigger_price,excluded.entry_trigger_price),
      impulse_start=COALESCE(multi_wave_campaign_wave_shadow.impulse_start,excluded.impulse_start),
      impulse_start_price=COALESCE(multi_wave_campaign_wave_shadow.impulse_start_price,excluded.impulse_start_price),
      impulse_peak=excluded.impulse_peak,impulse_peak_ts=excluded.impulse_peak_ts,
      impulse_end=COALESCE(excluded.impulse_end,multi_wave_campaign_wave_shadow.impulse_end),
      oi_before=excluded.oi_before,funding_before=excluded.funding_before,basis_before=excluded.basis_before,
      flow_before=excluded.flow_before,move_before_entry_pct=excluded.move_before_entry_pct,
      move_after_entry_pct=excluded.move_after_entry_pct,lead_time_minutes=excluded.lead_time_minutes,
      wave_json=excluded.wave_json,persisted_ts=excluded.persisted_ts
  `).bind(
    waveId,c.campaign_id,c.contract_code,Number(c.wave_index),c.direction,c.base_start,finite(c.base_low),finite(c.base_high),
    c.entry_trigger_time,finite(c.entry_trigger_price),c.impulse_start,finite(c.impulse_start_price),finite(c.impulse_peak_price),
    c.impulse_peak_ts,c.prior_phase === CAMPAIGN_PHASE.IMPULSE && c.current_phase !== CAMPAIGN_PHASE.IMPULSE ? c.last_observed_ts : null,
    finite(result?.campaign_context?.oi_before),finite(result?.funding_trajectory?.current_rate),
    finite(result?.campaign_context?.basis_before),finite(result?.campaign_context?.flow_before),
    finite(result?.lead_time?.move_before_entry_pct),finite(result?.lead_time?.move_after_entry_pct),
    finite(result?.lead_time?.wave_lead_time_minutes ?? result?.lead_time?.lead_time_minutes),json({campaign:c,lead_time:result.lead_time,evidence:result.evidence},{}),now,
  );
}

export async function runMultiWaveCampaignShadowCycle({ env, opportunity, input = {}, now = Date.now(), config } = {}) {
  const contract = text(opportunity?.contract || input?.contract);
  const readQueries = env?.DATA_DB && contract ? 1 : 0;
  let priorState = null;
  let prior = null;
  if (env?.DATA_DB && contract) {
    try {
      priorState = await loadActiveCampaignState(env, contract);
      prior = priorState?.campaign || null;
    } catch (error) {
      return { version: MULTI_WAVE_VERSION, runtime_version: MULTI_WAVE_RUNTIME_VERSION, mode: MULTI_WAVE_MODE, status: "LOAD_FAIL_CLOSED", error: text(error?.message || error).slice(0,600), safety: campaignSafetyEnvelope() };
    }
  }
  let result;
  try { result = buildMultiWaveCampaignShadow({ opportunity, input, prior_campaign: prior, now, config }); }
  catch (error) {
    return { version: MULTI_WAVE_VERSION, runtime_version: MULTI_WAVE_RUNTIME_VERSION, mode: MULTI_WAVE_MODE, status: "ANALYSIS_FAIL_CLOSED", error: text(error?.message || error).slice(0,600), safety: campaignSafetyEnvelope() };
  }
  const snapshotId = text(input?.stage392_snapshot_id) || `S392:${contract}:${now}`;
  const opportunityProofResult = buildOpportunityProofFromAdmissionWitness({
    analysis: opportunity,
    witness: opportunity?.admission_witness,
    snapshot_id: snapshotId,
    observed_ts: now,
    receipt_committed_ts: now,
  });
  const opportunityProof = opportunityProofResult?.status === "CLOSED" ? opportunityProofResult.proof : null;

  if (!env?.DATA_DB) return { ...result, runtime_version: MULTI_WAVE_RUNTIME_VERSION, stage392_proofs: { snapshot_id: snapshotId, opportunity: opportunityProof, campaign: null, position: null, position_origin_campaign: null, proof_status: "SOURCE_UNSUPPORTED", safety: stage392ProofSafetyEnvelope() }, persistence: { status: "SOURCE_UNSUPPORTED", statements: 0, queries_including_campaign_read: 0 } };
  if (result?.status !== "SHADOW_CAMPAIGN_EVALUATED" || !result?.campaign) {
    return { ...result, runtime_version: MULTI_WAVE_RUNTIME_VERSION, stage392_proofs: { snapshot_id: snapshotId, opportunity: opportunityProof, campaign: null, position: null, position_origin_campaign: null, proof_status: "NOT_EVALUATED", safety: stage392ProofSafetyEnvelope() }, persistence: {
      status: result?.status === "DUPLICATE_OBSERVATION_SKIPPED" ? "SKIPPED_DUPLICATE" : "SKIPPED_FAIL_CLOSED",
      statements: 0,
      queries_including_campaign_read: readQueries,
      query_cap: MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK,
    } };
  }

  let preparedBridge = { status: "UNPROVEN", reason: opportunityProof ? null : (opportunityProofResult?.reason || "OPPORTUNITY_PROOF_MISSING"), bridge: null };
  if (opportunityProof) {
    preparedBridge = prepareMultiWaveDecisionBridge({
      multi_wave_result: result,
      opportunity: opportunityProof,
      prior_bridge: priorState?.proof_bundle?.campaign_bridge || null,
      prior_operational_campaign: prior && !priorState?.proof_bundle?.campaign_bridge ? prior : null,
      snapshot_id: snapshotId,
      observed_ts: now,
    });
  }
  const campaignCandidate = preparedBridge?.status === "PREPARED_UNACKNOWLEDGED" ? preparedBridge.bridge : null;
  const originSeed = campaignCandidate ? buildPositionOriginSeed(campaignCandidate) : null;
  const proofBundleForRow = {
    schema_version: "stage392-campaign-proof-bundle-v1",
    snapshot_id: snapshotId,
    opportunity: opportunityProof,
    campaign_bridge: campaignCandidate,
    position_origin_seed: originSeed,
    preparation_status: preparedBridge?.status || "UNPROVEN",
    preparation_reason: preparedBridge?.reason || null,
  };

  let attemptedStatements = 0;
  try {
    const statements = [campaignUpsert(env, result, now, {
      proofBundle: proofBundleForRow,
      expectedLastObservedTs: priorState?.prior_last_observed_ts ?? null,
      expectedPositionRevision: Number(priorState?.position_row?.state_revision || 0),
      expectedPositionState: text(priorState?.position_row?.state) || "ABSENT",
    })];
    const wave = waveUpsert(env, result, now);
    if (wave) statements.push(wave);
    if (statements.length > MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK) {
      throw new Error(`MULTI_WAVE_D1_WRITE_CAP_EXCEEDED:${statements.length}`);
    }
    const totalQueries = 1 + statements.length;
    if (totalQueries > MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK) {
      throw new Error(`MULTI_WAVE_D1_QUERY_CAP_EXCEEDED:${totalQueries}`);
    }
    attemptedStatements = statements.length;
    const rows = await env.DATA_DB.batch(statements);
    const campaignChanges = Number(rows?.[0]?.meta?.changes ?? 0);
    if (campaignChanges !== 1) throw new Error(`MULTI_WAVE_CAS_CONFLICT:${campaignChanges}`);
    const sealedBridgeResult = campaignCandidate
      ? sealMultiWaveDecisionBridgeAfterAck(preparedBridge, { status: "CLOSED", cas_persisted: true, changes: campaignChanges })
      : { status: "UNPROVEN", reason: preparedBridge?.reason || "CAMPAIGN_PROOF_MISSING", bridge: null };
    const campaignProof = sealedBridgeResult?.status === "CLOSED" ? sealedBridgeResult.bridge : null;

    // The virtual ledger is maintained by the same campaign write via D1 trigger.
    // On an existing row the joined factual state is used; on genesis, successful
    // campaign ACK proves that the atomic FLAT-ledger trigger also completed.
    let positionRow = priorState?.position_row || null;
    if (campaignProof) {
      // The campaign ACK also proves the ledger refresh trigger completed
      // atomically. The campaign UPDATE itself CAS-checks position state+revision,
      // so an OPEN position can be refreshed without inventing current identity.
      positionRow = {
        ...(positionRow || {}),
        state: String(positionRow?.state || "FLAT").toUpperCase(),
        state_revision: Number(positionRow?.state_revision || 1),
        last_observed_ts: now,
        persisted_ts: now,
      };
    }
    const position = positionRow ? positionFromLedgerRow(positionRow, {
      contract_code: contract,
      snapshot_id: snapshotId,
      observed_ts: now,
      committed_ts: now,
    }) : null;
    const positionOrigin = priorState?.position_row && position && ["OPEN_LONG", "OPEN_SHORT"].includes(String(position?.state || "").toUpperCase())
      ? positionOriginFromLedgerRow(priorState.position_row, position, {
          observed_ts: now,
          committed_ts: now,
        })
      : null;

    return { ...result, runtime_version: MULTI_WAVE_RUNTIME_VERSION, stage392_proofs: {
      snapshot_id: snapshotId,
      opportunity: opportunityProof,
      campaign: campaignProof,
      position,
      position_origin_campaign: positionOrigin,
      position_management_context: null,
      proof_status: campaignProof ? "CLOSED" : "FAIL_CLOSED",
      proof_reason: sealedBridgeResult?.reason || preparedBridge?.reason || null,
      safety: stage392ProofSafetyEnvelope(),
    }, persistence: {
      status: "CLOSED",
      cas_persisted: true,
      campaign_changes: campaignChanges,
      statements: statements.length,
      write_statement_cap: MAX_MULTI_WAVE_D1_WRITE_STATEMENTS_PER_DEEP_CHECK,
      queries_including_campaign_read: totalQueries,
      query_cap: MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK,
      transition_history_storage: "CAMPAIGN_JSON_BOUNDED_64",
      proof_bundle_storage: "CAMPAIGN_ROW_CAS_BOUND",
      virtual_position_storage: "D1_TRIGGER_SAME_WRITE",
      atomic_batch: true,
      writes: rows.map((r) => Number(r?.meta?.changes ?? 0)).reduce((a,b)=>a+b,0),
    } };
  } catch (error) {
    const message = text(error?.message || error).slice(0,600);
    return { ...result, runtime_version: MULTI_WAVE_RUNTIME_VERSION, stage392_proofs: {
      snapshot_id: snapshotId,
      opportunity: opportunityProof,
      campaign: null,
      position: null,
      position_origin_campaign: null,
      proof_status: "FAIL_CLOSED",
      proof_reason: message,
      safety: stage392ProofSafetyEnvelope(),
    }, persistence: {
      status: /no such table|no such column|MIGRATION_REQUIRED/i.test(message) ? "MIGRATION_REQUIRED" : "PARTIAL_FAIL_CLOSED",
      statements: 0,
      attempted_statements: attemptedStatements,
      queries_attempted_including_campaign_read: readQueries + attemptedStatements,
      query_cap: MAX_MULTI_WAVE_D1_QUERIES_PER_DEEP_CHECK,
      retry_attempts: 0,
      atomic_batch: true,
      error: message,
    } };
  }
}

export async function multiWaveCampaignDataPlaneSummary(env, now = Date.now()) {
  const safe = { version: MULTI_WAVE_VERSION, runtime_version: MULTI_WAVE_RUNTIME_VERSION, mode: MULTI_WAVE_MODE, table_available: false, active_campaigns: 0, transition_count: 0, phase_counts: {}, safety: campaignSafetyEnvelope() };
  if (!env?.DATA_DB) return { ...safe, status: "SOURCE_UNSUPPORTED" };
  try {
    const [campaigns, transitions, recent] = await Promise.all([
      env.DATA_DB.prepare(`SELECT current_phase,COUNT(*) n FROM multi_wave_campaign_shadow WHERE current_phase!='CLOSED' GROUP BY current_phase`).all(),
      env.DATA_DB.prepare(`SELECT COALESCE(SUM(json_array_length(json_extract(campaign_json,'$.transition_history'))),0) n FROM multi_wave_campaign_shadow`).first(),
      env.DATA_DB.prepare(`SELECT campaign_id,contract_code,current_phase,direction,wave_index,completed_wave_count,last_observed_ts FROM multi_wave_campaign_shadow ORDER BY last_observed_ts DESC LIMIT 8`).all(),
    ]);
    const phaseCounts = Object.fromEntries((campaigns?.results || []).map((r) => [r.current_phase, Number(r.n || 0)]));
    return { ...safe, status: "CLOSED", table_available: true, active_campaigns: Object.values(phaseCounts).reduce((a,b)=>a+b,0), transition_count: Number(transitions?.n || 0), phase_counts: phaseCounts, recent: recent?.results || [], observed_ts: now };
  } catch (error) {
    return { ...safe, status: /no such table/i.test(text(error?.message || error)) ? "MIGRATION_REQUIRED" : "PARTIAL_FAIL_CLOSED", error: text(error?.message || error).slice(0,600) };
  }
}

export { CAMPAIGN_PHASE, MULTI_WAVE_VERSION };
