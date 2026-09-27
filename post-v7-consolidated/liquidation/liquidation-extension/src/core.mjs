import {createHash} from 'node:crypto';
export const VERSION='report2-free-liquidation-evidence-v1-research-20260927';
export const num=v=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
export const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function timestamp(v,{utcSpace=false}={}){
 if(typeof v==='number')return Number.isSafeInteger(v)&&v>=1e12?v:null;
 if(typeof v!=='string')return null;
 const x=utcSpace&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}$/.test(v)?v.replace(' ','T')+'Z':v;
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(x))return null;
 const n=Date.parse(x);return Number.isSafeInteger(n)&&n>=1e12?n:null;
}
export function stable(v){if(Array.isArray(v))return v.map(stable);if(obj(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
export const fingerprint=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
export function context(c){
 if(!obj(c)||typeof c.symbol!=='string'||!c.symbol.trim()||c.symbol!==c.symbol.trim())throw Error('NATIVE_SYMBOL_REQUIRED');
 if(timestamp(c.as_of_ms)===null||timestamp(c.received_at_ms)===null||c.received_at_ms>c.as_of_ms)throw Error('AS_OF_RECEIPT_INVALID');
 if(!(num(c.max_age_ms)>0))throw Error('EXPLICIT_FRESHNESS_POLICY_REQUIRED');
 if(typeof c.snapshot_id!=='string'||!c.snapshot_id||typeof c.run_id!=='string'||!c.run_id)throw Error('ANALYSIS_BINDING_REQUIRED');
 return c;
}
export function base(provider,c,upstreams,kind,extra={}){
 context(c);return {version:VERSION,provider,native_symbol:c.symbol,run_id:c.run_id,snapshot_id:c.snapshot_id,analysis_as_of_ms:c.as_of_ms,received_at_ms:c.received_at_ms,
 upstream_groups:upstreams,evidence_class:kind,execution_venue:'HTX',native_levels_are_htx_levels:false,execution_alias_verified:c.execution_alias_verified===true,
 usable_for_context:false,execution_target_eligible:false,automatic_execution:false,status:'NOT_CLOSED',zones:[],reasons:[],...extra};
}
export function fail(b,reason,extra={}){return seal({...b,...extra,status:reason,usable_for_context:false,zones:[],reasons:[...b.reasons,reason]});}
export function seal(b){const c={...b};delete c.fingerprint;return {...c,fingerprint:fingerprint(c)};}
export function sourceClock(b,source,c,{utcSpace=false}={}){
 const ts=timestamp(source,{utcSpace});
 if(ts===null)return {ok:false,reason:'SOURCE_TIMESTAMP_MISSING'};
 if(ts>c.as_of_ms)return {ok:false,reason:'FUTURE_SOURCE_TIMESTAMP'};
 if(ts>c.received_at_ms)return {ok:false,reason:'SOURCE_AFTER_RECEIPT'};
 const age=c.as_of_ms-ts;return {ok:age<=c.max_age_ms,reason:age>c.max_age_ms?'STALE_SOURCE':null,source_ts:ts,source_age_ms:age};
}
export function zone({price,notional,side,ref,count=null,notionalUnit='USD',...extra}){
 const p=num(price),n=num(notional),r=num(ref),ct=num(count);
 if(p===null||p<=0||n===null||n<0||r===null||r<=0||!['LONG','SHORT'].includes(side))throw Error('ZONE_SCHEMA_INVALID');
 if(count!==null&&(ct===null||!Number.isSafeInteger(ct)||ct<0))throw Error('POSITION_COUNT_INVALID');
 return {native_price:p,liquidated_side:side,notional:n,notional_unit:notionalUnit,notional_usd:notionalUnit==='USD'?n:null,position_count:ct,native_reference_price:r,distance_pct:(p/r-1)*100,...extra};
}
export function complete(b,zones,extra={}){
 if(!zones.every(x=>obj(x)&&num(x.native_price)>0&&num(x.notional)!==null&&num(x.notional)>=0))return fail(b,'ZONE_VALIDATION_FAILED');
 const selected=zones.filter(x=>x.notional>0);
 return seal({...b,...extra,zones:selected,status:selected.length?'USABLE_SCOPED_CONTEXT':'SCOPED_NO_NONZERO_ZONES',usable_for_context:true});
}
export function selectZones(b,{distant_pct=10}={}){
 if(!b.usable_for_context||fingerprint((({fingerprint:_,...r})=>r)(b))!==b.fingerprint)return {status:'SOURCE_OR_FINGERPRINT_NOT_CLOSED',above:[],below:[]};
 const one=sign=>{
  const rows=b.zones.filter(z=>sign*z.distance_pct>0);
  const out=new Map();const add=(z,role)=>{if(!z)return;const key=`${z.liquidated_side}:${z.native_price}`;const prev=out.get(key);out.set(key,{...z,selection_roles:[...(prev?.selection_roles||[]),role]});};
  add([...rows].sort((a,b)=>Math.abs(a.distance_pct)-Math.abs(b.distance_pct))[0],'NEAREST_NONZERO');
  add([...rows].sort((a,b)=>b.notional-a.notional)[0],'LARGEST_VISIBLE');
  add(rows.filter(z=>Math.abs(z.distance_pct)>=distant_pct).sort((a,b)=>b.notional-a.notional)[0],'LARGEST_DISTANT');
  return [...out.values()];
 };
 return {status:'CLOSED_SCOPED_SELECTION',above:one(1),below:one(-1),notional_summed_across_providers:false};
}
export function combineSameAsset(receipts,{symbol,run_id,snapshot_id,as_of_ms}={}){
 const accepted=[],rejected=[],seenFingerprints=new Set();
 for(const r of receipts){const {fingerprint:f,...body}=r;
  if(r.native_symbol!==symbol||r.run_id!==run_id||r.snapshot_id!==snapshot_id||r.analysis_as_of_ms!==as_of_ms||fingerprint(body)!==f){rejected.push({provider:r.provider,reason:'EXACT_BINDING_OR_FINGERPRINT_MISMATCH'});continue;}
  if(seenFingerprints.has(f))continue;seenFingerprints.add(f);accepted.push(r);
 }
 // Connected components of overlapping upstream sets, not one vote per app.
 const components=[];
 for(const r of accepted.filter(x=>x.usable_for_context&&x.evidence_class!=='REALIZED_EVENTS')){
  let component={groups:new Set(r.upstream_groups),providers:new Set([r.provider])};
  for(let i=components.length-1;i>=0;i--)if([...component.groups].some(g=>components[i].groups.has(g))){const old=components.splice(i,1)[0];for(const g of old.groups)component.groups.add(g);for(const p of old.providers)component.providers.add(p);}
  components.push(component);
 }
 const result={version:VERSION,symbol,run_id,snapshot_id,analysis_as_of_ms:as_of_ms,receipts:accepted,rejected,projected_upstream_components:components.map(c=>({groups:[...c.groups].sort(),providers:[...c.providers].sort()})),
  notional_summed_across_providers:false,independent_votes_generated:false,execution_target_eligible:false,production_wired:false};
 return {...result,fingerprint:fingerprint(result)};
}
export function changedZone(before,after,{realized=[]}={}){
 if(before.provider!==after.provider||before.native_symbol!==after.native_symbol||!after.usable_for_context)return {status:'NOT_COMPARABLE'};
 const absent=before.zones.filter(z=>!after.zones.some(a=>a.liquidated_side===z.liquidated_side&&a.native_price===z.native_price));
 return {status:'COMPARISON_ONLY',no_longer_reported:absent.length,liquidated_confirmed:0,realized_events_observed:realized.length,note:'An absent or moved bucket is not proof that the position was liquidated; exact venue/time/position matching is required.'};
}
