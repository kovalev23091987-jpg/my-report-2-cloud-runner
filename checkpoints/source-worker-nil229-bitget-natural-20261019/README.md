# NIL/BR: фактическое использование источников в сохранённом запуске

Только новый natural39216464096, native head `a4b41da462b43956dc40d6873b8e2769db96d7a6`, business run `1792395072923-1792395084308`. Два ZIP и исходные GitHub metadata скопированы из уже сохранённых координатором оригиналов. `analysis.json` воспроизводится `audit.py --write`; `verification.json` содержит одну общую новую проверку этого пакета. Исходные данные не запрашивались заново. Production не менялся.

## NIL: подтверждённый путь до потребителей

Снимок `S392:NIL-USDT:1792395207582`: LONG / OBSERVE, интерес91; overall и readiness остаются NULL, вероятность не вычислена. Ролевой допуск CLOSED относится к Gate и HTX (5 пригодных из11 записей). Bitget полезен в перечисленных ниже контекстах; это не расширение списка допущенных ролевых первоисточников.

| Блок | Что действительно сохранилось | Граница вывода |
| --- | --- | --- |
| N05 | Bitget SPOT4h: покупки22856,32 / продажи15291,42 USDT, конец1792395120000, observed1792395181364; факт напечатан | USE_NOT_PROVEN для decision, вклад0. Исходный HTX4h CLOSED заканчивается1792395060000, на60с раньше; окна не складывать |
| N10 | Четыре нейтральных факта, включая фактическую строку Bitget15m:5 активных минут,0,07845→0,07863 USDT, конец1792395120000; тот же конец у HTX15m | Строка и consumer доказаны данным запуском. Полные240 исходных свечей, cache read/write ACK и исходный HTTP body в компактном оригинале отсутствуют; повторную независимую квалификацию не изображаем |
| N12 | Два валидных нейтральных факта; одна печатная строка с тремя evidence IDs: HTX bounded trades, N05 Bitget4h и Bitget8 недавних сделок (продажи1775,07 USDT) | Три ID не становятся тремя N12 фактами; два рынка HTX остаются одной биржей. Последние сделки и4h имеют разные окна |
| N15 | CoinGecko и CoinPaprika, два факта и фактический вклад+0,0116 | Нулевой технический вклад отдельных manual receipts не стирает реальный consumer effect; это не доходность/вероятность |
| LIQ | Один сохранённый Hyperliquid native liquidation level0,0630513716 USDC, notional1014198,2706 USDC, один публичный account sample | `exact_notional_usdt:null`, target eligible false, targets[]. Legacy alias `notional_usdt` не доказывает конвертацию вUSDT; исходный публичный body/полный universe аккаунтов отсутствуют |

Текущий маршрут поставил Bitget перед Backpack. Атрибуция сохраняет5 общих N05/N12 HTTP (5+0, не10); два N12 пропуска `CALLER_FIVE_REQUEST_CAP` с0HTTP — внутреннее ограничение, а не отказ поставщика. Приоритет и описательная предыдущая полезность не являются новым admission или весом стратегии.

## Часы составного N12 текста

Внешний `observed_ts` строки1792395162394 относится к базовой HTX записи. Дополнения Bitget известны с1792395181364, на18970мс позже. Все три компонента известны до времени кандидата1792395207582. Отсюда нельзя датировать весь составной текст внешними часами HTX; нарушения runtime gate по будущим данным этим также не доказано. Все исходные часы сохранены отдельно. Конкретное предложение координатору — `composite-clock-proposal.json`; shared runtime и форму отчёта этот пакет не меняет.

## BR: новый результат без базовой оценки

Снимок `S392:BR-USDT:1792395140670`: REJECTED, directionNULL, интерес/overall/readinessNULL, `BASE_SCORE_MISSING`. N12 сохранил58 HTX futures trades и текст, но `score_contribution:null`, `UNSCORED_DIAGNOSTIC_AND_RENDERING_PROVEN`, `NO_BASE_SCORE_NO_APPLICATION`, applied receipts0. Ноль в hypothetical impact diagnostic не является применённым баллом. Старый вклад BR из391675 сюда не переносится. N05 содержит ограниченный HTX4h, N10 — два нейтральных факта; их итоговый вклад такжеNULL. LIQ NOT_CLOSED означает отсутствие пригодного уровня, а не измеренный ноль.

## Доставка и ограничения

Сохранённый NIL текст имеет `APPROVED_PAYLOAD_TEXT_OBSERVED`; detailed Telegram receipts пусты, delivery_provenfalse/message_idNULL. Координатор отдельно принял корневой same-run SENT229: это не per-block ACK. Его приёмка бюджета575SQL/102logicalslots, hourly statistics и32 normalized flags здесь не повторялась. Никакие provider balances, current105 coverage, cache ACK, ENTRY или устойчивость нового пути не заявлены. N04/N11/shared integration остаются у координатора.

## Воспроизведение

Из корня рабочей копии: `PYTHONDONTWRITEBYTECODE=1 python3 checkpoints/source-worker-nil229-bitget-natural-20261019/verify-package.py`. Проверка читает ZIP и неизменяемый native Git tree, не исполняет runtime/старые normalizers/test suites. Не повторять её после принятия без нового изменения или дефекта. Хеши всех файлов, кроме самого манифеста, перечислены в `manifest.json`.
