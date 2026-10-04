import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {BYK_PLAN,HTTP_LIMITS,D1_DAILY_LIMITS,proveBykWorstCase,admitDailyDeep,createUnifiedHttpBudget,installUnifiedBykLedger,reserveBykAttempt,markBykAttemptUnknown} from '../files/src/unified-budget.mjs';

class Statement{constructor(db,sql,args=[]){this.db=db;this.sql=sql;this.args=args;}bind(...args){return new Statement(this.db,this.sql,args);}async run(){return this.db.sqlite.prepare(this.sql).run(...this.args);}async first(){return this.db.sqlite.prepare(this.sql).get(...this.args)||null;}}
class D1{constructor(){this.sqlite=new DatabaseSync(':memory:');this.tail=Promise.resolve();}prepare(sql){return new Statement(this,sql);}async batch(rows){let release;const previous=this.tail;this.tail=new Promise(resolve=>{release=resolve;});await previous;this.sqlite.exec('BEGIN IMMEDIATE');try{const result=[];for(const row of rows)result.push(await row.run());this.sqlite.exec('COMMIT');return result;}catch(error){this.sqlite.exec('ROLLBACK');throw error;}finally{release();}}}

test('K15: 31-day worst case is 13,330 and scheduled plus burst is 11,625',()=>{
  assert.deepEqual(proveBykWorstCase(),{closed:true,monthly_units:13330,scheduled_units:11625,daily_fulls:86,project_headroom:170});
  assert.equal(D1_DAILY_LIMITS.planned_rows_read,3374000);
  assert.equal(D1_DAILY_LIMITS.rows_read-D1_DAILY_LIMITS.planned_rows_read,126000);
  assert.equal(D1_DAILY_LIMITS.rows_written-D1_DAILY_LIMITS.planned_rows_written,3840);
});

test('K15: liquidation-only spends zero BYK but shares five manual-coin admissions',()=>{
  assert.deepEqual(admitDailyDeep({category:'liquidation_only',daily_counts:{manual_coin:4}}),{allowed:true,status:'ADMITTED',category:'manual_coin',byk_units:0});
  assert.equal(admitDailyDeep({category:'liquidation_only',daily_counts:{manual_coin:5}}).allowed,false);
  assert.equal(Object.values(BYK_PLAN.categories).reduce((sum,x)=>sum+x.daily,0),86);
  const fullCounts={scheduled:72,manual_full:6,manual_coin:5,burst:3};
  assert.equal(admitDailyDeep({category:'scheduled',daily_counts:fullCounts}).status,'DAILY_CATEGORY_CAP_EXHAUSTED');
});

test('K15: cache and statistics lanes cannot bypass the 164-request whole-job cap',()=>{
  const budget=createUnifiedHttpBudget();
  assert.equal(budget.reserve({logical_request_id:'hot',lane:'hot',attempts:120}).allowed,true);
  assert.equal(budget.reserve({logical_request_id:'bg',lane:'background',attempts:28}).allowed,true);
  assert.equal(budget.reserve({logical_request_id:'stats-too-large',lane:'statistics',attempts:16}).allowed,true);
  assert.equal(budget.summary().total,HTTP_LIMITS.whole_job);
  assert.equal(budget.reserve({logical_request_id:'bypass',lane:'statistics',attempts:1}).allowed,false);
  assert.equal(budget.reserve({logical_request_id:'hot',lane:'hot',attempts:120}).duplicate,true);
});

test('K15: two actors competing for last project units admit at most one and duplicate request does not spend twice',async()=>{
  const db=new D1();await installUnifiedBykLedger(db);
  db.sqlite.prepare(`INSERT INTO report2_provider_budget_v2 VALUES('BYK','2026-09',13500,12900,13495,12000,NULL,0,1)`).run();
  const args={attempt_no:1,category:'manual_full',units:5,protected_remaining:0,provider_remaining:5,now:Date.UTC(2026,8,30)};
  const [a,b]=await Promise.all([reserveBykAttempt(db,{...args,logical_request_id:'A'}),reserveBykAttempt(db,{...args,logical_request_id:'B'})]);
  assert.equal([a,b].filter(x=>x.allowed).length,1);
  const winner=a.allowed?'A':'B';
  const repeat=await reserveBykAttempt(db,{...args,logical_request_id:winner});
  assert.equal(repeat.allowed,true);
  assert.equal(db.sqlite.prepare(`SELECT spent_or_outstanding FROM report2_provider_budget_v2`).get().spent_or_outstanding,13500);
});

test('K15: timeout remains conservatively charged and UTC month creates a new accounting period',async()=>{
  const db=new D1();await installUnifiedBykLedger(db);
  const first=await reserveBykAttempt(db,{logical_request_id:'TIMEOUT',attempt_no:1,category:'manual_full',protected_remaining:0,provider_remaining:100,now:Date.UTC(2026,8,30,23,59,59)});
  assert.equal(first.allowed,true);
  assert.deepEqual(await markBykAttemptUnknown(db,first.reservation_key),{status:'UNKNOWN',refunded:false,units:5});
  assert.equal(db.sqlite.prepare(`SELECT spent_or_outstanding FROM report2_provider_budget_v2 WHERE accounting_period='2026-09'`).get().spent_or_outstanding,5);
  const october=await reserveBykAttempt(db,{logical_request_id:'NEXT',attempt_no:1,category:'manual_full',protected_remaining:0,provider_remaining:95,now:Date.UTC(2026,9,1)});
  assert.equal(october.accounting_period,'2026-10');
  assert.equal(october.allowed,true);
});
