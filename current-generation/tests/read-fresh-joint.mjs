import fs from 'node:fs';
import path from 'node:path';
import {consumeExecutionReportContext} from '../files/src/execution-report-context.mjs';
const root=process.argv[2];
function find(dir,name){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const x=find(p,name);if(x)return x;}else if(e.name===name)return p;}}
const file=find(root,'report2-run-result.json'),run=JSON.parse(fs.readFileSync(file,'utf8')),tgFile=find(root,'telegram-info-proof.json'),telegram=tgFile?JSON.parse(fs.readFileSync(tgFile,'utf8')):null;
function inspect(v,p='',out=[]){if(!v||typeof v!=='object')return out;for(const [k,x] of Object.entries(v)){const at=p+'.'+k;if(k==='data_quality'||k==='conflicts'||k==='chain_status')out.push({path:at,value:x});else if(k==='evidence'&&Array.isArray(x))out.push({path:at,value:x.filter(r=>['FUTURE','SOURCE_INCOMPATIBLE','CONFLICT'].includes(r.status))});else inspect(x,at,out);}return out;}
process.stdout.write(JSON.stringify({candidates:run.candidates.map(c=>({contract:c.contract,keys:Object.keys(c),quality_paths:inspect(c)}))},null,2)+'\n');
