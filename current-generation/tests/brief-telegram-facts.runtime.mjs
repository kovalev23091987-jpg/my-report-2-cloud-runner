import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'runtime');
const pub=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const display=await import(pathToFileURL(path.join(root,'src/canonical-display.mjs')));
const plain=await import(pathToFileURL(path.join(root,'src/telegram-plain-facts.mjs')));
const context=await import(pathToFileURL(path.join(root,'src/block-result-context.mjs')));
const exact=JSON.parse(gunzipSync(fs.readFileSync('audit-output/exact-current-data.json.gz')));
const row=exact.rows.find(r=>r.contract_code==='ZEC-USDT'),c=row.canonical;
assert.equal(exact.status,'EXACT_CURRENT_PUBLIC_DATA_READ');
assert.equal(exact.source_cloud_run,37546165952);
assert.equal(c.snapshot_id,'S392:ZEC-USDT:1791329017450');
assert.equal(c.analytical_fingerprint,'a23d782ba8b4694ea18fdb4751066bed73145eb3592129cfd1493253e06ae8fb');
const proof={schema:'OWNER_BRIEF_TELEGRAM_FACTS_20261007',source_cloud_run:exact.source_cloud_run,source_head:exact.source_head,run_id:c.run_id,snapshot_id:c.snapshot_id,fingerprint:c.analytical_fingerprint,sourceHTTP:0,MAIN:0,Telegram:0,new_fresh_SENT:false,cases:[]};
globalThis.fetch=async()=>{throw Error('LIVE_NETWORK_FORBIDDEN');};
test('actual ZEC user receipt replays to brief facts and rounded estimated levels; exact analysis and manual remain unchanged',()=>{
 const before=JSON.stringify(c),tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}),manual=pub.renderCanonicalManual({canonical:c});
 assert.ok(tg.ok,JSON.stringify(tg));assert.equal(pub.canonicalFingerprint(c),c.analytical_fingerprint);assert.equal(JSON.stringify(c),before);assert.equal(manual.text,row.manual_text);
 assert.equal(c.trigger.value,1383.45);assert.equal(c.invalidation.price,1319.19);
 assert.match(tg.text,/цены выше 1 383,45/);assert.match(tg.text,/цена ниже 1 319,19/);
 assert.match(tg.text,/1 613 \(\+18%\) — средняя \(расчётный\)/);assert.match(tg.text,/2 555 \(\+87%\) — небольшая \(расчётный\)/);
 assert.match(tg.text,/1 193 \(−13%\) — средняя \(расчётный\)/);assert.match(tg.text,/905 \(−34%\) — небольшая \(расчётный\)/);
 assert.doesNotMatch(tg.text,/\bUSD(?:T|C)?\b|История предложения|CoinMetrics|Ждём подтверждения:|монета должна|Снимок рынка:|20509|16627|817019/);
 assert.equal(pub.validatePresentation({canonical:c,manual_text:manual.text,telegram_text:tg.text,direction:c.direction,lifecycle_event:'OBSERVE'}).status,'CLOSED');
 const audit=context.auditRenderedBlockResults({canonical:c,manual,telegram:tg});
 assert.ok(audit.context_receipts.some(r=>/История предложения/.test(r.label)));
 assert.ok(!audit.telegram_context_receipts.some(r=>/История предложения/.test(r.label)));
 proof.preview=tg.text;proof.manual_unchanged=true;proof.canonical_unchanged=true;
 proof.cases.push({case:'ACTUAL_ZEC_PREVIEW_NO_RESEND',eligible_levels:4});
});
test('actual immutable ZEC SENT retains its original historical bytes and hash',()=>{
 assert.ok(row.telegram_text);assert.equal(pub.renderCanonicalTelegram({canonical:c,lifecycle_event:row.lifecycle_event,context_policy:'ORIGINAL_V5_20261006'}).text,row.telegram_text);
 const v=pub.validatePresentation({canonical:c,manual_text:row.manual_text,telegram_text:row.telegram_text,direction:c.direction,lifecycle_event:row.lifecycle_event});assert.equal(v.status,'CLOSED');assert.equal(v.presentation_hash,row.presentation_hash);
 proof.original_sent=exact.dispatch.results.filter(r=>r.contract==='ZEC-USDT').map(r=>({state:r.state,message_id:r.telegram_message_id,publication_id:r.publication_id,sent_ts:r.sent_ts}));
 proof.cases.push({case:'ORIGINAL_ZEC_SENT_BYTES_PRESERVED',presentation_hash:row.presentation_hash});
});
test('unknown relative status, labels and expectations never establish a displayed fact',()=>{
 const x=structuredClone(c);x.source_receipts=[{metric:'relative_strength_status',status:'SOURCE_INCOMPATIBLE'}, {metric:'rs_vs_btc_4h',status:'NOT_CLOSED'}];x.reasons=[{label:'Относительная сила',value:91}];
 assert.equal(plain.plainRelativeComparison(x),null);assert.doesNotMatch(pub.renderCanonicalTelegram({canonical:x,lifecycle_event:'OBSERVE'}).text,/Относительная сила:|Ждём подтверждения:|биткоин|эфир/);
 proof.cases.push({case:'NO_STATUS_OR_LABEL_PROMOTION'});
});
test('relative comparison requires two exact current measurements from one synchronized venue',()=>{
 const x=structuredClone(c),ts=c.observed_ts-1000;
 const base={contract_code:'ZEC-USDT',status:'CLOSED',fact_contract_status:'CLOSED',identity_status:'CLOSED',decision_usable:true,freshness_status:'CURRENT_AT_OBSERVATION',coverage_pct:100,unit:'percentage_points',event_ts:ts,max_age_sec:7200,venue:'OKX',interval:'4h'};
 x.source_receipts=[{...base,metric:'rs_vs_btc_4h',normalized_value:1.25},{...base,metric:'rs_vs_eth_4h',normalized_value:-.5}];
 assert.match(plain.plainRelativeComparison(x),/За четыре часа монета опережает биткоин на 1,3 процентного пункта и отстаёт от эфира на 0,5/);
 for(const [key,value] of [['status','NOT_CLOSED'],['decision_usable',false],['event_ts',ts-1],['venue','OTHER'],['contract_code','OTHER-USDT'],['freshness_status','STALE'],['normalized_value',null],['coverage_pct',99]]){
  const y=structuredClone(x);y.source_receipts[1][key]=value;assert.equal(plain.plainRelativeComparison(y),null,key);
 }
 proof.cases.push({case:'CONTROLLED_EXACT_RELATIVE_FACT_AND_REJECTIONS',not_actual_new_measurements:true});
});
test('calculated and native labels remain distinct and conditional/sample limits stay visible without amounts or units',()=>{
 const z={...c.liquidations.above[0],kind:'NATIVE_FUTURE_LEVEL',estimated:false,price_semantics:'REPORTED_NATIVE_POSITION_PRICE',conditional_cross:true,source:'Hyperliquid official',notional:12345};
 const liq={...c.liquidations,above:[z],below:[],all_zones:[],display_source_zones:[]};
 const s=display.displayBriefTelegramLiquidations(liq,plain.telegramPrice).join('\n');
 assert.match(s,/\(фактический\)/);assert.doesNotMatch(s,/расчётный|USD|12345/);assert.match(s,/Зависят от других позиций счёта/);assert.match(s,/ограниченная выборка/);
 z.estimated=true;z.kind='PROVIDER_ESTIMATE';assert.match(display.displayBriefTelegramLiquidations(liq,plain.telegramPrice).join('\n'),/\(расчётный\)/);
 proof.cases.push({case:'CONTROLLED_LABELS_CONDITIONAL_SAMPLE_BOUNDARIES'});
});
test('missing map stays missing; tiny prices never become zero and near-zero distances stay qualified',()=>{
 assert.match(display.displayBriefTelegramLiquidations({},plain.telegramPrice).join('\n'),/выше: уровни не получены/);
 assert.equal(plain.telegramPrice(1612.817019,{zone:true}),'1 613');assert.equal(plain.telegramPrice(12.817019,{zone:true}),'12,82');
 assert.equal(plain.telegramPrice(.000001612817,{zone:true}),'0,00000161');assert.notEqual(plain.telegramPrice(.000001612817,{zone:true}),'0');
 const z={...c.liquidations.above[0],distance_pct:.2};const liq={above:[z],all_zones:[],display_source_zones:[]};
 assert.match(display.displayBriefTelegramLiquidations(liq,plain.telegramPrice).join('\n'),/\(\+<1%\)/);
 proof.cases.push({case:'ABSENCE_TINY_PRICE_AND_SMALL_DISTANCE'});
});
test('new snapshots cannot admit the former technical V5 form after rollout cutover',()=>{
 const x=JSON.parse(fs.readFileSync('current-generation/tests/fixtures/output-contract/long-observe-full.json')).canonical;
 x.observed_ts=Date.parse('2026-10-07T01:30:01Z');x.analytical_fingerprint=pub.canonicalFingerprint(x);
 const manual=pub.renderCanonicalManual({canonical:x}),old=pub.renderCanonicalTelegram({canonical:x,lifecycle_event:'OBSERVE',context_policy:'ORIGINAL_V5_20261006'}),current=pub.renderCanonicalTelegram({canonical:x,lifecycle_event:'OBSERVE'});
 assert.ok(old.ok);assert.ok(current.ok);assert.notEqual(old.text,current.text);
 assert.equal(pub.validatePresentation({canonical:x,manual_text:manual.text,telegram_text:old.text,direction:x.direction,lifecycle_event:'OBSERVE'}).status,'NOT_CLOSED');
 assert.equal(pub.validatePresentation({canonical:x,manual_text:manual.text,telegram_text:current.text,direction:x.direction,lifecycle_event:'OBSERVE'}).status,'CLOSED');
 proof.cases.push({case:'NEW_PUBLICATION_POLICY_ENFORCED'});
});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/brief-telegram-facts-proof.json',JSON.stringify(proof,null,2)+'\n');if(proof.preview)fs.writeFileSync('audit-output/approved-zec-preview.txt',proof.preview+'\n');});
