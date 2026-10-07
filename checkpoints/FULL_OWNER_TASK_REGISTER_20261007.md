# Все восстановленные задачи владельца — 07.10.2026

Сохранены исходные R001–R086, отдельная работа по15core+ликвидациям и24уточнениям владельца. Успешная отправка AKE152 подтверждает доставку/новую форму, а не закрывает все задачи настройки блоков. Старые completed/partial receipts сохраняются в исходном scope.

Цель нового указания: иногда12/13/15 реально участвующих блоков по отдельным монетам. N13/N17 не возвращаются; порог, веса, правила входа, caps и рабочийTelegram не ослабляются.

| Блок | Что нужно продолжить |
|---|---|
| N01 Разблокировки и предложение будущих выпусков | Проверить будущие структурированные vesting/unlock schedules и общие exact identity routes. Genesis/новость не будущая разблокировка. Sablier keyless production и Llama free пока не доказаны; не повторять тот же403 без нового основания. |
| N02 Предложение и выпуск монет | Расширить finalized primary supply на native chains, где сейчас только исторический CoinMetrics. Первая новая проверка: XRPL и Stellar по официальным ledger API, без wrapped замены и receipt-clock. |
| N03 Уменьшение предложения, сжигание/выкуп только при доказанной причине | Использовать пригодные связанные finalized наблюдения N02/N03, искать доказанный burn/mint/выкуп. Net supply change не доказывает покупку/выкуп; причинность не придумывать. |
| N04 Переводы и точная атрибуция адресов | Увеличить точную finalized transfer coverage/labels там, где это действительно доступно. Bridge/liquidity/internal transfer не buy; индекс до primary finality лишь provisional. |
| N05 Потоки: полный4h HTX либо проверенный разрешённый источник | Проверить полный240минHTX и потребление сохранённых signed fills; не отменять условие. New exchange-labelled sources только с проверенным доступом/label semantics. Nansen отложен0; exact24h отложен отдельно. |
| N06 Социальная активность и внимание | Разобрать bounded Bluesky warming/saturation и расширение Wikimedia только при точной официальной странице. Pageviews не unique traders/sentiment/direction. Нет synthetic baseline. |
| N07 Официальные события проекта | Подключить общий issuer-proven GitHub release consumer после свежего cloud proof, фильтровать draft/testnet/RC. Ни одного направления/score по ключевым словам; действующий формат Telegram не менять. |
| N08 Листинг/делистинг и ограничения исполнения | Проверить точное применение реальных ограничений и adverse controls по HTX family; дополнительные official HTX price-limit/insurance facts только если закрывают полезный пробел, без независимого голоса того жеHTX. |
| N09 Маржа и риск-лимиты HTX | Проверить применение текущих HTX ladder/isolation/cross restrictions, а не только transport200/поле assigned. Иные биржи не HTX eligibility. |
| N10 Технический путь, триггер, цель и отмена | Проверить фактические path/target/invalidation inputs и отказ с exact reason. Нет искусственной цели ради ENTRY. Новый venue structure только с useful proof и известными admission rules. |
| N11 Устойчивость ликвидности и стресс книги | Проверить depth/slippage/cost consumer на exact HTX size и unit; дополнительные venue books не замена execution book и не независимые directional votes. |
| N12 Реальные сделки и bounded flow | Сохранить реальные bounded trade sample, различать actual rendering/neutral/nonzero receipts. Не выдавать sample за24h; расширение истории только фактическими fills в лимитах. |
| N14 Опционный риск поддерживаемых контрактов | Уточнить реальную Deribit/Delta capability union и пригодность инструментов, units/source clocks/liquidity. Другие coins не получают IV по BTC/ETH и unsupported не ноль риска. |
| N15 Сектор, сопоставимые монеты и относительная сила | Проверить native/contract sector routes и usable peer consumers, daily caps/shared cache, независимые provider cohorts. Подключить новую metadata/peer source только по точной native/chain identity и measured incremental coverage. |
| N16 Стоимость и исполнимость | Сохранить утверждённую conservative fee/holding policy и HTX-specific book/costs, unknown future funding не0. Новая чужая fee API не персональная HTX fee. |
| LIQ Будущие ликвидационные уровни | Расширить проверяемые future price routes по поддерживаемым активам; существующие8 route outcomes, weekly coverage/identity/state clock/input/method, upstream dedup. Расчётные и фактические явно подписывать, карта необязательна; не ломать новые Telegram формы. |

Полные86строк исходногоТЗ и все owner tasks находятся в JSON рядом. Первая облачная партия исследует official GitHub releases и finalized native XRPL/Stellar supply. Исследование/HTTP200 не новаяинтеграция: нужно пройти identity→sourceclock→method→fact→consumer→report и regression действующейTelegramцепочки.

Не объявлять работу законченной по одному числу блоков. Не ждатьhistory/произвольного рыночного события между исправлениями. Отдельные внешние/эмпирические ограничения остаются явными; не подменять их нулём или фиктивными данными.
