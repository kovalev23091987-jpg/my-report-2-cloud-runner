import {withVerifiedAssetRouteIdentity} from '../files/src/verified-asset-route-identity.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {parseN12PublicTradeJson} from '../files/src/n12-native-public-trade-sample.mjs';
import {compactN12KucoinTokenCurrencies,exactN12KucoinTokenCurrency,exactN12KucoinTokenMarket,normalizeN12KucoinTokenTrades,validateN12KucoinTokenTrade} from '../files/src/n12-kucoin-token-trade-sample.mjs';
import {collectN12NativePublicVenue,compactN12NativeCatalog} from '../files/src/n12-native-public-trade-collector.mjs';
import {installEvidenceSourceStore} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';

const dir=new URL('../../checkpoints/n12-kucoin-token-38193724806/',import.meta.url),raw=name=>gunzipSync(fs.readFileSync(new URL(name+'.json.gz',dir))).toString('utf8'),saved=name=>parseN12PublicTradeJson(raw(name),{venue:'KUCOIN'}),proof=JSON.parse(fs.readFileSync(new URL('summary.json',dir))),identity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x6982508145454ce325ddbe47a25d4ec3d2311933'},method='HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',contract='PEPE-USDT';
const currency=compactN12KucoinTokenCurrencies(saved('KUCOIN-CURRENCIES')),spotCatalog=compactN12NativeCatalog('KUCOIN','SPOT',contract,saved('KUCOIN-SPOT-CATALOG')),futureCatalog=compactN12NativeCatalog('KUCOIN','FUTURES',contract,saved('KUCOIN-FUTURES-CATALOG'));
const instrument=(market)=>{const catalog=market==='SPOT'?spotCatalog:futureCatalog,symbol=market==='SPOT'?contract:'PEPEUSDTM';return catalog.data.find(row=>row.symbol===symbol);};
const sample=(market,patch={})=>normalizeN12KucoinTokenTrades({contract,market,identity,identity_method:method,currencies:currency,instrument:instrument(market),payload:saved(`KUCOIN-${market}-PEPE`),window_end_ts:1791770100000,observed_ts:market==='SPOT'?1791770104067:1791770105412,...patch});
function db(){const native=new DatabaseSync(':memory:');return{prepare(sql){const st=native.prepare(sql);return{bind(...p){this.p=Object.fromEntries(p.map((v,i)=>[String(i+1),v]));return this;},async first(){return st.get(this.p||{});},async all(){return{results:st.all(this.p||{})};},async run(){return st.run(this.p||{});}};},async batch(ss){native.exec('BEGIN');try{const out=[];for(const s of ss)out.push(await s.run());native.exec('COMMIT');return out;}catch(e){native.exec('ROLLBACK');throw e;}},close(){native.close();}};}

test('five current original KuCoin pages bind PEPE address, live spot/future units and useful conflicting trades',()=>{
 assert.equal(proof.status,'EXACT_ORIGINAL_TOKEN_TRADE_DATA_USEFUL');assert.equal(proof.sourceHTTP,5);assert.equal(proof.D1.unknown_ops,0);assert.equal(proof.receipts.length,5);
 assert.equal(exactN12KucoinTokenCurrency({contract,identity,identity_method:method,currencies:currency}),true);
 assert.equal(exactN12KucoinTokenMarket({contract,market:'SPOT',instrument:instrument('SPOT')}),true);assert.equal(exactN12KucoinTokenMarket({contract,market:'FUTURES',instrument:instrument('FUTURES')}),true);
 assert.ok(Buffer.byteLength(JSON.stringify(currency))<50000);assert.ok(Buffer.byteLength(JSON.stringify(spotCatalog))<25000);assert.ok(Buffer.byteLength(JSON.stringify(futureCatalog))<25000);
 const spot=sample('SPOT'),future=sample('FUTURES');assert.equal(spot.summary.valid_recent_rows,51);assert.equal(future.summary.valid_recent_rows,100);assert.equal(future.summary.contract_multiplier,520000);assert.ok(spot.summary.taker_imbalance>0&&future.summary.taker_imbalance<0);for(const result of [spot,future]){assert.equal(result.status,'CLOSED_BOUNDED_SAMPLE');assert.equal(result.evidence[0].score_contribution,0);assert.equal(validateN12KucoinTokenTrade(result.evidence[0],result.evidence[0].observed_ts),true);}
});

test('foreign chain, wrong mint, duplicate currency, closed market and duplicate trades fail closed',()=>{
 for(const wrong of [{...identity,chain:'bsc'},{...identity,contract_or_mint:'0x1111111111111111111111111111111111111111'}])assert.equal(sample('SPOT',{identity:wrong}).evidence.length,0);
 assert.equal(sample('SPOT',{currencies:{...currency,data:[...currency.data,...currency.data.filter(x=>x.currency==='PEPE')]}}).evidence.length,0);
 assert.equal(sample('FUTURES',{instrument:{...instrument('FUTURES'),multiplier:'0'}}).evidence.length,0);
 const bad=saved('KUCOIN-SPOT-PEPE');bad.data=[bad.data[0],bad.data[0]];assert.equal(sample('SPOT',{payload:bad}).evidence.length,0);
});

