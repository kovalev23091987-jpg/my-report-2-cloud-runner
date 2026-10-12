# Мой отчёт 2

Рабочая версия — свежий `main` репозитория. **Проект не завершён.** Для нового чата действуют ровно три рабочие записи: [правила](AGENTS.md), [текущий статус](checkpoints/CURRENT_PROJECT_STATUS.json) и [точка продолжения](checkpoints/OWNER_REVIEW_RESUME_POINT_20261010.json). [Три последние доказательные точки](checkpoints/ACTIVE_WORKING_WINDOW_20261012.json) перечислены отдельно.

До любых изменений проверяйте свежий main, [phase/lease](checkpoints/CLOUD_PHASE_STATE_20261004.json) и [fence](audit-fixes/source-optimization-20260930/execution-lock.json). Короткий [порядок входа](MY_REPORT_2_STARTUP_CONTRACT.md) описывает ограничения. Исторические инструкции и доказательства сохранены в `checkpoints/archive` и Git; они не являются альтернативным рабочим планом.

Текущая работа — N12 и проверка цепочки отбора 104 → 24 → 2 вместе с обоими форматами отчёта. N01–N03 и N06–N09 остаются исключёнными до явной команды владельца восстановить конкретный блок. Общие источники активных блоков сохраняются. Следующий блок начнётся после обсуждения с владельцем.

Штатный runner: `.github/workflows/report2.yml`; runtime overlay: `current-generation/apply-runtime-overlay.mjs`. Учётные данные хранятся в GitHub Actions Secrets.
