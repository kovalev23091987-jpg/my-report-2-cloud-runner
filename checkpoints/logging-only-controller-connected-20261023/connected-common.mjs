import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const root=process.cwd(),prefix='checkpoints/logging-only-controller-connected-20261023',dir='audit-output/current86-logging-connected';
await fs.mkdir(dir,{recursive:true});
const pins=JSON.parse(await fs.readFile(prefix+'/qualification-pins.json','utf8'));
const verify=async()=>{for(const [file,pin] of Object.entries(pins.files)){const b=await fs.readFile(file);assert.equal(b.length,pin.bytes,file);assert.equal(createHash('sha256').update(b).digest('hex'),pin.sha256,file);}};
const receipt={schema:'CURRENT86_LOGGING_FIRST_COMMON_CONTROLLED_V1',node:process.version,components:[],native_CF:0,native_SQL:0,provider:0,MAIN:0,Telegram:0,private_assembly:0,accepted_old_components_replayed:0};
const save=async(name,value)=>fs.writeFile(dir+'/'+name,JSON.stringify(value,null,2)+'\n');
test('new logging-only producer and Paid compatibility connected package',async()=>{
 await verify();receipt.pins_before=true;await save('common-result.json',receipt);
 for(const [name,file,fn] of [['paid',prefix+'/source-qualified/connected.mjs','runCurrent86LoggingPaidCompatibilityConnected'],['controller',prefix+'/third-qualified/logging-only-cases.proposed.mjs','runLoggingOnlyControllerCases'],['entry',prefix+'/root-native-entry.connected.mjs','runRootLoggingEntryConnected']]){
  let result;
  try{const m=await import(pathToFileURL(path.join(root,file)).href);result=await m[fn]({repo_root:root});await save(name+'-result.json',result);receipt.components.push({name,status:'RETURNED_SAVED',groups:result.completed_groups??result.group_count,variants:result.completed_variants??result.case_count});await save('common-result.json',receipt);assert((result.completed_groups??result.group_count)>0);assert((result.completed_variants??result.case_count)>0);}
  catch(error){if(error.partial_result)await save(name+'-partial-result.json',error.partial_result);receipt.failed_component=name;receipt.error={name:error.name,message:error.message,stack:error.stack};await save('common-result.json',receipt);throw error;}
 }
 await verify();receipt.pins_after=true;receipt.status='CONTROLLED_COMMON_COMPLETED_NOT_NATIVE';await save('common-result.json',receipt);
});
