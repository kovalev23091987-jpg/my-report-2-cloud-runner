export const LIQUIDATION_SOURCE_WEIGHTING_VERSION='liquidation-source-weighting-v3-exact-asset-role-20261014';

export const LIQUIDATION_SOURCE_ROLES=Object.freeze({
 DYDX_PINNED_NATIVE:'dYdX: pinned complete-account conditional calculated estimates',
 HYPERLIQUID_NATIVE:'Hyperliquid: verified native position liquidation prices',
 LIQFLOW_DISCOVERY:'LiqFlow: discovery of relevant Hyperliquid accounts and model context',
 GTRADE_NATIVE:'gTrade: native positions and dynamic fees',
 LIGHTER_NATIVE:'Lighter: exact-market native account liquidation prices',
 GMX_NATIVE:'GMX: exact-market native position liquidation prices',
 OXARCHIVE_HL_BUCKETS:'0xArchive: bounded Hyperliquid projected liquidation-level buckets',
});

const clamp=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const sourceId=value=>String(value??'').trim().toUpperCase();
export const NATIVE_ROLE_PRIORITY_INDEX='idx_report2_liq_role_contract_source_time';
export const NATIVE_ROLE_PRIOR_MAX_ROWS=4;
export function exactAssetRolePriority({row,contract,role,run_id,now}={}){
 const neutral={priority:0,samples:0,useful:0,empty:0,scope:'HISTORICAL_COLLECTION_UTILITY_ONLY',current_asset_coverage:false,predictive_weight_changed:false};
 if(typeof contract!=='string'||!contract.endsWith('-USDT')||!Number.isSafeInteger(now)||row?.role_prior_contract!==contract||row?.role_prior_role!==role)return neutral;
 let history;try{history=JSON.parse(row.role_prior_json);}catch{return neutral;}
 if(!Array.isArray(history)||history.length>NATIVE_ROLE_PRIOR_MAX_ROWS)return neutral;
 const seen=new Set(),accepted=[];
 for(const item of history){
  if(item?.contract!==contract||item.role!==role||item.source_id!==row.source_id||typeof item.run_id!=='string'||!item.run_id||item.run_id===run_id||seen.has(item.run_id)||!Number.isSafeInteger(item.observed_ts)||item.observed_ts>now||now-item.observed_ts>86400000||![0,1].includes(item.role_usable))return neutral;
  seen.add(item.run_id);
  if(item.role_usable===1)accepted.push({useful:true});
  else if(Number.isSafeInteger(item.actual_http)&&item.actual_http>=0&&['DYDX_NO_ELIGIBLE_SAMPLE_LEVEL','ACQUISITION_RETURNED'].includes(item.status))accepted.push({useful:false});
 }
 const useful=accepted.filter(x=>x.useful).length,empty=accepted.length-useful;
 return {...neutral,priority:useful>0?1:empty>=2?-1:0,samples:accepted.length,useful,empty};
}
export const unsignedSourceHash=value=>{let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};

export function buildLiquidationSourceWeightProfile(lanes,rows=[]){
 const prior=new Map((Array.isArray(rows)?rows:[]).map(row=>[sourceId(row?.source_id),row]));
 return [...new Set((Array.isArray(lanes)?lanes:[]).map(sourceId).filter(Boolean))].map(id=>{
  const row=prior.get(id),attempts=Math.max(0,Number(row?.attempts)||0);
  const reliability=attempts?clamp(Number(row?.reliability)||0,0,1):0.5,predictiveObservations=Math.max(0,Number(row?.predictive_observations)||0),predictiveEligible=row?.activation_state==='ACTIVE'&&row?.eligibility_protocol==='T16_5'&&Number(row?.predictive_eligible)===1&&predictiveObservations>=200,predictiveFactor=predictiveEligible?clamp(Number(row?.predictive_weight_factor)||1,0.75,1.25):1;
  const reportedAccuracy=typeof row?.predictive_accuracy==='number'&&Number.isFinite(row.predictive_accuracy)&&row.predictive_accuracy>=0&&row.predictive_accuracy<=1?row.predictive_accuracy:null;
  return {source_id:id,responsibility:LIQUIDATION_SOURCE_ROLES[id]||'Verified supplemental liquidation context',attempts,usable_runs:Math.max(0,Number(row?.usable_runs)||0),not_closed_runs:Math.max(0,Number(row?.not_closed_runs)||0),reliability:Number(reliability.toFixed(4)),predictive_observations:predictiveObservations,predictive_accuracy:predictiveObservations>0?reportedAccuracy:null,predictive_weight_factor:Number(predictiveFactor.toFixed(4)),predictive_weight_eligible:predictiveEligible,selection_weight:Number(Math.max(0.5,(0.5+reliability)*predictiveFactor).toFixed(4)),exploration_floor:0.5,last_status:row?.last_status||null,updated_ts:Number(row?.updated_ts)||null};
 });
}

