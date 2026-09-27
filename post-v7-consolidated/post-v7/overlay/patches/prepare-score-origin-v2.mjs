import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
export const FORMATTER_BASE_SHA256='66b725a3a23a00c643fb5757ac7d4ff2aa1362db7410c5500c68a1815dbc66d6';
export const FORMATTER_TARGET='src/v3-telegram-tz-formatter.mjs';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const OLD_START='function scoreLines({final,shadow,early,feature,opportunity,status}={}){';
const NEXT='\nfunction marketFacts(';
const OLD_CALL='...scoreLines({final,shadow,early,feature,opportunity:opp,status})';
const NEW_FN=`function scoreLines({scores,status}={}){\n  const overall=fmtScore(scores?.overall_0_100);\n  const interest=fmtScore(scores?.coin_interest_0_100);\n  let readiness='не подтверждена';\n  if(upper(status)==='ENTRY')readiness='подтверждена обязательными проверками';\n  else if(upper(status)==='WAIT')readiness='условие входа сформировано, но ещё не выполнено';\n  return [\`Общая оценка: \${overall}\`,\`Монета интересна: \${interest}\`,\`Готовность ко входу: \${readiness}\`];\n}\n`;
export function transformFormatter(input,{enforceHash=true}={}){
 if(typeof input!=='string')throw new TypeError('FORMATTER_SOURCE_REQUIRED');if(enforceHash&&sha(input)!==FORMATTER_BASE_SHA256)throw new Error('EXACT_V7_FORMATTER_BASE_REQUIRED');
 const a=input.indexOf(OLD_START),b=input.indexOf(NEXT,a);if(a<0||b<a)throw new Error('SCORE_FUNCTION_ANCHOR_REQUIRED');
 if(input.split(OLD_CALL).length!==2)throw new Error('UNIQUE_SCORE_CALL_REQUIRED');
 let out=`import {readCanonicalPublicationScores} from './score-origin-reader.mjs';\n`+input.slice(0,a)+NEW_FN+input.slice(b);
 out=out.replace(OLD_CALL,"...scoreLines({status,scores:readCanonicalPublicationScores(input.canonical,{...(input.canonical_binding??{}),direction:dir}).scores})");
 return out;
}
export function apply(root){const p=path.join(path.resolve(root),FORMATTER_TARGET);const src=fs.readFileSync(p,'utf8');const out=transformFormatter(src,{enforceHash:true});const tmp=p+'.score-origin-v2.tmp';fs.writeFileSync(tmp,out,{flag:'wx',mode:fs.statSync(p).mode});fs.renameSync(tmp,p);return{status:'APPLIED',before_sha256:FORMATTER_BASE_SHA256,after_sha256:sha(out),score_formula_changed:false,external_layout_changed:false};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(apply(process.argv[2]||'runtime'),null,2));
