import { SQLiteDB } from './sqlite-db.mjs';
import fs from 'node:fs';
export const NOW=Date.UTC(2026,8,20,19,49,57),SCAN=NOW-15000,START=SCAN+1000;
export function pipelineDB() {
  const db=new SQLiteDB();
  for(const name of ['report2_deep_check_run_log.sql','report2_deep_check_scheduler_state.sql',
    '20260917_v3_live_handoff_shadow.sql','20260917_v3_live_handoff_wiring_shadow.sql',
    '20260912_shadow_decision_layer.sql','20260914_final_decision_integration_shadow.sql',
    '20260917_final_decision_telegram_context_shadow.sql']) {
    db.sqlite.exec(fs.readFileSync(new URL('./migrations/'+name,import.meta.url),'utf8'));
  }
  db.batch=async statements=>{
    db.sqlite.exec('BEGIN');
    try {const result=[];for(const s of statements)result.push(/^\s*SELECT/.test(s.sql)?await s.all():await s.run());db.sqlite.exec('COMMIT');return result;}
    catch(e){db.sqlite.exec('ROLLBACK');throw e;}
  };
  const prepare=db.prepare.bind(db);db.prepare=sql=>Object.assign(prepare(sql),{sql});
  return db;
}
export function seedHandoff(db,{contract='RAY-USDT',dir='LONG',run='cycle',wave=null,scan=SCAN,start=START,completed=NOW-2000,sufficiency='PARTIAL',shadowStage=null}={}) {
  const handoff='H:'+run+':'+contract;
  db.sqlite.prepare(`INSERT INTO v3_discovery_deep_handoff_shadow(handoff_id,logical_key,source_run_id,scan_ts,contract_code,base_ticker,
    discovery_rank,direction,wave_id,dedup_reentry_key,state,deep_check_run_id,created_ts,updated_ts,completed_ts)
    VALUES(?,?,?,?,?,?,1,?,?,?,'COMPLETED',?,?,?,?)`).run(handoff,handoff,run,scan,contract,contract.slice(0,-5),dir,wave,handoff,run,start,completed,completed);
  db.sqlite.prepare(`INSERT INTO deep_check_run_log(run_id,contract_code,started_ts,completed_ts,execution_status,data_sufficiency,error_text,created_ts,v3_handoff_id)
    VALUES(?,?,?,?,'COMPLETED',?,NULL,?,?)`).run(run,contract,start,completed,sufficiency,completed,handoff);
  db.sqlite.prepare(`INSERT INTO shadow_decision_log(shadow_id,contract_code,observed_ts,rules_version,mode,direction_hint,eq_status,dq_status,stage,data_sufficiency,created_ts)
    VALUES(?,?,?,'fixture','SHADOW_ONLY',?,'SHADOW_MEASURABLE','HTX_CLOSED_EXTERNAL_CHAINS_MISSING',?,?,?)`)
    .run('SD:'+handoff,contract,start+1000,dir,shadowStage||'SHADOW_OBSERVE_'+dir+'_BIAS',sufficiency,completed);
  return handoff;
}
export function seedWave(db,{contract='RAY-USDT',dir='LONG',wave='EDW:RAY:1',last=SCAN,first=SCAN-60000,stage='PRE_IMPULSE_WATCH',generation=1,score=73}={}) {
  const evidence=JSON.stringify([{domain:'OI_ACCELERATION',side:'BOTH',status:'CLOSED'},{domain:'RELATIVE_STRENGTH',side:dir,status:'CLOSED'},{domain:'FUNDING_TRAJECTORY',side:dir,status:'CLOSED'}]);
  db.sqlite.prepare(`INSERT INTO v3_early_candidate_wave(wave_id,contract_code,generation,first_seen_ts,first_seen_detectors_json,
    lifecycle_stage,direction_hint,direction_state,early_detection_quality_0_100,remaining_edge_json,evidence_refs_json,last_seen_ts)
    VALUES(?,?,?,?, '[]',?,?,?,?,'{}',?,?)`).run(wave,contract,generation,first,stage,dir,dir+'_WATCH',score,evidence,last);
  db.sqlite.prepare(`INSERT OR REPLACE INTO v3_early_feature_snapshot(
    contract_code,ts_bucket,observed_ts,rules_version,direction_hint,direction_state,
    long_evidence_domain_count,short_evidence_domain_count,early_detection_quality_0_100,
    feature_json,evidence_json,shadow_only) VALUES(?,?,?,'fixture',?,'FIXTURE_WATCH',?,?,?,'{}',?,1)`)
    .run(contract,Math.floor(last/300000)*300000,last,dir,dir==='LONG'?3:0,dir==='SHORT'?3:0,score,evidence);
}
