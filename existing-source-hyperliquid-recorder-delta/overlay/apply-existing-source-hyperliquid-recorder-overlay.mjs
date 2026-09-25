import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));const runtime=path.resolve(process.argv[2]||'runtime');const src=path.join(runtime,'src');
const worker=path.join(src,'worker.js'),consumer=path.join(src,'existing-source-consumer.mjs'),registry=path.join(src,'source-registry.mjs'),moduleTarget=path.join(src,'hyperliquid-recorder-extension.mjs'),moduleSource=path.join(here,'src/hyperliquid-recorder-extension.mjs');
const BEFORE_WORKER='989a7eb84acb040d38331b49adc36bc89cb0f25cb776f5bba6099e91370b50c6';
const BEFORE_CONSUMER='9cbe83d16900954380b4330dc9483aaa7b27cd368ff176462db9e0b8201692b5';
const BEFORE_REGISTRY='c144350e7ef8fa5a57ab582070ff65909174af71f7adf61f3475de0bbf55fa16';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const p of [worker,consumer,registry,moduleSource])if(!fs.existsSync(p))throw new Error(`R075_REQUIRED_FILE_MISSING:${p}`);

const IMPORT_OLD=`import {
  fetchByKaranteliSmartMoneyRaw,
  smartMoneyRawEvidenceRows,
} from "./tz101-smart-money-evidence.mjs";`;
const IMPORT_NEW=`import {
  fetchByKaranteliSmartMoneyRaw,
  smartMoneyRawEvidenceRows,
} from "./tz101-smart-money-evidence.mjs";

import {
  fetchExistingSmartMoneyRecorderRaw,
  hyperliquidRegistryReceipt,
  hyperliquidAdvisoryEvidenceRows,
} from "./hyperliquid-recorder-extension.mjs";`;
const SMART_OLD=`  let smartMoneyRaw;
  try {
    smartMoneyRaw = await fetchByKaranteliSmartMoneyRaw({
      fetch_impl: fetch,
      contract_code: contract,
      api_key: env?.BYKARANTELI_API_KEY || "",
      observed_ts: now,
    });
  } catch (error) {
    smartMoneyRaw = {
      version: "tz101-smart-money-raw-r8",
      status: "NOT_CLOSED",
      reason: "SOURCE_FETCH_ERROR",
      score_eligible: false,
      directional_vote_eligible: false,
      calibration_required: true,
      external_fetches: 1,
      error: String(error?.message || error).slice(0, 300),
    };
  }`;
const SMART_NEW=`  let smartMoneyRaw;
  try {
    smartMoneyRaw = await fetchExistingSmartMoneyRecorderRaw({
      fetch_impl: fetch,
      bykaranteli_fetcher: fetchByKaranteliSmartMoneyRaw,
      contract_code: contract,
      bykaranteli_api_key: env?.BYKARANTELI_API_KEY || "",
      hyperliquid_sample_address: env?.REPORT2_HYPERLIQUID_SAMPLE_ADDRESS || "",
      observed_ts: now,
    });
  } catch (error) {
    smartMoneyRaw = {
      version: "tz101-smart-money-raw-r8+hyperliquid-existing-recorder-v1",
      status: "NOT_CLOSED",
      reason: "SOURCE_FETCH_ERROR",
      score_eligible: false,
      directional_vote_eligible: false,
      calibration_required: true,
      external_fetches: 1,
      hyperliquid_context: null,
      recorder_extension: {
        mode: "FAIL_CLOSED",
        second_recorder_added: false,
        smart_money_external_requests_each: 1,
        hot_cycle_external_request_delta: 0,
      },
      error: String(error?.message || error).slice(0, 300),
    };
  }`;
const ADVISORY_OLD=`      ...smartMoneyRawEvidenceRows(smartMoneyRaw, now),
    ];`;
const ADVISORY_NEW=`      ...smartMoneyRawEvidenceRows(smartMoneyRaw, now),
      ...hyperliquidAdvisoryEvidenceRows(
        smartMoneyRaw?.hyperliquid_context,
        { contract_code: contract }
      ),
    ];`;
const SUMMARY_OLD=`    buildFreeSourceRuntimeSummary({
      public_evidence: publicEvidence,
      smart_money_raw: smartMoneyRaw,
      publication_shadow: finalDecisionPublicationShadow,
    });`;
const SUMMARY_NEW=`    buildFreeSourceRuntimeSummary({
      public_evidence: publicEvidence,
      smart_money_raw: smartMoneyRaw,
      publication_shadow: finalDecisionPublicationShadow,
      extra_receipts: [
        hyperliquidRegistryReceipt(
          smartMoneyRaw?.hyperliquid_context
        ),
      ].filter(Boolean),
      now,
    });`;
const CANON_OLD=`      free_source_summary:
        freeSourceRuntimeSummary,
      smart_money_raw:
        smartMoneyRaw,
    });`;
const CANON_NEW=`      free_source_summary:
        freeSourceRuntimeSummary,
      smart_money_raw:
        smartMoneyRaw,
      existing_source_receipts:
        smartMoneyRaw?.hyperliquid_context
          ? { hyperliquid: smartMoneyRaw.hyperliquid_context }
          : null,
    });`;

