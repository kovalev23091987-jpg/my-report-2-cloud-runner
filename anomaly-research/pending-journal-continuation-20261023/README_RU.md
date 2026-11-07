# Сохранение предложения курсора независимого обхода

Worker пишет результат runIndependentCapturedAnomalyIngress в env.REPORT2_ANOMALY_INDEPENDENT_CAPTURE_RECEIPT. Runner этот результат не читает. Существующий файл квитанций содержит parent receipts и checkpoint журнала, но не содержит выбранный контракт, исходный и предложенный курсоры. При тихом окне parent COMMIT не вызывается. После завершения процесса предложение курсора и причина результата остаются без сохранённого выхода. Точные исходные участки и SHA — source-evidence.json.

Названный ROOT разрыв pending journal уже закрыт в разрешённом локальном объёме PR627: prepared/intent сохраняются до WRITE, известный ответ — перед возвратом kernel, повторное открытие удерживает opid/revision, незавершённое состояние останавливает SQL. Принятые12groups/32варианта и пять phase-boundary reopen используются как прежнее доказательство. Автор их не запускал повторно. Реальный process kill, power loss и перенос private файла между GitHub jobs остаются неквалифицированными.

Предлагается правка одного существующего current-generation/files/runner-main.mjs. В persistRunnerAnomalyReceipts добавлен необязательный independent_capture. В том же finalizer после worker.scheduled передаётся фактическое значение env, в том числе при последующей ошибке Worker. Других общих файлов, импортов, SQL, схем, backend, scheduler, callback или env-переключателей нет. Код сохранён только как TEXT-предложение в этом каталоге.

Выделяется ограниченная проекция: статус, точные before/next cursor, контракт/индекс, фактические счётчики source/IO callbacks, parent status/uncertainty и hash/размер исходного результата в памяти. Она находится в прежнем envelope head/cloud_run_id. Полные provider payload, private prepared и SQL replies в неё не добавлены. source_HTTP_attempts относится к выполненным попыткам ingress; прежний envelope provider_HTTP:0 описывает дополнительные обращения самого writer, что явно помечено в проекции. Wrapper не перепроверяет принадлежность контракта реестру: roster_membership_reverified=false. Для принятия курсора ROOT обязан отдельно сверить текущий approved roster и настоящие источники/расходы.

Входной результат ограничен4096B, проекция2048B. Канонические курсоры имеют прежние три ключа, одинаковый roster hash и прежний либо ровно следующий индекс. Неопределённый parent не может экспортировать продвигающийся курсор. Некорректная форма даёт маленький CAPTURE_PROPOSAL_NOT_CLOSED; parent receipts и pending checkpoint сохраняются.

Предел файла20480B и предел parent snapshot16384B не повышены. Если проекция не помещается, сохраняются parent receipts, проекция опускается, finalizer сообщает ANOMALY_CAPTURE_PROJECTION_NOT_SAVED_PARENT_RETAINED. При запрошенной проекции успешный return требует точного локального чтения переименованного файла. Это локальное наблюдение: fsync, power loss, конкурентные писатели, native ACK и cross-job custody этой правкой не квалифицируются. Неизвестные исходы и расходы не очищаются.

Входной cursor не меняется. cursor_adopted/durable advance/continuous105/full sweep/native ACK/first knowledge/SENT остаютсяfalse. Переход104→0 также не доказывает завершённый обход. Конкретный контракт доверенного носителя и порядок hold/advance — cursor-carrier-contract.json. Выбор носителя и actual admission остаются у ROOT.

## Один новый будущий case

runCaptureProposalFinalizerCase({repo_root}) в capture-finalizer-case.proposed.mjs подготовлен UNEXECUTED. Один новый group, три варианта проверяют только новый выход: quiet capture с ошибкой Worker позже; неизвестный parent с прежним курсором; отказ продвигающегося cursor при неизвестном parent. Case проверяет полные applied runner/dependencies, затем берёт точные existing persist/finalizer bodies. Worker/capability — CONTROLLED, файловая система — настоящая временная локальная папка. Полный main, detector, acquisition, pending journal и прежние cases не вызываются; private618 assembly не нужна.

Автор не запускал Node/import/syntax/tests/SQL/provider/Cloudflare/Actions/MAIN/Telegram и не применял shared runtime. Проверены тексты, JSON, SHA и арифметика. PASS пока нет. Если ROOT меняет конечный target перед общим FIRST, bindings нужно вывести из этих конечных байтов, сохранив frozen оригиналы. Новые ветви artifact overflow/readback failure здесь не исполнены; контролируемые сценарии не доказывают native admission или хранение между jobs.

## Частота и расходы

При cron7/27/47 и одном контракте за запуск минимальный идеальный обход105 занимает35часов. Каждый визит рассматривает только последнее15m окно; теоретическая доля времени на актив —15/2100, около0,714%. Это не измеренная полнота/recall. Отказы, удержанный cursor и недошедший до hook MAIN увеличивают пропуски.

Две HTTP на slice дают144 sourceHTTP/day в условном72-run сценарии. Посещать каждый из105 активов раз в15min тем же способом потребовало бы20160 sourceHTTP/day до event SQL и прочих блоков. Этот режим не включён и бюджета не получил. Все caps/reserves/unknown прежние. capacity-and-cadence.json отделяет расчёт от свободной ёмкости общего аккаунта.
