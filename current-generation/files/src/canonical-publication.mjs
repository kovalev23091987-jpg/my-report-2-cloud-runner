import {formatManualReport} from './manual-report-formatter.mjs';
import {factualIdeaBasis,IDEA_BASIS_CUTOVER} from './idea-basis-facts.mjs';
import {displayWindow,displayUnit,displayCondition,displayInvalidation,hasInternalTerminology,displayMarketFacts,displayLegacyLiquidations,displayFutureLiquidations,displayBriefTelegramLiquidations,liquidationPresentationPolicy,RELEVANT_LIQUIDATION_PRESENTATION} from './canonical-display.mjs';
import {nativeLiquidationSources,nativeLiquidationLines,validateNativeLiquidationContext} from './native-liquidation-guard.mjs';
import crypto from 'node:crypto';
import {plainOpenInterest,plainContextFact,plainCancellation,isApprovedTelegramContextFact,plainRelativeComparison,omitTelegramCurrencies,telegramPrice} from './telegram-plain-facts.mjs';
import {earlySourceRolesClosed} from './observation-source-role-gate.mjs';
import {confirmedBlockContextFacts,auditRenderedBlockResults} from './block-result-context.mjs';
export const CANONICAL_PUBLICATION_VERSION='approved-user-layout-v5-plain-language-20261006';
const text=v=>v===null||v===undefined?'':String(v).trim();
const upper=v=>text(v).toUpperCase();
const finite=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const stamp=v=>Number.isSafeInteger(Number(v))&&Number(v)>=1_000_000_000_000?Number(v):null;
const score=v=>{const n=finite(v);return n!==null&&n>=0&&n<=100?n:null;};
const stable=v=>Array.isArray(v)?v.map(stable):(v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v);
export const sha256=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(stable(v))).digest('hex');
export function canonicalFingerprint(result){const c={...(result||{})};delete c.analytical_fingerprint;return sha256(c);}
function contractOf(c){return text(c?.metadata?.contract||c?.candidates?.[0]?.contract||c?.candidates?.[0]?.ticker||c?.universe?.[0]?.contract);}
function closedHardGates(c){const gs=Array.isArray(c?.hard_gates)?c.hard_gates:[];return gs.length>0&&gs.every(g=>['CLOSED','PASS','CLEAR','ELIGIBLE'].includes(upper(g?.status??g?.state??g?.result)));}
function exactTrigger(t,observed){return Boolean(t&&text(t.metric)&&['>=','<=','>','<'].includes(text(t.operator))&&finite(t.value)!==null&&text(t.unit)&&text(t.timeframe)&&stamp(t.expires_ts)!==null&&t.expires_ts>=observed&&text(t.cancel_condition)&&stamp(t.next_recheck_ts)!==null&&t.next_recheck_ts>observed&&t.next_recheck_ts<=t.expires_ts);}
function observationAreaClosed(c){const e=c?.entry;return Boolean(text(e?.area)||(finite(e?.min_price)!==null&&finite(e?.max_price)!==null));}
function referenceEntry(c){const e=c?.entry||{};const lo=finite(e.min_price),hi=finite(e.max_price);if(lo!==null&&hi!==null)return(lo+hi)/2;const trigger=finite(c?.trigger?.value);return trigger;}
function remainingMove(c,target){const entry=referenceEntry(c),price=finite(target?.price??target),d=upper(c?.direction);if(entry===null||entry<=0||price===null||!['LONG','SHORT'].includes(d))return null;return d==='LONG'?(price/entry-1)*100:(1-price/entry)*100;}
function reportableTarget(c){return(Array.isArray(c?.targets)?c.targets:[]).find(t=>{
 if((remainingMove(c,t)??-Infinity)<=0)return false;
 const proof=c?.metadata?.technical_move_potential;
 if(upper(t?.basis??proof?.basis)!=='FRESH_SCOPED_NATIVE_LEVEL')return true;
 // Previously stored snapshots may contain a bucket/cross-margin context that
 // was incorrectly upgraded to a target. Delivery must check admission too.
 return proof?.target_proof_admitted===true&&(Array.isArray(c?.metadata?.dynamic_liquidation_panel?.clusters)?c.metadata.dynamic_liquidation_panel.clusters:[]).some(z=>z.decision_target_eligible===true&&finite(z.target_price)===finite(t?.price));
 })??null;}
function entryClosed(c){const e=c?.entry;const inv=c?.invalidation;const area=Boolean(text(e?.area)||(finite(e?.min_price)!==null&&finite(e?.max_price)!==null));return area&&Boolean(displayInvalidation(inv))&&Boolean(reportableTarget(c));}
function directionClosed(c){return ['LONG','SHORT'].includes(upper(c?.direction));}
function scoresClosed(c){return score(c?.scores?.overall_0_100)!==null&&score(c?.scores?.coin_interest_0_100)!==null&&c?.scores?.is_probability===false;}

export function validateCanonicalIdentity(canonical,{contract,direction=null,run_id,snapshot_id,observed_ts}={}){
 const fail=reason=>({status:'NOT_CLOSED',reason});
 if(canonical?.status!=='CLOSED')return fail('CANONICAL_NOT_CLOSED');
 if(!text(contract)||!text(run_id)||!text(snapshot_id)||stamp(observed_ts)===null)return fail('IDENTITY_REQUIRED');
 if(text(canonical.run_id)!==text(run_id)||text(canonical.snapshot_id)!==text(snapshot_id)||Number(canonical.observed_ts)!==Number(observed_ts))return fail('SNAPSHOT_IDENTITY_MISMATCH');
 if(contractOf(canonical)!==text(contract))return fail('CONTRACT_MISMATCH');
 if(direction!==null&&upper(canonical.direction)!==upper(direction))return fail('DIRECTION_MISMATCH');
 if(text(canonical.analytical_fingerprint)!==canonicalFingerprint(canonical))return fail('CANONICAL_FINGERPRINT_MISMATCH');
 const nativeCheck=validateNativeLiquidationContext(canonical);if(!nativeCheck.ok)return fail(nativeCheck.status);
 return {status:'CLOSED',reason:null};
}

