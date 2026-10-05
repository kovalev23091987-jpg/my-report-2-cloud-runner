import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.REPORT2_NATIVE_MODULE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_NATIVE_MODULE_ROOT)+'/'):new URL('../files/src/',import.meta.url);
const load=name=>import(new URL(name,root));
const {normalizeChainSupply,collectChainSupplyEvidence}=await load('chain-supply-evidence.mjs');
const {compileOfficialSourceRegistry,mergeOfficialAndConfiguredRegistries}=await load('official-source-registry.mjs');
const {parseSupplementalIdentityRegistry,chooseSupplementalLane,sameChainAssetIdentity}=await load('supplemental-candidate-context.mjs');
const {consumeBlockResultContext,auditRenderedBlockResults}=await load('block-result-context.mjs');
const {canonicalFingerprint,renderCanonicalTelegram,assessActionability}=await load('canonical-publication.mjs');
const {formatManualReport}=await load('manual-report-formatter.mjs');
const {normalizeOfficialEvent}=await load('evidence-source-adapters.mjs');
const {auditCandidateBlocks,sourceWasActuallyChecked}=await load('candidate-evidence-v2-runtime.mjs');
const {consumeEvidenceV2}=await load('evidence-v2.mjs');
const identity={chain:'near',asset_kind:'NATIVE',native_asset_id:'near:mainnet',contract_or_mint:null};
const NOW=Date.parse('2026-10-04T14:40:00Z'),hash='11111111111111111111111111111111';
function memoryDB(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(row=>row.run()));}};}
test('native registry survives compilation/merge/parse and never becomes a wrapped DEX lane',()=>{
 const sources=JSON.parse(fs.readFileSync(new URL('../files/main-official-event-sources.json',import.meta.url)));
 const compiled=compileOfficialSourceRegistry(sources,{now:Date.parse('2026-10-05T04:30:00Z')}),merged=mergeOfficialAndConfiguredRegistries({official:compiled,configured:{}}),entry=parseSupplementalIdentityRegistry(merged.registry).entries.NEAR;
 assert.deepEqual(entry.identity,identity);assert.deepEqual(entry.official_feeds,[]);
 assert.equal(chooseSupplementalLane({entry,derivatives_venues:2}),null);
 assert.equal(sameChainAssetIdentity(identity,{...identity}),true);
 assert.equal(sameChainAssetIdentity(identity,{chain:'near',contract_or_mint:'wrap.near'}),false);
 assert.equal(compileOfficialSourceRegistry(JSON.parse(fs.readFileSync(new URL('../files/official-event-sources.json',import.meta.url))),{now:NOW}).registry.NEAR,undefined);
 assert.throws(()=>mergeOfficialAndConfiguredRegistries({official:compiled,configured:{NEAR:{chain:'ethereum',contract_or_mint:'0x1111111111111111111111111111111111111111'}}}),/IDENTITY_REGISTRY_CONFLICT/);
 const wrong=structuredClone(sources);wrong.entries.find(row=>row.contract_code==='NEAR-USDT').contract_code='BR-USDT';assert.throws(()=>compileOfficialSourceRegistry(wrong,{now:NOW}),/NATIVE_CONTRACT_BINDING/);
});
test('native finalized total supply uses mainnet status and one exact block, two admitted HTTP only',async()=>{
 const db=memoryDB(),calls=[],admissions=[];
 const out=await collectChainSupplyEvidence({db,asset_identity:identity,identity_method:'OFFICIAL_MAINNET_REGISTRY',contract:'NEAR-USDT',run_id:'NATIVE_CONTROL',now:NOW,clock:()=>NOW,
 request_admit:row=>{admissions.push(row);return{allowed:true};},fetch_impl:async(url,init)=>{assert.equal(url,'https://rpc.mainnet.near.org');const request=JSON.parse(init.body);calls.push(request);return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:request.method==='status'?{chain_id:'mainnet',sync_info:{syncing:false}}:{header:{hash,height:123,total_supply:'1000000000000000000000000000000001',timestamp_nanosec:String(BigInt(NOW-60000)*1000000n)}}}));}});
 assert.equal(out.status,'CLOSED');assert.equal(out.network_calls,2);assert.equal(admissions[0].attempts,2);assert.deepEqual(calls.map(row=>row.method),['status','block']);assert.deepEqual(calls[1].params,{finality:'final'});
 assert.equal(out.evidence[0].asset_id,'near:native:mainnet');assert.equal(out.evidence[0].token_address,null);assert.equal(out.evidence[0].source_ts,NOW-60000);assert.equal(out.summary.decimals,24);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
 db.sqlite.close();
});
test('wrong network, syncing node, guessed identity and other ticker fail closed before native supply',async()=>{
 for(const status of [{chain_id:'testnet',sync_info:{syncing:false}},{chain_id:'mainnet',sync_info:{syncing:true}}]){
  const db=memoryDB(),calls=[];const out=await collectChainSupplyEvidence({db,asset_identity:identity,contract:'NEAR-USDT',run_id:'FAIL',now:NOW,clock:()=>NOW,request_admit:()=>({allowed:true}),fetch_impl:async(url,init)=>{calls.push(JSON.parse(init.body).method);return new Response(JSON.stringify({result:status}));}});
  assert.deepEqual(calls,['status']);assert.notEqual(out.status,'CLOSED');assert.equal(out.evidence.length,0);db.sqlite.close();
 }
 for(const [contract,id] of [['BR-USDT',identity],['NEAR-USDT',{chain:'near'}],['NEAR-USDT',{chain:'near',contract_or_mint:'wrap.near'}]])assert.equal(normalizeChainSupply({contract,identity:id,current:{supply:'1',decimals:24,source_ts:NOW,finalized:true},observed_ts:NOW}).status,'EXACT_ASSET_IDENTITY_REQUIRED');
});
test('supply delta requires exact units, distinct blocks and strictly increasing verified clocks',()=>{
 const current={supply:'90',decimals:24,source_ts:NOW-10,block_ref:hash,finalized:true},previous={chain:'near',address:'native:mainnet',supply:'100',decimals:24,source_ts:NOW-20,block_ref:'22222222222222222222222222222222',finalized:true};
 const normalize=prior=>normalizeChainSupply({identity,contract:'NEAR-USDT',current,previous:prior,observed_ts:NOW});
 assert.equal(normalize(previous).evidence[0].metric_family,'SUPPLY_DECREASE');assert.equal(normalize(previous).evidence[0].block_id,'N03');
 for(const patch of [{source_ts:NOW+1},{source_ts:current.source_ts},{source_ts:null},{block_ref:hash},{block_ref:null},{decimals:18},{finalized:false},{address:'wrap.near'}])assert.equal(normalize({...previous,...patch}).evidence[0].metric_family,'TOTAL_SUPPLY_OBSERVATION');
 assert.equal(normalizeChainSupply({identity,contract:'NEAR-USDT',current:{...current,finalized:false},observed_ts:NOW}).status,'SOURCE_FINALITY_NOT_CLOSED');
 assert.equal(normalizeChainSupply({identity,contract:'NEAR-USDT',current:{...current,source_ts:NOW-1200001},observed_ts:NOW}).status,'STALE_FINALIZED_SUPPLY');
 assert.equal(sourceWasActuallyChecked({status:'STALE_FINALIZED_SUPPLY',network_calls:2}),false);
});
test('one native observation reaches both existing report surfaces without scores or Telegram delivery',()=>{
 const c=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
 // Explicit presentation fixture; never a fresh candidate or send command.
 c.direction='LONG';c.state='OBSERVE';c.metadata.contract='NEAR-USDT';
 c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:c.observed_ts+600000,next_recheck_ts:c.observed_ts+60000,cancel_condition:'price<1'};
 const normalized=normalizeChainSupply({identity,contract:'NEAR-USDT',current:{supply:'1000000000000000000000001',decimals:24,source_ts:c.observed_ts-60000,block_ref:hash,finalized:true},observed_ts:c.observed_ts});
 c.metadata.internal_market_context.evidence_v2.evidence=normalized.evidence;c.metadata.supporting_context={facts:consumeBlockResultContext({evidence:normalized.evidence,contract:'NEAR-USDT',now:c.observed_ts}).facts};c.source_receipts=[];c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c),tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}),proof=auditRenderedBlockResults({canonical:c,manual,telegram:tg});
 assert.equal(manual.ok,true,manual.status);assert.equal(tg.ok,true,tg.status);assert.deepEqual(proof.used_context_block_ids,['N02']);assert.deepEqual(proof.telegram_used_context_block_ids,['N02']);assert.equal(proof.telegram_delivery_proven,false);assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).deliver,false);
 for(const text of [manual.text,tg.text])assert.match(text,/Наблюдение предложения нативного NEAR:.*одно подтверждённое наблюдение/);
 assert.equal(c.metadata.supporting_context.facts[0].score_contribution,0);
});
test('general announcement feed cannot mark N01 unlock/vesting schedule checked',()=>{
 const audit=auditCandidateBlocks({sources:{OFFICIAL_EVENTS:{status:'CLOSED',network_calls:1},OFFICIAL_TOKEN_SCHEDULE:{status:'STRUCTURED_TOKEN_SCHEDULE_REQUIRED',network_calls:0}},decision_ts:NOW});
 assert.equal(audit.blocks.N01.checked,false);assert.deepEqual(audit.blocks.N01.missing_required,['OFFICIAL_TOKEN_SCHEDULE']);assert.equal(audit.blocks.N07.checked,true);assert.equal(audit.block_count??Object.keys(audit.blocks).length,15);
});
test('typed unlock cannot bypass confirmation or create risk from negative/incomplete amounts',()=>{
 const input={asset_id:'near:native:mainnet',htx_contract:'NEAR-USDT',event_id:'UNLOCK_CONTROL',event_type:'TOKEN_UNLOCK',effective_at:NOW+1000,source_ts:NOW-1000,observed_ts:NOW,amount_usd:10,htx_turnover_24h_usd:100,confirmed:true};
 for(const patch of [{confirmed:false},{amount_usd:-1},{amount_usd:null},{effective_at:null},{effective_at:NOW-2000}]){const row=normalizeOfficialEvent({...input,...patch});assert.equal(row.validation_status,'UNVERIFIED');assert.equal(row.risk_strength,null);}
 assert.equal(normalizeOfficialEvent(input).risk_strength,0.1);
});
