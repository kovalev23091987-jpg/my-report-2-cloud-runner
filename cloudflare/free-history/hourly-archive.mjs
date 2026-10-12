// Independent, free-tier-bounded history lane. It reuses a closed HTX snapshot;
// no exchange request, report trigger, trading decision, or Telegram call occurs here.
export const ARCHIVE_SCHEMA = 'report2-hourly-market-archive-v1';
export const ARCHIVE_VERSION = 'report2-free-hourly-archive-v1-20261012';
export const SOURCE_GENERATION = 'MY_REPORT_2_CURRENT_20260928_CANONICAL_RUNTIME_V12_CONTRACT_INTEGRITY_20M';
export const MANIFEST_SHA256 = 'ade6878a0ba9921a83695a1a82d19be9867ddebb7ff8b741a3b46f59f950a81c';
export const TARGETS = Object.freeze(["AAVE-USDT","ACE-USDT","ADA-USDT","AKE-USDT","ALGO-USDT","APR-USDT","APT-USDT","ARB-USDT","ASTER-USDT","ATOM-USDT","AVAX-USDT","AVNT-USDT","BANK-USDT","BCH-USDT","BEAT-USDT","BILL-USDT","BNB-USDT","BOME-USDT","BONK-USDT","BR-USDT","BTC-USDT","BTR-USDT","BTT-USDT","BTW-USDT","CASHCAT-USDT","CHZ-USDT","CT-USDT","DASH-USDT","DOGE-USDT","DOS-USDT","DOT-USDT","ENA-USDT","ETC-USDT","ETH-USDT","ETHFI-USDT","EUL-USDT","FARTCOIN-USDT","FIL-USDT","FLOKI-USDT","GPS-USDT","GRAM-USDT","HBAR-USDT","HYPE-USDT","ICP-USDT","JST-USDT","JUP-USDT","LAB-USDT","LINK-USDT","LIT-USDT","LSK-USDT","LTC-USDT","MARSCOIN-USDT","MUBARAK-USDT","MYX-USDT","NEAR-USDT","NIL-USDT","OKB-USDT","ONDO-USDT","ONG-USDT","OP-USDT","ORDI-USDT","PAXG-USDT","PENGU-USDT","PEOPLE-USDT","PEPE-USDT","PIPPIN-USDT","PONS-USDT","PUMP-USDT","QNT-USDT","RAVE-USDT","RAY-USDT","RIVER-USDT","RLC-USDT","SHIB-USDT","SKR-USDT","SKYAI-USDT","SOL-USDT","STEEM-USDT","SUI-USDT","SUN-USDT","SUSHI-USDT","TAO-USDT","TIA-USDT","TRUMP-USDT","TRX-USDT","TUT-USDT","UB-USDT","UNI-USDT","USELESS-USDT","VELVET-USDT","WIF-USDT","WIN-USDT","WLD-USDT","XAUT-USDT","XLM-USDT","XMR-USDT","XPL-USDT","XRP-USDT","ZEC-USDT","ZKC-USDT","哈基米-USDT","币安人生-USDT","牛来-USDT","龙虾-USDT"]);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RETAIN = 270 * DAY; // measured 104-asset payload is about 25 KB/hour
const MAX_ARCHIVE_BYTES = 400_000_000; // below the D1 Free 500 MB/database cap
const MAX_PAYLOAD_BYTES = 100_000;
const encoder = new TextEncoder();
const asMs = value => value === null || value === undefined || value === '' ? null : Number.isSafeInteger(Number(value)) ? Number(value) : null;
const finite = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))), b => b.toString(16).padStart(2,'0')).join('');

