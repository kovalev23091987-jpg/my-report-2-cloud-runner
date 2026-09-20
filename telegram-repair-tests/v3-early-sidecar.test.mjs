import test from 'node:test';
import assert from 'node:assert/strict';
import {runV3EarlyPersistenceSidecar,V3_EARLY_SIDECAR_BUDGET,chooseEarlyPersistenceTargets} from '../src/v3-early-sidecar.mjs';

const NOW=1_800_000_000_000;
function payload(ts,{altPrice=100,altOi=1000,altFunding=-0.0001,altTurnover=1_000_000}={}){
  return JSON.stringify({schema:'stage0-compact-v2',timestamp:ts,contracts:[
    ['BTC-USDT',50000,1e9,100000,5e9,0.0001,8,1,'CLOSED',false,false,0,0],
    ['ETH-USDT',3000,5e8,90000,3e9,0.0001,8,1,'CLOSED',false,false,0,0],
    ['TEST-USDT',altPrice,altTurnover,altOi,1e7,altFunding,8,1,'CLOSED',false,false,0,0],
  ]});
}
const recent=[];
for(let i=72;i>=0;i--){
  const ts=NOW-i*5*60_000;
  const frac=(72-i)/72;
  const lastHour=i<=12;
  recent.push({
    ts,
    payload_json:payload(ts,{
      altPrice:lastHour?100+(12-i)*0.20:100,
      altOi:1000+Math.round(frac*40),
      altFunding:lastHour?-0.0001-(12-i)*0.00001:-0.0001,
      altTurnover:1_000_000+Math.round(frac*50_000),
    })
  });
}
const b12={ts:NOW-12*60*60_000,payload_json:payload(NOW-12*60*60_000)};
const b24={ts:NOW-24*60*60_000,payload_json:payload(NOW-24*60*60_000)};

class FakeStmt{constructor(sql,db){this.sql=sql;this.db=db;this.args=[];}bind(...args){this.args=args;return this;}async first(){return null;}}
class FakeDb{
  constructor(){this.usage={rows_read:0,rows_written:0,requests:0,unknown_ops:0};this.persistSql=[];}
  prepare(sql){return new FakeStmt(sql,this);}
  usageSnapshot(){return {...this.usage};}
  async batch(stmts){
    this.usage.requests+=1;
    if(stmts.length===4 && stmts[0].sql.includes('FROM scan_runs')){
      const rows=[recent,[b12],[b24],[]];
      this.usage.rows_read+=recent.length+2;
      return rows.map(results=>({results,meta:{changes:0}}));
    }
    this.persistSql.push(...stmts.map(s=>s.sql));
    let writes=0;
    for(const s of stmts){ writes+=s.sql.includes('v3_early_outcome_journal')?4:1; }
    this.usage.rows_written+=writes;
    return stmts.map(()=>({meta:{changes:1}}));
  }
}

test('V3 early sidecar persists bounded first-seen wave without probability',async()=>{
  const db=new FakeDb();
  const out=await runV3EarlyPersistenceSidecar(db,{current_scan_ts:NOW,source_run_id:'RUN-1',now_ts:NOW});
  assert.equal(out.status,'CLOSED');
  assert.equal(out.selected_count,1);
  assert.equal(out.persisted,1);
  assert.equal(out.targets[0].contract,'TEST-USDT');
  assert.equal(out.targets[0].new_wave_opened,true);
  assert.equal(out.targets[0].lifecycle_stage,'DISCOVERY');
  assert.equal(out.probability,null);
  assert.equal(out.validated_signal,false);
  assert.ok(out.usage_delta.rows_read<=V3_EARLY_SIDECAR_BUDGET.rows_read);
  assert.ok(out.usage_delta.rows_written<=V3_EARLY_SIDECAR_BUDGET.rows_written);
  assert.ok(db.persistSql.some(s=>s.includes('v3_early_candidate_wave')));
  assert.ok(db.persistSql.some(s=>s.includes('v3_early_outcome_journal')));
});

test('V3 sidecar target selection keeps an active candidate and does not exceed cap',()=>{
  const obs=(contract,q=50)=>({contract,current_row:{market_age_sec:1,prior_discovery:{long_watch:false,short_watch:false,long_trigger_count:0,short_trigger_count:0}},observation:{status:'CLOSED',contract,long_evidence_domain_count:2,short_evidence_domain_count:0,early_detection_quality_0_100:q}});
  const active=[{contract_code:'A-USDT',wave_id:'w1',generation:1,last_seen_ts:1,lifecycle_stage:'DISCOVERY',first_seen_detectors_json:'[]',remaining_edge_json:'{}',evidence_refs_json:'[]'}];
  const selected=chooseEarlyPersistenceTargets({observations:[obs('A-USDT',10),obs('B-USDT',90),obs('C-USDT',80),obs('D-USDT',70)],active_candidates:active});
  assert.equal(selected.length,1);
  assert.equal(selected[0].contract,'A-USDT');
});
