import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// ROOT must authenticate BOTH actual roots and this whole frozen package before
// calling. Every fixture/transport/store reply below is CONTROLLED, never native.
export async function runBitgetKnownMetadataCacheFallbackConnected({repo_root,baseline_repo_root}={}){
 const result={schema:'BITGET_KNOWN_METADATA_CACHE_FALLBACK_CONNECTED_RESULT_V1',environment:'CONTROLLED_PUBLIC_PRODUCER_CALLER_CACHE_CONSUMER',completed_groups:0,completed_variants:[],returned_frames:[],native_provider_SQL_IO:0};
 const originalFetch=globalThis.fetch;let temp;
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const bytes=p=>{assert(lstatSync(p).isFile()&&!lstatSync(p).isSymbolicLink(),'REGULAR_FILE_REQUIRED:'+p);return readFileSync(p);};
 const group='ONE_NEW_BITGET_KNOWN_FUTURES_METADATA_CACHE_FALLBACK';
 try{
  assert(repo_root&&baseline_repo_root&&resolve(repo_root)!==resolve(baseline_repo_root),'DISTINCT_ROOT_AUTHENTICATED_BASELINE_AND_CANDIDATE_REQUIRED');
  const own=dirname(fileURLToPath(import.meta.url)),bindingBytes=bytes(join(own,'input-binding.json'));
  assert.equal(hash(bindingBytes),'4d3e11818e92207c7772bf8d6e1a5fec56977cbf3330ed63f58ca613ccd68d9c','FROZEN_INPUT_BINDING');
  const binding=JSON.parse(bindingBytes),manifest=JSON.parse(bytes(join(own,'manifest.json')));
  assert.equal(manifest.schema,'BITGET_METADATA_CACHE_FALLBACK_MANIFEST_V1');
  for(const [name,pin]of Object.entries(manifest.files)){
   assert(!name.includes('/')&&!name.includes('..'),'OWN_MANIFEST_SCOPE');const b=bytes(join(own,name));assert.equal(b.length,pin.bytes);assert.equal(hash(b),pin.sha256);
  }
  const roots=[resolve(baseline_repo_root),resolve(repo_root)];
  const copies=[];
  for(let index=0;index<2;index++){
   const files=[];
   for(const [path,pin]of Object.entries(binding.public_import_closure)){
    const expected=index===0&&path===binding.target?binding.before:pin;
    const b=bytes(join(roots[index],path));assert.equal(b.length,expected.bytes,path);assert.equal(hash(b),expected.sha256,path);
    files.push([path,b]);
   }
   copies.push(files);
  }
  // All actual public source bytes and all own payloads precede app imports.
  temp=mkdtempSync(join(tmpdir(),'report2-bitget-metadata-fallback-'));
  for(let index=0;index<2;index++)for(const [path,b]of copies[index]){const p=join(temp,String(index),path);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,b);}
  globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN_IN_CONTROLLED_CASE');};
  const app=[];
  for(let index=0;index<2;index++){
   const root=join(temp,String(index),'current-generation/files/src');
   const producer=await import(pathToFileURL(join(root,'bitget-flow-collector.mjs')).href);
   const caller=await import(pathToFileURL(join(root,'external-n05-flow-collector.mjs')).href);
   const consumer=await import(pathToFileURL(join(root,'joint-spot-futures-flow.mjs')).href);
   const health=await import(pathToFileURL(join(root,'public-venue-source-priority.mjs')).href);
   app.push({...producer,...caller,...consumer,...health});
  }
  const SOURCE='N05_OFFICIAL_FLOW:BITGET',VERSION='bitget-flow-collector-v1-20261010';
  const end=1792771200000,start=end-14400000,now=end+30000,originalObserved=end+1000;
  assert.equal(end%60000,0);
  const identity={chain:'cardano',asset_kind:'NATIVE',native_asset_id:'cardano:mainnet',contract_or_mint:null};
  const coins={code:'00000',data:[{coin:'ADA',chains:[{chain:'ADA',contractAddress:''}]}]};
  const spot={code:'00000',data:[{symbol:'ADAUSDT',baseCoin:'ADA',quoteCoin:'USDT',status:'online'}]};
  const futures={code:'00000',data:[{symbol:'ADAUSDT',baseCoin:'ADA',quoteCoin:'USDT',symbolStatus:'normal',symbolType:'perpetual',isRwa:'NO'}]};
  const candles={code:'00000',data:Array.from({length:240},(_,i)=>[String(start+i*60000),'1','1','1','1','100000','100000','100000'])};
  const page={code:'00000',data:Array.from({length:240},(_,i)=>239-i).map(i=>({tradeId:String(1000000+i),ts:String(start+i*60000+1000),symbol:'ADAUSDT',side:'buy',price:'1',size:'100000'}))};
  const basePayload={version:VERSION,observed_ts:originalObserved,payloads:{pages:[page],candles}};
  const spotKey=`FLOW:ADA-USDT:SPOT:${end}`;
  function storeFixture(options={}){
   const rows=new Map(),events=[],daily=new Map(),minute=new Map();let unknown=options.initialUnknown?1:0,afterUnknown=0;
   const put=(key,payload,observed,expires)=>rows.set(SOURCE+'|'+key,{observed_ts:observed,expires_ts:expires,payload_json:JSON.stringify(payload)});
   for(const [kind,payload]of [['coins',coins],['spot',spot]]){
    const value=structuredClone(payload);if(options.wrongSpot&&kind==='spot')value.data[0].baseCoin='BTC';
    const ts=end-60000;put('METADATA:'+kind,{version:VERSION,observed_ts:ts,payload:value,receipt:{kind,received_ts:ts,http_status:200,status:'RECEIVED_NOT_QUALIFIED',actual_http:1,body_sha256:hash(JSON.stringify(value))}},ts,ts+21600000);
   }
   if(options.bothMetadata){const ts=end-60000;put('METADATA:futures',{version:VERSION,observed_ts:ts,payload:futures,receipt:{kind:'futures',received_ts:ts,http_status:200,status:'RECEIVED_NOT_QUALIFIED',actual_http:1,body_sha256:hash(JSON.stringify(futures))}},ts,ts+21600000);}
   if(!options.noFlow){
    const payload=structuredClone(basePayload);if(options.foreignTrade)payload.payloads.pages[0].data[0].symbol='BTCUSDT';if(options.futureClock)payload.observed_ts=now+1;
    put(spotKey,payload,originalObserved,options.expired?now-1:end+300000);
    if(options.bothMetadata)put(`FLOW:ADA-USDT:FUTURES:${end}`,basePayload,originalObserved,end+300000);
   }
   const initialRows=JSON.stringify([...rows]),normalize=s=>s.replace(/\s+/g,' ').trim();
   function event(type,sql,params){if(unknown)afterUnknown++;events.push({type,sql:normalize(sql),params:structuredClone(params)});}
   function statement(sql){let params=[];return{sql,bind(...p){params=p;this.params=p;return this;},async first(){
    event('first',sql,params);const q=normalize(sql);
    if(q==='SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3 LIMIT 1'){
     const row=rows.get(params[0]+'|'+params[1]);if(options.unknownDuringFlowRead&&params[1]===spotKey)unknown=1;
     return row&&row.expires_ts>params[2]?structuredClone(row):null;
    }
    if(q==='SELECT attempts FROM report2_evidence_source_daily WHERE source=?1 AND day_utc=?2 LIMIT 1')return{attempts:0};
    if(q==='SELECT source,attempts FROM report2_evidence_source_reservation WHERE reservation_id=?1')return daily.get(params[0])||null;
    if(q==='SELECT units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND reservation_id=?2 LIMIT 1')return minute.has(params[1])?{units:minute.get(params[1])}:null;
    if(q==='SELECT COALESCE(SUM(units),0) AS units FROM report2_provider_minute_ledger_v1 WHERE provider=?1 AND created_ts>?2 AND created_ts<=?3')return{units:[...minute.values()].reduce((n,x)=>n+x,0)};
    throw Error('UNEXPECTED_CONTROLLED_DB_FIRST:'+q);
   },async run(){
    event('run',sql,params);const q=normalize(sql);
    if(q.startsWith('INSERT INTO report2_provider_minute_ledger_v1(provider,minute_bucket,reservation_id,units,created_ts) SELECT ?1,?2,?3,?4,?5 WHERE ')){
     assert.equal(params[0],'BITGET');assert.equal(params[3],1);assert.equal(params[6],12);assert(!minute.has(params[2]));minute.set(params[2],params[3]);return{meta:{changes:1}};
    }
    if(q.startsWith('INSERT INTO report2_evidence_source_cache(source,asset_key,observed_ts,expires_ts,payload_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT')){
     assert.equal(params[0],'N05_PROVIDER_BACKOFF:BITGET');assert.equal(params[1],'SHARED');rows.set(params[0]+'|'+params[1],{observed_ts:params[2],expires_ts:params[3],payload_json:params[4]});return{meta:{changes:1}};
    }
    throw Error('UNEXPECTED_CONTROLLED_DB_RUN:'+q);
   }};}
   const db={prepare:statement,usageSnapshot:()=>({unknown_ops:unknown}),async batch(statements){
    assert.equal(statements.length,3);for(const s of statements)event('batch',s.sql,s.params);
    assert(normalize(statements[0].sql).startsWith('INSERT INTO report2_evidence_source_daily('));
    assert(normalize(statements[1].sql).startsWith('UPDATE report2_evidence_source_daily SET attempts=attempts+?1'));
    assert(normalize(statements[2].sql).startsWith('INSERT INTO report2_evidence_source_reservation('));
    const p=statements[2].params;assert.equal(p[1],SOURCE);assert.equal(p[3],1);assert(!daily.has(p[0]));daily.set(p[0],{source:p[1],attempts:p[3]});return statements.map(()=>({meta:{changes:1}}));
   }};
   return{db,rows,events,initialRows,markUnknown(){unknown=1;},snapshot(){return{unknown_ops:unknown,operations_after_unknown:afterUnknown,daily_reserved:[...daily.values()].reduce((n,x)=>n+x.attempts,0),minute_reserved:[...minute.values()].reduce((n,x)=>n+x,0)};}};
  }
  async function invoke(index,options={}){
   const f=storeFixture(options),urls=[],grants=[];
   const flow=await app[index].collectN05VenueRoutes({db:f.db,contract:'ADA-USDT',asset_identity:identity,identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',run_id:'CONTROLLED_METADATA_FALLBACK',now,clock:()=>now,
    source_health_admit:()=>({allowed:true}),request_admit:r=>{grants.push(structuredClone(r));return options.deny?{allowed:false,status:'CONTROLLED_WHOLE_JOB_DENIED'}:{allowed:true};},
    fetch_impl:async url=>{
     urls.push(String(url));assert.equal(url,'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES');
     if(options.transportThrow)throw Error('CONTROLLED_TRANSPORT_ACK_UNKNOWN');
     if(options.nativeUnknown)f.markUnknown();
     if(options.incompleteBody)return{status:503,headers:new Headers(),body:(async function*(){yield Buffer.from('partial');throw Error('CONTROLLED_INCOMPLETE_BODY');})()};
     return new Response('CONTROLLED_KNOWN_REFUSAL',{status:options.status||503,headers:{'retry-after':'1'}});
    }},[['BITGET',app[index].collectBitgetFlow]],()=>{throw Error('OPTIONAL_TURNOVER_NOT_IN_THIS_CASE');});
   // Retain EACH actual returned JSON before invoking the next consumer.
   const frame={index,options,flow,urls,grants};result.returned_frames.push(frame);
   frame.context=app[index].availableFlowContext({external:flow,contract:'ADA-USDT',now});
   frame.health=app[index].publicVenueHealthObservations(flow,{contract:'ADA-USDT',now});
   Object.assign(frame,{CONTROLLED_store_snapshot:f.snapshot(),cache_reads:f.events.filter(x=>x.type==='first'&&x.sql.startsWith('SELECT observed_ts,expires_ts,payload_json')).map(x=>x.params[1]),cache_writes:f.events.filter(x=>x.type==='run'&&x.sql.startsWith('INSERT INTO report2_evidence_source_cache')).length,retained_spot_payload_sha256:hash(f.rows.get(SOURCE+'|'+spotKey)?.payload_json||'NULL')});return frame;
  }
  async function variant(name,fn){await fn();result.completed_variants.push({group,name,status:'CONTROLLED_CHECK_COMPLETED'});}
  function stopped(f,{http=1,unknown=0}={}){
   assert.equal(f.urls.length,http);assert.equal(f.flow.network_calls,http);assert.equal(f.context.evidence.length,0);assert.equal(f.flow.check_completed,false);assert(!f.cache_reads.includes(spotKey));assert.equal(f.CONTROLLED_store_snapshot.unknown_ops,unknown);assert.equal(f.CONTROLLED_store_snapshot.operations_after_unknown,0);
  }
  function retained(f,{http=1}={}){
   assert.equal(f.urls.length,http);assert.equal(f.flow.network_calls,http);assert.equal(f.flow.observed_transport_HTTP,http);assert.equal(f.flow.caller_reserved_requests,http);assert.equal(f.CONTROLLED_store_snapshot.daily_reserved,http);assert.equal(f.CONTROLLED_store_snapshot.minute_reserved,http);
   assert.equal(f.CONTROLLED_store_snapshot.unknown_ops,0);assert.equal(f.CONTROLLED_store_snapshot.operations_after_unknown,0);assert.equal(f.flow.source_chain_native_cost_unclosed,false);
   assert.equal(f.context.check_completed,true);assert.equal(f.context.evidence.length,1);assert(app[f.index].validateAvailableFlowEvidence(f.context.evidence[0],now));
   const c=f.context.components[0],e=f.context.evidence[0];assert.equal(c.venue,'BITGET');assert.equal(c.market,'SPOT');assert.equal(c.contract,'ADA-USDT');assert.equal(c.quote,'USDT');assert.equal(c.physical_root,'BITGET_OFFICIAL_PUBLIC_TRADES');assert.deepEqual(c.identity,identity);assert.equal(c.window_start_ts,start);assert.equal(c.window_end_ts,end);assert.equal(c.observed_ts,originalObserved);assert.equal(c.verified_minutes,240);assert.equal(c.buy_quote,24000000);assert.equal(c.sell_quote,0);assert.equal(c.raw_trade_counter_independently_verified,false);
   assert.equal(e.unit,'PER_VENUE_RELATIVE_FLOW_IMBALANCE');assert.equal(e.source_ts,end);assert.equal(e.observed_ts,originalObserved);assert.equal(e.coverage_fraction,0);assert.equal(e.score_contribution,0);assert.equal(e.entry_authorized,false);assert.equal(e.source_scope,'ONE_VENUE_ONLY');assert.equal(e.upstream_id,'QUALIFIED_OFFICIAL_TAKER_FLOW');
   const n=f.flow.evidence.find(x=>x.block_id==='N12');assert(n);assert.equal(n.market,'SPOT');assert.equal(n.unit,'USDT');assert.equal(n.upstream_id,'BITGET_OFFICIAL_PUBLIC_SPOT_TRADES');assert.equal(n.source_ts,end-59000);assert.equal(n.observed_ts,originalObserved);assert.equal(n.coverage_fraction,0);assert.equal(n.whole_window_coverage_proven,false);
   assert.equal(f.retained_spot_payload_sha256,hash(JSON.stringify(basePayload)));assert(f.flow.receipts.some(r=>r.kind==='futures'&&r.actual_http===http));
  }
  await variant('BEFORE_KNOWN_503_RETURNS_BEFORE_USABLE_SPOT_CACHE',async()=>{const f=await invoke(0);stopped(f);assert.equal(f.flow.status,'HTTP_503');});
  await variant('AFTER_KNOWN_503_CACHE_TO_ACTUAL_CALLER_AND_CONTEXT',async()=>{const f=await invoke(1);retained(f);assert.equal(f.cache_writes,0);assert.equal(f.health[0].actual_http,1);assert.equal(f.health[0].evidence_rows,1);assert.equal(f.health[0].decision_usable_rows,0);});
  await variant('KNOWN_429_BACKOFF_RETAINED_WITHOUT_REFUND_OR_NEW_HTTP',async()=>{const f=await invoke(1,{status:429});retained(f);assert.equal(f.cache_writes,1);assert(f.flow.components.some(c=>c.market==='FUTURES'&&c.status==='HTTP_429'&&!c.check_completed));});
  await variant('COLD_SPOT_CACHE_NEVER_STARTS_NEW_TRANSPORT_AFTER_REFUSAL',async()=>{const f=await invoke(1,{noFlow:true});assert.equal(f.context.evidence.length,0);assert.equal(f.urls.length,1);assert.equal(f.flow.network_calls,1);assert(f.flow.components.some(c=>c.status==='CACHED_FLOW_REQUIRED_AFTER_METADATA_REFUSAL'));});
  await variant('EXPIRED_SPOT_CACHE_NEVER_REACQUIRES_OR_REBINDS_CLOCK',async()=>{const f=await invoke(1,{expired:true});assert.equal(f.context.evidence.length,0);assert.equal(f.urls.length,1);assert(f.flow.components.some(c=>c.status==='CACHED_FLOW_REQUIRED_AFTER_METADATA_REFUSAL'));});
  await variant('WRONG_SPOT_ASSET_METADATA_REFUSES_BEFORE_FLOW_READ',async()=>{const f=await invoke(1,{wrongSpot:true});assert.equal(f.context.evidence.length,0);assert.equal(f.urls.length,1);assert(!f.cache_reads.includes(spotKey));assert(f.flow.components.some(c=>c.status==='EXACT_ASSET_BINDING_NOT_CLOSED'));});
  await variant('FOREIGN_TRADE_IN_RETAINED_WINDOW_FAILS_ACTUAL_RECONCILER',async()=>{const f=await invoke(1,{foreignTrade:true});assert.equal(f.context.evidence.length,0);assert.equal(f.urls.length,1);assert(!f.flow.components.some(c=>c.check_completed));});
  await variant('FUTURE_OBSERVATION_CLOCK_NOT_QUALIFIED_OR_REACQUIRED',async()=>{const f=await invoke(1,{futureClock:true});assert.equal(f.context.evidence.length,0);assert.equal(f.urls.length,1);});
  await variant('UNCERTAIN_TRANSPORT_PRESERVES_OLD_GLOBAL_STOP',async()=>{const f=await invoke(1,{transportThrow:true});stopped(f);assert.equal(f.flow.status,'CONTROLLED_TRANSPORT_ACK_UNKNOWN');});
  await variant('INCOMPLETE_HTTP_BODY_IS_NOT_KNOWN_REFUSAL',async()=>{const f=await invoke(1,{incompleteBody:true});stopped(f);assert.equal(f.flow.status,'CONTROLLED_INCOMPLETE_BODY');});
  await variant('NATIVE_UNKNOWN_WITH_503_STOPS_BEFORE_CACHE_READ',async()=>{const f=await invoke(1,{nativeUnknown:true});stopped(f,{unknown:1});assert.equal(f.flow.source_chain_native_cost_unclosed,true);assert.equal(f.CONTROLLED_store_snapshot.daily_reserved,1);});
  await variant('UNKNOWN_DURING_FALLBACK_CACHE_READ_STOPS_BEFORE_FACT',async()=>{const f=await invoke(1,{unknownDuringFlowRead:true});assert.equal(f.urls.length,1);assert(f.cache_reads.includes(spotKey));assert.equal(f.context.evidence.length,0);assert.equal(f.flow.check_completed,false);assert.equal(f.CONTROLLED_store_snapshot.unknown_ops,1);assert.equal(f.CONTROLLED_store_snapshot.operations_after_unknown,0);assert.equal(f.flow.source_chain_native_cost_unclosed,true);});
  await variant('WHOLE_JOB_DENIAL_IS_NOT_HTTP_REPLY_OR_CACHE_GRANT',async()=>{const f=await invoke(1,{deny:true});stopped(f,{http:0});assert.equal(f.CONTROLLED_store_snapshot.daily_reserved,0);assert.equal(f.CONTROLLED_store_snapshot.minute_reserved,0);});
  await variant('BOTH_METADATA_PRESENT_RETAIN_ORIGINAL_TWO_CACHE_PATH',async()=>{const a=await invoke(0,{bothMetadata:true}),b=await invoke(1,{bothMetadata:true});assert.equal(a.urls.length,0);assert.equal(b.urls.length,0);assert.deepEqual(b.flow,a.flow);assert.deepEqual(b.context,a.context);assert.equal(b.context.components.length,2);assert.equal(b.context.evidence[0].venue_count,1);assert.equal(b.context.evidence[0].score_contribution,0);});
  assert.equal(result.completed_variants.length,14);result.completed_groups=1;result.status='CONTROLLED_AFFECTED_GROUP_COMPLETED';return result;
 }catch(error){error.partial_result=result;throw error;}
 finally{try{if(temp)rmSync(temp,{recursive:true,force:true});}catch(error){error.partial_result=result;throw error;}finally{globalThis.fetch=originalFetch;}}
}
