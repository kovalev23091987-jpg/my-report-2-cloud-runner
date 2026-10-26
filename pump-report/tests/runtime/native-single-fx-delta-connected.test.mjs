import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createReviewedNativeScopeRegistry} from '../../registry/native-reviewed550.mjs';
import {USDKRW_NEGATIVE_BUNDLE} from '../../registry/native-usdkrw1-data.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {ownerInstrumentExcluded} from '../../contracts/index.mjs';

test('the exact USDKRW FX decision closes the latest actual single-row gap without changing crypto550',async()=>{
  const b=fs.readFileSync(new URL('../../.private/native-20261026/pump-production-manual-three-reply.json',import.meta.url));
  assert.equal(createHash('sha256').update(b).digest('hex'),'8b26b3aeed4eba4901dbfaf6a99a4c3e57277958ad23ce3b8de80d23597bc8c0');
  const capture=JSON.parse(b),reply=capture.body.launch_capture.raw_responses.find(r=>r.request.url.endsWith('/contracts')).response;
  const registry=createReviewedNativeScopeRegistry(BINGX_IDENTITY_REGISTRY);let calls=0;
  const sources=createPumpSources({identityRegistry:registry,clock:()=>reply.received_ts,broker:{request:async args=>{calls++;assert.ok(args.url.endsWith('/contracts'));return structuredClone(reply);}}});
  const catalog=await sources.getCatalog();assert.equal(calls,1);assert.equal(catalog.instruments.length,552);assert.equal(catalog.instruments.filter(i=>!ownerInstrumentExcluded(i)).length,550);
  const unresolved=catalog.unqualified.filter(r=>['CRYPTO_ASSET_IDENTITY_UNQUALIFIED','CATALOG_REGISTRY_IDENTITY_MISMATCH','MISSING_OR_DUPLICATE_NATIVE_SYMBOL','INVALID_CATALOG_ROW'].includes(r.reason));assert.equal(unresolved.length,0);
  assert.equal(catalog.unqualified.filter(r=>r.reason==='KNOWN_NON_TARGET_EXACT_SAVED_TUPLE').length,434);
  const t=USDKRW_NEGATIVE_BUNDLE.decisions[0].native_tuple,row={contractId:t.native_contract_id,symbol:t.symbol,asset:t.asset,currency:t.currency,status:t.status};
  assert.equal(registry.resolveCatalogDecision(row).scope_reason,'EXCLUDE_TRADFI_FX');assert.equal(registry.resolveCatalogDecision({...row,contractId:String(Number(row.contractId)+1)}),null);
  assert.equal(registry.summary().selected_native_coin_unit_semantics_qualified,541);assert.equal(registry.summary().selected_native_coin_unit_unknown,9);
});
