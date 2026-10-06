import {mergeLiquidationDisplayZones} from './canonical-display.mjs';
import {createHash} from 'node:crypto';
const stamp=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1e12?v:null;
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const text=v=>typeof v==='string'?v.trim():'';
const arr=v=>Array.isArray(v)?v:[];
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>[k,stable(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
export function nativeLiquidationSources(liq){
 const nested=[];
 if(['NATIVE_LIQUIDATION_CONTEXT_V1','GTRADE_LIQUIDATION_CONTEXT_V1','SCOPED_PROVIDER_LIQUIDATION_CONTEXT_V1'].includes(liq?.native_extension?.schema))nested.push(liq.native_extension);
 for(const e of arr(liq?.independent_extensions))if(['GTRADE_LIQUIDATION_CONTEXT_V1','SCOPED_PROVIDER_LIQUIDATION_CONTEXT_V1'].includes(e?.schema))nested.push(e);
 if(nested.length){
  const usable=nested.filter(e=>['USABLE_NATIVE_SAMPLE','USABLE_SCOPED_NATIVE_CONTEXT','USABLE_RECEIPT_ONLY_CONTEXT'].includes(e.status));
  return {present:true,kind:'NESTED',contexts:usable,sources:usable.map(e=>({provider:e.provider||'Hyperliquid official',venue:e.venue||'Hyperliquid',native_symbol:e.binding?.native_symbol,source_ts:e.source_ts,context_status:e.status,source_clock_closed:e.source_clock_closed,received_ts:e.received_ts,entry_eligible:e.entry_eligible,automatic_execution:e.automatic_execution,freshness_basis:e.freshness_basis,price_quote:e.price_quote,evidence_class:e.evidence_class,upstream_groups:e.upstream_groups,acquisition_fingerprint:e.acquisition_fingerprint,sdk_version:e.sdk_version,model_version:e.model_version,above:e.above,below:e.below,freshness_max_age_ms:e.freshness_max_age_ms}))};
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
  if(context.status==='USABLE_RECEIPT_ONLY_CONTEXT'&&context.schema!=='SCOPED_PROVIDER_LIQUIDATION_CONTEXT_V1')return fail('NATIVE_LIQUIDATION_RECEIPT_ONLY_SCHEMA_INVALID');
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
  const receiptOnly=s.context_status==='USABLE_RECEIPT_ONLY_CONTEXT';
  if(receiptOnly&&(s.source_clock_closed!==false||s.source_ts!==null||s.entry_eligible!==false||s.automatic_execution!==false||s.freshness_basis!=='CURRENT_ENDPOINT_RECEIPT_ONLY_SOURCE_AGE_UNKNOWN'||stamp(s.received_ts)===null||s.received_ts>c.observed_ts||c.observed_ts-s.received_ts>maxAge||check_freshness&&checked_ts-s.received_ts>maxAge))return fail('NATIVE_LIQUIDATION_RECEIPT_ONLY_BOUNDARY_INVALID');
  if(!receiptOnly&&(stamp(s.source_ts)===null||s.source_ts>c.observed_ts))return fail('NATIVE_LIQUIDATION_SOURCE_TIME_INVALID');
  if(!receiptOnly&&(c.observed_ts-s.source_ts>maxAge||check_freshness&&checked_ts-s.source_ts>maxAge))return fail('NATIVE_LIQUIDATION_SOURCE_STALE');
  if(!['USDC','USD','USDT'].includes(s.price_quote))return fail('NATIVE_LIQUIDATION_PRICE_QUOTE_MISSING');
  for(const [rows,expectedSide] of [[arr(s.above),'SHORT'],[arr(s.below),'LONG']])for(const z of rows){
   if(num(z.native_price)===null||z.native_price<=0||num(z.notional)===null||z.notional<=0||!['USD','USDC','USDT'].includes(z.notional_unit)||num(z.distance_pct)===null)return fail('NATIVE_LIQUIDATION_ZONE_INVALID');
   if((z.side??z.liquidated_side)!==expectedSide||expectedSide==='SHORT'&&z.distance_pct<=0||expectedSide==='LONG'&&z.distance_pct>=0)return fail('NATIVE_LIQUIDATION_SIDE_INVALID');
   if(receiptOnly&&(z.source_ts!==null||z.source_clock_closed!==false||z.entry_eligible!==false||z.is_htx_price!==false||z.decision_target_eligible===true||z.path_obstacle_eligible===true))return fail('NATIVE_LIQUIDATION_RECEIPT_ONLY_ZONE_INVALID');
   if(!receiptOnly&&(stamp(z.source_ts)===null||z.source_ts>c.observed_ts))return fail('NATIVE_LIQUIDATION_ZONE_TIME_INVALID');
   if(!receiptOnly&&(c.observed_ts-z.source_ts>maxAge||check_freshness&&checked_ts-z.source_ts>maxAge))return fail('NATIVE_LIQUIDATION_SOURCE_STALE');
  }
 }
 return {ok:true,status:'NATIVE_CONTEXT_INTEGRITY_CLOSED',native_context:true,freshness_checked:check_freshness&&!info.sources.some(s=>s.context_status==='USABLE_RECEIPT_ONLY_CONTEXT'),receipt_only_contexts:info.sources.filter(s=>s.context_status==='USABLE_RECEIPT_ONLY_CONTEXT').length,receipt_freshness_checked:check_freshness,max_age_ms:Math.min(...info.sources.map(s=>s.freshness_max_age_ms))};
}
const price=v=>String(Number(v.toPrecision(10))).replace('.',',');
const amount=v=>String(Number(v.toPrecision(5))).replace('.',',');
const percent=v=>(v>0?'+':'')+String(Number(v.toFixed(1))).replace('.',',')+'%';
const msk=ts=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts));
// Presentation only. All values, sides and distances come from the canonical
// snapshot. This helper does not compute scores, directions, targets or entry.
export function nativeLiquidationLines(liq,{manual=false,compact=false}={}){
 const info=nativeLiquidationSources(liq);if(!info.present)return null;
 const lines=[],rows=[];
 for(const s of info.sources){
  const label=`${s.provider==='0xArchive'?'0xArchive':s.venue==='gTrade-Arbitrum'?'gTrade':text(s.venue||s.provider)} ${text(s.native_symbol)}${s.provider==='0xArchive'?' (оценочные зоны Hyperliquid)':''}`.trim(),quote=text(s.price_quote);if(!quote)continue;
  if(s.context_status==='USABLE_RECEIPT_ONLY_CONTEXT')lines.push(`${label}, ответ получен в ${msk(s.received_ts)} МСК; время исходного состояния неизвестно.`);
  else if(stamp(s.source_ts)!==null)lines.push(`${label}, снимок ${msk(s.source_ts)} МСК${manual?'; ограниченная выборка':''}.`);
  for(const [zs,side] of [[arr(s.above),'ABOVE'],[arr(s.below),'BELOW']])for(const z of zs){
   if(num(z.native_price)===null||z.native_price<=0)continue;
   rows.push({...z,side,price:z.native_price,price_quote:quote,source:label,native_symbol:s.native_symbol,
    distance_reference_basis:'ORIGINAL_SOURCE_REFERENCE_SAME_QUOTE',source_clock_closed:s.source_clock_closed,
    sdk_version:s.sdk_version??null,model_version:s.model_version??null,
    display_source_state_id:s.source_clock_closed===false&&text(s.acquisition_fingerprint)&&stamp(z.observed_at_ms)!==null?`${s.acquisition_fingerprint}:${z.observed_at_ms}`:null,
    estimated:s.provider==='0xArchive'||/ESTIMAT|PROJECTED|MODEL/.test(s.evidence_class||'')||/SDK_ESTIMATE|BUCKET_CENTER|MODEL_PRICE_BIN|FEE_AWARE/.test(z.price_semantics||'')});
  }
 }
 for(const [side,label] of [['ABOVE','выше'],['BELOW','ниже']]){
  const merged=mergeLiquidationDisplayZones(rows,side).sort((a,b)=>Math.abs(a.distance_pct)-Math.abs(b.distance_pct)).slice(0,compact?2:4);
  const parts=merged.map(z=>[
   `${z.estimated?'расчётный уровень ≈':''}${price(z.price)} ${z.price_quote}${num(z.distance_pct)!==null?` (${percent(z.distance_pct)} к цене источника)`:''}`,
   num(z.notional)!==null?`${z.estimated?'оценочный объём ':''}${amount(z.notional)} ${text(z.notional_unit)} в показанной позиции`:null,
   z.source,
   z.display_component_count>1?`объединено ${z.display_component_count} близких уровней, показан дальний${z.display_contains_estimates?'; есть расчётные уровни':''}`:null,
   z.conditional_cross===true||z.conditional_on_other_positions===true?'кросс-маржа':null,
  ].filter(Boolean).join('; '));if(parts.length)lines.push(`${label}: ${parts.join(', ')}.`);
 }
 if(!rows.length)return ['Ликвидации: пригодные уровни в проверенной выборке не подтверждены.'];
 lines.push(manual?'Это уровни указанных площадок из ограниченной выборки; как цели на HTX отдельно не подтверждены.':compact?'Ограниченная выборка; цели на HTX не подтверждены.':'Ограниченная выборка этих площадок; цели на HTX не подтверждены.');return lines;
}
