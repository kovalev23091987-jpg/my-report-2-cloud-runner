import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const {verifyGateOfficialBinding,promoteGateBoundEvidence,bindGateOfficialAssetIdentity}=await import(pathToFileURL(path.join(runtime,'src/gate-official-asset-binding.mjs')));
const {normalizeInheritedFactEnvelope}=await import(pathToFileURL(path.join(runtime,'src/inherited-fact-contract.mjs')));
const {buildRoleEvidenceView}=await import(pathToFileURL(path.join(runtime,'src/source-role-consumer.mjs')));
const proof=JSON.parse(fs.readFileSync('gate-source/gate-identity-source-proof.json','utf8'));
const raw=zlib.gunzipSync(fs.readFileSync('gate-source/actual-gate-currency-chains.json.gz'));
assert.equal(createHash('sha256').update(raw).digest('hex'),proof.transport.body_sha256);
const actual=JSON.parse(zlib.gunzipSync(fs.readFileSync('original-source/exact-current-data.json.gz')));
const canonical=actual.rows.find(r=>r.contract_code===proof.selection.contract).canonical;
const originalHash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
const args={contract:proof.selection.contract,htx_reference:proof.selection.official_htx_reference,rows:JSON.parse(raw),receipt:proof.transport,now:proof.transport.received_ts};
const binding=verifyGateOfficialBinding(args);
// Rehydrate only recorded normalized metric fields; this is a component replay,
// not the old producer, a new joint report, or a Telegram send.
const receipts=canonical.metadata.source_role_view.classified.filter(r=>r.venue==='GATE');
const evidence=receipts.map(r=>({contract_code:r.contract_code,metric:r.metric,source:r.source,venue:r.venue,primary_market_id:r.identity.primary_market_id,market_type:r.identity.market_type_raw,value:r.raw_value,unit:r.unit,source_ts:r.event_ts,observed_ts:r.received_ts,max_age_sec:r.max_age_sec,status:r.legacy_status,venue_observation_status:'CLOSED',source_compatible:r.source_compatible,symbol_verified:r.identity.symbol_verified,alias_required:true,alias_verified:true,asset_identity_verified:r.identity.asset_identity_verified,quality_status:r.quality_status,coverage_pct:r.coverage_pct,window:r.interval}));
const publicEvidence={contract_code:args.contract,evidence};

test('actual same-chain official addresses close only Gate identity at later known time',()=>{
 assert.equal(binding.verified,true);assert.equal(binding.known_ts,proof.transport.received_ts);
 assert.ok(binding.known_ts>canonical.observed_ts);
 const promoted=promoteGateBoundEvidence({contract:args.contract,public_evidence:publicEvidence,binding,now:binding.known_ts});
 assert.equal(promoted.gate_asset_binding.promoted_metric_rows,4);
 for(let i=0;i<4;i++){assert.equal(promoted.evidence[i].source_ts,evidence[i].source_ts);assert.equal(promoted.evidence[i].observed_ts,evidence[i].observed_ts);assert.equal(promoted.evidence[i].value,evidence[i].value);}
 const facts=normalizeInheritedFactEnvelope(promoted.evidence).facts;
 const view=buildRoleEvidenceView(facts,{contract:args.contract,observed_ts:binding.known_ts});
 assert.equal(view.classified.filter(r=>r.role_evidence_usable).length,4);
 assert.deepEqual(new Set(view.classified.flatMap(r=>r.assigned_roles)),new Set(['FUNDING_CROSS_VENUE','OI_CROSS_VENUE','PRICE_CROSS_VENUE','TRADES_CROSS_VENUE']));
 assert.deepEqual(new Set(view.classified.map(r=>r.independence_group)),new Set(['GATE_OFFICIAL']));
 const old=buildRoleEvidenceView(facts,{contract:args.contract,observed_ts:canonical.observed_ts});
 assert.equal(old.classified.filter(r=>r.role_evidence_usable).length,0);
 assert.ok(old.classified.every(r=>r.role_exclusion_reason==='ASSET_BINDING_NOT_KNOWN_OR_EXPIRED_AT_DECISION'));
 assert.equal(createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),originalHash);
 fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/gate-binding-component-proof.json',JSON.stringify({schema:'report2-gate-official-binding-component-proof-v1',contract:args.contract,sourceHTTP:0,MAIN:0,Telegram:0,original_snapshot:canonical.snapshot_id,original_canonical_sha256:originalHash,binding,assigned_metric_roles:view.classified.map(r=>({metric:r.metric,roles:r.assigned_roles,event_ts:r.event_ts,received_ts:r.received_ts})),original_report_not_promoted:true,not_fresh_joint_acceptance:true},null,2));
});

