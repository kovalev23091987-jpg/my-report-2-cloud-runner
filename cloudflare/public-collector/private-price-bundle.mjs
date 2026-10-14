import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const modules=[
 ['historyModule','current-generation/files/src/private-canonical-history.mjs',['createPrivateCanonicalRestorer'],''],
 ['nativeModule','cloudflare/free-history/native-measured-d1.mjs',['nativeMeasuredD1'],''],
 ['budgetModule','runner/d1-preaction-budget-guard.mjs',['evaluateWithinRunReservation','finalizeRunUsage'],''],
 ['priceModule','cloudflare/public-collector/private-price-consumer.mjs',['runPrivatePriceRechecks','PRIVATE_PRICE_POLICY'],
  'const {createPrivateCanonicalRestorer}=historyModule,{nativeMeasuredD1}=nativeModule,{evaluateWithinRunReservation,finalizeRunUsage}=budgetModule;'],
];
export function buildPrivatePriceRuntime(){
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
 return{source:`var __report2InjectedPrivatePriceRuntime=(()=>{\n${parts.join('\n')}\nreturn priceModule;})();\n`,manifest};
}
export function injectPrivatePriceRuntime(tail){
 const marker=/^(var __REPORT2_PUBLIC_COLLECTOR_VERSION = "[^"\n]+";\n)/;
 if(!marker.test(tail))throw Error('PRIVATE_PRICE_COLLECTOR_VERSION_MARKER_REQUIRED');
 const bundle=buildPrivatePriceRuntime();return{source:tail.replace(marker,'$1'+bundle.source),manifest:bundle.manifest};
}
