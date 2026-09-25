import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),runtime=path.resolve(process.argv[2]||'runtime'),src=path.join(runtime,'src');
const worker=path.join(src,'worker.js'),canonical=path.join(src,'canonical-runtime-adapter.mjs'),publication=path.join(src,'tz101-publication-runtime.mjs'),opportunity=path.join(src,'opportunity-intelligence-engine.mjs'),reasons=path.join(src,'reason-registry.mjs');
const modProtect=path.join(src,'protective-asset-filter.mjs'),modDomains=path.join(src,'evidence-domain-contract.mjs'),modOfficial=path.join(src,'bounded-official-event-fetcher.mjs');
const BEFORE={worker:'85876b26dd82bb1841c041d23fb063390856fe47751ffbf0a51d16c7d3412367',canonical:'4e351a9c26640b3c90ac9b5e4d6aa9fabc7efabb7a95eb57068c230d3e9fb18d',publication:'41877000041d7dcc799a07a88deb8d935e2d367e237b2facb1ea02285a550c83',opportunity:'fd9af7bc700fc52a9e03ce61e66f6a7b5e3b30dd1f9657d4ebfd778f1da13719',reasons:'de09b0383b260146e8d2d08512a971bcbd8555e5d83d930c78052ae107c8ab41'};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const source=n=>path.join(here,'src',n);
for(const p of [worker,canonical,publication,opportunity,reasons,source('protective-asset-filter.mjs'),source('evidence-domain-contract.mjs'),source('bounded-official-event-fetcher.mjs')])if(!fs.existsSync(p))throw new Error(`CONSOLIDATED_REQUIRED_FILE_MISSING:${p}`);

