# F595 V2 — завершённый offline-разбор трёх captures

V1 уже был заморожен и освобождён, когда пришёл последний assetinput. Его8файлов сохранены без изменения; V2 добавляет assetpage и объединённую матрицу под отдельной короткой арендой. Повторных docs/service-вызовов не было.

Фактический accountplan — Free,30/min и1000/day как тарифные caps. monthly_raw0 остаётся UNKNOWN; остаток/reset/window/credits/nativeclock отсутствуют. Ни unlimited, ни zeroaccess из0 не выводятся.

Markets:50из294, truncated/hasMoretrue, nextOffset50. Assets:25из434, truncated/hasMoretrue, nextOffset25, detailsummary, crossMarketCount65. Оба набора частичные, их totals относятся к разным сущностям и не складываются в census. Installedmarketsargs — dex/useToonFormat; installedassetsargs — crossMarketOnly/useToonFormat. Offset/limit/search недоступны, несмотря на подсказки backendresponse.

Точный offlinejoinк550:
- marketsrawname:46 кандидатов;
- assetcanonical/synonym/exactnativevenuenames:8 кандидатов;
- совпадают в обоих наборах3, union51;
-499не представлены ни в одной полученной странице;
- canonicalidentity550UNKNOWN,qualifiedroutes0,UNSUPPORTED0.

Providercanonical — экономическое exposure, не доказательство идентичности crypto-проекта BingX. Префиксы venues не отбрасывались, fuzzy/scale-подмена не применялась. HYPE есть среди assetgroups, но отсутствует в первой markets-странице. DOOD не представлен в этих частичных страницах; глобальный unsupported не выставлен.

Котировки/funding/OIполя рынков и totalOIassets фактически получены ROOT, но clock/period/units/полнота и consumerusefulness не квалифицированы. В пакет экспортированы только имена/venue/synonyms/fieldpresence, не privateчисловой payload. Source2340x/162activeoverlap и HYPEcontrol сохранены исторически отдельно.

Минимальное исправление — интерфейсный paginationgap: provider-supportedlimit/offset в текущихtools либо отдельно рассмотренный ROOTboundedREST с существующими credentials и подтверждённым контрактом. Неподдерживаемые параметры, повторение первых страниц и500помонетных запросов не предлагаются. После исправления нужна фактическая completion-проверка, затем тот же пакетныйjoin550. Нового кода/framework/адаптера нет.

По последнему ROOTcapture qualification22/24remain2; три outerMCPcalls (plan/markets/assets), physicalHTTPкаждогоUNKNOWN_NONZERO. LOOKUP12spent0left/default10. Regularproductiontransport не активирован, тариф не выдаётся за остаток. F595 завершён на имеющихся данных, новых marketinputs не ждём. SOURCE docs/API/MCP/account/Node/code/tests/nativeSQL/TG/deploy0, прежние бюджеты/unknowns/резервы/паузы сохранены.
