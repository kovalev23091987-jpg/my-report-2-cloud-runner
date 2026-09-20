import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
export async function applyTelegramRuntimeOverlay(runtime,manifestPath) {
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  if(manifest.schema!=='telegram-runtime-overlay-v1')throw new Error('OVERLAY_SCHEMA_MISMATCH');
  if(hash(await fs.readFile(path.join(runtime,'src/worker.js')))!==manifest.worker_sha256)throw new Error('WORKER_BASE_CHANGED');
  const planned=[];
  for(const file of manifest.files) {
    if(!['src/v3-early-sidecar.mjs','src/v3-telegram-lifecycle-sidecar.mjs'].includes(file.path))throw new Error('OVERLAY_PATH_NOT_ALLOWED');
    const target=path.join(runtime,file.path),before=await fs.readFile(target,'utf8');
    if(hash(before)===file.after_sha256)continue;
    if(hash(before)!==file.before_sha256)throw new Error('RUNTIME_BASE_CHANGED:'+file.path);
    const lines=before.match(/[^\n]*\n|[^\n]+$/g)||[];
    for(const edit of file.edits.slice().sort((a,b)=>b.start-a.start)) {
      if(lines.slice(edit.start,edit.end).join('')!==edit.old)throw new Error('OVERLAY_CONTEXT_MISMATCH:'+file.path);
      lines.splice(edit.start,edit.end-edit.start,edit.new);
    }
    const after=lines.join('');if(hash(after)!==file.after_sha256)throw new Error('OVERLAY_RESULT_MISMATCH:'+file.path);
    planned.push({target,after});
  }
  for(const f of planned)await fs.writeFile(f.target,f.after);
  console.log('TELEGRAM_RUNTIME_OVERLAY_VERIFIED');
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  await applyTelegramRuntimeOverlay(process.argv[2]||'runtime',process.argv[3]||'runner/telegram-runtime-overlay.json');
}