export function assessActionability({canonical,lifecycle_event,prior_sent=false}={}){
 const event=upper(lifecycle_event);const observed=stamp(canonical?.observed_ts);
 const base={deliver:false,status:'INTERNAL_ONLY',reason:'NOT_ACTIONABLE',create_recheck:false};
 if(canonical?.status!=='CLOSED'||observed===null)return {...base,reason:'CANONICAL_NOT_CLOSED'};
 if(canonical?.metadata?.lifecycle_removal&&event!=='IDEA_REMOVED')return {...base,reason:'REMOVAL_EVENT_MISMATCH'};
 if(event==='IDEA_REMOVED')return prior_sent?{deliver:true,status:'ACTIONABLE',reason:'IDEA_REMOVED_AFTER_PRIOR_DELIVERY',create_recheck:false}:{...base,reason:'REMOVAL_WITHOUT_PRIOR_DELIVERY'};
 if(!['OBSERVE','WAIT','ENTRY'].includes(event))return {...base,reason:'LIFECYCLE_NOT_USER_ACTIONABLE'};
 if(!directionClosed(canonical))return {...base,reason:'DIRECTION_NOT_CLOSED'};
 const overall=score(canonical?.scores?.overall_0_100),interest=score(canonical?.scores?.coin_interest_0_100);
 if(canonical?.scores?.is_probability!==false)return {...base,reason:'CANONICAL_SCORE_SEMANTICS_NOT_CLOSED'};
 if(event==='OBSERVE'){
   // Early surfacing uses one explicit user threshold: the canonical interest
   // score. The overall score may be absent or lower because it belongs to the
   // later, fully confirmed decision path.
   if(interest===null)return {...base,reason:'CANONICAL_INTEREST_NOT_CLOSED'};
   if(interest<70)return {...base,reason:'CANONICAL_INTEREST_BELOW_USER_THRESHOLD'};
   if(canonical.state!=='OBSERVE')return {...base,reason:'OBSERVE_STATE_MISMATCH'};
   if(!observationAreaClosed(canonical))return {...base,reason:'OBSERVE_WORKING_AREA_NOT_CLOSED'};
   if(!exactTrigger(canonical.trigger,observed))return {...base,reason:'OBSERVE_TRIGGER_NOT_CLOSED'};
   if(!earlySourceRolesClosed(canonical))return {...base,reason:'OBSERVE_SOURCE_ROLES_NOT_CLOSED'};
   return {deliver:true,status:'ACTIONABLE',reason:reportableTarget(canonical)?'EARLY_ACTIONABLE_OBSERVE':'EARLY_ACTIONABLE_OBSERVE_TARGET_PENDING',create_recheck:true};
 }
 if(!scoresClosed(canonical))return {...base,reason:'CANONICAL_SCORES_NOT_CLOSED'};
 if(overall<70||interest<70)return {...base,reason:overall<70?'CANONICAL_OVERALL_BELOW_USER_THRESHOLD':'CANONICAL_INTEREST_BELOW_USER_THRESHOLD'};
 if(event==='WAIT'){
   if(canonical.state!=='WAIT_FOR_TRIGGER')return {...base,reason:'WAIT_STATE_MISMATCH'};
   if(!exactTrigger(canonical.trigger,observed))return {...base,reason:'WAIT_TRIGGER_NOT_CLOSED'};
   if(!reportableTarget(canonical))return {...base,reason:'FAVORABLE_TARGET_NOT_PROVEN'};
   return {deliver:true,status:'ACTIONABLE',reason:'WAIT_TRIGGER_CONTRACT_CLOSED',create_recheck:true};
 }
 if(!['ENTRY_NOW_ANALYTICAL','ENTRY_NOW_VALIDATED'].includes(canonical.state))return {...base,reason:'ENTRY_STATE_MISMATCH'};
 if(!entryClosed(canonical))return {...base,reason:'ENTRY_CONTEXT_NOT_CLOSED'};
 if(!closedHardGates(canonical))return {...base,reason:'HARD_GATES_NOT_CLOSED'};
 return {deliver:true,status:'ACTIONABLE',reason:'STRICT_ENTRY_CHAIN_CLOSED',create_recheck:false};
}

