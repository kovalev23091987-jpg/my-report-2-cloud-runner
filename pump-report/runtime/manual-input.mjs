const token='[A-Z0-9][A-Z0-9._/-]{0,79}';
const direct=new RegExp('^\\$?('+token+')$','i');
const patterns=[new RegExp('^запусти\\s+памп[ -]отч[её]т\\s+для\\s+\\$?('+token+')[.!?]?$','iu'),new RegExp('^проверь\\s+\\$?('+token+')(?:\\s+на\\s+памп)?[.!?]?$','iu'),new RegExp('^что\\s+сейчас\\s+по\\s+\\$?('+token+')(?:\\s+для\\s+памп[ -]отч[её]та)?[.!?]?$','iu')];
export function parseManualInput(value,{context_symbol=null}={}){
  if(typeof value!=='string'||value.length>300)return {status:'INVALID_MANUAL_REQUEST'};
  const text=value.trim().replace(/[«»"']/g,''),context=/^что\s+сейчас\s+по\s+этой\s+монете(?:\s+для\s+памп[ -]отч[её]та)?[.!?]?$/iu.test(text);
  const match=direct.exec(text)??patterns.map(p=>p.exec(text)).find(Boolean);
  const raw=context?context_symbol:match?.[1];
  if(context&&!raw)return {status:'CONTEXT_SYMBOL_REQUIRED'};
  if(typeof raw!=='string'||!direct.test(raw))return {status:'INVALID_MANUAL_REQUEST'};
  const symbol=raw.replace(/^\$/,'').toUpperCase().replace(/(?:[-/]?USDT)$/,'');
  return /^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(symbol)?{status:'PARSED',symbol}:{status:'INVALID_MANUAL_REQUEST'};
}
