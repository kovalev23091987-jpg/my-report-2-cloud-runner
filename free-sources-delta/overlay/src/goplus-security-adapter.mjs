export const GOPLUS_SECURITY_ADAPTER_VERSION='goplus-security-adapter-v1-20260925';
const clean=v=>String(v??'').trim();
const boolish=v=>v===true||v===1||v==='1'||String(v).toLowerCase()==='true';
const unknown=v=>v===undefined||v===null||v==='';
export function goplusRequest({chain_id,contract_or_mint,bearer_token='' }={}){
  const chain=clean(chain_id),contract=clean(contract_or_mint),token=clean(bearer_token);
  if(!chain||!contract)return {status:'NOT_CLOSED',reason:'IDENTITY_REQUIRED',request:null};
  if(!token)return {status:'NOT_CONFIGURED',reason:'AUTHORIZATION_REQUIRED_BY_CURRENT_REFERENCE',request:{method:'GET',url:`https://api.gopluslabs.io/api/v1/token_security/${encodeURIComponent(chain)}?contract_addresses=${encodeURIComponent(contract)}`,headers:{}}};
  return {status:'CANDIDATE',reason:null,request:{method:'GET',url:`https://api.gopluslabs.io/api/v1/token_security/${encodeURIComponent(chain)}?contract_addresses=${encodeURIComponent(contract)}`,headers:{Authorization:`Bearer ${token}`}}};
}
function riskFlag(row,key){if(unknown(row?.[key]))return null;return boolish(row[key]);}
export function normalizeGoPlusTokenSecurity(payload,{chain,contract_or_mint,observed_ts=Date.now()}={}){
  const key=clean(contract_or_mint).toLowerCase();const result=payload?.result&&typeof payload.result==='object'?(payload.result[key]??payload.result[clean(contract_or_mint)]??null):null;
  if(!result)return {version:GOPLUS_SECURITY_ADAPTER_VERSION,status:'UNSUPPORTED',reason:'TOKEN_SECURITY_DATA_UNAVAILABLE',chain:clean(chain)||null,contract_or_mint:clean(contract_or_mint)||null,observed_ts,supporting_risk_only:true,hard_gate:false};
  const flags={
    cannot_sell_all:riskFlag(result,'cannot_sell_all'),cannot_buy:riskFlag(result,'cannot_buy'),is_honeypot:riskFlag(result,'is_honeypot'),
    is_mintable:riskFlag(result,'is_mintable'),is_proxy:riskFlag(result,'is_proxy'),owner_change_balance:riskFlag(result,'owner_change_balance'),
    transfer_pausable:riskFlag(result,'transfer_pausable'),trading_cooldown:riskFlag(result,'trading_cooldown'),is_blacklisted:riskFlag(result,'is_blacklisted'),
  };
  const known=Object.values(flags).filter(v=>v!==null).length;
  return {version:GOPLUS_SECURITY_ADAPTER_VERSION,status:known?'CLOSED':'UNKNOWN',chain:clean(chain)||null,contract_or_mint:clean(contract_or_mint)||null,observed_ts,flags,holder_count:result?.holder_count??null,top_holder_percent:result?.holders?.[0]?.percent??null,supporting_risk_only:true,hard_gate:false,unknown_is_safe:false};
}
