import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createPumpSources} from '../../sources/index.mjs';
import {BINGX_IDENTITY_REGISTRY} from '../../registry/index.mjs';
import {createUnifiedBudget,createRequestBroker,utcDay,utcMonth} from '../../runtime/budget.mjs';
import {runSourceFeasibility} from '../../runtime/source-feasibility.mjs';
import {reserveNativeRun} from '../../runtime/native-budget.mjs';
import {SOURCE_FEASIBILITY_ID} from '../../runtime/provider-policy.mjs';
import {MemoryStore} from '../../runtime/store.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
const T=1792953801000;

async function harness({fail=false}={}){
  let now=T;const store=new MemoryStore(),captured=[],version='preserved-f550-test',day=utcDay(T),month=utcMonth(T);
  const unknown={OLD:{cost:2}};await store.set('pump:resources',{days:{[day]:22},providers:{BINGX:{days:{[day]:17},months:{[month]:17},qualification_totals:{[version]:12},recent:[]}},outstanding:{},unknown});
  const budget=createUnifiedBudget({store,run_id:'CONTROLLED_SOURCE3',mode:'MANUAL',clock:()=>now,policies:{BINGX:{version,evidence_ref:'CONTROLLED',allowed_hosts:['open-api.bingx.com'],allowed_paths:['/openApi/swap/v2/quote/trades','/openApi/swap/v3/quote/klines','/openApi/swap/v2/quote/ticker'],per_second_cap:1,per_minute_cap:10,project_daily_cap:900,project_monthly_cap:27900,qualification_attempt_cap:24}},protected_reserves:{http_by_provider:{BINGX:102,TELEGRAM:6},delivery_http:24,outcomes_http:24},admission:{provider_policy_version:version,expires_ts:T+900000,allowed_providers:['BINGX'],max_http_attempts:3,run_purpose:'ACCEPTANCE_TEST'}});
  const base=createRequestBroker({store,budget,clock:()=>now,sleep_impl:async ms=>{now+=ms;},fetch_impl:async url=>{
    const u=new URL(url);if(fail)return new Response('{"code":100410}',{status:429});
    let data;if(u.pathname.endsWith('/trades'))data=[{id:'CONTROLLED_1',time:now,price:'10',quoteQty:'100',isBuyerMaker:false}];
    else if(u.pathname.endsWith('/klines')){const start=Number(u.searchParams.get('startTime'));data=Array.from({length:125},(_,i)=>({time:start+i*60000,open:'10',high:'11',low:'9',close:'10.5',volume:'100'}));}
    else data=BINGX_IDENTITY_REGISTRY.map(r=>({symbol:r.instrument.native_symbol,lastPrice:'10',closeTime:now,openPrice:'9',priceChangePercent:'11',quoteVolume:'100'}));
    return new Response(JSON.stringify({code:0,data}),{status:200});
  }});let stopped=false;
  const broker={...base,operationFailed:()=>stopped,request:async r=>{try{const response=await base.request(r);captured.push({request:{url:r.url,method:'GET'},response});if(response.semantic_status!=='SUCCESS')stopped=true;return response;}catch(e){stopped=true;throw e;}}};
  const sources=createPumpSources({broker,identityRegistry:BINGX_IDENTITY_REGISTRY,profile:{...START_PROFILE,optional_http_upper_bound:1},clock:()=>now});
  return {store,budget,broker,sources,captured,day,month,version,unknown,clock:()=>now};
}
test('fixed source operation reaches actual T3/H125/bulk consumers in three charged calls, retains old pool and has no publication',async()=>{
  const h=await harness(),r=await runSourceFeasibility({...h,run_id:'CONTROLLED_SOURCE3'});
  assert.equal(r.status,'OBSERVED');assert.equal(h.captured.length,3);assert.equal(h.budget.summary().total,3);assert.equal(r.history.facts.candles.value.length,125);assert.equal(r.history.facts.candles.coverage.complete,true);assert.equal(r.optional.facts.trades.unit,'USDT_PRICE_QUOTE_NOTIONAL');
  assert.equal(r.publication_allowed,false);assert.equal(r.Telegram_attempts,0);assert.equal(r.all550_operationally_qualified,false);assert.equal(r.current_catalog_refreshed,false);
  assert.equal(r.raw_responses[2].response.data.data.length,13);assert.equal(Object.hasOwn(await h.store.get('pump:source-feasibility:CONTROLLED_SOURCE3'),'raw_responses'),false);
  const state=await h.store.get('pump:resources');assert.equal(state.providers.BINGX.qualification_totals[h.version],15);assert.equal(state.days[h.day],25);assert.deepEqual(state.unknown,h.unknown);
  await assert.rejects(h.broker.request({provider:'BINGX',url:'https://open-api.bingx.com/openApi/swap/v2/quote/ticker',cache_key:'FORBIDDEN_FOURTH',ttl_ms:0}),{code:'EXACT_OPERATION_HTTP_EXHAUSTED'});assert.equal(h.budget.summary().total,3);
});
test('provider rate failure charges the attempted request and stops the fixed operation before later sources',async()=>{
  const h=await harness({fail:true}),r=await runSourceFeasibility({...h,run_id:'CONTROLLED_STOP'});assert.equal(r.status,'INCOMPLETE');assert.equal(h.captured.length,1);assert.equal(h.budget.summary().total,1);assert.equal(r.history,null);assert.equal(r.overview,null);assert.equal((await h.store.get('pump:resources')).providers.BINGX.qualification_totals[h.version],13);
});

