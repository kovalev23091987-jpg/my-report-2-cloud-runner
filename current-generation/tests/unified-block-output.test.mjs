import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_UNIFIED_MODULE_ROOT?pathToFileURL(path.resolve(process.env.REPORT2_UNIFIED_MODULE_ROOT)+'/'):new URL('../files/src/',import.meta.url);
const {consumeBlockResultContext,confirmedBlockContextFacts,auditRenderedBlockResults}=await import(new URL('block-result-context.mjs',root));
const {canonicalFingerprint,renderCanonicalTelegram,assessActionability}=await import(new URL('canonical-publication.mjs',root));
const {formatManualReport}=await import(new URL('manual-report-formatter.mjs',root));
const {normalizeOfficialFeed,parseOfficialFeed}=await import(new URL('official-events-evidence.mjs',root));
const {consumeCanonicalExecutionContext}=await import(new URL('execution-report-context.mjs',root));
const execution=JSON.parse(fs.readFileSync(new URL('../../checkpoints/execution-context-source-20261004.json',import.meta.url)));

const saved=JSON.parse(fs.readFileSync(new URL('../../checkpoints/btw-preserved-block-result-input-20261004.json',import.meta.url))).canonical;
// Presentation controls reuse genuine historical facts, but explicitly invent
// a display-only direction. No new candidate, score or delivery is asserted.
function control(){
 const c=structuredClone(saved);c.direction='LONG';c.state='OBSERVE';
 c.trigger={metric:'price',operator:'>=',value:1,unit:'USDT',timeframe:'5m',expires_ts:c.observed_ts+600000,next_recheck_ts:c.observed_ts+60000,cancel_condition:'price<1'};
 c.metadata.supporting_context={facts:consumeBlockResultContext({contract:c.metadata.contract,now:c.observed_ts,evidence:c.metadata.internal_market_context.evidence_v2.evidence}).facts};
 c.analytical_fingerprint=canonicalFingerprint(c);return c;
}
test('same genuine historical context retains historical V5 slots and full manual output',()=>{
 const c=control(),before=JSON.stringify(c),tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),manual=formatManualReport(c);
 assert.equal(tg.ok,true,tg.status);assert.equal(manual.ok,true,manual.status);
 const proof=auditRenderedBlockResults({canonical:c,manual,telegram:tg});
 assert.equal(proof.used_context_block_ids.length,4);assert.equal(proof.telegram_used_context_block_ids.length,2);
 assert.equal(proof.telegram_available_not_rendered_evidence_ids.length,2);
 assert.equal(proof.telegram_delivery_proven,false);assert.equal(proof.telegram_message_id,null);
 assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}).deliver,false);
 assert.equal(JSON.stringify(c),before);
 assert.equal(tg.text.match(/^• Наблюдение предложения токена:/gm)?.length,undefined);
 assert.equal(tg.text.includes('ДОПОЛНИТЕЛЬНЫЙ ПОДТВЕРЖДЁННЫЙ КОНТЕКСТ'),false);
});
test('unbound, changed, stale, foreign or future evidence cannot become approved Telegram facts',()=>{
 for(const change of [c=>{c.metadata.supporting_context.facts.forEach(f=>f.evidence_id='FORGED');},c=>{c.metadata.supporting_context.facts.forEach(f=>f.value='Изменённое утверждение');},c=>{c.metadata.internal_market_context.evidence_v2.evidence.forEach(r=>r.expires_at=0);},c=>{c.metadata.internal_market_context.evidence_v2.evidence.forEach(r=>r.htx_contract='OTHER-USDT');},c=>{c.metadata.internal_market_context.evidence_v2.evidence.forEach(r=>r.source_ts=c.observed_ts+1);}]){
  const c=control();change(c);assert.equal(confirmedBlockContextFacts(c).length,0);
  const tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});
  assert.equal(auditRenderedBlockResults({canonical:c,telegram:tg}).telegram_context_receipts.length,0);
 }
});
test('compact formatter, missing payload or mismatched fingerprint do not prove approved Telegram use',()=>{
 const c=control(),tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});
 for(const telegram of [null,{...tg,ok:false},{ok:true,message:tg.text,analytical_fingerprint:c.analytical_fingerprint},{...tg,analytical_fingerprint:'OTHER'}]){
  assert.equal(auditRenderedBlockResults({canonical:c,telegram}).telegram_context_receipts.length,0);
 }
 const c2=structuredClone(c);c2.source_receipts=Array.from({length:3},(_,i)=>({status:'CLOSED',metric:'FUNDING',unit:'PERCENT',value:i,venue:'HTX'}));
 assert.equal(auditRenderedBlockResults({canonical:c2,telegram:renderCanonicalTelegram({canonical:c2,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'})}).telegram_context_receipts.length,0);
});
test('N07 requires an actual nonempty headline and shares exact dated facts with both report surfaces',()=>{
 const c=control(),now=c.observed_ts,date=new Date(now-60000).toUTCString();
 const p={contract:c.metadata.contract,asset_metadata:{official_domains:['issuer.example']},feed_url:'https://issuer.example/feed.xml',expected_format:'RSS',observed_ts:now,content_type:'application/rss+xml'};
 const body=`<rss><channel><item><guid>A</guid><title>Обновление протокола</title><link>https://issuer.example/news/update</link><pubDate>${date}</pubDate></item></channel></rss>`;
 const result=normalizeOfficialFeed({...p,body});assert.equal(result.evidence.length,1);assert.equal(result.evidence[0].risk_strength,null);
 c.metadata.internal_market_context.evidence_v2.evidence=result.evidence;
 c.metadata.supporting_context.facts=consumeBlockResultContext({contract:c.metadata.contract,now,evidence:result.evidence}).facts;
 c.analytical_fingerprint=canonicalFingerprint(c);
 const proof=auditRenderedBlockResults({canonical:c,manual:formatManualReport(c),telegram:renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'})});
 assert.deepEqual(proof.used_context_block_ids,['N07']);assert.deepEqual(proof.telegram_used_context_block_ids,['N07']);
 assert.equal(normalizeOfficialFeed({...p,body:body.replace('Обновление протокола','')}).evidence.length,0);
 const ics='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:E\nDTSTAMP:20261004T080000Z\nDTSTART:20261005T080000Z\nURL:https://issuer.example/event\nEND:VEVENT\nEND:VCALENDAR';
 assert.equal(parseOfficialFeed({body:ics,feed_url:p.feed_url,official_domains:['issuer.example'],now}).events.length,0);
});
function executionControl(i=0){
 const source=structuredClone(execution.rows[i]),c=control();
 c.run_id=execution.origin_run_id;c.snapshot_id=source.bundle.snapshot_id;c.observed_ts=source.observed_ts;
 c.metadata.contract=source.contract_code;c.metadata.internal_market_context.evidence_v2.evidence=[];
 c.metadata.execution_context_source=source;
 c.metadata.supporting_context.facts=consumeCanonicalExecutionContext({contract:source.contract_code,run_id:c.run_id,snapshot_id:c.snapshot_id,observed_ts:c.observed_ts,execution_context_source:source}).facts;
 c.source_receipts=[];c.analytical_fingerprint=canonicalFingerprint(c);return c;
}
test('immutable BR/NEAR book facts reach approved Russian manual and Telegram forms from one canonical',()=>{
 for(let i=0;i<2;i++){
  const c=executionControl(i),before=JSON.stringify(c),manual=formatManualReport(c),tg=renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'});
  assert.equal(manual.ok,true,manual.status);assert.equal(tg.ok,true,tg.status);
  const audit=auditRenderedBlockResults({canonical:c,manual,telegram:tg});
  assert.deepEqual(audit.used_context_block_ids,['N11','N16']);assert.deepEqual(audit.telegram_used_context_block_ids,['N11','N16']);
  assert.equal(audit.context_receipts.length,5);assert.equal(audit.telegram_context_receipts.length,3);
  assert.match(manual.text,/комиссии и периодические платежи не включены/);assert.doesNotMatch(manual.text,/\bLONG\b|\bSHORT\b|\bfunding\b/);
  assert.match(tg.text,i===0?/6\.28575 USDT для 2081 одинаковых контрактов/:/1\.553 USDT для 203 одинаковых контрактов/);
  assert.equal(assessActionability({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}).deliver,false);assert.equal(audit.telegram_delivery_proven,false);
  assert.equal(JSON.stringify(c),before);
 }
});
test('canonical execution facts cannot survive changed quantity, foreign snapshot or forged descriptive text',()=>{
 for(const mutate of [c=>c.snapshot_id='FOREIGN',c=>c.metadata.contract='OTHER-USDT',c=>{delete c.metadata.execution_context_source;},c=>c.metadata.execution_context_source.bundle.execution_gate.factual_basis.plans.LONG.measured_contracts++,c=>c.metadata.supporting_context.facts.forEach(f=>f.value='Подменённые издержки')]){
  const c=executionControl();mutate(c);assert.equal(confirmedBlockContextFacts(c).length,0);
  assert.equal(auditRenderedBlockResults({canonical:c,telegram:renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'})}).telegram_context_receipts.length,0);
 }
});
test('exact assembled runtime canonical producer joins source facts without creating score, target or permission',{skip:!process.env.REPORT2_UNIFIED_MODULE_ROOT},async()=>{
 const {buildRuntimeCanonicalBundle}=await import(new URL('canonical-runtime-adapter.mjs',root));
 const source=structuredClone(execution.rows[0]);
 const input={contract:source.contract_code,run_id:execution.origin_run_id,snapshot_id:source.bundle.snapshot_id,observed_ts:source.observed_ts};
 const before=buildRuntimeCanonicalBundle(input),after=buildRuntimeCanonicalBundle({...input,execution_context_source:source});
 assert.deepEqual(after.canonical.scores,before.canonical.scores);assert.equal(after.canonical.state,before.canonical.state);assert.equal(after.canonical.direction,before.canonical.direction);
 assert.deepEqual(after.canonical.targets,before.canonical.targets);assert.deepEqual(after.canonical.hard_gates,before.canonical.hard_gates);
 assert.deepEqual(after.block_rendered_results.used_context_block_ids,['N11','N16']);
 assert.equal(after.canonical.metadata.supporting_context.facts.length,5);
 assert.deepEqual(after.canonical.metadata.execution_context_source,source);
 assert.match(after.manual.text,/6\.28575 USDT для 2081 одинаковых контрактов/);
});