// An administrative cancellation is a separate immutable publication. Its
// clock is the decision clock; no score, price or liquidation snapshot is copied.
export function validateRemovalReceipt(r,{contract,direction,wave_id,observed_ts}={}){
 if(r?.schema!=='LIFECYCLE_REMOVAL_RECEIPT_V1'||r.market_snapshot!==false||!text(r.source_run_id)||stamp(r.observed_ts)===null)return false;
 if(r.contract!==contract||r.direction!==upper(direction)||r.wave_id!==wave_id||r.observed_ts!==observed_ts)return false;
 if(!Array.isArray(r.conditions)||!r.conditions.length||r.conditions.length>6)return false;
 const predicates={HARD_VETO:c=>c.field==='hard_veto'&&c.value===1,INVALIDATED:c=>c.field==='risk_state'&&c.value==='INVALIDATED',DATA_UNUSABLE:c=>(c.field==='dq_status'&&c.value==='INSUFFICIENT')||(c.field==='data_quality'&&['INSUFFICIENT','BLOCKED'].includes(c.value)),DIRECTION_DESTROYED:c=>c.field==='direction',EXIT:c=>c.field==='lifecycle_stage'&&c.value==='EXIT',EDGE_SPENT:c=>c.field==='lifecycle_stage'&&c.value==='EDGE_SPENT',EXCLUDE:c=>c.field==='lifecycle_stage'&&c.value==='EXCLUDE'};
 return Boolean(predicates[r.reason])&&r.conditions.every(c=>text(c.source)&&text(c.row_id)&&stamp(c.observed_ts)!==null&&c.observed_ts<=r.observed_ts&&predicates[r.reason](c));
}
const REMOVAL_CHECK_RU={'futures.htx_futures_liquidity':'ликвидность фьючерса HTX','futures.htx_futures_order_flow_sample':'проверенная выборка сделок фьючерса HTX','futures.htx_open_interest':'открытый интерес HTX','futures.htx_funding':'финансирование фьючерса HTX','trajectory.price_1h':'история цены за час','trajectory.price_4h':'история цены за четыре часа','trajectory.oi_1h':'история открытого интереса за час','trajectory.oi_4h':'история открытого интереса за четыре часа','trajectory.funding_current':'текущее финансирование','trajectory.funding_history':'история финансирования'};
export function renderRemovalNotice(canonical,{manual=false}={}){
 const r=canonical?.metadata?.lifecycle_removal;
 if(!validateRemovalReceipt(r,{contract:contractOf(canonical),direction:canonical?.direction,wave_id:r?.wave_id,observed_ts:canonical?.observed_ts})||!text(r?.prior_publication_id)||!text(r?.prior_idempotency_key))return {ok:false,status:'REMOVAL_RECEIPT_NOT_CLOSED',text:null};
 const reason={HARD_VETO:'обязательная проверка риска запретила продолжение идеи',INVALIDATED:'проверка риска признала структуру идеи нарушенной',DIRECTION_DESTROYED:'повторная проверка не сохранила подтверждённое направление идеи',EXIT:'волна перешла в стадию выхода',EDGE_SPENT:'потенциал текущей волны исчерпан',EXCLUDE:'текущая волна исключена из наблюдения',DATA_UNUSABLE:'повторная проверка признала обязательные данные непригодными'}[r.reason];
 const lines=[contractOf(canonical).replace(/-USDT$/i,''),canonical.direction==='LONG'?'🟢 РОСТ':'🔴 СНИЖЕНИЕ','⛔️ ИДЕЯ СНЯТА','',`Причина: ${reason}.`];
 if(r.reason==='DATA_UNUSABLE'){
  const failed=(Array.isArray(r.failed_checks)?r.failed_checks:[]).map(k=>REMOVAL_CHECK_RU[k]).filter(Boolean);
  if(failed.length)lines.push(`Не подтверждены: ${failed.join('; ')}.`);
  else if(r.sufficiency==='INSUFFICIENT')lines.push('Исходная проверка достаточности данных завершилась отказом.');
  else lines.push('В исходной записи нет подробностей отказавшей проверки.');
 }
 if(manual)lines.push(`Проверка отмены: ${fmtMsk(r.observed_ts)} МСК.`,`Ранее отправленное сообщение: №${r.prior_telegram_message_id}.`);
 const output=lines.join('\n');return {ok:true,status:'READY',text:output,length:output.length,max_length:1800,analytical_fingerprint:canonical.analytical_fingerprint};
}

function expectedScoreText(canonical,label,key){const n=score(canonical?.scores?.[key]);return n===null?`${label}: не подтверждена`:`${label}: ${Math.round(n)} из 100`;}

