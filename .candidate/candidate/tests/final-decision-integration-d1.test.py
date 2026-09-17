#!/usr/bin/env python3
"""D1 contract tests for the Stage 3.9.2 shadow-only decision journal."""

import copy
import json
import pathlib
import re
import shutil
import sqlite3
import subprocess
import tempfile
import textwrap
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "migrations/20260914_final_decision_integration_shadow.sql"
MIGRATION = MIGRATION_PATH.read_text(encoding="utf-8")
COMMIT_LAG_MS = 5 * 60 * 1000
RETENTION_MS = 180 * 24 * 60 * 60 * 1000
DECISION_CONTRACT_CAP = 64
DECISION_GLOBAL_CAP = 2048
ACTION_CONTRACT_CAP = 256
ACTION_GLOBAL_CAP = 4096
MAX_BULK_CLEANUP = 16


ENGINE_OUTPUT_KEYS = {
    "version", "rules_version", "mode", "status", "decision_id", "material_digest",
    "contract_code", "snapshot_id", "observation_ts", "direction", "directional_quality",
    "entry_action", "entry_action_id", "entry_quality", "data_quality", "execution_quality",
    "entry_execution_quality", "management_execution_quality", "campaign_phase", "campaign_quality",
    "independence_state", "timing_state", "risk_state", "position_state", "management_action",
    "management_intent", "management_action_id", "management_quality",
    "management_trigger_basis", "action_identity",
    "lineage_receipts", "input_lineage_digest", "hard_veto", "hard_veto_state",
    "calibration_eligible", "calibration_status", "shadow_outcome_collection_eligible",
    "live_probability", "validated_signal", "execution_authorized", "telegram_eligible",
    "shadow_only", "reason_codes", "opportunity_latency", "evidence_independence",
    "explainability", "source_quality", "safety",
}

LINEAGE_KEYS = {
    "campaign", "decision_evidence", "full_evidence", "full_evidence_source", "opportunity",
    "position", "position_management", "position_origin_campaign", "safety_gate",
}

MAIN_COLUMNS = [
    "decision_id", "schema_version", "mode", "material_digest", "input_lineage_digest",
    "snapshot_id", "engine_version", "rules_version", "decision_status", "contract_code",
    "observation_ts", "direction", "directional_quality", "entry_action", "entry_action_id",
    "entry_quality", "data_quality", "execution_quality", "entry_execution_quality",
    "management_execution_quality", "campaign_phase", "campaign_quality", "independence_state",
    "timing_state", "risk_state", "position_state", "management_action", "management_intent",
    "management_action_id", "management_quality", "hard_veto", "hard_veto_state",
    "calibration_eligible", "shadow_outcome_collection_eligible", "shadow_only",
    "live_probability", "validated_signal", "execution_authorized", "telegram_eligible",
    "decision_evidence_receipt_id", "full_evidence_receipt_id",
    "full_evidence_source_receipt_id", "opportunity_receipt_id", "campaign_receipt_id",
    "safety_gate_receipt_id", "position_receipt_id", "position_origin_campaign_receipt_id",
    "position_management_receipt_id", "reason_codes_json", "decision_json", "persisted_ts",
]

STORAGE_FUSE_COLUMNS = [
    "live_signal", "trading_execution", "strategy_weights_changed", "automatic_weight_tuning",
]

ACTION_COLUMNS = [
    "action_id", "action_kind", "contract_code", "subject_id", "scope_id", "state_marker",
    "direction", "first_decision_id", "claimed_ts", "expires_ts", "shadow_only",
]

