// Engineering retry intervals; these change neither signal thresholds nor caps.
export const SOURCE_ERROR_PROFILE=Object.freeze({temporary_base_ms:60000,temporary_max_ms:900000,negative_ttl_ms:3600000});
export function responseDisposition(provider,status,data){
  if(status===429||provider==='BINGX'&&String(data?.code)==='100410')return 'RATE_LIMIT';
  if(status===408||status===425||status>=500&&status<=599)return 'TEMPORARY';
  // A missing exact route is not proof that an asset is noncrypto or unsupported.
  if(status===404||status===410)return 'ROUTE_UNAVAILABLE';
  if(status>=200&&status<=299&&data?.invalid_json!==true&&data?.success!==false&&!(provider==='BINGX'&&data?.code!==undefined&&String(data.code)!=='0'))return 'SUCCESS';
  return 'UNQUALIFIED_ERROR';
}
export function temporaryDelay(failures){return Math.min(SOURCE_ERROR_PROFILE.temporary_max_ms,SOURCE_ERROR_PROFILE.temporary_base_ms*2**Math.min(20,Math.max(0,failures-1)));}
