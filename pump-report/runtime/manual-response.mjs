// Human response for command/identity/queue states. Analytical descriptions
// come from the same engine; this layer never creates a trading signal.
export function manualResponseText(result){
  if(!result)return 'Результат этой проверки пока не найден.';
  const r=result.manual_result??result,a=r.analysis;
  if(a){
    const text=a.card_text??a.manual_text??'Готовая идея пока не подтверждена: пригодных данных или обоснования плана недостаточно.';
    const d=r.delivery;
    if(d?.state==='SENT'&&d.receipt_readback===true&&d.message_id)return text+'\nДоставлено в Telegram: сообщение №'+d.message_id+'.';
    if(d?.state==='UNKNOWN')return text+'\nПодтверждение доставки не получено. Повторная отправка автоматически не выполняется.';
    if(d?.state==='STALE')return text+'\nКарточка не отправлена: данные или план устарели перед отправкой.';
    if(d?.state==='ERROR')return text+'\nДоставку этой карточки завершить не удалось.';
    return text;
  }
  switch(r.status){
    case 'CONTEXT_SYMBOL_REQUIRED':return 'Укажите тикер монеты, которую нужно проверить.';
    case 'INVALID_MANUAL_REQUEST':return 'Укажите тикер или напишите, например: «Проверь SOL на памп».';
    case 'OWNER_ASSET_DELIVERY_EXCLUDED':return r.symbol+' исключён из Памп-отчёта по вашему указанию.';
    case 'AMBIGUOUS_SYMBOL':return 'Уточните нужный актив: '+(r.candidates??[]).join(', ')+'.';
    case 'INSTRUMENT_NOT_QUALIFIED':return 'Для '+r.symbol+' пока не подтверждён подходящий криптовалютный контракт BingX с маржой USDT. Готовый план не сформирован.';
    case 'QUEUED':return 'Проверка поставлена в очередь; результат можно получить по её идентификатору.';
    case 'REQUEST_ID_CONFLICT':return 'Этот запрос уже относится к другой проверке. Запустите новую проверку.';
    case 'DEFERRED':return 'Проверка отложена: свободного лимита пока недостаточно для полной проверки. Готовая идея не подтверждена.';
    case 'DEFERRED_SOURCE_EVIDENCE':return 'Для этого контракта ещё не подтверждены обязательные данные источника. Полная проверка отложена, готовая идея не сформирована.';
    case 'ERROR':return /BUDGET|RESERVE|QUOTA|EXHAUSTED/.test(r.reason??'')?'Проверка отложена: защищённые резервы не позволяют продолжить. Готовая идея не подтверждена.':'Проверку не удалось завершить. Готовая идея не подтверждена.';
    default:return 'Проверка ещё не дала готового результата.';
  }
}
