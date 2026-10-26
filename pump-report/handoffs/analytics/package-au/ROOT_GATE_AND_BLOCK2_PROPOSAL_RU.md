# AU — ready-only gate и точный functional proposal ROOT

Проверено исходное TZv2 SHA0674…: §3 строки71/72/73/74/76 дают пять действующих блоков1/2/3/4/6 после прямой отмены5 (unified OWNER01, строка13). Блоки1 и3 плюс самостоятельный план обязательны. Дополнительные2/4/6 — реальные части анализа, но не новые обязательные запреты. Блок7 — после запуска. Шесть исходных блоков не означают шесть сервисов (§3:87).

**Ready-only gate корректен как защита от траты на жёстко непригодную идею, но недостаточен как единственная точка выполнения дополнительного блока2.** Runtime runner:120 требует READY до getLiquidations/getOptional; analytics index:123 потребляет optional после движения/ликвидности/плана/minimum. Поэтому исполненные сделки вообще не могут стать дополнительными наблюдениями для уже отобранной монеты с мягким отказом по активности. Это configurable coverage gap, а не доказательство, что записанные отказы математически ошибочны.

ТЗ §6:166 запрещает отдельно собирать сделки/OI/карты на широком обзоре550. §6:179–212 сначала требует подтверждённый рост и проверку текущей волны. §7:246–259 требует рассматривать исполненные продажи и реакцию цены при наличии пригодных данных, без недоказанного поглощения. Из этого не следует перенос optional до отбора или снятие mandatory activity/liquidity/plan.

## Что исправлено локально и проверено

В analytics/index.mjs отказ уже вызывал measureLiquidity для manual_text, но результат терялся в analysis.liquidity. Минимальный local delta возвращает существующее поле с original orderbook fact_id/source_ts. Новая семантика/формула/порог не вводились. **Одна** affected actual qualification на новом KIMCHI AUTO input PASS: все поля, кроме намеренного сохранения liquidity, полностью равны original; причины/READY/plan/card/manual_text и часы неизменны. Новый retained snapshot — INSUFFICIENT. Старый immutable original не переписан, изменение не deployed.

Следствие для этого кандидата: даже при пригодном book факте возможности исполнения недостаточно. Допсделки не обязаны и не могут сделать его готовым. PLAN_INVALIDATED также означает отмену исходного сценария, а не отсутствие optional доказательства; moving optional не должен оживлять эту волну. Непригодная/неизвестная mandatory liquidity — stop для предлагаемой допзагрузки.

## Не применённый connected proposal

Файл ROOT_BLOCK2_SELECTED_SUPPLEMENT_PROPOSAL.diff содержит четыре точечных изменения, **не внедрённых** AU:
1. Runner сохраняет старую READY-ветку и добавляет ровно один bounded diagnostic путь: confirmed growth proof CURRENT/RETAINED, единственная причина CURRENT_ACTIVITY_NOT_CONFIRMED, retained liquidity.status=USABLE. Это уже selected/deep кандидат, не bulk550.
2. Source getOptional получает совместимый only_facts=['trades']; default прежний. Для diagnostic максимум1 существующий BingX GET, OI/funding/maps не запускаются. Upper2, deadline половины remaining mandatory life и все provider/whole/native caps прежние.
3. Existing optional consumer переносит сохранение qualified observations выше final readiness/plan refusal. Ни один optional факт не меняет mandatory reasons/READY, веса, пороги, P0 или правила волны.
4. Ручной отказ может показать уже существующий TRADE_PRICE_RESPONSE как ограниченное фактическое наблюдение этой выборки. READY narrative/две причины и исходный формат не расширяются; absorption/causality не объявляются.

Для текущего KIMCHI новая diagnostic ветка **не сработает** из-за INSUFFICIENT liquidity. Не проверялись остальные7 кандидатов повторным ядром. Не добавлять optional к старому input задним числом: полученные позже сделки не были известны в его analysis_ts.

Точный следующий native/action proposal — в ROOT_BLOCK2_ONE_SELECTED_EXISTING_ROUTE_PROPOSAL.json: лишь после появления нового подходящего кандидата и нового exact actual admission ROOT, max1GET /openApi/swap/v2/quote/trades(limit100), тот же выбранный native symbol, существующая quoteQty/isBuyerMaker/ID qualification, original source clocks, bounded actual≤1000 returned rows. Метод документации/сам patch не grants. Нужен новый connected affected check на корректно сохранённом contemporaneous input, если ROOT решит внедрять весь4-file пакет; AU не исполнял proposal/новую сеть.

Блок4 остаётся NOT_CHECKED из-за0 qualifications, блок6 —0 active routes/0actual maps. Optional не означает COMPLETE. Наличие consumer к неподтверждённому полю и прежний105 overlap не закрывают эти пробелы. Их настройка требует SOURCE field/clock/unit/identity proofs и фактического admitted response. Новые сервисы/платные/trial routes не добавлялись.

Резерв2HTTP/5min + один full candidate12/hour +3manuals не обещает8 полных кандидатов каждый5min. ROOT snapshot: auto remaining430, после future scans210 и8hourly full96 —124 запаса; это не разрешение потратить его и не полный расход аккаунта. Native/market/TG/Worker/CONTROL AU0, old SPENT/unknown2/floors/9пауз/2deferrals не возвращались. Расширенная статистика не условие запуска.
