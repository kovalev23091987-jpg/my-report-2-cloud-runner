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
