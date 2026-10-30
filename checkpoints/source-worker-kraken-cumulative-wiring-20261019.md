# Совместная интеграция504+505: N05 → N10/N12 через исходные данные в памяти

Предложение координатору, не исполняемый код и не приёмка подключения. Зависимости: PR504 `fabd86e81456452fd06d3010bc31e37ea8f2b995` и PR505 `2704063bb6bece2fec390d920c9ae5af7044613d`. Их frozen код/проверки здесь не изменялись и не повторялись.

**Вывод:** новые SQL/HTTP для Kraken N10/N12 не нужны, если передать полные уже полученные N05 raw inputs в памяти до возврата collector. **Одних нынешних `components` недостаточно**: component содержит числа, identity и `receipt_hashes`, но не OHLC/pages/instrument/mapped trade receipts. Читать заново D1 можно не делать; объявлять нынешний component достаточным доказательством240 свечей нельзя.

## Точные существующие места

- `worker.js:16535` получает `candidateEvidenceV2` из `REPORT2_EVIDENCE_V2_COLLECT`; source kwargs уже передаются целиком через route block к venue collector. До N10 вызова объект не проходит JSON roundtrip.
- `kraken-flow-collector.mjs:45–46` уже читает полный N05 cache payload с `include_cache_clock:true`; на HIT raw присутствует в `old`, но return оставляет только component. На fresh path `payload={version,observed_ts,instrument,candles,pages}` существует перед optional cache write. Сейчас полный payload теряется как доступный N10/N12 вход после возврата.
- `external-n05-flow-collector.mjs` агрегирует `result.components` через `flatMap`. Optional turnover `.map` заменяет лишь выбранный GATE/BINANCE SPOT component; Kraken object остаётся тем же. `finalizeCandidateBlockCoverage` читает source components для N05 context, а source result остаётся доступным в `candidateEvidenceV2.sources.EXTERNAL_N05_FLOW`.
- `worker.js:17223` уже использует точный исходный `spot?.data?._n10_spot_kline`. Это non-enumerable свойство создано на `worker.js:1547` с `{market:'SPOT',contract,payload,received_ts}`. Новый spot query не требуется.
- `worker.js:17230` вызывает общий `loadN10ReusedVenuePaths` с N05 flow result и `primaryTechnicalReceipt`. Уже есть точное HTX futures `15m` окно в `primaryTechnicalReceipt.receipts[0].actual_price_windows`.
- `evidence-source-store.mjs:70–73` добавляет metadata как **`cache_observed_ts` / `cache_expires_ts`**, а не `observed_ts` / `expires_ts`. В N05 payload свой `observed_ts` тоже есть. При памяти/HIT эти пары должны совпасть, несогласование означает отказ; нельзя подставлять `Date.now()` или только ожидаемый expiry вместо фактически прочитанной строки.

## Минимальная передача raw без нового SQL

Применить существующий подход non-enumerable raw capture, как для `_n10_spot_kline`, к **конкретному возвращаемому Kraken component**:

```js
// PROPOSAL ONLY; attach before optional cache write and before collector return.
Object.defineProperty(returnedKrakenComponent, '_n05_kraken_reuse', {
  enumerable: false, writable: false, configurable: false,
  value: {
    contract, run_id, source: 'N05_OFFICIAL_FLOW:KRAKEN',
    asset_key: `NATIVE_FLOW:${contract}:${end}`,
    component: returnedKrakenComponent,
    cache: {
      observed_ts: originalObserved,
      expires_ts: originalExpiry,
      payload: { version, observed_ts: originalObserved,
        instrument, candles, pages }
    },
    trade_receipts: mappedOriginalTradeReceipts,
    persistence_status: 'NOT_PROVEN_BY_IN_MEMORY_CAPTURE'
  }
});
```

`returnedKrakenComponent` — именно объект после добавления `receipt_hashes`, который положен в `components`, а не временный `component` до spread. Ссылка `component` в capsule образует частный цикл; non-enumerable parent property исключает её из JSON. Если интегратор предпочитает избежать цикла, хранить descriptor hash и передавать текущий component отдельно. Это локальная ссылка на уже существующий payload, не вторая копия900000байт и не новый provider snapshot. Не передавать capsule в persisted metadata/лог/compact run artifact; `JSON.stringify` должен её пропускать. Наличие private property само по себе ничего не допускает: normalizer всё равно повторно проверяет raw/identity/window/hash/clocks.

