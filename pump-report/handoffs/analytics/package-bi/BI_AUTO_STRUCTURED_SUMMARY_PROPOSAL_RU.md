# BI — краткий внутренний AUTO summary для ROOT

**Только предложение. Worker не изменён; Node/imports/tests/native IO — 0.** Узкий gap: scheduled handler ждёт runner.execute и finalizeNativeRun, но успешный result не сохраняет в переменную и не пишет summary. Обработчик ошибок пишет PUMP_RUN_STATUS. Поэтому успешный CF outcome с logs=[] не объясняет, был ли анализ, бюджетное откладывание или delivery result.

ROOT сообщил о normal cron **26.10.2026 16:25 МСК**: outcome=ok, wall8097ms, cpu575, scriptversion3e08bf26-99f6-4cd5-a656-3892f1faa660, logs=[], exceptions=[]. BI не делал новый CF read. Эти метаданные доказывают сообщённое успешное завершение invocation, но не наличие кандидата, анализ, новое сообщение или SENT.

## Одна запись и существующие поля

Предлагается одна запись PUMP_AUTO_SUMMARY после возврата execute и успешной существующей finalizeNativeRun. Никаких новых SQL/readback/provider calls, storage или опросов. Ранние disabled/stage/window guards и существующий catch сохраняются. Ошибка финализации остаётся в существующем PUMP_RUN_STATUS; success-summary при ней не объявляется.

| Поле summary | Точный источник и смысл |
|---|---|
| run_id / implementation_pin | UUID из вызова scheduled/execute; pin из IMPLEMENTATION_PIN.sha256 текущего Worker. Не подставлять новый pin старому run |
| status / discovery_result | Только известные enum из result. COMPLETE означает завершение run, не готовность идеи |
| checked_entries | result.checked.length; часть записей может не иметь analysis |
| analysis_results / ready_results / ready_auto_eligible_results | Только analysis среди checked; ready=true отдельно от ready && automatic_eligible |
| manual_results | result.manual.length отдельно: AUTO также обрабатывает уже стоящую manual queue |
| budget_deferred_entries | result.deferred.length, отдельная ветка DEFERRED до checked.push |
| source_pending / catalog_unresolved | source_evidence_coverage.temporarily_deferred и известный errors[].unqualified |
| phase_flags / reason_codes | Факты наличия результатов, не выдуманная полная хронология; только закрытый allowlist кодов |
| delivery occurrences и refs | checked[].delivery, manual[].result.delivery и result.delivery (drain), каждый с origin |
| state / card_id / message_id / receipt_readback_reported | Только опубликованные delivery-result поля; ID проходят строгую форму; отсутствие — null |

У нормального result массивы checked/manual/delivery присутствуют, deferred может отсутствовать и тогда означает0. EXECUTOR_BUSY возвращается раньше: массивов нет, соответствующие counts=null, не ложные нули. result.resources.mode не использовать как режим запуска: он может стать STATISTICS после checkOutcomes. Поле mode здесь — AUTO, заданное вызывающим scheduled.

Если COMPLETE вернулся с checked0/deferred0/errors=[], точная причина selectAutomatic=null сейчас в result не передаётся. Summary честно покажет отсутствие результата глубокой проверки; объяснять его отсутствием роста или пригодных монет нельзя. BI не добавляет ради этого чтение очереди, raw facts или новый selection-протокол.

Delivery occurrences не являются уникальными карточками или HTTP send attempts: inline и drain могут повторять одну карточку; drain может относиться к прежней/ручной очереди. Даже state=SENT может быть skip уже терминальной карточки без нового send. Ничего не суммировать как «новые AUTO SENT»; origin сохранять, counts подписывать occurrences. MESSAGE_ID и receipt_readback_reported — указатели для расследования, не самостоятельная приёмка.

## Один фрагмент для ROOT (НЕ применён, НЕ исполнялся)

Ниже чистая проекция in-memory результата и её место в существующем happy path. Helpers разместить в принадлежащем ROOT worker; текущие guards/catch/waitUntil/finalization не переписывать. Allowlist намеренно ограничен: неизвестный код превращается в OTHER_CODE, исходное значение не логируется. ROOT может дополнить его конкретным известным enum при необходимости.

