# Native формы, текущий каталог и delivery purpose

Конечный offline пакет по новым private capture ROOT и отдельной явной команде на purpose seam. SOURCE не вызывал market API/SQL/TG/deploy. Тела, цены, объёмы и нормализованные реальные рыночные значения в пакет не копировались; сохранены только metadata/digests/counts/clocks и классификационные поля каталога.

Base authority: `737bfc57be088a3e6662dba39a23084e3103658c`, fresh all4 equal/AGENTS/status/resume/window/phase/fence/generation прочитаны по одному SHA. Own lease acquire `bf504185f34dbb3c686e4edd3eec73c365dddef2`; scope amendment под explicit ROOT purpose command `ea805f5a45b3acab1f38ad6c570c33d4c0be9f94`, тот же owner/expiry1792934923655, FULL server bytes/ref readback. Root lease не менялся. Code checkout по-прежнему PR639 `4b44d48836b9c26b1c9c8bb0830055ee279a608a`; source index изменён локально, нового code/main commit нет. Позднее ROOT сообщил main93faf0b17b3bd7018ef419d665a21819d2589056 и successful diagnostic TG239; это не торговый сигнал, SOURCE эту цепочку не повторял.

## Содержательная проверка candles

`NATIVE_BINGX_20261025_METADATA_V1.json` SHA256 `4247d741e0f05f26740b26c69b4ea8de2fd27d2bd3d21cd492436a0588f37e4c` закрепляет полные hashes трёх local private capture. Wrapper хранит body.response.data как parsed официальный envelope, не исходные provider HTTP bytes; соответствующие hash claims разделены.

Фактически: code0,125 object rows open/close/high/low/volume строками и time integer,60s contiguous/grid. Broker received_ts1792931883125, native times1792924380000..1792931820000. Это доказательство формы/сетки, не open-time/base-volume. Стакан содержит20 bidsCoin+20 asksCoin, native T1792931914839; документация квалифицирует значение явных Coin полей. Это не1000-level readback и не полный стакан. Все captures исторические; новое чтение не освежает source clocks.

