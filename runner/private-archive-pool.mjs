import {PrivateArchiveD1API,combineMeasuredD1Usage} from './private-archive-d1-api.mjs';
import {PRIVATE_CANONICAL_DATABASES} from './private-canonical-history.mjs';
import {decodeCanonicalPublicationRow,retainCanonicalPublicationRow,CANONICAL_COLD_ARCHIVE_LIMITS} from './canonical-cold-archive.mjs';
import {prefetchExactCanonicalRevisions} from './private-canonical-prefetch.mjs';
const LOOKUP='SELECT record_json FROM report2_canonical_cold_archive_v1 WHERE publication_id=?1 AND raw_sha256=?2 LIMIT 1';
export function createPrivateArchivePool({enabled=false,token,fetch_impl,beforeRequest,databases}={}){
 const locations=enabled?Object.keys(PRIVATE_CANONICAL_DATABASES):['LEGACY'];
 const entries=new Map(locations.map(location=>[location,databases?.[location]??new PrivateArchiveD1API({location,token,fetch_impl,beforeRequest})]));
 if([...entries.values()].some(db=>typeof db?.prepare!=='function'||typeof db?.usageSnapshot!=='function')||new Set(entries.values()).size!==entries.size)throw Error('PRIVATE_ARCHIVE_MEASURED_DISTINCT_POOL_REQUIRED');
 const readerOptions=()=>({archive_db:entries.get('LEGACY'),archive_dbs:Object.fromEntries([...entries].filter(([slot])=>slot!=='LEGACY'))});
 return{locations,enabled,legacy_db:entries.get('LEGACY'),get:location=>{if(!entries.has(location))throw Error('PRIVATE_ARCHIVE_LOCATION_NOT_ENABLED');return entries.get(location);},readerOptions,
  usageSnapshot:()=>combineMeasuredD1Usage(...[...entries.values()].map(db=>db.usageSnapshot()))};
}

// Check all permitted locations before choosing writable capacity. Reuse a
// known exact revision even if free-space order has changed. Concurrent writers
// are not a cross-database transaction; any racing duplicate stays immutable.
export async function retainCanonicalInPool(pool,record,{db_admit,request_headroom,now=Date.now(),include_verified_record=false}={}){
 decodeCanonicalPublicationRow(record);
 if(!pool?.locations?.length||pool.locations.length>5||typeof db_admit!=='function'||typeof request_headroom!=='function')throw Error('PRIVATE_ARCHIVE_POOL_MEASURED_ADMISSION_REQUIRED');
 const cached=pool.findVerified?.(record);
 if(cached){
  const stored=JSON.parse(cached.wire);decodeCanonicalPublicationRow(stored);
  if(!pool.locations.includes(cached.location)||stored.publication_id!==record.publication_id||stored.raw_sha256!==record.raw_sha256||stored.raw_bytes!==record.raw_bytes)throw Error('ARCHIVE_POOL_IMMUTABLE_BINDING_MISMATCH');
  return{status:'ARCHIVE_POOL_EXACT_PREFETCHED_REVISION',retained:true,location:cached.location,publication_id:stored.publication_id,raw_sha256:stored.raw_sha256,...(include_verified_record?{verified_record:stored}:{})};
 }
 const max_requests=pool.locations.length+4;
 if(request_headroom({max_requests})?.allowed!==true)return{status:'ARCHIVE_POOL_HTTP_HEADROOM_DENIED',retained:false};
 if(db_admit({rows_read:pool.locations.length*3+3,rows_written:24})?.allowed!==true)return{status:'ARCHIVE_POOL_SHARED_D1_DENIED',retained:false};
 for(const location of pool.locations){
  const db=pool.get(location);
  if(db_admit({rows_read:3,rows_written:0})?.allowed!==true)return{status:'ARCHIVE_POOL_SHARED_D1_DENIED',retained:false};
  const found=await db.prepare(LOOKUP).bind(record.publication_id,record.raw_sha256).first();
  if(found){const stored=JSON.parse(found.record_json);decodeCanonicalPublicationRow(stored);if(stored.publication_id!==record.publication_id||stored.raw_sha256!==record.raw_sha256||stored.raw_bytes!==record.raw_bytes)throw Error('ARCHIVE_POOL_IMMUTABLE_BINDING_MISMATCH');return{status:'ARCHIVE_POOL_EXACT_EXISTING_REVISION',retained:true,location,publication_id:stored.publication_id,raw_sha256:stored.raw_sha256,...(include_verified_record?{verified_record:stored}:{})};}
 }
 const wire_bytes=Buffer.byteLength(JSON.stringify(record));
 for(const location of pool.locations){
  const db=pool.get(location);
  // Each preceding exact lookup supplied a native size_after. Unknown size
  // never becomes spare space, even if a descriptor listed a small DB.
  if(!Number.isSafeInteger(db.storage_bytes)||db.storage_bytes<0)throw Error('ARCHIVE_POOL_NATIVE_STORAGE_SIZE_REQUIRED');
  if(db.storage_bytes+wire_bytes+16384>CANONICAL_COLD_ARCHIVE_LIMITS.database_soft_bytes)continue;
  const retained=await retainCanonicalPublicationRow(db,record,{db_admit,storage_bytes:db.storage_bytes,now,include_verified_record});
  if(retained.retained)return{...retained,location};
  if(retained.status!=='ARCHIVE_STORAGE_GUARD_REACHED')return retained;
 }
 return{status:'ARCHIVE_POOL_STORAGE_GUARD_REACHED',retained:false,locations_checked:pool.locations.length,paid_fallback:false};
}

// Every location has its own positive-only cache. An absence is never cached,
// and the sum still reads the underlying measured adapters exactly once.
export async function prefetchCanonicalArchivePool({pool,revisions,db_admit}={}){
 if(!pool?.locations?.length)throw Error('PRIVATE_ARCHIVE_POOL_REQUIRED');
 const prepared=new Map();
 for(const location of pool.locations)prepared.set(location,await prefetchExactCanonicalRevisions({archive_db:pool.get(location),revisions,db_admit}));
 const copy=createPrivateArchivePool({enabled:pool.enabled,databases:Object.fromEntries([...prepared].map(([location,p])=>[location,p.archive_db]))});
 copy.findVerified=record=>{
  for(const [location,p] of prepared){const wire=p.verifiedLookup(record);if(wire)return{location,wire};}
  return null;
 };
 return{pool:copy,receipt:{status:'EXACT_POOL_PRIVATE_REVISIONS_VERIFIED',locations:Object.fromEntries([...prepared].map(([location,p])=>[location,p.receipt])),sourceHTTP:0,main_rows_modified:0,native_production_cost_qualified:false}};
}