export function chooseWeightedLiquidationLane({lanes,seed,rows=[]}={}){
 const profile=buildLiquidationSourceWeightProfile(lanes,rows);
 if(!profile.length)return{lane:null,profile,total_weight:0};
 const total=profile.reduce((sum,row)=>sum+row.selection_weight,0);
 let cursor=(unsignedSourceHash(seed)/0x100000000)*total;
 for(const row of profile){cursor-=row.selection_weight;if(cursor<0)return{lane:row.source_id,profile,total_weight:Number(total.toFixed(4))};}
 return{lane:profile.at(-1).source_id,profile,total_weight:Number(total.toFixed(4))};
}

// Availability is an operational statistic, never predictive accuracy. An exact
// native route and a projected bucket are different roles, not substitutes.
export function planLiquidationSourceOrder({lanes=[],rows=[],costs={},exact=[],cached=[],clock_capable=[],preferred=null,now=Date.now(),contract=null,run_id=null}={}){
 const assetRows=new Map(rows.map(row=>[sourceId(row?.source_id),row]));
 const profile=buildLiquidationSourceWeightProfile(lanes,rows),known=new Set(exact),reuse=new Set(cached),clockCapable=new Set(clock_capable);
 const plan=profile.map(row=>{
  const projected=row.source_id==='OXARCHIVE_HL_BUCKETS',cost=Number(costs[row.source_id]);
  const role=projected?'PROJECTED_BUCKET_CONTEXT':'NATIVE_POSITION_CONTEXT';
  const assetRow=assetRows.get(row.source_id),assetPrior=exactAssetRolePriority({row:assetRow,contract,role,run_id,now});
  const scopedPrior=assetRow?.role_prior_contract===contract&&assetRow?.role_prior_role===role;
  const coverage=known.has(row.source_id)?'EXACT_ROUTE_PROVEN':'CATALOG_DISCOVERY_REQUIRED';
  // An empty verified sample is a successful transport, not useful level
  // evidence. Reuse the existing health row; do not add reads, writes or a
  // provider blacklist. This prior is collection utility only, never current
  // asset coverage, a prediction, a level, a vote or an ENTRY fact.
  const recent=Number.isSafeInteger(now)&&Number.isSafeInteger(row.updated_ts)&&row.updated_ts<=now&&now-row.updated_ts<=86400000;
  const roleMissing=!projected&&(scopedPrior?assetPrior.priority<0:recent&&(row.last_status==='DYDX_NO_ELIGIBLE_SAMPLE_LEVEL'||String(row.last_status||'').startsWith('ROLE_NOT_USABLE:NATIVE_POSITION_CONTEXT:')));
  const roleWeight=roleMissing?Math.min(row.selection_weight,row.exploration_floor):row.selection_weight;
  // A mapped account endpoint and frequent successful receipts do not prove
  // the time of its open positions. Give a clock-verifiable producer a chance
  // before receipt-only routes spend the shared envelope. This is capability,
  // never a claim that this particular acquisition is fresh or accepted.
  return {...row,role,coverage,cached_snapshot:reuse.has(row.source_id),routing_preference:!projected&&clockCapable.has(row.source_id)&&row.source_id===preferred?1:0,position_clock_verifiable:!projected&&clockCapable.has(row.source_id),clock_capability_priority:!projected&&clockCapable.has(row.source_id)?1:0,declared_http:Number.isSafeInteger(cost)&&cost>=0?cost:null,
   priority:projected?0:reuse.has(row.source_id)?3:known.has(row.source_id)?2:1,exact_asset_role_prior:assetPrior,
   recent_role_not_usable:roleMissing,role_selection_weight:roleWeight,role_hint_max_age_ms:86400000,role_hint_is_not_current_asset_coverage:true,
   utility_basis:roleMissing?'RECENT_EMPTY_ROLE_WITH_EXPLORATION_FLOOR':row.predictive_weight_eligible?'QUALIFIED_PREDICTIVE_FACTOR_WITHIN_ROLE':'OPERATIONAL_AVAILABILITY_ONLY',
   utility_per_reserved_http:roleWeight/Math.max(1,Number.isSafeInteger(cost)?cost:999)};
 }).sort((a,b)=>b.clock_capability_priority-a.clock_capability_priority||Number(b.cached_snapshot)-Number(a.cached_snapshot)||Number(b.exact_asset_role_prior.priority>0)-Number(a.exact_asset_role_prior.priority>0)||b.routing_preference-a.routing_preference||b.priority-a.priority||b.exact_asset_role_prior.priority-a.exact_asset_role_prior.priority||b.utility_per_reserved_http-a.utility_per_reserved_http||a.source_id.localeCompare(b.source_id));
 return {ordered:plan.map(row=>row.source_id),profile:plan,policy:'VERIFIABLE_POSITION_CLOCK_THEN_EXACT_NATIVE_ROLE_AND_AVAILABILITY_PER_COST'};
}

