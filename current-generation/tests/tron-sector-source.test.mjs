import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const modulePath=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {normalizeHtxAssetReferences}=await import(modulePath('htx-asset-identity.mjs'));
const {collectCoingeckoSectorEvidence,verifyCoingeckoSectorIdentity,normalizeCoingeckoSector}=await import(modulePath('coingecko-sector-evidence.mjs'));
const {planCandidateEvidenceRoutes}=await import(modulePath('candidate-evidence-v2-runtime.mjs'));
const {consumeSectorContext}=await import(modulePath('sector-context.mjs'));
const {installEvidenceSourceStore,reserveEvidenceSourceAttempts,writeEvidenceSourceCache}=await import(modulePath('evidence-source-store.mjs'));
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
const actualRaw=zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/tron-sector-live-38570989795/validation.json.gz',import.meta.url))),actual=JSON.parse(actualRaw);
assert.equal(crypto.createHash('sha256').update(actualRaw).digest('hex'),'09f289569ce20757529c049e06815fd43b3eb03c182f292ad5db6865c4526429');
assert.equal(actual.cloud_run,38570989795);for(const r of actual.responses)assert.equal(crypto.createHash('sha256').update(r.body).digest('hex'),r.body_sha256);
const originalDirectory=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/native-sector-rest-38564913120/validation.json.gz',import.meta.url)))).responses.find(r=>r.url.endsWith('/categories/list'));
test('original WIN quote survives a separate same-symbol wrapper while duplicate target IDs and wrong address still fail',()=>{
 const metadata=JSON.parse(actual.responses.find(r=>r.url.includes('/contract/'+entries.WIN.identities[0].contract_or_mint)).body),quotes=JSON.parse(actual.responses.find(r=>r.url.includes('&category=oracle&')).body),categories=JSON.parse(originalDirectory.body),params={metadata,quotes,categories,identity:entries.WIN.identities[0],contract:'WIN-USDT',coin_id:'wink',category_id:'oracle',category_name:'Oracle',observed_ts:actual.completed_ts};
 assert.ok(quotes.some(r=>r.id==='winklink-bsc'&&r.symbol==='win'));
 const result=normalizeCoingeckoSector(params);assert.equal(result.status,'CLOSED');assert.ok(result.summary.eligible_peers>=3);assert.ok(result.evidence[0].peers.every(r=>r.symbol!=='WIN'&&r.id!=='winklink-bsc'));
 assert.equal(result.summary.target_source_ts,1791983988000);
 const target=quotes.find(r=>r.id==='wink');assert.equal(normalizeCoingeckoSector({...params,quotes:[...quotes,target]}).evidence.length,0);
 assert.equal(normalizeCoingeckoSector({...params,identity:entries.SUN.identities[0]}).evidence.length,0);
 const changed=quotes.map(r=>r.id==='wink'?{...r,symbol:'OTHER'}:r);assert.equal(normalizeCoingeckoSector({...params,quotes:changed}).evidence.length,0);
});
test('actual four TRON bodies reach the production cached collector and consumer at the original cutoff with no new HTTP',async t=>{
 const d=database(),cutoff=actual.completed_ts;let calls=0,admissions=0;const rows=[];t.mock.timers.enable({apis:['Date'],now:cutoff});
 try{await installEvidenceSourceStore(d);
  for(const r of [...actual.responses,originalDirectory]){
   const ttl=r.url.includes('/markets?')?60000:r.url.endsWith('/categories/list')?3600000:21600000;
   await writeEvidenceSourceCache(d,{source:'COINGECKO_SECTOR',asset_key:'REFERENCE:provider-reference-cache-v1-20261004:'+crypto.createHash('sha256').update(r.url).digest('hex'),observed_ts:r.received_ts,expires_ts:r.received_ts+ttl,payload:{version:'provider-reference-cache-v1-20261004',url:r.url,received_ts:r.received_ts,expires_ts:r.received_ts+ttl,body:r.body,body_sha256:r.body_sha256}});
  }
  for(const base of ['BTT','JST','SUN','WIN']){
   const contract=base+'-USDT',identity=entries[base].identities[0],result=await collectCoingeckoSectorEvidence({db:d,contract,asset_identity:identity,asset_metadata:{},run_id:'ACTUAL_TRON_ORIGINAL_REPLAY:'+base,now:cutoff,request_admit:()=>{admissions++;return{allowed:false};},fetch_impl:async()=>{calls++;throw Error('NO_NEW_HTTP');}}),context=consumeSectorContext({evidence:result.evidence,contract,asset_identity:identity,now:cutoff});
   assert.equal(result.status,'CLOSED',base);assert.equal(context.status,'CLOSED');assert.equal(result.network_calls,0);assert.equal(context.facts[0].score_contribution,0);assert.equal(context.directional_vote,false);assert.equal(context.hard_gate,false);assert.equal(result.evidence[0].entry_eligible,false);assert.equal(result.summary.target_source_ts,1791983988000);
   rows.push({contract,identity,status:result.status,summary:result.summary,evidence:result.evidence,consumer_status:context.status,consumer_facts:context.facts,source_HTTP:0,original_decision_cutoff:cutoff,production_natural_use:false});
  }
  assert.equal(calls,0);assert.equal(admissions,0);fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/tron-sector-retained-four-proof.json',JSON.stringify({schema:'ACTUAL_TRON4_RETAINED_PRODUCER_CONSUMER_V1',source_run:38570989795,source_head:actual.head,artifact:11897986609,digest:'sha256:1093e999a43615a7f5cde07999aeedf5eb488d8afdefa2f8ff516286865c5d37',original_sha256:'09f289569ce20757529c049e06815fd43b3eb03c182f292ad5db6865c4526429',rows,source_HTTP:0,D1:0,MAIN:0,Telegram:0,original_clocks_unchanged:true},null,2)+'\n');
 }finally{d.raw.close();t.mock.timers.reset();}
});
