import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_NEW_SOURCE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_NEW_SOURCE_ROOT)+'/'):new URL('../files/src/',import.meta.url);const load=name=>import(new URL(name,root));
const {parseSupplementalIdentityRegistry}=await load('supplemental-candidate-context.mjs');
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {DatabaseSync} from 'node:sqlite';
const {compileOfficialSourceRegistry}=await load('official-source-registry.mjs');
const {normalizeGithubReleases}=await load('github-official-releases.mjs');
const {normalizeStellarPublishedSupply}=await load('stellar-primary-supply.mjs');
const {normalizeNativeLedgerPair,xrplNodeHealthy}=await load('native-ledger-supply.mjs');
const {collectChainSupplyEvidence}=await load('chain-supply-evidence.mjs');
const {collectOfficialEventsEvidence}=await load('official-events-evidence.mjs');
const {consumeBlockResultContext}=await load('block-result-context.mjs');
const {consumeEvidenceV2}=await load('evidence-v2.mjs');
const {auditCanonicalBlockDecisionUse}=await load('block-decision-use-audit.mjs');
const {planCandidateEvidenceRoutes,collectEvidenceRouteBlock}=await load('candidate-evidence-v2-runtime.mjs');
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('fixtures/block-connections-20261007/'+name,import.meta.url))));
const research=read('research-run37574060777.json.gz'),health=read('native-health-run37574793676.json.gz');
const registry=compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(new URL('../files/main-official-event-sources.json',import.meta.url))),{now:1791351600000}).registry;
const identity=chain=>({chain,asset_kind:'NATIVE',native_asset_id:chain+':mainnet',contract_or_mint:null});
class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}}
function releaseParams(symbol,chain){const rec=research.responses.find(r=>r.url.includes(registry[symbol].official_feed_specs[0].github_repository));return{contract:symbol+'-USDT',asset_identity:identity(chain),asset_metadata:registry[symbol],feed_url:rec.url,body:JSON.stringify(rec.payload),observed_ts:rec.receive_ts};}
test('actual official release replies reach N07 consumers with original clocks and no score or deployment assertion',()=>{
 for(const [symbol,chain,count] of [['APT','aptos',2],['XLM','stellar',1],['XRP','xrp',0]]){
  const p=releaseParams(symbol,chain);p.asset_metadata=parseSupplementalIdentityRegistry({[symbol]:p.asset_metadata}).entries[symbol];const r=normalizeGithubReleases(p);assert.equal(r.status,count?'CLOSED':'CLOSED_BOUNDED_OFFICIAL_FEED_CHECK');assert.equal(r.events.length,count);
  const facts=consumeBlockResultContext({contract:p.contract,evidence:r.evidence,now:p.observed_ts});assert.equal(facts.facts.length,count||1);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:p.observed_ts}).adjustment,0);
  for(const row of r.events){assert.equal(row.source_ts,Date.parse(JSON.parse(p.body).find(x=>x.id===row.github_release_id).published_at));assert.equal(row.mainnet_deployment_verified,false);assert.equal(row.directional_strength,null);}
  assert(!r.events.some(r=>/internal|testnet|rc/i.test(r.event_title+' '+r.release_tag)));
 }
});
test('release identity, authorization, bounded schema and future dates fail closed without fabricated absence',()=>{
 const p=releaseParams('APT','aptos'),rows=JSON.parse(p.body);for(const bad of [{...p,contract:'XLM-USDT'},{...p,asset_identity:identity('foreign')},{...p,feed_url:p.feed_url.replace('aptos-labs','foreign')},{...p,asset_metadata:{...p.asset_metadata,official_feed_specs:[]}}])assert.equal(normalizeGithubReleases(bad).evidence.length,0);
 for(const payload of [{message:'limited'},[...rows,...rows],rows.map(r=>({...r,published_at:'2099-01-01T00:00:00Z'})),rows.map(r=>({...r,html_url:r.html_url.replace('aptos-labs','foreign')}))]){const r=normalizeGithubReleases({...p,body:JSON.stringify(payload)});assert.equal(r.evidence.length,0);assert.equal(r.feed_schema_checked,false);}
});
test('actual primary Stellar components reconcile, render N02 only and never interpret cumulative ledger coins as current circulating supply',()=>{
 const rec=health.responses.find(r=>r.url.includes('dashboard')),p={contract:'XLM-USDT',identity:identity('stellar'),payload:rec.payload,observed_ts:rec.receive_ts},r=normalizeStellarPublishedSupply(p);assert.equal(r.status,'CLOSED');assert.deepEqual(r.evidence.map(r=>r.block_id),['N02']);assert.equal(r.evidence[0].source_ts,Date.parse(rec.payload.updatedAt));
 const f=consumeBlockResultContext({contract:p.contract,evidence:r.evidence,now:p.observed_ts});assert.deepEqual(f.facts,[]);assert.equal(r.evidence[0].block_id,'N02');assert.equal(consumeEvidenceV2(r.evidence,{base_interest:82,decision_ts:p.observed_ts}).final_interest,82);
 for(const bad of [{...p,payload:{...p.payload,totalSupply:'105443902087.3472865'}},{...p,observed_ts:Date.parse(p.payload.updatedAt)-1},{...p,observed_ts:rec.receive_ts+7*60*60_000},{...p,identity:{...p.identity,contract_or_mint:'wrapped'}},{...p,contract:'XRP-USDT'}])assert.equal(normalizeStellarPublishedSupply(bad).evidence.length,0);
 const row=structuredClone(r.evidence[0]);row.supply_values_base_units.totalSupply='1';assert.equal(consumeBlockResultContext({contract:p.contract,evidence:[row],now:p.observed_ts}).facts.length,0);
});
test('both actual Ripple endpoints with corruption_detected are rejected despite successful HTTP and validated ledgers',()=>{
 const network=research.responses.find(r=>r.request_body?.method==='server_info').payload,cur=research.responses.find(r=>r.request_body?.params?.[0]?.ledger_index==='validated'),prev=research.responses.find(r=>r.request_body?.params?.[0]?.ledger_hash);
 assert.equal(xrplNodeHealthy(network),false);assert.equal(xrplNodeHealthy(health.responses.find(r=>r.request_body?.method==='server_info').payload),false);
 assert.notEqual(normalizeNativeLedgerPair({chain:'xrp',network,current_payload:cur.payload,previous_payload:prev.payload,observed_ts:prev.receive_ts}).status,'CLOSED');
});
test('new connections use the shared route transport guard, retained data clocks and cached evidence without replaying HTTP',async()=>{
 const rec=health.responses.find(r=>r.url.includes('dashboard')),T=rec.receive_ts,db=new DB();let calls=0;
 const params={db,contract:'XLM-USDT',run_id:'RETAINED_STELLAR',asset_identity:identity('stellar'),now:T,clock:()=>T,request_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;assert.equal(url,rec.url);return new Response(JSON.stringify(rec.payload));}};
 const blocked=await collectEvidenceRouteBlock({routes:[{name:'CHAIN_SUPPLY'}],collectors:{CHAIN_SUPPLY:()=>{throw Error('PAUSED_SOURCE_MUST_NOT_RUN');}},params,max_requests:1});assert.equal(blocked.network_calls,0);assert.equal(blocked.reserved_requests,0);assert.equal(blocked.results.CHAIN_SUPPLY.status,'BLOCK_PAUSED_BY_OWNER');assert.equal(calls,0);
 const first=await collectChainSupplyEvidence(params),second=await collectChainSupplyEvidence({...params,now:T+1,run_id:'RAW_ARCHIVE_CLOCK_CHECK'});assert.equal(first.network_calls,1);assert.equal(second.network_calls,0);assert.equal(second.evidence[0].source_ts,Date.parse(rec.payload.updatedAt));assert.equal(second.evidence[0].observed_ts,T);assert.equal(calls,1);assert.equal(consumeBlockResultContext({contract:params.contract,evidence:second.evidence,now:T+1}).facts.length,0);
 const planned=planCandidateEvidenceRoutes(params);assert(!planned.routes.some(r=>r.name==='CHAIN_SUPPLY'));assert(!planned.routes.some(r=>r.name==='CHAIN_EVENTS'));
});
test('official GitHub collector honors exact issuer registry and leaves four of twelve daily attempts for protected manual use',async()=>{
 const p=releaseParams('APT','aptos'),T=p.observed_ts,db=new DB();let calls=0;const base={db,contract:p.contract,asset_identity:p.asset_identity,asset_metadata:p.asset_metadata,now:T,clock:()=>T,request_admit:()=>({allowed:true}),fetch_impl:async(url,init)=>{calls++;assert.equal(url,p.feed_url);assert.equal(init.headers.accept,'application/vnd.github+json');return new Response(p.body);}};
 const limitedDb=new DB(),fixed={...base,db:limitedDb};
 for(let i=0;i<8;i++){const r=await collectOfficialEventsEvidence({...fixed,run_id:'R'+i,strict_fresh_manual:true});assert.equal(r.network_calls,1);}
 await limitedDb.prepare('DELETE FROM report2_evidence_source_cache').run();const limit=await collectOfficialEventsEvidence({...fixed,run_id:'R8'});assert.equal(limit.network_calls,0);assert.equal(limit.status,'OFFICIAL_RELEASE_DAILY_CAP');
 for(let i=0;i<4;i++)assert.equal((await collectOfficialEventsEvidence({...fixed,run_id:'MANUAL'+i,strict_fresh_manual:true})).network_calls,1);assert.equal((await collectOfficialEventsEvidence({...fixed,run_id:'MANUAL_EXHAUSTED',strict_fresh_manual:true})).network_calls,0);
});

