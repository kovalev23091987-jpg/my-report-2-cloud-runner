import fs from 'node:fs';
import {verifySameRunDeliveryProof} from '../current-generation/files/src/same-run-delivery-proof.mjs';
const [dir,head]=process.argv.slice(2);if(!dir||!head)throw Error('DIRECTORY_AND_EXACT_SOURCE_HEAD_REQUIRED');
const output=JSON.parse(fs.readFileSync(dir+'/report2-run-result.json'));
if(output.head!==head)throw Error('SOURCE_HEAD_MISMATCH');
let audit;if(fs.existsSync(dir+'/same-run-delivery-proof.json'))audit=verifySameRunDeliveryProof({output,proof:JSON.parse(fs.readFileSync(dir+'/same-run-delivery-proof.json')),expected_head:head});
else audit={schema:'AUTOMATIC_DELIVERY_ARTIFACT_AUDIT_V1',head,run_id:output.run_id,status:'EXACT_DELIVERY_RECEIPT_NOT_AVAILABLE',exact_SENT:0,actual_ENTRY:0,sourceHTTP:0,D1:0,Telegram:0,project_complete:false};
fs.writeFileSync(dir+'/automatic-delivery-audit.json',JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
