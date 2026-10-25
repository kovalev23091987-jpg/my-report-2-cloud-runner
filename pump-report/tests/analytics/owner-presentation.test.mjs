import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {analyzePump,RULES_VERSION} from '../../analytics/index.mjs';
import {auditCohortSample,auditPairedAnalyses,FEATURE_SCHEMA_VERSION} from '../../analytics/cohort-audit.mjs';
import {summarizeOutcomes} from '../../analytics/summary.mjs';
import {evaluateOutcome} from '../../analytics/outcome.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {createNativeRelativeCandleQualification} from '../../sources/native-relative-qualification.mjs';
import {CANDLE_NATIVE_RELATIVE_UNIT,CANDLE_NATIVE_RELATIVE_KIND,CANDLE_CCXT_TIME_BASIS,candleNativeComparisonKey,ownerPublicationRefusal} from '../../contracts/index.mjs';
import {recordPurpose,productionRecord,ACCEPTANCE_240} from '../../contracts/run-purpose.mjs';
import {input,fact,zone,path,T,MINUTE} from './fixtures.mjs';

const dir=new URL('../../handoffs/analytics/package-l/',import.meta.url);
async function save(name,a){await writeFile(new URL(name+'.txt',dir),a.card_text??a.manual_text);await writeFile(new URL(name+'.json',dir),JSON.stringify({evidence:'ARTIFICIAL_ONLY',analysis:a},null,2)+'\n');}
function native(x){
  const f=x.facts.candles,key=candleNativeComparisonKey(x.instrument,MINUTE);f.unit=CANDLE_NATIVE_RELATIVE_UNIT;f.status='INCOMPLETE';
  f.coverage={time_qualified:true,relative_volume_qualified:true,volume_qualified:false,time_basis:CANDLE_CCXT_TIME_BASIS,time_evidence_ref:'ARTIFICIAL_TIME_ONLY',
    comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key,native_quantity_unit:'UNKNOWN',absolute_base_amount_qualified:false,absolute_USD_amount_qualified:false,independent_vendor_guarantee_claimed:false};
  f.value=f.value.map(r=>({...r,volume_native:r.volume_base,native_volume_decimal:String(r.volume_base),volume_base:null,turnover_quote:null,native_quantity_unit:'UNKNOWN',comparison_kind:CANDLE_NATIVE_RELATIVE_KIND,volume_comparison_key:key}));return x;
}
function maximum({unicode=false,opaque=false}={}){
  const x=native(input());x.run_purpose='ACCEPTANCE_TEST';x.facts.candles.value[111].high=132;x.facts.candles.fact_id='ORIGINAL_GROWTH_'+('🚀'.repeat(100))+'_EVIDENCE_END';
  const first=analyzePump(x);assert.equal(first.ready,true);x.previous_wave=structuredClone(first.next_wave);
  x.previous_wave.confirmed_pivots.push(...[100.6,102.5,104].map((price,i)=>({kind:'HIGH',price,event_ts:T-(30-i)*MINUTE,known_ts:T-(27-i)*MINUTE,fact_id:'ARTIFICIAL_L_SUPPORT_'+i})));
  x.facts.price.value=105;const last=x.facts.candles.value.at(-1);last.close=105;last.low=104.9;x.facts.candles.fact_id='CURRENT_FACT_MUST_NOT_REPLACE_ORIGINAL';
  const long=unicode?'🚀'.repeat(200):'LONG_SOURCE_LABEL_'.repeat(30);x.instrument.native_symbol=long;x.liquidations={status:'PARTIAL',zones:[],coverage:{scope:'ARTIFICIAL_ONLY'}};
  for(let i=0;i<3;i++)for(const side of ['UP','DOWN']){const lo=side==='UP'?113+i*15:104-i*12,z=zone(side+i,lo,lo+0.2,{source:long,primary_provider:'ARTIFICIAL_L_'+side+i,venue:long,model_id:long,model_version:long,
    magnitude_value:1.234567891234e300,magnitude_unit:opaque?'UNQUALIFIED_UNIT_'.repeat(20):'RELATIVE_INTENSITY',relative_scale:opaque?null:{scale_id:long,model_version:long},event_ts:T-299000,received_ts:T,expires_ts:T+1000,
    limitations:['PARTIAL_SOURCE_COVERAGE','OVERLAPPING_COVERAGE_NOT_SUMMED','RETURNED_BINS_ONLY']});x.liquidations.zones.push(z,{...structuredClone(z),zone_id:z.zone_id+'_SECOND',lower:lo+0.1,upper:lo+0.3});}
  x.facts.trades=fact('trades',[{trade_id:'B',event_ts:T,price:105,quantity_base:2,aggressor_side:'BUY'}],'USDT_PRICE_BASE_QUANTITY');x.facts.open_interest=fact('open_interest',10000,'CONTRACTS');x.facts.funding=fact('funding',{rate:0.0001,period_ms:28800000},'RATE_FRACTION_PER_ACTUAL_PERIOD');
  for(const k of ['trades','open_interest','funding']){x.facts[k].source=long;x.facts[k].venue=long;}
  return {x,first};
}
function required(a){
  assert.equal(a.ready,true,JSON.stringify(a.reasons));assert.equal(a.notification_eligibility.eligible,true);assert.ok(a.plan.potential_pct.minimum>=10);assert.ok(a.card_text.length<=4096);assert.equal(a.card_text.isWellFormed(),true);
  assert.match(a.card_text,/Автоматический отчёт|Ручная проверка/);assert.match(a.card_text,/Будущее событие для статистики/);assert.match(a.card_text,/вероятность пока не оценена/);
  assert.match(a.card_text,/Покупка на откате/);assert.match(a.card_text,/Фиксация всей позиции/);assert.match(a.card_text,/пересмотреть план/);
  assert.doesNotMatch(a.card_text,/Размер: до|будущая цена исполнения не гарантирована|абсолютная единица|ниже желаемых/);assert.equal(a.probability.value_pct,null);
}
test('L01 AUTO shows the confirmed past crossing separately from the unestimated future +10/4h event',async()=>{
  const x=input();x.run_purpose='PRODUCTION';const before=structuredClone(x),a=analyzePump(x);required(a);assert.equal(a.rules_version,RULES_VERSION);assert.notEqual(RULES_VERSION,'pump-analytics-v2-growth24h-20261025');
  assert.equal(a.growth_proof.status,'CURRENT');assert.equal(a.growth_proof.threshold_pct,10);assert.match(a.card_text,/Подтверждённый рост: \+12% за 15 мин \(порог \+10%\)/);assert.match(a.card_text,/окно .*МСК; факт ARTIFICIAL:candles/);assert.match(a.card_text,/Карта ликвидаций недоступна/);assert.doesNotMatch(a.card_text,/ТЕСТ/);assert.ok(a.plan.position_limit_usdt>0);assert.deepEqual(x,before);await save('auto-current',a);
});
test('L02 a manual acceptance review below the auto growth threshold is labelled MANUAL and TEST without inventing a crossing',async()=>{
  const x=input();x.mode='MANUAL';x.run_purpose='ACCEPTANCE_TEST';for(const r of x.facts.candles.value)for(const k of ['open','high','low','close'])r[k]+=100;x.facts.candles.value[111].high=232;x.facts.price.value=212;
  const a=analyzePump(x);required(a);assert.equal(a.automatic_eligible,false);assert.equal(a.current_threshold_passed,false);assert.match(a.card_text,/Ручная проверка/);assert.match(a.card_text,/ТЕСТ — приёмочная проверка/);assert.match(a.card_text,/Автоматический порог роста не подтверждён/);assert.equal(a.run_purpose,'ACCEPTANCE_TEST');await save('manual-acceptance',a);
});
test('L03 retained wave names the earlier crossing with original clocks/evidence and never borrows a current fact',async()=>{
  const x=input();x.run_purpose='PRODUCTION';const first=analyzePump(x),original=structuredClone(first.next_wave);x.previous_wave=original;x.facts.price.value=105;const last=x.facts.candles.value.at(-1);last.close=105;last.low=104.9;x.facts.candles.fact_id='NEW_CURRENT_CANDLE_FACT';
  const a=analyzePump(x);required(a);assert.equal(a.current_threshold_passed,false);assert.equal(a.automatic_eligible,true);assert.equal(a.growth_proof.status,'RETAINED');assert.equal(a.growth_proof.window.end_ts,first.growth_proof.window.end_ts);assert.deepEqual(a.growth_proof.fact_ids,first.growth_proof.fact_ids);assert.deepEqual(a.next_wave.qualification,original.qualification);assert.equal(a.next_wave.expires_ts,original.expires_ts);
  assert.match(a.card_text,/Порог был пройден ранее: \+12% за 15 мин/);assert.match(a.card_text,/Сейчас повторное пересечение не подтверждено/);assert.match(a.card_text,/сохранённый факт ARTIFICIAL:candles/);assert.doesNotMatch(a.card_text,/сохранённый факт NEW_CURRENT/);await save('auto-retained',a);
});
test('L04 a PARTLY plan below minimum 10% becomes a plain manual refusal without extending its exit',async()=>{
  const x=input();x.mode='MANUAL';x.run_purpose='PRODUCTION';const first=analyzePump(x);x.previous_wave=structuredClone(first.next_wave);x.previous_wave.confirmed_pivots.push(...[104,107,110].map((price,i)=>({kind:'HIGH',price,event_ts:T-(30-i)*MINUTE,known_ts:T-(27-i)*MINUTE,fact_id:'ARTIFICIAL_L_PARTLY_'+i})));
  const a=analyzePump(x);assert.equal(a.ready,false);assert.equal(a.card_text,null);assert.equal(a.notification_eligibility.eligible,false);assert.equal(a.notification_eligibility.reason,'PLAN_POTENTIAL_BELOW_OWNER_MINIMUM');assert.ok(a.plan.potential_pct.minimum<10);assert.ok(a.plan.potential_pct.maximum>=10);assert.equal(a.plan.desired_potential_status,'PARTLY_MEETS_DESIRED');assert.equal(a.plan.exit_zone.lower,first.plan.exit_zone.lower);assert.equal(ownerPublicationRefusal(a),a.notification_eligibility.reason);
  assert.match(a.manual_text,/Ручная проверка/);assert.match(a.manual_text,/ниже обязательных 10%/);assert.doesNotMatch(a.manual_text,/Размер:|допускает до|абсолютная единица/);await save('manual-potential-refusal',a);
});
test('L05 complete six-zone, three-entry native/Unicode/opaque cards retain TEST, historical growth evidence and future-event labels under4096',async()=>{
  const lengths=[];
  for(const options of [{unicode:true,opaque:false},{unicode:false,opaque:true}]){const {x,first}=maximum(options),a=analyzePump(x);required(a);assert.equal(a.plan.entry_zones.length,3);assert.equal(a.liquidations.zones_up.length,3);assert.equal(a.liquidations.zones_down.length,3);assert.equal(a.growth_proof.status,'RETAINED');assert.deepEqual(a.growth_proof.fact_ids,first.growth_proof.fact_ids);assert.equal(a.activity.volume_basis.unit,'UNKNOWN_NATIVE_UNIT');assert.ok(a.activity.impulse.ratio>0);assert.match(a.card_text,/ТЕСТ — приёмочная проверка/);assert.match(a.card_text,/Порог был пройден ранее/);assert.match(a.card_text,/EVIDENCE_END/);assert.match(a.card_text,/Карта неполная/);assert.match(a.card_text,/МСК \(299 с назад\)/);assert.match(a.card_text,/не сумма/);
    for(const z of [...a.plan.entry_zones,a.plan.exit_zone,...a.liquidations.zones_up,...a.liquidations.zones_down])for(const v of [z.lower,z.upper])assert.ok(a.card_text.includes(Number(v.toPrecision(10)).toString()));
    lengths.push(a.card_text.length);await save(options.unicode?'maximum-unicode':'maximum-opaque',a);
  }await writeFile(new URL('maximum-lengths.json',dir),JSON.stringify({evidence:'ARTIFICIAL_ONLY',utf16_lengths:lengths},null,2)+'\n');
});
test('L06 true SOURCE 24h day proof is displayed as past +20% while its separate plan still meets notification minimum',async()=>{
  const x=input();x.run_purpose='PRODUCTION';for(const r of x.facts.candles.value)for(const k of ['open','high','low','close'])r[k]=117+(r[k]-100)/4;x.facts.candles.value[111].high=145;x.facts.price.value=120;
  const qualification=createNativeRelativeCandleQualification(x.instrument),data=Array.from({length:1440},(_,i)=>({time:T-86400000+i*MINUTE,open:i?'110':'100',high:'121',low:'99',close:i===1439?'120':'110',volume:'UNUSED'}));
  let requests=0;const source=createPumpSources({clock:()=>T,identityRegistry:[{instrument:x.instrument,native_contract_id:'ARTIFICIAL_L_DAY',qualifications:{candles:qualification}}],broker:{async request(){requests++;return {ok:true,status:200,received_ts:T,receipt_id:'ARTIFICIAL_L_1440',data:{code:0,data},cache_hit:false};}}});
  x.facts.growth_24h=(await source.getDayGrowth({instrument:x.instrument})).facts.growth_24h;const a=analyzePump(x);required(a);assert.equal(requests,1);assert.equal(a.growth_proof.window.window_ms,86400000);assert.deepEqual(a.growth_proof.fact_ids,[x.facts.growth_24h.fact_id]);assert.match(a.card_text,/Подтверждённый рост: \+20% за 24 ч \(порог \+20%\)/);await save('auto-day',a);
});