INSERT_SQL = f"""
INSERT INTO final_decision_integration_shadow({','.join(MAIN_COLUMNS)})
VALUES({','.join('?' for _ in MAIN_COLUMNS)})
"""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def engine_samples():
    source = textwrap.dedent(
        """
        import {
          buildFinalDecisionIntegrationShadow,
          validateFinalDecisionOutput,
        } from './src/final-decision-integration-engine.mjs';
        import { toFinalDecisionIntegrationRecord } from './src/final-decision-integration-runtime.mjs';
        import {
          NOW, completeInput, digest, executionGate, hardVeto, impulseCampaign, openPosition,
          positionManagementContext, positionOriginCampaign, safetyGateReceipt, withImmutableReceipt,
          decisionRawDigest, evidenceRegistry, evidenceRow, fullEvidence, fullRawDigest,
        } from './tests/final-decision-integration-fixtures.mjs';

        function evaluated(input, label) {
          const output = buildFinalDecisionIntegrationShadow(input);
          const validation = validateFinalDecisionOutput(output);
          if (!validation.valid) throw new Error(`${label}:${validation.errors.join(',')}`);
          return output;
        }

        function registryProjection(row) {
          return {
            chain: String(row.chain).toUpperCase(),
            source_observation_id: row.source_observation_id,
            source_payload_digest: row.source_payload_digest,
            source: row.source,
            venue: row.venue,
            metric: row.metric,
            source_ts: row.source_ts,
            available_ts: row.available_ts,
            valid_until_ts: row.valid_until_ts,
            max_age_sec: row.max_age_sec,
            producer_rules_version: row.producer_rules_version,
            safety_gate_receipt_id: row.safety_gate_receipt_id || null,
          };
        }

        function fullEvidenceWithMutation(mutate, rowIndex = 0) {
          const original = fullEvidence();
          const rows = structuredClone(original.evidence_compact);
          mutate(rows[rowIndex]);
          rows[rowIndex].source_payload_digest = fullRawDigest(rows[rowIndex]);
          const entries = rows.map(registryProjection).sort(
            (a, b) => a.source_observation_id.localeCompare(b.source_observation_id),
          );
          const registryDigest = digest(entries);
          const material = {
            ...original,
            evidence_compact: rows,
            source_registry: {
              ...original.source_registry,
              entries,
              content_digest: registryDigest,
              persistence: {
                ...original.source_registry.persistence,
                content_digest: registryDigest,
              },
            },
          };
          return withImmutableReceipt(material, original.persistence.receipt_id, NOW - 100);
        }

        function correlatedCrossPlane(kind) {
          const input = completeInput('LONG');
          const decisionRow = input.decision_evidence[0];
          input.full_evidence = fullEvidenceWithMutation((row) => {
            if (kind === 'SOURCE_OBSERVATION_ID') {
              row.source_observation_id = decisionRow.source_observation_id;
            }
            if (kind === 'SOURCE_FACT_ID') row.source_fact_ids = [decisionRow.fact_ids[0]];
            if (kind === 'SOURCE_ROOT') {
              row.source = decisionRow.source;
              row.venue = decisionRow.venue;
              row.metric = decisionRow.metric;
              row.source_ts = decisionRow.source_ts;
              row.valid_until_ts = row.source_ts + row.max_age_sec * 1000;
            }
          });
          const output = evaluated(input, `cross-plane-${kind}`);
          if (output.independence_state !== 'CORRELATED' ||
              !output.evidence_independence.cross_plane_reuse.reports.some(
                (report) => report.kind === kind,
              )) throw new Error(`cross-plane-${kind}-contract`);
          return output;
        }

        const crossObservation = correlatedCrossPlane('SOURCE_OBSERVATION_ID');
        const crossFact = correlatedCrossPlane('SOURCE_FACT_ID');
        const crossRoot = correlatedCrossPlane('SOURCE_ROOT');

        function blockedCrossPlane() {
          const input = completeInput('LONG');
          const collision = {
            ...input.decision_evidence[0],
            source_observation_id: input.full_evidence.evidence_compact[0].source_observation_id,
          };
          collision.source_payload_digest = decisionRawDigest(collision);
          const malformed = evidenceRow({
            evidence_id: 'MALFORMED-D1-COMBINED-INTEGRITY',
            causal_family: 'RELATIVE_STRENGTH',
            metric_semantics: 'DIRECTIONAL_PRICE_RESPONSE',
            correlation_group: 'MALFORMED-D1-COMBINED-INTEGRITY',
            source: 'RELATIVE_STRENGTH_MODEL',
            venue: 'MULTI_VENUE',
            metric: 'relative_strength',
            fact_ids: ['FACT-MALFORMED-D1-COMBINED-INTEGRITY'],
          });
          const rows = [collision, input.decision_evidence[1], malformed];
          const output = evaluated({
            ...input,
            decision_evidence: rows,
            evidence_registry: evidenceRegistry(rows),
          }, 'cross-plane-blocked-precedence');
          if (output.independence_state !== 'BLOCKED' ||
              output.evidence_independence.cross_plane_reuse.state !== 'CORRELATED') {
            throw new Error('cross-plane-blocked-precedence-contract');
          }
          return output;
        }

        function conflictingCrossPlane() {
          const input = completeInput('LONG');
          const rows = structuredClone(input.decision_evidence);
          rows[1].stance = 'SHORT';
          rows[1].value = -1;
          rows[1].source_payload_digest = decisionRawDigest(rows[1]);
          input.decision_evidence = rows;
          input.evidence_registry = evidenceRegistry(rows);
          input.full_evidence = fullEvidenceWithMutation((row) => {
            row.source_observation_id = rows[0].source_observation_id;
          });
          const output = evaluated(input, 'cross-plane-conflicting-precedence');
          if (output.independence_state !== 'CONFLICTING' ||
              output.evidence_independence.cross_plane_reuse.state !== 'CORRELATED') {
            throw new Error('cross-plane-conflicting-precedence-contract');
          }
          return output;
        }

        const crossBlocked = blockedCrossPlane();
        const crossConflicting = conflictingCrossPlane();

        const entryLong = evaluated(completeInput('LONG'), 'entry-long');
        const entryShort = evaluated(completeInput('SHORT'), 'entry-short');
        const threeDomainInput = completeInput('LONG');
        threeDomainInput.decision_evidence.push(evidenceRow({
          evidence_id: 'RELATIVE-D1-SET',
          causal_family: 'RELATIVE_STRENGTH',
          metric_semantics: 'RS_VS_BTC_ETH',
          correlation_group: 'RELATIVE-D1-GROUP',
          source: 'RELATIVE_MARKET_MODEL',
          venue: 'MULTI_VENUE',
          metric: 'relative_strength',
          source_observation_id: 'RAW:RELATIVE-D1-SET',
          fact_ids: ['FACT-RELATIVE-D1-SET'],
        }));
        threeDomainInput.evidence_registry = evidenceRegistry(
          threeDomainInput.decision_evidence,
        );
        const entryThreeDomain = evaluated(threeDomainInput, 'entry-three-domain');
        if (entryThreeDomain.evidence_independence.effective_directional_domains.join(',') !==
            'POSITIONING,PRICE_ACTION,RELATIVE_MARKET') {
          throw new Error('entry-three-domain-contract');
        }
        const holdCampaign = impulseCampaign('LONG');
        const hold = evaluated(completeInput('LONG', {
          campaign: holdCampaign,
          position: openPosition('LONG', holdCampaign),
        }), 'hold');

        const originCampaign = impulseCampaign('LONG');
        const decoupledPosition = openPosition('LONG', originCampaign);
        const origin = positionOriginCampaign(originCampaign, decoupledPosition);
        const management = positionManagementContext(decoupledPosition, origin);
        const rawCurrent = impulseCampaign('LONG');
        const unrelatedId = 'MW:TEST-USDT:UNRELATED-MALFORMED';
        const unrelatedState = {
          ...rawCurrent.campaign,
          campaign_id: unrelatedId,
          current_wave_id: `${unrelatedId}:W1`,
          wave_ledger: rawCurrent.campaign.wave_ledger.map((wave) => ({
            ...wave, wave_id: `${unrelatedId}:W1`,
          })),
        };
        const unrelated = withImmutableReceipt({
          ...rawCurrent, campaign: unrelatedState,
          observation_id: unrelatedState.observation_id, entry_window: null,
        }, `CMR:${unrelatedId}:${unrelatedState.state_revision}`, NOW - 100);
        unrelated.campaign.impulse_start = null;
        unrelated.campaign.impulse_start_price = null;
        const holdDecoupled = evaluated(completeInput('LONG', {
          campaign: unrelated,
          position: decoupledPosition,
          position_origin_campaign: origin,
          position_management_context: management,
        }), 'hold-decoupled');
        if (holdDecoupled.management_action !== 'HOLD' || holdDecoupled.data_quality !== 'BLOCKED' ||
            holdDecoupled.campaign_quality !== 'BLOCKED') throw new Error('hold-decoupling-contract');

        const exitCampaign = impulseCampaign('LONG');
        const exitPosition = openPosition('LONG', exitCampaign);
        const exitOrigin = positionOriginCampaign(exitCampaign, exitPosition);
        const exitManagement = positionManagementContext(
          exitPosition, exitOrigin, 'INVALIDATED',
        );
        const exit = evaluated(completeInput('LONG', {
          campaign: exitCampaign,
          position: exitPosition,
          position_origin_campaign: exitOrigin,
          position_management_context: exitManagement,
        }), 'exit');
        if (exit.management_action !== 'EXIT' || exit.management_intent !== 'EXIT_REQUIRED' ||
            exit.management_trigger_basis?.trigger_types?.join(',') !==
              'POSITION_CONTEXT_INVALIDATED') throw new Error('exit-trigger-contract');

        const terminalActive = impulseCampaign('LONG');
        // The terminal transitions must follow the prior persisted observation
        // and the evidence availability used by the causal chase-risk gate.
        const terminalCompletedTs = NOW - 400;
        const terminalWarningTs = NOW - 300;
        const terminalEdgeTs = NOW - 200;
        const terminalState = {
          ...terminalActive.campaign,
          current_phase: 'EDGE_SPENT',
          completed_wave_count: 1,
          base_start: terminalCompletedTs,
          exhaustion_warning_ts: terminalWarningTs,
          edge_spent_ts: terminalEdgeTs,
          last_observed_ts: terminalEdgeTs,
          state_revision: 8,
          observation_id: 'OBS-EDGE-8',
          transition_history: [
            ...terminalActive.campaign.transition_history,
            { from: 'IMPULSE', to: 'RELOAD_BASE', observed_ts: terminalCompletedTs,
              transition_id: 'TRANSITION-5', observation_id: 'OBS-T5',
              from_state_revision: 5, to_state_revision: 6 },
            { from: 'RELOAD_BASE', to: 'EXHAUSTION_WARNING', observed_ts: terminalWarningTs,
              transition_id: 'TRANSITION-6', observation_id: 'OBS-T6',
              from_state_revision: 6, to_state_revision: 7 },
            { from: 'EXHAUSTION_WARNING', to: 'EDGE_SPENT', observed_ts: terminalEdgeTs,
              transition_id: 'TRANSITION-7', observation_id: 'OBS-EDGE-8',
              from_state_revision: 7, to_state_revision: 8 },
          ],
          wave_ledger: terminalActive.campaign.wave_ledger.map((wave) => ({
            ...wave, status: 'COMPLETED', completed_ts: terminalCompletedTs,
            completion_observation_id: 'OBS-T5',
          })),
        };
        const terminalCampaign = withImmutableReceipt({
          ...terminalActive,
          campaign: terminalState,
          observation_id: terminalState.observation_id,
          entry_window: null,
        }, `CMR:${terminalState.campaign_id}:${terminalState.state_revision}`, NOW - 100);
        const terminalPosition = openPosition('LONG', terminalCampaign);
        const terminalOrigin = positionOriginCampaign(terminalCampaign, terminalPosition);
        const terminalManagement = positionManagementContext(
          terminalPosition, terminalOrigin, 'INVALIDATED',
        );
        const exitAllTriggers = evaluated(completeInput('LONG', {
          campaign: terminalCampaign,
          position: terminalPosition,
          position_origin_campaign: terminalOrigin,
          position_management_context: terminalManagement,
          hard_veto: hardVeto({ status: 'VETO', reasons: ['TEST_ACTIVE_VETO'] }),
        }), 'exit-all-triggers');
        if (exitAllTriggers.management_trigger_basis?.trigger_types?.join(',') !==
            'HARD_VETO,ORIGIN_CAMPAIGN_TERMINAL,POSITION_CONTEXT_INVALIDATED') {
          throw new Error('exit-all-trigger-contract');
        }

        const unsafeInput = completeInput('LONG');
        unsafeInput.execution_authorized = true;
        const failClosed = evaluated(unsafeInput, 'fail-closed');
        if (failClosed.status !== 'FAIL_CLOSED' || failClosed.entry_action !== 'REJECT') {
          throw new Error('fail-closed-contract');
        }

        const lineageCollisionInput = completeInput('LONG');
        lineageCollisionInput.full_evidence = withImmutableReceipt(
          lineageCollisionInput.full_evidence,
          lineageCollisionInput.evidence_registry.receipt_id,
          lineageCollisionInput.full_evidence.persistence.committed_ts,
        );
        const lineageCollision = evaluated(
          lineageCollisionInput,
          'lineage-receipt-id-collision-quarantine',
        );
        if (lineageCollision.status !== 'FAIL_CLOSED' ||
            !lineageCollision.reason_codes.includes('INPUT_LINEAGE_RECEIPT_ID_COLLISION') ||
            lineageCollision.entry_action === 'SHADOW_ENTRY_ELIGIBLE' ||
            ['HOLD', 'EXIT'].includes(lineageCollision.management_action)) {
          throw new Error('lineage-receipt-id-collision-quarantine-contract');
        }

        const corruptCampaign = impulseCampaign('LONG');
        const corruptOpenPosition = openPosition('LONG', corruptCampaign);
        corruptOpenPosition.schema_version = 'corrupt-position-v0';
        const activeVeto = hardVeto({ status: 'VETO', reasons: ['TEST_ACTIVE_VETO'] });
        const closeGate = executionGate();
        const invalidatedBlockedPosition = evaluated(completeInput('LONG', {
          campaign: corruptCampaign,
          position: corruptOpenPosition,
          hard_veto: activeVeto,
          execution_gate: closeGate,
          safety_gate_receipt: safetyGateReceipt(activeVeto, closeGate),
        }), 'invalidated-blocked-position');
        const invalidatedBlockedRecord = toFinalDecisionIntegrationRecord(invalidatedBlockedPosition);
        if (invalidatedBlockedPosition.status !== 'FAIL_CLOSED' ||
            invalidatedBlockedPosition.position_state !== 'OPEN_LONG' ||
            invalidatedBlockedPosition.source_quality.position !== 'BLOCKED' ||
            invalidatedBlockedPosition.risk_state !== 'INVALIDATED' ||
            invalidatedBlockedPosition.management_intent !== 'NOT_EVALUATED' ||
            invalidatedBlockedPosition.management_action !== 'NOT_EVALUATED' ||
            invalidatedBlockedRecord.payload.engine_output !== invalidatedBlockedPosition) {
          throw new Error('invalidated-blocked-position-contract');
        }

        const corruptOriginCampaign = impulseCampaign('LONG');
        const corruptOriginPosition = openPosition('LONG', corruptOriginCampaign);
        const corruptOrigin = positionOriginCampaign(corruptOriginCampaign, corruptOriginPosition);
        corruptOrigin.schema_version = 'corrupt-origin-v0';
        const invalidatedBlockedOrigin = evaluated(completeInput('LONG', {
          campaign: corruptOriginCampaign,
          position: corruptOriginPosition,
          position_origin_campaign: corruptOrigin,
          hard_veto: activeVeto,
          execution_gate: closeGate,
          safety_gate_receipt: safetyGateReceipt(activeVeto, closeGate),
        }), 'invalidated-blocked-origin');
        const invalidatedBlockedOriginRecord = toFinalDecisionIntegrationRecord(invalidatedBlockedOrigin);
        if (invalidatedBlockedOrigin.status !== 'FAIL_CLOSED' ||
            invalidatedBlockedOrigin.position_state !== 'OPEN_LONG' ||
            invalidatedBlockedOrigin.source_quality.position !== 'CLOSED' ||
            invalidatedBlockedOrigin.source_quality.position_origin_campaign !== 'BLOCKED' ||
            invalidatedBlockedOrigin.risk_state !== 'INVALIDATED' ||
            invalidatedBlockedOrigin.management_intent !== 'NOT_EVALUATED' ||
            invalidatedBlockedOrigin.management_action !== 'NOT_EVALUATED' ||
            invalidatedBlockedOriginRecord.payload.engine_output !== invalidatedBlockedOrigin) {
          throw new Error('invalidated-blocked-origin-contract');
        }

        const unsafeEnvelopeCampaign = impulseCampaign('LONG');
        const unsafeEnvelopePosition = openPosition('LONG', unsafeEnvelopeCampaign);
        const invalidatedUnsafeEnvelope = evaluated(completeInput('LONG', {
          campaign: unsafeEnvelopeCampaign,
          position: unsafeEnvelopePosition,
          hard_veto: activeVeto,
          execution_gate: closeGate,
          safety_gate_receipt: safetyGateReceipt(activeVeto, closeGate),
          execution_authorized: true,
        }), 'invalidated-unsafe-envelope');
        const invalidatedUnsafeEnvelopeRecord = toFinalDecisionIntegrationRecord(
          invalidatedUnsafeEnvelope,
        );
        if (invalidatedUnsafeEnvelope.status !== 'FAIL_CLOSED' ||
            invalidatedUnsafeEnvelope.position_state !== 'OPEN_LONG' ||
            invalidatedUnsafeEnvelope.source_quality.position !== 'CLOSED' ||
            invalidatedUnsafeEnvelope.source_quality.position_origin_campaign !== 'CLOSED' ||
            invalidatedUnsafeEnvelope.risk_state !== 'INVALIDATED' ||
            invalidatedUnsafeEnvelope.management_intent !== 'NOT_EVALUATED' ||
            invalidatedUnsafeEnvelope.management_action !== 'NOT_EVALUATED' ||
            invalidatedUnsafeEnvelope.management_trigger_basis !== null ||
            invalidatedUnsafeEnvelopeRecord.payload.engine_output !== invalidatedUnsafeEnvelope) {
          throw new Error('invalidated-unsafe-envelope-contract');
        }

        const exitDeferred = structuredClone(exit);
        exitDeferred.management_action = 'NOT_EVALUATED';
        exitDeferred.management_action_id = null;
        exitDeferred.management_quality = 'INSUFFICIENT';
        exitDeferred.management_execution_quality = 'INSUFFICIENT';
        exitDeferred.execution_quality = 'INSUFFICIENT';
        exitDeferred.source_quality.management_execution = 'INSUFFICIENT';
        exitDeferred.action_identity.management = null;
        exitDeferred.reason_codes = ['MANAGEMENT_EXIT_ACTION_FEASIBILITY_INSUFFICIENT'];
        exitDeferred.decision_id = null;
        exitDeferred.material_digest = null;
        exitDeferred.material_digest = digest(exitDeferred);
        exitDeferred.decision_id = `FDI:${exitDeferred.contract_code}:${exitDeferred.observation_ts}:${exitDeferred.material_digest}`;
        const deferredValidation = validateFinalDecisionOutput(exitDeferred);
        if (!deferredValidation.valid) throw new Error(`exit-deferred:${deferredValidation.errors.join(',')}`);

        process.stdout.write(JSON.stringify({
          now: NOW, entryLong, entryShort, entryThreeDomain, hold, holdDecoupled,
          exit, exitAllTriggers,
          exitDeferred, failClosed, lineageCollision,
          crossObservation, crossFact, crossRoot, crossBlocked, crossConflicting,
          invalidatedBlockedPosition, invalidatedBlockedOrigin, invalidatedUnsafeEnvelope,
        }));
        """
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", source], cwd=ROOT,
        check=True, capture_output=True, text=True,
    )
    samples = json.loads(result.stdout)
    for name in (
        "entryLong", "entryShort", "entryThreeDomain", "hold", "holdDecoupled", "exit", "exitAllTriggers", "exitDeferred",
        "failClosed", "lineageCollision", "invalidatedBlockedPosition",
        "crossObservation", "crossFact", "crossRoot",
        "crossBlocked", "crossConflicting",
        "invalidatedBlockedOrigin",
        "invalidatedUnsafeEnvelope",
    ):
        output = samples[name]
        assert set(output) == ENGINE_OUTPUT_KEYS, (name, set(output) ^ ENGINE_OUTPUT_KEYS)
        assert set(output["lineage_receipts"]) == LINEAGE_KEYS, name
        assert output["shadow_outcome_collection_eligible"] is False, (
            "generic outcome flag must remain deprecated/fail-closed", name,
        )
    return samples


SAMPLES = engine_samples()
NOW = SAMPLES["now"]


