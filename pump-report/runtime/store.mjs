import {BudgetRefusal,RESOURCE_LIMITS,utcDay} from './budget.mjs';
const workPointer=key=>typeof key==='string'&&/^pump:work-index:v1:(manual|delivery|journal|outcomes):ready:[0-9]{16}$/.test(key);

export class MemoryStore {
  constructor(){this.rows=new Map();this.chain=Promise.resolve();}
  async get(key){return structuredClone(this.rows.get(key)??null);}
  async set(key,value){this.rows.set(key,structuredClone(value));return value;}
  async removeWorkPointer(key){if(!workPointer(key))throw new BudgetRefusal('DERIVED_WORK_POINTER_REQUIRED');this.rows.delete(key);}
  async boundedArray(key,{max_items=40,max_bytes=10000}={}){const value=this.rows.get(key)??[];if(!Array.isArray(value)||value.length>max_items||new TextEncoder().encode(JSON.stringify(value)).length>max_bytes)throw new BudgetRefusal('LEGACY_INDEX_BOUNDED_MIGRATION_REQUIRED');return structuredClone(value);}
  async scanPrefix(prefix,{after_key=prefix,limit=40}={}){if(!Number.isSafeInteger(limit)||limit<1||limit>40||!after_key.startsWith(prefix))throw new BudgetRefusal('BOUNDED_PREFIX_SCAN_REQUIRED');return [...this.rows.entries()].filter(([key])=>key.startsWith(prefix)&&key>after_key).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit).map(([key,value])=>({key,value:structuredClone(value)}));}
  async atomic(key,change){const job=this.chain.then(async()=>{const {state,result}=change(await this.get(key));await this.set(key,state);return result;});this.chain=job.catch(()=>{});return job;}
  async atomicPair(keys,change){
    if(!Array.isArray(keys)||keys.length!==2||keys[0]===keys[1])throw new BudgetRefusal('DISTINCT_STATE_PAIR_REQUIRED');
    const job=this.chain.then(async()=>{const {states,result}=change(await Promise.all(keys.map(key=>this.get(key))));if(!Array.isArray(states)||states.length!==2||states.some(s=>s===undefined))throw new BudgetRefusal('TWO_STATE_VALUES_REQUIRED');for(let i=0;i<2;i++)await this.set(keys[i],states[i]);return result;});this.chain=job.catch(()=>{});return job;
  }
}

