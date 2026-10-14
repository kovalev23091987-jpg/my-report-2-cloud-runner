import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createLiquidationSourceWeightStore,planLiquidationSourceOrder,exactAssetRolePriority,NATIVE_ROLE_PRIORITY_INDEX} from '../files/src/liquidation-source-weighting.mjs';

const now=1791965700000,contract='BTW-USDT',role='NATIVE_POSITION_CONTEXT',run_id='current';
const facts=JSON.parse(fs.readFileSync('checkpoints/ACTIVE_SOURCE_STORAGE_AND_FUNDING_ORIGINAL_FACTS_20261014.json','utf8'));
const originals=[];
function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(Object.hasOwn(v,'role_usable')&&v.contract&&v.source_id)originals.push(v);else Object.values(v).forEach(walk);}}
walk(facts.source_fact_data);
const dx=originals.filter(x=>x.contract===contract&&x.source_id==='DYDX_PINNED_NATIVE'&&now-x.observed_ts<=86400000).slice(0,4);
const prior=history=>({source_id:'DYDX_PINNED_NATIVE',role_prior_contract:contract,role_prior_role:role,role_prior_json:JSON.stringify(history)});

test('two original empty BTW samples affect collection order only and keep fallback eligible',()=>{
 assert.ok(dx.length>=2);const p=exactAssetRolePriority({row:prior(dx),contract,role,run_id,now});assert.equal(p.priority,-1);assert.ok(p.empty>=2);assert.equal(p.current_asset_coverage,false);assert.equal(p.predictive_weight_changed,false);
 const ordered=planLiquidationSourceOrder({contract,run_id,now,lanes:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],rows:[{...prior(dx),attempts:20,reliability:1}],exact:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],clock_capable:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],costs:{DYDX_PINNED_NATIVE:3,HYPERLIQUID_NATIVE:2}});
 assert.deepEqual(ordered.ordered,['HYPERLIQUID_NATIVE','DYDX_PINNED_NATIVE']);assert.equal(ordered.profile[1].selection_weight,1.5);assert.ok(ordered.profile.every(x=>!Object.hasOwn(x,'role_prior_json')));
 const reused=planLiquidationSourceOrder({contract,run_id,now,lanes:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],rows:[prior(dx)],cached:['DYDX_PINNED_NATIVE'],clock_capable:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],costs:{DYDX_PINNED_NATIVE:0,HYPERLIQUID_NATIVE:2}});assert.equal(reused.ordered[0],'DYDX_PINNED_NATIVE');
});

test('foreign asset/source/role, future/stale clock, duplicate/current run or excessive history are neutral',()=>{
 const base=dx[0];
 for(const patch of [{contract:'OP-USDT'},{source_id:'HYPERLIQUID_NATIVE'},{role:'PROJECTED_BUCKET_CONTEXT'},{observed_ts:now+1},{observed_ts:now-86400001},{run_id}])assert.equal(exactAssetRolePriority({row:prior([{...base,...patch}]),contract,role,run_id,now}).priority,0);
 for(const history of [[base,base],Array(5).fill(base)])assert.equal(exactAssetRolePriority({row:prior(history),contract,role,run_id,now}).priority,0);
});

test('quota, transport, unsupported and unknown-cost failures cannot become empty useful-role evidence',()=>{
 for(const patch of [{status:'QUOTA_NOT_GRANTED'},{status:'SOURCE_EXCEPTION'},{status:'GTRADE_SYMBOL_UNSUPPORTED'},{actual_http:null}]){const p=exactAssetRolePriority({row:prior(dx.map(x=>({...x,...patch}))),contract,role,run_id,now});assert.equal(p.priority,0);assert.equal(p.samples,0);}
 const p=exactAssetRolePriority({row:prior(dx.map(x=>({...x,actual_http:0}))),contract,role,run_id,now});assert.equal(p.priority,-1);
});

function database(){const sqlite=new DatabaseSync(':memory:'),queries=[];return{sqlite,queries,db:{prepare(sql){return{args:[],bind(...a){this.args=a;return this;},async run(){queries.push({sql,args:this.args});return sqlite.prepare(sql).run(...this.args);},async first(){queries.push({sql,args:this.args});return sqlite.prepare(sql).get(...this.args)||null;},async all(){queries.push({sql,args:this.args});return{results:sqlite.prepare(sql).all(...this.args)};}};},async batch(rows){return Promise.all(rows.map(x=>x.run()));}}};}

