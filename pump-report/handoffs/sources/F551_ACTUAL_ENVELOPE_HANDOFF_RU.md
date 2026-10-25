# F551: фактический конверт и сохранённое покрытие цены

Новая точная ветка `body.schema=PUMP_SOURCE_FEASIBILITY_ACTUAL_V1` читает `body.raw_responses`. Прежняя ветка `body.result.raw_responses` сохранена; два конверта вместе отклоняются как неоднозначные. Исходный reader518ecd и исходный manifestce04 сохранены без перезаписи.

Один новый focused case: 1 PASS, 0 FAIL, 63.234ms. Старый принятый case не повторялся. Ровно один офлайн CLI-разбор неизменённого оригинала1186568B, SHA0170bba73bc1fd2d56796d2c448258f6192a8c8fb612ab438d4f3d017de60e07. Вывод содержит только метаданные, не цены/raw.

В bulk1015строк все550 сохранённых символов имеют валидную свежую цену на исходный момент получения1792958221604. При офлайн-проверке550уже stale; missing/ambiguous/invalid/notchecked=0. Это покрытие сохранённого списка, не проверка текущего каталога, полной идентичности или CORE550. Фактическое receive после parse до SQL, latency706ms, body364496B; compressed/network wirebytes UNKNOWN. Наружный timestamp не заменяет broker receive.

Интеграция ROOT: заменить только source reader по manifest; CLI прежний. Новый пакет самостоятельный, не переписывает исторический F551. Новых native/provider/SQL/TG/deploy нет. Lease75f038... собственный offline≤40min, release будет отдельной общей квитанцией F551/F553.
