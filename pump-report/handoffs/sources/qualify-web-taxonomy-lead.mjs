import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const authority=await read('pump-report/handoffs/sources/BINGX_WEB_TAXONOMY_LEAD_AUTHORITY_V1.json');
assert(Date.now()<authority.expires_ts);assert.equal(authority.new_primary_searches,3);assert.equal(authority.search_queries.length,3);
globalThis.fetch=()=>{throw Error('TAXONOMY_DOCS_FINISHED_NO_NEW_SEARCH_OR_API');};
const evidence=[
 {url:'https://bingx.com/en/price/bitcoin',private_path:'/private/tmp/bingx-taxonomy-static-bitcoin.html',sha256:'4272af99b7960034134581ae888967338326cce201b535992c5ce02f3bdffbf9',kind:'STATIC_HTML_NO_JS'},
 {url:'https://bin.bb-os.com/growth_nuxt/BoYN12Hi.js',private_path:'/private/tmp/bingx-taxonomy-static-entry.js',sha256:'1ed128c48240b4c7bdc5722a928ae49923dbdaefc1e2f66e1264cb71a75a7fab',kind:'STATIC_ENTRY_JS_TEXT_ONLY'},
 {url:'https://bin.bb-os.com/growth_nuxt/BQTkqlrM.js',private_path:'/private/tmp/bingx-taxonomy-static-price-detail.js',sha256:'e5e78ee5ac60857df4861c07307827770ebe1a8868d6356b5e629a42918339d8',kind:'STATIC_PRICE_DETAIL_JS_TEXT_ONLY'},
 {url:'https://bin.bb-os.com/growth_nuxt/C0NlfNwr.js',private_path:'/private/tmp/bingx-taxonomy-static-price-list.js',sha256:'e7180684d0be195e5fe5f18cf9523e5c8eb2cb7cc54511fc84e869717e080cbc',kind:'STATIC_PRICE_LIST_JS_TEXT_ONLY'},
 {url:'https://bin.bb-os.com/growth_nuxt/f22v5Ol3.js',private_path:'/private/tmp/bingx-taxonomy-static-api-core.js',sha256:'0637057d5eaaf7c03ed912f0984aded646b0659bc39ff106b9a7ca70df259e89',kind:'STATIC_DEPENDENCY_JS_TEXT_ONLY'},
 {url:'https://bin.bb-os.com/growth_nuxt/rXWW4EMs.js',private_path:'/private/tmp/bingx-taxonomy-static-services.js',sha256:'8eca3b723263437f2486bd641bf03c458138ad59daa7d810f3ca190866af06a7',kind:'STATIC_DEPENDENCY_JS_TEXT_ONLY'},
 {url:'https://bin.bb-os.com/growth_nuxt/DvwKs6Lp.js',private_path:'/private/tmp/bingx-taxonomy-static-service-config.js',sha256:'bf4f7a6f9d49f4a77c4d7c48f030d43c1539fd94cf3b71de20c8c2b1e144d5e9',kind:'STATIC_DEPENDENCY_JS_TEXT_ONLY'}
];
const texts=new Map();
for(const e of evidence){const b=await fs.readFile(e.private_path);assert.equal(sha(b),e.sha256);e.bytes=b.length;e.confirmed_HTTP_status=200;e.executed=false;texts.set(e.private_path,b.toString('utf8'));}
const html=texts.get(evidence[0].private_path),entry=texts.get(evidence[1].private_path),detail=texts.get(evidence[2].private_path),core=texts.get(evidence[4].private_path);
assert(html.includes(evidence[1].url));
assert(entry.includes('./BQTkqlrM.js')&&entry.includes('./C0NlfNwr.js'));
assert(detail.includes('./f22v5Ol3.js'));assert(core.includes('./rXWW4EMs.js')&&core.includes('./DvwKs6Lp.js'));
assert(core.includes('a.common.requestCoinInfoList().then(s)'));
assert(core.includes('coinId:d.id||""'));assert(core.includes('coinType:d.coinType||0'));
assert(core.includes('coinName:d.coinName||""'));assert(core.includes('coinDisplayName:d.coinDisplayName||""'));
assert(detail.includes('hasContract')&&detail.includes('getCryptoPriceSlugDetail'));
for(const s of texts.values())assert(!s.includes('contractId'),'no native contractId field found in this finite read');
const jsonTags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const ld=jsonTags.filter(m=>m[1].includes('application/ld+json')).map(m=>JSON.parse(m[2]));
const product=ld.flatMap(j=>j['@graph']??[]).find(j=>j['@type']==='Product');assert(product);
const nuxtTag=jsonTags.find(m=>m[1].includes('__NUXT_DATA__'));assert(nuxtTag);const nuxt=JSON.parse(nuxtTag[2]);
const spotNodes=nuxt.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.hasOwn(x,'coinId'));
assert.equal(spotNodes.length,5);assert(spotNodes.every(n=>Object.hasOwn(n,'coinName')&&Object.hasOwn(n,'slug')&&Object.hasOwn(n,'bizType')));
assert(!html.includes('coinType')&&!html.includes('assetType'));
const registry=await read('pump-report/sources/registry-curated13-native-relative-v1.json'),census=await read('pump-report/sources/current-native-catalog-classification-v1.json');
assert.equal(registry.instruments.length,13);assert(registry.instruments.every(e=>e.liquidations.routes.length===0));
assert.equal(census.coverage.active_USDT_at_capture,934);assert.equal(census.coverage.unknown_active_USDT,919);
const preserved=[];
for(const [path,h] of [['pump-report/sources/index.mjs','d95e5b120f927e1dd89c7a3061764efcde631b6343e7c98e40f296806a269e9f'],['pump-report/sources/day-growth.mjs','6e397080a7fd99fb466b286d916e7df97ce17eedea244ac9cdf3230d3f0c8b93'],['pump-report/sources/registry-curated13-native-relative-v1.json','76f6a6cca7328b9e41a1141fe0fc93957af722be4095515cf76d632fae2dc516'],['pump-report/sources/current-native-catalog-classification-v1.json','e721e4f32fcb01fe9ecc736ba0780b5a07ba1a11e86024b0cfe0d43154612a13']]){assert.equal(sha(await fs.readFile(new URL(path,root))),h);preserved.push({path,sha256:h,unchanged:true});}
const result={schema:'PUMP_BINGX_OFFICIAL_WEB_TAXONOMY_FINITE_LEAD_V1',status:'FINITE_REVIEW_COMPLETE_NO_QUALIFIED_BULK_CRYPTO_TYPE_BINDING',checked_at:new Date().toISOString(),authority,
  elapsed_ms:Date.now()-authority.acquired_ts,maximum_duration_ms:900000,searches_used:3,searches_allowed:3,search_closed:true,
  observations:{official_price_page_named_asset:true,JSON_LD_asset_type:product['@type'],JSON_LD_asset_type_is_positive_crypto_enum:false,
    SSR_spot_metadata_rows:spotNodes.length,SSR_identity_fields:['coinId','coinName','slug','quotationId','bizType','futuresType'],
    SSR_coinType_or_assetType_present:false,SSR_native_contractId_present:false,
    static_bulk_method:'common.requestCoinInfoList()',static_result_shape:'result[]',static_raw_fields:['id','coinName','coinDisplayName','coinIconUrl','coinType'],
    client_projection:{coinId:'raw.id or empty string',coinType:'raw.coinType or numeric0'},
    raw_coinType_enum_semantics:'UNKNOWN',raw_coinType_is_explicit_crypto_positive:'NOT_PROVEN',zero_value_is_crypto_evidence:false,
    exact_method_HTTP_host_path:'NOT_RESOLVED_IN_READ_STATIC_FILES',native_contractId_to_coinId_binding:'NOT_PROVEN',
    other_frontend_fields:['hasSpot','hasContract','unifiedName','name','valuationCoinName'],other_frontend_fields_are_crypto_type_evidence:false,
    actual_metadata_endpoint_called:false,web_runtime_or_UI_executed:false,
    note:'coinId/slug/name and hasContract are a new concrete schema lead, not a safe full-universe classification. Market/ranking fields and CoinGecko labels do not bind this web id to native contractId.'},
  evidence,source_market_prices_or_raw_HTML_JS_exported_to_Git:false,
  result_for_universe:{previous_known_crypto:13,owner_excluded_gold_backed:2,unknown_active_USDT:919,current_complete_qualified_crypto_N:null,new_unknown_promotions:0},
  exact_ROOT_one_GET_plan_issued:false,
  why_no_executable_GET_plan:'The static consumer reveals a bulk method and candidate type field, but not its exact route, positive enum semantics or native identity bridge. Do not invent endpoint/enum or dispatch a speculative API.',
  minimum_missing_input:['Exact official implementation/spec of common.requestCoinInfoList host/path and auth/access/rate facts','Official coinType enum with explicit positive crypto meanings; absent/default0 must remain unknown','Authoritative native contractId/native asset to that canonical coinId/underlying binding, including ambiguous names and excluded asset classes'],
  finite_owner_decision_options:[
    {option:'LIMITED_CURATED_SCOPE',immediately_executable:'Keep existing13 registry and mark global coverage incomplete/unknown; no promise all crypto N. Owner explicitly accepts partial coverage for launch; no unknown is relabeled.'},
    {option:'OFFICIAL_MAPPING_EXPORT',required:'Owner supplies an official BingX metadata export/spec with native contractId/asset,canonical id and positive underlying type enum. ROOT can then design one exact admitted metadata GET if a public route is documented; SOURCE sends no support messages.'},
    {option:'NAMED_FINITE_CURATED_BATCH',immediately_executable:'Owner/ROOT selects a finite priority list of unknown native tuples, then qualify each with named BingX asset information plus independent primary identity evidence. No generic ticker join or unlimited scrape; global N remains unknown until all required bindings exist.'}
  ],
  boundaries:{new_primary_searches:3,successful_static_document_GETs:7,static_document_bytes:evidence.reduce((n,e)=>n+e.bytes,0),initial_sandbox_DNS_failure_before_escalated_static_read:true,
    static_JS_executed:0,UI_browser_pages_opened:0,marketHTTP:0,WS:0,SQL:0,TG:0,deploy:0,source_or_registry_changes:0,docs_cost_weights:null,
    existing_API_docs_NCSK_CCXT_audits_repeated:false,Firecrawl_credit_refusals_retried:false,private_DAY_fact_read_in_this_scope:false},
  affected_integrity_check:'PASS hashes/literal membership/HTML-to-CDN-to-route provenance and unchanged13/919 code verified; no runtime/source tests replayed',preserved,
  nine_pauses_preserved:true,two_OWNER_deferrals_preserved:true,caps_reserves_unknowns_preserved:true};
assert(result.elapsed_ms<result.maximum_duration_ms);assert(Date.now()<authority.expires_ts);
await fs.writeFile(new URL('pump-report/handoffs/sources/BINGX_WEB_TAXONOMY_LEAD_RESULT_V1.json',root),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({status:result.status,integrity:'PASS',searches:3,static_document_GETs:7,elapsed_ms:result.elapsed_ms,bulk_method_found:true,positive_type_enum_proven:false,native_binding_proven:false,unknown_promoted:0,marketHTTP:0})+'\n');
