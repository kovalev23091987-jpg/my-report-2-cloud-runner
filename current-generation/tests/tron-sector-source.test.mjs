import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {collectCoingeckoSectorEvidence,verifyCoingeckoSectorIdentity}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {planCandidateEvidenceRoutes}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
const {consumeSectorContext}=await import(modulePath('sector-context.mjs'));
const {installEvidenceSourceStore,reserveEvidenceSourceAttempts}=await import(modulePath('evidence-source-store.mjs'));
const raw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),'f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29');
const entries=normalizeHtxAssetReferences(JSON.parse(raw)).entries;
test('four original exact TRON tokens enter the common sector planner without acquiring native or EVM identity',()=>{
 for(const base of ['BTT','JST','SUN','WIN']){
  const identity=entries[base].identities[0],plan=planCandidateEvidenceRoutes({contract:base+'-USDT',asset_identity:identity});
  assert.equal(entries[base].status,'CLOSED');assert.equal(identity.chain,'tron');assert.ok(plan.routes.some(r=>r.name==='SECTOR_COINGECKO'));assert.equal(plan.nativeSectorEligible,false);assert.equal(plan.evmEligible,false);
 }
});
test('TRON Base58 provider addresses are exact and case sensitive, unlike EVM hex',()=>{
 const identity=entries.JST.identities[0],metadata={id:'just',symbol:'jst',categories:['Decentralized Finance (DeFi)'],platforms:{tron:identity.contract_or_mint}},p={identity,contract:'JST-USDT',coin_id:'just'};
 assert.equal(verifyCoingeckoSectorIdentity(metadata,p),true);
 for(const m of [{...metadata,platforms:{tron:identity.contract_or_mint.toLowerCase()}},{...metadata,platforms:{ethereum:identity.contract_or_mint}},{...metadata,platforms:{tron:entries.SUN.identities[0].contract_or_mint}},{...metadata,symbol:'SUN'},{...metadata,id:'wrapped-just'}])assert.equal(verifyCoingeckoSectorIdentity(m,p),false);
});
function database(){const raw=new DatabaseSync(':memory:');return{raw,prepare(sql){return{bind(...args){this.args=args;return this;},async run(){return raw.prepare(sql).run(...(this.args||[]));},async first(){return raw.prepare(sql).get(...(this.args||[]))||null;}};},async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}};}
test('controlled TRON wire shape reaches the production collector and advisory consumer; references and facts are reused',async()=>{
 const d=database(),now=Date.now(),identity=entries.JST.identities[0],quote=(id,symbol,delta)=>({id,symbol,current_price:.03,total_volume:200000,price_change_percentage_24h:delta,last_updated:new Date(now-1000).toISOString()}),quotes=[quote('just','jst',3),quote('a','a',0),quote('b','b',1),quote('c','c',2)],urls=[];
 const args={db:d,contract:'JST-USDT',asset_identity:identity,asset_metadata:{},run_id:'CONTROLLED_TRON_SECTOR',now,request_admit:()=>({allowed:true}),fetch_impl:async url=>{urls.push(url);const m={id:'just',symbol:'jst',categories:['Decentralized Finance (DeFi)'],platforms:{tron:identity.contract_or_mint}};return new Response(JSON.stringify(url.includes('/categories/list')?[{category_id:'decentralized-finance-defi',name:'Decentralized Finance (DeFi)'}]:url.includes('/markets?')?quotes:m));}};
 try{const result=await collectCoingeckoSectorEvidence(args);assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,3);assert.ok(urls[0].includes('/coins/tron/contract/'+identity.contract_or_mint));const context=consumeSectorContext({evidence:result.evidence,contract:args.contract,asset_identity:identity,now:Date.now()});assert.equal(context.status,'CLOSED');assert.equal(context.facts[0].score_contribution,0);assert.equal(context.directional_vote,false);const cached=await collectCoingeckoSectorEvidence({...args,run_id:'CONTROLLED_NEXT',now:now+1000});assert.equal(cached.network_calls,0);assert.equal(cached.evidence[0].source_ts,result.evidence[0].source_ts);}finally{d.raw.close();}
});
test('known exhausted ordinary Demo budget blocks TRON transport before shared caller admission and preserves the manual reserve',async()=>{
 const d=database(),now=Date.now();let calls=0,admissions=0;try{await installEvidenceSourceStore(d);await reserveEvidenceSourceAttempts(d,{source:'COINGECKO_SECTOR',reservation_id:'already_used',attempts:224,daily_cap:256,now});const r=await collectCoingeckoSectorEvidence({db:d,contract:'BTT-USDT',asset_identity:entries.BTT.identities[0],asset_metadata:{},run_id:'TRON_DAY_LIMIT',now,coingecko_demo_api_key:'CG-test-only-key-123456789',request_admit:()=>{admissions++;return{allowed:true};},fetch_impl:async()=>{calls++;throw Error('NO_SOURCE_HTTP');}});assert.equal(r.network_calls,0);assert.equal(calls,0);assert.equal(admissions,0);assert.equal(d.raw.prepare("SELECT attempts FROM report2_evidence_source_daily WHERE source='COINGECKO_SECTOR'").get().attempts,224);}finally{d.raw.close();}
});
