import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {normalizeHtxAssetReferences} from '../files/src/htx-asset-identity.mjs';
import {normalizeBitfinexNativeFlow,qualifiedBitfinexNativeComponent} from '../files/src/bitfinex-native-four-hour-flow.mjs';
import {availableFlowContext,validateAvailableFlowEvidence} from '../files/src/joint-spot-futures-flow.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
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
test('original DASH Bitfinex flow reaches manual and both approved Telegram renderers without score',()=>{
 const c=structuredClone(JSON.parse(fs.readFileSync('checkpoints/btw-preserved-block-result-input-20261004.json')).canonical),x=setup('DASH'),now=observed+1,component=normalizeBitfinexNativeFlow(x),flow=availableFlowContext({primary:null,external:{components:[component]},contract:x.contract,now});
 assert.equal(flow.check_completed,true);c.observed_ts=now;c.metadata.contract=x.contract;c.metadata.internal_market_context.evidence_v2.evidence=flow.evidence;c.metadata.supporting_context={facts:consumeBlockResultContext({contract:x.contract,now,evidence:flow.evidence}).facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/BITFINEX/);assert.match(manual.text,/данные одной биржи/);
 for(const context_policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy});assert.equal(tg.ok,true,tg.status);assert.match(tg.text,/BITFINEX/);const audit=auditRenderedBlockResults({canonical:c,manual,telegram:tg});assert.deepEqual(audit.used_context_block_ids,['N05']);assert.deepEqual(audit.telegram_used_context_block_ids,['N05']);assert.equal(audit.telegram_delivery_proven,false);}
});
const database=()=>{const n=new DatabaseSync(':memory:');return{prepare(sql){const st=n.prepare(sql);return{bind(...p){this.p=Object.fromEntries(p.map((v,i)=>[String(i+1),v]));return this;},async first(){return st.get(this.p||{});},async all(){return{results:st.all(this.p||{})};},async run(){return st.run(this.p||{});}};},async batch(ss){n.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());n.exec('COMMIT');return r;}catch(e){n.exec('ROLLBACK');throw e;}},close(){n.close();}};};
test('production Bitfinex adapter uses three admitted calls and reuses original clocks without repeat HTTP',async()=>{
 const db=database();await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);let calls=0,grants=0;
 const x=setup('DASH'),now=end+1000,params={db,contract:x.contract,asset_identity:x.identity,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'BITFINEX_TEST',now,clock:()=>now,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/conf/')?catalog:url.includes('/candles/')?x.candles:x.trades));}};
 const first=await collectBitfinexNativeFlow(params);assert.equal(first.check_completed,true,first.reason||first.status);assert.equal(calls,3);assert.equal(grants,3);
 const cached=await collectBitfinexNativeFlow({...params,run_id:'BITFINEX_CACHE'});assert.equal(cached.check_completed,true,cached.reason||cached.status);assert.equal(calls,3);assert.equal(cached.components[0].observed_ts,now);db.close();
});
test('FIL and XPL use one shared catalog and four original windows calls with exact native scope',async()=>{
 const dir='checkpoints/n05-bitfinex-fil-xpl-38140143266',summary=JSON.parse(fs.readFileSync(dir+'/batch-summary.json'));
 const db=database();await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);
 const windows=Object.fromEntries(['FIL','XPL'].map(symbol=>[symbol,{candles:raw(dir+'/BITFINEX-'+symbol+'-CANDLES1M.json.gz'),trades:raw(dir+'/BITFINEX-'+symbol+'-TRADES10000.json.gz')}]));
 let calls=0,grants=0;const now=summary.window_end_ts+1000;
 for(const symbol of ['FIL','XPL']){
  const identityEntry=htx.entries[symbol];assert.equal(identityEntry.status,'CLOSED');assert.equal(identityEntry.binding_scope,'EXACT_NATIVE_CHAIN_TYPE_0');
  const params={db,contract:symbol+'-USDT',asset_identity:identityEntry.identities[0],identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'BITFINEX_FIL_XPL_TEST',now,clock:()=>now,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/conf/')?catalog:url.includes('/candles/')?windows[symbol].candles:windows[symbol].trades));}};
  const first=await collectBitfinexNativeFlow(params);assert.equal(first.check_completed,true,first.reason||first.status);assert.equal(qualifiedBitfinexNativeComponent(first.components[0]),true);
  const cached=await collectBitfinexNativeFlow({...params,run_id:'BITFINEX_FIL_XPL_CACHE'});assert.equal(cached.check_completed,true,cached.reason||cached.status);
 }
 assert.equal(calls,5);assert.equal(grants,5);db.close();
});
test('LINK and PEPE use exact official ERC20 contracts and one shared Bitfinex catalog',async()=>{
 const dir='checkpoints/n05-bitfinex-link-pepe-38140937694',summary=JSON.parse(fs.readFileSync(dir+'/batch-summary.json'));
 const db=database();await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);
 const windows=Object.fromEntries(['LINK','PEPE'].map(symbol=>[symbol,{candles:raw(dir+'/BITFINEX-'+symbol+'-CANDLES1M.json.gz'),trades:raw(dir+'/BITFINEX-'+symbol+'-TRADES10000.json.gz')}]));
 let calls=0,grants=0;const now=summary.window_end_ts+1000;
 for(const symbol of ['LINK','PEPE']){
  const original=summary.assets.find(a=>a.symbol===symbol),identity=htx.entries[symbol].identities[0];assert.equal(identity.contract_or_mint,original.contract);
  const params={db,contract:symbol+'-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'BITFINEX_TOKEN_TEST',now,clock:()=>now,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{calls++;return new Response(JSON.stringify(url.includes('/conf/')?catalog:url.includes('/candles/')?windows[symbol].candles:windows[symbol].trades));}};
  const first=await collectBitfinexNativeFlow(params);assert.equal(first.check_completed,true,first.reason||first.status);assert.equal(qualifiedBitfinexNativeComponent(first.components[0]),true);assert.equal(first.components[0].asset_kind,'TOKEN');assert.equal(first.components[0].token_contract_reference_url,original.official_contract_reference);
  const cached=await collectBitfinexNativeFlow({...params,run_id:'BITFINEX_TOKEN_CACHE'});assert.equal(cached.check_completed,true,cached.reason||cached.status);
 }
 assert.equal(calls,5);assert.equal(grants,5);db.close();
});
