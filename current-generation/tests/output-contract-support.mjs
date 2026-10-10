import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');

export async function loadEffectivePresentationModules(){
  const target=fs.mkdtempSync(path.join(os.tmpdir(),'report2-output-contract-'));
  const copies={
    'joint-spot-futures-flow.mjs':'current-generation/files/src/joint-spot-futures-flow.mjs',
    'bitget-four-hour-flow.mjs':'current-generation/files/src/bitget-four-hour-flow.mjs',
    'evidence-source-adapters.mjs':'current-generation/files/src/evidence-source-adapters.mjs',
    'liquidation-source-acquisition-audit.mjs':'current-generation/files/src/liquidation-source-acquisition-audit.mjs',
    'htx-contract-key.mjs':'current-generation/files/src/htx-contract-key.mjs',
    'idea-basis-facts.mjs':'current-generation/files/src/idea-basis-facts.mjs',
    'telegram-plain-facts.mjs':'current-generation/files/src/telegram-plain-facts.mjs',
    'early-direction-receipt.mjs':'current-generation/files/src/early-direction-receipt.mjs',
    'market-contracts.mjs':'current-generation/files/src/market-contracts.mjs',
    'block-score-policy.mjs':'current-generation/files/src/block-score-policy.mjs',
    'evidence-v2.mjs':'current-generation/files/src/evidence-v2.mjs',
    'canonical-publication.mjs':'post-v7-consolidated/final-reconciliation/files/src/canonical-publication.mjs',
    'manual-report-formatter.mjs':'current-generation/files/src/manual-report-formatter.mjs',
    'gate-liquidation-history.mjs':'current-generation/files/src/gate-liquidation-history.mjs',
    'coinlobster-future-model.mjs':'current-generation/files/src/coinlobster-future-model.mjs',
    'provider-minute-ledger.mjs':'current-generation/files/src/provider-minute-ledger.mjs',
    'telegram-compact-formatter.mjs':'current-generation/files/src/telegram-compact-formatter.mjs',
    'canonical-display.mjs':'current-generation/files/src/canonical-display.mjs',
    'native-liquidation-guard.mjs':'current-generation/files/src/native-liquidation-guard.mjs',
    'reason-registry.mjs':'current-generation/files/src/reason-registry.mjs',
  };
  for(const [name,source] of Object.entries(copies))fs.copyFileSync(path.join(root,source),path.join(target,name));
  const [publication,manual,compact]=await Promise.all([
    import(pathToFileURL(path.join(target,'canonical-publication.mjs'))),
    import(pathToFileURL(path.join(target,'manual-report-formatter.mjs'))),
    import(pathToFileURL(path.join(target,'telegram-compact-formatter.mjs'))),
  ]);
  return {publication,manual,compact,cleanup:()=>fs.rmSync(target,{recursive:true,force:true})};
}

const T=1790546400000;
const common=({contract,direction,state})=>({
  status:'CLOSED',snapshot_id:`S:${contract}:${state}`,run_id:'R:OUTPUT-CONTRACT-V4',observed_ts:T,
  snapshot_time_utc:new Date(T).toISOString(),state,direction,
  scores:{overall_0_100:73,coin_interest_0_100:74,entry_readiness_0_100:null,is_probability:false},
  candidates:[{contract,ticker:contract}],universe:[{contract}],
  source_receipts:[{status:'CLOSED',metric:'RELATIVE_STRENGTH',venue:'HTX',value:2.4,unit:'PERCENT',window:'1h'}],
  hard_gates:[{gate:'FIXED_OUTPUT_CONTRACT',status:'CLOSED'}],
  reasons:[{label:'Объём подтверждает движение',value:'да'}],
  entry:{min_price:100,max_price:101,area:'100–101 USDT'},
  trigger:{metric:'price',operator:direction==='LONG'?'>=':'<=',value:direction==='LONG'?102:98,unit:'USDT',timeframe:'5m',expires_ts:T+1800000,next_recheck_ts:T+300000,cancel_condition:direction==='LONG'?'цена ниже 96 USDT':'цена выше 104 USDT'},
  invalidation:direction==='LONG'?'цена ниже 96 USDT':'цена выше 104 USDT',
  targets:[{price:direction==='LONG'?108:92}],
  liquidations:{status:'CLOSED',pump:{is_pump:false},above:[{price:112,distance_pct:12,strength_label_ru:'крупная',kind:'CALCULATED'}],below:[{price:88,distance_pct:-12,strength_label_ru:'крупная',kind:'CALCULATED'}]},
  free_sources:{registry:{entries:[{id:'HTX',decision_usable:true}]},entry_funnel:{blockers:[],blocker_details:[],has_unknown_reason:false},continuous_collector_status:'PARTIAL_REALTIME_COVERAGE',hot_cycle_external_request_delta:0},
  early_candidate:null,changes_from_previous:[],
  metadata:{contract,idea_basis:'MULTI_FACTOR',supporting_context:{facts:[]},source_role_view:{status:'CLOSED',classified:[{source_key:'HTX_OFFICIAL',source_family:'HTX_OFFICIAL',assigned_roles:['EXECUTION_TRUTH'],registry_known:true},{source_key:'BINANCE_OFFICIAL',source_family:'BINANCE_OFFICIAL',assigned_roles:['OI_CROSS_VENUE'],registry_known:true}]}}
});

