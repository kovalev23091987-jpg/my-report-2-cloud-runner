// A native crypto symbol may use any script or pictographic characters.
// Matching never transliterates or infers the underlying asset from its name.
const token='[\\p{L}\\p{N}\\p{So}][\\p{L}\\p{M}\\p{N}\\p{So}._/-]{0,79}';
const direct=new RegExp('^\\$?('+token+')$','iu');
const patterns=[new RegExp('^сделай\\s+памп(?:[ -]отч[её]т)?\\s+(?:по|для)\\s+\\$?('+token+')[.!?]?$','iu'),new RegExp('^запусти\\s+памп[ -]отч[её]т\\s+для\\s+\\$?('+token+')[.!?]?$','iu'),new RegExp('^проверь\\s+\\$?('+token+')(?:\\s+на\\s+памп)?[.!?]?$','iu'),new RegExp('^что\\s+сейчас\\s+по\\s+\\$?('+token+')(?:\\s+для\\s+памп[ -]отч[её]та)?[.!?]?$','iu')];
export function parseManualInput(value,{context_symbol=null}={}){
  if(typeof value!=='string'||value.length>300)return {status:'INVALID_MANUAL_REQUEST'};
  const text=value.trim().replace(/[«»"']/g,''),context=/^что\s+сейчас\s+по\s+этой\s+монете(?:\s+для\s+памп[ -]отч[её]та)?[.!?]?$/iu.test(text);
  const match=direct.exec(text)??patterns.map(p=>p.exec(text)).find(Boolean);
  const raw=context?context_symbol:match?.[1];
  if(context&&!raw)return {status:'CONTEXT_SYMBOL_REQUIRED'};
  if(typeof raw!=='string'||!direct.test(raw))return {status:'INVALID_MANUAL_REQUEST'};
  const symbol=raw.replace(/^\$/,'').toUpperCase().replace(/(?:[-/]?USDT)$/,'');
  return /^[\p{L}\p{N}\p{So}][\p{L}\p{M}\p{N}\p{So}._-]{0,59}$/u.test(symbol)?{status:'PARSED',symbol}:{status:'INVALID_MANUAL_REQUEST'};
}
