export const REASON_REGISTRY_VERSION='reason-registry-v1-20260925';

const DEFINITIONS=Object.freeze({
  FEE_RECEIPT_MISSING:{full_ru:'Нет подтверждённых данных о фактической комиссии ХТХ.',short_ru:'нет подтверждённой комиссии ХТХ'},
  FUTURE_FUNDING_OR_HOLDING_UNKNOWN:{full_ru:'Не закрыты расходы на удержание позиции до планового выхода, включая будущие выплаты финансирования.',short_ru:'не закрыты расходы до планового выхода'},
  EXECUTION_COST_BASIS_MISSING:{full_ru:'Не закрыта фактическая база расходов исполнения сделки.',short_ru:'не закрыты расходы исполнения'},
  SOURCE_TOOL_UNAVAILABLE:{full_ru:'Один из требуемых источников не был доступен в этом запуске.',short_ru:'источник недоступен в этом запуске'},
  SOURCE_EXHAUSTED:{full_ru:'Все применимые источники проверены, но требуемый факт не удалось закрыть.',short_ru:'требуемый факт не подтверждён источниками'},
  BUDGET_EXHAUSTED:{full_ru:'Лимит бесплатных запросов или вычислительный бюджет исчерпан; проверка не завершена.',short_ru:'проверка не завершена из-за лимита'},
  CROSS_VENUE_DIVERGENCE:{full_ru:'Данные разных площадок существенно расходятся и не усреднялись.',short_ru:'данные площадок расходятся'},
  SUPPORTING_RISK_GAP:{full_ru:'Блок дополнительных рисков не закрыт подтверждёнными данными.',short_ru:'не закрыт блок дополнительных рисков'},
  SMART_MONEY_GAP:{full_ru:'Данные по крупным участникам не закрыты подтверждёнными фактами.',short_ru:'не закрыты данные по крупным участникам'},
  ENTRY_AREA_GAP:{full_ru:'Подтверждённая область входа не закрыта.',short_ru:'не подтверждена область входа'},
  TRIGGER_GAP:{full_ru:'Условие входа ещё не подтверждено.',short_ru:'условие входа ещё не выполнено'},
  UNKNOWN_INTERNAL_REASON:{full_ru:'Есть дополнительная внутренняя причина, для которой ещё нет утверждённого пользовательского объяснения; вывод оставлен в безопасном режиме.',short_ru:'есть непереведённая внутренняя причина; вывод не готов'},
});

const UPSTREAM=Object.freeze([
 ['FACTUAL_FEE_SCHEDULE_NOT_CLOSED','FEE_RECEIPT_MISSING'],
 ['FUNDING_HOLDING_COST_NOT_PROVEN','FUTURE_FUNDING_OR_HOLDING_UNKNOWN'],
 ['EXECUTION_COST_BASIS_NOT_CLOSED','EXECUTION_COST_BASIS_MISSING'],
 ['SOURCE_TOOL_UNAVAILABLE_THIS_RUN','SOURCE_TOOL_UNAVAILABLE'],
 ['SOURCE_EXHAUSTED','SOURCE_EXHAUSTED'],
 ['BUDGET_EXHAUSTED','BUDGET_EXHAUSTED'],
 ['UNRESOLVED_CROSS_VENUE_CONFLICT','CROSS_VENUE_DIVERGENCE'],
 ['CROSS_VENUE_DIVERGENCE','CROSS_VENUE_DIVERGENCE'],
 ['SUPPORTING_RISK_NOT_CLOSED','SUPPORTING_RISK_GAP'],
 ['SMART_MONEY_NOT_CLOSED','SMART_MONEY_GAP'],
 ['ENTRY_AREA_NOT_CLOSED','ENTRY_AREA_GAP'],
 ['TRIGGER_NOT_CLOSED','TRIGGER_GAP'],
]);

export const BLOCKER_CODES=Object.freeze(Object.keys(DEFINITIONS));
const clean=v=>String(v??'').trim();

export function reasonDefinition(code){return DEFINITIONS[code]||DEFINITIONS.UNKNOWN_INTERNAL_REASON;}
export function normalizeBlockerReason(raw){
  const value=clean(raw);
  if(!value)return null;
  if(DEFINITIONS[value])return {code:value,...DEFINITIONS[value],known:true,internal_raw:null};
  const hit=UPSTREAM.find(([needle])=>value.includes(needle));
  if(hit){const code=hit[1];return {code,...DEFINITIONS[code],known:true,internal_raw:value};}
  return {code:'UNKNOWN_INTERNAL_REASON',...DEFINITIONS.UNKNOWN_INTERNAL_REASON,known:false,internal_raw:value};
}
export function blockerDetails(values=[]){
  const out=[];const seen=new Set();
  for(const raw of Array.isArray(values)?values:[]){const d=normalizeBlockerReason(raw);if(!d||seen.has(d.code))continue;seen.add(d.code);out.push(d);}
  return out;
}

const SOURCE_RU=Object.freeze({
  HTX:'ХТХ',BYBIT:'Байбит',OKX:'ОКХ',GATE:'Гейт',BINANCE:'Бинанс',HYPERLIQUID:'Гиперликвид',
  'Binance Live Public':'Бинанс','Binance Public Data Archive':'Архив Бинанс',Bybit:'Байбит',Gate:'Гейт',Hyperliquid:'Гиперликвид',
  'DEX Screener':'DEX Screener','GeckoTerminal':'GeckoTerminal','DefiLlama':'DefiLlama',GoPlus:'GoPlus','Solana Public RPC':'Solana RPC',Bitget:'Bitget','Coinbase Exchange':'Coinbase',Deribit:'Deribit',
});
export function sourceLabelRu(value){const v=clean(value);return SOURCE_RU[v]||SOURCE_RU[v.toUpperCase()]||null;}

export function safeUserReason(value,{short=false}={}){
  if(value&&typeof value==='object'&&value.label){
    const label=clean(value.label);const measured=value.value??value.event;
    return measured===null||measured===undefined||measured===''?label:`${label}: ${measured}`;
  }
  const s=clean(value);if(!s)return null;
  const normalized=normalizeBlockerReason(s);
  if(normalized.known)return short?normalized.short_ru:normalized.full_ru;
  if(/[А-Яа-яЁё]/u.test(s)&&!/[A-Z]{2,}_[A-Z0-9_]+/.test(s))return s;
  return short?DEFINITIONS.UNKNOWN_INTERNAL_REASON.short_ru:DEFINITIONS.UNKNOWN_INTERNAL_REASON.full_ru;
}