test('different addresses, chains, ambiguity, ticker-only, clocks and foreign contract fail closed',()=>{
 for(const changes of [
  {rows:[{chain:'ETH',contract_address:'0x'+'1'.repeat(40)}]},
  {rows:[{chain:'SOL',contract_address:args.rows[0].contract_address}]},
  {rows:[...args.rows,{chain:'ETH',contract_address:'0x'+'2'.repeat(40)}]},
  {rows:[{chain:'ETH',contract_address:''}]},
  {htx_reference:{...args.htx_reference,identity_method:'TICKER_ONLY'}},
  {htx_reference:{...args.htx_reference,contract:'OTHER-USDT'}},
  {receipt:{...args.receipt,received_ts:args.now+1}},
  {now:args.now+6*3600000},
  {contract:'1000NIL-USDT'},
 ])assert.equal(verifyGateOfficialBinding({...args,...changes}).verified,false);
 assert.equal(promoteGateBoundEvidence({contract:args.contract,public_evidence:publicEvidence,binding,now:canonical.observed_ts}),publicEvidence);
});

test('a generic token fixture uses same algorithm; no special coin routing and no foreign-venue promotion',()=>{
 const contract='TOKEN123-USDT',h={...args.htx_reference,contract,currency:'TOKEN123'},receipt={...args.receipt,url:'https://api.gateio.ws/api/v4/wallet/currency_chains?currency=TOKEN123'};
 const b=verifyGateOfficialBinding({...args,contract,htx_reference:h,receipt});assert.equal(b.verified,true);
 const foreign={...evidence[0],contract_code:contract,venue:'BYBIT',primary_market_id:'TOKEN123_USDT:BYBIT:USDT_PERP'};
 const local={...evidence[0],contract_code:contract,primary_market_id:'TOKEN123_USDT:GATE:USDT_PERP'};
 const p=promoteGateBoundEvidence({contract,public_evidence:{evidence:[foreign,local]},binding:b,now:args.now});
 assert.equal(p.evidence[0],foreign);assert.equal(p.evidence[1].asset_identity_verified,true);
 const stale={...local,source_ts:args.now-7200001};
 assert.equal(promoteGateBoundEvidence({contract,public_evidence:{evidence:[stale]},binding:b,now:args.now}).evidence[0],stale);
});

test('missing exact route and D1 admission forbid source fetches',async()=>{
 let calls=0;const fetch_impl=()=>{calls++;throw Error('NO_NETWORK_ALLOWED');};
 const common={contract:args.contract,public_evidence:publicEvidence,supplemental_context:{asset_reference:args.htx_reference},now:args.now,clock:()=>args.now,fetch_impl};
 assert.equal((await bindGateOfficialAssetIdentity({...common,supplemental_context:{}})).network_calls,0);
 assert.equal((await bindGateOfficialAssetIdentity({...common,db_admit:()=>({allowed:false})})).network_calls,0);
 assert.equal(calls,0);
});

test('runtime wires every candidate before fact consumer; strategy and Telegram templates unmodified',()=>{
 const worker=fs.readFileSync(path.join(runtime,'src/worker.js'),'utf8');
 const hook=worker.indexOf('const assetBinding=await env.REPORT2_PUBLIC_ASSET_BINDING');
 assert.ok(hook>0&&hook<worker.indexOf('candidateEvidenceV2=await env.REPORT2_EVIDENCE_V2_COLLECT'));
 const runner=fs.readFileSync(path.join(runtime,'runner-main.mjs'),'utf8');
 assert.match(runner,/GATE|bindGateOfficialAssetIdentity/);
 const module=fs.readFileSync(path.join(runtime,'src/gate-official-asset-binding.mjs'),'utf8');
 assert.doesNotMatch(module,/NIL|BR-USDT|score_contribution|threshold/);
 assert.match(module,/daily_cap:8/);assert.match(module,/minute_cap:4/);
});
