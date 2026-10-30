// UNEXECUTED source component. Invoke once inside the coordinator's new common
// case, sequentially: it temporarily controls Date.now and restores it finally.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash=s=>createHash('sha256').update(s).digest('hex');
const ADDRESS='0x6982508145454ce325ddbe47a25d4ec3d2311933';
const CATEGORY='https://api.coingecko.com/api/v3/coins/categories/list';
const T=Date.UTC(2026,9,20,12,0,0);
const metadata={id:'pepe',symbol:'pepe',platforms:{ethereum:ADDRESS},categories:['Meme Token']};
const categories=[{category_id:'meme-token',name:'Meme Token'}];
const markets=[{pair:'PEPE/USDT',quote_currency_id:'usdt-tether',category:'spot',market_url:'https://www.htx.com/trade/pepe_usdt',base_currency_id:'pepe-pepe'}];
const cpMetadata={id:'pepe-pepe',symbol:'PEPE',is_active:true,type:'token',contracts:[{platform:'eth-ethereum',contract:ADDRESS}]};
const quote=(id,symbol,ts,change)=>({id,symbol,last_updated:new Date(ts).toISOString(),current_price:1,total_volume:200000,price_change_percentage_24h:change});
const quotes=ts=>[quote('pepe','pepe',ts,4),quote('peer-one','P1',ts,1),quote('peer-two','P2',ts,2),quote('peer-three','P3',ts,3)];

