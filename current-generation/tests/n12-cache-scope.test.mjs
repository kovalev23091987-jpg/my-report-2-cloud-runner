import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const moduleURL=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {collectN12NativePublicVenue,compactN12NativeCatalog,N12_NATIVE_PUBLIC_COLLECTOR_VERSION}=await import(moduleURL('n12-native-public-trade-collector.mjs'));
const {normalizeN12NativePublicTrades,parseN12PublicTradeJson}=await import(moduleURL('n12-native-public-trade-sample.mjs'));
const {compactN12KucoinTokenCurrencies,normalizeN12KucoinTokenTrades}=await import(moduleURL('n12-kucoin-token-trade-sample.mjs'));
const {collectGateFuturesTradeSample}=await import(moduleURL('gate-futures-trade-collector.mjs'));
const {normalizeGateFuturesTradeSample}=await import(moduleURL('gate-futures-trade-sample.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(moduleURL('evidence-source-store.mjs'));
const {installProviderMinuteLedger}=await import(moduleURL('provider-minute-ledger.mjs'));
const {consumeBlockResultContext,auditRenderedBlockResults}=await import(moduleURL('block-result-context.mjs'));
const {formatManualReport}=await import(moduleURL('manual-report-formatter.mjs'));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(moduleURL('canonical-publication.mjs'));

const directory='n05-actual-qualification-38049404414';
const raw=name=>gunzipSync(fs.readFileSync(new URL(`../../checkpoints/${directory}/${name}.json.gz`,import.meta.url))).toString();
const payload=(name,venue)=>parseN12PublicTradeJson(raw(name),{venue});
const identities={BTC:{asset_kind:'NATIVE',chain:'bitcoin',native_asset_id:'bitcoin:mainnet',contract_or_mint:null},ETH:{asset_kind:'NATIVE',chain:'ethereum',native_asset_id:'ethereum:mainnet',contract_or_mint:null},XMR:{asset_kind:'NATIVE',chain:'monero',native_asset_id:'monero:mainnet',contract_or_mint:null}};
const end=(Math.floor(Math.max(...payload('flow-OKX-SPOT-BTC','OKX').data.map(row=>Number(row.ts)))/60000)+1)*60000,now=end+1000;
function sample(venue,market,base,window_end_ts=end){
 const catalog=payload(`catalog-${venue}-${market}`,venue),symbol=venue==='OKX'?base+'-USDT'+(market==='FUTURES'?'-SWAP':''):base+(market==='FUTURES'?'USDTM':'-USDT');
 return normalizeN12NativePublicTrades({venue,market,contract:base+'-USDT',identity:identities[base],instrument:catalog.data.find(row=>row[venue==='OKX'?'instId':'symbol']===symbol),payload:payload(`flow-${venue}-${market}-${base}`,venue),window_end_ts,observed_ts:now});
}
const spot=sample('OKX','SPOT','BTC'),future=sample('OKX','FUTURES','BTC');
function database(){
 const sqlite=new DatabaseSync(':memory:');let unknown=0;const statements=[];
 return{sqlite,statements,usageSnapshot:()=>({unknown_ops:unknown}),markUnknown:()=>unknown=1,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){statements.push(sql);return sqlite.prepare(sql).get(...this.args)||null;},async all(){statements.push(sql);return{results:sqlite.prepare(sql).all(...this.args)};},async run(){statements.push(sql);return sqlite.prepare(sql).run(...this.args);}};},async batch(rows){const result=[];for(const row of rows)result.push(await row.run());return result;}};
}
async function setup(){const d=database();await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);return d;}
async function cache(d,source,key,data,clock=now){await writeEvidenceSourceCache(d,{source,asset_key:key,observed_ts:clock,expires_ts:clock+60000,payload:data});}
async function nativeSetup(spotResult=spot){
 const d=await setup(),source='N12_OFFICIAL_TRADES:OKX';
 for(const market of ['SPOT','FUTURES']){
  await cache(d,source,`N12:CATALOG:${market}:BTC-USDT`,{version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,observed_ts:now,payload:compactN12NativeCatalog('OKX',market,'BTC-USDT',payload(`catalog-OKX-${market}`,'OKX'))});
  await cache(d,source,`N12:TRADES:BTC-USDT:${market}:${end}`,{version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,result:market==='SPOT'?spotResult:future});
 }
 const urls=[],params={db:d,contract:'BTC-USDT',asset_identity:identities.BTC,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'N12_SCOPE',now,clock:()=>now,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{urls.push(url);assert.match(url,/market\/trades/);return new Response(raw(url.includes('SWAP')?'flow-OKX-FUTURES-BTC':'flow-OKX-SPOT-BTC'));}};
 return{d,urls,params};
}
function assertExactConsumer(result,contract,clock){
 assert.ok(result.evidence.length);assert.ok(result.evidence.every(row=>row.htx_contract===contract));
 const facts=consumeBlockResultContext({contract,now:clock,evidence:result.evidence}).facts.filter(row=>row.block_id==='N12');
 assert.ok(facts.length);for(const row of result.evidence)assert.ok(facts.some(fact=>(fact.evidence_ids||[fact.evidence_id]).includes(row.evidence_id)));
}
test('exact retained OKX spot/futures cache hits preserve both original facts and consumer without new attempts',async()=>{
 const {d,urls,params}=await nativeSetup();try{const r=await collectN12NativePublicVenue(params,'OKX');assert.equal(r.network_calls,0);assert.deepEqual(r.evidence,[...spot.evidence,...future.evidence]);assert.equal(urls.length,0);assertExactConsumer(r,params.contract,now);assert.equal(d.sqlite.prepare('SELECT count(*) AS n FROM report2_evidence_source_reservation').get().n,0);}finally{d.sqlite.close();}
});
const mutations={
 'opposite market':()=>future,
 'different native asset and venue':()=>sample('KUCOIN','FUTURES','ETH'),
 'different spot asset and venue':()=>sample('KUCOIN','SPOT','XMR'),
 'adjacent closed window':()=>sample('OKX','SPOT','BTC',end-60000),
 'foreign asset id':()=>{const r=structuredClone(spot);r.evidence[0].asset_id='HTX:ETH-USDT';return r;},
 'future observed clock':()=>{const r=structuredClone(spot);r.evidence[0].observed_ts=now+1;return r;},
 'future first-known clock':()=>{const r=structuredClone(spot);r.evidence[0].first_known_ts=now+1;return r;},
 'extended original expiry':()=>{const r=structuredClone(spot);r.evidence[0].expires_at=now+60001;return r;},
 'missing summary window':()=>{const r=structuredClone(spot);delete r.summary;return r;},
 'empty evidence':()=>({...spot,evidence:[]}),
};
for(const [name,mutate] of Object.entries(mutations))test(`OKX rejects ${name} cache result and recovers the exact requested original spot sample`,async()=>{
 const {d,urls,params}=await nativeSetup(mutate());try{const r=await collectN12NativePublicVenue(params,'OKX');assert.equal(r.network_calls,1);assert.equal(urls.length,1);assert.equal(r.evidence.length,2);assert.deepEqual(r.evidence,[...spot.evidence,...future.evidence]);assertExactConsumer(r,params.contract,now);assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,1);}finally{d.sqlite.close();}
});
test('a rejected foreign cache result cannot bypass denied HTTP admission or discard the valid other market',async()=>{
 const {d,params}=await nativeSetup(future);try{const r=await collectN12NativePublicVenue({...params,request_admit:()=>({allowed:false,status:'CONTROLLED_WHOLE_JOB_DENIED'})},'OKX');assert.equal(r.network_calls,0);assert.deepEqual(r.evidence,future.evidence);assert.ok(r.market_status.some(row=>row.market==='SPOT'&&row.status==='CONTROLLED_WHOLE_JOB_DENIED'));assert.equal(d.sqlite.prepare('SELECT count(*) AS n FROM report2_evidence_source_reservation').get().n,0);}finally{d.sqlite.close();}
});