test('GitHub rate backoff is durable across projects and manual requests cannot bypass it',async()=>{
 const a=releaseParams('APT','aptos'),db=new DB(),T=a.observed_ts;let calls=0;
 const common={db,now:T,clock:()=>T,request_admit:()=>({allowed:true}),fetch_impl:async()=>{calls++;return new Response('{}',{status:429});}};
 const first=await collectOfficialEventsEvidence({...common,contract:a.contract,asset_identity:a.asset_identity,asset_metadata:a.asset_metadata,run_id:'RATE'});assert.equal(first.network_calls,1);assert.equal(first.evidence.length,0);
 const b=releaseParams('XLM','stellar');const second=await collectOfficialEventsEvidence({...common,contract:b.contract,asset_identity:b.asset_identity,asset_metadata:b.asset_metadata,run_id:'OTHER_PROJECT',strict_fresh_manual:true});assert.equal(second.network_calls,0);assert.equal(second.status,'OFFICIAL_RELEASE_PROVIDER_BACKOFF');assert.equal(calls,1);
});

test('actual empty XRP release subset is checked and rendered but never inflates participating blocks; actual Aptos release remains useful',()=>{
 for(const [symbol,chain,expected] of [['XRP','xrp',false],['APT','aptos',true]]){
  const p=releaseParams(symbol,chain),result=normalizeGithubReleases(p),row=result.evidence[0],facts=consumeBlockResultContext({contract:p.contract,evidence:[row],now:p.observed_ts}).facts;
  const receipt={source_id:'EVIDENCE_V2',provider_object_id:row.evidence_id,score_contribution:0,assessment_mode:'NEUTRAL_CONTEXT_ONLY_NO_BASE_SCORE',evidence_v2_receipts:[{evidence_id:row.evidence_id,block_id:'N07',consumer:'OFFICIAL_EVENT_RISK',reason:'CONSUMED'}]};
  const canonical={run_id:'CONTROLLED_AUDIT_RETAINED_SOURCE',snapshot_id:'RETAINED_SOURCE',direction:null,observed_ts:p.observed_ts,metadata:{contract:p.contract,internal_market_context:{decision_ts:p.observed_ts,evidence_v2:{evidence:[row],block_coverage:{blocks:{N07:{checked:true,source_checks:{OFFICIAL_EVENTS:{checked:true,valid_evidence_ids:[row.evidence_id]}}}}}}},supporting_context:{facts},supplemental_score_adjustment:{status:'BASE_SCORE_MISSING',receipts:[receipt]}}};
  const manual={ok:true,text:facts.map(r=>`- ${r.label}: ${r.value}`).join('\n')},a=auditCanonicalBlockDecisionUse(canonical,{manual});
  assert.equal(a.blocks.N07.checked,true);assert.equal(a.blocks.N07.decision_assessment_receipt_count,1);assert.equal(a.blocks.N07.participating,expected);assert.equal(a.blocks.N07.source_accounting.routes_with_meaningful_facts,expected?1:0);
 }
});