class Clock:
    def __init__(self, now_ms=NOW):
        self.now_ms = now_ms

    def strftime(self, fmt, value=None, *modifiers):
        if fmt == "%s" and value == "now" and not modifiers:
            return str(self.now_ms // 1000)
        raise sqlite3.OperationalError("test clock only supports strftime('%s','now')")


def open_db(now_ms=NOW, database=":memory:", *, apply_migration=True):
    clock = Clock(now_ms)
    db = sqlite3.connect(database, isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    db.create_function("strftime", -1, clock.strftime)
    if apply_migration:
        db.executescript(MIGRATION)
    return db, clock


def workerd_migration_smoke():
    """Compile/apply and execute one trigger-heavy INSERT in local D1/workerd."""
    local = ROOT / "node_modules" / ".bin" / "wrangler"
    wrangler = str(local) if local.is_file() else shutil.which("wrangler")
    if not wrangler:
        return "SKIPPED_WRANGLER_UNAVAILABLE"
    with tempfile.TemporaryDirectory(prefix="fdi-d1-workerd-") as temporary:
        temporary_path = pathlib.Path(temporary)
        config = temporary_path / "wrangler.jsonc"
        worker = temporary_path / "worker.mjs"
        persist = temporary_path / "state"
        worker.write_text("export default { fetch() { return new Response('ok'); } };\n", encoding="utf-8")
        config.write_text(canonical({
            "name": "fdi-d1-migration-smoke",
            "main": str(worker),
            "compatibility_date": "2026-09-11",
            "d1_databases": [{
                "binding": "DATA_DB",
                "database_name": "fdi-d1-migration-smoke",
                "database_id": "00000000-0000-0000-0000-000000000001",
            }],
        }), encoding="utf-8")
        command = [
            wrangler, "d1", "execute", "fdi-d1-migration-smoke", "--local",
            f"--config={config}", f"--file={MIGRATION_PATH}", f"--persist-to={persist}",
        ]
        result = subprocess.run(
            command, cwd=ROOT, capture_output=True, text=True, timeout=120,
        )
        assert result.returncode == 0, (
            "local workerd rejected migration", command, result.stdout[-4000:], result.stderr[-4000:],
        )
        reapplied = subprocess.run(
            command, cwd=ROOT, capture_output=True, text=True, timeout=120,
        )
        reapply_output = f"{reapplied.stdout}\n{reapplied.stderr}".lower()
        assert reapplied.returncode != 0 and "already exists" in reapply_output, (
            "local workerd migration did not fail loud on reapply", command,
            reapplied.stdout[-4000:], reapplied.stderr[-4000:],
        )
        current_ms = int(time.time() * 1000)
        output = new_entry_action(
            SAMPLES["entryLong"], contract="WORKERD-USDT", observed_ts=current_ms,
            snapshot_id="WORKERD-SMOKE-1", nonce=9_000_001,
        )

        def sql_literal(value):
            if value is None:
                return "NULL"
            if isinstance(value, (int, float)):
                return str(value)
            return "'" + str(value).replace("'", "''") + "'"

        insert_sql = (
            f"INSERT INTO final_decision_integration_shadow({','.join(MAIN_COLUMNS)}) VALUES("
            + ",".join(sql_literal(value) for value in values(output, current_ms))
            + ");"
        )
        execute_command = [
            wrangler, "d1", "execute", "fdi-d1-migration-smoke", "--local", "--json",
            f"--config={config}", f"--command={insert_sql}", f"--persist-to={persist}",
        ]
        executed = subprocess.run(
            execute_command, cwd=ROOT, capture_output=True, text=True, timeout=120,
        )
        assert executed.returncode == 0, (
            "local workerd rejected guarded INSERT", execute_command[:7],
            executed.stdout[-4000:], executed.stderr[-4000:],
        )
        response = json.loads(executed.stdout)
        statement_result = response[0] if isinstance(response, list) else response
        assert statement_result.get("success") is True, statement_result
        meta = statement_result.get("meta") or {}
        duration = meta.get("duration")
        assert isinstance(duration, (int, float)) and duration >= 0, meta
        return f"PASSED(duration_ms={duration};billing_meta=unavailable_in_cli)"


def receipt_id(output, key):
    return output["lineage_receipts"][key]["receipt_id"]


def values(output, persisted_ts=None):
    if persisted_ts is None:
        persisted_ts = output["observation_ts"]
    mapping = {
        "decision_id": output["decision_id"],
        "schema_version": "final-decision-integration-shadow-v1",
        "mode": "SHADOW_ONLY_NO_EXECUTION",
        "material_digest": output["material_digest"],
        "input_lineage_digest": output["input_lineage_digest"],
        "snapshot_id": output["snapshot_id"],
        "engine_version": output["version"],
        "rules_version": output["rules_version"],
        "decision_status": output["status"],
        "contract_code": output["contract_code"],
        "observation_ts": output["observation_ts"],
        "direction": output["direction"],
        "directional_quality": output["directional_quality"],
        "entry_action": output["entry_action"],
        "entry_action_id": output["entry_action_id"],
        "entry_quality": output["entry_quality"],
        "data_quality": output["data_quality"],
        "execution_quality": output["execution_quality"],
        "entry_execution_quality": output["entry_execution_quality"],
        "management_execution_quality": output["management_execution_quality"],
        "campaign_phase": output["campaign_phase"],
        "campaign_quality": output["campaign_quality"],
        "independence_state": output["independence_state"],
        "timing_state": output["timing_state"],
        "risk_state": output["risk_state"],
        "position_state": output["position_state"],
        "management_action": output["management_action"],
        "management_intent": output["management_intent"],
        "management_action_id": output["management_action_id"],
        "management_quality": output["management_quality"],
        "hard_veto": int(output["hard_veto"]),
        "hard_veto_state": output["hard_veto_state"],
        "calibration_eligible": int(output["calibration_eligible"]),
        "shadow_outcome_collection_eligible": int(output["shadow_outcome_collection_eligible"]),
        "shadow_only": int(output["shadow_only"]),
        "live_probability": output["live_probability"],
        "validated_signal": int(output["validated_signal"]),
        "execution_authorized": int(output["execution_authorized"]),
        "telegram_eligible": int(output["telegram_eligible"]),
        "decision_evidence_receipt_id": receipt_id(output, "decision_evidence"),
        "full_evidence_receipt_id": receipt_id(output, "full_evidence"),
        "full_evidence_source_receipt_id": receipt_id(output, "full_evidence_source"),
        "opportunity_receipt_id": receipt_id(output, "opportunity"),
        "campaign_receipt_id": receipt_id(output, "campaign"),
        "safety_gate_receipt_id": receipt_id(output, "safety_gate"),
        "position_receipt_id": receipt_id(output, "position"),
        "position_origin_campaign_receipt_id": receipt_id(output, "position_origin_campaign"),
        "position_management_receipt_id": receipt_id(output, "position_management"),
        "reason_codes_json": canonical(output["reason_codes"]),
        "decision_json": canonical(output),
        "persisted_ts": persisted_ts,
    }
    assert set(mapping) == set(MAIN_COLUMNS)
    return tuple(mapping[column] for column in MAIN_COLUMNS)


def insert(db, output, persisted_ts=None, *, deduplicate=False):
    sql = INSERT_SQL + (" ON CONFLICT(decision_id) DO NOTHING" if deduplicate else "")
    return db.execute(sql, values(output, persisted_ts))


def rejected(db, output, persisted_ts=None, *, raw_values=None, message=None):
    try:
        db.execute(INSERT_SQL, raw_values if raw_values is not None else values(output, persisted_ts))
    except sqlite3.DatabaseError as error:
        if message is not None:
            assert message in str(error), (message, str(error))
        return str(error)
    raise AssertionError("unsafe/corrupt record was accepted")


def reseal_for_sql(output, *, contract=None, observed_ts=None, snapshot_id=None, nonce=1):
    """Create a unique SQL-contract row; cryptographic sealing stays a JS-layer duty."""
    cloned = copy.deepcopy(output)
    if contract is not None:
        cloned["contract_code"] = contract
        if cloned["action_identity"]["entry"] is not None:
            cloned["action_identity"]["entry"]["contract_code"] = contract
        if cloned["action_identity"]["management"] is not None:
            cloned["action_identity"]["management"]["contract_code"] = contract
    if observed_ts is not None:
        cloned["observation_ts"] = observed_ts
        latency = cloned.get("opportunity_latency")
        if isinstance(latency, dict):
            def lag(later, earlier):
                return later - earlier if (
                    isinstance(later, int) and isinstance(earlier, int) and later >= earlier
                ) else None

            latency["detection_lag_ms"] = lag(
                latency.get("first_detected_ts"), latency.get("event_ts"),
            )
            latency["detection_lag_from_close_ms"] = lag(
                latency.get("first_detected_ts"), latency.get("event_close_ts"),
            )
            latency["entry_lag_from_detection_ms"] = lag(
                latency.get("entry_trigger_ts"), latency.get("first_detected_ts"),
            )
            latency["observation_age_from_event_ms"] = lag(
                observed_ts, latency.get("event_ts"),
            )
    if snapshot_id is not None:
        cloned["snapshot_id"] = snapshot_id
    cloned["material_digest"] = f"{nonce & ((1 << 64) - 1):016x}"
    cloned["decision_id"] = (
        f"FDI:{cloned['contract_code']}:{cloned['observation_ts']}:{cloned['material_digest']}"
    )
    return cloned


def actionless(output, *, contract, observed_ts, snapshot_id, nonce):
    cloned = reseal_for_sql(
        output, contract=contract, observed_ts=observed_ts, snapshot_id=snapshot_id, nonce=nonce,
    )
    cloned["entry_action"] = "WAIT"
    cloned["entry_action_id"] = None
    cloned["entry_quality"] = "INSUFFICIENT"
    cloned["campaign_phase"] = "DISCOVERY"
    cloned["timing_state"] = "EARLY"
    cloned["action_identity"]["entry"] = None
    return cloned


def new_entry_action(output, *, contract, observed_ts, snapshot_id, nonce, action_id=None):
    cloned = reseal_for_sql(
        output, contract=contract, observed_ts=observed_ts, snapshot_id=snapshot_id, nonce=nonce,
    )
    basis = cloned["action_identity"]["entry"]
    basis["campaign_id"] = f"MW:{contract}:{nonce}"
    basis["wave_id"] = f"MW:{contract}:{nonce}:W1"
    basis["entry_trigger_ts"] = observed_ts - 1
    cloned["entry_action_id"] = action_id or f"FDE:{nonce & ((1 << 64) - 1):016x}"
    return cloned


def raw_with(output, changes, *, persisted_ts=None):
    row = dict(zip(MAIN_COLUMNS, values(output, persisted_ts)))
    row.update(changes)
    return tuple(row[column] for column in MAIN_COLUMNS)


def test_fail_loud_schema_and_manifest():
    assert MIGRATION_PATH.name.startswith("20260914_")
    assert not (ROOT / "migrations/20260913_final_decision_integration_shadow.sql").exists()
    executable_sql = "\n".join(line.split("--", 1)[0] for line in MIGRATION.splitlines())
    assert "IF NOT EXISTS" not in executable_sql.upper()
    runtime_source = (ROOT / "src/final-decision-integration-runtime.mjs").read_text(encoding="utf-8")
    # Stage 3.9.2 may persist through INSERT ... SELECT ... WHERE EXISTS(CAS)
    # instead of only INSERT ... VALUES. Parse just the explicit target column
    # list, then verify the first 51 placeholders remain a one-to-one mapping
    # to the immutable Final Decision schema. The optional CAS tail must be
    # exactly ?52/?53/?54 and must reference the virtual-position ledger.
    runtime_insert = re.search(
        r"INSERT INTO final_decision_integration_shadow\s*\(\s*(.*?)\s*\)\s*(?:SELECT|VALUES\s*\()",
        runtime_source, re.DOTALL,
    )
    assert runtime_insert is not None
    runtime_columns = [item for item in re.sub(r"\s+", "", runtime_insert.group(1)).split(",") if item]
    assert runtime_columns == MAIN_COLUMNS, (runtime_columns, MAIN_COLUMNS)

    prepared_end = runtime_source.find('` : `', runtime_insert.end())
    assert prepared_end > runtime_insert.end()
    cas_branch = runtime_source[runtime_insert.end():prepared_end]
    runtime_placeholders = re.findall(r"\?(\d+)", cas_branch)
    assert runtime_placeholders[:len(MAIN_COLUMNS)] == [
        str(index) for index in range(1, len(MAIN_COLUMNS) + 1)
    ]
    assert runtime_placeholders[len(MAIN_COLUMNS):] == ["52", "53", "54"]
    assert "shadow_virtual_position_ledger" in cas_branch
    assert "contract_code=?52" in re.sub(r"\s+", "", cas_branch)
    assert "state=?53" in re.sub(r"\s+", "", cas_branch)
    assert "state_revision=?54" in re.sub(r"\s+", "", cas_branch)


    bind_call = re.search(
        r"const statement = prepared\.bind\((.*?)\n\s*\);",
        runtime_source, re.DOTALL,
    )
    assert bind_call is not None
    bind_expressions = [
        re.sub(r"\s+", " ", expression).strip()
        for expression in bind_call.group(1).split(",") if expression.strip()
    ]
    special_bind_expressions = {
        "schema_version": "FINAL_DECISION_INTEGRATION_SCHEMA_VERSION",
        "mode": "FINAL_DECISION_INTEGRATION_MODE",
        "hard_veto": "record.hard_veto ? 1 : 0",
        "calibration_eligible": "record.calibration_eligible ? 1 : 0",
        "shadow_outcome_collection_eligible": (
            "record.shadow_outcome_collection_eligible ? 1 : 0"
        ),
        "shadow_only": "record.shadow_only ? 1 : 0",
        "validated_signal": "record.validated_signal ? 1 : 0",
        "execution_authorized": "record.execution_authorized ? 1 : 0",
        "telegram_eligible": "record.telegram_eligible ? 1 : 0",
        "reason_codes_json": "validation.reason_codes_json",
        "decision_json": "validation.decision_json",
        "persisted_ts": "now",
    }
    expected_bind_expressions = [
        special_bind_expressions.get(column, f"record.{column}")
        for column in MAIN_COLUMNS
    ]
    assert bind_expressions[:len(expected_bind_expressions)] == expected_bind_expressions, list(enumerate(zip(
        MAIN_COLUMNS, bind_expressions[:len(expected_bind_expressions)], expected_bind_expressions,
    ), start=1))
    bind_tail = " ".join(bind_expressions[len(expected_bind_expressions):])
    assert "positionCas.contract_code" in bind_tail
    assert "positionCas.state" in bind_tail
    assert "positionCas.state_revision" in bind_tail

    db, _ = open_db()
    main_columns = [row[1] for row in db.execute("PRAGMA table_info(final_decision_integration_shadow)")]
    action_columns = [row[1] for row in db.execute("PRAGMA table_info(final_decision_action_claim_shadow)")]
    assert main_columns == MAIN_COLUMNS + STORAGE_FUSE_COLUMNS, main_columns
    assert action_columns == ACTION_COLUMNS, action_columns
    table_flags = {
        row[1]: (row[4], row[5]) for row in db.execute("PRAGMA table_list")
        if row[1] in {"final_decision_integration_shadow", "final_decision_action_claim_shadow"}
    }
    assert table_flags == {
        "final_decision_integration_shadow": (1, 1),
        "final_decision_action_claim_shadow": (1, 1),
    }, table_flags
    explicit_indexes = {
        row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='index'")
        if not row[0].startswith("sqlite_autoindex_")
    }
    assert explicit_indexes == {
        "idx_final_decision_observation", "idx_final_decision_action_claim_expiry",
        "idx_final_decision_action_claim_contract",
    }
    expected_triggers = {
        "trg_final_decision_clock_guard", "trg_final_decision_duplicate_collision_guard",
        "trg_final_decision_observation_collision_guard", "trg_final_decision_snapshot_collision_guard",
        "trg_final_decision_contract_admission_guard", "trg_final_decision_global_admission_guard",
        "trg_final_decision_json_insert_guard", "trg_final_decision_immutable_update_guard",
        "trg_final_decision_json_identity_guard", "trg_final_decision_json_entry_scalar_guard",
        "trg_final_decision_json_management_scalar_guard", "trg_final_decision_json_reason_guard",
        "trg_final_decision_json_lineage_shape_guard", "trg_final_decision_json_lineage_parity_guard",
        "trg_final_decision_json_lineage_collision_guard",
        "trg_final_decision_json_semantic_guard", "trg_final_decision_json_source_quality_guard",
        "trg_final_decision_json_source_lineage_guard",
        "trg_final_decision_json_explainability_guard",
        "trg_final_decision_json_explainability_utf16_guard",
        "trg_final_decision_json_strict_chain_guard",
        "trg_final_decision_json_independence_shape_guard",
        "trg_final_decision_json_independence_value_guard",
        "trg_final_decision_json_independence_count_derivation_guard",
        "trg_final_decision_json_suppressed_utf16_guard",
        "trg_final_decision_json_raw_support_derivation_guard",
        "trg_final_decision_json_causal_domain_guard",
        "trg_final_decision_json_causal_domain_list_guard",
        "trg_final_decision_json_causal_domain_classification_guard",
        "trg_final_decision_json_causal_domain_state_derivation_guard",
        "trg_final_decision_json_flat_invalidation_risk_guard",
        "trg_final_decision_json_independence_closure_guard",
        "trg_final_decision_json_effective_domain_derivation_guard",
        "trg_final_decision_json_cross_plane_guard",
        "trg_final_decision_json_cross_plane_report_identity_guard",
        "trg_final_decision_json_cross_plane_report_list_guard",
        "trg_final_decision_json_cross_plane_source_root_text_guard",
        "trg_final_decision_json_cross_plane_source_root_codepoint_guard",
        "trg_final_decision_json_cross_plane_derivation_guard",
        "trg_final_decision_json_correlation_closure_guard",
        "trg_final_decision_json_latency_shape_guard",
        "trg_final_decision_json_latency_coherence_guard",
        "trg_final_decision_json_safety_envelope_guard",
        "trg_final_decision_json_recursive_safety_guard",
        "trg_final_decision_json_action_identity_guard",
        "trg_final_decision_json_management_trigger_shape_guard",
        "trg_final_decision_json_management_trigger_source_guard",
        "trg_final_decision_json_management_trigger_origin_guard",
        "trg_final_decision_action_collision_guard", "trg_final_decision_action_target_collision_guard",
        "trg_final_decision_action_claim_contract_capacity_guard",
        "trg_final_decision_action_claim_global_capacity_guard",
        "trg_final_decision_action_claim_immutable_guard", "trg_final_decision_action_claims",
        "trg_final_decision_bounded_retention",
    }
    triggers = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
    assert triggers == expected_triggers, triggers ^ expected_triggers
    try:
        db.executescript(MIGRATION)
    except sqlite3.DatabaseError as error:
        assert "already exists" in str(error)
    else:
        raise AssertionError("second migration application silently succeeded")
    db.close()

    malformed = sqlite3.connect(":memory:", isolation_level=None)
    malformed.execute("CREATE TABLE final_decision_integration_shadow(decision_id TEXT)")
    try:
        malformed.executescript(MIGRATION)
    except sqlite3.DatabaseError as error:
        assert "already exists" in str(error)
    else:
        raise AssertionError("pre-existing malformed schema was accepted")
    assert [row[1] for row in malformed.execute(
        "PRAGMA table_info(final_decision_integration_shadow)"
    )] == ["decision_id"]
    malformed.close()


def test_valid_contract_idempotency_and_collisions():
    for sample_name, action in (
        ("entryLong", "SHADOW_ENTRY_ELIGIBLE"),
        ("entryShort", "SHADOW_ENTRY_ELIGIBLE"),
        ("entryThreeDomain", "SHADOW_ENTRY_ELIGIBLE"),
        ("hold", "HOLD"),
        ("holdDecoupled", "HOLD"),
        ("exit", "EXIT"),
        ("exitAllTriggers", "EXIT"),
        ("exitDeferred", "NOT_EVALUATED"),
        ("failClosed", "NOT_EVALUATED"),
        ("lineageCollision", "NOT_EVALUATED"),
        ("crossObservation", "NOT_EVALUATED"),
        ("crossFact", "NOT_EVALUATED"),
        ("crossRoot", "NOT_EVALUATED"),
        ("crossBlocked", "NOT_EVALUATED"),
        ("crossConflicting", "NOT_EVALUATED"),
        ("invalidatedBlockedPosition", "NOT_EVALUATED"),
        ("invalidatedBlockedOrigin", "NOT_EVALUATED"),
        ("invalidatedUnsafeEnvelope", "NOT_EVALUATED"),
    ):
        db, _ = open_db()
        sample = SAMPLES[sample_name]
        insert(db, sample)
        selected = "entry_action" if action.startswith("SHADOW") else "management_action"
        assert db.execute(f"SELECT {selected} FROM final_decision_integration_shadow").fetchone()[0] == action
        if sample_name == "exitDeferred":
            assert db.execute(
                "SELECT management_intent,management_action,management_quality "
                "FROM final_decision_integration_shadow"
            ).fetchone() == ("EXIT_REQUIRED", "NOT_EVALUATED", "INSUFFICIENT")
        if sample_name == "exit":
            assert db.execute(
                "SELECT action_kind,direction FROM final_decision_action_claim_shadow"
            ).fetchone() == ("EXIT", "LONG")
        db.close()

    db, _ = open_db()
    fail_closed_exit = reseal_for_sql(
        SAMPLES["exit"], contract="FAIL-CLOSED-EXIT-USDT",
        snapshot_id="FAIL-CLOSED-EXIT", nonce=88_001,
    )
    fail_closed_exit["status"] = "FAIL_CLOSED"
    rejected(db, fail_closed_exit)

    fail_closed_deferred = reseal_for_sql(
        SAMPLES["exit"], contract="FAIL-CLOSED-DEFERRED-USDT",
        snapshot_id="FAIL-CLOSED-DEFERRED", nonce=88_002,
    )
    fail_closed_deferred["status"] = "FAIL_CLOSED"
    fail_closed_deferred["management_action"] = "NOT_EVALUATED"
    fail_closed_deferred["management_action_id"] = None
    fail_closed_deferred["management_quality"] = "BLOCKED"
    fail_closed_deferred["action_identity"]["management"] = None
    insert(db, fail_closed_deferred)
    assert db.execute(
        "SELECT management_intent,management_action,management_execution_quality "
        "FROM final_decision_integration_shadow"
    ).fetchone() == ("EXIT_REQUIRED", "NOT_EVALUATED", "CLOSED")
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow"
    ).fetchone()[0] == 0
    db.close()

    db, clock = open_db()
    base = SAMPLES["entryLong"]
    insert(db, base)
    stored = db.execute(
        """SELECT shadow_only,live_probability,validated_signal,execution_authorized,
                  telegram_eligible,live_signal,trading_execution,strategy_weights_changed,
                  automatic_weight_tuning FROM final_decision_integration_shadow"""
    ).fetchone()
    assert stored == (1, None, 0, 0, 0, 0, 0, 0, 0)
    original_persisted = db.execute("SELECT persisted_ts FROM final_decision_integration_shadow").fetchone()[0]

    clock.now_ms += 1000
    before = db.total_changes
    insert(db, base, persisted_ts=clock.now_ms, deduplicate=True)
    assert db.total_changes == before
    assert db.execute("SELECT persisted_ts FROM final_decision_integration_shadow").fetchone()[0] == original_persisted

    changed = copy.deepcopy(base)
    changed["reason_codes"] = ["CHANGED_IMMUTABLE_DECISION"]
    rejected(db, changed, clock.now_ms, message="final decision id collision")

    observation_collision = reseal_for_sql(
        base, observed_ts=base["observation_ts"], snapshot_id="OBS-COLLISION", nonce=101,
    )
    rejected(db, observation_collision, clock.now_ms, message="final decision observation collision")

    snapshot_collision = reseal_for_sql(
        base, observed_ts=base["observation_ts"] + 1, snapshot_id=base["snapshot_id"], nonce=102,
    )
    rejected(db, snapshot_collision, clock.now_ms, message="final decision snapshot collision")

    try:
        db.execute(
            "UPDATE final_decision_integration_shadow SET risk_state='CAUTION' WHERE decision_id=?",
            (base["decision_id"],),
        )
    except sqlite3.DatabaseError as error:
        assert "immutable" in str(error)
    else:
        raise AssertionError("immutable decision was updated")
    db.close()


def test_json_parity_safety_temporal_and_state_guards():
    db, clock = open_db()
    base = SAMPLES["entryLong"]

    for index, (phase, timing) in enumerate((
        ("DISCOVERY", "EARLY"), ("DISCOVERY", "LATE"),
        ("PRE_IMPULSE_WATCH", "EARLY"), ("ENTRY_CANDIDATE", "EARLY"),
        ("ENTRY_TRIGGER", "ENTRY_WINDOW"), ("ENTRY_TRIGGER", "LATE"),
        ("NEXT_IMPULSE_ENTRY", "ENTRY_WINDOW"), ("IMPULSE", "ACTIVE_MOVE"),
        ("IMPULSE", "LATE"), ("RELOAD_BASE", "RELOAD"),
        ("NEXT_IMPULSE_WATCH", "RELOAD"), ("EXHAUSTION_WARNING", "LATE"),
        ("EDGE_SPENT", "EDGE_SPENT"), ("CLOSED", "EDGE_SPENT"),
    ), start=1):
        allowed_timing = actionless(
            base, contract=f"TIMING-{index}-USDT", observed_ts=NOW,
            snapshot_id=f"TIMING-ALLOWED-{index}", nonce=55_000 + index,
        )
        allowed_timing["campaign_phase"] = phase
        allowed_timing["timing_state"] = timing
        insert(db, allowed_timing)

    invalid_hold_timing = reseal_for_sql(
        SAMPLES["holdDecoupled"], contract="TIMING-HOLD-USDT",
        snapshot_id="TIMING-HOLD-INVALID", nonce=55_100,
    )
    invalid_hold_timing["timing_state"] = "EARLY"
    rejected(db, invalid_hold_timing, message="ck_final_decision_campaign_timing")

    invalid_campaign_quality = actionless(
        base, contract="TIMING-QUALITY-USDT", observed_ts=NOW,
        snapshot_id="TIMING-QUALITY-INVALID", nonce=55_101,
    )
    invalid_campaign_quality["campaign_quality"] = "PARTIAL"
    invalid_campaign_quality["source_quality"]["campaign"] = "PARTIAL"
    rejected(db, invalid_campaign_quality)

    rejected(db, base, raw_values=raw_with(base, {"decision_json": "{}"}))
    mismatch = copy.deepcopy(base)
    mismatch["direction"] = "SHORT"
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(mismatch)}))
    reason_mismatch = copy.deepcopy(base)
    reason_mismatch["reason_codes"] = ["DIFFERENT_REASON"]
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(reason_mismatch)}))
    unknown = copy.deepcopy(base)
    unknown["unknown_live_switch"] = False
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(unknown)}))

    missing_nullable = copy.deepcopy(base)
    del missing_nullable["management_action_id"]
    duplicate_key_json = canonical(missing_nullable)[:-1] + ',"entry_action_id":null}'
    rejected(db, base, raw_values=raw_with(base, {"decision_json": duplicate_key_json}))

    nested_duplicate_json = canonical(base).replace(
        '"no_score_aggregation_used":true',
        '"no_score_aggregation_used":true,"no_score_aggregation_used":true',
        1,
    )
    assert nested_duplicate_json != canonical(base)
    rejected(
        db, base, raw_values=raw_with(base, {"decision_json": nested_duplicate_json}),
        message="duplicate JSON key",
    )

    for key, unsafe_value in (
        ("live.signal", True),
        ("Live_Signal", True),
        ("live_signаl", True),  # Cyrillic U+0430.
    ):
        unsafe = copy.deepcopy(base)
        unsafe["explainability"][key] = unsafe_value
        rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(unsafe)}))

    for invalid_key in ("note.text", "note-text", "note text"):
        invalid = copy.deepcopy(base)
        invalid["explainability"][invalid_key] = "harmless"
        rejected(
            db, base, raw_values=raw_with(base, {"decision_json": canonical(invalid)}),
            message="JSON key guard",
        )

    for key, unsafe_value in (
        ("live_probability", 0),
        ("validated_signal", True),
        ("execution_authorized", True),
        ("calibration_eligible", True),
        ("shadow_outcome_collection_eligible", True),
        ("statistical_independence_validated", True),
    ):
        unsafe = copy.deepcopy(base)
        unsafe["explainability"][key] = unsafe_value
        rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(unsafe)}))

    for key, value in (
        ("source_ts", base["observation_ts"] + 1),
        ("as_of_ts", base["observation_ts"] + 1),
        ("source_ts", "1789329600000"),
        ("source_ts", float(base["observation_ts"])),
    ):
        future = copy.deepcopy(base)
        future["explainability"][key] = value
        rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(future)}))

    unicode_contract = reseal_for_sql(base, contract="TЕST-USDT", nonce=111)  # Cyrillic U+0415.
    rejected(db, unicode_contract)
    oversized = copy.deepcopy(base)
    oversized["explainability"]["note"] = "x" * 25000
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(oversized)}))

    for index, field in enumerate((
        "confirming_evidence", "contradictory_evidence", "blockers",
        "missing_or_unusable", "suppressed_evidence",
    ), start=1):
        utf16_boundary = actionless(
            base, contract=f"UTF16-{index}-USDT", observed_ts=NOW,
            snapshot_id=f"UTF16-BOUNDARY-{index}", nonce=61_000 + index,
        )
        utf16_boundary["explainability"][field] = ["\U0001f642" * 128]
        insert(db, utf16_boundary)

        utf16_overflow = actionless(
            base, contract=f"UTF16-X-{index}-USDT", observed_ts=NOW,
            snapshot_id=f"UTF16-OVERFLOW-{index}", nonce=62_000 + index,
        )
        utf16_overflow["explainability"][field] = ["\U0001f642" * 129]
        rejected(
            db, utf16_overflow,
            message="explainability UTF-16 length guard",
        )

    veto_bypass = copy.deepcopy(base)
    veto_bypass["hard_veto"] = True
    veto_bypass["hard_veto_state"] = "ACTIVE"
    veto_bypass["risk_state"] = "INVALIDATED"
    veto_bypass["source_quality"]["hard_veto"] = "CLOSED"
    rejected(db, veto_bypass)
    state_mismatch = copy.deepcopy(base)
    state_mismatch["hard_veto_state"] = "BLOCKED"
    state_mismatch["source_quality"]["hard_veto"] = "BLOCKED"
    rejected(db, state_mismatch)
    wrong_lane = copy.deepcopy(base)
    wrong_lane["management_execution_quality"] = "CLOSED"
    wrong_lane["source_quality"]["management_execution"] = "CLOSED"
    rejected(db, wrong_lane)
    legacy_phase = copy.deepcopy(base)
    legacy_phase["campaign_phase"] = "DIRECTIONLESS"
    rejected(db, legacy_phase)
    bad_action_basis = copy.deepcopy(base)
    bad_action_basis["action_identity"]["entry"]["entry_trigger_ts"] = base["observation_ts"] + 1
    rejected(db, bad_action_basis)
    wrong_action_direction = copy.deepcopy(base)
    wrong_action_direction["action_identity"]["entry"]["direction"] = (
        "SHORT" if base["direction"] == "LONG" else "LONG"
    )
    rejected(db, wrong_action_direction)
    wrong_exit_direction = copy.deepcopy(SAMPLES["exit"])
    wrong_exit_direction["action_identity"]["management"]["position_direction"] = "SHORT"
    rejected(db, wrong_exit_direction)
    deprecated_outcome = copy.deepcopy(base)
    deprecated_outcome["shadow_outcome_collection_eligible"] = True
    rejected(db, deprecated_outcome)

    nul_key = copy.deepcopy(base)
    nul_key["explainability"]["live\x00_signal"] = True
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(nul_key)}),
        message="JSON key guard",
    )
    non_finite = copy.deepcopy(base)
    non_finite["explainability"]["non_finite_probe"] = "__FDI_INFINITY__"
    non_finite_json = canonical(non_finite).replace('"__FDI_INFINITY__"', "1e999")
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": non_finite_json}),
        message="JSON scalar guard",
    )

    nul_contract = actionless(
        base, contract="TEST-USDT\x00EVIL", observed_ts=NOW,
        snapshot_id="NUL-CONTRACT", nonce=112,
    )
    rejected(db, nul_contract)

    blocked_source = copy.deepcopy(base)
    blocked_source["source_quality"]["full_evidence"] = "BLOCKED"
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(blocked_source)}))
    blocked_position_source = copy.deepcopy(base)
    blocked_position_source["source_quality"]["position"] = "BLOCKED"
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(blocked_position_source)}),
    )
    missing_source_key = copy.deepcopy(base)
    del missing_source_key["source_quality"]["position"]
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(missing_source_key)}))
    empty_closed_chains = copy.deepcopy(base)
    empty_closed_chains["source_quality"]["strict_weighted_chain_status"] = {}
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(empty_closed_chains)}),
        message="strict-chain shape guard",
    )
    oversized_chain_count = copy.deepcopy(base)
    oversized_chain_count["source_quality"]["strict_weighted_chain_status"][
        "CROSS_EXCHANGE_DERIVATIVES"
    ]["eligible_rows"] = 999
    rejected(db, oversized_chain_count, message="strict-chain state guard")

    partial_independence_with_closed_direction = copy.deepcopy(base)
    partial_independence_with_closed_direction["independence_state"] = "PARTIAL"
    partial_independence_with_closed_direction["evidence_independence"]["status"] = "PARTIAL"
    rejected(db, partial_independence_with_closed_direction)

    malformed_correlated_cross_plane = copy.deepcopy(SAMPLES["failClosed"])
    malformed_correlated_cross_plane["independence_state"] = "CORRELATED"
    malformed_correlated_cross_plane["evidence_independence"]["status"] = "CORRELATED"
    malformed_correlated_cross_plane["evidence_independence"]["cross_plane_reuse"] = {}
    rejected(
        db, malformed_correlated_cross_plane,
        message="cross-plane shape guard",
    )

    null_cross_plane_state = copy.deepcopy(SAMPLES["failClosed"])
    null_cross_plane_state["independence_state"] = "CORRELATED"
    null_cross_plane_state["evidence_independence"]["status"] = "CORRELATED"
    null_cross_plane_state["evidence_independence"]["cross_plane_reuse"]["state"] = None
    rejected(db, null_cross_plane_state, message="cross-plane shape guard")

    closed_wrong_reuse_digest = copy.deepcopy(base)
    closed_wrong_reuse_digest["evidence_independence"]["cross_plane_reuse"][
        "all_reuse_digest"
    ] = "0000000000000000"
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(closed_wrong_reuse_digest)}),
        message="correlated evidence hidden behind CLOSED",
    )

    null_report_kind = copy.deepcopy(SAMPLES["crossObservation"])
    null_report_kind["evidence_independence"]["cross_plane_reuse"]["reports"][0][
        "kind"
    ] = None
    rejected(db, null_report_kind, message="cross-plane")

    null_report_identity = copy.deepcopy(SAMPLES["crossObservation"])
    null_report_identity["evidence_independence"]["cross_plane_reuse"]["reports"][0][
        "identity"
    ] = None
    rejected(db, null_report_identity, message="cross-plane identity guard")

    for field, hostile_value in (
        ("source", "HTX\nOFFICIAL"),
        ("venue", "HTX\u202eOFFICIAL"),
        ("metric", "PRICE\x7fCLOSE"),
        ("source", "\u00a0HTX"),
        ("venue", "HTX\u3000"),
        ("metric", "\ufeffprice"),
        ("source", "😀" * 81),
    ):
        hostile_root_identity = copy.deepcopy(SAMPLES["crossRoot"])
        hostile_root_identity["evidence_independence"]["cross_plane_reuse"][
            "reports"
        ][0]["identity"][field] = hostile_value
        rejected(
            db, hostile_root_identity,
            message=(
                "cross-plane source-root text guard"
                if hostile_value == "😀" * 81
                else "cross-plane source-root"
            ),
        )

    for hostile_value in (
        "htx official",
        "HTX_OFFICIAL",
        "htx\u200bofficial",
        "htx\u00adofficial",
        "htx\U000e0100official",
    ):
        hostile_root_identity = copy.deepcopy(SAMPLES["crossRoot"])
        hostile_root_identity["evidence_independence"]["cross_plane_reuse"][
            "reports"
        ][0]["identity"]["source"] = hostile_value
        rejected(
            db, hostile_root_identity,
            message="cross-plane source-root codepoint guard",
        )

    null_report_id = copy.deepcopy(SAMPLES["crossObservation"])
    null_report_id["evidence_independence"]["cross_plane_reuse"]["reports"][0][
        "decision_evidence_ids"
    ] = [None]
    rejected(db, null_report_id, message="cross-plane report list guard")

    duplicate_report_ids = copy.deepcopy(SAMPLES["crossObservation"])
    duplicate_report = duplicate_report_ids["evidence_independence"]["cross_plane_reuse"][
        "reports"
    ][0]
    duplicate_report["decision_evidence_ids"] = ["EVIDENCE:1", "EVIDENCE:1"]
    duplicate_report["decision_evidence_count"] = 2
    rejected(db, duplicate_report_ids, message="cross-plane report list guard")

    mismatched_report_count = copy.deepcopy(SAMPLES["crossObservation"])
    mismatched_report_count["evidence_independence"]["cross_plane_reuse"]["reports"][0][
        "decision_evidence_count"
    ] = 2
    rejected(db, mismatched_report_count, message="cross-plane report list guard")

    wrong_cross_plane_reason = copy.deepcopy(SAMPLES["crossObservation"])
    wrong_cross_plane_reason["evidence_independence"]["cross_plane_reuse"][
        "reason_codes"
    ] = ["CROSS_PLANE_UNKNOWN_REUSE:0000000000000000"]
    rejected(db, wrong_cross_plane_reason, message="cross-plane derivation guard")

    malformed_partial_domains = copy.deepcopy(SAMPLES["failClosed"])
    malformed_partial_domains["independence_state"] = "PARTIAL"
    malformed_partial_domains["evidence_independence"]["status"] = "PARTIAL"
    malformed_partial_domains["evidence_independence"]["causal_domains"] = {}
    rejected(
        db, malformed_partial_domains,
        message="causal-domain set guard",
    )

    null_domain_state = copy.deepcopy(base)
    null_domain_state["evidence_independence"]["causal_domains"][
        "REGIME_CONTEXT"
    ]["state"] = None
    rejected(db, null_domain_state, message="causal-domain shape guard")

    numeric_invalidation_id = copy.deepcopy(base)
    numeric_invalidation_id["evidence_independence"]["causal_domains"][
        "REGIME_CONTEXT"
    ]["invalidates_long_ids"] = [0]
    rejected(db, numeric_invalidation_id)

    duplicate_domain_ids = copy.deepcopy(base)
    price_domain = duplicate_domain_ids["evidence_independence"]["causal_domains"][
        "PRICE_ACTION"
    ]
    price_domain["evidence_ids"].append(price_domain["evidence_ids"][0])
    rejected(db, duplicate_domain_ids, message="causal-domain id list guard")

    oversized_domain_ids = copy.deepcopy(base)
    oversized_price_domain = oversized_domain_ids["evidence_independence"][
        "causal_domains"
    ]["PRICE_ACTION"]
    oversized_price_domain["evidence_ids"] = [
        *oversized_price_domain["evidence_ids"],
        *(f"PRICE-EXTRA-{index:02d}" for index in range(16)),
    ]
    rejected(db, oversized_domain_ids, message="causal-domain shape guard")

    wrong_domain_family = copy.deepcopy(base)
    wrong_domain_family["evidence_independence"]["causal_domains"][
        "PRICE_ACTION"
    ]["causal_families"] = ["FUNDING"]
    rejected(db, wrong_domain_family, message="causal-domain family guard")

    support_not_in_evidence = copy.deepcopy(base)
    supporting_domain = support_not_in_evidence["evidence_independence"][
        "causal_domains"
    ]["PRICE_ACTION"]
    supporting_domain["support_ids"] = ["FORGED-SUPPORT"]
    supporting_domain["raw_support_count"] = 1
    rejected(
        db, support_not_in_evidence,
        message="causal-domain classification subset guard",
    )

    directional_vote_without_support = copy.deepcopy(base)
    unsupported_domain = directional_vote_without_support["evidence_independence"][
        "causal_domains"
    ]["PRICE_ACTION"]
    unsupported_domain["support_ids"] = []
    unsupported_domain["raw_support_count"] = 0
    rejected(
        db, directional_vote_without_support,
        message="causal-domain state derivation guard",
    )

    missing_effective_correlation_group = copy.deepcopy(base)
    missing_effective_correlation_group["evidence_independence"]["causal_domains"][
        "POSITIONING"
    ]["correlation_groups"] = []
    rejected(
        db, missing_effective_correlation_group,
        message="effective domain lacks correlation group",
    )

    reused_cross_domain_correlation_group = copy.deepcopy(base)
    reused_cross_domain_correlation_group["evidence_independence"]["causal_domains"][
        "POSITIONING"
    ]["correlation_groups"] = copy.deepcopy(
        reused_cross_domain_correlation_group["evidence_independence"][
            "causal_domains"
        ]["PRICE_ACTION"]["correlation_groups"]
    )
    rejected(
        db, reused_cross_domain_correlation_group,
        message="cross-domain correlation-group reuse",
    )

    omitted_effective_domain = copy.deepcopy(SAMPLES["entryThreeDomain"])
    omitted_effective_domain["evidence_independence"][
        "effective_directional_domains"
    ] = ["POSITIONING", "PRICE_ACTION"]
    omitted_effective_domain["evidence_independence"][
        "effective_directional_vote_count"
    ] = 2
    rejected(
        db, omitted_effective_domain,
        message="effective directional-domain set guard",
    )

    understated_truncated_raw_support = copy.deepcopy(base)
    truncated_price = understated_truncated_raw_support["evidence_independence"][
        "causal_domains"
    ]["PRICE_ACTION"]
    extra_ids = [f"PRICE-TRUNCATED-{index:02d}" for index in range(1, 16)]
    truncated_price["evidence_ids"] = [*truncated_price["evidence_ids"], *extra_ids]
    truncated_price["support_ids"] = [*truncated_price["support_ids"], *extra_ids]
    truncated_price["raw_support_count"] = 17
    understated_truncated_raw_support["evidence_independence"][
        "raw_usable_evidence_count"
    ] = 17
    rejected(
        db, understated_truncated_raw_support,
        message="raw support lower-bound guard",
    )

    def with_matching_invalidation(output, direction, evidence_id):
        mutated = copy.deepcopy(output)
        mutated["evidence_independence"]["causal_domains"]["RISK_INVALIDATION"] = {
            "state": "NEUTRAL",
            "evidence_ids": [evidence_id],
            "support_ids": [],
            "invalidates_long_ids": [evidence_id] if direction == "LONG" else [],
            "invalidates_short_ids": [evidence_id] if direction == "SHORT" else [],
            "causal_families": ["RISK_INVALIDATION"],
            "correlation_groups": [],
            "raw_support_count": 0,
            "effective_domain_votes": 0,
        }
        mutated["evidence_independence"]["raw_usable_evidence_count"] += 1
        return mutated

    for direction, sample_name in (("LONG", "entryLong"), ("SHORT", "entryShort")):
        forged_invalidation = with_matching_invalidation(
            SAMPLES[sample_name], direction, f"FORGED-{direction}-INVALIDATION",
        )
        rejected(
            db, forged_invalidation,
            message="thesis invalidation risk mismatch",
        )

    open_invalidation_is_informational = reseal_for_sql(
        SAMPLES["hold"], contract="OPEN-INVALIDATION-USDT",
        snapshot_id="OPEN-INVALIDATION-INFORMATIONAL", nonce=63_000,
    )
    open_invalidation_is_informational = with_matching_invalidation(
        open_invalidation_is_informational, "LONG", "OPEN-LONG-INFORMATIONAL",
    )
    insert(db, open_invalidation_is_informational)

    underspecified_explainability = copy.deepcopy(base)
    underspecified_explainability["explainability"] = {
        "no_score_aggregation_used": True,
    }
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(underspecified_explainability)}),
        message="explainability shape guard",
    )

    duplicate_domain = copy.deepcopy(base)
    duplicate_domain["evidence_independence"]["effective_directional_domains"].append("POSITIONING")
    duplicate_domain["evidence_independence"]["effective_directional_vote_count"] += 1
    duplicate_domain["evidence_independence"]["raw_usable_evidence_count"] += 1
    rejected(db, base, raw_values=raw_with(base, {"decision_json": canonical(duplicate_domain)}))

    invalid_suppressed = copy.deepcopy(base)
    invalid_suppressed["evidence_independence"][
        "duplicate_or_correlated_suppressed"
    ] = [None]
    rejected(db, invalid_suppressed, message="suppressed evidence guard")
    duplicate_suppressed = copy.deepcopy(base)
    duplicate_suppressed["evidence_independence"][
        "duplicate_or_correlated_suppressed"
    ] = ["DUP", "DUP"]
    rejected(db, duplicate_suppressed, message="suppressed evidence guard")

    suppressed_utf16_boundary = actionless(
        base, contract="SUPP-UTF16-USDT", observed_ts=NOW,
        snapshot_id="SUPP-UTF16-BOUNDARY", nonce=62_101,
    )
    suppressed_utf16_boundary["evidence_independence"][
        "duplicate_or_correlated_suppressed"
    ] = ["\U0001f642" * 128]
    insert(db, suppressed_utf16_boundary)

    suppressed_utf16_overflow = actionless(
        base, contract="SUPP-UTF16-X-USDT", observed_ts=NOW,
        snapshot_id="SUPP-UTF16-OVERFLOW", nonce=62_102,
    )
    suppressed_utf16_overflow["evidence_independence"][
        "duplicate_or_correlated_suppressed"
    ] = ["\U0001f642" * 129]
    rejected(
        db, suppressed_utf16_overflow,
        message="suppressed evidence UTF-16 length guard",
    )

    oversized_raw_count = copy.deepcopy(base)
    oversized_raw_count["evidence_independence"][
        "raw_usable_evidence_count"
    ] = 9_007_199_254_740_991
    rejected(db, oversized_raw_count, message="independence")
    forged_raw_count = copy.deepcopy(base)
    forged_raw_count["evidence_independence"]["raw_usable_evidence_count"] = 24
    rejected(db, forged_raw_count, message="independence evidence count guard")
    invalid_cross_domain_reuse = copy.deepcopy(SAMPLES["failClosed"])
    invalid_cross_domain_reuse["independence_state"] = "CORRELATED"
    invalid_cross_domain_reuse["evidence_independence"]["status"] = "CORRELATED"
    invalid_cross_domain_reuse["evidence_independence"][
        "cross_domain_payload_digest_reuse"
    ] = [None]
    rejected(db, invalid_cross_domain_reuse, message="cross-domain reuse guard")
    correlated_as_independent = copy.deepcopy(base)
    correlated_as_independent["evidence_independence"]["causal_domains"]["POSITIONING"]["state"] = "UNKNOWN"
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(correlated_as_independent)}),
        message="independence direction guard",
    )
    contradictory_domain = copy.deepcopy(base)
    contradictory_domain["evidence_independence"]["causal_domains"]["RELATIVE_MARKET"]["state"] = "SHORT"
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(contradictory_domain)}),
        message="independence direction guard",
    )
    hidden_cross_domain_reuse = copy.deepcopy(base)
    hidden_cross_domain_reuse["evidence_independence"][
        "cross_domain_payload_digest_reuse"
    ] = ["0123456789abcdef"]
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(hidden_cross_domain_reuse)}),
        message="correlation closure shape guard",
    )
    hidden_cross_plane_reuse = copy.deepcopy(base)
    hidden_cross_plane_reuse["evidence_independence"]["cross_plane_reuse"].update({
        "state": "CORRELATED",
        "total_reuse_count": 1,
    })
    rejected(
        db, base,
        raw_values=raw_with(base, {"decision_json": canonical(hidden_cross_plane_reuse)}),
        message="correlated evidence hidden behind CLOSED",
    )
    inflated_votes = copy.deepcopy(base)
    inflated_votes["evidence_independence"]["raw_usable_evidence_count"] = 1
    rejected(
        db, base, raw_values=raw_with(base, {"decision_json": canonical(inflated_votes)}),
        message="independence closure count guard",
    )

    entry_lineage_probe = actionless(
        base, contract="LINEAGE-ENTRY-USDT", observed_ts=NOW,
        snapshot_id="LINEAGE-ENTRY", nonce=81_001,
    )
    entry_lineage_probe["data_quality"] = "BLOCKED"
    hold_lineage_probe = reseal_for_sql(
        SAMPLES["hold"], contract="LINEAGE-HOLD-USDT",
        snapshot_id="LINEAGE-HOLD", nonce=81_002,
    )
    hold_lineage_probe["management_action"] = "NOT_EVALUATED"
    hold_lineage_probe["management_intent"] = "NOT_EVALUATED"
    hold_lineage_probe["management_quality"] = "BLOCKED"

    for probe, receipt_key, expected in [
        (entry_lineage_probe, "full_evidence", "CLOSED source lacks lineage receipt"),
        (entry_lineage_probe, "full_evidence_source", "CLOSED source lacks lineage receipt"),
        (entry_lineage_probe, "opportunity", "CLOSED source lacks lineage receipt"),
        (entry_lineage_probe, "campaign", "CLOSED source lacks lineage receipt"),
        (entry_lineage_probe, "position", "CLOSED source lacks lineage receipt"),
        (entry_lineage_probe, "safety_gate", "CLOSED source lacks lineage receipt"),
        (entry_lineage_probe, "decision_evidence", "direction evidence lacks lineage receipt"),
        (hold_lineage_probe, "position_origin_campaign", "CLOSED source lacks lineage receipt"),
        (hold_lineage_probe, "position_management", "CLOSED source lacks lineage receipt"),
        (hold_lineage_probe, "safety_gate", "CLOSED source lacks lineage receipt"),
    ]:
        missing_receipt = copy.deepcopy(probe)
        missing_receipt["lineage_receipts"][receipt_key] = {
            "receipt_id": None, "content_digest": None, "committed_ts": None,
        }
        rejected(db, missing_receipt, message=expected)

    actionable_lineage_collision = copy.deepcopy(base)
    actionable_lineage_collision["lineage_receipts"]["full_evidence"][
        "receipt_id"
    ] = actionable_lineage_collision["lineage_receipts"]["decision_evidence"][
        "receipt_id"
    ]
    rejected(
        db, actionable_lineage_collision,
        message="lineage receipt id collision",
    )

    unlabelled_lineage_collision = copy.deepcopy(SAMPLES["lineageCollision"])
    unlabelled_lineage_collision["reason_codes"].remove(
        "INPUT_LINEAGE_RECEIPT_ID_COLLISION"
    )
    rejected(
        db, unlabelled_lineage_collision,
        message="lineage receipt id collision",
    )

    cross_plane_lineage_probe = copy.deepcopy(SAMPLES["crossBlocked"])
    missing_decision_lineage = copy.deepcopy(cross_plane_lineage_probe)
    missing_decision_lineage["lineage_receipts"]["decision_evidence"] = {
        "receipt_id": None, "content_digest": None, "committed_ts": None,
    }
    rejected(
        db, missing_decision_lineage,
        message="direction evidence lacks lineage receipt",
    )
    for receipt_key in ("full_evidence", "full_evidence_source"):
        missing_full_lineage = copy.deepcopy(cross_plane_lineage_probe)
        # Isolate the reuse-specific requirement from the generic CLOSED-source
        # requirement: reuse itself still needs both full-evidence receipts.
        missing_full_lineage["source_quality"]["full_evidence"] = "BLOCKED"
        missing_full_lineage["lineage_receipts"][receipt_key] = {
            "receipt_id": None, "content_digest": None, "committed_ts": None,
        }
        rejected(
            db, missing_full_lineage,
            message="cross-plane reuse lacks full-evidence lineage",
        )

    # The probes themselves are legal actionless records. This prevents the
    # negative cases above from passing merely because the scaffolds are invalid.
    insert(db, entry_lineage_probe)
    insert(db, hold_lineage_probe)

    latency_extra = copy.deepcopy(base)
    latency_extra["opportunity_latency"]["future_hint"] = None
    rejected(
        db, base, raw_values=raw_with(base, {"decision_json": canonical(latency_extra)}),
        message="opportunity-latency shape guard",
    )
    latency_mismatch = copy.deepcopy(base)
    latency_mismatch["opportunity_latency"]["detection_lag_ms"] += 1
    rejected(
        db, base, raw_values=raw_with(base, {"decision_json": canonical(latency_mismatch)}),
        message="opportunity-latency detection guard",
    )
    latency_order = copy.deepcopy(base)
    latency_order["opportunity_latency"]["event_close_ts"] = (
        latency_order["opportunity_latency"]["event_ts"] - 1
    )
    latency_order["opportunity_latency"]["detection_lag_from_close_ms"] = (
        latency_order["opportunity_latency"]["first_detected_ts"]
        - latency_order["opportunity_latency"]["event_close_ts"]
    )
    rejected(
        db, base, raw_values=raw_with(base, {"decision_json": canonical(latency_order)}),
        message="opportunity-latency order guard",
    )

    exit_wrong_intent = copy.deepcopy(SAMPLES["exit"])
    exit_wrong_intent["management_intent"] = "NOT_EVALUATED"
    rejected(db, exit_wrong_intent)
    exit_blocked_position = copy.deepcopy(SAMPLES["exit"])
    exit_blocked_position["source_quality"]["position"] = "BLOCKED"
    rejected(db, exit_blocked_position)
    exit_blocked_origin = copy.deepcopy(SAMPLES["exit"])
    exit_blocked_origin["source_quality"]["position_origin_campaign"] = "BLOCKED"
    rejected(db, exit_blocked_origin)
    deferred_clear_risk = copy.deepcopy(SAMPLES["exitDeferred"])
    deferred_clear_risk["risk_state"] = "CLEAR"
    rejected(db, deferred_clear_risk)
    deferred_blocked_position = copy.deepcopy(SAMPLES["exitDeferred"])
    deferred_blocked_position["source_quality"]["position"] = "BLOCKED"
    rejected(db, deferred_blocked_position)

    missing_trigger_basis = copy.deepcopy(SAMPLES["exit"])
    missing_trigger_basis["management_trigger_basis"] = None
    rejected(db, missing_trigger_basis, message="management trigger shape invalid")
    empty_trigger_types = copy.deepcopy(SAMPLES["exit"])
    empty_trigger_types["management_trigger_basis"]["trigger_types"] = []
    rejected(db, empty_trigger_types)
    wrong_trigger_receipt = copy.deepcopy(SAMPLES["exit"])
    wrong_trigger_receipt["management_trigger_basis"][
        "position_management_receipt_id"
    ] = "PMR:WRONG"
    rejected(db, wrong_trigger_receipt, message="management position trigger invalid")
    inactive_origin_field = copy.deepcopy(SAMPLES["exit"])
    inactive_origin_field["management_trigger_basis"]["origin_campaign_id"] = "MW:FORGED"
    rejected(db, inactive_origin_field, message="inactive origin trigger fields present")
    inactive_trigger_basis = copy.deepcopy(base)
    inactive_trigger_basis["management_trigger_basis"] = copy.deepcopy(
        SAMPLES["exit"]["management_trigger_basis"]
    )
    rejected(db, inactive_trigger_basis, message="inactive management trigger present")
    exit_required_hold = copy.deepcopy(SAMPLES["hold"])
    exit_required_hold["management_intent"] = "EXIT_REQUIRED"
    rejected(db, exit_required_hold)
    false_closed_management = copy.deepcopy(SAMPLES["hold"])
    false_closed_management["management_action"] = "NOT_EVALUATED"
    false_closed_management["management_intent"] = "NOT_EVALUATED"
    rejected(db, false_closed_management)
    invalidated_without_exit_intent = copy.deepcopy(SAMPLES["exitDeferred"])
    invalidated_without_exit_intent["management_intent"] = "NOT_EVALUATED"
    rejected(db, invalidated_without_exit_intent)
    false_deferred_exit = copy.deepcopy(SAMPLES["exitDeferred"])
    false_deferred_exit["management_execution_quality"] = "CLOSED"
    false_deferred_exit["execution_quality"] = "CLOSED"
    false_deferred_exit["source_quality"]["management_execution"] = "CLOSED"
    rejected(db, false_deferred_exit)

    max_state_revision = reseal_for_sql(
        SAMPLES["exit"], contract="REV-MAX-USDT",
        snapshot_id="REV-MAX-SAFE-INTEGER", nonce=64_001,
    )
    max_state_revision["management_action_id"] = "FDX:000000000000fa01"
    max_state_revision["action_identity"]["management"][
        "position_state_revision"
    ] = 9_007_199_254_740_991
    insert(db, max_state_revision)
    assert db.execute(
        "SELECT state_marker FROM final_decision_action_claim_shadow WHERE action_id=?",
        (max_state_revision["management_action_id"],),
    ).fetchone() == (9_007_199_254_740_991,)

    overflowing_state_revision = reseal_for_sql(
        SAMPLES["exit"], contract="REV-OVERFLOW-USDT",
        snapshot_id="REV-OVERFLOW-SAFE-INTEGER", nonce=64_002,
    )
    overflowing_state_revision["management_action_id"] = "FDX:000000000000fa02"
    overflowing_state_revision["action_identity"]["management"][
        "position_state_revision"
    ] = 9_007_199_254_740_992
    rejected(
        db, overflowing_state_revision,
        message="final decision exit action identity invalid",
    )

    live_sql = (
        f"INSERT INTO final_decision_integration_shadow({','.join(MAIN_COLUMNS)},live_signal) "
        f"VALUES({','.join('?' for _ in MAIN_COLUMNS)},?)"
    )
    try:
        db.execute(live_sql, values(base) + (1,))
    except sqlite3.DatabaseError:
        pass
    else:
        raise AssertionError("direct live_signal fuse was bypassed")

    # SQLite exposes whole seconds through strftime. The remainder of the
    # current second is admissible; the next second is future data.
    clock.now_ms = NOW
    same_second = actionless(
        base, contract="CLOCK-USDT", observed_ts=NOW + 999,
        snapshot_id="CLOCK-SAME-SECOND", nonce=118,
    )
    insert(db, same_second, persisted_ts=NOW + 999)
    next_second = actionless(
        base, contract="CLOCK2-USDT", observed_ts=NOW + 1000,
        snapshot_id="CLOCK-NEXT-SECOND", nonce=119,
    )
    rejected(db, next_second, persisted_ts=NOW + 1000, message="persisted clock skew")

    # Exactly five minutes is valid; one additional millisecond is rejected.
    boundary = actionless(base, contract="LAG-USDT", observed_ts=NOW, snapshot_id="LAG-OK", nonce=120)
    clock.now_ms = NOW + COMMIT_LAG_MS
    insert(db, boundary, persisted_ts=clock.now_ms)
    too_late = actionless(base, contract="LAG2-USDT", observed_ts=NOW, snapshot_id="LAG-BAD", nonce=121)
    clock.now_ms = NOW + COMMIT_LAG_MS + 1
    rejected(db, too_late, persisted_ts=clock.now_ms)
    future_observation = actionless(
        base, contract="FUTURE-USDT", observed_ts=clock.now_ms + 1,
        snapshot_id="FUTURE-OBS", nonce=122,
    )
    rejected(db, future_observation, persisted_ts=clock.now_ms)
    db.close()


