import test from 'node:test';
import assert from 'node:assert/strict';
import {runSelfAudit} from '../validation/production-self-audit-core.mjs';
const NOW=1790509200000;
function db({pipeline={status:'HEALTHY_NO_IDEA',last_checked_ts:NOW},missing=false,null_counts=false}={}){return{prepare(sql){return{bind(){return this;},async first(){
 if(sql.includes('v3_pipeline_health_shadow'))return pipeline;
 if(missing&&sql.includes('canonical_publication_shadow'))throw Error('no such table: canonical_publication_shadow');
 return null_counts?null:{n:0,distinct_n:0};
}};}};}
test('R054 R065: missing new schema cannot produce CLOSED canonical-binding audit',async()=>{
 const p=await runSelfAudit(db({missing:true}),{now:NOW});assert.equal(p.status,'NOT_CLOSED');assert.equal(p.checks.canonical_binding_exact,false);assert.equal(p.checks.actionable_wait_has_durable_recheck,false);
});
for(const [name,pipeline] of [['missing',null],['stale',{status:'HEALTHY_NO_IDEA',last_checked_ts:NOW-7200001}],['future',{status:'HEALTHY_NO_IDEA',last_checked_ts:NOW+1}],['unknown',{status:'UNKNOWN',last_checked_ts:NOW}]])test(`R054: ${name} pipeline telemetry is not healthy`,async()=>{
 const p=await runSelfAudit(db({pipeline}),{now:NOW});assert.equal(p.checks.pipeline_not_degraded,false);assert.equal(p.status,'NOT_CLOSED');
});
test('R054: missing count rows must not be interpreted as zero defects',async()=>{
 const p=await runSelfAudit(db({null_counts:true}),{now:NOW});assert.equal(p.status,'NOT_CLOSED');assert.equal(p.checks.canonical_binding_exact,false);
});
test('R054: fresh healthy pipeline with zero factual activity remains an honest no-activity audit',async()=>{
 const p=await runSelfAudit(db(),{now:NOW});assert.equal(p.status,'CLOSED');assert.equal(p.facts.fresh_lifecycle.n,0);
});
