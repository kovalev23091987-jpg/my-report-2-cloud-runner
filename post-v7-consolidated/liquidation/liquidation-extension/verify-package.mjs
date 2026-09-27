import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const m=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'),'utf8'));let n=0;
for(const f of m.files){const target=path.resolve(root,f.path);if(!target.startsWith(root+path.sep)||f.path.startsWith('/')||f.path.split('/').includes('..'))throw Error('MANIFEST_PATH_INVALID');
 const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('EXPECTED_ORDINARY_FILE:'+f.path);
 const bytes=fs.readFileSync(target);if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('INTEGRITY_MISMATCH:'+f.path);n++;}
console.log(JSON.stringify({status:'PACKAGE_INTEGRITY_PASS',files_verified:n,production_ready:false,base_main:m.base_main}));
