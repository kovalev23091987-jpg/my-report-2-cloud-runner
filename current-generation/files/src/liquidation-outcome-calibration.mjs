import crypto from 'node:crypto';
export const LIQUIDATION_OUTCOME_CALIBRATION_VERSION='liquidation-outcome-calibration-v2-20260927';
export const MIN_PREDICTIVE_OBSERVATIONS=20;
const text=v=>String(v??'').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const sourceId=value=>{const s=text(value).toUpperCase();if(s.includes('CROSS_EXCHANGE_DEPTH'))return'CROSS_EXCHANGE_DEPTH';if(s.includes('CROSS_EXCHANGE_REALIZED'))return'CROSS_EXCHANGE_REALIZED';if(s.includes('COINALYZE'))return'COINALYZE';if(s.includes('LIGHTER'))return'LIGHTER';if(s.includes('GMX'))return'GMX';if(s.includes('GTRADE')||s.includes('GAINS'))return'GTRADE';if(s.includes('LIQFLOW')||s.includes('HYPERLIQUID'))return'LIQFLOW_HL_NATIVE';if(s.includes('0XARCHIVE'))return'OXARCHIVE';return'NATIVE';};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

export function predictiveWeightFactor({observations,ewma_accuracy}={}){const n=Math.max(0,Number(observations)||0),parsed=finite(ewma_accuracy),accuracy=clamp(parsed===null?0.5:parsed,0,1);return n<MIN_PREDICTIVE_OBSERVATIONS?1:Number(clamp(0.75+accuracy*0.5,0.75,1.25).toFixed(4));}

