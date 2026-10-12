import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizeHtxAssetReferences,FUTURES_ONLY_EXACT_ASSET_BINDINGS} from '../files/src/htx-asset-identity.mjs';
import {exactBitgetBinding} from '../files/src/bitget-four-hour-flow.mjs';
import {exactGateTokenBinding} from '../files/src/gate-four-hour-flow.mjs';
import {exactPoloniexBinding} from '../files/src/poloniex-native-four-hour-flow.mjs';
import {normalizePoloniexNativeFlow,qualifiedPoloniexNativeComponent} from '../files/src/poloniex-native-four-hour-flow.mjs';
import {deriveHtxSpotSameRunPathEvidence,verifyHtxSpotSameRunPathEvidence} from '../files/src/htx-technical-structure.mjs';
import {finalizeCandidateBlockCoverage} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';
import {orderN05VenueRoutes} from '../files/src/external-n05-flow-collector.mjs';
import {availableFlowContext,validateAvailableFlowEvidence} from '../files/src/joint-spot-futures-flow.mjs';

const original=path=>JSON.parse(gunzipSync(readFileSync(new URL(`../../checkpoints/${path}`,import.meta.url))));
const row=(list,key,value)=>(Array.isArray(list)?list:list.data).find(item=>item[key]===value);

test('twelve HTX assets recover exact routes from saved original chain, issuer and market records',()=>{
 const htx=original('primary-native-supply-tests-37854297470/primary-source/htx-currencies.json.gz');
 const entries=normalizeHtxAssetReferences(htx).entries;
 assert.deepEqual(entries.ARB.identities[0],{chain:'arbitrum',contract_or_mint:'0x912ce59144191c1204e64559fe8253a0e49e6548'});
 const base='n05-actual-qualification-38049404414/';
 const coins=original(base+'identity-BITGET.json.gz');
 const bitgetSpot=original(base+'catalog-BITGET-SPOT.json.gz');
 const bitgetFutures=original(base+'catalog-BITGET-FUTURES.json.gz');
 const gateCurrencies=original('n05-native-qualification-38052957545/GATE-ALL-CURRENCY-IDENTITY.json.gz');
 const gateMarkets=original(base+'catalog-GATE-SPOT.json.gz');
 const poloniexAssets=original('n05-poloniex-qualification-38069554249/POLONIEX-EXACT-ASSETS.json.gz');
 const poloniexMarkets=original('n05-poloniex-qualification-38069554249/POLONIEX-SPOT-MARKETS.json.gz');
 const expected={ARB:[1,1,1,1],BTT:[1,0,1,1],CHZ:[1,1,0,1],ICP:[1,1,0,1],TAO:[1,1,0,0],TIA:[1,1,0,0],STEEM:[0,0,0,1],JST:[1,1,1,1],SUN:[1,1,1,1],WIN:[1,0,1,1],PONS:[1,1,1,1],PAXG:[1,0,1,0]};
 for(const [asset,flags] of Object.entries(expected)){
  const identity=FUTURES_ONLY_EXACT_ASSET_BINDINGS[asset]?.identity||entries[asset]?.identities?.[0],contract=`${asset}-USDT`,symbol=`${asset}USDT`;
  assert.equal(FUTURES_ONLY_EXACT_ASSET_BINDINGS[asset]?'CLOSED':entries[asset]?.status,'CLOSED',asset);
  const actual=[exactBitgetBinding({contract,identity,coins,instrument:row(bitgetSpot,'symbol',symbol),market:'SPOT'}),exactBitgetBinding({contract,identity,coins,instrument:row(bitgetFutures,'symbol',symbol),market:'FUTURES'}),exactGateTokenBinding({contract,identity,currencies:gateCurrencies,spot:gateMarkets}),exactPoloniexBinding({contract,identity,assets:poloniexAssets,markets:poloniexMarkets})];
  assert.deepEqual(actual,flags.map(Boolean),asset);
 }
 const identity=entries.ARB.identities[0];
 assert.equal(exactPoloniexBinding({contract:'ARB-USDT',identity:{...identity,contract_or_mint:'0x0000000000000000000000000000000000000001'},assets:poloniexAssets,markets:poloniexMarkets}),false);
 const sun=entries.SUN.identities[0];
 assert.equal(exactGateTokenBinding({contract:'SUN-USDT',identity:{...sun,contract_or_mint:sun.contract_or_mint.toLowerCase()},currencies:gateCurrencies,spot:gateMarkets}),false);
 assert.equal(entries.BTT.binding_scope,'EXACT_PROJECT_TRON_TOKEN');
 assert.equal(entries.HYPE.status,'CLOSED');
 assert.equal(entries.GRAM.status,'CLOSED');
 assert.equal(entries.ORDI.status,'CLOSED');
 assert.notEqual(entries.PAXG.status,'CLOSED');
 assert.equal(entries.AKE,undefined);
 const routes=[['GATE',1],['BITGET',2],['POLONIEX',3]];
 assert.deepEqual(orderN05VenueRoutes('ARB-USDT',entries.ARB.identities[0],routes).map(r=>r[0]),['POLONIEX','GATE','BITGET']);
 assert.deepEqual(orderN05VenueRoutes('CHZ-USDT',entries.CHZ.identities[0],routes),routes);
});

