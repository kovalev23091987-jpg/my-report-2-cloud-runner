import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {normalizeCoingeckoSector,collectCoingeckoSectorEvidence} from '../files/src/coingecko-sector-evidence.mjs';
import {normalizeCoinpaprikaSector,verifyCoinpaprikaIdentity} from '../files/src/coinpaprika-sector-evidence.mjs';
import {consumeSectorContext} from '../files/src/sector-context.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';
import {collectEvidenceRouteBlock} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {installEvidenceSourceStore,reserveEvidenceSourceAttempts} from '../files/src/evidence-source-store.mjs';
import {installProviderMinuteLedger,reserveProviderMinuteUnits} from '../files/src/provider-minute-ledger.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/ready-sector-36745185948.json',import.meta.url)));
const oldNow=fixture.provenance.observed_ts;
const identity={chain:'ethereum',contract_or_mint:'0x514910771af9ca656af840dff83e8264ecf986ca'};
const metadata={coingecko_id:'chainlink',coingecko_category_id:'oracle',coingecko_category_name:'Oracle'};
const params={...fixture.coingecko,identity,contract:'LINK-USDT',coin_id:'chainlink',category_id:'oracle',category_name:'Oracle',observed_ts:oldNow};
function db(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(r=>r.run()));}};}
function readyFetch(now,urls){return async url=>{urls.push(url);let data=url.includes('/categories/list')?params.categories:url.includes('/markets?')?params.quotes.map(r=>({...r,last_updated:new Date(now-60000).toISOString()})):params.metadata;return new Response(JSON.stringify(data));};}
function options(database,now,urls=[]){return{db:database,contract:'LINK-USDT',asset_identity:identity,asset_metadata:metadata,run_id:'sector-test',now,request_admit:()=>({allowed:true}),fetch_impl:readyFetch(now,urls)};}

test('replay ready public LINK sector data through strict evidence and bounded directional weight',()=>{
 const r=normalizeCoingeckoSector(params);assert.equal(r.status,'CLOSED');assert.ok(r.summary.eligible_peers>=3);assert.equal(r.summary.full_sector_coverage,false);
 const context=consumeSectorContext({evidence:r.evidence,contract:'LINK-USDT',asset_identity:identity,now:oldNow});
 assert.equal(context.status,'CLOSED');assert.match(context.facts[0].label,/оракулы/);assert.equal(context.score_contribution,0);const adjustment=consumeEvidenceV2(r.evidence,{base_interest:70,decision_ts:oldNow}).adjustment;assert.ok(adjustment<0&&adjustment>=-.6);
});
test('JUP is resolved by Solana mint, and duplicate DYDX and QUICK representations cannot inflate the basket',()=>{
 const jup={chain:'solana',contract_or_mint:'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'},r=normalizeCoinpaprikaSector({...fixture.coinpaprika,identity:jup,contract:'JUP-USDT',coin_id:'jup-jupiter-exchange-token',tag_id:'exchange',observed_ts:oldNow});
 assert.equal(r.status,'CLOSED');assert.equal(r.summary.eligible_peers,35);assert.ok(r.evidence[0].peers.every(x=>!['DYDX','QUICK'].includes(x.symbol)));
 assert.equal(verifyCoinpaprikaIdentity(fixture.coinpaprika.wrong_metadata,{identity:jup,base:'JUP',coin_id:'jup-jupiter'}),false);
 const used=consumeSectorContext({evidence:r.evidence,contract:'JUP-USDT',asset_identity:jup,now:oldNow});assert.match(used.facts[0].label,/биржевые проекты/);
});
test('wrong asset, ambiguous category, ecosystem category and stale target cannot form sector evidence',()=>{
 for(const delta of [{identity:{...identity,contract_or_mint:'0x'+'1'.repeat(40)}},{metadata:{...params.metadata,symbol:'OTHER'}},{categories:[...params.categories,...params.categories]},{category_name:'Ethereum Ecosystem'},{observed_ts:oldNow+900001}])assert.equal(normalizeCoingeckoSector({...params,...delta}).evidence.length,0);
});
test('consumer rejects altered median, duplicate peers, cross-market or stale cached evidence',()=>{
 const row=normalizeCoingeckoSector(params).evidence[0];
 for(const bad of [{...row,peer_median_change_24h_pct:999},{...row,relative_strength_pct_points:999},{...row,htx_contract:'JUP-USDT'},{...row,asset_id:'ethereum:other'},{...row,sector_proof:null},{...row,peers:[...row.peers.slice(1),row.peers[1]]},{...row,peers:row.peers.map((x,i)=>i===0?{...x,source_ts:oldNow+1}:x)}])assert.equal(consumeSectorContext({evidence:[bad],contract:'LINK-USDT',asset_identity:identity,now:oldNow}).facts.length,0);
 assert.equal(consumeSectorContext({evidence:[null,row],contract:'LINK-USDT',asset_identity:identity,now:oldNow+900001}).facts.length,0);
});
test('pinned and automatic address discovery use at most three calls, then the shared cache',async()=>{
 for(const pinned of [true,false]){const database=db(),now=Date.now(),urls=[],p={...options(database,now,urls),asset_metadata:pinned?metadata:{}};
 const a=await collectCoingeckoSectorEvidence(p),b=await collectCoingeckoSectorEvidence({...p,run_id:'next',now:now+1000});
 assert.equal(a.status,'CLOSED');assert.equal(a.network_calls,3);assert.equal(b.network_calls,0);assert.equal(urls.length,3);assert.equal(urls[0].includes('/contract/'),!pinned);database.sqlite.close();}
});
test('429 with Retry-After creates provider-wide backoff without retrying another coin or host',async()=>{
 const database=db(),now=Date.now();let calls=0;const p={...options(database,now),fetch_impl:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'3600'}});}};
 const a=await collectCoingeckoSectorEvidence(p);assert.equal(a.status,'PROVIDER_RATE_LIMITED');
 const b=await collectCoingeckoSectorEvidence({...p,contract:'OTHER-USDT',asset_metadata:{},run_id:'next',now:now+1000});assert.equal(b.status,'PROVIDER_RATE_LIMITED');assert.equal(b.network_calls,0);assert.ok(b.backoff_until>=now+3600000);assert.equal(calls,1);database.sqlite.close();
});
test('daily and minute exhaustion defer this provider and free the phase slot for the next role',async()=>{
 for(const kind of ['daily','minute']){const database=db(),now=Date.now();await installEvidenceSourceStore(database);
 if(kind==='daily')await reserveEvidenceSourceAttempts(database,{source:'COINGECKO_SECTOR',reservation_id:'full',attempts:48,daily_cap:48,now});
 else{await installProviderMinuteLedger(database);await reserveProviderMinuteUnits(database,{provider:'COINGECKO',reservation_id:'full',units:9,cap:9,now});}
 let fallback=false;const r=await collectEvidenceRouteBlock({routes:[{name:'CG'},{name:'NEXT'}],params:options(database,now),max_requests:3,collectors:{CG:collectCoingeckoSectorEvidence,NEXT:async p=>{const admission=p.request_admit({attempts:1});fallback=admission.allowed;return{status:'NEXT_ROLE',network_calls:0};}}});
 assert.equal(r.network_calls,0);assert.equal(fallback,true);assert.equal(r.results.CG.admission.allowed,false);database.sqlite.close();}
});
