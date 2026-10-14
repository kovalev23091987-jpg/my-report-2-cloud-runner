import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {scoreDiscoveryCandidate} from '../../current-generation/files/src/discovery-candidate-score.mjs';
const base=new URL('../../checkpoints/htx-funding-clock-raw-qualification-20261014/',import.meta.url);
function original(file,hash){const bytes=fs.readFileSync(new URL(file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);return JSON.parse(bytes);}
const funding=original('funding-batch-original.json','c9af6bfc3760fc46d91efac7987e32b865e2c44cdf35df38f5ed5ce7a7769f8c');
const metadata=original('contract-metadata-original.json','2865a02dfcd694aaec3b56efa3705d2b2eee10e614db346bc71fd33c18bab795');
const manifest=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../checkpoints/htx-approved-crypto-futures-universe-20261012.json.gz',import.meta.url))));
const tail=fs.readFileSync(new URL('./injected-worker-tail.js',import.meta.url),'utf8');
const collect=Function('worker_default',tail+'\nreturn __report2PublicCollectorIntervalHours;')({});
const worker=fs.readFileSync(new URL('../../current-generation/files/src/worker.js',import.meta.url),'utf8'),start=worker.indexOf('function fundingIntervalHoursFromRaw('),end=worker.indexOf('\nfunction stageState(',start);
assert(start>=0&&end>start);
const number=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const stamp=v=>{const n=number(v);return n===null?null:n<1e12?Math.trunc(n*1000):Math.trunc(n);};
const deep=Function('num','normalizeTs',worker.slice(start,end)+'\nreturn fundingIntervalHoursFromRaw;')(number,stamp);
const fm=new Map(funding.data.map(r=>[r.contract_code,r])),im=new Map(metadata.data.map(r=>[r.contract_code,r]));
const decision=(rate,period)=>scoreDiscoveryCandidate({core_liquidity:true,non_funding_anomaly_count:3,directional_market_route:true,oi_building:true,momentum_confirmed:true,relative_strength_confirmed:true,funding_rate_pct:rate,funding_interval_hours:period,long_watch:rate<0,short_watch:rate>0,fresh:true});

test('two original HTX responses supply the same actual payment period to collector and deep path for105 assets',()=>{
 assert.equal(manifest.assets.length,105);const counts={};
 for(const asset of manifest.assets){const code=asset.asset_analysis_contract,f=fm.get(code),i=im.get(code);assert(f&&i,code);assert.equal(f.next_funding_time,null);assert.equal(f.funding_time,i.settlement_date);assert.equal(i.business_type,'swap');const period=Number(i.settlement_period);assert.equal(collect(f,i),period,code);assert.deepEqual(deep(f,i),{hours:period,source:'HTX_CONTRACT_SETTLEMENT_PERIOD_HOURS_MATCHED_FUNDING_CLOCK'},code);counts[period]=(counts[period]||0)+1;}
 assert.deepEqual(counts,{1:1,4:63,8:41});
});
test('real current funding rates do not gain a bonus merely because the missing period is repaired',()=>{
 for(const asset of manifest.assets){const f=fm.get(asset.asset_analysis_contract),i=im.get(asset.asset_analysis_contract),period=collect(f,i),score=decision(Number(f.funding_rate)*100,period);assert.equal(score.components.funding_bonus,0,asset.asset_analysis_contract);}
 // The only actual rate above0.1% in this immutable approved105 sample is
 // DOT's eight-hour rate; the agreed four-hour ceiling must still reject it.
 assert(Number(fm.get('DOT-USDT').funding_rate)*100>=.1);assert.equal(collect(fm.get('DOT-USDT'),im.get('DOT-USDT')),8);
});
test('a controlled strong rate on the actual source periods grants15 hourly,10 four-hourly and0 eight-hourly',()=>{
 for(const asset of manifest.assets){const code=asset.asset_analysis_contract,period=collect(fm.get(code),im.get(code)),expected=period===1?15:period===4?10:0;assert.equal(decision(-.1,period).components.funding_bonus,expected,code);assert.equal(decision(.1,period).components.funding_bonus,expected,code);}
});
test('foreign contract, delivery metadata, unconfirmed clock, zero or unsupported period never manufacture eligibility',()=>{
 const f=fm.get('STRK-USDT'),i=im.get('STRK-USDT');
 for(const changed of [{...i,contract_code:'OTHER-USDT'},{...i,business_type:'futures'},{...i,contract_status:0},{...i,settlement_date:String(Number(i.settlement_date)+3600000)},{...i,settlement_period:'0'},{...i,settlement_period:'48'},{...i,settlement_period:'unknown'}]){assert.equal(collect(f,changed),null);assert.equal(deep(f,changed).hours,null);}
 assert.equal(collect({...f,funding_time:'0'},{...i,settlement_date:'0'}),null);
 assert.equal(deep({...f,funding_time:'0'},{...i,settlement_date:'0'}).hours,null);
 assert.equal(collect(f,{}),null);assert.equal(deep(f,{}).hours,null);
});
test('warmed same-venue normalized metadata retains the previously verified period without another provider call',()=>{
 for(const code of ['STRK-USDT','OP-USDT','FARTCOIN-USDT']){const f=fm.get(code),period=collect(f,im.get(code));assert.equal(collect(f,{contract:code,catalog_active:true,funding_interval_hours:period}),period);}
});
test('a valid native current/next payout clock remains authoritative over the new metadata fallback',()=>{
 const f=fm.get('OP-USDT'),i=im.get('OP-USDT'),hourly={...f,next_funding_time:String(Number(f.funding_time)+3600000)};
 assert.equal(collect(hourly,{...i,funding_interval_hours:8}),1);assert.deepEqual(deep(hourly,{...i,funding_interval_hours:8}),{hours:1,source:'funding_timestamps'});
});
