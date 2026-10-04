import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'runtime'),load=name=>import(pathToFileURL(path.join(root,name)));
const {RemoteD1Database}=await load('report2-d1-adapter.mjs');
const {collectHtxPublicRiskEvidence,normalizeHtxPublicRisk}=await load('src/htx-public-risk-evidence.mjs');
const {collectOfficialTokenSchedule,exactTokenScheduleRoute}=await load('src/official-token-schedule.mjs');
const {collectOfficialEventsEvidence}=await load('src/official-events-evidence.mjs');
const {consumeBlockResultContext}=await load('src/block-result-context.mjs');
const {planCandidateEvidenceRoutes,BLOCK_SOURCE_REQUIREMENTS}=await load('src/candidate-evidence-v2-runtime.mjs');
const {reserveEvidenceSourceAttempts}=await load('src/evidence-source-store.mjs');
const {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries}=await load('src/official-source-registry.mjs');
const {parseSupplementalIdentityRegistry}=await load('src/supplemental-candidate-context.mjs');
const {createUnifiedHttpBudget}=await load('src/unified-budget.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),budget=createUnifiedHttpBudget(),run_id=`REMAINING_FACTS:${process.env.GITHUB_RUN_ID}`,calls=[],raw=[];
const allowed=new Set(['https://api.hbdm.com/linear-swap-api/v1/swap_contract_info','https://api.hbdm.com/linear-swap-api/v1/swap_api_state','https://api.hbdm.com/linear-swap-api/v1/swap_adjustfactor','https://api.hbdm.com/linear-swap-api/v1/swap_cross_adjustfactor','https://www.near.org/','https://aptosnetwork.com/currents/aptos-tokenomics-overview','https://medium.com/feed/@bitwayofficial']);
const fetch_impl=async(url,options)=>{assert.ok(allowed.has(url),`UNPLANNED_SOURCE:${url}`);assert.ok(calls.length<8);calls.push({url,method:options?.method||'GET'});const response=await fetch(url,options);raw.push({url,http_status:response.status,received_ts:Date.now(),body:await response.clone().text()});return response;};
const request_admit=r=>budget.reserve(r),catalogId=`${run_id}:CATALOG`;
assert.equal(request_admit({logical_request_id:catalogId,lane:'background',attempts:1}).allowed,true);
assert.equal((await reserveEvidenceSourceAttempts(db,{source:'HTX_PUBLIC_RISK',reservation_id:catalogId,attempts:1,daily_cap:144,now:Date.now()})).allowed,true);
const response=await fetch_impl('https://api.hbdm.com/linear-swap-api/v1/swap_contract_info',{redirect:'error',signal:AbortSignal.timeout(8000)}),catalog=await response.json();assert.ok(response.ok&&catalog.status==='ok'&&Array.isArray(catalog.data));
const worker=fs.readFileSync(path.join(root,'src/worker.js'),'utf8'),code=worker.slice(worker.indexOf('function classifyHtxInstrumentScope('),worker.indexOf('function symbolFingerprint(')),classify=vm.runInNewContext(code+';classifyHtxInstrumentScope',{}),active=catalog.data.filter(r=>r.contract_status===1),eligible=active.filter(r=>classify(r).eligible_for_crypto_discovery),excluded=active.filter(r=>!classify(r).eligible_for_crypto_discovery).map(r=>({contract:r.contract_code,scope:classify(r)}));
assert.ok(eligible.length>0);assert.equal(eligible.some(r=>['EURUSD-USDT','GBPUSD-USDT','USDJPY-USDT','USDBRL-USDT'].includes(r.contract_code)),false);
const official=compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(path.join(root,'main-official-event-sources.json')))),registry=parseSupplementalIdentityRegistry(mergeOfficialAndConfiguredRegistries({official,configured:process.env.REPORT2_SUPPLEMENTAL_IDENTITY_REGISTRY_JSON||{}}).registry).entries;
const refRow=await db.prepare('SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_ASSET_REFERENCE','ALL_CURRENCIES_CHAIN_ADDRESSES_V1').first(),references=JSON.parse(refRow?.payload_json||'null');
// A single globally scoped transport serves every exact contract. This is
// factual source coverage for N08/N09, not one request per crypto future.
const risk=await collectHtxPublicRiskEvidence({db,fetch_impl,request_admit,contract:eligible[0].contract_code,run_id,now:Date.now(),strict_fresh_manual:true});
const sharedRow=await db.prepare('SELECT payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 LIMIT 1').bind('HTX_PUBLIC_RISK','ALL_HTX_LINEAR_SWAPS_V2').first(),shared=JSON.parse(sharedRow?.payload_json||'null');
const freshShared=shared?.version===risk.version&&shared.run_id===run_id;
const matrix=eligible.map(row=>{
 const contract=row.contract_code,base=row.symbol,entry=registry[base],identity=entry?.identity||(references?.entries?.[base]?.status==='CLOSED'?references.entries[base].identities[0]:null),plan=planCandidateEvidenceRoutes({contract,asset_identity:identity,asset_metadata:entry||{}}),r=freshShared?normalizeHtxPublicRisk({contract,...shared.payloads,observed_ts:shared.observed_ts}):{status:'FRESH_SHARED_HTX_RESPONSE_NOT_CLOSED',evidence:[]},context=consumeBlockResultContext({contract,evidence:r.evidence,now:Date.now()});
 return{contract,scope:classify(row),identity,route_names:['HTX',...plan.routes.map(r=>r.name)],all_15_assigned:Object.keys(BLOCK_SOURCE_REQUIREMENTS).length===15,block_assignments:BLOCK_SOURCE_REQUIREMENTS,actual_shared_risk_status:r.status,actual_context_block_ids:[...new Set(context.facts.map(f=>f.block_id))],actual_facts:context.facts,other_sources_executed:false,all_15_useful_on_this_contract:false};
});
const documents=[];
for(const row of matrix){const base=row.contract.replace(/-USDT$/,''),entry=registry[base],identity=entry?.identity||row.identity;if(!exactTokenScheduleRoute({contract:row.contract,asset_identity:identity}))continue;const result=await collectOfficialTokenSchedule({db,fetch_impl,request_admit,contract:row.contract,asset_identity:identity,run_id,now:Date.now(),strict_fresh_manual:true});documents.push({contract:row.contract,result,context:consumeBlockResultContext({contract:row.contract,evidence:result.evidence,now:Date.now()})});}
const btw=registry.BTW,feed=btw?await collectOfficialEventsEvidence({db,fetch_impl,request_admit,contract:'BTW-USDT',asset_identity:btw.identity,asset_metadata:btw,run_id,now:Date.now(),strict_fresh_manual:true}):{status:'OFFICIAL_FEED_REQUIRED',evidence:[]};
const usage=db.usageSnapshot();assert.equal(usage.unknown_ops,0);assert.ok(usage.rows_read<=15000&&usage.rows_written<=80);
const audit={schema:'remaining-block-facts-live-v1',github_head:process.env.GITHUB_SHA,run_id,observed_ts:Date.now(),catalog_contracts:catalog.data.length,active_contracts:active.length,crypto_contracts:matrix.length,excluded_contracts:excluded.length,all_15_assigned:matrix.every(r=>r.all_15_assigned),shared_risk_source:risk,shared_risk_fresh:freshShared,shared_n08_context_contracts:matrix.filter(r=>r.actual_facts.some(f=>f.block_id==='N08')).length,shared_n09_context_contracts:matrix.filter(r=>r.actual_facts.some(f=>f.block_id==='N09')).length,documents,official_feed:{result:feed,context:consumeBlockResultContext({contract:'BTW-USDT',evidence:feed.evidence,now:Date.now()})},source_http:calls.length,calls,database_usage:usage,production_write_scope:'EXISTING_PROVIDER_QUOTA_AND_SOURCE_CACHE_ONLY',deep_checks_started:0,canonical_writes:0,telegram_calls:0,all_15_live_accepted:false,main_accepted:false,telegram_delivery_proven:false};
fs.writeFileSync('audit-output/remaining-facts-live-verification.json',JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync('audit-output/htx-crypto-block-route-matrix.json',JSON.stringify({schema:'all-active-htx-crypto-route-matrix-v2',source_ts:catalog.ts,catalog_sha256:crypto.createHash('sha256').update(raw[0].body).digest('hex'),scope:'HTX_ACTIVE_USDT_SWAPS',matrix,excluded},null,2)+'\n');
fs.writeFileSync('audit-output/remaining-facts-source-bodies.json',JSON.stringify(raw,null,2)+'\n');
console.log(JSON.stringify({crypto_contracts:matrix.length,all_15_assigned:audit.all_15_assigned,shared_n08_context_contracts:audit.shared_n08_context_contracts,document_statuses:documents.map(d=>[d.contract,d.result.status,d.context.facts.length]),feed_status:feed.status,source_http:calls.length,database_usage:usage,all_15_live_accepted:false}));
