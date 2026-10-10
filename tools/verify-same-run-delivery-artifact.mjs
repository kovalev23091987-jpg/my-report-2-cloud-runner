import fs from 'node:fs';
import {auditNoWorkReceipt} from './report2-no-work-receipt.mjs';
const [dir,head,sourceCloudRun]=process.argv.slice(2);
if(!dir||!head||!sourceCloudRun)throw Error('DIRECTORY_EXACT_SOURCE_HEAD_AND_CLOUD_RUN_REQUIRED');
let audit;
if(fs.existsSync(dir+'/report2-run-result.json')){
 const {auditProductionArtifact}=await import('./production-artifact-outcome.mjs');
 const output=JSON.parse(fs.readFileSync(dir+'/report2-run-result.json'));
 if(output.head!==head)throw Error('SOURCE_HEAD_MISMATCH');
 const proof=fs.existsSync(dir+'/same-run-delivery-proof.json')?JSON.parse(fs.readFileSync(dir+'/same-run-delivery-proof.json')):null;
 audit=auditProductionArtifact({output,proof,expected_head:head});
}else{
 if(!fs.existsSync(dir+'/report2-no-work-receipt.json'))throw Error('CANONICAL_OR_EXACT_NO_WORK_RECEIPT_REQUIRED');
 const receipt=JSON.parse(fs.readFileSync(dir+'/report2-no-work-receipt.json'));
 audit=auditNoWorkReceipt({receipt,expected_head:head,expected_cloud_run:sourceCloudRun});
}
fs.writeFileSync(dir+'/automatic-delivery-audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(audit));
