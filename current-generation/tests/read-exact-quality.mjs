import fs from 'node:fs';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
const phase=JSON.parse(fs.readFileSync('checkpoints/CLOUD_PHASE_STATE_20261004.json')),fence=JSON.parse(fs.readFileSync('audit-fixes/source-optimization-20260930/execution-lock.json'));
if(phase.lease.owner!=="HTX:20261005T154046Z:1cd3b94d-4e3e-4385-81b1-61f800b46a16"||phase.lease.expires_ts<=Date.now()||fence.active)throw Error('EXECUTION_OWNER_NOT_ADMITTED');
const db=new RemoteD1Database(process.env.REPORT2_D1_BRIDGE_URL,process.env.REPORT2_D1_BRIDGE_TOKEN);
const rows=await db.prepare('SELECT full_evidence_id,contract_code,observed_ts,dq_status,chain_status_json,conflicts_json,evidence_compact_json FROM full_evidence_shadow_log WHERE full_evidence_id IN (?1,?2) LIMIT 2').bind('1791217634938:ZEC-USDT:full-evidence-v2','1791217664980:SUI-USDT:full-evidence-v2').all();
const out={source_http:0,main:0,rows:rows.results,usage:db.usageSnapshot()};console.log('QUALITYROWS:'+Buffer.from(JSON.stringify(out)).toString('base64'));
