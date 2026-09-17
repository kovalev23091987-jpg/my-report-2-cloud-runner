/** Strict ByKaranteli proxy URL policy for My Report 2. */
export const TZ101_BYK_PROXY_POLICY_VERSION='tz101-byk-proxy-policy-r8';
const HOST='bykaranteli.com';
const symbol=v=>typeof v==='string'&&/^[A-Z0-9]{1,24}USDT$/.test(v);
const base=v=>typeof v==='string'&&/^[A-Z0-9]{1,24}$/.test(v);
const exactKeys=(params,allowed)=>{
  const keys=[...params.keys()];
  return keys.length===new Set(keys).size&&keys.every(k=>allowed.has(k));
};
function verdict(allowed,reason,path=null){return {allowed,reason:allowed?null:reason,path};}

export function validateByKaranteliProxyTarget(input){
  let u; try{u=input instanceof URL?new URL(input.toString()):new URL(String(input??''));}catch{return verdict(false,'INVALID_URL');}
  if(u.protocol!=='https:'||u.hostname!==HOST||u.username||u.password||u.port) return verdict(false,'HOST_OR_PROTOCOL_NOT_ALLOWED',u.pathname);
  if(u.hash) return verdict(false,'FRAGMENT_NOT_ALLOWED',u.pathname);
  const p=u.pathname, q=u.searchParams;
  if(p==='/api/liqmap/public'){
    if(!exactKeys(q,new Set(['symbol']))||q.size!==1||!base(q.get('symbol'))) return verdict(false,'LIQMAP_QUERY_NOT_ALLOWED',p);
    return verdict(true,null,p);
  }
  if(p==='/api/public/liquidations'){
    if(!exactKeys(q,new Set(['symbol']))||q.size!==1||!symbol(q.get('symbol'))) return verdict(false,'LIQUIDATIONS_QUERY_NOT_ALLOWED',p);
    return verdict(true,null,p);
  }
  if(p==='/api/public/coverage'){
    if(q.size!==0) return verdict(false,'COVERAGE_QUERY_NOT_ALLOWED',p);
    return verdict(true,null,p);
  }
  if(p==='/api/public/symbols'){
    if(!exactKeys(q,new Set(['top']))||q.size!==1) return verdict(false,'SYMBOLS_QUERY_NOT_ALLOWED',p);
    const top=Number(q.get('top'));
    if(!Number.isSafeInteger(top)||top<1||top>1000) return verdict(false,'SYMBOLS_TOP_INVALID',p);
    return verdict(true,null,p);
  }
  const smart=p.match(/^\/api\/public\/smart-money\/([A-Z0-9]{1,24}USDT)$/);
  if(smart){
    if(q.size!==0||!symbol(smart[1])) return verdict(false,'SMART_MONEY_QUERY_NOT_ALLOWED',p);
    return verdict(true,null,p);
  }
  if(p==='/api/series'){
    const allowed=new Set(['metric','symbol','period','limit']);
    if(!exactKeys(q,allowed)||q.size!==4) return verdict(false,'SERIES_QUERY_NOT_ALLOWED',p);
    if(q.get('metric')!=='whale_net'||!symbol(q.get('symbol'))||q.get('period')!=='1h') return verdict(false,'SERIES_SEMANTICS_NOT_ALLOWED',p);
    const limit=Number(q.get('limit'));
    if(!Number.isSafeInteger(limit)||limit<12||limit>72) return verdict(false,'SERIES_LIMIT_INVALID',p);
    return verdict(true,null,p);
  }
  return verdict(false,'PATH_NOT_ALLOWED',p);
}
