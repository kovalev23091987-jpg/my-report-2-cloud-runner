# Статический разбор предложения публичного BingX-исследования

ACCEPTED_WITH_LIMITS для точных файлов ROOT: план3808B/1450a4c7… и сессия11904B/ea16c352…. Блокеров/открытых замечаний в этом снимке нет. HUMAN-исключение ещё не согласовано; native grant пакет не выдаёт.

Один новый targeted static review и только точные исправления найденных мест. Два existing GitHub helpers прочитаны полностью и сверены с immutable6a5fe779 для этой цепочки. Полные финальные предложения сохранены как данные в reviewed-inputs/, точные хеши в source-pins.json. Старые a70c/cases/634/635 не проверялись повторно.

Закрыты:

- F1: обязательные два path/length/SHA стали literal внутри code_sha256; caller-файл с пустым списком исключён из пути.
- F2: previousStart ставится через performance.now непосредственно у dispatch. Интервал не отсчитывается от pre-save intent. Actual counter не растёт до intent-save, после save проверяется live().
- F3: frame с hash/часами/статусом добавляется в RAM до записи оригинала; original_body_saved false→true только после known write, finally сохраняет metadata. Ошибка останавливает сессию без retry/refund. Это не гарантия raw-файла при отказе диска.

Known CAS ACK+FULL all4 spend readback предшествуют первому source IO; каждый leaf имеет fresh pinned snapshot, max7 без повторов. Сумма retained raw-body caps2637824B. Арифметика16 явных GH invocations+10 cleanup+7 provider+24 manual=57<=164 не является native измерением или разрешением.

SOURCE Node/import/syntax/tests/appsemantics/SQL/SQLite/provider/CF/dispatch/MAIN/manual/TG=0. Executable/case/PR/remote branch не созданы. ROOT связывает реальные входы и квалифицирует новую цепочку до FIRST, затем отдельно запрашивает согласие владельца на готовое конечное исключение. Статическая приёмка не является этим согласием.
