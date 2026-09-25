import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const runtime=path.resolve(process.argv[2]||'runtime');const src=path.join(runtime,'src');
const capability=path.join(src,'capability-registry.mjs'),early=path.join(src,'early-candidate-bridge.mjs'),canonical=path.join(src,'canonical-runtime-adapter.mjs');
const routerSource=path.join(here,'src/preselection-metric-router.mjs'),routerTarget=path.join(src,'preselection-metric-router.mjs');
const BEFORE_CAPABILITY='fd1f24dde8dc7d716859be443dc483ca960203e82e9e8d78d435ed5facb9c3f4';
const BEFORE_EARLY='ec0fb287a5d83faeefbd179246a66a0bec673fc52067664f5522c5dda223d2b8';
const BEFORE_CANONICAL='d8fc61a37d829af382ab6e52eb73f3494aac791bbcd2ef1ba459482ce6e0f016';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const p of [capability,early,canonical,routerSource])if(!fs.existsSync(p))throw new Error(`PRESELECTION_REQUIRED_FILE_MISSING:${p}`);

const CAP_VERSION_OLD="export const CAPABILITY_REGISTRY_VERSION='capability-registry-v4-fail-closed-20260925';";
const CAP_VERSION_NEW="export const CAPABILITY_REGISTRY_VERSION='capability-registry-v5-preselection-metadata-20260925';";
const CAP_APPEND=fs.readFileSync(path.join(here,'src/capability-registry-extension.txt'),'utf8');

const EARLY_IMPORT_OLD=fs.readFileSync(path.join(here,'src/early-import-old.txt'),'utf8');
const EARLY_IMPORT_NEW=fs.readFileSync(path.join(here,'src/early-import-new.txt'),'utf8');
const EARLY_VERSION_OLD="export const EARLY_CANDIDATE_BRIDGE_VERSION = 'early-candidate-bridge-v1-20260924';";
const EARLY_VERSION_NEW="export const EARLY_CANDIDATE_BRIDGE_VERSION = 'early-candidate-bridge-v2-general-metric-router-20260925';";
const PICK_OLD=fs.readFileSync(path.join(here,'src/pick-old.txt'),'utf8');
const PICK_NEW=fs.readFileSync(path.join(here,'src/pick-new.txt'),'utf8');
const FILTER_OLD="return e?.status === 'CLOSED' && e?.venue !== 'HTX' && e?.source_compatible !== false && current;";
const FILTER_NEW="return e?.status === 'CLOSED' && e?.source_compatible !== false && current;";
const BRIDGE_FIELDS_OLD=`      preselection_cross_venue_receipts: external.evidence,
      scheduler_priority_is_probability: false,`;
const BRIDGE_FIELDS_NEW=`      preselection_cross_venue_receipts: external.evidence,
      preselection_metric_router: external.router,
      preselection_primary_sources: external.router?.selected_sources || [],
      preselection_routed_metric_count: external.router?.selected_metric_count ?? 0,
      preselection_routed_family_count: external.router?.selected_family_count ?? 0,
      preselection_htx_execution_only_mandatory: true,
      preselection_external_execution_substitution: false,
      scheduler_priority_is_probability: false,`;
const BRIDGE_REASON_OLD=`        external.confirmed ? 'fresh cross-venue receipt confirms context' : external.conflict ? 'cross-venue divergence retained' : null,
      ].filter(Boolean).join('; '),`;
const BRIDGE_REASON_NEW=`        external.confirmed ? 'fresh cross-venue receipt confirms context' : external.conflict ? 'cross-venue divergence retained' : null,
        external.router?.status === 'CLOSED' ? \`metric router selected \${external.router.selected_metric_count} facts / \${external.router.selected_family_count} families\` : null,
      ].filter(Boolean).join('; '),`;
const COUNT_OLD=`      early_bridge_cross_venue_confirmed: accepted.filter((x) => x.external.confirmed).length,
    },`;
const COUNT_NEW=`      early_bridge_cross_venue_confirmed: accepted.filter((x) => x.external.confirmed).length,
      early_bridge_metric_router_closed: accepted.filter((x) => x.external.router?.status === 'CLOSED').length,
      early_bridge_routed_metrics: accepted.reduce((sum,x) => sum + Number(x.external.router?.selected_metric_count || 0), 0),
    },`;
const MODE_OLD="mode: `${text(base?.mode) || 'DISCOVERY_PREFILTER'}+EARLY_BRIDGE_V1`,";
const MODE_NEW="mode: `${text(base?.mode) || 'DISCOVERY_PREFILTER'}+EARLY_BRIDGE_V2_METRIC_ROUTER`,";

