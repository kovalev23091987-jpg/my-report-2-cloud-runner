import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const P='checkpoints/anomaly-pending-journal-connected-20261023';
test('new pending-operation local journal connected',async()=>{
 const plan=JSON.parse(await fs.readFile(P+'/qualification-plan.json','utf8'));
 const raw=await fs.readFile(plan.case.path);
 assert.equal(createHash('sha256').update(raw).digest('hex'),plan.case.sha256);
 let result;
 try{const mod=await import(pathToFileURL(process.cwd()+'/'+plan.case.path));result=await mod[plan.case.export]({repo_root:process.cwd()});}
 catch(error){await fs.mkdir('audit-output/anomaly-pending-journal',{recursive:true});await fs.writeFile('audit-output/anomaly-pending-journal/failure-context.json',JSON.stringify({schema:'NEW_GATE_COMPONENT_FAILURE_V1',message:error.message,code:error.code??null,partial:error.partial_result??error.partialResult??null},null,2)+'\n');throw error;}
 await fs.mkdir('audit-output/anomaly-pending-journal',{recursive:true});
 await fs.writeFile('audit-output/anomaly-pending-journal/component-return.json',JSON.stringify(result,null,2)+'\n');
 assert.equal(result?.status,plan.expected_status);
});