// Native D1 metadata is observed for every statement. Missing ACKs never mean 0.
export class D1Store {
  constructor({db,admission,clock=Date.now,initial_usage=null,finalization_reserve=null}){
    if(!db?.prepare||!admission?.evidence_ref||!Number.isSafeInteger(admission.expires_ts)||admission.expires_ts<=clock()||!Number.isSafeInteger(admission.max_rows_read)||!Number.isSafeInteger(admission.max_rows_written))throw new BudgetRefusal('NATIVE_SQL_ADMISSION_REQUIRED');
    this.db=db;this.admission=admission;this.clock=clock;this.cost=initial_usage?{...initial_usage}:{requests:0,rows_read:0,rows_written:0,unknown_ops:0};
    // The confirmed Workers Paid plan permits1000 D1 queries per invocation.
    // Leave platform headroom and protect the finalization ACK/readback too.
    this.max_requests=admission.max_requests??800;
    if(!Number.isSafeInteger(this.max_requests)||this.max_requests<2||this.max_requests>800)throw new BudgetRefusal('BOUNDED_NATIVE_QUERY_COUNT_REQUIRED');
    this.finalization_reserve=finalization_reserve?{...finalization_reserve}:{rows_read:0,rows_written:0};
    if(!Object.values(this.finalization_reserve).every(n=>Number.isSafeInteger(n)&&n>=0))throw new BudgetRefusal('INVALID_FINALIZATION_RESERVE');
    if(!Object.values(this.cost).every(n=>Number.isSafeInteger(n)&&n>=0))throw new BudgetRefusal('INVALID_INITIAL_NATIVE_USAGE');
  }
  check(extraRead=1,extraWrite=0,extraRequests=0){
    if(this.admission.expires_ts<=this.clock()||this.cost.unknown_ops>0)throw new BudgetRefusal('NATIVE_SQL_ADMISSION_EXPIRED_OR_UNKNOWN');
    if(this.cost.requests+extraRequests+(this.finalization_reserve.requests??0)>this.max_requests)throw new BudgetRefusal('NATIVE_SQL_QUERY_COUNT_PROTECTED');
    if(this.cost.rows_read+extraRead+this.finalization_reserve.rows_read>this.admission.max_rows_read||this.cost.rows_written+extraWrite+this.finalization_reserve.rows_written>this.admission.max_rows_written)throw new BudgetRefusal('NATIVE_SQL_RUN_ENVELOPE_EXHAUSTED');
  }
  beginFinalization(){this.check(0,0);this.finalization_reserve={rows_read:0,rows_written:0};}
  async query(sql,args=[],{read=1,write=0}={}){
    this.check(read,write,1);let result;
    try{result=await this.db.prepare(sql).bind(...args).all();}catch(error){this.cost.requests++;this.cost.unknown_ops++;throw error;}
    this.cost.requests++;
    if(result?.success===false||!['rows_read','rows_written'].every(k=>Number.isSafeInteger(result?.meta?.[k])&&result.meta[k]>=0)){this.cost.unknown_ops++;throw new BudgetRefusal('NATIVE_SQL_COST_ACK_UNKNOWN');}
    this.cost.rows_read+=result.meta.rows_read;this.cost.rows_written+=result.meta.rows_written;
    this.check(0,0);return result;
  }
  async install(){
    await this.query('CREATE TABLE IF NOT EXISTS pump_report_state_v1 (state_key TEXT PRIMARY KEY,value_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_ts INTEGER NOT NULL)',[],{read:20,write:20});
  }
  async get(key){const r=await this.query('SELECT value_json FROM pump_report_state_v1 WHERE state_key=?1 LIMIT 1',[key]);return r.results?.[0]?JSON.parse(r.results[0].value_json):null;}
  async boundedArray(key,{max_items=40,max_bytes=10000}={}){
    if(!Number.isSafeInteger(max_items)||max_items<0||max_items>40||!Number.isSafeInteger(max_bytes)||max_bytes<1||max_bytes>10000)throw new BudgetRefusal('BOUNDED_LEGACY_ARRAY_REQUIRED');
    const r=await this.query(`SELECT CASE WHEN length(CAST(value_json AS BLOB))<=?3 AND json_type(value_json)='array' AND json_array_length(value_json)<=?2 THEN value_json ELSE NULL END AS bounded_value FROM pump_report_state_v1 WHERE state_key=?1 LIMIT 1`,[key,max_items,max_bytes]);
    if(!r.results?.length)return [];if(r.results[0].bounded_value===null)throw new BudgetRefusal('LEGACY_INDEX_BOUNDED_MIGRATION_REQUIRED');return JSON.parse(r.results[0].bounded_value);
  }
  async scanPrefix(prefix,{after_key=prefix,limit=40}={}){
    if(typeof prefix!=='string'||!prefix||typeof after_key!=='string'||!after_key.startsWith(prefix)||!Number.isSafeInteger(limit)||limit<1||limit>40)throw new BudgetRefusal('BOUNDED_PREFIX_SCAN_REQUIRED');
    const r=await this.query('SELECT state_key,value_json FROM pump_report_state_v1 WHERE state_key>=?1 AND state_key<?2 AND state_key>?3 ORDER BY state_key LIMIT ?4',[prefix,prefix+'\uffff',after_key,limit],{read:limit});return (r.results??[]).map(row=>({key:row.state_key,value:JSON.parse(row.value_json)}));
  }
  async set(key,value){await this.query('INSERT INTO pump_report_state_v1(state_key,value_json,revision,updated_ts) VALUES(?1,?2,0,?3) ON CONFLICT(state_key) DO UPDATE SET value_json=excluded.value_json,revision=pump_report_state_v1.revision+1,updated_ts=excluded.updated_ts',[key,JSON.stringify(value),this.clock()],{read:2,write:2});return value;}
  async removeWorkPointer(key){if(!workPointer(key))throw new BudgetRefusal('DERIVED_WORK_POINTER_REQUIRED');await this.query('DELETE FROM pump_report_state_v1 WHERE state_key=?1',[key],{read:1,write:2});}
  async atomic(key,change){
    for(let attempt=0;attempt<5;attempt++){
      const current=await this.query('SELECT value_json,revision FROM pump_report_state_v1 WHERE state_key=?1 LIMIT 1',[key]);const row=current.results?.[0];
      const {state,result}=change(row?JSON.parse(row.value_json):null),value=JSON.stringify(state),now=this.clock();
      if(row&&value===row.value_json)return result;
      const r=row?await this.query('UPDATE pump_report_state_v1 SET value_json=?1,revision=revision+1,updated_ts=?2 WHERE state_key=?3 AND revision=?4',[value,now,key,row.revision],{read:1,write:1}):await this.query('INSERT OR IGNORE INTO pump_report_state_v1(state_key,value_json,revision,updated_ts) VALUES(?1,?2,0,?3)',[key,value,now],{read:1,write:2});
      if(r.meta.changes===1)return result;
    }
    throw new BudgetRefusal('STATE_CAS_CONTENTION');
  }
  async atomicPair(keys,change){
    if(!Array.isArray(keys)||keys.length!==2||keys[0]===keys[1]||keys.some(k=>typeof k!=='string'||!k))throw new BudgetRefusal('DISTINCT_STATE_PAIR_REQUIRED');
    for(let attempt=0;attempt<5;attempt++){
      const current=await this.query('SELECT state_key,value_json,revision FROM pump_report_state_v1 WHERE state_key IN (?1,?2)',keys,{read:2});
      const rows=keys.map(key=>current.results?.find(row=>row.state_key===key)),values=rows.map(row=>row?JSON.parse(row.value_json):null),{states,result}=change(values);
      if(!Array.isArray(states)||states.length!==2||states.some(s=>s===undefined))throw new BudgetRefusal('TWO_STATE_VALUES_REQUIRED');
      const texts=states.map(value=>JSON.stringify(value));
      if(rows.every((row,i)=>row&&row.value_json===texts[i]))return result;
      // One statement snapshots both revision predicates before changing either
      // row. A competing event changes both values or none; no separate ACK gap
      // can leave the per-wave state ahead of its materialized aggregate.
      const sql=`WITH gate(ok) AS MATERIALIZED (
        SELECT COALESCE((SELECT revision FROM pump_report_state_v1 WHERE state_key=?1),-1)=?3
          AND COALESCE((SELECT revision FROM pump_report_state_v1 WHERE state_key=?4),-1)=?6
      ), replacement(state_key,value_json,revision,updated_ts) AS (
        VALUES (?1,?2,?3+1,?7),(?4,?5,?6+1,?7)
      ) INSERT INTO pump_report_state_v1(state_key,value_json,revision,updated_ts)
        SELECT replacement.* FROM replacement CROSS JOIN gate WHERE gate.ok
        ON CONFLICT(state_key) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_ts=excluded.updated_ts`;
      const written=await this.query(sql,[keys[0],texts[0],rows[0]?.revision??-1,keys[1],texts[1],rows[1]?.revision??-1,this.clock()],{read:4,write:4});
      if(written.meta.changes===2)return result;
      if(written.meta.changes!==0){this.cost.unknown_ops++;throw new BudgetRefusal('STATE_PAIR_ACK_NOT_ATOMIC');}
    }
    throw new BudgetRefusal('STATE_PAIR_CAS_CONTENTION');
  }
  usage(){return {...this.cost};}
}

