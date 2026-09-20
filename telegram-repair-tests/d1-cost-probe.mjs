// Optional workerd/D1 probe, run in addition to the required Node/SQLite suite.
// REPORT2_MINIFLARE_MODULE must point to an installed Miniflare ESM entry point.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {pipelineDB,seedHandoff,seedWave,NOW,SCAN,START} from './pipeline-db.mjs';
import {runV3TelegramLifecycleSidecar as fixed} from '../src/v3-telegram-lifecycle-sidecar.mjs';
const {Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(process.env.REPORT2_MINIFLARE_MODULE).href);
const memory=pipelineDB();seedHandoff(memory);seedWave(memory);
const stmt=memory.sqlite.prepare(`INSERT INTO v3_discovery_deep_handoff_shadow(handoff_id,logical_key,source_run_id,scan_ts,contract_code,base_ticker,state,dedup_reentry_key,created_ts,updated_ts)
  VALUES(?,?,?,?,'OTHER-USDT','OTHER','COMPLETED',?,?,?)`);
for(let i=0;i<800;i++)stmt.run('old:'+i,'old:'+i,'older:'+i,SCAN,'old:'+i,START,START);
const definitions=memory.sqlite.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:"export default {fetch(){return new Response('local test');}}",compatibilityDate:'2026-09-11',d1Databases:{TEST:'00000000-0000-0000-0000-000000000013'}}));
const quote=x=>x===null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
try {
  const native=await mf.getD1Database('TEST');
  for(const d of definitions)await native.prepare(d.sql).run();
  for(const table of definitions.filter(d=>d.type==='table')) {
    const rows=memory.sqlite.prepare('SELECT * FROM '+table.name).all();
    for(let i=0;i<rows.length;i+=40){const batch=rows.slice(i,i+40);const cols=Object.keys(batch[0]);await native.prepare(`INSERT INTO ${table.name}(${cols.join(',')}) VALUES `+batch.map(r=>'('+cols.map(c=>quote(r[c])).join(',')+')').join(',')).run();}
  }
  let usage={rows_read:0,rows_written:0,requests:0,unknown_ops:0};
  const account=r=>{usage.requests++;assert.equal(r.success,true);assert.equal(typeof r.meta.rows_read,'number');usage.rows_read+=r.meta.rows_read;usage.rows_written+=r.meta.rows_written;return r;};
  const wrap=(sql,args=[])=>({sql,args,bind(...a){return wrap(sql,a);},raw(){return native.prepare(sql).bind(...args);},async all(){return account(await this.raw().all());},async first(){return (await this.all()).results[0]??null;},async run(){return account(await this.raw().run());}});
  const db={prepare:wrap,usageSnapshot:()=>({...usage}),async batch(stmts){return (await native.batch(stmts.map(s=>s.raw()))).map(account);}};
  const oldQuery=`SELECT h.handoff_id FROM v3_discovery_deep_handoff_shadow h LEFT JOIN deep_check_run_log d ON d.run_id=h.deep_check_run_id AND d.contract_code=h.contract_code WHERE h.source_run_id=?1 AND h.state='COMPLETED' ORDER BY COALESCE(h.discovery_rank,999999),h.updated_ts DESC LIMIT 6`;
  await db.prepare(oldQuery).bind('cycle').all();const oldUsage={...usage};usage={rows_read:0,rows_written:0,requests:0,unknown_ops:0};
  const output=await fixed(db,{source_run_id:'cycle',now_ts:NOW,dispatch_enabled:true});
  assert.equal(output.status,'CLOSED');assert.equal(output.transitions[0].current_status,'OBSERVE');assert.ok(oldUsage.rows_read>96);assert.ok(usage.rows_read<=96);assert.ok(usage.rows_written<=12);
  const result={status:'PASS',engine:'workerd D1',old_handoff_query:oldUsage,fixed_complete_lifecycle:usage,fixture_handoffs:801,probability:null,execution:false,network_send:false};
  console.log(JSON.stringify(result,null,2));
  if(process.env.REPORT2_COST_PROOF_PATH)await fs.writeFile(process.env.REPORT2_COST_PROOF_PATH,JSON.stringify(result,null,2));
} finally {memory.close();await mf.dispose();}