// Actual SQLite executes the unchanged production SQL. These local statement
// logs/counters are CONTROLLED, never native D1 billing or account headroom.
class LocalD1 {
 constructor(){this.sqlite=new DatabaseSync(':memory:');this.log=[];this.unknown=0;}
 prepare(sql){
  const db=this;
  const bound=params=>({
   bind:(...xs)=>bound(xs),
   run(){db.log.push({op:'run',sql,params:[...params],at:Date.now()});const r=db.sqlite.prepare(sql).run(...params);return{success:true,meta:{changes:Number(r.changes)}};},
   first(){db.log.push({op:'first',sql,params:[...params],at:Date.now()});return db.sqlite.prepare(sql).get(...params)??null;},
   all(){db.log.push({op:'all',sql,params:[...params],at:Date.now()});return{success:true,results:db.sqlite.prepare(sql).all(...params)};}
  });return bound([]);
 }
 batch(statements){this.sqlite.exec('BEGIN');try{const rows=statements.map(s=>s.run());this.sqlite.exec('COMMIT');return rows;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 usageSnapshot(){return{unknown_ops:this.unknown,requests:this.log.length,rows_read:0,rows_written:0};}
 daily(source,at,attempts){this.sqlite.prepare('INSERT INTO report2_evidence_source_daily(source,day_utc,attempts,last_reservation_id,updated_at) VALUES(?,?,?,NULL,?) ON CONFLICT(source,day_utc) DO UPDATE SET attempts=excluded.attempts,updated_at=excluded.updated_at').run(source,new Date(at).toISOString().slice(0,10),attempts,at);}
 minute(provider,at,units,label){this.sqlite.prepare('INSERT INTO report2_provider_minute_ledger_v1(provider,minute_bucket,reservation_id,units,created_ts) VALUES(?,?,?,?,?)').run(provider,Math.floor(at/60000)*60000,label,units,at);}
 reference(source,url,payload,received,expires,version){const body=JSON.stringify(payload),key=`REFERENCE:${version}:${hash(url)}`;this.sqlite.prepare('INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?,?,?,?,?) ON CONFLICT(source,asset_key) DO UPDATE SET observed_ts=excluded.observed_ts,expires_ts=excluded.expires_ts,payload_json=excluded.payload_json').run(source,key,received,expires,JSON.stringify({version,url,received_ts:received,expires_ts:expires,body_sha256:hash(body),body}));}
 close(){this.sqlite.close();}
}
async function modules(root){
 // Both roots point to the actual assembled src directories.
 const get=name=>import(pathToFileURL(resolve(root,name)).href);
 const [cg,identity,reference,store,minute,policy,http]=await Promise.all([get('coingecko-sector-evidence.mjs'),get('coinpaprika-htx-identity.mjs'),get('provider-reference-cache.mjs'),get('evidence-source-store.mjs'),get('provider-minute-ledger.mjs'),get('evidence-source-adapters.mjs'),get('unified-budget.mjs')]);
 return{cg,identity,reference,store,minute,policy,http};
}
const cgParams={contract:'PEPE-USDT',asset_identity:{chain:'ethereum',contract_or_mint:ADDRESS},asset_metadata:{coingecko_id:'pepe',coingecko_category_id:'meme-token',coingecko_category_name:'Meme Token'}};

async function collect(m,{kind='cg',start=T,advance=0,event=null,strict=false,demo=false,denyWhole=false,nativeUnknown=false,initialDay=null}={}){
 const db=new LocalD1();let clock=start,calls=0;
 await m.store.installEvidenceSourceStore(db);await m.minute.installProviderMinuteLedger(db);
 const source=kind==='cg'?'COINGECKO_SECTOR':'COINPAPRIKA_HTX_IDENTITY';
 const provider=kind==='cg'?'COINGECKO':'COINPAPRIKA_IDENTITY';
 const access=kind==='cg'?m.cg.coingeckoAccessPolicy(demo?'CONTROLLED_DEMO_KEY':null,{strict_fresh_manual:strict}):m.policy.SOURCE_POLICIES[source];
 if(initialDay!==null)db.daily(source,start,initialDay);
 if(nativeUnknown)db.unknown=1;
 const before=db.log.length,wire=[],grants=[],cuts=[];
 const budget=m.http.createUnifiedHttpBudget({whole_job:164,hot:96,background:56,statistics:12});
 const admit=q=>{const result=denyWhole?{allowed:false,status:'CONTROLLED_WHOLE_DENIAL'}:budget.reserve(q);grants.push({at:clock,request:q,result});return result;};
 const fetch_impl=async url=>{
  calls++;wire.push({url:String(url),at:clock});
  if(calls===1){clock+=advance;
   // The concurrent caller consumes only the genuinely remaining capacity:
   // eight of CG's nine, or one of identity's two, beside our first unit.
   if(event==='minute')db.minute(provider,clock,kind==='cg'?8:1,'CONTROLLED_CONCURRENT_OTHER_CALLER');
   if(event==='late-cache')db.reference(source,CATEGORY,categories,clock-1,clock+3600000,m.reference.PROVIDER_REFERENCE_CACHE_VERSION);
   if(event==='expired-cache')db.reference(source,CATEGORY,categories,start-100,start+5,m.reference.PROVIDER_REFERENCE_CACHE_VERSION);
  }
  const u=new URL(String(url));
  const body=kind==='identity'?(u.pathname.endsWith('/markets')?markets:cpMetadata):u.pathname.endsWith('/categories/list')?categories:u.pathname.endsWith('/markets')?quotes(clock-1000):metadata;
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 };
 const prior=Date.now;Date.now=()=>clock;
 try{
  const params={db,fetch_impl,request_admit:admit,provider_budget_observe:e=>cuts.push(e),run_id:`CONTROLLED:${kind}:${start}:${advance}:${event}:${strict}:${demo}`,now:start};
  const result=kind==='identity'?await m.identity.collectCoinpaprikaHtxIdentity({...params,contract:'PEPE-USDT'}):await m.cg.collectCoingeckoSectorEvidence({...params,...cgParams,strict_fresh_manual:strict,coingecko_demo_api_key:demo?'CONTROLLED_DEMO_KEY':null});
  return{result,wire,grants,cuts,afterClock:clock,source,access,log:db.log.slice(before),daily:db.sqlite.prepare('SELECT source,day_utc,attempts FROM report2_evidence_source_daily ORDER BY day_utc').all(),reservations:db.sqlite.prepare('SELECT source,day_utc,attempts,created_at FROM report2_evidence_source_reservation ORDER BY created_at,reservation_id').all(),minute:db.sqlite.prepare('SELECT provider,units,created_ts FROM report2_provider_minute_ledger_v1 ORDER BY created_ts').all()};
 }finally{Date.now=prior;db.close();}
}
function lateCalls(x,start){return x.wire.filter(r=>r.at>start).length;}
function categoryHTTP(x){return x.wire.filter(r=>r.url===CATEGORY).length;}

// No test registration, no invocation at import, no live fetch/DB capability.
export async function runProviderAdmissionClockConnected({runtime_root,baseline_runtime_root,repo_root}={}){
 assert.ok(runtime_root&&baseline_runtime_root&&repo_root,'Two exact assembled src roots and repository root required');
 const pins=JSON.parse(await readFile(resolve(repo_root,'checkpoints/source-worker-provider-admission-clock-20261020/target-bindings.json'),'utf8'));
 for(const target of pins.targets){
  const name=target.path.split('/').at(-1);
  assert.equal(hash(await readFile(resolve(baseline_runtime_root,name))),target.before_sha256,'Actual baseline module hash');
  assert.equal(hash(await readFile(resolve(runtime_root,name))),target.after_sha256,'Actual candidate module hash');
 }
 for(const pin of pins.unchanged_dependencies){
  const name=pin.path.split('/').at(-1);
  assert.equal(hash(await readFile(resolve(runtime_root,name))),pin.sha256);
  assert.equal(hash(await readFile(resolve(baseline_runtime_root,name))),pin.sha256);
 }
 const baseline=await modules(baseline_runtime_root),candidate=await modules(runtime_root),controls=[];
 const check=(label,fn)=>{fn();controls.push(label);};
 const dayStart=Date.UTC(2026,9,20,23,59,59,900);
 for(const kind of ['cg','identity']){
  for(const [name,start,event] of [['utc-day',dayStart,null],['rolling60',T+59900,'minute'],['utc-month',Date.UTC(2026,9,31,23,59,59,900),null]]){
   const opts={kind,start,advance:200,event},before=await collect(baseline,opts),after=await collect(candidate,opts);
   check(`${kind}:${name}:baseline-witness`,()=>assert.ok(lateCalls(before,start)>0,'Baseline must really reach a late controlled transport'));
   if(event==='minute'){
    check(`${kind}:${name}:candidate-denies-late`,()=>{assert.equal(after.wire.length,1);assert.equal(lateCalls(after,start),0);assert.equal(after.result.admission.allowed,false);});
    check(`${kind}:${name}:no-new-reservation-after-denial`,()=>assert.equal(after.reservations.length,1));
   }else{
    const oldDay=new Date(start).toISOString().slice(0,10),newDay=new Date(start+200).toISOString().slice(0,10);
    check(`${kind}:${name}:actual-day-attribution`,()=>{assert.notEqual(oldDay,newDay);assert.ok(before.reservations.every(r=>r.day_utc===oldDay));assert.equal(after.reservations.filter(r=>r.day_utc===oldDay).length,1);assert.equal(after.reservations.filter(r=>r.day_utc===newDay).length,after.reservations.length-1);assert.ok(after.reservations.length>1);});
    check(`${kind}:${name}:no-reset-or-extra-transport`,()=>{assert.equal(after.wire.length,before.wire.length);assert.ok(lateCalls(after,start)>0);});
   }
   if(kind==='cg')check(`${kind}:${name}:existing-observer-current-read-clock`,()=>{assert.ok(after.cuts.some(c=>c.query_window_end_ts===start+200&&c.phase==='DAY_PREFLIGHT_ROW'));assert.ok(before.cuts.every(c=>c.query_window_end_ts===start));});
  }
 }
 for(const [event,oldCalls,newCalls] of [['late-cache',1,0],['expired-cache',0,1]]){
  const opts={event,start:T,advance:200,demo:true},before=await collect(baseline,opts),after=await collect(candidate,opts);
  check(`cg:${event}:real-cache-clock`,()=>{assert.equal(categoryHTTP(before),oldCalls);assert.equal(categoryHTTP(after),newCalls);});
  check(`cg:${event}:original-facts-retained`,()=>{assert.equal(before.result.status,'CLOSED');assert.equal(after.result.status,'CLOSED');assert.deepEqual(after.result.evidence,before.result.evidence);});
 }
 const stableBefore=await collect(baseline,{demo:true}),stableAfter=await collect(candidate,{demo:true});
 check('cg:unchanged-stable-output',()=>assert.deepEqual(stableAfter.result,stableBefore.result));
 check('cg:source-clock-from-response',()=>{const e=stableAfter.result.evidence[0];assert.equal(e.observed_ts,T);assert.equal(e.source_ts,T-1000);assert.equal(e.first_known_ts,T);});
 for(const [label,opts] of [['whole-denied',{denyWhole:true}],['native-unknown',{nativeUnknown:true}],['ordinary-manual-reserve',{demo:true,initialDay:224}]]){
  const after=await collect(candidate,opts);
  check(`cg:${label}:no-transport`,()=>assert.equal(after.wire.length,0));
  check(`cg:${label}:no-durable-attempt`,()=>assert.equal(after.reservations.length,0));
  if(label==='native-unknown')check('cg:native-unknown:no-source-query',()=>assert.equal(after.log.length,0));
 }
 const manual=await collect(candidate,{demo:true,strict:true,initialDay:224});
 check('cg:manual-protected-cap-unchanged',()=>{assert.equal(manual.access.daily_cap,256);assert.equal(manual.result.status,'CLOSED');assert.ok(manual.wire.length>0);assert.ok(manual.daily.every(x=>x.attempts<=256));});

 // Existing explicit-live CP/Gate reader configuration, plus second reader:
 // cache keeps the first original receipt and costs no second reservation.
 const db=new LocalD1();await candidate.store.installEvidenceSourceStore(db);let clock=T,fetches=0;
 const prior=Date.now;Date.now=()=>clock;
 try{
  const common={db,source:'COINPAPRIKA_SECTOR',run_id:'CONTROLLED:SECOND_FINALIST',now:T,clock:()=>clock,daily_cap:512,request_admit:()=>({allowed:true,duplicate:false}),fetch_impl:async()=>{fetches++;return new Response('[{"id":"original"}]',{status:200});}};
  const first=candidate.reference.createProviderReferenceReader(common),url='https://api.coinpaprika.com/v1/tickers?quotes=USD';
  const a=await first.get('FREE_AGGREGATED_QUOTES',url,{ttl_ms:60000,same_run_batch:true});clock+=500;
  const second=candidate.reference.createProviderReferenceReader({...common,now:clock}),b=await second.get('FREE_AGGREGATED_QUOTES',url,{ttl_ms:60000,same_run_batch:true});
  check('cp:second-finalist-memory-no-new-http',()=>{assert.equal(fetches,1);assert.deepEqual(b,a);assert.equal(second.summary().network_calls,0);assert.equal(second.summary().receipts[0].received_ts,T);assert.equal(second.summary().receipts[0].actual_http,0);});
 }finally{Date.now=prior;db.close();}
 return{status:'CLOSED',controls,control_count:controls.length,scope:'CONTROLLED_ACTUAL_MODULES_AND_LOCAL_SQLITE_NOT_NATIVE_BILLING',source_fact_clocks_preserved:true,clock_limit:'Live readTs is sampled at get entry; later SQL/transport latency can cross another boundary and is not qualified by this callsite fix.',provider_HTTP:0,native_SQL:0,Telegram:0,admission_authorized:false,native_quota_overrun_proven:false};
}
