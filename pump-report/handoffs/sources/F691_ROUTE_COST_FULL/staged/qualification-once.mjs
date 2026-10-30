import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const admission=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(admission.allowed,true);assert(Date.now()<admission.expires_ts);
for(const [p,h]of Object.entries(admission.frozen_files))assert.equal(sha(fs.readFileSync(p)),h,p);
const fd=fs.openSync(admission.attempt_file,'wx',0o600),save=r=>{fs.ftruncateSync(fd,0);fs.writeSync(fd,JSON.stringify(r)+'\n',0,'utf8');fs.fsyncSync(fd);};
let result={schema:'F691_CONNECTED_CASE_RESULT_V1',state:'ATTEMPTED',Node:1,actual_HTTP:0,native_SQL:0,CF:0,TG:0,cases:[]};save(result);globalThis.fetch=async()=>{throw Error('REAL_HTTP_FORBIDDEN');};
try{
const {createPumpSources}=await import('./pump-report/sources/index.mjs');
const {createUnifiedBudget}=await import('./pump-report/runtime/budget.mjs');
const {createCandidateCostQuoteBridge}=await import('./pump-report/runtime/candidate-cost-quote-bridge.mjs');
const {candidateAdmissionQuote}=await import('./pump-report/runtime/runner.mjs');
const {START_PROFILE}=await import('./pump-report/profile/start-v1.mjs');
const {PRODUCTION_PLAN}=await import('./pump-report/runtime/production-policy.mjs');
const {DISCOVERY_PLAN}=await import('./pump-report/runtime/discovery-reserve.mjs');
const T=1793356252938,D='2026-10-30',M='2026-10',first=1793343600000,binding=Object.freeze({implementation_sha256:'a'.repeat(64),registry_sha256:'b'.repeat(64),cost_contract:'BINGX10_TG1_MAP1_ALLOC12_V1'});
function instrument(n){return {instrument_id:'BINGX:USDT_M:FIXTURE'+n+':TEST'+n+'-USDT',asset_id:'FIXTURE:TEST'+n,native_symbol:'TEST'+n+'-USDT',base:'TEST'+n,venue:'BINGX',market_type:'PERPETUAL',quote:'USDT',settle:'USDT',classification_status:'VERIFIED_CRYPTO',identity_evidence_ref:'CONTROLLED_NOT_NATIVE_'+n};}
function old(i,past=false){const day=past?'2026-10-29':D,created=Date.parse(day+'T07:00:00Z'),used=past?11:i===8?6:5,usedB=past?10:used,usedTG=past?1:0;return {version:'pump-unassigned-candidate-hold-v1',run_id:'OLD'+(past?'P':'N')+i,candidate_id:'OLD'+i,day,state:'CLOSED',created_ts:created,original_http:12,remaining_http:12-used,consumed_http:used,original_by_provider:{BINGX:10,TELEGRAM:1},remaining_by_provider:{BINGX:10-usedB,TELEGRAM:1-usedTG},consumed_by_provider:{BINGX:usedB,TELEGRAM:usedTG},logical_spent:true,native_expires_ts:created+300000,hold_until_ts:Date.parse(day+'T00:00:00Z')+86400000};}
function state(charged=195,count=3){const grants={};for(let j=0;j<85;j++){const g=old(j<9?j:j-9,j>=9);grants[g.run_id+'|'+g.candidate_id]=g;}const buckets={};for(let j=0;j<4;j++){const k=String(first+j*3600000);buckets[k]={version:'pump-even-day-deep-v2',day:D,key:k,created_ts:first+j*3600000+100,limit:36,charged:[15,18,12,14][j],candidate_count:j===3?count:3,carried_in:0,maximum:3,issued_before:j*3};}
return {schema:'PUMP_SHARED_RESOURCE_V1',days:{[D]:196},providers:{BINGX:{days:{[D]:193},months:{[M]:2134},recent:[]},TELEGRAM:{days:{[D]:3},months:{[M]:7},recent:[]}},outstanding:{},unknown:{old1:{run_id:'PAST',cost:1},old2:{run_id:'PAST',cost:1}},automatic_plans:{[D]:{schema:'PUMP_PLANNED_AUTOMATIC_DAY_V1',day:D,created_ts:first+100,baseline_charged:0,protected_at_creation:102,fraction:.8,limit:638,charged}},automatic_candidate_allocations:{[D]:{version:'pump-even-day-deep-v2',created_ts:first+100,first_period:String(first),remaining_periods:10,http_upper_bound:12,http_by_provider:{BINGX:10,TELEGRAM:1},candidates_per_period:3,baseline_auto_charged:0}},automatic_deep_pacing:{[D]:buckets},automatic_surplus_grants:grants};}
function fixture({run='NEW',mode='empty',charged=195,count=3,retry=false,bridgeBinding=binding,existing=null}={}){
 let now=T,mock=0,retries=0;const A=instrument(1),B=instrument(2),entries=[A,B].map(i=>({instrument:i,native_contract_id:i.instrument_id,qualifications:{},liquidations:mode==='missing'?{}:{routes:mode==='present'?[{provider:'DORMANT_UNQUALIFIED'}]:[]}}));
 const sources=createPumpSources({identityRegistry:entries,clock:()=>now,profile:START_PROFILE,candidate_cost_binding:binding,broker:{async request(){mock++;throw Error('PROVIDER_FORBIDDEN');}}});
 const bridge=createCandidateCostQuoteBridge(bridgeBinding);bridge.bind(sources);
 const values=new Map([['pump:resources',state(charged,count)]]);
 if(existing){const g={...old(200),run_id:run,candidate_id:A.instrument_id,created_ts:T-10,native_expires_ts:T+600000,state:existing,consumed_http:0,remaining_http:12,remaining_by_provider:{BINGX:10,TELEGRAM:1},consumed_by_provider:{BINGX:0,TELEGRAM:0}};values.get('pump:resources').automatic_surplus_grants[run+'|'+A.instrument_id]=g;}
 const store={admission:{evidence_ref:'CONTROLLED#PUMP:AUTO:'+run,expires_ts:T+600000,max_requests:800,max_rows_read:5000,max_rows_written:300},finalization_reserve:{requests:4,rows_read:4,rows_written:4},usage:()=>({requests:0,rows_read:0,rows_written:0,unknown_ops:0}),async get(k){return values.has(k)?structuredClone(values.get(k)):null;},async atomic(k,fn){if(retry){await fn(values.has(k)?structuredClone(values.get(k)):null);retries++;}const out=await fn(values.has(k)?structuredClone(values.get(k)):null);values.set(k,structuredClone(out.state));return structuredClone(out.result);}};
 const policies={BINGX:{version:'F',evidence_ref:'CONTROLLED',project_daily_cap:900,project_monthly_cap:27900,per_minute_cap:10,per_second_cap:1},TELEGRAM:{version:'F',evidence_ref:'CONTROLLED',project_daily_cap:47,project_monthly_cap:1457,per_minute_cap:1,delivery_source:false,outcome_source:false}};
 const admission={provider_policy_version:'F',expires_ts:T+600000,run_purpose:'PRODUCTION',strict_automatic_window:true,allowed_providers:['BINGX','TELEGRAM'],discovery:DISCOVERY_PLAN,future_candidates:PRODUCTION_PLAN.future_candidates,planned_load_fraction:.8,candidate_pacing:PRODUCTION_PLAN.candidate_pacing,candidate_surplus:PRODUCTION_PLAN.candidate_surplus};
 const budget=createUnifiedBudget({store,run_id:run,mode:'AUTO',clock:()=>now,policies,protected_reserves:{http_by_provider:{BINGX:51,TELEGRAM:3,SWOLECHARTS:0,BINGX_WEB_METADATA:0},delivery_http:24,outcomes_http:24},admission,candidate_cost_quotes:bridge.hooks});
 return {run,A,B,entries,sources,bridge,budget,store,values,advance:()=>{now+=1001;},mock:()=>mock,retries:()=>retries,quote:i=>candidateAdmissionQuote(sources,i,run),admit:(i,t,upper=12)=>budget.admitCandidate({http_upper_bound:upper,http_by_provider:{BINGX:10,TELEGRAM:1},candidate_id:i.instrument_id,source_cost_token:t})};
}
const f=fixture({retry:true}),initial=await f.store.get('pump:resources'),oldHolds=JSON.stringify(initial.automatic_surplus_grants),token=f.quote(f.A);
const oldDecision=await f.admit(f.A,null);assert.equal(oldDecision.detail,'WHOLE_CANDIDATE_PLANNED_ALLOCATION');
const granted=await f.admit(f.A,token);assert.equal(granted.allowed,true);assert.equal(granted.operation_http_upper_bound,11);assert.equal(granted.candidate_quota.allocation_http_upper_bound,12);assert(f.retries()>0);
const grantedAgain=await f.admit(f.A,token);assert.equal(grantedAgain.allowed,true);assert.equal(grantedAgain.candidate_quota.idempotent,true);assert.equal(grantedAgain.surplus_grant_id,granted.surplus_grant_id);
let saved=await f.store.get('pump:resources');assert.equal(Object.keys(saved.automatic_surplus_grants).length,86);assert.equal(saved.automatic_surplus_grants[granted.surplus_grant_id].original_http,11);
assert.equal(JSON.stringify(Object.fromEntries(Object.entries(saved.automatic_surplus_grants).filter(([k])=>k!==granted.surplus_grant_id))),oldHolds);
assert.deepEqual(saved.automatic_candidate_allocations,initial.automatic_candidate_allocations);assert.deepEqual(saved.automatic_deep_pacing,initial.automatic_deep_pacing);assert.equal(saved.automatic_plans[D].limit,638);
result.cases.push('1 exact639->638/newgrant11/allocation12/CASretry/idempotent');
const next=await f.admit(f.B,f.quote(f.B));assert.equal(next.allowed,false);assert.equal(next.detail,'WHOLE_CANDIDATE_PLANNED_ALLOCATION');result.cases.push('2 next649 denied');
const base=fixture({charged:180,count:2});const ba=await base.admit(base.A,base.quote(base.A));assert.equal(ba.allowed,true);assert.equal(ba.operation_http_upper_bound,12);assert.equal(ba.surplus_grant_id,undefined);result.cases.push('3 base remains12');
for(const mode of ['missing','present']){const u=fixture({mode});assert.equal(u.quote(u.A),null);assert.equal((await u.admit(u.A,null)).allowed,false);}
const forged=fixture();assert.equal((await forged.admit(forged.A,{})).allowed,false);
const other=fixture();assert.equal((await forged.admit(forged.A,other.quote(other.A))).allowed,false);
assert.equal((await forged.admit(forged.A,forged.quote(forged.B))).allowed,false);
assert.equal((await forged.admit(forged.A,forged.sources.quoteCandidateRouteCost({instrument:forged.A,run_id:'OTHER'}))).allowed,false);
assert.equal((await forged.admit(forged.A,forged.quote(forged.A),11)).allowed,false);
const wrong=fixture({bridgeBinding:{...binding,registry_sha256:'c'.repeat(64)}});assert.equal((await wrong.admit(wrong.A,wrong.quote(wrong.A))).allowed,false);
assert.equal(forged.sources.quoteCandidateRouteCost({instrument:{...forged.A,identity_evidence_ref:'WRONG'},run_id:forged.run}),null);
result.cases.push('4 missing/present/forged/wronginstance/identity/run/binding/caller11 failclosed');
const open=fixture({existing:'OPEN'}),ot=open.quote(open.A),oa=await open.admit(open.A,ot);assert.equal(oa.allowed,true);assert.equal(oa.operation_http_upper_bound,12);assert.equal((await open.store.get('pump:resources')).automatic_surplus_grants[oa.surplus_grant_id].original_http,12);
for(const state of ['CLOSED','UNKNOWN']){const old=fixture({existing:state});assert.equal((await old.admit(old.A,old.quote(old.A))).allowed,false);}result.cases.push('5 oldOPEN12 no reprice/CLOSED UNKNOWN no reopen');
const stranger=fixture();const before=await f.store.get('pump:resources');assert.equal((await f.admit(f.A,stranger.quote(stranger.A))).allowed,false);assert.deepEqual(await f.store.get('pump:resources'),before);result.cases.push('6 OPEN11 requires original owned binding');
f.entries[0].liquidations.routes.push({provider:'UNQUALIFIED_NEW'});
const map=await f.sources.getLiquidations({instrument:f.A,reference_price:100,deadline_ts:T+10000});assert.equal(map.reason,'NO_VERIFIED_LIQUIDATION_ROUTE');assert.equal(f.mock(),0);
await assert.rejects(f.budget.reserve({provider:'BINGX',family:'LIQUIDATIONS',candidate_id:f.A.instrument_id,request_id:'MAP_FORBIDDEN'}),{code:'SURPLUS_QUOTED_MAP_NOT_ALLOWED'});result.cases.push('7 frozen empty source + broker map fence actualHTTP0');
for(let j=0;j<11;j++){f.advance();const provider=j<10?'BINGX':'TELEGRAM';const rec=await f.budget.reserve({provider,family:provider==='TELEGRAM'?'DELIVERY':'USDT_M',candidate_id:f.A.instrument_id,request_id:'F'+j,purpose:'CORE'});await f.budget.finalize(rec,{http_status:200,network_attempted:false});}
f.advance();await assert.rejects(f.budget.reserve({provider:'BINGX',family:'USDT_M',candidate_id:f.A.instrument_id,request_id:'TWELFTH'}),{code:'SURPLUS_HOLD_EXHAUSTED_OR_CLOSED'});
saved=await f.store.get('pump:resources');assert.equal(saved.automatic_surplus_grants[granted.surplus_grant_id].consumed_http,11);assert.equal(saved.automatic_surplus_grants[granted.surplus_grant_id].remaining_http,0);assert.equal(JSON.stringify(Object.fromEntries(Object.entries(saved.automatic_surplus_grants).filter(([k])=>k!==granted.surplus_grant_id))),oldHolds);
result.cases.push('8 hard11 ceiling and original62/unknowns preserved');
await f.budget.closeCandidate({candidate_id:f.A.instrument_id,surplus_grant_id:granted.surplus_grant_id});assert.equal((await f.admit(f.A,token)).allowed,false);assert.equal((await f.store.get('pump:resources')).automatic_surplus_grants[granted.surplus_grant_id].state,'CLOSED');
result.cases.push('9 close no refund/reopen, one private source binding');
assert.equal(result.cases.length,9);assert.equal(PRODUCTION_PLAN.future_candidates.http_per_slot,12);assert.equal(PRODUCTION_PLAN.manual_checks,3);
result.state='PASS';result.old_CLOSED_hold_HTTP=62;result.quoted_new_grant_HTTP=11;result.future_HTTP=216;result.plan_limit=638;result.full_actual_source_budget_connected=true;
}catch(e){result.state='FAILED_NO_RETRY';result.error=String(e.stack??e);process.exitCode=1;}finally{save(result);fs.writeFileSync(admission.result_file,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});fs.closeSync(fd);}console.log(JSON.stringify(result));
