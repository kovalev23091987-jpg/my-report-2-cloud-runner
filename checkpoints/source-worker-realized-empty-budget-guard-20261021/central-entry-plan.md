# Один будущий компонент для empty-result guard

Исполнитель — координатор в собственной общей копии под отдельным точным scope. Автор не запускает этот файл, модуль, SQLite или старые16групп. Приватные before/after модуль и patch остаются внутри приватного assembled runtime, не в Git и не в общем artifact.

1. Собрать актуальный полный runtime после принятого599. Проверить actual baseline из615файлов и target6995B/a56. Скопировать всё дерево в отдельный временный baseline вне каталога результатов. Оба аргумента callable должны указывать на `src` этих разных полных деревьев. Parent runner и четыре принятых dependency pins перечислены в `target-bindings.json`.
2. В candidate применить только приведённый ниже текстовый рецепт. Он читает уже собранный приватный target, сверяет целый before и два уникальных hash-якоря, добавляет новую вставку, заменяет единственное повторное вычисление дельты на локальную переменную. Исходные приватные строки не печатаются. Никаких decrypt/read4/download для этого шага не нужно.
3. Сохранить только sanitized before/after hashes и размеры. Полные приватные bytes не добавлять к scope, source prefix, Git diff или artifact. Новую production интеграцию в существующий assembler координатор рассматривает отдельно в точном scope; этот source-пакет её не включает.
4. До application imports callable сверит manifest, все615файлов обоих деревьев,614неизменённых файлов, before a56, единственный ожидаемый after и текущие публичные dependency pins.
5. В одном новом wrapper вызвать только `runRealizedEmptyBudgetGuardConnected`. Сначала записать весь возвращённый JSON, затем проверять `status`,10контролей, исходные SQL/bindings, costs/NULL и ограничения. Не импортировать kernel599 connected, старые tests, настоящий sender или MAIN. Если callable бросит ошибку, сохранить `completed_new_CONTROLLED_groups` и `completed_new_CONTROLLED_controls` без приватного source text.

Рецепт ниже исполняется только координатором над собственной приватной assembled-копией. Первый аргумент — candidate runtime parent, второй — полный repo root. Он не является новым production reader/helper или точкой автоматического запуска.

```python
from pathlib import Path
import hashlib, json, re, sys
runtime, repo = map(Path, sys.argv[1:3])
package = repo / 'checkpoints/source-worker-realized-empty-budget-guard-20261021'
binding = json.loads((package / 'target-bindings.json').read_text())
addition = (package / 'empty-budget-addition.js.txt').read_text()
sha = lambda value: hashlib.sha256(value).hexdigest()
assert len(addition.encode()) == binding['recipe']['addition_bytes']
assert sha(addition.encode()) == binding['recipe']['addition_sha256']
target = runtime / binding['target']['runtime_relative']
before = target.read_bytes()
assert len(before) == binding['target']['before_bytes']
assert sha(before) == binding['target']['before_sha256']
source = before.decode('utf-8')
assert not re.search(r'\bemptyUsage\b', source)
lines = source.split('\n')
locate = lambda digest: [i for i, line in enumerate(lines) if sha(line.encode()) == digest]
empty = locate(binding['anchors']['empty_return_line_sha256'])
guard = locate(binding['anchors']['existing_budget_guard_line_sha256'])
assert len(empty) == len(guard) == 1 and empty[0] < guard[0]
predicate = re.search(r'if\((.+)\)return ', lines[guard[0]]).group(1)
start = addition.index('if (')
end = addition.index(') {', start)
assert re.sub(r'\s', '', addition[start + 4:end]) == re.sub(r'\s', '', predicate).replace('delta', 'emptyUsage')
old = lines[empty[0]]
assert old.count(';return ') == old.count('usageDelta(before,after)') == 1
cut = old.index(';return ') + 1
suffix = old[cut:].replace('usageDelta(before,after)', 'emptyUsage')
lines[empty[0]] = old[:cut] + '\n' + addition.rstrip() + '\n' + suffix
assert sha(lines[empty[0]].encode()) == binding['anchors']['after_empty_block_sha256']
after = '\n'.join(lines).encode()
assert len(after) == binding['target']['expected_after_bytes']
target.write_bytes(after)
print(json.dumps({'before_bytes': len(before), 'before_sha256': sha(before), 'after_bytes': len(after), 'after_sha256': sha(after), 'private_source_exported': False}))
```

После записи component JSON wrapper должен утверждать:

```text
status == NEW_CONTROLLED_EMPTY_GUARD_COMPONENT_COMPLETED
control_count == 10
full_baseline_files == full_candidate_files == 615
non_target_files_equal == 614
original_SQL_and_bindings_preserved == true
NULL_snapshot_compatibility_preserved == true
fixture_cleanup_removed == true
old_components_replayed == 0
native_current3330_cost_reduction_qualified == false
native_admission_or_SENDING_qualified == false
provider_HTTP == native_SQL == MAIN == Telegram == 0
```

`real_LocalSQLite_executed` станет true только при фактическом центральном выполнении. Все счётчики в10профиляхCONTROLLED. Они не являются измерением native стоимости, новым резервом, reset/refund или разрешением повторить полный отчёт.
