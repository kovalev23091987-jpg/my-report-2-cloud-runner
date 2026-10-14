import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const modulePath=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {NATIVE_SECTOR_BINDINGS,exactNativeSectorBinding,verifyCoingeckoSectorIdentity,normalizeCoingeckoSector}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {consumeSectorContext}=await import(modulePath('sector-context.mjs'));
const {planCandidateEvidenceRoutes}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
const raw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const payload=JSON.parse(raw),entries=normalizeHtxAssetReferences(payload.payload||payload).entries;
const newSymbols=['ALGO','DASH','FIL','HBAR','XMR','XPL','CHZ','ICP','TAO','TIA','STEEM'];
test('all eleven native routes require the preserved exact HTX binding and enter the production planner',()=>{
 for(const base of newSymbols){
  const binding=NATIVE_SECTOR_BINDINGS[base],identity=entries[base].identities[0],contract=base+'-USDT';
  assert.equal(entries[base].status,'CLOSED',base);assert.equal(identity.chain,binding.chain);
  assert.equal(exactNativeSectorBinding(identity,contract),binding);
  assert.ok(planCandidateEvidenceRoutes({contract,asset_identity:identity}).routes.some(r=>r.name==='SECTOR_COINGECKO'),base);
  for(const bad of [{...identity,native_asset_id:binding.chain+':testnet'},{...identity,contract_or_mint:'wrapped'},{...identity,chain:'ethereum'}])assert.equal(exactNativeSectorBinding(bad,contract),null);
 }
 assert.equal(Object.keys(NATIVE_SECTOR_BINDINGS).length,30);
});
test('new metadata needs the exact provider ID, native representation and official HTTPS project site',()=>{
 for(const base of newSymbols){
  const b=NATIVE_SECTOR_BINDINGS[base],identity=entries[base].identities[0],m={id:b.coin_id,symbol:base,asset_platform_id:null,platforms:{},categories:b.functional_categories||['Layer 1 (L1)'],links:{homepage:['https://'+b.provider_homepages[0]]}},p={identity,contract:base+'-USDT',coin_id:b.coin_id};
  assert.equal(verifyCoingeckoSectorIdentity(m,p),true,base);
  for(const patch of [{id:'wrapped-'+b.coin_id},{symbol:'OTHER'},{asset_platform_id:'ethereum'},{platforms:{[b.chain]:'wrapped'}},{links:{homepage:[]}},{links:{homepage:['https://'+b.provider_homepages[0]+'.evil.example']}},{links:{homepage:['http://'+b.provider_homepages[0]]}},{links:{homepage:['https://user:pass@'+b.provider_homepages[0]]}}])assert.equal(verifyCoingeckoSectorIdentity({...m,...patch},p),false,base);
  assert.equal(verifyCoingeckoSectorIdentity(m,{...p,category_name:base+' Ecosystem'}),false);
 }
});
test('controlled functional categories reach the same advisory consumer without refreshing old clocks or making extra votes',()=>{
 const observed=1791977200000,source=observed-60000;
 for(const [base,category,id] of [['FIL','Layer 1 (L1)','layer-1'],['DASH','Payment Solutions','payment-solutions'],['STEEM','SocialFi','socialfi']]){
  const b=NATIVE_SECTOR_BINDINGS[base],identity=entries[base].identities[0],contract=base+'-USDT',metadata={id:b.coin_id,symbol:base,asset_platform_id:null,platforms:{},categories:[category],links:{homepage:['https://'+b.provider_homepages[0]]}},quote=(coin,symbol,change)=>({id:coin,symbol,current_price:1,total_volume:200000,price_change_percentage_24h:change,last_updated:new Date(source).toISOString()});
  const result=normalizeCoingeckoSector({metadata,categories:[{category_id:id,name:category}],quotes:[quote(b.coin_id,base,5),quote('a','a',0),quote('b','b',1),quote('c','c',2)],identity,contract,coin_id:b.coin_id,category_id:id,category_name:category,observed_ts:observed});
  assert.equal(result.status,'CLOSED');const consumer=consumeSectorContext({evidence:result.evidence,contract,asset_identity:identity,now:observed});assert.equal(consumer.status,'CLOSED');assert.equal(consumer.facts.length,1);assert.equal(consumer.facts[0].source_ts,source);assert.equal(consumer.facts[0].score_contribution,0);assert.equal(consumer.directional_vote,false);assert.equal(consumer.hard_gate,false);
  assert.equal(consumeSectorContext({evidence:result.evidence,contract:'OTHER-USDT',asset_identity:identity,now:observed}).status,'NOT_CLOSED');
  assert.equal(consumeSectorContext({evidence:result.evidence,contract,asset_identity:identity,now:observed+900001}).status,'NOT_CLOSED');
 }
});