```js
function autoRunSummary(r, pin) {
  const arr = v => Array.isArray(v) ? v : null;
  const nat = v => Number.isSafeInteger(v) && v >= 0 ? v : null;
  const member = (v, set, fallback) => set.has(v) ? v : fallback;
  const runStates = new Set(['COMPLETE', 'INCOMPLETE', 'EXECUTOR_BUSY']);
  const discoveryStates = new Set(['INCOMPLETE_COVERAGE_OR_RESOURCES', 'READY_IDEAS_FOUND', 'NO_READY_IDEAS_IN_CHECKED_SCOPE']);
  const deliveryStates = new Set(['SENT', 'UNKNOWN', 'ERROR', 'STALE', 'SUPPRESSED', 'RETRYABLE', 'SENDING', 'READY', 'BACKOFF', 'CARD_NOT_FOUND']);
  const codes = new Set([
    'SOURCE_EVIDENCE_PENDING', 'UNIVERSE_QUALIFICATION_INCOMPLETE', 'SOURCE_BUDGET_DEFERRED',
    'PROTECTED_DAY_RESERVE', 'EVEN_DAY_CANDIDATE_ALLOCATION', 'NATIVE_CORE_UNIT_EVIDENCE_REQUIRED',
    'RUN_RESOURCES_DEFERRED', 'EXECUTOR_LEASE_EXPIRED', 'WORK_INDEX_MIGRATING',
    'MANDATORY_PRICE_NOT_USABLE', 'MANDATORY_CANDLES_NOT_USABLE', 'MANDATORY_ORDERBOOK_NOT_USABLE',
    'CURRENT_ACTIVITY_NOT_CONFIRMED', 'NO_SUPPORTED_POSITION_SIZE',
    'INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED', 'PLAN_POTENTIAL_BELOW_OWNER_MINIMUM',
    'PLAN_POTENTIAL_UNQUALIFIED', 'PLAN_INVALIDATED', 'WAVE_LIFETIME_EXPIRED',
    'MANDATORY_FACT_EXPIRED_BEFORE_PUBLICATION', 'OWNER_ASSET_DELIVERY_EXCLUDED',
    'NO_SUBSTANTIAL_PLAN_CHANGE', 'RECHECK_FAILED_BEFORE_SEND', 'SCENARIO_RECHECK_FAILED',
    'PUBLICATION_WINDOW_CLOSED', 'TELEGRAM_RATE_LIMIT', 'TELEGRAM_REJECTED', 'TELEGRAM_ACK_UNKNOWN'
  ]);
  const checked = arr(r?.checked), manual = arr(r?.manual), drain = arr(r?.delivery);
  const normal = checked !== null && manual !== null && drain !== null;
  const deferred = arr(r?.deferred) ?? (normal ? [] : null);
  const errors = arr(r?.errors) ?? [];
  const analyses = checked?.filter(x => x?.analysis && typeof x.analysis === 'object').map(x => x.analysis);
  const deliveries = [
    ...(checked ?? []).filter(x => x?.delivery).map(x => ({origin:'CHECKED_INLINE', value:x.delivery})),
    ...(manual ?? []).filter(x => x?.result?.delivery).map(x => ({origin:'MANUAL_INLINE', value:x.result.delivery})),
    ...(drain ?? []).map(value => ({origin:'QUEUE_DRAIN', value}))
  ];
  const rawCodes = [
    ...errors.map(x => typeof x === 'string' ? x : x?.reason),
    ...(deferred ?? []).flatMap(x => [x?.source_coverage?.reason, x?.source_coverage?.detail]),
    ...(checked ?? []).filter(x => !x?.analysis).map(x => x?.source_coverage?.reason),
    ...(analyses ?? []).flatMap(x => arr(x?.reasons) ?? []),
    ...deliveries.map(x => x.value?.reason)
  ].filter(x => typeof x === 'string');
  const reasonCodes = [...new Set(rawCodes.map(x => codes.has(x) ? x : 'OTHER_CODE'))];
  const stateCounts = {};
  for (const x of deliveries) {
    const state = member(x.value?.state, deliveryStates, 'OTHER_STATE');
    stateCounts[state] = (stateCounts[state] ?? 0) + 1;
  }
  return {
    schema:'PUMP_AUTO_SUMMARY_V1', mode:'AUTO',
    run_id:typeof r?.run_id === 'string' && /^[a-f0-9-]{36}$/i.test(r.run_id) ? r.run_id : null,
    implementation_pin:typeof pin === 'string' && /^[a-f0-9]{64}$/.test(pin) ? pin : null,
    status:member(r?.status, runStates, 'OTHER_STATUS'),
    discovery_result:member(r?.discovery_result, discoveryStates, null),
    counts:{
      checked_entries:checked?.length ?? null, analysis_results:analyses?.length ?? null,
      ready_results:analyses?.filter(x => x.ready === true).length ?? null,
      ready_auto_eligible_results:analyses?.filter(x => x.ready === true && x.automatic_eligible === true).length ?? null,
      manual_results:manual?.length ?? null, budget_deferred_entries:deferred?.length ?? null,
      source_pending:nat(r?.source_evidence_coverage?.temporarily_deferred),
      catalog_unresolved:nat(errors.find(x => x?.reason === 'UNIVERSE_QUALIFICATION_INCOMPLETE')?.unqualified)
    },
    phase_flags:{
      executor_busy:r?.status === 'EXECUTOR_BUSY',
      analysis_result_seen:analyses === null || analyses === undefined ? null : analyses.length > 0,
      budget_defer_seen:deferred === null ? null : deferred.length > 0,
      delivery_result_seen:normal ? deliveries.length > 0 : null
    },
    reason_codes:reasonCodes.slice(0,12), reason_codes_truncated:reasonCodes.length > 12,
    unlisted_reason_occurrences:rawCodes.filter(x => !codes.has(x)).length,
    delivery:{
      complete_result_envelope:normal,
      reported_occurrences:normal ? deliveries.length : null,
      occurrences_by_state:normal ? stateCounts : null,
      refs:deliveries.slice(0,8).map(({origin, value:d}) => ({
        origin, state:member(d?.state, deliveryStates, 'OTHER_STATE'),
        card_id:typeof d?.card_id === 'string' && /^PUMP:[a-f0-9]{64}$/.test(d.card_id) ? d.card_id : null,
        message_id:/^[1-9][0-9]{0,19}$/.test(String(d?.message_id ?? '')) ? String(d.message_id) : null,
        receipt_readback_reported:typeof d?.receipt_readback === 'boolean' ? d.receipt_readback : null
      })),
      refs_truncated:deliveries.length > 8
    }
  };
}

// Existing scheduled success path; no extra calls:
const result = await runtime.runner.execute({mode:'AUTO', run_id, publish:true});
finalizationStarted = true;
await finalizeNativeRun(runtime.native);
try { console.log('PUMP_AUTO_SUMMARY', JSON.stringify(autoRunSummary(result, IMPLEMENTATION_PIN.sha256))); } catch {}
```

