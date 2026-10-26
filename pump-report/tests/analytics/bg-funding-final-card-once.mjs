// BG one connected ARTIFICIAL saved BF funding -> actual final renderer case.
// PREPARED ONLY. ROOT must supply precise positive admission and fresh own lease.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir=path.join(root,'pump-report/handoffs/analytics/package-bg');
const read=rel=>fs.readFileSync(path.join(root,rel));
const json=rel=>JSON.parse(read(rel).toString('utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const save=(name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
const report={schema:'BG_ONE_CONNECTED_RENDERER_CASE_ACTUAL_V1',status:'STARTED',evidence_class:'ARTIFICIAL',
  Node_invocations:1,new_cases:1,explainOptionalFacts_calls:0,actual_final_renderer_calls:0,
  analyzePump_calls:0,source_calls:0,fake_broker_requests:0,real_HTTP:0,MCP:0,native_SQL:0,Telegram:0,deploy:0,BF_rerun:false};
let locked=false;
try{
  const cfg=json('pump-report/handoffs/analytics/package-bg/EXECUTION_ADMISSION.json');
  assert.equal(cfg.status,'ROOT_ADMITTED_EXACT_ONE_BG_CASE');
  assert.ok(Date.now()<cfg.expires_ts);assert.ok(Date.now()<cfg.own_expires_ts);assert.ok(Date.now()<cfg.root_expires_ts);
  assert.equal(cfg.own_actual_ref_match,true);assert.equal(cfg.own_exact_bytes_match,true);assert.equal(cfg.all4_equal,true);
  assert.equal(cfg.fence_active,false);assert.equal(cfg.window_owner_paused,false);
  assert.equal(cfg.Node_invocations,1);assert.equal(cfg.new_cases,1);assert.equal(cfg.actual_final_renderer_calls,2);
  assert.equal(sha(fs.readFileSync(fileURLToPath(import.meta.url))),cfg.test_sha256);
  const lock=fs.openSync(path.join(dir,'EXECUTION_ONCE.lock'),'wx');locked=true;
  fs.writeFileSync(lock,'BG one admitted invocation entered; do not rerun\n');fs.closeSync(lock);
  const frozen=json('pump-report/handoffs/analytics/package-bg/frozen-inputs.json');
  assert.equal(sha(read('pump-report/handoffs/analytics/package-bg/frozen-inputs.json')),cfg.frozen_inputs_sha256);
  for(const f of frozen.files){assert.equal(sha(read(f.path)),f.sha256,'FROZEN_INPUT_CHANGED:'+f.path);assert.equal(read(f.path).length,f.bytes);}
  const load=rel=>import(pathToFileURL(path.join(root,rel)).href);
  const [{explainOptionalFacts},{selectUserNarrative},{renderPumpCard},{START_PROFILE}]=await Promise.all([
    load('pump-report/analytics/context.mjs'),load('pump-report/analytics/presentation.mjs'),
    load('pump-report/analytics/index.mjs'),load('pump-report/profile/start-v1.mjs')]);
  const original=json('pump-report/handoffs/analytics/package-bf/source-result.json');
  assert.equal(original.evidence_class,'ARTIFICIAL');
  const T=original.synthetic_analysis_ts,facts=structuredClone(original.result.facts);
  report.explainOptionalFacts_calls++;
  const context=explainOptionalFacts(facts,T,START_PROFILE);
  const plan={entry_zones:[{lower:1.8,upper:1.9,basis_level:{kind:'HIGH',price:1.9},confirmation_status:'PRELIMINARY'}],
    exit_zone:{lower:2.2,upper:2.3},invalidation:{price:1.7}};
  // Formatting shell only: no synthetic readiness/plan is claimed as native proof.
  const result={mode:'MANUAL',run_purpose:'ACCEPTANCE_TEST',analysis_ts:T,
    instrument:{instrument_id:original.instrument_id,native_symbol:'DOOD-USDT'},reference_price:2,
    ready:true,status:'READY',wave_state:'CALM_PULLBACK',growth_proof:{status:'UNCONFIRMED'},
    findings:[{code:'CALM_PULLBACK',text:'Цена ниже вершины; текущий сценарий — спокойный откат.',fact_ids:['ARTIFICIAL_BG_PRICE']},
      {code:'ACTIVITY_RELATION',text:'Активность текущего окна ниже исходного импульса.',fact_ids:['ARTIFICIAL_BG_CANDLES']},
      ...context.findings],fact_ids:[...context.fact_ids],optional_context:context.optional_context,plan,
    liquidations:{map_mode:'WITHOUT_MAP',status:'ABSENT',zones_up:[],zones_down:[]}};
  result.user_narrative=selectUserNarrative(result);
  assert.equal(result.user_narrative.reasons.length,2);
  assert.deepEqual(result.user_narrative.reasons.map(x=>x.code),['CALM_PULLBACK','ACTIVITY_RELATION']);
  assert.ok(!result.user_narrative.reasons.some(x=>x.code==='FUNDING_SNAPSHOT'));
  const line='Фандинг BingX: −1% за 2 ч.';
  report.actual_final_renderer_calls++;
  const full=renderPumpCard(result,START_PROFILE);
  fs.writeFileSync(path.join(dir,'card-with-funding.txt'),full+'\n');
  assert.ok(full.split('\n').includes(line));assert.equal(full.split(line).length-1,1);
  assert.ok(!full.includes('это контекст, а не направление'));
  for(const reason of result.user_narrative.reasons)assert.ok(full.includes(reason.text));
  const mandatory=full.split('\n').filter(x=>x!==line);
  const without=mandatory.join('\n');
  const boundary=structuredClone(result),padding=4096-without.length-1;
  assert.ok(padding>0);boundary.user_narrative.limitation='Л'.repeat(padding);
  report.actual_final_renderer_calls++;
  const limited=renderPumpCard(boundary,START_PROFILE);
  fs.writeFileSync(path.join(dir,'card-at-limit.txt'),limited+'\n');
  const mapLine=mandatory.find(x=>x.startsWith('Карта ликвидаций недоступна.'));
  assert.ok(mapLine);
  const expected=without.replace(mapLine,boundary.user_narrative.limitation+'\n'+mapLine);
  assert.equal(limited.length,4096);assert.equal(limited,expected);
  assert.ok(!limited.includes(line));for(const part of mandatory)assert.ok(limited.includes(part));
  assert.deepEqual(result.plan,plan);assert.equal(result.ready,true);
  assert.equal(facts.funding.value.funding_payment_event_ts,null);
  assert.equal(context.optional_context.funding.status,'USABLE');
  assert.equal(context.optional_context.funding.instrument_id,result.instrument.instrument_id);
  assert.equal(context.optional_context.funding.expires_ts,facts.funding.expires_ts);
  assert.equal(report.actual_final_renderer_calls,2);assert.equal(report.explainOptionalFacts_calls,1);
  report.result={funding_line:line,main_reason_codes:result.user_narrative.reasons.map(x=>x.code),
    full_length:full.length,boundary_length:limited.length,boundary_funding_omitted:true,
    mandatory_fields_byte_preserved:true,plan_unchanged:true,payment_event_ts:null,
    formatting_variants:'One shared BF fixture: normal full card plus exact4096boundary. Second call exercises full+compact attempts and omission of optional funding only.',
    no_technical_funding_disclaimer_in_card:true,missing_context_suppression:'STATIC_GUARD_ONLY_NO_EXTRA_NEGATIVE_CASE'};
  report.status='PASS';save('affected-result.json',report);
  process.stdout.write(JSON.stringify({status:'PASS',new_cases:1,existing_consumer:1,actual_renderer:2,
    funding_line:line,limit:4096,mandatory_preserved:true,native:0})+'\n');
}catch(error){
  if(locked)save('affected-failure.json',{...report,status:'FAIL_NO_RERUN_AUTHORIZED',
    error:{name:error.name,message:error.message,stack:String(error.stack).split('\n').slice(0,10).join('\n')}});
  process.stderr.write(String(error.stack)+'\n');process.exitCode=1;
}