test('admitted KuCoin token collector uses five calls, shared source ledger and zero-call cache replay',async()=>{
 const d=db();await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);let calls=0,grants=0;const now=1791770105412;
 const fetch_impl=async url=>{calls++;const name=url.includes('/v3/currencies')?'KUCOIN-CURRENCIES':url.includes('/v2/symbols')?'KUCOIN-SPOT-CATALOG':url.includes('/contracts/active')?'KUCOIN-FUTURES-CATALOG':url.includes('/market/histories')?'KUCOIN-SPOT-PEPE':'KUCOIN-FUTURES-PEPE';return new Response(raw(name));};
 const params={db:d,contract,asset_identity:identity,identity_method:method,run_id:'N12_KUCOIN_TOKEN_1',now,clock:()=>now,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl};
 const first=await collectN12NativePublicVenue(params,'KUCOIN');assert.equal(first.evidence.length,2,JSON.stringify(first));assert.equal(first.network_calls,5);assert.equal(calls,5);assert.equal(grants,5);
 const again=await collectN12NativePublicVenue({...params,run_id:'N12_KUCOIN_TOKEN_2'},'KUCOIN');assert.equal(again.evidence.length,2);assert.equal(again.network_calls,0);assert.equal(calls,5);
 const wrong=await collectN12NativePublicVenue({...params,asset_identity:{...identity,contract_or_mint:'0x1111111111111111111111111111111111111111'}},'KUCOIN');assert.equal(wrong.evidence.length,0);assert.equal(wrong.network_calls,0);d.close();
});

test('opposite exact PEPE spot and futures remain one KuCoin source in manual and approved Telegram',()=>{
 const spot=sample('SPOT').evidence[0],future=sample('FUTURES').evidence[0],now=future.observed_ts,facts=consumeBlockResultContext({contract,now,evidence:[spot,future]}).facts.filter(x=>x.label==='Направление последних сделок KuCoin');assert.equal(facts.length,1);assert.deepEqual(new Set(facts[0].evidence_ids),new Set([spot.evidence_id,future.evidence_id]));assert.match(facts[0].value,/общего направления по двум неполным выборкам нет/);
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);c.observed_ts=now;c.snapshot_id=`S392:${contract}:${now}`;c.metadata.contract=contract;c.metadata.internal_market_context.evidence_v2.evidence=[spot,future];c.metadata.internal_market_context.decision_ts=now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/адрес токена/);for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);assert.match(telegram.text,/Общего направления по двум рынкам нет/);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.telegram_context_receipts.some(x=>[spot,future].every(row=>x.evidence_ids?.includes(row.evidence_id))));}
});

test('closed registry provenance retains original KuCoin spot/future facts and rejects a detached or changed proof',()=>{const identity_method='MANUAL_EXACT_REGISTRY',p=withVerifiedAssetRouteIdentity({contract,asset_identity:identity,identity_method,supplemental_context:{contract,base:'PEPE',registry_status:'CLOSED',identity_status:'CLOSED',identity_method,asset_identity:identity,registry_confirmation_required:false}});for(const market of ['SPOT','FUTURES']){const result=sample(market,{identity_method,asset_binding_proof:p.asset_binding_proof});assert.equal(result.evidence.length,1);assert.equal(validateN12KucoinTokenTrade(result.evidence[0],result.evidence[0].observed_ts),true);assert.equal(result.evidence[0].identity_method,identity_method);assert.equal(validateN12KucoinTokenTrade({...result.evidence[0],asset_binding_proof:undefined},result.evidence[0].observed_ts),false);assert.equal(validateN12KucoinTokenTrade({...result.evidence[0],identity:{...identity,contract_or_mint:'0x'+'b'.repeat(40)}},result.evidence[0].observed_ts),false);}});

test('new closed-registry proof survives the consumer and both approved report renderers',()=>{
 const identity_method='MANUAL_EXACT_REGISTRY',p=withVerifiedAssetRouteIdentity({contract,asset_identity:identity,identity_method,supplemental_context:{contract,base:'PEPE',registry_status:'CLOSED',identity_status:'CLOSED',identity_method,asset_identity:identity,registry_confirmation_required:false}});
 const rows=['SPOT','FUTURES'].map(m=>sample(m,{identity_method,asset_binding_proof:p.asset_binding_proof}).evidence[0]),now=rows[1].observed_ts,facts=consumeBlockResultContext({contract,now,evidence:rows}).facts.filter(f=>f.label==='Направление последних сделок KuCoin');assert.equal(facts.length,1);assert.match(facts[0].value,/общего направления по двум неполным выборкам нет/);
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);c.observed_ts=now;c.snapshot_id=`S392:${contract}:${now}`;c.metadata.contract=contract;c.metadata.internal_market_context.evidence_v2.evidence=rows;c.metadata.internal_market_context.decision_ts=now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/адрес токена/);
 for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.telegram_context_receipts.some(x=>rows.every(row=>x.evidence_ids?.includes(row.evidence_id))));}
});
