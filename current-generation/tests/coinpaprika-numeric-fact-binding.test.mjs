import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
const moduleURL=name=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${name}`):new URL(`../files/src/${name}`,import.meta.url);
const {COINPAPRIKA_SECTOR_VERSION,normalizeCoinpaprikaSector,collectCoinpaprikaSectorEvidence}=await import(moduleURL('coinpaprika-sector-evidence.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(moduleURL('evidence-source-store.mjs'));
const {consumeSectorContext}=await import(moduleURL('sector-context.mjs'));
const {formatManualReport}=await import(moduleURL('manual-report-formatter.mjs'));
const {canonicalFingerprint,renderCanonicalTelegram}=await import(moduleURL('canonical-publication.mjs'));
const original=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/actual-ZEC-role-handoff-0931.json.gz',import.meta.url))));
const canonical=original.canonical,now=canonical.observed_ts,context=canonical.metadata.internal_market_context;
const saved=context.evidence_v2.sources.COINPAPRIKA_SECTOR,row=saved.evidence.find(r=>r.block_id==='N15'),identity=context.candidate_context.asset_identity;
// Only the normalized returns, IDs, category membership and original clocks
// below are retained facts. Price1/volume200000 and raw ticker reconstruction
// are explicit controls, not missing original provider wire bodies.
function reconstructed(){
 const quote=(id,symbol,change,ts)=>({id,symbol,last_updated:new Date(ts).toISOString(),quotes:{USD:{price:1,volume_24h:200000,percent_change_24h:change}}});
 return{metadata:structuredClone(row.provider_reference.metadata),provider_reference:structuredClone(row.provider_reference),tag:structuredClone(row.provider_tag),contract:row.htx_contract,coin_id:row.coin_id,tag_id:row.tag_id,observed_ts:row.observed_ts,tickers:[quote(row.coin_id,'ZEC',row.target_change_24h_pct,row.target_source_ts),...row.peers.map(p=>quote(p.id,p.symbol,p.change_24h_pct,p.source_ts))]};
}
function database(){const sqlite=new DatabaseSync(':memory:');return{sqlite,prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){return sqlite.prepare(sql).run(...this.args);},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){const out=[];for(const row of rows)out.push(await row.run());return out;}};}
async function cached(mutate=r=>r){
 const db=database();await installEvidenceSourceStore(db);
 const payload=mutate({...structuredClone(saved),version:COINPAPRIKA_SECTOR_VERSION,evidence:[structuredClone(row)],network_calls:0});
 await writeEvidenceSourceCache(db,{source:'COINPAPRIKA_SECTOR',asset_key:'ZEC-USDT:PROVIDER_MARKET_REFERENCE:DISCOVERY:',observed_ts:row.observed_ts,expires_ts:row.expires_at,payload});
 let grants=0,calls=0;
 const out=await collectCoinpaprikaSectorEvidence({db,contract:'ZEC-USDT',asset_identity:identity,asset_metadata:{},run_id:'CP_NUMERIC_BINDING',now,request_admit:()=>{grants++;return{allowed:false,status:'CONTROLLED_ADMISSION_DENIED'};},fetch_impl:async()=>{calls++;throw Error('NO_LIVE_SOURCE');}});
 return{db,out,grants,calls};
}
test('saved ZEC returns re-enter normalizer only with explicit reconstructed price/volume controls',()=>{
 const r=normalizeCoinpaprikaSector(reconstructed());assert.equal(r.status,'CLOSED');assert.equal(r.summary.relative_strength_pct_points,row.relative_strength_pct_points);assert.equal(r.summary.eligible_peers,21);assert.equal(r.evidence[0].source_ts,row.source_ts);assert.equal(r.evidence[0].observed_ts,row.observed_ts);assert.equal(consumeSectorContext({evidence:r.evidence,contract:'ZEC-USDT',asset_identity:identity,now}).facts.length,1);
});
const malformed={boolean:true,array:[1],nested_array:[[1]],empty_array:[],object:{},whitespace:'   '};
for(const field of ['price','volume_24h','percent_change_24h'])for(const [name,value] of Object.entries(malformed)){
 test(`raw target ${field} ${name} is not a provider number`,()=>{
  const p=reconstructed();p.tickers[0].quotes.USD[field]=field==='volume_24h'&&Array.isArray(value)&&value.length?[200000]:value;
  assert.equal(normalizeCoinpaprikaSector(p).evidence.length,0);
 });
 test(`raw peer ${field} ${name} is excluded without discarding20 valid saved returns`,()=>{
  const p=reconstructed(),id=p.tickers[1].id;p.tickers[1].quotes.USD[field]=field==='volume_24h'&&Array.isArray(value)&&value.length?[200000]:value;
  const r=normalizeCoinpaprikaSector(p);assert.equal(r.status,'CLOSED');assert.equal(r.summary.eligible_peers,20);assert(!r.evidence[0].peers.some(x=>x.id===id));
 });
}
test('legitimate finite scalar numeric strings retain the exact normalized returns and clocks',()=>{
 const p=reconstructed();for(const t of p.tickers)for(const k of ['price','volume_24h','percent_change_24h'])t.quotes.USD[k]=String(t.quotes.USD[k]);
 const r=normalizeCoinpaprikaSector(p);assert.equal(r.status,'CLOSED');assert.equal(r.summary.relative_strength_pct_points,row.relative_strength_pct_points);assert.equal(r.evidence[0].observed_ts,row.observed_ts);
});
test('finite raw inputs whose comparison overflows cannot emit a nonfinite sector fact',()=>{
 const p=reconstructed();p.tickers[0].quotes.USD.percent_change_24h=1e308;for(const t of p.tickers.slice(1))t.quotes.USD.percent_change_24h=-1e308;
 assert.equal(normalizeCoinpaprikaSector(p).evidence.length,0);
});
const mutations={
 'target boolean':r=>r.target_change_24h_pct=true,
 'target array':r=>r.target_change_24h_pct=[r.target_change_24h_pct],
 'peer numeric string':r=>r.peers[0].change_24h_pct=String(r.peers[0].change_24h_pct),
 'peer array':r=>r.peers[0].change_24h_pct=[r.peers[0].change_24h_pct],
 'median mismatch':r=>r.peer_median_change_24h_pct+=10,
 'delta mismatch':r=>r.relative_strength_pct_points+=10,
 'peer count mismatch':r=>r.eligible_peers--,
 'member count mismatch':r=>r.tag_members=2,
 'peer coverage mismatch':r=>r.peer_coverage_fraction=.9,
 'decision coverage mismatch':r=>r.coverage_fraction=.9,
 'direction strength mismatch':r=>r.directional_strength=-.9,
 'foreign quote':r=>r.quote='USDT',
 'foreign window':r=>r.window='CLOSED_HTX_24H',
 'execution-price flag':r=>r.is_htx_price=true,
 'entry flag':r=>r.entry_eligible=true,
 'null peer':r=>r.peers[0]=null,
 'duplicate peer':r=>r.peers[1]=structuredClone(r.peers[0]),
 'foreign member':r=>r.peers[0].id='outside-tag',
};
for(const [name,mutate]of Object.entries(mutations))test(`cached ${name} cannot suppress normally admitted fallback`,async()=>{
 const r=await cached(payload=>{mutate(payload.evidence[0]);return payload;});try{assert.equal(r.out.evidence.length,0);assert.notEqual(r.out.status,'CLOSED');assert.equal(r.grants,1);assert.equal(r.calls,0);assert.equal(r.db.sqlite.prepare('SELECT COUNT(*) AS n FROM report2_evidence_source_reservation').get().n,0);}finally{r.db.sqlite.close();}
});
test('valid saved cache survives a malformed numeric sibling with0HTTP and original evidence identity',async()=>{
 const r=await cached(p=>{const bad=structuredClone(row);bad.relative_strength_pct_points+=10;p.evidence.unshift(bad);return p;});try{assert.deepEqual(r.out.evidence,[row]);assert.equal(r.grants,0);assert.equal(r.calls,0);}finally{r.db.sqlite.close();}
});
test('exact retained ZEC cache keeps original clocks and reaches manual/V5 while brief omission stays approved',async()=>{
 const r=await cached();try{
  assert.deepEqual(r.out.evidence,[row]);assert.equal(r.grants,0);assert.equal(r.calls,0);
  const sector=consumeSectorContext({evidence:r.out.evidence,contract:'ZEC-USDT',asset_identity:identity,now});assert.equal(sector.facts.length,1);assert.equal(sector.score_contribution,0);
  const c=structuredClone(canonical);c.metadata.internal_market_context.evidence_v2.evidence=r.out.evidence;c.metadata.internal_market_context.sector_context=sector;c.metadata.supporting_context={facts:sector.facts};c.analytical_fingerprint=canonicalFingerprint(c);
  const manual=formatManualReport(c),v5=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),brief=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});
  assert.equal(manual.ok,true);assert.equal(v5.ok,true);assert.equal(brief.ok,true);assert.match(manual.text,/Mining/);assert.match(v5.text,/Mining/);assert.doesNotMatch(brief.text,/Mining/);assert.equal(sector.facts[0].evidence_id,row.evidence_id);assert.equal(sector.facts[0].observed_ts,row.observed_ts);
 }finally{r.db.sqlite.close();}
});
