import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {normalizeHtxAssetReferences} from '../files/src/htx-asset-identity.mjs';
import {normalizeBitfinexNativeFlow,qualifiedBitfinexNativeComponent} from '../files/src/bitfinex-native-four-hour-flow.mjs';
import {availableFlowContext,validateAvailableFlowEvidence} from '../files/src/joint-spot-futures-flow.mjs';
import {collectBitfinexNativeFlow} from '../files/src/bitfinex-native-flow-collector.mjs';
import {installEvidenceSourceStore} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';

const raw=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const prefix='checkpoints/n05-bitfinex-pilot-38138608166/BITFINEX-';
const catalog=raw('checkpoints/n05-bitfinex-pilot-38138499328/BITFINEX-CURRENT-CATALOG.json.gz');
const htx=normalizeHtxAssetReferences(raw('checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz'));
const end=1791720960000,observed=end+18000;
const setup=s=>({contract:s+'-USDT',identity:htx.entries[s].identities[0],catalog,candles:raw(prefix+s+'-CANDLES1M.json.gz'),trades:raw(prefix+s+'-TRADES10000.json.gz'),window_end_ts:end,observed_ts:observed});

test('three original Bitfinex signed windows are exact and used as limited N05 information',()=>{
 for(const symbol of ['DASH','ALGO','XMR']){
  const c=normalizeBitfinexNativeFlow(setup(symbol));assert.equal(qualifiedBitfinexNativeComponent(c),true,`${symbol}: ${c.reason}`);assert.equal(c.verified_minutes,240);
  const now=observed+1,context=availableFlowContext({primary:null,external:{components:[c]},contract:c.contract,now});assert.equal(context.check_completed,true);assert.equal(validateAvailableFlowEvidence(context.evidence[0],now),true);assert.equal(context.evidence[0].score_contribution,0);
 }
});
test('foreign identity, missing trade and unclosed source clock cannot become N05 facts',()=>{
 const x=setup('DASH');assert.equal(normalizeBitfinexNativeFlow({...x,identity:{chain:'ethereum',asset_kind:'NATIVE',native_asset_id:'ethereum:mainnet'}}).check_completed,false);
 assert.equal(normalizeBitfinexNativeFlow({...x,trades:x.trades.slice(1)}).check_completed,false);
 assert.equal(normalizeBitfinexNativeFlow({...x,observed_ts:end-1}).check_completed,false);
});
const database=()=>{const n=new DatabaseSync(':memory:');return{prepare(sql){const st=n.prepare(sql);return{bind(...p){this.p=Object.fromEntries(p.map((v,i)=>[String(i+1),v]));return this;},async first(){return st.get(this.p||{});},async all(){return{results:st.all(this.p||{})};},async run(){return st.run(this.p||{});}};},async batch(ss){n.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());n.exec('COMMIT');return r;}catch(e){n.exec('ROLLBACK');throw e;}},close(){n.close();}};};
test('production Bitfinex adapter uses three admitted calls and reuses original clocks without repeat HTTP',async()=>{
 const db=database();await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);let calls=0,grants=0;
 const x=setup('DASH'),now=end+1000,params={db,contract:x.contract,asset_identity:x.identity,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'BITFINEX_TEST',now,clock:()=>now,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/conf/')?catalog:url.includes('/candles/')?x.candles:x.trades));}};
 const first=await collectBitfinexNativeFlow(params);assert.equal(first.check_completed,true,first.reason||first.status);assert.equal(calls,3);assert.equal(grants,3);
 const cached=await collectBitfinexNativeFlow({...params,run_id:'BITFINEX_CACHE'});assert.equal(cached.check_completed,true,cached.reason||cached.status);assert.equal(calls,3);assert.equal(cached.components[0].observed_ts,now);db.close();
});
