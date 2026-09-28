const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export const TASK_KINDS=Object.freeze(['CRITICAL_REMOVAL','RECHECK','MANUAL','NEW_CANDIDATE','OI_ENRICHMENT']);
export const TERMINAL=Object.freeze(['COMPLETED','FAILED_FINAL','EXPIRED_UNCHECKED','NOT_ELIGIBLE','NOT_SELECTED_CAPACITY']);

export function classifyCandidate({eligible=true,missing_fields=[],capacity_selected=true}={}){
  if(!eligible)return {status:'NOT_ELIGIBLE'};
  if(missing_fields.length)return {status:'DATA_MISSING',missing_fields:[...missing_fields]};
  if(!capacity_selected)return {status:'NOT_SELECTED_CAPACITY'};
  return {status:'ELIGIBLE'};
}

export function buildUniverseDiff({previous=[],current=[]}={}){
  const prev=new Map(previous.map(x=>[x.contract,x])),next=new Map(current.map(x=>[x.contract,x]));
  const added=[...next.keys()].filter(x=>!prev.has(x)),delisted=[...prev.keys()].filter(x=>!next.has(x));
  const renamed=[];for(const row of current){if(row.previous_contract&&prev.has(row.previous_contract)&&row.previous_contract!==row.contract)renamed.push({from:row.previous_contract,to:row.contract});}
  return {added,delisted,renamed,candidates:current.filter(x=>!['BTC-USDT','ETH-USDT'].includes(x.contract)),market_context:current.filter(x=>['BTC-USDT','ETH-USDT'].includes(x.contract))};
}

export function preservesMonthlyCrashFilter(change_pct){const n=finite(change_pct);return n===null?{eligible:false,status:'DATA_MISSING'}:{eligible:n>-97,status:n>-97?'ELIGIBLE':'NOT_ELIGIBLE_MONTHLY_CRASH_FILTER'};}

export async function installCandidateTaskQueue(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS report2_candidate_task_v2(contract TEXT NOT NULL,wave_id TEXT NOT NULL,task_kind TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,first_seen INTEGER NOT NULL,due_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,lease_until INTEGER,lease_owner TEXT,priority INTEGER NOT NULL,terminal_reason TEXT,state TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(contract,wave_id,task_kind))`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_report2_candidate_task_v2_due ON report2_candidate_task_v2(state,due_at,priority,created_at)`).run();
}

export async function enqueueCandidateTask(db,{contract,wave_id,task_kind,due_at,expires_at,priority=0,now=Date.now()}={}){
  if(!contract||!wave_id||!TASK_KINDS.includes(task_kind)||!Number.isFinite(due_at)||!Number.isFinite(expires_at)||expires_at<=due_at)throw new Error('TASK_INPUT_INVALID');
  await db.prepare(`INSERT INTO report2_candidate_task_v2(contract,wave_id,task_kind,attempts,created_at,first_seen,due_at,expires_at,priority,state,updated_at) VALUES(?1,?2,?3,0,?4,?4,?5,?6,?7,'PENDING',?4) ON CONFLICT(contract,wave_id,task_kind) DO NOTHING`).bind(contract,wave_id,task_kind,now,due_at,expires_at,priority).run();
  return db.prepare(`SELECT * FROM report2_candidate_task_v2 WHERE contract=?1 AND wave_id=?2 AND task_kind=?3`).bind(contract,wave_id,task_kind).first();
}

export function chooseNextTask(rows,{consecutive_nonterminal_rechecks=0,now=Date.now()}={}){
  const ready=(rows||[]).filter(x=>x.state==='PENDING'&&x.due_at<=now&&x.expires_at>now&&(!x.lease_until||x.lease_until<=now));
  const rank={CRITICAL_REMOVAL:0,RECHECK:1,MANUAL:2,NEW_CANDIDATE:3,OI_ENRICHMENT:4};
  if(consecutive_nonterminal_rechecks>=2){const newRows=ready.filter(x=>x.task_kind==='NEW_CANDIDATE').sort((a,b)=>a.created_at-b.created_at);if(newRows.length)return newRows[0];}
  return ready.sort((a,b)=>(rank[a.task_kind]-rank[b.task_kind])||(b.priority-a.priority)||(a.due_at-b.due_at)||(a.created_at-b.created_at))[0]||null;
}

export async function expireCandidateTasks(db,{now=Date.now(),limit=100}={}){
  return db.prepare(`UPDATE report2_candidate_task_v2 SET state='EXPIRED_UNCHECKED',terminal_reason='DEADLINE_PASSED_WITHOUT_ANALYSIS',updated_at=?1 WHERE rowid IN (SELECT rowid FROM report2_candidate_task_v2 WHERE state='PENDING' AND expires_at<=?1 ORDER BY expires_at LIMIT ?2)`).bind(now,limit).run();
}

export function planLightChecks(candidates,{max_candidates=4,max_extra_http=8}={}){
  return {candidates:(candidates||[]).slice(0,max_candidates),max_extra_http,byk_units:0,entry_authorized:false,status:(candidates||[]).length>max_candidates?'PARTIAL_CAPACITY':'PLANNED'};
}

export function admitBurstDeep({burst_used_today,candidate_expires_at,next_regular_ts,remaining_job_ms,budget_reserved}={}){
  const urgent=Number(candidate_expires_at)<Number(next_regular_ts);
  const allowed=Number(burst_used_today)<6&&urgent&&Number(remaining_job_ms)>=120_000&&budget_reserved===true;
  return {allowed,status:allowed?'ADMITTED':'BURST_NOT_JUSTIFIED',max_deep_per_job:2,sequential:true};
}

