import fs from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const p=JSON.parse(fs.readFileSync('checkpoints/bingx-primary-producer-connected-20261024/remaining-input-pins.json')),rows=[];
for(const [path,pin]of Object.entries(p.files)){const b=fs.readFileSync(path);rows.push({path,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),expected:pin});}
fs.writeFileSync('audit-output/bingx-primary-producer-connected/remaining-assembly-inputs.json',JSON.stringify(rows,null,2)+'\n');for(const x of rows){assert.equal(x.bytes,x.expected.bytes,x.path);assert.equal(x.sha256,x.expected.sha256,x.path);}
