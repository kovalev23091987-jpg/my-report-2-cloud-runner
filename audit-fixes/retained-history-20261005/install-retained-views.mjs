import fs from 'node:fs';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {HISTORY_TABLES,retainedSchemaSql} from '../../current-generation/files/src/retained-history.mjs';
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const exec=db._request.bind(db);
db._request=async p=>{
 if(!['all','first','run'].includes(p.op)||!/^\s*(PRAGMA table_info|SELECT|CREATE (TABLE|INDEX|VIEW|TRIGGER) IF NOT EXISTS (?:idx_)?report2_[a-zA-Z0-9_]+)\b/i.test(p.sql)||db.usageSnapshot().rows_read>1800||db.usageSnapshot().rows_written>50||db.usageSnapshot().requests>18)throw Error('RETAINED_VIEW_BOOTSTRAP_GUARD');
 return exec(p);
};
const records={};
for(const [table,spec] of Object.entries(HISTORY_TABLES)){
 const cols=(await db.prepare(`PRAGMA table_info(${table})`).all()).results||[];
 for(const sql of retainedSchemaSql(table,cols))await db.prepare(sql).run();
 records[table]={columns:cols.map(c=>c.name),archive_count:await db.prepare(`SELECT COUNT(*) AS n FROM ${spec.archive}`).first(),plan:await db.prepare(`SELECT name,type FROM sqlite_schema WHERE name=?1`).bind(spec.view).all()};
 if(records[table].archive_count?.n!==0)throw Error('COLD_ROWS_ALREADY_PRESENT_REQUIRE_SEPARATE_READBACK');
}
const proof={schema:'report2-retained-views-bootstrap-v1',status:'EMPTY_READTHROUGH_VIEWS_INSTALLED_ORIGINAL_ROWS_UNCHANGED',read_at:Date.now(),records,usage:db.usageSnapshot(),sourceHTTP:0,MAIN:0,Telegram:0,original_rows_deleted:0,history_relocated:0};
fs.writeFileSync('audit-output/retained-views-bootstrap.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
