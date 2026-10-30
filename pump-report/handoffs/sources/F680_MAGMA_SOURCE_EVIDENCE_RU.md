# F680 — фактический вклад источников MAGMA

Проекция ROOT SHA256 `8e93c54df729f8c29db8f350458be5180e5247d4f22302f4878ba60ddc15b6fc` сверена с установленными source/normalizer/consumer. Raw original/свечи/recipient/private16 не читались; Node/native/market/CF/TG0.

| Блок | Получено / пригодно / использовано | Фактический вклад и ограничение |
|---|---|---|
|1 движение/объём|да/да/да|305закрытыхсвечей+1440pricehistory; day28.904062%, исторический relativeimpulse2.16179×. BASE/USDобъём не доказан; это не текущаяпокупательнаясила|
|2 сделки|1000/14/частично|986отсечены30srowTTL; retained26.004s, покупки95.33/продажи84.80USDT, net10.53, price−0.1849%. Не весьрынок/непоглощение|
|3 ликвидность|да/да/да|СвежийCOINbook и buy/sell700–3000USDT simulation. Snapshot, безгарантиибудущегоисполнения/fees/precision|
|4 OI|нет/нет/нет|ExplicitNOT_REQUESTED,0HTTP. ТекущейOIunitqualificationдляMAGMAнет; COINbookproofнеOIproof|
|4 funding|да/нет/нет|NativeupdateTime04UTC, received07:03UTC; age10981.489s,TTL300s,STALE. Период4hнеобновляетclock|
|6 LIQ|нет/нет/нет|routes[],NO_VERIFIED_ROUTE,0HTTP. SavedHL_SOLHOLDнеMAGMA и неfullmarketmodel|

Block5удалёнвладельцем;7условныйdisabled. Обязательные1/3 и самостоятельныйplan≥10 остаютсяотдельны;optionalmapruleнеотменено. Отсутствиеoptionalневыдаётсязаегоуспешнуюработу.

Сохранённыйprimary CCXT d3159f7 (SHA94bcede8…;parse1827–1867) лишьпереноситupdateTime→unifiedtimestamp; fundingTimestampundefined,nextFundingTimestampотдельно. Он не доказываетvendorbusinessmeaningилисвежестьupdateTime. Не называюегоlastpaymentилиmetadataбезproof. НельзялечитьreceivedTime/nexttime/TTL=period. Ужеизвестныйhistorypath1870–1945 имеетfundingTimeдляисторическойставки; это не доказанныйlivequote и неготовыйновыйMAGMAproducer. Средиактивныхsavedпутей доказанногосвежегоcurrentclockнет.

RegistryMAGMA102176 получаетcandles, orderbookoverlay иfundingprofile; OIproofнет. ЗаменаfundingслотанаOIпоканеобоснованна: приrequestOI gateоткажетбезHTTP. Upper2/капытребуютсохранения.

ПоQ: проекцияне содержитQcode/headers/receipt/backoffrow; причинувvendor/IP/account/concurrency/предыдущихвызовахневыдумываю. СтатическиHTTP200+code100410=>RATE_LIMIT, попыткаоплачена, неSUCCESScache; RetryAfterприменяетсяилиприотсутствииfallback60s. Однаусловнаяcodehardeningproposal:0/invalidRetryAfterсейчасобходитfallbackчерез??; еслиROOTподтвердитfloor60s, нормализоватьRATE_LIMITbackoffбезсменыcaps/retry/strategy. Это непровереннаяпричинаQ и неготовыйpatch. ОдинaffectedmockcaseописанвJSON,UNEXECUTED.

Run19HTTPвключаетдругиемонеты/доставку, неMAGMA19. Perblockcold/cachecostнепередан; невыдуман. ЯвноOI0/LIQ0; savedaudit13SQL33R4Wотдельноотисточников, ownUTC30control2runs18SQL38R8Wнеwholeaccount. Всеunknowns/caps/reserves/manual3/9пауз/2deferrals и прежниенарушениясроковсохранены. Точныйevidence/пointers/usedvsnotaskedvsstale/минимальныенезапущенныевекторы — F680_MAGMA_SOURCE_EVIDENCE_V1.json. Продукт/гейты/лимитынеменялись.
