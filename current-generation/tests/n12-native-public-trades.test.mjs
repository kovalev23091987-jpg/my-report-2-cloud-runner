import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {exactN12NativePublicBinding,normalizeN12NativePublicTrades,parseN12PublicTradeJson,validateN12NativePublicTrade} from '../files/src/n12-native-public-trade-sample.mjs';
import {collectN12NativePublicVenue,compactN12NativeCatalog} from '../files/src/n12-native-public-trade-collector.mjs';
import {installEvidenceSourceStore} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger} from '../files/src/provider-minute-ledger.mjs';
import {normalizeHtxLargeTrades} from '../files/src/htx-large-trades-evidence.mjs';
import {reconcileN12HtxMarkets} from '../files/src/n12-market-trades.mjs';
import {consumeBlockResultContext,auditRenderedBlockResults} from '../files/src/block-result-context.mjs';
import {formatManualReport} from '../files/src/manual-report-formatter.mjs';
import {canonicalFingerprint,renderCanonicalTelegram} from '../files/src/canonical-publication.mjs';

const raw=name=>zlib.gunzipSync(fs.readFileSync(new URL('../../checkpoints/n05-actual-qualification-38049404414/'+name+'.json.gz',import.meta.url))).toString('utf8');
const saved=(name,venue)=>parseN12PublicTradeJson(raw(name),{venue});
const catalogs={OKX:{SPOT:saved('catalog-OKX-SPOT','OKX'),FUTURES:saved('catalog-OKX-FUTURES','OKX')},KUCOIN:{SPOT:saved('catalog-KUCOIN-SPOT','KUCOIN'),FUTURES:saved('catalog-KUCOIN-FUTURES','KUCOIN')}};
const ids={BTC:{asset_kind:'NATIVE',chain:'bitcoin',native_asset_id:'bitcoin:mainnet',contract_or_mint:null},ETH:{asset_kind:'NATIVE',chain:'ethereum',native_asset_id:'ethereum:mainnet',contract_or_mint:null},XMR:{asset_kind:'NATIVE',chain:'monero',native_asset_id:'monero:mainnet',contract_or_mint:null}};
const cases=[['OKX','SPOT','BTC','flow-OKX-SPOT-BTC','BTC-USDT',100,1],['OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP',100,.01],['KUCOIN','SPOT','XMR','flow-KUCOIN-SPOT-XMR','XMR-USDT',81,1],['KUCOIN','FUTURES','ETH','flow-KUCOIN-FUTURES-ETH','ETHUSDTM',99,.01]];
const instrument=(venue,market,symbol)=>catalogs[venue][market].data.find(x=>x[venue==='OKX'?'instId':'symbol']===symbol);
const sourceMs=(venue,market,row)=>venue==='KUCOIN'?Number(BigInt(row[market==='SPOT'?'time':'ts'])/1000000n):Number(row.ts);
const sample=(venue,market,base,page,symbol,patch={})=>{const payload=saved(page,venue),latest=Math.max(...payload.data.map(row=>sourceMs(venue,market,row))),end=(Math.floor(latest/60000)+1)*60000;return normalizeN12NativePublicTrades({venue,market,contract:base+'-USDT',identity:ids[base],instrument:instrument(venue,market,symbol),payload,window_end_ts:end,observed_ts:end+1000,...patch});};

test('four retained original spot/futures pages contain exact, useful bounded facts with correct contract units',()=>{
 for(const [venue,market,base,page,symbol,count,multiplier] of cases){const r=sample(venue,market,base,page,symbol);assert.equal(r.status,'CLOSED_BOUNDED_SAMPLE',`${venue} ${market} ${r.status}`);assert.equal(r.summary.valid_recent_rows,count);assert.equal(r.summary.contract_multiplier,multiplier);assert.ok(r.summary.buy_quote_turnover_usdt>0&&r.summary.sell_quote_turnover_usdt>0);assert.equal(r.summary.whole_window_coverage_proven,false);assert.equal(r.evidence[0].score_contribution,0);assert.equal(validateN12NativePublicTrade(r.evidence[0],r.evidence[0].observed_ts),true);}
 const original=saved('flow-OKX-FUTURES-BTC','OKX').data[0],r=sample('OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP');assert.ok(Number(original.px)*Number(original.sz)>Number(original.px)*Number(original.sz)*r.summary.contract_multiplier);
});

