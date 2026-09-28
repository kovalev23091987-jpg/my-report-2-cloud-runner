import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(process.argv[2]||'.'),runtime=path.resolve(process.argv[3]||'runtime');
for(const dir of ['cross-venue-delta-overlay/tests','unified-entry-signal-delta/overlay/runtime-test-overrides'])for(const name of fs.readdirSync(path.join(repo,dir)).filter(n=>n.endsWith('.mjs')))fs.copyFileSync(path.join(repo,dir,name),path.join(runtime,'tests',name));
for(const name of ['apply-telegram-runtime-overlay.mjs','r8-20-prospective-validation-sidecar.mjs','telegram-info-runtime.mjs','telegram-output.mjs','telegram-zero-reason.mjs','plain-text-telegram.mjs','telegram-readonly-diagnostic.mjs','report2-d1-adapter.mjs','d1-preaction-budget-guard.mjs'])fs.copyFileSync(path.join(repo,'runner',name),path.join(runtime,name));
fs.cpSync(path.join(repo,'telegram-repair-tests'),path.join(runtime,'telegram-repair-tests'),{recursive:true});
for(const name of fs.readdirSync(path.join(here,'runtime-test-overrides'))){
 fs.copyFileSync(path.join(here,'runtime-test-overrides',name),path.join(runtime,'tests',name));
 if(name==='v3-telegram-delivery-sidecar.test.mjs')fs.copyFileSync(path.join(here,'runtime-test-overrides',name),path.join(runtime,'telegram-repair-tests',name));
}
const replaceFixtureOnce=(name,before,after)=>{
 const file=path.join(runtime,'tests',name),source=fs.readFileSync(file,'utf8');
 const first=source.indexOf(before);
 if(first<0||source.indexOf(before,first+before.length)>=0)throw Error(`INHERITED_FIXTURE_PATCH_MISMATCH:${name}`);
 fs.writeFileSync(file,source.slice(0,first)+after+source.slice(first+before.length));
};
// The assertions remain unchanged. These two legacy fixtures are supplied
// with the factual clocks / exact row identity required by the repaired
// production contracts instead of relying on now-invalid implicit proof.
replaceFixtureOnce('htx-execution-closure.test.mjs',
 `const partialCvd = buildShadowDecisionTelemetry(baseEvidence());`,
 `const partialCvd = buildShadowDecisionTelemetry(baseEvidence());
partialCvd.source_clocks = {
  execution: { source_ts: NOW - 1000, available_ts: NOW - 500 },
  trajectory: { source_ts: NOW - 1000, available_ts: NOW - 500 },
  spot: { source_ts: NOW - 1000, available_ts: NOW - 500 },
};`);
replaceFixtureOnce('full-evidence-shadow-model.test.mjs',
 `const r=buildFullEvidenceShadowRecord({shadow_decision:shadow,public_evidence:pub,now:NOW});`,
 `pub.evidence[0].asset_identity_verified=true;
pub.evidence[0].max_age_sec=7200;
pub.evidence[0].settlement_period="1h";
pub.evidence[0].available_ts=NOW-500;
const r=buildFullEvidenceShadowRecord({shadow_decision:shadow,public_evidence:pub,now:NOW});`);
replaceFixtureOnce('full-evidence-shadow-model.test.mjs',
 `for (const row of pubClosed.evidence) if (row.status === "CLOSED") row.max_age_sec = 7200;`,
 `for (const row of pubClosed.evidence) if (row.status === "CLOSED") {
  row.max_age_sec = 7200;
  row.available_ts = row.source_ts;
}`);
replaceFixtureOnce('full-evidence-shadow-model.test.mjs',
 `shadowClosed.htx_execution_gate_closed=true;
shadowClosed.evidence_flags.spot_flow_delta_pct=1.25;`,
 `shadowClosed.htx_execution_gate_closed=true;
shadowClosed.evidence_flags.spot_flow_delta_pct=1.25;
shadowClosed.source_clocks={
  execution:{source_ts:NOW-1000,available_ts:NOW-500},
  trajectory:{source_ts:NOW-1000,available_ts:NOW-500},
  spot:{source_ts:NOW-1000,available_ts:NOW-500},
};`);
replaceFixtureOnce('full-evidence-shadow-model.test.mjs',
 `observed_ts:NOW,source_ts:NOW-60000,max_age_sec:7200,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true,independence_group:"OKX_OFFICIAL_PUBLIC"`,
 `observed_ts:NOW,source_ts:NOW-60000,available_ts:NOW-500,max_age_sec:7200,status:"CLOSED",coverage_pct:100,symbol_verified:true,alias_required:true,alias_verified:true,asset_identity_verified:true,source_compatible:true,independence_group:"OKX_OFFICIAL_PUBLIC"`);
replaceFixtureOnce('stage392-proof-runtime.test.mjs',
 `  const sealed = sealFullEvidenceProofBundleAfterAck(prepared, { status:'CLOSED', persisted:true, changes:1 });`,
 `  const sealed = sealFullEvidenceProofBundleAfterAck(prepared, {
    status:'CLOSED', persisted:true, changes:1, committed_ts:NOW,
    full_evidence_id:prepared.bundle.full_evidence.full_evidence_id,
    contract_code:contract, snapshot_id:snapshot, observed_ts:NOW,
  });`);
replaceFixtureOnce('chain23-closure-regression.test.mjs',
 `  evidence_flags:{
    funding_pct:-0.04,`,
 `  source_clocks:{
    execution:{source_ts:NOW-1000,available_ts:NOW-500},
    trajectory:{source_ts:NOW-1000,available_ts:NOW-500},
    spot:{source_ts:NOW-1000,available_ts:NOW-500},
  },
  evidence_flags:{
    funding_pct:-0.04,`);
replaceFixtureOnce('chain23-closure-regression.test.mjs',
 `const baseExternal={contract_code:contract,observed_ts:NOW,source_ts:NOW-60_000,max_age_sec:7200`,
 `const baseExternal={contract_code:contract,observed_ts:NOW,source_ts:NOW-60_000,available_ts:NOW-500,max_age_sec:7200`);
replaceFixtureOnce('cross-venue-delta.test.mjs',
 `    dq:{ status:"HTX_CLOSED_EXTERNAL_CHAINS_MISSING", htx_coverage_pct:95 },
    evidence_flags:`,
 `    dq:{ status:"HTX_CLOSED_EXTERNAL_CHAINS_MISSING", htx_coverage_pct:95 },
    source_clocks:{
      execution:{source_ts:NOW-1000,available_ts:NOW-500},
      trajectory:{source_ts:NOW-1000,available_ts:NOW-500},
      spot:{source_ts:NOW-1000,available_ts:NOW-500},
    },
    evidence_flags:`);
replaceFixtureOnce('cross-venue-delta.test.mjs',
 `value, unit:"pct", window:htxMetric ? null : "1h", observed_ts:NOW, source_ts:NOW-offset,
    now_ts:NOW`,
 `value, unit:"pct", window:htxMetric ? null : "1h", observed_ts:NOW, source_ts:NOW-offset,
    available_ts:NOW-offset, now_ts:NOW`);
fs.mkdirSync(path.join(repo,'r10_7_auth/src'),{recursive:true});
for(const name of ['fast-move-watch-runtime.mjs','fast-move-watch-engine.mjs'])fs.copyFileSync(path.join(runtime,'src',name),path.join(repo,'r10_7_auth/src',name));
console.log('INHERITED_HARNESS_READY_ASSERTIONS_PRESERVED_WITH_CURRENT_SCHEMA_AND_FORMAT');
