import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadVerifiedNativeDayReconciliation} from '../../runner/verified-native-day-reconciliation.mjs';
import {nativeReconciliationProofMaterial} from '../../runner/native-day-reconciliation-tokens.mjs';
const root=new URL('../../',import.meta.url);
const modules=[
 ['collectorCostModule','cloudflare/public-collector/native-cost-observer.mjs',['observeCollectorD1'],''],
 ['collectorPriorModule','cloudflare/public-collector/prior-snapshot-read.mjs',['readCollectorPriorRows'],''],
 ['historyModule','current-generation/files/src/private-canonical-history.mjs',['createPrivateCanonicalRestorer','privateCanonicalArchivePool','privateCanonicalBindings'],''],
 ['nativeModule','cloudflare/free-history/native-measured-d1.mjs',['nativeMeasuredD1'],''],
 ['nativeProofModule','runner/native-day-reconciliation-tokens.mjs',['registerVerifiedNativeDayProof','nativeReconciliationAtomicWitness','nativeReconciliationQueryBinding','bindNativeDayReconciliation','nativeDayUnknownCostIndependentlyClosed'],''],
 ['budgetModule','runner/d1-preaction-budget-guard.mjs',['evaluateWithinRunReservation','finalizeRunUsage'],'const {nativeReconciliationQueryBinding,bindNativeDayReconciliation,nativeDayUnknownCostIndependentlyClosed}=nativeProofModule;'],
 ['priceModule','cloudflare/public-collector/private-price-consumer.mjs',['runPrivatePriceRechecks','PRIVATE_PRICE_POLICY'],
  'const {createPrivateCanonicalRestorer,privateCanonicalArchivePool}=historyModule,{nativeMeasuredD1}=nativeModule,{evaluateWithinRunReservation,finalizeRunUsage}=budgetModule,{nativeReconciliationAtomicWitness}=nativeProofModule;'],
];
export function buildPrivatePriceRuntime({now=Date.now()}={}){
 const manifest=[],parts=[];
 for(const [name,path,exports,dependencies] of modules){
  const original=fs.readFileSync(new URL(path,root),'utf8');
  let source=original.replace(/^import [^\n]+;\n/gm,'').replace(/^export default [^\n]+;\n?/gm,'').replace(/^export /gm,'');
  if(/^(?:import|export)\b/m.test(source))throw Error('PRIVATE_PRICE_UNSUPPORTED_MODULE_SYNTAX');
  manifest.push({path,sha256:createHash('sha256').update(original).digest('hex')});
  parts.push(`const ${name}=(()=>{${dependencies}\n${source}\nreturn {${exports.join(',')}};})();`);
 }
 // Isolated scopes preserve the exact shared decoder, counters and guards.
 // The existing Hub prefix and all provider/Telegram paths remain byte-exact.
 const handle=loadVerifiedNativeDayReconciliation({root:fileURLToPath(root),generation:'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M',now_ts:now});
 const material=nativeReconciliationProofMaterial(handle,now);
 const embedded=material?`nativeProofModule.registerVerifiedNativeDayProof(Object.freeze(${JSON.stringify(material.handle)}),${JSON.stringify(material.context)})`:'null';
 return{source:`var __report2InjectedPrivatePriceRuntime=(()=>{\n${parts.join('\n')}\nconst native_cost_reconciliation=${embedded};\nreturn {...priceModule,native_cost_reconciliation,privateCanonicalBindings:historyModule.privateCanonicalBindings,observeCollectorD1:collectorCostModule.observeCollectorD1,readCollectorPriorRows:collectorPriorModule.readCollectorPriorRows};})();\n`,manifest,native_cost_reconciliation:material?.handle??null};
}
export function injectPrivatePriceRuntime(tail){
 const marker=/^(var __REPORT2_PUBLIC_COLLECTOR_VERSION = "[^"\n]+";\n)/;
 if(!marker.test(tail))throw Error('PRIVATE_PRICE_COLLECTOR_VERSION_MARKER_REQUIRED');
 const bundle=buildPrivatePriceRuntime();return{source:tail.replace(marker,'$1'+bundle.source),manifest:bundle.manifest};
}
