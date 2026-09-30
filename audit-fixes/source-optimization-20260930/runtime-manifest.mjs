import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'runtime'),output=path.resolve(process.argv[3]||'runtime-manifest.json');
const hash=v=>createHash('sha256').update(v).digest('hex');
const files={};
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:mjs|js|json)$/.test(e.name))files[path.relative(root,p)]=hash(fs.readFileSync(p));}}
walk(path.join(root,'src'));
for(const file of ['runner-main.mjs','r8-20-prospective-validation-sidecar.mjs','package.json','package-lock.json','report2-d1-adapter.mjs'])if(fs.existsSync(path.join(root,file)))files[file]=hash(fs.readFileSync(path.join(root,file)));
const result={schema:'report2-source-optimization-runtime-manifest-v1',captured_at:new Date().toISOString(),github_head:process.env.GITHUB_SHA||null,files,tree_sha256:hash(JSON.stringify(Object.entries(files).sort())),worker_sha256:files['src/worker.js'],production_changed:false,telegram_calls:0,secrets_included:false};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'CLOSED_MANIFEST',files:Object.keys(files).length,tree_sha256:result.tree_sha256,worker_sha256:result.worker_sha256}));
