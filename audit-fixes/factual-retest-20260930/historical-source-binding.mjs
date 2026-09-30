import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {FixtureDB} from '../../post-v7-consolidated/liquidation/liquidation-extension/delivery/tests/db-fixture.mjs';
const root=path.resolve(process.argv[2]||'runtime'),out=process.argv[3]||'audit-output/historical-source-binding.json';
const mod=name=>import(pathToFileURL(path.join(root,'src',name)).href);
const pub=await mod('canonical-publication.mjs'),sender=await mod('bound-telegram-delivery-sidecar.mjs');
const {buildRoleEvidenceView}=await mod('source-role-consumer.mjs');
const {collectFullEvidenceSourceFacts}=await mod('full-evidence-source-binding.mjs');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const start=1790449221000,end=1790794821000;
const result=await db.prepare(`SELECT publication_id,wave_id,decision_id,contract_code,observed_ts,canonical_state FROM canonical_publication_shadow WHERE observed_ts>=?1 AND observed_ts<=?2 ORDER BY observed_ts,publication_id LIMIT 401`).bind(start,end).all();
const rows=result.results;assert.ok(rows.length>0&&rows.length<=400,'bounded exact four-day archive');
const output=[];
async function chain(c,wave_id,decision_id){
 const action=pub.assessActionability({canonical:c,lifecycle_event:'OBSERVE'});
 if(!action.deliver)return {would_attempt:false,reason:action.reason};
 const local=new FixtureDB();let captured=null;
 try{
  const manual=pub.renderCanonicalManual({canonical:c});assert.equal(manual.ok,true);
  const p=await pub.persistCanonicalSnapshot(local,{canonical:c,presentation_inputs:{manual_text:manual.text},wave_id,decision_id,now_ts:c.observed_ts});assert.equal(p.persisted,true);
  const contract=c.metadata.contract;
  local.raw.prepare('INSERT INTO v3_user_lifecycle_shadow VALUES(?,?,?,?,?,?,?,?,?,1)').run(contract,c.direction,wave_id,'v3','OBSERVE','historical replay',c.observed_ts,c.trigger.expires_ts,c.observed_ts);
  local.raw.prepare("INSERT INTO v3_telegram_dispatch_shadow(dispatch_id,idempotency_key,contract,direction,wave_id,lifecycle_event,rules_version,state,created_ts,updated_ts,shadow_only) VALUES(?,?,?,?,?,?,?,'PENDING',?,?,1)").run(`D:${p.publication_id}`,`K:${p.publication_id}`,contract,c.direction,wave_id,'OBSERVE','v3',c.observed_ts,c.observed_ts);
  const sent=await sender.runBoundTelegramDeliverySidecar(local,{enabled:true,relay_url:'https://transport-capture.invalid/no-network',relay_key:'ISOLATED_CAPTURE_ONLY',source_run_id:c.run_id,now_ts:c.observed_ts+1000,fetch_impl:async(url,options)=>{captured=JSON.parse(options.body);return new Response(JSON.stringify({ok:false,error:'ISOLATED_DRY_RUN_NO_TELEGRAM'}),{status:503,headers:{'content-type':'application/json'}});}});
  assert.equal(sent.sent,0,'never fabricate Telegram SENT or a message id');
  return {would_attempt:captured!==null,reason:captured?'EXACT_BOUND_PAYLOAD_REACHED_TRANSPORT_CAPTURE':sent.status,payload:captured,canonical_publication_id:p.publication_id};
 }finally{local.close();}
}
for(const row of rows){
 if(row.canonical_state!=='OBSERVE'){
  output.push({publication_id:row.publication_id,contract:row.contract_code,wave_id:row.wave_id,observed_ts:row.observed_ts,state:row.canonical_state,before:{would_attempt:false,reason:'UNCHANGED_NON_OBSERVE_STATE'},after:{would_attempt:false,reason:'UNCHANGED_NON_OBSERVE_STATE'}});
  continue;
 }
 const detail=await db.prepare(`SELECT c.canonical_json,f.stage392_proof_bundle_json FROM canonical_publication_shadow c LEFT JOIN full_evidence_shadow_log f ON f.contract_code=c.contract_code AND f.observed_ts=c.observed_ts WHERE c.publication_id=?1 LIMIT 1`).bind(row.publication_id).first();
 assert.ok(detail?.canonical_json,'exact archived canonical readback');
 Object.assign(row,detail);
 const old=JSON.parse(row.canonical_json),next=structuredClone(old),contract=old.metadata?.contract;
 if(!['LONG','SHORT'].includes(old.direction)||['BTC-USDT','ETH-USDT'].includes(contract))continue;
 const bundle=row.stage392_proof_bundle_json?JSON.parse(row.stage392_proof_bundle_json):null;
 // The archived object remains PREPARED_UNACKNOWLEDGED. Reading the actual D1
 // row proves preservation of its facts; no imaginary insert ACK is supplied.
 const facts=collectFullEvidenceSourceFacts(bundle,{contract,snapshot_id:old.snapshot_id,observed_ts:old.observed_ts});
 next.source_receipts=[...(old.source_receipts||[]),...facts];
 next.metadata.source_role_view=buildRoleEvidenceView(next.source_receipts,{contract,observed_ts:next.observed_ts});
 next.analytical_fingerprint=pub.canonicalFingerprint(next);
 for(const key of ['state','direction','scores','entry','trigger','invalidation','targets','hard_gates','early_candidate','opportunity','liquidations'])assert.deepEqual(next[key],old[key],`strategy unchanged: ${key}`);
 const before=await chain(old,row.wave_id,row.decision_id),after=await chain(next,row.wave_id,row.decision_id);
 output.push({publication_id:row.publication_id,contract,wave_id:row.wave_id,observed_ts:old.observed_ts,state:old.state,interest:old.scores?.coin_interest_0_100,admitted_fact_count:facts.length,independent_origins:[...new Set(next.metadata.source_role_view.classified.filter(x=>x.role_evidence_usable).map(x=>x.independence_group))],before,after});
}
const recovered=output.filter(x=>!x.before.would_attempt&&x.after.would_attempt);
const summary={schema:'factual-source-binding-four-day-replay-v1',status:recovered.length?'PASS':'NO_ADDITIONAL_TRANSPORT_PROVEN',window_start:start,window_end:end,archive_rows:rows.length,compared_rows:output.length,recovered_snapshots:recovered.length,recovered_unique_waves:new Set(recovered.map(x=>[x.contract,x.wave_id].join('|'))).size,recovered:recovered.map(x=>({publication_id:x.publication_id,contract:x.contract,observed_ts:x.observed_ts,independent_origins:x.independent_origins})),strategy_changed:false,publication_gates_changed:false,historical_ack_fabricated:false,production_rows_written:db.usageSnapshot().rows_written,telegram_network_calls:0,telegram_sent:0,usage:db.usageSnapshot(),rows:output};
assert.equal(summary.production_rows_written,0);
fs.writeFileSync(out,JSON.stringify(summary,null,2));
console.log('HISTORICAL_SOURCE_BINDING_RESULT',JSON.stringify({...summary,rows:undefined}));
if(!recovered.length)process.exitCode=1;
