import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const repo=process.cwd(),runtime=process.env.REPORT2_LINKED_RUNTIME,output=process.env.REPORT2_LINKED_OUTPUT;
const sha=b=>createHash('sha256').update(b).digest('hex'),write=(n,d)=>fs.writeFileSync(path.join(output,n),JSON.stringify(d,null,2)+'\n');
test('ONE FIRST realized empty budget guard with bounded new normalizer lexical delta',async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'report2-realized-empty-baseline-')),baseline=path.join(temporary,'baseline');let returned=false;
 try{
  fs.mkdirSync(output,{recursive:true});fs.cpSync(runtime,baseline,{recursive:true});
  const relative='src/v3-realized-liquidation-sidecar.mjs',file=path.join(baseline,relative),addition=fs.readFileSync('checkpoints/source-worker-realized-empty-budget-guard-20261021/empty-budget-addition.js.txt','utf8'),candidate=fs.readFileSync(file,'utf8'),token='\n'+addition.trimEnd()+'\n',at=candidate.indexOf(token);
  assert.ok(at>=0&&candidate.indexOf(token,at+token.length)<0,'EXACT_ADDITION_NOT_UNIQUE');
  const rest=candidate.slice(at+token.length),end=rest.indexOf('\n'),suffix=end<0?rest:rest.slice(0,end),expression=addition.match(/const emptyUsage = ([^;]+);/)?.[1]?.replace(/\s/g,'');
  assert.ok(expression&&suffix.split('emptyUsage').length===2,'REVERSE_GRAMMAR_NOT_BOUND');
  const before=candidate.slice(0,at)+suffix.replace('emptyUsage',expression)+(end<0?'':rest.slice(end));
  assert.equal(Buffer.byteLength(before),6995);assert.equal(sha(before),'a56b7b9f2908648c19bfc4ff30f1d2f22bc202365eef1a1a7c858a20360e648a');fs.writeFileSync(file,before);
  // Only new unexported lexical fragments of the separately owner-approved same file.
  const lines=before.split('\n'),wanted=[9,10,11,12,13,15,16,...Array.from({length:30},(_,i)=>20+i)];
  const delta={schema:'SAME_APPROVED_REALIZED_FILE_NEW_NORMALIZER_DELTA_V1',source_sha256:sha(before),source_bytes:6995,previous_read4_reexecuted:false,new_file_permission:false,fragments:wanted.map(n=>({source_line:n,sha256:sha(lines[n-1]),text:lines[n-1]}))};
  const privateBytes=Buffer.from(JSON.stringify(delta,null,2)+'\n');assert.ok(privateBytes.length<=8192&&10618+485+privateBytes.length<=65536,'NEW_DELTA_BOUND_EXCEEDED');
  fs.mkdirSync('audit-output/realized-normalizer-delta',{recursive:true});fs.writeFileSync('audit-output/realized-normalizer-delta/new-normalizer-fragments.json',privateBytes);
  write('new-fragments-sanitized-receipt.json',{source_sha256:sha(before),new_bytes:privateBytes.length,new_sha256:sha(privateBytes),source_lines:wanted,prior_read4_replayed:false,raw_private_output_public_Git:false});
  const module=await import(pathToFileURL(path.join(repo,'checkpoints/source-worker-realized-empty-budget-guard-20261021/connected.mjs')).href),result=await module.runRealizedEmptyBudgetGuardConnected({runtime_root:path.join(runtime,'src'),baseline_runtime_root:path.join(baseline,'src'),repo_root:repo});
  write('empty-budget-result.json',result);returned=true;
  assert.equal(result.control_count,10);assert.equal(result.old_components_replayed,0);assert.equal(result.fixture_cleanup_removed,true);
  write('result.json',{status:'PASS',new_common_cases:1,CONTROLLED_groups:10,Node_version:process.version,private_new_delta_completed:true,old_accepted_components_replayed:0,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0,native_saving_or_SENDING_qualified:false});
 }catch(error){write('failure-context.json',{returned_component_artifact:returned?'empty-budget-result.json':null,error:String(error),stack:error.stack,completed_new_CONTROLLED_groups:error.completed_new_CONTROLLED_groups??null,completed_new_CONTROLLED_controls:error.completed_new_CONTROLLED_controls??null});throw error;}
 finally{fs.rmSync(temporary,{recursive:true,force:true});write('baseline-cleanup.json',{removed:!fs.existsSync(temporary),outside_artifact:true});}
});