test('shared native catalogs retain exact approved instruments within a small D1 cache row',()=>{
 for(const [venue,market,base,,symbol] of cases){const compact=compactN12NativeCatalog(venue,market,base+'-USDT',catalogs[venue][market]);assert.ok(compact.data.some(row=>row[venue==='OKX'?'instId':'symbol']===symbol));assert.ok(Buffer.byteLength(JSON.stringify(compact))<25000);assert.ok(compact.data.length<=21);}
});

test('wrong native identity, asset class, size metadata, symbol, duplicate IDs and unsafe KuCoin nanoseconds are rejected',()=>{
 for(const [venue,market,base,page,symbol] of cases){const row=instrument(venue,market,symbol);assert.equal(exactN12NativePublicBinding({venue,market,contract:base+'-USDT',identity:{...ids[base],chain:'foreign'},instrument:row}),false);assert.equal(sample(venue,market,base,page,symbol,{identity:{...ids[base],asset_kind:'TOKEN'}}).evidence.length,0);}
 const bad={...instrument('OKX','FUTURES','BTC-USDT-SWAP'),instCategory:'3'};assert.equal(sample('OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP',{instrument:bad}).evidence.length,0);
 assert.equal(sample('OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP',{instrument:{...bad,instCategory:'1',ctVal:'0'}}).evidence.length,0);
 const x=saved('flow-KUCOIN-FUTURES-ETH','KUCOIN');x.data=[x.data[0],x.data[0]];assert.equal(sample('KUCOIN','FUTURES','ETH','flow-KUCOIN-FUTURES-ETH','ETHUSDTM',{payload:x}).evidence.length,0);
 const y=saved('flow-KUCOIN-SPOT-XMR','KUCOIN');y.data[0].time=Number(y.data[0].time);assert.equal(sample('KUCOIN','SPOT','XMR','flow-KUCOIN-SPOT-XMR','XMR-USDT',{payload:{...y,data:[y.data[0]]}}).evidence.length,0);
});

function db(){const native=new DatabaseSync(':memory:');return{prepare(sql){const st=native.prepare(sql);return{bind(...p){this.p=Object.fromEntries(p.map((v,i)=>[String(i+1),v]));return this;},async first(){return st.get(this.p||{});},async all(){return{results:st.all(this.p||{})};},async run(){return st.run(this.p||{});}};},async batch(ss){native.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());native.exec('COMMIT');return r;}catch(e){native.exec('ROLLBACK');throw e;}},close(){native.close();}};}
test('OKX collector shares admission, stores original clocks, caches both markets and stops tokens before HTTP',async()=>{
 const d=db();await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);const one=sample('OKX','SPOT','BTC','flow-OKX-SPOT-BTC','BTC-USDT'),now=one.evidence[0].observed_ts;let calls=0,grants=0;
 const fetch_impl=async url=>{calls++;return new Response(url.includes('/public/instruments')?JSON.stringify(catalogs.OKX[url.includes('instType=SPOT')?'SPOT':'FUTURES']):raw(url.includes('SWAP')?'flow-OKX-FUTURES-BTC':'flow-OKX-SPOT-BTC'));};
 const params={db:d,contract:'BTC-USDT',asset_identity:ids.BTC,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'N12_NATIVE_1',now,clock:()=>now,request_admit:()=>{grants++;return{allowed:true};},source_health_admit:()=>({allowed:true}),fetch_impl};
 const first=await collectN12NativePublicVenue(params,'OKX');assert.equal(first.evidence.length,2,first.status);assert.equal(first.network_calls,4);assert.equal(calls,4);assert.equal(grants,4);
 const again=await collectN12NativePublicVenue({...params,run_id:'N12_NATIVE_2'},'OKX');assert.equal(again.network_calls,0);assert.equal(again.evidence.length,2);assert.equal(calls,4);
 const token=await collectN12NativePublicVenue({...params,asset_identity:{asset_kind:'TOKEN',chain:'bitcoin',contract_or_mint:'foreign'}},'OKX');assert.equal(token.network_calls,0);assert.equal(calls,4);d.close();
});

