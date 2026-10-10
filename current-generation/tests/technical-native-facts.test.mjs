import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {parseSolanaSupplyPayload,fetchSolanaNativeSupply,SOLANA_MAINNET_GENESIS} from '../files/src/solana-native-supply.mjs';
import {collectChainSupplyEvidence} from '../files/src/chain-supply-evidence.mjs';
import {planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {normalizeHtxTechnicalStructure,normalizeHtxRollingRange,clearHtxTechnicalSnapshots,readHtxTechnicalStructure} from '../files/src/htx-technical-structure.mjs';
import {mergeHtxLinearCatalogModes} from '../files/src/htx-crypto-universe.mjs';
import {parseHtxMarketJson} from '../files/src/htx-trade-json.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
const fixture=new URL('../../audit-fixes/technical-native-facts-20261004/fixtures/',import.meta.url),proof=JSON.parse(fs.readFileSync(new URL('provenance.json',fixture)));
function body(name){const r=proof.responses.find(r=>r.name===name),s=gunzipSync(fs.readFileSync(new URL(name+'.json.gz',fixture))).toString();assert.equal(crypto.createHash('sha256').update(s).digest('hex'),r.body_sha256);assert.equal(r.synthetic,false);return s;}
const clock=JSON.parse(body('solana-slot-clock')).result*1000,NOW=clock+10000,identity={chain:'solana',asset_kind:'NATIVE',native_asset_id:'solana:mainnet',contract_or_mint:null};
function memoryDB(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
test('primary SOL supply integer is preserved exactly above the safe Number limit',()=>{
 const parsed=parseSolanaSupplyPayload(body('solana-native-batch'));assert.equal(parsed[1].result.value.total,'635228010817435092');assert.equal(parsed[0].result,SOLANA_MAINNET_GENESIS);
 assert.throws(()=>parseSolanaSupplyPayload('{"total":6.352280108174351e17}'),/EXACT_WIRE_UINT/);
});
test('native SOL route verifies mainnet, finalized supply reconciliation and the exact source slot clock in two transports',async()=>{
 const calls=[],fetch_impl=async(url,init)=>{assert.equal(url,'https://api.mainnet-beta.solana.com');const p=JSON.parse(init.body);calls.push(p);if(calls.length===1){assert.equal(p[1].method,'getSupply');assert.equal(p[1].params[0].commitment,'finalized');return new Response(body('solana-native-batch'));}assert.equal(p.params[0],453323359);return new Response(body('solana-slot-clock'));};
 const r=await fetchSolanaNativeSupply(fetch_impl);assert.equal(r.attempts,2);assert.equal(r.current.supply,'635228010817435092');assert.equal(r.current.decimals,9);assert.equal(r.current.source_ts,clock);
 const db=memoryDB();calls.length=0;const result=await collectChainSupplyEvidence({db,fetch_impl,contract:'SOL-USDT',asset_identity:identity,run_id:'PRIMARY_REPLAY',now:NOW,clock:()=>NOW,request_admit:p=>{assert.equal(p.attempts,2);return{allowed:true};}});
 assert.equal(result.status,'CLOSED');assert.equal(result.network_calls,2);const facts=consumeBlockResultContext({contract:'SOL-USDT',evidence:result.evidence,now:NOW}).facts;assert.deepEqual(facts,[]);assert.equal(result.evidence[0].total_supply_base_units,'635228010817435092');assert.equal(consumeEvidenceV2(result.evidence,{base_interest:70,decision_ts:NOW}).adjustment,0);db.sqlite.close();
});
test('wrong Solana genesis, missing native integer and inconsistent supply cannot request a source clock',async()=>{
 for(const modify of [p=>p[0].result='wrong',p=>delete p[1].result.value.total,p=>p[1].result.value.total='1']){
  const p=parseSolanaSupplyPayload(body('solana-native-batch'));modify(p);let calls=0;const out=await fetchSolanaNativeSupply(async()=>{calls++;return new Response(JSON.stringify(p));});assert.equal(calls,1);assert.equal(out.current,null);
 }
 assert.equal(planCandidateEvidenceRoutes({contract:'SOL-USDT',asset_identity:identity}).nativeSupplyEligible,true);
 assert.equal(planCandidateEvidenceRoutes({contract:'SOL-USDT',asset_identity:identity}).nativeChainEventsEligible,true);
 assert.ok(planCandidateEvidenceRoutes({contract:'SOL-USDT',asset_identity:identity}).routes.some(row=>row.name==='CHAIN_EVENTS'));
 assert.equal(planCandidateEvidenceRoutes({contract:'OTHER-USDT',asset_identity:identity}).nativeSupplyEligible,false);
 assert.equal(planCandidateEvidenceRoutes({contract:'OTHER-USDT',asset_identity:identity}).nativeChainEventsEligible,false);
});
test('all fresh exact crypto rolling market rows can supply neutral N10 facts without targets or signed-flow claims',()=>{
 const raw=body('htx-rolling-market'),p=JSON.parse(raw),now=p.ts+1000;
 for(const contract of ['NEAR-USDT','BR-USDT','PAXG-USDT','XAUT-USDT','哈基米-USDT','币安人生-USDT']){
  const rows=normalizeHtxRollingRange({payload:p,contract,observed_ts:now});assert.equal(rows.length,1,contract);assert.equal(consumeBlockResultContext({contract,evidence:rows,now}).facts[0].block_id,'N10');assert.equal(consumeEvidenceV2(rows,{base_interest:70,decision_ts:now}).adjustment,0);
 }
 clearHtxTechnicalSnapshots();parseHtxMarketJson(raw,'https://api.hbdm.com/linear-swap-ex/market/detail/batch_merged');assert.equal(readHtxTechnicalStructure({contract:'哈基米-USDT',now:Date.now()}).length,0,'old response cannot become a new live observation');
});
test('rolling N10 rejects duplicate, stale, foreign and impossible price summaries',()=>{
 const p=JSON.parse(body('htx-rolling-market')),contract='NEAR-USDT',row=p.ticks.find(r=>r.contract_code===contract),now=p.ts+1000;
 for(const patch of [{ticks:[row,row]},{ts:now+1},{ticks:[{...row,low:'0'}]},{ticks:[{...row,high:'0.1'}]},{ticks:[{...row,business_type:'futures'}]},{ticks:[{...row,ts:p.ts-180001}]}])assert.equal(normalizeHtxRollingRange({payload:{...p,...patch},contract,observed_ts:now}).length,0);
});
test('closed candle N10 uses exactly 20 complete minutes and does not authorize an entry',()=>{
 const duration=60000,end=Math.floor(NOW/duration)*duration,contract='哈基米-USDT',p={status:'ok',ch:`market.${contract}.kline.1min`,ts:NOW,data:Array.from({length:20},(_,i)=>({id:(end-20*duration+i*duration)/1000,open:10,low:9,high:11,close:10}))};
 const evidence=normalizeHtxTechnicalStructure({payload:p,contract,period:'1min',observed_ts:NOW});assert.equal(evidence.length,1);assert.equal(consumeBlockResultContext({contract,evidence,now:NOW}).facts.length,1);
 for(const payload of [{...p,data:p.data.slice(1)},{...p,data:[...p.data.slice(1),p.data[1]]},{...p,ch:'market.OTHER-USDT.kline.1min'},{...p,data:p.data.map(r=>({...r,close:12}))}])assert.equal(normalizeHtxTechnicalStructure({payload,contract,period:'1min',observed_ts:NOW}).length,0);
});

test('primary HTX empty isolated mode is accepted only with exact default/all/cross reconciliation',()=>{
 const base=JSON.parse(body('margin-default')),modes=Object.fromEntries(['all','cross','isolated'].map(m=>[m,JSON.parse(body('margin-'+m))])),observed_ts=modes.isolated.ts+1000;
 const out=mergeHtxLinearCatalogModes({base,modes,observed_ts});assert.equal(out.status,'CLOSED');assert.deepEqual(out.counts,{default:378,all:374,cross:4,isolated:0});assert.equal(out.new_contracts_vs_default.length,0);assert.equal(out.empty_modes.length,1);
 for(const replacement of [{...modes.isolated,err_code:1013},{...modes.isolated,ts:observed_ts-300001}])assert.equal(mergeHtxLinearCatalogModes({base,modes:{...modes,isolated:replacement},observed_ts}).status,'PARTIAL');
 assert.equal(mergeHtxLinearCatalogModes({base:{...base,data:[...base.data,{contract_code:'HIDDEN-USDT',support_margin_mode:'isolated'}]},modes,observed_ts}).status,'PARTIAL');
});