const CAN_VERSION_OLD="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v5-rich-fact-contract-20260925';";
const CAN_VERSION_NEW="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v6-preselection-router-20260925';";
const CAN_REASON_OLD=fs.readFileSync(path.join(here,'src/canonical-reason-old.txt'),'utf8');
const CAN_REASON_NEW=fs.readFileSync(path.join(here,'src/canonical-reason-new.txt'),'utf8');

const already=fs.existsSync(routerTarget)&&fs.readFileSync(capability,'utf8').includes('capability-registry-v5-preselection-metadata')&&fs.readFileSync(early,'utf8').includes('early-candidate-bridge-v2-general-metric-router')&&fs.readFileSync(canonical,'utf8').includes('canonical-runtime-adapter-v6-preselection-router');
if(already){
  const proof={version:'existing-source-preselection-router-overlay-v1-20260925',status:'ALREADY_APPLIED',base_candidate_sha:'497b12dd6c6547b0753b56e2bbec79376e2e660c',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',capability_after_sha256:sha(capability),early_after_sha256:sha(early),canonical_after_sha256:sha(canonical),router_sha256:sha(routerTarget),production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0,automatic_voting:false};
  fs.writeFileSync(path.join(runtime,'existing-source-preselection-router-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('PRESELECTION_ROUTER_OVERLAY_APPLIED',JSON.stringify(proof));process.exit(0);
}
const actual={capability:sha(capability),early:sha(early),canonical:sha(canonical)};
if(actual.capability!==BEFORE_CAPABILITY||actual.early!==BEFORE_EARLY||actual.canonical!==BEFORE_CANONICAL)throw new Error(`PRESELECTION_TARGET_HASH_MISMATCH:${JSON.stringify(actual)}`);

let c=fs.readFileSync(capability,'utf8'),e=fs.readFileSync(early,'utf8'),k=fs.readFileSync(canonical,'utf8');
for(const [label,text,anchor] of [
 ['cap version',c,CAP_VERSION_OLD],['early import',e,EARLY_IMPORT_OLD],['early version',e,EARLY_VERSION_OLD],['early pick',e,PICK_OLD],['early filter',e,FILTER_OLD],
 ['early fields',e,BRIDGE_FIELDS_OLD],['early reason',e,BRIDGE_REASON_OLD],['early count',e,COUNT_OLD],['early mode',e,MODE_OLD],
 ['canonical version',k,CAN_VERSION_OLD],['canonical reason',k,CAN_REASON_OLD]
])if(!text.includes(anchor))throw new Error(`PRESELECTION_PATCH_ANCHOR_MISSING:${label}`);

c=c.replace(CAP_VERSION_OLD,CAP_VERSION_NEW).trimEnd()+"\n"+CAP_APPEND.trim()+"\n";
e=e.replace(EARLY_IMPORT_OLD,EARLY_IMPORT_NEW).replace(EARLY_VERSION_OLD,EARLY_VERSION_NEW).replace(FILTER_OLD,FILTER_NEW).replace(PICK_OLD,PICK_NEW).replace(BRIDGE_FIELDS_OLD,BRIDGE_FIELDS_NEW).replace(BRIDGE_REASON_OLD,BRIDGE_REASON_NEW).replace(COUNT_OLD,COUNT_NEW).replace(MODE_OLD,MODE_NEW);
k=k.replace(CAN_VERSION_OLD,CAN_VERSION_NEW).replace(CAN_REASON_OLD,CAN_REASON_NEW);

const backups=[[capability,`${capability}.preselection.bak`],[early,`${early}.preselection.bak`],[canonical,`${canonical}.preselection.bak`]];
for(const [p,b] of backups)fs.copyFileSync(p,b);
try{
  fs.writeFileSync(capability,c);fs.writeFileSync(early,e);fs.writeFileSync(canonical,k);fs.copyFileSync(routerSource,routerTarget);
  const proof={version:'existing-source-preselection-router-overlay-v1-20260925',status:'APPLIED',base_candidate_sha:'497b12dd6c6547b0753b56e2bbec79376e2e660c',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',capability_before_sha256:BEFORE_CAPABILITY,capability_after_sha256:sha(capability),early_before_sha256:BEFORE_EARLY,early_after_sha256:sha(early),canonical_before_sha256:BEFORE_CANONICAL,canonical_after_sha256:sha(canonical),router_sha256:sha(routerTarget),production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0,automatic_voting:false};
  for(const [,b] of backups)fs.rmSync(b,{force:true});
  fs.writeFileSync(path.join(runtime,'existing-source-preselection-router-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('PRESELECTION_ROUTER_OVERLAY_APPLIED',JSON.stringify(proof));
}catch(err){
  for(const [p,b] of backups){fs.rmSync(p,{force:true});if(fs.existsSync(b))fs.renameSync(b,p);}
  fs.rmSync(routerTarget,{force:true});throw err;
}
