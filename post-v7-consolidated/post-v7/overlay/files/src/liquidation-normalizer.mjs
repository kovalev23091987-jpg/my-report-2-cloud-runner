export const LIQUIDATION_NORMALIZER_VERSION='post-v7-liquidation-normalizer-v1-20260926';
const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const text=v=>v===null||v===undefined?'':String(v).trim();
const upper=v=>text(v).toUpperCase();

export function normalizeProjectedSide(raw,{price,current_price}={}){
  const s=upper(raw).replace(/[\s-]+/g,'_');
  if(s&&/SHORT/.test(s)&&!/LONG/.test(s))return 'SHORT_LIQUIDATION_ABOVE';
  if(s&&/LONG/.test(s)&&!/SHORT/.test(s))return 'LONG_LIQUIDATION_BELOW';
  // Position by price is supporting geometry only; it must not invent the liquidated side.
  return 'UNKNOWN';
}

export function parseProjectedRow(row,{provider='UNKNOWN',source_path='root',source_ts=null,observed_ts=null,current_price=null,array_schema=null}={}){
  // Unknown matrix rows are fail-closed. A provider-specific array schema must be explicit.
  if(Array.isArray(row)){
    if(!array_schema || array_schema.version!=='EXPLICIT_V1')return {status:'UNSUPPORTED_ARRAY_SCHEMA',cluster:null};
    const priceIndex=Number(array_schema.price_index),sideIndex=Number(array_schema.side_index),intensityIndex=Number(array_schema.intensity_index),notionalIndex=Number(array_schema.notional_index);
    if(!Number.isInteger(priceIndex)||priceIndex<0)return {status:'UNSUPPORTED_ARRAY_SCHEMA',cluster:null};
    row={
      price:row[priceIndex],
      side:Number.isInteger(sideIndex)&&sideIndex>=0?row[sideIndex]:null,
      intensity:Number.isInteger(intensityIndex)&&intensityIndex>=0?row[intensityIndex]:null,
      notional_usd:Number.isInteger(notionalIndex)&&notionalIndex>=0?row[notionalIndex]:null,
    };
  }
  if(!row||typeof row!=='object')return {status:'ROW_NOT_OBJECT',cluster:null};
  const low=finite(row.price_low??row.low??row.lower??row.from_price??row.from);
  const high=finite(row.price_high??row.high??row.upper??row.to_price??row.to);
  const single=finite(row.level_price??row.price_level??row.liquidation_price??row.price??row.level??row.center??row.mid);
  const price=single??(low!==null&&high!==null?(low+high)/2:null);
  if(price===null||price<=0)return {status:'PRICE_MISSING',cluster:null};
  const rawSide=row.side??row.position_side??row.positionSide??row.liquidation_side??row.liquidationSide??row.type??row.direction??null;
  const side=normalizeProjectedSide(rawSide,{price,current_price});
  const notional=finite(row.notional_usd??row.notionalUsd??row.size_usd??row.sizeUsd??row.usd_notional??row.quote_qty??row.quoteQty??row.notional??row.usd??row.intensityUsd);
  const intensity=finite(row.normalized_strength??row.normalizedStrength??row.strength??row.density??row.score??row.intensity);
  if(side==='UNKNOWN')return {status:'SIDE_NOT_CLOSED',cluster:null};
  if(notional===null&&intensity===null)return {status:'SIZE_OR_INTENSITY_MISSING',cluster:null};
  const cp=finite(current_price);
  return {status:'CLOSED',cluster:{
    evidence_type:'PROJECTED_LIQUIDATION_CLUSTER',provider,source_path,source_ts,observed_ts,
    side,level_price:price,price_low:low,price_high:high,
    notional_usd:notional,intensity,unit:notional!==null?'USD_NOTIONAL_PROVIDER':'PROVIDER_INTENSITY',
    current_price:cp,distance_pct:cp&&cp>0?((price/cp)-1)*100:null,
    leverage_bucket:finite(row.leverage??row.leverage_x??row.leverageX),
    explicit_major:row.major===true||row.is_major===true||row.isMajor===true||upper(row.classification)==='MAJOR'||upper(row.tier)==='MAJOR',
  }};
}

export function classifyProjectedPayload({http_ok=false,schema_ok=false,source_ts=null,observed_ts=Date.now(),max_age_sec=1800,clusters=[]}={}){
  const src=finite(source_ts),obs=finite(observed_ts),max=finite(max_age_sec);
  const ageSec=src!==null&&obs!==null?(obs-src)/1000:null;
  const freshness=ageSec===null?'SOURCE_TS_MISSING':ageSec<0?'FUTURE':max!==null&&ageSec>max?'STALE':'CURRENT';
  const usable=Boolean(http_ok&&schema_ok&&freshness==='CURRENT'&&Array.isArray(clusters)&&clusters.length>0);
  return {http_ok:Boolean(http_ok),schema_ok:Boolean(schema_ok),source_ts:src,observed_ts:obs,age_sec:ageSec,freshness,usable,usable_levels:usable?clusters.length:0,
    status:!http_ok?'ACCESS_NOT_CLOSED':!schema_ok?'SCHEMA_NOT_CLOSED':freshness!=='CURRENT'?`FRESHNESS_${freshness}`:clusters.length?'CLOSED':'CLOSED_NO_SIGNIFICANT_ZONES'};
}

export function selectProjectedZones(clusters,{current_price,max_nearest=2,max_major=3}={}){
  const cp=finite(current_price);
  const valid=(Array.isArray(clusters)?clusters:[]).filter(x=>finite(x?.level_price)>0&&['LONG_LIQUIDATION_BELOW','SHORT_LIQUIDATION_ABOVE'].includes(x?.side));
  const bySide=side=>valid.filter(x=>x.side===side).map(x=>({...x,distance_pct:cp&&cp>0?((x.level_price/cp)-1)*100:x.distance_pct??null}));
  const rank=r=>finite(r.notional_usd)??finite(r.intensity)??0;
  const pack=rows=>{
    const nearest=[...rows].sort((a,b)=>Math.abs(a.distance_pct??Infinity)-Math.abs(b.distance_pct??Infinity)).slice(0,max_nearest).map(x=>({...x,selection_role:'NEAREST'}));
    const major=[...rows].sort((a,b)=>rank(b)-rank(a)).slice(0,max_major).map(x=>({...x,selection_role:'MAJOR'}));
    const largestDistant=[...rows].sort((a,b)=>rank(b)-rank(a)).find(x=>!nearest.some(n=>n.level_price===x.level_price))||null;
    const merged=[...nearest,...major,...(largestDistant?[{...largestDistant,selection_role:'LARGEST_DISTANT'}]:[])];
    const seen=new Set();return merged.filter(x=>{const k=`${x.side}|${x.level_price}`;if(seen.has(k))return false;seen.add(k);return true;});
  };
  return {below:pack(bySide('LONG_LIQUIDATION_BELOW')),above:pack(bySide('SHORT_LIQUIDATION_ABOVE'))};
}

export default {LIQUIDATION_NORMALIZER_VERSION,normalizeProjectedSide,parseProjectedRow,classifyProjectedPayload,selectProjectedZones};
