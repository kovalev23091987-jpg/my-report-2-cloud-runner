import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const runtime=path.resolve(process.argv[2]||'');
if(!runtime)throw new Error('RUNTIME_PATH_REQUIRED');
const {loadProspectiveReadinessSnapshot}=await import(pathToFileURL(path.join(runtime,'r8-20-prospective-validation-sidecar.mjs')).href);
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE tz101_entry_area_calibration_signal(
 sample_id TEXT PRIMARY KEY,direction TEXT,observed_ts INTEGER,sample_json TEXT,
 calibration_only INTEGER,live_promotion_allowed INTEGER,created_ts INTEGER
);
CREATE TABLE tz101_entry_area_calibration_outcome(
 sample_id TEXT,horizon_hours INTEGER,direction TEXT,observed_ts INTEGER,
 outcome_json TEXT,calibration_only INTEGER,live_promotion_allowed INTEGER,computed_ts INTEGER
);`);
const T=Date.UTC(2026,8,27,21,0,0);
const sample={direction:'LONG',observed_ts:T,approved_entry_only:true,idea_basis:'LIQUIDATION_PUMP',cohort_type:'TELEGRAM_CONFIRMED',source_ids:['HTX','COINALYZE']};
const outcome={status:'CLOSED_FACTUAL',direction:'LONG',observed_ts:T,horizon_hours:1,directional_return_pct:6.2,mfe_directional_pct_snapshot:8.1,mae_directional_pct_snapshot:-1.3,target_touched:true,invalidation_touched:false};
const insertSample=(id,direction,observed,json,created=T)=>sql.prepare('INSERT INTO tz101_entry_area_calibration_signal VALUES(?,?,?,?,1,0,?)').run(id,direction,observed,json,created);
const insertOutcome=(id,horizon,direction,observed,json,computed=T+60*60_000)=>sql.prepare('INSERT INTO tz101_entry_area_calibration_outcome VALUES(?,?,?,?,?,1,0,?)').run(id,horizon,direction,observed,json,computed);
insertSample('S1','LONG',T,JSON.stringify(sample));
insertOutcome('S1',1,'LONG',T,JSON.stringify(outcome));
insertSample('BAD_JSON','LONG',T,JSON.stringify(sample));insertOutcome('BAD_JSON',1,'LONG',T,'{');
insertSample('CENSORED','LONG',T,JSON.stringify(sample));insertOutcome('CENSORED',1,'LONG',T,JSON.stringify({...outcome,status:'CENSORED'}));
insertSample('DIRECTION_MISMATCH','LONG',T,JSON.stringify(sample));insertOutcome('DIRECTION_MISMATCH',1,'SHORT',T,JSON.stringify({...outcome,direction:'SHORT'}));
insertSample('TIME_MISMATCH','LONG',T,JSON.stringify(sample));insertOutcome('TIME_MISMATCH',1,'LONG',T+1,JSON.stringify({...outcome,observed_ts:T+1}));
insertSample('MISSING_METRIC','LONG',T,JSON.stringify(sample));insertOutcome('MISSING_METRIC',1,'LONG',T,JSON.stringify({...outcome,directional_return_pct:null}));
insertSample('BAD_SAMPLE','LONG',T,'{');insertOutcome('BAD_SAMPLE',1,'LONG',T,JSON.stringify(outcome));
const normalize=(query,args)=>{const order=[];const text=query.replace(/\?(\d+)/g,(_,n)=>{order.push(Number(n)-1);return'?';});return{text,args:order.map(i=>args[i])};};
const db={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async all(){const q=normalize(query,this.args);return{success:true,results:sql.prepare(q.text).all(...q.args)};}};}};
const result=await loadProspectiveReadinessSnapshot(db,{activation_ts:T-1,now_ts:T+2*60*60_000});
assert.equal(result.status,'NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE');
assert.equal(result.outcome_cells.find(x=>x.direction==='LONG'&&x.horizon_hours===1)?.closed_samples,1);
assert.equal(result.integrity_excluded_outcomes,6);
assert.equal(result.signal_rows.find(x=>x.direction==='LONG')?.sample_count,6);
const basis=result.approved_entry_performance.find(x=>x.dimension==='BASIS'&&x.group==='LIQUIDATION_PUMP');
assert.equal(basis.samples,1);assert.equal(basis.begin_close_hits,1);assert.equal(basis.invalidation_hits,0);
assert.deepEqual(result.approved_entry_performance.filter(x=>x.dimension==='SOURCE').map(x=>x.group).sort(),['COINALYZE','HTX']);
sql.close();
console.log(JSON.stringify({status:'APPROVED_ENTRY_PERFORMANCE_STATS_FAIL_CLOSED',horizons:[1,4,12,24],dimensions:result.performance_dimensions,integrity_excluded_outcomes:result.integrity_excluded_outcomes}));