На cache HIT построить capsule из **того же уже прочитанного** `old`, сохранив `old.cache_observed_ts`, `old.cache_expires_ts` и payload `old.observed_ts`. Проверить их равенство/expiry; wrapper fields `cache_status/network_calls/cache_*` не включать в собственно raw payload digest. Старый cache без mapped trade receipts пригоден для N10 после проверки, но не даёт нового N12 факта.

На fresh path `originalObserved=component.observed_ts`; `originalExpiry=end+300000` — срок именно этого нового in-memory payload, который использует и cache-write request. Это не прочитанный native cache ACK. Capsule надо закрепить **до** optional write: его failure не должен стирать факт, который уже существует в памяти. В cache HIT expiry берётся из строки, а не восстанавливается по формуле.

## Один поток данных для двух потребителей

| Потребитель | Точный вход и вызов | Что остаётся недоказанным |
|---|---|---|
| N10 | capsule.component + capsule.cache → `prepareKrakenN10RuntimeInput({... , htx_spot_kline:spot?.data?._n10_spot_kline, now})`; общий N10 constructor дополнительно получает реальный HTX futures15m window | current native cache ACK; совпадение HTX окна, если его нет; actual consumer/native delivery |
| N12 | внутри того же `collectKrakenFlow`, без внешнего SELECT: `normalizeKrakenN12BoundedTradeSample({contract,component,cache,trade_receipts,now})` | старый cache без receipts; whole5m market flow; actual delivery |

Для N10 повторно сверяются240 native минут/цены/сделки/конкретный cache и15 последних закрытых свечей. Для N12 нужен mapped history carrier; общий смысл — только последние фактические закрытые5 минут, coverage0/score0/directionNULL. N054h component сохраняется независимо от успеха новых потребителей. Не складывать4h+5m окна и не делать три независимых голоса из N05/N10/N12: физический корень Kraken один.

В `loadN10ReusedVenuePaths` сначала сохранить существующий путь четырёх SQL cache groups БЕЗ замены их Kraken-группой. Полностью пригодную Kraken capsule обработать отдельным чистым memory branch и добавить neutral fact к прежним результатам. Это **не пятый SELECT**: старый `slice(0,4)`/native usage guards остаётся для прежних SQL groups. В group-building loop явно отделить `if(c.venue==='KRAKEN'){memoryCandidates.push(c);continue;}` ДО добавления SQL group; иначе расширение registry случайно займёт старый слот. Никакая старая группа/fact не вытесняется ради Kraken. При непригодной/отсутствующей capsule сохранить прежний результат; в первом zero-extra-SQL варианте нового Kraken SELECT fallback нет. Позднее отдельное разрешённое использование Kraken D1 cache могло бы занять существующий слот4, но это иной actual read plan и не часть данного предложения.

`worker.js` передаёт уже имеющийся spot raw и same-window HTX futures window. Результат memory-ветки добавляется в `primaryTechnicalReceipt.evidence`, старые primary/spot/venue facts не заменяются. `candidate-evidence-v2-runtime` получает из venue result N12 row через существующее `results.flatMap`; требуется расширить точный external-N12 provider allowlist на `KRAKEN_SPOT_TRADES`. В source accounting один HTTP не умножается по числу consumers.

Общий formatter/validator подключаются координатором, сохраняют прежние headings и формат factual15m/5m строк, все составные evidence IDs и neutral семантику. Сам факт добавляет длину отчёта, поэтому фактический размер payload/CPU/memory и пригодность Telegram всё ещё надо проверить. Существующий trade gate/HTX execution/ENTRY/weights не меняются.

## Exact missing fields и честный fallback

