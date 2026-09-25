export const OFFICIAL_EVENT_RECEIPT_VERSION='official-event-receipt-v1-20260925';
const clean=v=>String(v??'').trim();
const stamp=v=>{const n=Date.parse(v);return Number.isFinite(n)?n:(Number.isFinite(Number(v))?Number(v):null);};
const ALLOWED_TYPES=new Set(['TOKEN_UNLOCK','TOKEN_EMISSION','EXCHANGE_LISTING','EXCHANGE_DELISTING','BUYBACK','BURN','PROTOCOL_UPGRADE','GOVERNANCE','OFFICIAL_ANNOUNCEMENT']);
export function normalizeOfficialEvent({source_url,source_kind='OFFICIAL_PROJECT',published_at,event_at,chain,contract_or_mint,event_type,title,confidence='HIGH'}={}){
  const url=clean(source_url),pub=stamp(published_at),evt=stamp(event_at),type=clean(event_type).toUpperCase();const errors=[];
  if(!/^https:\/\//i.test(url))errors.push('OFFICIAL_SOURCE_URL_REQUIRED');if(pub===null)errors.push('PUBLISHED_AT_REQUIRED');if(evt===null)errors.push('EVENT_AT_REQUIRED');if(!ALLOWED_TYPES.has(type))errors.push('EVENT_TYPE_UNSUPPORTED');if(!clean(contract_or_mint))errors.push('CONTRACT_IDENTITY_REQUIRED');
  return {version:OFFICIAL_EVENT_RECEIPT_VERSION,status:errors.length?'NOT_CLOSED':'CLOSED',source_url:url||null,source_kind:clean(source_kind),published_at:pub,event_at:evt,chain:clean(chain)||null,contract_or_mint:clean(contract_or_mint)||null,event_type:type||null,title:clean(title)||null,confidence:clean(confidence).toUpperCase()||'UNKNOWN',errors,rumor:false};
}