const CONSUMER_VERSION_OLD="export const EXISTING_SOURCE_CONSUMER_VERSION='existing-source-consumer-v3-history-sequence-20260925';";
const CONSUMER_VERSION_NEW="export const EXISTING_SOURCE_CONSUMER_VERSION='existing-source-consumer-v4-hyperliquid-recorder-20260925';";
const HYPER_OLD=`  if(closed(hyperliquid)){
    const fs=[];
    if(finite(hyperliquid?.funding_rate)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Ставка финансирования Hyperliquid',finite(hyperliquid.funding_rate),'доля',{coin:hyperliquid.coin,known_addresses_are_sample_only:true,not_global_liquidation_map:true}));
    if(finite(hyperliquid?.open_interest_usd)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Открытый интерес Hyperliquid',finite(hyperliquid.open_interest_usd),'USD',{coin:hyperliquid.coin,usd_change_may_include_price_effect:true,known_addresses_are_sample_only:true,not_global_liquidation_map:true}));
    if(finite(hyperliquid?.spread_pct)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Спред Hyperliquid',finite(hyperliquid.spread_pct),'%',{coin:hyperliquid.coin}));
    if(fs.length){blocks.hyperliquid_context={status:'CLOSED',facts:fs};facts.push(...fs);}
  }`;
const HYPER_NEW=`  if(closed(hyperliquid)){
    const fs=[];
    if(finite(hyperliquid?.funding_rate)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Ставка финансирования Hyperliquid',finite(hyperliquid.funding_rate),'доля',{coin:hyperliquid.coin,known_addresses_are_sample_only:true,not_global_liquidation_map:true,recorder_method:hyperliquid.method||null}));
    if(finite(hyperliquid?.open_interest_usd)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Открытый интерес Hyperliquid',finite(hyperliquid.open_interest_usd),'USD',{coin:hyperliquid.coin,usd_change_may_include_price_effect:true,known_addresses_are_sample_only:true,not_global_liquidation_map:true,recorder_method:hyperliquid.method||null}));
    if(finite(hyperliquid?.spread_pct)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Спред Hyperliquid',finite(hyperliquid.spread_pct),'%',{coin:hyperliquid.coin,known_addresses_are_sample_only:true,not_global_liquidation_map:true,recorder_method:hyperliquid.method||null}));
    if(finite(hyperliquid?.current_position?.szi)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Позиция выборочного адреса Hyperliquid',finite(hyperliquid.current_position.szi),'base',{coin:hyperliquid.coin,address_role:hyperliquid.address_role||null,known_addresses_are_sample_only:true,not_global_liquidation_map:true,absence_is_negative:false,global_position_inference:false,position_change:hyperliquid.position_change||null}));
    if(hyperliquid?.position_change&&finite(hyperliquid.position_change?.delta)!==null)fs.push(fact('Hyperliquid','HYPERLIQUID_CONTEXT','Изменение позиции выборочного адреса Hyperliquid',finite(hyperliquid.position_change.delta),'base',{coin:hyperliquid.coin,address_role:hyperliquid.address_role||null,position_change_status:hyperliquid.position_change.status||null,known_addresses_are_sample_only:true,not_global_liquidation_map:true,global_position_inference:false}));
    if(fs.length){blocks.hyperliquid_context={status:'CLOSED',facts:fs};facts.push(...fs);}
  }`;

const REG_VERSION_OLD="export const SOURCE_REGISTRY_VERSION='source-registry-v4-lifecycle-proof-20260925';";
const REG_VERSION_NEW="export const SOURCE_REGISTRY_VERSION='source-registry-v5-hyperliquid-recorder-20260925';";
const REG_HL_OLD="{id:'Hyperliquid',status:'PRODUCTION',scope:'EXISTING_SMART_MONEY_RECORDER_RECEIPT_REQUIRED_PER_METRIC',key_required:false,lifecycle:lifecycle('EXISTING_RECORDER_SCOPE_PLUS_CANDIDATE_NORMALIZER','COVERAGE_AND_HISTORY_AUDIT','PRODUCTION','EXISTING_RECORDER_SCOPE_ONLY','HYPERLIQUID_FACTUAL_RECEIPT','EXISTING_SMART_MONEY_PLUS_ADVISORY','SMART_MONEY_SUPPORTING','RUN_36136698025_METHODS_RUN_36138823972_RECORDER_AUDIT_PARTIAL','PRODUCTION')}";
const REG_HL_NEW="{id:'Hyperliquid',status:'PRODUCTION',scope:'EXISTING_SMART_MONEY_RECORDER_RECEIPT_REQUIRED_PER_METRIC',key_required:false,lifecycle:lifecycle('EXISTING_SMART_MONEY_RECORDER_PLUS_ROTATING_HYPERLIQUID_EXTENSION','HYPERLIQUID_RECORDER_NODE24','PRODUCTION','EXISTING_ONE_CALL_SMART_MONEY_SLOT_ROTATION','HYPERLIQUID_FACTUAL_METHOD_RECEIPT','EXISTING_SOURCE_CONSUMER','SMART_MONEY_SUPPORTING','R075_NODE24_HOT_PATH_METHOD_AND_CONSUMER_PROOF','PRODUCTION')}";