function fmtScore(v){const n=score(v);return n===null?'не подтверждена':`${Math.round(n)} из 100`;}
function fmtPrice(v){const n=finite(v);return n===null?null:String(Number(n.toPrecision(10))).replace('.',',');}
function fmtPct(v,d=2){const n=finite(v);if(n===null)return null;const x=Math.abs(n).toFixed(d).replace('.',',');return `${n>0?'+':n<0?'-':''}${x}%`;}
function fmtMsk(ts){const n=stamp(ts);if(n===null)return null;return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(n)).replace(',','');}
function strength(z){return text(z?.strength_label_ru)||'сила не определена';}
function liquidationLines(c,{manual=false}={}){
 const policy=liquidationPresentationPolicy(c?.observed_ts),liq=c?.liquidations||{};if(liq.future_only===true)return displayFutureLiquidations(liq,{compact:!manual,policy});
 const pump=liq?.pump?.is_pump===true,max=pump?4:2,lines=[];
 for(const [rows,label] of [[liq.above,'Сильные зоны выше'],[liq.below,'Сильные зоны ниже']]){
  const parts=(Array.isArray(rows)?rows:[]).slice(0,max).map(z=>{const p=fmtPrice(z?.price??z?.level_price),d=finite(z?.distance_pct);if(!p)return null;const amount=finite(z?.exact_notional_usdt);return `${p} USDT${d!==null?` (${fmtPct(d,1)})`:''} — ${strength(z)}${amount!==null?`, точная сумма ${fmtPrice(amount)} USDT`:z?.kind==='CALCULATED'?', расчётная вероятная зона':''}`;}).filter(Boolean);
  if(parts.length)lines.push(`${label}: ${parts.join('; ')}.`);
 }
 const native=nativeLiquidationLines(liq,{manual,policy});
 if(native!==null&&manual)lines.push('Дополнительная фактическая выборка площадок:',...native);
 return lines.length?lines:['Ликвидации: технический сбой получения или расчёта зон.'];
}
function basisLabel(c){const b=upper(c?.metadata?.idea_basis);if(b==='LIQUIDATION_PUMP')return'ликвидационные зоны и ускорение движения';if(b==='CANDLE_ANOMALY')return'более ранняя свечная аномалия, которая сейчас подтверждается';return'совокупность рыночных подтверждений';}
function relativeLine(direction,confirmed){if(direction==='LONG')return confirmed?'Относительная сила: при снижении биткоина и эфира монета теряет меньше, а при росте растёт быстрее.':'Ждём подтверждения: при снижении биткоина и эфира монета должна терять меньше, а при росте — расти быстрее.';return confirmed?'Относительная слабость: при росте биткоина и эфира монета растёт слабее, а при снижении падает быстрее.':'Ждём подтверждения: при росте биткоина и эфира монета должна расти слабее, а при снижении — падать быстрее.';}
function relativeConfirmed(c){return(Array.isArray(c?.source_receipts)?c.source_receipts:[]).some(r=>/RELATIVE/i.test(text(r?.metric)))||(Array.isArray(c?.reasons)?c.reasons:[]).some(r=>/относительн/i.test(text(r?.label)||text(r)));}
function renderLegacyCanonicalTelegram({canonical,lifecycle_event}={}){
 if(canonical?.status!=='CLOSED')return{ok:false,status:'CANONICAL_NOT_CLOSED',text:null};const nativeGuard=validateNativeLiquidationContext(canonical);if(!nativeGuard.ok)return{ok:false,status:nativeGuard.status,text:null};const event=upper(lifecycle_event),d=upper(canonical.direction),ticker=text(canonical?.metadata?.contract||canonical?.candidates?.[0]?.contract||canonical?.candidates?.[0]?.ticker).replace(/-USDT$/i,'');
 if(!ticker||!['LONG','SHORT'].includes(d))return{ok:false,status:'DISPLAY_IDENTITY_NOT_CLOSED',text:null};
 const dir=d==='LONG'?'🟢 РОСТ':'🔴 СНИЖЕНИЕ';const title=event==='OBSERVE'?'⚪️ РАННЕЕ НАБЛЮДЕНИЕ':event==='WAIT'?'🟡 ЖДЁМ ПОДТВЕРЖДЕНИЕ ВХОДА':event==='ENTRY'?'✅ ВХОД ОДОБРЕН':event==='IDEA_REMOVED'?'⛔️ ИДЕЯ СНЯТА':null;if(!title)return{ok:false,status:'EVENT_NOT_RENDERABLE',text:null};
 const shownScore=score(canonical.scores?.overall_0_100)??score(canonical.scores?.coin_interest_0_100);
 if(['WAIT','ENTRY'].includes(event)&&!reportableTarget(canonical))return{ok:false,status:'REPORTABLE_TARGET_PROOF_NOT_CLOSED',text:null};
 const lines=[ticker,dir,title,'',`Оценка: ${shownScore===null?'не подтверждена':`${Math.round(shownScore)} из 100.`}`,`Основа идеи: ${basisLabel(canonical)}.`];
 lines.push(relativeLine(d,relativeConfirmed(canonical)));
 // Preserve the approved bullet positions and their bound. Only exact valid
 // context facts can fill unused positions; receipt-only metadata cannot.
 const contextFacts=confirmedBlockContextFacts(canonical).map(f=>`${f.label}: ${f.value} — ${f.source}.`);
 for(const fact of [...new Set([...displayMarketFacts(canonical),...contextFacts])].slice(0,event==='WAIT'?1:3))lines.push(`• ${fact}`);
 if(event==='OBSERVE'){
   const t=canonical.trigger,target=reportableTarget(canonical);lines.push('Для входа ждём:',`• закрепления цены ${d==='LONG'?'выше':'ниже'} ${fmtPrice(t?.value)} USDT;`,`• повторного подтверждения объёма, открытого интереса и ликвидаций.`,`Идея теряет интерес: ${displayCondition(t?.cancel_condition)}.`,target?`Цель после подтверждения входа: ${fmtPrice(target?.price??target)} USDT.`:'Цель после подтверждения входа: пока не подтверждена.',canonical?.metadata?.price_recheck_policy==='LIGHT_PRICE_AND_CANCELLATION_5M'?`Проверка цены и отмены: начиная с ${fmtMsk(t?.next_recheck_ts)} МСК; далее каждые 5 минут до истечения условия. Полное подтверждение входа — при следующем полном анализе.`:`Следующая проверка: ${fmtMsk(t?.next_recheck_ts)} МСК.`);
 } else if(event==='WAIT'){
   const t=canonical.trigger,target=reportableTarget(canonical);lines.push('Для входа ждём:',`• закрепления цены ${d==='LONG'?'выше':'ниже'} ${fmtPrice(t?.value)} USDT;`,'• сохранения подтверждений при повторной проверке.',`Идея теряет интерес: ${displayCondition(t?.cancel_condition)}.`,target?`Цель после подтверждения входа: ${fmtPrice(target?.price??target)} USDT.`:null,canonical?.metadata?.price_recheck_policy==='LIGHT_PRICE_AND_CANCELLATION_5M'?`Проверка цены и отмены: начиная с ${fmtMsk(t?.next_recheck_ts)} МСК; далее каждые 5 минут до истечения условия. Полное подтверждение входа — при следующем полном анализе.`:`Следующая проверка: ${fmtMsk(t?.next_recheck_ts)} МСК.`);
 } else if(event==='ENTRY'){
   const e=canonical.entry||{},target=reportableTarget(canonical);lines.push(`Зона входа: ${text(e.area)||`${fmtPrice(e.min_price)}–${fmtPrice(e.max_price)} USDT`}.`,`Начинать закрывать позицию: ${fmtPrice(target?.price??target)} USDT.`,`Отмена идеи: ${displayInvalidation(canonical.invalidation)||''}.`);
 } else lines.push('Причина: ранее отправленная идея больше не соответствует обязательным условиям.');
 lines.push(...liquidationLines(canonical));lines.push(`Снимок рынка: ${fmtMsk(canonical.observed_ts)} МСК.`);const textOut=lines.filter(Boolean).join('\n');const max=1800;if(textOut.length>max)return {ok:false,status:'MESSAGE_TOO_LONG',text:null,length:textOut.length,max_length:max};if(hasInternalTerminology(textOut))return {ok:false,status:'FORBIDDEN_INTERNAL_TERMINOLOGY',text:null};return{ok:true,status:'READY',text:textOut,length:textOut.length,max_length:max,analytical_fingerprint:canonical.analytical_fingerprint};
}
export function renderCanonicalTelegram({canonical,lifecycle_event,context_policy='OWNER_APPROVED_BRIEF_20261007'}={}){
 if(canonical?.metadata?.lifecycle_removal)return upper(lifecycle_event)==='IDEA_REMOVED'?renderRemovalNotice(canonical):{ok:false,status:'REMOVAL_EVENT_MISMATCH',text:null};
 if(!['OWNER_APPROVED_BRIEF_20261007','ORIGINAL_BRIEF_20261007','ORIGINAL_V5_20261006',RELEVANT_LIQUIDATION_PRESENTATION].includes(context_policy))return{ok:false,status:'APPROVED_CONTEXT_POLICY_REQUIRED',text:null};
 if(canonical?.status!=='CLOSED')return{ok:false,status:'CANONICAL_NOT_CLOSED',text:null};const nativeGuard=validateNativeLiquidationContext(canonical);if(!nativeGuard.ok)return{ok:false,status:nativeGuard.status,text:null};const event=upper(lifecycle_event),d=upper(canonical.direction),ticker=text(canonical?.metadata?.contract||canonical?.candidates?.[0]?.contract||canonical?.candidates?.[0]?.ticker).replace(/-USDT$/i,'');
 if(!ticker||!['LONG','SHORT'].includes(d))return{ok:false,status:'DISPLAY_IDENTITY_NOT_CLOSED',text:null};
 const dir=d==='LONG'?'🟢 РОСТ':'🔴 СНИЖЕНИЕ';const title=event==='OBSERVE'?'⚪️ РАННЕЕ НАБЛЮДЕНИЕ':event==='WAIT'?'🟡 ЖДЁМ ПОДТВЕРЖДЕНИЕ ВХОДА':event==='ENTRY'?'✅ ВХОД ОДОБРЕН':event==='IDEA_REMOVED'?'⛔️ ИДЕЯ СНЯТА':null;if(!title)return{ok:false,status:'EVENT_NOT_RENDERABLE',text:null};
 const shownScore=score(canonical.scores?.overall_0_100)??score(canonical.scores?.coin_interest_0_100);
 if(['WAIT','ENTRY'].includes(event)&&!reportableTarget(canonical))return{ok:false,status:'REPORTABLE_TARGET_PROOF_NOT_CLOSED',text:null};
 const factual=context_policy==='OWNER_APPROVED_BRIEF_20261007'||context_policy===RELEVANT_LIQUIDATION_PRESENTATION;
 const liquidationPolicy=context_policy===RELEVANT_LIQUIDATION_PRESENTATION?context_policy:liquidationPresentationPolicy(canonical.observed_ts);
 const lines=[ticker,dir,title,`Оценка: ${shownScore===null?'не подтверждена':`${Math.round(shownScore)} из 100.`}`,'',`Основа идеи: ${factual?factualIdeaBasis(canonical):basisLabel(canonical)}.`];
 const brief=context_policy!=='ORIGINAL_V5_20261006';
 const relative=brief?plainRelativeComparison(canonical):relativeLine(d,relativeConfirmed(canonical));
 if(relative&&!factual)lines.push('',relative);
 const oi=plainOpenInterest(canonical);
 const price=brief?telegramPrice:fmtPrice;
 const contextFacts=confirmedBlockContextFacts(canonical).filter(f=>!brief||isApprovedTelegramContextFact(f,canonical)).map(f=>plainContextFact(f,canonical));
 const facts=[...new Set([...(oi?[oi]:[]),...(!brief?displayMarketFacts(canonical).filter(f=>!f.startsWith('Открытый интерес HTX:')):[]),...contextFacts])].slice(0,event==='WAIT'?1:oi?2:3);
 if(!factual)for(const fact of facts)lines.push('',`• ${fact}`);
 lines.push('');
 if(event==='OBSERVE'){
   const t=canonical.trigger,target=reportableTarget(canonical);lines.push('Для входа ждём:',`• закрепления цены ${d==='LONG'?'выше':'ниже'} ${price(t?.value)} USDT;`,`• повторного подтверждения объёма, открытого интереса и ликвидаций.`,'',`Идея теряет интерес: ${plainCancellation(t?.cancel_condition,{brief})||displayCondition(t?.cancel_condition)}.`,'',target?`Цель после подтверждения входа: ${price(target?.price??target)} USDT.`:'Цель после подтверждения входа: пока не подтверждена.');
 } else if(event==='WAIT'){
   const t=canonical.trigger,target=reportableTarget(canonical);lines.push('Для входа ждём:',`• закрепления цены ${d==='LONG'?'выше':'ниже'} ${price(t?.value)} USDT;`,'• сохранения подтверждений при повторной проверке.','',`Идея теряет интерес: ${plainCancellation(t?.cancel_condition,{brief})||displayCondition(t?.cancel_condition)}.`,'',target?`Цель после подтверждения входа: ${price(target?.price??target)} USDT.`:null);
 } else if(event==='ENTRY'){
   const e=canonical.entry||{},target=reportableTarget(canonical);lines.push(`Зона входа: ${text(e.area)||`${price(e.min_price)}–${price(e.max_price)} USDT`}.`,`Начинать закрывать позицию: ${price(target?.price??target)} USDT.`,`Отмена идеи: ${displayInvalidation(canonical.invalidation)||''}.`);
 } else lines.push('Причина: ранее отправленная идея больше не соответствует обязательным условиям.');
 lines.push('',...(brief?displayBriefTelegramLiquidations(canonical.liquidations,telegramPrice,{policy:liquidationPolicy}):liquidationLines(canonical)));const joined=lines.filter(x=>x!==null&&x!==undefined).join('\n');const textOut=brief?omitTelegramCurrencies(joined):joined;const max=1800;if(textOut.length>max)return {ok:false,status:'MESSAGE_TOO_LONG',text:null,length:textOut.length,max_length:max};if(hasInternalTerminology(textOut))return {ok:false,status:'FORBIDDEN_INTERNAL_TERMINOLOGY',text:null};return{ok:true,status:'READY',text:textOut,length:textOut.length,max_length:max,analytical_fingerprint:canonical.analytical_fingerprint};
}
export function renderCanonicalManual({canonical,liquidation_policy=liquidationPresentationPolicy(canonical?.observed_ts)}={}){return canonical?.metadata?.lifecycle_removal?renderRemovalNotice(canonical,{manual:true}):formatManualReport(canonical,{liquidation_policy});}

