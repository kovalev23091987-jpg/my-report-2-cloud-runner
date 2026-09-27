import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {applyIntegration} from './apply-canonical-integration.mjs';
const root=path.dirname(fileURLToPath(new URL('../package.json',import.meta.url))),scratch=path.join(root,'.verification'),dest=path.join(scratch,'staged-runtime');
fs.mkdirSync(scratch,{recursive:true});if(fs.existsSync(dest))fs.rmSync(dest,{recursive:true});
fs.cpSync(new URL('./fixtures/base-runtime/',import.meta.url),dest,{recursive:true});const proof=applyIntegration(dest);
console.log(JSON.stringify({status:'PREPARED_PUBLIC_MODULE_TEST_RUNTIME',worker_full_runtime_import:false,production_changed:false,changed:proof.changed.length,extension_files:proof.extension_files.length}));