Ограничение8 refs/12 reason codes и закрытые enum ограничивают размер записи. Полные state counts считаются по уже имеющимся in-memory occurrences; refs_truncated/reason_codes_truncated видны. Не выводить весь result, spread analysis/card/receipt/resources/error, error.message/stack, instrument/recipient, text/card_text, планы, quotes, rawresponses, параметры или env/token. Формат message_id не разрешает раскрывать chat ID: берётся только delivery result.message_id.

## Пример и предел доказательства

EXAMPLE_FROM_SAVED_RUN.json — ручная проекция уже принятого BH result7de14263…, **не emitted log и не выполненный mapper**. Его BA pin сохранён. Summary покажет checked0/analysis0/ready0, budget deferred1, source pending9, unresolved24, delivery occurrences0 и конкретные reason codes. BH не перепроверялся; использована его замороженная derivative evidence.

Схема показывает, почему этап не дал карточку, без повторного SQL polling. Она не доказывает всю текущую очередь, стоимость provider/account day, same-original SENT или исход. Полная приёмка всё ещё требует исходного анализа/сохранённого текста/точной квитанции того же card/message/readback и отдельного outcome. Поля sent_proved, first_genuine_SENT, success probability или trade outcome не добавляются.

Точные прочитанные inputs: worker c56f14d2ab7d42e2ed69c031268f3350bee8ccb319a6e67d3b33830d40e9d7ec; runner08de29670f7cafec7efbbe76caba66138129fb2ace667730ea7a0a096a8de31e; delivery8ccfd9d89d3a435a5621dca5f878306304173a1ae965a1acaae72dc69efd5469; BH evidence dd710a27dec8510d589da5fc38160c9088b0ebcd17c46f89ba2472fe9d5f9c13. Импорты/Node/проверки mapper/новый nativeIO/изменение worker —0. Следующая реализация и actual admission принадлежат ROOT.