export function validatePresentation({canonical,manual_text,telegram_text,direction,lifecycle_event}={}){
 const fail=reason=>({status:'NOT_CLOSED',reason,presentation_hash:null});
 if(!text(manual_text)||!text(telegram_text))return fail('BOTH_PRESENTATIONS_REQUIRED');
 const nativeCheck=validateNativeLiquidationContext(canonical);if(!nativeCheck.ok)return fail(nativeCheck.status);
 const policy=liquidationPresentationPolicy(canonical?.observed_ts),nl=nativeLiquidationLines(canonical?.liquidations,{policy}),ml=nativeLiquidationLines(canonical?.liquidations,{manual:true,policy});
 if(ml&&ml.some(line=>!manual_text.includes(line)))return fail('NATIVE_LIQUIDATION_MANUAL_TEXT_MISMATCH');
 const d=upper(direction??canonical?.direction);
 for(const output of [manual_text,telegram_text]){
 if(d==='LONG'){
   if(!/(Направление:\s*покупка|🟢\s*РОСТ)/iu.test(output))return fail('LONG_DIRECTION_NOT_RENDERED');
   if(/🔴\s*СНИЖЕНИЕ|Направление:\s*продажа/iu.test(output))return fail('DISPLAY_DIRECTION_MISMATCH');
 } else if(d==='SHORT'){
   if(!/(Направление:\s*продажа|🔴\s*СНИЖЕНИЕ)/iu.test(output))return fail('SHORT_DIRECTION_NOT_RENDERED');
   if(/🟢\s*РОСТ|Направление:\s*покупка/iu.test(output))return fail('DISPLAY_DIRECTION_MISMATCH');
 } else return fail('DISPLAY_DIRECTION_BINDING_REQUIRED');
 }
 const event=upper(lifecycle_event)||({'WAIT_FOR_TRIGGER':'WAIT','OBSERVE':'OBSERVE','ENTRY_NOW_ANALYTICAL':'ENTRY','ENTRY_NOW_VALIDATED':'ENTRY','REJECTED':'IDEA_REMOVED'})[canonical?.state];
 const expectedTelegram=renderCanonicalTelegram({canonical,lifecycle_event:event});
 if(!expectedTelegram.ok)return fail(expectedTelegram.status);
 if(telegram_text!==expectedTelegram.text){
  // Preserve already stored V5 bytes before the owner removed internal
  // diagnostics. New publications must use the approved brief fact selection.
  const briefCutover=Date.parse('2026-10-07T01:30:00Z');
  const originalV5=canonical.observed_ts<briefCutover?renderCanonicalTelegram({canonical,lifecycle_event:event,context_policy:'ORIGINAL_V5_20261006'}):null;
  const originalBrief=canonical.observed_ts<IDEA_BASIS_CUTOVER?renderCanonicalTelegram({canonical,lifecycle_event:event,context_policy:'ORIGINAL_BRIEF_20261007'}):null;
  // Immutable pre-approval publications may retain their exact approved V4 bytes.
  // New snapshots must use V5; this never rewrites or resends historical messages.
  const cutover=Date.parse('2026-10-06T18:37:54Z');
  const legacy=canonical.observed_ts<cutover?renderLegacyCanonicalTelegram({canonical,lifecycle_event:event}):null;
  if((!originalBrief?.ok||telegram_text!==originalBrief.text)&&(!originalV5?.ok||telegram_text!==originalV5.text)&&(!legacy?.ok||telegram_text!==legacy.text))return fail('TELEGRAM_CANONICAL_CONTENT_MISMATCH');
 }
 const expectedManual=renderCanonicalManual({canonical});
 if(!expectedManual.ok)return fail(expectedManual.status);
 if(manual_text!==expectedManual.text)return fail('MANUAL_CANONICAL_CONTENT_MISMATCH');
 return {status:'CLOSED',reason:null,presentation_hash:sha256({manual_text,telegram_text,analytical_fingerprint:canonical.analytical_fingerprint})};
}

