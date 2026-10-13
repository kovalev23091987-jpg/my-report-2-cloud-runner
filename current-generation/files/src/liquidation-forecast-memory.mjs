import {selectLiquidationDisplayZones,liquidationPresentationPolicy} from './canonical-display.mjs';

const number=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const validClock=(x,now)=>Number.isSafeInteger(x)&&x<=now&&now-x<=300_000;
const contractCode=x=>typeof x==='string'&&/^[^\s-]{1,32}-USDT$/u.test(x)&&!['BTC-USDT','ETH-USDT'].includes(x);
// Older canonical rows have a null independence_group even when their exact
// primary source is known. Keep that identity in the historical snapshot, but
// leave unknown or composite labels ungrouped rather than inventing a source.
const knownPrimaryGroups=new Map([
 ['Hyperliquid official','HYPERLIQUID'],
 ['gTrade official SDK','GTRADE'],
 ['Orderly','ORDERLY_PUBLIC_POSITIONS'],
 ['dYdX pinned protocol model','DYDX_MAINNET_CHAIN'],
 ['Расчётная модель HTX','HTX_OFFICIAL_MODEL']
]);
const compactZone=z=>({source:String(z.source||'').slice(0,64),group:String(z.independence_group||knownPrimaryGroups.get(z.source)||'').slice(0,80),side:z.side,price:number(z.price),quote:z.price_quote,source_ts:z.source_ts,estimated:z.estimated===true,scenario_only:z.scenario_only===true,size_tier:z.scenario_estimated_size_tier??z.strength_label_ru??null,reported_notional:z.exact_amount_available===true||z.amount_semantics==='REPORTED_OPEN_POSITION_NOTIONAL'?number(z.notional):null,notional_unit:String(z.notional_unit||'').slice(0,12)||null,price_semantics:String(z.price_semantics||'').slice(0,80)});

export function buildLiquidationForecastSnapshot({contract,run_id,liquidations,observed_ts,reference_price}={}){
 if(!contractCode(contract)||!Number.isSafeInteger(observed_ts)||!(number(reference_price)>0)||!run_id)return{status:'NOT_RECORDED',reason:'CONTRACT_OR_CLOCK_OR_REFERENCE_REQUIRED',zones:[]};
 const policy=liquidationPresentationPolicy(observed_ts),selected=[];
 for(const side of ['ABOVE','BELOW']){
  const shown=selectLiquidationDisplayZones(liquidations,side,{limit:3,policy});
  for(const z of shown)if(validClock(z.source_ts,observed_ts)&&number(z.price)>0)selected.push(compactZone(z));
  const modelBySource=new Map();
  for(const z of liquidations?.calculated_scenarios||[]){
   if(z?.side!==side||z.scenario_only!==true||z.source_backed_calculated!==true||!validClock(z.source_ts,observed_ts)||!(number(z.price)>0))continue;
   const source=String(z.source||'');if(!modelBySource.has(source))modelBySource.set(source,[]);modelBySource.get(source).push(z);
  }
  for(const group of modelBySource.values())for(const z of group.sort((a,b)=>Math.abs(number(a.distance_pct)??Infinity)-Math.abs(number(b.distance_pct)??Infinity)).slice(0,3))selected.push(compactZone(z));
 }
 const unique=new Map();for(const z of selected){if(!['ABOVE','BELOW'].includes(z.side)||!z.source||!['USD','USDT','USDC'].includes(z.quote))continue;unique.set([z.source,z.side,z.price,z.source_ts,z.scenario_only].join('|'),z);}
 const zones=[...unique.values()].slice(0,24);
 if(!zones.length)return{status:'NOT_RECORDED',reason:'NO_FRESH_NUMERIC_FUTURE_LEVELS',zones:[]};
 const snapshot={schema:'LIQ_FORECAST_SNAPSHOT_V1',contract,run_id:String(run_id).slice(0,120),observed_ts,reference_price:number(reference_price),zones,decision_effect:false,report_effect:false,historical_outcome_only:true};
 if(JSON.stringify(snapshot).length>8192)return{status:'NOT_RECORDED',reason:'COMPACT_SNAPSHOT_SIZE_CAP',zones:[]};
 return{status:'CLOSED',...snapshot};
}

export function createLiquidationForecastMemory({db,admit=()=>({allowed:true})}={}){
 if(!db)throw Error('LIQ_FORECAST_DB_REQUIRED');let installed=false;
 async function install(){if(installed)return;const grant=admit({rows_read:0,rows_written:2});if(grant?.allowed===false)return;await db.prepare(`CREATE TABLE IF NOT EXISTS report2_liq_forecast_snapshots (run_id TEXT NOT NULL, contract_code TEXT NOT NULL, observed_ts INTEGER NOT NULL, reference_price REAL NOT NULL, payload_json TEXT NOT NULL, PRIMARY KEY(run_id,contract_code))`).run();installed=true;}
 async function record(input){const snapshot=buildLiquidationForecastSnapshot(input);if(snapshot.status!=='CLOSED')return snapshot;
  const readGrant=admit({rows_read:1,rows_written:0});if(readGrant?.allowed===false)return{status:'DEFERRED_D1_BUDGET',zones:[]};
  const capacity=await db.prepare('SELECT 1 AS liq_forecast_storage_probe').all(),dbBytes=Number(capacity?.meta?.size_after);
  if(Number.isSafeInteger(dbBytes)&&dbBytes>400_000_000)return{status:'DEFERRED_FREE_STORAGE_GUARD',db_bytes:dbBytes,zones:[]};
  await install();if(!installed)return{status:'DEFERRED_D1_BUDGET',zones:[]};const grant=admit({rows_read:0,rows_written:1});if(grant?.allowed===false)return{status:'DEFERRED_D1_BUDGET',zones:[]};const {run_id,contract,observed_ts,reference_price,zones}=snapshot;await db.prepare(`INSERT OR IGNORE INTO report2_liq_forecast_snapshots(run_id,contract_code,observed_ts,reference_price,payload_json) VALUES(?1,?2,?3,?4,?5)`).bind(run_id,contract,observed_ts,reference_price,JSON.stringify(snapshot)).run();return{status:'RECORDED',contract,run_id,observed_ts,zones:zones.length,source_groups:[...new Set(zones.map(z=>z.group||z.source))],historical_outcome_only:true,storage_guard_bytes:400_000_000};}
 return{install,record};
}