test('four remaining HTX native or Bitcoin inscription identities bind only their exact original external markets',()=>{
 const htx=original('n05-alias-route-batch-38245108128/HTX-CURRENT-IDENTITIES.json.gz');
 const entries=normalizeHtxAssetReferences(htx).entries;
 const base='n05-actual-qualification-38049404414/';
 const coins=original(base+'identity-BITGET.json.gz');
 const spot=original(base+'catalog-BITGET-SPOT.json.gz');
 const futures=original(base+'catalog-BITGET-FUTURES.json.gz');
 const gateCurrencies=original('n05-native-qualification-38052957545/GATE-ALL-CURRENCY-IDENTITY.json.gz');
 const gateMarkets=original(base+'catalog-GATE-SPOT.json.gz');
 const poloniexAssets=original('n05-alias-route-batch-38245108128/POLONIEX-ALL-ASSETS.json.gz');
 const poloniexMarkets=original('n05-alias-route-batch-38245108128/POLONIEX-ALL-MARKETS.json.gz');
 const expected={GRAM:[true,true,false,true],HYPE:[true,true,false,false],ONG:[false,true,false,false],ORDI:[false,false,true,false]};
 for(const [asset,flags] of Object.entries(expected)){
  const contract=`${asset}-USDT`,identity=entries[asset]?.identities?.[0],symbol=`${asset}USDT`;
  assert.equal(entries[asset]?.status,'CLOSED',asset);
  const actual=[exactBitgetBinding({contract,identity,coins,instrument:row(spot,'symbol',symbol),market:'SPOT'}),exactBitgetBinding({contract,identity,coins,instrument:row(futures,'symbol',symbol),market:'FUTURES'}),exactGateTokenBinding({contract,identity,currencies:gateCurrencies,spot:gateMarkets}),exactPoloniexBinding({contract,identity,assets:poloniexAssets,markets:poloniexMarkets})];
  assert.deepEqual(actual,flags,asset);
 }
 assert.equal(entries.ORDI.binding_scope,'EXACT_HTX_BRC20_TICK_AND_BITCOIN_CHAIN');
 const fakeGate=structuredClone(gateCurrencies);
 const ordi=fakeGate.find(r=>r.currency==='ORDI');
 ordi.chains.find(r=>r.name==='BTCBRC').addr='ordi2';
 assert.equal(exactGateTokenBinding({contract:'ORDI-USDT',identity:entries.ORDI.identities[0],currencies:fakeGate,spot:gateMarkets}),false);
});

test('issuer-bound futures-only identities match saved exact external contract and market records',()=>{
 const coins=original('n05-actual-qualification-38049404414/identity-BITGET.json.gz');
 const spot=original('n05-actual-qualification-38049404414/catalog-BITGET-SPOT.json.gz');
 const futures=original('n05-actual-qualification-38049404414/catalog-BITGET-FUTURES.json.gz');
 const gateCurrencies=original('n05-native-qualification-38052957545/GATE-ALL-CURRENCY-IDENTITY.json.gz');
 const gateMarkets=original('n05-actual-qualification-38049404414/catalog-GATE-SPOT.json.gz');
 const poloniexAssets=original('n05-alias-route-batch-38245108128/POLONIEX-ALL-ASSETS.json.gz');
 const poloniexMarkets=original('n05-alias-route-batch-38245108128/POLONIEX-ALL-MARKETS.json.gz');
 const expected={AKE:[false,false,true,false],BR:[true,true,true,false],BTR:[false,false,true,false],CASHCAT:[false,false,true,true],GPS:[true,true,true,false],MYX:[true,true,true,false],RAVE:[true,true,true,false],UB:[false,false,true,true],USELESS:[false,false,true,true],VELVET:[true,true,true,true],哈基米:[false,false,true,true]};
 for(const [asset,flags] of Object.entries(expected)){
  const binding=FUTURES_ONLY_EXACT_ASSET_BINDINGS[asset],contract=`${asset}-USDT`,symbol=`${asset}USDT`,identity=binding?.identity;
  assert.ok(binding?.issuer_evidence_url,asset);
  const actual=[exactBitgetBinding({contract,identity,coins,instrument:row(spot,'symbol',symbol),market:'SPOT'}),exactBitgetBinding({contract,identity,coins,instrument:row(futures,'symbol',symbol),market:'FUTURES'}),exactGateTokenBinding({contract,identity,currencies:gateCurrencies,spot:gateMarkets}),exactPoloniexBinding({contract,identity,assets:poloniexAssets,markets:poloniexMarkets})];
  assert.deepEqual(actual,flags,asset);
  if(identity.chain!=='solana')assert.equal(exactGateTokenBinding({contract,identity:{...identity,contract_or_mint:'0x0000000000000000000000000000000000000001'},currencies:gateCurrencies,spot:gateMarkets}),false);
 }
});