const normalizeContract=value=>String(value??'').trim().toUpperCase();
const validCandidateContract=value=>/^[^-\s]{1,32}-USDT$/u.test(normalizeContract(value))&&!['BTC-USDT','ETH-USDT'].includes(normalizeContract(value));

export function createCandidateTaskQueue({db,clock=Date.now,ttl_ms=2*60*60_000,lease_ms=30*60_000,max_attempts=3}={}){
  if(!db)throw new Error('CANDIDATE_TASK_QUEUE_DB_REQUIRED');
  async function install(){await installCandidateTaskQueue(db);}
  async function enqueue(candidates,{wave_id,task_kind='NEW_CANDIDATE',now=clock()}={}){
    await install();const fallbackWave=String(wave_id||'').trim();if(!fallbackWave)throw new Error('WAVE_ID_REQUIRED');let enqueued=0;
    for(const [index,row] of (Array.isArray(candidates)?candidates:[]).entries()){
      const contract=normalizeContract(row?.contract),wave=String(row?.wave_id||fallbackWave).trim();if(!validCandidateContract(contract)||!wave)continue;
      await enqueueCandidateTask(db,{contract,wave_id:wave,task_kind,due_at:now,expires_at:now+ttl_ms,priority:Number.isFinite(Number(row?.priority_rank))?1000-Number(row.priority_rank):Math.max(0,500-index),now});enqueued++;
    }
    return{status:'CLOSED',enqueued,wave_id:fallbackWave,expires_ts:now+ttl_ms};
  }
  async function claim({run_id,preferred_contract=null,now=clock()}={}){
    await install();await expireCandidateTasks(db,{now});
    await db.prepare(`UPDATE report2_candidate_task_v2 SET state='PENDING',lease_owner=NULL,lease_until=NULL,updated_at=?1 WHERE state='RUNNING' AND lease_until<=?1 AND expires_at>?1 AND attempts<?2`).bind(now,max_attempts).run();
    const preferred=validCandidateContract(preferred_contract)?normalizeContract(preferred_contract):null;
    const result=await db.prepare(`SELECT * FROM report2_candidate_task_v2 WHERE state='PENDING' AND due_at<=?1 AND expires_at>?1 AND attempts<?2 AND (?3 IS NULL OR contract=?3) ORDER BY CASE task_kind WHEN 'CRITICAL_REMOVAL' THEN 0 WHEN 'RECHECK' THEN 1 WHEN 'MANUAL' THEN 2 WHEN 'NEW_CANDIDATE' THEN 3 ELSE 4 END,priority DESC,due_at,created_at LIMIT 50`).bind(now,max_attempts,preferred).all();
    const row=chooseNextTask(result?.results||[],{now});if(!row)return{status:'EMPTY',claimed:false};
    const update=await db.prepare(`UPDATE report2_candidate_task_v2 SET state='RUNNING',attempts=attempts+1,lease_owner=?4,lease_until=?5,updated_at=?6 WHERE contract=?1 AND wave_id=?2 AND task_kind=?3 AND state='PENDING' AND due_at<=?6 AND expires_at>?6`).bind(row.contract,row.wave_id,row.task_kind,String(run_id||''),now+lease_ms,now).run();
    const changed=Number(update?.meta?.changes??update?.changes??0)>0;return changed?{status:'CLAIMED',claimed:true,contract:row.contract,wave_id:row.wave_id,task_kind:row.task_kind,attempts:Number(row.attempts||0)+1}:{status:'RACE_LOST',claimed:false};
  }
  async function complete({contract,wave_id,task_kind='NEW_CANDIDATE',run_id,usable,now=clock()}={}){
    const code=normalizeContract(contract),wave=String(wave_id||'').trim();if(!validCandidateContract(code)||!wave||typeof usable!=='boolean')return{status:'INVALID',completed:false};
    const update=await db.prepare(`UPDATE report2_candidate_task_v2 SET state=CASE WHEN ?5=1 THEN 'COMPLETED' WHEN attempts>=?7 THEN 'FAILED_FINAL' ELSE 'PENDING' END,terminal_reason=CASE WHEN ?5=1 THEN 'USABLE_RESULT' WHEN attempts>=?7 THEN 'MAX_ATTEMPTS_WITHOUT_USABLE_RESULT' ELSE NULL END,lease_owner=NULL,lease_until=NULL,due_at=CASE WHEN ?5=1 OR attempts>=?7 THEN due_at ELSE ?6+300000 END,updated_at=?6 WHERE contract=?1 AND wave_id=?2 AND task_kind=?3 AND state='RUNNING' AND lease_owner=?4`).bind(code,wave,task_kind,String(run_id||''),usable?1:0,now,max_attempts).run();
    const changed=Number(update?.meta?.changes??update?.changes??0)>0;if(!changed)return{status:'CLAIM_NOT_OWNED',completed:false};
    const row=await db.prepare(`SELECT state,terminal_reason FROM report2_candidate_task_v2 WHERE contract=?1 AND wave_id=?2 AND task_kind=?3`).bind(code,wave,task_kind).first();return{status:row?.state||'UNKNOWN',completed:true,contract:code,wave_id:wave,usable,terminal_reason:row?.terminal_reason||null};
  }
  async function summary({now=clock()}={}){await install();await expireCandidateTasks(db,{now});const result=await db.prepare(`SELECT state,COUNT(*) AS count FROM report2_candidate_task_v2 GROUP BY state`).all();return{version:'candidate-task-queue-v2-wave-scoped-20260928',counts:Object.fromEntries((result?.results||[]).map(row=>[row.state,Number(row.count)])),ttl_ms,lease_ms,max_attempts,wave_scoped:true};}
  return{install,enqueue,claim,complete,summary,version:'candidate-task-queue-v2-wave-scoped-20260928'};
}
