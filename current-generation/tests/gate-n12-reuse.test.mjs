import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {actual,controlled,reconciledCandles,candles,end,method} from './gate-n12-saved-inputs.mjs';
const modulePath=n=>process.env.REPORT2_TEST_RUNTIME?pathToFileURL(`${process.env.REPORT2_TEST_RUNTIME}/src/${n}`):new URL(`../files/src/${n}`,import.meta.url);
const {collectGateFlow}=await import(modulePath('gate-flow-collector.mjs'));
const {installEvidenceSourceStore,writeEvidenceSourceCache}=await import(modulePath('evidence-source-store.mjs'));
const {installProviderMinuteLedger}=await import(modulePath('provider-minute-ledger.mjs'));
function database(){const sqlite=new DatabaseSync(':memory:');let unknown=0,hook=()=>{};const log=[];return{sqlite,log,hook:f=>hook=f,markUnknown:()=>unknown=1,usageSnapshot:()=>({unknown_ops:unknown}),prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){log.push(sql);hook(sql,this.args);return sqlite.prepare(sql).run(...this.args);},async first(){log.push(sql);return sqlite.prepare(sql).get(...this.args)||null;}};},async batch(rows){const out=[];for(const r of rows)out.push(await r.run());return out;}};}
async function setup(p,{full=false}={}){
 const db=database();await installEvidenceSourceStore(db);await installProviderMinuteLedger(db);let clock=p.observed_ts,calls=0,grants=0;
 const options={db,contract:p.contract,asset_identity:p.identity,identity_method:method,run_id:'GATE_N12_REUSE_CONTROL',now:end+500,clock:()=>clock,source_health_admit:()=>({allowed:true}),request_admit:()=>{grants++;return{allowed:grants<=5,status:grants<=5?'RESERVED':'CALLER_FIVE_REQUEST_CAP'};},fetch_impl:async u=>{calls++;const data=u.endsWith('/currencies')?p.currencies:u.endsWith('/currency_pairs')?p.spot:u.includes('/candlesticks?')?(full?reconciledCandles(p):p.original_candles):p.pages[0];return new Response(JSON.stringify(data));}};
 return{db,options,setClock:t=>clock=t,counts:()=>({calls,grants})};
}
for(const base of ['PEOPLE','SUSHI'])test(`actual saved ${base} receipt cannot manufacture a fresh N12 sample`,async()=>{
 const s=await setup(actual(base));try{const r=await collectGateFlow(s.options);assert.equal(r.evidence.length,0);assert.equal(s.counts().calls,4);assert.equal(s.counts().grants,4);}finally{s.db.sqlite.close();}
});
test('explicit clock control retains Gate bounded N12 even when N05 minute volumes do not reconcile',async()=>{
 const p=controlled(),s=await setup(p);try{const r=await collectGateFlow(s.options);assert.equal(r.check_completed,false);assert.equal(r.reason,'MINUTE_BASE_AND_QUOTE_VOLUME_NOT_RECONCILED');assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].valid_recent_rows,1);assert.equal(r.evidence[0].observed_ts,p.observed_ts);assert.equal(r.evidence[0].coverage_fraction,0);assert.deepEqual(s.counts(),{calls:4,grants:4});}finally{s.db.sqlite.close();}
});
test('full-N05 controlled cache reuses exact original N12 observation with0newHTTP',async()=>{
 const p=controlled({fast:true}),s=await setup(p,{full:true});try{const a=await collectGateFlow(s.options);assert.equal(a.check_completed,true);assert.equal(a.evidence.length,1);const before=s.counts();s.setClock(p.observed_ts+1000);const b=await collectGateFlow({...s.options,now:p.observed_ts+1000,run_id:'GATE_N12_REUSE_CACHE'});assert.equal(b.check_completed,true);assert.deepEqual(b.evidence,a.evidence);assert.deepEqual(s.counts(),before);}finally{s.db.sqlite.close();}
});
for(const unclosed of [false,true])test(`new Gate N12 fact survives late optional full-cache write failure unknown=${unclosed}`,async()=>{
 const p=controlled({fast:true}),s=await setup(p,{full:true});s.db.hook((sql,args)=>{if(sql.startsWith('INSERT INTO report2_evidence_source_cache')&&String(args[1]).startsWith('TOKEN_FLOW:')){if(unclosed)s.db.markUnknown();throw Error('CONTROLLED_LATE_WRITE_FAILURE');}});
 try{const r=await collectGateFlow(s.options);assert.equal(r.check_completed,true);assert.equal(r.evidence.length,1);assert.equal(r.evidence[0].observed_ts,p.observed_ts);assert.deepEqual(s.counts(),{calls:4,grants:4});assert.equal(s.db.usageSnapshot().unknown_ops,unclosed?1:0);assert.equal(r.cache_write_receipts.at(-1).asset_key,`TOKEN_FLOW:PEOPLE-USDT:${end}`);}finally{s.db.sqlite.close();}
});
test('legacy Gate full-cache without original trade receipts remains N05-only without refetch',async()=>{
 const p=controlled({fast:true}),s=await setup(p,{full:true});try{await writeEvidenceSourceCache(s.db,{source:'N05_OFFICIAL_FLOW:GATE',asset_key:`TOKEN_FLOW:PEOPLE-USDT:${end}`,observed_ts:p.observed_ts,expires_ts:end+300000,payload:{version:'gate-flow-collector-v1-20261010',observed_ts:p.observed_ts,currencies:p.currencies.filter(r=>r.currency==='PEOPLE'),spot:p.spot.filter(r=>r.id==='PEOPLE_USDT'),pages:p.pages,candles:reconciledCandles(p)}});const r=await collectGateFlow({...s.options,now:p.observed_ts+1000});assert.equal(r.check_completed,true);assert.equal(r.evidence.length,0);assert.deepEqual(s.counts(),{calls:0,grants:0});}finally{s.db.sqlite.close();}
});
