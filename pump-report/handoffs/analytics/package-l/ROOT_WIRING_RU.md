# L — последние прямые поправки владельца

Готовая карточка явно сообщает MANUAL («Ручная проверка») или AUTO («Автоматический отчёт»). `input.run_purpose` переносится в `analysis.run_purpose`; `ACCEPTANCE_TEST` всегда добавляет «ТЕСТ — приёмочная проверка». Неизвестное назначение так и подписано. Уведомление отдельно показывает подтверждённый прошлый рост и будущее событие +10% за 4 часа; вероятность остаётся неизвестной.

`analysis.growth_proof` содержит `status: CURRENT | RETAINED | UNCONFIRMED`, точное окно с исходными ценами/часами, порог, полные `fact_ids`, `evidence_ref`, источник и исходные часы факта. Новые qualification получают происхождение факта при создании. Прежняя сохранённая qualification не переписывается: retained-карточка показывает прежний порог/часы/факт и явно говорит, что сейчас пересечение не подтверждено. Даже при сжатии до 4096 сохраняются MODE/TEST, основание роста, будущее событие, весь план, инвалидация, до шести зон карты с происхождением/часами и отсутствие/неполнота карты. Полные доказательства остаются в анализе.

Из пользовательского текста удалены «Размер: до … USDT … будущая цена исполнения не гарантирована» и строка о неизвестной абсолютной единице объёма. Размер/исполнение/спред/глубина, native relative activity и неизвестные абсолютные единицы остаются внутренними полями. Неизвестное не превращено в ноль или USDT. Отсутствие карты по-прежнему явно указано.

## Единый с ROOT допуск

Новая `RULES_VERSION = pump-analytics-v3-owner-eligibility-20261025` отделяет новые readiness-правила от прежних v1/v2. Используются опубликованные ROOT `OWNER_MIN_PLAN_POTENTIAL_PCT=10` и `ownerPublicationRefusal`.

`analysis.notification_eligibility`:

```json
{
  "eligible": true,
  "reason": null,
  "required_potential_pct": 10,
  "minimum_potential_pct": 14.67,
  "comparison": {
    "entry_upper": 102.52,
    "exit_lower": 117.57,
    "basis": "GROSS_ENTRY_TO_EXIT_NOT_EXECUTED_PROFIT",
    "execution_proven": false
  }
}
```

Числа выше — укороченный искусственный пример формата. Сам допуск использует конечный `plan.potential_pct.minimum >= 10` с указанным gross-basis, точно как общий ROOT gate. PARTLY с minimum <10 отклоняется, даже если maximum ≥10. Причина `PLAN_POTENTIAL_BELOW_OWNER_MINIMUM`; непригодное значение — `PLAN_POTENTIAL_UNQUALIFIED`. Общий gate также возвращает `OWNER_ASSET_DELIVERY_EXCLUDED` для BTC/ETH. В этих случаях `ready=false`, `card_text=null`; есть обычный ручной отказ. Выход/входы не дотягиваются искусственно. До наличия плана eligibility=false/ANALYSIS_NOT_READY.

Автоматические +20%/24ч или +10%/5/15/60м, срок/ID/исходная qualification волны и статистическое +10% от P0 за 4ч не изменялись. Численный gross-потенциал плана не является вероятностью, выполненным заработком или гарантией исполнения.

## Назначение и калибровка

`auditCohortSample` и `auditPairedAnalyses` используют общий ROOT `productionRecord`, то есть явный PRODUCTION и OBSERVED. ACCEPTANCE_TEST, UNCLASSIFIED и не-OBSERVED production не попадают в пригодные калибровочные входы. Несовместимое обновление известной не-production волны не может сделать её production через фильтрацию ранней записи. Отчёт аудита содержит `purpose_eligible_records`, `excluded_by_purpose`, `purpose_exclusions`. Pair получает `PAIR_NOT_OBSERVED_PRODUCTION`.

Исходные origin не редактируются. Static bound sidecar ROOT для 240 имеет приоритет над поздней меткой PRODUCTION. Чистый `summarizeOutcomes` и старое ядро materialization не менялись: это по-прежнему аудит любых переданных исторических данных; production-view и новый derived namespace принадлежат ROOT. Приёмочный 240 не объявляется первой production-волной. Само заявленное OBSERVED во входе не аутентифицирует native происхождение: результаты аудита по-прежнему external_provenance_authenticated=false, publication_allowed=false, probability=null.

## Проверка и границы

Восемь новых целевых L случаев проходят, плюс две выбранные прежние проверки карточки C. Первый запуск: 7 PASS/1 FAIL из-за неверной нормализации `map_mode` в искусственном calibration fixture (NO_MAP вместо outcome WITHOUT_MAP); исправлен только fixture и повторён только L07 — PASS. Сохранены оба результата; это 8 разных L случаев, а не 9. Максимальные искусственные карточки: 3543/3483 UTF-16, well-formed Unicode, три входа, шесть зон и все обязательные подписи.

Старые E/F/H/I/J/K батареи не повторялись. Production/runtime/source/common меняет ROOT; ANALYTICS изменил пять своих модулей, добавил один свой тест и эту передачу. Native HTTP/SQL/TG/deploy/cron=0. J/K manifest неизменны; прежние изменяемые модули сохранены в локальном `baseline/**`. Не публиковать baseline-копии кода как отдельные production-файлы. Секреты и private240 market values не читались/не копировались. Полный пересмотр ТЗ по новой команде владельца следует отдельной квитанцией после этого frozen L.
