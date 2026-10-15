// The current generation uses the existing (actor,generation,bucket,shard)
// primary key. The legacy cross-generation lookup is retained for first boot.
export const CURRENT_PRIOR_SNAPSHOT_SQL=`SELECT bucket,generation,shard,source_timestamps_json,payload FROM report2_market_snapshot_batch_v1
 WHERE actor=?1 AND generation=?2 AND schema_version='report2-market-snapshot-batch-v1' AND status='COMPLETE'
 AND bucket=(SELECT bucket FROM report2_market_snapshot_batch_v1
   WHERE actor=?1 AND generation=?2 AND schema_version='report2-market-snapshot-batch-v1' AND status='COMPLETE'
   ORDER BY bucket DESC LIMIT 1)
 ORDER BY shard ASC LIMIT 32`;
export const LEGACY_PRIOR_SNAPSHOT_SQL=`SELECT bucket,generation,shard,source_timestamps_json,payload FROM report2_market_snapshot_batch_v1
 WHERE actor=?1 AND schema_version='report2-market-snapshot-batch-v1' AND status='COMPLETE'
 AND bucket=(SELECT MAX(bucket) FROM report2_market_snapshot_batch_v1 WHERE actor=?1 AND schema_version='report2-market-snapshot-batch-v1' AND status='COMPLETE')
 ORDER BY generation DESC,shard ASC LIMIT 32`;
export async function readCollectorPriorRows(db,{actor,generation}={}){
 const current=await db.prepare(CURRENT_PRIOR_SNAPSHOT_SQL).bind(actor,generation).all();
 if(current?.results?.length)return current;
 return db.prepare(LEGACY_PRIOR_SNAPSHOT_SQL).bind(actor).all();
}
