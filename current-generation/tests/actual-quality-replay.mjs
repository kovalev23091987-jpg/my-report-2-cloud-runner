import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const runtime=path.resolve(process.argv[2]);
const {summarizeDataQuality}=await import(pathToFileURL(path.join(runtime,'src/full-evidence-contract.mjs')));
const {produceTz101HardVeto}=await import(pathToFileURL(path.join(runtime,'src/tz101-hard-veto-producer.mjs')));
const saved=JSON.parse(fs.readFileSync('checkpoints/ACTUAL_SOURCE_QUALITY_CAUSE_20261005.json'));
const results=[];
for(const row of saved.rows){
 const evidence=JSON.parse(row.evidence_compact_json).map(e=>({...e,now_ts:row.observed_ts})),dq=summarizeDataQuality(evidence,JSON.parse(row.conflicts_json));
 assert.equal(dq.incompatible_items,0);assert.equal(dq.future_items,0);assert.equal(dq.unresolved_conflicts,0);assert.equal(dq.status,'PARTIAL');
 const record={contract:row.contract_code,observed_ts:row.observed_ts,data_quality:dq,conflicts:JSON.parse(row.conflicts_json),chain_status:JSON.parse(row.chain_status_json),missing_weighted_chains:['SMART_MONEY_ONCHAIN','SUPPORTING_RISK']};
 const input={contract_code:row.contract_code,snapshot_id:'S392:'+row.contract_code+':'+row.observed_ts,observed_ts:row.observed_ts,safety_gate_receipt_id:'SAVED_QUALITY_REGRESSION_ONLY',full_evidence_record:record,execution_snapshot:null};
 const check=produceTz101HardVeto(input);assert.equal(check.checks.find(c=>c.name==='CRITICAL_DATA_QUALITY').status,'CONFIRMED');assert.notEqual(check.status,'CLEAR','no execution receipt was reconstructed');assert.ok(check.non_owned_entry_gates.includes('REALISTIC_TARGET_RISK_ALL_COSTS'));
 for(const field of ['incompatible_items','future_items','unresolved_conflicts']){const changed=structuredClone(input);changed.full_evidence_record.data_quality[field]=1;assert.equal(produceTz101HardVeto(changed).checks.find(c=>c.name==='CRITICAL_DATA_QUALITY').status,'REFUTED');}
 results.push({contract:row.contract_code,original_clock:row.observed_ts,dq_status:dq.status,quality_check:'CONFIRMED',entry_authorized:false});
}
console.log(JSON.stringify({historical_only:true,source_http:0,MAIN:0,results}));