export function createLiquidationOutcomeCalibration({db,fetch_impl=globalThis.fetch,clock=Date.now,horizon_ms=60*60*1000,max_distance_pct=15,min_move_pct=0.5}={}){
 if(!db)throw new Error('LIQUIDATION_CALIBRATION_DB_REQUIRED');let installed=false;
 async function install(){if(installed)return;await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_liquidation_signal_outcomes (signal_id TEXT PRIMARY KEY, contract_code TEXT NOT NULL, source_id TEXT NOT NULL, observed_ts INTEGER NOT NULL, due_ts INTEGER NOT NULL, reference_price REAL NOT NULL, level_price REAL NOT NULL, expected_direction TEXT NOT NULL, distance_pct REAL NOT NULL, quality REAL NOT NULL, status TEXT NOT NULL, settled_ts INTEGER, outcome_price REAL, outcome_move_pct REAL, hit INTEGER)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS report2_liquidation_predictive_health (source_id TEXT PRIMARY KEY, observations INTEGER NOT NULL, hits INTEGER NOT NULL, ewma_accuracy REAL NOT NULL, predictive_weight_factor REAL NOT NULL, eligible INTEGER NOT NULL, updated_ts INTEGER NOT NULL)`),
 ]);installed=true;}
 async function record({contract,panel,cross_exchange_risk=null,reference_price=null,observed_ts=clock()}={}){
  await install();const code=text(contract).toUpperCase(),ref=finite(panel?.reference_price??reference_price);if(!/^[^-\s]{1,32}-USDT$/u.test(code)||!ref)return{status:'NOT_RECORDED',rows:0};let rows=0,panelRows=0,crossRows=0;
  const insertSignal=async({source,direction,level=ref,distance=0,quality=0.5,metric='LIQUIDATION_LEVEL'})=>{const id=digest(`${code}|${source}|${observed_ts}|${level}|${direction}|${metric}`);const receipt=await db.prepare(`INSERT OR IGNORE INTO report2_liquidation_signal_outcomes(signal_id,contract_code,source_id,observed_ts,due_ts,reference_price,level_price,expected_direction,distance_pct,quality,status) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'PENDING')`).bind(id,code,source,observed_ts,observed_ts+horizon_ms,ref,level,direction,distance,quality).run();return Number(receipt?.meta?.changes??receipt?.changes??1)>0?1:0;};
  if(panel?.status==='CLOSED'){
  for(const cluster of Array.isArray(panel?.clusters)?panel.clusters:[]){const distance=finite(cluster?.distance_pct),level=finite(cluster?.center_price),side=text(cluster?.liquidated_side).toUpperCase();if(distance===null||level===null||Math.abs(distance)>max_distance_pct||!['LONG','SHORT'].includes(side))continue;const providers=Array.isArray(cluster?.providers)&&cluster.providers.length?cluster.providers:['NATIVE'];for(const provider of providers){const source=sourceId(provider),direction=side==='SHORT'?'UP':'DOWN',id=digest(`${code}|${source}|${observed_ts}|${level}|${direction}`);await db.prepare(`INSERT OR IGNORE INTO report2_liquidation_signal_outcomes(signal_id,contract_code,source_id,observed_ts,due_ts,reference_price,level_price,expected_direction,distance_pct,quality,status) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'PENDING')`).bind(id,code,source,observed_ts,observed_ts+horizon_ms,ref,level,direction,distance,finite(panel?.score_evidence?.quality)??0.5).run();rows++;}}
  panelRows=rows;
  }
  const sources=cross_exchange_risk?.sources||{};
  const depth=sources.CROSS_EXCHANGE_DEPTH,depthImbalance=finite(depth?.aggregate_depth_imbalance_2pct);
  if(depth?.status==='CLOSED'&&Number(depth?.venue_count)>=2&&depthImbalance!==null&&Math.abs(depthImbalance)>=0.08)crossRows+=await insertSignal({source:'CROSS_EXCHANGE_DEPTH',direction:depthImbalance>0?'UP':'DOWN',quality:clamp(0.3+Number(depth.venue_count)*0.1,0,0.6),metric:'ORDER_BOOK_DEPTH_IMBALANCE_2PCT'});
  const history=sources.COINALYZE,historyLong=finite(history?.long_liquidated_recent)||0,historyShort=finite(history?.short_liquidated_recent)||0,historyTotal=historyLong+historyShort,historyImbalance=historyTotal>0?(historyLong-historyShort)/historyTotal:0;
  if(history?.status==='CLOSED'&&historyTotal>0&&Math.abs(historyImbalance)>=0.05)crossRows+=await insertSignal({source:'COINALYZE',direction:historyImbalance>0?'UP':'DOWN',quality:0.7,metric:'REALIZED_LIQUIDATION_LONG_SHORT_HISTORY'});
  const live=sources.CROSS_EXCHANGE_REALIZED,liveLong=finite(live?.long_liquidated_usd)||0,liveShort=finite(live?.short_liquidated_usd)||0,liveTotal=liveLong+liveShort,liveImbalance=liveTotal>0?(liveLong-liveShort)/liveTotal:0;
  if(live?.status==='CLOSED'&&liveTotal>=1000&&Math.abs(liveImbalance)>=0.05)crossRows+=await insertSignal({source:'CROSS_EXCHANGE_REALIZED',direction:liveImbalance>0?'UP':'DOWN',quality:0.65,metric:'LIVE_FORCED_ORDER_IMBALANCE'});
  rows=panelRows+crossRows;
  return{status:rows?'RECORDED':'NO_DIRECTIONAL_EVIDENCE',rows,panel_rows:panelRows,cross_exchange_rows:crossRows,horizon_ms,max_distance_pct};
 }
 async function dueCount(now){await install();const row=await db.prepare(`SELECT COUNT(*) AS count FROM report2_liquidation_signal_outcomes WHERE status='PENDING' AND due_ts<=?1`).bind(now).first();return Number(row?.count)||0;}
 async function settle({now=clock()}={}){
  await install();const due=await db.prepare(`SELECT signal_id,contract_code,source_id,reference_price,expected_direction FROM report2_liquidation_signal_outcomes WHERE status='PENDING' AND due_ts<=?1 ORDER BY due_ts ASC LIMIT 20`).bind(now).all(),rows=due?.results||[];if(!rows.length)return{status:'NO_DUE_SIGNALS',network_calls:0,settled:0};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let payload=null;try{const response=await fetch_impl('https://api.hbdm.com/v2/linear-swap-ex/market/detail/batch_merged',{headers:{accept:'application/json','user-agent':'My-Report-2/liquidation-calibration-v1'},signal:controller.signal});if(response.ok)payload=await response.json();}catch{}finally{clearTimeout(timer);}
  const prices=new Map((Array.isArray(payload?.ticks)?payload.ticks:Array.isArray(payload?.data)?payload.data:[]).map(row=>[text(row?.contract_code).toUpperCase(),finite(row?.close??row?.price)]));if(!prices.size)return{status:'PRICE_SOURCE_NOT_CLOSED',network_calls:1,settled:0};let settled=0;
  for(const row of rows){const price=prices.get(text(row.contract_code).toUpperCase()),ref=finite(row.reference_price);if(!price||!ref)continue;const move=(price/ref-1)*100,hit=row.expected_direction==='UP'?move>=min_move_pct:move<=-min_move_pct,prior=await db.prepare(`SELECT observations,hits,ewma_accuracy FROM report2_liquidation_predictive_health WHERE source_id=?1 LIMIT 1`).bind(row.source_id).first(),observations=Number(prior?.observations||0)+1,hits=Number(prior?.hits||0)+(hit?1:0),ewma=Number(((finite(prior?.ewma_accuracy)??0.5)*0.9+(hit?1:0)*0.1).toFixed(6)),factor=predictiveWeightFactor({observations,ewma_accuracy:ewma});
   await db.batch([db.prepare(`UPDATE report2_liquidation_signal_outcomes SET status='SETTLED',settled_ts=?2,outcome_price=?3,outcome_move_pct=?4,hit=?5 WHERE signal_id=?1 AND status='PENDING'`).bind(row.signal_id,now,price,move,hit?1:0),db.prepare(`INSERT INTO report2_liquidation_predictive_health(source_id,observations,hits,ewma_accuracy,predictive_weight_factor,eligible,updated_ts) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(source_id) DO UPDATE SET observations=excluded.observations,hits=excluded.hits,ewma_accuracy=excluded.ewma_accuracy,predictive_weight_factor=excluded.predictive_weight_factor,eligible=excluded.eligible,updated_ts=excluded.updated_ts`).bind(row.source_id,observations,hits,ewma,factor,observations>=MIN_PREDICTIVE_OBSERVATIONS?1:0,now)]);settled++;}
  return{status:'CLOSED',network_calls:1,due:rows.length,settled,min_observations_before_weighting:MIN_PREDICTIVE_OBSERVATIONS};
 }
 async function summary(){await install();const result=await db.prepare(`SELECT source_id,observations,hits,ewma_accuracy,predictive_weight_factor,eligible,updated_ts FROM report2_liquidation_predictive_health`).all();return{version:LIQUIDATION_OUTCOME_CALIBRATION_VERSION,min_observations_before_weighting:MIN_PREDICTIVE_OBSERVATIONS,sources:result?.results||[]};}
 return{install,record,dueCount,settle,summary,version:LIQUIDATION_OUTCOME_CALIBRATION_VERSION};
}

export default{LIQUIDATION_OUTCOME_CALIBRATION_VERSION,MIN_PREDICTIVE_OBSERVATIONS,predictiveWeightFactor,createLiquidationOutcomeCalibration};
