import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {parseBlsCalendar,parseFedCalendar,normalizeMacroCalendar,collectMacroCalendarEvidence} from '../files/src/macro-calendar-evidence.mjs';
import {collectCandidateEvidenceV2} from '../files/src/candidate-evidence-v2-runtime.mjs';
import {consumeEvidenceV2} from '../files/src/evidence-v2.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class DB{constructor(){this.sqlite=new DatabaseSync(':memory:');}prepare(sql){return new Statement(this,sql);}async batch(rows){this.sqlite.exec('BEGIN');try{const out=[];for(const row of rows)out.push(await row.run());this.sqlite.exec('COMMIT');return out;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}}}
const BLS=`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:cpi-1\nDTSTART:20261013T123000Z\nSUMMARY:Consumer Price Index\nEND:VEVENT\nBEGIN:VEVENT\nUID:noise\nDTSTART:20261014T123000Z\nSUMMARY:Import prices\nEND:VEVENT\nEND:VCALENDAR`;
const FED=`<html><body><h3>2026 FOMC Meetings</h3><div>September 15-16</div><div>October 27-28</div></body></html>`;

test('K16 macro: only approved BLS releases and FOMC dates become context evidence',()=>{
 const observedTs=Date.UTC(2026,8,1),bls=parseBlsCalendar(BLS,{observed_ts:observedTs}),fed=parseFedCalendar(FED,{observed_ts:observedTs});
 assert.deepEqual(bls.map(row=>row.event_type),['CPI']);assert.equal(bls[0].time_precision,'EXACT');
 assert.equal(fed.length,2);assert.ok(fed.every(row=>row.event_type==='FOMC'&&row.time_precision==='DATE_ONLY'));
 const out=normalizeMacroCalendar({contract:'SOL-USDT',bls_raw:BLS,fed_raw:FED,observed_ts:observedTs});
 assert.equal(out.status,'CLOSED');assert.ok(out.evidence.every(row=>row.block_id==='N13'&&row.directional_strength===null&&row.risk_strength===null));
 assert.ok(out.evidence.length<=16);assert.equal(consumeEvidenceV2(out.evidence,{base_interest:70,decision_ts:observedTs}).adjustment,0);
});

test('K16 macro: shared global cache prevents duplicate requests and rebuilds exact contract identity',async()=>{
 const db=new DB(),calls=[];const fetch_impl=async url=>{calls.push(url);return{ok:true,status:200,text:async()=>url.includes('bls.gov')?BLS:FED};};
 const base={db,fetch_impl,request_admit:()=>({allowed:true,status:'RESERVED'}),run_id:'R',now:Date.UTC(2026,8,1)};
 const first=await collectMacroCalendarEvidence({...base,contract:'SOL-USDT'}),second=await collectMacroCalendarEvidence({...base,contract:'NEAR-USDT',run_id:'R2',now:base.now+1});
 assert.equal(first.network_calls,2);assert.equal(second.network_calls,0);assert.equal(second.cache_status,'HIT');assert.equal(calls.length,2);
 assert.ok(second.evidence.every(row=>row.htx_contract==='NEAR-USDT'));
 assert.notEqual(first.evidence[0].evidence_id,second.evidence[0].evidence_id);
 const usage=db.sqlite.prepare(`SELECT attempts FROM report2_evidence_source_daily WHERE source='MACRO_CALENDAR'`).get();assert.equal(usage.attempts,2);
});

test('K16 macro: transport cannot start without whole-job admission',async()=>{
 const db=new DB();let calls=0;const out=await collectMacroCalendarEvidence({db,fetch_impl:async()=>{calls++;throw new Error('must not fetch');},contract:'SOL-USDT',run_id:'R',now:1000});
 assert.equal(out.status,'WHOLE_JOB_HTTP_ADMISSION_REQUIRED');assert.equal(out.network_calls,0);assert.equal(calls,0);
});

test('K16 combined candidate path stays within five calls on cold cache',async()=>{
 const db=new DB(),calls=[];const observedTs=Date.UTC(2026,8,1),fetch_impl=async url=>{calls.push(url);if(url.includes('bls.gov'))return{ok:true,status:200,text:async()=>BLS};if(url.includes('federalreserve.gov'))return{ok:true,status:200,text:async()=>FED};const body=url.includes('swap_api_state')?{status:'ok',ts:observedTs,data:[{contract_code:'SOL-USDT',open:1}]}:{status:'ok',ts:observedTs,data:[{contract_code:'SOL-USDT',lever_rate:20}]};return{ok:true,status:200,json:async()=>body};};
 const out=await collectCandidateEvidenceV2({db,fetch_impl,pause_impl:async()=>{},request_admit:()=>({allowed:true,status:'RESERVED'}),contract:'SOL-USDT',run_id:'R',now:observedTs});
 assert.equal(out.status,'CLOSED');assert.equal(out.network_calls,5);assert.equal(calls.length,5);assert.ok(out.evidence.some(row=>row.block_id==='N09'));assert.ok(out.evidence.some(row=>row.block_id==='N13'));
});

test('K16 macro: runtime overlay and authoritative runner include combined live collector',()=>{
 const runner=fs.readFileSync(new URL('../files/runner-main.mjs',import.meta.url),'utf8'),overlay=fs.readFileSync(new URL('../apply-runtime-overlay.mjs',import.meta.url),'utf8');
 assert.match(runner,/collectCandidateEvidenceV2/);assert.match(runner,/REPORT2_EVIDENCE_V2_COLLECT=params=>collectCandidateEvidenceV2/);
 assert.match(overlay,/src\/macro-calendar-evidence\.mjs/);assert.match(overlay,/src\/candidate-evidence-v2-runtime\.mjs/);
});
