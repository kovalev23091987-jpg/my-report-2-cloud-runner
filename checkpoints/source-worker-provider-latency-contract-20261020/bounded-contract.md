# Короткая видимость конкурентного резерва

Это новый STATIC counterexample и узкое TEXT-предложение для координатора. Source не запускал Node, SQLite, компонент или старые проверки. Production-файлы не изменены. Полный контракт reservation → dispatch остаётся OPEN.

## Фактическая цепочка

`worker.js` → callback `REPORT2_EVIDENCE_V2_COLLECT` в current runner → `collectCandidateEvidenceV2`/очередь N15 → CG sector или CP sector → `createProviderReferenceReader.get` → существующий дневной ledger → существующий минутный ledger → transport. Отдельная цепочка `collectHtxBoundSupplementalContext` → `collectHtxAssetIdentity` → CP identity fallback использует тот же reader. Gate official binding вызывается отдельным callback runner и тоже использует reader.

* CG: `COINGECKO`, cap9, units1; keyless48/day, demo ordinary224/day, explicit fresh manual256/day, protected32; module monthly bounds1488/7936. Это локальные политики, не новый остаток аккаунта.
* CP identity: `COINPAPRIKA_IDENTITY`, cap2, units1, daily12, module monthly372. Раннее «cap1» не является production policy или разрешением уменьшить cap.
* CP sector: `minute_provider=null`, daily512, module monthly15872. Его запросы не покрываются cap2 identity. Два role keys не создают два бесплатных upstream/account quota. Общий provider-level monthly usage/внешние потребители не установлены этим разбором.
* Gate binding: `GATE`, cap4, units1, daily8. Тот же minute namespace читают/пишут Gate spot, Gate futures и turnover-history, использующие прежний `publicVenueMinuteCap('GATE')=12`. `GATE_PUBLIC_STATISTICS` — отдельный локальный namespace, не отдельная независимая биржа и не доказательство отдельной внешней квоты.

`callgraph.json` содержит точные файлы, SHA, прямые вызовы, SQL readers и edges. Перечислены все literal/import sites в tracked active tree, включая weighted callers, runner diagnosis, migration и старые tools. Это не доказательство отсутствия внешнего или уже запущенного старого writer. Root `runner/runner-main.mjs` отдельно помечен как legacy; текущий runner задаёт D1 timeout45s на ОДИН bridge request. Этот timeout не является общим deadline reader.

## Новый короткий контрпример, без старого 70s replay

Один provider, одинаковые UTCday/month, известная instrumentation, свободные whole/day envelopes. Seed содержит C−1 единиц с timestamp/dispatch T−10s. A начинает get в T, B — в T+1s. Оба preflight видят seed. A задержан только перед атомарным INSERT; B завершает свой INSERT и dispatch. Затем A выполняет INSERT в T+2s с прежним caller timestamp T.

У A действующий predicate `created_ts > T−60000 AND created_ts <= T` исключает уже committed B с timestamp T+1s. Поэтому A и B могут получить разрешение: CP C=2 даёт seed1+A+B=3; CG C=9 даёт seed8+A+B=10. Все задержки короткие; предполагаемый D45s не исправляет это пересечение. Это бумажная controlled interleaving, не утверждение о фактическом native overrun.

## Узкая правка: дополнительный запрет в том же atomic INSERT

Сохранить прежний SUM/predicate, все семь bind-параметров и добавить:

```sql
AND NOT EXISTS(
  SELECT 1 FROM report2_provider_minute_ledger_v1
  WHERE provider=?1 AND created_ts>?5
)
```

Схема/индексы/namespace/caps/units/clocks/statement count не меняются. Поздний A не вставляется, если committed B имеет более поздний timestamp. Если A committed первым, прежний SUM более позднего B уже учитывает A. Reader preflight остаётся advisory; его старый ответ не разрешает transport после отказа atomic INSERT для нового reservation_id.

Для одного и того же входного ledger-state новый INSERT predicate имеет вид `oldPredicate AND extraPredicate`. SQL TRUE нового predicate требует SQL TRUE старого; неизвестные/неправильные timestamps и units не могут расширить INSERT admission. Никаких новых вычислений SUM по future rows нет. Поэтому доказательство не требует объявить все legacy future units положительными safe integers. Простое удаление верхнего cutoff не обладает этим безусловным свойством: не-STRICT SQLite affinity и `CHECK(units>0)` сами по себе не являются аудитом типов всех исторических строк.

