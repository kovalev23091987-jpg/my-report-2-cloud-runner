// No fact or score is calculated in delivery; lines come from the shared result.
export const NATIVE_LIQ_VIEW_VERSION='liq-canonical-context-20260927-v1';
export const NATIVE_LIQ_FRESHNESS_MS=600_000;
const text=v=>typeof v==='string'?v.trim():'';
const stamp=v=>Number.isSafeInteger(v)&&v>=1_000_000_000_000?v:null;
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const rows=v=>Array.isArray(v)?v:[];
const contract=c=>text(c?.metadata?.contract||c?.candidates?.[0]?.contract||c?.candidates?.[0]?.ticker||c?.universe?.[0]?.contract);
export function usesNativeLiquidationView(c){return c?.liquidations?.version===NATIVE_LIQ_VIEW_VERSION;}
export function verifyNativeLiquidationView(c,{now_ms=c?.observed_ts,lifecycle_event=null,max_age_ms=NATIVE_LIQ_FRESHNESS_MS}={}){
 const fail=reason=>({ok:false,reason});const view=c?.liquidations;
 if(!usesNativeLiquidationView(c)){
  if(String(view?.version||'').startsWith('liq-canonical-context-')||[...rows(view?.above),...rows(view?.below)].some(z=>Object.hasOwn(z??{},'native_price')))return fail('NATIVE_LIQ_SCHEMA_UNSUPPORTED');
  return {ok:true,status:'LEGACY_UNCHANGED',native:false};
 }
 if(String(lifecycle_event).toUpperCase()==='IDEA_REMOVED')return {ok:true,status:'REMOVAL_DOES_NOT_PUBLISH_MARKET_LEVELS',native:true};
 const expected=contract(c),binding=view.analysis_binding;
 if(!binding||binding.contract!==expected||binding.run_id!==c.run_id||binding.snapshot_id!==c.snapshot_id||binding.observed_ts!==c.observed_ts)return fail('NATIVE_LIQ_CANONICAL_BINDING_MISMATCH');
 if(stamp(c.observed_ts)===null||stamp(now_ms)===null||now_ms<c.observed_ts)return fail('NATIVE_LIQ_ANALYSIS_TIME_INVALID');
 if(!Number.isSafeInteger(max_age_ms)||max_age_ms<=0||max_age_ms>NATIVE_LIQ_FRESHNESS_MS)return fail('NATIVE_LIQ_FRESHNESS_POLICY_INVALID');
 if(view.prices_converted_to_htx!==false||view.notional_summed_across_sources!==false||view.entry_eligible!==false||view.targets_created!==false||view.score_eligible!==false)return fail('NATIVE_LIQ_SAFETY_CONTRACT_MISMATCH');
 for(const name of ['display_lines','manual_lines']){
  const a=view[name];if(!Array.isArray(a)||a.length<1||a.length>20||a.some(x=>typeof x!=='string'||!x.trim()||/[\r\n]/.test(x))||a.join('\n').length>1800)return fail('NATIVE_LIQ_PREPARED_TEXT_INVALID');
 }
 if(view.status!=='CLOSED_SCOPED_NATIVE_CONTEXT'){
  if(rows(view.above).length||rows(view.below).length)return fail('UNCLOSED_NATIVE_VIEW_CONTAINS_ACTIVE_LEVELS');
  return {ok:true,status:'EXPLICIT_NO_CONFIRMED_NATIVE_LEVELS',native:true};
 }
 const sources=rows(view.sources);if(!sources.length||!hex(view.acquisition_fingerprint))return fail('NATIVE_LIQ_SOURCE_PROVENANCE_MISSING');
 let oldest=now_ms;
 for(const s of sources){
  if(!text(s.provider)||!text(s.venue)||s.native_symbol!==expected.replace(/-USDT$/,'')||!rows(s.upstream_groups).length||!hex(s.source_fingerprint))return fail('NATIVE_LIQ_SYMBOL_OR_SOURCE_MISMATCH');
  if(stamp(s.source_ts)===null||stamp(s.acquisition_as_of_ms)===null||s.source_ts>s.acquisition_as_of_ms||s.acquisition_as_of_ms>c.observed_ts)return fail('NATIVE_LIQ_SOURCE_CLOCK_NOT_CLOSED');
  if(now_ms-s.source_ts>max_age_ms)return fail('NATIVE_LIQ_STALE_RECHECK_REQUIRED');
  if(s.model_prices_used!==false||s.not_htx_target!==true)return fail('NATIVE_LIQ_CLASSIFICATION_MISMATCH');
  oldest=Math.min(oldest,s.source_ts);
  for(const z of [...rows(s.above),...rows(s.below)]){
   if(!positive(z.native_price)||!positive(z.native_reference_price)||!positive(z.notional)||!['USD','USDC'].includes(z.notional_unit)||!['LONG','SHORT'].includes(z.liquidated_side)||z.source_fingerprint!==s.source_fingerprint||z.venue!==s.venue||z.source_ts!==s.source_ts||z.not_htx_target!==true)return fail('NATIVE_LIQ_ZONE_PROVENANCE_MISMATCH');
   if((z.liquidated_side==='LONG'&&z.native_price>=z.native_reference_price)||(z.liquidated_side==='SHORT'&&z.native_price<=z.native_reference_price))return fail('NATIVE_LIQ_SIDE_GEOMETRY_MISMATCH');
  }
 }
 const all=sources.flatMap(s=>[...rows(s.above),...rows(s.below)]);
 for(const z of [...rows(view.above),...rows(view.below)])if(!all.some(a=>JSON.stringify(a)===JSON.stringify(z)))return fail('NATIVE_LIQ_SELECTED_LEVEL_NOT_IN_SOURCE');
 if(!all.length)return fail('NATIVE_LIQ_CLOSED_WITHOUT_LEVELS');
 return {ok:true,status:'CLOSED',native:true,oldest_source_ts:oldest,source_age_ms:now_ms-oldest,checked_ts:now_ms,source_time_rewritten:false};
}
export function nativeLiquidationPresentation(c,{manual=false,lifecycle_event=null}={}){
 if(!usesNativeLiquidationView(c))return null;if(String(lifecycle_event).toUpperCase()==='IDEA_REMOVED')return [];
 const proof=verifyNativeLiquidationView(c,{lifecycle_event});if(!proof.ok)return null;
 return [...c.liquidations[manual?'manual_lines':'display_lines']];
}
export function checkNativeTextParity(c,{manual_text,telegram_text,lifecycle_event=null}={}){
 if(!usesNativeLiquidationView(c))return {ok:true,status:'LEGACY_UNCHANGED'};
 const gate=verifyNativeLiquidationView(c,{lifecycle_event});if(!gate.ok)return gate;
 if(String(lifecycle_event).toUpperCase()==='IDEA_REMOVED')return {ok:true,status:'REMOVAL_NO_NEW_LEVELS_REQUIRED'};
 const one=(whole,lines)=>typeof whole==='string'&&lines.every(line=>whole.split('\n').includes(line));
 if(!one(manual_text,c.liquidations.manual_lines)||!one(telegram_text,c.liquidations.display_lines))return {ok:false,reason:'NATIVE_LIQUIDATION_TEXT_MISSING_OR_CHANGED'};
 return {ok:true,status:'EXACT_CANONICAL_LIQUIDATION_TEXT_PRESENT'};
}
