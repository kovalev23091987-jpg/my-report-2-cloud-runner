import {positive, finite, validTime} from '../contracts/index.mjs';
import {unique} from './math.mjs';

const provider=z=>z.primary_provider??z.source;
const currency=z=>z.price_currency??z.price_quote??null;
const lineage=z=>({zone_id:z.zone_id,source:z.source,primary_provider:provider(z),venue:z.venue,market_id:z.market_id,evidence_ref:z.evidence_ref,
  event_ts:z.event_ts,received_ts:z.received_ts,expires_ts:z.expires_ts,basis_type:z.basis_type,model_id:z.model_id??null,model_version:z.model_version??z.relative_scale?.model_version??null,
  position_ids:[...(z.position_ids??[])],overlap_group:z.overlap_group??null,lower:z.lower,upper:z.upper,magnitude_value:z.magnitude_value??null,magnitude_unit:z.magnitude_unit??null,
  relative_scale:z.relative_scale??null,coverage:z.coverage??null,limitations:[...(z.limitations??[])],price_currency:currency(z),price_comparability:z.price_comparability??null});
const overlap=(a,b)=>a.lower<=b.upper&&b.lower<=a.upper;
const compareId=(a,b)=>String(a)<String(b)?-1:String(a)>String(b)?1:0;
function sameEconomicObject(a,b){
  if(provider(a)!==provider(b)||a.venue!==b.venue||a.market_id!==b.market_id||a.basis_type!==b.basis_type)return false;
  if(a.zone_id===b.zone_id)return true;
  if((a.position_ids??[]).some(id=>(b.position_ids??[]).includes(id)))return true;
  return Boolean(a.overlap_group&&a.overlap_group===b.overlap_group&&overlap(a,b));
}
function mergeKey(z){
  const model=z.model_id??z.relative_scale?.scale_id,version=z.model_version??z.relative_scale?.model_version;
  if(!provider(z)||!z.venue||!z.market_id)return null;
  if(z.basis_type==='EXTERNAL_MODEL'&&(!model||!version))return null;
  return JSON.stringify([z.asset_id,provider(z),z.venue,z.market_id,currency(z),z.basis_type,model??null,version??null,z.event_ts,
    z.magnitude_unit??null,z.relative_scale?.scale_id??null,z.price_mapping_evidence_ref??z.price_comparability?.evidence_ref??null]);
}
function magnitudeTier(z){
  if(!finite(z.magnitude_value)||z.magnitude_value<0||!['USD','USDT','USDC'].includes(z.magnitude_unit))return null;
  return z.magnitude_value>=1000000?'огромная':z.magnitude_value>=100000?'большая':z.magnitude_value>=10000?'средняя':null;
}
function strengthComparable(a,b){return a.magnitude_unit&&a.magnitude_unit===b.magnitude_unit&&finite(a.magnitude_value)&&finite(b.magnitude_value)&&
  (a.magnitude_unit!=='RELATIVE_INTENSITY'||provider(a)===provider(b)&&a.relative_scale?.scale_id&&a.relative_scale.scale_id===b.relative_scale?.scale_id);}
