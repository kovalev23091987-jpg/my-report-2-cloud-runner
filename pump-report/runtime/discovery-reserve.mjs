// Shared day capacity for later light scans. This is a request-count bound,
// not proof of provider quota, latency, CPU or whole-universe qualification.
export const DISCOVERY_PLAN=Object.freeze({provider:'BINGX',family:'USDT_M',cadence_ms:300000,http_per_tick:2,start_hour:10,end_hour:20,time_zone:'Europe/Moscow',paths:['/openApi/swap/v2/quote/contracts','/openApi/swap/v2/quote/ticker']});
export function futureDiscoveryHttp(now,plan,{until_ts=Infinity}={}){
  if(!plan)return 0;
  if(until_ts!==Infinity&&(!Number.isSafeInteger(until_ts)||until_ts<now))throw Error('INVALID_DISCOVERY_RESERVE_PERIOD');
  if(!Number.isSafeInteger(now)||!Number.isSafeInteger(plan.cadence_ms)||plan.cadence_ms<60000||3600000%plan.cadence_ms!==0||!Number.isSafeInteger(plan.http_per_tick)||plan.http_per_tick<1||!Number.isInteger(plan.start_hour)||!Number.isInteger(plan.end_hour)||plan.start_hour<0||plan.end_hour>24||plan.start_hour>=plan.end_hour||plan.time_zone!=='Europe/Moscow')throw Error('INVALID_DISCOVERY_RESERVE_PLAN');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:plan.time_zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now),value=type=>Number(parts.find(p=>p.type===type).value);
  const inDay=value('hour')*3600000+value('minute')*60000+value('second')*1000+now%1000;
  const start=now-inDay+plan.start_hour*3600000,end=Math.min(now-inDay+plan.end_hour*3600000,until_ts);
  if(now>=end)return 0;
  // Only future slots; an elapsed slot is never relabelled as a fresh scan.
  const first=Math.ceil(Math.max(now+1,start)/plan.cadence_ms)*plan.cadence_ms;
  return Math.max(0,Math.ceil((end-first)/plan.cadence_ms))*plan.http_per_tick;
}
