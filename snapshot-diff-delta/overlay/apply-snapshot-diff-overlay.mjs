import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const runtime=path.resolve(process.argv[2]||'runtime'),src=path.join(runtime,'src');
const worker=path.join(src,'worker.js'),canonical=path.join(src,'canonical-runtime-adapter.mjs'),modSource=path.join(here,'src/snapshot-diff.mjs'),modTarget=path.join(src,'snapshot-diff.mjs');
const BEFORE_WORKER='2c71a09c3b0c50a2396087974d991e4b59f7e41863daff55150ecf6512113f36';
const BEFORE_CANONICAL='1966fa4fbc4cf56bf897e88f7a4f29eb6dbc6032ad014b3363504e399231a1ab';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const p of [worker,canonical,modSource])if(!fs.existsSync(p))throw new Error(`SNAPSHOT_DIFF_REQUIRED_FILE_MISSING:${p}`);

const W_IMPORT_OLD=`import {
  buildFreeSourceRuntimeSummary,
} from "./source-registry.mjs";`;
const W_IMPORT_NEW=`import {
  buildFreeSourceRuntimeSummary,
} from "./source-registry.mjs";

import {
  loadPreviousEvidenceSnapshot,
} from "./snapshot-diff.mjs";`;
const W_CONTEXT_OLD=`  const canonicalAnalyticalBundle =
    buildRuntimeCanonicalBundle({`;
const W_CONTEXT_NEW=`  const previousSnapshotContext =
    await loadPreviousEvidenceSnapshot({
      db: env?.DATA_DB,
      contract_code: contract,
      before_ts: now,
    });

  const canonicalAnalyticalBundle =
    buildRuntimeCanonicalBundle({`;
const W_PASS_OLD=`      smart_money_raw:
        smartMoneyRaw,
    });`;
const W_PASS_NEW=`      smart_money_raw:
        smartMoneyRaw,
      previous_snapshot_context:
        previousSnapshotContext,
    });`;

const C_VERSION_OLD="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v7-output-surface-20260925';";
const C_VERSION_NEW="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v8-snapshot-diff-20260925';";
const C_IMPORT_OLD="import { buildOutputSurfaceContract } from './output-surface-contract.mjs';";
const C_IMPORT_NEW=C_IMPORT_OLD+"\nimport { buildSnapshotChanges } from './snapshot-diff.mjs';";
const C_SIG_OLD=` existing_source_receipts=null,
}={}){`;
const C_SIG_NEW=` existing_source_receipts=null,previous_snapshot_context=null,
}={}){`;
const C_SUPPORT_OLD=` const supportingContext=consumeExistingSourceReceipts(existing_source_receipts||{});
 const canonical=buildCanonicalAnalyticalResult({`;
const C_SUPPORT_NEW=` const supportingContext=consumeExistingSourceReceipts(existing_source_receipts||{});
 const snapshotChanges=buildSnapshotChanges({
  previous_snapshot_context,
  current_public_evidence:public_evidence,
  observed_ts,
  max_lines:5,
 });
 const canonical=buildCanonicalAnalyticalResult({`;
const C_META_OLD=`  liquidations:pump,data_quality:data_sufficiency??null,free_sources:freeSources,
  metadata:{contract:text(contract)||null,canonical_runtime_adapter:CANONICAL_RUNTIME_ADAPTER_VERSION,entry_readiness_score_status:'NOT_PROVISIONED_DO_NOT_INVENT',live_probability:null,validated_signal:false,automatic_execution:false,supporting_context:supportingContext},
 });`;
const C_META_NEW=`  liquidations:pump,data_quality:data_sufficiency??null,free_sources:freeSources,
  changes_from_previous:snapshotChanges.lines,
  metadata:{contract:text(contract)||null,canonical_runtime_adapter:CANONICAL_RUNTIME_ADAPTER_VERSION,entry_readiness_score_status:'NOT_PROVISIONED_DO_NOT_INVENT',live_probability:null,validated_signal:false,automatic_execution:false,supporting_context:supportingContext,snapshot_comparison:snapshotChanges},
 });`;

