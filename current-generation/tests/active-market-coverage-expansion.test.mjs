import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {normalizeHtxAssetReferences,FUTURES_ONLY_EXACT_ASSET_BINDINGS} from '../files/src/htx-asset-identity.mjs';
import {exactBitgetBinding} from '../files/src/bitget-four-hour-flow.mjs';
import {exactGateTokenBinding} from '../files/src/gate-four-hour-flow.mjs';
import {exactPoloniexBinding} from '../files/src/poloniex-native-four-hour-flow.mjs';
import {deriveHtxSpotSameRunPathEvidence,verifyHtxSpotSameRunPathEvidence} from '../files/src/htx-technical-structure.mjs';
import {finalizeCandidateBlockCoverage} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {consumeBlockResultContext} from '../files/src/block-result-context.mjs';

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
 assert.notEqual(entries.HYPE.status,'CLOSED');
 assert.notEqual(entries.GRAM.status,'CLOSED');
 assert.notEqual(entries.ORDI.status,'CLOSED');
 assert.notEqual(entries.PAXG.status,'CLOSED');
 assert.equal(entries.AKE,undefined);
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
 assert.equal(deriveHtxSpotSameRunPathEvidence({contract:'ARB-USDT',spot_kline:{...spot_kline,payload:{...spot_kline.payload,data:bars.slice(1)}},htx_window,now}).length,0);
});
