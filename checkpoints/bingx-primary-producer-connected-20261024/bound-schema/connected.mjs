import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const sha=b=>createHash('sha256').update(b).digest('hex');
const PREFIX='checkpoints/bingx-primary-producer-connected-20261024/bound-schema';
// AUTHOR: ONE NEW group /12 named variants PREPARED_UNEXECUTED; no old18 replay.
// Every body, identity, numeric value and clock below is explicitly CONTROLLED.
export async function runBingxNativeSchemaDeltaConnected(args={}){
 const result={schema:'CONTROLLED_BINGX_NATIVE_SCHEMA_DELTA_CONNECTED_V1',author_status:'PREPARED_UNEXECUTED',status:'STARTED',fixture_kind:'CONTROLLED_NOT_NATIVE_ORIGINAL',groups:[],invocation_frames:[],native_original_bodies_read:0,provider_HTTP:0,SQL:0,Cloudflare:0,MAIN:0,Telegram:0,native_admission:false};
 const originalFetch=globalThis.fetch;let temp=null;
 const returned=(name,fn)=>{try{const value=fn();result.invocation_frames.push({name,returned:structuredClone(value)});if(typeof args.save_result==='function')args.save_result({name,result:structuredClone(result)});return value;}catch(error){result.invocation_frames.push({name,threw:{name:error.name,message:String(error.message)}});if(typeof args.save_result==='function')args.save_result({name,result:structuredClone(result)});throw error;}};
 try{
  const {repo_root,baseline_repo_root}=args??{};
  assert.equal(typeof repo_root,'string');assert.equal(typeof baseline_repo_root,'string');
  const packet=path.join(repo_root,PREFIX),manifest=JSON.parse(await fs.readFile(path.join(packet,'manifest.json'),'utf8'));
  for(const pin of manifest.payloads){assert.equal(typeof pin.path,'string');assert(!pin.path.startsWith('/')&&!pin.path.split('/').includes('..'));const b=await fs.readFile(path.join(packet,pin.path));assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
  const pins=JSON.parse(await fs.readFile(path.join(packet,'input-pins.json'),'utf8'));
  const prior=await fs.readFile(path.join(baseline_repo_root,pins.baseline.path));assert.equal(prior.length,pins.baseline.bytes);assert.equal(sha(prior),pins.baseline.sha256);
  const target=path.join(repo_root,pins.candidate.path),candidate=await fs.readFile(target);assert.equal(candidate.length,pins.candidate.bytes);assert.equal(sha(candidate),pins.candidate.sha256);
  const edits=JSON.parse(await fs.readFile(path.join(packet,'literal-patch.json'),'utf8')).edits;
  let forward=prior.toString('utf8');for(const e of edits){assert.equal(forward.split(e.before).length,2);forward=forward.replace(e.before,e.after);}assert.equal(forward,candidate.toString('utf8'));
  let inverse=forward;for(const e of edits.slice().reverse()){assert.equal(inverse.split(e.after).length,2);inverse=inverse.replace(e.after,e.before);}assert.equal(inverse,prior.toString('utf8'));
  const binding=JSON.parse(await fs.readFile(path.join(packet,'protected-binding.json'),'utf8'));
  assert.equal(binding.spent_head,'7b1aed584a0b06d42f40617e45298dfea7d928d2');assert.equal(binding.state,'SPENT_NON_REFUNDABLE_BEFORE_IO');assert.equal(binding.maximum_provider_attempts,7);assert.equal(binding.permanent_native_provider_grant,false);assert.equal(binding.authorization_fresh_for_new_io,false);
  assert.equal(binding.approval_reply_sha256,'8096cb0b2120e655a7daf97a06a4cf6735804469dbb55a47fffa0c9bdab52406');assert.equal(binding.code_sha256,'ea16c352f2707ca107ae0a810ff85051fd24c0d65295b6302e088e5b90066993');assert.equal(binding.plan_sha256,'1450a4c7756aceb1528acd48a62377565b8a986352302720d64d2b4100cbc43a');
  result.full_preimport_bindings={own_payloads:manifest.payloads.length,baseline_sha256:sha(prior),candidate_sha256:sha(candidate),whole_literal_forward_inverse:true,adapter_nonbuiltin_imports:0,controlled_fixtures_not_native_originals:true};
  globalThis.fetch=async()=>{throw Error('CONTROLLED_CASE_NETWORK_FORBIDDEN');};
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'report2-bingx-native-schema-delta-'));const baselineFile=path.join(temp,'baseline.mjs');await fs.writeFile(baselineFile,prior);
  const baseline=await import(pathToFileURL(baselineFile).href+'?sha='+sha(prior)),next=await import(pathToFileURL(target).href+'?sha='+sha(candidate));
  const group={name:'NEW_CAPTURED_SCHEMA_TO_PRODUCER_CARRIER_ONLY',fixture_kind:'CONTROLLED_NOT_NATIVE_ORIGINAL',completed_variants:[]};result.groups.push(group);
  const check=(name,call,verify)=>{const v=returned(name,call);verify(v);group.completed_variants.push(name);return v;};
  const refuses=(name,call,pattern)=>{let e;try{returned(name,call);}catch(error){e=error;}assert(e&&pattern.test(String(e.message)));group.completed_variants.push(name);};
  const T=1790000400000,H='c'.repeat(64);
  const receipt=(kind,symbol=null)=>({family:'USDT_M',endpoint:{catalog:'/openApi/swap/v2/quote/contracts',premium:'/openApi/swap/v2/quote/premiumIndex',oi:'/openApi/swap/v2/quote/openInterest'}[kind],http_status:200,body_complete:true,usage_state:'KNOWN',received_ts:T,payload_sha256:H,native_symbol:symbol,fixture_kind:'CONTROLLED_NOT_NATIVE_USAGE_OR_RECEIPT'});
  const rows=[{contractId:'CONTROLLED-USD-T',symbol:'SYNTH-USDT',asset:'SYNTH',currency:'USDT',status:1,size:'0.25'},{contractId:'CONTROLLED-USD-C',symbol:'SYNTH-USDC',asset:'SYNTH',currency:'USDC',status:1,size:'0.25'},{contractId:'CONTROLLED-OFF',symbol:'OFFLINE-USDT',asset:'OFFLINE',currency:'USDT',status:25,size:'0.5'}];
  const bindings=rows.map(r=>({family:'USDT_M',native_symbol:r.symbol,native_contract_id:r.contractId,base:r.asset,quote:r.currency,settle:r.currency,margin:r.currency,crypto_eligibility:'VERIFIED_CRYPTO_PERPETUAL',underlying_class:'CRYPTO_ASSET',crypto_eligibility_proof_ref:'CONTROLLED:classification',identity_revision:'CONTROLLED:new-stablecoin-revision',quantity_unit:null,contract_size_decimal:null,contract_size_unit:null,unit_proof_ref:null}));
  const catalogArgs={family:'USDT_M',body:{code:0,data:rows},receipt:receipt('catalog')};
  refuses('baseline_mixed_native_quotes_refuses_NEW_USDC_case',()=>baseline.normalizeBingxCatalog(catalogArgs),/EXACT_NATIVE_SYMBOL_REQUIRED|SETTLEMENT_FAMILY_MISMATCH/);
  check('candidate_mixed_native_quotes_and_status25_retained_unknown',()=>next.normalizeBingxCatalog(catalogArgs),v=>{assert.equal(v.identities.length,3);assert.deepEqual(v.identities.map(i=>i.catalog_row_index),[0,1,2]);assert.equal(v.identities[1].quote,'USDC');assert.equal(v.identities[1].settle,'USDC');assert.equal(v.identities[2].online,false);assert.equal(v.identities[2].native_status,25);assert(v.identities.every(i=>i.crypto_eligibility==='UNKNOWN'&&!i.eligible_for_migration));assert.equal(v.actual_crypto_contract_count,null);});
  const mapped=check('independent_CONTROLLED_USDC_binding_keeps_distinct_full_identity',()=>next.normalizeBingxCatalog({...catalogArgs,bindings}),v=>{assert.equal(v.identities[0].quote,'USDT');assert.equal(v.identities[1].quote,'USDC');assert.equal(v.identities[1].settle,'USDC');assert.equal(v.identities[1].margin,'USDC');assert.notEqual(v.identities[0].native_symbol,v.identities[1].native_symbol);assert.equal(v.identities[2].eligible_for_migration,false);assert(v.identities.every(i=>i.native_admission===false&&i.entry_allowed===false));});
  const i=mapped.identities[0],usdc=mapped.identities[1];
  refuses('native_currency_mismatch_is_not_USDC_to_USDT_conversion',()=>next.normalizeBingxCatalog({...catalogArgs,body:{code:0,data:[{...rows[1],currency:'USDT'}]}}),/NATIVE_SYMBOL_CURRENCY_MISMATCH/);
  refuses('independent_requested_USDC_identity_cannot_claim_USDT_quote',()=>next.normalizeBingxMetric({kind:'oi',body:{code:0,data:{symbol:'SYNTH-USDC',openInterest:'99',time:T-1}},receipt:receipt('oi','SYNTH-USDC'),instrument_identity:{...usdc,quote:'USDT'}}),/NATIVE_QUOTE_SETTLEMENT_IDENTITY_MISMATCH/);
  check('positive_native_size_is_not_a_contract_multiplier',()=>next.normalizeBingxCatalog({...catalogArgs,bindings}),v=>{assert.equal(v.identities[0].native_size_raw,'0.25');assert.equal(v.identities[0].contract_size_decimal,null);assert.equal(v.identities[0].contract_size_unit,null);assert.equal(v.identities[0].quantity_unit,null);});
  const premiumArgs={kind:'premium',instrument_identity:i,receipt:receipt('premium','SYNTH-USDT'),body:{code:0,data:{symbol:'SYNTH-USDT',markPrice:'100',indexPrice:'99',lastFundingRate:'0.0002',nextFundingTime:T+8*3600000,fundingIntervalHours:8,updateTime:T-80*60000}}};
  check('baseline_explicit_native_hours_is_ignored_NEW_period_case',()=>baseline.normalizeBingxMetric(premiumArgs),v=>assert.equal(v.funding_period_ms,null));
  const premium=check('explicit_hours_period_has_separate_stale_metadata_clock',()=>next.normalizeBingxMetric(premiumArgs),v=>{assert.equal(v.funding_period_ms,28800000);assert.equal(v.funding_period_origin,'NATIVE_EXPLICIT_FUNDING_INTERVAL_HOURS');assert.equal(v.funding_update_time,T-80*60000);assert.equal(v.source_ts,null);assert.equal(v.mark_price_source_ts,null);assert.equal(v.index_price_source_ts,null);assert.equal(v.funding_rate_source_ts,null);assert.equal(v.provenance.source_ts,null);});
  const noHours=structuredClone(premiumArgs);delete noHours.body.data.fundingIntervalHours;
  check('missing_hours_stays_NULL_without_default_or_event_gap',()=>next.normalizeBingxMetric(noHours),v=>{assert.equal(v.funding_period_ms,null);assert.equal(v.funding_period_origin,null);});
  const stringHours=structuredClone(premiumArgs);stringHours.body.data.fundingIntervalHours='8';
  check('unqualified_string_hours_does_not_become_numeric_period',()=>next.normalizeBingxMetric(stringHours),v=>assert.equal(v.funding_period_ms,null));
  const future=structuredClone(premiumArgs);future.body.data.updateTime=T+1;
  refuses('future_native_metadata_clock_refuses_period_carrier',()=>next.normalizeBingxMetric(future),/FUTURE_FUNDING_METADATA_CLOCK/);
  const oi=returned('new_actual_string_OI_shape_known_clock_unit_still_NULL',()=>next.normalizeBingxMetric({kind:'oi',instrument_identity:i,receipt:receipt('oi','SYNTH-USDT'),body:{code:0,data:{symbol:'SYNTH-USDT',openInterest:'99.5',time:T-10}}}));
  check('actual_assembler_propagates_period_without_priceclock_or_units_grant',()=>next.assembleBingxFuturesObservation({instrument_identity:i,premium,oi}),v=>{assert.equal(v.data.venue,'BINGX');assert.equal(v.data.funding.period_ms,28800000);assert.equal(v.data.funding.period_origin,'NATIVE_EXPLICIT_FUNDING_INTERVAL_HOURS');assert.equal(v.data.funding.source_ts,null);assert.equal(v.data.funding.native_update_time,T-80*60000);assert.equal(v.data.mark_price_source_ts,null);assert.equal(v.data.open_interest.native_value_decimal,'99.5');assert.equal(v.data.open_interest.unit,null);assert.equal(v.data.open_interest.contracts,null);assert.equal(v.data.entry_allowed,false);assert.equal(v.data.native_admission,false);});
  assert.equal(group.completed_variants.length,12);result.status='CONTROLLED_NEW_NATIVE_SCHEMA_DELTA_COMPLETE';result.actual_completed_groups=1;result.actual_completed_variants=group.completed_variants.length;return result;
 }catch(error){result.status='CONTROLLED_NEW_NATIVE_SCHEMA_DELTA_FAILED';error.partial_result=result;throw error;}
 finally{try{if(temp!==null)await fs.rm(temp,{recursive:true,force:true});}catch(error){result.status='CONTROLLED_NEW_NATIVE_SCHEMA_DELTA_CLEANUP_FAILED';error.partial_result=result;throw error;}finally{globalThis.fetch=originalFetch;}}
}
