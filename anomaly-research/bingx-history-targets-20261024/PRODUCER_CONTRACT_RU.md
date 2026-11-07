# Обязательный вход ROOT, producer row и фактический consumer

## Carrier REQUIRED_ROOT_BINDING

`env.REPORT2_BINGX_HISTORY_BINDING` — предлагаемое серверное поле. Его нельзя заполнять из provider payload/selfhash/пользовательского params или по `verified` boolean. ROOT ещё должен независимо квалифицировать admitted native catalogue, классификацию (без акций/золота/FX/прочих noncrypto), token identity, единицы и current transport evidence. Имена/hash будущего artifact сейчас не объявлены существующей authority.

```javascript
{
 expected: {
  venue: 'BINGX',
  actor: '<exact ROOT selected new collector actor; not HUB_PUBLIC_COLLECTOR>',
  schema_version: 'report2-market-snapshot-batch-v1',
  accepted_generations: ['<exact current>', '<explicit compatible, optional>']
 },
 current: { registry_json: '<exact UTF8 bytes>', expected_sha256: '<external ROOT pin>', git_blob_locator: '<ROOT-bound immutable locator>' },
 compatible: [ /* at most2 separate descriptors, identical shape */ ]
}
```

Поколения не выбираются по prefix и не выводятся из каждого обновлённого catalogue SHA/received timestamp. Идентичность контракта тоже не зависит от этих transport/provenance полей. Expected SHA должен прийти **независимо** от проверяемого содержимого. Locator не загружается и не аутентифицируется самим B04; его связь с admitted result/root scope проверяет ROOT до установки carrier. Возвращаемые native_authenticated/native_admission остаютсяfalse.

Registry JSON:

```javascript
{
 schema:'BINGX_HISTORY_REGISTRY_V1', venue:'BINGX', actor:'<expected actor>',
 snapshot_schema:'report2-market-snapshot-batch-v1',
 row_schema:'BINGX_NATIVE_METRICS_ROW_V1', registry_revision:'<provenance version>',
 instruments:[{
  instrument_identity:{ /* final SOURCE schema BINGX_CRYPTO_PERPETUAL_INSTRUMENT_V1;
   exact family/nativeid/symbol/base/quote/settle/margin/linear_inverse,
   positive size+unit or explicitNULL; token binding/epoch/scale;
   stable identity_revision, classification proof locator and catalogue SHA */ },
  unit_revision:'<ROOT qualified stable metric-unit protocol revision>',
  metric_specs:{
   price:{unit:'QUOTE_PER_NATIVE_BASE',basis:'LAST'}, // or MID/MARK/INDEX, exact
   oi:{unit:null,basis:'NATIVE_OPEN_INTEREST'}, // or exact CONTRACTS/BASE_ASSET/QUOTE_ASSET
   turnover_24h:{unit:null,basis:'PROVIDER_ROLLING_24H'}, // or exact QUOTE_ASSET
   funding_rate:{unit:'RATE_PER_ACTUAL_PERIOD',basis:'NATIVE_FUNDING_RATE'}
  }
 }]
}
```

UNKNOWN unit в registry не превращается в известную в row. Изменение единиц/basis требует новой instrument/unit revision и запрещает reuse старой точки до отдельной точной совместимости. `unit_revision` нельзя менять из-за простого обновления каталога без изменения факта. Применимость COIN_M отдельно отUSDT_M; price quote per native base не становится canonical token/USDT ценой.

## Реальная упаковка и запись

После независимой квалификации ROOT вызывает существующий `bindBingxHistoryRegistry(carrier)`; private context token подтверждает только прошедшие проверки целостности, не grant. `bingxHistoryInstrumentRefs(context)` возвращает opaque history refs в порядке current registry instruments. Producer обязан сопоставить native observation с **полной** expected instrument identity соответствующей записи, не просто с ticker. Derived ref не новая authority и не замена price namespace PR634.

