import fs from 'node:fs/promises';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {exactPoloniexBinding} from '../current-generation/files/src/poloniex-native-four-hour-flow.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const specs=[
 ['checkpoints/n05-actual-qualification-38049404414/identity-HTX.json.gz','f2bcb443ac8b167fa0b64709fa019107043208e37ae94df96b676ef9c51a0d29','f662bdb1562bce5c19a3b7df96978b2fe27264ff271121d12d0f44b5ee94497c',1791632635640],
 ['checkpoints/n05-poloniex-qualification-38069554249/original-batch.json.gz','48d05da112b7cbfbc91bcc013dd67abca7f9a616d30d5dee11e3f85e937e83ec','307ff3bdb4df58a6b3a268d566694a3ebd23e64d27d60505dd75bc09820d190d'],
 ['checkpoints/n05-remaining-qualification-38068243085/original-batch.json.gz','a0542dee7d122b1a11678b6960033e8e25f6f007ad969029e7d81b42e439b3c3','b31ebfc040364de7be6a514a4121ef13df14d4b67e8ea64b84f82e0896a831ab'],
 ['checkpoints/n05-poloniex-qualification-38069848900/original-batch.json.gz','52c53879a7ce5b2bb3a77bdb706f853f23192efbac72273ff4ea995788d243fd','763c4c068798217f66c43c7f46d6c02fb2fa831e3aa441684d9e7cc6bc7f5169'],
];
const inputs=[];
for(const[path,body,gzip]of specs){const z=await fs.readFile(path),b=gunzipSync(z);if(hash(z)!==gzip||hash(b)!==body)throw Error('ORIGINAL_SOURCE_HASH:'+path);inputs.push(JSON.parse(b));}
const [htx,polo,kucoin,activity]=inputs;
const manifestPath='checkpoints/htx-current-crypto-futures-universe-20261010.json.gz',manifestBytes=await fs.readFile(manifestPath);
if(hash(manifestBytes)!=='ade6878a0ba9921a83695a1a82d19be9867ddebb7ff8b741a3b46f59f950a81c')throw Error('CURRENT_SCOPE_HASH');
const manifest=JSON.parse(gunzipSync(manifestBytes)),plan=JSON.parse(await fs.readFile('checkpoints/HTX_104_ASSET_COLLECTION_AND_N05_PLAN_20261010.json'));
if(manifest.assets.length!==104||plan.rows.length!==104||new Set(manifest.assets.map(a=>a.symbol)).size!==104)throw Error('EXACT104_REQUIRED');
const identitySource=await fs.readFile('current-generation/files/src/htx-asset-identity.mjs','utf8'),sectorSource=await fs.readFile('current-generation/files/src/coingecko-sector-evidence.mjs','utf8');
const native=sectorSource.match(/export const NATIVE_SECTOR_BINDINGS=[\s\S]*?\n\}\);/)?.[0];
const overrides=identitySource.match(/export const FUTURES_ONLY_EXACT_ASSET_BINDINGS=[\s\S]*?\n\}\);/)?.[0];
const pure=identitySource.slice(identitySource.indexOf('const text='),identitySource.indexOf('function selectReference('));
if(!native||!overrides||!pure.includes('export function normalizeHtxAssetReferences'))throw Error('EXACT_RUNTIME_IDENTITY_EXTRACTION');
const context=vm.createContext({});vm.runInContext([native,overrides,pure,'globalThis.normalizer=normalizeHtxAssetReferences;globalThis.overrides=FUTURES_ONLY_EXACT_ASSET_BINDINGS;'].join('\n').replaceAll('export ',''),context,{timeout:1000});
const entries=JSON.parse(JSON.stringify(context.normalizer(htx).entries)),fallbacks=JSON.parse(JSON.stringify(context.overrides));
const tokenChains={eth:'ethereum',bsc:'bsc',sol:'solana',arbitrum:'arbitrum',base:'base',optimism:'optimism',polygon:'polygon',avaxc:'avalanche'},nativeChains={btc:'bitcoin',eth:'ethereum',bsc:'bsc',doge:'dogecoin',ltc:'litecoin',bch:'bitcoin-cash',zec:'zcash',etc:'ethereum-classic',xlm:'stellar',near:'near',ada:'cardano',atom:'cosmos',sol:'solana',avaxc:'avalanche',dot:'polkadot',trx:'tron',xrp:'xrp',hbar:'hedera',apt:'aptos',sui:'sui'};
const rows=manifest.assets.map(({symbol})=>{
 const contract=symbol+'-USDT',entry=entries[symbol],override=fallbacks[symbol],identity=override?.identity||(entry?.status==='CLOSED'?entry.identities[0]:null),routes=[];
 if(identity&&exactPoloniexBinding({contract,identity,assets:polo.assets,markets:polo.markets}))routes.push({venue:'POLONIEX',production_adapter_enabled:true,exact_binding:true,flow_window_proven:false});
 const aa=kucoin.kucoin_currencies.data.filter(a=>a.currency===symbol),mm=kucoin.kucoin_catalog.data.filter(m=>m.symbol===contract&&m.baseCurrency===symbol&&m.quoteCurrency==='USDT'&&m.enableTrading===true);
 if(identity&&aa.length===1&&mm.length===1){const matches=(aa[0].chains||[]).filter(c=>identity.asset_kind==='NATIVE'?nativeChains[c.chainId]===identity.chain&&!c.contractAddress:tokenChains[c.chainId]===identity.chain&&typeof c.contractAddress==='string'&&(identity.chain==='solana'?c.contractAddress===identity.contract_or_mint:c.contractAddress.toLowerCase()===identity.contract_or_mint.toLowerCase()));if(matches.length===1)routes.push({venue:'KUCOIN',production_adapter_enabled:false,exact_binding:true,chain_id:matches[0].chainId,flow_window_proven:false});}
 const hints=activity.activity.filter(a=>a.symbol===symbol+'_USDT'),hint=hints.length===1?hints[0]:null,original=plan.rows.find(r=>r.contract===contract||r.asset===symbol||r.symbol===symbol);
 if(!original)throw Error('COLLECTION_PLAN_ROW_MISSING:'+contract);
 return{symbol,contract,identity,identity_status:override?'VERSIONED_EXPLORER_EXACT_TOKEN_BINDING':entry?.status||'HTX_CURRENCY_NOT_FOUND',identity_original_received_ts:override?Date.parse(override.verified_at):1791632635640,routes,poloniex_original_activity_hint:hint?{trade_count_24h:hint.tradeCount,original_close_ts:hint.closeTime,original_received_ts:activity.sources.find(s=>s.name==='POLONIEX-ALL-24H-ACTIVITY')?.received_ts,not_current_flow:true}:null,prior_individual_full_window:original.N05.retained_individual_full_external_window};
});
const counts={approved_assets:rows.length,closed_exact_identity:rows.filter(r=>r.identity).length,poloniex_exact_bindings:rows.filter(r=>r.routes.some(v=>v.venue==='POLONIEX')).length,kucoin_research_exact_bindings:rows.filter(r=>r.routes.some(v=>v.venue==='KUCOIN')).length,assets_with_either_exact_route:rows.filter(r=>r.routes.length).length};
if(rows.find(r=>r.symbol==='RLC')?.routes.some(r=>r.venue==='POLONIEX')!==true)throw Error('NEW_RLC_BINDING_NOT_REPRODUCED');
if(counts.poloniex_exact_bindings!==52||counts.kucoin_research_exact_bindings!==59||rows.filter(r=>r.prior_individual_full_window).length!==22)throw Error('CURRENT104_ROUTE_OR_PRIOR_FLOW_SET_CHANGED');
const nextCandidates=rows.filter(r=>r.routes.some(v=>v.venue==='POLONIEX')&&!r.prior_individual_full_window&&((r.poloniex_original_activity_hint?.trade_count_24h>0&&r.poloniex_original_activity_hint.original_close_ts>=activity.window_end_ts-300000)||['CT','RLC'].includes(r.symbol))).map(r=>r.contract);
const nextPlan={candidate_contracts:nextCandidates,original_hint_window_end_ts:activity.window_end_ts,current_activity_not_proven:true,refresh_primary_metadata_before_future_acquisition:true,common_closed_minute_anchor_required:true,cold_metadata_calls:3,one_native_candle_call_per_candidate:true,planned_cold_HTTP:3+nextCandidates.length,existing_source_daily_cap:16,actual_native_admission_before_calls:true,skip_when_exhausted:true,prior_hint_must_not_establish_current_zero_activity:true};
if(nextPlan.planned_cold_HTTP>16)throw Error('EXISTING_ROLE_ENVELOPE_EXCEEDED');
const out={next_qualification_plan:nextPlan,schema:'N05_CURRENT104_EXACT_ROUTE_RECONCILIATION_V1',status:'CURRENT104_SCOPE_REPLAYED_AGAINST_RETAINED_PRIMARY_IDENTITIES_AND_MARKETS',manifest:manifestPath,manifest_sha256:hash(manifestBytes),source_inputs:specs.map(([path,body_sha256,gzip_sha256,original_received_ts])=>({path,body_sha256,gzip_sha256,original_received_ts})),identity_runtime_sha256:hash(identitySource),native_rules_sha256:hash(sectorSource),counts,new_assets:rows.filter(r=>['CT','RLC'].includes(r.symbol)),rows,sourceHTTP:0,D1:0,Telegram:0,runtime_changed:false,new_full_flow_assets:0,retained_individual_full_flow_assets:22,simultaneous_continuous_flow_coverage:false,metadata_is_not_fresh_directional_flow:true,source_clocks_refreshed:false,score_contribution:0,calibration_open:true,project_complete:false};
await fs.mkdir('audit-output/n05-104-routes',{recursive:true});await fs.writeFile('audit-output/n05-104-routes/exact-routes.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({counts,new_assets:out.new_assets,sourceHTTP:0,D1:0,new_full_flow_assets:0}));