export function selectZones(map, instrument, reference, normalRange, at, profile){
  const rejected=[],kept=[],rows=Array.isArray(map?.zones)?map.zones:[];
  for(const z of rows){
    const ttl=z?.basis_type==='OBSERVED_POSITION'?profile.freshness_ms.observed_positions:profile.freshness_ms.model_map;
    let reason=null;
    if(z?.usable!==true||typeof z.zone_id!=='string'||!z.zone_id||typeof z.source!=='string'||!z.source||!z.venue||!z.market_id||!z.evidence_ref||z.asset_id!==instrument.asset_id||
      !['OBSERVED_POSITION','EXTERNAL_MODEL'].includes(z.basis_type)||!positive(z.lower)||!positive(z.upper)||z.upper<z.lower)reason='ZONE_NOT_QUALIFIED';
    else if(!validTime(z.event_ts)||!validTime(z.received_ts)||!validTime(z.expires_ts)||z.event_ts>z.received_ts||z.received_ts>at||z.expires_ts<at||at-z.event_ts>ttl)reason='ZONE_CLOCK_NOT_USABLE';
    else if(currency(z)!=='USDT'||z.venue!=='BINGX'&&!z.price_comparability?.evidence_ref&&!z.price_mapping_evidence_ref)reason='ZONE_PRICE_NOT_COMPARABLE_TO_BINGX_USDT';
    else if(!(z.upper<reference||z.lower>reference))reason='ZONE_OVERLAPS_REFERENCE';
    if(reason){rejected.push({zone_id:z?.zone_id??null,reason});continue;}
    const magnitude=finite(z.magnitude_value)&&z.magnitude_value>=0&&z.magnitude_unit?z.magnitude_value:null;
    kept.push({...z,magnitude_value:magnitude,magnitude_unit:magnitude!==null?z.magnitude_unit:null,position_ids:[...(z.position_ids??[])],limitations:[...(z.limitations??[])],components:[lineage(z)]});
  }
  // Select one coherent original for duplicate/overlapping economic coverage;
  // preserve every original in lineage, never add the reported amounts.
  const dedup=[];
  for(const z of kept.slice().sort((a,b)=>b.event_ts-a.event_ts||compareId(a.zone_id,b.zone_id))){
    const prior=dedup.find(a=>sameEconomicObject(a,z));
    if(prior){prior.components.push(...z.components);prior.limitations=unique([...prior.limitations,'OVERLAPPING_COVERAGE_NOT_SUMMED']);}
    else dedup.push(z);
  }
  const clusters=[],maxWidth=positive(normalRange)?normalRange*profile.liquidation_merge_max_width_normal_range:null,gap=positive(normalRange)?normalRange*profile.liquidation_merge_gap_normal_range:0;
  for(const z of dedup.sort((a,b)=>a.lower-b.lower||compareId(a.zone_id,b.zone_id))){
    const key=mergeKey(z),side=z.lower>reference?'UP':'DOWN';
    const c=key&&maxWidth!==null?clusters.find(c=>c.key===key&&c.side===side&&z.lower-c.upper<=gap&&Math.max(z.upper,c.upper)-Math.min(z.lower,c.lower)<=maxWidth):null;
    if(!c){clusters.push({...z,key,side,member_ids:[z.zone_id]});continue;}
    c.lower=Math.min(c.lower,z.lower);c.upper=Math.max(c.upper,z.upper);c.components.push(...z.components);c.member_ids.push(z.zone_id);
    c.position_ids=unique([...c.position_ids,...z.position_ids]);c.limitations=unique([...c.limitations,...z.limitations,'MERGED_MAGNITUDE_MAX_SINGLE_COMPONENT_NOT_SUMMED']);
    if(strengthComparable(c,z)&&z.magnitude_value>c.magnitude_value)c.magnitude_value=z.magnitude_value;
    else if(!strengthComparable(c,z)){c.magnitude_value=null;c.magnitude_unit=null;}
  }
  const qualified=clusters.map(c=>{const {key,...zone}=c;return {...zone,zone_id:c.member_ids.join('+'),source_ids:unique(c.components.map(x=>x.source)),
    distance_pct:100*((c.side==='UP'?c.lower:c.upper)/reference-1),strength_label_ru:magnitudeTier(c),magnitude_semantics:c.components.length>1?'MAX_SINGLE_COMPONENT_NOT_SUMMED':'REPORTED_COMPONENT',
    expires_ts:Math.min(...c.components.map(x=>x.expires_ts)),event_ts:Math.min(...c.components.map(x=>x.event_ts))};});
  const choose=side=>{
    const sorted=qualified.filter(z=>z.side===side).sort((a,b)=>Math.abs(a.distance_pct)-Math.abs(b.distance_pct)||a.lower-b.lower),chosen=[];
    if(!sorted.length)return chosen;
    chosen.push({...sorted[0],selection_role:'NEAREST'});
    const rest=sorted.slice(1),known=rest.find(z=>finite(z.magnitude_value)&&z.magnitude_unit),comparable=known?rest.filter(z=>strengthComparable(z,known)):[];
    const strongest=comparable.sort((a,b)=>b.magnitude_value-a.magnitude_value||Math.abs(a.distance_pct)-Math.abs(b.distance_pct))[0]??rest[0];
    if(strongest)chosen.push({...strongest,selection_role:comparable.length?'STRONGEST_COMPARABLE_REMAINING':'NEAREST_REMAINING_STRENGTH_UNKNOWN'});
    const distant=rest.filter(z=>!chosen.some(c=>c.zone_id===z.zone_id)).sort((a,b)=>Math.abs(b.distance_pct)-Math.abs(a.distance_pct))[0];
    if(distant)chosen.push({...distant,selection_role:'DISTANT_CONTEXT'});
    return chosen.slice(0,profile.maximum_liquidation_zones_per_side);
  };
  const up=choose('UP'),down=choose('DOWN'),any=up.length+down.length>0,partial=map?.status!=='USABLE'||rejected.length>0||!up.length||!down.length;
  return {status:any?(partial?'PARTIAL':'USABLE'):(rows.length?'ABSENT':map?.status??'NOT_CHECKED'),reason:any?(partial?map?.reason??'PARTIAL_QUALIFIED_MAP':null):map?.reason??'NO_QUALIFIED_ZONES',
    zones_up:up,zones_down:down,coverage:map?.coverage??null,rejected_zones:rejected,checked_sources:[...(map?.checked_sources??[])],map_mode:any?'WITH_MAP':'WITHOUT_MAP',qualified_zone_count:qualified.length};
}
