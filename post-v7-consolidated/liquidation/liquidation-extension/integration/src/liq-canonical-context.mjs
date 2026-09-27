import {nativeLiquidationLines} from '../../src/native-liquidation-guard.mjs';
import {fingerprint,seal,num,timestamp} from '../../src/core.mjs';
export const LIQUIDATION_CANONICAL_CONTEXT_VERSION='liq-canonical-context-20260927-v1';
const NATIVE=new Set(['NATIVE_ACCOUNT_LIQUIDATION_PRICES','NATIVE_POSITION_FEE_AWARE_ESTIMATES']);
const allArray=x=>Array.isArray(x)?x:[];
const validId=x=>typeof x==='string'&&x.trim()===x&&x.length>0;
const finitePositive=x=>num(x)!==null&&num(x)>0;
const rawDigest=x=>{if(!x||typeof x!=='object'||Array.isArray(x))return false;const {fingerprint:hash,...body}=x;return typeof hash==='string'&&fingerprint(body)===hash;};
export function createLiquidationAcquisition({contract,run_id,acquisition_id,receipts,requests,started_ts,completed_ts}={}){
 if(!validId(contract)||!validId(run_id)||!validId(acquisition_id)||timestamp(started_ts)===null||timestamp(completed_ts)===null||completed_ts<started_ts||!Number.isSafeInteger(requests)||requests<0||requests>24||!Array.isArray(receipts))throw Error('ACQUISITION_ENVELOPE_INVALID');
 for(const r of receipts)if(!rawDigest(r)||r.run_id!==run_id||timestamp(r.analysis_as_of_ms)===null||r.analysis_as_of_ms>completed_ts||r.received_at_ms>completed_ts)throw Error('SOURCE_NOT_BOUND_TO_ACQUISITION');
 const symbols=new Set(receipts.map(r=>r.native_symbol));if(symbols.size>1)throw Error('MIXED_NATIVE_INSTRUMENTS_IN_ACQUISITION');
 return seal({native_symbol:receipts[0]?.native_symbol??null,schema:'LIQUIDATION_ACQUISITION_V1',contract,run_id,acquisition_id,receipts:structuredClone(receipts),requests,started_ts,completed_ts,mode:'SHADOW_ONLY',scores_changed:false,entry_created:false,trade_execution:false});
}
const px=x=>String(Number(Number(x).toPrecision(7)));
const pct=x=>(x>=0?'+':'')+Number(x.toFixed(1)).toString().replace('.',',')+'%';
const money=(n,u)=>`${n>=1e6?(n/1e6).toFixed(2)+' млн':n>=1000?(n/1000).toFixed(1)+' тыс.':n.toFixed(2)} ${u}`;
const timeMsk=t=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(t));
function choose(rows){
 const nearest=[...rows].sort((a,b)=>Math.abs(a.distance_pct)-Math.abs(b.distance_pct))[0];
 // Notional only ranks inside one native source and one unit; no cross-source sum.
 const largest=[...rows].sort((a,b)=>b.notional-a.notional)[0];
 const byKey=new Map();for(const [z,role] of [[nearest,'NEAREST_OBSERVED'],[largest,'LARGEST_OBSERVED']]){if(!z)continue;const k=z.native_price+':'+z.liquidated_side;const old=byKey.get(k);byKey.set(k,{...z,selection_roles:[...(old?.selection_roles??[]),role]});}
 return [...byKey.values()];
}
function sourceDisplay(source){
 const name=(source.venue||source.provider)+' '+source.native_symbol;
 const line=(rows,label)=>!rows.length?`${label}: в проверенной выборке не подтверждены.`:`${label}: `+rows.map(z=>`${px(z.native_price)} (${pct(z.distance_pct)}; ${money(z.notional,z.notional_unit)}${z.conditional_on_other_positions?', кросс-маржа':''})`).join('; ')+'.';
 return {header:`${name}, снимок ${timeMsk(source.source_ts)} МСК; выборка, не вся биржа.`,above:line(source.above,'Выше'),below:line(source.below,'Ниже')};
}
export function buildEarlyLiquidationView({legacy,acquisition,contract,run_id,snapshot_id,observed_ts,max_age_ms=600000}={}){
 if(acquisition==null)return legacy;
 const base={version:LIQUIDATION_CANONICAL_CONTEXT_VERSION,status:'NOT_CLOSED',pump:legacy?.pump??null,above:[],below:[],sources:[],
  realized:legacy?.realized??null,legacy_projected_retained_for_audit:legacy??null,realized_projected_separate:true,early_context_present:true,
  freshness_max_age_ms:max_age_ms,analysis_binding:{contract,run_id,snapshot_id,observed_ts},source_timestamps_rewritten:false,prices_converted_to_htx:false,notional_summed_across_sources:false,
  entry_eligible:false,targets_created:false,score_eligible:false,display_lines:[],manual_lines:[],reasons:[]};
 const rejected=reason=>({...base,reason,reasons:[reason]});
 if(!validId(contract)||!validId(run_id)||!validId(snapshot_id)||timestamp(observed_ts)===null)return rejected('CANONICAL_IDENTITY_INCOMPLETE');
 if(!rawDigest(acquisition)||acquisition.schema!=='LIQUIDATION_ACQUISITION_V1'||acquisition.contract!==contract||acquisition.run_id!==run_id)return rejected('ACQUISITION_IDENTITY_OR_HASH_MISMATCH');
 if(acquisition.native_symbol!==contract.replace(/-USDT$/,''))return rejected('NATIVE_INSTRUMENT_DOES_NOT_MATCH_REQUEST_SCOPE');
 if(acquisition.completed_ts>observed_ts||acquisition.started_ts>acquisition.completed_ts)return rejected('ACQUISITION_FROM_FUTURE');
 if(!(typeof max_age_ms==='number'&&Number.isFinite(max_age_ms)&&max_age_ms>0))return rejected('FRESHNESS_POLICY_MISSING');
 const sources=[],quarantined=[],seen=new Set();
 for(const r of acquisition.receipts){
  if(!rawDigest(r)||r.run_id!==run_id||r.native_symbol!==acquisition.native_symbol){quarantined.push({provider:r?.provider,reason:'SOURCE_HASH_OR_RUN_MISMATCH'});continue;}
  if(seen.has(r.fingerprint))continue;seen.add(r.fingerprint);
  if(r.usable_for_context!==true||!NATIVE.has(r.evidence_class)){quarantined.push({provider:r.provider,reason:'RESEARCH_OR_MODELED_SOURCE_NOT_NATIVE_VIEW'});continue;}
  if(timestamp(r.source_ts)===null||r.source_ts>observed_ts||r.received_at_ms>observed_ts||observed_ts-r.source_ts>max_age_ms){quarantined.push({provider:r.provider,reason:'NATIVE_SOURCE_CLOCK_NOT_CLOSED'});continue;}
  if(!validId(r.native_symbol)||!validId(r.venue)||!Array.isArray(r.upstream_groups)||!r.upstream_groups.length){quarantined.push({provider:r.provider,reason:'SOURCE_IDENTITY_MISSING'});continue;}
  const good=[],bad=[];
  for(const z of allArray(r.zones)){
   if(!finitePositive(z.native_price)||!finitePositive(z.native_reference_price)||!finitePositive(z.notional)||!['USD','USDC'].includes(z.notional_unit)||!['LONG','SHORT'].includes(z.liquidated_side)){bad.push('INVALID_NATIVE_ZONE');continue;}
   const d=(z.native_price/z.native_reference_price-1)*100;
   if((z.liquidated_side==='LONG'&&d>=0)||(z.liquidated_side==='SHORT'&&d<=0)){bad.push('NATIVE_SIDE_GEOMETRY_UNRESOLVED');continue;}
   good.push({...z,distance_pct:d,provider:r.provider,venue:r.venue,source_ts:r.source_ts,source_fingerprint:r.fingerprint,not_htx_target:true});
  }
  // Retain native source selection separately. Do not merge gTrade with Hyperliquid.
  const units=new Set(good.map(z=>z.notional_unit));if(units.size>1){quarantined.push({provider:r.provider,reason:'MIXED_UNITS_IN_ONE_SOURCE'});continue;}
  const out={provider:r.provider,venue:r.venue,native_symbol:r.native_symbol,upstream_groups:r.upstream_groups,source_ts:r.source_ts,source_fingerprint:r.fingerprint,
   acquisition_as_of_ms:r.analysis_as_of_ms,coverage:r.coverage??'SCOPED_SAMPLE',price_quote:r.quote??null,whole_book_coverage_pct:r.whole_book_coverage_pct??null,
   execution_alias_verified:r.execution_alias_verified===true,above:choose(good.filter(z=>z.distance_pct>0)),below:choose(good.filter(z=>z.distance_pct<0)),
   raw_native_zone_count:good.length,quarantined_zone_count:bad.length,model_prices_used:false,not_htx_target:true};
  sources.push(out);
 }
 const first=sources.find(s=>s.above.length||s.below.length); // one source per compact map, no mixed-provider ranking
 const display=first?sourceDisplay(first):null;
 const displayLines=display?[display.header,display.above,display.below,'Цены источника; цели на HTX отдельно не подтверждены.']:['Ликвидационные уровни: источник, время или выборка не подтверждены.'];
 const manualLines=[];for(const s of sources){const d=sourceDisplay(s);manualLines.push(d.header,d.above,d.below);}if(manualLines.length)manualLines.push('Это уровни названных площадок, не подтверждённые цели HTX.');else manualLines.push(...displayLines);
 return {...base,status:first?'CLOSED_SCOPED_NATIVE_CONTEXT':'NOT_CLOSED',sources,above:first?.above??[],below:first?.below??[],
  quarantined,acquisition_fingerprint:acquisition.fingerprint,acquisition_id:acquisition.acquisition_id,request_count:acquisition.requests,
  display_lines:displayLines,manual_lines:manualLines,map_visible_before_pump:true,source_receipts_retained:true};
}
// This renderer ONLY selects already prepared presentation strings.
export function canonicalLiqLines(view,{manual=false}={}){return view?.version===LIQUIDATION_CANONICAL_CONTEXT_VERSION?nativeLiquidationLines(view,{manual}):null;}
