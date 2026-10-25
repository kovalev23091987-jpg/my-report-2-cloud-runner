import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const base='pump-report/handoffs/analytics/package-m';
const tz='/Users/mac/Downloads/MY_REPORT_2_TRANSFER_20261011 3/PUMP_REPORT_DESIGN_HANDOFF_20261025/PUMP_REPORT_TZ_FOR_TRANSFER_RU.md';
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=await readFile(tz),tzsha=hash(raw);if(tzsha!=='0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc')throw Error('TZ_BYTES_CHANGED');
const lines=raw.toString().split('\n'),rootpath='checkpoints/pump-report-20261025/FULL_TZ_TRACEABILITY.json',rootraw=await readFile(rootpath),root=JSON.parse(rootraw);
for(const r of root.rows)if(lines[r.line-1]!==r.text)throw Error('ROOT_ID_LINE_TEXT_MISMATCH '+r.id);
const catalog=JSON.parse(await readFile(base+'/evidence-catalog.json','utf8')).proofs;
const P={};
async function proof(alias,path,pattern){
  const p='pump-report/handoffs/analytics/'+path,item=catalog.find(x=>x.path===p);if(!item)throw Error('NO_PROOF '+p);
  let name=null;
  if(pattern){const text=await readFile(p,'utf8'),parts=text.split(/^# Subtest: /m).slice(1),part=parts.find(x=>pattern.test(x.split('\n')[0]));if(!part||!/^ok \d+/m.test(part))throw Error('NO_ACCEPTED_CASE '+alias);name=part.split('\n')[0];}
  P[alias]={path:p,sha256:item.sha256,case:name??'frozen package qualification',proof_type:'CODE_OR_ARTIFICIAL_ACCEPTANCE_NOT_NATIVE'};
}
await proof('A','qualification.json');
await proof('B','package-b/qualification.json');
await proof('C','package-c/qualification.json');
await proof('D','package-d/qualification.json');
await proof('F','package-f/qualification.json');
await proof('E','package-e-final-assembled/root-final-results.tap',/^E01 /);
await proof('E5','package-e-final-assembled/root-final-results.tap',/^E05 /);
await proof('E6','package-e-final-assembled/root-final-results.tap',/^E06 /);
await proof('E9','package-e-final-assembled/root-final-results.tap',/^E09 /);
await proof('E10','package-e-final-assembled/root-final-results.tap',/^E10 /);
await proof('G','package-g/boundary-final.tap',/^G09 /);
await proof('I','package-i/test-results-final.tap',/^I01 /);
for(const n of [2,3,5,6,7,8,9,10,12,14,15,17,18,20,21,22,25])await proof('I'+n,'package-i/test-results-final.tap',new RegExp('^I'+String(n).padStart(2,'0')+' '));
await proof('J2','package-j/test-results-final.tap',/^J02 /);
await proof('Jold','package-j/affected-corrected-one.tap',/^old inactive/);
for(const n of [1,2,3])await proof('K'+n,'package-k/test-results.tap',new RegExp('^K0'+n+' '));
for(const n of [1,2,3,4,5,6,8])await proof('L'+n,'package-l/test-results-initial.tap',new RegExp('^L0'+n+' '));
await proof('L7','package-l/purpose-corrected-one.tap',/^L07 /);
for(const n of [1,2,18,22])await proof('H'+n,'package-h/test-results-final.tap',new RegExp('^H'+String(n).padStart(2,'0')+' '));
await proof('Dtrade','package-d/test-results.tap',/^D all optional contexts/);
await proof('Dclock','package-d/test-results.tap',/^D optional trades use/);
await proof('Dunknown','package-d/test-results.tap',/^D unknown units/);
await proof('Drelative','package-d/test-results.tap',/^D asynchronous benchmark/);
await proof('Dmap','package-d/test-results.tap',/^D maps add/);
await proof('Dfuture','package-d/test-results.tap',/^D audit future or unknown/);

const codeCache=new Map();
async function code(ref){const [relative,method]=ref.split('::'),path='pump-report/'+relative;if(!codeCache.has(path)){const b=await readFile(path);codeCache.set(path,{path,sha256:hash(b),text:b.toString()});}const f=codeCache.get(path),needle=method??'',index=f.text.indexOf(needle);return {path,method:method??null,line:index<0?null:f.text.slice(0,index).split('\n').length,sha256:f.sha256};}
const rules=[];
function rule(from,to,status,refs,proofs,remaining,override=null){rules.push({from,to,status,refs,proofs,remaining,override});}
const move=['analytics/movement.mjs::analyzeMovement'],growth=['analytics/movement.mjs::growthWindows','analytics/day-growth.mjs::consumeObservedDayGrowth'],plan=['analytics/movement.mjs::constructPlan','analytics/index.mjs::notification_eligibility'],liq=['analytics/liquidity.mjs::measureLiquidity'],zone=['analytics/zones.mjs::selectZones'],context=['analytics/context.mjs::explainOptionalFacts'],outcome=['analytics/outcome.mjs::evaluateOutcome'],summary=['analytics/summary.mjs::summarizeOutcomes','analytics/materialized-summary.mjs::foldPreparedOutcomeRecord'],cal=['analytics/cohort-audit.mjs::auditCohortSample','analytics/cohort-audit.mjs::auditPairedAnalyses'],card=['analytics/index.mjs::render','analytics/presentation.mjs::growthProofLine'],manual=['analytics/manual-text.mjs::explainManualAnalysis'];
const later='Нужна приёмка на текущем разрешённом инструменте и актуальной версии L; прошлые code fixtures не доказывают production coverage.';
// All rules are explicit intervals of exact source lines. Later rules override
// narrower semantics; unassigned requirements remain PARTIAL, never a PASS.
rule(9,11,'VERIFIED_CODE',[...zone,...plan],['L1','L4','L5'],'Native пригодная карта по разрешённой монете не подтверждена; базовый безкарточный consumer проверен.');
rule(29,39,'PARTIAL',[...move,...plan,...card],['L1','L3','L4'],later);
rule(34,34,'VERIFIED_CODE',plan,['L1'],later);
rule(35,35,'PARTIAL',zone,['L5'],'Consumer зон проверен; реальные пригодные зоны текущему production инструменту не предъявлены.');
rule(36,37,'VERIFIED_CODE',plan,['L1','L4'],later);
rule(39,39,'VERIFIED_CODE',[...plan,...outcome],['K1','L1'],'Торговли и исполнения заявок нет; реальные результаты пользователя не утверждаются.');
rule(45,45,'PARTIAL',['contracts/index.mjs::assertInstrument'],['A'],'Источник должен доказать crypto identity всего целевого списка; 934 active USDT ≠ crypto N. Unknown исключены; BTC/ETH отдельно исключены владельцем.');
rule(46,46,'VERIFIED_CODE',plan,['L1'],'Только long pullback plan, без торговли.');
rule(47,47,'VERIFIED_CODE',growth,['L1','L6'],'Отдельный пробел manual-first→AUTO описан в M; первый AUTO и квалифицированная retained волна проверены.');
rule(48,48,'VERIFIED_CODE',growth,['A'],'Верхнего ценового ceiling в growthAtLeast нет; текущий полный universe не подтверждён.');
rule(49,49,'VERIFIED_CODE',[...move,...liq,...plan],['I9','I15','L4'],later);
rule(50,51,'VERIFIED_CODE',plan,['L3','L5'],'Глубина сама по себе не blanket veto; invalidation остаётся наблюдаемым ограничением.');
rule(52,52,'VERIFIED_CODE',plan,['L4'],'По последней команде minimum gross >=10 теперь обязательный допуск; +20 не дорисовывается.','OWNER_MIN10');
rule(53,54,'VERIFIED_CODE',[...liq,...plan],['A','L1'],'Размер рассчитан внутри; численная строка размера удалена из пользовательского текста по owner amendment.','OWNER_REMOVE_SIZE');
rule(55,56,'VERIFIED_CODE',zone,['L1','L5'],later);
rule(60,60,'VERIFIED_CODE',['analytics/index.mjs::analyzePump',...manual],['L1','L2','L4'],'Подключение runtime обоих режимов требует отдельной current-policy integration receipt.');
rule(63,63,'DEFERRED_BY_TZ',cal,['F','L7'],'Рабочее обучение/валидация вероятности после накопления независимой production выборки.');
rule(65,65,'VERIFIED_CODE',context,['Drelative'],'Market context дополнительный, глобального veto по рынку нет; живой producer ещё не подтверждён.');
rule(71,71,'PARTIAL',move,['L1','I12'],'Основной детектор есть; не все семантики ускорения/повторных неудачных high реализованы, manual-first qualification требует исправления.');
rule(72,72,'PARTIAL',context,['Dtrade','Dunknown'],'Есть суммы direction-qualified выборки; динамика price impact/absorption не реализована и не утверждается.');
rule(73,73,'VERIFIED_CODE',liq,['A','L1'],later);
rule(74,74,'VERIFIED_CODE',context,['Dtrade'],'OI/funding single-snapshot контекст есть; реальная текущая native пригодность каждого поля — SOURCES.');
rule(75,75,'PARTIAL',context,['Drelative'],'Consumer сопоставимых закрытых окон есть, реальный market-context producer не подключён/не доказан.');
rule(76,76,'PARTIAL',zone,['L5'],'Квалификация/слияние/выбор зон проверены; native карта остаётся неподтверждённой.');
rule(78,85,'DEFERRED_BY_TZ',['profile/start-v1.mjs::support_persistence_enabled'],['A'],'Седьмой блок не включён: проверка пользы/расходов допускается после запуска, не по одному стакану.');
rule(108,112,'PARTIAL',['analytics/index.mjs::analyzePump','runtime/runner.mjs::checkInstrument'],['E'],'Аналитика не делает HTTP; broker reuse/полный budget/cadence — ROOT/SOURCES, единый native all-universe путь не подтверждён.');
rule(120,141,'VERIFIED_CODE',['contracts/index.mjs::assertInput','analytics/index.mjs::coreFact','analytics/math.mjs::closedCandles'],['I2','I3','I5','I6','I7','I14','I21'],'Consumer не выдумывает единицы. Достоверность первичной идентификации/покрытие всего списка требует SOURCE native proof.');
rule(145,156,'VERIFIED_CODE',['analytics/index.mjs::analyzePump','analytics/anchors.mjs::selectOutcomeAnchor','runtime/outcome-journal.mjs::remember'],['D','K1','K3','L1'],'Сохранение, hash/readback/delivery — отдельная ROOT ответственность; новая production цепочка L пока не подтверждена.');
rule(164,177,'PARTIAL',['runtime/runner.mjs::updateDiscovery','runtime/runner.mjs::selectAutomatic'],['E'],'Нет native полного crypto-universe/cadence. Новая вселенная не равна 934/900 и не наследует HTX119/105.');
rule(181,201,'VERIFIED_CODE',growth,['J2','L1','L6'],'Широкий reported ticker не повышается до exact-qualified окна; native подтверждение J/L по разрешённому instrument ожидается.');
rule(205,212,'VERIFIED_CODE',move,['Jold','I9'],'Один старый дневной процент не создаёт active wave; полная семантика стадий остаётся инженерным приближением.');
rule(214,218,'VERIFIED_CODE',move,['L3','I10','I12'],'Сохранённая непустая qualification/ID/created/expiry сохраняются; см. отдельный подтверждённый manual-first [] дефект.');
rule(220,224,'PARTIAL',[...growth,...move],['A','I14'],'Короткие окна и SHORT_HISTORY реализованы; отдельная производственная cohort для short history и гарантии полноты обнаружения не доказаны.');
rule(232,238,'PARTIAL',move,['A','L3'],'Состояния вычисляются детерминированными OHLC/volume proxy; ускорение, price impact и повторные неудачные вершины покрыты не полностью.');
rule(234,235,'VERIFIED_CODE',move,['A','L3'],'Разделены sharp unconfirmed/reclaimed на закрытых барах; это не доказательство intentions или исполнения.');
rule(238,238,'VERIFIED_CODE',move,['I10'],'M cancellation-control: CANCELLED после возврата цены сохраняется; новое подтверждение post-cancel impulse рассматривается как новый эпизод.');
rule(240,253,'PARTIAL',move,['A','I12'],'Calm/resumption activity proxy есть; trade-price response и скорость/величина выкупа как независимые признаки полностью не реализованы.');
rule(255,261,'VERIFIED_CODE',context,['Dunknown','Dtrade'],'Нет утверждений о намерениях, поглощении и наборе шортов по одному OI; native дополнительные данные не доказаны.');
rule(271,272,'VERIFIED_CODE',['profile/start-v1.mjs::candle_interval_ms',...move],['I14','L1'],'Профиль — инженерный, не прибыльно валидированный.');
rule(273,273,'PARTIAL',['profile/start-v1.mjs::activity_windows_ms',...move],['L1'],'activity_windows_ms объявляет 3/5 минут, но основной volumeComparison использует только impulse_window_ms=5 минут; отдельный 3m consumer отсутствует.');
rule(274,274,'VERIFIED_CODE',move,['I8','I25'],'2x медиана сопоставимых предыдущих окон; нет численной прибыльной валидации порога.');
rule(275,275,'PARTIAL',move,['A'],'SHORT_HISTORY хранится, но самостоятельная production quality/cohort доказательная проверка короткой истории не предъявлена.');
rule(276,282,'VERIFIED_CODE',['analytics/index.mjs::coreFact',...zone,...context],['I14','Dclock','Drelative'],'Контроль часов consumer есть; обновление age не восстанавливает старый event clock.');
rule(285,294,'VERIFIED_CODE',['analytics/math.mjs::closedCandles',...move],['I8','I9','I10','I12','I17','I25'],'Native quantity только same-source relative; абсолютный оборот не выводится из close×quantity.');
rule(296,298,'VERIFIED_CODE',[...move,'profile/start-v1.mjs::sharp_speed_multiple'],['I12','L3'],'Нормирование инженерное, не оптимизированное по реальному production потоку.');
rule(302,312,'VERIFIED_CODE',liq,['A','L1'],'Внутренние size/depth/slippage сохраняются. Публичная численная строка размера отменена новой командой.','OWNER_REMOVE_SIZE');
rule(316,320,'VERIFIED_CODE',plan,['L1','L4','L5'],'Структурные pivots известны до анализа; карты не заменяют самостоятельный план.');
rule(322,332,'VERIFIED_CODE',[...plan,'analytics/context.mjs::explainMapPlan'],['L1','L4','L5','Dmap'],'Одна whole-position exit; potential gross от entry отличается от +10%P0/4h. Вход/выход не дотягиваются для min10.');
rule(336,342,'VERIFIED_CODE',[...plan,...outcome],['L3','H18'],'Наблюдаемая invalidation есть; реального пользовательского входа/ордера не предполагается. Старый ENTRYfollowup по owner deferral не возобновлён.');
rule(346,353,'VERIFIED_CODE',[...zone,...plan,...card],['L1','L4','L5'],'Отсутствие карты не является gate. При неподтверждённом плане/минимуме нет card.');
rule(355,355,'PARTIAL',['sources/liquidations.mjs',...zone],['L5'],'Native free map coverage по текущим разрешённым инструментам не доказано.');
rule(359,368,'PARTIAL',['sources/liquidations.mjs','runtime/runner.mjs::checkInstrument',...zone],['E','L1'],'Нужна ROOT/SOURCES current-policy receipt chain/deadline/reserve. Карта не блокирует consumer при пригодном самостоятельном плане.');
rule(372,397,'VERIFIED_CODE',zone,['A','G','L5'],'Проверяются отдельные зоны/lineage/currency/времена; поставщицкая подлинность не доказывается флагом usable.');
rule(401,416,'VERIFIED_CODE',['analytics/zones.mjs::magnitudeTier',...card],['G','L5'],'Денежные tier внутренние; relative scale не превращается в USD и не сравнивается с другой шкалой.');
rule(420,449,'VERIFIED_CODE',zone,['A','G','L5'],'Максимум компоненты/ограниченное слияние, не сумма overlapping models; нет native positive-map acceptance.');
rule(603,614,'PARTIAL',['runtime/runner.mjs::checkOutcomes','runtime/delivery.mjs::automaticWindowOpen'],['E5','E6'],'Дневные fence проверялись офлайн в E. Новый production schedule/cadence фактически выключен; ночных IO не выполнялось.');
rule(616,630,'PARTIAL',['runtime/manual-input.mjs::parseManualInput','runtime/runner.mjs::enqueueManual',...manual],['E6','L2','L4'],'Аналитика общая и понятный отказ есть; current-policy native manual для разрешённой монеты пока не принят.');
rule(627,629,'VERIFIED_CODE',['analytics/index.mjs::analyzePump',...manual],['L2','L4'],'Ручной разбор может не пересечь auto threshold, но min potential и обязательные данные сохраняются.');
rule(632,632,'VERIFIED_CODE',['analytics/index.mjs::analyzePump'],['L1','L2'],'Режим меняет повод/публикацию, не набор core проверок.');
rule(638,671,'VERIFIED_CODE',[...outcome,'analytics/anchors.mjs::selectOutcomeAnchor'],['K1','K2','K3','H18','H22'],'Проверенный код/искусственный исторический bridge; фактический production исход новой разрешённой монеты ещё отсутствует.');
rule(675,677,'VERIFIED_CODE',['analytics/outcome.mjs::scenario'],['C'],'Касания и entry→exit price scenario без исполнения; intrabar порядок неизвестен при одной свече.');
rule(678,678,'UNIMPLEMENTED',['analytics/outcome.mjs::scenario'],['C'],'Нет отдельного поля глубины ухода цены от фактически достигнутой entry zone; общий drawdown от P0 не является этой метрикой.');
rule(680,682,'VERIFIED_CODE',outcome,['C','H18'],'execution_proven=false, user_profit=null; добровольные сделки пользователя не требуются.');
rule(686,692,'VERIFIED_CODE',[...summary,...cal,'analytics/anchors.mjs::selectOutcomeAnchor'],['K3','H2','Dfuture','L7'],'Cohort/purpose/delivery/mode/map/version раздельны; прошлые original не переписываются. Actual native production cohort пока0.');
rule(696,706,'VERIFIED_CODE',[...card,...cal],['L1','L7','L8'],'Публичного численного процента и causal map benefit нет; вероятность не переносится между режимами.');
rule(708,750,'DEFERRED_BY_TZ',[...cal,...summary],['F','L7','L8'],'После рабочего запуска/достаточных production волн: fit+reliability bins+CI/calibration error/holdout+source utility. Сейчас только input/split/floor audit, не обученная модель.');
rule(716,725,'PARTIAL',[...cal,...summary],['F','L7'],'300/20/14/100 — лишь предложенные floors; нет CI/error acceptance, native training/holdout или валидированной модели. Процент заблокирован.');
rule(739,741,'VERIFIED_CODE',cal,['F','L7'],'Нет механизма самовольного изменения стратегии после пары удач; live shadow/version rollback acceptance ещё не выполнена.');
rule(781,807,'VERIFIED_CODE',[...card,...zone],['L1','L2','L3','L5','L6'],'Тесты подтверждают текст/границы; current-policy native same-text delivery ещё не подтверждена.','OWNER_MODE_FUTURE_LABELS');
rule(811,817,'PARTIAL',card,['L1','L3','L5'],'Состояния различаются и размер4096 проверен, но renderer добавляет все помещающиеся optional-context предложения, а не строго два наиболее важных; UX-краткость не доказана.');
rule(819,827,'VERIFIED_CODE',[...card,...context],['Dunknown','L1'],'Нет внешнего обязательного LLM и бездоказательных intentions/guarantees.');
rule(831,876,'PARTIAL',['runtime/delivery.mjs','runtime/outcome-journal.mjs'],['E9','K3'],'ROOT delivery/checksum/readback/duplicate rules требуют current-policy native acceptance. Исторический240 — ACCEPTANCE_TEST, не production.');
rule(894,908,'VERIFIED_CODE',['analytics/index.mjs::analyzePump',...plan,...zone],['E','L1','L4'],'Нет старых70/ровно2/short/обязательнойкарты/всехHTX в собственном kernel; полный внешний runtime flow требует ROOT проверки.');
rule(944,960,'PARTIAL',['runtime/runner.mjs',...plan],['E','K1','L1'],'Ранний реальный240 является только acceptance и теперь owner-excluded BTC. Нужна новая разрешённая монета→L plan→same saved text→receipt→outcome.');
rule(966,970,'PARTIAL',['runtime/runner.mjs',...move,...card],['E','L1'],'Full crypto universe/cadence/budget/native auto не подтверждены; production off.');
rule(974,980,'DEFERRED_BY_TZ',cal,['F','L7'],'После рабочего запуска: накопление, probability/source utility, shadow improvements/седьмой блок.');
rule(982,991,'VERIFIED_CODE',[...card,...cal],['L1','L7'],'Нет публикации необоснованного процента; M не переисполняет старые батареи.');

const acceptance={
999:['VERIFIED_CODE',[...growth,...plan],['L1'],'Ранний AUTO +12/15 проверен без обязательного24ч.'],
1000:['VERIFIED_CODE',move,['Jold'],'Инертный дневной50 не даёт active wave; старый код контроль I подтверждён в J.'],
1001:['VERIFIED_CODE',move,['L3'],'Квалифицированная retained wave сохраняет ID/expiry/прежний порог.'],
1002:['VERIFIED_CODE',growth,['A'],'Верхнего ceiling нет; это не гарантия полной native вселенной.'],
1003:['VERIFIED_CODE',card,['A','L3'],'Calm/sharp/reclaimed различены; подробная price-impact семантика ограничена.'],
1004:['VERIFIED_CODE',context,['L1'],'Без OI готовность возможна.'],
1005:['VERIFIED_CODE',context,['Dunknown'],'Без aggressor-side нет absorption claim.'],
1006:['PARTIAL',[...zone,...plan],['L1'],'Consumer READY/no-map проверен; текущая production отправка не принята.'],
1007:['VERIFIED_CODE',plan,['L4','I15'],'Отказ по плану, а не по отсутствию карты; min10 owner amendment дополнительно.'],
1008:['VERIFIED_CODE',zone,['A'],'Показ доступной стороны/PARTIAL; native пригодных зон нет.'],
1009:['PARTIAL',['sources/liquidations.mjs','runtime/runner.mjs'],['E'],'Нужна актуальная native deadline/budget/no-map delivery квитанция ROOT/SOURCE.'],
1010:['VERIFIED_CODE',cal,['F','L7'],'Нет модели/публичного процента ни для map, ни для no-map; перенос заблокирован.'],
1011:['PARTIAL',['runtime/delivery.mjs'],['E'],'Дедуп code есть; текущий policy late-map-only no-send не подтверждён native.'],
1012:['VERIFIED_CODE',zone,['A'],'slice <=3 не дополняет отсутствующие зоны.'],
1013:['VERIFIED_CODE',zone,['A','L5'],'Lineage/max-component вместо двойной суммы.'],
1014:['VERIFIED_CODE',[...zone,...card],['G','L5'],'Venue/model/исходные часы видимы, native сопоставимость — SOURCE.'],
1015:['VERIFIED_CODE',liq,['A'],'Размер остаётся внутренним ограничением; публичную численную строку отменил owner.'],
1016:['PARTIAL',['runtime/runner.mjs'],['E'],'E code проверял изоляцию; нужен новый current-policy native multi-coin flow.'],
1017:['PARTIAL',['runtime/runner.mjs','runtime/delivery.mjs'],['E'],'Офлайн executor/dedup принят; native совместный AUTO/MANUAL не предъявлен.'],
1018:['PARTIAL',['runtime/budget.mjs','sources/index.mjs'],['E'],'Имеются отказы/ограниченный fallback; весь текущий маршрут каждой обязательной величины SOURCE не доказан.'],
1019:['PARTIAL',['runtime/budget.mjs'],['E'],'Сохранение резервов code; измеренный суточный all-universe+6manual план пока не доказан.'],
1020:['VERIFIED_CODE',['runtime/runner.mjs'],['E'],'E01 проверил три кандидата, фиксированного ceiling2 нет.'],
1021:['VERIFIED_CODE',[...move,...plan],['Jold','L4'],'Нет искусственного READY при неактивности/плохом плане.'],
1022:['PARTIAL',['runtime/runner.mjs'],['E'],'Discovery incomplete enum проверен code, полный current crypto universe остаётся unknown.'],
1023:['PARTIAL',['contracts/index.mjs::automaticWindowOpen','runtime/delivery.mjs'],['E5'],'ROOT owner-publication affected18 code принят; native 20:00 fence нет, production off.'],
1024:['PARTIAL',['runtime/delivery.mjs'],['E5'],'Code stale/revalidation есть; native morning continuation не принят.'],
1025:['VERIFIED_CODE',['analytics/anchors.mjs::selectOutcomeAnchor','runtime/outcome-journal.mjs'],['E9'],'UNKNOWN возможной отправки сохраняет original, не ложный SENT.'],
1026:['VERIFIED_CODE',outcome,['H18','H22'],'HIT/path/drawdown раздельны; gaps/intrabar сохраняют UNKNOWN adverse.'],
1027:['VERIFIED_CODE',outcome,['K2','H22'],'Нет подмены неполного периода MISS/HIT.'],
1028:['VERIFIED_CODE',summary,['K3','H2'],'Replay одной original волны не увеличивает независимый denominator.'],
1032:['BLOCKED',['runtime/runner.mjs','runtime/delivery.mjs',...outcome],['E','K1','L1'],'Требуется новое разрешённое native same-text SENT+receipt+outcome после L. 240 acceptance, BTC/ETH исключены, production off; fixtures не финальная приёмка.'],
1034:['VERIFIED_CODE',cal,['L7','L8'],'Реальные данные/подлинность/production не объявлены на основании fixtures.']};
for(const [line,a]of Object.entries(acceptance))rule(+line,+line,...a);
rule(1038,1042,'PARTIAL',['AGENTS.md','pump-report/AGENTS.md'].map(x=>x==='AGENTS.md'?'../AGENTS.md':x.replace('pump-report/','')),['L1'],'Старый проект/9пауз/2ownerdeferrals сохраняются; чужих runtime/storage/live мутаций M не выполняет.');
rule(1046,1052,'VERIFIED_CODE',[...cal,...card,...outcome],['L7','K2'],'Нет обещаний universal map, раннего любого пампа, profit, intentions,95–97 или exactly-once при lost ACK.');
rule(1054,1054,'BLOCKED',['runtime/runner.mjs'],['E','L1'],'Регулярный рабочий production поиск/охват/доставка текущей версии пока не доказаны; число подключений/проверок не равно результату.');

const selected=root.rows.filter(r=>['TEXT','LIST_ITEM','TABLE_ROW'].includes(r.kind)&&(
  r.lead==='ANALYTICS'||r.section===23||r.section===10||r.section===5||[45,108,110,112,355,511,552,554,582,589,591,603,607,608,609,610,612,614,626,627,628,629,630,632,762,764,769,771,773,831,850,854,858,860,861,862,863,864,866,870,871,872,873,874,876,958,960,970,982,1032,1034,1042,1054].includes(r.line)
)).filter(r=>!/^\|\s*(Вопрос|№|Настройка|Объём|Область|Проверка|Данные|Источник|Часть|Роль)\s*\|/.test(r.text)&&!r.text.endsWith(':'));
const rows=[];
for(const r of selected){let matched=null;for(const q of rules)if(r.line>=q.from&&r.line<=q.to)matched=q;
  const refs=matched?.refs??[],proofs=matched?.proofs??[],status=matched?.status??'PARTIAL';
  rows.push({...r,status,checked_code:status==='VERIFIED_CODE',native_verified:false,scope:r.lead==='ANALYTICS'?'ANALYTICS_PRIMARY':'ANALYTICS_CONSUMER_OR_SHARED_ACCEPTANCE',code_refs:await Promise.all(refs.map(code)),accepted_proof_refs:proofs.map(p=>P[p]),
    remaining:matched?.remaining??'Нет отдельного принятого доказательства этого атома в аналитической передаче. Требуется точное сведение ROOT/SOURCES; это не PASS.',owner_override:matched?.override??null,code_does_not_mean_native:true});
}
const diagnostic=JSON.parse(await readFile(base+'/manual-first-diagnostic.json'));
const gaps=[
{id:'M-G01',status:'UNIMPLEMENTED',severity:'HIGH',source_lines:[181,216,627,1001],code_refs:await Promise.all(move.map(code)),proof_ref:{path:base+'/manual-first-diagnostic.json',sha256:hash(await readFile(base+'/manual-first-diagnostic.json'))},finding:'manual-first [] qualification remains empty when a later AUTO window passes; current_threshold=true but automatic_eligible=false',next:'ROOT approval required before minimal latch fix; preserve nonempty qualification/created/expiry/cancel and old origins.'},
{id:'M-G02',status:'PARTIAL',severity:'MEDIUM',source_lines:[72,248,250,251,252],code_refs:await Promise.all(context.map(code)),finding:'Only directional sample sums are implemented; trade impact/reaction/absorption is not measured',next:'Do not claim absorption; ROOT/SOURCE qualify useful route and specific price-impact scope.'},
{id:'M-G03',status:'PARTIAL',severity:'MEDIUM',source_lines:[75,65],code_refs:await Promise.all(context.map(code)),finding:'Relative-return consumer exists, but live market-context producer/coverage unproven',next:'SOURCE/ROOT producer and resource-qualified exact-window evidence.'},
{id:'M-G04',status:'UNIMPLEMENTED',severity:'MEDIUM',source_lines:[678],code_refs:await Promise.all(outcome.map(code)),finding:'Entry scenario has touches/order ambiguity but no drawdown relative to the touched entry area',next:'Separate small implementation/acceptance after ROOT scope decision; not old ENTRY followup resumption.'},
{id:'M-G05',status:'PARTIAL',severity:'LOW',source_lines:[273],code_refs:await Promise.all(move.map(code)),finding:'Profile lists3m/5m activity; movement consumes only impulse_window_ms5m',next:'ROOT decides whether proposed3m is required; no hidden extra detector.'},
{id:'M-G06',status:'PARTIAL',severity:'MEDIUM',source_lines:[232,233,237,783,813,815],code_refs:await Promise.all([...move,...card].map(code)),finding:'Acceleration/weakening are coarse OHLC-volume proxy; optional text appends all fitting contexts rather than choosing two strongest reasons',next:'Clarify truthful stage descriptions and concise selection in one bounded amendment.'},
{id:'M-G07',status:'PARTIAL',severity:'LOW',source_lines:[783,811,813],code_refs:await Promise.all(['analytics/presentation.mjs::growthProofLine'].map(code)),finding:'Frozen L prints a shortened internal fact_id in user text; retain full evidence inside analysis and remove internal identifier from user card',next:'ROOT requested one later affected L2 case; frozen L unchanged.'},
{id:'M-G08',status:'PARTIAL',severity:'HIGH',source_lines:[45,164,500,509,958,1032,1054],finding:'934 activeUSDT is not cryptoN; total eligible cryptoN unknown, unknowns excluded, BTCETH separately owner-excluded; no current-policy production chain',next:'SOURCE full taxonomy/coverage; ROOT bounded allowed-instrument same-text chain after admission.'},
{id:'M-G09',status:'DEFERRED_BY_TZ',severity:'EXPECTED',source_lines:[708,718,723,747,748,974,980],code_refs:await Promise.all(cal.map(code)),finding:'No learned/calibrated probability, CI/error validation, source causal utility or live shadow promotion',next:'After working launch, independent OBSERVED production sample; never label counts as model validation.'}
];
for(const row of rows)if([181,216,218,627,1001].includes(row.line)){row.status='PARTIAL';row.checked_code=false;row.remaining+=' Confirmed M-G01 manual-first [] qualification defect; standalone qualified AUTO and retained nonempty paths remain code-verified.';row.accepted_proof_refs.push({path:base+'/manual-first-diagnostic.json',sha256:hash(await readFile(base+'/manual-first-diagnostic.json')),case:'confirmed manual-first counterexample, no fix yet'});}
const counts=rows.reduce((o,r)=>(o[r.status]=(o[r.status]??0)+1,o),{});
const result={schema:'PUMP_M_ATOMIC_ANALYTICS_TRACEABILITY_V1',tz_source:tz,tz_sha256:tzsha,total_source_lines:1054,full_file_read_intervals:[[1,265],[266,530],[531,795],[796,1054]],root_id_source:{path:rootpath,sha256:hash(rootraw),indexed_nonempty_lines:root.rows.length},owner_amendments_ref:'checkpoints/pump-report-20261025/OWNER_PUBLICATION_AMENDMENTS.json',review_scope:'all TZ read; atomic analytics ownership + consumer interfaces + all section23 acceptance, ROOT/SOURCES-owned remainder stays in canonical registry',rows,counts,native_verified_rows:0,checked_means:'VERIFIED_CODE only, never native or production DONE',native_context:'Historical240 is real OBSERVED ACCEPTANCE_TEST, BTC now excluded; cannot serve as current L production first wave. Production0 per ROOT current guard. No new native IO by ANALYTICS.',unreviewed_global_source_lines:[],other_owner_units_not_adjudicated:root.rows.filter(r=>!rows.some(x=>x.id===r.id)).map(r=>({id:r.id,line:r.line,lead:r.lead,scope:'canonical ROOT registry; context/format or foreign execution ownership'})),gaps,manual_first_diagnostic:diagnostic,new_engine_fix_applied:false};
await writeFile(base+'/analytics-traceability.json',JSON.stringify(result,null,2)+'\n');
const escape=s=>String(s??'').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
const table=['# Полная сверка ТЗ v2 — аналитика','',`Прочитаны все1054 строки, SHA256 ${tzsha}. Использованы ID канонического ROOT реестра. Галочка означает только VERIFIED_CODE: accepted code/ARTIFICIAL case. Native/production готовность ею не утверждается.`,
'','Поздние owner amendments: BTC/ETH excluded; cryptoUSDTperp only, unknown исключён; min gross potential10; убрать размер/неизвестный абсолютный объём из user text; MODE/TEST/прошлый рост/будущее +10/4h; 240 ACCEPTANCE_TEST, production0.','',
'| Код | Статус | ID / строка ТЗ | Дословный пункт | Файл / метод | Принятое доказательство | Что осталось |','|---|---|---|---|---|---|---|',
...rows.map(r=>`| ${r.checked_code?'[x]':'[ ]'} | ${r.status} | ${r.id} / [${r.line}](<${tz}:${r.line}>) | ${escape(r.text)} | ${escape(r.code_refs.map(c=>c.path+'::'+c.method).join('; '))} | ${escape(r.accepted_proof_refs.map(p=>p.path+' #'+p.sha256.slice(0,12)+(p.case?' :: '+p.case:'')).join('; '))} | ${escape(r.remaining)} |`)];
await writeFile(base+'/ANALYTICS_CHECKLIST_RU.md',table.join('\n')+'\n');
await writeFile(base+'/cross-owner-gaps.json',JSON.stringify({schema:'PUMP_M_CROSS_OWNER_GAPS_V1',gaps,full_pipeline_production_done:false},null,2)+'\n');
console.log(JSON.stringify({tz_sha256:tzsha,source_lines:1054,canonical_rows:root.rows.length,analytical_and_interface_atoms:rows.length,counts,gaps:gaps.length,registry_sha256:hash(await readFile(base+'/analytics-traceability.json'))}));
