import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import zlib from 'node:zlib';
import {COINMETRICS_NATIVE_NETWORK_FAMILIES,exactCoinmetricsNativeIdentity,deriveCoinmetricsSupplyContext,normalizeCoinmetricsSupply,COINMETRICS_FREE_LIMITS} from '../files/src/coinmetrics-supply-context.mjs';
import {planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
const saved=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('fixtures/coinmetrics-daily-native-supply-20261004.json.gz',import.meta.url))));
test('same source/consumer mechanism accepts only exact confirmed native network families and advertised free supply metric',()=>{
 for(const [symbol,d]of Object.entries(COINMETRICS_NATIVE_NETWORK_FAMILIES)){
  const contract=symbol+'-USDT',identity={chain:d.chain,asset_kind:'NATIVE',native_asset_id:d.chain+':mainnet',contract_or_mint:null};
  assert.equal(exactCoinmetricsNativeIdentity(contract,identity),true);assert.ok(planCandidateEvidenceRoutes({contract,asset_identity:identity}).routes.some(r=>r.name==='COINMETRICS'));
  const catalog={data:[structuredClone(saved.catalog.data.find(r=>r.asset==='btc'))]};catalog.data[0].asset=d.id;
  // Controlled contract regression, never advertised as new live provider data.
  const series={data:saved.series.data.filter(r=>r.asset==='btc').map(r=>({...r,asset:d.id,SplyCur:r.SplyCur.includes('.')?r.SplyCur.split('.')[0]+'.'+r.SplyCur.split('.')[1].slice(0,d.decimals):r.SplyCur}))};
  const params={contract,identity,catalog,series,observed_ts:saved.now};const r=normalizeCoinmetricsSupply(params);
  assert.equal(r.status,'CLOSED',symbol);assert.equal(r.summary.chain_finalized_block_claim,false);assert.equal(r.summary.burn_or_buyback_cause_verified,false);assert.equal(consumeBlockResultContext({contract,evidence:r.evidence,now:saved.now}).facts.length,1);
  for(const bad of [{...identity,chain:'foreign'},{...identity,native_asset_id:d.chain+':testnet'},{...identity,asset_kind:'TOKEN'},{...identity,contract_or_mint:'wrapped'}])assert.equal(deriveCoinmetricsSupplyContext({...params,identity:bad}),null);
  catalog.data[0].metrics[0].frequencies[0].community=false;assert.equal(deriveCoinmetricsSupplyContext(params),null);
 }
 assert.equal(exactCoinmetricsNativeIdentity('SUI-USDT',{chain:'sui',asset_kind:'NATIVE',native_asset_id:'sui:mainnet',contract_or_mint:null}),false);assert.equal(COINMETRICS_FREE_LIMITS.module_daily_attempts,12);assert.equal(COINMETRICS_FREE_LIMITS.retries,0);
});