Каждой записи current cohort соответствует **ровно одна** строка. Missing metric — явные NULL внутри строки, отсутствующий инструмент нельзя молча выкинуть и назвать batch полной. Root сохраняет отдельный аудит excluded/UNKNOWN всего native каталога; текущая квалифицированная cohort не объявляется всеми доступными BingX контрактами.

```javascript
{
 row_schema:'BINGX_NATIVE_METRICS_ROW_V1', venue:'BINGX',
 contract:'<exact native_symbol>', family:'USDT_M', instrument_ref:'<bound ref>',
 captured_ts: '<actual snapshot capture time in ms, integer>',
 metrics:{
  price:{value_decimal:null,payload_sha256:null,proof_ref:null,unit:null,basis:null,source_ts:null,received_ts:null,
   window_start_ts:null,window_end_ts:null,period_ms:null},
  oi:{/* same shape */}, turnover_24h:{/* same shape */}, funding_rate:{/* same shape */}
 }
}
```

`value_decimal` — исходная нормализованная десятичная строка илиNULL, без скрытого коэффициента/quote conversion. Для известного значения обязательны SHA256 original response payload и proof_ref на настоящий ROOT-квалифицированный receipt/body. B04 сохраняет эту связь, но сам по locator не скачивает и не аутентифицирует body; это обязанность admitted producer. Для не полученного показателя оба поля явноNULL. Единица/basis берутся только из exact native evidence и expected contract. source_ts — часы **данного** показателя; received_ts — получение его original response, не обработка cache. captured_ts — факт сборки snapshot, не source clock и не backfill event firstknowledge. Фьючерсная price basis связана с registry. Turnover для пригодного rolling summary требует фактических start/end с длиной24h и end=source_ts; funding требует реального period_ms. Отсутствующие поля явноNULL.

Вызов настоящего существующего pack:

```javascript
const shards=packSnapshotShards({bucket,actor:context.actor,generation,
 received_ts:actual_batch_receipt_ts,rows,status:'COMPLETE',history_context:context});
for(const shard of shards) await persistSnapshotShard(admitted_existing_db,shard);
```

Данная последовательность **не даёт native admission**; ROOT обеспечивает grant/known costs/journal и clock ordering отдельно. DDL install не вызывается. Table/PK прежние; source_timestamps_json получает BINGX venue/row_schema/registry SHA+revision/expected_shards/universe_total. ON CONFLICT не переписывает существующий bucket; повторная обработка должна дать тот же payload или конфликт. Snapshot receipt/captured находятся в собственном5m bucket, metrics сохраняют свои более старые clocks и становятся unusable при несоответствии. Историческая свеча, полученная сейчас, не становится прошлым prospective snapshot.

## Подача current row в первичный отбор

ROOT native producer должен получить нормализованный current row через **тот же** `normalizeBingxHistoryRow(raw,{context,registry_sha256:context.current_registry_sha256,bucket,received_ts,decision_ts})`. Decision asof ставится после фактического capture; старый htxUniverseScan.now из начала HTX запроса не является достаточным asof для будущего BingX результата.

В proposed реальных пяти выражениях Worker:

```javascript
historyMetrics(current,
 history.targets['5m'].get(current.venue==='BINGX'?current.instrument_ref:key),
 {context:history.context,window:'5m',now_ts:now});
```

Остальные4окна — те же существующие calls с точным label. Сопоставление не использует normalized HTX symbol. Для старого HTX current.literal/key/нулей/20min fallback предложение сохраняет прежнее тело; перенос его общего acquisition/universe admission/стратегии принадлежит ROOT. **Без нового квалифицированного current producer вся production Stage0 цепочка не готова**, несмотря на положительный controlled путь pack→persist→reader→выражения selection.

## Что ещё квалифицировать ROOT

Native registry/classification/unit/body/clock originals и независимый expected carrier; текущий source-producer/full-family universe/admission; общий связанный Worker с SOURCE/PR634/B04; actual imports/nodecompat/build; bound SQL plan/index/rows_read/response wire/heap/latency и shared reservations/unknown. Ровно1новая affected общая квалификация, без старого634case. Ни эта схема, ни controlled результаты не заменяют native проверку/полный отчёт/Telegram.
