export const DYNAMIC_LIQUIDATION_PANEL_VERSION='dynamic-liquidation-panel-v2-receipt-freshness-20260929';
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const text=v=>String(v??'').trim();
const side=v=>{const s=text(v).toUpperCase();return s==='LONG'||s==='SHORT'?s:null;};

// Discovery ranks candidates only; it cannot create a liquidation level.
export function selectRepresentativePositions(rows,{reference_price,max_positions=4,max_per_account=1}={}){
 const ref=finite(reference_price);
 if(!Array.isArray(rows)||ref===null||ref<=0||!Number.isSafeInteger(max_positions)||max_positions<1||max_positions>8)throw Error('REPRESENTATIVE_SELECTION_POLICY_REQUIRED');
 const clean=[];
 for(const row of rows){
  const account=text(row?.account??row?.address).toLowerCase(),s=side(row?.side),liq=finite(row?.liquidation_price??row?.liq_price),notional=finite(row?.notional_usd??row?.notional??row?.position_value);
  if(!account||!s||liq===null||liq<=0||notional===null||notional<=0)continue;
  if(s==='LONG'?liq>=ref:liq<=ref)continue;
  clean.push({...row,account,side:s,liquidation_price:liq,notional_usd:notional,distance_abs_pct:Math.abs((liq/ref-1)*100)});
 }
 const groups=[];
 for(const s of ['LONG','SHORT']){const set=clean.filter(r=>r.side===s);
  groups.push({reason:`NEAREST_${s}_NATIVE_RECHECK`,rows:[...set].sort((a,b)=>a.distance_abs_pct-b.distance_abs_pct||b.notional_usd-a.notional_usd)});
  groups.push({reason:`LARGEST_${s}_NATIVE_RECHECK`,rows:[...set].sort((a,b)=>b.notional_usd-a.notional_usd||a.distance_abs_pct-b.distance_abs_pct)});
 }
 const selected=[],used=new Map(),keys=new Set();let changed=true;
 while(selected.length<max_positions&&changed){changed=false;for(const group of groups){while(group.rows.length){const row=group.rows.shift(),key=`${row.account}|${row.side}|${row.liquidation_price}`;if(keys.has(key)||(used.get(row.account)||0)>=max_per_account)continue;keys.add(key);used.set(row.account,(used.get(row.account)||0)+1);selected.push({...row,selection_reason:group.reason});changed=true;break;}if(selected.length===max_positions)break;}}
 return {version:DYNAMIC_LIQUIDATION_PANEL_VERSION,policy:'NEAR_LARGE_LONG_SHORT_BALANCED_NATIVE_ONLY',selected,visible_valid_positions:clean.length,unique_selected_accounts:used.size,max_per_account,discovery_values_are_evidence:false};
}

function canonicalZone(row,provider,referencePrice,{observed_ts,max_age_ms=120000}={}){
 const price=finite(row?.native_price??row?.price??row?.liquidation_price),notional=finite(row?.notional_usd??row?.notional),s=side(row?.liquidated_side??row?.side),ref=finite(row?.native_reference_price??referencePrice);
 if(price===null||price<=0||notional===null||notional<=0||!s||ref===null||ref<=0)return null;
 const distance=(price/ref-1)*100;if(s==='LONG'?distance>=0:distance<=0)return null;
 const cross=row?.conditional_cross===true||row?.conditional_on_other_positions===true||text(row?.margin_mode).toUpperCase()==='CROSS';
 const sourceTs=finite(row?.source_ts),observed=finite(observed_ts),fresh=sourceTs!==null&&observed!==null&&sourceTs<=observed&&observed-sourceTs<=max_age_ms;
 return {provider,position_key:text(row?.position_key)||`${provider}|${text(row?.account_reference_fingerprint??row?.account)}|${s}|${price}`,native_price:price,notional_usd:notional,liquidated_side:s,distance_pct:distance,cross_margin:cross,weighted_notional:notional*(cross?0.5:1),source_ts:sourceTs,fresh,decision_target_eligible:fresh};
}

