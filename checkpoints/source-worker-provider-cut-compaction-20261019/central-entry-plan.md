# Одна новая центральная квалификация

Source подготовил callable component **без исполнения**, без `test()` registration и без output writes:

```js
const {runProviderCaptureCompactConnected} = await import(pathToFileURL(harnessPath));
const witness = await runProviderCaptureCompactConnected({
  runtime_root: assembledFilesOrSrc,
  runner_text: exactAssembledRunnerText,
  native_original_root: pathToNatural392557OrItsReportResultDirectory
});
```

`harnessPath` — `checkpoints/source-worker-provider-cut-compaction-20261019/compact-connected.mjs` этого exact frozen пакета. `runtime_root` принимает files/ или src/. Native directory содержит либо сам report2-completion-accounting.json, либо подкаталог report2-run-result с ним. Source completion/body SHA и exact originalV1 frame сверяются перед моделью. Два synthetic продолжения загружаются только из controlled-additions.json, native-input.json их не содержит.

Применить только shared-capture-compaction.proposed.patch к beforeSHA1ca7685fa2230f5b746b13d3c22e9e50c69272d980ed7d42f1fc8724be82a3e8. Target afterSHA60528420d20824dbe905e1e16e20c323c4219395709d6dba8460a950d8b162d9. Runner не патчится этим пакетом; component проверяет только точную existing completion lineSHA в proposal-target.json, а полная новая central сборка/другой sidecar принадлежат координатору. Не затирать его uncommitted shared files.

Внутри одного нового центрального case вызвать component один раз и объединить его witness с НОВЫМ source-read normal/late-exit компонентом координатора. Старый sidecar392523/localSQLite failure case, frozen545/source14+2/37/provider/typed не запускать. Component сам вызывает pure baselineV1 только с этими NEW16actual+2CONTROLLED inputs, не импортирует старый test module. Нужные mutation controls находятся внутри этого единственного вызова.

Witness<=16384UTF8, без raw SQL/URL/body/secret и без утверждения18actualnative. Реальный source/DB/MAIN/Telegram не вызывается; никаких API/SQL admissions package не предоставляет. Если центральный case обнаружит конкретный новый failure, сохранить его raw result, исправить только затронутый новый путь и повторить только этот failed новый case. Source не заявляет PASS до фактического центрального результата.
