import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {SourceTextModule} from 'node:vm';
import {readSavedIdolDelay} from '../../operator/saved-idol-delay.mjs';
new SourceTextModule(readFileSync(new URL('../../operator/saved-idol-delay-once.mjs',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex'),pin='a'.repeat(64),id='BINGX:USDT_M:101334:IDOL-USDT',wave='PUMP:'+id+':1793329320000',first='3096f8e8-a9a1-45f6-8fe8-2bcc78829f61',next='READY-RUN',db=new Map();
function original(run,ts,ready){const a={run_id:run,analysis_ts:ts,ready,instrument:{instrument_id:id},wave_id:wave,mode:'AUTO',run_purpose:'PRODUCTION',reasons:ready?[]:['INDEPENDENT_PULLBACK_PLAN_NOT_JUSTIFIED']},input={run_id:run,analysis_ts:ts,mode:'AUTO',run_purpose:'PRODUCTION'},key='pump:analysis:'+sha(JSON.stringify(a)),o={analysis:a,input,implementation_sha256:pin,evidence_class:'OBSERVED'};db.set(key,o);return {analysis_key:key,analysis:a};}
const early=original(first,1000,false),ready=original(next,2000,true);db.set('pump:run:'+first,{run_id:first,checked:[early]});db.set('pump:run:'+next,{run_id:next,checked:[ready]});db.set('pump:journal:'+id+':'+wave,{analyses:[{analysis_id:ready.analysis_key,origin:{ready:true,mode:'AUTO',run_purpose:'PRODUCTION',instrument_id:id,wave_id:wave,t0:2000}}],publications:[]});
let gets=0,scans=0;
const result=await readSavedIdolDelay({store:{get:async k=>{gets++;return db.get(k)??null;},scanPrefix:async(p,o)=>{assert.equal(p,'pump:card:');assert.equal(o.limit,20);scans++;return []; }},implementation_sha256:pin,first_run_id:first,instrument_id:id,wave_id:wave});
assert.equal(result.first_check.analysis.ready,false);assert.equal(result.earliest_ready_original.analysis.ready,true);assert.equal(result.earliest_ready_row.origin.t0,2000);assert.equal(gets,5);assert.equal(scans,1);assert.equal(result.scope.total_queries_max,11);assert.equal(result.market_HTTP,0);assert.equal(result.Telegram,0);assert.equal(result.reanalysis,false);
console.log(JSON.stringify({one_affected_case:'EXACT_FIRST_IDOL_REFUSAL_VS_EARLIEST_READY_BINDING',pass:true,business_reads:6,SQL:0,market_HTTP:0,Telegram:0,engine:0}));
