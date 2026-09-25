import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const runtime=path.resolve(process.argv[2]||'runtime'),src=path.join(runtime,'src');
const manual=path.join(src,'manual-report-formatter.mjs'),telegram=path.join(src,'telegram-compact-formatter.mjs'),canonical=path.join(src,'canonical-runtime-adapter.mjs'),surface=path.join(src,'output-surface-contract.mjs'),surfaceSource=path.join(here,'src/output-surface-contract.mjs');
const BEFORE_MANUAL='07065ac3fc3972d067ca1af25f624af4041a15d5bdefc4901d6fd40fbb843a56';
const BEFORE_TELEGRAM='0979b92f6fb684419d9408a8b3ffa98b24d4b863fb625797a5b6c6162687026f';
const BEFORE_CANONICAL='5e6b30008c99bc03143428b5f14bf1fc0f692b3afc57284d7adaf2e94ebb8762';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const p of [manual,telegram,canonical,surfaceSource])if(!fs.existsSync(p))throw new Error(`OUTPUT_SURFACE_REQUIRED_FILE_MISSING:${p}`);

const MAN_V_OLD="export const MANUAL_REPORT_FORMATTER_VERSION='manual-report-formatter-v4-existing-source-consumer-20260925';";
const MAN_V_NEW="export const MANUAL_REPORT_FORMATTER_VERSION='manual-report-formatter-v5-surface-contract-20260925';";
const MAN_SRC_OLD=" const sources=activeSources(result);lines.push('','ИСТОЧНИКИ И ЖЁСТКИЕ ПРОВЕРКИ',`Свежие подтверждённые источники: ${sources.length?sources.join(', '):'нет подтверждённых источников для этого снимка'}.`,`Жёсткие проверки: ${result.hard_gates?.length??0}.`);";
const MAN_SRC_NEW=" const sources=activeSources(result);lines.push('','ИСТОЧНИКИ И ЖЁСТКИЕ ПРОВЕРКИ',`Свежие подтверждённые источники: ${sources.length?sources.join(', '):'нет подтверждённых источников для этого снимка'}.`,`Жёсткие проверки: ${result.hard_gates?.length??0}.`);if(blockers.some(x=>x.code==='SOURCE_TOOL_UNAVAILABLE'))lines.push('ИСТОЧНИК НЕДОСТУПЕН В ЭТОМ ЗАПУСКЕ');";
const MAN_RETURN_OLD=" const out=lines.filter(Boolean).join('\\n');return{ok:true,status:unknown?'SAFE_FAIL_CLOSED_UNKNOWN_REASON':'READY',text:out,formatter:MANUAL_REPORT_FORMATTER_VERSION,analytical_fingerprint:result.analytical_fingerprint};";
const MAN_RETURN_NEW=" const out=lines.filter(Boolean).join('\\n');const forbidden=/\\b(?:LONG|SHORT|OI|Funding|Spot flow|Spread|Slippage|Data Quality|Source receipts|hard gates)\\b|\\b[A-Z]{2,}_[A-Z0-9_]{2,}\\b/i;if(forbidden.test(out))return{ok:false,status:'FORBIDDEN_USER_TERMINOLOGY',text:null};return{ok:true,status:unknown?'SAFE_FAIL_CLOSED_UNKNOWN_REASON':'READY',text:out,formatter:MANUAL_REPORT_FORMATTER_VERSION,analytical_fingerprint:result.analytical_fingerprint};";

const TG_V_OLD="export const TELEGRAM_COMPACT_FORMATTER_VERSION='telegram-compact-formatter-v4-existing-source-consumer-20260925';";
const TG_V_NEW="export const TELEGRAM_COMPACT_FORMATTER_VERSION='telegram-compact-formatter-v5-surface-contract-20260925';";
const TG_EVID_OLD=" const evidence=(Array.isArray(facts)&&facts.length?facts:result.reasons).map(factLine).filter(Boolean).slice(0,5);lines.push(...evidence);";
const TG_EVID_NEW=" const evidence=(Array.isArray(facts)&&facts.length?facts:result.reasons).map(factLine).filter(Boolean).slice(0,5);lines.push(...evidence);const early=Array.isArray(result?.early_candidate?.items)?result.early_candidate.items:[];if(early.length){const e=early[0],name=text(e?.contract||e?.ticker).replace(/-USDT$/i,''),priority=finite(e?.operational_priority_0_100??e?.early_candidate_operational_priority_0_100),why=safeUserReason(e?.reason||e?.bridge_reason,{short:true})||'подтверждены ранние признаки';lines.push(`Ранний кандидат: ${name||ticker||'монета'}${priority!==null?` — приоритет ${Math.round(priority)}/100`:''}; ${why}.`);}";

