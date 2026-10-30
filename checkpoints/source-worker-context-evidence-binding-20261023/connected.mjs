import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// PREPARED UNEXECUTED. No application import or execution at module load.
// ROOT authenticates the whole baseline and wrapper scope before calling once.
export async function runContextEvidenceOriginBindingConnected({repo_root,runtime_root,baseline_runtime_root}={}){
 const result={schema:'SOURCE_CONTEXT_ORIGIN_CONNECTED_RESULT_V1',status:'IN_PROGRESS',new_controlled_groups:0,new_controlled_variants:0,completed_new_context_origin_variants:[],fixture:'CONTROLLED_PRODUCER_INPUT_NOT_HISTORICAL_RLC_OR_NATIVE_RESPONSE',source_HTTP:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,old_cases_replayed:0};
 const digest=b=>createHash('sha256').update(b).digest('hex');
 const priorFetch=globalThis.fetch;
 let trappedFetch=0;
 try{
  const repo=path.resolve(repo_root),runtime=path.resolve(runtime_root),base=path.resolve(baseline_runtime_root);
  assert.notEqual(runtime,base);
  const packet=path.join(repo,'checkpoints/source-worker-context-evidence-binding-20261023');
  const binding=JSON.parse(fs.readFileSync(path.join(packet,'bindings.json'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(path.join(packet,'manifest.json'),'utf8'));
  for(const [name,pin] of Object.entries(manifest.payloads)){
   assert.equal(path.basename(name),name);const b=fs.readFileSync(path.join(packet,name));assert.equal(b.length,pin.bytes);assert.equal(digest(b),pin.sha256);
  }
  const checkedRead=(root,name)=>{
   assert(!path.isAbsolute(name)&&!name.split('/').includes('..'));
   let current=root;for(const part of name.split('/')){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink());}
   const b=fs.readFileSync(current);assert(fs.lstatSync(current).isFile());return b;
  };
  for(const [name,pin] of Object.entries(binding.repo_pins)){
   const b=checkedRead(repo,name);assert.equal(b.length,pin.bytes);assert.equal(digest(b),pin.sha256);
  }
  for(const [name,pin] of Object.entries(binding.public_import_closure)){
   const b=checkedRead(base,name);assert.equal(b.length,pin.bytes);assert.equal(digest(b),pin.sha256);
   const p=checkedRead(runtime,name),isTarget=name===binding.target.runtime_path;
   assert.equal(p.length,isTarget?binding.target.after_bytes:pin.bytes);assert.equal(digest(p),isTarget?binding.target.after_sha256:pin.sha256);
   const source=checkedRead(repo,'current-generation/files/'+name);
   assert.equal(digest(source),isTarget?binding.target.after_sha256:pin.sha256);
  }
  const inventory=root=>{
   const out={};const walk=(dir,relative='')=>{
    for(const item of fs.readdirSync(dir,{withFileTypes:true})){
     const name=relative?relative+'/'+item.name:item.name,at=path.join(dir,item.name);
     assert(!fs.lstatSync(at).isSymbolicLink());
     if(item.isDirectory())walk(at,name);else{assert(item.isFile());out[name]=digest(fs.readFileSync(at));}
    }
   };walk(root);return out;
  };
  const oldInventory=inventory(base),newInventory=inventory(runtime);
  assert.equal(Object.keys(oldInventory).length,binding.full_runtime_pair_count);
  assert.deepEqual(Object.keys(oldInventory).sort(),Object.keys(newInventory).sort());
  assert.deepEqual(Object.keys(oldInventory).filter(n=>oldInventory[n]!==newInventory[n]),[binding.target.runtime_path]);
  const beforeText=checkedRead(base,binding.target.runtime_path).toString('utf8'),afterText=checkedRead(runtime,binding.target.runtime_path).toString('utf8');
  assert.equal(beforeText.split(binding.target.old_literal).length-1,1);
  assert.equal(beforeText.replace(binding.target.old_literal,binding.target.new_literal),afterText);
  result.preimport={public_module_pins:Object.keys(binding.public_import_closure).length,repo_pins:Object.keys(binding.repo_pins).length,full_runtime_files:Object.keys(oldInventory).length,all_other_runtime_bytes_equal:true,one_existing_function_delta:true};
  globalThis.fetch=async()=>{trappedFetch++;throw Error('CONTROLLED_CASE_NETWORK_FORBIDDEN');};
  const load=(root,name)=>import(pathToFileURL(path.join(root,name)).href);
  const [oldContext,context,audit,normalizer,oldFormatter,formatter]=await Promise.all([
   load(base,'src/block-result-context.mjs'),load(runtime,'src/block-result-context.mjs'),
   load(runtime,'src/candidate-evidence-v2-runtime.mjs'),load(runtime,'src/bitget-n12-bounded-trade-sample.mjs'),
   load(base,'src/manual-report-formatter.mjs'),load(runtime,'src/manual-report-formatter.mjs'),
  ]);
  const T=1792754401000,windowEnd=1792754400000,contract='ETH-USDT';
  const produce=market=>normalizer.normalizeBitgetN12BoundedTradeSample({contract,market,identity:{chain:'ethereum',asset_kind:'NATIVE',native_asset_id:'ethereum:mainnet',contract_or_mint:null},identity_method:'HTX_OFFICIAL_NATIVE_CURRENCY_NETWORK',exact_asset_binding:true,window_end_ts:windowEnd,observed_ts:T,pages:[{code:'00000',data:[{tradeId:'900000000000000001',symbol:'ETHUSDT',ts:windowEnd-1000,price:'2',size:'3',side:'buy'},{tradeId:'900000000000000002',symbol:'ETHUSDT',ts:windowEnd-2000,price:'2',size:'1',side:'sell'}]}]});
  const render=(api,fmt,row)=>{
   const evidence=[row],sources={EXTERNAL_N05_FLOW:{status:'CLOSED_BOUNDED_SAMPLE',check_completed:true,network_calls:0,evidence,receipts:[]}};
   const coverage=audit.auditCandidateBlocks({evidence,sources,decision_ts:T});
   const available=api.consumeBlockResultContext({evidence,contract,now:T});
   const canonical={status:'CLOSED',state:'OBSERVE',direction:null,run_id:'CONTROLLED_CONTEXT_ORIGIN_BINDING',snapshot_id:'CONTROLLED_CONTEXT_ORIGIN_SNAPSHOT',snapshot_time_utc:new Date(T).toISOString(),observed_ts:T,scores:{overall_0_100:null,coin_interest_0_100:null},metadata:{contract,internal_market_context:{internal_only:true,decision_ts:T,evidence_v2:{evidence,sources,block_coverage:coverage}},supporting_context:{facts:available.facts}}};
   const original=JSON.stringify(canonical);const manual=fmt.formatManualReport(canonical);assert.equal(manual.ok,true);
   const rendered=api.auditRenderedBlockResults({canonical,manual});assert.equal(JSON.stringify(canonical),original);
   return{coverage,available,manual,rendered};
  };
  const stripNew=x=>{const v=JSON.parse(JSON.stringify(x));for(const r of v.context_receipts||[])for(const o of r.component_origins||[]){delete o.unit;delete o.origin_event_id;}return v;};
  for(const market of ['SPOT','FUTURES']){
   const produced=produce(market);assert.equal(produced.status,'CLOSED_BOUNDED_SAMPLE');assert.equal(produced.evidence.length,1);
   const row=produced.evidence[0];assert.equal(row.unit,'USDT');assert.equal(row.origin_event_id,row.physical_root_key);
   const old=render(oldContext,oldFormatter,row),next=render(context,formatter,row);
   assert(old.coverage.blocks.N12.source_checks.EXTERNAL_N05_FLOW.valid_evidence_ids.includes(row.evidence_id));
   assert.deepEqual(old.coverage,next.coverage);assert.equal(old.manual.text,next.manual.text);
   assert.equal(old.rendered.context_receipts.length,1);assert.equal(next.rendered.context_receipts.length,1);
   const previous=old.rendered.context_receipts[0].component_origins[0],origin=next.rendered.context_receipts[0].component_origins[0];
   assert(!Object.hasOwn(previous,'unit')&&!Object.hasOwn(previous,'origin_event_id'));
   assert.equal(origin.unit,row.unit);assert.equal(origin.origin_event_id,row.origin_event_id);assert.equal(origin.raw_hash,row.raw_hash);
   for(const key of ['evidence_id','provider_id','upstream_id','asset_id','htx_contract','source_ts','observed_ts','first_known_ts','expires_at','market'])assert.equal(origin[key],row[key]);
   assert.equal(origin.window_start_ts,null);assert.equal(origin.window_end_ts,null);assert.equal(origin.window_status,'NOT_RETAINED_IN_EVIDENCE');
   assert.deepEqual(stripNew(next.rendered),old.rendered);assert.equal(next.rendered.telegram_delivery_proven,false);
   result.completed_new_context_origin_variants.push('ACTUAL_PUBLIC_PRODUCER_'+market+'_UNIT_EVENT_ID_PRESERVED_TEXT_COVERAGE_CLOCKS_IDENTICAL');result.new_controlled_variants++;
  }
  {
   const row={...produce('SPOT').evidence[0],unit:null};
   const old=render(oldContext,oldFormatter,row),next=render(context,formatter,row);
   assert.equal(old.rendered.context_receipts.length,0);assert.equal(next.rendered.context_receipts.length,0);assert.equal(old.manual.text,next.manual.text);
   result.completed_new_context_origin_variants.push('MISSING_REQUIRED_PRODUCER_UNIT_STILL_REFUSES_NO_INVENTED_USDT');result.new_controlled_variants++;
  }
  {
   const row={...produce('SPOT').evidence[0]};
   // CONTROLLED overlength identifier admitted by existing public validators.
   // It is not a historical Bitget response or an original source fact.
   const longId=row.origin_event_id+':'+('x'.repeat(192));row.origin_event_id=longId;row.physical_root_key=longId;
   const old=render(oldContext,oldFormatter,row),next=render(context,formatter,row);
   assert.equal(next.rendered.context_receipts.length,1);const origin=next.rendered.context_receipts[0].component_origins[0];
   assert.equal(origin.origin_event_id,null);assert.equal(origin.unit,'USDT');assert.equal(old.manual.text,next.manual.text);assert.deepEqual(stripNew(next.rendered),old.rendered);
   result.completed_new_context_origin_variants.push('OVERLENGTH_EVENT_ID_NULL_WITHOUT_ROOT_FALLBACK_OR_TEXT_CHANGE');result.new_controlled_variants++;
  }
  assert.equal(trappedFetch,0);result.new_controlled_groups=1;result.status='COMPLETE';result.network_attempts=trappedFetch;
  result.limits=['CONTROLLED inputs only, no oldRLC causal reconstruction','Normalized hash is not independently retained provider body ACK','No fullMAIN/worker/native SQL/provider/Telegram','No source current105 coverage/daygrant/unknown clearing','CPU/heap/latency/native wire or artifact durability unqualified'];
  return result;
 }catch(error){
  const e=error instanceof Error?error:Error(String(error));result.status='INCOMPLETE';result.network_attempts=trappedFetch;e.partial_result=JSON.parse(JSON.stringify(result));throw e;
 }finally{globalThis.fetch=priorFetch;}
}
