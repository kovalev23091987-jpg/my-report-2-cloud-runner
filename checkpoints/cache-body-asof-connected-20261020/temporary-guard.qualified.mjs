import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {makeGithubControl} from '../runner/github-bounded-phase-lease.mjs';
import {readMirrorContext,assertMirrorOwner} from '../runner/github-four-mirror-cas.mjs';

const prefix='checkpoints/cache-body-asof-connected-20261020';
const scope=JSON.parse(fs.readFileSync(prefix+'/qualification-scope.json','utf8'));
const stage=process.argv[2],sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(!['before','after'].includes(stage)||process.env.GITHUB_REPOSITORY!=='kovalev23091987-jpg/my-report-2-cloud-runner'||process.env.GITHUB_REF!=='refs/heads/work/htx-cache-body-asof-connected-20261021')throw Error('EXACT_NEW_LINKED_SCOPE_REQUIRED');
for(const [file,hash]of Object.entries(scope.files))if(sha(fs.readFileSync(file))!==hash)throw Error('QUALIFIED_SOURCE_HASH_CHANGED:'+file);
if(stage==='after'&&fs.existsSync('runtime/src/worker.js'))for(const[file,hash]of Object.entries(scope.runtime_files))if(sha(fs.readFileSync('runtime/'+file))!==hash)throw Error('ASSEMBLED_RUNTIME_BYTES_DIFFER:'+file);
const control=makeGithubControl({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,maximum_calls:1});
const context=await readMirrorContext(control,{expected_main:scope.expected_main,maximum_blob_reads:0});
const checked=assertMirrorOwner(context,scope.owner,Date.now(),scope.scope_prefix);
if(JSON.stringify(checked.lease)!==JSON.stringify(scope.owned_lease))throw Error('EXACT_OWN_LEASE_REQUIRED');
fs.mkdirSync('audit-output/htx-cache-body-asof',{recursive:true});
fs.writeFileSync(`audit-output/htx-cache-body-asof/guard-${stage}.json`,JSON.stringify({status:'EXACT_NEW_LINKED_SCOPE',stage,main:context.head,owner:scope.owner,control:control.metrics,source_hashes:scope.files,runtime_hashes:scope.runtime_files,native_SQL:0,provider_HTTP:0,MAIN:0,Telegram:0},null,2)+'\n');
