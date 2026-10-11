import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {parseSolanaSupplyPayload,fetchSolanaNativeSupply,SOLANA_MAINNET_GENESIS} from '../files/src/solana-native-supply.mjs';
import {collectChainSupplyEvidence} from '../files/src/chain-supply-evidence.mjs';
import {planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {normalizeHtxTechnicalStructure,normalizeHtxRollingRange,clearHtxTechnicalSnapshots,readHtxTechnicalStructure,deriveHtxRecentPathEvidence,observeHtxTechnicalSnapshot,buildHtxPrimaryTechnicalReceipt} from '../files/src/htx-technical-structure.mjs';
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

test('saved exact NEAR 15m trajectory adds one neutral N10 text fact without another source call',()=>{
 const window={label:'15m',window_start_ts:1791655860000,window_end_ts:1791656760000,candle_count:15,open:5.323,high:5.331,low:5.315,close:5.315};
 const contract='NEAR-USDT',source_ts=window.window_end_ts,observed_ts=source_ts+30000;
 const evidence=deriveHtxRecentPathEvidence({contract,window,source_ts,observed_ts});
 assert.equal(evidence.length,1);assert.equal(evidence[0].block_id,'N10');assert.equal(evidence[0].same_htx_upstream_not_independent,true);
 assert.equal(consumeEvidenceV2(evidence,{base_interest:70,decision_ts:observed_ts}).adjustment,0);
 const facts=consumeBlockResultContext({contract,evidence,now:observed_ts}).facts;
 assert.equal(facts.length,1);assert.equal(facts[0].label,'Фактический путь цены за 15 минут');
 assert.match(facts[0].value,/5,323 → 5,315 USDT/);assert.match(facts[0].value,/тот же источник HTX/);
 assert.deepEqual(consumeBlockResultContext({contract,evidence:[{...evidence[0],path_close:5.33}],now:observed_ts}).facts,[]);
 assert.deepEqual(consumeBlockResultContext({contract,evidence:deriveHtxRecentPathEvidence({contract:'OTHER-USDT',window,source_ts,observed_ts}),now:observed_ts}).facts,[]);
 assert.deepEqual(deriveHtxRecentPathEvidence({contract,window,source_ts,observed_ts:source_ts+180001}),[]);
});

test('primary N10 uses both saved closed ranges and exact recent path without any new transport',()=>{
 clearHtxTechnicalSnapshots();
 const contract='NEAR-USDT',now=1791656786000,source_ts=now-1000,hour=3600000,end=Math.floor(source_ts/hour)*hour;
 const payload={status:'ok',ch:`market.${contract}.kline.60min`,ts:source_ts,data:Array.from({length:20},(_,i)=>({id:(end-(20-i)*hour)/1000,open:5.2,high:5.5,low:5,close:5.3}))};
 observeHtxTechnicalSnapshot(payload,`https://api.hbdm.com/linear-swap-ex/market/history/kline?contract_code=${contract}&period=60min`,now-300);
 const window={window_start_ts:1791655860000,window_end_ts:1791656760000,open:5.323,high:5.331,low:5.315,close:5.315};
 const futures={execution_status:'FULFILLED',data:{contract,health:{info:true,depth:true},contract_info:{contract_code:contract,contract_status:1,contract_size:1},liquidity:{depth_timestamp:new Date(now-500).toISOString()},bbo:{best_bid:5.31,best_ask:5.32}}};
 const trajectory={execution_status:'FULFILLED',data:{contract,health:{info:true,price_1m:true},contract_info:{contract_code:contract},provider_source_ts:window.window_end_ts,windows:{'15m':{price:{usable:true,coverage:'closed',exact_1m_bars:true,expected_1m_bars:15,received_1m_bars:15,window_start_ts:window.window_start_ts,window_end_ts:window.window_end_ts,...window},synchronized_window_start_ts:window.window_start_ts,synchronized_window_end_ts:window.window_end_ts}}}};
 const reference_price={contract,status:'CLOSED',venue:'HTX',type:'MID_OBSERVATION',value:5.315,source_ts:now-500,received_ts:now-400};
 const receipt=buildHtxPrimaryTechnicalReceipt({contract,futures,trajectory,reference_price,now});
 assert.equal(receipt.status,'CHECKED_PRIMARY_TECHNICAL_CONTEXT');assert.equal(receipt.network_calls,0);
 assert.deepEqual(receipt.evidence.map(e=>e.metric_family),['CLOSED_CANDLE_RANGE_CONTEXT','CLOSED_15M_PRICE_PATH_CONTEXT']);
 const facts=consumeBlockResultContext({contract,evidence:receipt.evidence,now}).facts;
 assert.equal(facts.length,2);assert.equal(facts[1].label,'Фактический путь цены за 15 минут');
 clearHtxTechnicalSnapshots();
});

test('primary HTX empty isolated mode is accepted only with exact default/all/cross reconciliation',()=>{
 const base=JSON.parse(body('margin-default')),modes=Object.fromEntries(['all','cross','isolated'].map(m=>[m,JSON.parse(body('margin-'+m))])),observed_ts=modes.isolated.ts+1000;
 const out=mergeHtxLinearCatalogModes({base,modes,observed_ts});assert.equal(out.status,'CLOSED');assert.deepEqual(out.counts,{default:378,all:374,cross:4,isolated:0});assert.equal(out.new_contracts_vs_default.length,0);assert.equal(out.empty_modes.length,1);
 for(const replacement of [{...modes.isolated,err_code:1013},{...modes.isolated,ts:observed_ts-300001}])assert.equal(mergeHtxLinearCatalogModes({base,modes:{...modes,isolated:replacement},observed_ts}).status,'PARTIAL');
 assert.equal(mergeHtxLinearCatalogModes({base:{...base,data:[...base.data,{contract_code:'HIDDEN-USDT',support_margin_mode:'isolated'}]},modes,observed_ts}).status,'PARTIAL');
});

