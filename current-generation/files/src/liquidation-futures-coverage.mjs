import {createHash} from 'node:crypto';
import {LIQUIDATION_REQUIRED_FRESH_EXTERNAL_CONNECTIONS as SOURCES} from './liquidation-source-chain.mjs';
import {isExactHtxUsdtSwapKey} from './htx-contract-key.mjs';
import {fingerprint} from './liquidation-extension/core.mjs';
import {installEvidenceSourceStore,readEvidenceSourceCache,writeEvidenceSourceCache} from './evidence-source-store.mjs';
export const LIQUIDATION_COVERAGE_VERSION='htx-crypto-futures-eight-source-capability-v1-20261004';
export const COVERAGE_SOURCE_IDS=Object.freeze([...SOURCES]);
export const WEEK=7*24*60*60_000;
const SOURCE='HTX_FUTURES_LIQUIDATION_COVERAGE',KEY='ALL_CRYPTO_FUTURES',REFRESH_KEY='ALL_CRYPTO_FUTURES_WEEKLY_REFRESH_PENDING',sha=b=>createHash('sha256').update(b).digest('hex');
const upstream={HYPERLIQUID_NATIVE:'HYPERLIQUID',BYK_TRACKED_HL_BANDS:'HYPERLIQUID',OXARCHIVE_HL_BUCKETS:'HYPERLIQUID',LIGHTER_NATIVE:'LIGHTER',GMX_NATIVE:'GMX',GTRADE_NATIVE:'GTRADE',BYKARANTELI_FUTURE_MAP:'BYK_PROVIDER_FUTURE_LEVELS',COINLOBSTER_FUTURE_MODEL:'COINLOBSTER'};
const statusSet=new Set(['UNVERIFIED','REAL_NUMERIC_LEVELS','EXACT_SOURCE_MARKET_UNSUPPORTED','NO_REAL_NUMERIC_LEVELS','ACCESS_BLOCKED','SOURCE_ERROR','QUOTA_DEFERRED']);
export const NON_QUALIFYING_FUTURE_SOURCE_POLICIES=Object.freeze({
 LIGHTER_NATIVE:'CURRENT_ACCOUNT_ENDPOINT_HAS_NO_PROVIDER_SNAPSHOT_CLOCK',
 GMX_NATIVE:'CURRENT_POSITION_ENDPOINT_HAS_NO_PROVIDER_SNAPSHOT_CLOCK',
 GTRADE_NATIVE:'OFFICIAL_SDK_OUTPUT_IS_A_FEE_AWARE_ESTIMATE',
 BYKARANTELI_FUTURE_MAP:'PROVIDER_OUTPUT_IS_A_PROJECTED_MODEL',
 COINLOBSTER_FUTURE_MODEL:'PROVIDER_OUTPUT_IS_A_PROJECTED_MODEL',
 OXARCHIVE_HL_BUCKETS:'POSITION_DERIVED_PROJECTED_BUCKETS_ARE_NOT_NATIVE_ACCOUNT_LEVELS',
});
export function createFuturesCoverageDatabase({universe,universe_sha256,now}={}){
 if(universe?.status!=='CLOSED'||!Array.isArray(universe.assets)||!universe.assets.length||!Array.isArray(universe.contracts)||!/^[a-f0-9]{64}$/.test(universe_sha256||'')||!Number.isSafeInteger(now)||now<universe.observed_ts||SOURCES.length!==8)throw Error('EXACT_COMPLETE_CRYPTO_FUTURES_UNIVERSE_REQUIRED');
 const assets=universe.assets.map(a=>({symbol:a.symbol,analysis_contract:a.asset_analysis_contract,contracts:a.contracts,source_checks:Object.fromEntries(SOURCES.map(s=>[s,{source_id:s,upstream_id:upstream[s],status:'UNVERIFIED',checked_ts:null,real_numeric_level_count:null,proof_sha256:null}]))}));
 if(new Set(assets.map(a=>a.symbol)).size!==assets.length||assets.some(a=>!isExactHtxUsdtSwapKey(a.analysis_contract)||a.analysis_contract!==a.symbol+'-USDT'||!a.contracts?.length)||universe.contracts.some(c=>!assets.find(a=>a.symbol===c.asset_symbol)?.contracts.some(x=>x.family===c.family&&x.contract_code===c.contract_code)))throw Error('EXACT_FUTURES_ASSET_IDENTITIES_REQUIRED');
 const out={version:LIQUIDATION_COVERAGE_VERSION,universe_sha256,universe_observed_ts:universe.observed_ts,created_ts:now,updated_ts:now,source_ids:[...SOURCES],crypto_future_contracts:universe.contracts.length,crypto_future_assets:assets.length,assets,source_checks_complete:false,weekly_refresh_due_ts:now+WEEK,spot_only_assets_included:false,stock_or_fiat_included:false,calculated_htx_fallback:false,internal_only:true};
 return out;
}
export function validateFuturesCoverageDatabase(db){
 if(db?.version!==LIQUIDATION_COVERAGE_VERSION||db.spot_only_assets_included!==false||db.stock_or_fiat_included!==false||db.calculated_htx_fallback!==false||!Number.isSafeInteger(db.updated_ts)||!Array.isArray(db.assets)||db.assets.length!==db.crypto_future_assets||new Set(db.assets.map(a=>a.symbol)).size!==db.assets.length||JSON.stringify(db.source_ids)!==JSON.stringify(SOURCES)||!/^[a-f0-9]{64}$/.test(db.universe_sha256||''))return false;
 const contracts=db.assets.flatMap(a=>Array.isArray(a.contracts)?a.contracts:[]);if(contracts.length!==db.crypto_future_contracts||new Set(contracts.map(c=>c.family+':'+c.contract_code)).size!==contracts.length)return false;
 return db.assets.every(a=>isExactHtxUsdtSwapKey(a.analysis_contract)&&a.analysis_contract===a.symbol+'-USDT'&&Object.keys(a.source_checks||{}).length===8&&SOURCES.every(s=>{
  const r=a.source_checks[s];if(r?.source_id!==s||r.upstream_id!==upstream[s]||!statusSet.has(r.status))return false;
  if(r.status==='UNVERIFIED')return r.checked_ts===null&&r.real_numeric_level_count===null&&r.proof_sha256===null;
  if(!Number.isSafeInteger(r.checked_ts)||r.checked_ts>db.updated_ts||!/^[a-f0-9]{64}$/.test(r.proof_sha256||''))return false;
  return r.status==='REAL_NUMERIC_LEVELS'?Number.isSafeInteger(r.real_numeric_level_count)&&r.real_numeric_level_count>0:r.real_numeric_level_count===null;
 }));
}
// Require the exact internally normalized source receipt, not a catalog entry,
// HTTP200, a directional headline, an HTX leverage scenario or a replay.
export function qualifyNumericFutureReceipt({source_id,receipt,contract,now}={}){
 if(!SOURCES.includes(source_id)||!isExactHtxUsdtSwapKey(contract)||receipt?.native_symbol!==contract.slice(0,-5)||receipt.usable_for_context!==true||receipt.source_clock_closed===false||!Number.isSafeInteger(receipt.source_ts)||receipt.source_ts>now||now-receipt.source_ts>300000)return null;
 const names={HYPERLIQUID_NATIVE:/^Hyperliquid(?: official)?$/i,LIGHTER_NATIVE:/^Lighter official$/i,GMX_NATIVE:/^GMX official$/i,GTRADE_NATIVE:/^gTrade official SDK$/i,BYK_TRACKED_HL_BANDS:/^Bykaranteli tracked Hyperliquid/i,OXARCHIVE_HL_BUCKETS:/^(0xArchive|OxArchive)/i,BYKARANTELI_FUTURE_MAP:/^Bykaranteli/i,COINLOBSTER_FUTURE_MODEL:/^CoinLobster/i};if(!names[source_id].test(receipt.provider||''))return null;
 const {fingerprint:sealed,...body}=receipt;if(typeof sealed!=='string'||fingerprint(body)!==sealed||/REALIZED|CALCULATED|MODEL|ESTIMAT|PROJECTED/.test(receipt.evidence_class||''))return null;
 const zones=receipt.zones;if(!Array.isArray(zones)||!zones.length||zones.length>500)return null;
 const real=zones.filter(z=>typeof z.native_price==='number'&&Number.isFinite(z.native_price)&&z.native_price>0&&['LONG','SHORT'].includes(z.liquidated_side)&&!/CALCULATED|MODEL_PRICE_BIN|SDK_ESTIMATE|CLUSTER_CENTER|LEVERAGE_STRESS|BUCKET_CENTER/.test(z.price_semantics||'')&&Number.isSafeInteger(z.source_ts??receipt.source_ts)&&(z.source_ts??receipt.source_ts)<=now&&now-(z.source_ts??receipt.source_ts)<=300000);
 if(!real.length)return null;
 return{source_id,upstream_id:upstream[source_id],status:'REAL_NUMERIC_LEVELS',checked_ts:now,source_ts:receipt.source_ts,real_numeric_level_count:real.length,proof_sha256:sealed,coverage_scope:receipt.coverage||'RETURNED_NATIVE_POSITIONS_ONLY',level_prices:real.slice(0,16).map(z=>({price:z.native_price,side:z.liquidated_side,price_quote:z.price_quote??receipt.price_quote??receipt.native_market?.quote??null})),historical_capability_only:true,live_signal_generated:false};
}
export function applyFuturesCoverageCheck(database,{contract,source_id,status,receipt=null,source_proof_sha256=null,now}={}){
 const copy=structuredClone(database),asset=copy.assets.find(a=>a.analysis_contract===contract);
 if(!validateFuturesCoverageDatabase(database)||!asset||!SOURCES.includes(source_id)||!statusSet.has(status)||status==='UNVERIFIED'||!Number.isSafeInteger(now)||now<copy.updated_ts)throw Error('EXACT_SOURCE_CHECK_SCOPE_REQUIRED');
 const numeric=qualifyNumericFutureReceipt({source_id,receipt,contract,now});
 if(status==='REAL_NUMERIC_LEVELS'&&!numeric)throw Error('GENUINE_NUMERIC_FUTURE_RECEIPT_REQUIRED');
 if(status!=='REAL_NUMERIC_LEVELS'&&!/^[a-f0-9]{64}$/.test(source_proof_sha256||''))throw Error('EXACT_CHECK_PROOF_REQUIRED');
 asset.source_checks[source_id]=numeric||{source_id,upstream_id:upstream[source_id],status,checked_ts:now,real_numeric_level_count:null,proof_sha256:source_proof_sha256};
 copy.updated_ts=now;copy.source_checks_complete=copy.assets.every(a=>SOURCES.every(s=>!['UNVERIFIED','QUOTA_DEFERRED'].includes(a.source_checks[s].status)));return copy;
}
export function applyFuturesCoverageChecks(database,checks=[]){
 if(!validateFuturesCoverageDatabase(database)||!Array.isArray(checks)||!checks.length)throw Error('EXACT_SOURCE_CHECK_BATCH_REQUIRED');
 const copy=structuredClone(database),seen=new Set();let cursor=copy.updated_ts;
 for(const {contract,source_id,status,receipt=null,source_proof_sha256=null,now} of checks){
  const asset=copy.assets.find(a=>a.analysis_contract===contract),key=`${contract}:${source_id}`;
  if(!asset||!SOURCES.includes(source_id)||!statusSet.has(status)||status==='UNVERIFIED'||!Number.isSafeInteger(now)||now<cursor||seen.has(key))throw Error('EXACT_SOURCE_CHECK_SCOPE_REQUIRED');
  const numeric=qualifyNumericFutureReceipt({source_id,receipt,contract,now});
  if(status==='REAL_NUMERIC_LEVELS'&&!numeric)throw Error('GENUINE_NUMERIC_FUTURE_RECEIPT_REQUIRED');
  if(status!=='REAL_NUMERIC_LEVELS'&&!/^[a-f0-9]{64}$/.test(source_proof_sha256||''))throw Error('EXACT_CHECK_PROOF_REQUIRED');
  asset.source_checks[source_id]=numeric||{source_id,upstream_id:upstream[source_id],status,checked_ts:now,real_numeric_level_count:null,proof_sha256:source_proof_sha256};
  seen.add(key);cursor=now;
 }
 copy.updated_ts=cursor;copy.source_checks_complete=copy.assets.every(a=>SOURCES.every(s=>!['UNVERIFIED','QUOTA_DEFERRED'].includes(a.source_checks[s].status)));return copy;
}
export function resetFuturesCoverageForWeeklyRefresh(database,{now}={}){
 if(!validateFuturesCoverageDatabase(database)||!Number.isSafeInteger(now)||now<database.updated_ts)throw Error('VALID_COVERAGE_REFRESH_CLOCK_REQUIRED');
 if(now<database.weekly_refresh_due_ts)return{database,reset:false,status:'NOT_DUE'};
 const copy=structuredClone(database);for(const asset of copy.assets)for(const source_id of SOURCES)asset.source_checks[source_id]={source_id,upstream_id:upstream[source_id],status:'UNVERIFIED',checked_ts:null,real_numeric_level_count:null,proof_sha256:null};
 copy.updated_ts=now;copy.source_checks_complete=false;copy.weekly_refresh_due_ts=now+WEEK;copy.refresh_started_ts=now;copy.refresh_from_updated_ts=database.updated_ts;return{database:copy,reset:true,status:'WEEKLY_REFRESH_RESET'};
}
export function summarizeFuturesCoverage(database,{now=Date.now()}={}){
 if(!validateFuturesCoverageDatabase(database))return{status:'COVERAGE_DATABASE_NOT_AVAILABLE',assets:0,cells:0,checked_cells:0,covered_assets:0,complete:false};
 const rows=database.assets.map(asset=>futuresLiquidationAdmission(database,{contract:asset.analysis_contract,now})),cells=database.assets.length*SOURCES.length,checked=database.assets.reduce((n,a)=>n+SOURCES.filter(s=>a.source_checks[s].status!=='UNVERIFIED').length,0);
 return{status:database.source_checks_complete?'CLOSED':'IN_PROGRESS',assets:database.assets.length,cells,checked_cells:checked,covered_assets:rows.filter(r=>r.eligible).length,uncovered_assets:rows.filter(r=>!r.eligible).length,complete:database.source_checks_complete,weekly_refresh_due_ts:database.weekly_refresh_due_ts};
}
export function futuresLiquidationAdmission(database,{contract,now}={}){
 const no=status=>({status,eligible:false,source_ids:[],independent_upstreams:[],network_calls:0,calculated_fallback_allowed:false});
 if(!validateFuturesCoverageDatabase(database))return no('COVERAGE_DATABASE_NOT_AVAILABLE');
 const a=database.assets?.find(a=>a.analysis_contract===contract);if(!a)return no('NOT_IN_COMMON_CRYPTO_FUTURES_UNIVERSE');
 if(!Number.isSafeInteger(now)||now<database.updated_ts)return no('COVERAGE_CLOCK_NOT_CLOSED');
 const checked=SOURCES.map(s=>a.source_checks[s]),real=checked.filter(r=>r?.status==='REAL_NUMERIC_LEVELS'&&Number.isSafeInteger(r.checked_ts)&&r.checked_ts<=now&&now-r.checked_ts<WEEK&&r.real_numeric_level_count>0&&/^[a-f0-9]{64}$/.test(r.proof_sha256||''));
 if(!real.length)return no(checked.some(r=>r?.status==='UNVERIFIED'||r?.status==='QUOTA_DEFERRED')?'SOURCE_CHECKS_NOT_COMPLETE':checked.some(r=>r?.status==='REAL_NUMERIC_LEVELS')?'COVERAGE_REFRESH_REQUIRED':'NO_VERIFIED_REAL_LEVEL_SOURCE');
 return{status:'COVERED_REAL_NUMERIC_FUTURE_LEVELS',eligible:true,contract,source_ids:real.map(r=>r.source_id),independent_upstreams:[...new Set(real.map(r=>r.upstream_id))],coverage_scope:'PROVEN_SOURCE_CAPABILITY_ONLY_FRESH_LIVE_LEVELS_STILL_REQUIRED',network_calls:0,calculated_fallback_allowed:false,leaders_may_be_replaced:false};
}
// Owner-approved additional contexts are collection permission, NOT verified coverage.
// The existing D1/HTTP admissions still run; unknown source age never becomes a score or target.
export function runtimeLiquidationCollectionAdmission(database,{contract,now}={}){
 const proven=futuresLiquidationAdmission(database,{contract,now});
 if(!validateFuturesCoverageDatabase(database)||!Number.isSafeInteger(now)||now<database.updated_ts)return proven;
 const asset=database.assets.find(a=>a.analysis_contract===contract);if(!asset)return proven;
 const additional=['GTRADE_NATIVE','LIGHTER_NATIVE','GMX_NATIVE','COINLOBSTER_FUTURE_MODEL'].filter(id=>{
  const r=asset.source_checks[id];return r.status==='NO_REAL_NUMERIC_LEVELS'&&r.checked_ts<=now&&now-r.checked_ts<WEEK&&/^[a-f0-9]{64}$/.test(r.proof_sha256||'');
 });
 if(!additional.length)return proven;
 return {...proven,status:proven.eligible?'PROVEN_LEVEL_ROUTE_PLUS_ADDITIONAL_CONTEXT_CHECKS':'BOUNDED_ADDITIONAL_CONTEXT_CHECK_ALLOWED',eligible:true,contract,
  source_ids:[...new Set([...proven.source_ids,...additional])],proven_level_source_ids:proven.source_ids,additional_context_check_source_ids:additional,
  coverage_scope:'ADDITIONAL_ROUTE_CHECK_PERMISSION_IS_NOT_VERIFIED_LEVEL_COVERAGE',fresh_live_levels_confirmed:false,
  receipt_only_context_score_eligible:false,receipt_only_context_target_eligible:false,leaders_may_be_replaced:false};
}
async function saveCoverageDatabaseAtKey({db,database,db_admit,now,expected_previous_assets_sha256=null,key}={}){
 const grant=db_admit?.({rows_read:8,rows_written:4});if(grant?.allowed!==true)return{status:'COVERAGE_DB_ADMISSION_REQUIRED',saved:false,network_calls:0};
 if(!validateFuturesCoverageDatabase(database)||!Number.isSafeInteger(now)||now<database.updated_ts||Buffer.byteLength(JSON.stringify(database))>1500000)throw Error('COVERAGE_DATABASE_INTEGRITY_REQUIRED');
 await installEvidenceSourceStore(db);const prior=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(prior&&sha(JSON.stringify(prior.assets))!==sha(JSON.stringify(database.assets))&&expected_previous_assets_sha256!==sha(JSON.stringify(prior.assets)))return{status:'COVERAGE_REVISION_CONFLICT',saved:false,network_calls:0};
 await writeEvidenceSourceCache(db,{source:SOURCE,asset_key:key,observed_ts:now,expires_ts:now+30*24*60*60_000,payload:database});
 const saved=await readEvidenceSourceCache(db,{source:SOURCE,asset_key:key,now});if(!saved||sha(JSON.stringify(saved.assets))!==sha(JSON.stringify(database.assets)))return{status:'COVERAGE_READBACK_NOT_CLOSED',saved:false,network_calls:0};return{status:key===KEY?'DURABLE_COVERAGE_DATABASE_SAVED':'DURABLE_WEEKLY_REFRESH_STAGING_SAVED',saved:true,crypto_future_assets:database.crypto_future_assets,crypto_future_contracts:database.crypto_future_contracts,asset_source_cells:database.crypto_future_assets*8,source_checks_complete:database.source_checks_complete,network_calls:0};
}
export async function saveFuturesCoverageDatabase(params={}){return saveCoverageDatabaseAtKey({...params,key:KEY});}
export async function saveFuturesCoverageRefreshDatabase(params={}){return saveCoverageDatabaseAtKey({...params,key:REFRESH_KEY});}
export async function loadFuturesCoverageDatabase({db,now=Date.now()}={}){return readEvidenceSourceCache(db,{source:SOURCE,asset_key:KEY,now});}
export async function loadFuturesCoverageRefreshDatabase({db,now=Date.now()}={}){return readEvidenceSourceCache(db,{source:SOURCE,asset_key:REFRESH_KEY,now});}
