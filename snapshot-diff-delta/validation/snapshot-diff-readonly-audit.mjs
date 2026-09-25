import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const rows=x=>Array.isArray(x?.results)?x.results:[];const arr=v=>Array.isArray(v)?v:[];const safe=(v,f=[])=>{try{return typeof v==='string'?JSON.parse(v):(v??f);}catch{return f;}};
async function main(){
 const runtime=path.resolve(process.env.REPORT2_SNAPSHOT_RUNTIME_DIR||'runtime'),mod=await import(pathToFileURL(path.join(runtime,'src/snapshot-diff.mjs')).href);
 const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN,{timeoutMs:30000});
 const candidates=rows(await db.prepare(`SELECT contract_code,COUNT(*) AS c,MAX(observed_ts) AS latest_ts FROM full_evidence_shadow_log GROUP BY contract_code HAVING COUNT(*)>=2 ORDER BY latest_ts DESC LIMIT 8`).all());
 let proof=null;
 for(const candidate of candidates){
   const pair=rows(await db.prepare(`SELECT contract_code,observed_ts,dq_status,evidence_compact_json,conflicts_json FROM full_evidence_shadow_log WHERE contract_code=?1 ORDER BY observed_ts DESC LIMIT 2`).bind(candidate.contract_code).all());
   if(pair.length<2)continue;
   const current=pair[0],previous=await mod.loadPreviousEvidenceSnapshot({db,contract_code:current.contract_code,before_ts:Number(current.observed_ts)});
   if(previous?.status!=='CLOSED')continue;
   const diff=mod.buildSnapshotChanges({previous_snapshot_context:previous,current_public_evidence:{contract_code:current.contract_code,observed_ts:Number(current.observed_ts),dq_status:current.dq_status,evidence:arr(safe(current.evidence_compact_json,[])),conflicts:arr(safe(current.conflicts_json,[]))},observed_ts:Number(current.observed_ts),max_lines:5});
   if(diff.status!=='CLOSED'||!diff.lines.length)continue;
   const prevIso=new Date(Number(previous.row.observed_ts)).toISOString(),curIso=new Date(Number(current.observed_ts)).toISOString();
   const timestampBound=diff.lines.every(x=>String(x).includes(prevIso)&&String(x).includes(curIso));
   proof={contract_code:current.contract_code,current_observed_ts:Number(current.observed_ts),previous_observed_ts:Number(previous.row.observed_ts),current_closed_facts:diff.current_closed_fact_count,previous_closed_facts:diff.previous_closed_fact_count,changed_fact_count:diff.changed_fact_count,source_set_changed:diff.source_set_changed,lines:diff.lines,timestamp_bound:timestampBound};
   if(timestampBound)break;
 }
 const usage=typeof db.usageSnapshot==='function'?db.usageSnapshot():null;if(usage&&(Number(usage.rows_written)!==0||Number(usage.unknown_ops)!==0))throw new Error('SNAPSHOT_DIFF_AUDIT_NOT_READ_ONLY');
 const out={version:'snapshot-diff-readonly-audit-v1-20260925',status:proof?.timestamp_bound?'CLOSED_FACTUAL_PREVIOUS_SNAPSHOT_DIFF':'NOT_CLOSED_NO_FACTUAL_PAIR',proof,candidate_contracts:candidates.map(x=>x.contract_code),d1_usage:usage,safety:{production_writes:false,d1_writes:false,telegram_send:false,trading:false,thresholds_changed:false,strategy_weights_changed:false,probability_enabled:false,new_sources_added:false}};
 fs.writeFileSync(process.env.REPORT2_SNAPSHOT_AUDIT_OUTPUT||'snapshot-diff-readonly-audit.json',JSON.stringify(out,null,2)+'\n');console.log('SNAPSHOT_DIFF_READONLY_AUDIT',JSON.stringify(out));if(out.status!=='CLOSED_FACTUAL_PREVIOUS_SNAPSHOT_DIFF')process.exit(2);
}
main().catch(e=>{console.error('SNAPSHOT_DIFF_AUDIT_FATAL',String(e?.stack||e));process.exit(1);});
