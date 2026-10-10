import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const pub=await import(pathToFileURL(path.join(runtime,'src/canonical-publication.mjs')));
const context=await import(pathToFileURL(path.join(runtime,'src/block-result-context.mjs')));
const plain=await import(pathToFileURL(path.join(runtime,'src/telegram-plain-facts.mjs')));
const source=JSON.parse(gunzipSync(fs.readFileSync('batch-source/qnt1826/exact-current-data.json.gz')));
assert.equal(source.source_cloud_run,37487195477);
const row=source.rows.find(r=>r.contract_code==='QNT-USDT'),c=row.canonical;
const approved=fs.readFileSync('current-generation/tests/fixtures/approved-telegram-qnt-20261007.txt','utf8').trimEnd();
const proof={schema:'OWNER_APPROVED_TELEGRAM_PLAIN_V5_VALIDATION',source_cloud_run:37487195477,source_head:source.source_head,run_id:c.run_id,snapshot_id:c.snapshot_id,fingerprint:c.analytical_fingerprint,owner_approved_at:'2026-10-06T18:37:54Z',sourceHTTP:0,MAIN:0,production_D1:0,Telegram:0,cases:[]};
globalThis.fetch=async()=>{throw Error('LIVE_NETWORK_FORBIDDEN');};
test('actual retained QNT preserves the approved Telegram draft and canonical bytes while suppressing obsolete manual facts',()=>{
 const before=JSON.stringify(c),tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_BRIEF_20261007'}),manual=pub.renderCanonicalManual({canonical:c});
 assert.equal(tg.ok,true,JSON.stringify(tg));assert.equal(tg.text,approved);assert.equal(tg.length<1800,true);
 assert.equal(pub.canonicalFingerprint(c),c.analytical_fingerprint);assert.equal(JSON.stringify(c),before);assert.equal(manual.text,row.manual_text.split('\n').filter(line=>!line.startsWith('- Наблюдение предложения токена:')&&!line.startsWith('- Проверка уменьшения предложения:')&&!line.startsWith('- Фактический поток фьючерсных сделок за четыре часа:')).join('\n'));assert.ok(!context.auditRenderedBlockResults({canonical:c,manual,telegram:tg}).used_context_block_ids.some(id=>['N01','N02','N03'].includes(id)));
 assert.equal(pub.validatePresentation({canonical:c,manual_text:manual.text,telegram_text:tg.text,direction:c.direction,lifecycle_event:'OBSERVE'}).status,'CLOSED');
 const audit=context.auditRenderedBlockResults({canonical:c,manual,telegram:tg});assert.ok(audit.telegram_context_receipts.some(r=>r.block_id==='N12'&&r.evidence_id===c.metadata.bounded_money_flow_diagnostic.receipts[0].evidence_id));
 proof.cases.push({case:'ACTUAL_QNT_DRAFT_EXACT',current_manual_obsolete_facts_suppressed:true,original_manual_bytes_preserved:true,canonical_unchanged:true,context_N12_accounted:true});
});
test('immutable original SENT146 hash is retained; obsolete paused facts cannot be admitted for new dispatch',()=>{
 assert.equal(pub.sha256({manual_text:row.manual_text,telegram_text:row.telegram_text,analytical_fingerprint:c.analytical_fingerprint}),row.presentation_hash);
 assert.equal(pub.validatePresentation({canonical:c,manual_text:row.manual_text,telegram_text:row.telegram_text,direction:c.direction,lifecycle_event:'OBSERVE'}).status,'NOT_CLOSED');
 const currentManual=pub.renderCanonicalManual({canonical:c}),currentTelegram=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'});assert.equal(pub.validatePresentation({canonical:c,manual_text:currentManual.text,telegram_text:currentTelegram.text,direction:c.direction,lifecycle_event:'OBSERVE'}).status,'CLOSED');
 assert.notEqual(pub.validatePresentation({canonical:c,manual_text:row.manual_text,telegram_text:row.telegram_text+' changed',direction:c.direction,lifecycle_event:'OBSERVE'}).status,'CLOSED');
 proof.cases.push({case:'ORIGINAL_SENT146_BYTES_PRESERVED',historical_presentation_hash:row.presentation_hash});
});
test('all new lifecycle forms omit schedule and market snapshot without creating levels or changing entry conditions',()=>{
 for(const [file,event] of [['long-observe-full','OBSERVE'],['short-wait-coin','WAIT'],['long-entry-full','ENTRY'],['short-entry-coin','ENTRY'],['long-removed-full','IDEA_REMOVED']]){
  const x=JSON.parse(fs.readFileSync('current-generation/tests/fixtures/output-contract/'+file+'.json')).canonical,before=JSON.stringify(x);
  const r=pub.renderCanonicalTelegram({canonical:x,lifecycle_event:event});assert.ok(r.ok,JSON.stringify(r));assert.doesNotMatch(r.text,/Снимок рынка:|Следующая проверка:|Проверка цены и отмены:/);assert.equal(JSON.stringify(x),before);
 }
 proof.cases.push({case:'ALL_LIFECYCLE_STATES_CLOCK_LINES_HIDDEN'});
});
test('closed OI increases, decreases, mixed signs and absence retain factual meaning',()=>{
 const x=structuredClone(c);x.metadata.oi_window_receipts['1h'].change_pct=12.34;x.metadata.oi_window_receipts['4h'].change_pct=-5.6;
 assert.match(plain.plainOpenInterest(x),/увеличился на 12,3% за час и уменьшился на 5,6% за четыре часа/);
 x.metadata.oi_window_receipts['1h'].status='NOT_CLOSED';x.metadata.oi_window_receipts['4h'].contract_code='OTHER-USDT';assert.equal(plain.plainOpenInterest(x),null);
 x.metadata.oi_window_receipts={};const r=pub.renderCanonicalTelegram({canonical:x,lifecycle_event:'OBSERVE'});assert.ok(r.ok);assert.doesNotMatch(r.text,/Их общий объём/);
 proof.cases.push({case:'OI_SIGN_AND_MISSING_RECEIPTS'});
});
test('unconfirmed trade sample cannot be promoted into a Telegram fact',()=>{
 const x=structuredClone(c);x.metadata.supporting_context.facts=x.metadata.supporting_context.facts.filter(r=>r.block_id!=='N12');x.analytical_fingerprint=pub.canonicalFingerprint(x);
 const r=pub.renderCanonicalTelegram({canonical:x,lifecycle_event:'OBSERVE'});assert.ok(r.ok);assert.doesNotMatch(r.text,/407,82|15,93/);assert.equal(context.auditRenderedBlockResults({canonical:x,telegram:r}).telegram_used_context_block_ids.includes('N12'),false);
 proof.cases.push({case:'UNCONFIRMED_SAMPLE_NOT_RENDERED'});
});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/approved-telegram-plain-proof.json',JSON.stringify(proof,null,2)+'\n');});
