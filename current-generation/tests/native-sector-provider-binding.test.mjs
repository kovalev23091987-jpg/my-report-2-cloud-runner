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
const {collectCoingeckoSectorEvidence}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(modulePath('evidence-source-store.mjs'));
const {DatabaseSync}=await import('node:sqlite');
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
  const b=NATIVE_SECTOR_BINDINGS[base],identity=entries[base].identities[0],m={id:b.coin_id,symbol:base,asset_platform_id:b.native_provider_ref?b.platform:null,platforms:b.native_provider_ref?{[b.platform]:b.native_provider_ref}:{},categories:b.functional_categories||['Layer 1 (L1)'],links:{homepage:['https://'+b.provider_homepages[0]]}},p={identity,contract:base+'-USDT',coin_id:b.coin_id};
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
const providerRaw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/native-sector-rest-38564913120/validation.json.gz',import.meta.url))),originalProvider=JSON.parse(providerRaw);
assert.equal(crypto.createHash('sha256').update(providerRaw).digest('hex'),'f0eccc366bee6d54df1b2920747fd7a8e027e572c49e31d940e4394ecbf41714');
assert.equal(originalProvider.cloud_run,38564913120);assert.equal(originalProvider.head,'ccd9935b2569580e09b576df348711388dd87a15');
for(const r of originalProvider.responses)assert.equal(crypto.createHash('sha256').update(r.body).digest('hex'),r.body_sha256);
const originalMetadata=base=>originalProvider.responses.find(r=>r.url.includes('/coins/'+NATIVE_SECTOR_BINDINGS[base].coin_id+'?'));
test('original ICP ledger and CHZ legacy bridge metadata bind only the exact documented representations',()=>{
 for(const base of ['ICP','CHZ']){
  const b=NATIVE_SECTOR_BINDINGS[base],identity=entries[base].identities[0],metadata=JSON.parse(originalMetadata(base).body),p={identity,contract:base+'-USDT',coin_id:b.coin_id};
  assert.equal(verifyCoingeckoSectorIdentity(metadata,p),true);
  const platform=base==='ICP'?'internet-computer':'ethereum';
  for(const patch of [{...metadata,id:'wrapped-'+metadata.id},{...metadata,platforms:{...metadata.platforms,[platform]:'foreign-reference'}},{...metadata,asset_platform_id:'base'},{...metadata,links:{homepage:['https://wrong.example/']}}])assert.equal(verifyCoingeckoSectorIdentity(patch,p),false,base);
  assert.equal(verifyCoingeckoSectorIdentity(metadata,{...p,identity:{...identity,contract_or_mint:metadata.platforms[platform]}}),false);
  assert.equal(verifyCoingeckoSectorIdentity(metadata,{...p,identity:{...identity,native_asset_id:'foreign:mainnet'}}),false);
 }
});
test('retained actual ICP and CHZ bodies pass the production cached collector and sector consumer with zero new HTTP',async t=>{
 const cutoff=originalProvider.completed_ts;t.mock.timers.enable({apis:['Date'],now:cutoff});
 const sqlite=new DatabaseSync(':memory:'),d={prepare(sql){return{bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...(this.args||[]));},async first(){return sqlite.prepare(sql).get(...(this.args||[]))||null;}};},async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}};
 const rows=[];let sourceCalls=0,admissions=0;
 try{
  await installEvidenceSourceStore(d);
  for(const r of originalProvider.responses){
   const ttl=r.url.includes('/markets?')?60000:r.url.endsWith('/categories/list')?3600000:21600000;
   await writeEvidenceSourceCache(d,{source:'COINGECKO_SECTOR',asset_key:'REFERENCE:provider-reference-cache-v1-20261004:'+crypto.createHash('sha256').update(r.url).digest('hex'),observed_ts:r.received_ts,expires_ts:r.received_ts+ttl,payload:{version:'provider-reference-cache-v1-20261004',url:r.url,received_ts:r.received_ts,expires_ts:r.received_ts+ttl,body:r.body,body_sha256:r.body_sha256}});
  }
  for(const base of ['ICP','CHZ']){
   const contract=base+'-USDT',identity=entries[base].identities[0],result=await collectCoingeckoSectorEvidence({db:d,contract,asset_identity:identity,asset_metadata:{},run_id:'ORIGINAL_NATIVE_DENOM_REPLAY:'+base,now:cutoff,request_admit:()=>{admissions++;return{allowed:false};},fetch_impl:async()=>{sourceCalls++;throw Error('NO_NEW_HTTP');}}),context=consumeSectorContext({evidence:result.evidence,contract,asset_identity:identity,now:cutoff});
   assert.equal(result.status,'CLOSED');assert.equal(context.status,'CLOSED');assert.equal(result.network_calls,0);assert.equal(result.summary.eligible_peers,50);assert.equal(result.summary.target_source_ts,1791981294000);assert.equal(result.summary.quote,'USD_AGGREGATED_NOT_HTX_EXECUTION_PRICE');assert.equal(context.facts[0].score_contribution,0);assert.equal(context.directional_vote,false);assert.equal(context.hard_gate,false);assert.equal(result.evidence[0].entry_eligible,false);
   assert.equal(result.summary.native_representation_scope,base==='ICP'?'OFFICIAL_MAINNET_NATIVE_LEDGER_REFERENCE':'VERIFIED_PROJECT_NATIVE_AND_LEGACY_BRIDGE_SECTOR_ONLY');
   rows.push({contract,identity,status:result.status,summary:result.summary,evidence:result.evidence,consumer_status:context.status,consumer_facts:context.facts,receipts:result.receipts,source_HTTP:0,original_decision_cutoff:cutoff,production_natural_use:false});
  }
  assert.equal(sourceCalls,0);assert.equal(admissions,0);
  fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/native-sector-denominations-retained-proof.json',JSON.stringify({schema:'ACTUAL_ICP_CHZ_RETAINED_PRODUCER_CONSUMER_PROOF_V1',source_run:38564913120,source_head:originalProvider.head,artifact:11895330062,artifact_digest:'sha256:bdc58910b79a466f61c87c75fc88e0e376f7c35c6aa3ed17abc6f255d9c87e1b',original_json_sha256:crypto.createHash('sha256').update(providerRaw).digest('hex'),rows,source_HTTP:0,D1:0,MAIN:0,Telegram:0,original_clocks_unchanged:true},null,2)+'\n');
 }finally{sqlite.close();t.mock.timers.reset();}
});
