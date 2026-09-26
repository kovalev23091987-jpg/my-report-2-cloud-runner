import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const runtime=path.resolve(process.argv[2]||'runtime');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const proof={version:'telegram-tz-reconciliation-overlay-v2-20260926',runtime,changed:[],compatibility:[],safety:{strategy_changed:false,hard_gates_changed:false,weights_changed:false,thresholds_changed:false,live_probability:false,validated_signal:false,automatic_execution:false,d1_schema_migration:false,telegram_recipients_changed:false,cloudflare_deploy:false}};

function requireAnchors(file,anchors){
  const txt=fs.readFileSync(file,'utf8');
  for(const anchor of anchors){if(!txt.includes(anchor))throw new Error(`RUNTIME_COMPATIBILITY_ANCHOR_MISSING:${path.basename(file)}:${anchor}`);}
  return txt;
}
function installPrepared(rel,{allowedBaseHashes=[],anchors=[],required=true}={}){
  const src=path.join(here,'files',rel),dst=path.join(runtime,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});
  const target=sha(src);
  if(!fs.existsSync(dst)){
    if(required)throw new Error(`REQUIRED_RUNTIME_FILE_MISSING:${rel}`);
    fs.copyFileSync(src,dst);proof.changed.push({path:rel,status:'ADDED',after_sha256:target});return;
  }
  const before=sha(dst);
  if(before===target){proof.changed.push({path:rel,status:'ALREADY_APPLIED',sha256:target});return;}
  requireAnchors(dst,anchors);
  if(allowedBaseHashes.length&&!allowedBaseHashes.includes(before)){
    throw new Error(`UNEXPECTED_RUNTIME_BASE:${rel}:${before}`);
  }
  proof.compatibility.push({path:rel,status:'KNOWN_BASE_HASH',before_sha256:before});
  fs.copyFileSync(src,dst);proof.changed.push({path:rel,status:'REPLACED',before_sha256:before,after_sha256:target});
}
function patchBudget(rel,constName,{rowsRead,rowsWritten}){
  const dst=path.join(runtime,rel);if(!fs.existsSync(dst))throw new Error(`REQUIRED_RUNTIME_FILE_MISSING:${rel}`);
  let txt=requireAnchors(dst,[constName,'Object.freeze({','BUDGET_ENVELOPE_EXCEEDED_FAIL_CLOSED']);
  const before=sha(dst);
  const blockRe=new RegExp(`(export\\s+const\\s+${constName}\\s*=\\s*Object\\.freeze\\(\\{[\\s\\S]*?\\n\\}\\);)`);
  const m=txt.match(blockRe);if(!m)throw new Error(`BUDGET_BLOCK_NOT_FOUND:${rel}:${constName}`);
  let block=m[1];
  const setNum=(name,value)=>{
    const re=new RegExp(`(${name}\\s*:\\s*)\\d+`);
    if(!re.test(block))throw new Error(`BUDGET_FIELD_NOT_FOUND:${rel}:${name}`);
    block=block.replace(re,`$1${value}`);
  };
  setNum('rows_read',rowsRead);setNum('rows_written',rowsWritten);
  txt=txt.replace(m[1],block);fs.writeFileSync(dst,txt);
  const after=sha(dst);proof.changed.push({path:rel,status:before===after?'ALREADY_TUNED':'BUDGET_TUNED',before_sha256:before,after_sha256:after,rows_read:rowsRead,rows_written:rowsWritten});
}

installPrepared('src/v3-telegram-delivery-sidecar.mjs',{
  allowedBaseHashes:['bd88bdd031231fc91e449909554e62ac1948a0d17d5fa9b7b2a08f572f728356','030f6a7884d77a11bda232f904f1da28c4c2d33ce6de59f4558b9fa6c04bad98'],
  anchors:['export async function runV3TelegramDeliverySidecar','export async function sendLifecycleRelay','V3_TELEGRAM_DELIVERY_SIDECAR_BUDGET','v3_telegram_dispatch_shadow','finalizeLifecycleDispatch'],
});
installPrepared('src/v3-adaptive-budget.mjs',{
  allowedBaseHashes:['c622b91a48cb2477c5515f80475038318158e8eda275a6b1b3fcc06c8b6d8c30'],
  anchors:['export function buildR88BurstReservation','export function buildR88DailyAdmissionView','export function enforceR88RunBudget','R88_BURST_RESERVATION'],
});
installPrepared('src/v3-telegram-tz-formatter.mjs',{required:false});

// Reconcile the internal envelopes with measured natural-cycle usage. These
// changes only affect capacity accounting; analytical rules and thresholds stay unchanged.
patchBudget('src/v3-early-sidecar.mjs','V3_EARLY_SIDECAR_BUDGET',{rowsRead:4096,rowsWritten:32});
patchBudget('src/v3-realized-liquidation-sidecar.mjs','V3_REALIZED_LIQUIDATION_SIDECAR_BUDGET',{rowsRead:3200,rowsWritten:64});
patchBudget('src/v3-liquidation-sidecar.mjs','V3_LIQUIDATION_SIDECAR_BUDGET',{rowsRead:5000,rowsWritten:80});

fs.writeFileSync(path.join(runtime,'telegram-tz-reconciliation-overlay-proof.json'),JSON.stringify(proof,null,2));
console.log('TELEGRAM_TZ_RECONCILIATION_OVERLAY_APPLIED',JSON.stringify(proof));
