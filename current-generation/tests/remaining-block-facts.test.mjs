import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {normalizeOfficialTokenSchedule,collectOfficialTokenSchedule,exactTokenScheduleRoute} from '../files/src/official-token-schedule.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2,validateEvidenceV2} from '../files/src/evidence-v2.mjs';
import {normalizeHtxPublicRisk} from '../files/src/htx-public-risk-evidence.mjs';
import {decodeFinalizedChainEvent,decodeFinalizedSolanaTransaction,collectFinalizedChainEvents,TRANSFER_TOPIC} from '../files/src/finalized-chain-events.mjs';
import {precommittedTechnicalPlanEvidence} from '../files/src/technical-plan-context.mjs';
import {normalizeOfficialFeed,collectOfficialEventsEvidence} from '../files/src/official-events-evidence.mjs';
import {normalizeChainSupply} from '../files/src/chain-supply-evidence.mjs';
import {planCandidateEvidenceRoutes,auditCandidateBlocks} from '../files/src/candidate-evidence-v2-runtime.mjs';

const NOW=Date.parse('2026-10-04T16:30:00Z'),native=chain=>({chain,asset_kind:'NATIVE',native_asset_id:`${chain}:mainnet`,contract_or_mint:null});
const fixtureRoot=new URL('../../audit-fixes/remaining-block-facts-20261004/fixtures/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('provenance.json',fixtureRoot)));
const sourceBody=name=>gunzipSync(fs.readFileSync(new URL(name+'.html.gz',fixtureRoot))).toString();
const facts=(evidence,contract)=>consumeBlockResultContext({evidence,contract,now:NOW}).facts;
function memoryDB(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}

test('primary APT and NEAR documents provide two exact N01 contexts, never an observed unlock or new score',()=>{
 for(const [symbol,chain,name] of [['APT','aptos','aptschedule'],['NEAR','near','nearhome']]){
  const body=sourceBody(name),receipt=manifest.responses.find(r=>r.name===name);assert.equal(crypto.createHash('sha256').update(body).digest('hex'),receipt.body_sha256);assert.equal(receipt.synthetic,false);
  const r=normalizeOfficialTokenSchedule({contract:symbol+'-USDT',asset_identity:native(chain),body,source_url:receipt.url,observed_ts:NOW});
  assert.equal(r.status,'CLOSED');assert.equal(r.evidence[0].block_id,'N01');assert.equal(validateEvidenceV2(r.evidence[0],{decision_ts:NOW}).usable,true);assert.equal(facts(r.evidence,symbol+'-USDT').length,1);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
  assert.equal(planCandidateEvidenceRoutes({contract:symbol+'-USDT',asset_identity:native(chain)}).routes.some(r=>r.name==='TOKEN_SCHEDULE'),true);
 }
});
test('missing anchors, 200 soft error, wrong asset, wrapped asset, redirect and unlimited body cannot close vesting',()=>{
 const p={contract:'APT-USDT',asset_identity:native('aptos'),body:sourceBody('aptschedule'),source_url:manifest.responses[1].url,observed_ts:NOW};
 for(const patch of [{body:p.body.replaceAll('1/120','1/121')},{body:'<html>404 Page Not Found</html>'},{contract:'BR-USDT'},{asset_identity:{...p.asset_identity,contract_or_mint:'0x1'}},{source_url:'https://evil.example/terms'},{body:'a'.repeat(1048577)}])assert.equal(normalizeOfficialTokenSchedule({...p,...patch}).evidence.length,0);
 assert.equal(exactTokenScheduleRoute({contract:'NEAR-USDT',asset_identity:native('aptos')}),null);
});
test('vestings share existing OFFICIAL_EVENTS allowance, have exact caches, and require admission before transport',async()=>{
 const db=memoryDB(),calls=[],p={db,contract:'APT-USDT',asset_identity:native('aptos'),run_id:'schedule',now:NOW,clock:()=>NOW,fetch_impl:async url=>{calls.push(url);return new Response(sourceBody('aptschedule'));}};
 assert.equal((await collectOfficialTokenSchedule(p)).network_calls,0);assert.equal(calls.length,0);
 const a=await collectOfficialTokenSchedule({...p,request_admit:()=>({allowed:true})}),b=await collectOfficialTokenSchedule({...p,run_id:'new',request_admit:()=>({allowed:true})});
 assert.equal(a.status,'CLOSED');assert.equal(a.network_calls,1);assert.equal(b.cache_status,'HIT');assert.equal(b.network_calls,0);assert.equal(calls.length,1);
 assert.equal(db.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily WHERE source=?').get('OFFICIAL_EVENTS').attempts,1);
 db.sqlite.close();
});
test('N08 scoped successful restriction check is useful context, never an independent positive weight',()=>{
 const r=normalizeHtxPublicRisk({contract:'JUP-USDT',state_payload:{status:'ok',ts:NOW-1000,data:[{contract_code:'JUP-USDT',margin_mode:'isolated',margin_account:'JUP-USDT',open:1}]},observed_ts:NOW});
 assert.equal(r.status,'CLOSED');assert.deepEqual(facts(r.evidence,'JUP-USDT').map(f=>f.block_id).sort(),['N08','N09']);assert.equal(consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
 const bad=structuredClone(r.evidence);bad.find(x=>x.block_id==='N08').margin_account='OTHER-USDT';assert.equal(facts(bad,'JUP-USDT').some(f=>f.block_id==='N08'),false);
});
test('finalized zero-address event is N03 context with exact units, no buyback/supply-change claim',()=>{
 const token='0x'+'1'.repeat(40),from='0x'+'2'.repeat(40),block={number:'0x100',hash:'0x'+'3'.repeat(64),timestamp:'0x'+(BigInt(NOW)/1000n).toString(16)},log={removed:false,address:token,transactionHash:'0x'+'4'.repeat(64),blockHash:block.hash,blockNumber:block.number,logIndex:'0x1',topics:[TRANSFER_TOPIC,'0x'+'0'.repeat(24)+from.slice(2),'0x'+'0'.repeat(64)],data:'0x'+(123n).toString(16).padStart(64,'0')};
 const row=decodeFinalizedChainEvent({log,mode:'TOKEN_TRANSFER',asset:token,block,observed_ts:NOW,contract:'LINK-USDT'});assert.equal(row.block_id,'N03');assert.equal(facts([row],'LINK-USDT').length,1);assert.match(facts([row],'LINK-USDT')[0].value,/totalSupply, выкуп.*не подтверждены/);
 for(const patch of [{to:from},{amount_base_units:'-1'},{tx_hash:null},{finality_status:'PROVISIONAL'}])assert.equal(facts([{...row,...patch}],'LINK-USDT').length,0);
});
test('Solana balance difference does not fabricate a burn instruction',()=>{
 const mint='1'.repeat(32),tx={slot:123,blockTime:NOW/1000,meta:{err:null,preTokenBalances:[{accountIndex:0,mint,uiTokenAmount:{amount:'100'}}],postTokenBalances:[{accountIndex:0,mint,uiTokenAmount:{amount:'90'}}]}};
 const rows=decodeFinalizedSolanaTransaction({transaction:tx,mint,signature:'1'.repeat(64),observed_ts:NOW,contract:'JUP-USDT'});assert.equal(rows[0].metric_family,'TOKEN_BALANCE_DECREASE');assert.equal(facts(rows,'JUP-USDT').length,1);
});
test('technical plan is copied only from a closed same-snapshot precommitted producer',()=>{
 const p={contract:'LINK-USDT',snapshot_id:'SNAP',observed_ts:NOW,scenario:{status:'CLOSED',scenario_identity_status:'CLOSED',required_evidence_status:'CLOSED',contract_code:'LINK-USDT',snapshot_id:'SNAP',direction:'LONG',entry_trigger_price:10,target_price:12,invalidation_price:9,scenario_receipt_id:'IMMUTABLE',valid_until_ts:NOW+60000,safety:{liquidation_as_target:false,retroactive_scenario_selection:false}}};
 assert.equal(facts(precommittedTechnicalPlanEvidence(p),p.contract).length,1);
 for(const patch of [{status:'NOT_CLOSED'},{snapshot_id:'OTHER'},{contract_code:'OTHER-USDT'},{valid_until_ts:NOW-1},{target_price:8},{safety:{liquidation_as_target:true,retroactive_scenario_selection:false}}])assert.equal(precommittedTechnicalPlanEvidence({...p,scenario:{...p.scenario,...patch}}).length,0);
});
test('an empty qualified official feed is scoped N07 context; errors and wrong publishers remain open',async()=>{
 const meta={official_domains:['issuer.example'],official_feeds:['https://issuer.example/feed.xml']},p={db:memoryDB(),contract:'TEST-USDT',run_id:'feed',asset_metadata:meta,now:NOW,request_admit:()=>({allowed:true}),fetch_impl:async()=>new Response('<rss><channel></channel></rss>',{headers:{'content-type':'application/rss+xml'}})};
 const out=await collectOfficialEventsEvidence(p);assert.equal(out.status,'CLOSED_BOUNDED_OFFICIAL_FEED_CHECK');assert.equal(facts(out.evidence,p.contract).length,1);assert.equal(out.evidence[0].all_official_channels_checked,false);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
 const error=await collectOfficialEventsEvidence({...p,db:memoryDB(),fetch_impl:async()=>new Response('limited',{status:429})});assert.equal(error.evidence.length,0);
 assert.equal(auditCandidateBlocks({sources:{OFFICIAL_EVENTS:out},evidence:out.evidence,decision_ts:NOW}).blocks.N01.checked,false);
});
test('saturated event sample narrows its range and never claims the original range complete',async()=>{
 const db=memoryDB(),token='0x'+'1'.repeat(40),hash='0x'+'2'.repeat(64),methods=[];
 const out=await collectFinalizedChainEvents({db,contract:'LINK-USDT',asset_identity:{chain:'ethereum',contract_or_mint:token},run_id:'NARROW',now:NOW,clock:()=>NOW,request_admit:r=>{assert.equal(r.attempts,4);return{allowed:true};},fetch_impl:async(url,init)=>{
  const body=JSON.parse(init.body);methods.push(body);
  if(Array.isArray(body))return new Response(JSON.stringify([{id:1,result:'0x1'},{id:2,result:{number:'0x1000',hash,timestamp:'0x'+(BigInt(NOW)/1000n).toString(16)}}]));
  assert.equal(body.method,'eth_getLogs');return new Response(JSON.stringify({id:3,result:methods.length===2?Array(201).fill({}):[]}));
 }});
 assert.equal(out.status,'CLOSED');assert.equal(out.network_calls,3);assert.equal(methods[2].params[0].fromBlock,'0xff1');assert.equal(out.summary.scope_narrowed,true);assert.equal(out.summary.scope,'LAST_16_FINALIZED_BLOCKS_ONE_TIMED_EVENT_BLOCK');
 const usage=db.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get();assert.equal(usage.attempts,4);db.sqlite.close();
});

test('actual full HTX catalog excludes every stock and exact forex correction, with no crypto ticker allowlist',()=>{
 const raw=gunzipSync(fs.readFileSync(new URL('htx-contract-catalog.json.gz',fixtureRoot))).toString(),proof=JSON.parse(fs.readFileSync(new URL('htx-contract-catalog-provenance.json',fixtureRoot)));assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),proof.body_sha256);assert.equal(proof.synthetic,false);
 const worker=fs.readFileSync(new URL('../files/src/worker.js',import.meta.url),'utf8'),code=worker.slice(worker.indexOf('function classifyHtxInstrumentScope('),worker.indexOf('function symbolFingerprint(')),classify=vm.runInNewContext(code+';classifyHtxInstrumentScope',{}),catalog=JSON.parse(raw).data;
 const eligible=catalog.filter(r=>classify(r).eligible_for_crypto_discovery);
 assert.ok(eligible.length>=100);assert.ok(eligible.some(r=>r.contract_code==='NEAR-USDT'));assert.ok(eligible.some(r=>r.contract_code==='BR-USDT'));
 for(const r of catalog){if(!['PAXG-USDT','XAUT-USDT'].includes(r.contract_code)&&(r.labels.some(x=>['stock','tradfi','indices','commodities'].includes(x))||r.tradfi_labels.length))assert.equal(classify(r).eligible_for_crypto_discovery,false,r.contract_code);}
 for(const contract_code of ['EURUSD-USDT','GBPUSD-USDT','USDJPY-USDT','USDBRL-USDT']){const c=classify(catalog.find(r=>r.contract_code===contract_code));assert.equal(c.eligible_for_crypto_discovery,false);assert.ok(c.reasons.includes('HTX_OFFICIAL_FOREX_UNDERLYING'));assert.ok(c.evidence.official_forex_source_url);}
 for(const r of eligible){const plan=planCandidateEvidenceRoutes({contract:r.contract_code});assert.ok(plan.routes.some(x=>x.name==='DERIBIT'));assert.ok(plan.routes.some(x=>x.name==='LARGE_TRADES'));assert.equal(auditCandidateBlocks({}).coverage_count,15);}
 assert.equal(classify({...catalog.find(r=>r.contract_code==='NEAR-USDT'),contract_code:'NEWCRYPTO-USDT'}).eligible_for_crypto_discovery,true);
});
test('two exact finalized supply observations can provide neutral N03, but cannot prove buyback or a price effect',()=>{
 const identity={chain:'ethereum',contract_or_mint:'0x'+'1'.repeat(40)},previous={chain:'ethereum',address:identity.contract_or_mint,supply:'1000',decimals:2,source_ts:NOW-2000,block_ref:'0x1',finalized:true},current={supply:'900',decimals:2,source_ts:NOW-1000,block_ref:'0x2',finalized:true};
 const result=normalizeChainSupply({contract:'LINK-USDT',identity,current,previous,observed_ts:NOW});assert.equal(result.evidence[0].metric_family,'SUPPLY_DECREASE');assert.deepEqual(facts(result.evidence,'LINK-USDT').map(x=>x.block_id).sort(),['N02','N03']);assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);
 for(const patch of [{previous_source_ts:NOW},{previous_block_ref:'0x2'},{supply_delta_base_units:'-1'},{metric_family:'SUPPLY_INCREASE'}])assert.equal(facts([{...result.evidence[0],...patch}],'LINK-USDT').length,0);
 const audit=auditCandidateBlocks({sources:{CHAIN_EVENTS:{status:'LOG_SAMPLE_SATURATED',network_calls:2},CHAIN_SUPPLY_COMPARISON:{status:'CLOSED',network_calls:2}},evidence:result.evidence,decision_ts:NOW});assert.equal(audit.blocks.N03.checked,true);assert.equal(audit.blocks.N04.checked,false);
});
