// Prepared only: no top-level imports, registration, or invocation.
export async function runScanFallbackSourceAsofConnected({runtime_root,baseline_runtime_root,repo_root}={}){
 const fs=(await import('node:fs')).default,path=(await import('node:path')).default;
 const {createHash}=await import('node:crypto'),{pathToFileURL}=await import('node:url'),{DatabaseSync}=await import('node:sqlite'),{default:assert}=await import('node:assert/strict');
 const hash=x=>createHash('sha256').update(x).digest('hex'),copy=x=>structuredClone(x),prefix='anomaly-research/scan-fallback-source-asof-20261021';
 const pins=JSON.parse(fs.readFileSync(path.join(repo_root,prefix,'target-bindings.json'),'utf8'));
 const next=fs.realpathSync(runtime_root),old=fs.realpathSync(baseline_runtime_root);assert.notEqual(next,old);assert.equal(path.basename(next),'src');assert.equal(path.basename(old),'src');
 const files=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)).map(n=>path.join(e.name,n)):[e.name]).sort();
 const names=files(next);assert.deepEqual(files(old),names,'FULL assembled src inventories required');
 for(const name of names)assert.equal(hash(fs.readFileSync(path.join(old,name))),name===pins.runtime_file?pins.before_sha256:hash(fs.readFileSync(path.join(next,name))),name);
 assert.equal(hash(fs.readFileSync(path.join(next,pins.runtime_file))),pins.after_sha256);
 const helper=fs.readFileSync(path.join(repo_root,pins.existing_fixture_helper.path),'utf8');assert.equal(hash(helper),pins.existing_fixture_helper.sha256);
 const slice=(start,end)=>{assert.equal(helper.split(start).length,2);const a=helper.indexOf(start),z=helper.indexOf(end,a);assert(z>a);return helper.slice(a,z);};
 const adapter=slice(pins.existing_fixture_helper.adapter_start,pins.existing_fixture_helper.adapter_end),DDL=slice(pins.existing_fixture_helper.DDL_start,pins.existing_fixture_helper.DDL_end);
 assert.equal(hash(adapter),pins.existing_fixture_helper.adapter_sha256);assert.equal(hash(DDL),pins.existing_fixture_helper.DDL_sha256);
 const savedBytes=fs.readFileSync(path.join(repo_root,pins.saved_projection.path));assert.equal(savedBytes.length,pins.saved_projection.bytes);assert.equal(hash(savedBytes),pins.saved_projection.sha256);
 const source=JSON.parse(savedBytes)[pins.saved_projection.record_index];assert.equal(source.ts,pins.saved_projection.original_observation_ts);assert(source.ts%300000>0);assert.equal(source.contracts[0][0],pins.saved_projection.contract);
 const T=source.ts,SLOT=300000,B=Math.floor(T/SLOT)*SLOT,contract=pins.saved_projection.contract,controls=[],originalFetch=globalThis.fetch,originalNow=Date.now;
 let unexpectedHTTP=0,clockRefreshes=0;const open=[];
 globalThis.fetch=()=>{unexpectedHTTP++;throw Error('NETWORK_FORBIDDEN');};Date.now=()=>{clockRefreshes++;throw Error('SUPPLIED_READ_ASOF_MUST_NOT_REFRESH');};
 try{
  // All reader/helper/source/DDL/adapter pins precede evaluation and app imports.
  const makeAdapter=new Function('sql',adapter+'\nreturn db;');
  const before=await import(pathToFileURL(path.join(old,pins.runtime_file)).href),after=await import(pathToFileURL(path.join(next,pins.runtime_file)).href);
  const scan=(bucket=B,ts=T,contracts=source.contracts)=>({ts_bucket:bucket,ts,stage0_coverage_pct:source.coverage,errors:source.errors,stale:source.stale,payload_json:JSON.stringify({schema:'stage0-compact-v2',timestamp:Number.isFinite(ts)?ts:null,contracts:copy(contracts)})});
  const fixture=({scans=[],collector=[]}={})=>{
   const sql=new DatabaseSync(':memory:');open.push(sql);sql.exec(DDL);
   for(const row of scans)sql.prepare('INSERT INTO scan_runs(ts_bucket,ts,stage0_coverage_pct,errors,stale,payload_json) VALUES(?,?,?,?,?,?)').run(row.ts_bucket,row.ts,row.stage0_coverage_pct,row.errors,row.stale,row.payload_json);
   for(const row of collector)sql.prepare('INSERT INTO report2_market_snapshot_batch_v1(bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(...row);
   const db=makeAdapter(sql),prepare=db.prepare.bind(db),trace=[];
   db.prepare=query=>{const statement=prepare(query);trace.push({query,statement});return statement;};
   return{db,sql,trace:()=>trace.map(({query,statement})=>({query,args:[...statement.args]})),usage:()=>db.usageSnapshot()};
  };
  const run=async(lib,method,config,now)=>{const f=fixture(config);const result=await lib[method]({db:f.db,contract,now_ts:now,hours:.25,preferred_generation:'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M'});return{result,trace:f.trace(),usage:f.usage()};};
  const pair=async(method,config,now)=>({old:await run(before,method,config,now),next:await run(after,method,config,now)});
  const group=async(name,fn)=>controls.push({name,classification:'NEW_CONTROLLED_SQLITE_WITH_ONE_SAVED_PROJECTION_NOT_NATIVE_INCIDENT_OR_ACK',detail:await fn()});
  let contractPair,targetPair;
  await group('original saved scan source clock later than historical same-bucket read-asof is excluded',async()=>{
   const cut=T-1;assert.equal(Math.floor(cut/SLOT)*SLOT,B);
   contractPair=await pair('readMarketHistoryForContract',{scans:[scan()]},cut);const a=contractPair.old.result,z=contractPair.next.result;
   assert.equal(a.source,'SCAN_RUNS_COMPACT_V2');assert.equal(a.series.length,1);assert.equal(a.series[0].ts,T);assert.equal(a.coverage.received_points,1);assert.equal(a.status,'PARTIAL');assert.equal(z.series.length,0);assert.equal(z.coverage.received_points,0);assert.equal(z.status,'WARMING');assert.equal(z.coverage.complete_5m_window,false);assert.equal(z.coverage.actual_cadence_minutes,20);
   return{saved_record_index:pins.saved_projection.record_index,source_ts:T,bucket:B,supplied_historical_asof:cut,original_SQL_returned_clock_after_asof:true,before_received:a.coverage.received_points,after_received:z.coverage.received_points,before_status:a.status,after_status:z.status,immutable_availability_or_native_incident_proven:false};
  });
  await group('actual SQLite NULL zero negative fraction text unsafe and infinite clocks cannot become eligible series',async()=>{
   const out=[];
   for(const [label,ts]of [['NULL',null],['zero',0],['negative',-1],['fraction',1.5],['text','CONTROLLED_INVALID_SOURCE_TS'],['unsafe-real',1e20],['infinite-real',Infinity]]){
    const config={scans:[scan(B,ts)]},p=await pair('readMarketHistoryForContract',config,T);assert.equal(p.old.result.series.length,1,label);assert.equal(p.next.result.series.length,0,label);assert.equal(p.next.result.coverage.received_points,0);assert.equal(p.next.result.coverage.complete_5m_window,false);assert.deepEqual(p.next.trace,p.old.trace);out.push({label,before_received:p.old.result.coverage.received_points,after_received:p.next.result.coverage.received_points,after_status:p.next.result.status});
   }
   return out;
  });
  const offsets=[5,15,60,240,1440].map(minutes=>minutes*60000),labels=['5m','15m','1h','4h','24h'];
  await group('target fallback also rejects schema-permitted future or unknown original clocks without trusting buckets',async()=>{
   const out=[];
   for(const [label,ts]of [['future',T+1],['unknown',null]]){
    const scans=offsets.map(offset=>scan(Math.floor((T-offset)/SLOT)*SLOT,ts)),p=await pair('readMarketHistoryTargets',{scans},T);assert.equal(p.old.result.snapshots_found,5);assert.equal(p.next.result.snapshots_found,0);for(const key of labels)assert.equal(p.next.result.targets[key].size,0);assert.deepEqual(p.next.trace,p.old.trace);out.push({label,supplied_read_asof:T,before_targets:p.old.result.snapshots_found,after_targets:p.next.result.snapshots_found,bucket_source_consistency_claimed:false});
   }
   return out;
  });
  await group('nearest-bucket tolerance after the ideal historical target is preserved when source is before read-asof',async()=>{
   const scans=offsets.map((offset,i)=>{const bucket=Math.floor((T-offset)/SLOT)*SLOT+(i>=2?SLOT:0);return scan(bucket,bucket+1000);});
   targetPair=await pair('readMarketHistoryTargets',{scans},T);assert.equal(targetPair.next.result.snapshots_found,5);assert.deepEqual(targetPair.next.result,targetPair.old.result);
   return labels.map((key,i)=>{const point=targetPair.next.result.targets[key].get(contract);assert.equal(point.ts,scans[i].ts);assert(point.ts<=T);assert.equal(point.actual_cadence_minutes,20);if(i>=2)assert(point.ts>T-offsets[i]);return{target:key,source_ts:point.ts,supplied_read_asof:T,after_ideal_target_but_allowed:i>=2,actual_cadence_minutes:point.actual_cadence_minutes};});
  });
  await group('exact source-asof edge and original NULL numeric fields zero age and funding units stay unchanged',async()=>{
   const p=await pair('readMarketHistoryForContract',{scans:[scan()]},T);assert.deepEqual(p.next.result,p.old.result);const point=p.next.result.series[0];assert.equal(point.ts,T);assert.equal(point.price,source.contracts[0][1]);assert.equal(point.funding_interval_hours,null);assert.equal(point.market_age_sec,0);assert.equal(point.funding_rate,source.contracts[0][5]);assert.equal(point.funding_rate_pct,source.contracts[0][5]*100);assert.equal(p.next.result.status,'PARTIAL');assert.equal(p.next.result.coverage.approximate_5m_coverage_pct,null);assert.equal(p.next.result.coverage.complete_5m_window,false);
   const tuples=copy(source.contracts);tuples[0][1]=null;tuples[0][3]=null;const q=await pair('readMarketHistoryForContract',{scans:[scan(B,T,tuples)]},T);assert.deepEqual(q.next.result,q.old.result);assert.equal(q.next.result.series[0].price,null);assert.equal(q.next.result.series[0].oi_contracts,null);return{source_ts:point.ts,price:point.price,funding_rate:point.funding_rate,funding_rate_pct:point.funding_rate_pct,funding_interval_hours:point.funding_interval_hours,market_age_sec:point.market_age_sec,unrelated_NULL_not_coerced:true,PARTIAL_not_promoted:true,clock_refreshes:clockRefreshes};
  });
  await group('actual existing SELECT templates bindings order limits counts and fixture read accounting stay exact',async()=>{
   const out=[];for(const [label,p]of [['contract',contractPair],['targets',targetPair]]){assert.deepEqual(p.next.trace,p.old.trace);assert.deepEqual(p.next.usage,p.old.usage);const scans=p.next.trace.filter(x=>x.query.includes('FROM scan_runs'));assert(scans.length>0);for(const x of scans){assert(!/\bts\s*[<>=]/.test(x.query));if(label==='contract')assert(/ORDER BY ts_bucket ASC LIMIT 2500/.test(x.query));else assert(/ORDER BY ABS\(ts_bucket-\?3\) ASC LIMIT 1/.test(x.query));}out.push({path:label,SQL_calls_each:p.next.trace.length,scan_SELECTs_each:scans.length,SQL_and_parameters_sha256:hash(JSON.stringify(p.next.trace)),fixture_returned_rows_each:p.next.usage.rows_read,new_SQL_templates:0,new_SQL_bindings:0,native_rows_read_cost:null,quota_refund_or_saving_claimed:false});}return out;
  });
  await group('new controlled collector envelope retains the unchanged preferred path without reading fallback',async()=>{
   const tuple=source.contracts[0],payload=JSON.stringify([{contract,observed_ts:T,price:tuple[1],turnover_24h_usdt:tuple[2],oi_contracts:tuple[3],oi_value_usdt:tuple[4],funding_rate:tuple[5],funding_interval_hours:tuple[6],market_age_sec:tuple[7],source_status:tuple[8]}]);
   const collector=[[B,'HUB_PUBLIC_COLLECTOR','MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M',after.HISTORY_COMPATIBILITY.schema_version,0,JSON.stringify({expected_shards:1,universe_total:1}),T,'COMPLETE',hash(payload),payload,1,Buffer.byteLength(payload)]];
   const p=await pair('readMarketHistoryForContract',{scans:[scan(B,T+1)],collector},T);assert.deepEqual(p.next.result,p.old.result);assert.equal(p.next.result.source,'REPORT2_MARKET_SNAPSHOT_BATCH_V1');assert.equal(p.next.result.provenance.fallback_used,false);assert.equal(p.next.trace.some(x=>x.query.includes('FROM scan_runs')),false);assert.deepEqual(p.next.trace,p.old.trace);return{preferred_path_unchanged:true,fallback_not_queried:true,received_points:p.next.result.coverage.received_points,source_clock:p.next.result.series[0].ts,fixture_envelope_is_not_original_collector_receipt:true};
  });
  assert.equal(controls.length,7);assert.equal(unexpectedHTTP,0);assert.equal(clockRefreshes,0);
  return{schema:'SCAN_FALLBACK_SOURCE_ASOF_CONNECTED_V1',status:'CONTROLLED_COMPONENT_COMPLETED',control_count:7,controls,source_saved_projection_sha256:pins.saved_projection.sha256,source_rows_used:1,existing_SQLite_DDL_and_adapter_used:true,local_SQLite_executed:true,new_SQL_templates:0,new_SQL_bindings:0,provider_HTTP:0,native_SQL:0,MAIN:0,Telegram:0,source_clock_refreshes:clockRefreshes,old_K07_565_586_588_589_or_37_3274_13096_semantic_reexecution:0,immutable_firstknowledge_or_anomaly_ACK_qualified:false,actual_native_future_incident_proven:false,native_cost_saving_or_admission_qualified:false};
 }catch(error){error.completed_new_control_groups=controls;throw error;}
 finally{globalThis.fetch=originalFetch;Date.now=originalNow;for(const sql of open)sql.close();}
}
