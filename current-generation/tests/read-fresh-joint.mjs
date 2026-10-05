import fs from 'node:fs';
import path from 'node:path';
import {consumeExecutionReportContext} from '../files/src/execution-report-context.mjs';
const root=process.argv[2];
function find(dir,name){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){const x=find(p,name);if(x)return x;}else if(e.name===name)return p;}}
const file=find(root,'report2-run-result.json'),run=JSON.parse(fs.readFileSync(file,'utf8')),tgFile=find(root,'telegram-info-proof.json'),telegram=tgFile?JSON.parse(fs.readFileSync(tgFile,'utf8')):null;
function inspect(v,p='',out=[]){if(!v||typeof v!=='object')return out;for(const [k,x] of Object.entries(v)){const at=p+'.'+k;if(k==='data_quality'||k==='conflicts'||k==='chain_status')out.push({path:at,value:x});else if(k==='evidence'&&Array.isArray(x))out.push({path:at,value:x.filter(r=>['FUTURE','SOURCE_INCOMPATIBLE','CONFLICT'].includes(r.status))});else inspect(x,at,out);}return out;}
function all(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?all(p):[p];});}
const files=all(root);const results=[];
for(const file of files.filter(p=>p.endsWith('.json'))){let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
function walk(v,p='',out=[]){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){const at=p+'.'+k;if(k==='data_quality'&&x&&('incompatible_items'in x||'future_items'in x))out.push({path:at,value:x});else if(k==='evidence_compact')out.push({path:at,value:x.filter(r=>r.status!=='CLOSED')});else if(k==='conflicts')out.push({path:at,value:x});else if(k==='chain_status')out.push({path:at,value:x});else walk(x,at,out);}return out;}
const out=[];walk(value,'',out);if(out.length)results.push({file,results:out});}
console.log(JSON.stringify({files,results},null,2));
