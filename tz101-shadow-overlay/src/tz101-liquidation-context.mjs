/** Optional Telegram context from the existing projected-liquidation scan. */
import { buildExtendedLiquidationScan } from './v3-liquidation-intelligence.mjs';

export const TZ101_LIQUIDATION_CONTEXT_VERSION='tz101-liquidation-context-r1';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000;
const base=(status,reason,extra={})=>({version:TZ101_LIQUIDATION_CONTEXT_VERSION,status,reason,short_above:[],long_below:[],
  semantics:'PROJECTED_PROVIDER_LEVELS_NOT_FACTUAL_USER_POSITIONS',guaranteed_target:false,entry_blocking:false,shadow_only:true,...extra});

function rows(input,{side,sign,observedTs}){
  if(!Array.isArray(input))return [];
  const seen=new Set(),out=[];
  for(const row of input){
    const level=Number(row?.level_price),distance=Number(row?.distance_pct),sourceTs=Number(row?.source_ts);
    if(row?.side!==side||row?.significance!=='MAJOR'||row?.lifecycle!=='ACTIVE'||!finite(level)||level<=0||!finite(distance)||Math.sign(distance)!==sign||
      !stamp(sourceTs)||sourceTs>observedTs)continue;
    const key=level.toPrecision(12);if(seen.has(key))continue;seen.add(key);
    out.push({side,level_price:level,distance_pct:distance,significance:'MAJOR',lifecycle:'ACTIVE',observed_ts:sourceTs,source_ts:sourceTs,
      asset_identity_verified:true,source_status:'CLOSED_SHADOW',projected_only:true,factual_user_position:false,guaranteed_tp:false});
  }
  return out;
}

export function buildTz101LiquidationContext({projected_record,contract_code,current_price,move_24h_pct,observed_ts=Date.now()}={}){
  if(!stamp(observed_ts)||projected_record?.projected_map_status!=='CLOSED_SHADOW'||projected_record?.asset_identity_verified!==true)
    return base('NOT_CONFIRMED','PROJECTED_SOURCE_IDENTITY_NOT_CLOSED');
  const scan=buildExtendedLiquidationScan(projected_record,{htx_contract:contract_code,htx_current_price:current_price,move_24h_pct,now_ts:observed_ts});
  if(scan.status!=='CLOSED_SHADOW')return base('NOT_CONFIRMED',scan.status||'EXTENDED_SCAN_NOT_CLOSED',{scan_status:scan.status||null});
  const shortAbove=rows(scan.above,{side:'SHORT_LIQUIDATION_ABOVE',sign:1,observedTs:observed_ts});
  const longBelow=rows(scan.below,{side:'LONG_LIQUIDATION_BELOW',sign:-1,observedTs:observed_ts});
  const status=shortAbove.length&&longBelow.length?'CONFIRMED':shortAbove.length||longBelow.length?'PARTIAL':'NOT_CONFIRMED';
  return base(status,status==='NOT_CONFIRMED'?'NO_CURRENT_MAJOR_TWO_SIDED_LEVELS':null,{short_above:shortAbove,long_below:longBelow,
    scan_status:scan.status,current_price:scan.current_price,move_24h_pct:scan.move_24h_pct,source_status:'CLOSED_SHADOW',asset_identity_verified:true});
}
