import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const oldHead='c6d2bf850fcf673fc7c43fd1a1c98f79fbf34094',oldPrefix='anomaly-research/saved-candle-typed-input-20261019/';
const oldSHA='d9893148e7976973e81be150cc54b0b85397c70da12ce020e4e9c36961fd80f3';
const raw=(h,p)=>execFileSync('git',['show',`${h}:${p}`],{cwd:root,maxBuffer:2_000_000});
const sha=b=>createHash('sha256').update(b).digest('hex');
const clone=structuredClone,encode=x=>Buffer.from(JSON.stringify(x));
const mode=process.env.REPORT2_MARKET_BINDING_IMPL||'corrected';
assert(['baseline','corrected'].includes(mode));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'report2-market-binding-'));
const baseline=raw(oldHead,oldPrefix+'typed-input.mjs');assert.equal(sha(baseline),oldSHA);
const implPath=mode==='baseline'?path.join(tmp,'baseline.mjs'):path.join(here,'typed-input.corrected.mjs');
if(mode==='baseline')fs.writeFileSync(implPath,baseline);
const {verifyReadJson,buildResearchInput}=await import(pathToFileURL(implPath));
const implSHA=sha(fs.readFileSync(implPath));

test('ONE NEW saved-input market/asset/source-role binding case rejects label swaps before typed quantity selection',()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('NO_PROVIDER_IO');};
 const fixtures=JSON.parse(raw(oldHead,oldPrefix+'sample-inputs.json'));
 const original=JSON.stringify(fixtures),positive=[],mutations=[],violations=[];
 const policy={};
 const ref=id=>`anomaly-research/saved-candle-market-binding-20261019/${mode}-witness.json#${id}`;
 const signed=receipt=>({receipt,receipt_sha256:sha(JSON.stringify(receipt))});
 try{
  for(const [key,spec] of Object.entries({BTC:fixtures.source536,HTX:fixtures.source533_units}))policy[key]=verifyReadJson({body:raw(spec.head,spec.path),expected_sha256:spec.sha256,raw_ref:`${spec.head}:${spec.path}`,scope:'DOCUMENTARY_JSON_LOCAL_READ',receipt_ref:ref(key)});
  const argsBy={};
  for(const sample of fixtures.inputs){
   const btc=sample.kind==='BTC_RESEARCH_CARD_EXCERPT';let input;
   if(btc){const body=encode(sample.current);input=verifyReadJson({body,expected_sha256:sha(body),raw_ref:`${sample.parent.head}:${sample.parent.path}#${sample.current.event_id}`,scope:'BTC_DERIVED_RESEARCH_SAMPLE_LOCAL_READ',receipt_ref:ref(sample.id)});}
   else{const z=fs.readFileSync(path.join(root,sample.raw_source.path));assert.equal(sha(z),sample.raw_source.gzip_sha256);input=verifyReadJson({body:gunzipSync(z),expected_sha256:sample.raw_source.body_sha256,raw_ref:sample.raw_source.path+'#uncompressed',scope:'HTX_ORIGINAL_JSON_BODY_LOCAL_READ',receipt_ref:ref(sample.id)});}
   const p=policy[btc?'BTC':'HTX'];const args={sample,input_marker:input.marker,input_value:input.value,policy_marker:p.marker,policy:p.value,policy_sha256:btc?fixtures.source536.sha256:fixtures.source533_units.sha256};
   const view=buildResearchInput(args);argsBy[sample.id]=args;
   assert.equal(view.identity.declared_market,sample.market);assert.equal(view.identity.declared_contract,sample.contract);
   assert.equal(view.quantity.concrete_unit,sample.market==='usd_m_futures'?null:'USDT');
   assert.equal(view.identity.identity_verified,false);assert.equal(view.identity.native_contract_size,null);assert.equal(view.admission.observer_detectClosed,false);assert.equal(view.admission.memory_admitted,false);assert.equal(view.admission.watch_scheduled,false);
   positive.push({sample_id:sample.id,market:sample.market,contract:sample.contract,unit:view.quantity.concrete_unit,identity_verified:view.identity.identity_verified,native_contract_size:view.identity.native_contract_size,admission:view.admission});
  }
  const reject=(name,key,mutate)=>{
   const args=clone(argsBy[key]);mutate(args);let rejected=false,reason=null,view=null;
   try{view=buildResearchInput(args);}catch(e){rejected=true;reason=e.message;}
   const result={name,input_sample:key,CONTROLLED_MUTATION:true,rejected,reason,accepted_identity:view?.identity??null,accepted_quantity:view?.quantity??null};mutations.push(result);if(!rejected)violations.push(result);
  };
  reject('futures outer market becomes spot without changing bound input','BTC_usd_m_futures',a=>{a.sample.market='spot';});
  reject('spot outer market becomes futures without changing bound input','BTC_spot',a=>{a.sample.market='usd_m_futures';});
  reject('futures outer contract becomes foreign ETHUSDT','BTC_usd_m_futures',a=>{a.sample.contract='ETHUSDT';});
  reject('spot outer contract becomes foreign ETHUSDT','BTC_spot',a=>{a.sample.contract='ETHUSDT';});
  reject('foreign outer symbol alias cannot disagree with bound symbol','BTC_usd_m_futures',a=>{a.sample.symbol='ETHUSDT';});
  reject('foreign CSV filename cannot relabel a BTC source','BTC_spot',a=>{a.sample.raw_source.csv_member='ETHUSDT-1m-2026-06.csv';});
  reject('foreign market archive component cannot change source role','BTC_usd_m_futures',a=>{a.sample.raw_source.zip_member='binance-monthly/spot/2026-06/original.zip';});
  reject('even self-consistent foreign parsed symbol has no BTC policy binding','BTC_spot',a=>{
   a.sample.current.symbol='ETHUSDT';a.sample.contract='ETHUSDT';a.input_value=clone(a.sample.current);
   a.input_marker.receipt.body_sha256=sha(JSON.stringify(a.sample.current));a.input_marker.receipt.parsed_value_sha256=sha(JSON.stringify(a.input_value));a.input_marker=signed(a.input_marker.receipt);
  });
  reject('native HTX futures body cannot be relabelled SPOT','HTX_AAVE',a=>{a.sample.market='SPOT';});
  reject('native HTX body cannot be relabelled Binance spot role','HTX_AAVE',a=>{a.sample.market='spot';});
  reject('native HTX body cannot be relabelled Binance futures role','HTX_AAVE',a=>{a.sample.market='usd_m_futures';});
  reject('HTX native4hour body cannot acquire15m label','HTX_AAVE',a=>{a.sample.current.timeframe='15m';});
  reject('HTX different contract remains bound to native body channel','HTX_AAVE',a=>{a.sample.contract='BTC-USDT';});
  reject('HTX raw ref foreign contract cannot replace native origin','HTX_AAVE',a=>{a.sample.raw_source.path='checkpoints/htx-compact-4h/BTC-USDT.raw.json.gz';a.input_marker.receipt.raw_ref=a.sample.raw_source.path+'#uncompressed';a.input_marker=signed(a.input_marker.receipt);});
  assert.equal(JSON.stringify(fixtures),original);
  const witness={schema:'SAVED_CANDLE_NEW_MARKET_ASSET_BINDING_WITNESS_V1',mode,baseline_head:oldHead,baseline_sha256:oldSHA,implementation_sha256:implSHA,source_samples_sha256:sha(raw(oldHead,oldPrefix+'sample-inputs.json')),positive,mutations,violation_count:violations.length,violations,old541_case_rerun:0,old_purefeatures_calls:0,old1556_orCSV_or37_or_source31_18_52_450455_rerun:0,provider_HTTP:0,native_SQL:0,production_imports:0,observer_detectClosed_calls:0,new_epoch_or_nativegrant:false,scope:'This is one new label-binding case; actual saved inputs reused, mutations controlled. No production harm or new source agreement asserted.'};
  fs.writeFileSync(path.join(here,mode+'-witness.json'),JSON.stringify(witness,null,2)+'\n');
  assert.equal(violations.length,0,JSON.stringify(violations.map(v=>({name:v.name,unit:v.accepted_quantity?.concrete_unit,identity:v.accepted_identity}))));
 }finally{globalThis.fetch=originalFetch;fs.rmSync(tmp,{recursive:true,force:true});}
});
