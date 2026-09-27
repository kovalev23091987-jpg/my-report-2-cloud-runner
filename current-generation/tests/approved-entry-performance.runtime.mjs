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
const T=Date.UTC(2026,8,27,21,0,0),sample={idea_basis:'LIQUIDATION_PUMP',source_ids:['HTX','COINALYZE']};
const outcome={directional_return_pct:6.2,mfe_directional_pct_snapshot:8.1,mae_directional_pct_snapshot:-1.3,target_touched:true,invalidation_touched:false};
sql.prepare('INSERT INTO tz101_entry_area_calibration_signal VALUES(?,?,?,?,1,0,?)').run('S1','LONG',T,JSON.stringify(sample),T);
sql.prepare('INSERT INTO tz101_entry_area_calibration_outcome VALUES(?,?,?,?,?,1,0,?)').run('S1',1,'LONG',T,JSON.stringify(outcome),T+60*60_000);
const normalize=(query,args)=>{const order=[];const text=query.replace(/\?(\d+)/g,(_,n)=>{order.push(Number(n)-1);return'?';});return{text,args:order.map(i=>args[i])};};
const db={prepare(query){return{args:[],bind(...args){this.args=args;return this;},async all(){const q=normalize(query,this.args);return{success:true,results:sql.prepare(q.text).all(...q.args)};}};}};
const result=await loadProspectiveReadinessSnapshot(db,{activation_ts:T-1,now_ts:T+2*60*60_000});
assert.equal(result.status,'NOT_VALIDATED_INSUFFICIENT_PROSPECTIVE_SAMPLE');
assert.equal(result.outcome_cells.find(x=>x.direction==='LONG'&&x.horizon_hours===1)?.closed_samples,1);
const basis=result.approved_entry_performance.find(x=>x.dimension==='BASIS'&&x.group==='LIQUIDATION_PUMP');
assert.equal(basis.samples,1);assert.equal(basis.begin_close_hits,1);assert.equal(basis.invalidation_hits,0);
assert.deepEqual(result.approved_entry_performance.filter(x=>x.dimension==='SOURCE').map(x=>x.group).sort(),['COINALYZE','HTX']);
sql.close();
console.log(JSON.stringify({status:'APPROVED_ENTRY_PERFORMANCE_STATS_CLOSED',horizons:[1,4,12,24],dimensions:result.performance_dimensions}));