export function nextLiquidationSourceReliability(current,outcome){
 const prior=clamp(Number.isFinite(Number(current))?Number(current):0.5,0,1),result=outcome===true?1:0;
 return Number((prior*0.85+result*0.15).toFixed(6));
}

export function createLiquidationSourceWeightStore({db,clock=Date.now}={}){
 if(!db)throw new Error('LIQUIDATION_SOURCE_WEIGHT_DB_REQUIRED');
 let installed=false;
 async function install(){if(installed)return;await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_liquidation_source_health (source_id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, usable_runs INTEGER NOT NULL, not_closed_runs INTEGER NOT NULL, reliability REAL NOT NULL, last_status TEXT, updated_ts INTEGER NOT NULL)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_liquidation_predictive_health (source_id TEXT PRIMARY KEY, observations INTEGER NOT NULL, hits INTEGER NOT NULL, ewma_accuracy REAL NOT NULL, predictive_weight_factor REAL NOT NULL, eligible INTEGER NOT NULL, updated_ts INTEGER NOT NULL)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_liquidation_role_observation (run_id TEXT NOT NULL,contract TEXT NOT NULL,source_id TEXT NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,role_usable INTEGER NOT NULL,actual_http INTEGER,observed_ts INTEGER NOT NULL,PRIMARY KEY(run_id,contract,source_id))`),
 ]);installed=true;}
 let roleIndexReady;
 async function load(lanes=[],context={}){
  await install();const wanted=new Set(lanes.map(sourceId));
  const exactContext=wanted.size<=12&&typeof context.contract==='string'&&/^[^-\s]+-USDT$/u.test(context.contract)&&typeof context.run_id==='string'&&context.run_id&&Number.isSafeInteger(context.now);
  if(exactContext&&roleIndexReady===undefined){const ready=await db.prepare(`SELECT sql FROM (SELECT name,type,sql FROM sqlite_master LIMIT 2048) WHERE type='index' AND name=?1 LIMIT 1`).bind(NATIVE_ROLE_PRIORITY_INDEX).first();roleIndexReady=typeof ready?.sql==='string'&&/ON\s+report2_liquidation_role_observation\s*\(\s*contract\s*,\s*role\s*,\s*source_id\s*,\s*observed_ts\s+DESC\s*,\s*run_id\s+DESC\s*\)/i.test(ready.sql);}
  // The growing role table is read only through its verified index. Index
  // creation has its own bounded migration, never a hidden cold-run write.
  const prior=exactContext&&roleIndexReady?`,?1 AS role_prior_contract,CASE WHEN h.source_id='OXARCHIVE_HL_BUCKETS' THEN 'PROJECTED_BUCKET_CONTEXT' ELSE 'NATIVE_POSITION_CONTEXT' END AS role_prior_role,(SELECT json_group_array(json_object('contract',r.contract,'role',r.role,'source_id',r.source_id,'run_id',r.run_id,'status',r.status,'role_usable',r.role_usable,'actual_http',r.actual_http,'observed_ts',r.observed_ts)) FROM (SELECT contract,role,source_id,run_id,status,role_usable,actual_http,observed_ts FROM report2_liquidation_role_observation INDEXED BY ${NATIVE_ROLE_PRIORITY_INDEX} WHERE contract=?1 AND source_id=h.source_id AND role=CASE WHEN h.source_id='OXARCHIVE_HL_BUCKETS' THEN 'PROJECTED_BUCKET_CONTEXT' ELSE 'NATIVE_POSITION_CONTEXT' END AND observed_ts BETWEEN ?2 AND ?3 AND run_id<>?4 ORDER BY observed_ts DESC,run_id DESC LIMIT ${NATIVE_ROLE_PRIOR_MAX_ROWS}) r) AS role_prior_json`:'';
  let statement=db.prepare(`SELECT h.source_id,h.attempts,h.usable_runs,h.not_closed_runs,h.reliability,h.last_status,h.updated_ts,p.observations AS predictive_observations,p.ewma_accuracy AS predictive_accuracy,p.predictive_weight_factor,p.eligible AS predictive_eligible,'SHADOW' AS activation_state,'LEGACY_DISABLED' AS eligibility_protocol${prior} FROM report2_liquidation_source_health h LEFT JOIN report2_liquidation_predictive_health p ON p.source_id=h.source_id WHERE h.source_id IN (SELECT value FROM json_each(?${prior?5:1}))`);
  if(prior)statement=statement.bind(context.contract,context.now-86400000,context.now,context.run_id,JSON.stringify([...wanted]));
  else statement=statement.bind(JSON.stringify([...wanted]));
  const result=await statement.all();
  return (result?.results||[]).filter(row=>wanted.has(sourceId(row?.source_id)));
 }
 async function record({source_id,usable,status,now=clock()}={}){
  await install();const id=sourceId(source_id);if(!id||typeof usable!=='boolean')return{recorded:false,reason:'EVALUATED_BOOLEAN_REQUIRED'};
  const prior=await db.prepare(`SELECT reliability FROM report2_liquidation_source_health WHERE source_id=?1 LIMIT 1`).bind(id).first();
  const reliability=nextLiquidationSourceReliability(prior?.reliability,usable);
  await db.prepare(`INSERT INTO report2_liquidation_source_health(source_id,attempts,usable_runs,not_closed_runs,reliability,last_status,updated_ts) VALUES(?1,1,?2,?3,?4,?5,?6) ON CONFLICT(source_id) DO UPDATE SET attempts=attempts+1,usable_runs=usable_runs+excluded.usable_runs,not_closed_runs=not_closed_runs+excluded.not_closed_runs,reliability=excluded.reliability,last_status=excluded.last_status,updated_ts=excluded.updated_ts`).bind(id,usable?1:0,usable?0:1,reliability,String(status||'UNKNOWN').slice(0,80),now).run();
  return{recorded:true,source_id:id,reliability,usable,status:String(status||'UNKNOWN')};
 }
 async function recordRole({source_id,contract,run_id,role,status,role_usable,actual_http=null,now=clock()}={}){
  await install();if(!sourceId(source_id)||!contract||!run_id||typeof role_usable!=='boolean')return{recorded:false,reason:'ROLE_IDENTITY_REQUIRED'};
  const http=Number.isSafeInteger(actual_http)&&actual_http>=0?actual_http:null;
  await db.prepare(`INSERT INTO report2_liquidation_role_observation(run_id,contract,source_id,role,status,role_usable,actual_http,observed_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT DO NOTHING`).bind(run_id,contract,sourceId(source_id),role,String(status||'UNKNOWN').slice(0,80),role_usable?1:0,http,now).run();
  return{recorded:true,source_id:sourceId(source_id),role,role_usable,actual_http:http,predictive_weight_changed:false};
 }
 return{load,record,recordRole,version:LIQUIDATION_SOURCE_WEIGHTING_VERSION};
}

export default{LIQUIDATION_SOURCE_WEIGHTING_VERSION,LIQUIDATION_SOURCE_ROLES,buildLiquidationSourceWeightProfile,chooseWeightedLiquidationLane,planLiquidationSourceOrder,nextLiquidationSourceReliability,createLiquidationSourceWeightStore};
