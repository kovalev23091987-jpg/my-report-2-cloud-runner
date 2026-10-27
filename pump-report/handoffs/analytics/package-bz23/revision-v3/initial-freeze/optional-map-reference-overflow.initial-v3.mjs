import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const a=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const root=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json','utf8')).lease;
assert.equal(a.status,'ADMITTED_ONE_BZ23_OPTIONAL_MAP_REFERENCE_OVERFLOW_CASE_V3');
assert.equal(a.root_owner,root.owner);assert(Date.now()<a.expires_ts&&a.expires_ts<=root.expires_ts&&!root.released);
assert.equal(a.case_count,1);assert.equal(a.real_HTTP,0);assert.equal(a.native_SQL,0);assert.equal(a.Telegram,0);
for(const [p,h]of Object.entries(a.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const cachedBytes=fs.readFileSync(a.cached_baseline);assert.equal(sha(cachedBytes),a.cached_baseline_sha256);
const cached=JSON.parse(cachedBytes).cases.find(row=>row.case_id==='AIN_AUTO_20261026_READY_STALE');assert(cached?.baseline_analysis.ready);
fs.writeFileSync(a.proof_path+'.attempt',JSON.stringify({started_ts:Date.now(),case_count:1,real_IO:0})+'\n',{flag:'wx',mode:0o600});
globalThis.fetch=()=>{throw Error('REAL_NETWORK_FORBIDDEN');};
const live=await import('../../../analytics/feature-capsule.mjs');
const {MemoryStore}=await import('../../../runtime/store.mjs');
const {createRetainedCapsuleWriter}=await import('../../../runtime/retained-capsules.mjs');
const incomplete='SUPPLIED_INPUT_MAP_REFERENCE_INVENTORY_INCOMPLETE';
const make=async(name,zones)=>{
  const analysis=structuredClone(cached.baseline_analysis),input=structuredClone(cached.input);
  analysis.run_id=input.run_id='ARTIFICIAL_BZ23_V3_'+name;
  input.liquidations={...(input.liquidations??{}),zones};
  return {analysis_key:'pump:analysis:'+await live.capsuleDigest(analysis),analysis,input};
};
const extras=args=>({card:{card_id:'ARTIFICIAL_V3_CARD',state:'UNKNOWN',analysis:{source_input_key:args.analysis_key},receipt:{state:'UNKNOWN'}},
  journal:{analyses:[{analysis_id:args.analysis_key}],frozen_anchor:{analysis_id:args.analysis_key},publications:[{card_id:'ARTIFICIAL_V3_CARD',state:'UNKNOWN',receipt_ref:'ARTIFICIAL_V3_RECEIPT'}]},
  signal:{signal_id:'pump:signal:ARTIFICIAL_V3_PRIORITY',analysis_key:args.analysis_key},summary_head:{pending:{id:'ARTIFICIAL_V3_PENDING'}},
  ordered_items:[{id:'ARTIFICIAL_V3_ORDERED'}],members:[{id:'ARTIFICIAL_V3_MEMBER'}],summary_records:[{record_id:'ARTIFICIAL_V3_RECORD',origin:{signal_id:'pump:signal:ARTIFICIAL_V3_PRIORITY'},publication:{receipt_ref:'ARTIFICIAL_V3_RECEIPT'}}],
  external_audit_refs:['ARTIFICIAL_V3_AUDIT'],owner_original_refs:['ARTIFICIAL_V3_OWNER']});
const safety=p=>{
  assert(p.edges.length<=256);assert(bytes(p)<=65536);assert(p.reasons.includes(incomplete));assert(p.reasons.includes('ORIGINALS_REQUIRED_FOR_REFERENCE_OVERFLOW'));
  assert.equal(p.originals_required,true);assert.equal(p.delete_allowed,false);assert.equal(p.approved_delete_ttl_ms,null);
  assert.equal(p.inventory_complete_for_global_cleanup,false);assert.equal(p.archive_reader_verified,false);
};
const results=[];
async function exercise(name,zones,bound){
  const args=await make(name,zones),snapshot=JSON.stringify(args),plan=JSON.stringify(args.analysis.plan);
  const empty=structuredClone(args);empty.input.liquidations.zones=[];
  const core=await live.projectProtectedReferences({...empty,...extras(empty)});
  const projected=await live.projectProtectedReferences({...args,...extras(args)});safety(projected);
  assert.deepEqual(projected.edges.slice(0,core.edges.length),core.edges,'all core/card/journal/summary/audit/owner edges precede optional map');
  assert.equal(new Set(projected.edges.map(e=>JSON.stringify([e.from,e.to,e.kind]))).size,projected.edges.length);
  if(bound==='EDGES')assert.equal(projected.edges.length,256,'short distinct refs reach global edge cap safely');
  if(bound==='UTF8_BYTES'){assert(projected.edges.length<256,'UTF8 byte cap precedes edge cap');assert(projected.edges.length>core.edges.length);}
  const saved={analysis:args.analysis,input:args.input,saved_ts:args.analysis.analysis_ts,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'};
  const store=new MemoryStore();await store.set(args.analysis_key,saved);const originalBytes=JSON.stringify(await store.get(args.analysis_key));
  const writer=createRetainedCapsuleWriter({store,implementation_sha256:a.fixture_implementation_sha256,evidence_class:'ARTIFICIAL'});
  const remembered=await writer.remember(args.analysis_key);assert.equal(remembered.status,'SAVED');
  const retained=await store.get(remembered.protected_refs.key);safety(retained.projection);
  assert.equal(await live.capsuleDigest(retained.projection),remembered.protected_refs.sha256);
  assert.equal(JSON.stringify(await store.get(args.analysis_key)),originalBytes,'full original inventory stays exact');
  assert.equal(JSON.stringify(args),snapshot);assert.equal(JSON.stringify(args.analysis.plan),plan);assert.equal(args.analysis.ready,true);
  assert.equal(remembered.feature_sha256,(await live.prepareFeatureCapsule({...args,implementation_sha256:a.fixture_implementation_sha256,recorded_ts:args.analysis.analysis_ts,evidence_class:'ARTIFICIAL'})).sha256);
  results.push({name,bound,projected_edges:projected.edges.length,projected_UTF8_bytes:bytes(projected),writer_status:remembered.status,original_and_READY_plan_unchanged:true});
}
const distinct=Array.from({length:257},(_,i)=>({evidence_ref:'V3_'+i}));
await exercise('DISTINCT_257',distinct,'EDGES');
const long=Array.from({length:257},(_,i)=>({evidence_ref:('ARTIFICIAL_V3_'+i+'_').padEnd(512,'Ж')}));
assert(long.every(z=>z.evidence_ref.length===512&&new TextEncoder().encode(z.evidence_ref).length>512));
await exercise('LONG_UTF8_257',long,'UTF8_BYTES');
await exercise('MALFORMED_OPTIONAL',[{evidence_ref:42},{identity_evidence_ref:'x'.repeat(513)},{model_evidence_ref:{invalid:true}},{evidence_ref:'ARTIFICIAL_V3_VALID_AFTER_INVALID'}],'MALFORMED');
const strict=await make('STRICT_CORE',[]);
const badSelected=structuredClone(strict);badSelected.analysis.liquidations={...(badSelected.analysis.liquidations??{}),zones_up:[{evidence_ref:'x'.repeat(513)}]};
badSelected.analysis_key='pump:analysis:'+await live.capsuleDigest(badSelected.analysis);
await assert.rejects(live.projectProtectedReferences(badSelected),/CAPSULE_REFERENCE_INVALID/);
const refs=(prefix,long=false)=>Array.from({length:64},(_,i)=>long?(prefix+i).padEnd(512,'Ж'):prefix+i);
await assert.rejects(live.projectProtectedReferences({...strict,ordered_items:refs('ORDERED').map(id=>({id})),members:refs('MEMBER').map(id=>({id})),external_audit_refs:refs('AUDIT'),owner_original_refs:refs('OWNER')}),/PROTECTED_REFERENCE_BOUND_EXCEEDED/);
await assert.rejects(live.projectProtectedReferences({...strict,external_audit_refs:refs('AUDIT',true),owner_original_refs:refs('OWNER',true)}),/CAPSULE_BYTE_BOUND_EXCEEDED/);
const malformedArray=structuredClone(strict);malformedArray.input.liquidations.zones={invalid:true};safety(await live.projectProtectedReferences(malformedArray));
assert.equal(sha(fs.readFileSync(a.cached_baseline)),a.cached_baseline_sha256,'retained cache bytes unchanged');
const proof={schema:'BZ23_ONE_NEW_OPTIONAL_MAP_REFERENCE_OVERFLOW_CASE_V3',status:'PASS',case_count:1,fixture_class:'ARTIFICIAL_OPTIONAL_RAW_MAP_METADATA_ON_CACHED_GENUINE_READY_INPUT',results,
  strict_core_and_selected_errors_preserved:true,core_edges_before_optional:true,originals_and_plan_unchanged:true,unique_edge_and_UTF8_caps_preserved:true,malformed_optional_incomplete:true,
  V2_accepted_case_repeated:false,delete_allowed:false,approved_delete_ttl_ms:null,global_reference_closure:false,engine_calls:0,real_HTTP:0,native_SQL:0,Telegram:0,builds:0,production_deployed:false};
fs.writeFileSync(a.proof_path,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(proof));
