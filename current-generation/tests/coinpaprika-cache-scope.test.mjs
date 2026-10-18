import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const moduleURL=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {COINPAPRIKA_SECTOR_VERSION,collectCoinpaprikaSectorEvidence}=await import(moduleURL('coinpaprika-sector-evidence.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(moduleURL('evidence-source-store.mjs'));
const {consumeSectorContext}=await import(moduleURL('sector-context.mjs'));
const {formatManualReport}=await import(moduleURL('manual-report-formatter.mjs'));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(moduleURL('canonical-publication.mjs'));
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/actual-ZEC-role-handoff-0931.json.gz',import.meta.url))));
const canonical=original.canonical,now=canonical.observed_ts,context=canonical.metadata.internal_market_context;
const source=context.evidence_v2.sources.COINPAPRIKA_SECTOR,identity=context.candidate_context.asset_identity,row=source.evidence.find(r=>r.block_id==='N15');
function database(){const sqlite=new DatabaseSync(':memory:');let unknown=0;const log=[];return{sqlite,log,usageSnapshot:()=>({unknown_ops:unknown}),markUnknown:()=>unknown=1,prepare(sql){return{args:[],bind(...args){this.args=args;return this;},async first(){log.push(sql);return sqlite.prepare(sql).get(...this.args)||null;},async all(){log.push(sql);return{results:sqlite.prepare(sql).all(...this.args)};},async run(){log.push(sql);return sqlite.prepare(sql).run(...this.args);}};},async batch(rows){const out=[];for(const row of rows)out.push(await row.run());return out;}};}
async function setup(mutate=r=>r,extra={}){
 const d=database();await installEvidenceSourceStore(d);
 const cached=mutate({...structuredClone(source),version:COINPAPRIKA_SECTOR_VERSION,network_calls:0});
 await writeEvidenceSourceCache(d,{source:'COINPAPRIKA_SECTOR',asset_key:'ZEC-USDT:PROVIDER_MARKET_REFERENCE:DISCOVERY:',observed_ts:now-1000,expires_ts:now+60000,payload:cached});
 let grants=0,calls=0;const params={db:d,contract:'ZEC-USDT',asset_identity:identity,asset_metadata:{},run_id:'CP_CACHE_SCOPE',now,request_admit:()=>{grants++;return{allowed:false,status:'CONTROLLED_CALLER_DENIED'};},fetch_impl:async()=>{calls++;throw Error('LIVE_SOURCE_FORBIDDEN');},...extra};
 return{d,params,cached,counts:()=>({grants,calls})};
}
const fact=result=>result.evidence.find(r=>r.block_id==='N15');
test('retained exact ZEC provider fact preserves original clocks and N15 consumer, excluding the paused N02 row',async()=>{
 const {d,params,counts}=await setup();try{const r=await collectCoinpaprikaSectorEvidence(params);assert.equal(r.status,'CLOSED');assert.equal(r.network_calls,0);assert.deepEqual(r.evidence,[row]);assert.deepEqual(counts(),{grants:0,calls:0});const c=consumeSectorContext({evidence:r.evidence,contract:params.contract,asset_identity:identity,now});assert.equal(c.status,'CLOSED');assert.equal(c.facts[0].source_ts,row.source_ts);assert.equal(c.score_contribution,0);assert.equal(c.directional_vote,false);}finally{d.sqlite.close();}
});
const mutations={
 'foreign HTX contract':r=>{fact(r).htx_contract='FIL-USDT';return r;},
 'foreign asset id':r=>{fact(r).asset_id='provider:coinpaprika:fil-filecoin';return r;},
 'foreign provider':r=>{fact(r).provider_id='COINGECKO_SECTOR';return r;},
 'foreign upstream':r=>{fact(r).upstream_id='OTHER_AGGREGATOR';return r;},
 'future source clock':r=>{fact(r).source_ts=now+1;return r;},
 'future observed clock':r=>{fact(r).observed_ts=now+1;return r;},
 'future knowledge clock':r=>{fact(r).first_known_ts=now+1;return r;},
 'expired original despite live cache envelope':r=>{fact(r).expires_at=now-1;return r;},
 'extended source TTL':r=>{fact(r).expires_at=fact(r).observed_ts+300001;return r;},
 'stale source despite extended cache envelope':r=>{fact(r).source_ts=now-900001;return r;},
 'future peer clock':r=>{fact(r).peers[0].source_ts=now+1;return r;},
 'future target clock':r=>{fact(r).target_source_ts=now+1;return r;},
 'future provider reference':r=>{fact(r).provider_reference.reference_observed_ts=now+1;return r;},
 'wrong reference coin':r=>{fact(r).coin_id='fil-filecoin';return r;},
 'empty CLOSED result':r=>({...r,evidence:[]}),
 'malformed evidence container':r=>({...r,evidence:{}}),
};
for(const [name,mutate] of Object.entries(mutations))test(`CoinPaprika rejects ${name} cache and attempts only the normally admitted fallback`,async()=>{
 const {d,params,counts}=await setup(mutate);try{const r=await collectCoinpaprikaSectorEvidence(params);assert.equal(r.evidence.length,0);assert.notEqual(r.status,'CLOSED');assert.deepEqual(counts(),{grants:1,calls:0});assert.equal(d.sqlite.prepare('SELECT count(*) AS n FROM report2_evidence_source_reservation').get().n,0);}finally{d.sqlite.close();}
});
test('retained paused-only CLOSED cache stays an explicit negative capability without a new provider attempt',async()=>{
 const {d,params,counts}=await setup(r=>({...r,evidence:r.evidence.filter(row=>row.block_id==='N02')}));try{const r=await collectCoinpaprikaSectorEvidence(params);assert.equal(r.evidence.length,0);assert.notEqual(r.status,'CLOSED');assert.equal(r.supply_status,'BLOCK_PAUSED_BY_OWNER');assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
test('an exact negative capability result remains cached without an unneeded new provider attempt',async()=>{
 const {d,params,counts}=await setup(r=>({...r,status:'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA',evidence:[],sector_status:'NOT_CHECKED'}));try{const r=await collectCoinpaprikaSectorEvidence(params);assert.equal(r.status,'NO_EXACT_HTX_SPOT_MARKET_IN_COINPAPRIKA');assert.equal(r.evidence.length,0);assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
test('one valid original survives beside a rejected cache row without HTTP or renewed source clocks',async()=>{
 const {d,params,counts}=await setup(r=>{r.evidence.push({...structuredClone(row),asset_id:'foreign'});return r;});try{const r=await collectCoinpaprikaSectorEvidence(params);assert.deepEqual(r.evidence,[row]);assert.equal(r.status,'CLOSED');assert.deepEqual(counts(),{grants:0,calls:0});}finally{d.sqlite.close();}
});
test('unknown native cache read cost stops every subsequent SQL and transport without erasing unknown',async()=>{
 const {d,params,counts}=await setup(mutations['foreign HTX contract']);try{const old=d.prepare;d.prepare=function(sql){const prepared=old.call(d,sql),first=prepared.first;prepared.first=async function(){const r=await first.call(this);if(sql.startsWith('SELECT observed_ts'))d.markUnknown();return r;};return prepared;};const r=await collectCoinpaprikaSectorEvidence(params);assert.equal(r.status,'ADMISSION_LEDGER_UNAVAILABLE_NATIVE_USAGE');assert.equal(r.evidence.length,0);assert.deepEqual(counts(),{grants:0,calls:0});assert.ok(d.log.at(-1).startsWith('SELECT observed_ts'));assert.equal(d.usageSnapshot().unknown_ops,1);}finally{d.sqlite.close();}
});
test('exact retained ZEC fact still reaches the existing manual and V5 renderer with its historical ID',async()=>{
 const {d,params}=await setup();try{const r=await collectCoinpaprikaSectorEvidence(params),facts=consumeSectorContext({evidence:r.evidence,contract:params.contract,asset_identity:identity,now}).facts,c=structuredClone(canonical);
  c.metadata.internal_market_context.evidence_v2.evidence=r.evidence;c.metadata.internal_market_context.sector_context={facts};c.metadata.supporting_context={facts};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c),telegram=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});assert.equal(manual.ok,true);assert.equal(telegram.ok,true);assert.ok(facts.some(f=>f.evidence_id===row.evidence_id));assert.match(manual.text,/Mining/);assert.match(telegram.text,/Mining/);
 }finally{d.sqlite.close();}
});