export function makePublicationId({contract,direction,run_id,snapshot_id,observed_ts,analytical_fingerprint,wave_id=null}={}){
 if(!text(contract)||!text(run_id)||!text(snapshot_id)||stamp(observed_ts)===null||!text(analytical_fingerprint))return null;
 return 'PUB:'+sha256([text(contract),upper(direction)||'NONE',text(run_id),text(snapshot_id),Number(observed_ts),text(analytical_fingerprint),text(wave_id)||'NONE'].join('|')).slice(0,40);
}

export async function persistCanonicalSnapshot(db,{canonical,presentation_inputs={},wave_id=null,decision_id=null,now_ts=Date.now()}={}){
 if(!db?.prepare)return {status:'SOURCE_UNSUPPORTED',persisted:false};
 const contract=contractOf(canonical),direction=directionClosed(canonical)?upper(canonical.direction):null,run_id=text(canonical?.run_id),snapshot_id=text(canonical?.snapshot_id),observed_ts=stamp(canonical?.observed_ts);
 const idCheck=validateCanonicalIdentity(canonical,{contract,run_id,snapshot_id,observed_ts});if(idCheck.status!=='CLOSED')return {...idCheck,persisted:false};
 const publication_id=makePublicationId({contract,direction,run_id,snapshot_id,observed_ts,analytical_fingerprint:canonical.analytical_fingerprint,wave_id});
 try{
  const r=await db.prepare(`INSERT INTO canonical_publication_shadow(publication_id,contract_code,direction,run_id,snapshot_id,wave_id,decision_id,observed_ts,valid_until_ts,lifecycle_event,canonical_state,analytical_fingerprint,canonical_json,presentation_inputs_json,manual_text,telegram_text,presentation_hash,actionability_status,actionability_reason,created_ts,bound_ts,shadow_only) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,NULL,?10,?11,?12,?13,NULL,NULL,NULL,'UNASSESSED',NULL,?14,NULL,1) ON CONFLICT(publication_id) DO NOTHING`).bind(publication_id,contract,direction,run_id,snapshot_id,text(wave_id)||null,text(decision_id)||null,observed_ts,stamp(canonical?.trigger?.expires_ts)??stamp(canonical?.metadata?.valid_until_ts),text(canonical.state),text(canonical.analytical_fingerprint),JSON.stringify(canonical),JSON.stringify(presentation_inputs||{}),Math.trunc(Number(now_ts)||Date.now())).run();
  const changes=Number(r?.meta?.changes??r?.changes??0);const row=await db.prepare(`SELECT publication_id,analytical_fingerprint,canonical_json FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1`).bind(publication_id).first();
  if(!row||row.analytical_fingerprint!==canonical.analytical_fingerprint||sha256(JSON.parse(row.canonical_json))!==sha256(canonical))return {status:'PERSISTENCE_READBACK_FAILED',persisted:false,publication_id};
  return {status:changes===1?'CLOSED':'DEDUPLICATED',persisted:changes===1,publication_id,contract,direction,run_id,snapshot_id,observed_ts};
 }catch(error){return {status:'PERSISTENCE_FAILED',persisted:false,error:String(error?.message||error).slice(0,400)};}
}

