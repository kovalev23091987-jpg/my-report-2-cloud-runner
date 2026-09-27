import {createHash} from 'node:crypto';
const stamp=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1e12?v:null;
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const text=v=>typeof v==='string'?v.trim():'';
const arr=v=>Array.isArray(v)?v:[];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
export function nativeLiquidationSources(liq){
 const nested=[];
 if(liq?.native_extension?.schema==='NATIVE_LIQUIDATION_CONTEXT_V1')nested.push(liq.native_extension);
 for(const e of arr(liq?.independent_extensions))if(['GTRADE_LIQUIDATION_CONTEXT_V1','SCOPED_PROVIDER_LIQUIDATION_CONTEXT_V1'].includes(e?.schema))nested.push(e);
 if(nested.length){
  const usable=nested.filter(e=>['USABLE_NATIVE_SAMPLE','USABLE_SCOPED_NATIVE_CONTEXT'].includes(e.status));
  return {present:true,kind:'NESTED',contexts:usable,sources:usable.map(e=>({provider:e.provider||'Hyperliquid official',venue:e.venue||'Hyperliquid',native_symbol:e.binding?.native_symbol,source_ts:e.source_ts,price_quote:e.price_quote,above:e.above,below:e.below,freshness_max_age_ms:e.freshness_max_age_ms}))};
 }
 if(liq?.early_context_present===true)return {present:true,kind:'FLAT',contexts:[liq],sources:arr(liq.sources).map(s=>({...s,freshness_max_age_ms:liq.freshness_max_age_ms}))};
 return {present:false,contexts:[],sources:[]};
}
export function validateNativeLiquidationContext(canonical,{checked_ts=canonical?.observed_ts,check_freshness=false}={}){
 const info=nativeLiquidationSources(canonical?.liquidations);if(!info.present)return {ok:true,status:'NO_NATIVE_CONTEXT'};
 const fail=status=>({ok:false,status,native_context:true});const c=canonical;
 const contract=text(c?.metadata?.contract||c?.candidates?.[0]?.contract||c?.candidates?.[0]?.ticker||c?.universe?.[0]?.contract);
 if(stamp(c.observed_ts)===null||stamp(checked_ts)===null||checked_ts<c.observed_ts)return fail('NATIVE_LIQUIDATION_CHECK_TIME_INVALID');
 for(const context of info.contexts){
  const b=info.kind==='NESTED'?context.binding:context.analysis_binding;
  if(!b||text(b.contract)!==contract||b.run_id!==c.run_id||b.snapshot_id!==c.snapshot_id||b.observed_ts!==c.observed_ts)return fail('NATIVE_LIQUIDATION_BINDING_MISMATCH');
  if(Object.hasOwn(b,'direction')&&b.direction!==c.direction)return fail('NATIVE_LIQUIDATION_DIRECTION_MISMATCH');
  if(info.kind==='NESTED'){const {fingerprint,...body}=context;if(!fingerprint||hash(body)!==fingerprint)return fail('NATIVE_LIQUIDATION_FINGERPRINT_MISMATCH');}
 }
 const hasLevels=info.sources.some(s=>arr(s.above).length||arr(s.below).length);
 if(!hasLevels)return {ok:true,status:'NATIVE_CONTEXT_WITHOUT_USABLE_LEVELS',native_context:true};
 for(const s of info.sources){
  const maxAge=s.freshness_max_age_ms;
  if(!Number.isSafeInteger(maxAge)||maxAge<=0||maxAge>86400000)return fail('NATIVE_LIQUIDATION_FRESHNESS_POLICY_MISSING');
  if(text(s.native_symbol)!==contract.replace(/-USDT$/,'')||!text(s.venue))return fail('NATIVE_LIQUIDATION_SOURCE_IDENTITY_MISMATCH');
  if(stamp(s.source_ts)===null||s.source_ts>c.observed_ts)return fail('NATIVE_LIQUIDATION_SOURCE_TIME_INVALID');
  if(c.observed_ts-s.source_ts>maxAge||check_freshness&&checked_ts-s.source_ts>maxAge)return fail('NATIVE_LIQUIDATION_SOURCE_STALE');
  if(!['USDC','USD','USDT'].includes(s.price_quote))return fail('NATIVE_LIQUIDATION_PRICE_QUOTE_MISSING');
  for(const [rows,expectedSide] of [[arr(s.above),'SHORT'],[arr(s.below),'LONG']])for(const z of rows){
   if(num(z.native_price)===null||z.native_price<=0||num(z.notional)===null||z.notional<=0||!['USD','USDC','USDT'].includes(z.notional_unit)||num(z.distance_pct)===null)return fail('NATIVE_LIQUIDATION_ZONE_INVALID');
   if((z.side??z.liquidated_side)!==expectedSide||expectedSide==='SHORT'&&z.distance_pct<=0||expectedSide==='LONG'&&z.distance_pct>=0)return fail('NATIVE_LIQUIDATION_SIDE_INVALID');
   if(stamp(z.source_ts)===null||z.source_ts>c.observed_ts)return fail('NATIVE_LIQUIDATION_ZONE_TIME_INVALID');
   if(c.observed_ts-z.source_ts>maxAge||check_freshness&&checked_ts-z.source_ts>maxAge)return fail('NATIVE_LIQUIDATION_SOURCE_STALE');
  }
 }
 return {ok:true,status:'NATIVE_CONTEXT_INTEGRITY_CLOSED',native_context:true,freshness_checked:check_freshness,max_age_ms:Math.min(...info.sources.map(s=>s.freshness_max_age_ms))};
}
const price=v=>String(Number(v.toPrecision(10))).replace('.',',');
const amount=v=>String(Number(v.toPrecision(5))).replace('.',',');
const percent=v=>(v>0?'+':'')+String(Number(v.toFixed(1))).replace('.',',')+'%';
const msk=ts=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts));
// Presentation only. All values, sides and distances come from the canonical
// snapshot. This helper does not compute scores, directions, targets or entry.
export function nativeLiquidationLines(liq,{manual=false,compact=false}={}){
 const info=nativeLiquidationSources(liq);if(!info.present)return null;
 const sources=info.sources,lines=[]; // Preserve each independent venue; never turn two sources into one summed map.
 for(const s of sources){
  const label=`${s.venue==='gTrade-Arbitrum'?'gTrade':text(s.venue||s.provider)} ${text(s.native_symbol)}`.trim(),quote=text(s.price_quote);
  if(!quote)continue;
  const short=!manual&&compact;
  if(stamp(s.source_ts)!==null)lines.push(short?`${label}, ${msk(s.source_ts)} МСК:`:`${label}, снимок ${msk(s.source_ts)} МСК; ограниченная выборка.`);
  for(const [rows,side] of [[arr(s.above),'выше'],[arr(s.below),'ниже']]){
   const parts=rows.slice(0,3).filter(z=>num(z.native_price)!==null&&z.native_price>0).map(z=>[
    `${price(z.native_price)} ${quote}${num(z.distance_pct)!==null?` (${percent(z.distance_pct)})`:''}`,
    num(z.notional)!==null?`${amount(z.notional)} ${text(z.notional_unit)}`:null,
    z.conditional_cross===true||z.conditional_on_other_positions===true?'кросс-маржа':null,
   ].filter(Boolean).join('; '));
   if(parts.length)lines.push(`${short?'':label+' — '}${side}: ${parts.join(', ')}.`);
  }
 }
 if(!lines.length)return ['Ликвидации: свежие нативные уровни в проверенной выборке не подтверждены.'];
 lines.push(!manual&&compact?'Ограниченная выборка; как цели на HTX отдельно не подтверждены.':'Это уровни указанных площадок из ограниченной выборки; как цели на HTX отдельно не подтверждены.');return lines;
}