const already=fs.existsSync(moduleTarget)&&fs.readFileSync(worker,'utf8').includes('fetchExistingSmartMoneyRecorderRaw')&&fs.readFileSync(consumer,'utf8').includes('v4-hyperliquid-recorder')&&fs.readFileSync(registry,'utf8').includes('v5-hyperliquid-recorder');
if(already){
  const proof={version:'existing-source-hyperliquid-recorder-overlay-v1-20260925',status:'ALREADY_APPLIED',base_candidate_sha:'41376c8e4738d70330801f94d663aa170cd360a6',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',worker_after_sha256:sha(worker),consumer_after_sha256:sha(consumer),registry_after_sha256:sha(registry),module_sha256:sha(moduleTarget),production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,second_recorder_added:false,worker_copy_added:false,smart_money_external_requests_before:1,smart_money_external_requests_after:1,hot_cycle_external_request_delta:0,automatic_voting:false};
  fs.writeFileSync(path.join(runtime,'existing-source-hyperliquid-recorder-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('HYPERLIQUID_RECORDER_OVERLAY_APPLIED',JSON.stringify(proof));process.exit(0);
}
const actual={worker:sha(worker),consumer:sha(consumer),registry:sha(registry)};
if(actual.worker!==BEFORE_WORKER||actual.consumer!==BEFORE_CONSUMER||actual.registry!==BEFORE_REGISTRY)throw new Error(`R075_TARGET_HASH_MISMATCH:${JSON.stringify(actual)}`);

let w=fs.readFileSync(worker,'utf8'),c=fs.readFileSync(consumer,'utf8'),r=fs.readFileSync(registry,'utf8');
const checks=[['worker import',w,IMPORT_OLD],['worker smart',w,SMART_OLD],['worker advisory',w,ADVISORY_OLD],['worker summary',w,SUMMARY_OLD],['worker canonical',w,CANON_OLD],['consumer version',c,CONSUMER_VERSION_OLD],['consumer hyper',c,HYPER_OLD],['registry version',r,REG_VERSION_OLD],['registry hyper',r,REG_HL_OLD]];
for(const [label,text,old] of checks)if(!text.includes(old))throw new Error(`R075_PATCH_ANCHOR_MISSING:${label}`);
w=w.replace(IMPORT_OLD,IMPORT_NEW).replace(SMART_OLD,SMART_NEW).replace(ADVISORY_OLD,ADVISORY_NEW).replace(SUMMARY_OLD,SUMMARY_NEW).replace(CANON_OLD,CANON_NEW);
c=c.replace(CONSUMER_VERSION_OLD,CONSUMER_VERSION_NEW).replace(HYPER_OLD,HYPER_NEW);
r=r.replace(REG_VERSION_OLD,REG_VERSION_NEW).replace(REG_HL_OLD,REG_HL_NEW);

const backups=[[worker,`${worker}.r075.bak`],[consumer,`${consumer}.r075.bak`],[registry,`${registry}.r075.bak`]];
for(const [p,b] of backups)fs.copyFileSync(p,b);
try{
  fs.writeFileSync(worker,w);fs.writeFileSync(consumer,c);fs.writeFileSync(registry,r);fs.copyFileSync(moduleSource,moduleTarget);
  const workerText=fs.readFileSync(worker,'utf8');
  if(!/const SMART_MONEY_EXTERNAL_REQUESTS = 1;/.test(workerText))throw new Error('R075_SMART_MONEY_BUDGET_CHANGED');
  const proof={version:'existing-source-hyperliquid-recorder-overlay-v1-20260925',status:'APPLIED',base_candidate_sha:'41376c8e4738d70330801f94d663aa170cd360a6',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',worker_before_sha256:BEFORE_WORKER,worker_after_sha256:sha(worker),consumer_before_sha256:BEFORE_CONSUMER,consumer_after_sha256:sha(consumer),registry_before_sha256:BEFORE_REGISTRY,registry_after_sha256:sha(registry),module_sha256:sha(moduleTarget),production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,hard_gates_changed:false,strategy_weights_changed:false,thresholds_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_sources_added:false,second_recorder_added:false,worker_copy_added:false,smart_money_external_requests_before:1,smart_money_external_requests_after:1,hot_cycle_external_request_delta:0,automatic_voting:false};
  for(const [,b] of backups)fs.rmSync(b,{force:true});
  fs.writeFileSync(path.join(runtime,'existing-source-hyperliquid-recorder-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('HYPERLIQUID_RECORDER_OVERLAY_APPLIED',JSON.stringify(proof));
}catch(e){
  for(const [p,b] of backups){fs.rmSync(p,{force:true});if(fs.existsSync(b))fs.renameSync(b,p);}
  fs.rmSync(moduleTarget,{force:true});throw e;
}
