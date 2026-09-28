import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const runtime=path.resolve(process.argv[2]||'runtime');
const {prepareFullEvidenceProofBundle,sealFullEvidenceProofBundleAfterAck}=await import(pathToFileURL(path.join(runtime,'src/stage392-proof-runtime.mjs')).href);
const NOW=Date.UTC(2026,8,28,12),CONTRACT='BOME-USDT',SNAPSHOT=`S392:${CONTRACT}:${NOW}`;
const record={full_evidence_id:'FE:BOME:1',shadow_id:'SH:BOME:1',contract:CONTRACT,observed_ts:NOW,evidence_compact:[]};
const prepared=()=>prepareFullEvidenceProofBundle({record,contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW});
const ack=extra=>({status:'CLOSED',persisted:true,changes:1,committed_ts:NOW+5,full_evidence_id:record.full_evidence_id,contract_code:CONTRACT,snapshot_id:SNAPSHOT,observed_ts:NOW,...extra});

const row=prepared();assert.equal(row.status,'PREPARED_UNACKNOWLEDGED');
for(const receipt of [row.bundle.full_evidence,row.bundle.full_evidence.source_registry,row.bundle.safety_gate_receipt,row.bundle.evidence_registry]){
 assert.equal(receipt.persistence.status,'PREPARED_UNACKNOWLEDGED');assert.equal(receipt.persistence.committed_ts,null);
}
for(const bad of [{changes:0},{snapshot_id:'S392:OTHER:1'},{full_evidence_id:'FE:OTHER'},{contract_code:'OTHER-USDT'},{observed_ts:NOW-1},{committed_ts:NOW-1}])assert.equal(sealFullEvidenceProofBundleAfterAck(prepared(),ack(bad)).status,'FAIL_CLOSED');
const sealed=sealFullEvidenceProofBundleAfterAck(prepared(),ack({}));assert.equal(sealed.status,'CLOSED');assert.equal(sealed.bundle.committed_ts,NOW+5);assert.equal(sealed.bundle.full_evidence.persistence.committed_ts,NOW+5);
console.log(JSON.stringify({status:'STAGE392_PERSISTENCE_CONTRACT_PASS',prepared_without_ack:true,exact_identity_ack:true,ack_zero_rejected:true}));
