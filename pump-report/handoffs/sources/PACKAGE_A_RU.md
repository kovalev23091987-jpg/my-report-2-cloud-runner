# Источники Памп-отчёта — пакет А, офлайн-передача

Статус: исполняемый компонент и affected offline qualification; реальная цепочка BingX ещё не подтверждена. ТЗ v2 / `0674adf8bef087f63ddac8214b8e650ae14410f33970ed4f869c5ab2564975cc`. Контракт `pump-report-contract-v1`, source version `pump-report-sources-v1`.

## Версии и файлы

Fresh GitHub main перед работой и перед проверками: `d81bca51a57bb16d80ef9f9f5ce34c1ab1adb59c`. Локальный ROOT checkout HEAD: `4b44d48836b9c26b1c9c8bb0830055ee279a608a`; checkout/branch не переключались. Собственного code commit/head нет: ROOT поручил локальные файлы и сам интегрирует. Рабочий корень: `/Users/mac/Downloads/MY_REPORT_2_TRANSFER_20261011 3/report2-bingx-migration-20261024`.

| Файл относительно корня | SHA256 при передаче А |
|---|---|
| pump-report/sources/index.mjs | c0c0c8128fa4755a78171a5ba08edb249fa57bed6c8b63ae37efa2c54caca785 |
| pump-report/sources/bingx.mjs | 3f7ca7e5841bb9673e931010cebd5e68eaf2c18f9cf3f889967e6bcc2bd0c3d9 |
| pump-report/sources/liquidations.mjs | 7fd1e6cca4eb6037ecbe5d6e9296c681aaa19dfb6248ef38da8bf0e5c2de744e |
| pump-report/tests/sources/sources.test.mjs | 9edf3ecacec5a1dfb8a1f27d8d4a4d55ff0824e8781801d218fd1fd460bf8ab6 |
| pump-report/handoffs/sources/tests.tap | c07bb3b25ecec75d27ed46a3f04447711f2d33eb71fd6a53d0f2db9edbc68a91 |

Общий `contracts/index.mjs` не изменялся, SHA256 `7abdc44914c754f5edc1fd1ddacdee0fe407109211581b2534b361faa144ec51`. ROOT дополнил общий профиль аналитическими техническими настройками: последний прочитанный SHA256 `ad3f0e009b2811ebb410444599d2f422f1a5dbd62a0e6d14e8425d5d763d5357`, source TTL прежние; исходный переданный SHA был `d9577924b80ef0cf8b7fa312f022b13feff5bc2629c2e40545cd62986f370e06`. Описание контракта после уточнения ROOT: `d19431abf6fc678ab0b78d33b49a4b6ddb9119b8e33b2115c001de5f348ddb53`. SOURCES общие файлы не редактировал.

Переиспользованы семантические проверки object-shaped BingX из PR639: строгие числовые поля, уникальный exact symbol, OHLC/grid, native time, разделение единиц. Старый runtime/HTX gates, 70, две монеты, BTC/ETH exclusions и обязательная карта не переносились. SOURCE836 использован как карта существующего parent/budget admission; он не объявлен исполняемым подключением. PR640 не считается доказательством закрытых свечей.

## API и registry

`createPumpSources({broker, identityRegistry, clock, profile})` возвращает `getCatalog`, `getOverview`, `getCore`, `getOptional`, `getLiquidations`, `getCoverage` по общему контракту.

`identityRegistry` допускает Map значений, массив записей, `{instruments:[...]}`, либо синхронный `{resolve(query)}`. Resolve возвращает независимую запись ниже или null; Promise запрещён. При getCatalog query: `{native_symbol,native_contract_id,venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT'}`; при getCore query содержит instrument_id/native_symbol и те же venue/market/quote/settle. Provider classification/eligibility booleans в resolve не передаются. Registry должен быть подготовлен ROOT по проверенным сохранённым/документальным доказательствам, а не из публичных параметров запроса.