const aave={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'},gateTrades=JSON.parse(raw('flow-GATE-FUTURES-AAVE'));
const gateContract=JSON.parse(raw('catalog-GATE-FUTURES')).find(row=>row.name==='AAVE_USDT'),gateNow=Math.round(Math.max(...gateTrades.map(row=>row.create_time_ms))*1000)+1000;
const currencies=[{currency:'AAVE',chains:[{name:'ETH',addr:aave.contract_or_mint}]}],gateSpot=[{id:'AAVE_USDT',base:'AAVE',quote:'USDT',trade_status:'tradable'}];
const gate=normalizeGateFuturesTradeSample({contract:'AAVE-USDT',identity:aave,currencies,spot:gateSpot,future_contract:gateContract,trades:gateTrades,observed_ts:gateNow});
async function gateSetup(result){
 const d=await setup(),source='N05_OFFICIAL_FLOW:GATE',version='gate-futures-trade-collector-v1-20261011';
 for(const [provider,key,payload] of [['GATE_ASSET_REFERENCE','N05:CURRENCIES',currencies],[source,'METADATA:SPOT',gateSpot]])await cache(d,provider,key,{version:'gate-flow-collector-v1-20261010',observed_ts:gateNow,payload},gateNow);
 await cache(d,source,'N12:CONTRACT:AAVE_USDT',{version,observed_ts:gateNow,payload:gateContract},gateNow);
 await cache(d,source,'N12:FUTURES:AAVE-USDT',{version,result},gateNow);
 const urls=[],params={db:d,contract:'AAVE-USDT',asset_identity:aave,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'GATE_SCOPE',now:gateNow,clock:()=>gateNow,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{urls.push(url);assert.match(url,/futures\/usdt\/trades/);return new Response(JSON.stringify(gateTrades));}};
 return{d,urls,params};
}
test('exact retained Gate AAVE cache hit preserves the original source clock with no source reservation',async()=>{
 const {d,urls,params}=await gateSetup(gate);try{const r=await collectGateFuturesTradeSample(params);assert.equal(r.network_calls,0);assert.equal(urls.length,0);assert.deepEqual(r.evidence,gate.evidence);assertExactConsumer(r,params.contract,gateNow);}finally{d.sqlite.close();}
});
const gateMutations={
 'empty evidence':()=>({...gate,evidence:[]}),
 'foreign token address':()=>{const r=structuredClone(gate);r.evidence[0].identity.contract_or_mint='0x6982508145454ce325ddbe47a25d4ec3d2311933';return r;},
 'foreign contract':()=>{const r=structuredClone(gate);r.evidence[0].htx_contract='PEPE-USDT';r.evidence[0].origin_event_id=r.evidence[0].physical_root_key=r.evidence[0].origin_event_id.replace('AAVE-USDT','PEPE-USDT');return r;},
 'future observed clock':()=>{const r=structuredClone(gate);r.evidence[0].observed_ts=gateNow+1;return r;},
};
for(const [name,mutate] of Object.entries(gateMutations))test(`Gate rejects ${name} and continues to the exact AAVE original within existing admission`,async()=>{
 const {d,urls,params}=await gateSetup(mutate());try{const r=await collectGateFuturesTradeSample(params);assert.equal(r.network_calls,1);assert.equal(urls.length,1);assert.deepEqual(r.evidence,gate.evidence);assertExactConsumer(r,params.contract,gateNow);assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,1);}finally{d.sqlite.close();}
});
test('Gate invalid cache plus unknown native read cost stops before another SQL or transport',async()=>{
 const {d,params}=await gateSetup({...gate,evidence:[]});try{const old=d.prepare;d.prepare=function(sql){const prepared=old.call(d,sql),first=prepared.first;prepared.first=async function(){const r=await first.call(this);if(sql.startsWith('SELECT observed_ts')&&this.args[1]==='N12:FUTURES:AAVE-USDT')d.markUnknown();return r;};return prepared;};const r=await collectGateFuturesTradeSample(params);assert.equal(r.network_calls,0);assert.equal(r.evidence.length,0);assert.equal(d.statements.at(-1).startsWith('SELECT observed_ts'),true);assert.equal(d.usageSnapshot().unknown_ops,1);}finally{d.sqlite.close();}
});

