import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const binding=JSON.parse(readFileSync(resolve(dir,'original-binding.json')));
const archive=resolve(dir,binding.archive);assert.equal(sha(readFileSync(archive)),binding.archive_sha256);
const members=JSON.parse(execFileSync('python3',['-c',`import sys,json,zipfile,hashlib
with zipfile.ZipFile(sys.argv[1]) as z:
 out={n:{'sha256':hashlib.sha256(z.read(n)).hexdigest(),'value':json.loads(z.read(n))} for n in z.namelist() if n.split('/')[-1] in ['report2-run-result.json','report2-completion-accounting.json','automatic-delivery-audit.json','same-run-delivery-proof.json','private-canonical-archive-receipt.json']}
 print(json.dumps(out))`,archive],{maxBuffer:4*1024*1024}).toString());
for(const [name,row] of Object.entries(members))assert.equal(row.sha256,binding.member_sha256[name]);
const get=name=>{const matches=Object.entries(members).filter(([n])=>n.split('/').at(-1)===name);assert.equal(matches.length,1);return matches[0][1].value;};
const run=get('report2-run-result.json'),completion=get('report2-completion-accounting.json');
assert.equal(run.head,binding.source_head);assert.equal(completion.head,run.head);assert.equal(completion.run_id,run.run_id);assert.equal(String(completion.cloud_run),String(binding.cloud_run));
const candidate=run.candidates.find(c=>c.contract==='UNI-USDT');assert.ok(candidate);
const liq=candidate.canonical.liquidations,native=liq.native_extension;
assert.equal(candidate.direction,'SHORT');assert.equal(candidate.canonical.direction,'SHORT');
assert.equal(native.binding.direction,'SHORT');assert.equal(native.binding.run_id,run.run_id);assert.equal(native.binding.snapshot_id,candidate.snapshot_id);assert.equal(native.binding.observed_ts,candidate.observed_ts);
assert.equal(native.status,'USABLE_NATIVE_SAMPLE');assert.equal(native.freshness_max_age_ms,120000);
assert.equal(native.source_ts,1792334363893);assert.equal(native.source_age_ms,candidate.observed_ts-native.source_ts);
const zones=[...native.above,...native.below];assert.equal(zones.length,1);assert.equal(zones[0].source_ts,native.source_ts);assert.equal(liq.independent_extensions.length,0);
const deadline=native.source_ts+native.freshness_max_age_ms;
const atCandidate=candidate.observed_ts-native.source_ts,atRecorded=completion.recorded_ts-native.source_ts;
assert.equal(atCandidate,52164);assert.equal(atRecorded,64239);assert.ok(atRecorded<native.freshness_max_age_ms);
const failed=completion.delivery.lifecycle.find(r=>r.key.startsWith('UNI-USDT|'));
assert.equal(failed.status,'FAILED_RETRYABLE');assert.equal(failed.reason,'NATIVE_LIQUIDATION_SOURCE_STALE');assert.equal(failed.sent,false);
const [contract,direction,wave,event,rules]=failed.key.split('|');assert.equal(contract,candidate.contract);assert.equal(direction,'LONG');assert.notEqual(direction,candidate.direction);assert.notEqual(wave,candidate.wave_id);
assert.equal(failed.publication_id,undefined);assert.equal(failed.bound_receipt,undefined);
const reconciliation=completion.delivery.reconciliation;assert.equal(reconciliation.processed,1);assert.equal(reconciliation.capacity_deferred,1);
assert.ok(reconciliation.results.every(r=>!r.key.startsWith('UNI-USDT|')));
const proof=get('same-run-delivery-proof.json'),deliveryAudit=get('automatic-delivery-audit.json'),privateCopy=get('private-canonical-archive-receipt.json');
assert.equal(proof.status,'NO_EXACT_SAME_RUN_SENT_CAPTURED');assert.equal(deliveryAudit.exact_SENT,0);assert.equal(privateCopy.private_payload_exported,false);
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
const {fingerprint,...body}=native;assert.equal(sha(JSON.stringify(stable(body))),fingerprint);
const code=['current-generation/files/src/liquidation-extension/runtime-bridge.mjs','current-generation/files/src/liquidation-extension/providers.mjs','current-generation/files/src/native-liquidation-guard.mjs','current-generation/files/src/liquidation-extension/native-liquidation-guard.mjs','current-generation/files/src/canonical-publication.mjs','current-generation/files/src/publication-reconciler.mjs','current-generation/files/src/bound-telegram-delivery-sidecar.mjs'];
const result={schema:'SAVED_UNI_DISTINCT_PUBLICATION_LIQ_FRESHNESS_AUDIT_V1',working_base:'aac691c24af81f5e18c661759b3f2c81713f8b3b',original:binding,
 source_code_sha256:Object.fromEntries(code.map(p=>[p,sha(readFileSync(resolve(root,p)))])),
 current_candidate:{publication_id:candidate.publication_id,contract:candidate.contract,direction:candidate.direction,wave_id:candidate.wave_id,run_id:candidate.run_id,snapshot_id:candidate.snapshot_id,observed_ts:candidate.observed_ts,valid_until_ts:candidate.valid_until_ts,canonical_state:candidate.canonical_state,analytical_fingerprint:candidate.canonical.analytical_fingerprint},
 retained_current_native_context:native,retained_context_digest_matches:true,digest_is_not_raw_account_proof:true,
 source_clock_math:{source_ts:native.source_ts,source_UTC:new Date(native.source_ts).toISOString(),max_age_ms:native.freshness_max_age_ms,last_nonstale_checked_ts:deadline,last_nonstale_checked_UTC:new Date(deadline).toISOString(),first_stale_checked_ts:deadline+1,
  candidate_age_ms:atCandidate,completion_recorded_ts:completion.recorded_ts,age_at_completion_recorded_ms:atRecorded,headroom_at_candidate_ms:native.freshness_max_age_ms-atCandidate,headroom_at_completion_recorded_ms:native.freshness_max_age_ms-atRecorded,
  current_source_and_zone_would_not_be_stale_at_recorded_time:true,actual_failed_dispatch_checked_ts:null,actual_failed_dispatch_source_ts:null,actual_failed_dispatch_provider:null,
  guard_unchanged:true,no_current_time_or_source_clock_refresh:true,comparison_is_arithmetic_not_execution_of_full_guard:true},
 failed_dispatch:{...failed,parsed_key:{contract,direction,wave_id:wave,lifecycle_event:event,rules_version:rules},publication_id:null,source_run_id:null,snapshot_id:null,checked_ts:null,original_native_context:null},
 failed_dispatch_is_current_candidate:false,identity_mismatch_fields:['direction','wave_id'],do_not_bind_by_contract_only:true,
 reconciliation:{processed:reconciliation.processed,capacity_deferred:reconciliation.capacity_deferred,results:reconciliation.results,deferred_row_identity_retained:false,current_UNI_deferred_inferred:false},
 actual_source_acquisition_routes:run.liquidation_source_acquisition_audit.routes.filter(r=>r.contract==='UNI-USDT'),
 missing_originals:['failed dispatch binding/publication canonical identity and original native context','exact original failed-attempt checked_ts or immutable attempt event','identity of deferred reconciliation row'],
 source_body_limits:{canonical_projection_only:true,full_canonical_present:false,raw_accounts_persisted:native.raw_accounts_persisted,private_copy_status:privateCopy.status,private_payload_exported:privateCopy.private_payload_exported,old_failed_publication_in_this_projection:false},
 code_path_notes:['Native producer preserves original account state.time, selects oldest account source clock, max age120000 at canonical binding. Compact context preserves source/zone clocks and USDC; raw accounts are not persisted here.',
  'loadBoundTelegram reads dispatch binding then its exact stored canonical publication; current run source_run_id does not replace that immutable identity.',
  'Freshness checked against sidecar fixed now before publication valid_until expiry; stale is mapped FAILED_RETRYABLE. If an old bound publication is already expired, expiry can be masked. Actual old UNI expiry is not retained and is not asserted.',
  'Administrative reconciliation selects its one terminal row and leaves capacity_deferred; lifecycle then independently prioritizes bound rows. Deferred1 does not identify current UNI in the artifact.',
  'Failure lifecycle receipt contains only key/status/reason/sent. The actual failed publication, guard-source clock and checked time are not retained.'],
 delivery:{current_run_exact_SENT:deliveryAudit.exact_SENT,actual_ENTRY:deliveryAudit.actual_ENTRY,terminal_APR_sent_message_id:completion.delivery.lifecycle.find(r=>r.key.startsWith('APR-'))?.message_id??null,terminal_APR_is_current_UNI_delivery:false},
 proposed_next:'Read exact already bound failed key and source timestamps under coordinator-only admission if absent in saved logs. Do not widen freshness, substitute current SHORT into old LONG, refresh source clocks, force a new report or infer provider outage.',
 provider_HTTP:0,native_SQL:0,deploy_MAIN_Telegram:0,shared_or_runtime_files_changed:false,accepted_tests_repeated:0,full_canonical_reconstructed:false};
const target=process.argv[2]||resolve(dir,'analysis.json');writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',contract:'UNI-USDT',identities_distinct:true,current_native_age_ms:atCandidate,age_at_recorded_ms:atRecorded,failed_attempt_binding:'NOT_RETAINED',output:target}));
