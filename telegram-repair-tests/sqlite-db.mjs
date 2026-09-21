import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const root=new URL('./fixtures/',import.meta.url);
export class SQLiteDB {
  constructor(file=':memory:') {
    this.sqlite=new DatabaseSync(file);this.sql=[];this.fail=null;this.ackOverride=null;
    for(const name of ['legacy-telegram-journal.sql','20260917_v3_early_discovery_shadow.sql','20260917_v3_telegram_lifecycle_shadow.sql','info-lifecycle-index.sql'])this.sqlite.exec(fs.readFileSync(new URL(name,root),'utf8'));
  }
  prepare(sql) {
    this.sql.push(sql);const self=this;
    if(this.fail==='prepare')throw new Error('INJECTED_PREPARE');
    return {bind(...args){this.args=args;return this;},
      async first(){if(self.fail==='read')throw new Error('INJECTED_READ');return self.sqlite.prepare(sql).get(...(this.args||[]))??null;},
      async all(){if(self.fail==='read')throw new Error('INJECTED_READ');return {success:true,results:self.sqlite.prepare(sql).all(...(this.args||[]))};},
      async run(){if(self.fail==='write')throw new Error('INJECTED_WRITE');const r=self.sqlite.prepare(sql).run(...(this.args||[]));return self.ackOverride??{success:true,meta:{changes:Number(r.changes)}};}};
  }
  add(row) {
    this.sqlite.prepare(`INSERT OR REPLACE INTO v3_user_lifecycle_shadow(contract,direction,wave_id,rules_version,status,reason,observation_ts,valid_until_ts,updated_ts,shadow_only) VALUES(?,?,?,'fixture',?,?,?,?,?,1)`).run(row.contract,row.direction,row.wave_id,row.status,row.reason,row.observation_ts,row.valid_until_ts,row.updated_ts);
    const score=Number.isFinite(row.early_detection_quality_0_100)?row.early_detection_quality_0_100:73;
    const evidence=row.evidence_refs_json??JSON.stringify([{domain:'OI_ACCELERATION',side:'BOTH',status:'CLOSED'},{domain:'RELATIVE_STRENGTH',side:row.direction,status:'CLOSED'},{domain:'FUNDING_TRAJECTORY',side:row.direction,status:'CLOSED'}]);
    this.sqlite.prepare(`INSERT OR REPLACE INTO v3_early_candidate_wave(
      wave_id,contract_code,generation,first_seen_ts,first_seen_detectors_json,lifecycle_stage,direction_hint,direction_state,
      early_detection_quality_0_100,remaining_edge_json,evidence_refs_json,last_seen_ts,shadow_only)
      VALUES(?,?,1,?,'[]','DISCOVERY',?,'FIXTURE_WATCH',?,'{}',?,?,1)`)
      .run(row.wave_id,row.contract,row.observation_ts,row.direction,score,evidence,row.updated_ts);
    const bucket=Math.floor(row.updated_ts/300000)*300000;
    this.sqlite.prepare(`INSERT OR REPLACE INTO v3_early_feature_snapshot(
      contract_code,ts_bucket,observed_ts,rules_version,direction_hint,direction_state,
      long_evidence_domain_count,short_evidence_domain_count,early_detection_quality_0_100,
      feature_json,evidence_json,shadow_only) VALUES(?,?,?,'fixture',?,'FIXTURE_WATCH',?,?,?,'{}',?,1)`)
      .run(row.contract,bucket,row.updated_ts,row.direction,row.direction==='LONG'?3:0,row.direction==='SHORT'?3:0,score,evidence);
  }
  close(){this.sqlite.close();}
}
