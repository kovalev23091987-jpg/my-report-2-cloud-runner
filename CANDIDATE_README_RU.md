# Telegram V2 + TZ 10.1: кандидат поверх точного checkpoint

Исходная точка: production `3cb2d9bdcb344e6034cd419824f31fd4f6ac1fd3`.

Это отдельная кандидатная ветка. Она не изменяет `main`, не выполняет deploy,
не отправляет сообщения в Telegram и не применяет миграцию к удалённой D1.
`REPORT2_TELEGRAM_SHADOW_DECISION_AUTO` остаётся выключенным.

Интеграция выборочная:

- новый Telegram V2 перенесён только в `telegram-info-runtime.mjs`,
  `telegram-output.mjs` и связанные тесты;
- критическое исправление доставки сохранено и проверяется точными SHA-256;
- TZ 10.1 применяется к расшифрованному runtime только в candidate CI через
  base-hash-guarded overlay, дважды для проверки идемпотентности;
- CI запускает Telegram regression, final-chain, TZ 10.1 persistence/readback,
  restart/idempotency и failure-injection;
- production диагностика остаётся ограниченной и read-only.

Слияние в `main`, test-recipient canary, удалённая миграция и любой live deploy
требуют отдельного решения после успешного CI. Force push запрещён.