test('actual native admission SQL keeps five spent CONTROLs and permits only one fixed additional ID under the proposed active stage',async()=>{
  // Only the compiled policy stage is substituted; actual admission SQL runs
  // in an isolated SQLite database. Its cost metadata is synthetic, not D1.
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE report2_runner_budget_ledger_shadow(reservation_id TEXT PRIMARY KEY,day_utc TEXT,reserve_rows_read INTEGER,reserve_rows_written INTEGER,state TEXT,started_ts INTEGER,measured_rows_read INTEGER,measured_rows_written INTEGER,unknown_ops INTEGER)');db.exec('CREATE INDEX idx_report2_runner_budget_day ON report2_runner_budget_ledger_shadow(day_utc)');
  for(let n=0;n<5;n++)db.prepare('INSERT INTO report2_runner_budget_ledger_shadow VALUES(?,?,?,?,?,?,?,?,?)').run('PUMP:CONTROL:OLD'+n,utcDay(T),5000,300,'FINALIZED',T-1000,1,1,0);
  const adapter={prepare(sql){return {bind(...args){return {async all(){const results=db.prepare(sql).all(...args);const changes=Number(db.prepare('SELECT changes() AS n').get().n);return {success:true,results,meta:{changes,rows_read:1,rows_written:/^INSERT/.test(sql)?changes:0}};}};}};}};
  await assert.rejects(reserveNativeRun({db:adapter,run_id:SOURCE_FEASIBILITY_ID,mode:'CONTROL',clock:()=>T}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});
  const sourceURL=new URL('../../runtime/native-budget.mjs',import.meta.url);let source=fs.readFileSync(sourceURL,'utf8');source=source.replace("import {PROVIDER_STAGE,SOURCE_FEASIBILITY_ID} from './provider-policy.mjs';","const PROVIDER_STAGE='SOURCE_FEASIBILITY_SINGLE',SOURCE_FEASIBILITY_ID="+JSON.stringify(SOURCE_FEASIBILITY_ID)+';');source=source.replace(/from '([^']+)'/g,(_,p)=>'from '+JSON.stringify(new URL(p,sourceURL).href));
  const admitted=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));const r=await admitted.reserveNativeRun({db:adapter,run_id:SOURCE_FEASIBILITY_ID,mode:'CONTROL',clock:()=>T});assert.equal(r.admission.max_rows_read,5000);assert.equal(r.admission.max_rows_written,300);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow WHERE state='FINALIZED'").get().n,5);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report2_runner_budget_ledger_shadow').get().n,6);
  for(const id of [SOURCE_FEASIBILITY_ID,'UNRELATED_NEW_ID'])await assert.rejects(admitted.reserveNativeRun({db:adapter,run_id:id,mode:'CONTROL',clock:()=>T}),{code:'SHARED_NATIVE_DAY_BLOCKED_OR_DUPLICATE'});db.close();
});
