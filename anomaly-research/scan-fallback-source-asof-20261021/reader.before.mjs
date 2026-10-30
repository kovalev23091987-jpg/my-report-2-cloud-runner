export const MARKET_HISTORY_READER_VERSION = 'market-history-reader-v3-contract-verified-20260928';
export const HISTORY_COMPATIBILITY = Object.freeze({
  version:'report2-history-compatibility-v1-20260928',
  schema_version:'report2-market-snapshot-batch-v1',
  unit_normalizer:'HTX_USDT_PERP_SNAPSHOT_UNITS_V1',
  generations:Object.freeze([
    'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V11_20M',
    'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M',
    'MY_REPORT_2_CURRENT_20260929_CURRENT_CYCLE_V13_20M',
  ]),
});

const SLOT_MS = 5 * 60_000;
const MAX_SHARDS_PER_PAGE = 24;
const MAX_SHARDS_6H = 576;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
const text = value => String(value ?? '').trim();
const rowsOf = result => Array.isArray(result?.results) ? result.results : [];

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizedContract(value) {
  const contract = text(value).normalize('NFC').toUpperCase();
  return contract.endsWith('-USDT') && !/\s/u.test(contract) ? contract : null;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function verifiedCollectorRows(rows,{decisionTs}={}) {
  const accepted=[],rejected=[];
  for(const row of rows||[]){
    const received=finite(row?.received_ts),payload=String(row?.payload??''),schema=text(row?.schema_version),generation=text(row?.generation);
    let reason=null,parsed=null;
    if(schema!==HISTORY_COMPATIBILITY.schema_version)reason='SCHEMA_INCOMPATIBLE';
    else if(!HISTORY_COMPATIBILITY.generations.includes(generation))reason='GENERATION_NOT_IN_COMPATIBILITY_MANIFEST';
    else if(received===null||received>decisionTs)reason='RECEIVED_AFTER_DECISION';
    else if(text(row?.status)!=='COMPLETE')reason='STATUS_NOT_COMPLETE';
    else if(await sha256(payload)!==text(row?.payload_hash))reason='PAYLOAD_HASH_MISMATCH';
    else {parsed=parseJson(payload,null);if(!Array.isArray(parsed))reason='PAYLOAD_INVALID';else if(finite(row?.contract_count)!==parsed.length)reason='CONTRACT_COUNT_MISMATCH';else if(finite(row?.payload_bytes)!==new TextEncoder().encode(payload).byteLength)reason='PAYLOAD_BYTES_MISMATCH';else if(parsed.some(item=>{const source=finite(item?.observed_ts);return source===null||source>decisionTs;}))reason='SOURCE_TS_INVALID_OR_FUTURE';}
    if(reason)rejected.push({bucket:finite(row?.bucket),generation,shard:finite(row?.shard),reason});else accepted.push(row);
  }
  return {accepted,rejected};
}

function compactCollectorPoint(row, bucket, generation) {
  return {
    ts: finite(row?.observed_ts) ?? bucket,
    ts_bucket: bucket,
    timestamp_utc: new Date(bucket).toISOString(),
    contract_code: row.contract,
    price: finite(row?.price),
    turnover_24h_usdt: finite(row?.turnover_24h_usdt),
    oi_contracts: finite(row?.oi_contracts),
    oi_value_usdt: finite(row?.oi_value_usdt),
    funding_rate: finite(row?.funding_rate),
    funding_rate_pct: finite(row?.funding_rate) === null ? null : finite(row.funding_rate) * 100,
    funding_interval_hours: finite(row?.funding_interval_hours),
    market_age_sec: finite(row?.market_age_sec),
    source_status: text(row?.source_status) || null,
    history_source: 'REPORT2_MARKET_SNAPSHOT_BATCH_V1',
    source_generation: generation,
  };
}

export function chooseCompleteBucket(groups, contract, preferredGeneration) {
  const candidates = [];
  for (const [generation, shards] of groups) {
    shards.sort((a, b) => Number(a.shard) - Number(b.shard));
    const meta = parseJson(shards[0]?.source_timestamps_json, null);
    const expected = finite(meta?.expected_shards);
    if (!Number.isSafeInteger(expected) || expected < 1 || shards.length !== expected) continue;
    if (shards.some((row, index) => Number(row.shard) !== index || row.status !== 'COMPLETE' || row.source_timestamps_json!==shards[0].source_timestamps_json)) continue;
    let all = [], bytes = 0, invalid = false;
    for (const shard of shards) {
      bytes += new TextEncoder().encode(String(shard.payload ?? '')).byteLength;
      const parsed = parseJson(shard.payload, null);
      if (!Array.isArray(parsed)) { invalid = true; break; }
      all.push(...parsed);
    }
    if (invalid || finite(meta?.universe_total) !== all.length || shards.reduce((sum,row)=>sum+(finite(row.contract_count)??0),0)!==all.length) continue;
    const found = all.find(item => normalizedContract(item?.contract) === contract);
    if (found) candidates.push({generation, row:found, bytes});
  }
  candidates.sort((a, b) => Number(b.generation === preferredGeneration) - Number(a.generation === preferredGeneration) || b.generation.localeCompare(a.generation));
  return candidates[0] ?? null;
}

async function readCollectorPages(db, {actor, start, end}) {
  const out = [];let pages = 0, bytes = 0, truncated = false;
  // The existing production index starts with generation,bucket. Query each
  // explicitly compatible generation so D1 does not scan every retained shard.
  for (const generation of HISTORY_COMPATIBILITY.generations) {
    let cursorBucket=start-1,cursorShard=-1;
    while(out.length<MAX_SHARDS_6H){
      const limit=Math.min(MAX_SHARDS_PER_PAGE,MAX_SHARDS_6H-out.length);
      const result=await db.prepare(`SELECT bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes
        FROM report2_market_snapshot_batch_v1
        WHERE generation=?1 AND actor=?2 AND schema_version='report2-market-snapshot-batch-v1' AND bucket BETWEEN ?3 AND ?4
          AND (bucket>?5 OR (bucket=?5 AND shard>?6))
        ORDER BY bucket ASC,shard ASC LIMIT ?7`).bind(generation,actor,start,end,cursorBucket,cursorShard,limit).all();
      const page=rowsOf(result);if(!page.length)break;
      const pageBytes=page.reduce((sum,row)=>sum+new TextEncoder().encode(String(row?.payload??'')).byteLength,0);
      if(pageBytes>MAX_PAGE_BYTES)throw new Error('HISTORY_PAGE_BYTES_EXCEEDED');
      out.push(...page);bytes+=pageBytes;pages+=1;
      const last=page.at(-1);cursorBucket=Number(last.bucket);cursorShard=Number(last.shard);
      if(page.length<limit)break;
    }
    if(out.length>=MAX_SHARDS_6H){truncated=true;break;}
  }
  out.sort((a,b)=>Number(a.bucket)-Number(b.bucket)||String(a.generation).localeCompare(String(b.generation))||Number(a.shard)-Number(b.shard));
  return {rows:out,pages,bytes,truncated};
}

const TARGETS=Object.freeze([['5m',5*60_000,1*60_000],['15m',15*60_000,2*60_000],['1h',60*60_000,5*60_000],['4h',4*60*60_000,5*60_000],['24h',24*60*60_000,5*60_000]]);
function collectorRowsToMap(rows,{target,tolerance,preferredGeneration}){
  const grouped=new Map();for(const row of rows||[]){const bucket=finite(row?.bucket),generation=text(row?.generation);if(bucket===null||!generation)continue;const key=`${bucket}|${generation}`,list=grouped.get(key)||[];list.push(row);grouped.set(key,list);}
  // chooseCompleteBucket is contract-oriented; validate complete shards here for the all-contract preselector.
  const complete=[];for(const [key,shards] of grouped){const split=key.lastIndexOf('|'),bucket=Number(key.slice(0,split)),generation=key.slice(split+1),meta=parseJson(shards[0]?.source_timestamps_json,null),expected=finite(meta?.expected_shards);shards.sort((a,b)=>Number(a.shard)-Number(b.shard));if(!Number.isSafeInteger(expected)||expected<1||shards.length!==expected||shards.some((row,index)=>Number(row.shard)!==index||row.source_timestamps_json!==shards[0].source_timestamps_json))continue;const all=shards.flatMap(row=>parseJson(row.payload,[]));if(finite(meta?.universe_total)!==all.length)continue;complete.push({bucket,generation,rows:all});}
  complete.sort((a,b)=>Math.abs(a.bucket-target)-Math.abs(b.bucket-target)||Number(b.generation===preferredGeneration)-Number(a.generation===preferredGeneration)||b.generation.localeCompare(a.generation));const chosen=complete.find(item=>Math.abs(item.bucket-target)<=tolerance);const map=new Map();if(!chosen)return map;for(const row of chosen.rows){const contract=normalizedContract(row?.contract),sourceTs=finite(row?.observed_ts);if(!contract||sourceTs===null||Math.abs(sourceTs-chosen.bucket)>SLOT_MS)continue;map.set(contract,{...compactCollectorPoint(row,chosen.bucket,chosen.generation),contract_code:row.contract,turnover_24h:finite(row?.turnover_24h_usdt),prior_discovery:null,history_provenance:'REPORT2_MARKET_SNAPSHOT_BATCH_V1'});}return map;
}

export async function readMarketHistoryTargets({db,now_ts=Date.now(),actor='HUB_PUBLIC_COLLECTOR',preferred_generation=null}={}){
  const now=finite(now_ts);if(!db?.prepare||!Number.isSafeInteger(now))return{available:false,reason:'HISTORY_INPUT_INVALID',targets:{}};
  // The collector index starts with generation,bucket. Constrain both sides of
  // the nearest-bucket lookup to the known compatible generations, otherwise
  // each target reads across the entire retained collector table in D1.
  const generations=HISTORY_COMPATIBILITY.generations;
  const statements=TARGETS.map(([,offset,tolerance])=>{const target=now-offset,bucket=Math.floor(target/SLOT_MS)*SLOT_MS;return db.prepare(`SELECT bucket,actor,generation,schema_version,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count,payload_bytes FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND schema_version=?2 AND status='COMPLETE' AND generation IN (?3,?4,?5) AND bucket=(SELECT bucket FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND schema_version=?2 AND status='COMPLETE' AND generation IN (?3,?4,?5) AND bucket BETWEEN ?6 AND ?7 ORDER BY ABS(bucket-?8) ASC, bucket ASC LIMIT 1) ORDER BY generation DESC,shard ASC`).bind(actor,HISTORY_COMPATIBILITY.schema_version,...generations,bucket-tolerance,bucket+tolerance,bucket);});
  const maps={},rejections=[];try{const results=await db.batch(statements);for(let i=0;i<TARGETS.length;i++){const [label,offset,tolerance]=TARGETS[i],verified=await verifiedCollectorRows(rowsOf(results?.[i]),{decisionTs:now}),targetBucket=Math.floor((now-offset)/SLOT_MS)*SLOT_MS;rejections.push(...verified.rejected);maps[label]=collectorRowsToMap(verified.accepted,{target:targetBucket,tolerance,preferredGeneration:preferred_generation});}}catch(error){for(const [label] of TARGETS)maps[label]=new Map();rejections.push({reason:'COLLECTOR_BATCH_READ_FAILED',error:String(error?.message??error).slice(0,160)});}
  const missing=TARGETS.filter(([label])=>!maps[label]?.size),fallbackStatements=missing.map(([,offset,tolerance])=>{const target=now-offset,bucket=Math.floor(target/SLOT_MS)*SLOT_MS;return db.prepare(`SELECT ts,ts_bucket,payload_json FROM scan_runs WHERE ts_bucket BETWEEN ?1 AND ?2 ORDER BY ABS(ts_bucket-?3) ASC LIMIT 1`).bind(bucket-tolerance,bucket+tolerance,bucket);});
  let fallbackResults=[];try{if(fallbackStatements.length)fallbackResults=await db.batch(fallbackStatements);}catch{}
  let fallbackIndex=0;for(const [label] of TARGETS){if(maps[label]?.size)continue;const row=rowsOf(fallbackResults?.[fallbackIndex++])[0],payload=parseJson(row?.payload_json,null),map=new Map();for(const item of Array.isArray(payload?.contracts)?payload.contracts:[]){if(!Array.isArray(item))continue;const contract=normalizedContract(item[0]);if(contract)map.set(contract,{ts:finite(row?.ts),contract_code:item[0],price:finite(item[1]),turnover_24h:finite(item[2]),oi_contracts:finite(item[3]),oi_value_usdt:finite(item[4]),funding_rate:finite(item[5]),funding_interval_hours:finite(item[6]),market_age_sec:finite(item[7]),source_status:item[8]||null,prior_discovery:null,history_provenance:'SCAN_RUNS_COMPACT_V2',actual_cadence_minutes:20});}maps[label]=map;}
  const snapshotsFound=Object.values(maps).filter(map=>map.size).length;return{version:MARKET_HISTORY_READER_VERSION,available:true,populated:snapshotsFound>0,snapshots_found:snapshotsFound,reason:snapshotsFound?null:'D1 is connected but no prior Stage-0 snapshots exist yet',preferred_source:'REPORT2_MARKET_SNAPSHOT_BATCH_V1',fallback_source:'SCAN_RUNS_COMPACT_V2',history_compatibility:HISTORY_COMPATIBILITY,validation_rejections:rejections,targets:maps};
}

function collectorSeries(rows, {contract, nowTs, hours, preferredGeneration}) {
  const buckets = new Map();
  for (const row of rows) {
    const bucket = finite(row?.bucket), generation = text(row?.generation);
    if (!Number.isSafeInteger(bucket) || !generation) continue;
    let byGeneration = buckets.get(bucket);
    if (!byGeneration) { byGeneration = new Map(); buckets.set(bucket, byGeneration); }
    const group = byGeneration.get(generation) ?? [];
    group.push(row); byGeneration.set(generation, group);
  }
  const points = [];
  for (const [bucket, groups] of buckets) {
    const selected = chooseCompleteBucket(groups, contract, preferredGeneration);
    if (selected) points.push(compactCollectorPoint(selected.row,bucket,selected.generation));
  }
  points.sort((a,b)=>a.ts_bucket-b.ts_bucket);
  const expected = Math.max(1,Math.floor(hours*60/5));
  const latest = points.at(-1)?.ts_bucket ?? null;
  const endBucket = latest;
  const expectedBuckets = endBucket === null ? [] : Array.from({length:expected},(_,i)=>endBucket-(expected-1-i)*SLOT_MS);
  const byBucket = new Map(points.map(point=>[point.ts_bucket,point]));
  const series = expectedBuckets.map(bucket=>byBucket.get(bucket)).filter(Boolean);
  const missing = expectedBuckets.filter(bucket=>!byBucket.has(bucket));
  const tailAge = latest === null ? null : Math.max(0,nowTs-latest);
  const complete = series.length === expected && missing.length === 0 && tailAge <= SLOT_MS*2;
  return {series,expected,missing,latest,tailAge,complete};
}

async function readScanFallback(db, {contract,start,end,hours}) {
  const result = await db.prepare(`SELECT ts,ts_bucket,stage0_coverage_pct,payload_json FROM scan_runs
    WHERE ts_bucket BETWEEN ?1 AND ?2 ORDER BY ts_bucket ASC LIMIT 2500`).bind(start,end).all();
  const key = contract.replace(/[-_/]/g,'').toUpperCase(), series = [];
  let parseErrors = 0;
  for (const scan of rowsOf(result)) {
    const payload = parseJson(scan?.payload_json,null);
    if (!payload) { parseErrors += 1; continue; }
    const row = (Array.isArray(payload?.contracts)?payload.contracts:[]).find(item=>Array.isArray(item)&&String(item[0]??'').replace(/[-_/]/g,'').toUpperCase()===key);
    if (!row) continue;
    const [contract_code,price,turnover_24h,oi_contracts,oi_value_usdt,funding_rate,funding_interval_hours,market_age_sec,source_status] = row;
    series.push({ts:finite(scan.ts),ts_bucket:finite(scan.ts_bucket),timestamp_utc:new Date(finite(scan.ts_bucket)).toISOString(),contract_code,price:finite(price),turnover_24h_usdt:finite(turnover_24h),oi_contracts:finite(oi_contracts),oi_value_usdt:finite(oi_value_usdt),funding_rate:finite(funding_rate),funding_rate_pct:finite(funding_rate)===null?null:finite(funding_rate)*100,funding_interval_hours:finite(funding_interval_hours),market_age_sec:finite(market_age_sec),source_status:source_status||null,scan_stage0_coverage_pct:finite(scan.stage0_coverage_pct),history_source:'SCAN_RUNS_COMPACT_V2'});
  }
  const dedup = [...new Map(series.map(row=>[row.ts_bucket,row])).values()].sort((a,b)=>a.ts_bucket-b.ts_bucket);
  return {series:dedup,rowsRead:rowsOf(result).length,parseErrors,expected:Math.max(1,Math.floor(hours*3))};
}

export async function readMarketHistoryForContract({db,contract,now_ts=Date.now(),hours=6,actor='HUB_PUBLIC_COLLECTOR',preferred_generation=null}={}) {
  const normalized = normalizedContract(contract), now = finite(now_ts), span = Math.min(168,Math.max(.25,finite(hours)??6));
  if (!db?.prepare || !normalized || !Number.isSafeInteger(now)) return {version:MARKET_HISTORY_READER_VERSION,status:'NOT_CLOSED',reason:'HISTORY_INPUT_INVALID',series:[]};
  const start = now-span*60*60_000-SLOT_MS, end = now;
  try {
    const page = await readCollectorPages(db,{actor,start,end});
    const verified=await verifiedCollectorRows(page.rows,{decisionTs:now});
    const selected = collectorSeries(verified.accepted,{contract:normalized,nowTs:now,hours:span,preferredGeneration:preferred_generation});
    if (selected.series.length) return {
      version:MARKET_HISTORY_READER_VERSION,status:selected.complete?'CLOSED':'PARTIAL',source:'REPORT2_MARKET_SNAPSHOT_BATCH_V1',contract:normalized,requested_hours:span,series:selected.series,
      health:{data_db:true,payload_parse:true},coverage:{persistent_history:selected.complete?'closed':'partial',expected_5m_points:selected.expected,received_points:selected.series.length,approximate_5m_coverage_pct:Math.min(100,selected.series.length/selected.expected*100),missing_buckets:selected.missing,latest_bucket:selected.latest,tail_age_ms:selected.tailAge,complete_5m_window:selected.complete},
      provenance:{actor,schema_version:HISTORY_COMPATIBILITY.schema_version,generations:[...new Set(selected.series.map(row=>row.source_generation))],generation_compatibility:HISTORY_COMPATIBILITY,fallback_used:false,validation_rejections:verified.rejected},d1:{pages:page.pages,shard_rows_read:page.rows.length,payload_bytes:page.bytes,max_parallel_reads:2,truncated:page.truncated},endpoint_errors:{data_db:null},
    };
  } catch (error) {
    if (!/no such table/i.test(String(error?.message??error))) return {version:MARKET_HISTORY_READER_VERSION,status:'NOT_CLOSED',reason:'COLLECTOR_HISTORY_READ_FAILED',error:String(error?.message??error).slice(0,200),series:[]};
  }
  try {
    const fallback = await readScanFallback(db,{contract:normalized,start,end,hours:span});
    return {version:MARKET_HISTORY_READER_VERSION,status:fallback.series.length?'PARTIAL':'WARMING',source:'SCAN_RUNS_COMPACT_V2',contract:normalized,requested_hours:span,series:fallback.series,health:{data_db:true,payload_parse:fallback.parseErrors===0},coverage:{persistent_history:fallback.series.length?'partial':'warming',expected_5m_points:Math.max(1,Math.floor(span*60/5)),received_points:fallback.series.length,approximate_5m_coverage_pct:null,actual_cadence_minutes:20,complete_5m_window:false},provenance:{fallback_used:true,fallback_reason:'COLLECTOR_HISTORY_UNAVAILABLE',frequency_not_upgraded:true},d1:{scan_rows_read:fallback.rowsRead},parse_errors:fallback.parseErrors,endpoint_errors:{data_db:null}};
  } catch (error) {
    return {version:MARKET_HISTORY_READER_VERSION,status:'NOT_CLOSED',reason:'ALL_HISTORY_READERS_FAILED',error:String(error?.message??error).slice(0,200),series:[],health:{data_db:false},coverage:{persistent_history:'SOURCE_UNSUPPORTED'}};
  }
}

export default {MARKET_HISTORY_READER_VERSION,HISTORY_COMPATIBILITY,readMarketHistoryForContract,readMarketHistoryTargets};

// Shared, verified five-minute input for early discovery. One universe read,
// never one database scan per coin. No interpolated points or invented history.
export async function readEarlyMarketSnapshots({db,now_ts,preferred_generation=null}={}) {
  const now=finite(now_ts);
  if(!db?.prepare||!Number.isSafeInteger(now))return {status:'NOT_CLOSED',snapshots:[],reason:'HISTORY_INPUT_INVALID'};
  try {
    const page=await readCollectorPages(db,{actor:'HUB_PUBLIC_COLLECTOR',start:now-6*60*60_000-SLOT_MS,end:now});
    const verified=await verifiedCollectorRows(page.rows,{decisionTs:now});
    const groups=new Map();
    for(const row of verified.accepted){const key=`${row.bucket}|${row.generation}`;const a=groups.get(key)||[];a.push(row);groups.set(key,a);}
    const chosen=new Map();
    for(const shards of groups.values()){
      shards.sort((a,b)=>a.shard-b.shard);
      const head=shards[0],meta=parseJson(head.source_timestamps_json,null),expected=finite(meta?.expected_shards);
      if(!Number.isSafeInteger(expected)||expected<1||shards.length!==expected||shards.some((r,i)=>r.shard!==i||r.source_timestamps_json!==head.source_timestamps_json))continue;
      const all=shards.flatMap(r=>parseJson(r.payload,[]));
      if(all.length!==finite(meta?.universe_total)||new Set(all.map(r=>normalizedContract(r.contract))).size!==all.length)continue;
      const rows=new Map();
      for(const r of all){const c=normalizedContract(r.contract),point=compactCollectorPoint(r,head.bucket,head.generation);if(!c)continue;
        rows.set(c,{...point,contract:c,data_status:point.source_status,prior_discovery:{}});
      }
      if(!rows.size)continue;
      const snapshot={status:'CLOSED',ts:Math.max(...[...rows.values()].map(r=>r.ts)),rows,source:'REPORT2_MARKET_SNAPSHOT_BATCH_V1',source_generation:head.generation};
      const prior=chosen.get(head.bucket);
      if(!prior||head.generation===preferred_generation||(prior.source_generation!==preferred_generation&&head.generation>prior.source_generation))chosen.set(head.bucket,snapshot);
    }
    const snapshots=[...chosen.values()].sort((a,b)=>a.ts-b.ts);
    return {status:snapshots.length?'CLOSED':'NOT_CLOSED',snapshots,rejections:verified.rejected,truncated:page.truncated,shard_rows_read:page.rows.length};
  }catch(error){return {status:'NOT_CLOSED',snapshots:[],reason:'EARLY_COLLECTOR_READ_FAILED',error:String(error?.message||error).slice(0,160)};}
}
