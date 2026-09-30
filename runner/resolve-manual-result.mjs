import fs from 'node:fs';
import {verifyBoundManualReport} from '../current-generation/files/src/manual-result-binding.mjs';
const [expectedPath,commandPath,runPath,reportPath]=process.argv.slice(2);
if(!expectedPath||!commandPath||!runPath||!reportPath)throw Error('EXPLICIT_REQUEST_COMMAND_RUN_REPORT_REQUIRED');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const result=verifyBoundManualReport({...read(expectedPath),command:read(commandPath),run:read(runPath),report:read(reportPath)});
console.log(JSON.stringify(result,null,2));
if(!result.ok)process.exitCode=2;
