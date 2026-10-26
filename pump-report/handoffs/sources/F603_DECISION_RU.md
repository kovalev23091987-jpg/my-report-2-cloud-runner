# F603 — CoinGecko Demo: новый глобальный ID путь, identity-only приоритет

Bitget исключён как дубликат сохранённых каталогов. Новый primary путь — [Demo derivatives exchange batch](https://docs.coingecko.com/demo/reference/derivatives-exchanges-id): provider ticker связан с coin_id/target_coin_id, OI обозначен в USD. Это содержательный прогресс относительно сырых имён.

Четыре связи:
- Identity: provider-level глобальные ID доказаны схемой. Точный CoinGecko derivative exchangeID для BingX в сохранённых материалах не найден; похожий BINGX_FUTURES_LINK — внутренний label F597, не vendor ID.
- Units: OI-USD определён; funding scale/period не заданы.
- Sourceclock: last_traded — время сделки, не OI/funding asof.
- Entitlement/quota: Demo reference доступен free plan с Demo key;[план](https://www.coingecko.com/en/api/pricing) —100calls/min и10kcredits/month. Наше текущее derivative entitlement/remaining неизвестно. [Ошибки](https://docs.coingecko.com/docs/errors-and-rate-limits) учитываются в minute cap.

Identity-only batch может быть полезен без часов дополнительных метрик. После официального доказательства exchangeID=BingX явная vendor row binding exactpair/family → coin_id заслуживает отдельной квалификации. Matching symbol сам по себе не канонический мост. Сейчас id не угадан, actualrows нет, coverage550 не повышено.

**NEXT: отдельный предметный DOCS пакет для точного BingX derivative exchangeID/vendor binding.** Текущие2search+4reads исчерпаны; самостоятельно грант не расширял. Native/data вызова не предлагаю. OI/funding остаются HOLD, но их часы не блокируют identity-only доказательство.

Сохранённый CoinGecko401 и более поздние200/FreeDemo UNI receipts учтены как история, не новый доступ. ROOT дал только static inventory обычного search/getmarkets и secondary search_docs/executeSDK. Ничего из этого не вызвано; wrappers не отдельные квоты и не обход платности.

Qualification23/24remain1, CONTROL6spent безпроб, LOOKUP13spentROOT/14неразрешён. API/MCP/account/newkeys/SQL/TG/Node/tests/deploy0. LIVE70AUTO1/DL1 не затронут; oldphysicalunknown/caps/reserves9пауз2OWNERdeferrals сохранены.
