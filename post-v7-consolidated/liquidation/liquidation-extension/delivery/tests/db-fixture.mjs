import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';
function sqlArgs(sql,args){const ix=[];const q=sql.replace(/\?(\d+)/g,(_,n)=>{ix.push(Number(n)-1);return '?';});return ix.length?[q,ix.map(i=>args[i])]:[q,args];}
class Statement{
 constructor(owner,sql,args=[]){this.owner=owner;this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.owner,this.sql,args);}
 async first(){const [q,a]=sqlArgs(this.sql,this.args);const r=this.owner.raw.prepare(q).get(...a)??null;this.owner.usage.requests++;this.owner.usage.rows_read+=r?1:0;return r;}
 async all(){const [q,a]=sqlArgs(this.sql,this.args);const r=this.owner.raw.prepare(q).all(...a);this.owner.usage.requests++;this.owner.usage.rows_read+=r.length;return {results:r};}
 async run(){const [q,a]=sqlArgs(this.sql,this.args);const r=this.owner.raw.prepare(q).run(...a);this.owner.usage.requests++;this.owner.usage.rows_written+=Number(r.changes);return {meta:{changes:Number(r.changes)}};}
}
export class FixtureDB{
 constructor(){this.raw=new DatabaseSync(':memory:');this.usage={requests:0,rows_read:0,rows_written:0,unknown_ops:0};this.raw.exec(fs.readFileSync(new URL('../migrations.sql',import.meta.url),'utf8'));
 this.raw.exec(`CREATE TABLE v3_user_lifecycle_shadow(contract TEXT,direction TEXT,wave_id TEXT,rules_version TEXT,status TEXT,reason TEXT,observation_ts INTEGER,valid_until_ts INTEGER,updated_ts INTEGER,shadow_only INTEGER,PRIMARY KEY(contract,direction,wave_id,rules_version));
 CREATE TABLE v3_telegram_dispatch_shadow(dispatch_id TEXT PRIMARY KEY,idempotency_key TEXT UNIQUE,contract TEXT,direction TEXT,wave_id TEXT,lifecycle_event TEXT,rules_version TEXT,state TEXT,decision_id TEXT,message_hash TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);
 CREATE TABLE v3_pipeline_health_shadow(namespace TEXT PRIMARY KEY,status TEXT,reasons_json TEXT,changed_ts INTEGER,last_checked_ts INTEGER,shadow_only INTEGER);
 CREATE TABLE v3_pipeline_health_event_shadow(event_id TEXT PRIMARY KEY,transition TEXT,from_status TEXT,to_status TEXT,reasons_json TEXT,state TEXT,telegram_message_id TEXT,last_error TEXT,created_ts INTEGER,updated_ts INTEGER,sent_ts INTEGER,shadow_only INTEGER);`);}
 prepare(s){return new Statement(this,s);}
 usageSnapshot(){return structuredClone(this.usage);}
 close(){this.raw.close();}
}
