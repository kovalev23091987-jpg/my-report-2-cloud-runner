export const LIQUIDATION_SOURCE_WEIGHTING_VERSION='liquidation-source-weighting-v1-20260927';

export const LIQUIDATION_SOURCE_ROLES=Object.freeze({
 HYPERLIQUID_NATIVE:'Hyperliquid: verified native position liquidation prices',
 LIQFLOW_DISCOVERY:'LiqFlow: discovery of relevant Hyperliquid accounts and model context',
 GTRADE_NATIVE:'gTrade: native positions and dynamic fees',
 LIGHTER_NATIVE:'Lighter: exact-market native account liquidation prices',
 GMX_NATIVE:'GMX: exact-market native position liquidation prices',
 OXARCHIVE_HL_BUCKETS:'0xArchive: bounded Hyperliquid projected liquidation-level buckets',
});

const clamp=(value,lo,hi)=>Math.min(hi,Math.max(lo,value));
const sourceId=value=>String(value??'').trim().toUpperCase();
export const unsignedSourceHash=value=>{let h=2166136261;for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};

export function buildLiquidationSourceWeightProfile(lanes,rows=[]){
 const prior=new Map((Array.isArray(rows)?rows:[]).map(row=>[sourceId(row?.source_id),row]));
 return [...new Set((Array.isArray(lanes)?lanes:[]).map(sourceId).filter(Boolean))].map(id=>{
  const row=prior.get(id),attempts=Math.max(0,Number(row?.attempts)||0);
  const reliability=attempts?clamp(Number(row?.reliability)||0,0,1):0.5,predictiveObservations=Math.max(0,Number(row?.predictive_observations)||0),predictiveEligible=Number(row?.predictive_eligible)===1,predictiveFactor=predictiveEligible?clamp(Number(row?.predictive_weight_factor)||1,0.75,1.25):1;
  return {source_id:id,responsibility:LIQUIDATION_SOURCE_ROLES[id]||'Verified supplemental liquidation context',attempts,usable_runs:Math.max(0,Number(row?.usable_runs)||0),not_closed_runs:Math.max(0,Number(row?.not_closed_runs)||0),reliability:Number(reliability.toFixed(4)),predictive_observations:predictiveObservations,predictive_accuracy:predictiveObservations?Number(row?.predictive_accuracy)||null:null,predictive_weight_factor:Number(predictiveFactor.toFixed(4)),predictive_weight_eligible:predictiveEligible,selection_weight:Number(Math.max(0.5,(0.5+reliability)*predictiveFactor).toFixed(4)),exploration_floor:0.5,last_status:row?.last_status||null,updated_ts:Number(row?.updated_ts)||null};
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
 ]);installed=true;}
 async function load(lanes=[]){
  await install();const wanted=new Set(lanes.map(sourceId));
  const result=await db.prepare(`SELECT h.source_id,h.attempts,h.usable_runs,h.not_closed_runs,h.reliability,h.last_status,h.updated_ts,p.observations AS predictive_observations,p.ewma_accuracy AS predictive_accuracy,p.predictive_weight_factor FROM report2_liquidation_source_health h LEFT JOIN report2_liquidation_predictive_health p ON p.source_id=h.source_id`).all();
  return (result?.results||[]).filter(row=>wanted.has(sourceId(row?.source_id)));
 }
 async function record({source_id,usable,status,now=clock()}={}){
  await install();const id=sourceId(source_id);if(!id||typeof usable!=='boolean')return{recorded:false,reason:'EVALUATED_BOOLEAN_REQUIRED'};
  const prior=await db.prepare(`SELECT reliability FROM report2_liquidation_source_health WHERE source_id=?1 LIMIT 1`).bind(id).first();
  const reliability=nextLiquidationSourceReliability(prior?.reliability,usable);
  await db.prepare(`INSERT INTO report2_liquidation_source_health(source_id,attempts,usable_runs,not_closed_runs,reliability,last_status,updated_ts) VALUES(?1,1,?2,?3,?4,?5,?6) ON CONFLICT(source_id) DO UPDATE SET attempts=attempts+1,usable_runs=usable_runs+excluded.usable_runs,not_closed_runs=not_closed_runs+excluded.not_closed_runs,reliability=excluded.reliability,last_status=excluded.last_status,updated_ts=excluded.updated_ts`).bind(id,usable?1:0,usable?0:1,reliability,String(status||'UNKNOWN').slice(0,80),now).run();
  return{recorded:true,source_id:id,reliability,usable,status:String(status||'UNKNOWN')};
 }
 return{load,record,version:LIQUIDATION_SOURCE_WEIGHTING_VERSION};
}

export default{LIQUIDATION_SOURCE_WEIGHTING_VERSION,LIQUIDATION_SOURCE_ROLES,buildLiquidationSourceWeightProfile,chooseWeightedLiquidationLane,nextLiquidationSourceReliability,createLiquidationSourceWeightStore};
