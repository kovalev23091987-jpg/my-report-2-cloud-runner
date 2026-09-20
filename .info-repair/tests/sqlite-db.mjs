import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
const root=new URL('../fixtures/',import.meta.url);
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
  }
  close(){this.sqlite.close();}
}