const pepeRaw=name=>gunzipSync(fs.readFileSync(new URL(`../../checkpoints/n12-kucoin-token-38193724806/${name}.json.gz`,import.meta.url))).toString();
const pepePayload=name=>parseN12PublicTradeJson(pepeRaw(name),{venue:'KUCOIN'}),pepeNow=1791770105412,pepeEnd=1791770100000;
const pepeIdentity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x6982508145454ce325ddbe47a25d4ec3d2311933'},pepeCurrencies=compactN12KucoinTokenCurrencies(pepePayload('KUCOIN-CURRENCIES'));
const pepeCatalogs=Object.fromEntries(['SPOT','FUTURES'].map(market=>[market,compactN12NativeCatalog('KUCOIN',market,'PEPE-USDT',pepePayload(`KUCOIN-${market}-CATALOG`))]));
const pepeSamples=Object.fromEntries(['SPOT','FUTURES'].map(market=>[market,normalizeN12KucoinTokenTrades({contract:'PEPE-USDT',market,identity:pepeIdentity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',currencies:pepeCurrencies,instrument:pepeCatalogs[market].data.find(row=>row.symbol===(market==='SPOT'?'PEPE-USDT':'PEPEUSDTM')),payload:pepePayload(`KUCOIN-${market}-PEPE`),window_end_ts:pepeEnd,observed_ts:market==='SPOT'?1791770104067:pepeNow})]));
async function tokenSetup(mutate=r=>r){
 const d=await setup(),source='N12_OFFICIAL_TRADES:KUCOIN';
 await cache(d,source,'N12:CURRENCIES:APPROVED',{version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,observed_ts:pepeNow,payload:pepeCurrencies},pepeNow);
 for(const market of ['SPOT','FUTURES']){
  await cache(d,source,`N12:CATALOG:${market}:ALL`,{version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,observed_ts:pepeNow,payload:pepeCatalogs[market]},pepeNow);
  await cache(d,source,`N12:TRADES:PEPE-USDT:${market}:${pepeEnd}`,{version:N12_NATIVE_PUBLIC_COLLECTOR_VERSION,result:market==='SPOT'?mutate(structuredClone(pepeSamples.SPOT)):pepeSamples.FUTURES},pepeNow);
 }
 const urls=[],params={db:d,contract:'PEPE-USDT',asset_identity:pepeIdentity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'PEPE_SCOPE',now:pepeNow,clock:()=>pepeNow,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{urls.push(url);assert.match(url,/market\/histories/);return new Response(pepeRaw('KUCOIN-SPOT-PEPE'));}};
 return{d,params,urls};
}
test('exact PEPE address and case-equivalent EVM address reuse both market facts without HTTP',async()=>{
 const {d,params}=await tokenSetup();try{const r=await collectN12NativePublicVenue({...params,asset_identity:{...pepeIdentity,contract_or_mint:pepeIdentity.contract_or_mint.toUpperCase().replace('0X','0x')}},'KUCOIN');assert.equal(r.network_calls,0);assert.deepEqual(r.evidence,[...pepeSamples.SPOT.evidence,...pepeSamples.FUTURES.evidence]);assertExactConsumer(r,params.contract,pepeNow);}finally{d.sqlite.close();}
});
for(const [name,mutate] of Object.entries({
 'opposite token market':()=>structuredClone(pepeSamples.FUTURES),
 'wrong original window':r=>{r.summary.window_end-=60000;r.summary.window_start-=60000;return r;},
 'duplicate market facts':r=>{r.evidence.push(structuredClone(r.evidence[0]));return r;},
}))test(`KuCoin rejects ${name} cache and recovers the original PEPE spot page`,async()=>{
 const {d,params,urls}=await tokenSetup(mutate);try{const r=await collectN12NativePublicVenue(params,'KUCOIN');assert.equal(r.network_calls,1);assert.equal(urls.length,1);assert.equal(r.evidence.length,2);assert.equal(r.evidence[0].source_ts,pepeSamples.SPOT.evidence[0].source_ts);assert.equal(r.evidence[1].evidence_id,pepeSamples.FUTURES.evidence[0].evidence_id);assertExactConsumer(r,params.contract,pepeNow);}finally{d.sqlite.close();}
});
test('recovered PEPE cache fallback retains exact facts and disagreement through manual and both approved Telegram renderers',async()=>{
 const {d,params}=await tokenSetup(()=>structuredClone(pepeSamples.FUTURES));try{
  const result=await collectN12NativePublicVenue(params,'KUCOIN');assert.equal(result.network_calls,1);assert.equal(result.evidence.length,2);
  const facts=consumeBlockResultContext({contract:params.contract,now:pepeNow,evidence:result.evidence}).facts;
  const c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);
  c.observed_ts=pepeNow;c.snapshot_id=`S392:${params.contract}:${pepeNow}`;c.metadata.contract=params.contract;c.metadata.internal_market_context.evidence_v2.evidence=result.evidence;c.metadata.internal_market_context.decision_ts=pepeNow;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:pepeNow+600000,next_recheck_ts:pepeNow+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c);assert.equal(manual.ok,true);assert.match(manual.text,/общего направления по двум неполным выборкам нет/);
  for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.telegram_context_receipts.some(receipt=>result.evidence.every(row=>receipt.evidence_ids?.includes(row.evidence_id))));}
  assert.ok(result.evidence.every(row=>row.score_contribution===0&&row.entry_authorized===false));
 }finally{d.sqlite.close();}
});