После новой конкретной команды ROOT проверен поддерживаемый primary consumer [CCXT BingX](https://github.com/ccxt/ccxt/blob/d3159f7036f93db086cd0414642132fba5401710/ts/src/bingx.ts). `CCXT_PINNED_NATIVE_CANDLE_REVIEW_V1.json` даёт exact commit/blobs/lines и цепочку:

1. Non-spot/non-inverse и без price:mark идёт именно в swapV3PublicGetQuoteKlines; USDT_M ограничение сохраняется.
2. Объект совпадает с реальной формой ROOT; native time попадает в tuple[0], volume без преобразования — в tuple[5].
3. Shared buildOHLCVC ставит openingTime в tuple[0]; Manual определяет timestamp UTC ms. Это содержательная поддержка opening-time **конвенции consumer**, а не новое независимое наблюдение vendor guarantee.
4. [Pinned unified Manual](https://github.com/ccxt/ccxt/blob/d3159f7036f93db086cd0414642132fba5401710/wiki/Manual.md) говорит о volume: **usually in terms of the base currency**, с допустимыми quote/base исключениями. В конкретном BingX docstring base единица не закреплена. Поэтому отсутствие пересчёта и client contractSize1 не доказывают native base-volume или provider multiplier.

Строгая пара current qualifications **не закрыта**. Source registry candles по-прежнему пустые; callerboolean не добавлен. Уточнённо: CCXT exact-object маршрут подтверждён, consumer open-time interpretation поддержана; BASE-volume не доказан. Official BingX technical-analysis script5d2ae55a… тоже лишь приводит OHLC/volume к float и time к UTC ms, без open/volume semantics. Его анализ/чужой код не выполнялся. Official array reference не превращён в object unit proof.

Минимальный конкретный альтернативный contract, если ROOT выбирает его вместо ожидания provider unit guarantee: явно принять pinned consumer open-time basis, а объём анализировать как **безразмерное отношение одинаковой native reported quantity** из уже сохраняемого native_volume_decimal, только same instrument/route/field и сопоставимое стабильное определение в numerator/baseline. Native unit=UNKNOWN, volume_base=null; никаких USD/base amounts. Для этого ROOT/ANALYTICS меняют общий semantic input; SOURCE не переименовывает существующий OHLC_USDT_VOLUME_BASE как доказанный. Если конвенция consumer не принимается, нужен exact vendor time=open contract; если сохраняется требование BASE-volume, нужен exact BingX declaration/unit mapping с multiplier, а не ещё одна выборка или сетка. Не требуются новые market probes для повторения уже известных структурных фактов.

## Весь новый native каталог

`pump-report/sources/current-native-catalog-classification-v1.json` SHA256 `e721e4f32fcb01fe9ecc736ba0780b5a07ba1a11e86024b0cfe0d43154612a13` — реально заполненный census всех1278 metadata rows, без raw цен/объёмов.

| Категория на capture1792931870932 | Число |
|---|---:|
| Все rows |1278|
| Active USDT |934|
| Exact13 ранее доказанных crypto underlying, native tuple совпал |13|
| Active USDT owner exclusions PAXG/XAUT |2|
| Active USDT UNKNOWN underlying |919|
| USDC вне target |49|
| Status не1 |295|

Изменился ZC-USDT/native104206: retained status1 → current capture25. Остальные1278 id/symbol/asset/currency tuples сохранились. Membership подтверждена только на исходный момент capture; current global qualified crypto N=null.13 не потолок; положительный lookup применён по полному exact native tuple, не ticker.

Масштабируемые primary candidates проверены конечным bulk проходом: BingX markets page, All Coins directory и официальный BingX PoR repository. Markets даёт navigation/popular names. All Coins показывает10 глобальных CoinGecko-derived names, без native contractId/shared immutable underlying key; новые STETH/FIGR_HELOC/USDT/USDC не имеют target native tuple в этом capture, релевантные major names уже в13. PoR README — Merkle tutorial и BTC/ETH/USDT/USDC examples, не полный underlying metadata registry. Эти материалы не дают права автоматически перевести919 UNKNOWN в crypto. Старый HTX реестр также не является BingX binding.

Точный недостающий scalable input: primary BingX набор с immutable underlying/contractId→name/type/network metadata либо конечный review-bound equivalent evidence set. Тогда тот же actual1278 census соединяется по exact keys за один проход; unknowns сохраняются. Поиска по одному935 тикеру нет, полной crypto классификации из All Coins/CoinGecko symbols нет.

## Реализованный purpose seam

Менялся только `pump-report/sources/index.mjs`: новый SHA256 **`c880977a5be6c1b39bc5a7447d9726f0c6f19c3d96d147f274553dbf825bc622`**, исходный eb45f076… сохранён в index-before-delivery-purpose.mjs. Точный patch index-delivery-purpose.diff SHA256 `e4d06a7226e280442773fc9038c2f920eb70c76057949ad11ee5fdbea892aaf5`.

getCore принимает purpose=CORE по умолчанию, валидирует только CORE/DELIVERY до IO, передаёт его через price/candles/orderbook и request helper в broker.request; price fallback наследует purpose. Остальные source methods получают defaultCORE. Force refresh сохраняет ttl0 и прежний предел2 selected price/book calls без третьего fallback. Provider BINGX/familyUSDT_M, source identity, URLs/cache keys/data/units/event/received/expiry не переименованы. Purpose не включён в semantic cache key. SOURCE не снимает reserves: это делает ROOT budget по новому контракту. ROOT worker должен передать purpose:DELIVERY в saved-card revalidation. Общие contracts/profile/budget/worker здесь не менялись; bingx.mjs/liquidations.mjs остаются frozen.

## Проверка и остаток

Одна новая связанная offline qualification `qualify-native-catalog-purpose.mjs`: actual private forms по полным hashes; неизвестные candle units/time не становятся USABLE; historical20-level Coin book; новый current13/1278 census и status delta; purpose CORE/DELIVERY preserves semantics/cache clocks и invalid enum до IO. Это не повтор А33/old audit и не новые provider/SQL calls. Результат с хешами — NATIVE_CATALOG_PURPOSE_OFFLINE_QUALIFICATION.json. Реальные private значения в результат не входят.

ROOT сообщил: initial5 полностью потрачены,3SUCCESS+2UNKNOWN сохранены; поздний отдельный diagnostic TG239 без trading outcome, AUTO/production OFF. ROOT сообщил83native requests475R60W/unknownSQL0; это не измеренный manualcost и не SOURCE расходы. SOURCE marketHTTP/SQL/TG/deploy0, docs connector costs unknown. Не возобновлять старые cron/Actions/9пауз/2deferrals. Остаток: exact BASE-volume guarantee или утверждённый ROOT relative-native semantic contract; явное принятие consumer clock basis либо vendor open-time guarantee; bulk exact underlying metadata для оставшихся919. Source scope завершить after affected check/only-own release, без повторных поисков ради занятости.
