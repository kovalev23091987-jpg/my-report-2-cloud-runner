# F581 — статическая приёмка нового AUTO candidate reader

Вердикт: один P2, требуется правка ROOT. Четыре заданных SHA совпали и повторно проверены без изменений.

В saved-auto-candidate-observation.mjs:23–27 равенство instrument не требует непустого instrument_id. Если у обоих instrument одинаковое {base:'1INCH'} без ID, остальные условия могут пройти; reader объявит saved_original_bound=true и вернёт instrument_id:null. Это статический контрпример, не выполненный тест. Минимальная правка — валидировать обязательную identity до равенства; ROOT может добавить один focused ARTIFICIAL negative на одинаковые неполные instrument.

Новая цепочка analysis hash → один original PK → pin/OBSERVED → AUTO/PRODUCTION/run/time видна. Опциональный PK вызывается только при read_latest_auto_candidate:true и остаётся внутри прежнего16queries/500R30W. Часы копируются без обновления; USABLE не доказывает свежесть сейчас, стратегию, READY или SENT.

SOURCE не импортировал код, не запускал тесты/--describe/observer, web, native/provider/SQL/TG/Worker. ROOT-reported PASS не воспроизводился. Проверки старого SOURCE/AR/outcome не повторялись; рабочие файлы не правились. Подробности и ограничения — F581_STATIC_AUTO_CANDIDATE_REVIEW_V1.json.

После заморозки — только own CAS release/FULL. Следующий SOURCE-вход — настоящий AUTO input от ROOT, с отдельным фактическим допуском. Сохранённые versions/oldspent/unknown/reserves/9пауз/2deferrals не изменены.
