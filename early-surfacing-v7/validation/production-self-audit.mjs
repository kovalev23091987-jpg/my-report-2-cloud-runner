import fs from 'node:fs';
import {RemoteD1Database} from '../../runner/report2-d1-adapter.mjs';
import {runSelfAudit} from '../../post-v7-consolidated/final-reconciliation/validation/production-self-audit-core.mjs';
const req=n=>{const v=String(process.env[n]||'').trim();if(!v)throw new Error(`${n}_REQUIRED`);return v;};
const db=new RemoteD1Database(req('REPORT2_D1_BRIDGE_URL'),req('REPORT2_D1_BRIDGE_TOKEN'),{timeoutMs:45000});
let proof;
try {
  proof=await runSelfAudit(db,{now:Date.now(),since_ts:Number(process.env.REPORT2_SELF_AUDIT_SINCE_TS||0),enforce_new:String(process.env.REPORT2_SELF_AUDIT_ENFORCE_NEW||'0')==='1'});
} catch (error) {
  proof={schema:'post-v7-full-self-audit-v1',status:'NOT_CLOSED',checks:{database_audit_available:false},failed:['database_audit_available'],error:String(error?.message||error).slice(0,240),writes:false};
}
proof.usage=db.usageSnapshot();
fs.writeFileSync(process.env.REPORT2_EARLY_SELF_AUDIT_PROOF||'early-self-audit.json',JSON.stringify(proof,null,2));
console.log('EARLY_SURFACING_SELF_AUDIT',JSON.stringify(proof));
if(proof.status!=='CLOSED')process.exitCode=2;
