// Historical research only. Reads canonical results already saved by the full
// report and keeps compact future-level snapshots in the separate free D1.
// It neither fetches exchanges nor alters reports, Telegram, scores or weights.
import {TARGETS} from './hourly-archive.mjs';
import {buildLiquidationForecastSnapshot} from '../../current-generation/files/src/liquidation-forecast-memory.mjs';

const DAY=86_400_000,RETAIN=270*DAY,MAX_DB_BYTES=400_000_000;
const eligible=new Set(TARGETS.filter(code=>code!=='BTC-USDT'&&code!=='ETH-USDT'));
const encoder=new TextEncoder();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const stamp=value=>Number.isSafeInteger(Number(value))?Number(value):null;

export function compactCanonicalForecast(row,{scheduled_ts}={}){
  const observed=stamp(row?.observed_ts),contract=String(row?.contract_code??''),run=String(row?.run_id??''),pub=String(row?.publication_id??'');
  if(!/^PUB:[a-f0-9]{40,64}$/.test(pub)||!eligible.has(contract)||!run||run.length>120||observed===null||observed>scheduled_ts||observed<scheduled_ts-7*DAY)return{status:'SKIPPED_INVALID_IDENTITY',reason:'PUBLICATION_CONTRACT_OR_CLOCK'};
  let liq;try{liq=JSON.parse(row.liquidation_json);}catch{return{status:'SKIPPED_INVALID_CANONICAL',reason:'LIQUIDATION_JSON'};}
  const result=buildLiquidationForecastSnapshot({contract,run_id:run,liquidations:liq,observed_ts:observed,reference_price:row.reference_price});
  if(result.status!=='CLOSED')return{status:'SKIPPED_NO_FRESH_FORECAST',reason:result.reason||'NO_LEVELS'};
  return{status:'RECORDED',snapshot:result};
}

export async function archiveLiquidationForecasts({source_db,archive_db,restore_canonical_row,db_admit=()=>({allowed:true}),scheduled_ts=Date.now(),clock=Date.now}={}){
  if(!source_db||!archive_db||!Number.isSafeInteger(scheduled_ts))throw Error('LIQ_ARCHIVE_BINDINGS_REQUIRED');
  const admit=(rows_read,rows_written)=>{if(db_admit({rows_read,rows_written})?.allowed!==true)throw Error('LIQ_ARCHIVE_SHARED_D1_HEADROOM_REQUIRED');};
  admit(2,0);
  const cursor=await archive_db.prepare('SELECT observed_ts,publication_id FROM report2_liq_forecast_archive_v1 ORDER BY observed_ts DESC,publication_id DESC LIMIT 1').first();
  const from=cursor?Number(cursor.observed_ts):scheduled_ts-72*3_600_000,afterId=cursor?.publication_id??'';
  admit(2500,0);
  // SQL JSON functions cannot read a private locator. Select the original
  // identity and restore the exact revision before inspecting its contents.
  const source=await source_db.prepare(`SELECT publication_id,run_id,snapshot_id,contract_code,observed_ts,analytical_fingerprint,canonical_json
    FROM canonical_publication_shadow
    WHERE observed_ts>=?1 AND observed_ts<=?2 AND (observed_ts>?3 OR (observed_ts=?3 AND publication_id>?4))
    ORDER BY observed_ts,publication_id LIMIT 8`).bind(scheduled_ts-7*DAY,scheduled_ts,from,afterId).all();
  const rows=source?.results??[];
  if(!rows.length)return{status:'SOURCE_EMPTY',checked:0,recorded:0,source_http:0,report_effect:false};
  if(rows.length>8)throw Error('LIQ_ARCHIVE_SOURCE_ROW_BOUND');
  admit(8,24);
  await archive_db.prepare('DELETE FROM report2_liq_forecast_archive_v1 WHERE publication_id IN (SELECT publication_id FROM report2_liq_forecast_archive_v1 WHERE observed_ts<?1 ORDER BY observed_ts LIMIT 8)').bind(scheduled_ts-RETAIN).run();
  admit(1,0);
  const probe=await archive_db.prepare('SELECT 1 AS probe').all(),bytes=Number(probe?.meta?.size_after);
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes+8*8192+200_000>MAX_DB_BYTES)return{status:'FREE_STORAGE_GUARD',checked:rows.length,recorded:0,db_bytes:Number.isFinite(bytes)?bytes:null,source_http:0,report_effect:false};
  let recorded=0,skipped=0,private_rows_restored=0;
  for(const row of rows){
    let original=row;
    if(String(row.canonical_json||'').startsWith('R2PRIVATE_CANONICAL_V1:')){
      // A missing/corrupt archive is retryable: never persist SKIPPED or advance
      // the cursor beyond it, and never try a new exchange/provider request.
      if(typeof restore_canonical_row!=='function')throw Error('LIQ_ARCHIVE_PRIVATE_READER_REQUIRED');
      original=await restore_canonical_row(row);private_rows_restored++;
    }
    let canonical=null;try{canonical=JSON.parse(original.canonical_json);}catch{}
    const projected={...row,liquidation_json:canonical?JSON.stringify(canonical.liquidations):null,reference_price:canonical?.liquidations?.current_price};
    const result=compactCanonicalForecast(projected,{scheduled_ts}),payload=result.snapshot?JSON.stringify(result.snapshot):null,digest=payload?await sha(payload):null;
    admit(3,3);
    await archive_db.prepare(`INSERT INTO report2_liq_forecast_archive_v1(publication_id,run_id,contract_code,observed_ts,status,reason,payload_sha256,payload_json,created_ts)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(publication_id) DO NOTHING`).bind(row.publication_id,row.run_id,row.contract_code,row.observed_ts,result.status,result.reason??null,digest,payload,clock()).run();
    const saved=await archive_db.prepare('SELECT status,payload_sha256 FROM report2_liq_forecast_archive_v1 WHERE publication_id=?1').bind(row.publication_id).first();
    if(saved?.status!==result.status||saved?.payload_sha256!==digest)throw Error('LIQ_ARCHIVE_IMMUTABLE_READBACK_FAILED');
    if(result.status==='RECORDED')recorded++;else skipped++;
  }
  return{status:'ARCHIVED',checked:rows.length,recorded,skipped,private_rows_restored,first_observed_ts:rows[0].observed_ts,last_observed_ts:rows.at(-1).observed_ts,db_bytes:bytes,source_http:0,report_effect:false,telegram_effect:false,weight_effect:false};
}
