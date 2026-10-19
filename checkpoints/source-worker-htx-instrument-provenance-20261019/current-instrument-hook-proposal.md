# Узкое предложение: уже полученный HTX catalog → current metadata

Это конкретное предложение для общих файлов координатору, **без изменения или исполнения production-кода**. Нужные native значения уже сохранены в original391236; повторный provider reader/fetch/SQL для настоящего offline вывода не требуется. Новый runtime hook не реализован и не объявлен квалифицированным.

Сейчас Worker `fetchJson` уже читает `response.text()`, парсит JSON и возвращает `data`; `htxUniverseScan` получает unfiltered `swap_contract_info` одновременно с market/OI/funding. Stage0 сохраняет contract_size/price_tick; instrument_scope.evidence сохраняет explicit business_type/contract_type/trade_partition. Symbol fingerprint имеет и fallback-значения, поэтому не заменяет exact native row. Недостаёт отдельного связывания selected native row/create_date с SHA полного response body и точными header/body/parse/hash clocks. Не требуется менять105 rows, существующую классификацию, availability или canonical metadata.

Единственная предлагаемая точка наблюдения — успешное завершение **уже существующего** catalog `fetchJson`, после имеющихся text read/parse/apiOk. Не глобальный fetch wrapper, не response.clone(), не второй parse и не новый запрос. На вызове `fetchJson(endpoints.contracts)` допустим optional synchronous callback из invocation-local env. Когда callback не задан, прежний return и работа остаются прежними. Исключение diagnostic callback перехватывается отдельно; оно не превращается в SOURCE_ERROR и не меняет apiOk/return/исходные факты.

Пример контракта, не готовый patch и не выполненный код:

```js
on_completed({
  url, http_status, data, raw_text,
  request_started_ts,
  headers_received_ts,
  body_completed_ts,
  parsed_ts
});
```

Header clock берётся после existing fetch return; body clock — только после `await response.text()`; parse clock — только после existing successful parse. Получатель считает SHA **этого** raw_text и отмечает завершение hash; conservative body-known-by не раньше body/parse/hash. Не подставлять в него candle close, provider ts, дату Git, scan start, поздний общий timestamp после Promise.all или старый original recorded receipt. Если события/clock/body/ref нет, соответствующее поле NULL и current receipt не считается закрытым. Source clock остаётся payload.ts; body-known-by — отдельный consumer clock.

Будущий bounded DTO можно ограничить четырьмя **явно запрошенными** approved HTX analysis contracts, до1024 UTF8 bytes на row и8192 на frame, только catalog input <=900000 UTF8 bytes. Это предлагаемая граница технической проекции, не измеренный полный native CPU/heap/wire/persistence bound. Нельзя обрезать факты или менять прежний105 scan при overflow; diagnostic должен вернуть OVERFLOW/UNKNOWN. Новый индекс/Map по105 не нужен: поиск exact contract_code в уже имеющемся parsed array, без копирования полного body в DTO.

Для каждой строки сохранять native значения без fallback/coercion:

| Поле | Допустимый смысл |
|---|---|
| contract_code, symbol | Exact UTF-8 native строки; approved match и уникальность проверяются отдельно |
| business_type, contract_type, trade_partition | Native role/settlement только этого HTX инструмента; не брать fallback `swap` из symbol fingerprint |
| contract_size, price_tick | Числа, как сообщил данный snapshot; NULL при отсутствии/invalid, никогда не1/0 по умолчанию |
| create_date | Native YYYYMMDD lexeme; не эпоха/interval/доказательство неизменности параметров |
| contract_status | Native integer status;1 и3 сохраняются раздельно, status3 не даёт market/analysis admission |
| source_ts | Payload.ts текущего response, без обновления/подмены |
| body_sha256, native_row_pointer | SHA полного исходного response text и точный `/data/i`; JSON row hash отдельно, не выдавать его за wire hash |
| receipt_ref/hash и clocks | Только actual producer/local completed-input marker; не независимый persistence/native ACK |

Exact identity key здесь — HTX + linear family + contract_code + native business_type/contract_type/trade_partition. Совпадение symbol не связывает BTC-USDT, BTC-USD, delivery contracts и Binance BTCUSDT. Duplicate/missing/conflicting exact native rows → explicit UNKNOWN; не latest-wins. Unknown поле остаётся NULL. Contract_size raw field в этой задаче не получает независимо доказанную единицу измерения.

В DTO безусловно оставить `historical_contract_size:null`, `native_instrument_epoch_verified:false`, `historical_epoch_continuity_proven:false`, `project_identity_verified:false`, `native_ACK:false`, `card_memory_watch_admitted:false`, `score_contribution:0`, `entry_authorized:false`. Numeric price/quote conversion1 отдельно и не является contract_size/facevalue. Не записывать DTO в canonical metadata/source_receipts/fingerprint, отчёт/Telegram или source cache. Отдельный invocation-local technical carrier/его completion binding — последующий центральный выбор, не выполненная этой задачей интеграция.

Это полезная информация о **текущем на исходном cut** инструменте, а не разрешение исторического research input. Для AAVE4h нужна собственная историческая непрерывность native epoch/size. Для двух Binance BTC inputs нужен собственный Binance venue/instrument provenance; HTX catalog их не исправляет. Ни одна из трёх карточек не получает новый допуск.
