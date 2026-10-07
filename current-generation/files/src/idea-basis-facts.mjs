import {qualifyEarlyDirectionReceipt} from './early-direction-receipt.mjs';
import {validateEvidenceV2} from './evidence-v2.mjs';
import {telegramPrice} from './telegram-plain-facts.mjs';

export const IDEA_BASIS_FACTS_VERSION='used-facts-idea-basis-v1-20261007';
export const IDEA_BASIS_CUTOVER=Date.parse('2026-10-07T06:01:08Z');
const arr=v=>Array.isArray(v)?v:[];
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const pct=v=>Math.abs(v).toLocaleString('ru-RU',{maximumFractionDigits:1});
const rowKeys=['domain','side','status','evidence_id','id','source_ts','available_at','max_age_sec','btc_1h_pct_points','eth_1h_pct_points','btc_4h_pct_points','eth_4h_pct_points','robust_z','self_percentile','percentile','acceleration_ratio','delta_1h_pct_points','imbalance','delta','cvd_change','proxy_note','breakout_attempt','failure','acceleration','account_delta','position_delta','burst_velocity','realized_only'];

// This records the producer's actual selected early assessment, not a new
// assessment. Keep its original clock, exact wave, numeric facts and references.
// Domain names, scheduler scores and old opportunity labels alone are not facts.
export function captureIdeaBasisReceipt({discovery,contract,direction,observed_ts,run_id,snapshot_id}={}){
 const qualified=qualifyEarlyDirectionReceipt(discovery,observed_ts),r=discovery?.early_candidate_receipt;
 const early=qualified.closed&&qualified.direction===direction&&discovery?.contract===contract?{
  contract,early_candidate_bridge:true,early_candidate_wave_id:discovery.early_candidate_wave_id,
  early_candidate_source_ts:discovery.early_candidate_source_ts??null,
  early_candidate_available_at:discovery.early_candidate_available_at??null,
  early_candidate_receipt:{status:r.status,contract:r.contract,wave_id:r.wave_id,source_ts:r.source_ts??null,feature_observed_ts:r.feature_observed_ts??null,available_at:r.available_at??null,direction_hint:r.direction_hint,direction_state:r.direction_state,evidence_ids:arr(r.evidence_ids).slice(0,64),evidence:arr(r.evidence).slice(0,32).map(row=>Object.fromEntries(rowKeys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])))}
 }:null;
 return {version:IDEA_BASIS_FACTS_VERSION,contract,direction,observed_ts,run_id,snapshot_id,early,changes_score:false,authorizes_entry:false};
}

