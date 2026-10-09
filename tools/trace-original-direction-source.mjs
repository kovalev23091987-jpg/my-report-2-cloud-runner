import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.argv[2]||'runtime',out={schema:'ASSEMBLED_DIRECTION_SOURCE_INSPECTION_V1',head:process.env.GITHUB_SHA,cloud_run:Number(process.env.GITHUB_RUN_ID),sourceHTTP:0,D1:0,MAIN:0,Telegram:0,market_direction_recomputed:false,project_complete:false,modules:[]};
for(const name of fs.readdirSync(path.join(root,'src')).filter(x=>/^v3-early.*\.mjs$/.test(x))){
 const bytes=fs.readFileSync(path.join(root,'src',name)),lines=bytes.toString().split('\n'),selected=new Set();
 for(let i=0;i<lines.length;i++)if(/DIRECTION_NOT_CLOSED|LONG_WATCH|SHORT_WATCH|long_evidence_domain_count|short_evidence_domain_count|directionState|direction_state:/.test(lines[i]))for(let j=Math.max(0,i-4);j<=Math.min(lines.length-1,i+4);j++)selected.add(j);
 out.modules.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),directional_formula_lines:[...selected].sort((a,b)=>a-b).slice(0,160).map(i=>({line:i+1,text:lines[i].slice(0,500)}))});
}
fs.writeFileSync(process.argv[3],JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({status:'ASSEMBLED_DIRECTION_RULE_SOURCE_INSPECTED',modules:out.modules.map(x=>({name:x.name,lines:x.directional_formula_lines.length})),sourceHTTP:0,D1:0}));