function record(id,purpose,evidence_class='OBSERVED'){
  const o={instrument_id:'ARTIFICIAL_L:I'+id,asset_id:'ARTIFICIAL_L:A'+id,wave_id:'ARTIFICIAL_L:W'+id,signal_id:'ARTIFICIAL_L:S'+id,t0:T,reference_price:100,rules_version:RULES_VERSION,profile_version:START_PROFILE.version,mode:'AUTO',map_mode:'NO_MAP',evidence_class,ready:true,...(purpose?{run_purpose:purpose}:{})};
  return {record_id:'ARTIFICIAL_L:R'+id,recorded_ts:T+14400000,origin:o,publication:{state:'SENT',message_id:'424242',receipt_ref:'ARTIFICIAL_NOT_NATIVE'},outcome:evaluateOutcome({signal:{...o,map_mode:'WITHOUT_MAP'},candles:path(),as_of_ts:T+14400000}),
    audit_meta:{analysis_sha256:'a'.repeat(64),implementation_sha256:'b'.repeat(64),origin_anchor:{immutable:true,analysis_id:'ARTIFICIAL_L_ANALYSIS_'+id,analysis_sha256:'a'.repeat(64),origin:structuredClone(o),selection:{kind:'FIRST_POSSIBLE_OR_CONFIRMED_SEND',selected_ts:T+1000,recorded_ts:T+1000}},
      feature_schema_version:FEATURE_SCHEMA_VERSION,features:[{name:'wave_state',value:'ACTIVE_WAVE',source_event_ts:T,received_ts:T,known_ts:T,evidence_ref:'ARTIFICIAL_FEATURE_CLAIM'}],forecast:{value_pct:50,model_version:'ARTIFICIAL_MODEL_NOT_VALIDATED',training_manifest_sha256:'c'.repeat(64),created_ts:T,training_cutoff_ts:T-1,trained_through_label_ts:T-1,mode:o.mode,map_mode:o.map_mode,rules_version:o.rules_version,profile_version:o.profile_version,feature_schema_version:FEATURE_SCHEMA_VERSION}}};
}
test('L07 cohort calibration inputs exclude acceptance, unknown, artificial claims and conflicting-wave promotion while raw summary stays unchanged',()=>{
  const records=[record('P','PRODUCTION'),record('A','ACCEPTANCE_TEST'),record('U',null),record('F','PRODUCTION','ARTIFICIAL')],before=structuredClone(records),options={as_of_ts:T+14400000+2*MINUTE,split_plan:{split_ts:T+14400000+MINUTE,declared_ts:T-MINUTE,plan_ref:'ARTIFICIAL_SPLIT'}};
  const q=auditCohortSample(records,options);assert.equal(q.input_records,4);assert.equal(q.purpose_eligible_records,1);assert.equal(q.excluded_by_purpose,3);assert.equal(q.inspected_waves,1);assert.equal(q.waves[0].structurally_usable,true,JSON.stringify(q.waves));assert.equal(q.partitions.TRAIN,1);assert.equal(q.publication_allowed,false);assert.equal(q.probability_pct,null);assert.equal(summarizeOutcomes(records,{as_of_ts:options.as_of_ts}).independent_waves,4);assert.deepEqual(records,before);
  assert.equal(recordPurpose({origin:{instrument_id:ACCEPTANCE_240.instrument_id,wave_id:ACCEPTANCE_240.wave_id,t0:ACCEPTANCE_240.t0,run_purpose:'PRODUCTION',evidence_class:'OBSERVED'}}),'ACCEPTANCE_TEST');
  const accepted=record('M','ACCEPTANCE_TEST'),promoted=record('M','PRODUCTION');promoted.record_id+='LATEST';promoted.recorded_ts++;
  const blocked=auditCohortSample([accepted,promoted],options);assert.equal(blocked.inspected_waves,0);assert.equal(blocked.purpose_exclusions.production_wave_conflict,1);assert.equal(productionRecord(accepted),false);
});
test('L08 paired feature audit admits only explicit OBSERVED production claims, and excludes acceptance/unknown without rewriting saved analyses',()=>{
  const baselineInput=input();baselineInput.run_purpose='PRODUCTION';const enrichedInput=structuredClone(baselineInput);enrichedInput.liquidations={status:'USABLE',zones:[zone('L_PAIR',125,126)],coverage:null};
  const baseline=analyzePump(baselineInput),enriched=analyzePump(enrichedInput);assert.equal(baseline.ready,true);assert.equal(enriched.ready,true);
  const make=(id,purpose,evidence='OBSERVED')=>{const a=structuredClone(baseline),b=structuredClone(enriched);a.run_purpose=purpose;b.run_purpose=purpose;return {pair_id:id,contrast:'MAP',evidence_class:evidence,baseline:{analysis:a,input:baselineInput,implementation_sha256:'d'.repeat(64)},enriched:{analysis:b,input:enrichedInput,implementation_sha256:'d'.repeat(64)}};};
  const pairs=[make('PROD','PRODUCTION'),make('TEST','ACCEPTANCE_TEST'),make('UNKNOWN',null),make('ARTIFICIAL','PRODUCTION','ARTIFICIAL')],before=structuredClone(pairs),q=auditPairedAnalyses(pairs,{as_of_ts:T});assert.equal(q.qualified_pairs,1,JSON.stringify(q.results));assert.equal(q.results[0].qualified,true);for(const r of q.results.slice(1)){assert.equal(r.qualified,false);assert.ok(r.issues.includes('PAIR_NOT_OBSERVED_PRODUCTION'));}assert.deepEqual(pairs,before);assert.equal(q.publication_allowed,false);assert.equal(q.external_provenance_authenticated,false);
});
