import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Author prepares text only. ROOT owns one affected connected qualification.
export async function runCurrent86LoggingPaidCompatibilityConnected({repo_root}={}){
 const partial={schema:'CURRENT86_LOGGING_PAID_AFFECTED_CONTROLLED_V1',status:'PREPARED_UNEXECUTED',qualification_basis:'CONTROLLED_METADATA_AND_FINGERPRINT_BINDINGS_NOT_NATIVE',groups:[],variants:[],completed_groups:0,completed_variants:0,source_author_Node_import_tests:0,native_CF:0,SQL:0,provider:0};
 const savedFetch=globalThis.fetch;let trapped=false;
 try{
  assert.equal(typeof repo_root,'string');assert(path.isAbsolute(repo_root));const root=await fs.realpath(repo_root),prefix='checkpoints/logging-only-controller-connected-20261023/source-qualified';
  const digest=b=>createHash('sha256').update(b).digest('hex');
  const read=async p=>{const absolute=path.join(root,p),s=await fs.lstat(absolute);assert(s.isFile()&&!s.isSymbolicLink()&&s.size<=2097152);assert.equal(await fs.realpath(absolute),absolute);return fs.readFile(absolute);};
  const manifest=JSON.parse(await read(prefix+'/manifest.json'));
  for(const [name,pin]of Object.entries(manifest.files)){const b=await read(prefix+'/'+name);assert.equal(b.length,pin.bytes);assert.equal(digest(b),pin.sha256);}
  const pins=JSON.parse(await read(prefix+'/source-pins.json')),binding=JSON.parse(await read(prefix+'/target-bindings.json')),actual={};
  for(const [p,pin]of Object.entries(pins.files)){const b=await read(p),target=binding.targets[p];assert.equal(b.length,target?.after_bytes??pin.bytes);assert.equal(digest(b),target?.after_sha256??pin.sha256);actual[p]=b.toString('utf8');}
  for(const [p,pin]of Object.entries(binding.targets)){const b=await read(p);assert.equal(b.length,pin.after_bytes);assert.equal(digest(b),pin.after_sha256);actual[p]=b.toString('utf8');}
  if(process.argv[1]&&path.resolve(process.argv[1])===path.join(root,'tools/rollout-correlated-sql-bridge-20261022.mjs'))throw Error('CONTROLLED_CASE_NOT_NATIVE_CLI_ENTRY');
  globalThis.fetch=async()=>{throw Error('CONTROLLED_CASE_NETWORK_FORBIDDEN');};trapped=true;
  const mod=await import(pathToFileURL(path.join(root,'runner/retention-bridge-provenance.mjs')).href),metadata=await import(pathToFileURL(path.join(root,'runner/htx-coordinated-rollout.mjs')).href),cli=await import(pathToFileURL(path.join(root,'tools/rollout-correlated-sql-bridge-20261022.mjs')).href);
  const {rolloutDigest,workerSettingsFingerprint,correlatedLogsIntent}=metadata;
  const oldBytes=await read(mod.RETENTION_SQL_BRIDGE_PROOF.path),stageBytes=await read(mod.CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path),old=mod.parseRetentionSQLBridgeProof(oldBytes),next=mod.parseCorrelatedRetentionSQLBridgeProof(stageBytes);
  const runtime={compatibility_date:'2026-09-01',compatibility_flags:[],usage_model:'standard',limits:{}},bindings=[{name:'DATA_DB',type:'d1',id:'057a2847-2cc4-4e52-8534-1be1596d21d5'},{name:'REPORT2_CLOUD_BRIDGE_TOKEN',type:'secret_text'},{name:'REPORT2_DENO_BRIDGE_TOKEN',type:'secret_text'}],names=bindings.map(x=>x.name).sort();
  const base={observability:{enabled:false,logs:{enabled:false}},bindings,...runtime},BASE=workerSettingsFingerprint(base),RUNTIME=rolloutDigest(runtime),desired=correlatedLogsIntent(base),H=workerSettingsFingerprint({...base,observability:desired}),{observability:unused,...rest}=base,WITHOUT=rolloutDigest(rest),dep='10000000-0000-4000-8000-000000000001';
  const proof=()=>({schema:'CURRENT86_LOGGING_ONLY_OPERATION_V1',status:'CURRENT86_LOGGING_KNOWN_ACK_AND_EXACT_READBACK',run:'10000000001',head:'1'.repeat(40),known_patch_ACK:true,logging_qualified:true,intent_before_IO:true,mutation_attempts:1,native_SQL:0,Worker_invocations:0,sourceHTTP:0,MAIN:0,Telegram:0,old_unknown_recovered:false,day_hold_removed:false,fixture_basis:'CONTROLLED_NOT_NATIVE',before:{version_id:next.version_id,deployment_id:dep,module_sha256:next.module_sha256,immutable_script_etag:next.immutable_script_etag,runtime_sha256:RUNTIME,crons_sha256:next.crons_sha256,binding_names:names,settings_sha256:BASE,settings_without_observability_sha256:WITHOUT},intent:{actual_before_settings_sha256:BASE,baseline_without_observability_sha256:WITHOUT,baseline_observability_present:true,baseline_observability:base.observability,desired_observability:desired,desired_digest:rolloutDigest(desired),prospective_settings_sha256:H},after:{version_id:next.version_id,deployment_id:dep,module_sha256:next.module_sha256,immutable_script_etag:next.immutable_script_etag,runtime_sha256:RUNTIME,crons_sha256:next.crons_sha256,binding_names:names,settings_sha256:H,settings_without_observability_sha256:WITHOUT}});
  const text=actual['runner/retention-bridge-provenance.mjs'],a=text.indexOf('export function createRetentionSQLBridgeCompatibility('),z=text.indexOf('\nconst EXACT_COMPATIBLE_CONSUMERS=',a);assert(a>=0&&z>a);const factorySource=text.slice(a,z).replace(/^export /,'');
  // Exact actual factory BODY, with TWO named CONTROLLED fingerprint constants
  // and a CONTROLLED immutable receipt descriptor; no production override API.
  const controlled=(j=proof(),descriptorPatch={})=>{
   const raw=Buffer.from(JSON.stringify(j)),descriptor={...mod.CORRELATED_RETENTION_LOGGING_PROOF,sha256:rolloutDigest(raw),run:j.run,head:j.head,...descriptorPatch};
   const deps={parseRetentionSQLBridgeProof:mod.parseRetentionSQLBridgeProof,parseCorrelatedRetentionSQLBridgeProof:mod.parseCorrelatedRetentionSQLBridgeProof,SQL_BRIDGE_SCRIPT:'my-report-2-d1-bridge',singleActiveVersion:metadata.singleActiveVersion,selectedVersionSettings:metadata.selectedVersionSettings,workerSettingsFingerprint,rolloutDigest,correlatedLogsIntent,PAID_BRIDGE_NAMES:names,PAID_BRIDGE_SETTINGS_SHA256:BASE,PAID_BRIDGE_RUNTIME_SHA256:RUNTIME,CORRELATED_RETENTION_LOGGING_PROOF:descriptor};
   const factory=Function(...Object.keys(deps),'return ('+factorySource+');')(...Object.values(deps));
   return{factory,raw,descriptor,create:include=>factory({old_release_bytes:oldBytes,staged_receipt_bytes:stageBytes,...(include===false?{}:{logging_receipt_bytes:raw})})};
  };
  const transport=({identity=next,settings={...base,observability:desired},after_settings=settings,after_deployment=dep,runtime_value=runtime}={})=>{let deployments=0,calls=0;return{count:()=>calls,call:async(name,suffix)=>{assert.equal(name,'my-report-2-d1-bridge');calls++;if(suffix==='/subdomain')return{subdomain:'controlled'};if(suffix==='/deployments'){deployments++;return{deployments:[{id:deployments>1?after_deployment:dep,strategy:'percentage',versions:[{version_id:identity.version_id,percentage:100}]}]};}if(suffix==='/settings')return structuredClone(deployments>1?after_settings:settings);if(suffix==='/schedules')return[];if(suffix==='/versions/'+identity.version_id)return{id:identity.version_id,resources:{script:{etag:identity.immutable_script_etag},bindings:structuredClone((deployments>1?after_settings:settings).bindings),script_runtime:structuredClone(runtime_value)}};throw Error('CONTROLLED_ROUTE_REFUSED');}};};
  const observe=(session,t,stage)=>session.observe({call:t.call,configured_bridge_url:'https://my-report-2-d1-bridge.controlled.workers.dev/d1',stage,clock:()=>1000000000000});
  const bracket=async(session,t)=>{const before=await observe(session,t,'before_SQL'),after=await observe(session,t,'after_SQL');assert.equal(t.count(),9);return{before,after};};
  const row=async(name,fn)=>{await fn();partial.variants.push({name,status:'CONTROLLED_COMPLETED_NOT_NATIVE'});partial.completed_variants++;};
  await row('existing_policy_is_one_actual_reexport',async()=>{assert.equal(cli.correlatedLogsIntent,metadata.correlatedLogsIntent);assert.equal(rolloutDigest('export '+metadata.correlatedLogsIntent.toString()+'\n'),binding.pure_existing_policy_body_sha256);});
  await row('current86_H_same_session_exact_observability_only',async()=>{const r=await bracket(controlled().create(),transport());assert.equal(r.before.settings_sha256,H);assert.equal(r.after.settings_sha256,H);assert.equal(r.after.logging_settings_allowed,false);assert.equal(r.after.admission,false);});
  await row('new86_baseline_without_optional_receipt',async()=>{const r=await bracket(controlled().create(false),transport({settings:base}));assert.equal(r.after.settings_sha256,BASE);});
  await row('old7011_baseline_still_exact',async()=>{const r=await bracket(controlled().create(),transport({identity:old,settings:base}));assert.equal(r.after.version_id,old.version_id);});
  await row('old7011_H_refused',async()=>assert.rejects(()=>observe(controlled().create(),transport({identity:old}),'before_SQL')));
  await row('H_missing_proof_refused',async()=>assert.rejects(()=>observe(controlled().create(false),transport(),'before_SQL')));
  await row('UNKNOWN_PATCH_ACK_even_observed_H_refused',async()=>{const j=proof();j.known_patch_ACK=false;j.logging_qualified=false;assert.throws(()=>controlled(j).create());});
  await row('intent_not_saved_before_IO_refused',async()=>{const j=proof();j.intent_before_IO=false;assert.throws(()=>controlled(j).create());});
  await row('independent_receipt_digest_mismatch_refused',async()=>assert.throws(()=>controlled(proof(),{sha256:'0'.repeat(64)}).create()));
  await row('arbitrary_prospective_hash_refused',async()=>{const j=proof();j.intent.prospective_settings_sha256='0'.repeat(64);j.after.settings_sha256=j.intent.prospective_settings_sha256;await assert.rejects(()=>observe(controlled(j).create(),transport(),'before_SQL'));});
  await row('nonobservability_drift_refused',async()=>assert.rejects(()=>observe(controlled().create(),transport({settings:{...base,observability:desired,placement:{mode:'smart'}}}),'before_SQL')));
  await row('binding_or_runtime_drift_refused',async()=>{await assert.rejects(()=>observe(controlled().create(),transport({settings:{...base,observability:desired,bindings:[...bindings,{name:'FOREIGN',type:'plain_text',text:'x'}]}}),'before_SQL'));await assert.rejects(()=>observe(controlled().create(),transport({runtime_value:{...runtime,usage_model:'bundled'}}),'before_SQL'));});
  await row('deployment_changes_within_session_refused',async()=>{const t=transport({after_deployment:'10000000-0000-4000-8000-000000000002'}),s=controlled().create();await observe(s,t,'before_SQL');await assert.rejects(()=>observe(s,t,'after_SQL'));});
  await row('baseline_to_H_within_maintenance_refused',async()=>{const t=transport({settings:base,after_settings:{...base,observability:desired}}),s=controlled().create();await observe(s,t,'before_SQL');await assert.rejects(()=>observe(s,t,'after_SQL'));});
  await row('desired_or_baseline_observability_tamper_refused',async()=>{const j=proof();j.intent.baseline_observability={enabled:false,logs:{enabled:true}};await assert.rejects(()=>observe(controlled(j).create(),transport(),'before_SQL'));const k=proof();k.intent.desired_observability={...desired,logs:{...desired.logs,destinations:['external']}};k.intent.desired_digest=rolloutDigest(k.intent.desired_observability);await assert.rejects(()=>observe(controlled(k).create(),transport(),'before_SQL'));});
  await row('production_export_unpinned_synthetic_receipt_refused',async()=>assert.throws(()=>mod.createRetentionSQLBridgeCompatibility({old_release_bytes:oldBytes,staged_receipt_bytes:stageBytes,logging_receipt_bytes:controlled().raw})));
  for(const [target,marker,end,variable]of [['tools/run-paid-sliding-history-20261018.mjs','bridgeCompatibility=createRetentionSQLBridgeCompatibility(', '\n }','bridgeCompatibility'],['tools/recover-lossless-retained-history-20261014.mjs','bridge_proof=createRetentionSQLBridgeCompatibility(', '\n   let bridge_metadata_HTTP','bridge_proof']]){
   await row('actual_constructor_data_link_'+variable,async()=>{
    const source=actual[target],start=source.indexOf(marker),finish=source.indexOf(end,start);assert(start>=0&&finish>start);const snippet=source.slice(start,finish),c=controlled();let seenReceipt=null;
    const dataFS={readFile:async p=>{if(p===mod.RETENTION_SQL_BRIDGE_PROOF.path)return oldBytes;if(p===mod.CORRELATED_RETENTION_SQL_BRIDGE_PROOF.path)return stageBytes;if(p===mod.CORRELATED_RETENTION_LOGGING_PROOF.path)return c.raw;throw Error('CONTROLLED_DATA_PATH_REFUSED');}};
    const invoke=Function('fs','old_release_bytes','staged_receipt_bytes','createRetentionSQLBridgeCompatibility','RETENTION_SQL_BRIDGE_PROOF','CORRELATED_RETENTION_SQL_BRIDGE_PROOF','CORRELATED_RETENTION_LOGGING_PROOF','return (async()=>{let '+variable+';'+snippet+';return '+variable+';})();');
    const session=await invoke(dataFS,oldBytes,stageBytes,args=>{seenReceipt=args.logging_receipt_bytes;return c.factory(args);},mod.RETENTION_SQL_BRIDGE_PROOF,mod.CORRELATED_RETENTION_SQL_BRIDGE_PROOF,mod.CORRELATED_RETENTION_LOGGING_PROOF);assert.equal(rolloutDigest(seenReceipt),rolloutDigest(c.raw));await bracket(session,transport());
   });
  }
  partial.completed_groups=1;partial.groups=[{name:'EXACT_CURRENT86_LOGGING_THIRD_TUPLE_AND_TWO_CALLER_DATA_SEAMS',completed_variants:partial.completed_variants,status:'CONTROLLED_COMPLETED_NOT_NATIVE'}];partial.status='CONTROLLED_COMPONENT_COMPLETED_NOT_NATIVE';return partial;
 }catch(error){error.partial_result=partial;throw error;}finally{if(trapped)globalThis.fetch=savedFetch;}
}
