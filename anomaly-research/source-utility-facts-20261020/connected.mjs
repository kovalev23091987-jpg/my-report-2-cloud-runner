// UNEXECUTED: one coordinator NEXT common entry; all fixtures CONTROLLED.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function runSourceUtilityConnected({repo_root,legacy_root=repo_root}={}){
 const sha=b=>createHash('sha256').update(b).digest('hex'),prefix='anomaly-research/source-utility-facts-20261020';
 const manifest=JSON.parse(await readFile(resolve(repo_root,prefix,'manifest.json'),'utf8'));
 const protocol=await readFile(resolve(repo_root,prefix,'protocol.json'));assert.equal(sha(protocol),manifest.protocol_sha256);
 const utilityPath=resolve(repo_root,prefix,'utility.mjs');assert.equal(sha(await readFile(utilityPath)),manifest.utility_sha256);
 const legacyPath=resolve(legacy_root,'anomaly-research/statistics/outcomes.mjs'),legacyText=await readFile(legacyPath,'utf8');
 const begin=legacyText.indexOf('export function sourceUtility('),helpersEnd=legacyText.indexOf('export function commitOutcomePlan(');assert.ok(begin>helpersEnd&&helpersEnd>0);
 assert.equal(sha(legacyText.slice(begin)),manifest.legacy_source_utility_sha256);assert.equal(sha(legacyText.slice(0,helpersEnd)),manifest.legacy_dependency_prefix_sha256);
 for(const root of new Set([repo_root,legacy_root])){const o=await readFile(resolve(root,'anomaly-research/observer/observer.mjs'),'utf8');assert.equal(sha(o.slice(0,o.indexOf('export function features('))),manifest.observer_hash_dependency_prefix_sha256);}
 const {summarizeCandleSourceUtility:after}=await import(pathToFileURL(utilityPath).href);
 const {sourceUtility}=await import(pathToFileURL(legacyPath).href);
 const {hash}=await import(pathToFileURL(resolve(repo_root,'anomaly-research/observer/observer.mjs')).href);
 const t=Date.UTC(2026,9,20),d=14400000,controls=[],witnesses=[];
 const cost=(id,status='MEASURED',http_requests=1)=>({acquisition_id:'CONTROLLED-'+id,cost_status:status,http_requests,cost_proof_ref:'controlled://cost/'+id,cost_proof_sha256:hash('CONTROLLED_COST:'+id)});
 const base={cohort:'CONTROLLED',upstream:'CONTROLLED_HTX_LIKE',source_id:'CONTROLLED_PROVIDER',asset_id:'CONTROLLED_ASSET',role:'CANDLE_FEATURES',status:'FACT',decision_ts:t+5000,source_ts:t+1000,body_completed_ts:t+2000,available_at:t+2000,exact_identity:true,fresh:true,numeric:true,consumer_used:true,raw_ref:'controlled://provider/bodyA',raw_sha256:hash('CONTROLLED_BODY_A'),raw_row_ref:'/data/0',instrument:{asset_id:'CONTROLLED_ASSET',market:'FUTURES',venue:'CONTROLLED_FUTURES',upstream:'CONTROLLED_HTX_LIKE',contract:'CONTROL-USDT',quote:'USDT',price_unit:'USDT',volume_unit:'USDT_BOTH_SIDES',native_epoch:'CONTROLLED_NOT_NATIVE_EPOCH',multiplier:1,multiplier_decimal:'1',identity_verified:true,binding_kind:'VERIFIED_NATIVE',binding_ref:'controlled://identity'},candle:{timeframe:'4h',alignment_offset_ms:0,start_ts:t-d,end_ts:t,numeric_lexemes:{open:'100',high:'102',low:'99',close:'101',volume:'1000'}}};
 const row=(id,change={})=>({...structuredClone(base),attempt_id:id,acquisition:cost(id),...change});
 const before=rows=>sourceUtility(rows.map(a=>({...a,http_requests:a.acquisition?.http_requests??null})));
 const check=(name,fn)=>{const detail=fn();controls.push(name);if(detail)witnesses.push({name,...detail});};
 const group=x=>{assert.equal(x.reports.length,1);return x.reports[0];};

 check('same candle with changed raw wrapper and decimal spellings is one fact',()=>{
  const a=row('A'),b=row('B',{source_id:'CONTROLLED_PROXY',raw_ref:'controlled://provider/bodyB',raw_sha256:hash('CONTROLLED_BODY_B')});b.candle.numeric_lexemes={open:'+00100.000',high:'102.00',low:'099.000',close:'101.0',volume:'1000.00'};
  const old=before([a,b]),next=after([a,b]),g=group(next);assert.equal(old.upstream_roles[0].distinct_usable_facts,2);assert.equal(g.distinct_bound_candles_across_roles,1);assert.equal(next.facts.length,1);assert.equal(next.facts[0].proof_variants.length,2);assert.equal(next.facts[0].numeric_variants[0].values.open,'100');assert.equal(g.total_HTTP,2);return {legacy:old,candidate:next};
 });
 check('one acquisition and same candle reused across roles counted once globally',()=>{
  const a=row('A'),b=row('B',{role:'CANDLE_MONITOR',acquisition:structuredClone(a.acquisition)}),old=before([a,b]),next=after([a,b]),g=group(next);assert.equal(old.upstream_roles.reduce((s,r)=>s+r.http_requests,0),2);assert.equal(g.total_HTTP,1);assert.equal(g.roles.length,2);assert.ok(g.roles.every(r=>r.distinct_bound_candles===1));assert.equal(g.distinct_bound_candles_across_roles,1);assert.equal(g.role_cost_attribution,null);return {legacy:old,candidate:next};
 });
 check('unknown acquisition retained beside known measured lower bound',()=>{
  const a=row('A',{acquisition:cost('A','UNKNOWN',null)}),b=row('B',{acquisition:cost('B','MEASURED',2)}),old=before([a,b]),next=after([a,b]),g=group(next);assert.equal(old.invalid,1);assert.equal(old.upstream_roles[0].http_requests,2);assert.equal(g.unknown_acquisitions,1);assert.equal(g.known_HTTP_lower_bound_decimal,'2');assert.equal(g.total_HTTP,null);assert.equal(g.distinct_candles_per_HTTP,null);assert.equal(g.distinct_bound_candles_across_roles,1);return {legacy:old,candidate:next};
 });
 check('unknown body completion cannot be substituted by header availability',()=>{
  const a=row('A',{body_completed_ts:null}),old=before([a]),next=after([a]),g=group(next);assert.equal(old.upstream_roles[0].usable_attempts,1);assert.equal(g.distinct_bound_candles_across_roles,0);assert.equal(g.roles[0].ineligible_reasons.BODY_COMPLETION_UNKNOWN,1);assert.equal(g.total_HTTP,1);return {legacy:old,candidate:next};
 });
 check('missing declared epoch preserves cost without manufacturing bound fact',()=>{
  const a=row('A');a.instrument.native_epoch=null;const next=after([a]),g=group(next);assert.equal(g.total_HTTP,1);assert.equal(g.distinct_bound_candles_across_roles,0);assert.equal(g.roles[0].ineligible_reasons.DECLARED_INSTRUMENT_EPOCH_OR_UNITS_MISSING,1);return {candidate:next};
 });
 check('fact available after decision cannot erase its measured acquisition cost',()=>{
  const a=row('A',{available_at:t+6000}),old=before([a]),next=after([a]),g=group(next);assert.equal(old.invalid,1);assert.equal(old.upstream_roles.length,0);assert.equal(g.total_HTTP,1);assert.equal(g.distinct_bound_candles_across_roles,0);return {legacy:old,candidate:next};
 });
 check('conflicting numeric revisions of one window censored across roles',()=>{
  const a=row('A'),b=row('B',{role:'CANDLE_MONITOR',raw_sha256:hash('CONTROLLED_REVISION')});b.candle.numeric_lexemes.close='100.5';const next=after([a,b]),g=group(next);assert.equal(g.total_HTTP,2);assert.equal(g.distinct_bound_candles_across_roles,0);assert.equal(next.facts.length,1);assert.equal(next.facts[0].status,'CENSORED_NUMERIC_REVISIONS');assert.equal(next.facts[0].numeric_variants.length,2);assert.ok(g.roles.every(r=>r.usable_consumer_uses===0&&r.censored_conflicting_candles===1));return {candidate:next};
 });
 check('two candle rows in one raw body remain two facts and one acquisition',()=>{
  const a=row('A'),b=row('B',{raw_row_ref:'/data/1',acquisition:structuredClone(a.acquisition)});b.candle.start_ts-=d;b.candle.end_ts-=d;const old=before([a,b]),next=after([a,b]),g=group(next);assert.equal(old.upstream_roles[0].distinct_usable_facts,1);assert.equal(g.distinct_bound_candles_across_roles,2);assert.equal(g.total_HTTP,1);assert.equal(g.distinct_candles_per_HTTP,2);return {legacy:old,candidate:next};
 });
 check('different declared instrument epochs never collapse by shared body hash',()=>{
  const a=row('A'),b=row('B');b.instrument.native_epoch='CONTROLLED_SECOND_EPOCH';const next=after([a,b]),g=group(next);assert.equal(g.distinct_bound_candles_across_roles,2);assert.equal(next.facts.length,2);return {candidate:next};
 });
 check('spot and futures with different volume units remain separate',()=>{
  const a=row('A'),b=row('B');Object.assign(b.instrument,{market:'SPOT',venue:'CONTROLLED_SPOT',contract:'CONTROL/USDT',native_epoch:'CONTROLLED_SPOT_EPOCH',volume_unit:'COIN_BOTH_SIDES'});const next=after([a,b]);assert.equal(group(next).distinct_bound_candles_across_roles,2);assert.deepEqual(new Set(next.facts.map(f=>f.instrument.market)),new Set(['SPOT','FUTURES']));return {candidate:next};
 });
 check('attempt replay and conflict counters independent of row order',()=>{
  const a=row('A'),b={...structuredClone(a),raw_sha256:hash('CONTROLLED_OTHER_BODY')},left=[a,a,b],right=[a,b,a],oldLeft=before(left),oldRight=before(right),nextLeft=after(left),nextRight=after(right);assert.equal(oldLeft.duplicates,1);assert.equal(oldRight.duplicates,0);assert.equal(oldLeft.conflicts,1);assert.equal(oldRight.conflicts,2);assert.equal(hash(nextLeft),hash(nextRight));assert.equal(nextLeft.identical_attempt_replays,1);assert.equal(nextLeft.conflicting_attempts,1);assert.equal(group(nextLeft).total_HTTP,1);assert.equal(group(nextLeft).distinct_bound_candles_across_roles,0);return {legacy_left:oldLeft,legacy_right:oldRight,candidate:nextLeft};
 });
 check('contradictory measured and unknown claims for same acquisition remain unknown',()=>{
  const a=row('A'),b=row('B',{acquisition:{...structuredClone(a.acquisition),cost_status:'UNKNOWN',http_requests:null}}),next=after([a,b]),g=group(next);assert.equal(g.conflicting_cost_acquisitions,1);assert.equal(g.total_HTTP,null);assert.equal(g.distinct_candles_per_HTTP,null);assert.equal(g.known_HTTP_lower_bound_decimal,'0');return {candidate:next};
 });
 check('malformed cost proof retains explicit unbound unknown instead of zero',()=>{
  const a=row('A');a.acquisition.cost_proof_sha256='';const next=after([a]),g=group(next);assert.equal(next.unbound_cost_claims,1);assert.equal(g.total_HTTP,null);assert.equal(g.distinct_candles_per_HTTP,null);assert.equal(g.distinct_bound_candles_across_roles,1);return {candidate:next};
 });
 check('admission refusal is zero request intent without source failure or usable candle',()=>{
  const a=row('A',{status:'NOT_ATTEMPTED_ADMISSION',consumer_used:false,body_completed_ts:null,acquisition:cost('A','NOT_ATTEMPTED',0)}),next=after([a]),g=group(next);assert.equal(g.total_HTTP,0);assert.equal(g.not_attempted_acquisitions,1);assert.equal(g.roles[0].attempts,0);assert.equal(g.roles[0].admission_deferred,1);assert.equal(g.distinct_bound_candles_across_roles,0);return {candidate:next};
 });
 check('cohort labels separate and never authenticate controlled input as native',()=>{
  const a=row('A'),b=row('B',{cohort:'RETAINED'}),next=after([a,b]);assert.equal(next.reports.length,2);assert.deepEqual(new Set(next.reports.map(g=>g.cohort)),new Set(['CONTROLLED','RETAINED']));assert.equal(next.global_HTTP_total_across_cohorts,null);assert.equal(next.native_identity_or_cost_authentication,false);assert.equal(next.native_commit_ACK_qualified,false);return {fixture_provenance:'ALL_CONTROLLED_INCLUDING_SIMULATED_RETAINED_LABEL',candidate:next};
 });
 check('exact decimal geometry retained beyond IEEE numeric integer precision',()=>{
  const a=row('A');a.candle.numeric_lexemes={open:'100000000000000000000.10',high:'100000000000000000000.20',low:'100000000000000000000.00',close:'100000000000000000000.15',volume:'1000'};const valid=after([a]);assert.equal(group(valid).distinct_bound_candles_across_roles,1);assert.equal(valid.facts[0].numeric_variants[0].values.close,'100000000000000000000.15');a.candle.numeric_lexemes.high='100000000000000000000.10';const invalid=after([a]);assert.equal(group(invalid).distinct_bound_candles_across_roles,0);assert.equal(group(invalid).roles[0].ineligible_reasons.EXACT_DECIMAL_OHLC_GEOMETRY_INVALID,1);assert.equal(group(invalid).total_HTTP,1);return {valid,invalid};
 });
 check('HTTP count accumulation exact and unsafe numeric ratio withheld',()=>{
  const a=row('A',{acquisition:cost('A','MEASURED',Number.MAX_SAFE_INTEGER)}),b=row('B',{acquisition:cost('B','MEASURED',Number.MAX_SAFE_INTEGER)}),next=after([a,b]),g=group(next);assert.equal(g.known_HTTP_lower_bound_decimal,'18014398509481982');assert.equal(g.known_HTTP_number_safe,false);assert.equal(g.total_HTTP,null);assert.equal(g.distinct_candles_per_HTTP,null);return {candidate:next};
 });
 assert.equal(controls.length,17);
 return{schema:'ANOMALY_SOURCE_UTILITY_CONNECTED_CONTROLLED_RESULT_V1',status:'CONTROLLED_COMPONENT_COMPLETED',controls,control_count:controls.length,witnesses,fixture_provenance:'ALL_DATA_GENERATED_CONTROLLED_NOT_RETAINED_MARKET_RESULTS',protocol_sha256:sha(protocol),current_sourceUtility_unchanged:true,actual_provider_or_source_cost_qualified:false,actual_native_identity_or_commit_ACK:false,main_weights_changed:false,provider_HTTP:0,local_SQL:0,native_SQL:0,MAIN:0,Telegram:0,prior_accepted_case_replayed:false,activation_allowed:false};
}
