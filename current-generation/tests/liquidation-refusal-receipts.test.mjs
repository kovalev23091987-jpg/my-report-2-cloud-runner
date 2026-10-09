import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.REPORT2_LIQ_REFUSAL_RUNTIME?path.resolve(process.env.REPORT2_LIQ_REFUSAL_RUNTIME,'src'):path.resolve('current-generation/files/src');
const load=file=>import(pathToFileURL(path.join(root,file)));
const {bindLiquidationAcquisitionDiagnostics:bind,liquidationAcquisitionAbsenceText:absence}=await load('liquidation-source-acquisition-audit.mjs');
const {displayBriefTelegramLiquidations:brief,displayFutureLiquidations:manual,RELEVANT_LIQUIDATION_PRESENTATION:policy}=await load('canonical-display.mjs');
const zip='checkpoints/post254-natural-37917588047.zip';
assert.equal(createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),'94c9480f583af8393ed331c16967f891fedf271e76f3fad557ca1a2abb836df4');
const original=JSON.parse(execFileSync('unzip',['-p',zip,'report2-run-result.json'],{maxBuffer:16*1024*1024}).toString());
const audit=original.liquidation_source_acquisition_audit,T=audit.evaluated_ts;
// The final run audit was recorded after these canonical observations. Its
// later review cutoff is explicit, never backdated to an original SENT/snapshot.
const args=contract=>({audit,contract,run_id:original.run_id,snapshot_id:'CONTROLLED_DIAGNOSTIC_REVIEW:'+contract,observed_ts:T});
const price=p=>String(p);
test('original native attempts retain exact asset and source clocks without confusing empty sample and skipped request',()=>{
 const ray=bind(args('RAY-USDT')),lobster=bind(args('龙虾-USDT'));
 assert(ray&&lobster);assert(ray.routes.every(r=>['DYDX_PINNED_NATIVE','GTRADE_NATIVE'].includes(r.lane)));
 assert(ray.routes.some(r=>r.kind==='EMPTY_BOUNDED_LEVEL_SAMPLE'&&r.actual_http===0&&r.complete_accounts_read===200));
 assert(ray.routes.some(r=>r.kind==='REQUEST_LIMIT'));assert(lobster.routes.some(r=>r.kind==='ASSET_UNSUPPORTED'));
 const source=audit.routes.find(r=>r.lane==='DYDX_PINNED_NATIVE').position_proof.source_ts;
 assert.equal(ray.routes.find(r=>r.lane==='DYDX_PINNED_NATIVE').source_ts,source);assert.equal(lobster.routes.find(r=>r.lane==='DYDX_PINNED_NATIVE').source_ts,source);
 for(const r of [ray,lobster]){assert.equal(r.entry_authorized,false);assert.equal(r.score_contribution,0);assert.equal(r.source_state_proof,false);assert.equal(r.source_clocks_refreshed,false);assert.ok(Buffer.byteLength(JSON.stringify(r))<=8192);}
});
test('foreign asset/run, future or stale audit and missing snapshot cannot attach to a current canonical observation',()=>{
 for(const change of [{contract:'NEAR-USDT'},{run_id:'FOREIGN'},{snapshot_id:''},{observed_ts:T-1},{observed_ts:T+300001},{audit:{...audit,source_clocks_refreshed:true}},{audit:{...audit,diagnostic_only:false}}])assert.equal(bind({...args('RAY-USDT'),...change}),null);
 for(const c of original.candidates)assert.equal(bind({...args(c.contract),snapshot_id:c.snapshot_id,observed_ts:c.observed_ts}),null,'later final audit must not be backdated');
});
test('real retained refusals reach both formats while original prices, scores, state and texts remain immutable',()=>{
 const saved=JSON.stringify(original);
 for(const c of original.candidates){
  const receipt=bind(args(c.contract)),liq={...c.canonical.liquidations,acquisition_diagnostics:receipt};
  const short=brief(liq,price,{policy}).join('\n'),long=manual(liq,{policy}).join('\n');
  assert(short.includes('проверенная выборка не дала подходящих уровней')||short.includes('Проверенная выборка не дала подходящих уровней'));
  if(c.contract==='RAY-USDT')assert(short.includes('часть запросов ограничена лимитом'));
  if(c.contract==='龙虾-USDT')assert(short.includes('часть площадок не поддерживает монету'));
  assert(long.includes(absence(receipt)));assert(!/SOURCE_|DYDX_|SKIPPED_|market census|нет позиций на рынке/.test(short));
  assert.equal(brief(c.canonical.liquidations,price,{policy}).length,2,'historical payload without new diagnostic keeps its original two lines');
 }
 assert.equal(JSON.stringify(original),saved);
});
test('a verified display-distance exclusion is separate from acquisition refusals and never changes raw level',()=>{
 const c=original.candidates.find(c=>c.contract==='RAY-USDT'),receipt=bind(args(c.contract));
 const level={kind:'PROVIDER_ESTIMATE',side:'ABOVE',price:2170,price_quote:'USDT',distance_pct:2070,distance_reference_price:100,distance_reference_basis:'EXACT_QUOTE_REFERENCE',notional:2e6,source_ts:T-1000,source_clock_closed:true,estimated:true,price_semantics:'VERIFIED_SOURCE_ESTIMATE',source:'CONTROLLED_DISTANCE_EXCLUSION',strength_label_ru:'огромная'};
 const liq={...c.canonical.liquidations,current_price:100,all_zones:[level],display_source_zones:[level],acquisition_diagnostics:receipt};
 const before=JSON.stringify(liq),text=brief(liq,price,{policy}).join('\n');assert(text.includes('дальше 100% от цены сравнения'));assert(!text.includes('2170'));assert.equal(JSON.stringify(liq),before);
 const eligible={...level,price:150,distance_pct:50},near={...liq,all_zones:[eligible],display_source_zones:[eligible]};
 assert(!brief(near,price,{policy}).some(s=>s.includes('выборка не дала')||s.includes('дальше 100%')));
});
test('raw exceptions cannot leak into canonical diagnostics or become a fresh state or a market-empty claim',()=>{
 const secret='PRIVATE_TOKEN',raw={...audit,routes:[{contract:'RAY-USDT',run_id:original.run_id,lane:'GTRADE_NATIVE',status:'SOURCE_EXCEPTION:'+secret,role_usable:false,source_outcome:{evaluated:true,operational_success:false,failure_origin:'TRANSPORT'}}]};
 const r=bind({...args('RAY-USDT'),audit:raw});assert(!JSON.stringify(r).includes(secret));assert.equal(r.routes[0].status,'SOURCE_EXCEPTION');assert.equal(absence(r),'Часть источников не удалось проверить.');assert.equal(r.source_state_proof,false);
 const none=bind({...args('RAY-USDT'),audit:{...audit,routes:[]}});assert.equal(none.status,'NO_CAPTURED_ROUTE');assert.equal(absence(none),null);
});