test('absent or wrong index keeps growing role table unread and never creates a hidden index',async()=>{
 const x=database(),store=createLiquidationSourceWeightStore({db:x.db,clock:()=>now});await store.record({source_id:'DYDX_PINNED_NATIVE',usable:true,status:'OK'});
 const rows=await store.load(['DYDX_PINNED_NATIVE'],{contract,run_id,now});assert.equal(rows.length,1);assert.ok(!rows[0].role_prior_json);assert.ok(!x.queries.some(q=>/INDEXED BY/.test(q.sql)));assert.equal(x.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name=?").get(NATIVE_ROLE_PRIORITY_INDEX).n,0);
 x.sqlite.exec('CREATE INDEX '+NATIVE_ROLE_PRIORITY_INDEX+' ON report2_liquidation_role_observation(run_id)');const other=createLiquidationSourceWeightStore({db:x.db,clock:()=>now});await other.load(['DYDX_PINNED_NATIVE'],{contract,run_id,now});assert.ok(!x.queries.some(q=>/INDEXED BY/.test(q.sql)));x.sqlite.close();
});

test('indexed bounded lookup keeps four exact prior runs and does not contaminate a different asset',async()=>{
 const x=database(),store=createLiquidationSourceWeightStore({db:x.db,clock:()=>now});await store.record({source_id:'DYDX_PINNED_NATIVE',usable:true,status:'ROLE_NOT_USABLE:NATIVE_POSITION_CONTEXT:EMPTY'});
 x.sqlite.exec(fs.readFileSync('runner/migrations/native-role-priority-index-20261014.sql','utf8'));
 for(let i=0;i<7;i++)await store.recordRole({...dx[0],role_usable:dx[0].role_usable===1,run_id:'sample'+i,now:now-1000-i});
 const rows=await store.load(['DYDX_PINNED_NATIVE'],{contract,run_id,now});assert.equal(JSON.parse(rows[0].role_prior_json).length,4);
 const q=x.queries.find(q=>/INDEXED BY/.test(q.sql));assert.ok(q);const plan=x.sqlite.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args);assert.ok(plan.some(p=>String(p.detail).includes(NATIVE_ROLE_PRIORITY_INDEX)));assert.ok(!plan.some(p=>/SCAN.*report2_liquidation_role_observation/.test(String(p.detail))));
 const other=await store.load(['DYDX_PINNED_NATIVE'],{contract:'STRK-USDT',run_id,now});const ordered=planLiquidationSourceOrder({contract:'STRK-USDT',run_id,now,lanes:['DYDX_PINNED_NATIVE'],rows:other,costs:{DYDX_PINNED_NATIVE:3}});assert.equal(ordered.profile[0].exact_asset_role_prior.priority,0);assert.equal(ordered.profile[0].recent_role_not_usable,false);assert.equal(ordered.profile[0].role_selection_weight,ordered.profile[0].selection_weight);x.sqlite.close();
});

test('useful exact-asset prior precedes empty transport and cannot outrank cached or clock-verifiable evidence',()=>{
 const rows=[prior(dx),{source_id:'HYPERLIQUID_NATIVE',role_prior_contract:contract,role_prior_role:role,role_prior_json:JSON.stringify([{...dx[0],source_id:'HYPERLIQUID_NATIVE',role_usable:1}])}];
 const args={contract,run_id,now,rows,lanes:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],exact:['DYDX_PINNED_NATIVE'],clock_capable:['DYDX_PINNED_NATIVE','HYPERLIQUID_NATIVE'],preferred:'DYDX_PINNED_NATIVE',costs:{DYDX_PINNED_NATIVE:3,HYPERLIQUID_NATIVE:2}};
 assert.equal(planLiquidationSourceOrder(args).ordered[0],'HYPERLIQUID_NATIVE');
 assert.equal(planLiquidationSourceOrder({...args,cached:['DYDX_PINNED_NATIVE']}).ordered[0],'DYDX_PINNED_NATIVE');
 assert.equal(planLiquidationSourceOrder({...args,clock_capable:['DYDX_PINNED_NATIVE']}).ordered[0],'DYDX_PINNED_NATIVE');
 assert.equal(planLiquidationSourceOrder({...args,rows:[prior(dx)]}).ordered[0],'DYDX_PINNED_NATIVE');
});