test('same-run HTX spot candles supply N10 factual path, with one-sided fallback and conflict guard',()=>{
 const end=1_800_000_000_000,now=end+42_000,start=end-15*60_000;
 const bars=Array.from({length:15},(_,i)=>({id:(start+i*60_000)/1000,open:100+i,high:101+i,low:99+i,close:100.5+i,count:2}));
 const spot_kline={market:'SPOT',contract:'ARB-USDT',received_ts:end+10_000,payload:{status:'ok',ch:'market.arbusdt.kline.1min',ts:end+1000,data:bars}};
 const htx_window={label:'15m',window_end_ts:end,open:100,high:115,low:99,close:99.5};
 const facts=deriveHtxSpotSameRunPathEvidence({contract:'ARB-USDT',spot_kline,htx_window,now});
 assert.equal(facts.length,1);
 assert.equal(facts[0].comparison_status,'DIRECTION_CONFLICT');
 assert.equal(facts[0].score_contribution,0);
 assert.equal(facts[0].same_htx_upstream_not_independent,true);
 assert.equal(verifyHtxSpotSameRunPathEvidence(facts[0],{now}),true);
 const primary={status:'CHECKED_PRIMARY_TECHNICAL_CONTEXT',check_completed:true,network_calls:0,evidence:facts,receipts:[]};
 const result=finalizeCandidateBlockCoverage({evidence_result:{contract:'ARB-USDT',evidence:[],sources:{}},primary_sources:{PRIMARY_TECHNICAL_CONTEXT:primary},contract:'ARB-USDT',decision_ts:now});
 assert.equal(result.block_coverage.blocks.N10.valid_context_facts,1);
 const context=consumeBlockResultContext({evidence:result.evidence,contract:'ARB-USDT',now});
 assert.equal(context.facts.length,1);
 assert.match(context.facts[0].value,/общего вывода нет/);
 assert.equal(deriveHtxSpotSameRunPathEvidence({contract:'ARB-USDT',spot_kline,now})[0].comparison_status,'SPOT_ONLY');
 assert.equal(deriveHtxSpotSameRunPathEvidence({contract:'ARB-USDT',spot_kline,htx_window:{...htx_window,close:htx_window.open},now})[0].comparison_status,'DIRECTION_UNCONFIRMED');
 assert.equal(deriveHtxSpotSameRunPathEvidence({contract:'ARB-USDT',spot_kline:{...spot_kline,payload:{...spot_kline.payload,data:bars.slice(1)}},htx_window,now}).length,0);
});

test('nine original cloud Poloniex windows independently replay to seven useful N05 consumer facts',()=>{
 const root='n05-alias-route-batch-38245108128/',summary=JSON.parse(readFileSync(new URL(`../../checkpoints/${root}batch-summary.json`,import.meta.url))),receipts=summary.sources;
 const payload=name=>{
  const receipt=receipts.find(r=>r.name===name);assert.equal(receipt?.status,'RECEIVED_NOT_QUALIFIED',name);
  const bytes=gunzipSync(readFileSync(new URL(`../../checkpoints/${root}${receipt.file}`,import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.body_sha256,name);
  return JSON.parse(bytes);
 };
 const identities=normalizeHtxAssetReferences(payload('HTX-CURRENT-IDENTITIES')).entries;
 const assets=payload('POLONIEX-ALL-ASSETS'),markets=payload('POLONIEX-ALL-MARKETS');payload('POLONIEX-ALL-ACTIVITY');
 const useful=[];
 for(const saved of summary.windows){
  const contract=saved.contract,base=contract.slice(0,-5),receipt=receipts.find(r=>r.name===`POLONIEX-${base}-NATIVE240`),candles=payload(receipt.name);
  const component=normalizePoloniexNativeFlow({contract,identity:identities[base]?.identities?.[0],assets,markets,candles,window_end_ts:summary.window_end_ts,observed_ts:receipt.received_ts});
  assert.equal(component.status,saved.status,base);
  assert.equal(component.check_completed,saved.check_completed,base);
  if(!component.check_completed){assert.equal(component.reason,'NO_TRADED_VOLUME');continue;}
  assert.equal(qualifiedPoloniexNativeComponent(component),true,base);
  assert.equal(component.trade_count,saved.trade_count,base);
  const now=receipt.received_ts+1000,external={status:component.status,check_completed:true,components:[component],evidence:[]};
  const available=availableFlowContext({contract,external,now});
  assert.equal(available.check_completed,true,base);
  assert.equal(validateAvailableFlowEvidence(available.evidence[0],now),true,base);
  const finalized=finalizeCandidateBlockCoverage({decision_ts:now,evidence_result:{contract,sources:{EXTERNAL_N05_FLOW:external}},primary_sources:{PRIMARY_HTX_FUTURES_FLOW:{check_completed:false,evidence:[]}}});
  const facts=consumeBlockResultContext({contract,evidence:finalized.evidence,now}).facts;
  assert.equal(facts.length,1,base);
  assert.match(facts[0].value,/Poloniex|POLONIEX/);
  assert.equal(available.evidence[0].score_contribution,0);
  useful.push(base);
 }
 assert.deepEqual(useful,['ARB','BTT','ICP','JST','STEEM','SUN','WIN']);
});
