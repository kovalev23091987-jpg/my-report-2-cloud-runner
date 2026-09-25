import assert from "node:assert/strict";
import fs from "node:fs";

const workerPath =
  new URL(
    "../src/worker.js",
    import.meta.url
  );

const workerSourceRaw =
  fs.readFileSync(
    workerPath,
    "utf8"
  );

const workerSource = workerSourceRaw.replace(
  /^import \{[\s\S]*?\} from "\.\/fast-move-watch-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/opportunity-intelligence-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/multi-wave-campaign-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/stage392-proof-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-upstream-compat-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-adapter\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/final-decision-integration-runtime\.mjs";\n\nimport \{[\s\S]*?\} from "\.\/tz101-publication-runtime\.mjs";\n\n(?:import \{[\s\S]*?\} from "\.\/tz101-byk-proxy-policy\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/tz101-smart-money-evidence\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/public-evidence-adapters\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/full-evidence-shadow-model\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/htx-turnover-gate\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/early-candidate-bridge\.mjs";\n\n)?(?:import \{[\s\S]*?\} from "\.\/canonical-runtime-adapter\.mjs";\n\n)?/,
  `const FAST_MOVE_WATCH_VERSION = "3.8-fast-move-watch-shadow";
   const FAST_MOVE_WATCH_STATUS = "ACTIVE_SHADOW_BOUNDED_NO_EXECUTION";
   const buildFastMoveDeepObservation = () => null;
   const prepareFastMoveWatchCycle = async ({ discovery_prefilter }) => ({ adaptive_discovery_prefilter: discovery_prefilter, adaptive_cooldown_sec: 1800 });
   const finalizeFastMoveWatchCycle = async () => ({ status: "TEST_STUB" });
   const fastMoveWatchDataPlaneSummary = async () => ({ table_available: false, status: "TEST_STUB" });
   const OPPORTUNITY_VERSION = "3.9-opportunity-intelligence-shadow";
   const opportunityDataPlaneSummary = async () => ({ table_available: false, status: "TEST_STUB" });
   const runOpportunityShadowCycle = async () => ({ status: "TEST_STUB", safety: { live_signal: false } });
   const MULTI_WAVE_VERSION = "TEST";
   const multiWaveCampaignDataPlaneSummary = async () => ({ table_available: false, status: "TEST_STUB" });
   const runMultiWaveCampaignShadowCycle = async () => ({ status: "TEST_STUB", safety: { live_signal: false } });
   const prepareFullEvidenceProofBundle = () => ({ status: "TEST_STUB" });
   const sealFullEvidenceProofBundleAfterAck = () => ({ status: "TEST_STUB" });
   const stage392ProofSafetyEnvelope = () => ({ status: "TEST_STUB" });
   const evaluateFinalDecisionUpstreamCompatibility = () => ({ status: "TEST_STUB" });
   const adaptStage391ToFinalDecisionInput = () => ({ status: "TEST_STUB" });
   const persistFinalDecisionIntegrationShadow = async () => ({ status: "TEST_STUB" });
   const runTz101PublicationShadow = async () => ({ status: "TEST_STUB", sidecar_persisted: false });
   const validateByKaranteliProxyTarget = () => ({ allowed: true });
   const fetchByKaranteliSmartMoneyRaw = async () => ({ status: "NOT_CLOSED", external_fetches: 0, score_eligible: false, directional_vote_eligible: false });
   const smartMoneyRawEvidenceRows = () => []; const collectPublicFullEvidenceCrossVenue=async()=>({evidence:[]}); const buildFullEvidenceShadowRecordCrossVenue=()=>({status:"TEST_STUB"}); const loadEarlyBridgeInputs=async()=>({status:"SOURCE_UNSUPPORTED",early_rows:[],full_evidence_rows:[]}); const applyEarlyCandidateBridge=({discovery_prefilter})=>discovery_prefilter; const evaluateHtxFuturesTurnoverGate=(row)=>({allowed:true,status:"CLOSED",reason:null,turnover_24h_usd_equivalent:Number(row?.turnover_24h_usdt??100000)}); const buildRuntimeCanonicalBundle=()=>({status:"TEST_STUB",canonical:{state:"OBSERVE"},telegram:{status:"TEST_STUB"},manual:{status:"TEST_STUB"},parity_fingerprint:"TEST"});\n\n`,
);

assert.notEqual(workerSource, workerSourceRaw, "Stage 3.8 import test adapter must match exactly once");

const testableSource =
  workerSource +
  `\nexport {
    finalizeDeepCheckSchedulerSlot,
    dataPlaneStatus
  };\n`;

const moduleUrl =
  "data:text/javascript;base64," +
  Buffer.from(
    testableSource
  ).toString("base64");

const {
  finalizeDeepCheckSchedulerSlot,
  dataPlaneStatus,
} = await import(moduleUrl);

function statement(sql) {
  return {
    sql,
    params: [],
    bind(...params) {
      this.params = params;
      return this;
    },
  };
}

const written = [];

const writeDb = {
  prepare(sql) {
    return statement(sql);
  },
  async batch(statements) {
    written.push(...statements);
    return [
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
      { meta: { changes: 2 } },
    ];
  },
};