export async function buildHourlyRecord({hour_bucket, source_rows}) {
  if (!Number.isSafeInteger(hour_bucket) || hour_bucket % HOUR !== 0 || !Array.isArray(source_rows) || !source_rows.length) throw Error('ARCHIVE_SOURCE_REQUIRED');
  const bucket = asMs(source_rows[0]?.bucket);
  const metaText = source_rows[0]?.source_timestamps_json;
  let meta;
  try { meta = JSON.parse(metaText); } catch { throw Error('ARCHIVE_SOURCE_METADATA_INVALID'); }
  const expected = Number(meta?.expected_shards);
  if (!Number.isInteger(expected) || expected < 1 || expected > 32 || source_rows.length !== expected || source_rows.some((r,i) => Number(r.shard)!==i || r.bucket!==bucket || r.generation!==SOURCE_GENERATION || r.status!=='COMPLETE' || r.source_timestamps_json!==metaText)) throw Error('ARCHIVE_SOURCE_SHARDS_INVALID');
  if (bucket < hour_bucket+5*60_000 || bucket > hour_bucket+25*60_000) throw Error('ARCHIVE_SOURCE_BUCKET_OUTSIDE_HOUR');
  const received = asMs(source_rows[0].received_ts);
  const market = asMs(meta?.market);
  if (received === null || market === null || received < bucket || received > bucket+5*60_000 || market > received || received-market > 5*60_000) throw Error('ARCHIVE_SOURCE_CLOCK_INVALID');
  const original = [];
  for (const r of source_rows) {
    if (await hash(r.payload)!==r.payload_hash) throw Error('ARCHIVE_SOURCE_HASH_INVALID');
    let decoded;
    try { decoded=JSON.parse(r.payload); } catch { throw Error('ARCHIVE_SOURCE_PAYLOAD_INVALID'); }
    if (!Array.isArray(decoded) || decoded.length!==Number(r.contract_count)) throw Error('ARCHIVE_SOURCE_CONTRACT_COUNT_INVALID');
    original.push(...decoded);
  }
  if (original.length!==Number(meta.universe_total)) throw Error('ARCHIVE_SOURCE_UNIVERSE_MISMATCH');
  const byContract = new Map();
  for (const row of original) {
    const contract=String(row?.contract??'');
    if (byContract.has(contract)) throw Error('ARCHIVE_SOURCE_DUPLICATE_CONTRACT');
    byContract.set(contract,row);
  }
  let qualified=0;
  const samples=[];
  for (const contract of TARGETS) {
    const row=byContract.get(contract);
    if (!row) continue;
    const observed=asMs(row.observed_ts),price=finite(row.price);
    const closed=row.catalog_active===true && row.source_status==='CLOSED' && price!==null && price>0 && observed!==null && observed<=received && received-observed<=5*60_000;
    if (closed) qualified++;
    samples.push({contract,market:'HTX_LINEAR_PERPETUAL',source_status:closed?'CLOSED':'PARTIAL',price:closed?price:null,observed_ts:observed,turnover_24h_usdt:finite(row.turnover_24h_usdt),oi_value_usdt:finite(row.oi_value_usdt),funding_rate:finite(row.funding_rate),funding_interval_hours:finite(row.funding_interval_hours)});
  }
  if (!samples.length) throw Error('ARCHIVE_NO_TARGET_CONTRACTS');
  const payload=JSON.stringify({schema:ARCHIVE_SCHEMA,source:'HTX_OFFICIAL_COLLECTOR',source_bucket:bucket,source_market_ts:market,received_ts:received,samples});
  if (encoder.encode(payload).length>MAX_PAYLOAD_BYTES) throw Error('ARCHIVE_PAYLOAD_TOO_LARGE');
  return {hour_bucket,source_bucket:bucket,source_generation:SOURCE_GENERATION,source_market_ts:market,received_ts:received,manifest_sha256:MANIFEST_SHA256,target_count:TARGETS.length,present_count:samples.length,qualified_count:qualified,payload_sha256:await hash(payload),payload_json:payload};
}

export async function archiveHour({source_db,archive_db,scheduled_ts=Date.now()}) {
  if (!source_db || !archive_db) throw Error('ARCHIVE_D1_BINDINGS_REQUIRED');
  const hour_bucket=Math.floor(scheduled_ts/HOUR)*HOUR;
  const existing=await archive_db.prepare('SELECT payload_sha256 FROM report2_hourly_market_archive_v1 WHERE hour_bucket=?1').bind(hour_bucket).first();
  if (existing) return {status:'ALREADY_ARCHIVED',hour_bucket};
  const source=await source_db.prepare(`SELECT bucket FROM report2_market_snapshot_batch_v1 WHERE actor='HUB_PUBLIC_COLLECTOR' AND generation=?1 AND status='COMPLETE' AND bucket BETWEEN ?2 AND ?3 ORDER BY bucket DESC LIMIT 1`).bind(SOURCE_GENERATION,hour_bucket+5*60_000,hour_bucket+25*60_000).first();
  if (!source) return {status:'SOURCE_MISSING',hour_bucket};
  const result=await source_db.prepare(`SELECT bucket,generation,shard,source_timestamps_json,received_ts,status,payload_hash,payload,contract_count FROM report2_market_snapshot_batch_v1 WHERE actor='HUB_PUBLIC_COLLECTOR' AND generation=?1 AND bucket=?2 ORDER BY shard`).bind(SOURCE_GENERATION,source.bucket).all();
  const record=await buildHourlyRecord({hour_bucket,source_rows:result?.results});
  const cutoff=hour_bucket-RETAIN;
  await archive_db.prepare('DELETE FROM report2_hourly_market_archive_v1 WHERE hour_bucket IN (SELECT hour_bucket FROM report2_hourly_market_archive_v1 WHERE hour_bucket<?1 ORDER BY hour_bucket LIMIT 8)').bind(cutoff).run();
  const sizeProbe=await archive_db.prepare('SELECT 1 AS probe').all();
  const dbBytes=Number(sizeProbe?.meta?.size_after);
  if (!Number.isSafeInteger(dbBytes) || dbBytes<0 || dbBytes+MAX_PAYLOAD_BYTES*2>MAX_ARCHIVE_BYTES) return {status:'FREE_STORAGE_GUARD',hour_bucket,db_bytes:Number.isFinite(dbBytes)?dbBytes:null};
  const inserted=await archive_db.prepare(`INSERT INTO report2_hourly_market_archive_v1(hour_bucket,source_bucket,source_generation,source_market_ts,received_ts,manifest_sha256,target_count,present_count,qualified_count,payload_sha256,payload_json,created_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12) ON CONFLICT(hour_bucket) DO NOTHING`).bind(record.hour_bucket,record.source_bucket,record.source_generation,record.source_market_ts,record.received_ts,record.manifest_sha256,record.target_count,record.present_count,record.qualified_count,record.payload_sha256,record.payload_json,Date.now()).run();
  const stored=await archive_db.prepare('SELECT payload_sha256,present_count,qualified_count FROM report2_hourly_market_archive_v1 WHERE hour_bucket=?1').bind(hour_bucket).first();
  if (stored?.payload_sha256!==record.payload_sha256) throw Error('ARCHIVE_IMMUTABLE_READBACK_FAILED');
  return {status:'ARCHIVED',hour_bucket,source_bucket:record.source_bucket,present_count:stored.present_count,qualified_count:stored.qualified_count,db_bytes:Number(inserted?.meta?.size_after??dbBytes),source_http:0,telegram:false,report_unchanged:true};
}

