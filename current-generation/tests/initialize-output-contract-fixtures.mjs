import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEffectivePresentationModules,outputContractScenarios,renderScenario} from './output-contract-support.mjs';

if(process.argv[2]!=='--initialize-once')throw new Error('REFUSING_TO_WRITE_GOLDENS_WITHOUT_EXPLICIT_INITIALIZATION_FLAG');
const output=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'fixtures/output-contract');
fs.mkdirSync(output,{recursive:true});
const modules=await loadEffectivePresentationModules();
try{
  for(const scenario of outputContractScenarios()){
    const target=path.join(output,`${scenario.id}.json`);
    if(fs.existsSync(target))throw new Error(`GOLDEN_ALREADY_EXISTS:${target}`);
    fs.writeFileSync(target,`${JSON.stringify(await renderScenario(modules,scenario),null,2)}\n`,'utf8');
  }
}finally{modules.cleanup();}
