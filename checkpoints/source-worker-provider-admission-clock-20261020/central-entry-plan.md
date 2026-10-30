# Central entry — UNEXECUTED

После проверки и применения двух точных текстовых callsite edits в общей копии:

1. Сохранить полную baseline assembled tree; baseline/src содержит exact before CG/CP identity bytes. Остальные файлы те же, что в candidate assembled tree.
2. В единственной новой общей qualification импортировать `admission-clock-connected.mjs` из этого frozen prefix.
3. Один раз последовательно вызвать:

```js
await runProviderAdmissionClockConnected({
  runtime_root: '/absolute/candidate/assembled/src',
  baseline_runtime_root: '/absolute/baseline/assembled/src',
  repo_root: '/absolute/repository',
});
```

В central Node нужны встроенные `node:sqlite`, Web Crypto, Response/Headers; никаких пакетов/провайдерских ключей/сети. Callable временно контролирует Date.now и обязательно восстанавливает его; не запускать параллельно с другими clock-dependent компонентами. Только in-memory SQLite и контролируемый fetch. Native budget/cost/ACK/SENT не принимает.

До центрального запуска source semantic calls/runtime imports/Node/syntax/SQLite/apply checks = 0. Не повторять старые accepted suites или source cases. Если central static review найдёт ошибку подготовленного fixture, исправлять её только в central copy и сохранять frozen source original.
