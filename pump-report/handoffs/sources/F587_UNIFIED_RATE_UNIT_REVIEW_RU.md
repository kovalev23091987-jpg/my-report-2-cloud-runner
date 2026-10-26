# F587 — точная нормализация unified fundingRate

Проверен только unitgap.2search/2primaryreads SPENT, новыхmarket/metadata/SQL/Worker/TGcalls0, код/тесты0. Main c794ad86b8e8e040484be5c3d0fbcd8ff572e5dd. Одно чтение потрачено на officialrepo tree и посчитано консервативно; второе — полный pinnedDeltaadapter. СтарыеF586grants не восстановлены.

Новый факт: [officialCCXT Deltaadapter](https://github.com/ccxt/ccxt/blob/d3159f7036f93db086cd0414642132fba5401710/ts/src/delta.ts#L2875) явно делит nativefunding_rate на100 перед присваиванием unifiedfundingRate. [BingXadapter](https://github.com/ccxt/ccxt/blob/d3159f7036f93db086cd0414642132fba5401710/ts/src/bingx.ts#L1856) изF586 передаёт lastFundingRate в unifiedfield безмасштабирования. Это первичная cross-adapter evidence, не вывод из размерапримеров.

Граница доказательства: прочитанныйDeltaфайл не объявляет единицу nativefunding_rate. Поэтому деление100 ещёнеполный unitcontract: нужен один primarypremise, что вход Delta задан вpercentagepoints. Consumer с fundingRate*100→percent илиfee=notional*rate в этом лимите не найден. Fractionнеповышена доPROVEN. Классификация цепочки — ADAPTER_BASED_INFERENCE с незакрытой предпосылкой; vendor guarantee не заявлена. Нельзя переносить численные ставки между биржами или подставлять−1%изUIкакдоказательство.

Следующая проверка теперь узкая: firstpartyDelta ticker schema по URLиз@see официальногоадаптера — https://docs.delta.exchange/#get-tickers-for-products — должна явно определить unitэтого exactfield. Она вF587нечиталась, текущийдопуск исчерпан. При явномpercentstatement цепочка /100→unified + BingXpassthrough завершит adapter-based unit inference. Общий аудит и новый marketprobe не нужны.

Точный nextcode scope предъявлен: FUNDING_RATE_QUOTE_SNAPSHOT, lastFundingRate raw, updateTime какCCXT-supportedquotesnapshot; payment_event_ts=null, nextFundingTimeтолькоследующееscheduledtime, receivedнеevent. Период —actualfundingIntervalHoursизтойжестроки, без8hdefault. SOURCEownedparser/qualifier/getOptionalrequested2kinds и1connectedaffectedcase описаны в F587_FUNDING_SNAPSHOT_NEXT_SCOPE_V1.json. До полногоunitpremise профиль не активируется. OIUNKNOWNпаркуется независимо; mandatorygates, AXplanner, ROOTmanual иdelivery не затронуты.

Один proposedcase проверяетexactDOODtrades+funding,2slots,quotesnapshot/actualperiod/controlledproofprofile. Он не запущен, реальнуюсемантикуunitнеподменяет. Rawprivate не экспортирован. Все spent/unknowns/reserves/9пауз/2OWNERdeferrals и старыйpause сохранены. FreezeпредшествуетownreleaseFULL.