// Agreement is clustered by price; notionals from different venues are never summed.
export function buildDynamicLiquidationPanel({contexts=[],reference_price,tolerance_pct=0.75,observed_ts=Date.now()}={}){
 const ref=finite(reference_price);if(ref===null||ref<=0)return{version:DYNAMIC_LIQUIDATION_PANEL_VERSION,status:'NOT_CLOSED',reason:'REFERENCE_PRICE_REQUIRED',clusters:[],score_evidence:null};
 const zones=[],seen=new Set();let staleZonesExcluded=0;
 for(const context of Array.isArray(contexts)?contexts:[]){if(!context||!['USABLE_NATIVE_SAMPLE','USABLE_SCOPED_NATIVE_CONTEXT','USABLE_SCOPED_CONTEXT'].includes(text(context.status)))continue;const provider=text(context.provider??context.venue)||'UNKNOWN',maxAge=finite(context?.freshness_max_age_ms)??120000;for(const row of [...(context.above||[]),...(context.below||[]),...(context.zones||[])]){const z=canonicalZone(row,provider,ref,{observed_ts,max_age_ms:maxAge});if(!z||seen.has(z.position_key))continue;seen.add(z.position_key);if(!z.fresh){staleZonesExcluded++;continue;}zones.push(z);}}
 zones.sort((a,b)=>a.native_price-b.native_price);const clusters=[];
 for(const z of zones){let c=clusters.find(x=>x.side===z.liquidated_side&&Math.abs((z.native_price/x.center_price-1)*100)<=tolerance_pct);if(!c){c={side:z.liquidated_side,center_price:z.native_price,zones:[],providers:new Set()};clusters.push(c);}c.zones.push(z);c.providers.add(z.provider);c.center_price=c.zones.reduce((s,x)=>s+x.native_price,0)/c.zones.length;}
 const output=clusters.map(c=>({liquidated_side:c.side,center_price:c.center_price,distance_pct:(c.center_price/ref-1)*100,provider_count:c.providers.size,providers:[...c.providers].sort(),position_count:c.zones.length,largest_provider_position_usd:Math.max(...c.zones.map(z=>z.weighted_notional)),source_ts:Math.max(...c.zones.map(z=>z.source_ts??0))||null,decision_target_eligible:c.zones.some(z=>z.decision_target_eligible===true),path_obstacle_eligible:true,identity_status:'EXACT_NATIVE_MARKET',notional_summed_across_providers:false,cross_margin_discount_applied:c.zones.some(z=>z.cross_margin),agreement:c.providers.size>=2?'MULTI_PROVIDER':'SINGLE_PROVIDER'}));
 const strength=s=>output.filter(c=>c.liquidated_side===s&&Math.abs(c.distance_pct)<=10).reduce((m,c)=>Math.max(m,Math.log10(1+c.largest_provider_position_usd)*(c.provider_count>=2?1.2:1)),0);
 const above=strength('SHORT'),below=strength('LONG'),den=above+below,directional=den>0?clamp((above-below)/den,-1,1):0,providerCount=new Set(output.flatMap(c=>c.providers)).size;
 const quality=zones.length?clamp(0.35+0.1*Math.min(3,providerCount)+0.05*Math.min(4,zones.length),0,0.85):0;
 return {version:DYNAMIC_LIQUIDATION_PANEL_VERSION,status:zones.length?'CLOSED':'NOT_CLOSED',observed_ts,reference_price:ref,zones_seen:zones.length,stale_zones_excluded:staleZonesExcluded,provider_count:providerCount,clusters:output,notional_summed_across_providers:false,one_position_counted_once:true,cross_margin_weight:0.5,score_evidence:zones.length?{source_id:'DYNAMIC_LIQUIDATION_PANEL',responsibility_group:'PROJECTED_LIQUIDATIONS',decision_chain:'CROSS_EXCHANGE_DERIVATIVES',bullish_strength:directional,quality,asset_identity:'EXACT_NATIVE_MARKET',metric_family:'VERIFIED_LIQUIDATION_IMBALANCE',provider_object_id:'DYNAMIC_REPRESENTATIVE_PANEL',fresh:true,source_ts:Math.max(...zones.map(z=>z.source_ts)),exact_identity:true}:null};
}

export default{selectRepresentativePositions,buildDynamicLiquidationPanel};
