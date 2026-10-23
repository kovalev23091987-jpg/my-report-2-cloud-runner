import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {pathToFileURL}from'node:url';import {createHash}from'node:crypto';
const P='checkpoints/independent-capture-and-origin-connected-20261023',out='audit-output/independent-capture-and-origin',sha=b=>createHash('sha256').update(b).digest('hex');
test('ONLY failed late grouped-DRAFT component; completed9groups41 not replayed',async()=>{
 const plan=JSON.parse(await fs.readFile(P+'/qualification-plan.json'));await fs.mkdir(out,{recursive:true});
 for(const [rel,pin]of Object.entries(plan.prior_completed_raw_frames)){const b=await fs.readFile(rel);assert.equal(sha(b),pin.sha256);assert.equal(b.length,pin.bytes);}
 const component=plan.components[0];assert.equal(plan.components.length,1);let result;
 try{const mod=await import(pathToFileURL(process.cwd()+'/'+component.path));result=await mod[component.export]({repo_root:process.cwd()});}catch(error){await fs.writeFile(out+'/late-failure-context.json',JSON.stringify({message:error.message,partial:error.partial_result??null},null,2)+'\n');throw error;}
 await fs.writeFile(out+'/grouped-watch-draft-return.json',JSON.stringify(result,null,2)+'\n');assert.equal(result.group_count,1);assert.equal(result.variant_count,18);
 await fs.writeFile(out+'/late-summary.json',JSON.stringify({schema:'ONLY_LATE_GROUPED_DRAFT_ACTUAL_RESULT_V1',actual_new_groups:1,actual_new_variants:18,prior_completed_groups_not_reexecuted:9,prior_completed_variants_not_reexecuted:41,runtime_changed:false,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0},null,2)+'\n');
});