Это локальная монотонность admission на одинаковом предсостоянии, а не утверждение о тождественных будущих траекториях двух систем после разных отказов. Существующий exact readback остаётся прежним: ранее существующий identical reservation_id может вернуть `RESERVED_OR_IDENTICAL`, даже когда новый INSERT ничего не сделал. Duplicate/redispatch authority этим пакетом НЕ исправлена. Запрос с другим provider не затрагивается. Future row того же provider может консервативно блокировать новые резервы долго; expiry или удаление такой строки здесь не предлагаются. Уменьшение доступности и расход уже удержанных whole/day reservations допустимо только как прежний fail-closed путь, без refund и без source-failure/zero-cost вывода.

Три SQL statements внутри `reserveProviderMinuteUnits` остаются тремя; INSERT получает дополнительный EXISTS seek по существующему `(provider,created_ts)` index. Фактический D1 query plan/read cost UNKNOWN. Это не бесплатный seek, не native saving и не разрешение обойти whole-D1 admission. Unknown1 и старые unknown15/резервы сохраняются. Source не выполнял SQL или EXPLAIN.

## Полный latency/holding contract — только условное доказательство

Пусть W=60000, D — отдельно согласованный конечный максимум от actual get start r до transport invocation d, причём r≤d≤r+D в одной доказанной шкале времени. Тогда любой dispatch из `(t−W,t]` имеет reservation timestamp `r>t−W−D`. При общей атомарной cap-authority, уникальном одноразовом dispatch permit и видимости ВСЕХ таких committed reservations без старого upper cutoff удержание до `r+D+W` даёт консервативный rolling bound. Это вывод из условий, а не одобрение D45/W+D105 или готовая SQL-замена.

Условия сейчас не замкнуты:

1. Нет общего deadline во всех writer→transport цепочках и подтверждённого cutover/drain старых in-flight callers. GitHub run-report2 имеет concurrency/cancel-in-progress=false и timeout25min; это не per-dispatch barrier и не native остановка чужого старого процесса.
2. Нет глобальной квалификации clock authority/skew/rollback и provider billing timestamp. Проверка Date.now до fetch ограничивает лишь client invocation; source_ts/first_known/received_ts нельзя подменять admission clock.
3. CP sector не использует identity minute namespace; Gate и weighted callers имеют свои прежние budgets. Их нельзя переименовать или объединить ради доказательства.
4. Exact reservation readback не является одноразовым dispatch claim. Existing reservation/state не содержит deadline/dispatch-epoch; неизвестный старый in-flight не исчезает после изменения Git main.
5. Deadline/day/month drift надо проверять после задержанных await и непосредственно перед transport без нового разрешающего await. Late cache надо проверять по времени возврата, сохраняя исходные clocks. Отказы после уже выполненного SQL не возвращают reservations; optional cache failure не уничтожает пригодный факт.
6. Более широкая holding visibility меняет диапазон чтения; native cost/whole budget/reserve envelope требуют отдельной квалификации. Старое наблюдение CF mismatch не повторяется и не закрывается локальным SQLite.

Поэтому minimal proposal ниже закрывает только short out-of-order visibility при новом reservation_id и новых callers, исполняющих этот SQL. Он не закрывает 573, native rolling dispatch guarantee, month/day accounting at provider receipt, mixed-version cutover или native admission. Ни нового deadline helper, ни schema/reader/framework здесь нет.

## Центральная подготовка

Один новый UNEXECUTED callable проверяет actual baseline/candidate module + actual reference reader на LocalSQLite, а не переписывает admission в mock. Все данные/счётчики CONTROLLED. Он не регистрируется в suite и не вызывается при импорте. Центр сначала читает весь пакет, применяет только TEXT к своей копии, собирает два полных src roots, затем включает callable в ONE NEXT common. Старые 573/57236/57657/58123/37/915 и suites не повторяются. Только отдельная ошибка нового компонента может обосновать его repair.
