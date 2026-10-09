import fs from 'node:fs';
import {auditProductionArtifact} from './production-artifact-outcome.mjs';
const [dir,head]=process.argv.slice(2);if(!dir||!head)throw Error('DIRECTORY_AND_EXACT_SOURCE_HEAD_REQUIRED');
const output=JSON.parse(fs.readFileSync(dir+'/report2-run-result.json'));
if(output.head!==head)throw Error('SOURCE_HEAD_MISMATCH');
const proof=fs.existsSync(dir+'/same-run-delivery-proof.json')?JSON.parse(fs.readFileSync(dir+'/same-run-delivery-proof.json')):null;
const audit=auditProductionArtifact({output,proof,expected_head:head});
fs.writeFileSync(dir+'/automatic-delivery-audit.json',JSON.stringify(audit,null,2)+'\n');console.log(JSON.stringify(audit));
