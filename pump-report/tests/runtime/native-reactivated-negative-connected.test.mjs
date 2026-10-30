import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {REACTIVATED_NEGATIVE_BUNDLE} from '../../registry/native-reactivated53-data.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {ownerInstrumentExcluded} from '../../contracts/index.mjs';

test('finite reviewed53 reactivated non-targets close the actual catalog delta without excluding any selected crypto',async()=>{
  const bytes=fs.readFileSync(new URL('../../.private/native-20261026/pump-production-manual-one-reply.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'47966d50f21c4a51ffc664fa5537629d4cee955c5159f8d516514a1f5baa1df2');
  const capture=JSON.parse(bytes),response=capture.body.launch_capture.raw_responses.find(r=>r.request.url.endsWith('/contracts')).response;
  const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);let offlineCalls=0;
  const broker={request:async args=>{offlineCalls++;assert.ok(args.url.endsWith('/contracts'));return structuredClone(response);}};
  const sources=createPumpSources({broker,identityRegistry:registry,clock:()=>response.received_ts});
  const result=await sources.getCatalog();assert.equal(offlineCalls,1);assert.equal(result.instruments.length,552);
  assert.equal(result.instruments.filter(i=>!ownerInstrumentExcluded(i)).length,550);
  const reasons={};for(const row of result.unqualified)reasons[row.reason]=(reasons[row.reason]??0)+1;
  assert.deepEqual(reasons,{NON_USDT_SETTLEMENT:49,OWNER_EXCLUDED_GOLD_BACKED_ASSET:2,KNOWN_NON_TARGET_EXACT_SAVED_TUPLE:433,INSTRUMENT_NOT_ONLINE:242});
  assert.equal(registry.summary().original_saved_nontargets,380);assert.equal(registry.summary().reactivated_saved_nontargets,53);
  const categories={};for(const decision of REACTIVATED_NEGATIVE_BUNDLE.decisions){
    categories[decision.scope_reason]=(categories[decision.scope_reason]??0)+1;
    const t=decision.native_tuple,row={contractId:t.native_contract_id,symbol:t.symbol,asset:t.asset,currency:t.currency,status:t.status};
    assert.equal(registry.resolveCatalogDecision(row).decision_id,decision.decision_id);
    assert.equal(registry.resolveCatalogDecision({...row,asset:row.asset+'_CHANGED'}),null);
    assert.equal(registry.resolveCatalogDecision({...row,status:25}),null);
  }
  assert.deepEqual(categories,{EXCLUDE_TRADFI_FX:34,EXCLUDE_TRADFI_INDEX_OR_INDEX_ETF:4,EXCLUDE_TRADFI_COMMODITY_OR_METAL:15});
  assert.equal(result.coverage.registry_missing_from_catalog.length,0);
});
