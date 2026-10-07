import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
const root=path.resolve(process.env.REPORT2_TEST_RUNTIME||'current-generation/files');
const pub=await import(pathToFileURL(path.join(root,'src/canonical-publication.mjs')));
const display=await import(pathToFileURL(path.join(root,'src/canonical-display.mjs')));
const native=await import(pathToFileURL(path.join(root,'src/native-liquidation-guard.mjs')));
const plain=await import(pathToFileURL(path.join(root,'src/telegram-plain-facts.mjs')));
const reportPath='checkpoints/POST_PR229_NATURAL_REPORT_37681792251.json',bytes=fs.readFileSync(reportPath),report=JSON.parse(bytes);
const saved=JSON.parse(fs.readFileSync('checkpoints/ACTUAL_POST_PR229_BOME_LONG_OBSERVE_SENT155_20261007.json'));
const exactBytes=fs.readFileSync('checkpoints/post-pr229-bome-sent-read-37682711022/exact-current-data.json.gz');
assert.equal(createHash('sha256').update(exactBytes).digest('hex'),'64371d66509dc15e374d071b5c244d8d76097a588489ac8d29f0a7988fa7efdd');
const exact=JSON.parse(gunzipSync(exactBytes)),row=exact.rows.find(r=>r.contract_code==='BOME-USDT'),c=row.canonical;
const policy=display.RELEVANT_LIQUIDATION_PRESENTATION;
const before=JSON.stringify(c),originalFingerprint=pub.canonicalFingerprint(c);
const proof={schema:'LIQUIDATION_RELEVANCE_ORIGINAL_BOME_REPLAY_20261008_V1',cloud_run:Number(process.env.GITHUB_RUN_ID||0),tested_head:process.env.GITHUB_SHA||null,source_cloud_run:37681792251,source_head:report.head,source_run:report.run_id,source_snapshot:c.snapshot_id,original_exact_canonical_gzip_sha256:createHash('sha256').update(exactBytes).digest('hex'),source_artifact_sha256:createHash('sha256').update(bytes).digest('hex'),original_account_raw_body_available:false,original_native_account_number_independently_revalidated:false,original_account_claim_not_market_heatmap:true,new_live_market_data:false,sourceHTTP:0,D1:0,MAIN:0,Telegram:0,new_SENT:false,source_clocks_refreshed:false,presentation_bound_pct:display.LIQUIDATION_PRESENTATION_MAX_DISTANCE_PCT,statistical_or_trade_horizon_claim:false,cases:[]};
globalThis.fetch=async()=>{throw Error('NEW_SOURCE_HTTP_FORBIDDEN');};
test('actual immutable BOME has one conditional cross-account price at2070%, not a market cluster',()=>{
 const z=c.liquidations.above[0],n=c.liquidations.native_extension;
 assert.equal(c.snapshot_id,'S392:BOME-USDT:1791404783785');assert.equal(z.position_count,1);assert.equal(z.conditional_cross,true);assert.equal(z.coverage,'EXPLICIT_PUBLIC_ACCOUNT_SAMPLE');assert.equal(z.price,.0212261087);assert.equal(z.native_reference_price,.000978);assert.equal(n.market_context.native_symbol,'BOME');assert.equal(n.raw_accounts_persisted,false);
 assert.ok(Math.abs((z.price/z.native_reference_price-1)*100-z.distance_pct)<1e-9);assert.ok(z.price/z.native_reference_price>21);
 proof.original_level={price:z.price,reference_price:z.native_reference_price,distance_pct:z.distance_pct,price_multiple:z.price/z.native_reference_price,price_quote:z.price_quote,position_count:1,conditional_cross:true,source_ts:z.source_ts};
 proof.cases.push('EXACT_STORED_CANONICAL_ARITHMETIC_NOT_NEW_NATIVE_PROOF');
});
test('new presentation removes2070% from both reports without erasing data or changing entry, score or target',()=>{
 const audit=display.auditLiquidationPresentation(c.liquidations,{policy});assert.equal(audit.raw_level_count,1);assert.equal(audit.omitted_level_count,1);assert.equal(audit.rows[0].status,'OUTSIDE_PRESENTATION_DISTANCE_BOUND');
 const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE',context_policy:policy}),manual=pub.renderCanonicalManual({canonical:c,liquidation_policy:policy});assert.ok(tg.ok,JSON.stringify(tg));assert.ok(manual.ok,JSON.stringify(manual));
 assert.doesNotMatch(tg.text,/2070|0,0212|фактический|Сильные ликвидации/);assert.doesNotMatch(manual.text,/2070|0,021226|0,0212/);assert.match(tg.text,/Ликвидационные уровни выше: подходящие уровни не подтверждены/);
 assert.equal(tg.text.split('Ликвидационные уровни выше:')[0],saved.telegram_text.split('Сильные ликвидации выше:')[0]);
 assert.equal(JSON.stringify(c),before);assert.equal(pub.canonicalFingerprint(c),originalFingerprint);assert.equal(pub.assessActionability({canonical:c,lifecycle_event:'OBSERVE'}).reason,'EARLY_ACTIONABLE_OBSERVE_TARGET_PENDING');assert.equal(c.liquidations.above.length,1);
 proof.corrected_preview=tg.text;proof.corrected_manual_preview=manual.text;proof.presentation_audit={raw_level_count:1,omitted_level_count:1,reason:audit.rows[0].status};proof.canonical_unchanged=true;proof.score_entry_direction_target_unchanged=true;
 proof.cases.push('BOME_CURRENT_POLICY_ORIGINAL_CLOCK_PREVIEW_NO_RESEND');
});
test('original historical SENT155 bytes and acceptance hash remain reproducible',()=>{
 const tg=pub.renderCanonicalTelegram({canonical:c,lifecycle_event:'OBSERVE'}),manual=pub.renderCanonicalManual({canonical:c});assert.equal(tg.text,saved.telegram_text);assert.equal(manual.text,row.manual_text);
 const v=pub.validatePresentation({canonical:c,manual_text:manual.text,telegram_text:tg.text,direction:c.direction,lifecycle_event:'OBSERVE'});assert.equal(v.status,'CLOSED');assert.equal(v.presentation_hash,saved.presentation_hash);
 proof.original_sent_preserved=true;proof.original_presentation_hash=v.presentation_hash;proof.cases.push('HISTORICAL_SENT155_NOT_REWRITTEN');
});
test('one current-range native position is labelled an account threshold, never a strong market cluster',()=>{
 const z={...c.liquidations.above[0],price:.0011736,native_price:.0011736,distance_pct:20};
 const liq={...c.liquidations,above:[z],all_zones:[z],display_source_zones:[z]};
 const lines=display.displayBriefTelegramLiquidations(liq,plain.telegramPrice,{policy}).join('\n');assert.match(lines,/крупная позиция \(порог счёта\)/);assert.doesNotMatch(lines,/фактический|Сильные ликвидации/);assert.match(lines,/Зависят от других позиций счёта/);
 z.conditional_cross=false;assert.match(display.displayBriefTelegramLiquidations(liq,plain.telegramPrice,{policy}).join('\n'),/порог позиции/);
 proof.cases.push('CONTROLLED_ACCOUNT_LABEL_NO_NEW_MARKET_FACT');
});
test('filter precedes volume ranking so a remote whale cannot suppress a nearer valid level',()=>{
 const far={...c.liquidations.above[0],notional:1e9},near={...far,price:.0011736,native_price:.0011736,distance_pct:20,notional:20000};
 const liq={display_source_zones:[far,near]};const a=display.selectLiquidationDisplayZones(liq,'ABOVE',{limit:1,policy});assert.equal(a.length,1);assert.equal(a[0].price,near.price);assert.equal(a[0].notional,near.notional);assert.equal(liq.display_source_zones.length,2);
 proof.cases.push('CONTROLLED_VOLUME_RANKING_AFTER_DISTANCE_SCREEN');
});
test('distance mismatch or missing original source reference cannot make a remote price eligible',()=>{
 for(const patch of [{distance_pct:20},{native_reference_price:null,distance_reference_price:null},{distance_pct:null}]){
  const z={...c.liquidations.above[0],...patch},liq={above:[z]};assert.equal(display.selectLiquidationDisplayZones(liq,'ABOVE',{policy}).length,0);
 }
 proof.cases.push('CONTROLLED_REFERENCE_AND_DISTANCE_INTEGRITY');
});
test('merge boundary never imports an out-of-range component or sums overlapping positions',()=>{
 const base={...c.liquidations.above[0],native_reference_price:100,distance_reference_price:100,source_ts:c.observed_ts-1000},a={...base,price:200,native_price:200,distance_pct:100,notional:1000},b={...base,price:201,native_price:201,distance_pct:101,notional:1e8};
 const shown=display.selectLiquidationDisplayZones({display_source_zones:[a,b]},'ABOVE',{policy});assert.equal(shown.length,1);assert.equal(shown[0].price,200);assert.equal(shown[0].display_component_count,1);assert.equal(shown[0].notional,1000);
 proof.cases.push('CONTROLLED_BOUNDARY_BEFORE_FIVE_PERCENT_MERGE');
});
test('both sides and calculated source models keep distance policy and honest labels',()=>{
 const base={...c.liquidations.above[0],kind:'PROVIDER_ESTIMATE',estimated:true,price:50,native_price:50,native_reference_price:100,distance_reference_price:100,distance_pct:-50,side:'BELOW',liquidated_side:'BUYERS',price_semantics:'VERIFIED_SDK_ESTIMATE'};
 const lines=display.displayBriefTelegramLiquidations({below:[base]},plain.telegramPrice,{policy}).join('\n');assert.match(lines,/расчётный/);assert.match(lines,/−50%/);assert.doesNotMatch(lines,/фактический/);
 assert.equal(display.selectLiquidationDisplayZones({below:[{...base,distance_pct:-150}]},'BELOW',{policy}).length,0);
 proof.cases.push('CONTROLLED_TWO_SIDES_AND_MODEL_LABEL');
});
test('native supplemental manual path cannot leak the omitted original far level',()=>{
 const lines=native.nativeLiquidationLines(c.liquidations,{manual:true,policy});assert.deepEqual(lines,['Ликвидации: пригодные уровни в проверенной выборке не подтверждены.']);
 proof.cases.push('NATIVE_MANUAL_FALLBACK_NO_FAR_LEVEL_LEAK');
});
test('new snapshot cutoff applies automatically while original policy remains historical',()=>{
 assert.equal(display.liquidationPresentationPolicy(display.LIQUIDATION_PRESENTATION_CUTOVER),policy);assert.equal(display.liquidationPresentationPolicy(display.LIQUIDATION_PRESENTATION_CUTOVER-1),'ORIGINAL');
 proof.cases.push('AUTOMATIC_NEW_SNAPSHOT_POLICY');
});
test.after(()=>{fs.mkdirSync('audit-output',{recursive:true});fs.writeFileSync('audit-output/liquidation-relevance-proof.json',JSON.stringify(proof,null,2)+'\n');if(proof.corrected_preview)fs.writeFileSync('audit-output/corrected-bome-preview.txt',proof.corrected_preview+'\n');});