Запись: `{instrument,native_contract_id,native_base?,family?:'USDT_M',qualifications,liquidations?}`. Instrument — общий контракт плюс непустой identity_evidence_ref. Native contractId сверяется с фактическим каталогом; неизвестная классификация/status=1 сама инструмент не допускает. Неизвестные тикеры и USDC/COIN-M остаются unqualified. Дубликаты binding и каталога не квалифицируются.

Минимальные **формы** qualification (это описание, не реальные доказательства):

```js
qualifications: {
  candles: {
    time: {semantics: 'OPEN_TIME', evidence_ref: actualQualifiedObjectTimeProof},
    volume: {unit: 'BASE_ASSET', evidence_ref: actualObjectVolumeUnitProof}
    // CONTRACTS требует base_per_contract и доказательства именно candle volume.
    // turnover необязателен: {unit:'USDT',field:'quoteVolume',evidence_ref}.
  },
  orderbook: {fields:'COIN',unit:'BASE_ASSET',evidence_ref: actualBidsCoinAsksCoinUnitProof},
  // Или fields:'STANDARD',unit:'CONTRACTS',base_per_contract,evidence_ref.
  ticker_24h: {window:'ROLLING_24H',evidence_ref: actualWindowProof},
  open_interest: {unit:'BASE_ASSET',evidence_ref: actualOiUnitProof},
  funding: {rate_clock_field: actualRateEventClockField,evidence_ref: actualRateClockProof}
}
```

Ссылки qualification — доверенный вход, истинность которого устанавливает ROOT. Непустая строка/fixture не является native proof или admission. Code fixtures не использовать как production registry. `updateTime` funding запрещён как clock ставки. При неизвестной qualification OI/funding запросы не тратятся: NOT_CHECKED/null с причиной. Trades/context пока NOT_CHECKED; routes не доказаны этим пакетом.

## Поведение данных

Core холодного инструмента: LAST, 121 закрываемых минутных интервалов и depth через broker. Цена из недавнего общего обзора переиспользуется с тем же fact_id/исходными часами; тогда отдельный LAST не нужен. При отсутствии/устаревании пригодного LAST один ограниченный fallback к ticker LAST; при identity/future-clock/access/rate/admission отказе повторного обхода нет. Все receipt refs попыток сохраняются, общий учёт только у ROOT.

Candles USABLE означает пригодность фактически доступных закрытых строк с доказанными time/volume, не готовность торгового плана. Отсутствие старого 121m-префикса не blanket gate. В value только непрерывный последний отрезок. Coverage содержит requested window, complete, gaps, internal_gaps, missing_older_prefix, observed_available_start, available_start/end, contiguous_tail{start_ts,end_ts,closed_bars,duration_ms}, usable_windows[{window_ms,window_start,window_end,closed_bars}], число исключённых разрозненных старых строк. Шесть новых закрытых минут дают пригодное 5m-окно; внутренняя дыра перед двумя последними минутами не даёт 5m-окно. При неизвестных units/open-time qualification не повышается. Свеча, полученная до её close, не становится закрытой при позднем чтении кэша. Quote turnover без отдельного поля/доказательства остаётся null.

Orderbook использует только доказанный набор полей и base quantity, конвертирует contract multiplier один раз; crossed/locked/дубли/невалидные размеры отвергаются. Source event clock — native T. Повторное получение не обновляет время исходного факта. Все факты сохраняют instrument/asset/venue/market/settle, units, clocks и broker evidence.

Swole GET подключается только при независимом route asset mapping, model evidence, relative scale и пригодном cross-venue price mapping. Зоны имеют model_id/version, price_currency, price_comparability, исходные native boundaries/currency, source venue, magnitude RELATIVE_INTENSITY, upstream/overlap group, ограничения и usable по каждой зоне. Поле с именем usd не объявляется долларами. Одна сторона допускается, отсутствующие зоны не добавляются. Непригодные зоны остаются диагностическими usable=false. Объединение/выбор зон — ANALYTICS. Без route — NOT_CHECKED, без карты core продолжает работать.

Orderly/HL POST сейчас NOT_CONNECTED: действующий broker contract и implementation допускают GET и не передают body. Возвращается `POST_BODY_NOT_IN_BROKER_CONTRACT`, вызова нет. Это не утверждение отсутствия данных у площадок.

