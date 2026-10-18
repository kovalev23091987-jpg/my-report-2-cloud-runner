import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const moduleURL=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {collectN12NativePublicVenue}=await import(moduleURL('n12-native-public-trade-collector.mjs'));
const {collectGateFuturesTradeSample}=await import(moduleURL('gate-futures-trade-collector.mjs'));
const {collectBitgetFlow}=await import(moduleURL('bitget-flow-collector.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(moduleURL('evidence-source-store.mjs'));
const {installProviderMinuteLedger}=await import(moduleURL('provider-minute-ledger.mjs'));
const {parseN12PublicTradeJson}=await import(moduleURL('n12-native-public-trade-sample.mjs'));
const {consumeBlockResultContext,auditRenderedBlockResults}=await import(moduleURL('block-result-context.mjs'));
const {formatManualReport}=await import(moduleURL('manual-report-formatter.mjs'));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(moduleURL('canonical-publication.mjs'));

function database(){
 const sqlite=new DatabaseSync(':memory:'),log=[];let unknown=0,hook=()=>{};
 const d={sqlite,log,setHook:f=>hook=f,setUnknown:n=>unknown=n,usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return execute('run',sql,this.args);},async first(){return execute('first',sql,this.args);},async all(){return{results:execute('all',sql,this.args)};}};},async batch(rows){const out=[];for(const row of rows)out.push(await row.run());hook('batch',rows.map(()=>''),[],out);return out;}};
 function execute(method,sql,args){log.push({method,sql,args,after_unknown:unknown!==0});hook('before',sql,args);const s=sqlite.prepare(sql),out=method==='first'?s.get(...args)||null:method==='all'?s.all(...args):s.run(...args);hook('after',sql,args,out);return out;}
 return d;
}
const raw=(dir,name)=>gunzipSync(fs.readFileSync(new URL(`../../checkpoints/${dir}/${name}.json.gz`,import.meta.url))).toString();
const original='n05-actual-qualification-38049404414',pepe='n12-kucoin-token-38193724806';
const okxBody=name=>raw(original,name),okxPayload=name=>parseN12PublicTradeJson(okxBody(name),{venue:'OKX'});
const okxNow=(Math.floor(Math.max(...okxPayload('flow-OKX-SPOT-BTC').data.map(x=>Number(x.ts)))/60000)+1)*60000+1000;
const btc={asset_kind:'NATIVE',chain:'bitcoin',native_asset_id:'bitcoin:mainnet',contract_or_mint:null};
const pepeIdentity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x6982508145454ce325ddbe47a25d4ec3d2311933'};
function nativeParams(d,venue){
 const kucoin=venue==='KUCOIN',now=kucoin?1791770105412:okxNow;
 return{db:d,contract:kucoin?'PEPE-USDT':'BTC-USDT',asset_identity:kucoin?pepeIdentity:btc,identity_method:kucoin?'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS':'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'N12_CACHE_'+venue,now,clock:()=>now,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>{
  const name=kucoin?(url.includes('/v3/currencies')?'KUCOIN-CURRENCIES':url.includes('/v2/symbols')?'KUCOIN-SPOT-CATALOG':url.includes('/contracts/active')?'KUCOIN-FUTURES-CATALOG':url.includes('/market/histories')?'KUCOIN-SPOT-PEPE':'KUCOIN-FUTURES-PEPE'):(url.includes('/public/instruments')?'catalog-OKX-'+(url.includes('instType=SPOT')?'SPOT':'FUTURES'):'flow-OKX-'+(url.includes('SWAP')?'FUTURES':'SPOT')+'-BTC');
  return new Response(raw(kucoin?pepe:original,name));
 }};
}
async function setup(){const d=database();await installEvidenceSourceStore(d);await installProviderMinuteLedger(d);d.log.length=0;return d;}
function noLaterWork(d){assert.equal(d.log.filter(x=>x.after_unknown).length,0);}
function failedCache(d,predicate,{unknown=false,ack=false}={}){
 let failures=0;d.setHook((phase,sql,args)=>{if(phase===(ack?'after':'before')&&typeof sql==='string'&&sql.startsWith('INSERT INTO report2_evidence_source_cache')&&predicate(String(args[1]))){failures++;if(unknown)d.setUnknown(1);if(!ack)throw Error('CONTROLLED_OPTIONAL_CACHE_FAILURE');}});return()=>failures;
}
function checkConsumer(r,p){
 assert.ok(r.evidence.length);const facts=consumeBlockResultContext({contract:p.contract,now:p.now,evidence:r.evidence}).facts.filter(x=>x.block_id==='N12');assert.ok(facts.length);
 for(const row of r.evidence){assert.equal(row.score_contribution,0);assert.ok(facts.some(f=>(f.evidence_ids||[f.evidence_id]).includes(row.evidence_id)));}
 return facts;
}
for(const venue of ['OKX','KUCOIN'])for(const unknown of [false,true])test(`${venue} exact original N12 sample survives failed final cache; unknown=${unknown}`,async()=>{
 const d=await setup();try{const p=nativeParams(d,venue),failed=failedCache(d,key=>key.startsWith('N12:TRADES:'),{unknown}),r=await collectN12NativePublicVenue(p,venue);
  assert.equal(r.status,'CLOSED_BOUNDED_N12_PUBLIC_TRADES');assert.equal(r.evidence.length,unknown?1:2);assert.equal(r.network_calls,venue==='OKX'?(unknown?2:4):(unknown?3:5));assert.equal(failed(),unknown?1:2);checkConsumer(r,p);noLaterWork(d);
  assert.ok(r.cache_write_receipts.some(x=>x.status==='CACHE_WRITE_FAILED_VALID_RESPONSE_RETAINED'));assert.equal(d.usageSnapshot().unknown_ops,unknown?1:0);
  assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,r.network_calls);
 }finally{d.sqlite.close();}
});
for(const venue of ['OKX','KUCOIN'])test(`${venue} unknown metadata cache cost stops before another cache read or transport`,async()=>{
 const d=await setup();try{const failed=failedCache(d,key=>!key.startsWith('N12:TRADES:'),{unknown:true}),r=await collectN12NativePublicVenue(nativeParams(d,venue),venue);assert.equal(failed(),1);assert.equal(r.network_calls,1);assert.equal(r.evidence.length,0);noLaterWork(d);assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,1);}finally{d.sqlite.close();}
});
test('known metadata cache write failures keep in-memory catalogs and both exact PEPE market facts',async()=>{
 const d=await setup();try{failedCache(d,key=>!key.startsWith('N12:TRADES:'));const p=nativeParams(d,'KUCOIN'),r=await collectN12NativePublicVenue(p,'KUCOIN');assert.equal(r.evidence.length,2);assert.equal(r.network_calls,5);checkConsumer(r,p);assert.equal(r.evidence[0].identity.contract_or_mint,pepeIdentity.contract_or_mint);}finally{d.sqlite.close();}
});
test('unmeasured successful optional ACK retains the source fact and stops subsequent work',async()=>{
 const d=await setup();try{failedCache(d,key=>key.startsWith('N12:TRADES:'),{unknown:true,ack:true});const r=await collectN12NativePublicVenue(nativeParams(d,'OKX'),'OKX');assert.equal(r.evidence.length,1);assert.equal(r.network_calls,2);assert.equal(r.cache_write_receipts.at(-1).status,'CACHE_WRITE_UNCLOSED_NATIVE_USAGE');noLaterWork(d);}finally{d.sqlite.close();}
});
test('a later market cache-read exception preserves the prior exact original spot fact',async()=>{
 const d=await setup();try{d.setHook((phase,sql,args)=>{if(phase==='before'&&sql.startsWith('SELECT observed_ts')&&String(args[1]).includes('CATALOG:FUTURES'))throw Error('CONTROLLED_LATE_READ');});const p=nativeParams(d,'OKX'),r=await collectN12NativePublicVenue(p,'OKX');assert.equal(r.evidence.length,1);assert.equal(r.network_calls,2);assert.equal(r.market_status.at(-1).status,'MARKET_SOURCE_OR_STORE_ERROR');checkConsumer(r,p);}finally{d.sqlite.close();}
});
for(const stage of ['cache-read','daily-headroom','minute-headroom','daily-batch','minute-batch'])test(`N12 halts every new SQL and transport after unknown ${stage}`,async()=>{
 const d=await setup();let fired=false;try{d.setHook((phase,sql)=>{const hit=stage==='cache-read'?phase==='after'&&typeof sql==='string'&&sql.startsWith('SELECT observed_ts'):stage==='daily-headroom'?phase==='after'&&typeof sql==='string'&&sql.startsWith('SELECT attempts FROM report2_evidence_source_daily'):stage==='minute-headroom'?phase==='after'&&typeof sql==='string'&&sql.startsWith('SELECT COALESCE(SUM(units)'):stage==='daily-batch'?phase==='batch':phase==='after'&&typeof sql==='string'&&sql.startsWith('INSERT INTO report2_provider_minute_ledger_v1');if(hit&&!fired){fired=true;d.setUnknown(1);}});const r=await collectN12NativePublicVenue(nativeParams(d,'OKX'),'OKX');assert.equal(fired,true);assert.equal(r.network_calls,0);assert.equal(r.evidence.length,0);noLaterWork(d);
  if(['daily-batch','minute-batch'].includes(stage))assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,1);
 }finally{d.sqlite.close();}
});
const aave={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'};
const gateTrades=JSON.parse(raw(original,'flow-GATE-FUTURES-AAVE')),gateContract=JSON.parse(raw(original,'catalog-GATE-FUTURES')).find(r=>r.name==='AAVE_USDT'),gateNow=Math.round(Math.max(...gateTrades.map(x=>x.create_time_ms))*1000)+1000;
async function gateParams(d){for(const[source,key,payload]of [['GATE_ASSET_REFERENCE','N05:CURRENCIES',[{currency:'AAVE',chains:[{name:'ETH',addr:aave.contract_or_mint}]}]],['N05_OFFICIAL_FLOW:GATE','METADATA:SPOT',[{id:'AAVE_USDT',base:'AAVE',quote:'USDT',trade_status:'tradable'}]]])await writeEvidenceSourceCache(d,{source,asset_key:key,observed_ts:gateNow-1000,expires_ts:gateNow+3600000,payload:{version:'gate-flow-collector-v1-20261010',observed_ts:gateNow-1000,payload}});d.log.length=0;return{db:d,contract:'AAVE-USDT',asset_identity:aave,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'GATE_CACHE',now:gateNow,clock:()=>gateNow,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>new Response(JSON.stringify(url.includes('/contracts/')?gateContract:gateTrades))};}
for(const unknown of [false,true])test(`Gate exact original AAVE sample and consumer survive final cache error; unknown=${unknown}`,async()=>{
 const d=await setup();try{const p=await gateParams(d),failed=failedCache(d,key=>key==='N12:FUTURES:AAVE-USDT',{unknown}),r=await collectGateFuturesTradeSample(p);assert.equal(failed(),1);assert.equal(r.evidence.length,1);assert.equal(r.network_calls,2);assert.equal(r.evidence[0].observed_ts,gateNow);checkConsumer(r,p);noLaterWork(d);assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,2);}finally{d.sqlite.close();}
});
test('Gate unknown metadata write prevents the next native cache read and trade request',async()=>{
 const d=await setup();try{const p=await gateParams(d);failedCache(d,key=>key.startsWith('N12:CONTRACT:'),{unknown:true});const r=await collectGateFuturesTradeSample(p);assert.equal(r.network_calls,1);assert.equal(r.evidence.length,0);noLaterWork(d);}finally{d.sqlite.close();}
});
for(const collect of [p=>collectN12NativePublicVenue(p,'OKX'),collectGateFuturesTradeSample,collectBitgetFlow])test(`${collect.name||'OKX'} existing unknown refuses before any SQL or source attempt`,async()=>{
 const d=await setup();try{const p=collect===collectGateFuturesTradeSample?await gateParams(d):nativeParams(d,'OKX');d.setUnknown(1);d.log.length=0;const r=await collect(p);assert.equal(r.evidence.length,0);assert.equal(r.network_calls,0);assert.equal(d.log.length,0);}finally{d.sqlite.close();}
});
async function bitgetParams(d){
 const end=1791633600000,now=end+1000,identity={asset_kind:'TOKEN',chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'};
 const catalogs={coins:{code:'00000',data:[{coin:'LINK',chains:[{chain:'ERC20',contractAddress:identity.contract_or_mint}]}]},spot:{code:'00000',data:[{symbol:'LINKUSDT',baseCoin:'LINK',quoteCoin:'USDT',status:'online'}]},futures:{code:'00000',data:[{symbol:'LINKUSDT',baseCoin:'LINK',quoteCoin:'USDT',symbolStatus:'normal',symbolType:'perpetual'}]}};
 for(const[k,payload]of Object.entries(catalogs))await writeEvidenceSourceCache(d,{source:'N05_OFFICIAL_FLOW:BITGET',asset_key:'METADATA:'+k,observed_ts:now-60000,expires_ts:now+3600000,payload:{version:'bitget-flow-collector-v1-20261010',observed_ts:now-60000,payload,receipt:{body_sha256:'a'.repeat(64),received_ts:now-60000,http_status:200}}});d.log.length=0;
 const candles={code:'00000',data:Array.from({length:240},(_,i)=>[String(end-14400000+i*60000),'2','2','2','2','1.00000000','2.00000000','2.00000000'])},fills={code:'00000',data:Array.from({length:240},(_,i)=>({symbol:'LINKUSDT',tradeId:String(1000-i),ts:String(end-(i+1)*60000+5),side:i%2?'Buy':'Sell',price:'2',size:'1'}))};
 return{db:d,contract:'LINK-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_CURRENCY_CHAIN_ADDRESS',run_id:'CONTROLLED_BITGET_CACHE',now,clock:()=>now,request_admit:()=>({allowed:true}),source_health_admit:()=>({allowed:true}),fetch_impl:async url=>new Response(JSON.stringify(url.includes('/candles?')?candles:fills))};
}
for(const unknown of [false,true])test(`controlled Bitget complete flow and bounded facts survive optional flow-cache failure; unknown=${unknown}`,async()=>{
 const d=await setup();try{const p=await bitgetParams(d);failedCache(d,key=>key.startsWith('FLOW:'),{unknown});const r=await collectBitgetFlow(p);assert.equal(r.evidence.length,unknown?1:2);assert.equal(r.components.filter(c=>c.check_completed).length,unknown?1:2);assert.equal(r.network_calls,unknown?2:4);checkConsumer(r,p);noLaterWork(d);assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,r.network_calls);}finally{d.sqlite.close();}
});
test('Bitget later market cache error retains the already normalized first market result',async()=>{
 const d=await setup();try{const p=await bitgetParams(d);d.setHook((phase,sql,args)=>{if(phase==='before'&&sql.startsWith('SELECT observed_ts')&&String(args[1]).startsWith('FLOW:LINK-USDT:FUTURES'))throw Error('CONTROLLED_LATE_READ');});const r=await collectBitgetFlow(p);assert.equal(r.evidence.length,1);assert.equal(r.components.filter(c=>c.check_completed).length,1);assert.equal(r.network_calls,2);checkConsumer(r,p);}finally{d.sqlite.close();}
});
for(const unknown of [false,true])test(`provider 429 survives failed optional backoff storage; unknown=${unknown}`,async()=>{
 const d=await setup();try{const p=nativeParams(d,'OKX');failedCache(d,key=>key==='SHARED',{unknown});const r=await collectN12NativePublicVenue({...p,fetch_impl:async()=>new Response('{}',{status:429})},'OKX');assert.equal(r.network_calls,1);assert.equal(r.receipts[0].status,'HTTP_429');assert.equal(r.evidence.length,0);noLaterWork(d);}finally{d.sqlite.close();}
});
test('retained PEPE facts after cache failure keep exact IDs through existing manual and approved Telegram renderers',async()=>{
 const d=await setup();try{const p=nativeParams(d,'KUCOIN');failedCache(d,key=>key.startsWith('N12:TRADES:'));const r=await collectN12NativePublicVenue(p,'KUCOIN'),facts=checkConsumer(r,p),c=structuredClone(JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical);
  c.observed_ts=p.now;c.snapshot_id=`S392:${p.contract}:${p.now}`;c.metadata.contract=p.contract;c.metadata.internal_market_context.evidence_v2.evidence=r.evidence;c.metadata.internal_market_context.decision_ts=p.now;c.metadata.supporting_context={facts};c.direction='LONG';c.state='OBSERVE';c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:p.now+600000,next_recheck_ts:p.now+60000,cancel_condition:'price<1'};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c);assert.equal(manual.ok,true);for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){const telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);const audit=auditRenderedBlockResults({canonical:c,manual,telegram});assert.ok(audit.telegram_context_receipts.some(x=>r.evidence.every(row=>x.evidence_ids?.includes(row.evidence_id))));}
 }finally{d.sqlite.close();}
});

test('Bitget observed429 prevents another market transport even if measured backoff storage fails',async()=>{const d=await setup();try{const p=await bitgetParams(d);failedCache(d,key=>key==='SHARED');const r=await collectBitgetFlow({...p,fetch_impl:async()=>new Response('{}',{status:429})});assert.equal(r.network_calls,1);assert.equal(r.evidence.length,0);assert.equal(d.sqlite.prepare('SELECT attempts FROM report2_evidence_source_daily').get().attempts,1);}finally{d.sqlite.close();}});
