import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizeKrakenN12BoundedTradeSample,validateKrakenN12BoundedTradeSample} from '../files/src/kraken-n12-bounded-trade-sample.mjs';
import {FUTURES_ONLY_EXACT_ASSET_BINDINGS} from '../files/src/htx-asset-identity.mjs';
import {exactCapabilityIdentity} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {planPublicVenueRoutes} from '../files/src/external-n05-flow-collector.mjs';
const folder=new URL('../../checkpoints/n05-kraken-algo-xmr-38135993119/',import.meta.url);
const summary=JSON.parse(readFileSync(new URL('batch-summary.json',folder)));
const raw=n=>JSON.parse(gunzipSync(readFileSync(new URL(n,folder)))),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fixture(symbol='ALGO'){
 const component=structuredClone(summary.windows.find(w=>w.symbol===symbol)),catalog=raw('KRAKEN-CURRENT-ASSET-PAIRS.json.gz'),page=raw(`KRAKEN-${symbol}-HISTORY-1.json.gz`),receipt=summary.sources.find(r=>r.name===`KRAKEN-${symbol}-HISTORY-1`);
 return{contract:component.contract,component,now:component.observed_ts,cache:{observed_ts:component.observed_ts,expires_ts:component.window_end_ts+300000,payload:{version:'kraken-native-flow-collector-v1-20261010',observed_ts:component.observed_ts,instrument:Object.values(catalog.result).find(r=>r.altname===symbol+'USDT'),candles:raw(`KRAKEN-${symbol}-NATIVE240.json.gz`),pages:[page]}},trade_receipts:[{url:receipt.url,http_status:receipt.http_status,received_ts:receipt.received_ts,body_sha256:receipt.body_sha256,payload_sha256:hash(page),next_cursor:page.result.last}]};
}
for(const [symbol,count] of [['ALGO',2],['XMR',27]])test(`${symbol} NEW N12 bounded5m context from exact retained native takers`,t=>{
 const x=fixture(symbol),out=normalizeKrakenN12BoundedTradeSample(x);assert.equal(out.status,'CLOSED_BOUNDED_SAMPLE');assert.equal(out.evidence.length,1);
 const r=out.evidence[0];assert.equal(r.valid_recent_rows,count);assert.equal(r.quote,'USDT');assert.equal(r.unit,'USDT');assert.equal(r.whole_window_coverage_proven,false);assert.equal(r.coverage_fraction,0);assert.equal(r.directional_strength,null);assert.equal(r.risk_strength,null);assert.equal(r.score_contribution,0);assert.equal(r.entry_authorized,false);assert.equal(r.independent_venue_count,1);assert.equal(r.first_known_ts,x.cache.observed_ts);assert.equal(r.observed_ts,x.cache.observed_ts);assert.equal(r.window_end,summary.window_end_ts);assert.ok(r.source_ts<r.window_end);assert.equal(validateKrakenN12BoundedTradeSample(r,x.now),true);
 const original=gunzipSync(readFileSync(new URL(`KRAKEN-${symbol}-HISTORY-1.json.gz`,folder)));assert.equal(createHash('sha256').update(original).digest('hex'),r.trade_receipts[0].body_sha256);assert.equal(hash(JSON.parse(original)),r.trade_receipts[0].payload_sha256);
 assert.equal(out.network_calls,0);
 t.diagnostic('KRAKEN_N12_WITNESS '+JSON.stringify({contract:r.htx_contract,source_ts:r.source_ts,observed_ts:r.observed_ts,first_known_ts:r.first_known_ts,valid_recent_rows:r.valid_recent_rows,buy_quote_turnover_usdt:r.buy_quote_turnover_usdt,sell_quote_turnover_usdt:r.sell_quote_turnover_usdt,unit:r.unit,evidence_id:r.evidence_id,raw_hash:r.raw_hash,serialized_bytes:Buffer.byteLength(JSON.stringify(r)),whole_window_coverage_proven:false,score_contribution:0,native_cache_ACK:'NOT_PROVEN',wire_body_sha256:r.trade_receipts[0].body_sha256}));
});
const changes=[
 ['missing mapped receipt',x=>x.trade_receipts=[]],
 ['foreign receipt pair',x=>x.trade_receipts[0].url=x.trade_receipts[0].url.replace('ALGOUSDT','XMRUSDT')],
 ['wrong first pagination cursor',x=>x.trade_receipts[0].url=x.trade_receipts[0].url.replace('1791703979999999999','1791703980000000000')],
 ['missing raw wire hash',x=>x.trade_receipts[0].body_sha256=null],
 ['wrong parsed page digest',x=>x.trade_receipts[0].payload_sha256='0'.repeat(64)],
 ['foreign cursor',x=>x.trade_receipts[0].next_cursor='0'],
 ['future receipt clock',x=>x.trade_receipts[0].received_ts=x.now+1],
 ['refreshing old cache clock',x=>x.cache.observed_ts+=1],
 ['foreign identity',x=>x.component.identity.native_asset_id='bitcoin:mainnet'],
 ['wrong quote',x=>x.component.quote='USD'],
 ['missing raw native grid',x=>x.cache.payload.candles=null],
 ['altered native OHLC',x=>{const r=x.cache.payload.candles.result.ALGOUSDT.find(r=>r[7]>0);r[2]='99';}],
 ['duplicate raw trade',x=>x.cache.payload.pages[0].result.ALGOUSDT.push(x.cache.payload.pages[0].result.ALGOUSDT[0])],
 ['expired unrefreshed5m fact',x=>x.now+=60000]
];
for(const [label,change] of changes)test(`new Kraken N12 chain refuses ${label}`,()=>{const x=fixture();change(x);assert.equal(normalizeKrakenN12BoundedTradeSample(x).evidence.length,0);});
test('stored N12 fact rejects tampered source clock, selected trades, sum, proof, score and lineage',()=>{
 const x=fixture('XMR'),r=normalizeKrakenN12BoundedTradeSample(x).evidence[0];
 for(const change of [v=>v.value+=1,v=>v.source_ts+=1,v=>v.first_known_ts+=1,v=>v.raw_recent_trades[0][3]=v.raw_recent_trades[0][3]==='b'?'s':'b',v=>v.raw_hash='0'.repeat(64),v=>v.whole_window_coverage_proven=true,v=>v.score_contribution=1,v=>v.coverage_fraction=1,v=>v.directional_strength=1,v=>v.entry_authorized=true,v=>v.independent_venue_count=2,v=>v.source_cache_binding.asset_key='NATIVE_FLOW:BTC-USDT:'+r.window_end]){const q=structuredClone(r);change(q);assert.equal(validateKrakenN12BoundedTradeSample(q,x.now),false);}
 assert.equal(validateKrakenN12BoundedTradeSample(r,r.expires_at),false);
});
test('last native in-progress minute is never appended to the bounded closed sample',()=>{
 const x=fixture('XMR'),p=x.cache.payload.pages[0].result.XMRUSDT;assert.ok(p.some(r=>r[2]*1000>=x.component.window_end_ts));
 const r=normalizeKrakenN12BoundedTradeSample(x).evidence[0];assert.ok(r.raw_recent_trades.every(t=>t[2]*1000<r.window_end));assert.equal(r.valid_recent_rows,27);
});
test('PAXG saved exact versioned identity exposes route reachability, without proving call or broad owner authorization',()=>{
 const binding=FUTURES_ONLY_EXACT_ASSET_BINDINGS.PAXG,params={contract:'PAXG-USDT',asset_identity:binding.identity,identity_method:binding.method};assert.ok(exactCapabilityIdentity(params));
 const names=planPublicVenueRoutes(params).routes.map(r=>r[0]);assert.ok(names.includes('GATE'));assert.ok(names.includes('BACKPACK'));assert.ok(names.includes('BITGET'));assert.ok(names.includes('GATE_FUTURES_N12'));
 const contract=JSON.parse(readFileSync(new URL('../../checkpoints/N15_FREE_HOURLY_HISTORY_DEPLOYMENT_20261012.json',import.meta.url)));assert.ok(contract.owner_scope.includes('hourly historical statistics'));assert.ok(contract.source_checks.htx_spot_missing.includes('PAXG'));
});