const already=fs.existsSync(modTarget)&&fs.readFileSync(worker,'utf8').includes('loadPreviousEvidenceSnapshot')&&fs.readFileSync(canonical,'utf8').includes('canonical-runtime-adapter-v8-snapshot-diff');
if(already){
 const proof={version:'snapshot-diff-overlay-v1-20260925',status:'ALREADY_APPLIED',base_candidate_sha:'dc38d18cf1fd9cba321f2b9cf0830ed39d136537',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',worker_after_sha256:sha(worker),canonical_after_sha256:sha(canonical),module_sha256:sha(modTarget),production_changed:false,d1_migration:false,d1_write_delta:0,d1_read_delta_per_deep_check_max:1,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0};
 fs.writeFileSync(path.join(runtime,'snapshot-diff-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('SNAPSHOT_DIFF_OVERLAY_APPLIED',JSON.stringify(proof));process.exit(0);
}
const actual={worker:sha(worker),canonical:sha(canonical)};
if(actual.worker!==BEFORE_WORKER||actual.canonical!==BEFORE_CANONICAL)throw new Error(`SNAPSHOT_DIFF_TARGET_HASH_MISMATCH:${JSON.stringify(actual)}`);
let w=fs.readFileSync(worker,'utf8'),c=fs.readFileSync(canonical,'utf8');
for(const [label,s,anchor] of [['worker import',w,W_IMPORT_OLD],['worker context',w,W_CONTEXT_OLD],['worker pass',w,W_PASS_OLD],['canonical version',c,C_VERSION_OLD],['canonical import',c,C_IMPORT_OLD],['canonical signature',c,C_SIG_OLD],['canonical support',c,C_SUPPORT_OLD],['canonical metadata',c,C_META_OLD]])if(!s.includes(anchor))throw new Error(`SNAPSHOT_DIFF_PATCH_ANCHOR_MISSING:${label}`);
w=w.replace(W_IMPORT_OLD,W_IMPORT_NEW).replace(W_CONTEXT_OLD,W_CONTEXT_NEW).replace(W_PASS_OLD,W_PASS_NEW);
c=c.replace(C_VERSION_OLD,C_VERSION_NEW).replace(C_IMPORT_OLD,C_IMPORT_NEW).replace(C_SIG_OLD,C_SIG_NEW).replace(C_SUPPORT_OLD,C_SUPPORT_NEW).replace(C_META_OLD,C_META_NEW);
const backups=[[worker,`${worker}.snapdiff.bak`],[canonical,`${canonical}.snapdiff.bak`]];
for(const [p,b] of backups)fs.copyFileSync(p,b);
try{
 fs.writeFileSync(worker,w);fs.writeFileSync(canonical,c);fs.copyFileSync(modSource,modTarget);
 const proof={version:'snapshot-diff-overlay-v1-20260925',status:'APPLIED',base_candidate_sha:'dc38d18cf1fd9cba321f2b9cf0830ed39d136537',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',worker_before_sha256:BEFORE_WORKER,worker_after_sha256:sha(worker),canonical_before_sha256:BEFORE_CANONICAL,canonical_after_sha256:sha(canonical),module_sha256:sha(modTarget),production_changed:false,d1_migration:false,d1_write_delta:0,d1_read_delta_per_deep_check_max:1,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0};
 for(const [,b] of backups)fs.rmSync(b,{force:true});
 fs.writeFileSync(path.join(runtime,'snapshot-diff-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('SNAPSHOT_DIFF_OVERLAY_APPLIED',JSON.stringify(proof));
}catch(err){
 for(const [p,b] of backups){fs.rmSync(p,{force:true});if(fs.existsSync(b))fs.renameSync(b,p);}
 fs.rmSync(modTarget,{force:true});throw err;
}
