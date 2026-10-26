# F571 — одна точная экономическая классификация

Предложение ROOT: KNOWN_NON_TARGET / FX для одной current tuple с underlying USD/KRW. Совпадение ровно1 в retained native catalogue и ровно1 по native asset ↔ official metadata coinName. Четыре поля native contractId/symbol/asset/currency совпали с сохранённой строкой; status25 ранее →1 сейчас. Official native display USDKRW-USDT и metadata display USDKRW подтверждают валютную пару доллар США/южнокорейская вона. USDT здесь — settlement, не crypto underlying.

Вход ROOT `ee9f96e2e3285938ec6e200487a7a4b8d63f06e6308594b0fc6030638c5d195f` выделяет именно CRYPTO_ASSET_IDENTITY_UNQUALIFIED1. Actual2 capture `74acbf924e7bdea1428d550db00841abd2130849d2d666c5e07e7758fccea189` не читался повторно. Primary retained native SHA `7b683509fea9d5b3aa1d2612ddb8ad259680a3bc33cc4df5cc97f23b4555e9f5`; display metadata SHA `66c3afe4e3f2d967050fdfbb34fb09741b4612780f1ba264cf504410dc0a3cf9`.

Применён принятый ROOT F552 метод явной ограниченной primary-carrier inference только к exact hash-pinned tuple. Ни raw coinType5, ни NCFX-префикс, ни язык, ни status не используются как универсальный crypto/noncrypto classifier. CoinId не приравнивается к native contractId. Старые два FX type0 counterexamples сохраняются.

Точная tuple с native ID, asset, symbol, family USDT_M, currency USDT, status1 и evidenceSHA — только в private:
- `/private/tmp/pump-f571-economic-proposal1-private.json`, SHA `44a31f6f9c6ad0a4509cb3ed18a044fff70a828d17d8ad21469a59f133b2acc5`,0600;
- `/private/tmp/pump-f571-negative1-bundle-private.json`, SHA `a16ad631070c5d0d9cccba2dd3b75b2354d4885d35f0e7bac8269c14e128e00e`,0600;
- joined identity proof `/private/tmp/pump-f571-root-exact-metadata-private.json`, SHA `ed1230453ba6d42b5d54d3c1c0853cc3fb3bca691fe788dd51092653cc952ab4`,0600.

Одна новая affected proposal-consistency проверка PASS на фактическом retained exact1 join: tuple, old/current status, FX carrier и отсутствие активации. Formal runtime tests0/old tests0. В новом matcher начальная ошибка пути исправлена до чтения private входа/metadata; завершённый metadata join был один. Старый failed narrow extractor F571 и его4 frozen files/manifest `4738f97ff9f3c6b126d3cc1cfb274a0200469a5cbc042534982d93525f57ba1f` остаются неизменными и FAILED.

ROOT сам принимает предложение и добавляет одну negative row. SOURCE не меняет registry, runtime, policy, server65pin e75ec, product cron или delivery. Whole N/coverage не пересчитывались; подтверждённые550 не блокируются;9 packaged units остаются UNKNOWN/deferred. Новых crypto/unit/cross-venue proofs0. Старые550 prices/CORE и53 classifications не повторялись. Provider/metadata/docs/RPC/SQL/TG/deploy0, capture rereads0.

Initial main `628581107ce990520c036160ac7199d6053e9da8`, fresh finish main `ff062f2114e5223b84d38b024a6cbd4e594bd214`. Own CAS initial `9ee3fb846fe5c92171b230a73a17729c9a675a60`, refreshed compatible `9cddac2460a5b13aee0ca7966f2e19ff0d548b01` с прежним expiry и FULL file/ref readback; all4/window3/fence/generation совместимы. SOURCE HEAD `4b44d48836b9c26b1c9c8bb0830055ee279a608a`. ТЗv2/unified прежние. Все spent/unknowns/reserves/9пауз/2OWNERdeferrals сохранены; старый report на паузе. Дополнительные startup manual не выполняются.

После freeze — отдельный план новых primary BingX UI/official-code материалов по9 packaged denominations. Этот пакет не даёт допуска docs/native IO.