export function outputContractScenarios(){
  const longObserve=common({contract:'FIL-USDT',direction:'LONG',state:'OBSERVE'});
  const shortWait=common({contract:'AAVE-USDT',direction:'SHORT',state:'WAIT_FOR_TRIGGER'});
  const longEntry=common({contract:'SUI-USDT',direction:'LONG',state:'ENTRY_NOW_ANALYTICAL'});
  const shortEntry=common({contract:'DOT-USDT',direction:'SHORT',state:'ENTRY_NOW_VALIDATED'});
  const removedLong=common({contract:'LSK-USDT',direction:'LONG',state:'REJECTED'});
  const removedShort=common({contract:'ETC-USDT',direction:'SHORT',state:'REJECTED'});
  const liquidation=common({contract:'ETHFI-USDT',direction:'LONG',state:'WAIT_FOR_TRIGGER'});
  liquidation.metadata.idea_basis='LIQUIDATION_PUMP';liquidation.liquidations.pump.is_pump=true;
  liquidation.liquidations.above=[6,18,42,78].map((d,i)=>({price:100*(1+d/100),distance_pct:d,strength_label_ru:['небольшая','средняя','крупная','огромная'][i],kind:'CALCULATED'}));
  liquidation.liquidations.below=[-6,-18,-42,-78].map((d,i)=>({price:100*(1+d/100),distance_pct:d,strength_label_ru:['средняя','крупная','огромная','небольшая'][i],kind:'CALCULATED'}));
  const missing=common({contract:'AVNT-USDT',direction:'LONG',state:'OBSERVE'});missing.status='NOT_CLOSED';missing.scores={overall_0_100:null,coin_interest_0_100:null,entry_readiness_0_100:null,is_probability:false};missing.trigger=null;missing.targets=[];missing.liquidations={status:'NOT_CLOSED'};
  return [
    {id:'long-observe-full',mode:'FULL_MANUAL',event:'OBSERVE',canonical:longObserve},
    {id:'short-wait-coin',mode:'MANUAL_COIN',event:'WAIT',canonical:shortWait},
    {id:'long-entry-full',mode:'FULL_MANUAL',event:'ENTRY',canonical:longEntry},
    {id:'short-entry-coin',mode:'MANUAL_COIN',event:'ENTRY',canonical:shortEntry},
    {id:'long-removed-full',mode:'FULL_MANUAL',event:'IDEA_REMOVED',canonical:removedLong},
    {id:'short-removed-coin',mode:'MANUAL_COIN',event:'IDEA_REMOVED',canonical:removedShort},
    {id:'pump-liquidation-only',mode:'LIQUIDATION_ONLY',event:'WAIT',canonical:liquidation},
    {id:'missing-data',mode:'FULL_MANUAL',event:'OBSERVE',canonical:missing},
  ];
}

export async function renderScenario(modules,scenario){
  const canonical=structuredClone(scenario.canonical);
  if(canonical.status==='CLOSED')canonical.analytical_fingerprint=modules.publication.canonicalFingerprint(canonical);
  const manual=modules.manual.formatManualReport(canonical);
  const compact=modules.compact.formatTelegramCompact(canonical);
  const telegram=modules.publication.renderCanonicalTelegram({canonical,lifecycle_event:scenario.event});
  return {id:scenario.id,mode:scenario.mode,event:scenario.event,canonical,expected:{manual,compact,telegram}};
}
