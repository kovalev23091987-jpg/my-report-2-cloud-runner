# BY — один сценарий холодного старта, подготовлен, не выполнен

Для ROOT: пакет готов к точному допуску. Node/import/engine/test не запускались. Реальные source HTTP, SQL, Telegram, build/deploy — 0. Положительная цепочка холодного старта пока не доказана.

Authority: свежий main `f2ded8456f8f421007f5db66b314b4757ab20206`, все17 прочитаны по нему, all4 равны, окно/phase/fence/generation совместимы. Own `CODEX:OFFLINE_ANOMALIES:1793077898000`, CAS commit `a2f5eecdd7dd101711028c3e1fc0a1d72231d9bf`, FULL bytes+actual ref в 05:15:49 UTC; expiry 05:51:38 UTC / 08:51:38 МСК. Parent ROOT `CODEX:PUMP_LAUNCH_20261027:1793077704960`, expiry 06:28:24.960 UTC. Перед исполнением требуется заново проверить свежую authority и собственную действующую аренду.

## Точная граница сценария

Оригинальный input DOOD241 не меняется, SHA256 `14e18a8cd4c880de9916bcc55d2fa2e71b4d544f2ddbd8fb4f1f5310218a6d16`. Все значения, единицы, статусы и event/received/expiry каждого используемого факта остаются исходными. Analysis as-of остаётся исходным 26 октября 12:55:57.222 МСК: перенос часов назад с полным поздним input запрещён.

MemoryStore начинается пустым. Нет candidate queue, wave, active membership, overview/history и исходной previous_wave. В отличие от BS это настоящий холодный проект внутри искусственного offline сценария. Меняются только mode/run_id, отсутствие previous_wave и явно обозначенные внешние носители сценария. Настоящий runner самостоятельно выполняет первую discovery, source evidence, admission, engine и сохранение; при READY — optional, card, настоящий revalidate, MOCK transport и receipt/readback. Default worker, native environment и реальные транспорты не вызываются.

Минимальный недостающий исторический носитель: `reported_change_pct` из первичной discovery. Он NOT_RETAINED. Поэтому только первый discovery observation получает отдельное ARTIFICIAL значение20, достаточное для проверки входа в существующую очередь; оно не помещается в `facts.ticker_24h`, где исходный change_pct остаётся null. Это не восстановленная история provider и не доказательство, что холодный DOOD фактически попал бы в прошлую очередь. Готовность и AUTO-квалификация обязаны пройти на исходных фактах, независимо от этого носителя.

Искусственный бюджет400 записывается только в MemoryStore. Используются настоящие production admission/policies/reserves без их изменения; это прогнозная fixture, а не фактическая новая квота или разрешение вернуть старые расходы. Source24/24spent0left/no25, oldLOOKUP13/no14, manual3, unknowns/issued floors/reserves, 9пауз и 2OWNERdeferrals сохраняются.

Возможная отрицательная граница: сохранённый прежний импульс закончился примерно за79мин до анализа, тогда как действующий поиск новых импульсов ограничен60мин. Без previous_wave движок может не найти тот же импульс либо выбрать другой. Это статическое наблюдение, ещё не результат исполнения. Первый отказ и фактические причины сохранятся; READY/план не подставляются. Положительный результат требует entry zones ниже текущей исходной цены, USABLE liquidity и потенциала≥10%, без второй discovery/второй фазы роста. Ни прибыль, ни последующее исполнение плана этим не доказываются.

## Замороженные файлы

- Harness `pump-report/tests/analytics/package-by/by-cold-original-connected.mjs`: SHA256 `09f7ab5677e541571678fe2c0b3b69f61c1c7c4e40e9238d771d844e14cb1f64`, 17351B.
- Exact72 module manifest `pump-report/handoffs/analytics/package-by/BY_EXACT72_MODULE_MANIFEST_V1.json`: SHA256 `2865f439466017f7b192d756c6e01e1469c5ec55232bf00dba94c354b601d93b`, 20011B.
- Frozen input manifest `pump-report/handoffs/analytics/package-by/BY_FROZEN_INPUT_MANIFEST_V1.json`: SHA256 `57c487839b3e75797a43de1d3269fb7a7177ba77e5df7d9882a21d466a846bb0`, 2530B.
- Установленный72 artifact: SHA256 `6a1b27dad3a35324b73589593864cbcf1cd99bdca7239d993cd398177eeaeaf4`, pin `690fae17addd12ee60e111738b255dce267f6cf2af6827d506c4bd724d51f031`. Все72 модульных текста скопированы Python как точные UTF8 bytes в собственный ignored `.private/exact72`; build/import не было. Перед/после исполнения проверяется каждый SHA/размер.

## Один запуск после допуска

Рабочая папка — корень `report2-bingx-migration-20261024`. Единственная команда:

```sh
/Users/mac/.nvm/versions/node/v24.21.0/bin/node --import /private/tmp/pump-e-native-http-forbidden.mjs pump-report/tests/analytics/package-by/by-cold-original-connected.mjs pump-report/handoffs/analytics/package-by/BY_ROOT_ADMISSION.json
```

Нужен ROOT admission со статусом `ROOT_BY_ONE_COLD_CONNECTED_CASE_AUTHORIZED`, точными тремя SHA выше, текущими owner/main/expiry, run_id `BY_AUTO_COLD_ORIGINAL_DOOD241_COUNTERFACTUAL`, `empty_project_state_authorized=true`, `original_previous_wave_omitted=true`, `artificial_discovery_reported_change_pct=20`, `synthetic_budget_day_spent=400`. Границы: Node_invocations1/AUTO_execute1/MANUAL_execute0/real_engine_calls_upper_bound3/MOCK_send_upper_bound1/sourceHTTP0/nativeSQL0/actual_Telegram0/build0/deploy0. Свежий `BY_EXECUTION_AUTHORITY.json` создаётся только после допуска непосредственно перед командой. Сам admission не подделывается вспомогательным чатом.

Lock предотвращает случайный повтор; неудача или первый отказ остаются в результате, без автоматического rerun. Сырые входы, engine outputs, card, MemoryStore и MOCK request сохраняются только в ignored `.private`. Публичный результат содержит границы, причины, счётчики и хеши. BS/BV/BW/719 не повторяются; shared runtime/profile/registry/priority/thresholds не изменены.