const completedTs =
  Date.now();

const finalization =
  await finalizeDeepCheckSchedulerSlot(
    {
      DATA_DB: writeDb,
    },
    {
      contract:
        "ETHFI-USDT",
      run_id:
        "run-1",
      started_ts:
        completedTs - 2500,
      completed_ts:
        completedTs,
      status:
        "COMPLETED",
      sufficiency:
        "PARTIAL",
      error:
        null,
      details: {
        gaps: [
          "spot_snapshot.quality_status_GREEN",
        ],
        fulfilled_components:
          4,
        failed_components: [],
        decision_generated:
          false,
        validated:
          false,
        telegram_started:
          false,
      },
    }
  );

assert.equal(
  finalization.status,
  "CLOSED"
);

assert.equal(
  finalization.state_changes,
  1
);

assert.equal(
  finalization.journal_changes,
  1
);

assert.equal(
  finalization
    .retention_rows_deleted,
  2
);

assert.equal(
  written.length,
  3
);

assert.match(
  written[0].sql,
  /UPDATE\s+deep_check_scheduler_state/s
);

assert.match(
  written[1].sql,
  /INSERT OR REPLACE INTO\s+deep_check_run_log/s
);

assert.match(
  written[2].sql,
  /DELETE FROM\s+deep_check_run_log/s
);

assert.equal(
  written[1].params[0],
  "run-1"
);

assert.equal(
  written[1].params[1],
  "ETHFI-USDT"
);

assert.deepEqual(
  JSON.parse(
    written[1].params[6]
  ),
  [
    "spot_snapshot.quality_status_GREEN",
  ]
);

assert.equal(
  written[1].params[9],
  0
);

assert.equal(
  written[1].params[10],
  0
);

assert.equal(
  written[1].params[11],
  0
);

const readDb = {
  prepare(sql) {
    const item =
      statement(sql);

    item.first =
      async () => {
        if (
          /FROM\s+scan_runs/s.test(
            sql
          )
        ) {
          return {
            ts: completedTs,
            universe_total: 336,
            scanned: 336,
            missing: 0,
            errors: 0,
            stale: 0,
            stage0_coverage_pct:
              100,
          };
        }

        if (
          /FROM\s+cron_runs/s.test(
            sql
          )
        ) {
          return {
            run_id: "run-1",
            started_ts:
              completedTs,
            status: "SUCCESS",
          };
        }

        if (
          /FROM\s+deep_check_scheduler_state/s.test(
            sql
          )
        ) {
          return {
            state_rows: 1,
            running_rows: 0,
            latest_updated_ts:
              completedTs,
          };
        }

        throw new Error(
          "Unexpected first query"
        );
      };

    return item;
  },

  async batch(statements) {
    assert.equal(
      statements.length,
      2
    );

    return [
      {
        results: [
          {
            run_id: "run-1",
            contract_code:
              "ETHFI-USDT",
            started_ts:
              completedTs - 2500,
            completed_ts:
              completedTs,
            execution_status:
              "COMPLETED",
            data_sufficiency:
              "PARTIAL",
            gaps_json:
              '["spot_snapshot.quality_status_GREEN"]',
            fulfilled_components:
              4,
            failed_components_json:
              "[]",
            decision_generated: 0,
            validated: 0,
            telegram_started: 0,
            error_text: null,
          },
        ],
      },
      {
        results: [
          {
            total_24h: 1,
            completed_24h: 1,
            errors_24h: 0,
            sufficient_24h: 0,
            partial_24h: 1,
            insufficient_24h: 0,
            decisions_24h: 0,
            validated_24h: 0,
            telegram_started_24h: 0,
          },
        ],
      },
    ];
  },
};

const status =
  await dataPlaneStatus({
    DATA_DB: readDb,
  });

assert.equal(
  status.version,
  "3.8-fast-move-watch-shadow"
);

assert.equal(
  status.deep_check_journal
    .table_available,
  true
);

assert.equal(
  status.deep_check_journal
    .summary_24h.total,
  1
);

assert.equal(
  status.deep_check_journal
    .summary_24h
    .decisions_generated,
  0
);

assert.deepEqual(
  status.deep_check_journal
    .recent[0].gaps,
  [
    "spot_snapshot.quality_status_GREEN",
  ]
);

assert.equal(
  status.deep_check_journal
    .recent[0]
    .decision_generated,
  false
);

const migration =
  fs.readFileSync(
    new URL(
      "../migrations/report2_deep_check_run_log.sql",
      import.meta.url
    ),
    "utf8"
  );

assert.match(
  migration,
  /CREATE TABLE IF NOT EXISTS deep_check_run_log/
);

assert.match(
  migration,
  /UNIQUE\(run_id, contract_code\)/
);

assert.match(
  migration,
  /idx_deep_check_run_log_completed_ts/
);

console.log(
  JSON.stringify(
    {
      ok: true,
      suite:
        "deep-check-journal",
      assertions:
        "atomic finalize batch, compact fields, retention, status parsing, safety counters",
    },
    null,
    2
  )
);