export async function finalizePublication(db,{publication_id,lifecycle_event,direction,manual_text,telegram_text,prior_sent=false,now_ts=Date.now()}={}){
 const row=await db.prepare(`SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1`).bind(text(publication_id)).first();if(!row)return {status:'PUBLICATION_NOT_FOUND',deliver:false};
 if(Number(now_ts)>=Date.parse('2026-10-09T08:30:00Z')&&text(row.lifecycle_event)&&upper(row.lifecycle_event)!==upper(lifecycle_event))return {status:'IMMUTABLE_PUBLICATION_EVENT_MISMATCH',deliver:false};
 let canonical;try{canonical=JSON.parse(row.canonical_json);}catch{return {status:'CANONICAL_JSON_INVALID',deliver:false};}
 const id=validateCanonicalIdentity(canonical,{contract:row.contract_code,direction,run_id:row.run_id,snapshot_id:row.snapshot_id,observed_ts:row.observed_ts});if(id.status!=='CLOSED')return {...id,deliver:false};
 const action=assessActionability({canonical,lifecycle_event,prior_sent});
 if(action.deliver!==true){await db.prepare(`UPDATE canonical_publication_shadow SET lifecycle_event=?2,actionability_status='INTERNAL_ONLY',actionability_reason=?3,bound_ts=?4 WHERE publication_id=?1`).bind(row.publication_id,upper(lifecycle_event),action.reason,Math.trunc(Number(now_ts)||Date.now())).run();return {...action,publication_id:row.publication_id};}
 const p=validatePresentation({canonical,manual_text,telegram_text,direction,lifecycle_event});if(p.status!=='CLOSED')return {...p,deliver:false,publication_id:row.publication_id};
 const valid=stamp(canonical?.trigger?.expires_ts)??stamp(canonical?.metadata?.valid_until_ts)??row.valid_until_ts;
 const u=await db.prepare(`UPDATE canonical_publication_shadow SET direction=?2,lifecycle_event=?3,valid_until_ts=?4,manual_text=?5,telegram_text=?6,presentation_hash=?7,actionability_status='ACTIONABLE',actionability_reason=?8,bound_ts=?9 WHERE publication_id=?1 AND analytical_fingerprint=?10`).bind(row.publication_id,upper(direction),upper(lifecycle_event),valid,manual_text,telegram_text,p.presentation_hash,action.reason,Math.trunc(Number(now_ts)||Date.now()),row.analytical_fingerprint).run();
 if(Number(u?.meta?.changes??u?.changes??0)!==1)return {status:'PUBLICATION_UPDATE_ACK_FAILED',deliver:false};
 return {...action,status:'ACTIONABLE',publication_id:row.publication_id,presentation_hash:p.presentation_hash,valid_until_ts:valid,canonical};
}

export async function bindDispatchToPublication(db,{idempotency_key,publication_id,contract,direction,wave_id,lifecycle_event,rules_version,decision_id=null,now_ts=Date.now()}={}){
 const pub=await db.prepare(`SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1`).bind(text(publication_id)).first();if(!pub)return {status:'PUBLICATION_NOT_FOUND',bound:false};
 if(pub.actionability_status!=='ACTIONABLE'||!text(pub.presentation_hash)||!text(pub.telegram_text))return {status:'PUBLICATION_NOT_ACTIONABLE',bound:false};
 if(pub.contract_code!==text(contract)||upper(pub.direction)!==upper(direction)||text(pub.wave_id)!==text(wave_id)||upper(pub.lifecycle_event)!==upper(lifecycle_event))return {status:'PUBLICATION_DISPATCH_IDENTITY_MISMATCH',bound:false};
 if(upper(lifecycle_event)==='ENTRY'&&text(pub.decision_id)!==text(decision_id))return {status:'DECISION_ID_MISMATCH',bound:false};
 try{const r=await db.prepare(`INSERT INTO v3_dispatch_publication_binding_shadow(idempotency_key,publication_id,contract_code,direction,wave_id,lifecycle_event,rules_version,decision_id,snapshot_id,run_id,observed_ts,analytical_fingerprint,presentation_hash,created_ts,shadow_only) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,1) ON CONFLICT(idempotency_key) DO NOTHING`).bind(text(idempotency_key),pub.publication_id,pub.contract_code,upper(pub.direction),text(wave_id),upper(lifecycle_event),text(rules_version),text(decision_id)||null,pub.snapshot_id,pub.run_id,pub.observed_ts,pub.analytical_fingerprint,pub.presentation_hash,Math.trunc(Number(now_ts)||Date.now())).run();const changes=Number(r?.meta?.changes??r?.changes??0);const got=await db.prepare(`SELECT * FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key=?1 LIMIT 1`).bind(text(idempotency_key)).first();if(!got||got.publication_id!==pub.publication_id||got.presentation_hash!==pub.presentation_hash)return {status:'BIND_READBACK_FAILED',bound:false};return {status:changes===1?'CLOSED':'DEDUPLICATED',bound:true,publication_id:pub.publication_id};}catch(error){return {status:'BIND_FAILED',bound:false,error:String(error?.message||error).slice(0,300)};}
}

