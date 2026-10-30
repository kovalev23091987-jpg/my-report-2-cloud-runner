# F601 — Toobit funding/OI: NEXT HOLD

Дочитаны ранее непросмотренные секции официального [EN](https://api-docs.toobit.com/api/usdt-m-market-data.html) и [ZH](https://api-docs.toobit.com/zh/api/usdt-m-market-data) справочников; каталожные секции не перечитывались.

Текущий funding допускает symbol=omitted и array response: это возможная пакетная форма, но полного охвата она не доказывает. Период задан полем period;8H только пример. nextFundingTime — будущее settlement, не возраст котировки. Числовой scale и exactweight не установлены.

Funding history требует одну пару; settleTime и period дают settlement clock/период, но не закрывают scale или вес. OI тоже требует symbol; документированный размер — монеты underlying, не контракты. Схема не даёт source clock, counting convention или weight. Пакетного OI в прочитанной reference не заявлено;500 запросов не предлагаются.

696 закрытых F600 rows проверены offline: funding/period/updateTime keys не найдены. SUI row65 byte[676746,679146), SHA256 a44aacc2947f941e14f8ca320019a039178e577330e5ad4d2e664c9652a2ea94 содержит реальный contractMultiplier0.1, underlyingSUI, quote/marginUSDT и inversefalse. Это native metadata, не коэффициент для уже coin-denominated OI и не canonical cross-venue identity. Launch/open/close/catalogue clocks не заменяют original funding/OI clock.

**NEXT:HOLD.** Последняя попытка сохранена: sample не докажет отсутствующие единицы/часы/weight. Новый price feed не предлагается. Общая weighted quota остаётся общей; weight1 соседнего метода не переносится на funding/OI.

Грант1search+2reads исчерпан. Новых native API/HTTP/MCP/account/SQL/TG/Node/producttests/deploy0. Qualification23/24,remaining1; F599/F600 и исходный prefix неизменны, coverage452raw/98NOT_CHECKED не повышено. LIVE69ON/ON и все spent/physicalunknown/caps/reserves9пауз2OWNERdeferrals сохранены.