## Бюджет и HTTP-план

Каждый transport только `broker.request`; source собственного ledger/SQL/fetch/scheduler/delivery не имеет. Для detailed requests передаётся candidate_id=instrument_id. Для карты family=LIQUIDATIONS, чтобы ROOT применил общий 8/run. Для BingX route family USDT_M; фактические provider caps ROOT задаёт отдельно.

| Операция при отсутствии пригодного cache | Верхний HTTP-план leaf |
|---|---:|
| Каталог | 1 |
| Общий обзор всего проверенного списка | 1, не N |
| Core монеты | 3; 2 при пригодном LAST общего обзора |
| Ограниченный LAST fallback | дополнительно не более 1 |
| Optional OI/funding | 0 при недоказанных units/clocks; не более 2 при qualification |
| Карта Swole | 0 без пригодного route; не более 1 на вызов |
| Холодный manual без каталога/обзора | до 7 = core3+fallback1+optional2+map1 |
| Если manual требует также холодные catalog+overview | до 9; фактическое повторное использование может снизить |

Это не измеренные native затраты и не выдача квоты. Шесть таких ручных проверок требуют проверки 42–54 leaf HTTP в худшем плане до учёта cache/overlap; **24 HTTP не доказанный резерв**. Все provider weights, broker/cache/ledger SQL, storage/finalization/delivery cost, unknowns остаются у единого бюджета ROOT, здесь NULL. Локальный parser leaf SQL0 не означает whole SQL0. Новых рыночных HTTP/SQL/TG в работе SOURCES не было.

ROOT integration note: новый broker умеет family=LIQUIDATIONS и candidate_id. Выбор hot/background lane сейчас принадлежит broker; источник его не обходит. HTTP200/code100410 источник различает как rate limit и не запускает fallback; общий durable backoff должен также сохраняться broker, одного HTTP status недостаточно.

## Проверки и ограничения доказательства

Команда из рабочего корня:

`node --test --test-reporter=tap pump-report/tests/sources/sources.test.mjs`

Последний сохранённый результат: **27 tests / 27 pass / 0 fail / 0 skipped**, process exit0, TAP рядом. Проверены identity ambiguity, USDT/USDC/COIN-M, null semantics, closed/open cache clocks, short history/internal holes, стакан/конвертация, fallback, provider/admission denial, независимость монет, карты без стороны/без basis/устаревшие/budget/timeout, relative magnitude и повторное использование факта общего обзора. Это SYNTHETIC_VALUES_NATIVE_SHAPE, не native qualification. Старые97+7 и полный старый аудит не запускались.

Не выполнены: текущие API из рабочего runtime, native candle semantics/volume/depth units, классификация полного каталога, реальные provider cost/latency, единый runtime+SQL budget admission, реальная карта, Telegram/message_id, deployment/расписание. Эти границы не обозначаются закрытыми.

Новый официальный docs read обнаружил важное противоречие: `BingX-API/api-ai-skills`, `skills/swap-market/api-reference.md`, blob `e61be4746c5bd5475e556146448c79f4c58b064f` описывает v3 kline как массив с open time/base volume, тогда как сохранённая фактическая форма PR639 — object rows. Нельзя переносить array semantics на object.time/volume без отдельной проверки. Depth docs описывает quantity и T, но не доказывает units bidsCoin/asksCoin. Следующий разрешённый пакет — primary-doc/saved-evidence registry и узкий план ROOT native проверки, без market API со стороны SOURCES.

## Аренда и следующая передача

Offline ref `refs/heads/leases/report2-sources`, acquire commit `929bc3cfb3974011318fe175bda27a93db2dd653`; owner `CODEX:SOURCES:01a171fd:1792914598000`, expiry `2026-10-25T08:59:58Z`. Полный server readback exact; own ref и main проверены. Чужая ROOT аренда не изменялась. Работа продолжается только в этой live lease и своих путях по следующему поручению; затем only-own release до expiry. Вторая передача может дополнить API getOutcomeHistory; при интеграции сверять конечные file hashes следующего пакета.
