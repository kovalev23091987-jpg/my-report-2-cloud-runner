// PREPARED ONLY. SQLite execution is permitted only in ROOT's separately admitted case.
// Metadata is controlled logical accounting, never Cloudflare physical rows/performance.
export async function openControlledD1({maxStatements=6000}={}) {
  const {DatabaseSync}=await import('node:sqlite');
  if(!Number.isSafeInteger(maxStatements)||maxStatements<1||maxStatements>6000)throw Error('F697_STATEMENT_BOUND_REQUIRED');
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE report2_runner_budget_ledger_shadow (
    reservation_id TEXT PRIMARY KEY,day_utc TEXT NOT NULL,reserve_rows_read INTEGER NOT NULL,
    reserve_rows_written INTEGER NOT NULL,state TEXT NOT NULL,started_ts INTEGER NOT NULL,
    measured_rows_read INTEGER,measured_rows_written INTEGER,measured_requests INTEGER,
    unknown_ops INTEGER,source_run_id TEXT,completed_ts INTEGER);
    CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc);
    CREATE TABLE pump_report_state_v1(state_key TEXT PRIMARY KEY,value_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,updated_ts INTEGER NOT NULL);`);
  let attempted=0,executed=0,acknowledged=0,admin=3,nextBarrier=null,nextFault=null,closed=false;
  const trace=[];
  const matches=(match,query,args)=>typeof match==='function'?match(query,args):query.includes(String(match));
  function inspect(query,args=[]){admin++;return sql.prepare(query).all(...args);}
  function barrierNext(match='') {
    if(nextBarrier)throw Error('F697_BARRIER_ALREADY_ARMED');
    let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);
    const item={match,entered,enter,wait,release};nextBarrier=item;
    return Object.freeze({entered,release:()=>release(),cancel:()=>{if(nextBarrier===item)nextBarrier=null;release();}});
  }
  function ackUnknownNext(match='',error=Object.assign(Error('F697_INJECTED_ACK_UNKNOWN'),{code:'F697_INJECTED_ACK_UNKNOWN'})) {
    if(nextFault)throw Error('F697_ACK_FAULT_ALREADY_ARMED');
    nextFault={match,error};return error;
  }
  const db={
    prepare(query){
      if(typeof query!=='string'||!query.trim())throw Error('F697_SQL_REQUIRED');
      let args=[];
      return {bind(...values){args=values;return this;},async all(){
        if(closed)throw Error('F697_SQLITE_CLOSED');
        if(++attempted>maxStatements)throw Error('F697_CONTROLLED_STATEMENT_BOUND');
        const record={sequence:attempted,query,args:structuredClone(args),executed:false,acknowledged:false};trace.push(record);
        if(nextBarrier&&matches(nextBarrier.match,query,args)){
          const b=nextBarrier;nextBarrier=null;b.enter({sequence:attempted,query,args:structuredClone(args)});await b.wait;
        }
        const rows=sql.prepare(query).all(...args);executed++;record.executed=true;
        const mutation=/^(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query.trim())||/^WITH\b/i.test(query.trim())&&/\bINSERT\s+INTO\b/i.test(query);
        let changes=0;if(mutation){admin++;changes=Number(sql.prepare('SELECT changes() AS n').get().n);}
        // Explicit model: returned SELECT rows; mutation predicate reads 1,
        // atomicPair WITH gate reads 4; DDL reads/writes 0. changes is actual SQLite.
        const meta={rows_read:mutation?(/^WITH\b/i.test(query.trim())?4:1):rows.length,rows_written:changes,changes,
          accounting_basis:'CONTROLLED_SQLITE_LOGICAL_MODEL_NOT_NATIVE_PHYSICAL_ROWS'};
        record.meta=structuredClone(meta);
        if(nextFault&&matches(nextFault.match,query,args)){
          const f=nextFault;nextFault=null;record.ack_unknown=true;throw f.error;
        }
        acknowledged++;record.acknowledged=true;return {success:true,results:rows,meta};
      }};
    },
    barrierNext,ackUnknownNext,
    peek(key){const row=inspect('SELECT value_json FROM pump_report_state_v1 WHERE state_key=?1 LIMIT 1',[key])[0];return row?JSON.parse(row.value_json):null;},
    inspect,
    seed(key,value,at){admin++;sql.prepare('INSERT INTO pump_report_state_v1(state_key,value_json,revision,updated_ts) VALUES(?1,?2,0,?3)').run(key,JSON.stringify(value),at);},
    seedLedger(row){
      const columns=['reservation_id','day_utc','reserve_rows_read','reserve_rows_written','state','started_ts','measured_rows_read','measured_rows_written','measured_requests','unknown_ops','source_run_id','completed_ts'];
      if(Object.keys(row).some(k=>!columns.includes(k)))throw Error('F697_LEDGER_FIXTURE_COLUMNS_REQUIRED');
      admin++;sql.prepare('INSERT INTO report2_runner_budget_ledger_shadow('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')')
        .run(...columns.map(k=>row[k]??null));
    },
    snapshot(){
      const state=inspect('SELECT state_key,value_json,revision,updated_ts FROM pump_report_state_v1 ORDER BY state_key').map(r=>({...r,value:JSON.parse(r.value_json)}));
      const ledger=inspect('SELECT * FROM report2_runner_budget_ledger_shadow ORDER BY reservation_id');
      return {schema:'F697_CONTROLLED_SQLITE_SNAPSHOT_V1',accounting_basis:'CONTROLLED_NOT_NATIVE_PHYSICAL',
      counters:{attempted,executed,acknowledged,administrative_statements:admin,maxStatements},state,ledger,trace:structuredClone(trace),
      armed:{barrier:!!nextBarrier,ack_fault:!!nextFault}};},
    counters:()=>({attempted,executed,acknowledged,administrative_statements:admin,maxStatements}),
    close(){if(nextBarrier||nextFault)throw Error('F697_UNCONSUMED_FAULT');sql.close();closed=true;}
  };
  db.faults=Object.freeze({ackUnknownNext});db.barriers=Object.freeze({next:barrierNext});
  return db;
}
