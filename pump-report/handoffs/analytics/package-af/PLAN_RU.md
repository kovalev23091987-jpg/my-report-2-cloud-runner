# AF — буквальные наблюдения движения, без новой стратегии

Authority: единая редакция SHA384e038c734e02230845925fa564d46402ffc4be4555ca6345315ac5ea335048, исходный TZv2 SHA0674 целиком; собственная bounded75m аренда с FULL readback до изменений.

| Буквальное требование | Имеющиеся входы | Однозначная минимальная реализация |
|---|---|---|
| §8, line273: 3 и5 минут для активности | Квалифицированные закрытые1m OHLC/volume + activity_windows_ms=[180000,300000] | Оба фактических окна, прежнее соседнее окно, медиана предыдущих сопоставимых окон без текущего, ratios/null reasons и единица. 5m core/impulse не менять. |
| §7: цена ускоряется; усилия дают меньший рост | Те же равные соседние закрытые окна | Signed return/min и разница скорости; факт «активность не ниже, а рост меньше» только при положительном прежнем росте и сравнимой единице. Это наблюдения, не новый threshold/gate/state classifier. |
| §7: повторные неудачные обновления вершины | Подтверждённый HIGH pivot, known_ts до начала тестируемого бара | Считать только бары open≤заранее известный HIGH, high>HIGH, close≤HIGH; ≥2 означает буквальное повторение, не настроенный порог силы. Ограничить наблюдение предоставленным сегментом; не объявлять неизвестную полную историю волны. |
| §7 lines248/252/253: скорость снижения, скорость/величина возврата, возврат за уровень | Peak bar, after-peak closed OHLC, original reclaim level | Return magnitude по closed close и low; интервалы возможного времени high/low внутри OHLC дают speed bounds, а не выдуманную точную секунду. Actual breach/reclaim close clocks и current-above-level отдельно. При отсутствии пути/бара — explicit null reason. |
| §18 lines811–817: два основания, один риск, различимый calm/sharp текст | Новые observation diagnostics + существующие факты/plan | Выбирать короткое конкретное движение/предупреждение без buy/sell absorption claims; не менять plan/gates и не увеличивать число основных оснований. |

Никаких новых source calls, history requirements, probabilistic моделей, weights, turnover conversions, shared schemas/profile/runtime изменений. Исходные first-qualified wave clocks/lifetime, current5m ratio, AUTO20/10, minimum conservative plan10, noBTCETH/no3000, optionalmap semantics и probability=null сохраняются.

Неоднозначное оставляется минимальным предложением ROOT: какие значения acceleration/effort/failed-high diagnostics должны ПЕРЕКЛЮЧАТЬ ACTIVE/WEAKENING/RESUMING. ТЗ не задаёт новый численный порог, допустимую шумовую полосу или вес этих признаков; в AF новые наблюдения не становятся veto/score. Причинное поглощение продаж не утверждается. Не требуется ждать статистическую калибровку для самих наблюдаемых фактов.

Одна новая связанная affected qualification на новых явно ARTIFICIAL входах; accepted старые тесты/AA/AB/W/Z не запускать. До единственного запуска — свежие guards/own FULL. Сравнение численного core с сохранённой before реализацией допускается только внутри этой новой проверки, не историческая батарея. Новые source captures не получены; synthetic не объявлять сигналом. В конце exact frozen files/SHA + fresh authority + timely onlyown release.
