import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {generateSavedNonTargetDecisions,createExactSavedNonTargetClassifier,isExactSavedNonTargetDecision} from '../../sources/saved-nontarget-decisions.mjs';
import {proposedCatalogIndex} from '../../handoffs/sources/propose-f552-catalog-index-patch.mjs';

test('exact saved negative decisions suppress knownnon-target only; changed/new/duplicate/conflicting rows remain unresolved in proposed source wiring',async()=>{
  const n={contractId:880001,symbol:'非目标-USDT',asset:'非目标',currency:'USDT',status:1};
  const s={contract_id:'880001',symbol:n.symbol,native_asset:n.asset,metadata_coin_name:n.asset,selected_for_report_scope:false,
    scope_reason:'EXCLUDE_TRADFI_INDEX_OR_INDEX_ETF',classification_basis:'CONTROLLED_ACCEPTED_ECONOMIC_EXCLUSION_NOT_NAME_OR_ENUM'};
  const evidence={catalog_file_sha256:'1'.repeat(64),economic_scope_file_sha256:'2'.repeat(64),catalog_original_received_ts:1792931870932};
  const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');
  const bundle=generateSavedNonTargetDecisions({native_rows:[n],scope_rows:[s],evidence,sha256});
  assert.equal(bundle.count,1);assert.equal(bundle.blocked.length,0);
  const negative=createExactSavedNonTargetClassifier({decision_bundle:bundle}),d=negative.resolveCatalogDecision(n);
  assert.equal(isExactSavedNonTargetDecision(d,n),true);assert.equal(d.scope_reason,s.scope_reason);
  for(const change of [{contractId:880002},{symbol:'OTHER-USDT'},{asset:'CHANGED'},{currency:'USDC'},{status:25}])assert.equal(negative.resolveCatalogDecision({...n,...change}),null);
  assert.equal(negative.resolveCatalogDecision({contractId:990001,symbol:'NCSKNEW2USD-USDT',asset:'NCSKNEW2USD',currency:'USDT',status:1}),null);
  assert.equal(negative.resolveCatalogDecision({contractId:990002,symbol:'4STOCK-USDT',asset:'4STOCK',currency:'USDT',status:1}),null);
  assert.equal(isExactSavedNonTargetDecision({decision:'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE'},n),false);
  const bad=generateSavedNonTargetDecisions({native_rows:[n,{...n}],scope_rows:[s],evidence,sha256});assert.equal(bad.count,0);assert.equal(bad.blocked.length,1);
  const sourceURL=new URL('../../sources/index.mjs',import.meta.url),original=fs.readFileSync(sourceURL,'utf8');
  const proposed=proposedCatalogIndex(original).replace(/from '(\.{1,2}\/[^']+)'/g,(_,spec)=>`from '${new URL(spec,sourceURL).href}'`);
  const {createPumpSources}=await import('data:text/javascript;base64,'+Buffer.from(proposed).toString('base64'));
  const old=JSON.parse(fs.readFileSync(new URL('../../sources/registry-curated13-native-relative-v1.json',import.meta.url),'utf8')).instruments;
  const sol=old.find(e=>e.instrument.base==='SOL');
  const solRow={contractId:100028,symbol:'SOL-USDT',asset:'SOL',currency:'USDT',status:1};
  const source=rows=>createPumpSources({clock:()=>1792959000000,identityRegistry:{resolve:q=>q.native_symbol==='SOL-USDT'?sol:null,resolveCatalogDecision:negative.resolveCatalogDecision},broker:{async request(){return {ok:true,status:200,received_ts:1792959000000,receipt_id:'CONTROLLED_F552_NEGATIVE',data:{code:0,data:rows}};}}});
  const known=await source([solRow,n]).getCatalog();assert.equal(known.instruments.length,1);
  assert.equal(known.unqualified[0].reason,'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE');
  const unresolved=rs=>rs.filter(r=>['CRYPTO_ASSET_IDENTITY_UNQUALIFIED','CATALOG_REGISTRY_IDENTITY_MISMATCH','MISSING_OR_DUPLICATE_NATIVE_SYMBOL','INVALID_CATALOG_ROW'].includes(r.reason));
  assert.equal(unresolved(known.unqualified).length,0);
  const changed=await source([solRow,{...n,asset:'DIFFERENT'}]).getCatalog();assert.equal(unresolved(changed.unqualified).length,1);
  const duplicate=await source([solRow,n,n]).getCatalog();assert.equal(unresolved(duplicate.unqualified).length,1);
  const invalid=createPumpSources({clock:()=>1792959000000,identityRegistry:{resolve:()=>null,resolveCatalogDecision:()=>({decision:'KNOWN_NON_TARGET_EXACT_SAVED_TUPLE'})},broker:{async request(){return {ok:true,status:200,received_ts:1792959000000,receipt_id:'CONTROLLED_INVALID_DECISION',data:{code:0,data:[n]}};}}});
  assert.equal((await invalid.getCatalog()).unqualified[0].reason,'CATALOG_REGISTRY_IDENTITY_MISMATCH');
  assert.equal(fs.readFileSync(sourceURL,'utf8'),original);
});