function earlyFacts(c){
 const receipt=c?.metadata?.idea_basis_receipt;
 if(receipt?.version!==IDEA_BASIS_FACTS_VERSION||receipt.contract!==c.metadata.contract||receipt.direction!==c.direction||receipt.observed_ts!==c.observed_ts||receipt.run_id!==c.run_id||receipt.snapshot_id!==c.snapshot_id||c.metadata?.score_basis?.selected!=='QUALIFIED_EARLY_DETECTION_SCORE')return [];
 const d=receipt.early,q=qualifyEarlyDirectionReceipt(d,c.observed_ts);
 if(!q.closed||q.direction!==c.direction)return [];
 const r=d.early_candidate_receipt,declared=new Set(arr(r.evidence_ids)),out=[];
 const add=(row,phrase,id)=>out.push({kind:'SELECTED_EARLY_FACTOR',evidence_id:id,domain:row.domain,source_ts:q.source_ts,phrase});
 for(const row of arr(r.evidence)){
  const id=row.evidence_id??row.id??`${r.wave_id}:${row.domain}:${row.side}`;
  if(row.status!=='CLOSED'||!declared.has(id)||![c.direction,'BOTH'].includes(row.side))continue;
  if(row.source_ts!=null&&(num(row.source_ts)===null||row.source_ts>c.observed_ts||c.observed_ts-row.source_ts>900000))continue;
  if(row.available_at!=null&&(num(row.available_at)===null||row.available_at>c.observed_ts))continue;
  if(row.domain==='RELATIVE_STRENGTH'){
   for(const [window,label] of [['4h','четыре часа'],['1h','час']]){
    const a=num(row[`btc_${window}_pct_points`]),b=num(row[`eth_${window}_pct_points`]);
    if(a===null||b===null||(c.direction==='LONG'?a<=0||b<=0:a>=0||b>=0))continue;
    add(row,`за ${label} монета ${c.direction==='LONG'?'опережает':'отстаёт от'} биткоин${c.direction==='SHORT'?'а':''} на ${pct(a)} п. п. и эфир${c.direction==='SHORT'?'а':''} на ${pct(b)} п. п.`,id);break;
   }
  }else if(row.domain==='OI_ACCELERATION'){
   // A large change is not automatically growth in positions or price.
   if(num(row.robust_z)!==null&&row.robust_z>=1||num(row.self_percentile)!==null&&row.self_percentile>=.8&&row.self_percentile<=1)add(row,'рост открытых позиций за пять минут выделяется на фоне истории этой монеты',id);
  }else if(row.domain==='VOLUME_ACCELERATION'&&num(row.acceleration_ratio)>1){
   add(row,`объём торгов ускорился в ${pct(row.acceleration_ratio)} раза относительно последних 15 минут`,id);
  }else if(row.domain==='VOLUME_ACCELERATION_PROXY'&&row.proxy_note==='rolling_24h_turnover_change_not_interval_volume'&&num(row.self_percentile)>=.8&&row.self_percentile<=1){
   add(row,'изменение суточного оборота выше обычного для этой монеты',id);
  }else if(row.domain==='FUNDING_TRAJECTORY'&&num(row.delta_1h_pct_points)!==null&&(c.direction==='LONG'?row.delta_1h_pct_points<0:row.delta_1h_pct_points>0)){
   add(row,`ставка финансирования за час ${row.delta_1h_pct_points<0?'снизилась':'выросла'} на ${pct(row.delta_1h_pct_points)} п. п.`,id);
  }else if(row.domain==='EXECUTION_BOOK_SUPPORT'&&num(row.imbalance)!==null&&(c.direction==='LONG'?row.imbalance>0:row.imbalance<0)){
   add(row,`в проверенном стакане преобладают заявки ${c.direction==='LONG'?'покупателей':'продавцов'}`,id);
  }else if(row.domain==='PRICE_STATE_TRANSITION'&&(c.direction==='LONG'?row.breakout_attempt===true||num(row.acceleration)>0:row.failure===true||num(row.acceleration)<0)){
   add(row,c.direction==='LONG'?'по измеренной структуре цена пытается выйти вверх':'по измеренной структуре цена теряет поддержку',id);
  }else if(row.domain==='ORDERFLOW_ABSORPTION'&&num(row.delta)!==null&&(c.direction==='LONG'?row.delta<0:row.delta>0)){
   add(row,c.direction==='LONG'?'продажи поглощаются без соответствующего снижения цены':'покупки поглощаются без соответствующего роста цены',id);
  }else if(row.domain==='ORDERFLOW_EXHAUSTION'&&num(row.cvd_change)!==null&&(c.direction==='LONG'?row.cvd_change<0:row.cvd_change>0)){
   add(row,c.direction==='LONG'?'усиление продаж не сопровождается дальнейшим снижением цены':'усиление покупок не сопровождается дальнейшим ростом цены',id);
  }else if(row.domain==='POSITIONING_TRAJECTORY'&&num(row.account_delta)!==null&&num(row.position_delta)!==null&&(c.direction==='LONG'?row.account_delta>0&&row.position_delta>0:row.account_delta<0&&row.position_delta<0)){
   add(row,`проверенные показатели позиций на нескольких площадках смещаются к ${c.direction==='LONG'?'росту':'снижению'}`,id);
  }else if(row.domain==='REALIZED_LIQUIDATION_PRESSURE'&&num(row.burst_velocity)>0&&num(row.imbalance)!==null&&(c.direction==='LONG'?row.imbalance<0:row.imbalance>0)){
   add(row,`обнаружен всплеск уже произошедших ликвидаций ${c.direction==='LONG'?'продавцов':'покупателей'}`,id);
  }
 }
 return [...new Map(out.map(f=>[f.domain,f])).values()];
}