export function admitD1Run({observed_usage,legacy_outstanding,requested,protected_reserves,now=Date.now()}){
  const fields=['rows_read','rows_written'];
  if(!observed_usage?.evidence_ref||observed_usage.day_utc!==utcDay(now)||!legacy_outstanding?.evidence_ref||!Number.isSafeInteger(observed_usage.observed_ts)||now-observed_usage.observed_ts>300000)return {allowed:false,reason:'FRESH_ACCOUNT_AND_LEGACY_EVIDENCE_REQUIRED'};
  if(!fields.every(k=>[observed_usage[k],legacy_outstanding[k],requested?.[k],protected_reserves?.[k]].every(n=>Number.isSafeInteger(n)&&n>=0)))return {allowed:false,reason:'UNKNOWN_D1_ENVELOPE'};
  const total=Object.fromEntries(fields.map(k=>[k,observed_usage[k]+legacy_outstanding[k]+requested[k]+protected_reserves[k]]));
  const allowed=total.rows_read<=RESOURCE_LIMITS.d1_reads_day&&total.rows_written<=RESOURCE_LIMITS.d1_writes_day;
  return {allowed,reason:allowed?'BOUNDED_ALL_FAMILY_ENVELOPE':'D1_PROTECTED_DAY_RESERVE',total,requested,protected_reserves,observed_usage,legacy_outstanding};
}
