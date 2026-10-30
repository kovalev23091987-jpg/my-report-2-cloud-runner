// ONE NEW load -> metadata profile callable; author UNEXECUTED.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function runObservedZeroStatisticsProfileCase({repo_root}={}){
 const results=[],partial={schema:'OBSERVED_ZERO_PROFILE_PARTIAL_V1',new_groups:0,new_variants:0,results,native_SQL:0,SQLite:0,provider_HTTP:0,MAIN:0,Telegram:0};
 try{
  const root=resolve(repo_root),prefix=join(root,'anomaly-research/history-statistics-consumer-20261023'),binding=JSON.parse(await readFile(join(prefix,'target-bindings.json'),'utf8')),pins={};
  for(const [path,pin]of Object.entries({[binding.target]:binding.after,...binding.unchanged_context})){const b=await readFile(join(root,path));assert.equal(b.length,pin.bytes,path);assert.equal(hash(b),pin.sha256,path);pins[path]=hash(b);}
  const api=await import(pathToFileURL(join(root,binding.target)).href),trace=[];let input=null,installBatches=0;
  const db={prepare(sql){return{sql,params:[],bind(...params){this.params=params;return this;},async all(){trace.push({sql:this.sql,params:structuredClone(this.params)});assert.match(this.sql,/p\.ewma_accuracy AS predictive_accuracy/);assert.match(this.sql,/'SHADOW' AS activation_state/);assert.match(this.sql,/'LEGACY_DISABLED' AS eligibility_protocol/);return{results:[structuredClone(input)]};}};},async batch(statements){installBatches++;assert.equal(statements.length,3);assert.ok(statements.every(s=>s.sql.startsWith('CREATE TABLE IF NOT EXISTS')));return statements.map(()=>({success:true,meta:{changes:0}}));}};
  const store=api.createLiquidationSourceWeightStore({db,clock:()=>1792771200000}),source='HYPERLIQUID_NATIVE';
  const base={source_id:source,attempts:10,usable_runs:4,not_closed_runs:6,reliability:0.5,last_status:'CONTROLLED_RETAINED_ROW',updated_ts:1792770000000,predictive_observations:200,predictive_accuracy:0.5,predictive_weight_factor:1,predictive_eligible:0,activation_state:'SHADOW',eligibility_protocol:'LEGACY_DISABLED'};
  let baselinePolicy=null;
  const fixtures=[
   {name:'finite observed positive',value:0.5,expected:0.5},
   {name:'finite observed zero',value:0,expected:0},
   {name:'finite observed one',value:1,expected:1},
   {name:'missing predictive row value',missing:true,expected:null},
   {name:'null accuracy with retained count',value:null,expected:null},
   {name:'SQL LEFT JOIN absent predictive row',value:null,observations:null,expected_observations:0,expected:null},
   {name:'empty string is not zero',value:'',expected:null},
   {name:'whitespace is not zero',value:' ',expected:null},
   {name:'false is not zero',value:false,expected:null},
   {name:'true is not one',value:true,expected:null},
   {name:'numeric text is outside strict REAL result type',value:'0',expected:null},
   {name:'NaN is missing',value:NaN,expected:null},
   {name:'infinite is missing',value:Infinity,expected:null},
   {name:'negative outside normalized range',value:-0.1,expected:null},
   {name:'above one outside normalized range',value:1.1,expected:null},
   {name:'zero observations is not measured accuracy',value:0,observations:0,expected:null},
  ];
  for(const f of fixtures){
   input={...base,predictive_accuracy:f.value,predictive_observations:Object.hasOwn(f,'observations')?f.observations:200};if(f.missing)delete input.predictive_accuracy;if(f.observations===null){input.predictive_weight_factor=null;input.predictive_eligible=null;}
   const loaded=await store.load([source]);assert.equal(loaded.length,1);assert.equal(loaded[0].predictive_observations,input.predictive_observations);
   const profile=api.buildLiquidationSourceWeightProfile([source],loaded)[0],policy=Object.fromEntries(Object.entries(profile).filter(([k])=>!['predictive_accuracy','predictive_observations'].includes(k)));
   const observed={name:f.name,observations:profile.predictive_observations,reported_accuracy:profile.predictive_accuracy,predictive_weight_factor:profile.predictive_weight_factor,predictive_weight_eligible:profile.predictive_weight_eligible,selection_weight:profile.selection_weight};partial.current=observed;
   assert.equal(profile.predictive_accuracy,f.expected,f.name);assert.equal(profile.predictive_observations,f.expected_observations??input.predictive_observations);assert.equal(profile.predictive_weight_factor,1);assert.equal(profile.predictive_weight_eligible,false);assert.equal(profile.selection_weight,1);
   if(baselinePolicy===null)baselinePolicy=policy;else assert.deepEqual(policy,baselinePolicy,'only reported accuracy/unchanged count may differ');
   results.push(observed);partial.new_variants=results.length;delete partial.current;
  }
  assert.equal(installBatches,1);assert.equal(trace.length,fixtures.length);for(const item of trace){assert.equal(item.sql,trace[0].sql);assert.deepEqual(item.params,trace[0].params);}
  partial.new_groups=1;partial.qualification_pending_postpins=true;
  for(const [path,pin]of Object.entries({[binding.target]:binding.after,...binding.unchanged_context}))assert.equal(hash(await readFile(join(root,path))),pin.sha256,path);
  delete partial.qualification_pending_postpins;
  return{schema:'OBSERVED_ZERO_STATISTICS_PROFILE_CONTROLLED_V1',new_groups:1,new_variants:results.length,results,unchanged_policy_fields:true,existing_load_SQL_and_params_same:true,CONTROLLED_select_method_calls:trace.length,CONTROLLED_install_batches:installBatches,SQL_engine_executed:false,native_SQL:0,SQLite:0,provider_HTTP:0,MAIN:0,Telegram:0,pins,pins_before_after_equal:true,old37_111_3274_13096_recalculated:0,old_studies_or_cases_replayed:0,actual_native_zero_incident_proven:false,predictive_accuracy_estimated:false,productionweights_changed:false,author_execution:'UNEXECUTED'};
 }catch(error){error.partial_result=structuredClone(partial);throw error;}
}