test('actual OKX spot and futures pages join controlled HTX fact and reach manual plus approved Telegram with exact IDs',()=>{
 const future=sample('OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP').evidence[0],spot=sample('OKX','SPOT','BTC','flow-OKX-SPOT-BTC','BTC-USDT').evidence[0],now=future.observed_ts,k='BTC-USDT';assert.equal(spot.observed_ts,now);
 const h={status:'ok',ch:`market.${k}.trade.detail`,ts:now-1000,data:[{data:[{id:'101',price:1,amount:1,quantity:1,trade_turnover:1,ts:now-2000,direction:'buy'}]}]},s={status:'ok',ch:'market.btcusdt.trade.detail',ts:now-1000,data:[{data:[{'trade-id':'201',price:1,amount:1,ts:now-2000,direction:'buy'}]}]},htx=reconcileN12HtxMarkets({contract:k,futures:normalizeHtxLargeTrades(h,{contract:k,observed_ts:now}),spot_payload:s,observed_ts:now}),evidence=[...htx.evidence,future,spot],facts=consumeBlockResultContext({contract:k,now,evidence}).facts,joined=facts.find(f=>f.label==='Направление последних сделок HTX');
 assert.ok(joined);assert.match(joined.value,/OKX спот/);assert.match(joined.value,/OKX фьючерсы/);assert.equal(joined.evidence_ids.length,3);assert.equal(facts.filter(f=>f.label==='Направление последних сделок OKX').length,0);
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);c.observed_ts=now;c.snapshot_id=`S392:${k}:${now}`;c.metadata.contract=k;c.metadata.internal_market_context.evidence_v2.evidence=evidence;c.metadata.internal_market_context.decision_ts=now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/OKX спот/);
 for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);assert.match(telegram.text,/OKX спот/);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});for(const row of [future,spot]){assert.ok(audit.context_receipts.some(x=>x.evidence_ids?.includes(row.evidence_id)));assert.ok(audit.telegram_context_receipts.some(x=>x.evidence_ids?.includes(row.evidence_id)));}}
});

test('one native venue keeps spot and futures together and rejects a conflicting direction',()=>{
 const spot=sample('OKX','SPOT','BTC','flow-OKX-SPOT-BTC','BTC-USDT').evidence[0],future=sample('OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP').evidence[0],now=spot.observed_ts;
 const standalone=consumeBlockResultContext({contract:'BTC-USDT',now,evidence:[spot,future]}).facts.filter(x=>x.label==='Направление последних сделок OKX');
 assert.equal(standalone.length,1);assert.deepEqual(new Set(standalone[0].evidence_ids),new Set([spot.evidence_id,future.evidence_id]));assert.match(standalone[0].value,/одна биржа — один независимый первоисточник/);
 const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);c.observed_ts=now;c.snapshot_id=`S392:BTC-USDT:${now}`;c.metadata.contract='BTC-USDT';c.metadata.internal_market_context.evidence_v2.evidence=[spot,future];c.metadata.internal_market_context.decision_ts=now;c.metadata.supporting_context={facts:standalone};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:now+600000,next_recheck_ts:now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
 const manual=formatManualReport(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});assert.equal(manual.ok,true);assert.equal(telegram.ok,true);assert.match(manual.text,/OKX спот/);assert.match(telegram.text,/OKX/);assert.match(telegram.text,/фьючерсы/);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.telegram_context_receipts.some(x=>[spot,future].every(row=>x.evidence_ids?.includes(row.evidence_id))));
 const flipped=saved('flow-OKX-FUTURES-BTC','OKX');for(const row of flipped.data)row.side=row.side==='buy'?'sell':'buy';
 const opposite=sample('OKX','FUTURES','BTC','flow-OKX-FUTURES-BTC','BTC-USDT-SWAP',{payload:flipped}).evidence[0];assert.ok(opposite.taker_imbalance<-.05);
 const conflict=consumeBlockResultContext({contract:'BTC-USDT',now,evidence:[spot,opposite]}).facts.filter(x=>x.label==='Направление последних сделок OKX');assert.equal(conflict.length,1);assert.match(conflict[0].value,/общего направления по двум неполным выборкам нет/);assert.doesNotMatch(conflict[0].value,/направления двух рынков совпадают/);
});
