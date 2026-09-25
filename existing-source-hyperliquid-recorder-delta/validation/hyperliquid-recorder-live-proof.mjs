import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const runtime=path.resolve(process.env.REPORT2_HL_RUNTIME_DIR||'runtime');const load=n=>import(pathToFileURL(path.join(runtime,'src',n)).href);
const [{fetchExistingSmartMoneyRecorderRaw,hyperliquidRegistryReceipt},{buildFreeSourceRuntimeSummary},{buildRuntimeCanonicalBundle}]=await Promise.all([load('hyperliquid-recorder-extension.mjs'),load('source-registry.mjs'),load('canonical-runtime-adapter.mjs')]);
let calls=0;const fetchImpl=async(...args)=>{calls++;return fetch(...args);};
const now=Date.now();const methods=['metaAndAssetCtxs','fundingHistory','l2Book','clearinghouseState'];const results={};
for(const method of methods){
  results[method]=await fetchExistingSmartMoneyRecorderRaw({fetch_impl:fetchImpl,bykaranteli_fetcher:null,contract_code:'BTC-USDT',bykaranteli_api_key:'',observed_ts:now,force_method:method});
}
const secondState=await fetchExistingSmartMoneyRecorderRaw({fetch_impl:fetchImpl,bykaranteli_fetcher:null,contract_code:'BTC-USDT',bykaranteli_api_key:'',observed_ts:now+1000,force_method:'clearinghouseState'});
results.clearinghouseStateSecond=secondState;
const checks={};
for(const method of methods){
  const ctx=results[method].hyperliquid_context,receipt=hyperliquidRegistryReceipt(ctx);
  const summary=buildFreeSourceRuntimeSummary({extra_receipts:receipt?[receipt]:[],now:ctx?.observed_ts??now});
  const bundle=buildRuntimeCanonicalBundle({contract:'BTC-USDT',run_id:`HL:${method}`,snapshot_id:`HL:${method}:${now}`,observed_ts:ctx?.observed_ts??now,publication_shadow:{entry_signal:{state:'OBSERVE',direction:null,reason:'TRIGGER_NOT_CLOSED'},score_interval:{score_lower_bound:50}},free_source_summary:summary,existing_source_receipts:{hyperliquid:ctx}});
  const reg=summary.registry.entries.find(x=>x.id==='Hyperliquid');
  checks[method]={context_closed:ctx?.status==='CLOSED',registry_current:reg?.runtime_current===true,manual_ok:bundle?.manual?.ok===true,telegram_ok:bundle?.telegram?.ok===true,fingerprint_equal:bundle?.manual?.analytical_fingerprint===bundle?.telegram?.analytical_fingerprint,manual_has_hyperliquid:/Hyperliquid/i.test(bundle?.manual?.text||''),telegram_has_hyperliquid:/Hyperliquid/i.test(bundle?.telegram?.message||''),no_directional_vote:ctx?.directional_vote===false,known_addresses_sample_only:ctx?.known_addresses_are_sample_only===true,not_global_liquidation_map:ctx?.not_global_liquidation_map===true};
}
const ok=Object.values(checks).every(x=>x.context_closed&&x.registry_current&&x.manual_ok&&x.telegram_ok&&x.fingerprint_equal&&x.manual_has_hyperliquid&&x.telegram_has_hyperliquid&&x.no_directional_vote&&x.known_addresses_sample_only&&x.not_global_liquidation_map);
const output={version:'hyperliquid-recorder-live-proof-v1-20260925',status:ok?'CLOSED_OBSERVATION_ONLY':'NOT_CLOSED',calls_used:calls,max_calls:5,methods,checks,position_change_second:secondState.hyperliquid_context?.position_change??null,production_writes:false,d1_writes:false,telegram_send:false,trading:false,automatic_voting:false,hard_gates_changed:false,weights_changed:false,thresholds_changed:false,new_sources_added:false,second_recorder_added:false,hot_cycle_external_request_delta:0};
fs.writeFileSync(process.env.REPORT2_HL_PROOF_OUTPUT||'hyperliquid-recorder-live-proof.json',JSON.stringify(output,null,2)+'\n');
console.log('HYPERLIQUID_RECORDER_LIVE_PROOF',JSON.stringify({status:output.status,calls_used:calls,methods,position_change_second:output.position_change_second,checks}));
if(output.status!=='CLOSED_OBSERVATION_ONLY')process.exit(2);
