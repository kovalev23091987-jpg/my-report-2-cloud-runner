// Produce text for review only. Never edits source/index or ROOT runtime.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function proposedCatalogIndex(source){
  const importAnchor="import {createDayGrowthLoader} from './day-growth.mjs';";
  const entryAnchor='        let reason = null;';
  const unqualifiedAnchor="        else if (!entry) reason = 'CRYPTO_ASSET_IDENTITY_UNQUALIFIED';";
  for(const x of [importAnchor,entryAnchor,unqualifiedAnchor])if(source.split(x).length!==2)throw Error('EXACT_SOURCE_PATCH_ANCHOR_REQUIRED');
  return source.replace(importAnchor,importAnchor+"\nimport {isExactSavedNonTargetDecision} from './saved-nontarget-decisions.mjs';")
    .replace(entryAnchor,`        let catalogDecision = null;
        if (typeof identityRegistry?.resolveCatalogDecision === 'function') {
          try { catalogDecision = identityRegistry.resolveCatalogDecision(row); }
          catch { catalogDecision = {decision: 'INVALID_CATALOG_DECISION'}; }
        }
        const knownNonTarget = isExactSavedNonTargetDecision(catalogDecision, row);
        let reason = null;`)
    .replace(unqualifiedAnchor,`        else if (catalogDecision && (!knownNonTarget || entry)) reason = 'CATALOG_REGISTRY_IDENTITY_MISMATCH';
        else if (knownNonTarget) reason = 'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE';
${unqualifiedAnchor}`);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const url=new URL('../../sources/index.mjs',import.meta.url),bytes=fs.readFileSync(url);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!=='46321d410aa41ba5adc7372cf65834206b5aa6ef72b917ac8f4c632dec5a62c2')throw Error('H125_SOURCE_BEFORE_PATCH_SHA_REQUIRED');
  fs.writeFileSync(new URL('F552_INDEX_NON_TARGET_PROPOSED_ONLY.mjs.snapshot',import.meta.url),proposedCatalogIndex(bytes.toString('utf8')));
  console.log(JSON.stringify({proposed_snapshot:true,active_index_changed:false,new_native_IO:0}));
}