export async function loadBoundTelegram(db,{idempotency_key,now_ts=Date.now()}={}){
 const b=await db.prepare(`SELECT * FROM v3_dispatch_publication_binding_shadow WHERE idempotency_key=?1 LIMIT 1`).bind(text(idempotency_key)).first();if(!b)return {status:'BINDING_NOT_FOUND',ok:false};
 const p=await db.prepare(`SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 LIMIT 1`).bind(b.publication_id).first();if(!p)return {status:'PUBLICATION_NOT_FOUND',ok:false};
 if(p.actionability_status!=='ACTIONABLE'||p.presentation_hash!==b.presentation_hash||p.analytical_fingerprint!==b.analytical_fingerprint||p.snapshot_id!==b.snapshot_id||p.run_id!==b.run_id||Number(p.observed_ts)!==Number(b.observed_ts)||p.contract_code!==b.contract_code||upper(p.direction)!==upper(b.direction)||upper(p.lifecycle_event)!==upper(b.lifecycle_event)||text(p.wave_id)!==text(b.wave_id))return {status:'BOUND_PUBLICATION_MISMATCH',ok:false};
 if(upper(b.lifecycle_event)==='ENTRY'&&text(p.decision_id)!==text(b.decision_id))return {status:'BOUND_DECISION_MISMATCH',ok:false};
 let canonical;try{canonical=JSON.parse(p.canonical_json);}catch{return {status:'CANONICAL_JSON_INVALID',ok:false};}
 const id=validateCanonicalIdentity(canonical,{contract:b.contract_code,direction:b.direction,run_id:b.run_id,snapshot_id:b.snapshot_id,observed_ts:b.observed_ts});if(id.status!=='CLOSED')return {...id,ok:false};
 if(upper(b.lifecycle_event)==='OBSERVE'&&!earlySourceRolesClosed(canonical))return {status:'OBSERVE_SOURCE_ROLES_NOT_CLOSED',ok:false};
 const ph=sha256({manual_text:p.manual_text,telegram_text:p.telegram_text,analytical_fingerprint:p.analytical_fingerprint});if(ph!==b.presentation_hash)return {status:'PRESENTATION_CONTENT_MISMATCH',ok:false};
 const display=validatePresentation({canonical,manual_text:p.manual_text,telegram_text:p.telegram_text,direction:b.direction,lifecycle_event:b.lifecycle_event});if(display.status!=='CLOSED')return {...display,ok:false};
 const now=Math.trunc(Number(now_ts)||Date.now());const nativeFreshness=validateNativeLiquidationContext(canonical,{checked_ts:now,check_freshness:upper(b.lifecycle_event)!=='IDEA_REMOVED'});if(!nativeFreshness.ok)return {status:nativeFreshness.status,ok:false};if(p.valid_until_ts!=null&&Number(p.valid_until_ts)<now&&upper(b.lifecycle_event)!=='IDEA_REMOVED')return {status:'PUBLICATION_EXPIRED',ok:false};
 let prior_delivery_verified=false;
 if(upper(b.lifecycle_event)==='IDEA_REMOVED'){
  const visible=await db.prepare(`SELECT idempotency_key FROM v3_telegram_dispatch_shadow WHERE contract=?1 AND direction=?2 AND wave_id=?3 AND state='SENT' AND lifecycle_event IN ('OBSERVE','WAIT','ENTRY') AND CAST(telegram_message_id AS INTEGER)>0 AND updated_ts<?4 ORDER BY updated_ts DESC LIMIT 1`).bind(b.contract_code,b.direction,b.wave_id,Number(p.bound_ts??now)).first();
  if(!visible)return {status:'REMOVAL_WITHOUT_PRIOR_DELIVERY',ok:false};prior_delivery_verified=true;
 }
 return {status:'CLOSED',ok:true,publication_id:p.publication_id,text:p.telegram_text,manual_text:p.manual_text,canonical,analytical_fingerprint:p.analytical_fingerprint,presentation_hash:p.presentation_hash,prior_delivery_verified,block_rendered_results:auditRenderedBlockResults({canonical,manual:{ok:true,text:p.manual_text},telegram:{ok:true,text:p.telegram_text,analytical_fingerprint:canonical.analytical_fingerprint}})};
}

export async function loadExactManual(db,{publication_id,expected_identity=null}={}){
 const p=await db.prepare(`SELECT * FROM canonical_publication_shadow WHERE publication_id=?1 AND actionability_status='ACTIONABLE' LIMIT 1`).bind(text(publication_id)).first();
 if(!p||!text(p.manual_text))return {status:'NOT_FOUND',ok:false};let canonical;try{canonical=JSON.parse(p.canonical_json);}catch{return {status:'CANONICAL_JSON_INVALID',ok:false};}
 const identity=validateCanonicalIdentity(canonical,{contract:p.contract_code,direction:p.direction,run_id:p.run_id,snapshot_id:p.snapshot_id,observed_ts:p.observed_ts});if(identity.status!=='CLOSED')return {...identity,ok:false};
 if(expected_identity&&Object.entries(expected_identity).some(([k,v])=>({publication_id:p.publication_id,contract:p.contract_code,direction:p.direction,run_id:p.run_id,snapshot_id:p.snapshot_id,observed_ts:p.observed_ts})[k]!==v))return {status:'MANUAL_EXACT_IDENTITY_MISMATCH',ok:false};
 const actual=sha256({manual_text:p.manual_text,telegram_text:p.telegram_text,analytical_fingerprint:p.analytical_fingerprint});
 if(actual!==p.presentation_hash||canonical.analytical_fingerprint!==p.analytical_fingerprint)return {status:'PRESENTATION_CONTENT_MISMATCH',ok:false};
 return {status:'CLOSED',ok:true,text:p.manual_text,canonical,analytical_fingerprint:p.analytical_fingerprint,presentation_hash:p.presentation_hash,full_presentation_hash_verified:true,historical_snapshot:true};
}

export default {CANONICAL_PUBLICATION_VERSION,canonicalFingerprint,validateCanonicalIdentity,assessActionability,renderCanonicalTelegram,renderCanonicalManual,validatePresentation,makePublicationId,persistCanonicalSnapshot,finalizePublication,bindDispatchToPublication,loadBoundTelegram,loadExactManual};
