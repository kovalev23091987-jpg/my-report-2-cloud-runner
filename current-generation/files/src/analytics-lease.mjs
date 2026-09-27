const LEASE_NAME="ANALYTICS";

export async function installRuntimeControl(db){
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS report2_runtime_lease_v1(lease_name TEXT PRIMARY KEY CHECK(lease_name='ANALYTICS'),actor TEXT NOT NULL,generation TEXT NOT NULL,owner_run_id TEXT NOT NULL,fencing_token INTEGER NOT NULL CHECK(fencing_token>0),claimed_ts INTEGER NOT NULL,renewed_ts INTEGER NOT NULL,expires_ts INTEGER NOT NULL,terminal_state TEXT NOT NULL CHECK(terminal_state IN ('ACTIVE','RELEASED')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS report2_immutable_snapshot_v1(actor TEXT NOT NULL,generation TEXT NOT NULL,bucket INTEGER NOT NULL,shard INTEGER NOT NULL CHECK(shard>=0),payload_hash TEXT NOT NULL,payload_json TEXT NOT NULL,created_ts INTEGER NOT NULL,PRIMARY KEY(actor,generation,bucket,shard))`),
  ]);
}

export async function claimAnalyticsLease(db,{actor,generation,run_id,now=Date.now(),lease_ms=12*60_000}={}){
  if(actor!=="GITHUB_ACTIONS")return {claimed:false,status:"ROLE_NOT_ALLOWED"};
  if(!generation||!run_id)return {claimed:false,status:"LEASE_IDENTITY_REQUIRED"};
  const expires=now+lease_ms;
  await db.prepare(`INSERT INTO report2_runtime_lease_v1(lease_name,actor,generation,owner_run_id,fencing_token,claimed_ts,renewed_ts,expires_ts,terminal_state)
    VALUES(?1,?2,?3,?4,1,?5,?5,?6,'ACTIVE')
    ON CONFLICT(lease_name) DO UPDATE SET actor=excluded.actor,generation=excluded.generation,owner_run_id=excluded.owner_run_id,
      fencing_token=report2_runtime_lease_v1.fencing_token+1,claimed_ts=excluded.claimed_ts,renewed_ts=excluded.renewed_ts,
      expires_ts=excluded.expires_ts,terminal_state='ACTIVE'
    WHERE report2_runtime_lease_v1.expires_ts<=?5 OR report2_runtime_lease_v1.terminal_state='RELEASED'`).bind(LEASE_NAME,actor,generation,run_id,now,expires).run();
  const row=await db.prepare(`SELECT actor,generation,owner_run_id,fencing_token,expires_ts,terminal_state FROM report2_runtime_lease_v1 WHERE lease_name=?1`).bind(LEASE_NAME).first();
  const claimed=row?.owner_run_id===run_id&&row?.actor===actor&&row?.generation===generation&&row?.terminal_state==='ACTIVE'&&Number(row?.expires_ts)>now;
  return {claimed,status:claimed?'CLAIMED':'LEASE_BUSY',lease_name:LEASE_NAME,actor,generation,run_id,fencing_token:claimed?Number(row.fencing_token):null,expires_ts:claimed?Number(row.expires_ts):null};
}

export async function assertAnalyticsFence(db,lease,{now=Date.now()}={}){
  if(!lease?.claimed)return {allowed:false,status:"LEASE_NOT_CLAIMED"};
  const row=await db.prepare(`SELECT actor,generation,owner_run_id,fencing_token,expires_ts,terminal_state FROM report2_runtime_lease_v1 WHERE lease_name=?1`).bind(LEASE_NAME).first();
  const allowed=row?.terminal_state==='ACTIVE'&&row?.owner_run_id===lease.run_id&&row?.actor===lease.actor&&row?.generation===lease.generation&&Number(row?.fencing_token)===lease.fencing_token&&Number(row?.expires_ts)>now;
  return {allowed,status:allowed?'FENCE_VALID':'STALE_FENCING_TOKEN'};
}

export async function renewAnalyticsLease(db,lease,{now=Date.now(),lease_ms=12*60_000}={}){
  await db.prepare(`UPDATE report2_runtime_lease_v1 SET renewed_ts=?1,expires_ts=?2
    WHERE lease_name=?3 AND owner_run_id=?4 AND fencing_token=?5 AND terminal_state='ACTIVE' AND expires_ts>?1`).bind(now,now+lease_ms,LEASE_NAME,lease.run_id,lease.fencing_token).run();
  return assertAnalyticsFence(db,lease,{now});
}

export async function finishAnalyticsLease(db,lease,{now=Date.now()}={}){
  await db.prepare(`UPDATE report2_runtime_lease_v1 SET renewed_ts=?1,expires_ts=?1,terminal_state='RELEASED'
    WHERE lease_name=?2 AND owner_run_id=?3 AND fencing_token=?4 AND terminal_state='ACTIVE'`).bind(now,LEASE_NAME,lease.run_id,lease.fencing_token).run();
  const row=await db.prepare(`SELECT owner_run_id,fencing_token,terminal_state FROM report2_runtime_lease_v1 WHERE lease_name=?1`).bind(LEASE_NAME).first();
  const finished=row?.owner_run_id===lease.run_id&&Number(row?.fencing_token)===lease.fencing_token&&row?.terminal_state==='RELEASED';
  return {finished,status:finished?'RELEASED':'STALE_FENCING_TOKEN'};
}

export async function putImmutableSnapshot(db,{actor,generation,bucket,shard,payload_hash,payload_json,created_ts=Date.now()}={}){
  await db.prepare(`INSERT INTO report2_immutable_snapshot_v1(actor,generation,bucket,shard,payload_hash,payload_json,created_ts)
    VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(actor,generation,bucket,shard) DO NOTHING`).bind(actor,generation,bucket,shard,payload_hash,payload_json,created_ts).run();
  const row=await db.prepare(`SELECT payload_hash FROM report2_immutable_snapshot_v1 WHERE actor=?1 AND generation=?2 AND bucket=?3 AND shard=?4`).bind(actor,generation,bucket,shard).first();
  if(row?.payload_hash===payload_hash)return {ok:true,status:"STORED_OR_IDENTICAL_NOOP"};
  return {ok:false,status:"IMMUTABLE_SNAPSHOT_CONFLICT",existing_hash:row?.payload_hash||null};
}
