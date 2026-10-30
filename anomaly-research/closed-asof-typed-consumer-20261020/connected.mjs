import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const clone=structuredClone,D=14400000,START=Math.floor(1792000000000/D)*D,END=START+21*D,KNOWN=END+7*86400000;
const bytes=x=>Buffer.from(JSON.stringify(x));
const POLICY_HTX='036cd7bfb73a40bbce312dfd951271ded3ca6f660126e8eaaa290db0f0e22f69';

// One new CONTROLLED affected consumer case. No top-level invocation/tests.
export async function runClosedAsofTypedConsumerConnected({repo_root,baseline_repo_root}={}){
 assert.ok(repo_root&&baseline_repo_root,'two complete repository roots required');
 assert.notEqual(fs.realpathSync(repo_root),fs.realpathSync(baseline_repo_root));
 const own=path.join(repo_root,'anomaly-research/closed-asof-typed-consumer-20261020');
 const p=JSON.parse(fs.readFileSync(path.join(own,'proposal-target.json'),'utf8'));
 const candidateBytes=fs.readFileSync(path.join(repo_root,p.target)),baselineBytes=fs.readFileSync(path.join(baseline_repo_root,p.target));
 assert.equal(candidateBytes.length,p.after.bytes);assert.equal(sha(candidateBytes),p.after.sha256);
 assert.equal(baselineBytes.length,p.before.bytes);assert.equal(sha(baselineBytes),p.before.sha256);
 const featureBytes=fs.readFileSync(path.join(repo_root,p.features_module.path));assert.equal(sha(featureBytes),p.features_module.sha256);
 assert.equal(sha(fs.readFileSync(path.join(baseline_repo_root,p.features_module.path))),p.features_module.sha256);
 const policyBytes=fs.readFileSync(path.join(repo_root,p.policy.path));assert.equal(sha(policyBytes),POLICY_HTX);
 const btcPolicyBytes=fs.readFileSync(path.join(repo_root,p.BTC_policy.path));assert.equal(sha(btcPolicyBytes),p.BTC_policy.sha256);assert.equal(p.BTC_policy.sha256,'f88a75c3dd62ff406a6703690ec6faa0e236e27388de9e9e9da6c38747bdb832');
 const beforeFetch=globalThis.fetch,beforeNow=Date.now;let unexpectedHTTP=0;
 globalThis.fetch=async()=>{unexpectedHTTP++;throw Error('NETWORK_FORBIDDEN');};Date.now=()=>KNOWN;
 try{
  const baseline=await import(pathToFileURL(path.join(baseline_repo_root,p.target)).href);
  const candidate=await import(pathToFileURL(path.join(repo_root,p.target)).href);
  const {features}=await import(pathToFileURL(path.join(repo_root,p.features_module.path)).href);
  const groups=[];
  const bar=i=>({source_row_index:i,start_ts:START+i*D,end_ts:START+(i+1)*D,open:'100',high:i===20?'103':'101',low:i===20?'97':'99',close:'100',raw_quote_turnover_lexeme:i===20?'100':'10',raw_column7_sum:i===20?'100':'10'});
  function htx({source_asof=END,mutate=null}={}){
   const all=Array.from({length:21},(_,i)=>bar(i));if(mutate)mutate(all);
   const body={status:'ok',ch:'market.CONTROL-USDT.kline.4hour',ts:source_asof,data:all.map(b=>({id:b.start_ts/1000,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),trade_turnover:Number(b.raw_quote_turnover_lexeme)}))};
   const raw=bytes(body),sample={id:'CONTROLLED_HTX_CLOSED_ASOF',kind:'HTX_RETAINED_NATIVE_JSON',contract:'CONTROL-USDT',market:'FUTURES',original_source_ts:source_asof,original_recorded_receipt_ts:END+2,original_provider_body_completion_ts:null,raw_source:{path:'checkpoints/htx-compact-4h/CONTROL-USDT.raw.json.gz',body_sha256:sha(raw)},current:{timeframe:'4h',background:all.slice(0,20),candle:all[20]}};
   return{sample,raw,policyBytes,policyHash:POLICY_HTX};
  }
  function btcBadGeometry(){
   const all=Array.from({length:21},(_,i)=>bar(i));all[20].high='99';
   const current={event_id:'CONTROLLED_BTC_GEOMETRY',market:'spot',symbol:'BTCUSDT',timeframe:'4h',first_known_ts:END+1,candle:{...all[20],source_ranges:[{source_id:'spot:2026-10'}]},background:all.slice(0,20)};
   const sample={id:'CONTROLLED_DERIVED_BTC_GEOMETRY',kind:'BTC_RESEARCH_CARD_EXCERPT',contract:'BTCUSDT',market:'spot',original_source_ts:null,original_recorded_receipt_ts:END+2,original_provider_body_completion_ts:null,original_immutable_card_first_known_ts:END+1,parent:{head:'CONTROLLED_NOT_NATIVE',path:'CONTROLLED_NOT_RETAINED'},raw_source:{csv_member:'BTCUSDT-1m-2026-10.csv',zip_member:'binance-monthly/spot/2026-10/original.zip'},current};
   return{sample,raw:bytes(current),policyBytes:btcPolicyBytes,policyHash:sha(btcPolicyBytes)};
  }
  function args(mod,fixture){
   const {sample,raw}=fixture,isHtx=sample.kind==='HTX_RETAINED_NATIVE_JSON';
   const input=mod.verifyReadJson({body:raw,expected_sha256:sha(raw),raw_ref:isHtx?sample.raw_source.path+'#uncompressed':`${sample.parent.head}:${sample.parent.path}#${sample.current.event_id}`,scope:isHtx?'HTX_ORIGINAL_JSON_BODY_LOCAL_READ':'BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ',receipt_ref:'CONTROLLED_LOCAL_COMPLETE_READ_NOT_NATIVE'});
   const policy=mod.verifyReadJson({body:fixture.policyBytes,expected_sha256:fixture.policyHash,raw_ref:'CONTROLLED_PINNED_POLICY_READ',scope:'DOCUMENTARY_JSON_LOCAL_READ',receipt_ref:'CONTROLLED_POLICY'});
   return{sample:clone(sample),input_marker:input.marker,input_value:input.value,policy_marker:policy.marker,policy:policy.value,policy_sha256:fixture.policyHash};
  }
  function view(mod,fixture){return mod.buildResearchInput(args(mod,fixture));}
  function refused(fixture,reason){
   const old=view(baseline,fixture);assert.equal(old.status,'PURE_FEATURES_ONLY_CARD_MEMORY_WATCH_BLOCKED');
   assert.throws(()=>view(candidate,fixture),reason);return{old_accepts:true,new_refuses:true,old_event_end_ts:old.candle.end_ts,original_source_ts:fixture.sample.original_source_ts};
  }
  const good=htx(),old=view(baseline,good),next=view(candidate,good);
  assert.deepEqual(next,old);assert.deepEqual(features(next.candle,next.prior),features(old.candle,old.prior));
  assert.equal(next.candle.end_ts,next.clocks.source_ts);assert.equal(next.clocks.original_provider_body_completion_ts,null);assert.equal(next.admission.event_card_created,false);assert.equal(next.identity.native_instrument_epoch_verified,false);
  groups.push({id:'SOURCE_ASOF_EDGE_PRESERVES_VIEW_AND_FEATURES',classification:'CONTROLLED',source_ts:next.clocks.source_ts,local_known_by_ts:next.clocks.usable_research_known_by_ts,prior_count:next.prior.length,identity_card_watch_still_blocked:true});
  groups.push({id:'TARGET_OPEN_AT_ORIGINAL_SOURCE_ASOF',classification:'CONTROLLED',...refused(htx({source_asof:END-1}),/HTX_SELECTED_BAR_NOT_CLOSED_AT_SOURCE_ASOF/)});
  groups.push({id:'SELECTED_PRIOR_OPEN_AT_ORIGINAL_SOURCE_ASOF',classification:'CONTROLLED',...refused(htx({source_asof:END-D-1}),/HTX_SELECTED_BAR_NOT_CLOSED_AT_SOURCE_ASOF/)});
  groups.push({id:'MISSING_ORIGINAL_HTX_ASOF_NOT_LOCAL_KNOWLEDGE',classification:'CONTROLLED',...refused(htx({source_asof:null}),/HTX_ORIGINAL_SOURCE_ASOF_REQUIRED/)});
  const malformed=[];
  for(const [label,index,key,value] of [['target-high',20,'high','99'],['target-low',20,'low','101'],['prior-high',7,'high','99'],['prior-low',8,'low','101']]){
   const f=htx({mutate:all=>{all[index][key]=value;}});malformed.push({label,...refused(f,/SAVED_OHLC_GEOMETRY_INVALID/)});
  }
  const btc=btcBadGeometry();malformed.push({label:'derived-BTC-positive-high-below-open',...refused(btc,/SAVED_OHLC_GEOMETRY_INVALID/)});
  groups.push({id:'POSITIVE_OHLC_SHAPE_CANNOT_REACH_FEATURES',classification:'CONTROLLED',variants:malformed});
  const zero=htx({mutate:all=>{all[20].raw_quote_turnover_lexeme='0';all[20].raw_column7_sum='0';}}),zeroOld=view(baseline,zero),zeroNext=view(candidate,zero);
  assert.deepEqual(zeroNext,zeroOld);assert.equal(zeroNext.candle.volume,0);assert.equal(zeroNext.candle.preserved_quote_lexeme,'0');assert.equal(features(zeroNext.candle,zeroNext.prior).volume_ratio,0);
  groups.push({id:'OBSERVED_ZERO_IS_PRESERVED',classification:'CONTROLLED',volume:0,volume_ratio:0,missing_not_coerced:true});
  const future=htx({source_asof:KNOWN+1});assert.throws(()=>view(baseline,future),/VERIFIED_KNOWLEDGE_CLOCK_OR_POLICY_REQUIRED/);assert.throws(()=>view(candidate,future),/VERIFIED_KNOWLEDGE_CLOCK_OR_POLICY_REQUIRED/);
  groups.push({id:'EXISTING_FUTURE_SOURCE_CLOCK_REFUSAL_UNCHANGED',classification:'CONTROLLED',both_refused:true});
  assert.equal(unexpectedHTTP,0);
  return{schema:'CLOSED_SOURCE_ASOF_TYPED_CONSUMER_CONNECTED_V1',new_affected_cases:1,assertion_groups:groups.length,classification:'CONTROLLED_ONLY_NOT_PROVIDER_ORIGINAL',groups,targets:{before_sha256:p.before.sha256,after_sha256:p.after.sha256},policy_sha256:POLICY_HTX,features_sha256:p.features_module.sha256,old_real_sample_replays:0,raw_originals_read:0,old37_or_3274_or_13096_recomputed:0,SQL:0,provider_HTTP:0,unexpected_HTTP:unexpectedHTTP,native_ingress:false,event_first_known:false,event_memory:false,watch:false,native_commit_ACK:false,admission:false,MAIN:0,Telegram:0,limits:['CONTROLLED raw_ref is an in-memory declaration, not a stored provider receipt.','Closed as-of validates saved research inputs only; native epoch/first detection/domain ACK remain unqualified.','Old REAL three-sample qualification and accepted studies are not rerun.']};
 }finally{Date.now=beforeNow;globalThis.fetch=beforeFetch;}
}