const CAN_V_OLD="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v6-preselection-router-20260925';";
const CAN_V_NEW="export const CANONICAL_RUNTIME_ADAPTER_VERSION='canonical-runtime-adapter-v7-output-surface-20260925';";
const CAN_IMPORT_OLD="import { normalizeInheritedFactEnvelope } from './inherited-fact-contract.mjs';";
const CAN_IMPORT_NEW=CAN_IMPORT_OLD+"\\nimport { buildOutputSurfaceContract } from './output-surface-contract.mjs';";
const CAN_RETURN_OLD=` const telegram=formatTelegramCompact(canonical,{facts:canonical?.reasons||[]});
 const manual=formatManualReport(canonical);
 return {version:CANONICAL_RUNTIME_ADAPTER_VERSION,status:canonical?.status==='CLOSED'?'CLOSED':'NOT_CLOSED',canonical,telegram,manual,parity_fingerprint:canonical?.analytical_fingerprint??null};`;
const CAN_RETURN_NEW=` const telegram=formatTelegramCompact(canonical,{facts:canonical?.reasons||[]});
 const manual=formatManualReport(canonical);
 const surface_contract=buildOutputSurfaceContract({canonical,telegram,manual});
 return {version:CANONICAL_RUNTIME_ADAPTER_VERSION,status:canonical?.status==='CLOSED'&&surface_contract.status==='CLOSED'?'CLOSED':'NOT_CLOSED',canonical,telegram,manual,surface_contract,parity_fingerprint:canonical?.analytical_fingerprint??null};`;

const already=fs.existsSync(surface)&&fs.readFileSync(manual,'utf8').includes('manual-report-formatter-v5-surface-contract')&&fs.readFileSync(telegram,'utf8').includes('telegram-compact-formatter-v5-surface-contract')&&fs.readFileSync(canonical,'utf8').includes('canonical-runtime-adapter-v7-output-surface');
if(already){
 const proof={version:'output-surface-contract-overlay-v1-20260925',status:'ALREADY_APPLIED',base_candidate_sha:'7bd9fd6113e30fcbcaabea05ed7148167729d630',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',manual_after_sha256:sha(manual),telegram_after_sha256:sha(telegram),canonical_after_sha256:sha(canonical),surface_sha256:sha(surface),production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0};
 fs.writeFileSync(path.join(runtime,'output-surface-contract-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('OUTPUT_SURFACE_OVERLAY_APPLIED',JSON.stringify(proof));process.exit(0);
}
const actual={manual:sha(manual),telegram:sha(telegram),canonical:sha(canonical)};
if(actual.manual!==BEFORE_MANUAL||actual.telegram!==BEFORE_TELEGRAM||actual.canonical!==BEFORE_CANONICAL)throw new Error(`OUTPUT_SURFACE_TARGET_HASH_MISMATCH:${JSON.stringify(actual)}`);
let m=fs.readFileSync(manual,'utf8'),t=fs.readFileSync(telegram,'utf8'),c=fs.readFileSync(canonical,'utf8');
for(const [label,s,anchor] of [['manual version',m,MAN_V_OLD],['manual sources',m,MAN_SRC_OLD],['manual return',m,MAN_RETURN_OLD],['telegram version',t,TG_V_OLD],['telegram evidence',t,TG_EVID_OLD],['canonical version',c,CAN_V_OLD],['canonical import',c,CAN_IMPORT_OLD],['canonical return',c,CAN_RETURN_OLD]])if(!s.includes(anchor))throw new Error(`OUTPUT_SURFACE_PATCH_ANCHOR_MISSING:${label}`);
m=m.replace(MAN_V_OLD,MAN_V_NEW).replace(MAN_SRC_OLD,MAN_SRC_NEW).replace(MAN_RETURN_OLD,MAN_RETURN_NEW);
t=t.replace(TG_V_OLD,TG_V_NEW).replace(TG_EVID_OLD,TG_EVID_NEW);
c=c.replace(CAN_V_OLD,CAN_V_NEW).replace(CAN_IMPORT_OLD,CAN_IMPORT_NEW).replace(CAN_RETURN_OLD,CAN_RETURN_NEW);
const backups=[[manual,`${manual}.surface.bak`],[telegram,`${telegram}.surface.bak`],[canonical,`${canonical}.surface.bak`]];
for(const [p,b] of backups)fs.copyFileSync(p,b);
try{
 fs.writeFileSync(manual,m);fs.writeFileSync(telegram,t);fs.writeFileSync(canonical,c);fs.copyFileSync(surfaceSource,surface);
 const proof={version:'output-surface-contract-overlay-v1-20260925',status:'APPLIED',base_candidate_sha:'7bd9fd6113e30fcbcaabea05ed7148167729d630',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',manual_before_sha256:BEFORE_MANUAL,manual_after_sha256:sha(manual),telegram_before_sha256:BEFORE_TELEGRAM,telegram_after_sha256:sha(telegram),canonical_before_sha256:BEFORE_CANONICAL,canonical_after_sha256:sha(canonical),surface_sha256:sha(surface),production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,worker_copy_added:false,hot_cycle_external_request_delta:0};
 for(const [,b] of backups)fs.rmSync(b,{force:true});
 fs.writeFileSync(path.join(runtime,'output-surface-contract-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('OUTPUT_SURFACE_OVERLAY_APPLIED',JSON.stringify(proof));
}catch(err){
 for(const [p,b] of backups){fs.rmSync(p,{force:true});if(fs.existsSync(b))fs.renameSync(b,p);}
 fs.rmSync(surface,{force:true});throw err;
}
