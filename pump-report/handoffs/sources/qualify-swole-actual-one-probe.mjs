import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifiedSwoleRoute, normalizeSwoleMap} from '../../sources/liquidations.mjs';
import {createPumpSources} from '../../sources/index.mjs';
import {START_PROFILE} from '../../profile/start-v1.mjs';
const root=new URL('../../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const authority=await read('pump-report/handoffs/sources/SWOLE_ACTUAL_ONE_PROBE_AUTHORITY_V1.json');
assert(Date.now()<authority.own_lease_expiry);
globalThis.fetch=()=>{throw Error('SINGLE_SWOLE_SPENT_NO_NETWORK_OR_REPEAT');};
const file=await fs.readFile(authority.private_input);assert.equal(sha(file),authority.expected_private_file_sha256);
const wrapper=JSON.parse(file),response=wrapper.body?.response,payload=response?.data,now=Date.now();
assert.equal(wrapper.http_status,200);assert.equal(response.ok,true);assert.equal(response.status,200);
assert(payload&&typeof payload==='object'&&!Array.isArray(payload));
assert.equal(payload.coin,'BTC');assert.equal(payload.estimated,true);assert.equal(payload.has_data,true);
assert.equal(payload.model_version,'est-1.0+hl-2026-09-27');
assert.equal(payload.range,'24h');assert.equal(payload.view,'all');
const oldPlan=await read('pump-report/handoffs/sources/SWOLE_BTC_ROUTE_PLAN_V1.json');
assert.equal(payload.model_version,oldPlan.primary_model.methodology_version_observed);
const registry=await read('pump-report/sources/registry-curated13-native-relative-v1.json');
const btc=registry.instruments.find(e=>e.instrument.base==='BTC');assert.equal(btc.native_contract_id,'100');
assert.deepEqual(btc.liquidations.routes,[]);
const inactive=await read('pump-report/sources/swole-btc-route-inactive-v1.json');
assert.equal(verifiedSwoleRoute(inactive,btc.instrument),false);
assert.throws(()=>normalizeSwoleMap(payload,{route:inactive,instrument:btc.instrument,received_ts:response.received_ts,now,profile:START_PROFILE,receipt_id:response.receipt_id}),
  e=>e.code==='LIQUIDATION_ASSET_MAPPING_UNQUALIFIED');
let brokerCalls=0;
const source=createPumpSources({identityRegistry:[btc],clock:()=>now,broker:{async request(){brokerCalls++;return response;}}});
// The synthetic reference is solely an offline guard check, never an order
// basis. The real payload is not admitted through a fabricated verified route.
const map=await source.getLiquidations({instrument:btc.instrument,reference_price:1});
assert.equal(map.status,'NOT_CHECKED');assert.equal(map.reason,'NO_VERIFIED_LIQUIDATION_ROUTE');assert.equal(brokerCalls,0);
const type=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,type(v)]));
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const sides={};let boundaryValid=0,sideValid=0,relativeFieldNumeric=0,cumulative=0,ranked=0;
for(const side of ['long','short']){
  const rows=payload.levels?.[side];assert(Array.isArray(rows));assert(rows.length<=1000);
  sides[side]={count:rows.length,item_field_types:rows.length?fields(rows[0]):null};
  for(const r of rows){
    assert([r.lo,r.mid,r.hi].every(positive)&&r.lo<=r.mid&&r.mid<=r.hi);boundaryValid++;
    assert(positive(payload.price)&&(side==='long'?r.hi<payload.price:r.lo>payload.price));sideValid++;
    assert(typeof r.usd==='number'&&Number.isFinite(r.usd)&&r.usd>=0);relativeFieldNumeric++;
    if(Object.hasOwn(r,'cum'))cumulative++;if(Object.hasOwn(r,'rank'))ranked++;
  }
}
assert.equal(boundaryValid,4);assert.equal(sideValid,4);assert.equal(relativeFieldNumeric,4);
assert(Number.isSafeInteger(payload.as_of)&&payload.as_of>1e12);
assert(Number.isSafeInteger(response.received_ts)&&payload.as_of<=response.received_ts&&response.received_ts<=now);
const ageAtReceive=response.received_ts-payload.as_of,ageAtCheck=now-payload.as_of;
assert.equal(ageAtReceive,283191);assert(ageAtCheck>START_PROFILE.freshness_ms.model_map);
const absentIdentityFields=['name','asset_name','canonical_id','asset_id','address','chain'];
const absentPriceFields=['venue','exchange','market_id','quote','currency','price_currency','source','primary_provider'];
for(const key of [...absentIdentityFields,...absentPriceFields,'scale_id','magnitude_unit'])assert(!Object.hasOwn(payload,key));
assert.equal(inactive.price_mapping,null);assert.equal(inactive.magnitude.field,null);
const preserved=[];
for(const [path,expected] of [['pump-report/sources/index.mjs','d95e5b120f927e1dd89c7a3061764efcde631b6343e7c98e40f296806a269e9f'],
  ['pump-report/sources/day-growth.mjs','4607c160d13ca364a8c650f19fb3a45bfb8034863158ebdad5e01ec067d401af'],
  ['pump-report/sources/liquidations.mjs','7fd1e6cca4eb6037ecbe5d6e9296c681aaa19dfb6248ef38da8bf0e5c2de744e'],
  ['pump-report/sources/registry-curated13-native-relative-v1.json','76f6a6cca7328b9e41a1141fe0fc93957af722be4095515cf76d632fae2dc516'],
  ['pump-report/sources/swole-btc-route-inactive-v1.json','8da5f377d72a847c43a61a72ce93a2bf3cc2fcbc7d295efff1f7f70a0ee42fa4']]){
  assert.equal(sha(await fs.readFile(new URL(path,root))),expected,path);preserved.push({path,sha256:expected,unchanged:true});
}
assert.equal(83+140+10+9,242);assert.equal(475+107+15+16,613);assert.equal(60+83+8+6,157);
const result={schema:'PUMP_SWOLE_SINGLE_ACTUAL_NATIVE_RECEIPT_OFFLINE_QUALIFICATION_V1',
  status:'NATIVE_REPLY_SHAPE_OBSERVED_MAP_UNQUALIFIED_AND_NOW_STALE',checked_at:new Date(now).toISOString(),authority,
  offline_qualification:'PASS_EXPECTED_GUARDS_NO_ROUTE_PROMOTION',
  input:{private_file_sha256:sha(file),private_file_bytes:file.length,
    provider_parsed_payload_canonical_JSON_sha256:sha(JSON.stringify(payload)),
    control_reply_declared_hash:wrapper.raw_sha256??null,
    hash_scope:'File wrapper and parsed canonical JSON hashes; neither is claimed to be original provider HTTP body bytes',
    provider_original_HTTP_bytes:null,raw_or_normalized_price_levels_amount_values_exported:false},
  observed_reply:{HTTP_status:response.status,receipt_id:response.receipt_id,received_ts:response.received_ts,cache_hit:response.cache_hit===true,
    coin_label:'BTC',canonical_asset_binding_qualified:false,estimated:true,has_data:true,model_version:payload.model_version,
    model_version_matches_retained_methodology_observation:true,range:payload.range,view:payload.view},
  exact_schema:{payload_field_types:fields(payload),level_sides:sides,max_pain_field_types:fields(payload.max_pain),
    totals_count:payload.totals.length,totals_item_field_types:fields(payload.totals[0]),links_field_types:fields(payload.links),
    modeled_bins_count:boundaryValid,ordered_positive_bounds_count:boundaryValid,correct_side_vs_model_price_count:sideValid,
    finite_nonnegative_native_usd_count:relativeFieldNumeric,native_cumulative_field_count:cumulative,rank_field_count:ranked,
    structural_fields_compatible_with_existing_parser:true,full_normalized_map_produced:false},
  clock:{native_as_of:payload.as_of,native_type:'number',safe_integer:true,numeric_scale_compatible_with_epoch_ms:true,
    existing_parser_interpretation:'UNIX_EPOCH_MILLISECONDS',independent_vendor_unit_evidence_ref:null,
    unit_not_proven_from_magnitude_alone:true,age_at_receive_ms_under_parser_interpretation:ageAtReceive,
    freshness_limit_ms:START_PROFILE.freshness_ms.model_map,within_limit_at_original_receive_under_parser_interpretation:true,
    remaining_model_lifetime_at_receive_ms:START_PROFILE.freshness_ms.model_map-ageAtReceive,
    age_at_check_ms_under_parser_interpretation:ageAtCheck,current_status_under_parser_interpretation:'STALE',
    cache_or_download_does_not_refresh_as_of:true,HTTP_Date_not_used_as_source_clock:true},
  identity:{BingX_target_instrument_id:btc.instrument.instrument_id,BingX_asset_id:btc.instrument.asset_id,
    BingX_binding:'EXISTING_CURATED_NATIVE100_BTC',Swole_binding:'BARE_COIN_LABEL_AND_SELECTOR_ONLY',
    native_canonical_identity_fields_absent:absentIdentityFields,qualified_cross_provider_identity:false},
  model_and_amount:{basis_type:'EXTERNAL_MODEL',observed_BingX_open_positions:false,
    native_magnitude_field:'usd',native_scale_id:null,native_magnitude_unit:null,
    permitted_interpretation:'RELATIVE_INTENSITY_ONLY_FROM_DOCUMENTED_MODEL;NOT_ACTUAL_USD_NOTIONAL',
    active_magnitude_qualification_applied:false,absolute_BASE_or_USDT_or_USD_amount:null,
    provenance:'Retained methodology: price/OI/volume model calibrated with Hyperliquid liquidation-distance distribution; version suffix is not evidence that these bins are observed Hyperliquid or BingX positions',
    aggregation:'cum/max_pain/totals and model bins share one provider/model; do not add nested/cumulative aggregates as independent position notional'},
  price_and_coverage:{native_price_currency:null,native_venue:null,native_market_id:null,
    native_price_basis_fields_absent:absentPriceFields,qualified_current_BingX_price_mapping:null,
    current_mapping_max_age_ms:START_PROFILE.freshness_ms.price,multiplier_to_BingX:null,
    bingx_order_eligible:false,reason:'NO_CANONICAL_IDENTITY_NO_PRICE_CURRENCY_VENUE_OR_CURRENT_MAPPING;MODEL_ALREADY_STALE',
    source_market_coverage_complete:false,whole_market_map_claimed:false,only_four_returned_modeled_bins_observed:true,
    positive_has_data_does_not_establish_complete_market_coverage:true},
  route_guards:{inactive_template_verified:false,actual_registry_routes_empty:true,
    normalizeSwoleMap_actual_payload_with_inactive_template:'LIQUIDATION_ASSET_MAPPING_UNQUALIFIED',
    getLiquidations:'NOT_CHECKED:NO_VERIFIED_LIQUIDATION_ROUTE',broker_calls:brokerCalls,placeholder_proofs_or_fake_mapping_used:false},
  source_file_changes:[],preserved,
  costs:{single_ROOT_provider_HTTP_attempt:1,single_attempt_state:'SPENT_NO_REPEAT',SOURCE_market_HTTP:0,SOURCE_SQL:0,SOURCE_TG:0,SOURCE_deploy:0,
    ROOT_MAP_CHECK_SQL:{requests:10,rows_read:15,rows_written:8,unknown_ops:0},
    ROOT_reported_cumulative_SQL_snapshot:{requests:242,rows_read:613,rows_written:157,unknown_ops:0},
    cumulative_components:'old83/475/60 + manual140/107/83 + map10/15/8 + summary9/16/6',
    SQL_unknown0_does_not_clear_initial_two_provider_UNKNOWN:true,actual_provider_weight:null,
    request_bytes_latency_and_capacity_not_proven_by_this_offline_check:true},
  nonblocking:true,main_manual_ROOT_reported:'SENT240_WITHOUT_MAP',day_growth_J_native_proven:false,
  no_new_search_or_market_requests:true,old_A33_or_audits_reexecuted:0,nine_pauses_preserved:true,two_OWNER_deferrals_preserved:true};
assert(Date.now()<authority.own_lease_expiry);
await fs.writeFile(new URL('pump-report/handoffs/sources/SWOLE_ACTUAL_ONE_PROBE_QUALIFICATION_V1.json',root),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({offline_qualification:'PASS',actual_HTTP:200,modeled_bins:boundaryValid,
  model_version:payload.model_version,age_at_receive_ms:ageAtReceive,current_model_stale:true,
  canonical_identity_qualified:false,current_price_mapping:null,bingx_order_eligible:false,SOURCE_market_HTTP:0,broker_calls:brokerCalls,private_market_values_exported:false})+'\n');