const already=fs.existsSync(modProtect)&&fs.existsSync(modDomains)&&fs.existsSync(modOfficial)&&fs.readFileSync(publication,'utf8').includes('MONTHLY_COLLAPSE_PROTECTIVE_FILTER')&&fs.readFileSync(canonical,'utf8').includes('evidence_domain_contract')&&fs.readFileSync(opportunity,'utf8').includes('"15m": 15 * 60_000');
if(already){
 const proof={version:'consolidated-remaining-overlay-v1-20260925',status:'ALREADY_APPLIED',base_candidate_sha:'506be05148a148071a001b39164833473bf515f9',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,strategy_weights_changed:false,weights_35_30_20_15_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_source_family_added:false,hot_cycle_external_request_delta:0,owner_authorized_r017:true,owner_authorized_r092:true};
 fs.writeFileSync(path.join(runtime,'consolidated-remaining-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log('CONSOLIDATED_REMAINING_OVERLAY_APPLIED',JSON.stringify(proof));process.exit(0);
}
const actual={worker:sha(worker),canonical:sha(canonical),publication:sha(publication),opportunity:sha(opportunity),reasons:sha(reasons)};
for(const k of Object.keys(BEFORE))if(actual[k]!==BEFORE[k])throw new Error(`CONSOLIDATED_TARGET_HASH_MISMATCH:${k}:${actual[k]}:${BEFORE[k]}`);
let w=fs.readFileSync(worker,'utf8'),c=fs.readFileSync(canonical,'utf8'),p=fs.readFileSync(publication,'utf8'),o=fs.readFileSync(opportunity,'utf8'),r=fs.readFileSync(reasons,'utf8');

// R017: existing daily HTX candles are passed into publication; no new request.
const W_OLD=`    smart_money_raw: smartMoneyRaw,
    observed_ts: now,
  });`;
const W_NEW=`    smart_money_raw: smartMoneyRaw,
    daily_candles:
      trajectory?.data?._opportunity_shadow_inputs?.one_day || [],
    observed_ts: now,
  });`;
if(!w.includes(W_OLD))throw new Error('CONSOLIDATED_PATCH_ANCHOR_MISSING:worker_daily_candles');
w=w.replace(W_OLD,W_NEW);

// R017 publication runtime.
const P_IMPORT_OLD=`import { routeEntrySignal } from './entry-signal-router.mjs';`;
const P_IMPORT_NEW=P_IMPORT_OLD+`\nimport { buildProtectiveAssetFilter } from './protective-asset-filter.mjs';`;
const P_SIG_OLD=`liquidation_context=null,smart_money_raw=null,observed_ts=Date.now(),validation_status='OPEN'}={}) {`;
const P_SIG_NEW=`liquidation_context=null,smart_money_raw=null,daily_candles=[],observed_ts=Date.now(),validation_status='OPEN'}={}) {`;
const P_SCORE_OLD=`  const decision=persistence.decision_summary;const score=buildTz101ScoreInterval({direction:decision.direction,decision_evidence,smart_money_raw});const funding=safeFundingContext(trajectory,trajectory_available_ts);`;
const P_SCORE_NEW=`  const decision=persistence.decision_summary;const score=buildTz101ScoreInterval({direction:decision.direction,decision_evidence,smart_money_raw});const funding=safeFundingContext(trajectory,trajectory_available_ts);const protective=buildProtectiveAssetFilter({daily_candles,observed_ts});`;
const P_ENTRY_OLD=`  const entrySignal=routeEntrySignal({final_decision:decision,publication_gate:gate,scenario_plan:scenario,current_price:scenario?.execution_reference_price,observed_ts,validation_status,structure_interesting:true,useful_observation:true});`;
const P_ENTRY_NEW=`  let entrySignal=routeEntrySignal({final_decision:decision,publication_gate:gate,scenario_plan:scenario,current_price:scenario?.execution_reference_price,observed_ts,validation_status,structure_interesting:true,useful_observation:true});
  if(protective?.hard_reject===true)entrySignal={...entrySignal,state:'REJECTED',direction:decision.direction??null,reason:'MONTHLY_COLLAPSE_PROTECTIVE_FILTER',protective_filter:protective,validated_signal:false,automatic_execution:false};`;
for(const [lab,a] of [['publication import',P_IMPORT_OLD],['publication signature',P_SIG_OLD],['publication score',P_SCORE_OLD],['publication entry',P_ENTRY_OLD]])if(!p.includes(a))throw new Error(`CONSOLIDATED_PATCH_ANCHOR_MISSING:${lab}`);
p=p.replace(P_IMPORT_OLD,P_IMPORT_NEW).replace(P_SIG_OLD,P_SIG_NEW).replace(P_SCORE_OLD,P_SCORE_NEW).replace(P_ENTRY_OLD,P_ENTRY_NEW);
p=p.replace(`entry_signal:entrySignal,telegram_context_persistence:null,safety};`,`entry_signal:entrySignal,protective_filter:protective,telegram_context_persistence:null,safety};`);
p=p.replace(`entry_signal:entrySignal,telegram_context_persistence:sidecar,safety};`,`entry_signal:entrySignal,protective_filter:protective,telegram_context_persistence:sidecar,safety};`);

// R017 reason translation.
const R_DEF_OLD=`  TRIGGER_GAP:{full_ru:'Условие входа ещё не подтверждено.',short_ru:'условие входа ещё не выполнено'},
  UNKNOWN_INTERNAL_REASON:`;
const R_DEF_NEW=`  TRIGGER_GAP:{full_ru:'Условие входа ещё не подтверждено.',short_ru:'условие входа ещё не выполнено'},
  MONTHLY_COLLAPSE_PROTECTIVE_FILTER:{full_ru:'Монета исключена защитным фильтром: подтверждённое падение примерно на 97% или больше за месячное окно.',short_ru:'защитный фильтр: месячное падение около 97% или больше'},
  UNKNOWN_INTERNAL_REASON:`;
if(!r.includes(R_DEF_OLD))throw new Error('CONSOLIDATED_PATCH_ANCHOR_MISSING:reason_registry');
r=r.replace(R_DEF_OLD,R_DEF_NEW);

// R042 evidence-domain canonical contract.
const C_IMPORT_OLD=`import { buildSnapshotChanges } from './snapshot-diff.mjs';`;
const C_IMPORT_NEW=C_IMPORT_OLD+`\nimport { buildEvidenceDomainContract } from './evidence-domain-contract.mjs';`;
const C_SNAP_OLD=` const canonical=buildCanonicalAnalyticalResult({`;
const C_SNAP_NEW=` const evidenceDomains=buildEvidenceDomainContract({opportunity,public_evidence,futures_component,liquidation_intelligence});
 const canonical=buildCanonicalAnalyticalResult({`;
const C_META_OLD=`supporting_context:supportingContext,snapshot_comparison:snapshotChanges},`;
const C_META_NEW=`supporting_context:supportingContext,snapshot_comparison:snapshotChanges,evidence_domain_contract:evidenceDomains,protective_filter:publication_shadow?.protective_filter??null},`;
for(const [lab,a] of [['canonical import',C_IMPORT_OLD],['canonical build',C_SNAP_OLD],['canonical metadata',C_META_OLD]])if(!c.includes(a))throw new Error(`CONSOLIDATED_PATCH_ANCHOR_MISSING:${lab}`);
c=c.replace(C_IMPORT_OLD,C_IMPORT_NEW).replace(C_SNAP_OLD,C_SNAP_NEW).replace(C_META_OLD,C_META_NEW);

// R051 measurement support: preserve the six persisted runtime horizons exactly,
// and add 15m/30m only to computePostEventOutcome's measurement contract.
const O_HORIZON_DECL_OLD=`export const OUTCOME_HORIZONS = Object.freeze({
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
});`;
const O_HORIZON_DECL_NEW=O_HORIZON_DECL_OLD+`

export const SUPPLEMENTAL_OUTCOME_HORIZONS = Object.freeze({
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
});`;
const O_LOOKUP_OLD=`  const horizonMs = OUTCOME_HORIZONS[horizon];`;
const O_LOOKUP_NEW=`  const horizonMs =
    OUTCOME_HORIZONS[horizon] ??
    SUPPLEMENTAL_OUTCOME_HORIZONS[horizon];`;
if(!o.includes(O_HORIZON_DECL_OLD))throw new Error('CONSOLIDATED_PATCH_ANCHOR_MISSING:outcome_horizon_declaration');
if(!o.includes(O_LOOKUP_OLD))throw new Error('CONSOLIDATED_PATCH_ANCHOR_MISSING:outcome_horizon_lookup');
o=o.replace(O_HORIZON_DECL_OLD,O_HORIZON_DECL_NEW).replace(O_LOOKUP_OLD,O_LOOKUP_NEW);

const backups=[[worker,worker+'.cons.bak'],[canonical,canonical+'.cons.bak'],[publication,publication+'.cons.bak'],[opportunity,opportunity+'.cons.bak'],[reasons,reasons+'.cons.bak']];
for(const [x,b] of backups)fs.copyFileSync(x,b);
try{
 fs.writeFileSync(worker,w);fs.writeFileSync(canonical,c);fs.writeFileSync(publication,p);fs.writeFileSync(opportunity,o);fs.writeFileSync(reasons,r);
 fs.copyFileSync(source('protective-asset-filter.mjs'),modProtect);fs.copyFileSync(source('evidence-domain-contract.mjs'),modDomains);fs.copyFileSync(source('bounded-official-event-fetcher.mjs'),modOfficial);
 const proof={version:'consolidated-remaining-overlay-v1-20260925',status:'APPLIED',base_candidate_sha:'506be05148a148071a001b39164833473bf515f9',production_base:'08d98579c5ecbeb4de426ffeb1160f25ece52708',
  before:BEFORE,after:{worker:sha(worker),canonical:sha(canonical),publication:sha(publication),opportunity:sha(opportunity),reasons:sha(reasons),protective:sha(modProtect),domains:sha(modDomains),official:sha(modOfficial)},
  production_changed:false,d1_migration:false,d1_write_delta:0,telegram_send:false,telegram_recipients_changed:false,cloudflare_deploy:false,force_push:false,
  strategy_weights_changed:false,weights_35_30_20_15_changed:false,automatic_execution:false,validated_signal:false,live_probability:false,new_source_family_added:false,
  hot_cycle_external_request_delta:0,monthly_collapse_threshold_pct:-97,persisted_outcome_horizons_changed:false,supplemental_measurement_horizons_added:['15m','30m'],
  owner_authorized_r017:true,owner_authorized_r092:true,official_event_fetcher_runtime_auto_enabled:false};
 for(const [,b] of backups)fs.rmSync(b,{force:true});
 fs.writeFileSync(path.join(runtime,'consolidated-remaining-overlay-proof.json'),JSON.stringify(proof,null,2)+'\n');
 console.log('CONSOLIDATED_REMAINING_OVERLAY_APPLIED',JSON.stringify(proof));
}catch(err){
 for(const [x,b] of backups){fs.rmSync(x,{force:true});if(fs.existsSync(b))fs.renameSync(b,x);}
 for(const x of [modProtect,modDomains,modOfficial])fs.rmSync(x,{force:true});
 throw err;
}
