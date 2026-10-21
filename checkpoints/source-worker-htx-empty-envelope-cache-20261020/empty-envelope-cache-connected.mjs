// Prepared component only. No test registration, top-level imports or execution.
export async function runHtxEmptyEnvelopeCacheConnected({runtime_root,baseline_runtime_root,repo_root}){
 const fs=(await import('node:fs')).default,path=(await import('node:path')).default;
 const {createHash}=await import('node:crypto'),{pathToFileURL}=await import('node:url');
 const {default:assert}=await import('node:assert/strict');
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const own=path.join(repo_root,'checkpoints/source-worker-htx-empty-envelope-cache-20261020');
 const bindings=JSON.parse(fs.readFileSync(path.join(own,'target-bindings.json'),'utf8'));
 const next=fs.realpathSync(runtime_root),old=fs.realpathSync(baseline_runtime_root);
 assert.notEqual(next,old);assert.equal(path.basename(next),'src');assert.equal(path.basename(old),'src');
 const files=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)).map(p=>path.join(e.name,p)):[e.name]).sort();
 const nf=files(next),of=files(old);assert.deepEqual(nf,of,'actual FULL src baseline required');
 for(const name of nf)if(name!=='htx-large-trades-evidence.mjs')assert.equal(hash(fs.readFileSync(path.join(next,name))),hash(fs.readFileSync(path.join(old,name))),name);
 assert.equal(hash(fs.readFileSync(path.join(next,'htx-large-trades-evidence.mjs'))),bindings.after_sha256);
 assert.equal(hash(fs.readFileSync(path.join(old,'htx-large-trades-evidence.mjs'))),bindings.before_sha256);
 for(const [name,pin] of Object.entries(bindings.runtime_pins)){
  if(name==='htx-large-trades-evidence.mjs')continue;
  assert.equal(hash(fs.readFileSync(path.join(next,name))),pin.sha256,name);
  if(!name.startsWith('../'))assert.equal(hash(fs.readFileSync(path.join(old,name))),pin.sha256,name);
 }
 const templateBytes=fs.readFileSync(path.join(repo_root,bindings.retained_render_template.path));
 assert.equal(hash(templateBytes),bindings.retained_render_template.sha256);
 const originalTemplate=JSON.parse(templateBytes),template=originalTemplate.canonical;
 assert(template&&Number.isSafeInteger(template.observed_ts));
 const NOW=template.observed_ts,contract=template.metadata.contract,run='CONTROLLED_HTX_EMPTY_ENVELOPE_CACHE';
 const controls=[],oldFetch=globalThis.fetch,oldNow=Date.now;
 globalThis.fetch=()=>{throw Error('REAL_NETWORK_DISABLED');};Date.now=()=>NOW;
 try{
 // Every source pin and FULL-baseline comparison precedes runtime imports.
 const load=(root,name)=>import(pathToFileURL(path.join(root,name)).href);
 const [candidate,baseline,route,context,manual,publication,budget,unified]=await Promise.all([
  load(next,'htx-large-trades-evidence.mjs'),load(old,'htx-large-trades-evidence.mjs'),
  load(next,'candidate-evidence-v2-runtime.mjs'),load(next,'block-result-context.mjs'),
  load(next,'manual-report-formatter.mjs'),load(next,'canonical-publication.mjs'),
  load(next,'../d1-preaction-budget-guard.mjs'),load(next,'unified-budget.mjs'),
 ]);
 const {DatabaseSync}=await import('node:sqlite');
 const observed=NOW-500,batch=NOW-900,tradeTs=NOW-1000;
 const payload={status:'ok',ch:`market.${contract}.trade.detail`,ts:batch,data:[{data:[{id:'9876543210987654321098765',price:100,amount:2000,quantity:2000,trade_turnover:200000,ts:tradeTs,direction:'buy'}]}]};
 // NEW CONTROLLED cache fixture. The retained template supplies rendering shape,
 // not a native trade, native first-known receipt, cost or current acquisition.
 const normalized=candidate.normalizeHtxLargeTrades(payload,{contract,observed_ts:observed});
 assert.equal(normalized.status,'CLOSED_BOUNDED_SAMPLE');
 const resultHash=r=>hash(JSON.stringify({status:r.status,evidence:r.evidence,summary:r.summary}));
 const positive={version:candidate.HTX_LARGE_TRADES_VERSION,...normalized,network_calls:1,receipts:[{http_status:200,source_status:'ok',channel:payload.ch,source_ts:batch}],cache_scope:{schema:'HTX_N12_RESULT_CACHE_SCOPE_V1',source:'HTX_LARGE_TRADES',contract,market:'FUTURES',quote:'USDT',request_url:`https://api.hbdm.com/linear-swap-ex/market/history/trade?contract_code=${encodeURIComponent(contract)}&size=2000`,observed_ts:observed,expires_at:observed+60000,source_status:'ok',channel:payload.ch,batch_ts:batch,body_sha256:hash(JSON.stringify(payload)),result_sha256:resultHash(normalized)}};
 const copy=x=>structuredClone(x),empty={futures:null,spot:null};
 const sourceSQL='SELECT observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND expires_ts>?3 LIMIT 1';
 function database(value=positive,options={}){
  const sqlite=new DatabaseSync(':memory:'),log=[];let unknown=options.unknown?1:0;
  sqlite.exec('CREATE TABLE report2_evidence_source_cache(source TEXT NOT NULL,asset_key TEXT NOT NULL,observed_ts INTEGER NOT NULL,expires_ts INTEGER NOT NULL,payload_json TEXT NOT NULL,PRIMARY KEY(source,asset_key))');
  if(value)sqlite.prepare('INSERT INTO report2_evidence_source_cache VALUES(?,?,?,?,?)').run('HTX_LARGE_TRADES',contract,options.future?NOW+1:observed,options.expired?NOW-1:observed+60000,JSON.stringify(value));
  const db={log,usageSnapshot:()=>({rows_read:100+log.length,rows_written:10,requests:log.length,unknown_ops:unknown}),prepare(sql){let args=[];const statement={bind(...a){args=a;return statement;},async first(){return execute('first',sql,args);},async all(){return{results:execute('all',sql,args)};},async run(){return execute('run',sql,args);}};return statement;},async batch(statements){const out=[];for(const s of statements)out.push(await s.run());return out;}};
  function execute(op,sql,args){
   log.push({op,sql,params:args});
   if(sql===sourceSQL&&options.throwRead){unknown=1;throw Error('CONTROLLED_CACHE_READ_FAILURE');}
   const s=sqlite.prepare(sql),value=op==='first'?s.get(...args)||null:op==='all'?s.all(...args):{success:true,meta:{changes:Number(s.run(...args).changes)}};
   if(sql===sourceSQL&&options.lateUnknown)unknown=1;
   return value;
  }
  return{db,close:()=>sqlite.close()};
 }
 async function invoke(module,{cache=positive,envelope=empty,options={},routed=false,missingAdmit=false,denied=false,legacyOmitted=false,contractOverride=null,clockOverride=null,followingProbe=false}={}){
  const d=database(cache,options),whole=unified.createUnifiedHttpBudget();let transports=0,followingCalls=0;const admissions=[];
  const params={db:d.db,contract,run_id:run,now:NOW,same_run_htx_trades:envelope,
   request_admit:r=>whole.reserve(r),fetch_impl:async()=>{transports++;throw Error('NO_PROVIDER_TRANSPORT_ALLOWED');},
   source_health_admit:e=>{admissions.push(e);const usage=d.db.usageSnapshot();return budget.evaluateWithinRunReservation({reservation:{rows_read:59000,rows_written:920},currentUsage:{...usage,...(denied?{rows_read:59000}:{})},extraRowsRead:4500+e.rows_read,extraRowsWritten:150+e.rows_written});}};
  if(missingAdmit)delete params.source_health_admit;
  if(legacyOmitted)delete params.same_run_htx_trades;
  if(contractOverride!==null)params.contract=contractOverride;
  if(clockOverride!==null)params.now=clockOverride;
  try{
   let result,routeResult=null;
   if(routed){routeResult=await route.collectEvidenceRouteBlock({routes:[{name:'LARGE_TRADES',role:'ACTUAL_HTX_TRADE_CONTEXT'},...(followingProbe?[{name:'CONTROLLED_AFTER_CACHE'}]:[])],collectors:{LARGE_TRADES:module.collectHtxLargeTradesEvidence,CONTROLLED_AFTER_CACHE:async()=>{followingCalls++;return{status:'CONTROLLED_FOLLOWING_COLLECTOR_CALLED',evidence:[],network_calls:0};}},params,max_requests:5});result=routeResult.results.LARGE_TRADES;}
   else result=await module.collectHtxLargeTradesEvidence(params);
   assert.equal(transports,0);assert.equal(whole.summary().total,0,'no new whole reservation or refund');
   return{result,route:routeResult,sql:copy(d.db.log),admissions,usage:d.db.usageSnapshot(),transports,followingCalls,whole:whole.summary()};
  }finally{d.close();}
 }
 const compact=r=>({status:r.result.status,evidence_ids:(r.result.evidence||[]).map(e=>e.evidence_id),sql_count:r.sql.length,cache_reads:r.sql.filter(x=>x.sql===sourceSQL).length,admissions:r.admissions,native_usage_unclosed:r.usage.unknown_ops>0,actual_http:r.route?.network_calls??r.transports,whole_reserved:r.whole.total,fallback:r.result.cache_fallback??null});
 const group=async(name,fn)=>{const detail=await fn();controls.push({name,classification:'NEW_CONTROLLED_SOURCE_CACHE_CONSUMER_CASE',detail});};
  await group('usable full/partial/closed-empty same-run keeps zero-SQL authority',async()=>{
   const spot={status:'ok',ch:`market.${contract.replace(/-USDT$/,'').toLowerCase()}usdt.trade.detail`,ts:batch,data:[{data:[{id:'7654321098765432109876543',price:100,amount:2000,ts:tradeTs,direction:'buy'}]}]};
   const variants=[{futures:{contract,payload},spot:{contract,payload:spot}},{futures:{contract,payload},spot:null},{futures:null,spot:{contract,payload:spot}},{futures:{contract,payload:{...payload,data:[]}},spot:null}];
   const out=[];for(const envelope of variants){const a=await invoke(baseline,{envelope}),b=await invoke(candidate,{envelope});assert.deepEqual(b.result,a.result);assert.equal(b.sql.length,0);assert.equal(b.admissions.length,0);out.push(compact(b));}return out;
  });
  let recovered;
  await group('empty and unbound envelopes recover exact positive cache through actual route',async()=>{
   const variants=[{},empty,{futures:{contract,payload:null},spot:{contract,payload:null}},{futures:{contract:'FOREIGN-USDT',payload},spot:null}];
   const out=[];for(const envelope of variants){const a=await invoke(baseline,{envelope,routed:true}),b=await invoke(candidate,{envelope,routed:true});assert.equal(a.result.evidence.length,0);assert.equal(a.sql.length,0);assert.deepEqual(b.result.evidence,positive.evidence);assert.equal(b.result.check_completed,false);assert.equal(b.sql.length,1);assert.equal(b.sql[0].sql,sourceSQL);assert.deepEqual(b.admissions,[{rows_read:500,rows_written:0}]);assert.equal(b.route.receipts[0].actual_http,0);assert.equal(b.route.reserved_requests,0);recovered=b;out.push({baseline:compact(a),candidate:compact(b)});}return out;
  });
  await group('failed or stale same-run payload is not treated as a fresh empty sample',async()=>{
   const out=[];for(const p of [{...payload,status:'error'},{...payload,ts:NOW-61000},{...payload,ch:'market.FOREIGN-USDT.trade.detail'}]){const a=await invoke(baseline,{envelope:{futures:{contract,payload:p}}}),b=await invoke(candidate,{envelope:{futures:{contract,payload:p}}});assert.equal(a.result.evidence.length,0);assert.deepEqual(b.result.evidence,positive.evidence);assert.equal(b.result.cache_fallback.same_run_status,a.result.status);assert.deepEqual(b.result.cache_fallback.same_run_receipts,a.result.receipts);assert.equal(b.sql.length,1);out.push(compact(b));}return out;
  });
  await group('cache absent keeps original missing result without provider fallback',async()=>{const a=await invoke(baseline,{cache:null}),b=await invoke(candidate,{cache:null});assert.equal(b.result.status,a.result.status);assert.deepEqual(b.result.evidence,a.result.evidence);assert.equal(b.sql.length,1);return compact(b);});
  await group('failed/empty cached result cannot replace missing with zero',async()=>{const out=[];for(const status of ['SOURCE_NOT_CLOSED_HTTP_500','CLOSED_EMPTY_BOUNDED_SAMPLE']){const cache={...copy(positive),status,evidence:[],summary:null};const a=await invoke(baseline,{cache}),b=await invoke(candidate,{cache});assert.equal(b.result.status,a.result.status);assert.equal(b.result.evidence.length,0);out.push(compact(b));}return out;});
  await group('wrong-asset and unbound legacy cache are rejected by the new path',async()=>{const foreign=copy(positive);foreign.evidence.forEach(e=>e.htx_contract='FOREIGN-USDT');foreign.cache_scope.result_sha256=resultHash(foreign);const unbound=copy(positive);delete unbound.cache_scope;const out=[];for(const cache of [foreign,unbound]){const b=await invoke(candidate,{cache});assert.equal(b.result.evidence.length,0);assert.equal(b.sql.length,1);out.push(compact(b));}return out;});
  await group('expired cache never becomes a current fact',async()=>{const b=await invoke(candidate,{options:{expired:true}});assert.equal(b.result.evidence.length,0);assert.equal(b.sql.length,1);return compact(b);});
  await group('future cache clock is not closed by lookup time',async()=>{const b=await invoke(candidate,{options:{future:true}});assert.equal(b.result.evidence.length,0);assert.equal(b.sql.length,1);return compact(b);});
  await group('missing/denied admission, invalid identity/clock and unknown usage stop before SQL',async()=>{const out=[];for(const opts of [{missingAdmit:true},{denied:true},{contractOverride:'INVALID'},{clockOverride:String(NOW)},{options:{unknown:true}}]){const b=await invoke(candidate,opts);assert.equal(b.sql.length,0);assert.equal(b.result.evidence.length,0);out.push(compact(b));}return out;});
  await group('cache query failure keeps refusal and unknown without another query',async()=>{const a=await invoke(baseline,{options:{throwRead:true}}),b=await invoke(candidate,{options:{throwRead:true}});assert.equal(b.result.status,a.result.status);assert.equal(b.result.evidence.length,0);assert.equal(b.result.cache_fallback.status,'EXISTING_CACHE_READ_FAILED');assert.equal(b.sql.length,1);assert.equal(b.usage.unknown_ops,1);return compact(b);});
  await group('valid returned cache survives late unknown and actual route stops following work',async()=>{const b=await invoke(candidate,{options:{lateUnknown:true},routed:true,followingProbe:true});assert.deepEqual(b.result.evidence,positive.evidence);assert.equal(b.sql.length,1);assert.equal(b.usage.unknown_ops,1);assert.equal(b.result.cache_fallback.native_usage_unclosed,true);assert.equal(b.followingCalls,0);assert.equal(b.route.results.CONTROLLED_AFTER_CACHE.status,'SOURCE_CHAIN_STOPPED_UNCLOSED_NATIVE_USAGE');return{...compact(b),following_calls:b.followingCalls,following_status:b.route.results.CONTROLLED_AFTER_CACHE.status};});
  await group('legacy omitted, array and non-plain envelopes remain unchanged',async()=>{const legacyCache=copy(positive);delete legacyCache.cache_scope;const out=[];for(const opts of [{legacyOmitted:true},{legacyOmitted:true,cache:legacyCache},{envelope:[]},{envelope:new Date(NOW)}]){const a=await invoke(baseline,opts),b=await invoke(candidate,opts);assert.deepEqual(b.result,a.result);assert.deepEqual(b.sql,a.sql);out.push(compact(b));}return out;});
  assert.equal(controls.length,12);
  assert.deepEqual(recovered.result.evidence,positive.evidence,'all original IDs/units/clocks/expiry survive');
  const facts=context.consumeBlockResultContext({contract,now:NOW,evidence:recovered.result.evidence}).facts;
  assert(facts.some(f=>f.block_id==='N12'));
  assert(facts.filter(f=>f.block_id==='N12').every(f=>f.observed_ts===observed),'consumer preserves original cache observation clock');
  assert(!context.consumeBlockResultContext({contract,now:NOW,evidence:[]}).facts.some(f=>f.block_id==='N12'),'baseline missing source has no N12 context');
  // CONTROLLED formatting tuple only: no assessActionability, source-role gate,
  // lifecycle write, entry calculation or publication/delivery is invoked.
  const c=copy(template);c.run_id=run;c.state='OBSERVE';c.direction='LONG';c.metadata.internal_market_context={...(c.metadata.internal_market_context||{}),evidence_v2:{evidence:recovered.result.evidence},decision_ts:NOW};c.metadata.supporting_context={facts};c.analytical_fingerprint=publication.canonicalFingerprint(c);
  const rendered=manual.formatManualReport(c);assert.equal(rendered.ok,true);
  const views=[];for(const policy of ['ORIGINAL_V5_20261006','ORIGINAL_BRIEF_20261007']){
   const telegram=publication.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy});assert.equal(telegram.ok,true);
   const audit=context.auditRenderedBlockResults({canonical:c,manual:rendered,telegram});
   assert(audit.context_receipts.some(r=>r.block_id==='N12'));
   assert.equal(audit.telegram_delivery_proven,false);views.push({policy,manual_context:audit.context_receipts.filter(r=>r.block_id==='N12'),telegram_context:audit.telegram_context_receipts.filter(r=>r.block_id==='N12'),telegram_available_not_rendered:audit.telegram_available_not_rendered_evidence_ids,display_limits_unchanged:true});
  }
  const strict=route.auditCandidateBlocks({evidence:recovered.result.evidence,sources:{HTX_LARGE_TRADES:recovered.result},decision_ts:NOW,strict_fresh:true});
  assert.equal(strict.blocks.N12.checked,false,'cache is not a new strict-manual acquisition');
  assert.equal(strict.blocks.N12.decision_path,'BLOCKED_REQUIRED_SOURCE_NOT_CHECKED');
  return{schema:'HTX_EMPTY_ENVELOPE_CACHE_CONTROLLED_COMPONENT_V1',status:'CONTROLLED_COMPONENT_COMPLETED',controls,control_count:12,consumer:{views,strict_manual_audit:strict,retained_render_template_sha256:bindings.retained_render_template.sha256,modified_template_classification:'CONTROLLED_RENDER_ONLY_NOT_ACTUAL_RUN_OR_SENT'},fixture_provenance:'CONTROLLED_NEW_TRADE_CACHE_AND_BUDGET_WITH_ACTUAL_ASSEMBLED_MODULES_LOCAL_SQLITE',additional_existing_SELECT_per_fallback:1,new_SQL_templates:0,new_schema_in_fallback:0,provider_HTTP:0,native_SQL:0,native_rows_read_cost:null,savings:null,admission_authorized:false,source_clocks_refreshed:false,native_body_or_epoch_ACK_qualified:false,Telegram:0,old_accepted_cases_replayed:false};
 }catch(error){error.completed_new_control_groups=controls;throw error;}
 finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
}
