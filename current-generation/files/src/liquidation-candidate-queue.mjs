export const LIQUIDATION_CANDIDATE_QUEUE_VERSION='liquidation-candidate-queue-v1-20260927';
const text=v=>String(v??'').trim().toUpperCase();
const valid=v=>/^[^-\s]{1,32}-USDT$/u.test(text(v))&&!['BTC-USDT','ETH-USDT'].includes(text(v));

export function createLiquidationCandidateQueue({db,clock=Date.now,ttl_ms=2*60*60*1000,claim_timeout_ms=30*60*1000,max_attempts=3}={}){
 if(!db)throw new Error('LIQUIDATION_QUEUE_DB_REQUIRED');let installed=false;
 async function install(){if(installed)return;await db.prepare(`CREATE TABLE IF NOT EXISTS report2_liquidation_candidate_queue (contract_code TEXT PRIMARY KEY, priority_rank INTEGER, first_seen_ts INTEGER NOT NULL, last_seen_ts INTEGER NOT NULL, expires_ts INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, claimed_run_id TEXT, claimed_ts INTEGER, last_result_json TEXT)`).run();installed=true;}
 async function enqueue(candidates,{now=clock()}={}){
  await install();const rows=(Array.isArray(candidates)?candidates:[]).filter(row=>valid(row?.contract)).slice(0,10);
  for(const row of rows)await db.prepare(`INSERT INTO report2_liquidation_candidate_queue(contract_code,priority_rank,first_seen_ts,last_seen_ts,expires_ts,status,attempts) VALUES(?1,?2,?3,?3,?4,'PENDING',0) ON CONFLICT(contract_code) DO UPDATE SET priority_rank=excluded.priority_rank,last_seen_ts=excluded.last_seen_ts,expires_ts=excluded.expires_ts,status=CASE WHEN report2_liquidation_candidate_queue.status='CLAIMED' THEN 'CLAIMED' ELSE 'PENDING' END`).bind(text(row.contract),Number.isSafeInteger(Number(row.priority_rank))?Number(row.priority_rank):99,now,now+ttl_ms).run();
  return{status:'CLOSED',enqueued:rows.length,expires_ts:now+ttl_ms};
 }
 async function claim({run_id,preferred_contract=null,now=clock()}={}){
  await install();await db.prepare(`UPDATE report2_liquidation_candidate_queue SET status='PENDING',claimed_run_id=NULL,claimed_ts=NULL WHERE status='CLAIMED' AND claimed_ts<?1 AND expires_ts>=?2 AND attempts<?3`).bind(now-claim_timeout_ms,now,max_attempts).run();
  const preferred=valid(preferred_contract)?text(preferred_contract):null;
  const row=preferred?await db.prepare(`SELECT * FROM report2_liquidation_candidate_queue WHERE contract_code=?1 AND status='PENDING' AND expires_ts>=?2 AND attempts<?3 LIMIT 1`).bind(preferred,now,max_attempts).first():await db.prepare(`SELECT * FROM report2_liquidation_candidate_queue WHERE status='PENDING' AND expires_ts>=?1 AND attempts<?2 ORDER BY priority_rank ASC,last_seen_ts DESC LIMIT 1`).bind(now,max_attempts).first();
  if(!row)return{status:'EMPTY',claimed:false};const result=await db.prepare(`UPDATE report2_liquidation_candidate_queue SET status='CLAIMED',attempts=attempts+1,claimed_run_id=?2,claimed_ts=?3 WHERE contract_code=?1 AND status='PENDING'`).bind(row.contract_code,String(run_id||''),now).run();
  const changed=Number(result?.meta?.changes??result?.changes??1)>0;return changed?{status:'CLAIMED',claimed:true,contract:String(row.contract_code),priority_rank:Number(row.priority_rank),attempts:Number(row.attempts||0)+1}:{status:'RACE_LOST',claimed:false};
 }
 async function complete({contract,run_id,usable,result=null,now=clock()}={}){
  await install();const code=text(contract);if(!valid(code)||typeof usable!=='boolean')return{status:'INVALID',completed:false};
  const update=await db.prepare(`UPDATE report2_liquidation_candidate_queue SET status=CASE WHEN expires_ts<?5 THEN 'EXPIRED_UNCHECKED' WHEN ?3=1 THEN 'DONE' WHEN attempts>=?6 THEN 'FAILED' ELSE 'PENDING' END,claimed_run_id=NULL,claimed_ts=NULL,last_result_json=?4,last_seen_ts=?5 WHERE contract_code=?1 AND claimed_run_id=?2`).bind(code,String(run_id||''),usable?1:0,JSON.stringify(result??{}).slice(0,4000),now,max_attempts).run(),changed=Number(update?.meta?.changes??update?.changes??0)>0;
  if(!changed)return{status:'CLAIM_NOT_OWNED',completed:false,contract:code,usable};const row=await db.prepare(`SELECT status FROM report2_liquidation_candidate_queue WHERE contract_code=?1 LIMIT 1`).bind(code).first();return{status:String(row?.status||'UNKNOWN'),completed:true,contract:code,usable};
 }
 async function summary({now=clock()}={}){await install();const result=await db.prepare(`SELECT status,COUNT(*) AS count FROM report2_liquidation_candidate_queue WHERE expires_ts>=?1 GROUP BY status`).bind(now).all();return{version:LIQUIDATION_CANDIDATE_QUEUE_VERSION,counts:Object.fromEntries((result?.results||[]).map(r=>[r.status,Number(r.count)])),ttl_ms,max_attempts};}
 return{install,enqueue,claim,complete,summary,version:LIQUIDATION_CANDIDATE_QUEUE_VERSION};
}

export default{LIQUIDATION_CANDIDATE_QUEUE_VERSION,createLiquidationCandidateQueue};