export function usedIdeaBasisFacts(c){
 const facts=earlyFacts(c),contract=c?.metadata?.contract,now=c?.observed_ts,d=c?.direction;
 if(!contract||!Number.isSafeInteger(now)||!['LONG','SHORT'].includes(d))return [];
 const rows=arr(c?.metadata?.internal_market_context?.evidence_v2?.evidence);
 const proof=c.metadata?.technical_move_potential,target=num(proof?.target_price);
 if(arr(c.metadata?.supplemental_score_adjustment?.receipts).some(r=>r.metric_family==='NATIVE_LIQUIDATION_IMBALANCE'&&num(r.score_contribution)>=1&&r.fresh===true&&r.exact_identity===true)&&proof?.status==='CLOSED'&&proof.basis==='FRESH_SCOPED_NATIVE_LEVEL'&&proof.target_proof_admitted===true&&target!==null&&arr(c.targets).some(t=>num(t.price)===target)){
  const zone=arr(c.metadata?.dynamic_liquidation_panel?.clusters).find(z=>z.decision_target_eligible===true&&num(z.target_price)===target&&num(z.source_ts)!==null&&z.source_ts<=now&&now-z.source_ts<=300000);
  if(zone)facts.unshift({kind:'USED_LIQUIDATION_TARGET',source_ts:zone.source_ts,phrase:`проверенный уровень ликвидации ${telegramPrice(target,{zone:true})} (фактический) ${d==='LONG'?'выше':'ниже'} цены используется как возможная цель после подтверждения входа`});
 }
 // Neutral or tiny supplementary contributions cannot be dressed up as the
 // foundation. Only consumed, current, exact, complete measurements qualify.
 for(const receipt of arr(c.metadata?.supplemental_score_adjustment?.receipts)){
  if(receipt.source_id!=='EVIDENCE_V2'||num(receipt.score_contribution)===null||receipt.score_contribution<1||!arr(receipt.evidence_v2_receipts).some(r=>r.evidence_id===receipt.provider_object_id&&r.reason==='CONSUMED'))continue;
  const r=rows.find(r=>r.evidence_id===receipt.provider_object_id);
  if(!r||r.htx_contract!==contract||!validateEvidenceV2(r,{decision_ts:now}).usable||r.coverage_fraction!==1||r.whole_window_coverage_proven===false||r.entry_eligible===false)continue;
  if(r.metric_family==='ACTUAL_TAKER_TRADES_BOUNDED_IMBALANCE')continue;
  // Unknown families stay in the detailed audit, never receive a guessed label.
  if(r.metric_family==='SECTOR_RELATIVE_STRENGTH'&&num(r.relative_to_sector_pct_points)!==null)facts.push({kind:'USED_SECTOR_FACTOR',evidence_id:r.evidence_id,source_ts:r.source_ts,phrase:`монета ${r.relative_to_sector_pct_points>0?'опережает':'отстаёт от'} свой сектор на ${pct(r.relative_to_sector_pct_points)} п. п.`});
 }
 return facts;
}

export function factualIdeaBasis(c){
 const facts=usedIdeaBasisFacts(c);
 if(facts.length)return facts.slice(0,3).map(f=>f.phrase).join('; ');
 // Be explicit when old canonical records lack the producer's numeric cause.
 // A trigger is the watch condition, not proof of liquidation or accumulation.
 return 'существенные факторы оценки не раскрыты в данных этого отчёта';
}