1. **Fresh mapped Trades receipt:** уже имеющийся `get` знает URL/status/received_ts/wire body SHA. При том же parse вычислить `payload_sha256=SHA256(JSON.stringify(parsedPage))` и сохранить `next_cursor=parsedPage.result.last`. Это0 новых HTTP/SQL. Собрать только соответствующие history receipts, не AssetPairs/OHLC. Старый массив component.receipt_hashes не содержит нужного соответствия URL/clock/page и его недостаточно.
2. **Durable new cache:** если дальнейший HIT должен поддержать N12, добавить mapped receipts в существующий N05 payload перед тем же optional INSERT; тот же900000byte cap, source/key/version/expiry. Это0 новых statements, но дополнительные байты не являются бесплатной native cost qualification. Непоместившийся payload не кешировать, текущий in-memory факт сохранить. Старый cache не переобогащать придуманными receipt полями и не выполнять запрос ради этого.
3. **HTX raw/window:** оригинальный `spot.data._n10_spot_kline` и `htxTechnicalWindow` уже доступны в worker. Они ещё не передаются в нынешний reuse loader как новый Kraken input. Их absence/stale/mismatch означает отсутствие общего N10 сравнения, а не замену HTX candles контролируемой моделью/котировкой Kraken. В504 cache-wrapper и HTX guard reply были CONTROLLED; эти тесты не доказывают actual shared caller.
4. **Partial carrier:**505 сознательно требует full N05 closure и SINCE-page receipts. Сохранённые DOT/ATOM RECENT_PUBLIC pages не проходят этот контракт: нужны отдельный typed carrier и explicit direction-reference-known clock, если координатор берёт следующий пакет. Не ослаблять существующую240-minute ветку и не выдавать поздний direction proof за знание раньше времени.
5. **Owner15:** глобально существующие N05 routes не отключать на основе расширительного прочтения N15/hourly договора. В504 new Kraken preparation сохранён ограниченный guard; ALGO/XMR имеют положительное историческое HTX spot presence и не относятся к15. Новая общей политики/admission этим предложением не создаётся; все сомнения по другим монетам остаются на центральном review.

## Порядок одного общего интеграционного пакета

Координатор объединяет504+505, producer private capture/fresh receipt fields, memory N10 constructor branch, N12 allowlist/accounting и общий formatter/validator. Только после полного кода — одна связанная проверка fresh N05 / old-cache без receipt / new-cache с receipt / optional write error / native-unknown stop / отсутствующий и не совпавший HTX window / manual и Telegram payload. Уже принятые50464+27/50522+19 не повторять целиком без затронутого изменения. Native natural same-run source→fact→consumer→manual/TG и admission отдельно остаются открыты; новые боевые запросы исполнитель источников не выполняет.

## Provenance и предел этой проверки

Fresh guard main `a4b41da462b43956dc40d6873b8e2769db96d7a6`; собственная fixed working base `7c3044a0f27599315148ea60045b6131c521469f`. AGENTS/status/resume/window/3proofs/phase/fence/generation прочитаны, fencefalse, offline exception сохраняется. Own bounded CAS `e1dbd9035e6b0c07989993c00b9471359a4bdb10`, owner1792394913025/expiry1792399713025. После REST GET TLS сбоев до любых записей точный main/ownref CAS и commit/blob readback выполнены стандартным Git transport; чужие leases не затрагивались.

Runtime source file SHA256 at fresh guard main:

```json
{
  "current-generation/files/src/worker.js": "75278614f0a95612c38e1ff2bd5e02d5fd6ebef2456ad09a21fa6e62fb5e399c",
  "current-generation/files/src/kraken-flow-collector.mjs": "2d174e0073d9fe0dff93b8b4f66da4c53bec4b5ef0b080c01594a80f0f62d68f",
  "current-generation/files/src/external-n05-flow-collector.mjs": "cbfcc3dda74e1c3102dc512d7f10539545db05c7d37c25d325a3ce53caa2bb9b",
  "current-generation/files/src/candidate-evidence-v2-runtime.mjs": "850edc9ac89a67b32bc721d93abaf01ab5c9b82067287c2c45b73359348631a0",
  "current-generation/files/src/evidence-source-store.mjs": "177bcae74fd75ecd78b1c8f3762e1579e058fb6b2c982ebd85bb1a543621ca38",
  "current-generation/files/src/htx-technical-structure.mjs": "6868f49ac8ce7d7201f3eb40964368350bee0e09848dd86e1ae630618f4c92cc"
}
```

Одна общая проверка готового предложения: 18 source-anchor/hash checks PASS, exact one-file scope PASS. Только чтение исходного кода; unit/controlled/native probes и504/505 suites не запускались. Production changes/sourceHTTP/SQL/deploy/MAIN/Telegram0. Это проверка конкретных точек передачи, не доказательство реализованной памяти/consumer или native стоимости.
