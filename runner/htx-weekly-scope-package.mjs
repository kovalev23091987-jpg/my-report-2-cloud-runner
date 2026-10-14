// Produce a single checked proposal for every universe consumer. The returned
// files are not an authorization to merge/deploy without connected acceptance.
import {gzipSync} from 'node:zlib';
import {weeklyScopePackage} from './htx-weekly-universe-plan.mjs';
export function renderWeeklyScopeFiles({plan,manifest_bytes,generation,previous_scope,approved_source,hourly_source,known_manifests}={}){
 const pack=weeklyScopePackage({plan,manifest_bytes,generation,previous_scope});
 if(typeof approved_source!=='string'||typeof hourly_source!=='string'||!Array.isArray(known_manifests)||!known_manifests.length)throw Error('ALL_EXISTING_CONSUMER_SOURCES_REQUIRED');
 const at=approved_source.indexOf('const approved=new Map(');if(at<0)throw Error('APPROVED_SCOPE_CONSUMER_SEAM_REQUIRED');
 const approved=`// Weekly exact official scope; membership is not a price, flow, source-usefulness or entry fact.\nexport const APPROVED_HTX_SCOPE=Object.freeze(${JSON.stringify(pack.scope)});\nexport const APPROVED_HTX_ANALYSIS_CONTRACTS=Object.freeze(${JSON.stringify(pack.analysis_contracts)}.map(x=>Object.freeze(x)));\nexport const APPROVED_HTX_NATIVE_CONTRACTS=Object.freeze(${JSON.stringify(pack.native_contracts)}.map(x=>Object.freeze(x)));\n`+approved_source.slice(at);
 const match=hourly_source.match(/export const TARGETS = Object\.freeze\((\[[^\n]*\])\);/);if(!match)throw Error('HISTORY_TARGETS_CONSUMER_SEAM_REQUIRED');
 const priorHistory=hourly_source.match(/export const HISTORY_TARGETS = Object\.freeze\((\[[^\n]*\])\);/),previous_targets=priorHistory?JSON.parse(priorHistory[1]):JSON.parse(match[1]),registered=[{sha256:pack.scope.manifest_sha256,target_count:pack.history_targets.length},...known_manifests.filter(r=>r.sha256!==pack.scope.manifest_sha256)];
 if(registered.some(r=>!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.target_count)||r.target_count<1)||new Set(registered.map(r=>r.sha256)).size!==registered.length)throw Error('EXACT_HISTORY_MANIFEST_REGISTRY_REQUIRED');
 const history_targets=[...new Set([...pack.history_targets,...previous_targets])];
 let hourly=hourly_source.replace(/export const MANIFEST_SHA256 = '[a-f0-9]{64}';/,`export const MANIFEST_SHA256 = '${pack.scope.manifest_sha256}';`).replace(match[0],`export const TARGETS = Object.freeze(${JSON.stringify(pack.history_targets)});`);
 // Older accepted digests/counts remain available; removed coins are readable
 // for history and calibration, while only current targets receive new rows.
 const registry=`export const KNOWN_HISTORY_MANIFESTS = Object.freeze(${JSON.stringify(registered)});\nexport const HISTORY_TARGETS = Object.freeze(${JSON.stringify(history_targets)});\n`;
 hourly=hourly.replace(/export const KNOWN_HISTORY_MANIFESTS[^\n]*\n/g,'').replace(/export const HISTORY_TARGETS[^\n]*\n/g,'');hourly=hourly.replace('const HOUR =',registry+'\nconst HOUR =');
 return{files:{[pack.scope.manifest]:gzipSync(manifest_bytes,{mtime:0}),'current-generation/files/src/approved-htx-analysis-scope.mjs':Buffer.from(approved),'cloudflare/free-history/hourly-archive.mjs':Buffer.from(hourly),[`checkpoints/HTX_WEEKLY_SOURCE_QUEUE_${plan.week_key}.json`]:Buffer.from(JSON.stringify(pack.source_queues,null,2)+'\n')},scope:pack.scope,registered_history_manifests:registered,history_readable_contracts:history_targets,required_rollout:['ASSEMBLED_RUNTIME_CONNECTED_CHECKS','PUBLIC_COLLECTOR_DEPLOY_AND_MODULE_READBACK','HTX_SPOT_FUTURES_HISTORY_WORKER_DEPLOY_READBACK','LIQ_FORECAST_HISTORY_WORKER_DEPLOY_READBACK'],isolated_manifest_update_allowed:false,production_scope_changed:false};
}
