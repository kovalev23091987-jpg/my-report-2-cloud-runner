import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {verifiedAssetRouteIdentity,withVerifiedAssetRouteIdentity} from '../files/src/verified-asset-route-identity.mjs';
import {planCandidateEvidenceRoutes} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {collectPoloniexFlow} from '../files/src/poloniex-native-flow-collector.mjs';
import {installEvidenceSourceStore} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';
const contract='BTW-USDT',identity={chain:'bsc',contract_or_mint:'0x444045b0ee1ee319a660a5e3d604ca0ffa35acaa'},method='MANUAL_EXACT_REGISTRY';
const context={contract,base:'BTW',registry_status:'CLOSED',identity_status:'CLOSED',identity_method:method,asset_identity:identity,registry_confirmation_required:false};
const params={contract,asset_identity:identity,identity_method:method,supplemental_context:context};
test('the exact producer-confirmed BTW registry binding reaches JOINT_FLOW without renaming its origin',()=>{
 const accepted=verifiedAssetRouteIdentity(params);assert.equal(accepted.identity_method,method);assert.equal(accepted.asset_binding_proof.kind,'CLOSED_OWNER_REGISTRY');
 assert.ok(planCandidateEvidenceRoutes({...params,source_health_admit:()=>({allowed:true})}).routes.some(r=>r.name==='JOINT_FLOW'));
 assert.ok(verifiedAssetRouteIdentity(withVerifiedAssetRouteIdentity(params)));
});
test('a method label alone, a candidate, a foreign contract and a changed address never authorize a new route',()=>{
 assert.equal(verifiedAssetRouteIdentity({...params,supplemental_context:undefined}),null);
 for(const patch of [{identity_status:'CANDIDATE_ONLY'},{registry_status:'NOT_CLOSED'},{contract:'OTHER-USDT'},{registry_confirmation_required:true},{asset_identity:{...identity,contract_or_mint:'0x'+'a'.repeat(40)}}])assert.equal(verifiedAssetRouteIdentity({...params,supplemental_context:{...context,...patch}}),null);
 const carried=withVerifiedAssetRouteIdentity(params);assert.equal(verifiedAssetRouteIdentity({...carried,asset_identity:{...identity,chain:'ethereum'}}),null);
});
test('CoinPaprika exact reference requires its original catalog and metadata receipts and preserves provider provenance',()=>{
 const m='COINPAPRIKA_EXACT_HTX_SPOT_MARKET_AND_CHAIN_ADDRESS',reference={status:'CLOSED',contract,identity_method:m,identity,reference_kind:'STATIC_ASSET_BINDING_ONLY',coinpaprika_id:'btw-bitway',receipts:[{url:'https://api.coinpaprika.com/v1/exchanges/huobipro/markets',body_sha256:'a'.repeat(64)},{url:'https://api.coinpaprika.com/v1/coins/btw-bitway',body_sha256:'b'.repeat(64)}]};
 const p={...params,identity_method:m,supplemental_context:{...context,identity_method:m,asset_reference:reference}};
 const closed=verifiedAssetRouteIdentity(p);assert.equal(closed.identity_method,m);assert.equal(closed.asset_binding_proof.static_binding_only,true);assert.equal(closed.asset_binding_proof.decision_effect,false);
 for(const r of [{...reference,status:'AMBIGUOUS'},{...reference,contract:'OTHER-USDT'},{...reference,coinpaprika_id:'not a coin id'},{...reference,receipts:reference.receipts.map(x=>({...x,body_sha256:'a'.repeat(64)}))},{...reference,receipts:reference.receipts.slice(0,1)},{...reference,identity:{...identity,contract_or_mint:'0x'+'2'.repeat(40)}}])assert.equal(verifiedAssetRouteIdentity({...p,supplemental_context:{...p.supplemental_context,asset_reference:r}}),null);
});
function db(){const s=new DatabaseSync(':memory:');return{prepare(sql){const st=s.prepare(sql);return{bind(...p){this.p=Object.fromEntries(p.map((v,i)=>[String(i+1),v]));return this;},async run(){return st.run(this.p||{});},async first(){return st.get(this.p||{})||null;}};},async batch(a){return Promise.all(a.map(x=>x.run()));}};}
test('original saved BTW Poloniex catalog/address and 240 candles remain qualified through the corrected producer method',async()=>{
 const base=new URL('../../checkpoints/n05-poloniex-qualification-38069554249/',import.meta.url),read=name=>JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(name+'.json.gz',base)))),assets=read('POLONIEX-EXACT-ASSETS'),markets=read('POLONIEX-SPOT-MARKETS'),candles=read('POLONIEX-BTW-NATIVE-240');
 const end=Math.max(...candles.map(r=>r[12]))+60000,now=end+1000,d=db();await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);let transports=0;
 const ticker=[{symbol:'BTW_USDT',tradeCount:1,amount:'1',quantity:'1',startTime:end-86400000,closeTime:end,ts:end}]; // Activity only; qualified flow numbers come from original candles.
 const r=await collectPoloniexFlow({...withVerifiedAssetRouteIdentity(params),db:d,run_id:'SAVED_BTW_REGISTRY',now,clock:()=>now,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{transports++;return new Response(JSON.stringify(url.endsWith('/v2/currencies')?assets:url.endsWith('/markets')?markets:url.endsWith('/ticker24h')?ticker:candles));}});
 assert.equal(r.check_completed,true,r.status);assert.equal(transports,4);assert.equal(r.components[0].window_end_ts,end);assert.ok(r.components[0].buy_quote>0&&r.components[0].sell_quote>0);assert.equal(r.components[0].identity.contract_or_mint,identity.contract_or_mint);
});
