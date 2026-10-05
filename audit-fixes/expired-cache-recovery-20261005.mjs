import fs from 'node:fs';import zlib from 'node:zlib';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {RemoteD1Database} from '../runner/report2-d1-adapter.mjs';import {loadDailyUsageAggregate,evaluateDailyReservationBudget,reserveRunBudget,finalizeRunUsage} from '../runner/d1-preaction-budget-guard.mjs';
fs.mkdirSync('audit-output',{recursive:true});
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN),orig=db._request.bind(db);
db._request=async p=>{const u=db.usageSnapshot();assert.ok(u.rows_read<2200&&u.rows_written<110&&u.unknown_ops===0&&u.requests<75);return orig(p);};
const keys=JSON.parse(fs.readFileSync('audit-fixes/expired-cache-exact-keys-20261005.json')).exact_expired_keys;
assert.ok(keys.length<=24&&keys.every(r=>!r.source.includes('NANSEN')));
if(process.argv[2]==='capture'){
 const now=Date.now(),rows=[];
 for(const k of keys){const r=await db.prepare('SELECT source,asset_key,observed_ts,expires_ts,payload_json FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND observed_ts=?3 AND expires_ts=?4 AND expires_ts<?5').bind(k.source,k.asset_key,k.observed_ts,k.expires_ts,now).first();if(r)rows.push({...r,payload_sha256:hash(r.payload_json)});}
 const b=zlib.gzipSync(Buffer.from(JSON.stringify({schema:'EXACT_EXPIRED_TRANSPORT_CACHE_BACKUP_V1',captured_at:now,sourceHTTP:0,MAIN:0,Telegram:0,canonical_tables_touched:false,reservations_touched:false,rows,usage:db.usageSnapshot()})));
 fs.writeFileSync('audit-output/expired-cache-backup.json.gz',b);fs.writeFileSync('audit-output/expired-cache-backup.sha256',hash(b)+'\n');
 console.log(JSON.stringify({status:'COPIED_NOT_DELETED',rows:rows.length,sourceHTTP:0,MAIN:0,Telegram:0,D1:db.usageSnapshot()}));
}else{
 const artifact=Number(process.env.REPORT2_BACKUP_ARTIFACT_ID);assert.ok(Number.isSafeInteger(artifact)&&artifact>0);
 const b=fs.readFileSync('audit-output/expired-cache-backup.json.gz');assert.equal(hash(b),fs.readFileSync('audit-output/expired-cache-backup.sha256','utf8').trim());const backup=JSON.parse(zlib.gunzipSync(b));
 const now=Date.now(),reservation={rows_read:2500,rows_written:120},daily=await loadDailyUsageAggregate(db,now),grant=evaluateDailyReservationBudget({daily,nextReservation:reservation});assert.ok(grant.allowed,grant.status);
 const rid='EXPIRED_CACHE_RECOVERY:'+process.env.GITHUB_RUN_ID;await reserveRunBudget(db,{reservationId:rid,now,reservation});
 const before=(await db.prepare('SELECT 1 AS readonly').all()).meta?.size_after,results=[];
 for(const r of backup.rows){assert.equal(hash(r.payload_json),r.payload_sha256);assert.ok(r.expires_ts<backup.captured_at&&r.expires_ts<now);
  const q=await db.prepare('DELETE FROM report2_evidence_source_cache WHERE source=?1 AND asset_key=?2 AND observed_ts=?3 AND expires_ts=?4 AND expires_ts<?5 AND payload_json=?6').bind(r.source,r.asset_key,r.observed_ts,r.expires_ts,now,r.payload_json).run();assert.ok([0,1].includes(q.meta?.changes));results.push({source:r.source,asset_key:r.asset_key,expired_ts:r.expires_ts,payload_sha256:r.payload_sha256,changes:q.meta.changes,copied_payload_bytes:Buffer.byteLength(r.payload_json)});
 }
 const after=(await db.prepare('SELECT 1 AS readonly').all()).meta?.size_after;
 const use=db.usageSnapshot(),combined={...use,rows_read:use.rows_read+backup.usage.rows_read,rows_written:use.rows_written,requests:use.requests+backup.usage.requests,unknown_ops:use.unknown_ops+backup.usage.unknown_ops};
 assert.ok(combined.rows_read<=reservation.rows_read&&combined.rows_written+2<=reservation.rows_written&&combined.unknown_ops===0);
 const finalized=await finalizeRunUsage(db,{reservationId:rid,sourceRunId:'CACHE_RECOVERY:'+process.env.GITHUB_RUN_ID,now:Date.now(),usage:combined});
 fs.writeFileSync('audit-output/expired-cache-recovery.json',JSON.stringify({schema:'report2-bounded-expired-cache-recovery-v1',status:'CLOSED',backup_artifact:artifact,backup_sha256:hash(b),exact_deleted_rows:results.filter(r=>r.changes===1).length,before_db_bytes:before,after_db_bytes:after,results,sourceHTTP:0,MAIN:0,Telegram:0,canonical_tables_touched:false,raw_history_touched:false,reservations_reset:false,D1_admission:grant.status,reservation,finalized,usage:combined},null,2));
 console.log(JSON.stringify({status:'CLOSED',deleted:results.filter(r=>r.changes===1).length,before_db_bytes:before,after_db_bytes:after,sourceHTTP:0,MAIN:0,Telegram:0}));
}
