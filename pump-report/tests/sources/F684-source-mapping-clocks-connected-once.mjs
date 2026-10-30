import assert from 'node:assert/strict';
globalThis.fetch=async()=>{throw Error('F684_PROVIDER_IO_FORBIDDEN');};
const {normalizeSwoleMap}=await import('../../sources/liquidations.mjs');
const {normalizeHyperliquidAccount}=await import('../../sources/hyperliquid-observed-positions.mjs');
const {createPumpSources,SOURCE_HTTP_PLAN}=await import('../../sources/index.mjs');
const {selectZones}=await import('../../analytics/zones.mjs');
const {START_PROFILE}=await import('../../profile/start-v1.mjs');
const FIXTURES={"swole":{"route":{"provider":"SWOLECHARTS","symbol":"TESTCOIN","asset_id":"SYNTHETIC_ASSET:TESTCOIN","identity_evidence_ref":"F683_CONTROLLED_IDENTITY","model_evidence_ref":"F683_CONTROLLED_MODEL","venue":"AGGREGATED_CEX","market_id":"SWOLE:TESTCOIN","price_quote":"USD","magnitude":{"kind":"RELATIVE","field":"intensity","scale_id":"F683_SYNTHETIC_SCALE","evidence_ref":"F683_CONTROLLED_SCALE"},"price_mapping":{"from_quote":"USD","to_quote":"USDT","from_market_id":"SWOLE:TESTCOIN","to_instrument_id":"BINGX:USDT_M:FIXTURE:TESTCOIN-USDT","multiplier_to_bingx":2,"event_ts":1799999998000,"expires_ts":1800000010000,"evidence_ref":"F683_CONTROLLED_MAPPING"}},"payload":{"coin":"TESTCOIN","estimated":true,"has_data":true,"model_version":"F683_SYNTHETIC_MODEL","as_of":1799999999000,"price":100,"levels":{"long":[{"lo":80,"mid":85,"hi":90,"intensity":25}],"short":[{"lo":110,"mid":115,"hi":120,"intensity":40}]}},"options":{"instrument":{"instrument_id":"BINGX:USDT_M:FIXTURE:TESTCOIN-USDT","asset_id":"SYNTHETIC_ASSET:TESTCOIN","venue":"BINGX","native_symbol":"TESTCOIN-USDT","base":"TESTCOIN","market_type":"PERPETUAL","quote":"USDT","settle":"USDT","classification_status":"VERIFIED_CRYPTO","identity_evidence_ref":"F683_CONTROLLED_NOT_NATIVE","canonical_cross_venue_identity_qualified":true},"received_ts":1799999999900,"now":1800000000000,"profile":{"freshness_ms":{"model_map":300000,"observed_positions":120000,"price":30000},"liquidation_merge_max_width_normal_range":2,"liquidation_merge_gap_normal_range":1,"maximum_liquidation_zones_per_side":3},"receipt_id":"F683_CONTROLLED_RECEIPT","reference_price":200}},"hyperliquid":{"route":{"provider":"HYPERLIQUID","asset_id":"SYNTHETIC_ASSET:TESTCOIN","coin":"TESTCOIN","market_id":"HL:TESTCOIN","price_quote":"USDC","price_quote_evidence_ref":"F683_CONTROLLED_QUOTE","identity_binding":{"status":"VERIFIED_SAME_UNDERLYING","evidence_ref":"F683_CONTROLLED_UNDERLYING","bingx_instrument_id":"BINGX:USDT_M:FIXTURE:TESTCOIN-USDT","bingx_asset_id":"SYNTHETIC_ASSET:TESTCOIN","bingx_identity_evidence_ref":"F683_CONTROLLED_NOT_NATIVE","hyperliquid_coin":"TESTCOIN","hyperliquid_market_id":"HL:TESTCOIN"},"position_semantics":{"evidence_ref":"F683_CONTROLLED_SEMANTICS","signed_size_field":"szi","positive_side":"LONG","negative_side":"SHORT","liquidation_price_field":"liquidationPx","liquidation_price_kind":"CURRENT_ACCOUNT_ESTIMATE"},"position_value":{"field":"positionValue","quote":"USDC","evidence_ref":"F683_CONTROLLED_VALUE_UNIT"},"price_mapping":{"kind":"EXPLICIT_PRICE_BASIS_AND_QUOTE_CONVERSION","evidence_ref":"F683_CONTROLLED_MAPPING","quote_conversion_evidence_ref":"F683_CONTROLLED_QUOTE_CONVERSION","price_basis_evidence_ref":"F683_CONTROLLED_PRICE_BASIS","from_quote":"USDC","to_quote":"USDT","from_market_id":"HL:TESTCOIN","to_instrument_id":"BINGX:USDT_M:FIXTURE:TESTCOIN-USDT","from_price_basis":"HYPERLIQUID_LIQUIDATION_PX","to_price_basis":"BINGX_NATIVE_PRICE","multiplier_to_bingx":1.01,"event_ts":1799999998000,"expires_ts":1800000010000}},"payload":{"assetPositions":[{"type":"oneWay","position":{"coin":"TESTCOIN","szi":"5","liquidationPx":"90","positionValue":"70000"}}],"time":1799999999500},"options":{"instrument":{"instrument_id":"BINGX:USDT_M:FIXTURE:TESTCOIN-USDT","asset_id":"SYNTHETIC_ASSET:TESTCOIN","venue":"BINGX","native_symbol":"TESTCOIN-USDT","base":"TESTCOIN","market_type":"PERPETUAL","quote":"USDT","settle":"USDT","classification_status":"VERIFIED_CRYPTO","identity_evidence_ref":"F683_CONTROLLED_NOT_NATIVE","canonical_cross_venue_identity_qualified":true},"account_ref":"F683_SYNTHETIC_ACCOUNT","received_ts":1799999999900,"now":1800000000000,"profile":{"freshness_ms":{"model_map":300000,"observed_positions":120000,"price":30000},"liquidation_merge_max_width_normal_range":2,"liquidation_merge_gap_normal_range":1,"maximum_liquidation_zones_per_side":3},"receipt_id":"F683_CONTROLLED_RECEIPT","reference_price":100}}};
const T=1800000000000,p=START_PROFILE,copy=structuredClone;
const sw=()=>copy(FIXTURES.swole), hl=()=>copy(FIXTURES.hyperliquid);
const normS=f=>normalizeSwoleMap(f.payload,{...f.options,profile:p,route:f.route});
const normH=f=>normalizeHyperliquidAccount(f.payload,{...f.options,profile:p,route:f.route});
const allZones=q=>[...q.zones_up,...q.zones_down];
const components=q=>allZones(q).flatMap(z=>z.components);
const sweeps=[];
{
 const f=sw(),r=normS(f);assert.equal(r.status,'USABLE');assert.equal(r.zones.length,2);
 for(const z of r.zones){assert.equal(z.event_ts,T-1000);assert.equal(z.received_ts,T-100);assert.equal(z.native_expires_ts,T+299000);assert.equal(z.expires_ts,T+10000);assert.equal(z.price_comparability.event_ts,T-2000);assert.equal(z.price_comparability.expires_ts,T+10000);assert.equal(z.magnitude_unit,'RELATIVE_INTENSITY');}
 const q=selectZones(r,f.options.instrument,200,10,T,p);assert.equal(components(q).length,2);
 for(const c of components(q)){assert.equal(c.event_ts,T-1000);assert.equal(c.received_ts,T-100);assert.equal(c.expires_ts,T+10000);assert.equal(c.price_comparability.event_ts,T-2000);assert.equal(c.price_comparability.expires_ts,T+10000);}
 assert.equal(allZones(selectZones(r,f.options.instrument,200,10,T+10000,p)).length,2);
 assert.equal(allZones(selectZones(r,f.options.instrument,200,10,T+10001,p)).length,0);
 const numeric=sw();numeric.route.price_mapping.event_ts=String(T-2000);numeric.route.price_mapping.expires_ts=String(T+100000);
 const n=normS(numeric).zones[0];assert.equal(n.price_comparability.event_ts,T-2000);assert.equal(n.price_comparability.expires_ts,T+100000);assert.equal(n.expires_ts,T+28000);
 const nativeFirst=sw();nativeFirst.payload.as_of=T-299000;assert.equal(normS(nativeFirst).zones[0].expires_ts,T+1000);
 sweeps.push('Swole source/mapping clocks survive selected lineage; numeric strings and min expiry; delayed selection rejects expired mapping');
}
for(const change of [f=>{f.route.price_mapping.event_ts=T-30001;},f=>{f.route.price_mapping.expires_ts=T-1;},f=>{f.route.price_mapping.event_ts=T+1;},f=>{delete f.route.price_mapping.event_ts;},f=>{delete f.route.price_mapping.evidence_ref;}]){
 const f=sw();change(f);const r=normS(f);
 for(const z of r.zones){assert.equal(z.usable,false);assert.equal(z.price_comparability.status,'UNKNOWN');assert.equal(z.price_comparability.event_ts,null);assert.equal(z.price_comparability.expires_ts,null);}
 assert.equal(components(selectZones(r,f.options.instrument,200,10,T,p)).length,0);
}
{
 const old=sw();old.payload.as_of=T-300001;assert.equal(normS(old).status,'STALE');assert.equal(normS(old).zones.length,0);
 const missing=sw();delete missing.payload.as_of;assert.throws(()=>normS(missing),{code:'LIQUIDATION_SOURCE_CLOCK_MISSING'});
 const future=sw();future.payload.as_of=T+1;assert.throws(()=>normS(future),{code:'LIQUIDATION_SOURCE_CLOCK_FUTURE'});
 sweeps.push('Expired/future/unknown mapping never promoted; fresh receipt cannot rejuvenate source');
}
{
 const f=hl(),r=normH(f),z=r.zones[0];assert.equal(r.status,'PARTIAL');assert.equal(z.basis_type,'OBSERVED_POSITION');
 assert.equal(z.event_ts,T-500);assert.equal(z.received_ts,T-100);assert.equal(z.native_expires_ts,T+119500);assert.equal(z.expires_ts,T+10000);
 assert.equal(z.price_comparability.event_ts,T-2000);assert.equal(z.price_comparability.expires_ts,T+10000);assert.equal(z.lower,90.9);assert.equal(z.magnitude_unit,'USDC');
 const q=selectZones(r,f.options.instrument,100,10,T,p);assert.equal(components(q).length,1);assert.equal(components(q)[0].price_comparability.event_ts,T-2000);
 assert.equal(components(selectZones(r,f.options.instrument,100,10,T+10001,p)).length,0);
 for(const change of [g=>{g.route.price_mapping.event_ts=T+1;},g=>{g.route.price_mapping.expires_ts=T-1;},g=>{delete g.route.price_mapping.event_ts;}]){
  const bad=hl();change(bad);const bz=normH(bad).zones[0];assert.equal(bz.usable,false);assert.equal(bz.price_comparability.event_ts,null);assert.equal(bz.price_comparability.expires_ts,null);
 }
 const old=hl();old.payload.time=T-120001;assert.equal(normH(old).status,'STALE');assert.equal(normH(old).zones[0].usable,false);
 sweeps.push('HL existing native/mapping clamp unchanged; nested clock lineage retained; units/subset remain; invalid mapping rejected');
}
let fixtureBrokerCalls=0;
{
 const f=sw();f.payload.levels.long=Array.from({length:1000},()=>({lo:80,mid:85,hi:90,intensity:25}));
 f.payload.levels.short=Array.from({length:1000},()=>({lo:110,mid:115,hi:120,intensity:40}));
 const sources=createPumpSources({identityRegistry:[{instrument:f.options.instrument,native_contract_id:'F684_CONTROLLED_CONTRACT',qualifications:{},liquidations:{routes:[f.route]}}],
 clock:()=>T,profile:p,broker:{async request(req){fixtureBrokerCalls++;assert.equal(req.provider,'SWOLECHARTS');assert.equal(req.family,'LIQUIDATIONS');return {ok:true,status:200,data:f.payload,received_ts:T-100,receipt_id:'F684_CONTROLLED_NO_PROVIDER',cache_hit:false};}}});
 const map=await sources.getLiquidations({instrument:f.options.instrument,reference_price:10,deadline_ts:T+10000});
 assert.equal(fixtureBrokerCalls,1);assert.equal(map.zones.length,2000);
 const q=selectZones(map,f.options.instrument,10,100,T,p);
 assert.equal(q.zones_up.length,1);assert.equal(q.zones_down.length,0);assert.equal(q.zones_up[0].components.length,2000);
 let visited=0;for(const c of components(q)){visited++;assert.equal(c.expires_ts,T+10000);assert.equal(c.price_comparability.event_ts,T-2000);assert.equal(c.price_comparability.expires_ts,T+10000);}
 assert.equal(visited,2000);assert.equal(SOURCE_HTTP_PLAN.liquidation_hyperliquid_per_candidate_max,1);
 sweeps.push('Connected getLiquidations single routing response yields 2000 components in one selected zone; all2000 visited without truncation');
}
console.log(JSON.stringify({schema:'F684_AFFECTED_CASE_RESULT_V1',case:'SOURCE_MAPPING_CLOCKS_AND_COMPONENT_BOUND',status:'PASS',sweeps,Node_processes:1,fixture_broker_calls:fixtureBrokerCalls,actual_provider_HTTP:0,native_SQL:0,Cloudflare:0,Telegram:0,selected_components_visited:2000,canonical_route_activation:0}));