def test_action_tombstones_retry_collision_and_atomic_failure():
    db, clock = open_db()
    try:
        insert_direct_claim(
            db, 99_999, "NUL-USDT",
            action_id="FDE:0123456789abcdef\x00EVIL",
        )
    except sqlite3.DatabaseError:
        pass
    else:
        raise AssertionError("NUL-containing action id bypassed direct-SQL guard")
    base = SAMPLES["entryLong"]
    insert(db, base)
    action_id = base["entry_action_id"]
    claim = db.execute(
        "SELECT action_kind,contract_code,subject_id,scope_id,state_marker,direction,expires_ts "
        "FROM final_decision_action_claim_shadow WHERE action_id=?", (action_id,),
    ).fetchone()
    assert claim[:2] == ("ENTRY", base["contract_code"])
    assert claim[-2:] == (base["direction"], NOW + RETENTION_MS)

    clock.now_ms += 1000
    replay = reseal_for_sql(base, observed_ts=clock.now_ms, snapshot_id="RUN-REPLAY", nonce=201)
    insert(db, replay, persisted_ts=clock.now_ms)
    assert db.execute("SELECT COUNT(*) FROM final_decision_integration_shadow").fetchone()[0] == 2
    assert db.execute("SELECT COUNT(*) FROM final_decision_action_claim_shadow").fetchone()[0] == 1
    assert db.execute(
        "SELECT first_decision_id FROM final_decision_action_claim_shadow WHERE action_id=?", (action_id,),
    ).fetchone()[0] == base["decision_id"]

    clock.now_ms += 1000
    collision = new_entry_action(
        base, contract="OTHER-USDT", observed_ts=clock.now_ms, snapshot_id="ACTION-COLLISION",
        nonce=202, action_id=action_id,
    )
    rejected(db, collision, clock.now_ms, message="final decision action collision")
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?", (collision["decision_id"],),
    ).fetchone()[0] == 0

    clock.now_ms += 1000
    target_collision = reseal_for_sql(
        replay, observed_ts=clock.now_ms, snapshot_id="TARGET-COLLISION", nonce=203,
    )
    target_collision["entry_action_id"] = "FDE:ffffffffffffffff"
    rejected(db, target_collision, clock.now_ms, message="final decision action target collision")
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?",
        (target_collision["decision_id"],),
    ).fetchone()[0] == 0

    clock.now_ms += 1000
    opposite_direction = reseal_for_sql(
        SAMPLES["entryShort"], observed_ts=clock.now_ms,
        snapshot_id="ACTION-DIRECTION-COLLISION", nonce=206,
    )
    assert opposite_direction["entry_action_id"] == action_id
    assert opposite_direction["direction"] != base["direction"]
    rejected(db, opposite_direction, clock.now_ms, message="final decision action collision")
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?",
        (opposite_direction["decision_id"],),
    ).fetchone()[0] == 0

    expired_claimed = NOW - RETENTION_MS - 1000
    db.execute(
        """INSERT INTO final_decision_action_claim_shadow(
             action_id,action_kind,contract_code,subject_id,scope_id,state_marker,
             direction,first_decision_id,claimed_ts,expires_ts
           ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        ("FDE:expiredatomic", "ENTRY", "ATOMIC-USDT", "MW:ATOMIC:1", "MW:ATOMIC:1:W1", 1,
         "LONG", "FDI:ATOMIC:1:0000000000000001", expired_claimed, expired_claimed + RETENTION_MS),
    )
    db.execute(
        """CREATE TRIGGER test_injected_action_failure
           BEFORE INSERT ON final_decision_action_claim_shadow
           WHEN NEW.action_id='FDE:atomicfailure'
           BEGIN SELECT RAISE(ABORT,'injected action claim failure'); END"""
    )
    clock.now_ms += 1000
    injected = new_entry_action(
        base, contract="ATOMIC2-USDT", observed_ts=clock.now_ms,
        snapshot_id="ATOMIC-FAIL", nonce=204, action_id="FDE:atomicfailure",
    )
    rejected(db, injected, clock.now_ms, message="injected action claim failure")
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE action_id='FDE:expiredatomic'"
    ).fetchone()[0] == 1
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?", (injected["decision_id"],),
    ).fetchone()[0] == 0
    db.close()


def test_file_backed_restart_idempotency_and_collision():
    base = SAMPLES["entryLong"]
    with tempfile.TemporaryDirectory(prefix="fdi-d1-restart-") as temporary:
        database = pathlib.Path(temporary) / "decision.sqlite3"
        db, _ = open_db(database=database)
        insert(db, base)
        db.close()

        db, clock = open_db(NOW + 1_000, database=database, apply_migration=False)
        before = db.total_changes
        insert(db, base, persisted_ts=clock.now_ms, deduplicate=True)
        assert db.total_changes == before
        assert db.execute(
            "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?",
            (base["decision_id"],),
        ).fetchone()[0] == 1
        assert db.execute(
            "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE action_id=?",
            (base["entry_action_id"],),
        ).fetchone()[0] == 1

        collision = new_entry_action(
            base, contract="RESTART-COLLISION-USDT", observed_ts=clock.now_ms,
            snapshot_id="RESTART-COLLISION", nonce=205, action_id=base["entry_action_id"],
        )
        rejected(db, collision, clock.now_ms, message="final decision action collision")
        assert db.execute(
            "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?",
            (collision["decision_id"],),
        ).fetchone()[0] == 0
        db.close()


def insert_direct_claim(db, index, contract, *, claimed_ts=NOW, action_id=None):
    db.execute(
        """INSERT INTO final_decision_action_claim_shadow(
             action_id,action_kind,contract_code,subject_id,scope_id,state_marker,
             direction,first_decision_id,claimed_ts,expires_ts
           ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (action_id or f"FDE:{index:016x}", "ENTRY", contract, f"MW:{contract}:{index}",
         f"MW:{contract}:{index}:W1", index + 1,
         "LONG", f"FDI:{contract}:{index + 1}:{index:016x}", claimed_ts, claimed_ts + RETENTION_MS),
    )


def test_bounded_cleanup_capacity_and_fairness():
    base = SAMPLES["entryLong"]
    db, _ = open_db()
    expired_claimed = NOW - RETENTION_MS - 1000
    for index in range(100):
        insert_direct_claim(db, index + 10_000, f"EXP{index:03d}-USDT", claimed_ts=expired_claimed)
    cleanup_row = actionless(base, contract="CLEAN-USDT", observed_ts=NOW, snapshot_id="CLEAN-1", nonce=301)
    insert(db, cleanup_row)
    assert db.execute("SELECT COUNT(*) FROM final_decision_action_claim_shadow").fetchone()[0] == 100 - (MAX_BULK_CLEANUP - 3)
    db.close()

    # Older expired claims from unrelated contracts must not consume the whole
    # cleanup budget and leave an expired, at-cap target contract deadlocked.
    db, _ = open_db()
    for index in range(MAX_BULK_CLEANUP):
        insert_direct_claim(
            db, 20_000 + index, f"OLDER{index:02d}-USDT",
            claimed_ts=expired_claimed - 10_000,
        )
    target_contract = "TARGET-USDT"
    for index in range(ACTION_CONTRACT_CAP):
        insert_direct_claim(
            db, 30_000 + index, target_contract,
            claimed_ts=expired_claimed,
        )
    admitted = new_entry_action(
        base, contract=target_contract, observed_ts=NOW,
        snapshot_id="TARGET-EXPIRED-ADMISSION", nonce=401,
    )
    insert(db, admitted)
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE contract_code=?",
        (target_contract,),
    ).fetchone()[0] == ACTION_CONTRACT_CAP
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow"
    ).fetchone()[0] == ACTION_CONTRACT_CAP + 3
    db.close()

    # Exact incoming action-id and target each have a reserved reclaim probe.
    # A backlog of older expired rows cannot hide the relevant tombstone.
    db, _ = open_db()
    target_contract = base["contract_code"]
    for index in range(MAX_BULK_CLEANUP):
        insert_direct_claim(
            db, 40_000 + index, target_contract,
            claimed_ts=expired_claimed - 10_000,
        )
    db.execute(
        """INSERT INTO final_decision_action_claim_shadow(
             action_id,action_kind,contract_code,subject_id,scope_id,state_marker,
             direction,first_decision_id,claimed_ts,expires_ts
           ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (base["entry_action_id"], "ENTRY", target_contract, "MW:STALE:ACTION",
         "MW:STALE:ACTION:W1", 1, base["direction"],
         "FDI:STALE-ACTION:1:0000000000000001", NOW - RETENTION_MS, NOW),
    )
    insert(db, base)
    refreshed = db.execute(
        "SELECT first_decision_id,claimed_ts,expires_ts FROM final_decision_action_claim_shadow "
        "WHERE action_id=?", (base["entry_action_id"],),
    ).fetchone()
    assert refreshed == (base["decision_id"], NOW, NOW + RETENTION_MS)
    db.close()

    db, _ = open_db()
    for index in range(MAX_BULK_CLEANUP):
        insert_direct_claim(
            db, 50_000 + index, target_contract,
            claimed_ts=expired_claimed - 10_000,
        )
    entry_basis = base["action_identity"]["entry"]
    stale_target_action_id = "FDE:eeeeeeeeeeeeeeee"
    db.execute(
        """INSERT INTO final_decision_action_claim_shadow(
             action_id,action_kind,contract_code,subject_id,scope_id,state_marker,
             direction,first_decision_id,claimed_ts,expires_ts
           ) VALUES(?,?,?,?,?,?,?,?,?,?)""",
        (stale_target_action_id, "ENTRY", target_contract, entry_basis["campaign_id"],
         entry_basis["wave_id"], entry_basis["entry_trigger_ts"], base["direction"],
         "FDI:STALE-TARGET:1:0000000000000001", NOW - RETENTION_MS, NOW),
    )
    insert(db, base)
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE action_id=?",
        (stale_target_action_id,),
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT first_decision_id FROM final_decision_action_claim_shadow WHERE action_id=?",
        (base["entry_action_id"],),
    ).fetchone()[0] == base["decision_id"]
    db.close()

    db, clock = open_db()
    for index in range(ACTION_CONTRACT_CAP):
        insert_direct_claim(db, index + 20_000, "NOISY-USDT")
    clock.now_ms += 1000

    # Collision classification must not depend on SQLite's unspecified ordering
    # between overlapping BEFORE triggers. Capacity guards deliberately stand
    # down for an already-claimed target so the material target collision wins.
    full_target_collision = new_entry_action(
        base, contract="NOISY-USDT", observed_ts=clock.now_ms,
        snapshot_id="NOISY-TARGET-COLLISION", nonce=404,
    )
    full_target_collision["action_identity"]["entry"].update({
        "campaign_id": "MW:NOISY-USDT:20000",
        "wave_id": "MW:NOISY-USDT:20000:W1",
        "entry_trigger_ts": 20_001,
    })
    rejected(
        db, full_target_collision, clock.now_ms,
        message="final decision action target collision",
    )
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE contract_code='NOISY-USDT'"
    ).fetchone()[0] == ACTION_CONTRACT_CAP
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?",
        (full_target_collision["decision_id"],),
    ).fetchone()[0] == 0

    clock.now_ms += 1000
    noisy = new_entry_action(
        base, contract="NOISY-USDT", observed_ts=clock.now_ms, snapshot_id="NOISY-OVER", nonce=401,
    )
    rejected(db, noisy, clock.now_ms, message="action contract capacity exhausted")
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?", (noisy["decision_id"],),
    ).fetchone()[0] == 0

    clock.now_ms += 1000
    fair = new_entry_action(
        base, contract="FAIR-USDT", observed_ts=clock.now_ms, snapshot_id="FAIR-1", nonce=402,
    )
    insert(db, fair, clock.now_ms)
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE contract_code='FAIR-USDT'"
    ).fetchone()[0] == 1

    next_index = 30_000
    while db.execute("SELECT COUNT(*) FROM final_decision_action_claim_shadow").fetchone()[0] < ACTION_GLOBAL_CAP:
        count = db.execute("SELECT COUNT(*) FROM final_decision_action_claim_shadow").fetchone()[0]
        bucket = (count - ACTION_CONTRACT_CAP - 1) // ACTION_CONTRACT_CAP
        insert_direct_claim(db, next_index, f"B{bucket:03d}-USDT")
        next_index += 1
    clock.now_ms += 1000
    global_over = new_entry_action(
        base, contract="GLOBAL-OVER-USDT", observed_ts=clock.now_ms,
        snapshot_id="GLOBAL-OVER", nonce=403,
    )
    rejected(db, global_over, clock.now_ms, message="action claim capacity exhausted")
    assert db.execute("SELECT COUNT(*) FROM final_decision_action_claim_shadow").fetchone()[0] == ACTION_GLOBAL_CAP
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?",
        (global_over["decision_id"],),
    ).fetchone()[0] == 0
    db.close()


def test_decision_retention_and_tombstone_lifetime():
    base = SAMPLES["entryLong"]
    db, clock = open_db()
    for index in range(DECISION_CONTRACT_CAP + 1):
        observed = NOW + index
        output = actionless(
            base, contract="CAP-USDT", observed_ts=observed,
            snapshot_id=f"CAP-{index}", nonce=500 + index,
        )
        clock.now_ms = observed
        insert(db, output, observed)
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE contract_code='CAP-USDT'"
    ).fetchone()[0] == DECISION_CONTRACT_CAP
    assert db.execute(
        "SELECT MIN(observation_ts) FROM final_decision_integration_shadow WHERE contract_code='CAP-USDT'"
    ).fetchone()[0] == NOW + 1
    too_old = actionless(base, contract="CAP-USDT", observed_ts=NOW, snapshot_id="CAP-TOO-OLD", nonce=599)
    rejected(db, too_old, clock.now_ms, message="contract retention admission rejected")
    db.close()

    db, clock = open_db()
    for index in range(DECISION_GLOBAL_CAP + 1):
        observed = NOW + index
        contract = f"G{index:04d}-USDT"
        output = actionless(
            base, contract=contract, observed_ts=observed,
            snapshot_id=f"GLOBAL-{index}", nonce=10_000 + index,
        )
        clock.now_ms = observed
        insert(db, output, observed)
    assert db.execute("SELECT COUNT(*) FROM final_decision_integration_shadow").fetchone()[0] == DECISION_GLOBAL_CAP
    assert db.execute("SELECT MIN(observation_ts) FROM final_decision_integration_shadow").fetchone()[0] == NOW + 1
    too_old_global = actionless(
        base, contract="GLOBAL-OLD-USDT", observed_ts=NOW,
        snapshot_id="GLOBAL-TOO-OLD", nonce=20_000,
    )
    rejected(db, too_old_global, clock.now_ms, message="global retention admission rejected")
    db.close()

    db, clock = open_db()
    old = actionless(base, contract="OLD-USDT", observed_ts=NOW, snapshot_id="OLD-1", nonce=30_001)
    insert(db, old, NOW)
    clock.now_ms = NOW + RETENTION_MS + 1
    fresh = actionless(
        base, contract="FRESH-USDT", observed_ts=clock.now_ms,
        snapshot_id="FRESH-1", nonce=30_002,
    )
    insert(db, fresh, clock.now_ms)
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?", (old["decision_id"],),
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?", (fresh["decision_id"],),
    ).fetchone()[0] == 1
    db.close()

    db, clock = open_db()
    action = reseal_for_sql(base, contract="KEEP-USDT", snapshot_id="KEEP-ACTION", nonce=31_000)
    insert(db, action, NOW)
    for index in range(1, DECISION_CONTRACT_CAP + 1):
        observed = NOW + index
        row = actionless(
            base, contract="KEEP-USDT", observed_ts=observed,
            snapshot_id=f"KEEP-{index}", nonce=31_000 + index,
        )
        clock.now_ms = observed
        insert(db, row, observed)
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_integration_shadow WHERE decision_id=?", (action["decision_id"],),
    ).fetchone()[0] == 0
    assert db.execute(
        "SELECT COUNT(*) FROM final_decision_action_claim_shadow WHERE action_id=?", (action["entry_action_id"],),
    ).fetchone()[0] == 1
    db.close()


def test_query_plans_are_index_bounded():
    db, _ = open_db()
    plans = {
        "decision_ttl": db.execute(
            "EXPLAIN QUERY PLAN SELECT decision_id FROM final_decision_integration_shadow "
            "WHERE observation_ts<? ORDER BY observation_ts,decision_id LIMIT 16", (NOW,),
        ).fetchall(),
        "decision_contract": db.execute(
            "EXPLAIN QUERY PLAN SELECT decision_id FROM final_decision_integration_shadow "
            "WHERE contract_code=? ORDER BY observation_ts DESC,decision_id DESC LIMIT 1 OFFSET 64",
            ("TEST-USDT",),
        ).fetchall(),
        "decision_global": db.execute(
            "EXPLAIN QUERY PLAN SELECT decision_id FROM final_decision_integration_shadow "
            "ORDER BY observation_ts DESC,decision_id DESC LIMIT 1 OFFSET 2048"
        ).fetchall(),
        "action_target_expiry": db.execute(
            "EXPLAIN QUERY PLAN SELECT action_id FROM final_decision_action_claim_shadow "
            "WHERE contract_code=? AND expires_ts<=? ORDER BY expires_ts,action_id LIMIT 1",
            ("TEST-USDT", NOW),
        ).fetchall(),
        "action_exact_id": db.execute(
            "EXPLAIN QUERY PLAN SELECT action_id FROM final_decision_action_claim_shadow "
            "WHERE action_id=? AND expires_ts<=?", ("FDE:0000000000000001", NOW),
        ).fetchall(),
        "action_exact_target": db.execute(
            "EXPLAIN QUERY PLAN SELECT action_id FROM final_decision_action_claim_shadow "
            "WHERE action_kind=? AND contract_code=? AND subject_id=? AND scope_id=? "
            "AND state_marker=? AND expires_ts<=?",
            ("ENTRY", "TEST-USDT", "MW:TEST:1", "MW:TEST:1:W1", 1, NOW),
        ).fetchall(),
        "action_global_expiry": db.execute(
            "EXPLAIN QUERY PLAN SELECT action_id FROM final_decision_action_claim_shadow "
            "WHERE expires_ts<=? ORDER BY expires_ts,action_id LIMIT 13", (NOW,),
        ).fetchall(),
        "action_contract": db.execute(
            "EXPLAIN QUERY PLAN SELECT COUNT(*) FROM final_decision_action_claim_shadow "
            "WHERE contract_code=?", ("TEST-USDT",),
        ).fetchall(),
    }
    for name, rows in plans.items():
        details = " | ".join(row[3] for row in rows).upper()
        assert "SCAN " not in details or "USING" in details, (name, details)
        assert "TEMP B-TREE" not in details, (name, details)
    db.close()


test_fail_loud_schema_and_manifest()
WORKERD_SMOKE = workerd_migration_smoke()
test_valid_contract_idempotency_and_collisions()
test_json_parity_safety_temporal_and_state_guards()
test_action_tombstones_retry_collision_and_atomic_failure()
test_file_backed_restart_idempotency_and_collision()
test_bounded_cleanup_capacity_and_fairness()
test_decision_retention_and_tombstone_lifetime()
test_query_plans_are_index_bounded()

print(
    "PASS final-decision-integration-d1: fail-loud strict schema; exact 51 bind mappings; "
    "engine/FAIL_CLOSED JSON guards; causal independence; coherent latency; 5m commit lag; "
    "180d retention/tombstones; restart persistence; cleanup16; "
    "caps64/2048/256/4096; atomic claims; "
    f"workerd={WORKERD_SMOKE}"
)
