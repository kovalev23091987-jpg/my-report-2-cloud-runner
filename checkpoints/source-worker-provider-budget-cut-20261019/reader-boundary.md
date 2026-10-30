# Точная оставшаяся граница чтения

Этот carrier сохраняет уже возвращаемые локальные observations, не создаёт независимый prepaid reader и не меняет authority. Его JSON, даже с корректными полями и head, не proof token и не новый расходуемый допуск.

Для независимого чтения project budget нужен **заранее выданный независимым владельцем**, одноразовый admission до первого SQL: exact run/provider/period/роль, bounded rows read/write/request и held accounting, зафиксированная стоимость самого reader/finalization/control, защита от повторного расхода и concurrency. Единственный атомарный read-cut должен охватить именно те ledger rows/roles и резервы, о которых делается вывод. Current point/остаток внутри nominal run,0SQL fixture, nonce/floor или старый израсходованный cold-copy резерв не заменяют такой grant. Здесь reader не реализуется и не вызывается.

Даже такой project-ledger reader не докажет provider account balance, если ledger не охватывает внешние consumers/account scope, month credits и manual-held reserve. Для CG/CP текущие monthly bounds в конфигурации и published allowances не являются measured provider-month usage. Если нормативная/провайдерская ledger authority отсутствует, соответствующее значение остаётсяNULL после любого локального read. Новую schema, provider account request или quota plan этот пакет не предлагает.

Rejected standalone budgetreader, task214/floor/nonce и старые quota планы не читались и не возобновлялись. Все unknown/потраченные резервы, лимиты и действующая reservation authority сохраняются.
