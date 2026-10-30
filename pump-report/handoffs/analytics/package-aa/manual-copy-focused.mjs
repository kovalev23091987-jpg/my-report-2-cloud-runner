import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {analyzePump} from '../../../analytics/index.mjs';
import {INPUT_SCHEMA} from '../../../contracts/index.mjs';
const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const need=(v,code)=>{if(!v)throw Error(code);};
async function main(){
  const bytes=await readFile('/private/tmp/pump-f550-source-control-actual.json');need(hash(bytes)==='0170bba73bc1fd2d56796d2c448258f6192a8c8fb612ab438d4f3d017de60e07','ACTUAL_PRIVATE_ORIGINAL_CHANGED');
  const capture=JSON.parse(bytes),body=capture.body,matched=body.overview.observations.filter(o=>o.instrument.instrument_id===body.instrument.instrument_id);need(matched.length===1,'ACTUAL_TARGET_REQUIRED');
  const facts={...matched[0].facts,...body.history.facts,...body.optional.facts},oldTrace=JSON.parse(await readFile(new URL('sanitized-trace.json',import.meta.url),'utf8'));need(hash(facts)===oldTrace.facts_sha256,'ACTUAL_FACTS_CHANGED');
  const result=analyzePump({schema_version:INPUT_SCHEMA,run_id:body.run_id+':AA_OFFLINE_SAVED_REPLAY',mode:'MANUAL',run_purpose:'ACCEPTANCE_TEST',instrument:body.instrument,previous_wave:null,facts,analysis_ts:capture.received_ts});
  need(result.previous_wave===null&&result.plan===null&&result.ready===false&&result.card_text===null&&result.wave_state==='CANCELLED'&&result.reasons.includes('PLAN_INVALIDATED'),'ACTUAL_NONREADY_FIRST_WAVE_REQUIRED');
  const source=(await readFile(new URL('manual-text.before.mjs.txt',import.meta.url),'utf8')).replace(/from\s*'([^']+)'/g,(all,p)=>p.startsWith('.')?"from '"+pathToFileURL(resolve('pump-report/analytics',p)).href+"'":all);
  const before=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),old=before.explainManualAnalysis(result),current=result.manual_text;
  const previous='Цена нарушила сохранённую границу отмены плана.',correct='Цена прошла ниже границы основания наблюдаемой волны.';
  need(old.includes(previous)&&current.includes(correct)&&!current.includes(previous)&&old.replace(previous,correct)===current,'ONLY_TRUTHFUL_COPY_CHANGE_REQUIRED');
  need(!current.includes('Покупка на откате:')&&!current.includes('Фиксация всей позиции:')&&hash(facts)===oldTrace.facts_sha256,'NO_PLAN_OR_FACT_MUTATION_REQUIRED');
  const report={schema:'ANALYTICS_AA_NEW_FOCUSED_MANUAL_COPY_V1',result:'PASS_ONLY_NEW_ACTUAL_F550_COPY_CASE',source_original_sha256:hash(bytes),facts_sha256:hash(facts),analysis_ts:capture.received_ts,previous_wave_supplied:false,plan_present:false,card_present:false,ready:false,wave_state:result.wave_state,reasons:result.reasons,
    only_manual_reason_wording_changed:true,before_manual_text_sha256:hash(old),after_manual_text_sha256:hash(current),after_analysis_sha256:hash(result),private_prices_or_full_text_exported:false,native_HTTP_SQL_TG:0,old_tests_replayed:false};
  await writeFile(new URL('manual-copy-focused-result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({result:report.result,only_manual_reason_wording_changed:true,plan_present:false,source_facts_unchanged:true,private_output:false})+'\n');
}
main().catch(e=>{const code=/^[A-Z0-9_]{1,100}$/.test(e?.message??'')?e.message:'SANITIZED_FOCUSED_ERROR';process.stdout.write(JSON.stringify({result:'AA_FOCUSED_FAILED_SANITIZED',code})+'\n');process.exitCode=1;});
